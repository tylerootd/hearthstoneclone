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
      { label: 'SINGLEPLAYER',  y: 195, cb: () => this.scene.start('Overworld') },
      { label: 'MULTIPLAYER',   y: 245, cb: () => this._pickUsername('MmoMap'), color: '#44ffaa' },
      { label: 'SUPER RETRO',   y: 295, cb: () => this._pickUsername('SuperRetroMap'), color: '#ff8844' },
      { label: 'CARD FORGE',    y: 345, cb: () => this.scene.start('Crafting') },
      { label: 'QUICK BATTLE',  y: 395, cb: () => this.scene.start('DeckSelect') },
      { label: 'DECK BUILDER',  y: 445, cb: () => this.scene.start('DeckBuilder') },
      { label: 'MASTER MODE',   y: 495, cb: () => this.scene.start('MasterMode') },
      { label: 'TUTORIAL',      y: 545, cb: () => this.scene.start('Tutorial'), color: '#ffcc44' },
      { label: 'RESET SAVE',    y: 590, cb: () => { resetSave(); this.scene.start('Boot'); } }
    ];

    btns.forEach(({ label, y, cb, color }) => {
      const isSpecial = !!color;
      const isTutorial = color === '#ffcc44';
      const fillBase = isTutorial ? 0x2a2210 : isSpecial ? 0x0a2a1a : 0x1a2233;
      const strokeBase = isTutorial ? 0x665522 : isSpecial ? 0x226644 : 0x334466;
      const hoverFill = isTutorial ? 0x3a3220 : isSpecial ? 0x1a3a2a : 0x2a3344;
      const hoverStroke = isTutorial ? 0xffcc44 : isSpecial ? 0x44ffaa : 0x5588bb;
      const txtColor = color || '#aaccee';
      const bg = this.add.rectangle(512, y, 280, 48, fillBase).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, strokeBase);
      const txt = this.add.text(512, y, label, { ...FONT, fontSize: '14px', color: txtColor }).setOrigin(0.5);
      bg.on('pointerover', () => { bg.setFillStyle(hoverFill); bg.setStrokeStyle(2, hoverStroke); txt.setColor('#ffffff'); });
      bg.on('pointerout',  () => { bg.setFillStyle(fillBase); bg.setStrokeStyle(2, strokeBase); txt.setColor(txtColor); });
      bg.on('pointerdown', cb);
    });
  }

  _pickUsername(targetScene = 'MmoMap') {
    if (this._nameBox) return;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      zIndex: '999', background: 'rgba(0,0,0,0.4)'
    });
    document.body.appendChild(overlay);

    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const boxLeft = rect.left + 10;
    const boxWidth = Math.min(320, (rect.width * 0.34));

    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', top: '50%', left: boxLeft + 'px',
      transform: 'translateY(-50%)',
      width: boxWidth + 'px',
      background: '#0a1a2e', border: '2px solid #44ffaa', borderRadius: '10px',
      padding: '36px 28px', zIndex: '1000', textAlign: 'center',
      fontFamily: '"Press Start 2P", monospace'
    });

    const title = document.createElement('div');
    title.textContent = 'ENTER USERNAME';
    Object.assign(title.style, { color: '#44ffaa', fontSize: '16px', marginBottom: '24px' });
    box.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'Your name...';
    Object.assign(input.style, {
      width: '90%', padding: '12px 14px', fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace', background: '#111828',
      color: '#fff', border: '2px solid #335566', borderRadius: '4px',
      outline: 'none', textAlign: 'center', marginBottom: '24px', display: 'block',
      marginLeft: 'auto', marginRight: 'auto', boxSizing: 'border-box'
    });
    box.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '16px';
    btnRow.style.justifyContent = 'center';

    const makeBtn = (text, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        background: bg, color: '#fff', border: 'none',
        padding: '12px 32px', fontSize: '14px', fontFamily: 'inherit',
        cursor: 'pointer', borderRadius: '4px'
      });
      b.addEventListener('click', fn);
      btnRow.appendChild(b);
    };

    const cleanup = () => { overlay.remove(); box.remove(); this._nameBox = null; };

    const go = () => {
      const name = input.value.trim();
      if (!name) { input.style.borderColor = '#ff4444'; return; }
      cleanup();
      this.scene.start(targetScene, { username: name });
    };

    makeBtn('JOIN', '#226644', go);
    makeBtn('CANCEL', '#552222', cleanup);

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    box.appendChild(btnRow);
    document.body.appendChild(box);
    this._nameBox = box;
    input.focus();
  }
}
