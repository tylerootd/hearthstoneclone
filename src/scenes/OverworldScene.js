import Phaser from 'phaser';
import { getNpcList, getCardById } from '../data/cardPool.js';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { loadProgression, xpToNext } from '../data/progression.js';
import { getNpcDeck } from '../data/npcDecks.js';
import { generateEnemyDeck } from '../game/battleEngine.js';

const TILE = 32;
const MAP_W = 40, MAP_H = 30;
const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const SPEED = 160;
const INTERACT_DIST = 60;

const FONT = { fontFamily: '"Press Start 2P", monospace, Arial' };

const C = {
  GRASS:     0x3a7d44, GRASS_ALT: 0x327038, PATH: 0x8b8678,
  WALL:      0x4a4a5a, WATER:     0x2255aa, WATER_EDGE: 0x3366bb,
  BUILDING:  0x5a4a3a, ROOF:      0x8b3a3a, DOOR: 0x3a2a1a,
  TREE_TRUNK:0x5a3a1a, TREE_LEAF: 0x1a6a2a, TREE_DARK: 0x145520
};

export default class OverworldScene extends Phaser.Scene {
  constructor() { super('Overworld'); }

  create(data) {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.drawMap();
    this.createWalls();
    this.createPlayer(data);
    this.createNpcs();
    this.setupCamera();
    this.setupInput();
    this.nearNpc = null;
    this.promptText = null;
    this.drawHud();
  }

  drawMap() {
    const gfx = this.add.graphics();

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const alt = ((x + y) % 3 === 0) || ((x * 7 + y * 13) % 11 === 0);
        gfx.fillStyle(alt ? C.GRASS_ALT : C.GRASS);
        gfx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // paths
    const paths = [
      { x: 10, y: 3, w: 20, h: 2 },
      { x: 19, y: 3, w: 2, h: 24 },
      { x: 4, y: 12, w: 32, h: 2 },
      { x: 6, y: 5, w: 2, h: 18 },
      { x: 32, y: 5, w: 2, h: 18 },
      { x: 10, y: 19, w: 20, h: 2 },
    ];
    paths.forEach(p => {
      gfx.fillStyle(C.PATH);
      gfx.fillRect(p.x * TILE, p.y * TILE, p.w * TILE, p.h * TILE);
      gfx.fillStyle(0x7a7668);
      for (let i = 0; i < p.w; i++) for (let j = 0; j < p.h; j++) {
        if ((i + j) % 4 === 0) gfx.fillRect((p.x + i) * TILE + 4, (p.y + j) * TILE + 4, 6, 6);
      }
    });

    // water pond
    gfx.fillStyle(C.WATER);
    gfx.fillRoundedRect(26 * TILE, 16 * TILE, 6 * TILE, 4 * TILE, 16);
    gfx.fillStyle(C.WATER_EDGE);
    gfx.fillRoundedRect(26.2 * TILE, 16.2 * TILE, 3 * TILE, 2 * TILE, 10);

    // buildings
    const buildings = [
      { x: 3, y: 3, w: 5, h: 4, label: 'Inn' },
      { x: 16, y: 5, w: 6, h: 4, label: 'Arena' },
      { x: 30, y: 3, w: 5, h: 4, label: 'Tower' },
      { x: 3, y: 17, w: 5, h: 4, label: 'Shop' },
      { x: 15, y: 22, w: 8, h: 4, label: 'Castle' }
    ];
    this.buildingRects = buildings;

    buildings.forEach(b => {
      const bx = b.x * TILE, by = b.y * TILE, bw = b.w * TILE, bh = b.h * TILE;
      gfx.fillStyle(C.BUILDING);
      gfx.fillRect(bx, by, bw, bh);
      gfx.fillStyle(C.ROOF);
      gfx.fillRect(bx - 4, by - 8, bw + 8, 12);
      gfx.fillStyle(C.DOOR);
      gfx.fillRect(bx + bw / 2 - 8, by + bh - 16, 16, 16);
      gfx.lineStyle(1, 0x333333);
      gfx.strokeRect(bx, by, bw, bh);

      this.add.text(bx + bw / 2, by - 14, b.label, {
        ...FONT, fontSize: '8px', color: '#ddd', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(5);
    });

    // trees
    const treePositions = [
      [1,1],[2,2],[0,8],[1,14],[0,26],[2,28],[37,1],[38,3],[39,8],[38,14],
      [37,26],[39,28],[12,1],[28,1],[12,27],[28,27],[36,22],[37,24],
      [1,22],[2,24],[14,10],[25,10],[35,10],[14,16],[25,6],[10,16],
      [36,16],[0,0],[39,0],[0,29],[39,29],[10,1],[30,27],[20,27]
    ];
    treePositions.forEach(([tx, ty]) => {
      gfx.fillStyle(C.TREE_TRUNK);
      gfx.fillRect(tx * TILE + 12, ty * TILE + 16, 8, 16);
      gfx.fillStyle(C.TREE_LEAF);
      gfx.fillCircle(tx * TILE + 16, ty * TILE + 12, 14);
      gfx.fillStyle(C.TREE_DARK);
      gfx.fillCircle(tx * TILE + 14, ty * TILE + 10, 8);
    });
    this.treePositions = treePositions;

    // border walls
    gfx.fillStyle(C.WALL);
    gfx.fillRect(0, 0, WORLD_W, 2);
    gfx.fillRect(0, WORLD_H - 2, WORLD_W, 2);
    gfx.fillRect(0, 0, 2, WORLD_H);
    gfx.fillRect(WORLD_W - 2, 0, 2, WORLD_H);
  }

  createWalls() {
    this.walls = this.physics.add.staticGroup();

    // border
    this.addWall(0, -8, WORLD_W, 8);
    this.addWall(0, WORLD_H, WORLD_W, 8);
    this.addWall(-8, 0, 8, WORLD_H);
    this.addWall(WORLD_W, 0, 8, WORLD_H);

    // buildings
    this.buildingRects.forEach(b => {
      this.addWall(b.x * TILE, b.y * TILE, b.w * TILE, b.h * TILE);
    });

    // trees
    this.treePositions.forEach(([tx, ty]) => {
      this.addWall(tx * TILE + 8, ty * TILE + 12, 16, 20);
    });

    // water
    this.addWall(26 * TILE, 16 * TILE, 6 * TILE, 4 * TILE);
  }

  addWall(x, y, w, h) {
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0).setOrigin(0.5);
    this.physics.add.existing(r, true);
    this.walls.add(r);
  }

  createPlayer(data) {
    const startX = data?.playerX ?? 20 * TILE;
    const startY = data?.playerY ?? 13 * TILE;

    this.player = this.add.rectangle(startX, startY, 20, 24, 0x4488ff).setDepth(10);
    this.add.rectangle(0, -6, 12, 12, 0xffcc88).setDepth(11);
    const head = this.add.circle(startX, startY - 6, 8, 0xffcc88).setDepth(11);

    this.playerGroup = this.add.container(startX, startY, [
      this.add.rectangle(0, 0, 20, 24, 0x4488ff),
      this.add.circle(0, -14, 8, 0xffcc88),
      this.add.rectangle(0, -14, 4, 4, 0x222222),
    ]).setDepth(10);

    this.physics.add.existing(this.playerGroup);
    this.playerGroup.body.setSize(20, 24);
    this.playerGroup.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.playerGroup, this.walls);

    this.playerLabel = this.add.text(startX, startY - 30, 'You', {
      ...FONT, fontSize: '7px', color: '#88ccff', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(15);
  }

  createNpcs() {
    this.npcs = [];
    const npcData = getNpcList();

    npcData.forEach(npc => {
      const x = npc.x * TILE + TILE / 2;
      const y = npc.y * TILE + TILE / 2;

      const card = getCardById(npc.portraitCard);
      const spriteKey = card?.sprite ? 'sprite_' + card.sprite.replace('.png', '') : null;

      let visual;
      if (spriteKey && this.textures.exists(spriteKey)) {
        visual = this.add.image(x, y, spriteKey).setDisplaySize(28, 28).setDepth(8);
      } else {
        visual = this.add.rectangle(x, y, 24, 28, 0xcc6644).setDepth(8);
      }

      const border = this.add.circle(x, y, 18, 0x000000, 0).setStrokeStyle(2, 0xccaa44).setDepth(7);

      const label = this.add.text(x, y - 24, npc.name, {
        ...FONT, fontSize: '7px', color: '#ffcc44', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(15);

      const lvlBadge = this.add.text(x + 16, y - 18, `Lv${npc.level}`, {
        ...FONT, fontSize: '6px', color: '#aaa', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(15);

      this.npcs.push({ data: npc, x, y, visual, label, border, lvlBadge });
    });
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.playerGroup, true, 0.08, 0.08);
    this.cameras.main.setZoom(1);
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard.addKey('W'),
      A: this.input.keyboard.addKey('A'),
      S: this.input.keyboard.addKey('S'),
      D: this.input.keyboard.addKey('D')
    };
    this.keyE = this.input.keyboard.addKey('E');
    this.keyEPressed = false;
  }

  drawHud() {
    const { level, xp } = loadProgression();
    const needed = xpToNext(level);

    this.hudBg = this.add.rectangle(120, 20, 220, 32, 0x000000, 0.7).setScrollFactor(0).setDepth(50);
    this.hudLevel = this.add.text(20, 12, `LV ${level}`, {
      ...FONT, fontSize: '10px', color: '#e6b422'
    }).setScrollFactor(0).setDepth(51);

    const barW = 120;
    this.hudBarBg = this.add.rectangle(100, 24, barW, 8, 0x333333).setScrollFactor(0).setDepth(51).setOrigin(0, 0.5);
    const fill = Math.max(2, (xp / needed) * barW);
    this.hudBarFill = this.add.rectangle(100, 24, fill, 8, 0x44aaff).setScrollFactor(0).setDepth(52).setOrigin(0, 0.5);
    this.hudXpText = this.add.text(225, 24, `${xp}/${needed}`, {
      ...FONT, fontSize: '7px', color: '#aaa'
    }).setScrollFactor(0).setDepth(51).setOrigin(0, 0.5);

    const backBtn = this.add.text(980, 20, '[ESC] Hub', {
      ...FONT, fontSize: '8px', color: '#888', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(51).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.scene.start('Hub'));
    this.input.keyboard.addKey('ESC').on('down', () => this.scene.start('Hub'));
  }

  update() {
    const body = this.playerGroup.body;
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -SPEED;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = SPEED;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -SPEED;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    body.setVelocity(vx, vy);

    this.playerLabel.setPosition(this.playerGroup.x, this.playerGroup.y - 30);

    // NPC proximity
    let closest = null;
    let closestDist = INTERACT_DIST;
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.playerGroup.x, this.playerGroup.y, npc.x, npc.y);
      if (d < closestDist) { closest = npc; closestDist = d; }
      npc.border.setStrokeStyle(2, d < INTERACT_DIST ? 0x66ff66 : 0xccaa44);
    }

    if (closest && closest !== this.nearNpc) {
      this.nearNpc = closest;
      if (this.promptText) this.promptText.destroy();
      this.promptText = this.add.text(closest.x, closest.y + 28, '[E] Duel', {
        ...FONT, fontSize: '8px', color: '#44ff44', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(20);
    } else if (!closest && this.nearNpc) {
      this.nearNpc = null;
      if (this.promptText) { this.promptText.destroy(); this.promptText = null; }
    }

    // interact
    if (this.keyE.isDown && !this.keyEPressed && this.nearNpc) {
      this.keyEPressed = true;
      this.startDuel(this.nearNpc.data);
    }
    if (this.keyE.isUp) this.keyEPressed = false;
  }

  startDuel(npc) {
    const playerDeck = loadDeck();
    if (!playerDeck || playerDeck.length < 30) {
      this.showMessage('Build a 30-card deck first!');
      return;
    }

    const enemyDeck = getNpcDeck(npc) || generateEnemyDeck();
    const artifacts = loadArtifacts();

    this.scene.start('Battle', {
      playerDeck,
      enemyDeck,
      artifacts,
      npcId: npc.id,
      npcName: npc.name,
      xpReward: npc.xpReward || 20,
      returnTo: 'Overworld',
      playerX: this.playerGroup.x,
      playerY: this.playerGroup.y
    });
  }

  showMessage(msg) {
    const t = this.add.text(this.playerGroup.x, this.playerGroup.y - 50, msg, {
      ...FONT, fontSize: '9px', color: '#ff4444', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(100);
    this.time.delayedCall(2000, () => t.destroy());
  }
}
