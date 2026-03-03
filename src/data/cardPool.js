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
  const pool = [...baseCards].sort((a, b) => a.cost - b.cost);
  const deck = [];
  let i = 0;
  while (deck.length < 30) {
    deck.push(pool[i % pool.length].id);
    i++;
  }
  return deck;
}
