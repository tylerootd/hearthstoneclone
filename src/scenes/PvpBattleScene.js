import Phaser from 'phaser';
import { getCardTextureKey } from '../utils/cardSprite.js';
import { grantXp } from '../data/progression.js';
import { loadCollection, saveCollection } from '../data/storage.js';
import { ARTIFACT_DEFS } from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 82, CARD_H = 116, MINION_S = 74;
const FONT = { fontFamily: '"Press Start 2P", monospace, Arial', fontSize: '10px' };

export default class PvpBattleScene extends Phaser.Scene {
  constructor() { super('PvpBattle'); }

  create(data) {
    this.ws = data.ws;
    this.myId = data.myId;
    this.returnData = { playerX: data.playerX, playerY: data.playerY };
    this.state = null;
    this.selecting = null;
    this.targetMode = false;
    this.uiGroup = this.add.group();
    this.gameOver = false;

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pvp_state') {
          this.state = msg;
          if (msg.phase === 'over') this.gameOver = true;
          this.selecting = null;
          this.targetMode = false;
          this.redraw();
        }
      } catch (e) { console.error('[PvP] message parse error:', e); }
    };

    this.add.text(W / 2, H / 2, 'Waiting for duel to start...', {
      ...FONT, fontSize: '14px', color: '#aaa'
    }).setOrigin(0.5);

    // Tell server we're ready to receive state
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'pvp_ready' }));
    }
  }

  redraw() {
    this.uiGroup.clear(true, true);
    const s = this.state;
    if (!s) return;

    // Opponent (top)
    this.drawHero(512, 52, s.opponent, 'Opponent', true);
    this.drawBoard(s.opponent.board, 185, false);

    this.uiGroup.add(this.add.rectangle(512, 340, 960, 2, 0x333344));

    // You (bottom)
    this.drawBoard(s.you.board, 430, true);
    this.drawHero(512, 580, s.you, 'You', false);

    // Mana
    this.uiGroup.add(this.add.text(850, 570, `MANA ${s.you.mana}/${s.you.maxMana}`, {
      ...FONT, fontSize: '14px', color: '#66aaff'
    }));

    // Hand
    this.drawHand();

    // Turn indicator
    const turnMsg = s.yourTurn ? 'YOUR TURN' : "OPPONENT'S TURN";
    const turnCol = s.yourTurn ? '#44ff44' : '#ff8844';
    this.uiGroup.add(this.add.text(512, 310, turnMsg, {
      ...FONT, fontSize: '12px', color: turnCol
    }).setOrigin(0.5));

    // End Turn button
    if (s.phase === 'playing' && s.yourTurn && !this.targetMode) {
      const bg = this.add.rectangle(950, 340, 100, 38, 0x886622).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0xccaa44);
      this.uiGroup.add(bg);
      this.uiGroup.add(this.add.text(950, 340, 'END TURN', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
      bg.on('pointerdown', () => this.sendAction({ type: 'pvp_end_turn' }));
    }

    // Log
    (s.log || []).forEach((line, i) => {
      this.uiGroup.add(this.add.text(10, 342 + i * 16, line, { ...FONT, fontSize: '8px', color: '#888' }));
    });

    // Opponent hand count
    this.uiGroup.add(this.add.text(512, 12, `Opponent hand: ${s.opponent.handCount}  |  Deck: ${s.opponent.deckCount}`, {
      ...FONT, fontSize: '8px', color: '#888'
    }).setOrigin(0.5));

    if (s.phase === 'over') this.showResult();
  }

  drawHero(x, y, side, label, isEnemy) {
    const fill = isEnemy ? 0x661122 : 0x112266;
    const bg = this.add.rectangle(x, y, 180, 50, fill).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(2, isEnemy ? 0xaa3344 : 0x4466aa);
    this.uiGroup.add(bg);
    this.uiGroup.add(this.add.text(x, y - 10, label, { ...FONT, fontSize: '12px', color: '#fff' }).setOrigin(0.5));
    const hpColor = side.hp <= 10 ? '#ff4444' : '#ffffff';
    this.uiGroup.add(this.add.text(x, y + 12, `HP ${side.hp}/${side.maxHp}  Deck ${side.deckCount}`, {
      ...FONT, fontSize: '9px', color: hpColor
    }).setOrigin(0.5));

    if (isEnemy && this.targetMode) {
      bg.on('pointerdown', () => this.onTargetSelected({ type: 'hero' }));
    }
  }

  drawBoard(board, yBase, isPlayer) {
    const startX = 512 - (board.length - 1) * (MINION_S + 8) / 2;
    board.forEach((m, i) => {
      const x = startX + i * (MINION_S + 8);
      const y = yBase;

      const key = m.sprite ? (() => { const k = 'sprite_' + m.sprite.replace('.png', ''); return this.textures.exists(k) ? k : null; })() : null;
      const border = isPlayer ? 0x336644 : 0x663344;
      const bg = this.add.rectangle(x, y, MINION_S, MINION_S, 0x111111).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, border);
      this.uiGroup.add(bg);

      if (key) { this.uiGroup.add(this.add.image(x, y - 4, key).setDisplaySize(MINION_S - 8, MINION_S - 8)); }

      this.uiGroup.add(this.add.text(x, y - MINION_S / 2 + 4, m.name.slice(0, 7), {
        ...FONT, fontSize: '7px', color: '#fff', backgroundColor: '#00000099', padding: { x: 2, y: 1 }
      }).setOrigin(0.5));

      this.uiGroup.add(this.add.circle(x - MINION_S / 2 + 8, y + MINION_S / 2 - 8, 11, 0xccaa00));
      this.uiGroup.add(this.add.circle(x + MINION_S / 2 - 8, y + MINION_S / 2 - 8, 11, 0xcc2222));
      this.uiGroup.add(this.add.text(x - MINION_S / 2 + 8, y + MINION_S / 2 - 8, `${m.atk}`, { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
      this.uiGroup.add(this.add.text(x + MINION_S / 2 - 8, y + MINION_S / 2 - 8, `${m.hp}`, { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));

      if (!m.canAttack && isPlayer) {
        this.uiGroup.add(this.add.text(x, y + 4, 'zzz', { ...FONT, fontSize: '8px', color: '#666' }).setOrigin(0.5));
      }

      const s = this.state;
      if (isPlayer && m.canAttack && !this.targetMode && s.phase === 'playing' && s.yourTurn) {
        bg.on('pointerdown', () => { this.selecting = { type: 'attack', uid: m.uid }; this.targetMode = true; this.redraw(); });
      }
      if (this.targetMode && !isPlayer) {
        bg.on('pointerdown', () => this.onTargetSelected({ type: 'minion', uid: m.uid }));
      }
      if (this.targetMode && isPlayer && this.selecting && this.selecting.needsFriendly) {
        bg.on('pointerdown', () => this.onTargetSelected({ type: 'minion', uid: m.uid }));
      }
    });
  }

  drawHand() {
    const hand = this.state.you.hand;
    const s = this.state;
    const startX = 512 - (hand.length - 1) * (CARD_W + 4) / 2;
    hand.forEach((card, i) => {
      const x = startX + i * (CARD_W + 4);
      const y = H - 62;
      const playable = card.cost <= s.you.mana && s.yourTurn && s.phase === 'playing';

      const bg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, playable ? 0x66aaff : 0x333344);
      this.uiGroup.add(bg);

      const key = getCardTextureKey(this, card);
      if (key) {
        const img = this.add.image(x, y - 6, key).setDisplaySize(CARD_W - 10, 62);
        img.setCrop(0, 0, img.width, img.height * 0.7);
        this.uiGroup.add(img);
      }

      this.uiGroup.add(this.add.circle(x - CARD_W / 2 + 10, y - CARD_H / 2 + 10, 12, 0x2244aa));
      this.uiGroup.add(this.add.text(x - CARD_W / 2 + 10, y - CARD_H / 2 + 10, `${card.cost}`, { ...FONT, fontSize: '11px', color: '#fff' }).setOrigin(0.5));
      this.uiGroup.add(this.add.rectangle(x, y + 16, CARD_W - 4, 16, 0x000000, 0.8));
      this.uiGroup.add(this.add.text(x, y + 16, card.name.slice(0, 10), { ...FONT, fontSize: '7px', color: '#fff' }).setOrigin(0.5));

      if (card.type === 'minion') {
        this.uiGroup.add(this.add.circle(x - CARD_W / 2 + 10, y + CARD_H / 2 - 12, 11, 0xccaa00));
        this.uiGroup.add(this.add.circle(x + CARD_W / 2 - 10, y + CARD_H / 2 - 12, 11, 0xcc2222));
        this.uiGroup.add(this.add.text(x - CARD_W / 2 + 10, y + CARD_H / 2 - 12, `${card.atk}`, { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
        this.uiGroup.add(this.add.text(x + CARD_W / 2 - 10, y + CARD_H / 2 - 12, `${card.hp}`, { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
      } else {
        this.uiGroup.add(this.add.text(x, y + 36, 'SPELL', { ...FONT, fontSize: '8px', color: '#cc88ff' }).setOrigin(0.5));
      }

      if (card.effect) this.uiGroup.add(this.add.text(x, y + 46, card.effect.kind, { ...FONT, fontSize: '6px', color: '#88ccaa' }).setOrigin(0.5));

      if (playable && !this.targetMode) {
        bg.on('pointerdown', () => {
          const needsTarget = card.effect && (card.effect.target === 'enemy_any' || card.effect.target === 'friendly_minion');
          if (needsTarget) {
            this.selecting = { type: 'play', handIndex: i, card, needsFriendly: card.effect.target === 'friendly_minion' };
            this.targetMode = true;
            this.redraw();
          } else {
            this.sendAction({ type: 'pvp_play_card', handIndex: i, target: null });
          }
        });
      }
    });

    if (this.targetMode) {
      const cancelBg = this.add.rectangle(950, 390, 100, 28, 0x663333).setInteractive({ useHandCursor: true });
      cancelBg.setStrokeStyle(1, 0xaa4444);
      this.uiGroup.add(cancelBg);
      this.uiGroup.add(this.add.text(950, 390, 'CANCEL', { ...FONT, fontSize: '9px', color: '#fff' }).setOrigin(0.5));
      cancelBg.on('pointerdown', () => { this.targetMode = false; this.selecting = null; this.redraw(); });
      this.uiGroup.add(this.add.text(512, 282, '[ SELECT TARGET ]', { ...FONT, fontSize: '12px', color: '#ffcc00' }).setOrigin(0.5));
    }
  }

  onTargetSelected(targetInfo) {
    if (!this.selecting) return;
    if (this.selecting.type === 'play') {
      this.sendAction({ type: 'pvp_play_card', handIndex: this.selecting.handIndex, target: targetInfo });
    } else if (this.selecting.type === 'attack') {
      this.sendAction({ type: 'pvp_attack', attackerUid: this.selecting.uid, target: targetInfo });
    }
    this.targetMode = false;
    this.selecting = null;
  }

  sendAction(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  returnToMap() {
    this.scene.start('MmoMap', {
      ws: this.ws,
      myId: this.myId,
      playerX: this.returnData.playerX,
      playerY: this.returnData.playerY
    });
  }

  showResult() {
    const overlay = this.add.rectangle(512, 384, W, H, 0x000000, 0.85);
    this.uiGroup.add(overlay);

    const won = this.state.winner === 'you';
    const isDraw = this.state.winner === 'draw';

    // --- Punch animation ---
    const winnerSprite = this.add.rectangle(won ? 430 : 594, 280, 48, 64, won ? 0x44ff44 : 0xff4444);
    const loserSprite  = this.add.rectangle(won ? 594 : 430, 280, 48, 64, won ? 0xff4444 : 0x44ff44);
    this.uiGroup.add(winnerSprite);
    this.uiGroup.add(loserSprite);
    this.uiGroup.add(this.add.text(winnerSprite.x, 236, 'WINNER', { ...FONT, fontSize: '9px', color: '#44ff44' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(loserSprite.x, 236, 'LOSER',  { ...FONT, fontSize: '9px', color: '#ff4444' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(winnerSprite.x, 350, won ? 'YOU' : 'OPP', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(loserSprite.x, 350, won ? 'OPP' : 'YOU', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5));

    this.tweens.add({
      targets: winnerSprite,
      x: loserSprite.x - 30,
      duration: 400,
      ease: 'Power2',
      yoyo: true,
      onYoyo: () => {
        this.cameras.main.shake(200, 0.01);
        const bang = this.add.text(512, 280, 'POW!', { ...FONT, fontSize: '28px', color: '#ffcc00' }).setOrigin(0.5);
        this.uiGroup.add(bang);
        this.tweens.add({ targets: bang, alpha: 0, y: 250, duration: 600 });
      },
      onComplete: () => {
        if (isDraw) this.showDrawScreen();
        else if (won) this.showWinScreen();
        else this.showLoseScreen();
      }
    });
  }

  showWinScreen() {
    grantXp(30);
    this.uiGroup.add(this.add.text(512, 380, 'VICTORY!  +30 XP', { ...FONT, fontSize: '22px', color: '#44ff44' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(512, 410, 'Steal a card from your opponent\'s deck:', { ...FONT, fontSize: '11px', color: '#e6b422' }).setOrigin(0.5));

    const rewards = this.state.rewardCards || [];
    if (rewards.length === 0) {
      this.uiGroup.add(this.add.text(512, 460, 'No cards available', { ...FONT, fontSize: '10px', color: '#aaa' }).setOrigin(0.5));
      this.addReturnButton(520);
      return;
    }

    const startX = 512 - (rewards.length - 1) * 90;
    rewards.forEach((card, i) => {
      const cx = startX + i * 180;
      const cy = 510;
      const bg = this.add.rectangle(cx, cy, 150, 110, 0x223344).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0x5577aa);
      this.uiGroup.add(bg);
      this.uiGroup.add(this.add.text(cx, cy - 40, card.name, { ...FONT, fontSize: '11px', color: '#fff' }).setOrigin(0.5));
      this.uiGroup.add(this.add.text(cx, cy - 20, `${card.cost}⬡  ${card.attack}⚔  ${card.hp}♥`, { ...FONT, fontSize: '10px', color: '#88bbff' }).setOrigin(0.5));

      const desc = card.effect?.description || card.description || '';
      if (desc) {
        this.uiGroup.add(this.add.text(cx, cy + 5, desc, { ...FONT, fontSize: '8px', color: '#ccc', wordWrap: { width: 130 } }).setOrigin(0.5, 0));
      }

      bg.on('pointerdown', () => {
        const col = loadCollection() || [];
        col.push(card.id);
        saveCollection(col);
        this.uiGroup.getAll().forEach(c => { if (c.input) c.removeInteractive(); });
        this.uiGroup.add(this.add.text(512, 600, `${card.name} added to your collection!`, { ...FONT, fontSize: '14px', color: '#44ffaa' }).setOrigin(0.5));
        bg.setStrokeStyle(3, 0x44ff44);
        this.addReturnButton(650);
      });
    });
  }

  showLoseScreen() {
    this.uiGroup.add(this.add.text(512, 390, 'DEFEAT', { ...FONT, fontSize: '28px', color: '#ff4444' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(512, 430, 'Your opponent stole one of your cards!', { ...FONT, fontSize: '11px', color: '#ff8888' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(512, 460, 'Train harder and reclaim your honor.', { ...FONT, fontSize: '10px', color: '#aaa' }).setOrigin(0.5));
    this.addReturnButton(520);
  }

  showDrawScreen() {
    this.uiGroup.add(this.add.text(512, 390, 'DRAW', { ...FONT, fontSize: '28px', color: '#e6b422' }).setOrigin(0.5));
    this.uiGroup.add(this.add.text(512, 430, 'No victor this time.', { ...FONT, fontSize: '11px', color: '#ccc' }).setOrigin(0.5));
    this.addReturnButton(490);
  }

  addReturnButton(y) {
    const btn = this.add.rectangle(512, y, 240, 44, 0x334455).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(2, 0x5577aa);
    this.uiGroup.add(btn);
    this.uiGroup.add(this.add.text(512, y, 'RETURN TO MAP', { ...FONT, fontSize: '11px', color: '#fff' }).setOrigin(0.5));
    btn.on('pointerdown', () => this.returnToMap());
  }
}
