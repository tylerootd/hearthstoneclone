import Phaser from 'phaser';
import { loadDeck, loadArtifacts, saveArtifacts } from '../data/storage.js';
import { getCardById } from '../data/cardPool.js';
import { grantXp, loadProgression } from '../data/progression.js';
import { getCardTextureKey } from '../utils/cardSprite.js';
import {
  createBattleState, startTurn, endTurnTriggers, canPlayCard, playCard,
  minionAttack, runEnemyTurn, needsTarget, generateEnemyDeck,
  ARTIFACT_DEFS, ALL_ARTIFACT_IDS
} from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 88, CARD_H = 124;
const MIN_S = 68;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const BOARD_Y = { enemy: 190, player: 445 };
const HERO_Y = { enemy: 55, player: 565 };
const HAND_Y = 688;
const PLAY_LINE = 588;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create(data) {
    this.battleData = data || {};
    this.selecting = null;
    this.targetMode = false;
    this.animLock = false;
    this._dragCard = null;
    this._selOrigin = null;

    const playerDeck = this.battleData.playerDeck || loadDeck() || [];
    const enemyDeck = this.battleData.enemyDeck || generateEnemyDeck();
    this.playerArtifacts = this.battleData.artifacts || loadArtifacts();
    this.bs = createBattleState(playerDeck, enemyDeck, this.playerArtifacts, loadProgression().level);
    startTurn(this.bs, 'player');

    this.add.image(W / 2, H / 2, 'battle_board').setDisplaySize(W, H).setDepth(0);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.32).setDepth(1);
    this.add.rectangle(W / 2, 330, 680, 2, 0x44403a, 0.4).setDepth(5);

    this.uiGroup = this.add.group();
    this.handCards = [];
    this.arrowGfx = this.add.graphics().setDepth(50);

    this.input.on('pointermove', (p) => this._onMove(p));
    this.input.on('pointerup', (p) => this._onUp(p));
    this.input.keyboard.on('keydown-ESC', () => this._cancel());

    this.refresh();
    this._banner('YOUR TURN');
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
    this.refresh();
  }

  refresh() {
    this.uiGroup.clear(true, true);
    this._clearHand();
    const s = this.bs;

    this._heroPanel(W / 2, HERO_Y.enemy, s.enemy, 'ENEMY', true);
    this._boardRow(s.enemy.board, BOARD_Y.enemy, false);
    this._boardRow(s.player.board, BOARD_Y.player, true);
    this._heroPanel(W / 2, HERO_Y.player, s.player, 'YOU', false);
    this._mana(s.player);
    this._hand();
    this._endBtn();
    this._log();
    this._artifact();
    this._enemyHandBacks(s.enemy.hand.length);

    if (this.targetMode) {
      this._ui(this.add.text(W / 2, 328, 'SELECT A TARGET', {
        ...FONT, fontSize: '10px', color: '#ffcc00'
      }).setOrigin(0.5).setDepth(20));
    }

    if (s.phase === 'over') this.showResult();
  }

  /* ═══════ HERO PANEL ═══════ */
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
    this._ui(this.add.text(x + 72, y + 8, `Deck ${side.deck.length}`, {
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

  /* ═══════ BOARD MINIONS ═══════ */
  _boardRow(board, yBase, isPlayer) {
    const gap = MIN_S + 12;
    const sx = W / 2 - (board.length - 1) * gap / 2;
    board.forEach((m, i) => {
      const x = sx + i * gap, y = yBase;
      const card = getCardById(m.id);
      const tex = card ? getCardTextureKey(this, card) : null;
      const bc = isPlayer ? 0x337744 : 0x774433;

      const fr = this._ui(this.add.rectangle(x, y, MIN_S, MIN_S, 0x0d0d1a, 0.9).setStrokeStyle(2, bc).setDepth(10));
      if (tex) this._ui(this.add.image(x, y - 2, tex).setDisplaySize(MIN_S - 12, MIN_S - 16).setDepth(11));

      this._ui(this.add.text(x, y - MIN_S / 2 + 5, m.name.slice(0, 7), {
        ...FONT, fontSize: '5px', color: '#ddd', backgroundColor: '#00000099', padding: { x: 2, y: 1 }
      }).setOrigin(0.5).setDepth(12));

      const r = 11;
      this._ui(this.add.circle(x - MIN_S / 2 + 9, y + MIN_S / 2 - 9, r, 0xaa8800).setDepth(12));
      this._ui(this.add.text(x - MIN_S / 2 + 9, y + MIN_S / 2 - 9, `${m.atk}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));
      this._ui(this.add.circle(x + MIN_S / 2 - 9, y + MIN_S / 2 - 9, r, 0xbb2222).setDepth(12));
      this._ui(this.add.text(x + MIN_S / 2 - 9, y + MIN_S / 2 - 9, `${m.hp}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));

      if (!m.canAttack && isPlayer) {
        this._ui(this.add.text(x, y + 2, 'zzz', { ...FONT, fontSize: '7px', color: '#555' }).setOrigin(0.5).setDepth(13));
      }

      fr.setInteractive({ useHandCursor: true });
      const canAct = isPlayer && m.canAttack && !this.targetMode &&
        this.bs.phase === 'playing' && this.bs.currentTurn === 'player' && !this.animLock;

      if (canAct) {
        fr.on('pointerdown', () => {
          this.selecting = { type: 'attack', uid: m.uid };
          this._selOrigin = { x, y };
          this.targetMode = true;
          this.refresh();
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

  /* ═══════ HAND CARDS ═══════ */
  _hand() {
    const hand = this.bs.player.hand;
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
      const ok = canPlayCard(this.bs, 'player', i);

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
        if (this.animLock || this.targetMode || this._dragCard) return;
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

      const canDrag = ok && !this.targetMode && this.bs.phase === 'playing' &&
        this.bs.currentTurn === 'player' && !this.animLock;
      if (canDrag) {
        ct.on('pointerdown', () => {
          this._dragCard = { ct, idx: i, ox: cx, oy: cy, oa: ang, card };
          ct.setDepth(200);
        });
      }

      this.handCards.push(ct);
    });
  }

  /* ═══════ ENEMY HAND BACKS ═══════ */
  _enemyHandBacks(count) {
    const sp = Math.min(28, 220 / Math.max(count, 1));
    const sx = W / 2 - (count - 1) * sp / 2;
    for (let i = 0; i < count; i++) {
      this._ui(this.add.rectangle(sx + i * sp, 14, 22, 30, 0x2a1a0a, 0.85)
        .setStrokeStyle(1, 0x553322).setDepth(10));
    }
  }

  /* ═══════ MANA CRYSTALS ═══════ */
  _mana(p) {
    const bx = 916, by = 620, gap = 15;
    const n = p.maxMana, sx = bx - (n - 1) * gap / 2;
    this._ui(this.add.text(bx, by - 16, 'MANA', {
      ...FONT, fontSize: '6px', color: '#3366aa'
    }).setOrigin(0.5).setDepth(15));
    for (let i = 0; i < n; i++) {
      const filled = i < p.mana;
      const d = this.add.rectangle(sx + i * gap, by, 8, 8, filled ? 0x2266ff : 0x181830, filled ? 1 : 0.4)
        .setAngle(45).setStrokeStyle(1, filled ? 0x44aaff : 0x2a2a44).setDepth(15);
      this._ui(d);
    }
    this._ui(this.add.text(bx, by + 14, `${p.mana}/${p.maxMana}`, {
      ...FONT, fontSize: '9px', color: '#5599ee'
    }).setOrigin(0.5).setDepth(15));
  }

  /* ═══════ END TURN BUTTON ═══════ */
  _endBtn() {
    if (this.bs.phase !== 'playing' || this.bs.currentTurn !== 'player' || this.animLock) return;
    const bx = 958, by = 330;
    const bg = this._ui(this.add.rectangle(bx, by, 78, 34, 0x775511, 0.9)
      .setStrokeStyle(2, 0xccaa44).setDepth(20));
    bg.setInteractive({ useHandCursor: true });
    this._ui(this.add.text(bx, by, 'END\nTURN', {
      ...FONT, fontSize: '7px', color: '#ffe066', align: 'center'
    }).setOrigin(0.5).setDepth(21));
    bg.on('pointerover', () => bg.setFillStyle(0x997722));
    bg.on('pointerout', () => bg.setFillStyle(0x775511, 0.9));
    bg.on('pointerdown', () => this.endTurn());
  }

  /* ═══════ BATTLE LOG ═══════ */
  _log() {
    this.bs.log.slice(-3).forEach((l, i) => {
      this._ui(this.add.text(10, 335 + i * 13, l, {
        ...FONT, fontSize: '5px', color: '#555'
      }).setDepth(15));
    });
  }

  /* ═══════ ARTIFACT BADGE ═══════ */
  _artifact() {
    if (!this.playerArtifacts?.length) return;
    const d = ARTIFACT_DEFS[this.playerArtifacts[0]];
    if (!d) return;
    this._ui(this.add.rectangle(72, 16, 130, 24, 0x0a0a1a, 0.85)
      .setStrokeStyle(1, 0x333333).setDepth(15));
    this._ui(this.add.text(20, 16, d.icon, {
      fontSize: '14px', color: d.color
    }).setOrigin(0.5).setDepth(16));
    this._ui(this.add.text(44, 16, d.name, {
      ...FONT, fontSize: '6px', color: '#e6b422'
    }).setOrigin(0, 0.5).setDepth(16));
  }

  /* ═══════ INPUT: MOVE ═══════ */
  _onMove(ptr) {
    this.arrowGfx.clear();
    if (this._dragCard) {
      const d = this._dragCard;
      d.ct.x = ptr.x;
      d.ct.y = ptr.y;
      d.ct.setAngle(0);
      const over = ptr.y < PLAY_LINE;
      const bg = d.ct.list?.[0];
      if (bg?.setStrokeStyle) bg.setStrokeStyle(2, over ? 0x44ff44 : 0x44aaff);
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

  /* ═══════ INPUT: POINTER UP ═══════ */
  _onUp(ptr) {
    if (!this._dragCard) return;
    const d = this._dragCard;
    this._dragCard = null;
    const dist = Phaser.Math.Distance.Between(ptr.downX, ptr.downY, ptr.x, ptr.y);

    if (dist < 8) {
      d.ct.x = d.ox; d.ct.y = d.oy; d.ct.setAngle(d.oa); d.ct.setDepth(30 + d.idx);
      d.ct.setScale(1);
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
    if (needsTarget(card)) {
      ct.x = ox; ct.y = oy; ct.setAngle(oa); ct.setDepth(30 + idx); ct.setScale(1);
      this.selecting = {
        type: 'play', handIndex: idx, card,
        needsFriendly: card.effect?.target === 'friendly_minion'
      };
      this._selOrigin = { x: ox, y: oy };
      this.targetMode = true;
      this.refresh();
    } else {
      this._playAnim(idx, ct);
    }
  }

  /* ═══════ PLAY CARD ANIMATION ═══════ */
  _playAnim(idx, ct) {
    if (this.animLock) return;
    this.animLock = true;
    const isMinion = this.bs.player.hand[idx]?.type === 'minion';
    this.tweens.add({
      targets: ct,
      x: W / 2, y: isMinion ? BOARD_Y.player : 330,
      scaleX: 0.5, scaleY: 0.5, alpha: 0.3, angle: 0,
      duration: 200, ease: 'Power2',
      onComplete: () => {
        const hi = this.handCards.indexOf(ct);
        if (hi >= 0) this.handCards.splice(hi, 1);
        ct.destroy();
        playCard(this.bs, 'player', idx, null);
        this.animLock = false;
        this.refresh();
      }
    });
  }

  /* ═══════ ATTACK ANIMATION ═══════ */
  _atkAnim(uid, target, ax, ay, tx, ty) {
    if (this.animLock) return;
    this.animLock = true;
    this.arrowGfx.clear();
    const attacker = this.bs.player.board.find(m => m.uid === uid);
    const dmg = attacker ? attacker.atk : 0;

    const dot = this.add.circle(ax, ay, 5, 0x44ff44).setDepth(100);
    this.tweens.add({
      targets: dot, x: tx, y: ty, duration: 120, ease: 'Power2', yoyo: true,
      onYoyo: () => {
        this.cameras.main.shake(60, 0.005);
        this._float(tx, ty, `-${dmg}`, '#ff4444');
      },
      onComplete: () => {
        dot.destroy();
        minionAttack(this.bs, 'player', uid, target);
        this.animLock = false;
        this.targetMode = false;
        this.selecting = null;
        this._selOrigin = null;
        this.refresh();
      }
    });
  }

  _float(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      ...FONT, fontSize: '14px', color, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  _banner(text) {
    const bg = this.add.rectangle(W / 2, 330, 280, 44, 0x000000, 0.88).setDepth(300).setScale(0, 1);
    const tx = this.add.text(W / 2, 330, text, {
      ...FONT, fontSize: '14px', color: '#ffe066'
    }).setOrigin(0.5).setDepth(301).setAlpha(0);
    this.tweens.add({
      targets: bg, scaleX: 1, duration: 160, ease: 'Back.easeOut',
      onComplete: () => {
        tx.setAlpha(1);
        this.time.delayedCall(650, () => {
          this.tweens.add({
            targets: [bg, tx], alpha: 0, duration: 220,
            onComplete: () => { bg.destroy(); tx.destroy(); }
          });
        });
      }
    });
  }

  /* ═══════ TARGET SELECTED ═══════ */
  _onTarget(info) {
    if (!this.selecting) return;
    if (this.selecting.type === 'play') {
      playCard(this.bs, 'player', this.selecting.handIndex, info);
      this.targetMode = false;
      this.selecting = null;
      this._selOrigin = null;
      this.arrowGfx.clear();
      this.refresh();
    } else if (this.selecting.type === 'attack') {
      const uid = this.selecting.uid;
      const ai = this.bs.player.board.findIndex(m => m.uid === uid);
      const gap = MIN_S + 12;
      const sx = W / 2 - (this.bs.player.board.length - 1) * gap / 2;
      const ax = sx + ai * gap, ay = BOARD_Y.player;
      let tx, ty;
      if (info.type === 'hero') { tx = W / 2; ty = HERO_Y.enemy; }
      else {
        const ti = this.bs.enemy.board.findIndex(m => m.uid === info.uid);
        const esx = W / 2 - (this.bs.enemy.board.length - 1) * gap / 2;
        tx = esx + ti * gap; ty = BOARD_Y.enemy;
      }
      this._atkAnim(uid, info, ax, ay, tx, ty);
    }
  }

  /* ═══════ END TURN ═══════ */
  endTurn() {
    if (this.animLock) return;
    this.animLock = true;
    endTurnTriggers(this.bs, 'player');
    if (this.bs.phase === 'over') { this.animLock = false; this.refresh(); return; }
    startTurn(this.bs, 'enemy');
    if (this.bs.phase === 'over') { this.animLock = false; this.refresh(); return; }
    this._banner('ENEMY TURN');
    this.time.delayedCall(700, () => {
      runEnemyTurn(this.bs);
      if (this.bs.phase === 'over') { this.animLock = false; this.refresh(); return; }
      endTurnTriggers(this.bs, 'enemy');
      if (this.bs.phase === 'over') { this.animLock = false; this.refresh(); return; }
      startTurn(this.bs, 'player');
      this.animLock = false;
      this.refresh();
      this._banner('YOUR TURN');
    });
  }

  /* ═══════ RESULT SCREEN ═══════ */
  showResult() {
    const overlay = this._ui(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88).setDepth(400));
    const won = this.bs.winner === 'player';
    const returnTo = this.battleData.returnTo || 'Hub';
    const returnData = {
      playerX: this.battleData.playerX, playerY: this.battleData.playerY,
      ws: this.battleData.ws, myId: this.battleData.myId
    };

    if (won) {
      try {
        const video = this.add.video(W / 2, 380, 'win_anim');
        video.setDisplaySize(460, 340).setMute(true).setDepth(401);
        if (this.game.renderer.type === Phaser.WEBGL)
          video.setPostPipeline('ChromaKeyPostFX');
        video.play(true);
        this._ui(video);
      } catch (_) {}

      const title = this._ui(this.add.text(W / 2, 80, 'VICTORY', {
        ...FONT, fontSize: '48px', color: '#e6b422', stroke: '#000000', strokeThickness: 6
      }).setOrigin(0.5).setDepth(405));
      title.setScale(0);
      this.tweens.add({
        targets: title, scaleX: 1, scaleY: 1, duration: 500, ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: title, scaleX: 1.04, scaleY: 1.04,
            duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
          });
        }
      });

      if (this.battleData.xpReward) {
        const xp = this.battleData.xpReward;
        const result = grantXp(xp);
        const npc = this.battleData.npcName || 'Enemy';
        this._ui(this.add.text(W / 2, 140, `Defeated ${npc}!`, {
          ...FONT, fontSize: '11px', color: '#e6b422'
        }).setOrigin(0.5).setDepth(405));
        this._ui(this.add.text(W / 2, 164, `+${xp} XP`, {
          ...FONT, fontSize: '13px', color: '#44aaff'
        }).setOrigin(0.5).setDepth(405));
        if (result.leveled) {
          this._ui(this.add.text(W / 2, 188, `LEVEL UP! Now Level ${result.level}`, {
            ...FONT, fontSize: '11px', color: '#ffcc00'
          }).setOrigin(0.5).setDepth(405));
        }
      }
      this.showRewardPick(returnTo, returnData);
    } else {
      const msg = this.bs.winner === 'draw' ? 'DRAW' : 'DEFEAT';
      const col = this.bs.winner === 'draw' ? '#e6b422' : '#ff4444';
      this._ui(this.add.text(W / 2, 200, msg, {
        ...FONT, fontSize: '36px', color: col, stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setDepth(405));
      this._returnBtn(W / 2, 340, returnTo, returnData);
    }
  }

  showRewardPick(returnTo, returnData) {
    const owned = new Set(loadArtifacts());
    const avail = ALL_ARTIFACT_IDS.filter(id => !owned.has(id));
    if (!avail.length) {
      this._ui(this.add.text(W / 2, 360, 'All artifacts collected!', {
        ...FONT, fontSize: '12px', color: '#e6b422'
      }).setOrigin(0.5).setDepth(405));
      this._returnBtn(W / 2, 420, returnTo, returnData);
      return;
    }

    this._ui(this.add.text(W / 2, 270, 'Pick an artifact:', {
      ...FONT, fontSize: '12px', color: '#e6b422'
    }).setOrigin(0.5).setDepth(405));

    const list = avail.slice(0, 3);
    const tw = list.length * 200;
    const sx = W / 2 - tw / 2 + 100;

    list.forEach((artId, i) => {
      const art = ARTIFACT_DEFS[artId];
      const x = sx + i * 200, y = 430;
      const borderColor = Phaser.Display.Color.HexStringToColor(art.color).color;

      const bg = this._ui(this.add.rectangle(x, y, 170, 180, 0x1a1a2a, 0.95)
        .setStrokeStyle(2, borderColor).setDepth(403));
      bg.setInteractive({ useHandCursor: true });

      this._ui(this.add.text(x, y - 60, art.icon, {
        fontSize: '32px'
      }).setOrigin(0.5).setDepth(404));
      this._ui(this.add.text(x, y - 24, art.name, {
        ...FONT, fontSize: '8px', color: art.color
      }).setOrigin(0.5).setDepth(404));

      const words = art.description.split(' ');
      let lines = [''];
      words.forEach(w => {
        const cur = lines[lines.length - 1];
        if ((cur + ' ' + w).length > 20) lines.push(w);
        else lines[lines.length - 1] = cur ? cur + ' ' + w : w;
      });
      lines.forEach((line, li) => {
        this._ui(this.add.text(x, y + 4 + li * 14, line, {
          ...FONT, fontSize: '6px', color: '#aaa', align: 'center'
        }).setOrigin(0.5).setDepth(404));
      });

      bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffcc00));
      bg.on('pointerout', () => bg.setStrokeStyle(2, borderColor));
      bg.on('pointerdown', () => {
        const arts = loadArtifacts();
        if (!arts.includes(artId)) { arts.push(artId); saveArtifacts(arts); }
        this.scene.start(returnTo, returnData);
      });
    });
  }

  _returnBtn(x, y, returnTo, returnData) {
    const label = returnTo === 'Overworld' ? 'RETURN TO MAP' : 'RETURN';
    const bg = this._ui(this.add.rectangle(x, y, 220, 40, 0x223344, 0.95)
      .setStrokeStyle(2, 0x4477aa).setDepth(405));
    bg.setInteractive({ useHandCursor: true });
    this._ui(this.add.text(x, y, label, {
      ...FONT, fontSize: '10px', color: '#fff'
    }).setOrigin(0.5).setDepth(406));
    bg.on('pointerover', () => bg.setStrokeStyle(2, 0x66aaff));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x4477aa));
    bg.on('pointerdown', () => this.scene.start(returnTo, returnData));
  }
}
