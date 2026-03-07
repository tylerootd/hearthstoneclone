import Phaser from 'phaser';
import { loadCollection, saveCollection } from '../data/storage.js';
import { getCardById } from '../data/cardPool.js';
import { getCardTextureKey } from '../utils/cardSprite.js';
import { playImpact, playSwoosh } from '../utils/sfx.js';

const W = 1024, H = 768;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };
const GROUND_Y = 540;
const UI_Y = H - 56;

const TOOLS = [
  { id: 'hoe',   label: 'Hoe',   key: 'farm_hoe' },
  { id: 'seeds', label: 'Seeds', key: 'farm_seeds' },
  { id: 'water', label: 'Water', key: 'farm_water' },
  { id: 'feed',  label: 'Feed',  key: 'farm_feed' },
];

const CARD_DROPS = {
  potato:  { id: 'bd1_potato',  name: 'Potato' },
  chicken: { id: 'bd1_chicken', name: 'Chicken' },
  sheep:   { id: 'bd1_sheep',   name: 'Sheep' },
  ox:      { id: 'bd1_ox',      name: 'Ox' },
};

const DIALOGUES = {
  spawn: [
    "Why have I been cursed to such a fate?",
    "Is this all my life amounts to?",
    "Father's debts. Mother's tears. And me... shoveling dirt.",
    "Well... the soil won't till itself.",
    "(Use 1-4 to select tools. WASD to move. E or click objects to interact.)"
  ],
  firstSoil: [
    "Another day. Another row of dirt.",
    "Maybe if I work hard enough, I'll forget everything."
  ],
  firstAnimal: [
    "At least you don't judge me...",
    "You just want food. I understand that."
  ],
  firstCard: [
    "W-what... what is THIS?",
    "The air just... cracked. Like glass shattering.",
    "Is this... a card? It has a picture of a... potato?",
    "Am I losing my mind? Has the hunger finally broken me?"
  ],
  secondCard: [
    "It happened AGAIN.",
    "Something is very wrong with this place.",
    "These cards... they feel real. More real than the dirt."
  ],
  laterCards: [
    "Another one. The world keeps fracturing.",
    "Fine. Whatever reality is... it's broken.",
    "I'll just keep collecting these... things."
  ],
  ladyLuck: [
    "...",
    "The sky... it's tearing open.",
    "???: Do not be afraid, farmer.",
    "WHO ARE YOU?!",
    "Lady Luck: I am Lady Luck. Goddess of Fortune and Fate.",
    "Lady Luck: I have watched you toil in misery. Day after day.",
    "You've been WATCHING? While I suffered?!",
    "Lady Luck: Your suffering was the test. Not everyone endures.",
    "Lady Luck: Those cards you found... they are fragments of a power beyond this world.",
    "What power? What are you talking about?",
    "Lady Luck: A war is coming. Between those who accept their fate... and those who fight it.",
    "Lady Luck: You, farmer, have been chosen to fight.",
    "I'm just a farmer. I can barely feed myself.",
    "Lady Luck: That is precisely why you were chosen.",
    "Lady Luck: Here. Take this. My card. My blessing.",
    "(You received the Lady Luck card)",
    "Lady Luck: Step through the portal. Your real life begins now.",
    "I don't know what lies beyond... but anything is better than this."
  ]
};

export default class FarmScene extends Phaser.Scene {
  constructor() { super('Farm'); }

  create() {
    this._toolIdx = 0;
    this._earnedCards = [];
    this._attempts = { potato: 0, chicken: 0, sheep: 0, ox: 0 };
    this._dialogueActive = false;
    this._dialogueQueue = [];
    this._eventFlags = {};
    this._interactCooldown = 0;
    this._portalOpen = false;
    this._ladyLuckDone = false;
    this._moving = false;

    this._soilPatches = [
      { x: 300, y: 370, state: 'empty' },
      { x: 400, y: 370, state: 'empty' },
      { x: 500, y: 370, state: 'empty' },
    ];

    this._animals = [
      { type: 'chicken', x: 780, y: 310, key: 'farm_chicken', key2: 'farm_chicken2' },
      { type: 'sheep',   x: 780, y: 410, key: 'farm_sheep',   key2: 'farm_sheep2' },
      { type: 'ox',      x: 780, y: 500, key: 'farm_cow',     key2: 'farm_cow2' },
    ];

    this._playerX = 400;
    this._playerY = 460;

    this._buildScene();
    this._drawToolbar();
    this._drawCardTray();

    this._keys = this.input.keyboard.addKeys({
      W: 'W', A: 'A', S: 'S', D: 'D',
      UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
      ONE: 'ONE', TWO: 'TWO', THREE: 'THREE', FOUR: 'FOUR', E: 'E',
    });

    this.input.on('pointerdown', (ptr) => this._onPointerDown(ptr));

    this.time.delayedCall(600, () => this._showDialogue(DIALOGUES.spawn));
  }

  update(_, delta) {
    if (this._interactCooldown > 0) this._interactCooldown -= delta;

    if (Phaser.Input.Keyboard.JustDown(this._keys.ONE))   this._selectTool(0);
    if (Phaser.Input.Keyboard.JustDown(this._keys.TWO))   this._selectTool(1);
    if (Phaser.Input.Keyboard.JustDown(this._keys.THREE)) this._selectTool(2);
    if (Phaser.Input.Keyboard.JustDown(this._keys.FOUR))  this._selectTool(3);
    if (Phaser.Input.Keyboard.JustDown(this._keys.E))     this._interact();

    if (this._dialogueActive) return;

    const speed = 3;
    let dx = 0, dy = 0;
    if (this._keys.A.isDown || this._keys.LEFT.isDown)  dx = -speed;
    if (this._keys.D.isDown || this._keys.RIGHT.isDown) dx = speed;
    if (this._keys.W.isDown || this._keys.UP.isDown)    dy = -speed;
    if (this._keys.S.isDown || this._keys.DOWN.isDown)  dy = speed;

    if (dx || dy) {
      this._playerX = Phaser.Math.Clamp(this._playerX + dx, 50, W - 50);
      this._playerY = Phaser.Math.Clamp(this._playerY + dy, 250, GROUND_Y - 10);
      this._moving = true;
    } else {
      this._moving = false;
    }

    if (this._playerSpr) {
      this._playerSpr.setPosition(this._playerX, this._playerY);
      if (dx < 0) this._playerSpr.setFlipX(true);
      else if (dx > 0) this._playerSpr.setFlipX(false);

      const texKey = this._moving ? 'farm_char_walk' : 'farm_char_idle';
      if (this._playerSpr.texture.key !== texKey) this._playerSpr.setTexture(texKey);
    }

    this._updateHint();
  }

  /* ═══════════════════════════════════════════════════════
     SCENE BUILDING - rich layered farm using all assets
     ═══════════════════════════════════════════════════════ */
  _buildScene() {
    // sky gradient
    this.add.rectangle(W / 2, 140, W, 280, 0x7EC8E3).setDepth(0);
    this.add.rectangle(W / 2, 0, W, 60, 0x5AADE0).setOrigin(0.5, 0).setDepth(0);

    // clouds
    for (let i = 0; i < 4; i++) {
      const cx = 120 + i * 260 + Math.random() * 60;
      const cy = 40 + Math.random() * 60;
      const cloud = this.add.ellipse(cx, cy, 80 + Math.random() * 60, 24 + Math.random() * 14, 0xffffff, 0.7).setDepth(0);
      this.tweens.add({ targets: cloud, x: cloud.x + 40, duration: 8000 + Math.random() * 6000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    // distant rainbow (faint)
    this.add.image(W - 160, 80, 'farm_rainbow').setDisplaySize(200, 100).setAlpha(0.25).setDepth(0);

    // ground layers
    this.add.rectangle(W / 2, GROUND_Y + (H - GROUND_Y) / 2 + 20, W, H - GROUND_Y + 60, 0x5B8731).setDepth(0);
    this.add.rectangle(W / 2, GROUND_Y, W, 8, 0x4A7028).setDepth(1);

    // grass tiles across ground
    const grassY = GROUND_Y + 4;
    for (let gx = 0; gx < W; gx += 48) {
      this.add.image(gx + 24, grassY + 12, 'farm_grass').setDisplaySize(50, 20).setAlpha(0.5).setDepth(1);
    }

    // dirt paths
    this.add.rectangle(400, GROUND_Y - 80, 300, 10, 0x8B6914, 0.3).setDepth(1);
    this.add.rectangle(650, GROUND_Y - 40, 10, 200, 0x8B6914, 0.25).setDepth(1);

    // ──── LEFT AREA: buildings ────
    this.add.image(90, 320, 'farm_barn').setDisplaySize(150, 130).setDepth(2);
    this.add.image(90, 250, 'farm_silo').setDisplaySize(40, 70).setDepth(2).setX(175);

    this.add.image(70, 490, 'farm_well2').setDisplaySize(50, 50).setDepth(2);
    this.add.image(170, 490, 'farm_toolshed').setDisplaySize(70, 60).setDepth(2);

    this.add.image(45, 330, 'farm_windmill2').setDisplaySize(70, 110).setDepth(3);

    this.add.image(30, 490, 'farm_mailbox').setDisplaySize(24, 32).setDepth(3);

    // farmhouse in far back
    this.add.image(140, 260, 'farm_farmhouse').setDisplaySize(80, 70).setAlpha(0.5).setDepth(1);

    // fences along left
    for (let fy = 350; fy < 530; fy += 40) {
      this.add.image(220, fy, 'farm_fence').setDisplaySize(40, 30).setDepth(2);
    }

    // barrel + chest near barn
    this.add.image(160, 400, 'farm_barrel').setDisplaySize(28, 32).setDepth(3);
    this.add.image(190, 405, 'farm_chest').setDisplaySize(30, 26).setDepth(3);
    this.add.image(135, 405, 'farm_bucket').setDisplaySize(22, 22).setDepth(3);

    // tractor parked
    this.add.image(50, 430, 'farm_tractor').setDisplaySize(60, 48).setDepth(2);

    // wheelbarrow
    this.add.image(230, 500, 'farm_wheelbarrow').setDisplaySize(36, 30).setDepth(3);

    // ──── CENTER: soil patches & crops ────
    // earth strip under soil
    this.add.rectangle(400, 375, 320, 70, 0x6B4226, 0.7).setStrokeStyle(1, 0x4A2A10).setDepth(1);

    this._soilPatches.forEach(p => this._drawSoilPatch(p));

    // decorative crops around patches
    this.add.image(240, 355, 'farm_corn').setDisplaySize(28, 40).setDepth(3);
    this.add.image(560, 355, 'farm_corn2').setDisplaySize(28, 40).setDepth(3);
    this.add.image(250, 410, 'farm_wheat2').setDisplaySize(26, 28).setDepth(2);
    this.add.image(550, 410, 'farm_wheat').setDisplaySize(26, 28).setDepth(2);

    // sunflowers
    this.add.image(260, 310, 'farm_sunflower').setDisplaySize(28, 40).setDepth(3);
    this.add.image(540, 310, 'farm_sunflower').setDisplaySize(24, 36).setDepth(3).setFlipX(true);

    // harvest baskets on ground
    this.add.image(350, 430, 'farm_vegbasket').setDisplaySize(28, 24).setDepth(2);
    this.add.image(460, 430, 'farm_fruitcrate').setDisplaySize(28, 24).setDepth(2);

    // scarecrow
    this.add.image(430, 300, 'farm_scarecrow').setDisplaySize(40, 56).setDepth(3);

    // ──── RIGHT AREA: animal pens ────
    // coop area
    this.add.image(870, 270, 'farm_coop2').setDisplaySize(80, 60).setDepth(2);

    // fence borders for pens
    for (let fy = 280; fy < 530; fy += 34) {
      this.add.image(710, fy, 'farm_fence').setDisplaySize(36, 26).setDepth(2);
    }
    this.add.image(870, 345, 'farm_fence').setDisplaySize(36, 26).setDepth(2);
    this.add.image(870, 445, 'farm_fence').setDisplaySize(36, 26).setDepth(2);

    // pen labels
    this.add.text(780, 275, 'Coop', { ...FONT, fontSize: '6px', color: '#ffe4a0', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(5);
    this.add.text(780, 375, 'Pasture', { ...FONT, fontSize: '6px', color: '#ffe4a0', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(5);
    this.add.text(780, 468, 'Stable', { ...FONT, fontSize: '6px', color: '#ffe4a0', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(5);

    // extra animals for atmosphere
    this.add.image(820, 320, 'farm_babychick').setDisplaySize(22, 22).setDepth(3);
    this.add.image(850, 325, 'farm_rooster').setDisplaySize(30, 30).setDepth(3);
    this.add.image(840, 420, 'farm_sheep2').setDisplaySize(32, 28).setDepth(3);
    this.add.image(820, 510, 'farm_horse').setDisplaySize(40, 38).setDepth(3);
    this.add.image(870, 510, 'farm_donkey').setDisplaySize(34, 32).setDepth(3);
    this.add.image(740, 520, 'farm_dog').setDisplaySize(28, 28).setDepth(3);

    // hay bales near stable
    this.add.image(910, 490, 'farm_haybaler').setDisplaySize(34, 28).setDepth(2);
    this.add.image(940, 500, 'farm_wheat_bundle').setDisplaySize(26, 30).setDepth(2);

    // beehive
    this.add.image(920, 300, 'farm_beehive').setDisplaySize(28, 32).setDepth(3);

    // egg on ground near coop
    this.add.image(860, 340, 'farm_egg').setDisplaySize(16, 16).setDepth(4);

    // milk + wool near animals
    this.add.image(730, 440, 'farm_milk').setDisplaySize(18, 22).setDepth(3);
    this.add.image(730, 410, 'farm_wool').setDisplaySize(20, 18).setDepth(3);

    // main interactable animals
    this._animalSprites = [];
    this._animals.forEach(a => {
      const spr = this.add.image(a.x, a.y, a.key).setDisplaySize(52, 52).setDepth(4).setInteractive({ useHandCursor: true });
      this._animalSprites.push(spr);
      this.tweens.add({
        targets: spr, y: a.y - 5, duration: 1200 + Math.random() * 800,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
      spr.on('pointerdown', () => {
        if (this._dialogueActive) return;
        if (this._interactCooldown > 0) return;
        this._interactCooldown = 400;
        this._interactAnimal(a);
      });
    });

    // ──── TREES along edges ────
    this.add.image(960, 280, 'farm_appletree').setDisplaySize(70, 80).setDepth(2);
    this.add.image(980, 400, 'farm_cherrytree').setDisplaySize(60, 70).setDepth(2);
    this.add.image(10, 260, 'farm_tree').setDisplaySize(50, 70).setDepth(2);

    // flowers + plant pots
    this.add.image(300, 440, 'farm_plantpot').setDisplaySize(20, 22).setDepth(3);
    this.add.image(500, 440, 'farm_flowervase').setDisplaySize(18, 22).setDepth(3);
    this.add.image(600, 490, 'farm_flowers').setDisplaySize(26, 24).setDepth(3);

    // fallen leaves
    this.add.image(620, 520, 'farm_fallenleaves').setDisplaySize(36, 20).setDepth(1);

    // greenhouse in background
    this.add.image(600, 285, 'farm_greenhouse').setDisplaySize(70, 55).setAlpha(0.7).setDepth(2);

    // market stall
    this.add.image(610, 340, 'farm_market').setDisplaySize(56, 50).setDepth(2);

    // butterfly floating
    const bfly = this.add.image(500, 280, 'farm_butterfly').setDisplaySize(18, 18).setDepth(6);
    this.tweens.add({ targets: bfly, x: 600, y: 300, duration: 4000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // bee near beehive
    const bee = this.add.image(910, 285, 'farm_bee').setDisplaySize(14, 14).setDepth(6);
    this.tweens.add({ targets: bee, x: 940, y: 270, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // fog at ground level
    const fog = this.add.image(W / 2, GROUND_Y + 30, 'farm_fog').setDisplaySize(W, 60).setAlpha(0.15).setDepth(5);
    this.tweens.add({ targets: fog, alpha: 0.05, duration: 5000, yoyo: true, repeat: -1 });

    // ──── PLAYER ────
    this._playerSpr = this.add.image(this._playerX, this._playerY, 'farm_char_idle')
      .setDisplaySize(48, 64).setDepth(10);

    // ──── HINT TEXT ────
    this._hintText = this.add.text(W / 2, 240, '', {
      ...FONT, fontSize: '9px', color: '#ffe066', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(50).setAlpha(0);
  }

  _drawSoilPatch(p) {
    if (p._gfx) p._gfx.forEach(g => g.destroy());
    p._gfx = [];

    const col = p.state === 'empty'   ? 0x5C3A1A :
                p.state === 'tilled'  ? 0x7A4E2C :
                p.state === 'planted' ? 0x4A7028 : 0x2E6A1E;
    const rect = this.add.rectangle(p.x, p.y, 80, 60, col, 0.95)
      .setStrokeStyle(2, 0x3A2A14).setDepth(2).setInteractive({ useHandCursor: true });
    rect.on('pointerdown', () => {
      if (this._dialogueActive) return;
      if (this._interactCooldown > 0) return;
      this._interactCooldown = 400;
      this._interactSoil(p);
    });
    p._gfx.push(rect);

    if (p.state === 'tilled') {
      for (let i = 0; i < 3; i++) {
        const line = this.add.rectangle(p.x - 20 + i * 20, p.y, 2, 40, 0x4A3018, 0.6).setDepth(3);
        p._gfx.push(line);
      }
    }

    if (p.state === 'planted') {
      const seed = this.add.image(p.x, p.y, 'farm_treesapling').setDisplaySize(30, 34).setDepth(3);
      p._gfx.push(seed);
    }

    if (p.state === 'watered') {
      const crop = this.add.image(p.x, p.y - 6, 'farm_potato').setDisplaySize(38, 40).setDepth(3);
      p._gfx.push(crop);
      const sparkle = this.add.text(p.x + 20, p.y - 20, '💧', { fontSize: '12px' }).setDepth(4);
      p._gfx.push(sparkle);
    }

    const label = p.state === 'empty'   ? '[ Soil ]' :
                  p.state === 'tilled'  ? '[ Tilled ]' :
                  p.state === 'planted' ? '[ Planted ]' : '[ Ready! ]';
    const labelColor = p.state === 'watered' ? '#aaffaa' : '#ccc';
    const txt = this.add.text(p.x, p.y + 38, label, {
      ...FONT, fontSize: '5px', color: labelColor, stroke: '#000', strokeThickness: 1
    }).setOrigin(0.5).setDepth(5);
    p._gfx.push(txt);
  }

  _drawToolbar() {
    if (this._toolbarGfx) this._toolbarGfx.forEach(g => g.destroy());
    this._toolbarGfx = [];

    const bg = this.add.rectangle(200, UI_Y, 360, 64, 0x0a0a1a, 0.92)
      .setStrokeStyle(2, 0x445533).setDepth(100);
    this._toolbarGfx.push(bg);

    const title = this.add.text(28, UI_Y - 28, 'TOOLS', {
      ...FONT, fontSize: '6px', color: '#7a9944'
    }).setDepth(101);
    this._toolbarGfx.push(title);

    TOOLS.forEach((t, i) => {
      const bx = 80 + i * 80;
      const sel = i === this._toolIdx;
      const slot = this.add.rectangle(bx, UI_Y, 68, 54, sel ? 0x2a3a1a : 0x12121a, 0.95)
        .setStrokeStyle(sel ? 3 : 1, sel ? 0xaaee55 : 0x334444).setDepth(101)
        .setInteractive({ useHandCursor: true });
      slot.on('pointerdown', () => this._selectTool(i));
      this._toolbarGfx.push(slot);

      const img = this.add.image(bx, UI_Y - 8, t.key).setDisplaySize(32, 32).setDepth(102);
      this._toolbarGfx.push(img);

      const num = this.add.text(bx - 28, UI_Y - 24, `[${i + 1}]`, {
        ...FONT, fontSize: '5px', color: sel ? '#aaee55' : '#555'
      }).setDepth(102);
      this._toolbarGfx.push(num);

      const lbl = this.add.text(bx, UI_Y + 22, t.label, {
        ...FONT, fontSize: '6px', color: sel ? '#aaee55' : '#888'
      }).setOrigin(0.5).setDepth(102);
      this._toolbarGfx.push(lbl);
    });
  }

  _drawCardTray() {
    if (this._trayGfx) this._trayGfx.forEach(g => g.destroy());
    this._trayGfx = [];

    const tx = 440, tw = W - tx - 10;
    const bg = this.add.rectangle(tx + tw / 2, UI_Y, tw, 64, 0x0a0a1a, 0.92)
      .setStrokeStyle(2, 0x553355).setDepth(100);
    this._trayGfx.push(bg);

    const needed = 8;
    const title = this.add.text(tx + 12, UI_Y - 28, `CARDS  (${this._earnedCards.length}/${needed})`, {
      ...FONT, fontSize: '6px', color: '#aa88cc'
    }).setDepth(101);
    this._trayGfx.push(title);

    if (this._earnedCards.length === 0) {
      const empty = this.add.text(tx + tw / 2, UI_Y + 4, 'Tend the farm to discover cards...', {
        ...FONT, fontSize: '5px', color: '#444'
      }).setOrigin(0.5).setDepth(101);
      this._trayGfx.push(empty);
    } else {
      this._earnedCards.forEach((cardId, i) => {
        const card = getCardById(cardId);
        const cx = tx + 40 + i * 58;
        const slot = this.add.rectangle(cx, UI_Y, 48, 52, 0x1a1a2a, 0.95)
          .setStrokeStyle(1, 0x556677).setDepth(101);
        this._trayGfx.push(slot);

        const texKey = card ? getCardTextureKey(this, card) : null;
        if (texKey && this.textures.exists(texKey)) {
          const img = this.add.image(cx, UI_Y - 4, texKey).setDisplaySize(36, 36).setDepth(102);
          this._trayGfx.push(img);
        }
        const nm = this.add.text(cx, UI_Y + 22, (card?.name || '?').slice(0, 6), {
          ...FONT, fontSize: '4px', color: '#bbb'
        }).setOrigin(0.5).setDepth(102);
        this._trayGfx.push(nm);
      });
    }
  }

  _selectTool(idx) {
    if (this._dialogueActive) return;
    this._toolIdx = idx;
    this._drawToolbar();
    playSwoosh();
  }

  /* ═══════ CLICK HANDLING ═══════ */
  _onPointerDown(ptr) {
    if (this._dialogueActive) {
      this._advanceDialogue();
      return;
    }
    if (this._portalOpen && this._portalHitArea) {
      const dist = Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, this._portalHitArea.x, this._portalHitArea.y);
      if (dist < 60) { this._enterPortal(); return; }
    }
  }

  /* ═══════ PROXIMITY HINTS ═══════ */
  _updateHint() {
    const near = this._getNearbyInteractable();
    if (near) {
      this._hintText.setText(`[E] ${near.hint}`).setAlpha(1);
    } else {
      this._hintText.setAlpha(0);
    }
  }

  _getNearbyInteractable() {
    const px = this._playerX, py = this._playerY;
    const tool = TOOLS[this._toolIdx];

    for (const p of this._soilPatches) {
      if (Phaser.Math.Distance.Between(px, py, p.x, p.y) < 80) {
        if (tool.id === 'hoe' && p.state === 'empty')     return { type: 'soil', patch: p, hint: 'Hoe soil' };
        if (tool.id === 'seeds' && p.state === 'tilled')  return { type: 'soil', patch: p, hint: 'Plant seeds' };
        if (tool.id === 'water' && p.state === 'planted') return { type: 'soil', patch: p, hint: 'Water plants' };
        if (p.state === 'watered')                        return { type: 'soil', patch: p, hint: 'Harvest' };
        const need = p.state === 'empty' ? 'Hoe(1)' : p.state === 'tilled' ? 'Seeds(2)' : 'Water(3)';
        return { type: 'soil_wrong', hint: `Need: ${need}` };
      }
    }

    for (const a of this._animals) {
      if (Phaser.Math.Distance.Between(px, py, a.x, a.y) < 90) {
        if (tool.id === 'feed') return { type: 'animal', animal: a, hint: `Feed ${a.type}` };
        return { type: 'animal_wrong', hint: 'Need: Feed (key 4)' };
      }
    }

    if (this._portalOpen && this._portalHitArea) {
      if (Phaser.Math.Distance.Between(px, py, this._portalHitArea.x, this._portalHitArea.y) < 80) {
        return { type: 'portal', hint: 'Enter portal' };
      }
    }

    return null;
  }

  /* ═══════ INTERACTION ═══════ */
  _interact() {
    if (this._dialogueActive) { this._advanceDialogue(); return; }
    if (this._interactCooldown > 0) return;
    this._interactCooldown = 400;

    const near = this._getNearbyInteractable();
    if (!near) return;

    if (near.type === 'soil')        this._interactSoil(near.patch);
    else if (near.type === 'animal') this._interactAnimal(near.animal);
    else if (near.type === 'portal') this._enterPortal();
  }

  _interactSoil(patch) {
    const tool = TOOLS[this._toolIdx];

    if (!this._eventFlags.firstSoil) {
      this._eventFlags.firstSoil = true;
      this._showDialogue(DIALOGUES.firstSoil);
    }

    if (tool.id === 'hoe' && patch.state === 'empty') {
      patch.state = 'tilled';
      playImpact();
      this._playerSpr.setTexture('farm_char_hands');
      this.time.delayedCall(300, () => this._playerSpr.setTexture('farm_char_idle'));
    } else if (tool.id === 'seeds' && patch.state === 'tilled') {
      patch.state = 'planted';
      playSwoosh();
    } else if (tool.id === 'water' && patch.state === 'planted') {
      patch.state = 'watered';
      playSwoosh();
      this._tryCardDrop('potato');
    } else if (patch.state === 'watered') {
      patch.state = 'empty';
      playImpact();
    }
    this._drawSoilPatch(patch);
  }

  _interactAnimal(animal) {
    if (!this._eventFlags.firstAnimal) {
      this._eventFlags.firstAnimal = true;
      this._showDialogue(DIALOGUES.firstAnimal);
    }

    const spr = this._animalSprites[this._animals.indexOf(animal)];
    if (spr) {
      this.tweens.add({
        targets: spr, scaleX: 1.25, scaleY: 1.25, duration: 140,
        yoyo: true, ease: 'Back.easeOut'
      });
    }
    playSwoosh();

    this._playerSpr.setTexture('farm_char_hands');
    this.time.delayedCall(350, () => this._playerSpr.setTexture('farm_char_idle'));

    this._tryCardDrop(animal.type);
  }

  /* ═══════ CARD DROPS ═══════ */
  _tryCardDrop(type) {
    const drop = CARD_DROPS[type];
    if (!drop) return;

    const count = this._earnedCards.filter(id => id === drop.id).length;
    if (count >= 2) return;

    this._attempts[type]++;
    const baseRate = 0.06;
    const rateIncrease = 0.03;
    const chance = Math.min(baseRate + (this._attempts[type] - 1) * rateIncrease, 0.40);

    if (Math.random() < chance) {
      this._attempts[type] = 0;
      this._earnCard(drop);
    }
  }

  _earnCard(drop) {
    this._earnedCards.push(drop.id);
    this._drawCardTray();
    this._playGlitchEffect(drop);

    const total = this._earnedCards.length;
    if (total === 1) {
      this.time.delayedCall(900, () => this._showDialogue(DIALOGUES.firstCard));
    } else if (total === 2) {
      this.time.delayedCall(900, () => this._showDialogue(DIALOGUES.secondCard));
    } else if (total < 8) {
      this.time.delayedCall(700, () => {
        const line = DIALOGUES.laterCards[Math.floor(Math.random() * DIALOGUES.laterCards.length)];
        this._showDialogue([line]);
      });
    }

    if (this._earnedCards.length >= 8 && !this._ladyLuckDone) {
      this._ladyLuckDone = true;
      this.time.delayedCall(1800, () => this._triggerLadyLuck());
    }

    const col = loadCollection() || [];
    col.push(drop.id);
    saveCollection(col);
  }

  _playGlitchEffect(drop) {
    playImpact();
    this.cameras.main.shake(250, 0.01);

    // white flash
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.35).setDepth(200);
    this.tweens.add({ targets: flash, alpha: 0, duration: 300, onComplete: () => flash.destroy() });

    // horizontal glitch lines
    for (let i = 0; i < 10; i++) {
      const line = this.add.rectangle(
        Math.random() * W, Math.random() * H,
        80 + Math.random() * 400, 2 + Math.random() * 3,
        0xffffff, 0.5 + Math.random() * 0.5
      ).setDepth(201);
      this.time.delayedCall(100 + Math.random() * 100, () => line.destroy());
    }

    // dark static overlay
    const noise = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.12).setDepth(199);
    this.time.delayedCall(350, () => noise.destroy());

    // card discovery banner
    const banner = this.add.rectangle(W / 2, H / 2 - 80, 350, 40, 0x1a0a2a, 0.95)
      .setStrokeStyle(2, 0xcc44cc).setDepth(210);
    const txt = this.add.text(W / 2, H / 2 - 80, `⚡ ${drop.name.toUpperCase()} CARD DISCOVERED ⚡`, {
      ...FONT, fontSize: '10px', color: '#ff6644', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(211);
    this.tweens.add({
      targets: [banner, txt], y: '-=50', alpha: 0, duration: 2000,
      ease: 'Power2.Out', onComplete: () => { banner.destroy(); txt.destroy(); }
    });
  }

  /* ═══════ DIALOGUE SYSTEM ═══════ */
  _showDialogue(lines) {
    this._dialogueQueue = [...lines];
    this._dialogueActive = true;
    this._showNextLine();
  }

  _showNextLine() {
    if (this._dlgGfx) { this._dlgGfx.forEach(g => g.destroy()); this._dlgGfx = null; }

    if (this._dialogueQueue.length === 0) {
      this._dialogueActive = false;
      return;
    }

    const line = this._dialogueQueue.shift();
    const isLady = line.startsWith('Lady Luck:');
    const isMystery = line.startsWith('???:');
    const isSystem = line.startsWith('(');
    const color = isLady ? '#cc88ff' : isMystery ? '#ffcc44' : isSystem ? '#aaa' : '#88ccff';
    const bgCol = isLady ? 0x1a0a2a : 0x0a1a2a;
    const border = isLady ? 0x8844cc : 0x335577;

    this._dlgGfx = [];

    const bgH = 70;
    const bgY = H / 2 + 160;
    const bg = this.add.rectangle(W / 2, bgY, 700, bgH, bgCol, 0.96)
      .setStrokeStyle(2, border).setDepth(500);

    const txt = this.add.text(W / 2, bgY, line, {
      ...FONT, fontSize: '8px', color, wordWrap: { width: 640 }, lineSpacing: 4
    }).setOrigin(0.5).setDepth(501);

    const hint = this.add.text(W / 2 + 330, bgY + 28, 'click / [E]', {
      ...FONT, fontSize: '5px', color: '#555'
    }).setOrigin(1, 0.5).setDepth(501);

    this._dlgGfx = [bg, txt, hint];
  }

  _advanceDialogue() {
    this._showNextLine();
  }

  /* ═══════ LADY LUCK EVENT ═══════ */
  _triggerLadyLuck() {
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(400);
    this.tweens.add({ targets: overlay, alpha: 0.6, duration: 2000 });

    this.cameras.main.shake(500, 0.005);

    this.time.delayedCall(2200, () => {
      const glow = this.add.circle(W / 2, 220, 50, 0xcc88ff, 0.7).setDepth(410);
      this.tweens.add({
        targets: glow, scaleX: 2.5, scaleY: 2.5, alpha: 0.2,
        duration: 1500, yoyo: true, repeat: -1
      });

      const glow2 = this.add.circle(W / 2, 220, 25, 0xffffff, 0.4).setDepth(411);
      this.tweens.add({
        targets: glow2, scaleX: 1.5, scaleY: 1.5, alpha: 0.1,
        duration: 800, yoyo: true, repeat: -1
      });

      const goddess = this.add.text(W / 2, 210, '✨👑✨', {
        fontSize: '42px'
      }).setOrigin(0.5).setDepth(412);
      this.tweens.add({ targets: goddess, y: 205, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

      const nameTag = this.add.text(W / 2, 260, 'Lady Luck', {
        ...FONT, fontSize: '12px', color: '#cc88ff', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setDepth(412);

      this.time.delayedCall(1000, () => {
        this._showDialogue(DIALOGUES.ladyLuck);
        this._waitForDialogueEnd(() => {
          const col = loadCollection() || [];
          col.push('bd2_lady_luck');
          saveCollection(col);
          this._earnedCards.push('bd2_lady_luck');
          this._drawCardTray();

          this._playGlitchEffect({ name: 'Lady Luck' });

          this.time.delayedCall(1500, () => {
            glow.destroy();
            glow2.destroy();
            goddess.destroy();
            nameTag.destroy();
            this._openPortal();
          });
        });
      });
    });
  }

  _waitForDialogueEnd(cb) {
    if (!this._dialogueActive) { cb(); return; }
    const evt = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (!this._dialogueActive) { evt.remove(); cb(); }
      }
    });
  }

  _openPortal() {
    this._portalOpen = true;
    this._portalHitArea = { x: W / 2, y: 340 };

    const px = W / 2, py = 340;

    const outer = this.add.circle(px, py, 55, 0x4400cc, 0.25).setDepth(400);
    const mid = this.add.circle(px, py, 35, 0x8844ff, 0.5).setDepth(401);
    const core = this.add.circle(px, py, 15, 0xffffff, 0.85).setDepth(402);

    this.tweens.add({ targets: outer, scaleX: 1.4, scaleY: 1.4, alpha: 0.1, duration: 1200, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: mid, angle: 360, duration: 3000, repeat: -1 });
    this.tweens.add({ targets: core, scaleX: 1.3, scaleY: 1.3, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });

    const label = this.add.text(px, py + 70, 'ENTER PORTAL', {
      ...FONT, fontSize: '10px', color: '#cc88ff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(403);
    this.tweens.add({ targets: label, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

    // shooting star celebration
    const star = this.add.image(100, 40, 'farm_shootingstar').setDisplaySize(50, 30).setAlpha(0).setDepth(410);
    this.tweens.add({ targets: star, x: 600, y: 120, alpha: 1, duration: 1200, onComplete: () => {
      this.tweens.add({ targets: star, alpha: 0, duration: 500, onComplete: () => star.destroy() });
    }});

    localStorage.setItem('farm_completed', '1');
  }

  _enterPortal() {
    this.cameras.main.fadeOut(1000, 255, 255, 255);
    this.time.delayedCall(1100, () => {
      this.scene.start('Hub');
    });
  }
}
