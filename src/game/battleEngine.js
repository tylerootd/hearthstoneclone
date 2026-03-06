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
  const keywords = card.keywords ? [...card.keywords] : [];
  const maxAttacksPerTurn = keywords.includes('attacksTwice') ? 2 : 1;
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
    keywords,
    canAttack: false,
    attackedThisTurn: 0,
    maxAttacksPerTurn,
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
    playerLevel,
    pendingDraws: []
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
  if (state.manaLockNextTurn && state.manaLockNextTurn[who]) {
    side.mana = 0;
    delete state.manaLockNextTurn[who];
    state.log.push(`  ${who} cannot spend mana this turn!`);
  } else {
    side.mana = side.maxMana;
  }
  if (state.freeCardsThisTurn) state.freeCardsThisTurn = null;

  side.board.forEach(m => { m.canAttack = true; m.attackedThisTurn = false; });

  drawCard(state, who);
  processTriggers(state, who, 'turn_start');
  processPendingDraws(state, who);
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

function processPendingDraws(state, who) {
  if (!state.pendingDraws || state.pendingDraws.length === 0) return;
  const toProcess = state.pendingDraws.filter(p => p.who === who);
  state.pendingDraws = state.pendingDraws.filter(p => p.who !== who);
  for (const p of toProcess) {
    for (let i = 0; i < p.amount; i++) drawCard(state, who);
    if (p.amount > 0) state.log.push(`  Draws ${p.amount} card(s) (delayed)`);
  }
  checkWin(state);
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
  const effectiveCost = state.freeCardsThisTurn === who ? 0 : card.cost;
  if (effectiveCost > side.mana) return false;
  if (card.type === 'minion' && side.board.length >= MAX_BOARD) return false;
  return true;
}

export function playCard(state, who, handIndex, targetInfo, boardPos) {
  const side = state[who];
  const opp  = who === 'player' ? state.enemy : state.player;
  const card = side.hand[handIndex];
  if (!card) return false;
  const effectiveCost = state.freeCardsThisTurn === who ? 0 : card.cost;
  if (effectiveCost > side.mana) return false;

  side.mana -= effectiveCost;
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
    if (card.effect) {
      if (card.effect.kind === 'newShoes') {
        const subEffect = (targetInfo && targetInfo.type === 'minion')
          ? card.effect.equipEffect
          : card.effect.skipEffect;
        if (subEffect) applyEffect(state, who, subEffect, targetInfo, null);
      } else {
        applyEffect(state, who, card.effect, targetInfo, null);
      }
    }
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
    case 'drawOverTurns': {
      const total = effect.value || 2;
      const now = Math.min(1, total);
      const next = total - now;
      for (let i = 0; i < now; i++) drawCard(state, who);
      if (now > 0) state.log.push(`  Draws ${now} card(s)`);
      if (next > 0) {
        if (!state.pendingDraws) state.pendingDraws = [];
        state.pendingDraws.push({ who, amount: next });
        state.log.push(`  Will draw ${next} card(s) at start of next turn`);
      }
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
    case 'buffAllFriendly': {
      const { atk, hp } = effect.value;
      side.board.forEach(m => {
        m.atk += atk;
        m.hp += hp;
        m.maxHp += hp;
      });
      if (side.board.length) state.log.push(`  All friendly minions +${atk}/+${hp}`);
      break;
    }
    case 'dealDamageAllEnemies': {
      const val = effect.value;
      opp.board.forEach(m => { m.hp -= val; });
      opp.hp -= val;
      state.log.push(`  Deals ${val} to all enemies`);
      cleanDead(state);
      break;
    }
    case 'summon': {
      const ids = effect.value;
      for (const cid of ids) {
        const card = getCardById(cid);
        if (!card || card.type !== 'minion') continue;
        if (side.board.length >= MAX_BOARD) break;
        const minion = makeMinion(card);
        minion.slot = nextFreeSlot(side.board);
        minion.canAttack = (minion.keywords || []).includes('rage');
        side.board.push(minion);
        state.log.push(`  Summons ${minion.name}`);
      }
      break;
    }
    case 'manaLock': {
      if (!state.manaLockNextTurn) state.manaLockNextTurn = {};
      state.manaLockNextTurn[who === 'player' ? 'enemy' : 'player'] = true;
      state.log.push(`  Opponent cannot spend mana next turn!`);
      break;
    }
    case 'drawRandom': {
      const n = effect.min + Math.floor(Math.random() * (effect.max - effect.min + 1));
      for (let i = 0; i < n; i++) drawCard(state, who);
      state.log.push(`  Draws ${n} card(s) (random 1-4)`);
      break;
    }
    case 'dealDamageBothHeroes': {
      const val = effect.value;
      side.hp -= val;
      opp.hp -= val;
      state.log.push(`  Deals ${val} to both heroes!`);
      cleanDead(state);
      checkWin(state);
      break;
    }
    case 'dealDamageAndDraw': {
      const { damage, draw } = effect;
      if (effect.target === 'enemy_any') {
        if (targetInfo && targetInfo.type === 'minion') {
          const m = opp.board.find(m => m.uid === targetInfo.uid);
          if (m) { m.hp -= damage; }
        } else { opp.hp -= damage; }
      }
      for (let i = 0; i < draw; i++) drawCard(state, who);
      state.log.push(`  Deals ${damage} damage, draws ${draw} card(s)`);
      cleanDead(state);
      break;
    }
    case 'skipOpponentTurn': {
      if (!state.manaLockNextTurn) state.manaLockNextTurn = {};
      state.manaLockNextTurn[who === 'player' ? 'enemy' : 'player'] = true;
      state.log.push(`  Opponent skips their next turn!`);
      break;
    }
    case 'dealDamageAll': {
      const val = effect.value;
      side.board.forEach(m => { m.hp -= val; });
      opp.board.forEach(m => { m.hp -= val; });
      side.hp -= val;
      opp.hp -= val;
      state.log.push(`  Deals ${val} to all minions and both heroes!`);
      cleanDead(state);
      checkWin(state);
      break;
    }
    case 'freeCardsThisTurn': {
      state.freeCardsThisTurn = who;
      state.log.push(`  All your cards cost 0 this turn!`);
      break;
    }
    case 'transformMinion': {
      if (targetInfo && targetInfo.type === 'minion') {
        const idx = side.board.findIndex(m => m.uid === targetInfo.uid);
        if (idx !== -1) {
          const old = side.board[idx];
          const reqId = effect.requireId;
          if (!reqId || old.id === reqId) {
            const newCard = getCardById(effect.transformTo);
            if (newCard && newCard.type === 'minion') {
              const newMinion = makeMinion(newCard);
              newMinion.slot = old.slot;
              newMinion.canAttack = newMinion.keywords.includes('rage');
              newMinion.attackedThisTurn = 0;
              side.board[idx] = newMinion;
              state.log.push(`  ${old.name} transforms into ${newMinion.name}!`);
            }
          }
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

  const guardians = opp.board.filter(m => m.keywords.includes('guardian'));

  if (targetInfo.type === 'hero') {
    if (guardians.length > 0) {
      state.log.push(`${guardians[0].name} (Guardian) blocks ${attacker.name}! Kill all Guardians first.`);
      return false;
    }
    opp.hp -= attacker.atk;
    state.log.push(`${attacker.name} attacks enemy hero for ${attacker.atk}`);
  } else if (targetInfo.type === 'minion') {
    const defender = opp.board.find(m => m.uid === targetInfo.uid);
    if (!defender) return false;
    if (guardians.length > 0 && !defender.keywords.includes('guardian')) {
      state.log.push(`Must attack a Guardian first!`);
      return false;
    }
    defender.hp -= attacker.atk;
    attacker.hp -= defender.atk;
    state.log.push(`${attacker.name} (${attacker.atk}/${attacker.hp}) attacks ${defender.name} (${defender.atk}/${defender.hp})`);
    cleanDead(state);
  }

  attacker.attackedThisTurn = (attacker.attackedThisTurn || 0) + 1;
  attacker.canAttack = attacker.attackedThisTurn < (attacker.maxAttacksPerTurn || 1);
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
  if (card.effect.kind === 'newShoes') return false;
  const t = card.effect.target;
  return t === 'enemy_any' || t === 'friendly_minion';
}

export function hasLadyLuckOnBoard(state, who) {
  const side = state[who] || (who === 'player' ? state.you : state.opponent);
  if (!side || !side.board) return false;
  return side.board.some(m => m.id === 'bd2_lady_luck');
}

export function isNewShoesWithEquipOption(card) {
  return card?.effect?.kind === 'newShoes' && card.effect.equipEffect;
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
      if (card.effect.kind === 'newShoes' && card.effect.equipEffect && hasLadyLuckOnBoard(state, 'enemy')) {
        const ladyLucks = enemy.board.filter(m => m.id === 'bd2_lady_luck');
        if (ladyLucks.length > 0 && Math.random() < 0.5) {
          const m = ladyLucks[Math.floor(Math.random() * ladyLucks.length)];
          targetInfo = { type: 'minion', uid: m.uid };
        }
      }
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

  for (let safe = 0; safe < 50; safe++) {
    const attackers = enemy.board.filter(m => m.canAttack && m.atk > 0);
    if (attackers.length === 0) break;
    if (state.phase === 'over') return;
    const attacker = attackers[Math.floor(Math.random() * attackers.length)];
    const playerGuardians = player.board.filter(m => m.keywords.includes('guardian'));
    if (playerGuardians.length > 0) {
      const target = playerGuardians[Math.floor(Math.random() * playerGuardians.length)];
      minionAttack(state, 'enemy', attacker.uid, { type: 'minion', uid: target.uid });
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
