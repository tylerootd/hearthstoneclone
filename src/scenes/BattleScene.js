import Phaser from 'phaser';
import { loadDeck, loadArtifacts, saveArtifacts } from '../data/storage.js';
import { getCardById } from '../data/cardPool.js';
import { grantXp, loadProgression } from '../data/progression.js';
import { getCardTextureKey } from '../utils/cardSprite.js';
import {
  createBattleState, startTurn, endTurnTriggers, canPlayCard, playCard,
  minionAttack, runEnemyTurn, needsTarget, generateEnemyDeck,
  guardianBlockingHero,
  ARTIFACT_DEFS, ALL_ARTIFACT_IDS
} from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 88, CARD_H = 124;
const BOARD_GAP = CARD_W + 6;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const BOARD_Y = { enemy: 155, player: 395 };
const HERO_Y = { enemy: 42, player: 524 };
const HAND_Y = 662;
const PLAY_LINE = 550;
const HIT_PAD = 18;
const SLOT_COUNT = 7;
const SLOT_X = (s) => W / 2 + (s - 3) * BOARD_GAP;

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create(data) {
    this.battleData = data || {};
    this.selecting = null;
    this.targetMode = false;
    this._enemyTurn = false;
    this._dragCard = null;
    this._selOrigin = null;
    this._handSlots = [];
    this._hoveredIdx = -1;
    this._positionMode = false;
    this._pendingPlay = null;
    this._logOpen = false;

    const playerDeck = this.battleData.playerDeck || loadDeck() || [];
    const enemyDeck = this.battleData.enemyDeck || generateEnemyDeck();
    this.playerArtifacts = this.battleData.artifacts || loadArtifacts();
    this.bs = createBattleState(playerDeck, enemyDeck, this.playerArtifacts, loadProgression().level);
    startTurn(this.bs, 'player');

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
    if (this._hoveredIdx >= 0) { this._unhoverSlot(this._hoveredIdx); this._hoveredIdx = -1; }
    this._positionMode = false;
    this._pendingPlay = null;
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

    this._drawBoardFrames(BOARD_Y.enemy);
    this._drawBoardFrames(BOARD_Y.player);
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

    if (this._positionMode) {
      this._showPositionSlots();
      this._ui(this.add.text(W / 2, 278, 'CHOOSE A POSITION', {
        ...FONT, fontSize: '10px', color: '#cc88ff'
      }).setOrigin(0.5).setDepth(20));
    } else if (this.targetMode) {
      this._ui(this.add.text(W / 2, 278, 'SELECT A TARGET', {
        ...FONT, fontSize: '10px', color: '#ffcc00'
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
    return new Set(this.bs.player.board.map(m => m.slot));
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
      const blocked = this.selecting?.type === 'attack' &&
        guardianBlockingHero(this.selecting.slot, this.bs.enemy.board);
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

  /* ═══════ BOARD MINIONS (full card size, fixed slots) ═══════ */
  _boardRow(board, yBase, isPlayer) {
    board.forEach((m) => {
      const x = SLOT_X(m.slot != null && m.slot >= 0 ? m.slot : 0), y = yBase;
      const card = getCardById(m.id);
      const tex = card ? getCardTextureKey(this, card) : null;
      const isGuardian = m.keywords && m.keywords.includes('guardian');
      const bc = isGuardian ? 0x33ddff : (isPlayer ? 0x337744 : 0x774433);

      if (isGuardian) {
        this._ui(this.add.rectangle(x, y, CARD_W + 10, CARD_H + 10, 0x000000, 0)
          .setStrokeStyle(4, 0x33ddff).setDepth(9));
        this._ui(this.add.rectangle(x, y, CARD_W + 6, CARD_H + 6, 0x11aacc, 0.12)
          .setDepth(9));
      }

      const fr = this._ui(this.add.rectangle(x, y, CARD_W, CARD_H, 0x0d0d1a, 0.9).setStrokeStyle(isGuardian ? 3 : 2, bc).setDepth(10));
      if (tex) this._ui(this.add.image(x, y - 16, tex).setDisplaySize(CARD_W - 22, 50).setDepth(11));
      if (this.textures.exists('card_frame'))
        this._ui(this.add.image(x, y - 2, 'card_frame').setDisplaySize(CARD_W, CARD_H).setDepth(11));

      this._ui(this.add.text(x, y - CARD_H / 2 + 8, m.name.slice(0, 9), {
        ...FONT, fontSize: '5px', color: '#ddd', backgroundColor: '#00000099', padding: { x: 2, y: 1 }
      }).setOrigin(0.5).setDepth(12));

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
      const canAct = isPlayer && m.canAttack && !this.targetMode &&
        this.bs.phase === 'playing' && this.bs.currentTurn === 'player';

      if (canAct) {
        fr.on('pointerdown', () => {
          this.selecting = { type: 'attack', uid: m.uid, slot: m.slot };
          this._selOrigin = { x, y };
          this.targetMode = true;
          this.refresh();
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

  /* ═══════ HAND CARDS ═══════ */
  _hand() {
    const hand = this.bs.player.hand;
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

      if (card.keywords && card.keywords.includes('guardian'))
        ct.add(this.add.text(0, 46, '\u{1F6E1} GUARDIAN', {
          ...FONT, fontSize: '4px', color: '#eebb44'
        }).setOrigin(0.5));

      if (card.keywords && card.keywords.includes('rage'))
        ct.add(this.add.text(0, card.keywords.includes('guardian') ? 53 : 46, '\u{1F525} RAGE', {
          ...FONT, fontSize: '4px', color: '#ff6622'
        }).setOrigin(0.5));

      this._handSlots.push({ ct, cx, cy, ang, ok, card, idx: i });
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
  }

  _unhoverSlot(idx) {
    const s = this._handSlots[idx];
    if (!s?.ct?.active) return;
    s.ct.setDepth(30 + idx);
    s.ct.y = s.cy;
    s.ct.scaleX = 1;
    s.ct.scaleY = 1;
    s.ct.angle = s.ang;
    const bg = s.ct.list[0];
    if (bg?.setStrokeStyle) bg.setStrokeStyle(s.ok ? 2 : 1, s.ok ? 0x44aaff : 0x2a2a3a);
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
    if (this.bs.phase !== 'playing' || this.bs.currentTurn !== 'player' || this._enemyTurn) return;
    const bx = 958, by = 278;
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

  /* ═══════ BATTLE LOG (side panel) ═══════ */
  _log() {
    const tabW = 28, tabH = 80;
    const tabX = this._logOpen ? 174 : 0;
    const tab = this._ui(this.add.rectangle(tabX + tabW / 2, 278, tabW, tabH, 0x1a1a2e, 0.92)
      .setStrokeStyle(2, 0x5566aa).setDepth(60));
    const tabTxt = this._ui(this.add.text(tabX + tabW / 2, 278,
      this._logOpen ? '<' : 'L\nO\nG', {
        ...FONT, fontSize: '8px', color: '#88aaff', align: 'center', lineSpacing: 2
      }).setOrigin(0.5).setDepth(61));
    tab.setInteractive({ useHandCursor: true });
    tab.on('pointerdown', () => { this._logOpen = !this._logOpen; this.refresh(); });
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

    const entries = this.bs.log;
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

  /* ═══════ INPUT: POINTER DOWN (scene-level for hand cards) ═══════ */
  _onDown(ptr) {
    if (this._dragCard || this.targetMode || this._positionMode || this._enemyTurn) return;
    if (this.bs.phase !== 'playing' || this.bs.currentTurn !== 'player') return;
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

  /* ═══════ INPUT: MOVE ═══════ */
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

  /* ═══════ INPUT: POINTER UP ═══════ */
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
      this.refresh();
    } else {
      this._playSpell(idx, card, ox, oy);
    }
  }

  _playMinion(handIdx, card, boardPos) {
    if (needsTarget(card)) {
      this.selecting = {
        type: 'play', handIndex: handIdx, card,
        needsFriendly: card.effect?.target === 'friendly_minion',
        boardPos
      };
      this._selOrigin = { x: W / 2, y: BOARD_Y.player };
      this.targetMode = true;
      this.refresh();
    } else {
      playCard(this.bs, 'player', handIdx, null, boardPos);
      this.refresh();
    }
  }

  _playSpell(idx, card, ox, oy) {
    if (needsTarget(card)) {
      this.selecting = {
        type: 'play', handIndex: idx, card,
        needsFriendly: card.effect?.target === 'friendly_minion'
      };
      this._selOrigin = { x: ox, y: oy };
      this.targetMode = true;
      this.refresh();
    } else {
      playCard(this.bs, 'player', idx, null);
      this.refresh();
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

  /* ═══════ ATTACK ═══════ */
  _doAttack(uid, target, tx, ty) {
    this.arrowGfx.clear();
    const attacker = this.bs.player.board.find(m => m.uid === uid);
    const dmg = attacker ? attacker.atk : 0;
    minionAttack(this.bs, 'player', uid, target);
    this.targetMode = false;
    this.selecting = null;
    this._selOrigin = null;
    this.refresh();
    this.cameras.main.shake(60, 0.005);
    this._float(tx, ty, `-${dmg}`, '#ff4444');
  }

  _float(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      ...FONT, fontSize: '14px', color, stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 500, onComplete: () => t.destroy() });
  }

  _banner(text) {
    const bg = this.add.rectangle(W / 2, 278, 280, 44, 0x000000, 0.88).setDepth(300).setScale(0, 1);
    const tx = this.add.text(W / 2, 278, text, {
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
      playCard(this.bs, 'player', this.selecting.handIndex, info, this.selecting.boardPos);
      this.targetMode = false;
      this.selecting = null;
      this._selOrigin = null;
      this.arrowGfx.clear();
      this.refresh();
    } else if (this.selecting.type === 'attack') {
      let tx, ty;
      if (info.type === 'hero') { tx = W / 2; ty = HERO_Y.enemy; }
      else {
        const ti = this.bs.enemy.board.findIndex(m => m.uid === info.uid);
        const esx = W / 2 - (this.bs.enemy.board.length - 1) * BOARD_GAP / 2;
        tx = esx + ti * BOARD_GAP; ty = BOARD_Y.enemy;
      }
      this._doAttack(this.selecting.uid, info, tx, ty);
    }
  }

  /* ═══════ END TURN ═══════ */
  endTurn() {
    if (this._enemyTurn) return;
    this._enemyTurn = true;
    endTurnTriggers(this.bs, 'player');
    if (this.bs.phase === 'over') { this._enemyTurn = false; this.refresh(); return; }
    startTurn(this.bs, 'enemy');
    if (this.bs.phase === 'over') { this._enemyTurn = false; this.refresh(); return; }
    this.refresh();
    this._banner('ENEMY TURN');
    this.time.delayedCall(700, () => {
      runEnemyTurn(this.bs);
      if (this.bs.phase === 'over') { this._enemyTurn = false; this.refresh(); return; }
      endTurnTriggers(this.bs, 'enemy');
      if (this.bs.phase === 'over') { this._enemyTurn = false; this.refresh(); return; }
      startTurn(this.bs, 'player');
      this._enemyTurn = false;
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
