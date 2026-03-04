import Phaser from 'phaser';
import { loadDeck, loadArtifacts } from '../data/storage.js';
import { generateEnemyDeck } from '../game/battleEngine.js';
import { initMp, setupWs, joinRoom, sendPos, interpRemote, tickChallenge, cleanupMp } from '../multiplayer/mpHelper.js';

const W = 1024, H = 768;
const FONT = { fontFamily: 'Arial, sans-serif' };
const SPEED = 3;
const ROOM_X = 112, ROOM_Y = 64, ROOM_W = 800, ROOM_H = 620;
const TILE = 32;
const INTERACT_R = 80;

const NPCS = [
  {
    id: 'boss_ryuji', name: 'BOSS RYUJI', sprite: 'ninja_npc_samurai', scale: 4,
    x: 512, y: 180, color: '#ff4488', glowColor: 0xff00aa,
    lines: [
      "You got guts walking in here, kid.",
      "Every card has a price. Every player has a debt.",
      "I've been running this town since before you could shuffle a deck.",
      "The house always wins. And I AM the house.",
      "I've buried better duelists than you.",
      "Don't touch the whiskey. That bottle costs more than your deck."
    ],
    duelLine: "Think you can take me? Let's settle this at the table."
  },
  {
    id: 'kira', name: 'KIRA', sprite: 'ninja_npc_green', scale: 3,
    x: 280, y: 340, color: '#88ffaa', glowColor: 0x44ff88,
    lines: [
      "Boss Ryuji pulled me off the streets. I owe him everything.",
      "Don't stare at me like that. I bite.",
      "You want something? Earn it.",
      "I shuffle cards faster than you can blink."
    ],
    duelLine: "You look like you need a lesson. Wanna duel?"
  },
  {
    id: 'vex', name: 'VEX', sprite: 'ninja_npc_green', scale: 3,
    x: 740, y: 340, color: '#aaaaff', glowColor: 0x6666ff, flipX: true,
    lines: [
      "Quiet. I'm counting cards in my head.",
      "Last guy who challenged me is still crying.",
      "The boss says I'm the best duelist in the Den.",
      "You smell like a fresh recruit. Amusing."
    ],
    duelLine: "Alright, I'll humor you. Ready to get wrecked?"
  }
];

export default class YakuzaHideoutScene extends Phaser.Scene {
  constructor() { super('YakuzaHideout'); }

  create(data) {
    this.ws = data.ws;
    this.myId = data.myId;
    this.returnData = { playerX: data.playerX, playerY: data.playerY };
    this.talkIndex = {};
    this.dialogueLocked = false;
    this.duelPromptActive = false;
    this.activeNpc = null;
    this._keepWs = false;

    initMp(this, { returnScene: 'YakuzaHideout', spriteScale: 2.5, tagOffset: -26 });

    this._pvpReturnData = () => ({
      playerX: this.returnData.playerX,
      playerY: this.returnData.playerY
    });

    this.generateTextures();
    this.drawRoom();
    this.drawNeonSign();
    this.drawFurniture();
    this.createNpcs();
    this.startSmoke();
    this.startAmbientDust();
    this.createPlayer();
    this.setupInput();
    this.drawHud();

    setupWs(this);
    joinRoom(this, 'dragons_den', Math.round(W / 2), Math.round(ROOM_Y + ROOM_H - 50));

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  generateTextures() {
    if (!this.textures.exists('smoke_dot')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('smoke_dot', 8, 8);
      g.destroy();
    }
  }

  /* ═══════ ROOM ═══════ */

  drawRoom() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x05030a).setDepth(0);

    const gfx = this.add.graphics().setDepth(1);
    for (let r = 0; r < ROOM_H; r += TILE) {
      for (let c = 0; c < ROOM_W; c += TILE) {
        const dark = ((r / TILE | 0) + (c / TILE | 0)) % 2 === 0;
        gfx.fillStyle(dark ? 0x0d0a1a : 0x14102a);
        gfx.fillRect(ROOM_X + c, ROOM_Y + r, TILE, TILE);
      }
    }

    gfx.fillStyle(0x0a0815);
    gfx.fillRect(ROOM_X - 8, ROOM_Y - 8, ROOM_W + 16, 8);
    gfx.fillRect(ROOM_X - 8, ROOM_Y, 8, ROOM_H + 8);
    gfx.fillRect(ROOM_X + ROOM_W, ROOM_Y, 8, ROOM_H + 8);
    gfx.fillRect(ROOM_X - 8, ROOM_Y + ROOM_H, ROOM_W + 16, 8);

    const neonL = this.add.rectangle(ROOM_X, ROOM_Y + ROOM_H / 2, 3, ROOM_H, 0xff00aa).setDepth(2);
    const neonR = this.add.rectangle(ROOM_X + ROOM_W, ROOM_Y + ROOM_H / 2, 3, ROOM_H, 0xff00aa).setDepth(2);
    const neonT = this.add.rectangle(ROOM_X + ROOM_W / 2, ROOM_Y, ROOM_W, 3, 0x00ffcc).setDepth(2);
    this.tweens.add({ targets: [neonL, neonR], alpha: { from: 0.4, to: 1 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: neonT, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  drawNeonSign() {
    const signY = ROOM_Y + 22;
    this.add.rectangle(W / 2, signY, 340, 30, 0x000000, 0.6).setDepth(3);

    const sign = this.add.text(W / 2, signY, "DRAGON'S DEN", {
      ...FONT, fontSize: '22px', fontStyle: 'bold', color: '#00ffcc',
      stroke: '#005544', strokeThickness: 3
    }).setOrigin(0.5).setDepth(4);

    this.tweens.add({
      targets: sign, duration: 2000, yoyo: true, repeat: -1,
      onUpdate: (tween) => {
        const t = tween.progress;
        sign.setTint(Phaser.Display.Color.GetColor(
          Math.floor(255 * (1 - t)), Math.floor(255 * (0.5 + t * 0.5)), Math.floor(200 + 55 * t)
        ));
      }
    });

    this.add.text(W / 2, signY + 22, '龍', {
      fontFamily: 'serif', fontSize: '16px', color: '#ff00aa'
    }).setOrigin(0.5).setDepth(4).setAlpha(0.6);
  }

  drawFurniture() {
    const d = 5;
    this.drawSofa(ROOM_X + 60, ROOM_Y + 200, 130, 55, d);
    this.drawSofa(ROOM_X + ROOM_W - 190, ROOM_Y + 200, 130, 55, d);
    this.drawSofa(ROOM_X + 60, ROOM_Y + 400, 130, 55, d);
    this.drawSofa(ROOM_X + ROOM_W - 190, ROOM_Y + 400, 130, 55, d);

    const tblX = W / 2, tblY = ROOM_Y + 320;
    this.add.rectangle(tblX, tblY, 200, 90, 0x1a1020).setStrokeStyle(2, 0x332244).setDepth(d);
    this.add.rectangle(tblX, tblY, 190, 80, 0x221830).setDepth(d);

    this.add.rectangle(tblX - 50, tblY - 15, 12, 28, 0x2a6622).setDepth(d + 1);
    this.add.rectangle(tblX - 50, tblY - 30, 8, 4, 0x44aa33).setDepth(d + 1);
    this.add.rectangle(tblX - 20, tblY - 10, 10, 22, 0x663311).setDepth(d + 1);
    this.add.rectangle(tblX + 15, tblY - 8, 14, 30, 0x556688).setDepth(d + 1);
    this.add.circle(tblX + 50, tblY - 5, 7, 0x333344).setStrokeStyle(1, 0x555566).setDepth(d + 1);

    const chairW = 60, chairH = 50;
    this.add.rectangle(NPCS[0].x, NPCS[0].y + 12, chairW + 16, chairH + 10, 0x330022)
      .setStrokeStyle(2, 0xff00aa).setDepth(d - 1);
    this.add.rectangle(NPCS[0].x, NPCS[0].y - 10, chairW + 24, 14, 0x440033)
      .setStrokeStyle(1, 0xcc0088).setDepth(d - 1);
  }

  drawSofa(x, y, w, h, depth) {
    this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x3a0a1a).setStrokeStyle(1, 0x551133).setDepth(depth);
    this.add.rectangle(x + w / 2, y + 4, w - 8, 6, 0x550022, 0.4).setDepth(depth + 1);
    this.add.rectangle(x + w / 2, y + h / 2, w - 10, h - 12, 0x4a1228).setDepth(depth);
  }

  /* ═══════ NPCS ═══════ */

  createNpcs() {
    this.npcSprites = [];
    for (const npc of NPCS) {
      const spr = this.add.sprite(npc.x, npc.y, npc.sprite, 0)
        .setScale(npc.scale).setDepth(7);
      if (npc.flipX) spr.setFlipX(true);

      const glow = this.add.circle(npc.x, npc.y, 40, npc.glowColor, 0.06).setDepth(3);
      this.tweens.add({ targets: glow, alpha: { from: 0.03, to: 0.1 }, scale: { from: 1, to: 1.3 }, duration: 2000, yoyo: true, repeat: -1 });

      this.add.text(npc.x, npc.y - 48, npc.name, {
        ...FONT, fontSize: '10px', fontStyle: 'bold', color: npc.color,
        stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(8);

      this.npcSprites.push(spr);
      this.talkIndex[npc.id] = 0;
    }
  }

  /* ═══════ PARTICLES ═══════ */

  startSmoke() {
    const boss = NPCS[0];
    this.time.addEvent({
      delay: 350, repeat: -1,
      callback: () => {
        const s = this.add.image(
          boss.x + Phaser.Math.Between(-6, 6), boss.y - 28, 'smoke_dot'
        ).setDepth(9).setAlpha(0.25).setScale(Phaser.Math.FloatBetween(0.4, 1)).setTint(0x999999);
        this.tweens.add({
          targets: s, y: s.y - 70, alpha: 0, scale: s.scale * 2.5,
          duration: 2200, onComplete: () => s.destroy()
        });
      }
    });
  }

  startAmbientDust() {
    this.time.addEvent({
      delay: 600, repeat: -1,
      callback: () => {
        const dx = Phaser.Math.Between(ROOM_X + 30, ROOM_X + ROOM_W - 30);
        const dy = Phaser.Math.Between(ROOM_Y + 30, ROOM_Y + ROOM_H - 30);
        const dot = this.add.circle(dx, dy, Phaser.Math.Between(1, 2), 0xffffff, 0.1).setDepth(9);
        this.tweens.add({
          targets: dot, y: dot.y - 25, alpha: 0,
          duration: 3500, onComplete: () => dot.destroy()
        });
      }
    });
  }

  /* ═══════ PLAYER ═══════ */

  createPlayer() {
    this.player = this.add.sprite(W / 2, ROOM_Y + ROOM_H - 50, 'ninja_player', 0)
      .setScale(2.5).setDepth(7);
    this.playerDir = 'down';
  }

  setupInput() {
    this.keys = {
      W: this.input.keyboard.addKey('W'),
      A: this.input.keyboard.addKey('A'),
      S: this.input.keyboard.addKey('S'),
      D: this.input.keyboard.addKey('D'),
      UP: this.input.keyboard.addKey('UP'),
      DOWN: this.input.keyboard.addKey('DOWN'),
      LEFT: this.input.keyboard.addKey('LEFT'),
      RIGHT: this.input.keyboard.addKey('RIGHT')
    };
    this.keyE = this.input.keyboard.addKey('E');
    this.keyQ = this.input.keyboard.addKey('Q');
    this.keySpace = this.input.keyboard.addKey('SPACE');
    this.keyEPrev = false;
    this.keyQPrev = false;
    this.keySpacePrev = false;
    this.input.keyboard.on('keydown-ESC', () => {
      if (!this.duelPromptActive) this.exitToMap();
    });
  }

  /* ═══════ HUD ═══════ */

  drawHud() {
    this.add.text(16, 12, "DRAGON'S DEN", {
      ...FONT, fontSize: '14px', fontStyle: 'bold', color: '#ff00aa',
      stroke: '#000', strokeThickness: 3
    }).setDepth(50);
    this.add.text(16, 32, 'E / SPACE = interact  |  Q = leave', {
      ...FONT, fontSize: '10px', color: '#aaa', stroke: '#000', strokeThickness: 2
    }).setDepth(50);

    this.playerCountText = this.add.text(16, 48, 'Players: 1', {
      ...FONT, fontSize: '10px', color: '#aaccee', stroke: '#000', strokeThickness: 2
    }).setDepth(50);

    this.statusText = this.add.text(W / 2, 48, '', {
      ...FONT, fontSize: '11px', color: '#ffcc44', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(50);

    const exitBtn = this.add.rectangle(W - 70, 22, 120, 30, 0x441111, 0.9)
      .setStrokeStyle(2, 0xff4444).setDepth(50).setInteractive({ useHandCursor: true });
    this.add.text(W - 70, 22, 'EXIT [Q]', {
      ...FONT, fontSize: '12px', fontStyle: 'bold', color: '#ff6666',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(51);
    exitBtn.on('pointerover', () => exitBtn.setFillStyle(0x662222));
    exitBtn.on('pointerout', () => exitBtn.setFillStyle(0x441111));
    exitBtn.on('pointerdown', () => this.exitToMap());

    this.promptText = this.add.text(W / 2, H - 20, '', {
      ...FONT, fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(50);

    this.dialogueBg = this.add.rectangle(W / 2, H - 80, 700, 50, 0x000000, 0.85)
      .setStrokeStyle(1, 0xff00aa).setDepth(49).setVisible(false);
    this.dialogueText = this.add.text(W / 2, H - 80, '', {
      ...FONT, fontSize: '13px', color: '#ff88cc', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(50);

    this.skipBtnBg = this.add.rectangle(W / 2 + 310, H - 80, 80, 30, 0x332233, 0.9)
      .setStrokeStyle(1, 0xff00aa).setDepth(51).setInteractive({ useHandCursor: true }).setVisible(false);
    this.skipBtnText = this.add.text(W / 2 + 310, H - 80, 'SKIP ▶▶', {
      ...FONT, fontSize: '9px', fontStyle: 'bold', color: '#ff88cc'
    }).setOrigin(0.5).setDepth(52).setVisible(false);
    this.skipBtnBg.on('pointerover', () => this.skipBtnBg.setFillStyle(0x553355));
    this.skipBtnBg.on('pointerout', () => this.skipBtnBg.setFillStyle(0x332233));
    this.skipBtnBg.on('pointerdown', () => this.skipDialogue());
  }

  /* ═══════ DIALOGUE & DUEL PROMPT ═══════ */

  talkToNpc(npc) {
    if (this.dialogueLocked) return;
    this.dialogueLocked = true;
    this.activeNpc = npc;

    const idx = this.talkIndex[npc.id];
    const isLastLine = idx >= npc.lines.length;
    const line = isLastLine ? npc.duelLine : npc.lines[idx];
    this.talkIndex[npc.id] = Math.min(idx + 1, npc.lines.length);

    this.dialogueBg.setVisible(true);
    this.dialogueText.setText(`${npc.name}: "${line}"`);

    if (!isLastLine) {
      this.skipBtnBg.setVisible(true);
      this.skipBtnText.setVisible(true);
    } else {
      this.skipBtnBg.setVisible(false);
      this.skipBtnText.setVisible(false);
    }

    if (this.dialogueTimer) this.dialogueTimer.destroy();

    if (isLastLine) {
      this.dialogueTimer = this.time.delayedCall(600, () => this.showDuelPrompt(npc));
    } else {
      this.dialogueLocked = false;
    }
  }

  advanceDialogue() {
    if (!this.activeNpc || this.duelPromptActive) return;
    this.talkToNpc(this.activeNpc);
  }

  skipDialogue() {
    if (!this.activeNpc || this.duelPromptActive) return;
    if (this.dialogueTimer) this.dialogueTimer.destroy();
    this.talkIndex[this.activeNpc.id] = this.activeNpc.lines.length;
    this.dialogueLocked = false;
    this.talkToNpc(this.activeNpc);
  }

  showDuelPrompt(npc) {
    this.duelPromptActive = true;
    this.skipBtnBg.setVisible(false);
    this.skipBtnText.setVisible(false);

    if (this.promptGroup) this.promptGroup.forEach(o => o.destroy());
    this.promptGroup = [];

    const bg = this.add.rectangle(W / 2, H / 2, 360, 140, 0x0a0520, 0.95)
      .setStrokeStyle(2, 0xff00aa).setDepth(100);

    const title = this.add.text(W / 2, H / 2 - 40, `Duel ${npc.name}?`, {
      ...FONT, fontSize: '18px', fontStyle: 'bold', color: '#ff88cc',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(101);

    const yesBtn = this.add.rectangle(W / 2 - 70, H / 2 + 20, 100, 40, 0x227722)
      .setStrokeStyle(2, 0x44ff44).setDepth(101).setInteractive({ useHandCursor: true });
    const yesLbl = this.add.text(W / 2 - 70, H / 2 + 20, 'YES', {
      ...FONT, fontSize: '14px', fontStyle: 'bold', color: '#44ff44'
    }).setOrigin(0.5).setDepth(102);

    const noBtn = this.add.rectangle(W / 2 + 70, H / 2 + 20, 100, 40, 0x772222)
      .setStrokeStyle(2, 0xff4444).setDepth(101).setInteractive({ useHandCursor: true });
    const noLbl = this.add.text(W / 2 + 70, H / 2 + 20, 'NO', {
      ...FONT, fontSize: '14px', fontStyle: 'bold', color: '#ff4444'
    }).setOrigin(0.5).setDepth(102);

    this.promptGroup = [bg, title, yesBtn, yesLbl, noBtn, noLbl];

    yesBtn.on('pointerover', () => yesBtn.setFillStyle(0x33aa33));
    yesBtn.on('pointerout', () => yesBtn.setFillStyle(0x227722));
    noBtn.on('pointerover', () => noBtn.setFillStyle(0xaa3333));
    noBtn.on('pointerout', () => noBtn.setFillStyle(0x772222));

    yesBtn.on('pointerdown', () => this.startNpcDuel(npc));
    noBtn.on('pointerdown', () => this.closeDuelPrompt());
  }

  closeDuelPrompt() {
    if (this.promptGroup) this.promptGroup.forEach(o => o.destroy());
    this.promptGroup = [];
    this.duelPromptActive = false;
    this.dialogueLocked = false;
    this.activeNpc = null;
    this.dialogueBg.setVisible(false);
    this.dialogueText.setText('');
    this.skipBtnBg.setVisible(false);
    this.skipBtnText.setVisible(false);
  }

  startNpcDuel(npc) {
    const playerDeck = loadDeck();
    if (!playerDeck || playerDeck.length < 30) {
      this.closeDuelPrompt();
      this.dialogueBg.setVisible(true);
      this.dialogueText.setText('You need a 30-card deck first! Visit the Deck Builder.');
      this.dialogueLocked = false;
      return;
    }

    const enemyDeck = generateEnemyDeck();
    const artifacts = loadArtifacts();

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(300, () => {
      this.scene.start('Battle', {
        playerDeck, enemyDeck, artifacts,
        npcId: npc.id, npcName: npc.name, xpReward: 25,
        returnTo: 'YakuzaHideout',
        playerX: this.returnData.playerX,
        playerY: this.returnData.playerY,
        ws: this.ws,
        myId: this.myId
      });
    });
  }

  /* ═══════ UPDATE ═══════ */

  update(time) {
    if (this.duelPromptActive) return;

    let vx = 0, vy = 0;
    if (this.keys.LEFT.isDown || this.keys.A.isDown) { vx = -SPEED; this.playerDir = 'left'; }
    else if (this.keys.RIGHT.isDown || this.keys.D.isDown) { vx = SPEED; this.playerDir = 'right'; }
    if (this.keys.UP.isDown || this.keys.W.isDown) { vy = -SPEED; this.playerDir = 'up'; }
    else if (this.keys.DOWN.isDown || this.keys.S.isDown) { vy = SPEED; this.playerDir = 'down'; }

    if (vx && vy) { vx *= 0.707; vy *= 0.707; }

    this.player.x = Phaser.Math.Clamp(this.player.x + vx, ROOM_X + 20, ROOM_X + ROOM_W - 20);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy, ROOM_Y + 60, ROOM_Y + ROOM_H - 10);

    const moving = vx !== 0 || vy !== 0;
    const animKey = moving ? 'walk_' + this.playerDir : 'idle_down';
    if (this.anims.exists(animKey)) this.player.play(animKey, true);

    sendPos(this, time, this.player.x, this.player.y, animKey);
    interpRemote(this);

    const eTap = this.keyE.isDown && !this.keyEPrev;
    const qTap = this.keyQ.isDown && !this.keyQPrev;
    const spaceTap = this.keySpace.isDown && !this.keySpacePrev;
    this.keyEPrev = this.keyE.isDown;
    this.keyQPrev = this.keyQ.isDown;
    this.keySpacePrev = this.keySpace.isDown;
    const interact = eTap || spaceTap;

    if (this.activeNpc && interact) {
      this.advanceDialogue();
      return;
    }

    const cs = tickChallenge(this, eTap, qTap);

    if (!cs) {
      let closestNpc = null;
      let closestDist = Infinity;
      for (const npc of NPCS) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
        if (d < INTERACT_R && d < closestDist) { closestNpc = npc; closestDist = d; }
      }

      if (closestNpc) {
        this.promptText.setText(`[E / SPACE] Talk to ${closestNpc.name}`);
        if (interact) this.talkToNpc(closestNpc);
      } else {
        this.promptText.setText('');
        if (this.activeNpc) {
          this.activeNpc = null;
          this.dialogueBg.setVisible(false);
          this.dialogueText.setText('');
          this.skipBtnBg.setVisible(false);
          this.skipBtnText.setVisible(false);
        }
      }
    }

    if (qTap && !cs) {
      this.exitToMap();
    }

    if (this.player.y > ROOM_Y + ROOM_H - 15) {
      this.exitToMap();
    }
  }

  exitToMap() {
    if (this._exiting) return;
    this._exiting = true;
    cleanupMp(this);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(300, () => {
      this.scene.start('MmoMap', {
        ws: this.ws,
        myId: this.myId,
        playerX: this.returnData.playerX,
        playerY: this.returnData.playerY
      });
    });
  }
}
