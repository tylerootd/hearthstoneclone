import Phaser from 'phaser';
import { loadDeck, loadCollection, saveCollection } from '../data/storage.js';
import { getAllCards, getCardById, rebuildPool } from '../data/cardPool.js';
import {
  createBattleState, startTurn, endTurnTriggers, canPlayCard, playCard,
  minionAttack, runEnemyTurn, needsTarget, generateEnemyDeck
} from '../game/battleEngine.js';

const W = 1024, H = 768;
const CARD_W = 82, CARD_H = 116;
const MINION_S = 74;

function spriteKey(card) {
  if (!card.sprite) return null;
  return 'sprite_' + card.sprite.replace('.png', '');
}

const FONT = { fontFamily: '"Press Start 2P", monospace, Arial', fontSize: '10px' };

export default class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  create(data) {
    this.selecting = null;
    this.targetMode = false;

    const playerDeck = (data && data.playerDeck) || loadDeck() || [];
    const enemyDeck = (data && data.enemyDeck) || generateEnemyDeck();
    this.bs = createBattleState(playerDeck, enemyDeck);
    startTurn(this.bs, 'player');

    this.uiGroup = this.add.group();
    this.redraw();
  }

  redraw() {
    this.uiGroup.clear(true, true);
    const s = this.bs;

    this.drawHero(512, 52, s.enemy, 'Enemy', true);
    this.drawBoard(s.enemy.board, 185, false);

    this.uiGroup.add(this.add.rectangle(512, 340, 960, 2, 0x333344));

    this.drawBoard(s.player.board, 430, true);
    this.drawHero(512, 580, s.player, 'You', false);

    this.uiGroup.add(this.add.text(850, 570, `MANA ${s.player.mana}/${s.player.maxMana}`, {
      ...FONT, fontSize: '14px', color: '#66aaff'
    }));

    this.drawHand();

    if (s.phase === 'playing' && s.currentTurn === 'player') {
      const bg = this.add.rectangle(950, 340, 100, 38, 0x886622, 1).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0xccaa44);
      const txt = this.add.text(950, 340, 'END TURN', { ...FONT, fontSize: '10px', color: '#fff' }).setOrigin(0.5);
      this.uiGroup.add(bg);
      this.uiGroup.add(txt);
      bg.on('pointerdown', () => this.endTurn());
    }

    const logLines = s.log.slice(-3);
    logLines.forEach((line, i) => {
      this.uiGroup.add(this.add.text(10, 342 + i * 16, line, { ...FONT, fontSize: '8px', color: '#888888' }));
    });

    if (s.phase === 'over') this.showResult();
  }

  drawHero(x, y, side, label, isEnemy) {
    const fill = isEnemy ? 0x661122 : 0x112266;
    const bg = this.add.rectangle(x, y, 180, 50, fill).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(2, isEnemy ? 0xaa3344 : 0x4466aa);
    this.uiGroup.add(bg);

    this.uiGroup.add(this.add.text(x, y - 10, label, { ...FONT, fontSize: '12px', color: '#fff' }).setOrigin(0.5));

    const hpColor = side.hp <= 10 ? '#ff4444' : '#ffffff';
    this.uiGroup.add(this.add.text(x, y + 12, `HP ${side.hp}/${side.maxHp}  Deck ${side.deck.length}`, {
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

      const card = getCardById(m.id);
      const key = card ? spriteKey(card) : null;

      const border = isPlayer ? 0x336644 : 0x663344;
      const bg = this.add.rectangle(x, y, MINION_S, MINION_S, 0x111111).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, border);
      this.uiGroup.add(bg);

      if (key && this.textures.exists(key)) {
        const img = this.add.image(x, y - 4, key).setDisplaySize(MINION_S - 8, MINION_S - 8);
        this.uiGroup.add(img);
      }

      this.uiGroup.add(this.add.text(x, y - MINION_S / 2 + 4, m.name.slice(0, 7), {
        ...FONT, fontSize: '7px', color: '#fff',
        backgroundColor: '#00000099', padding: { x: 2, y: 1 }
      }).setOrigin(0.5));

      // atk/hp badges
      const atkBg = this.add.circle(x - MINION_S / 2 + 8, y + MINION_S / 2 - 8, 11, 0xccaa00);
      const hpBg  = this.add.circle(x + MINION_S / 2 - 8, y + MINION_S / 2 - 8, 11, 0xcc2222);
      this.uiGroup.add(atkBg);
      this.uiGroup.add(hpBg);
      this.uiGroup.add(this.add.text(x - MINION_S / 2 + 8, y + MINION_S / 2 - 8, `${m.atk}`, {
        ...FONT, fontSize: '10px', color: '#fff'
      }).setOrigin(0.5));
      this.uiGroup.add(this.add.text(x + MINION_S / 2 - 8, y + MINION_S / 2 - 8, `${m.hp}`, {
        ...FONT, fontSize: '10px', color: '#fff'
      }).setOrigin(0.5));

      if (!m.canAttack && isPlayer) {
        this.uiGroup.add(this.add.text(x, y + 4, 'zzz', { ...FONT, fontSize: '8px', color: '#666' }).setOrigin(0.5));
      }

      if (isPlayer && m.canAttack && !this.targetMode && this.bs.phase === 'playing' && this.bs.currentTurn === 'player') {
        bg.on('pointerdown', () => {
          this.selecting = { type: 'attack', uid: m.uid };
          this.targetMode = true;
          this.redraw();
        });
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
    const hand = this.bs.player.hand;
    const startX = 512 - (hand.length - 1) * (CARD_W + 4) / 2;
    hand.forEach((card, i) => {
      const x = startX + i * (CARD_W + 4);
      const y = H - 62;
      const playable = canPlayCard(this.bs, 'player', i);

      const bg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, playable ? 0x66aaff : 0x333344);
      this.uiGroup.add(bg);

      const key = spriteKey(card);
      if (key && this.textures.exists(key)) {
        const img = this.add.image(x, y - 6, key).setDisplaySize(CARD_W - 10, 62);
        img.setCrop(0, 0, img.width, img.height * 0.7);
        this.uiGroup.add(img);
      }

      // cost gem
      const costBg = this.add.circle(x - CARD_W / 2 + 10, y - CARD_H / 2 + 10, 12, 0x2244aa);
      this.uiGroup.add(costBg);
      this.uiGroup.add(this.add.text(x - CARD_W / 2 + 10, y - CARD_H / 2 + 10, `${card.cost}`, {
        ...FONT, fontSize: '11px', color: '#ffffff'
      }).setOrigin(0.5));

      // name banner
      this.uiGroup.add(this.add.rectangle(x, y + 16, CARD_W - 4, 16, 0x000000, 0.8));
      this.uiGroup.add(this.add.text(x, y + 16, card.name.slice(0, 10), {
        ...FONT, fontSize: '7px', color: '#ffffff'
      }).setOrigin(0.5));

      if (card.type === 'minion') {
        const atkBg = this.add.circle(x - CARD_W / 2 + 10, y + CARD_H / 2 - 12, 11, 0xccaa00);
        const hpBg  = this.add.circle(x + CARD_W / 2 - 10, y + CARD_H / 2 - 12, 11, 0xcc2222);
        this.uiGroup.add(atkBg);
        this.uiGroup.add(hpBg);
        this.uiGroup.add(this.add.text(x - CARD_W / 2 + 10, y + CARD_H / 2 - 12, `${card.atk}`, {
          ...FONT, fontSize: '10px', color: '#fff'
        }).setOrigin(0.5));
        this.uiGroup.add(this.add.text(x + CARD_W / 2 - 10, y + CARD_H / 2 - 12, `${card.hp}`, {
          ...FONT, fontSize: '10px', color: '#fff'
        }).setOrigin(0.5));
      } else {
        this.uiGroup.add(this.add.text(x, y + 36, 'SPELL', {
          ...FONT, fontSize: '8px', color: '#cc88ff'
        }).setOrigin(0.5));
      }

      if (card.effect) {
        this.uiGroup.add(this.add.text(x, y + 46, card.effect.kind, {
          ...FONT, fontSize: '6px', color: '#88ccaa'
        }).setOrigin(0.5));
      }
      if (card.triggers && card.triggers.length) {
        this.uiGroup.add(this.add.text(x, y - CARD_H / 2 + 10, '\u26A0', {
          fontSize: '12px'
        }).setOrigin(0.5));
      }

      if (playable && !this.targetMode && this.bs.phase === 'playing' && this.bs.currentTurn === 'player') {
        bg.on('pointerdown', () => {
          if (needsTarget(card)) {
            const isFriendly = card.effect.target === 'friendly_minion';
            this.selecting = { type: 'play', handIndex: i, card, needsFriendly: isFriendly };
            this.targetMode = true;
            this.redraw();
          } else {
            playCard(this.bs, 'player', i, null);
            this.targetMode = false;
            this.selecting = null;
            this.redraw();
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

      this.uiGroup.add(this.add.text(512, 310, '[ SELECT TARGET ]', {
        ...FONT, fontSize: '12px', color: '#ffcc00'
      }).setOrigin(0.5));
    }
  }

  onTargetSelected(targetInfo) {
    if (!this.selecting) return;
    if (this.selecting.type === 'play') {
      playCard(this.bs, 'player', this.selecting.handIndex, targetInfo);
    } else if (this.selecting.type === 'attack') {
      minionAttack(this.bs, 'player', this.selecting.uid, targetInfo);
    }
    this.targetMode = false;
    this.selecting = null;
    this.redraw();
  }

  endTurn() {
    endTurnTriggers(this.bs, 'player');
    if (this.bs.phase === 'over') { this.redraw(); return; }

    startTurn(this.bs, 'enemy');
    if (this.bs.phase === 'over') { this.redraw(); return; }

    this.time.delayedCall(600, () => {
      runEnemyTurn(this.bs);
      if (this.bs.phase === 'over') { this.redraw(); return; }

      endTurnTriggers(this.bs, 'enemy');
      if (this.bs.phase === 'over') { this.redraw(); return; }

      startTurn(this.bs, 'player');
      this.redraw();
    });
  }

  showResult() {
    const overlay = this.add.rectangle(512, 384, W, H, 0x000000, 0.75);
    this.uiGroup.add(overlay);

    const won = this.bs.winner === 'player';
    const msg = won ? 'VICTORY' : (this.bs.winner === 'draw' ? 'DRAW' : 'DEFEAT');
    this.uiGroup.add(this.add.text(512, 220, msg, {
      ...FONT, fontSize: '36px', color: won ? '#44ff44' : '#ff4444'
    }).setOrigin(0.5));

    if (won) {
      this.showRewardPick();
    } else {
      const btn = this.add.rectangle(512, 420, 200, 44, 0x334455).setInteractive({ useHandCursor: true });
      btn.setStrokeStyle(2, 0x5577aa);
      this.uiGroup.add(btn);
      this.uiGroup.add(this.add.text(512, 420, 'RETURN TO HUB', { ...FONT, fontSize: '11px', color: '#fff' }).setOrigin(0.5));
      btn.on('pointerdown', () => this.scene.start('Hub'));
    }
  }

  showRewardPick() {
    this.uiGroup.add(this.add.text(512, 290, 'Pick a card reward:', {
      ...FONT, fontSize: '14px', color: '#e6b422'
    }).setOrigin(0.5));

    const pool = getAllCards();
    const rewards = [];
    const used = new Set();
    while (rewards.length < 3 && rewards.length < pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      if (!used.has(idx)) { used.add(idx); rewards.push(pool[idx]); }
    }

    rewards.forEach((card, i) => {
      const x = 300 + i * 212;
      const y = 450;

      const bg = this.add.rectangle(x, y, 140, 170, 0x1a1a2a).setInteractive({ useHandCursor: true });
      bg.setStrokeStyle(2, 0x556688);
      this.uiGroup.add(bg);

      const key = spriteKey(card);
      if (key && this.textures.exists(key)) {
        this.uiGroup.add(this.add.image(x, y - 24, key).setDisplaySize(100, 80));
      }

      const costBg = this.add.circle(x - 56, y - 72, 14, 0x2244aa);
      this.uiGroup.add(costBg);
      this.uiGroup.add(this.add.text(x - 56, y - 72, `${card.cost}`, {
        ...FONT, fontSize: '12px', color: '#fff'
      }).setOrigin(0.5));

      this.uiGroup.add(this.add.rectangle(x, y + 30, 130, 16, 0x000000, 0.8));
      this.uiGroup.add(this.add.text(x, y + 30, card.name, { ...FONT, fontSize: '8px', color: '#fff' }).setOrigin(0.5));

      if (card.type === 'minion') {
        this.uiGroup.add(this.add.text(x, y + 50, `${card.atk} / ${card.hp}`, {
          ...FONT, fontSize: '10px', color: '#ffcc44'
        }).setOrigin(0.5));
      } else {
        this.uiGroup.add(this.add.text(x, y + 50, 'SPELL', { ...FONT, fontSize: '9px', color: '#cc88ff' }).setOrigin(0.5));
      }
      if (card.effect) {
        this.uiGroup.add(this.add.text(x, y + 66, card.effect.kind, { ...FONT, fontSize: '7px', color: '#88ccaa' }).setOrigin(0.5));
      }

      bg.on('pointerover', () => bg.setStrokeStyle(2, 0xaaccff));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0x556688));
      bg.on('pointerdown', () => {
        const col = loadCollection() || [];
        col.push(card.id);
        saveCollection(col);
        this.scene.start('Hub');
      });
    });
  }
}
