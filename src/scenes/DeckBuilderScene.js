import Phaser from 'phaser';
import { loadCollection, saveCollection, loadDeck, saveDeck, loadCustomCards, loadDeckSlots, saveDeckSlots } from '../data/storage.js';
import { getCardById, getAllCards, getBaseCards, getStarterCollection, getStarterCollection2, getStarterDeck, getStarterDeck2 } from '../data/cardPool.js';
import { getCardTextureKey } from '../utils/cardSprite.js';

const W = 1024, H = 768;
const SIDEBAR_W = 140;
const COLS = 5;
const CARD_W = 120, CARD_H = 90, GAP = 6;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial', fontSize: '10px' };

export default class DeckBuilderScene extends Phaser.Scene {
  constructor() { super('DeckBuilder'); }

  create() {
    this.collectionIds = loadCollection() || [];
    this.syncCollection();
    this.deckIds = loadDeck() || [];
    this.baseIds = new Set(getBaseCards().map(c => c.id));
    this.customIds = new Set(loadCustomCards().map(c => c.id));
    this.scrollOffset = 0;
    this.slotsOpen = false;
    this.selectedBaseDeck = 1;
    this.uiGroup = this.add.group();
    this.redraw();
  }

  syncCollection() {
    const deck1Ids = getStarterCollection();
    const deck2Ids = getStarterCollection2();
    const colSet = new Set(this.collectionIds);
    let changed = false;
    for (const id of [...deck1Ids, ...deck2Ids]) {
      if (!colSet.has(id)) {
        this.collectionIds.push(id);
        colSet.add(id);
        changed = true;
      }
    }
    if (changed) saveCollection(this.collectionIds);
  }

  drawSidebar() {
    const cx = SIDEBAR_W / 2;
    this.uiGroup.add(this.add.rectangle(cx, H / 2, SIDEBAR_W, H, 0x0d0d18));
    this.uiGroup.add(this.add.rectangle(cx, H / 2, SIDEBAR_W, H, 0x000000, 0).setStrokeStyle(1, 0x223344));

    this.uiGroup.add(this.add.text(cx, 28, 'BASE DECK', {
      ...FONT, fontSize: '8px', color: '#e6b422'
    }).setOrigin(0.5));

    const deck1Selected = this.selectedBaseDeck === 1;
    const deck1Bg = this.add.rectangle(cx, 70, SIDEBAR_W - 20, 36, deck1Selected ? 0x2a3344 : 0x1a1a2a)
      .setInteractive({ useHandCursor: true });
    deck1Bg.setStrokeStyle(2, deck1Selected ? 0x66aaff : 0x333344);
    this.uiGroup.add(deck1Bg);
    this.uiGroup.add(this.add.text(cx, 70, 'DECK 1', {
      ...FONT, fontSize: '8px', color: deck1Selected ? '#fff' : '#888'
    }).setOrigin(0.5));
    deck1Bg.on('pointerover', () => { if (!deck1Selected) deck1Bg.setStrokeStyle(2, 0x556688); });
    deck1Bg.on('pointerout', () => { if (!deck1Selected) deck1Bg.setStrokeStyle(2, 0x333344); });
    deck1Bg.on('pointerdown', () => {
      this.selectedBaseDeck = 1;
      this.scrollOffset = 0;
      this.redraw();
    });

    const deck2Selected = this.selectedBaseDeck === 2;
    const deck2Bg = this.add.rectangle(cx, 115, SIDEBAR_W - 20, 36, deck2Selected ? 0x2a3344 : 0x1a1a2a)
      .setInteractive({ useHandCursor: true });
    deck2Bg.setStrokeStyle(2, deck2Selected ? 0x66aaff : 0x333344);
    this.uiGroup.add(deck2Bg);
    this.uiGroup.add(this.add.text(cx, 115, 'DECK 2', {
      ...FONT, fontSize: '8px', color: deck2Selected ? '#fff' : '#888'
    }).setOrigin(0.5));
    deck2Bg.on('pointerover', () => { if (!deck2Selected) deck2Bg.setStrokeStyle(2, 0x556688); });
    deck2Bg.on('pointerout', () => { if (!deck2Selected) deck2Bg.setStrokeStyle(2, 0x333344); });
    deck2Bg.on('pointerdown', () => {
      this.selectedBaseDeck = 2;
      this.scrollOffset = 0;
      this.redraw();
    });

    const loadBg = this.add.rectangle(cx, 165, SIDEBAR_W - 20, 30, 0x224422)
      .setInteractive({ useHandCursor: true });
    loadBg.setStrokeStyle(1, 0x44aa44);
    this.uiGroup.add(loadBg);
    this.uiGroup.add(this.add.text(cx, 165, 'LOAD DECK', {
      ...FONT, fontSize: '6px', color: '#88ff88'
    }).setOrigin(0.5));
    loadBg.on('pointerover', () => loadBg.setFillStyle(0x336633));
    loadBg.on('pointerout', () => loadBg.setFillStyle(0x224422));
    loadBg.on('pointerdown', () => {
      this.deckIds = this.selectedBaseDeck === 1 ? [...getStarterDeck()] : [...getStarterDeck2()];
      this.redraw();
    });
  }

  redraw() {
    this.uiGroup.clear(true, true);

    this.drawSidebar();

    const mainX = SIDEBAR_W;
    const contentCenterX = mainX + (870 - mainX) / 2;

    this.uiGroup.add(this.add.text(contentCenterX, 18, 'DECK BUILDER', {
      ...FONT, fontSize: '20px', color: '#e6b422'
    }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(contentCenterX, 42, 'Click to add to deck', { ...FONT, fontSize: '8px', color: '#888' }).setOrigin(0.5));

    const allowedSet = new Set(this.selectedBaseDeck === 1 ? getStarterCollection() : getStarterCollection2());
    const uniqueIds = [...new Set(this.collectionIds)].filter(id => allowedSet.has(id));

    const visibleRows = 7;
    const visible = uniqueIds.slice(this.scrollOffset, this.scrollOffset + visibleRows * COLS);

    visible.forEach((id, i) => {
      const card = getCardById(id);
      if (!card) return;
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = mainX + 16 + col * (CARD_W + GAP) + CARD_W / 2;
      const y = 60 + row * (CARD_H + GAP) + CARD_H / 2;

      const inDeckCount = this.deckIds.filter(d => d === id).length;

      const bg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, 0x445566);
      this.uiGroup.add(bg);

      const key = getCardTextureKey(this, card);
      if (key) {
        const img = this.add.image(x - 24, y, key).setDisplaySize(40, 50);
        this.uiGroup.add(img);
      }

      const tx = key ? x + 16 : x;
      this.uiGroup.add(this.add.text(tx, y - 16, card.name.slice(0, 11), {
        ...FONT, fontSize: '7px', color: '#fff'
      }).setOrigin(0.5));

      const costTxt = `[${card.cost}]`;
      const statTxt = card.type === 'minion' ? `${card.atk}/${card.hp}` : 'spell';
      this.uiGroup.add(this.add.text(tx, y + 4, `${costTxt} ${statTxt}`, {
        ...FONT, fontSize: '7px', color: '#aaa'
      }).setOrigin(0.5));

      const isBase = this.baseIds.has(id);
      const isCustom = this.customIds.has(id);
      const hasOverride = isBase && isCustom;
      let tag, tagColor;
      if (hasOverride) { tag = 'MOD'; tagColor = '#ffcc44'; }
      else if (isCustom) { tag = 'CUSTOM'; tagColor = '#88ff88'; }
      else { tag = 'BASE'; tagColor = '#667788'; }

      this.uiGroup.add(this.add.text(tx, y + 18, `in deck: ${inDeckCount}`, {
        ...FONT, fontSize: '6px', color: inDeckCount > 0 ? '#66aaff' : '#555'
      }).setOrigin(0.5));
      this.uiGroup.add(this.add.text(tx, y + 30, tag, {
        ...FONT, fontSize: '6px', color: tagColor
      }).setOrigin(0.5));

      bg.on('pointerdown', () => {
        this.deckIds.push(id);
        this.redraw();
      });
    });

    if (this.scrollOffset > 0) {
      const up = this.add.text(contentCenterX, 56, '[ SCROLL UP ]', {
        ...FONT, fontSize: '8px', color: '#66aaff'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      up.on('pointerdown', () => { this.scrollOffset = Math.max(0, this.scrollOffset - COLS); this.redraw(); });
      this.uiGroup.add(up);
    }
    if (this.scrollOffset + visibleRows * COLS < uniqueIds.length) {
      const dn = this.add.text(contentCenterX, H - 70, '[ SCROLL DOWN ]', {
        ...FONT, fontSize: '8px', color: '#66aaff'
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      dn.on('pointerdown', () => { this.scrollOffset += COLS; this.redraw(); });
      this.uiGroup.add(dn);
    }

    this.drawDeckPanel();
    this.drawBottomBar();

    if (this.slotsOpen) this.drawSlotOverlay();
  }

  drawDeckPanel() {
    this.uiGroup.add(this.add.rectangle(870, H / 2, 280, H - 10, 0x111122));
    this.uiGroup.add(this.add.rectangle(870, H / 2, 280, H - 10, 0x000000, 0).setStrokeStyle(1, 0x334455));
    this.uiGroup.add(this.add.text(870, 16, `DECK  ${this.deckIds.length}`, {
      ...FONT, fontSize: '14px', color: '#e6b422'
    }).setOrigin(0.5));

    const deckCount = {};
    this.deckIds.forEach(id => { deckCount[id] = (deckCount[id] || 0) + 1; });
    const deckUnique = [...new Set(this.deckIds)].sort((a, b) => {
      const ca = getCardById(a), cb = getCardById(b);
      return (ca?.cost || 0) - (cb?.cost || 0);
    });

    deckUnique.forEach((id, i) => {
      const card = getCardById(id);
      if (!card) return;
      const y = 42 + i * 24;
      if (y > H - 110) return;

      const rowBg = this.add.rectangle(870, y, 260, 20, 0x1a1a2a).setInteractive({ useHandCursor: true });
      this.uiGroup.add(rowBg);

      const key = getCardTextureKey(this, card);
      if (key) {
        this.uiGroup.add(this.add.image(755, y, key).setDisplaySize(18, 18));
      }

      this.uiGroup.add(this.add.text(770, y, `[${card.cost}]`, {
        ...FONT, fontSize: '8px', color: '#66aaff'
      }).setOrigin(0, 0.5));

      const dIsCustom = this.customIds.has(id);
      const dIsBase = this.baseIds.has(id);
      const dOverride = dIsBase && dIsCustom;
      const nameColor = dOverride ? '#ffcc44' : (dIsCustom ? '#88ff88' : '#ccc');

      this.uiGroup.add(this.add.text(800, y, card.name.slice(0, 13), {
        ...FONT, fontSize: '8px', color: nameColor
      }).setOrigin(0, 0.5));

      this.uiGroup.add(this.add.text(975, y, `x${deckCount[id]}`, {
        ...FONT, fontSize: '8px', color: '#aaa'
      }).setOrigin(1, 0.5));

      rowBg.on('pointerover', () => rowBg.setFillStyle(0x2a2a3a));
      rowBg.on('pointerout', () => rowBg.setFillStyle(0x1a1a2a));
      rowBg.on('pointerdown', () => {
        const idx = this.deckIds.indexOf(id);
        if (idx !== -1) this.deckIds.splice(idx, 1);
        this.redraw();
      });
    });
  }

  drawBottomBar() {
    const barY = H - 40;
    const canSave = this.deckIds.length >= 1;

    const buttons = [
      { label: 'CLEAR', x: 740, w: 80, color: 0x442222, border: 0xaa4444, active: this.deckIds.length > 0, fn: () => { this.deckIds = []; this.redraw(); } },
      { label: 'SAVE', x: 825, w: 80, color: 0x225522, border: 0x44aa44, active: canSave, fn: () => { if (!canSave) return; saveDeck(this.deckIds); this.showWarning('Deck saved as active!', '#44ff44'); } },
      { label: 'SLOTS', x: 910, w: 80, color: 0x222244, border: 0x4466aa, active: true, fn: () => { this.slotsOpen = true; this.redraw(); } },
      { label: 'BACK', x: 980, w: 70, color: 0x333333, border: 0x555555, active: true, fn: () => { this.scene.start('Hub'); } }
    ];

    buttons.forEach(({ label, x, w, color, border, active, fn }) => {
      const bg = this.add.rectangle(x, barY, w, 32, active ? color : 0x1a1a1a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(1, active ? border : 0x333333);
      this.uiGroup.add(bg);
      this.uiGroup.add(this.add.text(x, barY, label, {
        ...FONT, fontSize: '9px', color: active ? '#fff' : '#444'
      }).setOrigin(0.5));
      if (active) {
        bg.on('pointerover', () => { bg.setFillStyle(Phaser.Display.Color.ValueToColor(color).brighten(30).color); });
        bg.on('pointerout', () => bg.setFillStyle(color));
        bg.on('pointerdown', fn);
      }
    });
  }

  drawSlotOverlay() {
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.8).setInteractive();
    this.uiGroup.add(overlay);

    const panelW = 600, panelH = 500;
    this.uiGroup.add(this.add.rectangle(W / 2, H / 2, panelW, panelH, 0x111122).setStrokeStyle(2, 0x334466));

    this.uiGroup.add(this.add.text(W / 2, H / 2 - panelH / 2 + 24, 'DECK SLOTS', {
      ...FONT, fontSize: '16px', color: '#e6b422'
    }).setOrigin(0.5));

    const slots = loadDeckSlots();
    const startY = H / 2 - panelH / 2 + 60;
    const slotH = 36;

    if (slots.length === 0) {
      this.uiGroup.add(this.add.text(W / 2, startY + 40, 'No saved decks yet.', {
        ...FONT, fontSize: '9px', color: '#666'
      }).setOrigin(0.5));
    }

    slots.forEach((slot, i) => {
      const y = startY + i * (slotH + 4);
      if (y > H / 2 + panelH / 2 - 80) return;

      const rowBg = this.add.rectangle(W / 2, y, panelW - 40, slotH, 0x1a1a2a).setInteractive({ useHandCursor: true });
      rowBg.setStrokeStyle(1, 0x334455);
      this.uiGroup.add(rowBg);

      this.uiGroup.add(this.add.text(W / 2 - panelW / 2 + 40, y, `${slot.name}`, {
        ...FONT, fontSize: '10px', color: '#fff'
      }).setOrigin(0, 0.5));
      this.uiGroup.add(this.add.text(W / 2 - panelW / 2 + 40, y + 12, `${slot.cards.length} cards`, {
        ...FONT, fontSize: '7px', color: '#888'
      }).setOrigin(0, 0.5));

      const loadBtn = this.makeSlotBtn(W / 2 + 120, y, 70, 'LOAD', 0x224422, () => {
        this.deckIds = [...slot.cards];
        this.slotsOpen = false;
        this.redraw();
      });
      this.uiGroup.add(loadBtn.bg);
      this.uiGroup.add(loadBtn.txt);

      const delBtn = this.makeSlotBtn(W / 2 + 210, y, 70, 'DELETE', 0x442222, () => {
        slots.splice(i, 1);
        saveDeckSlots(slots);
        this.redraw();
      });
      this.uiGroup.add(delBtn.bg);
      this.uiGroup.add(delBtn.txt);
    });

    // save current deck as new slot
    const saveY = H / 2 + panelH / 2 - 60;
    const canSaveSlot = this.deckIds.length >= 1;

    const saveSlotBg = this.add.rectangle(W / 2, saveY, 280, 36, canSaveSlot ? 0x223344 : 0x1a1a1a).setInteractive({ useHandCursor: true });
    saveSlotBg.setStrokeStyle(1, canSaveSlot ? 0x4488aa : 0x333333);
    this.uiGroup.add(saveSlotBg);
    this.uiGroup.add(this.add.text(W / 2, saveY, 'SAVE CURRENT DECK TO SLOT', {
      ...FONT, fontSize: '8px', color: canSaveSlot ? '#88ccff' : '#444'
    }).setOrigin(0.5));

    if (canSaveSlot) {
      saveSlotBg.on('pointerdown', () => {
        const name = prompt('Enter deck name:');
        if (!name || !name.trim()) return;
        const slots = loadDeckSlots();
        slots.push({ name: name.trim(), cards: [...this.deckIds] });
        saveDeckSlots(slots);
        this.redraw();
      });
    }

    // close button
    const closeBg = this.add.rectangle(W / 2, H / 2 + panelH / 2 - 24, 120, 30, 0x333333).setInteractive({ useHandCursor: true });
    closeBg.setStrokeStyle(1, 0x555555);
    this.uiGroup.add(closeBg);
    this.uiGroup.add(this.add.text(W / 2, H / 2 + panelH / 2 - 24, 'CLOSE', {
      ...FONT, fontSize: '10px', color: '#fff'
    }).setOrigin(0.5));
    closeBg.on('pointerdown', () => { this.slotsOpen = false; this.redraw(); });
  }

  makeSlotBtn(x, y, w, label, color, fn) {
    const bg = this.add.rectangle(x, y, w, 26, color).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(1, Phaser.Display.Color.ValueToColor(color).brighten(40).color);
    const txt = this.add.text(x, y, label, { ...FONT, fontSize: '7px', color: '#fff' }).setOrigin(0.5);
    bg.on('pointerdown', fn);
    return { bg, txt };
  }

  showWarning(msg, color = '#ff4444') {
    const t = this.add.text(512, H / 2, msg, {
      ...FONT, fontSize: '12px', color, backgroundColor: '#000000', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(100);
    this.time.delayedCall(1500, () => t.destroy());
  }
}
