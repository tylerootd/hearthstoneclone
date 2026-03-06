import Phaser from 'phaser';
import { getNpcList, getCardById } from '../data/cardPool.js';
import { getCardTextureKey } from '../utils/cardSprite.js';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { loadProgression, xpToNext } from '../data/progression.js';
import { getNpcDeck } from '../data/npcDecks.js';
import { generateEnemyDeck, ARTIFACT_DEFS } from '../game/battleEngine.js';
import { addResource, loadResources, RES, RES_META } from '../data/resources.js';

const SPEED = 160;
const INTERACT_DIST = 48;
const ZOOM = 2;
const FONT = { fontFamily: 'Arial, sans-serif' };

// Pixel positions for the 5 NPCs on the tuxemon town map (1280x1280).
// Progression: closest to spawn (south) → furthest (north).
const NPC_POSITIONS = [
  { px: 480, py: 1088 },
  { px: 240, py: 832 },
  { px: 736, py: 832 },
  { px: 480, py: 544 },
  { px: 480, py: 288 },
];

function defineResourceNodes() {
  const nodes = [];
  const rng = (min, max) => min + Math.floor(Math.random() * (max - min));
  const add = (type, px, py) => nodes.push({ type, px, py, alive: true, timer: 0 });

  for (let i = 0; i < 15; i++) add(RES.WOOD, rng(96, 320), rng(128, 640));
  for (let i = 0; i < 5; i++)  add(RES.WOOD, rng(960, 1184), rng(128, 480));

  for (let i = 0; i < 12; i++) add(RES.STONE, rng(800, 1184), rng(128, 480));

  for (let i = 0; i < 14; i++) add(RES.HERB, rng(96, 480), rng(800, 1184));

  for (let i = 0; i < 10; i++) add(RES.CRYSTAL, rng(800, 1184), rng(800, 1184));

  return nodes;
}

export default class OverworldScene extends Phaser.Scene {
  constructor() { super('Overworld'); }

  create(data) {
    // ── Tiled map ──────────────────────────────────────────────
    const map = this.make.tilemap({ key: 'town-map' });
    const tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'town-tiles');

    map.createLayer('Below Player', tileset, 0, 0);
    this.worldLayer = map.createLayer('World', tileset, 0, 0);
    this.aboveLayer = map.createLayer('Above Player', tileset, 0, 0);

    this.worldLayer.setCollisionByProperty({ collides: true });
    this.aboveLayer.setDepth(10);

    this.mapWidth = map.widthInPixels;
    this.mapHeight = map.heightInPixels;

    const spawnObj = map.findObject('Objects', obj => obj.name === 'Spawn Point');
    this.spawnX = spawnObj ? spawnObj.x : 352;
    this.spawnY = spawnObj ? spawnObj.y : 1216;

    // ── Physics bounds + camera ────────────────────────────────
    this.cameras.main.setZoom(ZOOM);
    this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);

    // ── Game objects ───────────────────────────────────────────
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

  /* ──────────────────── resource nodes ──────────────────── */

  createResourceSprites() {
    this.resPhysics = this.physics.add.staticGroup();

    this.resourceNodes = this.resourceNodes.filter(node => {
      const tile = this.worldLayer.getTileAtWorldXY(node.px, node.py);
      return !tile || !tile.properties || !tile.properties.collides;
    });

    this.resourceNodes.forEach((node, i) => {
      const { px, py } = node;
      let visual;

      if (node.type === RES.WOOD) {
        const trunk  = this.add.rectangle(px, py + 4, 6, 12, 0x6a4420).setDepth(3);
        const canopy = this.add.circle(px, py - 6, 8, 0x2a7a2a).setDepth(4);
        const canopy2 = this.add.circle(px - 3, py - 4, 6, 0x358535).setDepth(4);
        visual = this.add.container(0, 0, [trunk, canopy, canopy2]).setDepth(4);
      } else if (node.type === RES.STONE) {
        const r1 = this.add.ellipse(px, py + 2, 14, 10, 0x778899).setDepth(3);
        const r2 = this.add.ellipse(px - 2, py - 2, 8, 7, 0x99aabb).setDepth(3);
        visual = this.add.container(0, 0, [r1, r2]).setDepth(3);
      } else if (node.type === RES.HERB) {
        visual = this.textures.exists('ninja_bush')
          ? this.add.image(px, py, 'ninja_bush').setDepth(3)
          : this.add.circle(px, py, 6, 0x44aa44).setDepth(3);
      } else {
        const c1 = this.add.triangle(px, py - 3, 0, 10, 5, 0, 10, 10, 0x9944ee).setDepth(3);
        const c2 = this.add.triangle(px + 4, py, 0, 8, 4, 0, 8, 8, 0xbb66ff).setDepth(3);
        visual = this.add.container(0, 0, [c1, c2]).setDepth(3);
      }

      const body = this.add.rectangle(px, py, 12, 12, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.resPhysics.add(body);

      node.visual = visual;
      node.body = body;
      node.idx = i;
    });
  }

  /* ──────────────────── player ──────────────────────────── */

  createPlayer(data) {
    const startX = data?.playerX ?? this.spawnX;
    const startY = data?.playerY ?? this.spawnY;

    if (this.textures.exists('ninja_player')) {
      this.player = this.physics.add.sprite(startX, startY, 'ninja_player', 0).setDepth(5);
      this.player.setScale(1.5);
      this.player.setSize(10, 12);
      this.player.setOffset(3, 4);

      if (!this.anims.exists('walk_down')) {
        this.anims.create({ key: 'walk_down',  frames: this.anims.generateFrameNumbers('ninja_player', { start: 0, end: 3 }),   frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk_left',  frames: this.anims.generateFrameNumbers('ninja_player', { start: 4, end: 7 }),   frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk_right', frames: this.anims.generateFrameNumbers('ninja_player', { start: 8, end: 11 }),  frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'walk_up',    frames: this.anims.generateFrameNumbers('ninja_player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
        this.anims.create({ key: 'idle_down',  frames: [{ key: 'ninja_player', frame: 0 }], frameRate: 1 });
      }
    } else {
      this.player = this.physics.add.sprite(startX, startY).setDepth(5);
      this.player.setSize(10, 12);
    }

    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.worldLayer);
    this.physics.add.collider(this.player, this.resPhysics);

    this.playerDir = 'down';
  }

  /* ──────────────────── NPCs ───────────────────────────── */

  createNpcs() {
    this.npcs = [];
    this.npcBodies = this.physics.add.staticGroup();
    const npcData = getNpcList();
    const skins = ['ninja_npc_samurai', 'ninja_npc_green'];

    npcData.forEach((npc, i) => {
      const pos = NPC_POSITIONS[i] || { px: this.spawnX, py: this.spawnY - 64 };
      const x = pos.px;
      const y = pos.py;

      const skinKey = skins[i % skins.length];
      let visual;
      if (this.textures.exists(skinKey)) {
        visual = this.add.sprite(x, y, skinKey, 0).setDepth(5).setScale(1.5);
      } else {
        const card = getCardById(npc.portraitCard);
        const key = card ? getCardTextureKey(this, card) : null;
        if (key) {
          visual = this.add.image(x, y, key).setDisplaySize(20, 20).setDepth(5);
        } else {
          visual = this.add.rectangle(x, y, 18, 20, 0xcc6644).setDepth(5);
        }
      }

      const label = this.add.text(x, y - 20, npc.name, {
        ...FONT, fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(15);

      const lvl = this.add.text(x, y + 16, `Lv${npc.level}`, {
        ...FONT, fontSize: '9px', color: '#ffcc44', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setDepth(15);

      const body = this.add.rectangle(x, y, 16, 16, 0x000000, 0);
      this.physics.add.existing(body, true);
      this.npcBodies.add(body);

      this.npcs.push({ data: npc, x, y, visual, label, lvl });
    });

    this.physics.add.collider(this.player, this.npcBodies);
  }

  /* ──────────────────── camera / input ─────────────────── */

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);
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

  /* ──────────────────── HUD ────────────────────────────── */

  drawHud() {
    const { level, xp } = loadProgression();
    const needed = xpToNext(level);
    const res = loadResources();
    const cam = this.cameras.main;
    const sw = cam.width / ZOOM;
    const sh = cam.height / ZOOM;

    this.hudBg = this.add.rectangle(0, 0, sw, 22, 0x000000, 0.85)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(50);
    this.hudLevel = this.add.text(8, 4, `LV ${level}`, {
      ...FONT, fontSize: '14px', color: '#fff'
    }).setScrollFactor(0).setDepth(51);

    const barX = 55, barW = 60;
    this.add.rectangle(barX, 11, barW, 6, 0x333333)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);
    const fill = Math.max(1, (xp / needed) * barW);
    this.add.rectangle(barX, 11, fill, 6, 0x44aaff)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
    this.add.text(barX + barW + 8, 4, `${xp}/${needed}`, {
      ...FONT, fontSize: '12px', color: '#fff'
    }).setScrollFactor(0).setDepth(51);

    const resTypes = [RES.WOOD, RES.STONE, RES.HERB, RES.CRYSTAL];
    let rx = 200;
    resTypes.forEach(type => {
      const meta = RES_META[type];
      this.add.text(rx, 4, `${meta.icon} ${res[type] || 0}`, {
        ...FONT, fontSize: '12px', color: meta.color
      }).setScrollFactor(0).setDepth(51);
      rx += 55;
    });

    // artifact panel
    const arts = loadArtifacts();
    if (arts && arts.length > 0) {
      const def = ARTIFACT_DEFS[arts[0]];
      if (def) {
        const bw = 120, bh = 36;
        this.add.rectangle(4, 26, bw, bh, 0x1a2233, 0.95)
          .setOrigin(0, 0).setScrollFactor(0).setDepth(51).setStrokeStyle(1, 0x556677);
        this.add.text(28, 44, def.icon, {
          fontSize: '18px', color: def.color
        }).setOrigin(0.5).setScrollFactor(0).setDepth(52);
        this.add.text(52, 44, def.name, {
          ...FONT, fontSize: '12px', color: '#fff'
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(52);
      }
    }

    this.createButtons();

    this.promptText = this.add.text(sw / 2, sh - 24, '', {
      ...FONT, fontSize: '14px', color: '#fff', stroke: '#000', strokeThickness: 3
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
    if (this.hudBg) { this.hudBg.destroy(); this.hudLevel.destroy(); }
    this.children.list
      .filter(c => c.scrollFactorX === 0 && c.depth >= 50)
      .forEach(c => c.destroy());
    this.drawHud();
  }

  /* ──────────────────── update loop ────────────────────── */

  update(time, delta) {
    if (this.escPending) return;

    let vx = 0, vy = 0;
    if (this.cursors.left.isDown  || this.wasd.A.isDown) { vx = -SPEED; this.playerDir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = SPEED; this.playerDir = 'right'; }
    if (this.cursors.up.isDown    || this.wasd.W.isDown) { vy = -SPEED; this.playerDir = 'up'; }
    else if (this.cursors.down.isDown  || this.wasd.S.isDown) { vy = SPEED; this.playerDir = 'down'; }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    this.player.body.setVelocity(vx, vy);

    if (this.anims.exists('walk_' + this.playerDir)) {
      if (vx !== 0 || vy !== 0) this.player.play('walk_' + this.playerDir, true);
      else this.player.play('idle_down', true);
    }

    if (this.gatherCooldown > 0) this.gatherCooldown -= delta;

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

    this.nearTarget = null;
    let promptMsg = '';

    for (const npc of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      if (d < INTERACT_DIST) {
        this.nearTarget = { type: 'npc', data: npc };
        promptMsg = `[E] Duel ${npc.data.name}`;
        break;
      }
    }

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

    if (this.keyE.isDown && !this.keyEDown && this.nearTarget) {
      this.keyEDown = true;
      if (this.nearTarget.type === 'npc') this.startDuel(this.nearTarget.data.data);
      else if (this.nearTarget.type === 'resource') this.gatherResource(this.nearTarget.data);
    }
    if (this.keyE.isUp) this.keyEDown = false;
  }

  /* ──────────────────── gathering ──────────────────────── */

  gatherResource(node) {
    if (this.gatherCooldown > 0 || !node.alive) return;
    this.gatherCooldown = 400;
    node.alive = false;
    node.timer = 15000 + Math.random() * 10000;

    if (node.visual) {
      if (node.visual.setVisible) node.visual.setVisible(false);
      else if (node.visual.list) node.visual.list.forEach(c => c.setVisible(false));
    }

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

    const ft = this.add.text(node.px, node.py - 10, `+1 ${meta.name}`, {
      ...FONT, fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({
      targets: ft, y: ft.y - 16, alpha: 0, duration: 800,
      onComplete: () => ft.destroy()
    });

    addResource(node.type);
    this.refreshHud();
  }

  /* ──────────────────── dueling ─────────────────────────── */

  startDuel(npc) {
    const playerDeck = loadDeck();
    if (!playerDeck || playerDeck.length < 1) {
      this.showMsg('You need at least 1 card in your deck!');
      return;
    }

    const enemyDeck = getNpcDeck(npc) || generateEnemyDeck();
    const artifacts = loadArtifacts();

    this.destroyButtons();
    this.scene.start('Battle', {
      playerDeck, enemyDeck, artifacts,
      npcId: npc.id, npcName: npc.name, xpReward: npc.xpReward || 20,
      returnTo: 'Overworld',
      playerX: this.player.x, playerY: this.player.y
    });
  }

  /* ──────────────────── DOM buttons ─────────────────────── */

  createButtons() {
    if (this.btnBar) this.btnBar.remove();

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'fixed', top: '8px', left: '8px', zIndex: '999',
      display: 'flex', flexDirection: 'column', gap: '6px'
    });

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '6px';

    const makeBtn = (text, bg, fn) => {
      const b = document.createElement('button');
      b.textContent = text;
      Object.assign(b.style, {
        background: bg, color: '#fff', border: '1px solid #555',
        padding: '6px 14px', fontSize: '12px', fontFamily: '"Press Start 2P", monospace',
        cursor: 'pointer', borderRadius: '3px'
      });
      b.addEventListener('click', fn);
      btnRow.appendChild(b);
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

    bar.appendChild(btnRow);

    const hint = document.createElement('div');
    hint.textContent = 'E to interact with NPCs or collect materials';
    Object.assign(hint.style, {
      color: '#fff', fontSize: '14px', fontFamily: 'Arial, sans-serif'
    });
    bar.appendChild(hint);

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

  /* ──────────────────── util ────────────────────────────── */

  showMsg(msg) {
    const t = this.add.text(this.player.x, this.player.y - 16, msg, {
      ...FONT, fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(100);
    this.time.delayedCall(2000, () => t.destroy());
  }
}
