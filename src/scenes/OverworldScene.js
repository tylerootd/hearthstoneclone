import Phaser from 'phaser';
import { getNpcList, getCardById } from '../data/cardPool.js';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { loadProgression, xpToNext } from '../data/progression.js';
import { getNpcDeck } from '../data/npcDecks.js';
import { generateEnemyDeck } from '../game/battleEngine.js';
import { addResource, loadResources, RES, RES_META } from '../data/resources.js';

const TILE = 16;
const MAP_W = 80, MAP_H = 60;
const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const SPEED = 120;
const INTERACT_DIST = 24;
const ZOOM = 2;

const FONT = { fontFamily: '"Press Start 2P", monospace' };

const T = { GRASS: 0, GRASS2: 1, PATH: 2, WATER: 3, SAND: 4, WALL: 5, DARK: 6, BRIDGE: 7 };
const TCOL = {
  [T.GRASS]:  [0x3a7d44, 0x327038], [T.GRASS2]: [0x4a8d54, 0x3c7d44],
  [T.PATH]:   [0x9a8868, 0x8a7858], [T.WATER]:  [0x2860a8, 0x3070b8],
  [T.SAND]:   [0xc4a050, 0xb49040], [T.WALL]:   [0x4a4a5a, 0x3a3a4a],
  [T.DARK]:   [0x2a3a2a, 0x1e2e1e], [T.BRIDGE]: [0x8a6a3a, 0x7a5a2a]
};

function buildMap() {
  const m = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W).fill(T.GRASS));

  for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) {
    if (x < 2 || x >= MAP_W - 2 || y < 2 || y >= MAP_H - 2) m[y][x] = T.WALL;
  }

  const fillRect = (type, x1, y1, w, h) => {
    for (let yy = y1; yy < y1 + h && yy < MAP_H; yy++)
      for (let xx = x1; xx < x1 + w && xx < MAP_W; xx++) m[yy][xx] = type;
  };

  // main paths (crossroads)
  fillRect(T.PATH, 10, 28, 60, 3);
  fillRect(T.PATH, 38, 5, 3, 50);

  // side paths
  fillRect(T.PATH, 10, 15, 3, 13);
  fillRect(T.PATH, 65, 15, 3, 13);
  fillRect(T.PATH, 10, 42, 3, 13);
  fillRect(T.PATH, 65, 42, 3, 13);
  fillRect(T.PATH, 10, 15, 58, 3);
  fillRect(T.PATH, 10, 53, 58, 3);

  // village plaza
  fillRect(T.SAND, 30, 22, 20, 16);
  fillRect(T.PATH, 32, 24, 16, 12);

  // forest area (NW) - dark grass
  fillRect(T.DARK, 3, 3, 25, 22);

  // rocky area (NE) - sandy
  fillRect(T.SAND, 48, 3, 30, 22);

  // herb meadow (SW) - light grass
  fillRect(T.GRASS2, 3, 38, 25, 20);

  // crystal caves (SE) - dark
  fillRect(T.DARK, 52, 38, 26, 20);

  // water features
  fillRect(T.WATER, 16, 8, 6, 5);
  fillRect(T.WATER, 58, 44, 8, 5);
  fillRect(T.BRIDGE, 18, 10, 2, 1);

  // scatter some grass variation
  for (let y = 3; y < MAP_H - 2; y++) {
    for (let x = 3; x < MAP_W - 2; x++) {
      if (m[y][x] === T.GRASS && Math.random() < 0.15) m[y][x] = T.GRASS2;
    }
  }

  return m;
}

function defineResourceNodes() {
  const nodes = [];
  const add = (type, x, y) => nodes.push({ type, x, y, alive: true, timer: 0 });

  // forest trees (NW)
  for (let i = 0; i < 18; i++) add(RES.WOOD, 4 + Math.floor(Math.random() * 22), 4 + Math.floor(Math.random() * 18));
  // scattered trees
  for (let i = 0; i < 8; i++) add(RES.WOOD, 42 + Math.floor(Math.random() * 4), 5 + Math.floor(Math.random() * 10));

  // rocky highlands (NE)
  for (let i = 0; i < 14; i++) add(RES.STONE, 50 + Math.floor(Math.random() * 26), 4 + Math.floor(Math.random() * 18));

  // herb meadow (SW)
  for (let i = 0; i < 16; i++) add(RES.HERB, 4 + Math.floor(Math.random() * 22), 39 + Math.floor(Math.random() * 17));

  // crystal caves (SE)
  for (let i = 0; i < 12; i++) add(RES.CRYSTAL, 54 + Math.floor(Math.random() * 22), 39 + Math.floor(Math.random() * 17));

  return nodes;
}

function defineBuildings() {
  return [
    { x: 32, y: 23, w: 5, h: 5, label: 'Inn',        col: 0x7a5030, npcIdx: 0 },
    { x: 43, y: 23, w: 5, h: 5, label: 'Arena',      col: 0x506080, npcIdx: 1 },
    { x: 32, y: 31, w: 5, h: 5, label: 'Shop',       col: 0x508050, npcIdx: 3 },
    { x: 43, y: 31, w: 5, h: 5, label: 'Forge',      col: 0x805050, npcIdx: 4 },
    { x: 37, y: 17, w: 6, h: 5, label: 'Guild Hall', col: 0x606080, npcIdx: 2 }
  ];
}

export default class OverworldScene extends Phaser.Scene {
  constructor() { super('Overworld'); }

  create(data) {
    this.cameras.main.setZoom(ZOOM);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.map = buildMap();
    this.buildings = defineBuildings();
    this.drawTerrain();
    this.createBuildings();
    this.createWalls();
    this.resourceNodes = defineResourceNodes();
    this.createResourceSprites();
    this.createPlayer(data);
    this.createNpcs();
    this.setupCamera();
    this.setupInput();
    this.nearTarget = null;
    this.drawHud();
    this.gatherCooldown = 0;

    this.input.keyboard.on('keydown-ESC', () => this.tryExit());
    this.events.on('shutdown', () => this.destroyButtons());
  }

  drawTerrain() {
    const gfx = this.add.graphics().setDepth(0);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.map[y][x];
        const cols = TCOL[t] || TCOL[T.GRASS];
        const alt = ((x + y) % 2 === 0) ? 0 : 1;
        gfx.fillStyle(cols[alt]);
        gfx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // path decorations (subtle stone pattern)
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === T.PATH && (x * 7 + y * 13) % 9 === 0) {
          gfx.fillStyle(0x7a6848);
          gfx.fillRect(x * TILE + 3, y * TILE + 3, 5, 5);
        }
      }
    }
  }

  createBuildings() {
    const gfx = this.add.graphics().setDepth(2);
    const roofGfx = this.add.graphics().setDepth(12);

    this.buildings.forEach(b => {
      const bx = b.x * TILE, by = b.y * TILE, bw = b.w * TILE, bh = b.h * TILE;
      const wallT = TILE;
      const doorW = TILE * 2;
      const doorX = bx + Math.floor(bw / 2) - Math.floor(doorW / 2);
      b.doorX = doorX;
      b.doorY = by + bh;

      // interior floor
      gfx.fillStyle(0x5a4a3a);
      gfx.fillRect(bx + wallT, by + wallT, bw - wallT * 2, bh - wallT);
      // floor pattern
      for (let fy = by + wallT; fy < by + bh; fy += TILE) {
        for (let fx = bx + wallT; fx < bx + bw - wallT; fx += TILE) {
          if ((Math.floor(fx / TILE) + Math.floor(fy / TILE)) % 2 === 0) {
            gfx.fillStyle(0x504030);
            gfx.fillRect(fx, fy, TILE, TILE);
          }
        }
      }

      // left wall
      gfx.fillStyle(b.col);
      gfx.fillRect(bx, by, wallT, bh);
      // right wall
      gfx.fillRect(bx + bw - wallT, by, wallT, bh);
      // top wall
      gfx.fillRect(bx, by, bw, wallT);
      // bottom wall left of door
      gfx.fillRect(bx, by + bh - wallT, doorX - bx, wallT);
      // bottom wall right of door
      gfx.fillRect(doorX + doorW, by + bh - wallT, (bx + bw) - (doorX + doorW), wallT);

      // door mat
      gfx.fillStyle(0x8a6a4a);
      gfx.fillRect(doorX, by + bh - wallT, doorW, wallT);

      // wall outlines
      gfx.lineStyle(1, 0x222222);
      gfx.strokeRect(bx, by, bw, bh);

      // windows on top wall
      gfx.fillStyle(0x88aacc);
      gfx.fillRect(bx + wallT + 4, by + 4, 6, 6);
      if (bw > 4 * TILE) gfx.fillRect(bx + bw - wallT - 10, by + 4, 6, 6);

      // roof overhang (drawn above player so it overlaps when walking in)
      const roofCol = Phaser.Display.Color.ValueToColor(b.col).darken(30).color;
      roofGfx.fillStyle(roofCol, 0.85);
      roofGfx.fillRect(bx - 2, by - 6, bw + 4, wallT + 6);
      // roof trim
      roofGfx.fillStyle(Phaser.Display.Color.ValueToColor(b.col).darken(50).color, 0.9);
      roofGfx.fillRect(bx - 2, by - 6, bw + 4, 3);

      // label above roof
      this.add.text(bx + bw / 2, by - 10, b.label, {
        ...FONT, fontSize: '5px', color: '#ddd', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(15);
    });
  }

  createWalls() {
    this.walls = this.physics.add.staticGroup();

    // map border
    this.addWall(0, -4, WORLD_W, 4);
    this.addWall(0, WORLD_H, WORLD_W, 4);
    this.addWall(-4, 0, 4, WORLD_H);
    this.addWall(WORLD_W, 0, 4, WORLD_H);

    // border tiles
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] === T.WALL) this.addWall(x * TILE, y * TILE, TILE, TILE);
        if (this.map[y][x] === T.WATER) this.addWall(x * TILE, y * TILE, TILE, TILE);
      }
    }

    // buildings (walls with door gap)
    this.buildings.forEach(b => {
      const bx = b.x * TILE, by = b.y * TILE, bw = b.w * TILE, bh = b.h * TILE;
      const wt = TILE;
      const doorW = TILE * 2;
      const doorX = bx + Math.floor(bw / 2) - Math.floor(doorW / 2);

      // top wall
      this.addWall(bx, by, bw, wt);
      // left wall
      this.addWall(bx, by, wt, bh);
      // right wall
      this.addWall(bx + bw - wt, by, wt, bh);
      // bottom wall left of door
      if (doorX - bx > 0) this.addWall(bx, by + bh - wt, doorX - bx, wt);
      // bottom wall right of door
      const rightStart = doorX + doorW;
      if ((bx + bw) - rightStart > 0) this.addWall(rightStart, by + bh - wt, (bx + bw) - rightStart, wt);
    });
  }

  addWall(x, y, w, h) {
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0).setOrigin(0.5);
    this.physics.add.existing(r, true);
    this.walls.add(r);
  }

  createResourceSprites() {
    this.resGroup = this.add.group();
    this.resPhysics = this.physics.add.staticGroup();

    this.resourceNodes.forEach((node, i) => {
      const px = node.x * TILE + TILE / 2;
      const py = node.y * TILE + TILE / 2;

      let visual;
      const meta = RES_META[node.type];

      if (node.type === RES.WOOD) {
        // tree: trunk + canopy
        const trunk = this.add.rectangle(px, py + 4, 6, 12, 0x6a4420).setDepth(3);
        const canopy = this.add.circle(px, py - 6, 8, 0x2a7a2a).setDepth(4);
        const canopy2 = this.add.circle(px - 3, py - 4, 6, 0x358535).setDepth(4);
        visual = this.add.container(0, 0, [trunk, canopy, canopy2]).setDepth(4);
      } else if (node.type === RES.STONE) {
        const r1 = this.add.ellipse(px, py + 2, 14, 10, 0x778899).setDepth(3);
        const r2 = this.add.ellipse(px - 2, py - 2, 8, 7, 0x99aabb).setDepth(3);
        visual = this.add.container(0, 0, [r1, r2]).setDepth(3);
      } else if (node.type === RES.HERB) {
        if (this.textures.exists('ninja_bush')) {
          visual = this.add.image(px, py, 'ninja_bush').setDepth(3);
        } else {
          visual = this.add.circle(px, py, 6, 0x44aa44).setDepth(3);
        }
      } else {
        // crystal
        const c1 = this.add.triangle(px, py - 3, 0, 10, 5, 0, 10, 10, 0x9944ee).setDepth(3);
        const c2 = this.add.triangle(px + 4, py, 0, 8, 4, 0, 8, 8, 0xbb66ff).setDepth(3);
        visual = this.add.container(0, 0, [c1, c2]).setDepth(3);
      }

      // collision body
      const body = this.add.rectangle(px, py, 12, 12, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.resPhysics.add(body);

      node.visual = visual;
      node.body = body;
      node.px = px;
      node.py = py;
      node.idx = i;
    });
  }

  createPlayer(data) {
    const startX = data?.playerX ?? 39 * TILE + 8;
    const startY = data?.playerY ?? 29 * TILE + 8;

    if (this.textures.exists('ninja_player')) {
      this.player = this.physics.add.sprite(startX, startY, 'ninja_player', 0).setDepth(10);
      this.player.setSize(10, 12);
      this.player.setOffset(3, 4);

      this.anims.create({ key: 'walk_down', frames: this.anims.generateFrameNumbers('ninja_player', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_left', frames: this.anims.generateFrameNumbers('ninja_player', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_right', frames: this.anims.generateFrameNumbers('ninja_player', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_up', frames: this.anims.generateFrameNumbers('ninja_player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'idle_down', frames: [{ key: 'ninja_player', frame: 0 }], frameRate: 1 });
    } else {
      this.player = this.physics.add.sprite(startX, startY);
      this.player.setDepth(10);
      this.player.setSize(10, 12);
    }

    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.resPhysics);

    this.playerDir = 'down';
  }

  createNpcs() {
    this.npcs = [];
    const npcData = getNpcList();
    const skins = ['ninja_npc_samurai', 'ninja_npc_green'];

    npcData.forEach((npc, i) => {
      const x = npc.x * TILE + TILE / 2;
      const y = npc.y * TILE + TILE / 2;

      const skinKey = skins[i % skins.length];
      let visual;
      if (this.textures.exists(skinKey)) {
        visual = this.add.sprite(x, y, skinKey, 0).setDepth(8);
      } else {
        const card = getCardById(npc.portraitCard);
        const spriteKey = card?.sprite ? 'sprite_' + card.sprite.replace('.png', '') : null;
        if (spriteKey && this.textures.exists(spriteKey)) {
          visual = this.add.image(x, y, spriteKey).setDisplaySize(14, 14).setDepth(8);
        } else {
          visual = this.add.rectangle(x, y, 12, 14, 0xcc6644).setDepth(8);
        }
      }

      const label = this.add.text(x, y - 14, npc.name, {
        ...FONT, fontSize: '4px', color: '#ffcc44', stroke: '#000', strokeThickness: 1
      }).setOrigin(0.5).setDepth(15);

      const lvl = this.add.text(x, y + 12, `Lv${npc.level}`, {
        ...FONT, fontSize: '3px', color: '#aaa', stroke: '#000', strokeThickness: 1
      }).setOrigin(0.5).setDepth(15);

      // small collision body so player can stand nearby
      const body = this.add.rectangle(x, y, 8, 8, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.walls.add(body);

      this.npcs.push({ data: npc, x, y, visual, label, lvl });
    });
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
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
    this.keyEDown = false;
    this.escPending = false;
  }

  drawHud() {
    const { level, xp } = loadProgression();
    const needed = xpToNext(level);
    const res = loadResources();

    // level + xp bar
    this.hudGroup = this.add.group();
    const cam = this.cameras.main;
    const sw = cam.width / ZOOM;
    const sh = cam.height / ZOOM;

    this.hudBg = this.add.rectangle(0, 0, sw, 14, 0x000000, 0.6)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(50);
    this.hudLevel = this.add.text(4, 2, `LV${level}`, {
      ...FONT, fontSize: '5px', color: '#e6b422'
    }).setScrollFactor(0).setDepth(51);

    const barX = 40, barW = 50;
    this.add.rectangle(barX, 5, barW, 4, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);
    const fill = Math.max(1, (xp / needed) * barW);
    this.add.rectangle(barX, 5, fill, 4, 0x44aaff)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
    this.add.text(barX + barW + 4, 2, `${xp}/${needed}`, {
      ...FONT, fontSize: '4px', color: '#aaa'
    }).setScrollFactor(0).setDepth(51);

    // resources
    const resTypes = [RES.WOOD, RES.STONE, RES.HERB, RES.CRYSTAL];
    let rx = 160;
    resTypes.forEach(type => {
      const meta = RES_META[type];
      this.add.text(rx, 2, `${meta.icon}${res[type] || 0}`, {
        fontSize: '6px', color: meta.color
      }).setScrollFactor(0).setDepth(51);
      rx += 40;
    });

    // bottom bar with buttons (using DOM for reliable clicks at any zoom)
    this.createButtons();

    // interaction prompt (hidden initially)
    this.promptText = this.add.text(sw / 2, sh - 16, '', {
      ...FONT, fontSize: '5px', color: '#44ff44', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51);

    this.input.keyboard.addKey('C').on('down', () => {
      if (this.escPending) return;
      this.destroyButtons();
      this.scene.start('Crafting', {
        returnPlayerX: this.player.x,
        returnPlayerY: this.player.y
      });
    });
  }

  refreshHud() {
    if (this.hudBg) {
      this.hudBg.destroy();
      this.hudLevel.destroy();
    }
    this.children.list
      .filter(c => c.scrollFactorX === 0 && c.depth >= 50)
      .forEach(c => c.destroy());
    this.drawHud();
  }

  update(time, delta) {
    if (this.escPending) return;

    // movement
    const body = this.player.body;
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) { vx = -SPEED; this.playerDir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = SPEED; this.playerDir = 'right'; }
    if (this.cursors.up.isDown || this.wasd.W.isDown) { vy = -SPEED; this.playerDir = 'up'; }
    else if (this.cursors.down.isDown || this.wasd.S.isDown) { vy = SPEED; this.playerDir = 'down'; }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    body.setVelocity(vx, vy);

    // animation
    if (this.anims.exists('walk_' + this.playerDir)) {
      if (vx !== 0 || vy !== 0) {
        this.player.play('walk_' + this.playerDir, true);
      } else {
        this.player.play('idle_down', true);
      }
    }

    // gather cooldown
    if (this.gatherCooldown > 0) this.gatherCooldown -= delta;

    // respawn timers
    this.resourceNodes.forEach(node => {
      if (!node.alive) {
        node.timer -= delta;
        if (node.timer <= 0) {
          node.alive = true;
          if (node.visual) {
            if (node.visual.setVisible) node.visual.setVisible(true);
            else if (node.visual.list) node.visual.list.forEach(c => c.setVisible(true));
          }
        }
      }
    });

    // proximity check
    this.nearTarget = null;
    let promptMsg = '';

    // check NPCs
    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      if (d < INTERACT_DIST) {
        this.nearTarget = { type: 'npc', data: npc };
        promptMsg = `[E] Duel ${npc.data.name}`;
        break;
      }
    }

    // check resources (only if no NPC nearby)
    if (!this.nearTarget) {
      for (const node of this.resourceNodes) {
        if (!node.alive) continue;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, node.px, node.py);
        if (d < INTERACT_DIST) {
          this.nearTarget = { type: 'resource', data: node };
          promptMsg = `[E] Gather ${RES_META[node.type].name}`;
          break;
        }
      }
    }

    this.promptText.setText(promptMsg);

    // interact
    if (this.keyE.isDown && !this.keyEDown && this.nearTarget) {
      this.keyEDown = true;
      if (this.nearTarget.type === 'npc') this.startDuel(this.nearTarget.data.data);
      else if (this.nearTarget.type === 'resource') this.gatherResource(this.nearTarget.data);
    }
    if (this.keyE.isUp) this.keyEDown = false;
  }

  gatherResource(node) {
    if (this.gatherCooldown > 0 || !node.alive) return;
    this.gatherCooldown = 400;
    node.alive = false;
    node.timer = 15000 + Math.random() * 10000;

    // hide visual
    if (node.visual) {
      if (node.visual.setVisible) node.visual.setVisible(false);
      else if (node.visual.list) node.visual.list.forEach(c => c.setVisible(false));
    }

    // particle burst
    const meta = RES_META[node.type];
    const col = Phaser.Display.Color.HexStringToColor(meta.color).color;
    for (let i = 0; i < 6; i++) {
      const p = this.add.circle(
        node.px + Phaser.Math.Between(-8, 8),
        node.py + Phaser.Math.Between(-8, 8),
        Phaser.Math.Between(1, 3), col
      ).setDepth(20).setAlpha(1);
      this.tweens.add({
        targets: p, y: p.y - 12, alpha: 0, duration: 500,
        onComplete: () => p.destroy()
      });
    }

    // floating text
    const ft = this.add.text(node.px, node.py - 10, `+1 ${meta.name}`, {
      ...FONT, fontSize: '4px', color: meta.color, stroke: '#000', strokeThickness: 1
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({
      targets: ft, y: ft.y - 16, alpha: 0, duration: 800,
      onComplete: () => ft.destroy()
    });

    addResource(node.type);
    this.refreshHud();
  }

  startDuel(npc) {
    const playerDeck = loadDeck();
    if (!playerDeck || playerDeck.length < 30) {
      this.showMsg('Build a 30-card deck first!');
      return;
    }

    const enemyDeck = getNpcDeck(npc) || generateEnemyDeck();
    const artifacts = loadArtifacts();

    this.scene.start('Battle', {
      playerDeck, enemyDeck, artifacts,
      npcId: npc.id, npcName: npc.name, xpReward: npc.xpReward || 20,
      returnTo: 'Overworld',
      playerX: this.player.x, playerY: this.player.y
    });
  }

  createButtons() {
    if (this.btnBar) this.btnBar.remove();

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: '999',
      display: 'flex', gap: '6px'
    });

    const makeBtn = (text, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        background: bg, color: '#fff', border: '1px solid #555',
        padding: '6px 14px', fontSize: '12px', fontFamily: '"Press Start 2P", monospace',
        cursor: 'pointer', borderRadius: '3px'
      });
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };

    makeBtn('ESC', '#553333', () => this.tryExit());
    makeBtn('CRAFT', '#335533', () => {
      this.destroyButtons();
      this.scene.start('Crafting', {
        returnPlayerX: this.player.x,
        returnPlayerY: this.player.y
      });
    });

    document.body.appendChild(bar);
    this.btnBar = bar;
  }

  destroyButtons() {
    if (this.btnBar) { this.btnBar.remove(); this.btnBar = null; }
    if (this.confirmEl) { this.confirmEl.remove(); this.confirmEl = null; }
  }

  tryExit() {
    if (this.confirmEl) return;
    this.player.body.setVelocity(0, 0);
    this.escPending = true;

    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      background: '#1a1a2e', border: '2px solid #5577aa', borderRadius: '6px',
      padding: '20px 30px', zIndex: '1000', textAlign: 'center',
      fontFamily: '"Press Start 2P", monospace'
    });

    const title = document.createElement('div');
    title.textContent = 'Return to Hub?';
    Object.assign(title.style, { color: '#fff', fontSize: '14px', marginBottom: '16px' });
    box.appendChild(title);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '16px';
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

    makeBtn('YES', '#225522', () => {
      this.destroyButtons();
      this.scene.start('Hub');
    });
    makeBtn('NO', '#552222', () => {
      box.remove();
      this.confirmEl = null;
      this.escPending = false;
    });

    box.appendChild(btnRow);
    document.body.appendChild(box);
    this.confirmEl = box;
  }

  showMsg(msg) {
    const t = this.add.text(this.player.x, this.player.y - 16, msg, {
      ...FONT, fontSize: '4px', color: '#ff4444', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(100);
    this.time.delayedCall(2000, () => t.destroy());
  }
}
