import { loadCustomCards } from './storage.js';

let baseCards = [];
let merged = [];
let spriteList = [];
let npcList = [];
let baseDeck1Cards = null;

export async function initCardPool() {
  const [cardsRes, spritesRes, npcsRes, deckRes] = await Promise.all([
    fetch('./data/cards.json'),
    fetch('./data/sprites.json'),
    fetch('./data/npcs.json'),
    fetch('./assets/Base%20deck%201/deck.json').catch(() => null)
  ]);
  baseCards = await cardsRes.json();
  spriteList = await spritesRes.json();
  npcList = await npcsRes.json();
  const deck1 = deckRes && deckRes.ok ? await deckRes.json() : null;
  if (deck1 && deck1.cards && deck1.cards.length) {
    baseDeck1Cards = deck1.cards;
  }
  rebuildPool();
}

export function rebuildPool() {
  const custom = loadCustomCards();
  const customById = new Map(custom.map(c => [c.id, c]));
  merged = [
    ...baseCards.map(c => customById.has(c.id) ? customById.get(c.id) : c),
    ...custom.filter(c => !baseCards.some(b => b.id === c.id))
  ];
}

export function getAllCards()      { return merged; }
export function getBaseCards()    { return baseCards; }
export function getCardById(id)   { return merged.find(c => c.id === id) || null; }
export function getSpriteList()   { return spriteList; }
export function getNpcList()     { return npcList; }
export function getNpcById(id)   { return npcList.find(n => n.id === id) || null; }

export function getStarterCollection() {
  return baseCards.map(c => c.id);
}

export function getStarterDeck() {
  if (baseDeck1Cards && baseDeck1Cards.length) {
    return [...baseDeck1Cards];
  }
  return [
    'bd1_potato', 'bd1_potato', 'bd1_chicken', 'bd1_chicken', 'bd1_sheep', 'bd1_sheep',
    'bd1_guard_dog', 'bd1_guard_dog', 'bd1_scarecrow', 'bd1_scarecrow', 'bd1_ox', 'bd1_ox',
    'bd1_harvest_season', 'bd1_harvest_season', 'bd1_farmers_pitchfork', 'bd1_farmers_pitchfork',
    'bd1_old_macdonald', 'bd1_world_tree_apple', 'bd1_big_green_tractor', 'bd1_drought'
  ];
}
