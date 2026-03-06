import Phaser from 'phaser';

const W = 1024, H = 768;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };

const STEPS = [
  {
    title: 'WELCOME TO DUELING',
    body: [
      'In a duel, you and your opponent take turns',
      'playing cards and attacking each other.',
      '',
      'The goal: reduce the enemy hero HP to 0.'
    ],
    highlight: null
  },
  {
    title: 'MANA',
    body: [
      'Each turn you gain +1 max mana (up to 10).',
      'Playing a card costs mana shown in the',
      'blue circle on the top-left of the card.',
      '',
      'Spend your mana wisely each turn!'
    ],
    highlight: 'mana'
  },
  {
    title: 'PLAYING MINIONS',
    body: [
      'Drag a minion card from your hand onto',
      'the board to play it.',
      '',
      'Minions have Attack (gold) and Health (red).',
      'They cannot attack the turn they are played',
      '(they show "zzz").'
    ],
    highlight: 'board'
  },
  {
    title: 'RAGE KEYWORD',
    body: [
      'Minions with RAGE can attack immediately',
      'the same turn they are played!',
      '',
      'Look for the fire icon on the card.'
    ],
    highlight: 'rage'
  },
  {
    title: 'ATTACKING',
    body: [
      'Click a minion that can attack, then click',
      'an enemy minion or the enemy hero.',
      '',
      'When minions fight, they deal their Attack',
      'to each other simultaneously.'
    ],
    highlight: 'attack'
  },
  {
    title: 'GUARDIAN KEYWORD',
    body: [
      'Minions with GUARDIAN block attacks.',
      'You must defeat the Guardian before you',
      'can hit the enemy hero in that slot.',
      '',
      'Look for the shield icon on the card.'
    ],
    highlight: 'guardian'
  },
  {
    title: 'SPELLS',
    body: [
      'Spell cards have instant effects:',
      'deal damage, heal, draw cards, or buff.',
      '',
      'They are used once and discarded.'
    ],
    highlight: 'spell'
  },
  {
    title: 'END TURN',
    body: [
      'When you are done playing cards and',
      'attacking, click END TURN.',
      '',
      'The enemy will then take their turn.',
      'First to destroy the enemy hero wins!'
    ],
    highlight: 'endturn'
  },
  {
    title: 'YOU ARE READY!',
    body: [
      'That is everything you need to know.',
      '',
      'Go duel some NPCs in Singleplayer,',
      'or challenge real players in Multiplayer!',
      '',
      'Good luck!'
    ],
    highlight: null
  }
];

export default class TutorialScene extends Phaser.Scene {
  constructor() { super('Tutorial'); }

  create() {
    this.stepIdx = 0;
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0e1a).setDepth(0);
    this.uiGroup = this.add.group();
    this._draw();
  }

  _clear() { this.uiGroup.clear(true, true); }

  _draw() {
    this._clear();
    const step = STEPS[this.stepIdx];
    const isLast = this.stepIdx === STEPS.length - 1;
    const isFirst = this.stepIdx === 0;

    this._ui(this.add.text(W / 2, 40, 'TUTORIAL', {
      ...FONT, fontSize: '10px', color: '#555'
    }).setOrigin(0.5).setDepth(1));

    this._ui(this.add.text(W / 2, 28, `${this.stepIdx + 1} / ${STEPS.length}`, {
      ...FONT, fontSize: '8px', color: '#444'
    }).setOrigin(0.5).setDepth(1));

    const pw = 680, ph = 440;
    const px = W / 2, py = H / 2 - 20;

    this._ui(this.add.rectangle(px, py, pw, ph, 0x111828, 0.95)
      .setStrokeStyle(2, 0x3355aa).setDepth(2));

    this._ui(this.add.text(px, py - ph / 2 + 40, step.title, {
      ...FONT, fontSize: '18px', color: '#44ffaa'
    }).setOrigin(0.5).setDepth(3));

    this._ui(this.add.rectangle(px, py - ph / 2 + 60, pw - 60, 1, 0x334466).setDepth(3));

    step.body.forEach((line, i) => {
      this._ui(this.add.text(px, py - ph / 2 + 86 + i * 26, line, {
        ...FONT, fontSize: '9px', color: '#ccc', align: 'center'
      }).setOrigin(0.5).setDepth(3));
    });

    if (step.highlight) this._drawVisual(step.highlight, px, py + 60);

    const btnY = H - 80;

    if (!isFirst) {
      const prev = this._ui(this.add.rectangle(px - 120, btnY, 140, 40, 0x333355)
        .setStrokeStyle(2, 0x5566aa).setDepth(5));
      prev.setInteractive({ useHandCursor: true });
      this._ui(this.add.text(px - 120, btnY, 'BACK', {
        ...FONT, fontSize: '10px', color: '#aaccee'
      }).setOrigin(0.5).setDepth(6));
      prev.on('pointerover', () => prev.setStrokeStyle(2, 0x88aaff));
      prev.on('pointerout', () => prev.setStrokeStyle(2, 0x5566aa));
      prev.on('pointerdown', () => { this.stepIdx--; this._draw(); });
    }

    if (!isLast) {
      const next = this._ui(this.add.rectangle(px + 120, btnY, 140, 40, 0x225533)
        .setStrokeStyle(2, 0x44aa66).setDepth(5));
      next.setInteractive({ useHandCursor: true });
      this._ui(this.add.text(px + 120, btnY, 'NEXT', {
        ...FONT, fontSize: '10px', color: '#aaffcc'
      }).setOrigin(0.5).setDepth(6));
      next.on('pointerover', () => next.setStrokeStyle(2, 0x66ff88));
      next.on('pointerout', () => next.setStrokeStyle(2, 0x44aa66));
      next.on('pointerdown', () => { this.stepIdx++; this._draw(); });
    }

    const exitLabel = isLast ? 'DONE' : 'SKIP';
    const exit = this._ui(this.add.rectangle(px + (isLast ? 0 : 280), btnY, isLast ? 140 : 100, 40, 0x553322)
      .setStrokeStyle(2, 0xaa6644).setDepth(5));
    exit.setInteractive({ useHandCursor: true });
    this._ui(this.add.text(px + (isLast ? 0 : 280), btnY, exitLabel, {
      ...FONT, fontSize: '10px', color: '#ffccaa'
    }).setOrigin(0.5).setDepth(6));
    exit.on('pointerover', () => exit.setStrokeStyle(2, 0xff8844));
    exit.on('pointerout', () => exit.setStrokeStyle(2, 0xaa6644));
    exit.on('pointerdown', () => this.scene.start('Hub'));
  }

  _drawVisual(type, cx, cy) {
    const CARD_W = 80, CARD_H = 110;

    if (type === 'mana') {
      const sx = cx - 60;
      for (let i = 0; i < 5; i++) {
        const filled = i < 3;
        this._ui(this.add.rectangle(sx + i * 28, cy, 14, 14,
          filled ? 0x2266ff : 0x181830, filled ? 1 : 0.4)
          .setAngle(45).setStrokeStyle(1, filled ? 0x44aaff : 0x2a2a44).setDepth(4));
      }
      this._ui(this.add.text(cx, cy + 20, '3 / 5 Mana', {
        ...FONT, fontSize: '8px', color: '#5599ee'
      }).setOrigin(0.5).setDepth(4));
    }

    if (type === 'board') {
      this._ui(this.add.rectangle(cx, cy, CARD_W, CARD_H, 0xf5f5f8, 0.9)
        .setStrokeStyle(2, 0x337744).setDepth(4));
      this._ui(this.add.text(cx, cy - 30, 'Raptor', {
        ...FONT, fontSize: '7px', color: '#ddd'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.circle(cx - 28, cy + 38, 10, 0xaa8800).setDepth(5));
      this._ui(this.add.text(cx - 28, cy + 38, '3', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.circle(cx + 28, cy + 38, 10, 0xbb2222).setDepth(5));
      this._ui(this.add.text(cx + 28, cy + 38, '2', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.text(cx, cy + 4, 'zzz', { ...FONT, fontSize: '8px', color: '#555' }).setOrigin(0.5).setDepth(6));
    }

    if (type === 'rage') {
      this._ui(this.add.rectangle(cx, cy, CARD_W, CARD_H, 0xf5f5f8, 0.9)
        .setStrokeStyle(2, 0x337744).setDepth(4));
      this._ui(this.add.text(cx, cy - 30, 'Wolfrider', {
        ...FONT, fontSize: '6px', color: '#ddd'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(cx, cy - 8, '\u{1F525}', { fontSize: '22px' }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.text(cx, cy + 14, 'RAGE', {
        ...FONT, fontSize: '6px', color: '#ff6622', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.circle(cx - 28, cy + 38, 10, 0xaa8800).setDepth(5));
      this._ui(this.add.text(cx - 28, cy + 38, '3', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.circle(cx + 28, cy + 38, 10, 0xbb2222).setDepth(5));
      this._ui(this.add.text(cx + 28, cy + 38, '1', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(6));
    }

    if (type === 'attack') {
      const ax = cx - 80, bx = cx + 80;
      this._ui(this.add.rectangle(ax, cy, 60, 80, 0xf5f5f8, 0.9)
        .setStrokeStyle(2, 0x337744).setDepth(4));
      this._ui(this.add.text(ax, cy - 20, 'YOU', { ...FONT, fontSize: '6px', color: '#66ff66' }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(ax, cy + 10, '4/5', { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(5));

      this._ui(this.add.rectangle(bx, cy, 60, 80, 0xf5f5f8, 0.9)
        .setStrokeStyle(2, 0x774433).setDepth(4));
      this._ui(this.add.text(bx, cy - 20, 'ENEMY', { ...FONT, fontSize: '6px', color: '#ff6666' }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(bx, cy + 10, '3/2', { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5).setDepth(5));

      this._ui(this.add.text(cx, cy - 6, '\u2192', { fontSize: '28px', color: '#ff4444' }).setOrigin(0.5).setDepth(6));
    }

    if (type === 'guardian') {
      this._ui(this.add.rectangle(cx, cy, CARD_W, CARD_H, 0xf5f5f8, 0.9)
        .setStrokeStyle(3, 0x33ddff).setDepth(4));
      this._ui(this.add.rectangle(cx, cy, CARD_W + 8, CARD_H + 8, 0x11aacc, 0.12)
        .setDepth(3));
      this._ui(this.add.text(cx, cy - 24, 'Shieldmasta', {
        ...FONT, fontSize: '5px', color: '#ddd'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(cx, cy - 4, '\u{1F6E1}', { fontSize: '22px' }).setOrigin(0.5).setDepth(6));
      this._ui(this.add.text(cx, cy + 18, 'GUARDIAN', {
        ...FONT, fontSize: '6px', color: '#33ddff', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(6));
    }

    if (type === 'spell') {
      this._ui(this.add.rectangle(cx, cy, CARD_W, CARD_H, 0xf5f5f8, 0.9)
        .setStrokeStyle(2, 0x8855cc).setDepth(4));
      this._ui(this.add.text(cx, cy - 24, 'Fireball', {
        ...FONT, fontSize: '7px', color: '#ddd'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(cx, cy + 2, 'SPELL', {
        ...FONT, fontSize: '8px', color: '#bb77ee'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.text(cx, cy + 22, 'Deal 6 damage', {
        ...FONT, fontSize: '6px', color: '#88ccaa'
      }).setOrigin(0.5).setDepth(5));
      this._ui(this.add.circle(cx - 28, cy - 38, 10, 0x1a3399).setDepth(5));
      this._ui(this.add.text(cx - 28, cy - 38, '4', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5).setDepth(6));
    }

    if (type === 'endturn') {
      const bg = this._ui(this.add.rectangle(cx, cy, 120, 50, 0x775511, 0.9)
        .setStrokeStyle(2, 0xccaa44).setDepth(4));
      this._ui(this.add.text(cx, cy, 'END\nTURN', {
        ...FONT, fontSize: '10px', color: '#ffe066', align: 'center'
      }).setOrigin(0.5).setDepth(5));
    }
  }

  _ui(o) { this.uiGroup.add(o); return o; }
}
