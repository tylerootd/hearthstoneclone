import Phaser from 'phaser';
import { loadDeck, loadDeckSlots, loadArtifacts } from '../data/storage.js';
import { getCardById } from '../data/cardPool.js';
import { generateEnemyDeck, ARTIFACT_DEFS } from '../game/battleEngine.js';

const W = 1024, H = 768;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial', fontSize: '10px' };

export default class DeckSelectScene extends Phaser.Scene {
  constructor() { super('DeckSelect'); }

  create() {
    this.playerChoice = null;
    this.enemyChoice = null;
    this.uiGroup = this.add.group();
    this.buildSlotList();
    this.redraw();
  }

  buildSlotList() {
    this.decks = [];

    const active = loadDeck();
    if (active && active.length > 0) {
      this.decks.push({ name: 'Active Deck', cards: active });
    }

    const slots = loadDeckSlots();
    slots.forEach(s => this.decks.push(s));

    if (this.decks.length > 0) this.playerChoice = 0;
  }

  redraw() {
    this.uiGroup.clear(true, true);

    this.uiGroup.add(this.add.text(W / 2, 40, 'SELECT DECKS', {
      ...FONT, fontSize: '22px', color: '#e6b422'
    }).setOrigin(0.5));

    // left: your deck
    this.drawColumn(W / 4, 'YOUR DECK', this.decks, this.playerChoice, (i) => {
      this.playerChoice = i;
      this.redraw();
    }, false);

    // right: enemy deck
    this.drawColumn(3 * W / 4, 'ENEMY DECK', this.decks, this.enemyChoice, (i) => {
      this.enemyChoice = i;
      this.redraw();
    }, true);

    // divider
    this.uiGroup.add(this.add.rectangle(W / 2, H / 2, 2, H - 120, 0x333344));

    // artifacts bar
    this.drawArtifacts();

    // start button
    const canStart = this.playerChoice !== null;
    const startY = H - 60;

    const startBg = this.add.rectangle(W / 2, startY, 260, 48, canStart ? 0x224422 : 0x1a1a1a).setInteractive({ useHandCursor: true });
    startBg.setStrokeStyle(2, canStart ? 0x44aa44 : 0x333333);
    this.uiGroup.add(startBg);
    this.uiGroup.add(this.add.text(W / 2, startY, 'START BATTLE', {
      ...FONT, fontSize: '14px', color: canStart ? '#44ff44' : '#444'
    }).setOrigin(0.5));

    if (canStart) {
      startBg.on('pointerover', () => startBg.setFillStyle(0x336633));
      startBg.on('pointerout', () => startBg.setFillStyle(0x224422));
      startBg.on('pointerdown', () => this.startBattle());
    }

    // back button
    const backBg = this.add.rectangle(80, H - 60, 100, 36, 0x442222).setInteractive({ useHandCursor: true });
    backBg.setStrokeStyle(1, 0xaa4444);
    this.uiGroup.add(backBg);
    this.uiGroup.add(this.add.text(80, H - 60, 'BACK', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
    backBg.on('pointerdown', () => this.scene.start('Hub'));
  }

  drawColumn(cx, title, decks, selectedIdx, onSelect, showRandom) {
    const topY = 80;

    this.uiGroup.add(this.add.text(cx, topY, title, {
      ...FONT, fontSize: '12px', color: '#88ccff'
    }).setOrigin(0.5));

    const colW = W / 2 - 40;
    const startY = topY + 30;
    const rowH = 60;

    if (showRandom) {
      const isSelected = selectedIdx === null || selectedIdx === -1;
      const y = startY;
      const bg = this.add.rectangle(cx, y + rowH / 2, colW, rowH - 4, isSelected ? 0x2a3344 : 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, isSelected ? 0x66aaff : 0x333344);
      this.uiGroup.add(bg);

      this.uiGroup.add(this.add.text(cx, y + rowH / 2 - 8, 'RANDOM DECK', {
        ...FONT, fontSize: '10px', color: isSelected ? '#66aaff' : '#aaa'
      }).setOrigin(0.5));
      this.uiGroup.add(this.add.text(cx, y + rowH / 2 + 10, 'AI builds a random deck', {
        ...FONT, fontSize: '7px', color: '#666'
      }).setOrigin(0.5));

      bg.on('pointerover', () => { if (!isSelected) bg.setStrokeStyle(2, 0x556688); });
      bg.on('pointerout', () => { if (!isSelected) bg.setStrokeStyle(2, 0x333344); });
      bg.on('pointerdown', () => {
        this.enemyChoice = -1;
        this.redraw();
      });
    }

    const offsetY = showRandom ? startY + rowH + 4 : startY;

    if (decks.length === 0) {
      this.uiGroup.add(this.add.text(cx, offsetY + 40, 'No decks saved.\nBuild one in Deck Builder.', {
        ...FONT, fontSize: '8px', color: '#666', align: 'center', lineSpacing: 8
      }).setOrigin(0.5));
      return;
    }

    decks.forEach((slot, i) => {
      const y = offsetY + i * (rowH + 4);
      if (y + rowH > H - 100) return;

      const isSelected = selectedIdx === i;
      const bg = this.add.rectangle(cx, y + rowH / 2, colW, rowH - 4, isSelected ? 0x2a3344 : 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, isSelected ? 0x66aaff : 0x333344);
      this.uiGroup.add(bg);

      this.uiGroup.add(this.add.text(cx - colW / 2 + 16, y + rowH / 2 - 10, slot.name, {
        ...FONT, fontSize: '10px', color: isSelected ? '#ffffff' : '#ccc'
      }).setOrigin(0, 0.5));

      this.uiGroup.add(this.add.text(cx - colW / 2 + 16, y + rowH / 2 + 8, `${slot.cards.length} cards`, {
        ...FONT, fontSize: '7px', color: '#888'
      }).setOrigin(0, 0.5));

      const preview = this.getDeckPreview(slot.cards);
      this.uiGroup.add(this.add.text(cx + colW / 2 - 16, y + rowH / 2, preview, {
        ...FONT, fontSize: '7px', color: '#666', align: 'right'
      }).setOrigin(1, 0.5));

      bg.on('pointerover', () => { if (!isSelected) bg.setStrokeStyle(2, 0x556688); });
      bg.on('pointerout', () => { if (!isSelected) bg.setStrokeStyle(2, 0x333344); });
      bg.on('pointerdown', () => onSelect(i));
    });
  }

  getDeckPreview(cardIds) {
    const costs = cardIds.map(id => getCardById(id)?.cost ?? 0);
    const avg = costs.length ? (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1) : '0';
    const minions = cardIds.filter(id => getCardById(id)?.type === 'minion').length;
    const spells = cardIds.length - minions;
    return `avg:${avg} M:${minions} S:${spells}`;
  }

  drawArtifacts() {
    const arts = loadArtifacts();
    const y = H - 110;

    this.uiGroup.add(this.add.text(W / 2, y - 18, 'ARTIFACTS', {
      ...FONT, fontSize: '8px', color: '#888', letterSpacing: 2
    }).setOrigin(0.5));

    if (arts.length === 0) {
      this.uiGroup.add(this.add.text(W / 2, y + 8, 'None yet - win battles to earn artifacts!', {
        ...FONT, fontSize: '7px', color: '#555'
      }).setOrigin(0.5));
      return;
    }

    const totalW = arts.length * 160;
    const startX = W / 2 - totalW / 2 + 80;

    arts.forEach((artId, i) => {
      const art = ARTIFACT_DEFS[artId];
      if (!art) return;
      const x = startX + i * 160;

      const bg = this.add.rectangle(x, y + 8, 150, 30, 0x1a1a2a);
      const borderColor = Phaser.Display.Color.HexStringToColor(art.color).color;
      bg.setStrokeStyle(1, borderColor);
      this.uiGroup.add(bg);

      this.uiGroup.add(this.add.text(x - 60, y + 8, art.icon, {
        fontSize: '16px'
      }).setOrigin(0.5));

      this.uiGroup.add(this.add.text(x + 4, y + 2, art.name, {
        ...FONT, fontSize: '7px', color: art.color
      }).setOrigin(0, 0.5));

      this.uiGroup.add(this.add.text(x + 4, y + 14, art.description, {
        ...FONT, fontSize: '5px', color: '#888'
      }).setOrigin(0, 0.5));
    });
  }

  startBattle() {
    const playerDeck = this.decks[this.playerChoice].cards;
    const artifacts = loadArtifacts();

    let enemyDeck;
    if (this.enemyChoice === null || this.enemyChoice === -1) {
      enemyDeck = generateEnemyDeck();
    } else {
      enemyDeck = this.decks[this.enemyChoice].cards;
    }

    this.scene.start('Battle', { playerDeck, enemyDeck, artifacts });
  }
}
