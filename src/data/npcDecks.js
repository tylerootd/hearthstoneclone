const KEY = 'npc_deck_overrides';

const parse = v => { try { return JSON.parse(v); } catch { return null; } };

export function loadNpcDeckOverrides() {
  return parse(localStorage.getItem(KEY)) || {};
}

export function saveNpcDeckOverride(npcId, deckIds) {
  const all = loadNpcDeckOverrides();
  all[npcId] = deckIds;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function removeNpcDeckOverride(npcId) {
  const all = loadNpcDeckOverrides();
  delete all[npcId];
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function getNpcDeck(npc) {
  const overrides = loadNpcDeckOverrides();
  if (overrides[npc.id] && overrides[npc.id].length > 0) return overrides[npc.id];
  if (npc.fallbackDeck && npc.fallbackDeck.length > 0) return npc.fallbackDeck;
  return null;
}
