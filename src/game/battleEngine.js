import { getCardById } from '../data/cardPool.js';

const MAX_HAND = 10;
const MAX_BOARD = 7;
const MAX_MANA = 10;
const STARTING_HP = 3000;

export const ARTIFACT_DEFS = {
  warcry_aura: {
    id: 'warcry_aura',
    name: 'Warcry Aura',
    description: 'All friendly minions get +100 Attack',
    icon: '\u2694',
    color: '#ffcc44'
  },
  fireball_turret: {
    id: 'fireball_turret',
    name: 'Fireball Turret',
    description: 'End of turn: Deal 300 damage to enemy hero',
    icon: '\u2737',
    color: '#ff6644'
  },
  mana_crystal: {
    id: 'mana_crystal',
    name: 'Mana Crystal',
    description: 'Start the game with +1 max mana',
    icon: '\u25C6',
    color: '#66aaff'
  }
};

export const ALL_ARTIFACT_IDS = Object.keys(ARTIFACT_DEFS);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeMinion(card) {
  return {
    uid: crypto.randomUUID(),
    id: card.id,
    name: card.name,
    cost: card.cost,
    atk: card.atk,
    hp: card.hp,
    maxHp: card.hp,
    effect: card.effect || null,
    triggers: card.triggers || [],
    keywords: card.keywords ? [...card.keywords] : [],
    canAttack: false,
    slot: -1
  };
}

export function guardianBlockingHero(attackerSlot, opponentBoard) {
  return opponentBoard.find(
    m => m.keywords.includes('guardian') && m.slot === attackerSlot
  ) || null;
}

export function hasAnyGuardian(opponentBoard) {
  return opponentBoard.some(m => m.keywords.includes('guardian'));
}

function nextFreeSlot(board) {
  const taken = new Set(board.map(m => m.slot));
  for (let s = 3, d = 0; d < MAX_BOARD; d++) {
    const try1 = 3 + Math.ceil(d / 2) * (d % 2 === 0 ? 1 : -1);
    if (try1 >= 0 && try1 < MAX_BOARD && !taken.has(try1)) return try1;
  }
  for (let s = 0; s < MAX_BOARD; s++) { if (!taken.has(s)) return s; }
  return 0;
}

export function createBattleState(playerDeckIds, enemyDeckIds, playerArtifacts = [], playerLevel = 99) {
  const playerDeck = shuffle(playerDeckIds.map(id => getCardById(id)).filter(Boolean));
  const enemyDeck  = shuffle(enemyDeckIds.map(id => getCardById(id)).filter(Boolean));

  const arts = new Set(playerArtifacts);

  const state = {
    player: {
      hp: STARTING_HP, maxHp: STARTING_HP,
      mana: 0, maxMana: 0,
      deck: playerDeck, hand: [], board: [],
      fatigue: 0,
      artifacts: playerArtifacts
    },
    enemy: {
      hp: STARTING_HP, maxHp: STARTING_HP,
      mana: 0, maxMana: 0,
      deck: enemyDeck, hand: [], board: [],
      fatigue: 0,
      artifacts: []
    },
    turn: 0,
    currentTurn: 'player',
    phase: 'playing',
    winner: null,
    log: [],
    playerLevel
  };

  /* ARTIFACTS DISABLED
  if (arts.has('mana_crystal')) {
    state.player.maxMana = 1;
    state.player.mana = 1;
    state.log.push('Mana Crystal: Start with +1 mana!');
  }
  */

  for (let i = 0; i < 3; i++) drawCard(state, 'player');
  for (let i = 0; i < 4; i++) drawCard(state, 'enemy');

  return state;
}

export function drawCard(state, who) {
  const side = state[who];
  if (side.deck.length === 0) {
    side.fatigue++;
    side.hp -= side.fatigue;
    state.log.push(`${who} takes ${side.fatigue} fatigue damage!`);
    checkWin(state);
    return null;
  }
  if (side.hand.length >= MAX_HAND) {
    const burned = side.deck.shift();
    state.log.push(`${who}'s hand is full — ${burned.name} burned!`);
    return null;
  }
  const card = side.deck.shift();
  side.hand.push(card);
  return card;
}

export function startTurn(state, who) {
  const side = state[who];
  state.currentTurn = who;
  state.turn++;

  if (side.maxMana < MAX_MANA) side.maxMana++;
  side.mana = side.maxMana;

  side.board.forEach(m => { m.canAttack = true; });

  drawCard(state, who);
  processTriggers(state, who, 'turn_start');
}

export function endTurnTriggers(state, who) {
  processTriggers(state, who, 'turn_end');
  processArtifactTriggers(state, who);
}

function processArtifactTriggers(state, who) {
  return; /* ARTIFACTS DISABLED */
  const side = state[who];
  const opp = who === 'player' ? state.enemy : state.player;
  if (!side.artifacts) return;

  if (side.artifacts.includes('fireball_turret') && state.phase !== 'over') {
    opp.hp -= 300;
    state.log.push(`Fireball Turret: 300 damage to ${who === 'player' ? 'enemy' : 'player'} hero!`);
    checkWin(state);
  }
}

function processTriggers(state, who, timing) {
  const side = state[who];
  for (const minion of [...side.board]) {
    if (state.phase === 'over') return;
    for (const trigger of minion.triggers) {
      if (trigger.when !== timing) continue;
      state.log.push(`  ${minion.name} triggers: ${trigger.effect.kind}`);
      applyEffect(state, who, trigger.effect, null, minion);
      checkWin(state);
    }
  }
}

export function canPlayCard(state, who, handIndex) {
  const side = state[who];
  const card = side.hand[handIndex];
  if (!card) return false;
  if (card.cost > side.mana) return false;
  if (card.type === 'minion' && side.board.length >= MAX_BOARD) return false;
  return true;
}

export function playCard(state, who, handIndex, targetInfo, boardPos) {
  const side = state[who];
  const opp  = who === 'player' ? state.enemy : state.player;
  const card = side.hand[handIndex];
  if (!card) return false;
  if (card.cost > side.mana) return false;

  side.mana -= card.cost;
  side.hand.splice(handIndex, 1);
  state.log.push(`${who} plays ${card.name} (${card.cost} mana)`);

  if (card.type === 'minion') {
    if (side.board.length >= MAX_BOARD) return false;
    const minion = makeMinion(card);
    /* ARTIFACTS DISABLED
    if (side.artifacts && side.artifacts.includes('warcry_aura')) {
      minion.atk += 100;
      state.log.push(`  Warcry Aura: ${minion.name} gets +100 Attack`);
    }
    */
    const taken = new Set(side.board.map(m => m.slot));
    if (boardPos != null && boardPos >= 0 && boardPos < MAX_BOARD && !taken.has(boardPos)) {
      minion.slot = boardPos;
    } else {
      minion.slot = nextFreeSlot(side.board);
    }
    side.board.push(minion);
    if (minion.keywords.includes('rage')) {
      minion.canAttack = true;
      state.log.push(`  ${minion.name} has Rage — ready to attack!`);
    }
    if (card.effect) applyEffect(state, who, card.effect, targetInfo, minion);
  } else if (card.type === 'spell') {
    if (card.effect) applyEffect(state, who, card.effect, targetInfo, null);
  }

  checkWin(state);
  return true;
}

function applyEffect(state, who, effect, targetInfo, sourceMinion) {
  const side = state[who];
  const opp  = who === 'player' ? state.enemy : state.player;

  switch (effect.kind) {
    case 'dealDamage': {
      const val = effect.value;
      if (effect.target === 'friendly_hero') {
        side.hp -= val;
        state.log.push(`  Deals ${val} damage to own hero`);
      } else if (effect.target === 'enemy_hero') {
        opp.hp -= val;
        state.log.push(`  Deals ${val} damage to enemy hero`);
      } else if (effect.target === 'enemy_any') {
        if (targetInfo && targetInfo.type === 'minion') {
          const m = opp.board.find(m => m.uid === targetInfo.uid);
          if (m) { m.hp -= val; state.log.push(`  Deals ${val} damage to ${m.name}`); }
        } else {
          opp.hp -= val;
          state.log.push(`  Deals ${val} damage to enemy hero`);
        }
      }
      cleanDead(state);
      break;
    }
    case 'heal': {
      const val = effect.value;
      if (effect.target === 'friendly_hero') {
        side.hp = Math.min(side.hp + val, side.maxHp);
        state.log.push(`  Heals hero for ${val}`);
      } else if (effect.target === 'friendly_minion' && targetInfo && targetInfo.type === 'minion') {
        const m = side.board.find(m => m.uid === targetInfo.uid);
        if (m) { m.hp = Math.min(m.hp + val, m.maxHp); state.log.push(`  Heals ${m.name} for ${val}`); }
      }
      break;
    }
    case 'draw': {
      for (let i = 0; i < effect.value; i++) drawCard(state, who);
      state.log.push(`  Draws ${effect.value} card(s)`);
      break;
    }
    case 'buff': {
      const { atk, hp } = effect.value;
      if (effect.target === 'friendly_minion' && targetInfo && targetInfo.type === 'minion') {
        const m = side.board.find(m => m.uid === targetInfo.uid);
        if (m) {
          m.atk += atk;
          m.hp += hp;
          m.maxHp += hp;
          state.log.push(`  Buffs ${m.name} +${atk}/+${hp}`);
        }
      }
      break;
    }
  }
}

export function minionAttack(state, who, attackerUid, targetInfo) {
  const side = state[who];
  const opp  = who === 'player' ? state.enemy : state.player;
  const attacker = side.board.find(m => m.uid === attackerUid);
  if (!attacker || !attacker.canAttack) return false;

  if (targetInfo.type === 'hero') {
    const blocker = guardianBlockingHero(attacker.slot, opp.board);
    if (blocker) {
      state.log.push(`${blocker.name} (Guardian) blocks ${attacker.name}!`);
      return false;
    }
    opp.hp -= attacker.atk;
    state.log.push(`${attacker.name} attacks enemy hero for ${attacker.atk}`);
  } else if (targetInfo.type === 'minion') {
    const defender = opp.board.find(m => m.uid === targetInfo.uid);
    if (!defender) return false;
    defender.hp -= attacker.atk;
    attacker.hp -= defender.atk;
    state.log.push(`${attacker.name} (${attacker.atk}/${attacker.hp}) attacks ${defender.name} (${defender.atk}/${defender.hp})`);
    cleanDead(state);
  }

  attacker.canAttack = false;
  checkWin(state);
  return true;
}

function cleanDead(state) {
  ['player', 'enemy'].forEach(who => {
    state[who].board = state[who].board.filter(m => {
      if (m.hp <= 0) { state.log.push(`  ${m.name} dies`); return false; }
      return true;
    });
  });
}

function checkWin(state) {
  if (state.player.hp <= 0 && state.enemy.hp <= 0) {
    state.phase = 'over'; state.winner = 'draw';
  } else if (state.enemy.hp <= 0) {
    state.phase = 'over'; state.winner = 'player';
  } else if (state.player.hp <= 0) {
    state.phase = 'over'; state.winner = 'enemy';
  }
}

export function needsTarget(card) {
  if (!card.effect) return false;
  const t = card.effect.target;
  return t === 'enemy_any' || t === 'friendly_minion';
}

export function runEnemyTurn(state) {
  const enemy = state.enemy;
  const player = state.player;

  for (let safe = 0; safe < 30; safe++) {
    const playable = enemy.hand
      .map((c, i) => ({ card: c, idx: i }))
      .filter(({ card }) => card.cost <= enemy.mana && (card.type !== 'minion' || enemy.board.length < MAX_BOARD));

    if (playable.length === 0) break;

    const { card, idx } = playable[Math.floor(Math.random() * playable.length)];
    let targetInfo = null;

    if (card.effect) {
      const t = card.effect.target;
      if (t === 'enemy_any') {
        if (player.board.length > 0 && Math.random() < 0.6) {
          const m = player.board[Math.floor(Math.random() * player.board.length)];
          targetInfo = { type: 'minion', uid: m.uid };
        } else {
          targetInfo = { type: 'hero' };
        }
      } else if (t === 'friendly_minion' && enemy.board.length > 0) {
        const m = enemy.board[Math.floor(Math.random() * enemy.board.length)];
        targetInfo = { type: 'minion', uid: m.uid };
      }
    }

    playCard(state, 'enemy', idx, targetInfo);
    if (state.phase === 'over') return;
  }

  const attackers = enemy.board.filter(m => m.canAttack && m.atk > 0);
  for (const attacker of attackers) {
    if (state.phase === 'over') return;

    const blocker = guardianBlockingHero(attacker.slot, player.board);
    if (blocker) {
      minionAttack(state, 'enemy', attacker.uid, { type: 'minion', uid: blocker.uid });
    } else if (player.board.length > 0 && Math.random() < 0.5) {
      const target = player.board[Math.floor(Math.random() * player.board.length)];
      minionAttack(state, 'enemy', attacker.uid, { type: 'minion', uid: target.uid });
    } else {
      minionAttack(state, 'enemy', attacker.uid, { type: 'hero' });
    }
  }
}

export function generateEnemyDeck() {
  const { getAllCards } = require_getAllCards();
  const pool = getAllCards().filter(c => c.type === 'minion' || c.type === 'spell');
  const deck = [];
  for (let i = 0; i < 30; i++) {
    deck.push(pool[Math.floor(Math.random() * pool.length)].id);
  }
  return deck;
}

function require_getAllCards() {
  return { getAllCards: _getAllCardsRef };
}

let _getAllCardsRef = () => [];
export function setBattleCardPoolRef(fn) { _getAllCardsRef = fn; }
