import Phaser from 'phaser';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { getCardById } from '../data/cardPool.js';
import { initMp, setupWs, joinRoom, sendPos, interpRemote, tickChallenge, cleanupMp } from '../multiplayer/mpHelper.js';

const SPEED = 160;
const ZOOM = 2;
const FONT = { fontFamily: 'Arial, sans-serif' };
const HIDEOUT_DOOR = { x: 640, y: 640 };
const HIDEOUT_DETECT = 50;

export default class MmoMapScene extends Phaser.Scene {
  constructor() { super('MmoMap'); }

  create(data) {
    this.ws = null;
    this.myId = null;
    this._keepWs = false;
    this.escPending = false;

    initMp(this, { returnScene: 'MmoMap', spriteScale: 1.5, tagOffset: -18 });

    this.buildMap();
    this.createAnims();
    this.createPlayer(data);
    this.setupCamera();
    this.setupInput();
    this.drawHud();

    if (data?.ws && data.ws.readyState === WebSocket.OPEN) {
      this.ws = data.ws;
      this.myId = data.myId;
      setupWs(this);
      const px = Math.round(data.playerX || 352);
      const py = Math.round(data.playerY || 1216);
      joinRoom(this, 'mmo', px, py);
    } else {
      this.connectToServer();
    }

    if (this.textures.exists('dragons_den_building')) {
      this.add.image(HIDEOUT_DOOR.x, HIDEOUT_DOOR.y - 20, 'dragons_den_building')
        .setScale(0.55).setDepth(4);
    }
    this.add.text(HIDEOUT_DOOR.x, HIDEOUT_DOOR.y - 60, "DRAGON'S DEN", {
      ...FONT, fontSize: '7px', fontStyle: 'bold',
      color: '#ff00aa', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(12);

    this.events.on('shutdown', () => { this.destroyButtons(); this.cleanup(); });
  }

  /* ──────── Tiled map ──────── */

  buildMap() {
    const map = this.make.tilemap({ key: 'town-map' });
    const tileset = map.addTilesetImage('tuxmon-sample-32px-extruded', 'town-tiles');

    map.createLayer('Below Player', tileset, 0, 0);
    this.worldLayer = map.createLayer('World', tileset, 0, 0);
    this.aboveLayer = map.createLayer('Above Player', tileset, 0, 0);

    this.worldLayer.setCollisionByProperty({ collides: true });
    this.aboveLayer.setDepth(10);

    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    this.physics.world.setBounds(0, 0, this.mapW, this.mapH);

    for (let ty = 14; ty <= 39; ty++) {
      for (let tx = 4; tx <= 36; tx++) {
        const t = this.worldLayer.getTileAt(tx, ty);
        if (t) t.setCollision(false);
      }
    }

    const spawnObj = map.findObject('Objects', obj => obj.name === 'Spawn Point');
    this.spawnX = spawnObj ? spawnObj.x : 352;
    this.spawnY = spawnObj ? spawnObj.y : 1216;
  }

  /* ──────── animations ──────── */

  createAnims() {
    if (!this.anims.exists('walk_down')) {
      this.anims.create({ key: 'walk_down',  frames: this.anims.generateFrameNumbers('ninja_player', { start: 0, end: 3 }),   frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_left',  frames: this.anims.generateFrameNumbers('ninja_player', { start: 4, end: 7 }),   frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_right', frames: this.anims.generateFrameNumbers('ninja_player', { start: 8, end: 11 }),  frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk_up',    frames: this.anims.generateFrameNumbers('ninja_player', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'idle_down',  frames: [{ key: 'ninja_player', frame: 0 }], frameRate: 1 });
    }
    if (!this.anims.exists('remote_walk_down')) {
      this.anims.create({ key: 'remote_walk_down',  frames: this.anims.generateFrameNumbers('ninja_npc_green', { start: 0, end: 3 }),   frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'remote_walk_left',  frames: this.anims.generateFrameNumbers('ninja_npc_green', { start: 4, end: 7 }),   frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'remote_walk_right', frames: this.anims.generateFrameNumbers('ninja_npc_green', { start: 8, end: 11 }),  frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'remote_walk_up',    frames: this.anims.generateFrameNumbers('ninja_npc_green', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'remote_idle_down',  frames: [{ key: 'ninja_npc_green', frame: 0 }], frameRate: 1 });
    }
  }

  /* ──────── local player ──────── */

  createPlayer(data) {
    const startX = data?.playerX ?? this.spawnX;
    const startY = data?.playerY ?? this.spawnY;
    const tex = this.textures.exists('ninja_player') ? 'ninja_player' : null;
    this.player = this.physics.add.sprite(startX, startY, tex, 0)
      .setDepth(5).setScale(1.5);
    this.player.setSize(10, 12).setOffset(3, 4);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.worldLayer);
    this.playerDir = 'down';
  }

  /* ──────── camera + input ──────── */

  setupCamera() {
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setBounds(0, 0, this.mapW, this.mapH);
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
    this.keyQ = this.input.keyboard.addKey('Q');
    this.keyEDown = false;
    this.keyQDown = false;
    this.input.keyboard.on('keydown-ESC', () => this.tryExit());
    this.input.keyboard.addKey('C').on('down', () => {
      if (this.escPending) return;
      this.destroyButtons();
      this._keepWs = true;
      this.scene.start('Crafting', {
        returnTo: 'MmoMap',
        returnPlayerX: this.player.x, returnPlayerY: this.player.y,
        ws: this.ws, myId: this.myId
      });
    });
  }

  /* ──────── HUD ──────── */

  drawHud() {
    this.add.text(8, 4, 'MULTIPLAYER', {
      ...FONT, fontSize: '14px', color: '#44ffaa', stroke: '#000', strokeThickness: 3
    }).setScrollFactor(0).setDepth(50);

    this.playerCountText = this.add.text(8, 22, 'Connecting...', {
      ...FONT, fontSize: '11px', color: '#aaccee', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(50);

    this.add.text(8, 40, 'C = craft  |  ESC = exit', {
      ...FONT, fontSize: '10px', color: '#999', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(50);

    const cam = this.cameras.main;
    const sw = cam.width / ZOOM;
    const sh = cam.height / ZOOM;

    this.promptText = this.add.text(sw / 2, sh - 16, '', {
      ...FONT, fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    this.statusText = this.add.text(sw / 2, sh - 32, '', {
      ...FONT, fontSize: '11px', color: '#ffcc44', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    this.createButtons();
  }

  /* ──────── WebSocket connection ──────── */

  connectToServer() {
    try {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const serverUrl = isLocal ? 'ws://localhost:2567' : 'wss://hearthstone-mmo-server.onrender.com';
      this.ws = new WebSocket(serverUrl);

      setupWs(this);

      this.ws.onopen = () => {
        const deckIds = loadDeck() || [];
        const cards = deckIds.map(id => getCardById(id)).filter(Boolean);
        const artifacts = loadArtifacts() || [];
        this.ws.send(JSON.stringify({ type: 'deck', cards, artifacts }));
        this.ws.send(JSON.stringify({ type: 'sync' }));
      };

      this.ws.onerror = () => {
        if (this.playerCountText) this.playerCountText.setText('Server offline - solo mode');
      };

    } catch (e) {
      if (this.playerCountText) this.playerCountText.setText('Server offline - solo mode');
    }
  }

  /* ──────── building entry ──────── */

  enterHideout() {
    this.destroyButtons();
    this.player.body.setVelocity(0, 0);
    const cam = this.cameras.main;
    const doorL = this.add.rectangle(HIDEOUT_DOOR.x - 8, HIDEOUT_DOOR.y - 16, 8, 20, 0x3a2211).setDepth(15).setOrigin(1, 0.5);
    const doorR = this.add.rectangle(HIDEOUT_DOOR.x + 8, HIDEOUT_DOOR.y - 16, 8, 20, 0x3a2211).setDepth(15).setOrigin(0, 0.5);
    this.tweens.add({ targets: doorL, scaleX: 0, duration: 300, ease: 'Power2' });
    this.tweens.add({ targets: doorR, scaleX: 0, duration: 300, ease: 'Power2',
      onComplete: () => {
        cam.fadeOut(400, 0, 0, 0);
        this.time.delayedCall(400, () => {
          this._keepWs = true;
          this.scene.start('YakuzaHideout', {
            ws: this.ws, myId: this.myId,
            playerX: this.player.x, playerY: this.player.y
          });
        });
      }
    });
  }

  /* ──────── update loop ──────── */

  update(time) {
    if (!this.player || this.escPending) return;

    let vx = 0, vy = 0;
    if (this.cursors.left.isDown  || this.wasd.A.isDown) { vx = -SPEED; this.playerDir = 'left'; }
    else if (this.cursors.right.isDown || this.wasd.D.isDown) { vx = SPEED; this.playerDir = 'right'; }
    if (this.cursors.up.isDown    || this.wasd.W.isDown) { vy = -SPEED; this.playerDir = 'up'; }
    else if (this.cursors.down.isDown  || this.wasd.S.isDown) { vy = SPEED; this.playerDir = 'down'; }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    this.player.body.setVelocity(vx, vy);

    const moving = vx !== 0 || vy !== 0;
    const animKey = moving ? 'walk_' + this.playerDir : 'idle_down';
    if (this.anims.exists(animKey)) this.player.play(animKey, true);

    sendPos(this, time, this.player.x, this.player.y, animKey);
    interpRemote(this);

    const ePressed = this.keyE.isDown && !this.keyEDown;
    const qPressed = this.keyQ.isDown && !this.keyQDown;
    this.keyEDown = this.keyE.isDown;
    this.keyQDown = this.keyQ.isDown;

    const cs = tickChallenge(this, ePressed, qPressed);
    if (!cs) {
      const doorDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, HIDEOUT_DOOR.x, HIDEOUT_DOOR.y);
      if (doorDist < HIDEOUT_DETECT) {
        this.promptText.setText("[E] Enter Dragon's Den");
        if (ePressed) { this.enterHideout(); return; }
      } else {
        this.promptText.setText('');
      }
    }
  }

  /* ──────── DOM buttons ──────── */

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
      this._keepWs = true;
      this.scene.start('Crafting', {
        returnTo: 'MmoMap',
        returnPlayerX: this.player.x, returnPlayerY: this.player.y,
        ws: this.ws, myId: this.myId
      });
    });

    bar.appendChild(btnRow);
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
      this.cleanup();
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

  /* ──────── cleanup ──────── */

  cleanup() {
    cleanupMp(this);
    if (this.ws && !this._keepWs) {
      this.ws.close();
      this.ws = null;
    }
  }
}
