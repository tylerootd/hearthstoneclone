import Phaser from 'phaser';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { getStarterDeck } from '../data/cardPool.js';
import { getCardById } from '../data/cardPool.js';
import { initMp, setupWs, joinRoom, sendPos, interpRemote, tickChallenge, cleanupMp, sendName, sendChat } from '../multiplayer/mpHelper.js';

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
    this._username = data?.username || 'Player';

    initMp(this, { returnScene: 'MmoMap', spriteScale: 1.5, tagOffset: -18, username: this._username });

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
      sendName(this, this._username);
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

    this._chatEl = null;
    this._onChat = () => this._refreshChat();
    this._onPlayerList = () => this._refreshChat();

    this.events.on('shutdown', () => { this.destroyButtons(); this._destroyChat(); this.cleanup(); });
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
        ws: this.ws, myId: this.myId, username: this._username
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

    this.add.text(8, 40, this._username, {
      ...FONT, fontSize: '9px', color: '#e6b422', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(50);

    this.add.text(8, 56, 'C = craft  |  ESC = exit', {
      ...FONT, fontSize: '8px', color: '#777', stroke: '#000', strokeThickness: 2
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
        sendName(this, this._username);
        const deckIds = loadDeck() || getStarterDeck();
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
            playerX: this.player.x, playerY: this.player.y,
            username: this._username
          });
        });
      }
    });
  }

  /* ──────── update loop ──────── */

  update(time) {
    if (!this.player || this.escPending) return;
    const chatFocused = document.activeElement?.tagName === 'INPUT';
    if (chatFocused) {
      this.player.body.setVelocity(0, 0);
      sendPos(this, time, this.player.x, this.player.y, 'idle_down');
      interpRemote(this);
      return;
    }

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
        ws: this.ws, myId: this.myId, username: this._username
      });
    });
    makeBtn('CHAT', '#333355', () => this._toggleChat());

    bar.appendChild(btnRow);
    document.body.appendChild(bar);
    this.btnBar = bar;
  }

  destroyButtons() {
    if (this.btnBar) { this.btnBar.remove(); this.btnBar = null; }
    if (this.confirmEl) { this.confirmEl.remove(); this.confirmEl = null; }
    this._destroyChat();
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

  /* ──────── chat panel (DOM) ──────── */

  _toggleChat() {
    if (this._chatEl) { this._destroyChat(); return; }
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', left: `${window.innerWidth - 330}px`, top: `${window.innerHeight - 430}px`,
      width: '320px', height: '420px', minWidth: '220px', minHeight: '200px',
      background: '#0a0e1a', border: '2px solid #3355aa', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', zIndex: '999',
      fontFamily: '"Press Start 2P", monospace', overflow: 'hidden'
    });

    /* ── draggable header ── */
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 12px', background: '#111828', borderBottom: '1px solid #334',
      cursor: 'grab', userSelect: 'none'
    });
    const title = document.createElement('span');
    title.style.color = '#44ffaa'; title.style.fontSize = '11px';
    title.textContent = 'CHAT & PLAYERS';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    Object.assign(closeBtn.style, {
      background: '#552222', color: '#ff6666', border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '10px', padding: '2px 8px', borderRadius: '3px'
    });
    closeBtn.addEventListener('click', () => this._destroyChat());
    header.appendChild(closeBtn);
    el.appendChild(header);

    let dragging = false, dragOX = 0, dragOY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      dragging = true;
      dragOX = e.clientX - el.offsetLeft;
      dragOY = e.clientY - el.offsetTop;
      header.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', this._chatDragMove = (e) => {
      if (!dragging) return;
      el.style.left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dragOX)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOY)) + 'px';
    });
    document.addEventListener('mouseup', this._chatDragUp = () => {
      dragging = false;
      header.style.cursor = 'grab';
    });

    /* ── player list ── */
    const playerBox = document.createElement('div');
    playerBox.id = 'mp-player-list';
    Object.assign(playerBox.style, {
      padding: '6px 10px', borderBottom: '1px solid #334', maxHeight: '90px',
      overflowY: 'auto', fontSize: '9px', color: '#88aadd', lineHeight: '1.6'
    });
    el.appendChild(playerBox);

    /* ── messages ── */
    const msgBox = document.createElement('div');
    msgBox.id = 'mp-chat-messages';
    Object.assign(msgBox.style, {
      flex: '1', overflowY: 'auto', padding: '8px 10px', fontSize: '9px',
      color: '#ccc', lineHeight: '1.6'
    });
    el.appendChild(msgBox);

    /* ── input row ── */
    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
      display: 'flex', padding: '6px', borderTop: '1px solid #334', gap: '4px'
    });
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 200; input.placeholder = 'Type a message...';
    Object.assign(input.style, {
      flex: '1', background: '#111828', color: '#fff', border: '1px solid #335',
      padding: '6px 8px', fontSize: '10px', fontFamily: 'inherit', borderRadius: '3px', outline: 'none'
    });
    const sendBtn = document.createElement('button');
    sendBtn.textContent = '>';
    Object.assign(sendBtn.style, {
      background: '#226644', color: '#fff', border: 'none', cursor: 'pointer',
      padding: '6px 12px', fontFamily: 'inherit', fontSize: '10px', borderRadius: '3px'
    });
    const doSend = () => {
      const text = input.value.trim();
      if (!text) return;
      sendChat(this, text);
      input.value = '';
      input.focus();
    };
    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('keypress', (e) => e.stopPropagation());
    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    el.appendChild(inputRow);

    /* ── resize handle (bottom-right corner) ── */
    const resizeHandle = document.createElement('div');
    Object.assign(resizeHandle.style, {
      position: 'absolute', bottom: '0', right: '0', width: '16px', height: '16px',
      cursor: 'nwse-resize', background: 'linear-gradient(135deg, transparent 50%, #3355aa 50%)',
      borderRadius: '0 0 6px 0'
    });
    el.appendChild(resizeHandle);

    let resizing = false, resOX = 0, resOY = 0, resW = 0, resH = 0;
    resizeHandle.addEventListener('mousedown', (e) => {
      resizing = true;
      resOX = e.clientX; resOY = e.clientY;
      resW = el.offsetWidth; resH = el.offsetHeight;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener('mousemove', this._chatResizeMove = (e) => {
      if (!resizing) return;
      const w = Math.max(220, resW + (e.clientX - resOX));
      const h = Math.max(200, resH + (e.clientY - resOY));
      el.style.width = w + 'px';
      el.style.height = h + 'px';
    });
    document.addEventListener('mouseup', this._chatResizeUp = () => { resizing = false; });

    document.body.appendChild(el);
    this._chatEl = el;
    this._refreshChat();
    input.focus();
  }

  _refreshChat() {
    if (!this._chatEl) return;
    const mp = this._mp;

    const playerBox = this._chatEl.querySelector('#mp-player-list');
    if (playerBox) {
      const list = mp.playerListData.length ? mp.playerListData :
        [{ id: this.myId, name: this._username }, ...Object.entries(mp.remotePlayers).map(([id, r]) => ({ id, name: r.name }))];
      playerBox.innerHTML = `<div style="color:#44ffaa;margin-bottom:4px">PLAYERS (${list.length})</div>` +
        list.map(p => {
          const isMe = p.id === this.myId;
          return `<div style="color:${isMe ? '#44ffaa' : '#88aadd'}">${isMe ? '> ' : ''}${p.name || 'Player ' + p.id}${isMe ? ' (you)' : ''}</div>`;
        }).join('');
    }

    const msgBox = this._chatEl.querySelector('#mp-chat-messages');
    if (msgBox) {
      msgBox.innerHTML = mp.chatMessages.map(m =>
        `<div><span style="color:#44ffaa">${m.name}:</span> <span style="color:#ddd">${m.text}</span></div>`
      ).join('');
      msgBox.scrollTop = msgBox.scrollHeight;
    }
  }

  _destroyChat() {
    if (this._chatDragMove) { document.removeEventListener('mousemove', this._chatDragMove); this._chatDragMove = null; }
    if (this._chatDragUp) { document.removeEventListener('mouseup', this._chatDragUp); this._chatDragUp = null; }
    if (this._chatResizeMove) { document.removeEventListener('mousemove', this._chatResizeMove); this._chatResizeMove = null; }
    if (this._chatResizeUp) { document.removeEventListener('mouseup', this._chatResizeUp); this._chatResizeUp = null; }
    if (this._chatEl) { this._chatEl.remove(); this._chatEl = null; }
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
