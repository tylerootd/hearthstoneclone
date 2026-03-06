const { WebSocketServer } = require('ws');
const crypto = require('crypto');

/* ═══════════════════ BATTLE ENGINE (server-authoritative) ═══════════════════ */
const MAX_HAND = 10, MAX_BOARD = 7, MAX_MANA = 10, STARTING_HP = 3000;

function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeMinion(card) {
  return { uid: crypto.randomUUID(), id: card.id, name: card.name, cost: card.cost,
    atk: card.atk, hp: card.hp, maxHp: card.hp, effect: card.effect || null,
    triggers: card.triggers || [], keywords: card.keywords ? [...card.keywords] : [],
    canAttack: false, attackedThisTurn: false, slot: -1,
    sprite: card.sprite || null, spriteData: card.spriteData || null };
}

function nextFreeSlot(board) {
  const taken = new Set(board.map(m => m.slot));
  for (let d = 0; d < MAX_BOARD; d++) {
    const s = 3 + Math.ceil(d / 2) * (d % 2 === 0 ? 1 : -1);
    if (s >= 0 && s < MAX_BOARD && !taken.has(s)) return s;
  }
  for (let s = 0; s < MAX_BOARD; s++) { if (!taken.has(s)) return s; }
  return 0;
}

function guardianBlockingHero(attackerSlot, oppBoard) {
  return oppBoard.find(m => m.keywords && m.keywords.includes('guardian') && m.slot === attackerSlot) || null;
}

function drawCard(state, who) {
  const side = state[who];
  if (side.deck.length === 0) { side.fatigue++; side.hp -= side.fatigue; state.log.push(`${who} takes ${side.fatigue} fatigue!`); checkWin(state); return; }
  if (side.hand.length >= MAX_HAND) { const b = side.deck.shift(); state.log.push(`${who}'s hand full — ${b.name} burned!`); return; }
  side.hand.push(side.deck.shift());
}

function startTurn(state, who) {
  const side = state[who];
  state.currentTurn = who;
  state.turn++;
  if (side.maxMana < MAX_MANA) side.maxMana++;
  side.mana = side.maxMana;
  side.board.forEach(m => { m.canAttack = true; m.attackedThisTurn = false; });
  drawCard(state, who);
  processTriggers(state, who, 'turn_start');
}

function endTurnTriggers(state, who) {
  processTriggers(state, who, 'turn_end');
  const side = state[who];
  const opp = who === 'player' ? state.enemy : state.player;
  /* ARTIFACTS DISABLED
  if (side.artifacts && side.artifacts.includes('fireball_turret') && state.phase !== 'over') {
    opp.hp -= 300; state.log.push('Fireball Turret: 300 damage!'); checkWin(state);
  }
  */
}

function processTriggers(state, who, timing) {
  const side = state[who];
  for (const m of [...side.board]) {
    if (state.phase === 'over') return;
    for (const t of m.triggers) {
      if (t.when === timing) { state.log.push(`${m.name} triggers: ${t.effect.kind}`); applyEffect(state, who, t.effect, null, m); checkWin(state); }
    }
  }
}

function playCard(state, who, handIndex, targetInfo, boardPos) {
  const side = state[who]; const opp = who === 'player' ? state.enemy : state.player;
  const card = side.hand[handIndex];
  if (!card || card.cost > side.mana) return false;
  if (card.type === 'minion' && side.board.length >= MAX_BOARD) return false;
  side.mana -= card.cost; side.hand.splice(handIndex, 1);
  state.log.push(`${who} plays ${card.name}`);
  if (card.type === 'minion') {
    const minion = makeMinion(card);
    /* ARTIFACTS DISABLED */
    // if (side.artifacts && side.artifacts.includes('warcry_aura')) { minion.atk += 100; state.log.push(`Warcry Aura: +100 Atk`); }
    const taken = new Set(side.board.map(m => m.slot));
    if (boardPos != null && boardPos >= 0 && boardPos < MAX_BOARD && !taken.has(boardPos)) {
      minion.slot = boardPos;
    } else {
      minion.slot = nextFreeSlot(side.board);
    }
    side.board.push(minion);
    if (card.effect) applyEffect(state, who, card.effect, targetInfo, minion);
  } else if (card.type === 'spell' && card.effect) { applyEffect(state, who, card.effect, targetInfo, null); }
  checkWin(state); return true;
}

function applyEffect(state, who, effect, targetInfo, src) {
  const side = state[who]; const opp = who === 'player' ? state.enemy : state.player;
  switch (effect.kind) {
    case 'dealDamage': {
      const v = effect.value;
      if (effect.target === 'friendly_hero') { side.hp -= v; }
      else if (effect.target === 'enemy_hero') { opp.hp -= v; }
      else if (effect.target === 'enemy_any') {
        if (targetInfo && targetInfo.type === 'minion') { const m = opp.board.find(m => m.uid === targetInfo.uid); if (m) m.hp -= v; }
        else { opp.hp -= v; }
      }
      cleanDead(state); break;
    }
    case 'heal': {
      const v = effect.value;
      if (effect.target === 'friendly_hero') side.hp = Math.min(side.hp + v, side.maxHp);
      else if (effect.target === 'friendly_minion' && targetInfo?.type === 'minion') { const m = side.board.find(m => m.uid === targetInfo.uid); if (m) m.hp = Math.min(m.hp + v, m.maxHp); }
      break;
    }
    case 'draw': { for (let i = 0; i < effect.value; i++) drawCard(state, who); break; }
    case 'buff': {
      const { atk, hp } = effect.value;
      if (effect.target === 'friendly_minion' && targetInfo?.type === 'minion') { const m = side.board.find(m => m.uid === targetInfo.uid); if (m) { m.atk += atk; m.hp += hp; m.maxHp += hp; } }
      break;
    }
  }
}

function minionAttack(state, who, attackerUid, targetInfo) {
  const side = state[who]; const opp = who === 'player' ? state.enemy : state.player;
  const atk = side.board.find(m => m.uid === attackerUid);
  if (!atk || !atk.canAttack) return false;
  const guardians = opp.board.filter(m => m.keywords && m.keywords.includes('guardian'));
  if (targetInfo.type === 'hero') {
    if (guardians.length > 0) { state.log.push(`${guardians[0].name} (Guardian) blocks! Kill all Guardians first.`); return false; }
    opp.hp -= atk.atk; state.log.push(`${atk.name} hits hero for ${atk.atk}`);
  }
  else { const def = opp.board.find(m => m.uid === targetInfo.uid); if (!def) return false; if (guardians.length > 0 && !(def.keywords && def.keywords.includes('guardian'))) { state.log.push('Must attack a Guardian first!'); return false; } def.hp -= atk.atk; atk.hp -= def.atk; state.log.push(`${atk.name} vs ${def.name}`); cleanDead(state); }
  atk.canAttack = false; atk.attackedThisTurn = true; checkWin(state); return true;
}

function cleanDead(state) {
  ['player', 'enemy'].forEach(w => { state[w].board = state[w].board.filter(m => { if (m.hp <= 0) { state.log.push(`${m.name} dies`); return false; } return true; }); });
}

function checkWin(state) {
  if (state.player.hp <= 0 && state.enemy.hp <= 0) { state.phase = 'over'; state.winner = 'draw'; }
  else if (state.enemy.hp <= 0) { state.phase = 'over'; state.winner = 'player'; }
  else if (state.player.hp <= 0) { state.phase = 'over'; state.winner = 'enemy'; }
}

function createPvpState(p1Cards, p2Cards, p1Arts, p2Arts) {
  const state = {
    player: { hp: STARTING_HP, maxHp: STARTING_HP, mana: 0, maxMana: 0, deck: shuffle(p1Cards), hand: [], board: [], fatigue: 0, artifacts: p1Arts || [] },
    enemy:  { hp: STARTING_HP, maxHp: STARTING_HP, mana: 0, maxMana: 0, deck: shuffle(p2Cards), hand: [], board: [], fatigue: 0, artifacts: p2Arts || [] },
    origDecks: { player: [...p1Cards], enemy: [...p2Cards] },
    turn: 0, currentTurn: 'player', phase: 'playing', winner: null, log: []
  };
  /* ARTIFACTS DISABLED
  if (state.player.artifacts.includes('mana_crystal')) { state.player.maxMana = 1; state.player.mana = 1; }
  if (state.enemy.artifacts.includes('mana_crystal')) { state.enemy.maxMana = 1; state.enemy.mana = 1; }
  */
  for (let i = 0; i < 3; i++) drawCard(state, 'player');
  for (let i = 0; i < 4; i++) drawCard(state, 'enemy');
  return state;
}

/* ═══════════════════ STATE VIEWS ═══════════════════ */

function stripSprite(obj) {
  if (!obj) return obj;
  const { spriteData, ...rest } = obj;
  return rest;
}

function cleanHand(hand) { return hand.map(c => stripSprite(c)); }
function cleanBoard(board) { return board.map(m => stripSprite(m)); }

function pickRewardCards(loserDeck, count) {
  const pool = shuffle([...loserDeck]);
  const seen = new Set();
  const picks = [];
  for (const card of pool) {
    if (!seen.has(card.id) && picks.length < count) {
      seen.add(card.id);
      picks.push({ ...card });
    }
  }
  return picks;
}

function viewFor(state, who) {
  const me = state[who]; const oppKey = who === 'player' ? 'enemy' : 'player'; const opp = state[oppKey];
  let winner = null;
  if (state.winner === who) winner = 'you';
  else if (state.winner === oppKey) winner = 'opponent';
  else if (state.winner === 'draw') winner = 'draw';
  const view = {
    you: { hp: me.hp, maxHp: me.maxHp, mana: me.mana, maxMana: me.maxMana, hand: cleanHand(me.hand), board: cleanBoard(me.board), deckCount: me.deck.length },
    opponent: { hp: opp.hp, maxHp: opp.maxHp, mana: opp.mana, maxMana: opp.maxMana, handCount: opp.hand.length, board: cleanBoard(opp.board), deckCount: opp.deck.length },
    yourTurn: state.currentTurn === who, turn: state.turn, phase: state.phase, winner, log: state.log.slice(-5)
  };
  if (state.phase === 'over' && winner === 'you') {
    const oppOrigDeck = state.origDecks[oppKey] || opp.deck;
    view.rewardCards = pickRewardCards(oppOrigDeck, 3);
  }
  return view;
}

/* ═══════════════════ SERVER ═══════════════════ */
const PORT = process.env.PORT || 2567;
const wss = new WebSocketServer({ port: PORT });
const players = new Map();
const battles = new Map();
let nextId = 1, nextBattleId = 1;

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function broadcastState(b) {
  try {
    send(b.p1.ws, { type: 'pvp_state', ...viewFor(b.state, 'player') });
    send(b.p2.ws, { type: 'pvp_state', ...viewFor(b.state, 'enemy') });
  } catch (e) { console.error('[!] broadcastState error:', e.message); }
}

function roomSnap(room) {
  const snap = {};
  players.forEach((p, pid) => { if (p.room === room) snap[pid] = { x: p.x, y: p.y, anim: p.anim, name: p.name }; });
  return snap;
}

function playerList(room) {
  const list = [];
  players.forEach((p, pid) => { if (p.room === room) list.push({ id: pid, name: p.name }); });
  return list;
}

function broadcastPlayerList(room) {
  const list = playerList(room);
  broadcastToRoom(room, { type: 'player_list', players: list, count: list.length });
}

function broadcastToRoom(room, msg, exclude) {
  const data = JSON.stringify(msg);
  players.forEach((p) => { if (p.room === room && p.ws !== exclude && p.ws.readyState === 1) p.ws.send(data); });
}

wss.on('connection', (ws) => {
  const id = String(nextId++);
  players.set(id, { x: 352, y: 1216, anim: 'idle_down', room: 'mmo', name: 'Player ' + id, deckCards: null, artifacts: [], ws, battleId: null });
  console.log(`[+] Player ${id} joined (${players.size} online)`);

  send(ws, { type: 'welcome', id, players: roomSnap('mmo') });
  broadcastToRoom('mmo', { type: 'join', id, x: 352, y: 1216, anim: 'idle_down', name: 'Player ' + id }, ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      const me = players.get(id);
      if (!me) return;

      if (msg.type === 'set_name') {
        const raw = (msg.name || '').replace(/[^a-zA-Z0-9_ -]/g, '').trim().slice(0, 16);
        me.name = raw || ('Player ' + id);
        broadcastToRoom(me.room, { type: 'name_update', id, name: me.name });
        broadcastPlayerList(me.room);
        return;
      }

      if (msg.type === 'chat') {
        const text = (msg.text || '').trim().slice(0, 200);
        if (!text) return;
        broadcastToRoom(me.room, { type: 'chat', id, name: me.name, text });
        return;
      }

      if (msg.type === 'join_room') {
        const oldRoom = me.room;
        const newRoom = msg.room || 'mmo';
        if (oldRoom !== newRoom) {
          broadcastToRoom(oldRoom, { type: 'leave', id }, ws);
          broadcastPlayerList(oldRoom);
          me.room = newRoom;
          console.log(`[R] Player ${id}: ${oldRoom} → ${newRoom}`);
        }
        me.x = msg.x || 0; me.y = msg.y || 0;
        send(ws, { type: 'welcome', id, players: roomSnap(newRoom) });
        broadcastToRoom(newRoom, { type: 'join', id, x: me.x, y: me.y, anim: me.anim, name: me.name }, ws);
        broadcastPlayerList(newRoom);
        return;
      }

      // ── overworld ──
      if (msg.type === 'move') {
        me.x = msg.x; me.y = msg.y; me.anim = msg.anim;
        broadcastToRoom(me.room, { type: 'move', id, x: msg.x, y: msg.y, anim: msg.anim }, ws);
      }
      else if (msg.type === 'deck') {
        me.deckCards = (msg.cards || []).map(c => stripSprite(c));
        me.artifacts = msg.artifacts || [];
        console.log(`[i] Player ${id}: deck ${(msg.cards || []).length} cards`);
      }
      else if (msg.type === 'sync') {
        send(ws, { type: 'welcome', id, players: roomSnap(me.room) });
      }
      else if (msg.type === 'challenge') {
        const target = players.get(msg.targetId);
        if (target) send(target.ws, { type: 'challenged', fromId: id });
      }
      else if (msg.type === 'accept') {
        const challenger = players.get(msg.fromId);
        if (!challenger || !me) return;
        // Create battle
        const bid = String(nextBattleId++);
        const p1Cards = challenger.deckCards || [];
        const p2Cards = me.deckCards || [];
        if (p1Cards.length < 1 || p2Cards.length < 1) { send(ws, { type: 'declined', byId: id }); return; }
        const state = createPvpState([...p1Cards], [...p2Cards], challenger.artifacts, me.artifacts);
        startTurn(state, 'player');
        const battle = { id: bid, p1: { ws: challenger.ws, playerId: msg.fromId }, p2: { ws: me.ws, playerId: id }, state };
        battles.set(bid, battle);
        challenger.battleId = bid; me.battleId = bid;
        send(challenger.ws, { type: 'pvp_start', battleId: bid, side: 'player' });
        send(ws, { type: 'pvp_start', battleId: bid, side: 'enemy' });
        broadcastState(battle);
        console.log(`[⚔] Battle ${bid}: Player ${msg.fromId} vs Player ${id}`);
      }
      else if (msg.type === 'decline') {
        const challenger = players.get(msg.fromId);
        if (challenger) send(challenger.ws, { type: 'declined', byId: id });
      }

      // ── PvP ready (client scene loaded, wants state) ──
      else if (msg.type === 'pvp_ready') {
        const b = me.battleId ? battles.get(me.battleId) : null;
        if (b) {
          const side = b.p1.playerId === id ? 'player' : 'enemy';
          send(ws, { type: 'pvp_state', ...viewFor(b.state, side) });
        }
      }

      // ── PvP battle actions ──
      else if (msg.type === 'pvp_play_card' || msg.type === 'pvp_attack' || msg.type === 'pvp_end_turn') {
        const b = me.battleId ? battles.get(me.battleId) : null;
        if (!b || b.state.phase === 'over') return;

        // Determine this player's side
        const side = b.p1.playerId === id ? 'player' : 'enemy';
        if (b.state.currentTurn !== side) return; // not your turn

        if (msg.type === 'pvp_play_card') {
          playCard(b.state, side, msg.handIndex, msg.target || null, msg.boardPos != null ? msg.boardPos : undefined);
        }
        else if (msg.type === 'pvp_attack') {
          minionAttack(b.state, side, msg.attackerUid, msg.target);
        }
        else if (msg.type === 'pvp_end_turn') {
          endTurnTriggers(b.state, side);
          if (b.state.phase !== 'over') {
            const next = side === 'player' ? 'enemy' : 'player';
            startTurn(b.state, next);
          }
        }

        broadcastState(b);

        if (b.state.phase === 'over') {
          console.log(`[✓] Battle ${b.id} over: ${b.state.winner}`);
          cleanupBattle(b);
        }
      }

    } catch (e) { console.error('Message error:', e.message); }
  });

  ws.on('close', () => {
    const me = players.get(id);
    if (me && me.battleId) {
      const b = battles.get(me.battleId);
      if (b && b.state.phase !== 'over') {
        const otherSide = b.p1.playerId === id ? 'enemy' : 'player';
        b.state.phase = 'over';
        b.state.winner = otherSide;
        broadcastState(b);
        cleanupBattle(b);
      }
    }
    const room = me ? me.room : 'mmo';
    players.delete(id);
    console.log(`[-] Player ${id} left (${players.size} online)`);
    broadcastToRoom(room, { type: 'leave', id });
    broadcastPlayerList(room);
  });
});

function cleanupBattle(b) {
  const p1 = players.get(b.p1.playerId);
  const p2 = players.get(b.p2.playerId);
  if (p1) p1.battleId = null;
  if (p2) p2.battleId = null;
  battles.delete(b.id);
}

console.log(`MMO server listening on port ${PORT}`);
