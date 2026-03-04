import Phaser from 'phaser';
import { resetSave, loadArtifacts } from '../data/storage.js';
import { ARTIFACT_DEFS } from '../game/battleEngine.js';

const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };

export default class HubScene extends Phaser.Scene {
  constructor() { super('Hub'); }

  create() {
    // artifact (top-left: logo + text)
    const arts = loadArtifacts();
    if (arts && arts.length > 0) {
      const def = ARTIFACT_DEFS[arts[0]];
      if (def) {
        this.add.rectangle(12, 12, 160, 44, 0x1a2233, 0.95).setStrokeStyle(2, 0x556677);
        this.add.text(34, 34, def.icon, { fontSize: '22px', color: def.color }).setOrigin(0.5);
        this.add.text(68, 34, def.name, { ...FONT, fontSize: '8px', color: '#e6b422' }).setOrigin(0, 0.5);
      }
    }

    this.add.text(512, 100, 'HEARTHSTONE RPG', {
      ...FONT, fontSize: '32px', color: '#e6b422'
    }).setOrigin(0.5);

    this.add.text(512, 150, 'Roguelite Card Battler', {
      ...FONT, fontSize: '10px', color: '#666'
    }).setOrigin(0.5);

    const btns = [
      { label: 'SINGLEPLAYER',  y: 200, cb: () => this.scene.start('Overworld') },
      { label: 'MULTIPLAYER',   y: 255, cb: () => this.scene.start('MmoMap'), color: '#44ffaa' },
      { label: 'CARD FORGE',    y: 310, cb: () => this.scene.start('Crafting') },
      { label: 'QUICK BATTLE',  y: 365, cb: () => this.scene.start('DeckSelect') },
      { label: 'DECK BUILDER',  y: 420, cb: () => this.scene.start('DeckBuilder') },
      { label: 'MASTER MODE',   y: 475, cb: () => this.scene.start('MasterMode') },
      { label: 'RESET SAVE',    y: 580, cb: () => { resetSave(); this.scene.start('Boot'); } }
    ];

    btns.forEach(({ label, y, cb, color }) => {
      const isMmo = !!color;
      const fillBase = isMmo ? 0x0a2a1a : 0x1a2233;
      const strokeBase = isMmo ? 0x226644 : 0x334466;
      const txtColor = color || '#aaccee';
      const bg = this.add.rectangle(512, y, 280, 48, fillBase).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, strokeBase);
      const txt = this.add.text(512, y, label, { ...FONT, fontSize: '14px', color: txtColor }).setOrigin(0.5);
      bg.on('pointerover', () => { bg.setFillStyle(isMmo ? 0x1a3a2a : 0x2a3344); bg.setStrokeStyle(2, isMmo ? 0x44ffaa : 0x5588bb); txt.setColor('#ffffff'); });
      bg.on('pointerout',  () => { bg.setFillStyle(fillBase); bg.setStrokeStyle(2, strokeBase); txt.setColor(txtColor); });
      bg.on('pointerdown', cb);
    });
  }
}
