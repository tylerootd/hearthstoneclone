import Phaser from 'phaser';
import { getCardTextureKey } from '../utils/cardSprite.js';
import { grantXp } from '../data/progression.js';
import { loadCollection, saveCollection, loadCustomCards, saveCustomCards } from '../data/storage.js';
import { rebuildPool } from '../data/cardPool.js';
import { ARTIFACT_DEFS } from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 88, CARD_H = 124;
const MIN_S = 68;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const BOARD_Y = { enemy: 190, player: 445 };
const HERO_Y = { enemy: 55, player: 565 };
const HAND_Y = 688;
const PLAY_LINE = 588;

export default class PvpBattleScene extends Phaser.Scene {
  constructor() { super('PvpBattle'); }

  create(data) {
    this.ws = data.ws;
    this.myId = data.myId;
    this.returnScene = data.returnTo || 'MmoMap';
    this.returnData = { playerX: data.playerX, playerY: data.playerY, ...(data.returnData || {}) };
    this.state = null;
    this.selecting = null;
    this.targetMode = false;
    this._dragCard = null;
    this._selOrigin = null;
    this.resultShown = false;

    this.add.image(W / 2, H / 2, 'battle_board').setDisplaySize(W, H).setDepth(0);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.32).setDepth(1);
    this.add.rectangle(W / 2, 330, 680, 2, 0x44403a, 0.4).setDepth(5);

    this.uiGroup = this.add.group();
    this.handCards = [];
    this.arrowGfx = this.add.graphics().setDepth(50);

    this.input.on('pointermove', (p) => this._onMove(p));
    this.input.on('pointerup', (p) => this._onUp(p));
    this.input.keyboard.on('keydown-ESC', () => this._cancel());

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pvp_state') {
          if (this.resultShown) return;
          this.state = msg;
          this.selecting = null;
          this.targetMode = false;
          this._dragCard = null;
          this.arrowGfx.clear();
          this.redraw();
        }
      } catch (e) { console.error('[PvP] parse error:', e); }
    };

    this._ui(this.add.text(W / 2, H / 2, 'Waiting for duel...', {
      ...FONT, fontSize: '12px', color: '#888'
    }).setOrigin(0.5).setDepth(10));

    if (this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: 'pvp_ready' }));
  }

  _ui(o) { this.uiGroup.add(o); return o; }
  _clearHand() { this.handCards.forEach(c => c.destroy()); this.handCards = []; }

  _cancel() {
    if (this._dragCard) {
      const d = this._dragCard;
      this.tweens.add({ targets: d.ct, x: d.ox, y: d.oy, angle: d.oa, scaleX: 1, scaleY: 1, duration: 100 });
      d.ct.setDepth(30 + d.idx);
      this._dragCard = null;
    }
    this.targetMode = false;
    this.selecting = null;
    this._selOrigin = null;
    this.arrowGfx.clear();
    this.redraw();
  }

  redraw() {
    this.uiGroup.clear(true, true);
    this._clearHand();
    const s = this.state;
    if (!s) return;

    this._heroPanel(W / 2, HERO_Y.enemy, s.opponent, 'OPPONENT', true);
    this._boardRow(s.opponent.board, BOARD_Y.enemy, false);
    this._boardRow(s.you.board, BOARD_Y.player, true);
    this._heroPanel(W / 2, HERO_Y.player, s.you, 'YOU', false);
    this._mana(s.you);
    this._hand();
    this._endBtn(s);
    this._log(s);
    this._enemyHandBacks(s.opponent.handCount);

    const turnMsg = s.yourTurn ? 'YOUR TURN' : "OPPONENT'S TURN";
    const turnCol = s.yourTurn ? '#44ff44' : '#ff8844';
    this._ui(this.add.text(W / 2, 328, this.targetMode ? 'SELECT A TARGET' : turnMsg, {
      ...FONT, fontSize: '10px', color: this.targetMode ? '#ffcc00' : turnCol
    }).setOrigin(0.5).setDepth(20));

    if (s.phase === 'over') this.showResult();
  }

  /* ═══════ HERO ═══════ */
  _heroPanel(x, y, side, label, isEnemy) {
    const pw = 210, ph = 54;
    const fill = isEnemy ? 0x3a0a0a : 0x0a0a3a;
    const stroke = isEnemy ? 0x882233 : 0x223388;
    const bg = this._ui(this.add.rectangle(x, y, pw, ph, fill, 0.85).setStrokeStyle(2, stroke).setDepth(10));

    this._ui(this.add.text(x, y - 15, label, {
      ...FONT, fontSize: '10px', color: isEnemy ? '#ff6666' : '#66aaff'
    }).setOrigin(0.5).setDepth(11));

    const pct = Math.max(0, side.hp / side.maxHp);
    const hpc = pct < 0.33 ? '#ff3333' : pct < 0.66 ? '#ffaa33' : '#44ff44';
    this._ui(this.add.text(x - 32, y + 8, `${side.hp}`, {
      ...FONT, fontSize: '16px', color: hpc
    }).setOrigin(0.5).setDepth(11));
    this._ui(this.add.text(x, y + 10, `/${side.maxHp}`, {
      ...FONT, fontSize: '7px', color: '#777'
    }).setOrigin(0, 0.5).setDepth(11));
    this._ui(this.add.text(x + 72, y + 8, `Deck ${side.deckCount}`, {
      ...FONT, fontSize: '7px', color: '#999'
    }).setOrigin(0.5).setDepth(11));

    const bw = pw - 16;
    this._ui(this.add.rectangle(x, y + 23, bw, 4, 0x222222).setDepth(11));
    if (pct > 0) {
      this._ui(this.add.rectangle(x - bw / 2 * (1 - pct), y + 23, bw * pct, 4,
        pct < 0.33 ? 0xff3333 : pct < 0.66 ? 0xffaa33 : 0x33bb55).setDepth(12));
    }

    if (isEnemy && this.targetMode) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this._onTarget({ type: 'hero' }));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0xff4444));
      bg.on('pointerout', () => bg.setStrokeStyle(2, stroke));
    }
  }

  /* ═══════ BOARD ═══════ */
  _boardRow(board, yBase, isPlayer) {
    const gap = MIN_S + 12;
    const sx = W / 2 - (board.length - 1) * gap / 2;
    board.forEach((m, i) => {
      const x = sx + i * gap, y = yBase;
      const texKey = m.sprite ? (() => {
        const k = 'sprite_' + m.sprite.replace('.png', '');
        return this.textures.exists(k) ? k : null;
      })() : null;
      const bc = isPlayer ? 0x337744 : 0x774433;

      const fr = this._ui(this.add.rectangle(x, y, MIN_S, MIN_S, 0x0d0d1a, 0.9).setStrokeStyle(2, bc).setDepth(10));
      if (texKey) this._ui(this.add.image(x, y - 2, texKey).setDisplaySize(MIN_S - 12, MIN_S - 16).setDepth(11));

      this._ui(this.add.text(x, y - MIN_S / 2 + 5, m.name.slice(0, 7), {
        ...FONT, fontSize: '5px', color: '#ddd', backgroundColor: '#00000099', padding: { x: 2, y: 1 }
      }).setOrigin(0.5).setDepth(12));

      const r = 11;
      this._ui(this.add.circle(x - MIN_S / 2 + 9, y + MIN_S / 2 - 9, r, 0xaa8800).setDepth(12));
      this._ui(this.add.text(x - MIN_S / 2 + 9, y + MIN_S / 2 - 9, `${m.atk}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));
      this._ui(this.add.circle(x + MIN_S / 2 - 9, y + MIN_S / 2 - 9, r, 0xbb2222).setDepth(12));
      this._ui(this.add.text(x + MIN_S / 2 - 9, y + MIN_S / 2 - 9, `${m.hp}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));

      if (!m.canAttack && isPlayer)
        this._ui(this.add.text(x, y + 2, 'zzz', { ...FONT, fontSize: '7px', color: '#555' }).setOrigin(0.5).setDepth(13));

      fr.setInteractive({ useHandCursor: true });
      const s = this.state;
      if (isPlayer && m.canAttack && !this.targetMode && s.phase === 'playing' && s.yourTurn) {
        fr.on('pointerdown', () => {
          this.selecting = { type: 'attack', uid: m.uid };
          this._selOrigin = { x, y };
          this.targetMode = true;
          this.redraw();
        });
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0x44ff44));
        fr.on('pointerout', () => fr.setStrokeStyle(2, bc));
      }
      if (this.targetMode && !isPlayer) {
        fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0xff4444));
        fr.on('pointerout', () => fr.setStrokeStyle(2, bc));
      }
      if (this.targetMode && isPlayer && this.selecting?.needsFriendly) {
        fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0x4499ff));
        fr.on('pointerout', () => fr.setStrokeStyle(2, bc));
      }
    });
  }

  /* ═══════ HAND ═══════ */
  _hand() {
    const hand = this.state.you.hand;
    const s = this.state;
    const n = hand.length;
    if (!n) return;
    const sp = Math.min(CARD_W + 6, 540 / n);
    const tw = (n - 1) * sp;
    const bx = W / 2 - tw / 2;
    const fan = Math.min(2.5, 12 / n);

    hand.forEach((card, i) => {
      const cx = bx + i * sp;
      const off = i - (n - 1) / 2;
      const ang = off * fan;
      const arc = Math.abs(off) * 3.5;
      const cy = HAND_Y + arc;
      const ok = card.cost <= s.you.mana && s.yourTurn && s.phase === 'playing';

      const ct = this.add.container(cx, cy).setDepth(30 + i).setAngle(ang);

      ct.add(this.add.rectangle(0, 0, CARD_W, CARD_H, 0x0c0c1e, 0.95)
        .setStrokeStyle(ok ? 2 : 1, ok ? 0x44aaff : 0x2a2a3a));

      const artKey = getCardTextureKey(this, card);
      if (artKey) ct.add(this.add.image(0, -16, artKey).setDisplaySize(CARD_W - 22, 50));

      if (this.textures.exists('card_frame'))
        ct.add(this.add.image(0, -2, 'card_frame').setDisplaySize(CARD_W, CARD_H));

      ct.add(this.add.circle(-CARD_W / 2 + 10, -CARD_H / 2 + 12, 10, 0x1a3399));
      ct.add(this.add.text(-CARD_W / 2 + 10, -CARD_H / 2 + 12, `${card.cost}`, {
        ...FONT, fontSize: '10px', color: '#fff'
      }).setOrigin(0.5));

      ct.add(this.add.rectangle(0, 24, CARD_W - 8, 14, 0x000000, 0.8));
      ct.add(this.add.text(0, 24, card.name.slice(0, 11), {
        ...FONT, fontSize: '5px', color: '#eee'
      }).setOrigin(0.5));

      if (card.type === 'minion') {
        ct.add(this.add.circle(-CARD_W / 2 + 11, CARD_H / 2 - 13, 9, 0xaa8800));
        ct.add(this.add.text(-CARD_W / 2 + 11, CARD_H / 2 - 13, `${card.atk}`, {
          ...FONT, fontSize: '9px', color: '#fff'
        }).setOrigin(0.5));
        ct.add(this.add.circle(CARD_W / 2 - 11, CARD_H / 2 - 13, 9, 0xbb2222));
        ct.add(this.add.text(CARD_W / 2 - 11, CARD_H / 2 - 13, `${card.hp}`, {
          ...FONT, fontSize: '9px', color: '#fff'
        }).setOrigin(0.5));
      } else {
        ct.add(this.add.text(0, CARD_H / 2 - 13, 'SPELL', {
          ...FONT, fontSize: '7px', color: '#bb77ee'
        }).setOrigin(0.5));
      }

      if (card.effect)
        ct.add(this.add.text(0, 38, card.effect.kind, {
          ...FONT, fontSize: '4px', color: '#88ccaa'
        }).setOrigin(0.5));

      ct.setSize(CARD_W, CARD_H);
      ct.setInteractive(
        new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H),
        Phaser.Geom.Rectangle.Contains
      );

      ct.on('pointerover', () => {
        if (this.targetMode || this._dragCard) return;
        ct.setDepth(100);
        this.tweens.killTweensOf(ct);
        this.tweens.add({
          targets: ct, y: cy - 30, scaleX: 1.2, scaleY: 1.2, angle: 0,
          duration: 100, ease: 'Back.easeOut'
        });
      });
      ct.on('pointerout', () => {
        if (this._dragCard?.ct === ct) return;
        ct.setDepth(30 + i);
        this.tweens.killTweensOf(ct);
        this.tweens.add({ targets: ct, y: cy, scaleX: 1, scaleY: 1, angle: ang, duration: 80 });
      });

      if (ok && !this.targetMode) {
        ct.on('pointerdown', () => {
          this._dragCard = { ct, idx: i, ox: cx, oy: cy, oa: ang, card };
          ct.setDepth(200);
        });
      }

      this.handCards.push(ct);
    });
  }

  _enemyHandBacks(count) {
    const sp = Math.min(28, 220 / Math.max(count, 1));
    const sx = W / 2 - (count - 1) * sp / 2;
    for (let i = 0; i < count; i++)
      this._ui(this.add.rectangle(sx + i * sp, 14, 22, 30, 0x2a1a0a, 0.85)
        .setStrokeStyle(1, 0x553322).setDepth(10));
  }

  _mana(p) {
    const bx = 916, by = 620, gap = 15;
    const n = p.maxMana, sx = bx - (n - 1) * gap / 2;
    this._ui(this.add.text(bx, by - 16, 'MANA', {
      ...FONT, fontSize: '6px', color: '#3366aa'
    }).setOrigin(0.5).setDepth(15));
    for (let i = 0; i < n; i++) {
      const filled = i < p.mana;
      this._ui(this.add.rectangle(sx + i * gap, by, 8, 8, filled ? 0x2266ff : 0x181830, filled ? 1 : 0.4)
        .setAngle(45).setStrokeStyle(1, filled ? 0x44aaff : 0x2a2a44).setDepth(15));
    }
    this._ui(this.add.text(bx, by + 14, `${p.mana}/${p.maxMana}`, {
      ...FONT, fontSize: '9px', color: '#5599ee'
    }).setOrigin(0.5).setDepth(15));
  }

  _endBtn(s) {
    if (s.phase !== 'playing' || !s.yourTurn || this.targetMode) return;
    const bx = 958, by = 330;
    const bg = this._ui(this.add.rectangle(bx, by, 78, 34, 0x775511, 0.9)
      .setStrokeStyle(2, 0xccaa44).setDepth(20));
    bg.setInteractive({ useHandCursor: true });
    this._ui(this.add.text(bx, by, 'END\nTURN', {
      ...FONT, fontSize: '7px', color: '#ffe066', align: 'center'
    }).setOrigin(0.5).setDepth(21));
    bg.on('pointerover', () => bg.setFillStyle(0x997722));
    bg.on('pointerout', () => bg.setFillStyle(0x775511, 0.9));
    bg.on('pointerdown', () => this._send({ type: 'pvp_end_turn' }));
  }

  _log(s) {
    (s.log || []).forEach((l, i) => {
      this._ui(this.add.text(10, 335 + i * 13, l, {
        ...FONT, fontSize: '5px', color: '#555'
      }).setDepth(15));
    });
  }

  /* ═══════ INPUT ═══════ */
  _onMove(ptr) {
    this.arrowGfx.clear();
    if (this._dragCard) {
      const d = this._dragCard;
      d.ct.x = ptr.x; d.ct.y = ptr.y; d.ct.setAngle(0);
      const bg = d.ct.list?.[0];
      if (bg?.setStrokeStyle) bg.setStrokeStyle(2, ptr.y < PLAY_LINE ? 0x44ff44 : 0x44aaff);
      return;
    }
    if (this.targetMode && this._selOrigin) {
      const o = this._selOrigin;
      this.arrowGfx.lineStyle(3, 0xff4444, 0.7);
      this.arrowGfx.beginPath();
      this.arrowGfx.moveTo(o.x, o.y);
      this.arrowGfx.lineTo(ptr.x, ptr.y);
      this.arrowGfx.strokePath();
      const a = Math.atan2(ptr.y - o.y, ptr.x - o.x), s = 10;
      this.arrowGfx.fillStyle(0xff4444, 0.7);
      this.arrowGfx.fillTriangle(
        ptr.x, ptr.y,
        ptr.x - s * Math.cos(a - 0.4), ptr.y - s * Math.sin(a - 0.4),
        ptr.x - s * Math.cos(a + 0.4), ptr.y - s * Math.sin(a + 0.4)
      );
    }
  }

  _onUp(ptr) {
    if (!this._dragCard) return;
    const d = this._dragCard;
    this._dragCard = null;
    const dist = Phaser.Math.Distance.Between(ptr.downX, ptr.downY, ptr.x, ptr.y);

    if (dist < 8) {
      d.ct.x = d.ox; d.ct.y = d.oy; d.ct.setAngle(d.oa); d.ct.setDepth(30 + d.idx); d.ct.setScale(1);
      this._tryPlay(d.idx, d.card, d.ct, d.ox, d.oy, d.oa);
      return;
    }
    if (ptr.y < PLAY_LINE) {
      this._tryPlay(d.idx, d.card, d.ct, d.ox, d.oy, d.oa);
    } else {
      d.ct.setDepth(30 + d.idx);
      this.tweens.add({
        targets: d.ct, x: d.ox, y: d.oy, angle: d.oa, scaleX: 1, scaleY: 1,
        duration: 120, ease: 'Back.easeOut'
      });
    }
  }

  _tryPlay(idx, card, ct, ox, oy, oa) {
    const nt = card.effect && (card.effect.target === 'enemy_any' || card.effect.target === 'friendly_minion');
    if (nt) {
      ct.x = ox; ct.y = oy; ct.setAngle(oa); ct.setDepth(30 + idx); ct.setScale(1);
      this.selecting = {
        type: 'play', handIndex: idx, card,
        needsFriendly: card.effect.target === 'friendly_minion'
      };
      this._selOrigin = { x: ox, y: oy };
      this.targetMode = true;
      this.redraw();
    } else {
      this._send({ type: 'pvp_play_card', handIndex: idx, target: null });
    }
  }

  _onTarget(info) {
    if (!this.selecting) return;
    if (this.selecting.type === 'play') {
      this._send({ type: 'pvp_play_card', handIndex: this.selecting.handIndex, target: info });
    } else if (this.selecting.type === 'attack') {
      this._send({ type: 'pvp_attack', attackerUid: this.selecting.uid, target: info });
    }
    this.targetMode = false;
    this.selecting = null;
    this._selOrigin = null;
    this.arrowGfx.clear();
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(msg));
  }

  _float(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      ...FONT, fontSize: '14px', color, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  /* ═══════ RETURN ═══════ */
  returnToMap() {
    this.scene.start(this.returnScene, {
      ws: this.ws, myId: this.myId,
      playerX: this.returnData.playerX, playerY: this.returnData.playerY
    });
  }

  /* ═══════ RESULT ═══════ */
  showResult() {
    this.resultShown = true;
    this.uiGroup.clear(true, true);
    this._clearHand();
    this.input.removeAllListeners();

    const won = this.state.winner === 'you';
    const isDraw = this.state.winner === 'draw';

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.9).setDepth(100);

    if (isDraw) {
      this.add.text(W / 2, 240, 'DRAW', {
        ...FONT, fontSize: '32px', color: '#e6b422', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setDepth(102);
      this.add.text(W / 2, 290, 'No victor this time.', {
        ...FONT, fontSize: '10px', color: '#ccc'
      }).setOrigin(0.5).setDepth(102);
      this._resultBtn(380);
    } else if (won) {
      this._showWin();
    } else {
      this.add.text(W / 2, 240, 'DEFEAT', {
        ...FONT, fontSize: '32px', color: '#ff4444', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setDepth(102);
      this.add.text(W / 2, 290, 'Your opponent stole a card!\nTrain harder.', {
        ...FONT, fontSize: '10px', color: '#ff8888', align: 'center'
      }).setOrigin(0.5).setDepth(102);
      this._resultBtn(380);
    }
  }

  _showWin() {
    grantXp(30);
    try {
      const video = this.add.video(W / 2, 400, 'win_anim');
      video.setDisplaySize(460, 340).setDepth(101).setMute(true);
      if (this.game.renderer.type === Phaser.WEBGL)
        video.setPostPipeline('ChromaKeyPostFX');
      video.play(true);
    } catch (_) {}

    const title = this.add.text(W / 2, 80, 'VICTORY', {
      ...FONT, fontSize: '44px', color: '#e6b422', stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(106).setScale(0);
    this.tweens.add({
      targets: title, scaleX: 1, scaleY: 1, duration: 500, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: title, scaleX: 1.04, scaleY: 1.04,
          duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    });

    this.add.text(W / 2, 145, '+30 XP', {
      ...FONT, fontSize: '14px', color: '#44aaff'
    }).setOrigin(0.5).setDepth(106);
    this.add.text(W / 2, 178, "Steal a card from your opponent's deck:", {
      ...FONT, fontSize: '10px', color: '#e6b422'
    }).setOrigin(0.5).setDepth(106);

    const rewards = this.state.rewardCards || [];
    if (!rewards.length) {
      this.add.text(W / 2, 370, 'No cards available', {
        ...FONT, fontSize: '10px', color: '#aaa'
      }).setOrigin(0.5).setDepth(102);
      this._resultBtn(430);
      return;
    }

    const cw = 140, ch = 190, g = 18;
    const tw = rewards.length * cw + (rewards.length - 1) * g;
    const sx = W / 2 - tw / 2 + cw / 2;
    this._rewardBgs = [];

    rewards.forEach((card, i) => {
      const cx = sx + i * (cw + g), cy = 440;
      const bg = this.add.rectangle(cx, cy, cw, ch, 0x1a2a3a, 0.95)
        .setStrokeStyle(2, 0x5577aa).setDepth(103);
      this._rewardBgs.push(bg);

      const tex = getCardTextureKey(this, card);
      if (tex) {
        this.add.image(cx, cy - 36, tex).setDisplaySize(cw - 16, 72).setDepth(104);
      } else {
        this.add.rectangle(cx, cy - 36, cw - 16, 72, 0x334455).setDepth(104);
      }

      this.add.text(cx, cy + 20, card.name, {
        ...FONT, fontSize: '9px', color: '#fff'
      }).setOrigin(0.5).setDepth(104);
      this.add.text(cx, cy + 38, `${card.cost}\u2B21  ${card.attack}\u2694  ${card.hp}\u2665`, {
        ...FONT, fontSize: '9px', color: '#88bbff'
      }).setOrigin(0.5).setDepth(104);

      const desc = card.effect?.description || card.description || '';
      if (desc)
        this.add.text(cx, cy + 55, desc, {
          ...FONT, fontSize: '7px', color: '#ccc', wordWrap: { width: cw - 16 }
        }).setOrigin(0.5, 0).setDepth(104);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => { if (bg.active) bg.setStrokeStyle(2, 0xffcc00); });
      bg.on('pointerout', () => { if (bg.active) bg.setStrokeStyle(2, 0x5577aa); });
      bg.on('pointerdown', () => this._pickReward(card, bg));
    });
  }

  _pickReward(card, chosenBg) {
    const customs = loadCustomCards();
    if (!customs.some(c => c.id === card.id)) { customs.push(card); saveCustomCards(customs); }
    const col = loadCollection() || [];
    col.push(card.id);
    saveCollection(col);
    rebuildPool();

    this._rewardBgs.forEach(bg => bg.removeInteractive());
    chosenBg.setStrokeStyle(3, 0x44ff44);

    this.add.text(W / 2, 570, `${card.name} added to your collection!`, {
      ...FONT, fontSize: '12px', color: '#44ffaa'
    }).setOrigin(0.5).setDepth(105);
    this._resultBtn(620);
  }

  _resultBtn(y) {
    const bg = this.add.rectangle(W / 2, y, 220, 40, 0x223344, 0.95)
      .setStrokeStyle(2, 0x4477aa).setDepth(105);
    bg.setInteractive({ useHandCursor: true });
    this.add.text(W / 2, y, 'RETURN TO MAP', {
      ...FONT, fontSize: '10px', color: '#fff'
    }).setOrigin(0.5).setDepth(106);
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0x66aaff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4477aa));
    bg.on('pointerdown', () => this.returnToMap());
  }
}
