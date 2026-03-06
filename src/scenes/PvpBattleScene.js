import Phaser from 'phaser';
import { getCardTextureKey, getCardAnimKey } from '../utils/cardSprite.js';
import { grantXp } from '../data/progression.js';
import { loadCollection, saveCollection, loadCustomCards, saveCustomCards } from '../data/storage.js';
import { rebuildPool, getCardById } from '../data/cardPool.js';
import { ARTIFACT_DEFS, guardianBlockingHero, hasAnyGuardian } from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 88, CARD_H = 124;
const BAR_H = 18;
const BOARD_GAP = CARD_W + 6;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const STAT_FONT = { fontFamily: 'Arial Black, Impact, sans-serif', fontStyle: 'bold' };
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
    this._helpTool = null;
    this._helpToolPanelMode = false;
    this._helpPanel = null;
    this._helpPanelMinimized = false;
    this.resultShown = false;

    this.add.image(W / 2, H / 2, 'battle_board').setDisplaySize(W, H).setDepth(0);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.32).setDepth(1)
      .setInteractive().on('pointerdown', (ptr) => {
        if (ptr.button === 2 || this.targetMode || this._positionMode) this._cancel();
      });
    this.add.rectangle(W / 2, 278, 700, 2, 0x44403a, 0.4).setDepth(5);

    this.uiGroup = this.add.group();
    this.handCards = [];
    this.arrowGfx = this.add.graphics().setDepth(50);

    this.input.on('pointerdown', (p) => this._onDown(p));
    this.input.on('pointermove', (p) => this._onMove(p));
    this.input.on('pointerup', (p) => this._onUp(p));
    this.input.keyboard.on('keydown-ESC', () => this._cancel());

    this._initHelpToggle();
    this.events.on('shutdown', () => this._destroyHelpPanel());

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
    this._destroySwordCursor();
    this._clearHelpTool();
    this.redraw();
  }

  _createSwordCursor() {
    this._destroySwordCursor();
    var gfx = this.add.graphics().setDepth(45);
    gfx.fillStyle(0x3d2800, 0.95); gfx.fillCircle(0, 0, 16);
    gfx.lineStyle(2, 0xddaa22, 1); gfx.strokeCircle(0, 0, 16);
    gfx.setVisible(false);
    var txt = this.add.text(0, 0, '\u2694', { fontSize: '20px', fontStyle: 'bold' }).setOrigin(0.5).setDepth(46).setVisible(false);
    this._swordCursor = { gfx, txt };
  }

  _destroySwordCursor() {
    if (this._swordCursor) {
      this._swordCursor.gfx.destroy();
      this._swordCursor.txt.destroy();
      this._swordCursor = null;
    }
  }

  _showHelpTool(items) {
    if (!Array.isArray(items)) items = [items];
    if (this._helpToolPanelMode) { this._updateHelpPanel(items); return; }
    this._clearHelpTool();
    const centerY = 278;
    const els = [];
    const htTweens = [];
    const masks = [];
    const iconSize = 16;
    const tipBarH = BAR_H;
    const gap = 2;

    const iconStyles = {
      sword:    { fill: 0x3d2800, stroke: 0xddaa22, label: '\u2694',     font: { fontSize: '10px', fontStyle: 'bold' } },
      zzz:      { fill: 0x222233, stroke: 0x555566, label: 'zzz',        font: { ...FONT, fontSize: '5px', color: '#888' } },
      guardian: { fill: 0x0a2a3d, stroke: 0x33ddff, label: '\u{1F6E1}',  font: { fontSize: '10px' } },
    };
    const txtStyle = { ...FONT, fontSize: '7px', color: '#ffe066', stroke: '#002222', strokeThickness: 1 };

    const vertical = items.length <= 2;
    const cols = vertical ? 1 : 2;
    const rows = vertical ? 2 : 2;
    const barW = vertical ? 370 : 185;
    const nameOff = iconSize + 4;
    const textAreaW = barW - nameOff - 4;
    const gridW = cols * barW + (cols - 1) * gap;
    const gridH = rows * tipBarH + (rows - 1) * gap;
    const gridLeft = W / 2 - gridW / 2;
    const gridTop = centerY - gridH / 2;

    const TOTAL = rows * cols;
    for (let idx = 0; idx < TOTAL; idx++) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const bx = gridLeft + col * (barW + gap) + barW / 2;
      const by = gridTop + row * (tipBarH + gap) + tipBarH / 2;
      const it = items[idx] || null;

      els.push(this.add.rectangle(bx, by, barW, tipBarH, it ? 0x05050f : 0x111118, 0.95)
        .setStrokeStyle(1, it ? 0xff0077 : 0x333344).setDepth(50));
      if (it) {
        els.push(this.add.rectangle(bx, by + tipBarH / 2, barW - 2, 1, 0x00ffee, 0.3).setDepth(51));
      }

      if (!it) continue;

      const iconX = bx - barW / 2 + iconSize / 2 + 2;
      const style = iconStyles[it.icon];
      if (style) {
        const gfx = this.add.graphics().setDepth(52);
        gfx.fillStyle(style.fill, 0.95);
        gfx.fillRoundedRect(iconX - iconSize / 2, by - iconSize / 2, iconSize, iconSize, 3);
        gfx.lineStyle(1.5, style.stroke, 1);
        gfx.strokeRoundedRect(iconX - iconSize / 2, by - iconSize / 2, iconSize, iconSize, 3);
        els.push(gfx);
        els.push(this.add.text(iconX, by, style.label, style.font).setOrigin(0.5).setDepth(53));
      }

      const textLeft = bx - barW / 2 + nameOff + 2;
      const t1 = this.add.text(textLeft, by, it.msg, txtStyle).setOrigin(0, 0.5).setDepth(52);
      els.push(t1);

      if (t1.width > textAreaW) {
        const maskGfx = this.make.graphics();
        maskGfx.fillRect(textLeft, by - tipBarH / 2, textAreaW, tipBarH);
        const geoMask = maskGfx.createGeometryMask();
        masks.push(maskGfx);
        t1.setMask(geoMask);

        const t2 = this.add.text(textLeft + t1.width + 40, by, it.msg, txtStyle)
          .setOrigin(0, 0.5).setDepth(52).setMask(geoMask);
        els.push(t2);

        const loopW = t1.width + 40;
        const tw = this.tweens.addCounter({
          from: 0, to: loopW,
          duration: Math.max(3000, it.msg.length * 150),
          ease: 'Linear', repeat: -1,
          onUpdate: (c) => {
            const off = c.getValue();
            t1.x = textLeft - off;
            t2.x = textLeft - off + loopW;
          }
        });
        htTweens.push(tw);
      }
    }

    this._helpTool = { els, tweens: htTweens, masks };
  }

  _clearHelpTool() {
    if (this._helpToolPanelMode) return;
    this._destroyHelpToolEls();
  }

  _initHelpToggle() {
    const bx = 52, by = 14;
    const bg = this.add.rectangle(bx, by, 90, 20, 0x1a1a2e, 0.85)
      .setStrokeStyle(1, 0x555566).setDepth(200).setInteractive({ useHandCursor: true });
    const txt = this.add.text(bx, by, '\u{1F4CC} TOOLTIP', {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#aaaacc'
    }).setOrigin(0.5).setDepth(201);
    this._helpToggleBg = bg;
    this._helpToggleTxt = txt;
    bg.on('pointerdown', () => {
      this._helpToolPanelMode = !this._helpToolPanelMode;
      this._clearHelpToolForce();
      if (!this._helpToolPanelMode) this._destroyHelpPanel();
      this._updateHelpToggleVisual();
    });
    this._updateHelpToggleVisual();
  }

  _updateHelpToggleVisual() {
    if (this._helpToolPanelMode) {
      this._helpToggleBg.setStrokeStyle(2, 0xddaa22);
      this._helpToggleTxt.setText('\u{1F4CC} PANEL');
      this._helpToggleTxt.setColor('#ffe066');
    } else {
      this._helpToggleBg.setStrokeStyle(1, 0x555566);
      this._helpToggleTxt.setText('\u{1F4CC} TOOLTIP');
      this._helpToggleTxt.setColor('#aaaacc');
    }
  }

  _clearHelpToolForce() {
    this._destroyHelpToolEls();
  }

  _destroyHelpToolEls() {
    if (!this._helpTool) return;
    if (this._helpTool.tweens) this._helpTool.tweens.forEach(tw => tw.stop());
    if (this._helpTool.masks) this._helpTool.masks.forEach(m => m.destroy());
    this._helpTool.els.forEach(e => e.destroy());
    this._helpTool = null;
  }

  _createHelpPanel() {
    if (this._helpPanel) return;
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();

    const panel = document.createElement('div');
    panel.id = 'help-panel';
    Object.assign(panel.style, {
      position: 'absolute',
      left: (rect.left + rect.width - 290) + 'px',
      top: (rect.top + 40) + 'px',
      width: '280px',
      minWidth: '160px',
      minHeight: '32px',
      resize: 'both',
      overflow: 'hidden',
      background: 'rgba(26,26,46,0.95)',
      border: '2px solid #ddaa22',
      borderRadius: '6px',
      fontFamily: '"Press Start 2P", monospace, Arial',
      zIndex: '1000',
      color: '#ffe066',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
    });

    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 8px',
      background: 'rgba(30,30,50,0.98)',
      cursor: 'grab',
      borderBottom: '1px solid #ddaa22',
      flexShrink: '0',
    });
    const titleTxt = document.createElement('span');
    titleTxt.textContent = 'KEYWORDS';
    titleTxt.style.fontSize = '8px';
    titleTxt.style.letterSpacing = '1px';
    const minBtn = document.createElement('span');
    minBtn.textContent = '\u2015';
    Object.assign(minBtn.style, {
      cursor: 'pointer', fontSize: '10px', color: '#ffe066',
      marginLeft: '8px', lineHeight: '1',
    });
    titleBar.appendChild(titleTxt);
    titleBar.appendChild(minBtn);
    panel.appendChild(titleBar);

    const body = document.createElement('div');
    body.className = 'hp-body';
    Object.assign(body.style, {
      padding: '4px 0',
      overflow: 'auto',
      flex: '1',
    });
    panel.appendChild(body);
    document.body.appendChild(panel);

    let dragging = false, dx = 0, dy = 0;
    const onMouseDown = (e) => {
      dragging = true;
      dx = e.clientX - panel.offsetLeft;
      dy = e.clientY - panel.offsetTop;
      titleBar.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!dragging) return;
      panel.style.left = (e.clientX - dx) + 'px';
      panel.style.top = (e.clientY - dy) + 'px';
    };
    const onMouseUp = () => {
      dragging = false;
      titleBar.style.cursor = 'grab';
    };
    titleBar.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    minBtn.addEventListener('click', () => {
      this._helpPanelMinimized = !this._helpPanelMinimized;
      body.style.display = this._helpPanelMinimized ? 'none' : 'block';
      panel.style.resize = this._helpPanelMinimized ? 'none' : 'both';
      minBtn.textContent = this._helpPanelMinimized ? '\u25A1' : '\u2015';
    });

    this._helpPanel = { el: panel, body, onMouseMove, onMouseUp };
  }

  _updateHelpPanel(items) {
    if (!this._helpPanel) this._createHelpPanel();
    const body = this._helpPanel.body;
    body.innerHTML = '';

    const iconDefs = {
      sword:    { bg: '#3d2800', border: '#ddaa22', label: '\u2694' },
      zzz:      { bg: '#222233', border: '#555566', label: 'zzz' },
      guardian: { bg: '#0a2a3d', border: '#33ddff', label: '\u{1F6E1}' },
    };

    items.forEach(it => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '3px 8px',
      });

      const iconBox = document.createElement('div');
      const def = iconDefs[it.icon];
      Object.assign(iconBox.style, {
        width: '1.8em', height: '1.8em', flexShrink: '0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: def ? def.bg : '#222',
        border: '2px solid ' + (def ? def.border : '#555'),
        borderRadius: '4px',
        fontSize: '1em',
      });
      iconBox.textContent = def ? def.label : '';

      const text = document.createElement('span');
      text.textContent = it.msg;
      Object.assign(text.style, {
        fontSize: '0.65em',
        color: '#ffe066',
        lineHeight: '1.4',
      });

      row.appendChild(iconBox);
      row.appendChild(text);
      body.appendChild(row);
    });
  }

  _destroyHelpPanel() {
    if (!this._helpPanel) return;
    document.removeEventListener('mousemove', this._helpPanel.onMouseMove);
    document.removeEventListener('mouseup', this._helpPanel.onMouseUp);
    this._helpPanel.el.remove();
    this._helpPanel = null;
    this._helpPanelMinimized = false;
  }

  _updateSwordCursor(x, y) {
    if (!this._swordCursor) return;
    this._swordCursor.gfx.setPosition(x, y).setVisible(true);
    this._swordCursor.txt.setPosition(x, y).setVisible(true);
  }

  redraw() {
    this._clearHelpTool();
    this._hideDmgPreview();
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
      if (this.targetMode && this.selecting?.type === 'attack') this._createSwordCursor();
    }

    if (s.phase === 'over') this.showResult();
  }

  _drawBoardFrames(y) {
    for (let s = 0; s < SLOT_COUNT; s++) {
      const fx = SLOT_X(s);
      this._ui(this.add.rectangle(fx, y, CARD_W, CARD_H, 0x000000, 0.12)
        .setStrokeStyle(1, 0x444455).setDepth(8));
    }
  }

  _occupiedSlots() {
    return new Set((this.state?.you?.board || []).map(m => m.slot));
  }

  /* ═══════ HERO ═══════ */
  _heroPanel(x, y, side, label, isEnemy) {
    const pw = 240, ph = 54;
    const fill = isEnemy ? 0x3a0a0a : 0x0a0a3a;
    const stroke = isEnemy ? 0x882233 : 0x223388;
    const bg = this._ui(this.add.rectangle(x, y, pw, ph, fill, 0.85).setStrokeStyle(2, stroke).setDepth(10));

    this._ui(this.add.text(x, y - 15, label, {
      ...FONT, fontSize: '10px', color: isEnemy ? '#ff6666' : '#66aaff'
    }).setOrigin(0.5).setDepth(11));

    const pct = Math.max(0, side.hp / side.maxHp);
    const hpc = pct < 0.33 ? '#ff3333' : pct < 0.66 ? '#ffaa33' : '#44ff44';
    this._ui(this.add.text(x - 40, y + 8, `${side.hp}`, {
      ...FONT, fontSize: '12px', color: hpc
    }).setOrigin(0.5).setDepth(11));
    this._ui(this.add.text(x + 4, y + 10, `/${side.maxHp}`, {
      ...FONT, fontSize: '6px', color: '#777'
    }).setOrigin(0, 0.5).setDepth(11));
    this._ui(this.add.text(x + 82, y + 8, `Deck ${side.deckCount}`, {
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
        hasAnyGuardian(oppBoard);
      if (!blocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this._onTarget({ type: 'hero' }));
        bg.on('pointerover', () => { bg.setStrokeStyle(3, 0xff4444); if (this.selecting?.type === 'attack') this._showDmgPreview(null, x, y, true); });
        bg.on('pointerout', () => { bg.setStrokeStyle(2, stroke); this._hideDmgPreview(); });
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
      const card = getCardById(m.id);
      const texKey = m.sprite ? (() => {
        const k = 'sprite_' + m.sprite.replace('.png', '');
        return this.textures.exists(k) ? k : null;
      })() : null;
      const isGuardian = m.keywords && m.keywords.includes('guardian');
      const bc = isGuardian ? 0x33ddff : (isPlayer ? 0x337744 : 0x774433);


      const fr = this._ui(this.add.rectangle(x, y, CARD_W, CARD_H, 0x0d0d1a, 0.9).setStrokeStyle(isGuardian ? 3 : 2, bc).setDepth(10));
      const animKey = card ? getCardAnimKey(this, card) : null;
      if (animKey) {
        const spr = this.add.sprite(x, y, animKey).setDisplaySize(CARD_W, CARD_H).setDepth(10.5);
        spr.play(animKey);
        this._ui(spr);
      } else if (texKey) {
        this._ui(this.add.image(x, y, texKey).setDisplaySize(CARD_W, CARD_H).setDepth(10.5));
      }

      const boardFullH = CARD_H + BAR_H * 2;
      const s = this.state;
      const readyToAct = isPlayer && m.canAttack && s.phase === 'playing' && s.yourTurn;
      const outlineCol = readyToAct ? 0xaa44ff : 0x555566;
      const idleOutline = this._makeGlow(x, y, CARD_W, boardFullH, outlineCol);
      idleOutline.setDepth(9.5);
      this._ui(idleOutline);

      const barY = y - CARD_H / 2 - BAR_H / 2;
      this._ui(this.add.rectangle(x, barY, CARD_W, BAR_H, 0x05050f, 0.95)
        .setStrokeStyle(1, 0xff0077).setDepth(10));
      this._ui(this.add.rectangle(x, barY + BAR_H / 2, CARD_W - 2, 1, 0x00ffee, 0.3)
        .setDepth(11));
      const nameOff = 18;
      const nst = { ...FONT, fontSize: '7px', color: '#00ffee', stroke: '#002222', strokeThickness: 1 };
      const nameText = this._ui(this.add.text(x + nameOff / 2, barY, m.name, nst).setOrigin(0.5).setDepth(12));
      if (nameText.width > CARD_W - nameOff - 6) {
        const maskGfx = this.make.graphics();
        maskGfx.fillRect(x - CARD_W / 2 + nameOff, barY - BAR_H / 2, CARD_W - nameOff - 1, BAR_H);
        const geoMask = maskGfx.createGeometryMask();
        this._nameMasks.push(maskGfx);
        nameText.setOrigin(0, 0.5).setMask(geoMask);
        const gap = 40;
        const sX1 = x - CARD_W / 2 + nameOff + 2;
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

      const manaX = x - CARD_W / 2 + 9, manaY = barY;
      this._ui(this.add.circle(manaX, manaY, 8, 0x1a3399).setStrokeStyle(1, 0x4488ff).setDepth(14));
      this._ui(this.add.text(manaX, manaY, `${m.cost}`, { ...FONT, fontSize: '8px', color: '#fff' }).setOrigin(0.5).setDepth(15));
      const atkBarY = y - CARD_H / 2 + BAR_H / 2;
      this._ui(this.add.rectangle(x, atkBarY, CARD_W, BAR_H, 0x3d2800, 0.95).setStrokeStyle(1, 0xddaa22).setDepth(12));
      this._ui(this.add.text(x - CARD_W / 2 + 10, atkBarY, '\u2694', { fontSize: '12px' }).setOrigin(0.5).setDepth(13));
      this._ui(this.add.text(x + CARD_W / 2 - 10, atkBarY, '\u2694', { fontSize: '12px' }).setOrigin(0.5).setDepth(13));
      this._ui(this.add.text(x, atkBarY, '' + m.atk, { ...STAT_FONT, fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(13));

      const hpBarBY = y + CARD_H / 2 + BAR_H / 2;
      this._ui(this.add.rectangle(x, hpBarBY, CARD_W, BAR_H, 0x0a0a0a, 0.95).setStrokeStyle(1, 0x224422).setDepth(10));
      const hpPct = Math.max(0, m.hp / m.maxHp);
      const fillW = (CARD_W - 4) * hpPct;
      const hpCol = hpPct > 0.5 ? 0x33cc44 : hpPct > 0.25 ? 0xccaa33 : 0xcc3333;
      if (fillW > 0) this._ui(this.add.rectangle(x - (CARD_W - 4) / 2 + fillW / 2, hpBarBY, fillW, BAR_H - 4, hpCol, 0.9).setDepth(11));
      this._ui(this.add.text(x, hpBarBY, m.hp + ' / ' + m.maxHp, { ...STAT_FONT, fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12));

      /* ── keyword bar (4 slots above HP bar) ── */
      const kwBarY = hpBarBY - BAR_H;
      const slotW = CARD_W / 4;
      for (let si = 0; si < 4; si++) {
        const sx = x - CARD_W / 2 + slotW * si + slotW / 2;
        this._ui(this.add.rectangle(sx, kwBarY, slotW, BAR_H, 0x111118, 0.9)
          .setStrokeStyle(0.5, 0x333344).setDepth(12));
      }
      const s0x = x - CARD_W / 2 + slotW / 2;
      if (readyToAct) {
        this._ui(this.add.rectangle(s0x, kwBarY, slotW, BAR_H, 0x3d2800, 0.95)
          .setStrokeStyle(1, 0xddaa22).setDepth(13));
        this._ui(this.add.text(s0x, kwBarY, '\u2694', { fontSize: '11px', fontStyle: 'bold' })
          .setOrigin(0.5).setDepth(14));
      } else if (!m.canAttack && isPlayer) {
        this._ui(this.add.rectangle(s0x, kwBarY, slotW, BAR_H, 0x222233, 0.95)
          .setStrokeStyle(1, 0x555566).setDepth(13));
        this._ui(this.add.text(s0x, kwBarY, 'zzz', { ...FONT, fontSize: '6px', color: '#888' })
          .setOrigin(0.5).setDepth(14));
      }
      if (isGuardian) {
        const s3x = x - CARD_W / 2 + slotW * 3 + slotW / 2;
        this._ui(this.add.rectangle(s3x, kwBarY, slotW, BAR_H, 0x0a2a3d, 0.95)
          .setStrokeStyle(1, 0x33ddff).setDepth(13));
        this._ui(this.add.text(s3x, kwBarY, '\u{1F6E1}', { fontSize: '11px' })
          .setOrigin(0.5).setDepth(14));
      }

      let boardGlow = null;
      const showBoardGlow = (color) => {
        if (boardGlow) { boardGlow.destroy(); boardGlow = null; }
        boardGlow = this._makeGlow(x, y, CARD_W, boardFullH, color);
        boardGlow.setDepth(9.5);
        this._ui(boardGlow);
      };
      const hideBoardGlow = () => {
        if (boardGlow) { boardGlow.destroy(); boardGlow = null; }
      };

      fr.setInteractive({ useHandCursor: true });
      if (isPlayer && m.canAttack && !this.targetMode && s.phase === 'playing' && s.yourTurn) {
        fr.on('pointerdown', () => {
          this._clearHelpTool();
          this.selecting = { type: 'attack', uid: m.uid, slot: m.slot };
          this._selOrigin = { x, y };
          this.targetMode = true;
          this.redraw();
        });
        fr.on('pointerover', () => {
          showBoardGlow(0x44ff44);
          if (!this.targetMode) {
            const tips = [{ msg: 'Unit can attack', icon: 'sword' }];
            if (isGuardian) tips.push({ msg: 'Units with Guardian block all incoming attacks', icon: 'guardian' });
            this._showHelpTool(tips);
          }
          if (this.targetMode && this.selecting?.type === 'attack' && this.selecting.uid !== m.uid) {
            this.selecting = { type: 'attack', uid: m.uid, slot: m.slot };
            this._selOrigin = { x, y };
            this._hideDmgPreview();
            this.arrowGfx.clear();
          }
        });
        fr.on('pointerout', () => {
          hideBoardGlow();
          this._clearHelpTool();
        });
      } else if (!m.canAttack && isPlayer && !this.targetMode) {
        fr.on('pointerover', () => {
          const tips = [];
          const msg = m.attackedThisTurn
            ? 'Unit has already attacked this turn'
            : 'Unit cannot attack on the same turn it is played';
          tips.push({ msg, icon: 'zzz' });
          if (isGuardian) tips.push({ msg: 'Units with Guardian block all incoming attacks', icon: 'guardian' });
          this._showHelpTool(tips);
        });
        fr.on('pointerout', () => this._clearHelpTool());
      } else if (!isPlayer && !this.targetMode && isGuardian) {
        fr.on('pointerover', () => this._showHelpTool([{ msg: 'Units with Guardian block all incoming attacks', icon: 'guardian' }]));
        fr.on('pointerout', () => this._clearHelpTool());
      }
      if (this.targetMode && !isPlayer) {
        const oppBoard = this.state?.opponent?.board || [];
        const guardiansExist = hasAnyGuardian(oppBoard);
        const canTarget = !guardiansExist || isGuardian;
        if (canTarget) {
          fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
          fr.on('pointerover', () => { showBoardGlow(0xff4444); if (this.selecting?.type === 'attack') this._showDmgPreview(m, x, y, false); });
          fr.on('pointerout', () => { hideBoardGlow(); this._hideDmgPreview(); });
        }
      }
      if (this.targetMode && isPlayer && this.selecting?.needsFriendly) {
        fr.on('pointerdown', () => this._onTarget({ type: 'minion', uid: m.uid }));
        fr.on('pointerover', () => showBoardGlow(0x4499ff));
        fr.on('pointerout', () => hideBoardGlow());
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

      const handAnimKey = getCardAnimKey(this, card);
      if (handAnimKey) {
        const spr = this.add.sprite(0, 0, handAnimKey).setDisplaySize(CARD_W, CARD_H);
        spr.play(handAnimKey);
        ct.add(spr);
      } else {
        const artKey = getCardTextureKey(this, card);
        if (artKey) ct.add(this.add.image(0, 0, artKey).setDisplaySize(CARD_W, CARD_H));
      }


      ct.add(this.add.rectangle(0, -CARD_H / 2 - BAR_H / 2, CARD_W, BAR_H, 0x05050f, 0.95)
        .setStrokeStyle(1, 0xff0077));
      ct.add(this.add.rectangle(0, -CARD_H / 2, CARD_W - 2, 1, 0x00ffee, 0.3));
      const barCY = -CARD_H / 2 - BAR_H / 2;
      const handNameOff = 18;
      const nStyle = { ...FONT, fontSize: '6px', color: '#00ffee', stroke: '#002222', strokeThickness: 1 };
      const nt1 = this.add.text(handNameOff / 2, barCY, card.name, nStyle).setOrigin(0.5);
      ct.add(nt1);
      ct.add(this.add.circle(-CARD_W / 2 + 9, barCY, 8, 0x1a3399).setStrokeStyle(1, 0x4488ff));
      ct.add(this.add.text(-CARD_W / 2 + 9, barCY, `${card.cost}`, {
        ...FONT, fontSize: '8px', color: '#fff'
      }).setOrigin(0.5));
      let hoverTween = null, nt2 = null;
      const needsScroll = nt1.width > CARD_W - handNameOff - 6;
      if (needsScroll) {
        nt1.setText(card.name.length > 10 ? card.name.slice(0, 9) + '..' : card.name);
      }

      if (card.type === 'minion') {
        const handAtkY = -CARD_H / 2 + BAR_H / 2;
        ct.add(this.add.rectangle(0, handAtkY, CARD_W, BAR_H, 0x3d2800, 0.95)
          .setStrokeStyle(1, 0xddaa22));
        ct.add(this.add.text(-CARD_W / 2 + 10, handAtkY, '\u2694', { fontSize: '12px' }).setOrigin(0.5));
        ct.add(this.add.text(CARD_W / 2 - 10, handAtkY, '\u2694', { fontSize: '12px' }).setOrigin(0.5));
        ct.add(this.add.text(0, handAtkY, '' + card.atk, {
          ...STAT_FONT, fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5));

        ct.add(this.add.rectangle(0, CARD_H / 2 + BAR_H / 2, CARD_W, BAR_H, 0x0a0a0a, 0.95)
          .setStrokeStyle(1, 0x224422));
        const handFillW = CARD_W - 4;
        ct.add(this.add.rectangle(0, CARD_H / 2 + BAR_H / 2, handFillW, BAR_H - 4, 0x33cc44, 0.9));
        ct.add(this.add.text(0, CARD_H / 2 + BAR_H / 2, card.hp + ' / ' + card.hp, {
          ...STAT_FONT, fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 3
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

      const fullH = CARD_H + BAR_H * 2;
      const idleGfx = this._makeGlow(0, 0, CARD_W, fullH, 0x8899aa);
      ct.add(idleGfx);
      const hoverGfx = this._makeGlow(0, 0, CARD_W, fullH, 0xaa44ff);
      hoverGfx.setVisible(false);
      ct.add(hoverGfx);

      this._handSlots.push({ ct, cx, cy, ang, ok, card, idx: i, needsScroll, nt1, nt2, hoverTween, barCY, nStyle, hoverGfx, idleGfx });
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
    if (s.idleGfx) s.idleGfx.setVisible(false);
    if (s.hoverGfx) s.hoverGfx.setVisible(true);
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
    if (s.hoverGfx) s.hoverGfx.setVisible(false);
    if (s.idleGfx) s.idleGfx.setVisible(true);
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

  _makeGlow(cx, cy, w, h, color) {
    const gfx = this.add.graphics();
    const lighter = Phaser.Display.Color.IntegerToColor(color);
    lighter.lighten(30);
    const innerCol = lighter.color;
    gfx.lineStyle(4, color, 1);
    gfx.strokeRoundedRect(cx - w / 2 - 2, cy - h / 2 - 2, w + 4, h + 4, 4);
    gfx.lineStyle(2, innerCol, 0.8);
    gfx.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 3);
    return gfx;
  }

  _enemyHandBacks(count) {
    const sp = Math.min(28, 220 / Math.max(count, 1));
    const sx = W / 2 - (count - 1) * sp / 2;
    for (let i = 0; i < count; i++)
      this._ui(this.add.rectangle(sx + i * sp, 14, 22, 30, 0x2a1a0a, 0.85)
        .setStrokeStyle(1, 0x553322).setDepth(10));
  }

  _mana(p) {
    const bx = 916, by = 620, gap = 18;
    const n = p.maxMana, sx = bx - (n - 1) * gap / 2;
    this._ui(this.add.text(bx, by - 18, 'MANA', {
      ...FONT, fontSize: '6px', color: '#3366aa'
    }).setOrigin(0.5).setDepth(15));
    for (let i = 0; i < n; i++) {
      const filled = i < p.mana;
      this._ui(this.add.circle(sx + i * gap, by, 8, filled ? 0x1a3399 : 0x0a0a1a, filled ? 1 : 0.4)
        .setStrokeStyle(1, filled ? 0x4488ff : 0x2a2a44).setDepth(15));
    }
    this._ui(this.add.text(bx, by + 16, `${p.mana}/${p.maxMana}`, {
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

  /* ═══════ DAMAGE PREVIEW ON HOVER ═══════ */
  _drawArrow(gfx, x1, y1, x2, y2, color, width) {
    gfx.lineStyle(width, color, 0.85);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();
    var ang = Math.atan2(y2 - y1, x2 - x1), hs = 10;
    gfx.fillStyle(color, 0.95);
    gfx.beginPath(); gfx.moveTo(x2, y2);
    gfx.lineTo(x2 - hs * Math.cos(ang - 0.4), y2 - hs * Math.sin(ang - 0.4));
    gfx.lineTo(x2 - hs * Math.cos(ang + 0.4), y2 - hs * Math.sin(ang + 0.4));
    gfx.closePath(); gfx.fillPath();
  }

  _showDmgPreview(targetM, tx, ty, isHero) {
    this._hideDmgPreview();
    const youBoard = this.state?.you?.board || [];
    const attacker = youBoard.find(m => m.uid === this.selecting?.uid);
    if (!attacker) return;
    const els = [];
    const D = 50;
    const ax = SLOT_X(attacker.slot), ay = BOARD_Y.player;

    if (isHero) {
      const heroSide = this.state.opponent;
      const newHp = heroSide.hp - attacker.atk;
      const pw = 240, ph = 54, hpBarY = ty + 23, hpBarW = pw - 16;

      els.push(this.add.rectangle(tx, ty, pw, ph, 0x3a0a0a, 1).setDepth(D - 1));

      const previewPct = Math.max(0, newHp / heroSide.maxHp);
      const previewFw = (hpBarW - 4) * previewPct;
      const previewCol = newHp <= 0 ? 0x880000 : previewPct > 0.25 ? 0xccaa33 : 0xcc3333;
      els.push(this.add.rectangle(tx, hpBarY, hpBarW, 4, 0x222222).setDepth(D));
      if (previewFw > 0) els.push(this.add.rectangle(tx - hpBarW / 2 * (1 - previewPct), hpBarY, previewFw, 4, previewCol, 0.9).setDepth(D + 1));

      els.push(this.add.text(tx, ty - 15, 'OPPONENT', {
        ...FONT, fontSize: '10px', color: '#ff6666'
      }).setOrigin(0.5).setDepth(D));

      const displayHp = newHp <= 0 ? 0 : newHp;
      const hpc = previewPct < 0.33 ? '#ff3333' : previewPct < 0.66 ? '#ffaa33' : '#ff8888';
      els.push(this.add.text(tx - 40, ty + 8, `${displayHp}`, {
        ...FONT, fontSize: '12px', color: hpc
      }).setOrigin(0.5).setDepth(D));
      els.push(this.add.text(tx + 4, ty + 10, `/${heroSide.maxHp}`, {
        ...FONT, fontSize: '6px', color: '#777'
      }).setOrigin(0, 0.5).setDepth(D));
      els.push(this.add.text(tx + 82, ty + 8, `Deck ${heroSide.deck.length}`, {
        ...FONT, fontSize: '7px', color: '#999'
      }).setOrigin(0.5).setDepth(D));

      const swordBW = 66, swordBH = 26;
      const swordY = ty + ph / 2 + swordBH / 2 + 3;
      els.push(this.add.rectangle(tx, swordY, swordBW, swordBH, 0x3d2800, 0.95).setStrokeStyle(2, 0xddaa22).setDepth(D + 3));
      els.push(this.add.text(tx, swordY, '\u2694 -' + attacker.atk, {
        ...STAT_FONT, fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 4));

      if (newHp <= 0) {
        els.push(this.add.rectangle(tx, ty, 60, 24, 0x444444, 0.92).setStrokeStyle(2, 0x888888).setDepth(D + 3));
        els.push(this.add.text(tx, ty, '\uD83D\uDC80 LETHAL', {
          ...STAT_FONT, fontSize: '10px', color: '#ff0000', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(D + 4));
      }
    } else {
      const newDefHp = targetM.hp - attacker.atk;
      const newAtkHp = attacker.hp - targetM.atk;
      const theirHpBarY = ty + CARD_H / 2 + BAR_H / 2;
      const myHpBarY = ay + CARD_H / 2 + BAR_H / 2;

      els.push(this.add.rectangle(tx, ty, CARD_W, CARD_H, 0xff0000, 0.15).setDepth(D - 1));
      els.push(this.add.rectangle(ax, ay, CARD_W, CARD_H, 0xff6600, 0.12).setDepth(D - 1));

      var swordBW = 52, swordBH = 22;
      var tSwordY = theirHpBarY - BAR_H / 2 - swordBH / 2 - 1;
      els.push(this.add.rectangle(tx, tSwordY, swordBW, swordBH, 0x3d2800, 0.95).setStrokeStyle(2, 0xddaa22).setDepth(D + 3));
      els.push(this.add.text(tx, tSwordY, '\u2694 -' + attacker.atk, {
        ...STAT_FONT, fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 4));

      var aSwordY = myHpBarY - BAR_H / 2 - swordBH / 2 - 1;
      els.push(this.add.rectangle(ax, aSwordY, swordBW, swordBH, 0x3d2800, 0.95).setStrokeStyle(2, 0xddaa22).setDepth(D + 3));
      els.push(this.add.text(ax, aSwordY, '\u2694 -' + targetM.atk, {
        ...STAT_FONT, fontSize: '11px', color: '#ffe066', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 4));

      els.push(this.add.rectangle(tx, theirHpBarY, CARD_W, BAR_H, 0x0a0a0a, 0.95).setStrokeStyle(1, 0x662222).setDepth(D));
      var dpct = Math.max(0, newDefHp / targetM.maxHp), dfw = (CARD_W - 4) * dpct;
      var dcol = newDefHp <= 0 ? 0x880000 : dpct > 0.25 ? 0xccaa33 : 0xcc3333;
      if (dfw > 0) els.push(this.add.rectangle(tx - (CARD_W - 4) / 2 + dfw / 2, theirHpBarY, dfw, BAR_H - 4, dcol, 0.9).setDepth(D + 1));
      els.push(this.add.text(tx, theirHpBarY, (newDefHp <= 0 ? 0 : newDefHp) + ' / ' + targetM.maxHp, {
        ...STAT_FONT, fontSize: '10px', color: '#ff8888', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 2));
      if (newDefHp <= 0) {
        els.push(this.add.rectangle(tx, ty, 60, 24, 0x444444, 0.92).setStrokeStyle(2, 0x888888).setDepth(D + 3));
        els.push(this.add.text(tx, ty, '\uD83D\uDC80 DEAD', {
          ...STAT_FONT, fontSize: '10px', color: '#ff0000', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(D + 4));
      }

      els.push(this.add.rectangle(ax, myHpBarY, CARD_W, BAR_H, 0x0a0a0a, 0.95).setStrokeStyle(1, 0x662222).setDepth(D));
      var apct = Math.max(0, newAtkHp / attacker.maxHp), afw = (CARD_W - 4) * apct;
      var acol = newAtkHp <= 0 ? 0x880000 : apct > 0.25 ? 0xccaa33 : 0xcc3333;
      if (afw > 0) els.push(this.add.rectangle(ax - (CARD_W - 4) / 2 + afw / 2, myHpBarY, afw, BAR_H - 4, acol, 0.9).setDepth(D + 1));
      els.push(this.add.text(ax, myHpBarY, (newAtkHp <= 0 ? 0 : newAtkHp) + ' / ' + attacker.maxHp, {
        ...STAT_FONT, fontSize: '10px', color: '#ff8888', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(D + 2));
      if (newAtkHp <= 0) {
        els.push(this.add.rectangle(ax, ay, 60, 24, 0x444444, 0.92).setStrokeStyle(2, 0x888888).setDepth(D + 3));
        els.push(this.add.text(ax, ay, '\uD83D\uDC80 DEAD', {
          ...STAT_FONT, fontSize: '10px', color: '#ff0000', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(D + 4));
      }
    }
    this._dmgPreviewEls = els;
  }

  _hideDmgPreview() {
    if (this._dmgPreviewEls) {
      this._dmgPreviewEls.forEach(e => e.destroy());
      this._dmgPreviewEls = null;
    }
  }

  /* ═══════ INPUT: POINTER DOWN (scene-level for hand cards) ═══════ */
  _onDown(ptr) {
    if (ptr.button === 2) { this._cancel(); return; }
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
      this._updateSwordCursor(ptr.x, ptr.y);
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
    this._destroySwordCursor();
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
