import Phaser from 'phaser';
import { resetSave } from '../data/storage.js';

const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };

export default class HubScene extends Phaser.Scene {
  constructor() { super('Hub'); }

  create() {
    this.add.text(512, 100, 'HEARTHSTONE RPG', {
      ...FONT, fontSize: '32px', color: '#e6b422'
    }).setOrigin(0.5);

    this.add.text(512, 150, 'Roguelite Card Battler', {
      ...FONT, fontSize: '10px', color: '#666'
    }).setOrigin(0.5);

    const btns = [
      { label: 'START RUN',     y: 280, cb: () => this.scene.start('DeckSelect') },
      { label: 'DECK BUILDER',  y: 360, cb: () => this.scene.start('DeckBuilder') },
      { label: 'MASTER MODE',   y: 440, cb: () => this.scene.start('MasterMode') },
      { label: 'RESET SAVE',    y: 560, cb: () => { resetSave(); this.scene.start('Boot'); } }
    ];

    btns.forEach(({ label, y, cb }) => {
      const bg = this.add.rectangle(512, y, 280, 48, 0x1a2233).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0x334466);
      const txt = this.add.text(512, y, label, { ...FONT, fontSize: '14px', color: '#aaccee' }).setOrigin(0.5);
      bg.on('pointerover', () => { bg.setFillStyle(0x2a3344); bg.setStrokeStyle(2, 0x5588bb); txt.setColor('#ffffff'); });
      bg.on('pointerout',  () => { bg.setFillStyle(0x1a2233); bg.setStrokeStyle(2, 0x334466); txt.setColor('#aaccee'); });
      bg.on('pointerdown', cb);
    });
  }
}
