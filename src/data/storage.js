const KEYS = {
  customCards:  'card_custom_pool',
  collection:   'player_collection',
  deck:         'player_deck',
  deckSlots:    'player_deck_slots',
  artifacts:    'player_artifacts',
  gold:         'player_gold'
};

const json = v => JSON.stringify(v);
const parse = v => { try { return JSON.parse(v); } catch { return null; } };

export function loadCustomCards()       { return parse(localStorage.getItem(KEYS.customCards)) || []; }
export function saveCustomCards(cards)   { localStorage.setItem(KEYS.customCards, json(cards)); }

export function loadCollection()        { return parse(localStorage.getItem(KEYS.collection)) || null; }
export function saveCollection(col)     { localStorage.setItem(KEYS.collection, json(col)); }

export function loadDeck()              { return parse(localStorage.getItem(KEYS.deck)) || null; }
export function saveDeck(deck)          { localStorage.setItem(KEYS.deck, json(deck)); }

export function loadDeckSlots()         { return parse(localStorage.getItem(KEYS.deckSlots)) || []; }
export function saveDeckSlots(slots)    { localStorage.setItem(KEYS.deckSlots, json(slots)); }

export function loadArtifacts()          { return parse(localStorage.getItem(KEYS.artifacts)) || []; }
export function saveArtifacts(arts)     { localStorage.setItem(KEYS.artifacts, json(arts)); }

export function loadGold()              { const v = localStorage.getItem(KEYS.gold); return v !== null ? Number(v) : null; }
export function saveGold(g)             { localStorage.setItem(KEYS.gold, json(g)); }

export function resetSave() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('player_level');
  localStorage.removeItem('player_xp');
  localStorage.removeItem('npc_deck_overrides');
  localStorage.removeItem('player_resources');
  localStorage.removeItem('farm_progress');
  localStorage.removeItem('farm_completed');
}
