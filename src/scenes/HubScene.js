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
      { label: 'MULTIPLAYER',   y: 255, cb: () => this._pickUsername(), color: '#44ffaa' },
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

  _pickUsername() {
    if (this._nameBox) return;
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      background: '#0a1a2e', border: '2px solid #44ffaa', borderRadius: '8px',
      padding: '24px 32px', zIndex: '1000', textAlign: 'center',
      fontFamily: '"Press Start 2P", monospace'
    });

    const title = document.createElement('div');
    title.textContent = 'ENTER USERNAME';
    Object.assign(title.style, { color: '#44ffaa', fontSize: '14px', marginBottom: '16px' });
    box.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'Your name...';
    Object.assign(input.style, {
      width: '200px', padding: '8px 12px', fontSize: '14px',
      fontFamily: '"Press Start 2P", monospace', background: '#111828',
      color: '#fff', border: '2px solid #335566', borderRadius: '4px',
      outline: 'none', textAlign: 'center', marginBottom: '16px', display: 'block',
      marginLeft: 'auto', marginRight: 'auto'
    });
    box.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '12px';
    btnRow.style.justifyContent = 'center';

    const makeBtn = (text, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        background: bg, color: '#fff', border: 'none',
        padding: '8px 24px', fontSize: '12px', fontFamily: 'inherit',
        cursor: 'pointer', borderRadius: '4px'
      });
      b.addEventListener('click', fn);
      btnRow.appendChild(b);
    };

    const go = () => {
      const name = input.value.trim();
      if (!name) { input.style.borderColor = '#ff4444'; return; }
      box.remove();
      this._nameBox = null;
      this.scene.start('MmoMap', { username: name });
    };

    makeBtn('JOIN', '#226644', go);
    makeBtn('CANCEL', '#552222', () => { box.remove(); this._nameBox = null; });

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    box.appendChild(btnRow);
    document.body.appendChild(box);
    this._nameBox = box;
    input.focus();
  }
}
