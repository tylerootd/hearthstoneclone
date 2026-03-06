import { loadCustomCards } from './storage.js';

let baseCards = [];
let merged = [];
let spriteList = [];
let npcList = [];
let baseDeck1Cards = null;
let baseDeck2Cards = null;

const base = import.meta.env.BASE_URL || './';

export async function initCardPool() {
  const [cardsRes, spritesRes, npcsRes, deck1Res, deck2Res] = await Promise.all([
    fetch(base + 'data/cards.json'),
    fetch(base + 'data/sprites.json'),
    fetch(base + 'data/npcs.json'),
    fetch(base + 'assets/Base%20deck%201/deck.json').catch(() => null),
    fetch(base + 'assets/Base%20deck%202/deck.json').catch(() => null)
  ]);
  baseCards = await cardsRes.json();
  spriteList = await spritesRes.json();
  npcList = await npcsRes.json();
  const deck1 = deck1Res && deck1Res.ok ? await deck1Res.json() : null;
  const deck2 = deck2Res && deck2Res.ok ? await deck2Res.json() : null;
  if (deck1 && deck1.cards && deck1.cards.length) baseDeck1Cards = deck1.cards;
  if (deck2 && deck2.cards && deck2.cards.length) baseDeck2Cards = deck2.cards;
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
  if (baseDeck1Cards && baseDeck1Cards.length) {
    return [...new Set(baseDeck1Cards)];
  }
  return [
    'bd1_potato', 'bd1_chicken', 'bd1_sheep', 'bd1_guard_dog', 'bd1_scarecrow', 'bd1_ox',
    'bd1_harvest_season', 'bd1_farmers_pitchfork', 'bd1_old_macdonald', 'bd1_world_tree_apple',
    'bd1_big_green_tractor', 'bd1_drought'
  ];
}

export function getStarterCollection2() {
  const deck = getStarterDeck2();
  return [...new Set(deck)];
}

export function getStarterDeck() {
  if (baseDeck1Cards && baseDeck1Cards.length) return [...baseDeck1Cards];
  return [
    'bd1_potato', 'bd1_potato', 'bd1_chicken', 'bd1_chicken', 'bd1_sheep', 'bd1_sheep',
    'bd1_guard_dog', 'bd1_guard_dog', 'bd1_scarecrow', 'bd1_scarecrow', 'bd1_ox', 'bd1_ox',
    'bd1_harvest_season', 'bd1_harvest_season', 'bd1_farmers_pitchfork', 'bd1_farmers_pitchfork',
    'bd1_old_macdonald', 'bd1_world_tree_apple', 'bd1_big_green_tractor', 'bd1_drought'
  ];
}

export function getStarterDeck2() {
  if (baseDeck2Cards && baseDeck2Cards.length) return [...baseDeck2Cards];
  return [
    'bd2_cool_stick', 'bd2_cool_stick', 'bd2_cardboard_box', 'bd2_cardboard_box', 'bd2_beg', 'bd2_beg',
    'bd2_big_rat', 'bd2_big_rat', 'bd2_stray_dog', 'bd2_stray_dog', 'bd2_loose_change', 'bd2_loose_change',
    'bd2_dumpster_fire', 'bd2_dumpster_fire', 'bd2_morning_breath', 'bd2_morning_breath',
    'bd2_shelter', 'bd2_new_shoes', 'bd2_plague', 'bd2_lady_luck'
  ];
}
