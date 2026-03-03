import Phaser from 'phaser';
import { saveArtifacts } from '../data/storage.js';
import { ARTIFACT_DEFS, ALL_ARTIFACT_IDS } from '../game/battleEngine.js';

const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };

export default class ArtifactPickScene extends Phaser.Scene {
  constructor() { super('ArtifactPick'); }

  create() {
    this.add.text(512, 60, '\u272A YOUR SPECIAL ARTIFACT \u272A', {
      ...FONT, fontSize: '18px', color: '#e6b422', stroke: '#8b6914', strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(512, 100, 'Choose one to carry through your journey', {
      ...FONT, fontSize: '10px', color: '#aaa'
    }).setOrigin(0.5);

    const ids = [...ALL_ARTIFACT_IDS];
    const startX = 512 - (ids.length - 1) * 130;
    ids.forEach((id, i) => {
      const def = ARTIFACT_DEFS[id];
      if (!def) return;
      const x = startX + i * 260;
      const y = 280;

      const bg = this.add.rectangle(x, y, 200, 120, 0x1a2233)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(3, 0x556677);
      bg.on('pointerover', () => { bg.setFillStyle(0x2a3344); bg.setStrokeStyle(3, 0xe6b422); });
      bg.on('pointerout', () => { bg.setFillStyle(0x1a2233); bg.setStrokeStyle(3, 0x556677); });
      bg.on('pointerdown', () => this.pick(id));

      this.add.text(x, y - 50, def.icon, {
        ...FONT, fontSize: '36px', color: def.color
      }).setOrigin(0.5);

      this.add.text(x, y - 10, def.name, {
        ...FONT, fontSize: '12px', color: '#fff'
      }).setOrigin(0.5);

      this.add.text(x, y + 25, def.description, {
        ...FONT, fontSize: '8px', color: '#aaa', align: 'center', wordWrap: { width: 180 }
      }).setOrigin(0.5);
    });
  }

  pick(id) {
    saveArtifacts([id]);
    this.scene.start('Hub');
  }
}
