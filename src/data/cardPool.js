import { loadCustomCards } from './storage.js';

let baseCards = [];
let merged = [];
let spriteList = [];
let npcList = [];

export async function initCardPool() {
  const [cardsRes, spritesRes, npcsRes] = await Promise.all([
    fetch('./data/cards.json'),
    fetch('./data/sprites.json'),
    fetch('./data/npcs.json')
  ]);
  baseCards = await cardsRes.json();
  spriteList = await spritesRes.json();
  npcList = await npcsRes.json();
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
  const picks = [
    'base_murloc', 'base_murloc',
    'base_goldshire', 'base_goldshire',
    'base_raptor', 'base_raptor',
    'base_croc', 'base_croc',
    'base_frostwolf', 'base_frostwolf',
    'base_shattered', 'base_shattered',
    'base_arcane_int', 'base_arcane_int',
    'base_yeti', 'base_yeti',
    'base_shieldmasta', 'base_shieldmasta',
    'base_fireball', 'base_fireball',
    'base_gnomish', 'base_gnomish',
    'base_boulderfist', 'base_boulderfist',
    'base_nightblade', 'base_nightblade',
    'base_war_golem', 'base_war_golem',
    'base_ironbark', 'base_ironbark'
  ];
  return picks;
}
