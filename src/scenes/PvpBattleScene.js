import Phaser from 'phaser';
import { getCardTextureKey } from '../utils/cardSprite.js';
import { grantXp } from '../data/progression.js';
import { loadCollection, saveCollection, loadCustomCards, saveCustomCards } from '../data/storage.js';
import { rebuildPool } from '../data/cardPool.js';
import { ARTIFACT_DEFS, guardianBlockingHero } from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 88, CARD_H = 124;
const BAR_H = 18;
const BOARD_GAP = CARD_W + 6;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const BOARD_Y = { enemy: 155, player: 395 };
const HERO_Y = { enemy: 42, player: 524 };
const HAND_Y = 662;
const PLAY_LINE = 550;
const HIT_PAD = 18;
const SLOT_COUNT = 7;
const SLOT_X = (s) => W / 2 + (s - 3) * BOARD_GAP;

export default class PvpBattleScene extends Phaser.Scene {
  constructor() { super('PvpBattle'); }

  create(data) {
    this.ws = data.ws;
    this.myId = data.myId;
    this.returnScene = data.returnTo || 'MmoMap';
    this._username = data.returnData?.username || data.username || 'Player';
    this.returnData = { playerX: data.playerX, playerY: data.playerY, username: this._username, ...(data.returnData || {}) };
    this.state = null;
    this.selecting = null;
    this.targetMode = false;
    this._dragCard = null;
    this._selOrigin = null;
    this._handSlots = [];
    this._hoveredIdx = -1;
    this._positionMode = false;
    this._pendingPlay = null;
    this._logOpen = false;
    this._nameMasks = [];
    this.resultShown = false;

    this.add.image(W / 2, H / 2, 'battle_board').setDisplaySize(W, H).setDepth(0);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.32).setDepth(1);
    this.add.rectangle(W / 2, 278, 700, 2, 0x44403a, 0.4).setDepth(5);

    this.uiGroup = this.add.group();
    this.handCards = [];
    this.arrowGfx = this.add.graphics().setDepth(50);

    this.input.on('pointerdown', (p) => this._onDown(p));
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
          this._positionMode = false;
          this._pendingPlay = null;
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
    if (this._hoveredIdx >= 0) { this._unhoverSlot(this._hoveredIdx); this._hoveredIdx = -1; }
    this._positionMode = false;
    this._pendingPlay = null;
    this.targetMode = false;
    this.selecting = null;
    this._selOrigin = null;
    this.arrowGfx.clear();
    this.redraw();
  }

  redraw() {
    this._nameMasks.forEach(m => m.destroy());
    this._nameMasks = [];
    this.uiGroup.clear(true, true);
    this._clearHand();
    const s = this.state;
    if (!s) return;

    this._drawBoardFrames(BOARD_Y.enemy);
    this._drawBoardFrames(BOARD_Y.player);
    this._heroPanel(W / 2, HERO_Y.enemy, s.opponent, 'OPPONENT', true);
    this._boardRow(s.opponent.board, BOARD_Y.enemy, false);
    this._boardRow(s.you.board, BOARD_Y.player, true);
    this._heroPanel(W / 2, HERO_Y.player, s.you, 'YOU', false);
    this._mana(s.you);
    this._hand();
    this._endBtn(s);
    this._log(s);
    this._enemyHandBacks(s.opponent.handCount);

    if (this._positionMode) {
      this._showPositionSlots();
      this._ui(this.add.text(W / 2, 278, 'CHOOSE A POSITION', {
        ...FONT, fontSize: '10px', color: '#cc88ff'
      }).setOrigin(0.5).setDepth(20));
    } else {
      const turnMsg = s.yourTurn ? 'YOUR TURN' : "OPPONENT'S TURN";
      const turnCol = s.yourTurn ? '#44ff44' : '#ff8844';
      this._ui(this.add.text(W / 2, 278, this.targetMode ? 'SELECT A TARGET' : turnMsg, {
        ...FONT, fontSize: '10px', color: this.targetMode ? '#ffcc00' : turnCol
      }).setOrigin(0.5).setDepth(20));
    }

    if (s.phase === 'over') this.showResult();
  }

  _drawBoardFrames(y) {
    for (let s = 0; s < SLOT_COUNT; s++) {
      const fx = SLOT_X(s);
      this._ui(this.add.rectangle(fx, y, CARD_W, CARD_H, 0x000000, 0.12)
        .setStrokeStyle(1, 0x444455).setDepth(8));
      if (this.textures.exists('card_frame'))
        this._ui(this.add.image(fx, y - 2, 'card_frame').setDisplaySize(CARD_W, CARD_H).setAlpha(0.15).setDepth(8));
    }
  }

  _occupiedSlots() {
    return new Set((this.state?.you?.board || []).map(m => m.slot));
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
      const oppBoard = this.state?.opponent?.board || [];
      const blocked = this.selecting?.type === 'attack' &&
        guardianBlockingHero(this.selecting.slot, oppBoard);
      if (!blocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this._onTarget({ type: 'hero' }));
        bg.on('pointerover', () => bg.setStrokeStyle(3, 0xff4444));
        bg.on('pointerout', () => bg.setStrokeStyle(2, stroke));
      } else {
        const bx = W / 2, by = y;
        this._ui(this.add.rectangle(bx, by, 300, 36, 0x000000, 0.85).setStrokeStyle(2, 0xff4444).setDepth(100));
        this._ui(this.add.text(bx, by, '\u{1F6E1}  BLOCKED BY GUARDIAN', {
          ...FONT, fontSize: '11px', color: '#ff6644', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(101));
      }
    }
  }

  /* ═══════ BOARD (full card size, fixed slots) ═══════ */
  _boardRow(board, yBase, isPlayer) {
    board.forEach((m) => {
      const x = SLOT_X(m.slot != null && m.slot >= 0 ? m.slot : 0), y = yBase;
      const texKey = m.sprite ? (() => {
        const k = 'sprite_' + m.sprite.replace('.png', '');
        return this.textures.exists(k) ? k : null;
      })() : null;
      const isGuardian = m.keywords && m.keywords.includes('guardian');
      const bc = isGuardian ? 0x33ddff : (isPlayer ? 0x337744 : 0x774433);

      if (isGuardian) {
        this._ui(this.add.rectangle(x, y, CARD_W + 10, CARD_H + 10, 0x000000, 0)
          .setStrokeStyle(4, 0x33ddff).setDepth(9));
        this._ui(this.add.rectangle(x, y, CARD_W + 6, CARD_H + 6, 0x11aacc, 0.12)
          .setDepth(9));
      }

      const fr = this._ui(this.add.rectangle(x, y, CARD_W, CARD_H, 0x0d0d1a, 0.9).setStrokeStyle(isGuardian ? 3 : 2, bc).setDepth(10));
      if (texKey) this._ui(this.add.image(x, y - 16, texKey).setDisplaySize(CARD_W - 22, 50).setDepth(11));
      if (this.textures.exists('card_frame'))
        this._ui(this.add.image(x, y - 2, 'card_frame').setDisplaySize(CARD_W, CARD_H).setDepth(11));

      const barY = y - CARD_H / 2 - BAR_H / 2;
      this._ui(this.add.rectangle(x, barY, CARD_W, BAR_H, 0x05050f, 0.95)
        .setStrokeStyle(1, 0xff0077).setDepth(10));
      this._ui(this.add.rectangle(x, barY + BAR_H / 2, CARD_W - 2, 1, 0x00ffee, 0.3)
        .setDepth(11));
      const nst = { ...FONT, fontSize: '7px', color: '#00ffee', stroke: '#002222', strokeThickness: 1 };
      const nameText = this._ui(this.add.text(x, barY, m.name, nst).setOrigin(0.5).setDepth(12));
      if (nameText.width > CARD_W - 8) {
        const maskGfx = this.make.graphics();
        maskGfx.fillRect(x - CARD_W / 2 + 1, barY - BAR_H / 2, CARD_W - 2, BAR_H);
        const geoMask = maskGfx.createGeometryMask();
        this._nameMasks.push(maskGfx);
        nameText.setOrigin(0, 0.5).setMask(geoMask);
        const gap = 40;
        const sX1 = x - CARD_W / 2 + 2;
        nameText.x = sX1;
        const nW = nameText.width;
        const sX2 = sX1 + nW + gap;
        const nt2 = this._ui(this.add.text(sX2, barY, m.name, nst)
          .setOrigin(0, 0.5).setDepth(12).setMask(geoMask));
        const loopW = nW + gap;
        this.tweens.addCounter({
          from: 0, to: loopW,
          duration: Math.max(3000, m.name.length * 180),
          ease: 'Linear', repeat: -1,
          onUpdate: function (tw) {
            var off = tw.getValue();
            nameText.x = sX1 - off;
            nt2.x = sX2 - off;
          }
        });
      }

      if (isGuardian) {
        this._ui(this.add.text(x, y - 6, '\u{1F6E1}', { fontSize: '22px' }).setOrigin(0.5).setDepth(14));
        this._ui(this.add.text(x, y + 12, 'GUARDIAN', {
          ...FONT, fontSize: '5px', color: '#33ddff', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(14));
      }

      const isRage = m.keywords && m.keywords.includes('rage');
      if (isRage && !isGuardian) {
        this._ui(this.add.text(x, y - 6, '\u{1F525}', { fontSize: '18px' }).setOrigin(0.5).setDepth(14));
        this._ui(this.add.text(x, y + 10, 'RAGE', {
          ...FONT, fontSize: '5px', color: '#ff6622', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(14));
      }

      this._ui(this.add.circle(x - CARD_W / 2 + 11, y + CARD_H / 2 - 13, 10, 0xaa8800).setDepth(12));
      this._ui(this.add.text(x - CARD_W / 2 + 11, y + CARD_H / 2 - 13, `${m.atk}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));
      this._ui(this.add.circle(x + CARD_W / 2 - 11, y + CARD_H / 2 - 13, 10, 0xbb2222).setDepth(12));
      this._ui(this.add.text(x + CARD_W / 2 - 11, y + CARD_H / 2 - 13, `${m.hp}`, { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(13));

      if (!m.canAttack && isPlayer)
        this._ui(this.add.text(x, y + 4, 'zzz', { ...FONT, fontSize: '7px', color: '#555' }).setOrigin(0.5).setDepth(13));

      fr.setInteractive({ useHandCursor: true });
      const s = this.state;
      if (isPlayer && m.canAttack && !this.targetMode && s.phase === 'playing' && s.yourTurn) {
        fr.on('pointerdown', () => {
          this.selecting = { type: 'attack', uid: m.uid, slot: m.slot };
          this._selOrigin = { x, y };
          this.targetMode = true;
          this.redraw();
        });
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0x44ff44));
        fr.on('pointerout', () => fr.setStrokeStyle(isGuardian ? 3 : 2, bc));
      }
      if (this.targetMode && !isPlayer) {
        fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0xff4444));
        fr.on('pointerout', () => fr.setStrokeStyle(isGuardian ? 3 : 2, bc));
      }
      if (this.targetMode && isPlayer && this.selecting?.needsFriendly) {
        fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
        fr.on('pointerover', () => fr.setStrokeStyle(3, 0x4499ff));
        fr.on('pointerout', () => fr.setStrokeStyle(isGuardian ? 3 : 2, bc));
      }
    });
  }

  /* ═══════ HAND ═══════ */
  _hand() {
    const hand = this.state.you.hand;
    const s = this.state;
    const n = hand.length;
    this._handSlots = [];
    this._hoveredIdx = -1;
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

      ct.add(this.add.rectangle(0, -CARD_H / 2 - BAR_H / 2, CARD_W, BAR_H, 0x05050f, 0.95)
        .setStrokeStyle(1, 0xff0077));
      ct.add(this.add.rectangle(0, -CARD_H / 2, CARD_W - 2, 1, 0x00ffee, 0.3));
      const barCY = -CARD_H / 2 - BAR_H / 2;
      const nStyle = { ...FONT, fontSize: '6px', color: '#00ffee', stroke: '#002222', strokeThickness: 1 };
      const nt1 = this.add.text(0, barCY, card.name, nStyle).setOrigin(0.5);
      ct.add(nt1);
      let hoverTween = null, nt2 = null;
      const needsScroll = nt1.width > CARD_W - 8;
      if (needsScroll) {
        nt1.setText(card.name.length > 10 ? card.name.slice(0, 9) + '..' : card.name);
      }

      ct.add(this.add.circle(-CARD_W / 2 + 10, -CARD_H / 2 + 12, 10, 0x1a3399));
      ct.add(this.add.text(-CARD_W / 2 + 10, -CARD_H / 2 + 12, `${card.cost}`, {
        ...FONT, fontSize: '10px', color: '#fff'
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

      if (card.keywords && card.keywords.includes('guardian'))
        ct.add(this.add.text(0, 46, '\u{1F6E1} GUARDIAN', {
          ...FONT, fontSize: '4px', color: '#eebb44'
        }).setOrigin(0.5));

      if (card.keywords && card.keywords.includes('rage'))
        ct.add(this.add.text(0, card.keywords.includes('guardian') ? 53 : 46, '\u{1F525} RAGE', {
          ...FONT, fontSize: '4px', color: '#ff6622'
        }).setOrigin(0.5));

      this._handSlots.push({ ct, cx, cy, ang, ok, card, idx: i, needsScroll, nt1, nt2, hoverTween, barCY, nStyle });
      this.handCards.push(ct);
    });
  }

  /* ═══════ HAND HIT DETECTION (X-band, covers full card area) ═══════ */
  _handIdxAt(x, y) {
    const slots = this._handSlots;
    if (!slots.length) return -1;
    const hoveredLift = 32, hoveredScale = 1.22;
    const handTop = HAND_Y - (CARD_H / 2) * hoveredScale - hoveredLift - HIT_PAD;
    if (y < handTop) return -1;
    const n = slots.length;
    for (let i = 0; i < n; i++) {
      const hw = (CARD_W * hoveredScale) / 2 + HIT_PAD;
      const left = i === 0 ? slots[0].cx - hw : (slots[i - 1].cx + slots[i].cx) / 2;
      const right = i === n - 1 ? slots[n - 1].cx + hw : (slots[i].cx + slots[i + 1].cx) / 2;
      if (x >= left && x <= right) return i;
    }
    return -1;
  }

  /* ═══════ HAND HOVER (slot-based, no overlap issues) ═══════ */
  _updateHandHover(ptr) {
    if (this.targetMode || this._dragCard) {
      if (this._hoveredIdx >= 0) { this._unhoverSlot(this._hoveredIdx); this._hoveredIdx = -1; }
      return;
    }
    const hitIdx = this._handIdxAt(ptr.x, ptr.y);
    if (hitIdx === this._hoveredIdx) return;
    if (this._hoveredIdx >= 0) this._unhoverSlot(this._hoveredIdx);
    if (hitIdx >= 0) this._hoverSlot(hitIdx);
    this._hoveredIdx = hitIdx;
  }

  _hoverSlot(idx) {
    const s = this._handSlots[idx];
    if (!s?.ct?.active) return;
    s.ct.setDepth(100);
    s.ct.y = s.cy - 32;
    s.ct.scaleX = 1.22;
    s.ct.scaleY = 1.22;
    s.ct.angle = 0;
    const bg = s.ct.list[0];
    if (bg?.setStrokeStyle) bg.setStrokeStyle(3, 0xaa44ff);
    this._startHandScroll(idx);
  }

  _unhoverSlot(idx) {
    const s = this._handSlots[idx];
    if (!s?.ct?.active) return;
    this._stopHandScroll(idx);
    s.ct.setDepth(30 + idx);
    s.ct.y = s.cy;
    s.ct.scaleX = 1;
    s.ct.scaleY = 1;
    s.ct.angle = s.ang;
    const bg = s.ct.list[0];
    if (bg?.setStrokeStyle) bg.setStrokeStyle(s.ok ? 2 : 1, s.ok ? 0x44aaff : 0x2a2a3a);
  }

  _startHandScroll(idx) {
    const s = this._handSlots[idx];
    if (!s || !s.needsScroll || s.hoverTween) return;
    const gap = 40;
    s.nt1.setText(s.card.name);
    s.nt1.setOrigin(0, 0.5);
    const localLeft = -CARD_W / 2 + 4;
    s.nt1.x = localLeft;
    const nameW = s.nt1.width;
    const localLeft2 = localLeft + nameW + gap;
    s.nt2 = this.add.text(localLeft2, s.barCY, s.card.name, s.nStyle).setOrigin(0, 0.5);
    s.ct.add(s.nt2);

    const scale = s.ct.scaleX;
    const worldBarX = s.ct.x;
    const worldBarY = s.ct.y + s.barCY * scale;
    const worldBarW = (CARD_W - 2) * scale;
    const worldBarH = BAR_H * scale;
    const maskGfx = this.make.graphics();
    maskGfx.fillRect(worldBarX - worldBarW / 2, worldBarY - worldBarH / 2, worldBarW, worldBarH);
    const geoMask = maskGfx.createGeometryMask();
    s.nt1.setMask(geoMask);
    s.nt2.setMask(geoMask);
    s._scrollMask = maskGfx;

    const loopW = nameW + gap;
    s.hoverTween = this.tweens.addCounter({
      from: 0, to: loopW,
      duration: Math.max(3000, s.card.name.length * 180),
      ease: 'Linear', repeat: -1,
      onUpdate: function (tw) {
        var off = tw.getValue();
        s.nt1.x = localLeft - off;
        if (s.nt2) s.nt2.x = localLeft2 - off;
      }
    });
  }

  _stopHandScroll(idx) {
    const s = this._handSlots[idx];
    if (!s) return;
    if (s.hoverTween) { s.hoverTween.stop(); s.hoverTween = null; }
    if (s.nt1) s.nt1.clearMask();
    if (s.nt2) { s.nt2.destroy(); s.nt2 = null; }
    if (s._scrollMask) { s._scrollMask.destroy(); s._scrollMask = null; }
    s.nt1.setOrigin(0.5, 0.5);
    s.nt1.x = 0;
    if (s.needsScroll) s.nt1.setText(s.card.name.length > 10 ? s.card.name.slice(0, 9) + '..' : s.card.name);
    else s.nt1.setText(s.card.name);
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
    const bx = 958, by = 278;
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
    this._pvpLog = [...(this._pvpLog || [])];
    if (s.log) s.log.forEach(l => { if (!this._pvpLog.includes(l)) this._pvpLog.push(l); });

    const tabW = 28, tabH = 80;
    const tabX = this._logOpen ? 174 : 0;
    const tab = this._ui(this.add.rectangle(tabX + tabW / 2, 278, tabW, tabH, 0x1a1a2e, 0.92)
      .setStrokeStyle(2, 0x5566aa).setDepth(60));
    this._ui(this.add.text(tabX + tabW / 2, 278,
      this._logOpen ? '<' : 'L\nO\nG', {
        ...FONT, fontSize: '8px', color: '#88aaff', align: 'center', lineSpacing: 2
      }).setOrigin(0.5).setDepth(61));
    tab.setInteractive({ useHandCursor: true });
    tab.on('pointerdown', () => { this._logOpen = !this._logOpen; this.redraw(); });
    tab.on('pointerover', () => tab.setStrokeStyle(2, 0x88ccff));
    tab.on('pointerout', () => tab.setStrokeStyle(2, 0x5566aa));

    if (!this._logOpen) return;

    const pw = 174, ph = 560;
    const px = pw / 2, py = H / 2 - 20;

    this._ui(this.add.rectangle(px, py, pw, ph, 0x0a0a18, 0.94)
      .setStrokeStyle(2, 0x334466).setDepth(55));

    this._ui(this.add.text(px, py - ph / 2 + 14, 'BATTLE LOG', {
      ...FONT, fontSize: '7px', color: '#6688cc'
    }).setOrigin(0.5).setDepth(56));

    this._ui(this.add.rectangle(px, py - ph / 2 + 26, pw - 16, 1, 0x334466).setDepth(56));

    const entries = this._pvpLog || [];
    const startY = py - ph / 2 + 34;
    const lineH = 15;
    const maxVisible = Math.floor((ph - 50) / lineH);
    const visible = entries.slice(-maxVisible);
    visible.forEach((line, i) => {
      const color = line.includes('dies') ? '#ff5555' :
        line.includes('attacks') || line.includes('hits') ? '#ffaa44' :
        line.includes('plays') ? '#66dd66' :
        line.includes('Guardian') ? '#33ddff' :
        line.includes('Heals') || line.includes('heal') ? '#55ff99' : '#aaaacc';
      this._ui(this.add.text(8, startY + i * lineH, line, {
        ...FONT, fontSize: '6px', color, wordWrap: { width: pw - 16 }
      }).setDepth(56));
    });
  }

  /* ═══════ INPUT: POINTER DOWN (scene-level for hand cards) ═══════ */
  _onDown(ptr) {
    if (this._dragCard || this.targetMode || this._positionMode) return;
    if (!this.state || !this.state.yourTurn || this.state.phase !== 'playing') return;
    const idx = this._handIdxAt(ptr.x, ptr.y);
    if (idx < 0) return;
    const s = this._handSlots[idx];
    if (!s || !s.ok) return;
    if (this._hoveredIdx >= 0) this._unhoverSlot(this._hoveredIdx);
    this._hoveredIdx = -1;
    this._dragCard = { ct: s.ct, idx: s.idx, ox: s.cx, oy: s.cy, oa: s.ang, card: s.card, _snapSlot: -1 };
    s.ct.setDepth(200);
  }

  /* ═══════ ARROW DRAWING ═══════ */
  _drawArrow(x1, y1, x2, y2, color, alpha = 0.85) {
    const gfx = this.arrowGfx;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 8) return;
    const a = Math.atan2(dy, dx);
    const headLen = Math.min(20, len * 0.25);

    gfx.lineStyle(10, color, alpha * 0.15);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();

    const dots = Math.max(3, Math.floor(len / 16));
    for (let i = 1; i <= dots; i++) {
      const t = i / (dots + 1);
      const px = x1 + dx * t, py = y1 + dy * t;
      const r = 2.2 + Math.sin(t * Math.PI) * 1.6;
      gfx.fillStyle(color, alpha * (0.3 + t * 0.7));
      gfx.fillCircle(px, py, r);
    }

    gfx.lineStyle(2.5, color, alpha);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();

    gfx.fillStyle(color, alpha * 0.35);
    gfx.fillTriangle(
      x2 + 4 * Math.cos(a), y2 + 4 * Math.sin(a),
      x2 - (headLen + 4) * Math.cos(a - 0.5), y2 - (headLen + 4) * Math.sin(a - 0.5),
      x2 - (headLen + 4) * Math.cos(a + 0.5), y2 - (headLen + 4) * Math.sin(a + 0.5)
    );
    gfx.fillStyle(color, alpha);
    gfx.fillTriangle(
      x2, y2,
      x2 - headLen * Math.cos(a - 0.4), y2 - headLen * Math.sin(a - 0.4),
      x2 - headLen * Math.cos(a + 0.4), y2 - headLen * Math.sin(a + 0.4)
    );
  }

  /* ═══════ INPUT ═══════ */
  _onMove(ptr) {
    this.arrowGfx.clear();
    if (this._dragCard) {
      const d = this._dragCard;
      d.ct.setAngle(0);
      const bg = d.ct.list?.[0];
      if (d.card.type === 'minion' && ptr.y < PLAY_LINE) {
        const taken = this._occupiedSlots();
        let best = -1, bestD = Infinity;
        for (let s = 0; s < SLOT_COUNT; s++) {
          if (taken.has(s)) continue;
          const dist = Math.abs(ptr.x - SLOT_X(s));
          if (dist < bestD) { bestD = dist; best = s; }
        }
        if (best >= 0) {
          d.ct.x = SLOT_X(best);
          d.ct.y = BOARD_Y.player;
          d.ct.setScale(1);
          d._snapSlot = best;
          if (bg?.setStrokeStyle) bg.setStrokeStyle(3, 0x44ff44);
        }
      } else {
        d.ct.x = ptr.x;
        d.ct.y = ptr.y;
        d._snapSlot = -1;
        if (bg?.setStrokeStyle) bg.setStrokeStyle(3, ptr.y < PLAY_LINE ? 0x44ff44 : 0xaa44ff);
      }
      const arrowColor = ptr.y < PLAY_LINE ? 0x44ff88 : 0xaa66ff;
      this._drawArrow(d.ox, d.oy, d.ct.x, d.ct.y, arrowColor);
      return;
    }
    if (this.targetMode && this._selOrigin) {
      const o = this._selOrigin;
      this._drawArrow(o.x, o.y, ptr.x, ptr.y, 0xff4444);
    }
    this._updateHandHover(ptr);
  }

  _onUp(ptr) {
    if (!this._dragCard) return;
    const d = this._dragCard;
    this._dragCard = null;
    const dist = Phaser.Math.Distance.Between(ptr.downX, ptr.downY, ptr.x, ptr.y);
    const resetCard = () => {
      d.ct.x = d.ox; d.ct.y = d.oy; d.ct.setAngle(d.oa);
      d.ct.setDepth(30 + d.idx); d.ct.setScale(1);
    };

    if (dist < 8) {
      resetCard();
      this._clickPlay(d.idx, d.card, d.ox, d.oy);
      return;
    }

    if (ptr.y < PLAY_LINE) {
      if (d.card.type === 'minion' && d._snapSlot >= 0) {
        this._playMinion(d.idx, d.card, d._snapSlot);
      } else {
        resetCard();
        this._playSpell(d.idx, d.card, d.ox, d.oy);
      }
    } else {
      d.ct.setDepth(30 + d.idx);
      this.tweens.add({
        targets: d.ct, x: d.ox, y: d.oy, angle: d.oa, scaleX: 1, scaleY: 1,
        duration: 120, ease: 'Back.easeOut'
      });
    }
  }

  _clickPlay(idx, card, ox, oy) {
    if (card.type === 'minion') {
      this._pendingPlay = { handIndex: idx, card };
      this._positionMode = true;
      this.redraw();
    } else {
      this._playSpell(idx, card, ox, oy);
    }
  }

  _playMinion(handIdx, card, boardPos) {
    const nt = card.effect && (card.effect.target === 'enemy_any' || card.effect.target === 'friendly_minion');
    if (nt) {
      this.selecting = {
        type: 'play', handIndex: handIdx, card,
        needsFriendly: card.effect.target === 'friendly_minion',
        boardPos
      };
      this._selOrigin = { x: W / 2, y: BOARD_Y.player };
      this.targetMode = true;
      this.redraw();
    } else {
      this._send({ type: 'pvp_play_card', handIndex: handIdx, target: null, boardPos });
    }
  }

  _playSpell(idx, card, ox, oy) {
    const nt = card.effect && (card.effect.target === 'enemy_any' || card.effect.target === 'friendly_minion');
    if (nt) {
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

  /* ═══════ POSITION SLOTS (7 card-sized, click to place) ═══════ */
  _showPositionSlots() {
    const y = BOARD_Y.player;
    const taken = this._occupiedSlots();
    for (let s = 0; s < SLOT_COUNT; s++) {
      if (taken.has(s)) continue;
      const sx = SLOT_X(s);
      const slot = this._ui(this.add.rectangle(sx, y, CARD_W, CARD_H, 0x2a1a3a, 0.35)
        .setStrokeStyle(2, 0xaa44ff).setDepth(25));
      slot.setInteractive({ useHandCursor: true });
      slot.on('pointerover', () => {
        slot.setFillStyle(0x442266, 0.65);
        slot.setStrokeStyle(3, 0xcc66ff);
      });
      slot.on('pointerout', () => {
        slot.setFillStyle(0x2a1a3a, 0.35);
        slot.setStrokeStyle(2, 0xaa44ff);
      });
      slot.on('pointerdown', () => this._onPositionPick(s));
    }
  }

  _onPositionPick(slotIdx) {
    const pp = this._pendingPlay;
    if (!pp) return;
    this._positionMode = false;
    this._pendingPlay = null;
    this._playMinion(pp.handIndex, pp.card, slotIdx);
  }

  _onTarget(info) {
    if (!this.selecting) return;
    if (this.selecting.type === 'play') {
      this._send({
        type: 'pvp_play_card', handIndex: this.selecting.handIndex,
        target: info, boardPos: this.selecting.boardPos
      });
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
      playerX: this.returnData.playerX, playerY: this.returnData.playerY,
      username: this._username
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
