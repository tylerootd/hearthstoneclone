const KEY = 'player_resources';

export const RES = {
  WOOD:    'wood',
  STONE:   'stone',
  HERB:    'herb',
  CRYSTAL: 'crystal'
};

export const RES_META = {
  [RES.WOOD]:    { name: 'Wood',    icon: '\u{1FAB5}', color: '#a0724a' },
  [RES.STONE]:   { name: 'Stone',   icon: '\u{1FAA8}', color: '#8888a0' },
  [RES.HERB]:    { name: 'Herb',    icon: '\u{1F33F}', color: '#44aa44' },
  [RES.CRYSTAL]: { name: 'Crystal', icon: '\u{1F48E}', color: '#aa44ee' }
};

export const CRAFT_RECIPES = [
  {
    id: 'craft_wooden_golem', name: 'Wooden Golem',
    cost: { [RES.WOOD]: 3 },
    card: { id: 'craft_wooden_golem', name: 'Wooden Golem', type: 'minion', cost: 2, atk: 2, hp: 3, sprite: 'stone_golem.png' }
  },
  {
    id: 'craft_stone_sentinel', name: 'Stone Sentinel',
    cost: { [RES.STONE]: 3 },
    card: { id: 'craft_stone_sentinel', name: 'Stone Sentinel', type: 'minion', cost: 3, atk: 2, hp: 5, sprite: 'stone_golem.png' }
  },
  {
    id: 'craft_healing_brew', name: 'Healing Brew',
    cost: { [RES.HERB]: 3 },
    card: { id: 'craft_healing_brew', name: 'Healing Brew', type: 'spell', cost: 2, sprite: 'healing_sage.png', effect: { kind: 'heal', target: 'friendly_hero', value: 5 } }
  },
  {
    id: 'craft_crystal_bolt', name: 'Crystal Bolt',
    cost: { [RES.CRYSTAL]: 3 },
    card: { id: 'craft_crystal_bolt', name: 'Crystal Bolt', type: 'spell', cost: 3, sprite: 'lightning_caster.png', effect: { kind: 'dealDamage', target: 'enemy_any', value: 5 } }
  },
  {
    id: 'craft_siege_engine', name: 'Siege Engine',
    cost: { [RES.WOOD]: 2, [RES.STONE]: 2 },
    card: { id: 'craft_siege_engine', name: 'Siege Engine', type: 'minion', cost: 5, atk: 5, hp: 4, sprite: 'stone_golem.png' }
  },
  {
    id: 'craft_arcane_elixir', name: 'Arcane Elixir',
    cost: { [RES.HERB]: 2, [RES.CRYSTAL]: 2 },
    card: { id: 'craft_arcane_elixir', name: 'Arcane Elixir', type: 'spell', cost: 4, sprite: 'arcane_mage.png', effect: { kind: 'draw', target: 'self', value: 3 } }
  },
  {
    id: 'craft_natures_champion', name: "Nature's Champion",
    cost: { [RES.WOOD]: 2, [RES.STONE]: 2, [RES.HERB]: 2, [RES.CRYSTAL]: 2 },
    card: { id: 'craft_natures_champion', name: "Nature's Champion", type: 'minion', cost: 6, atk: 6, hp: 6, sprite: 'nature_druid.png' }
  },
  {
    id: 'craft_dragons_breath', name: "Dragon's Breath",
    cost: { [RES.CRYSTAL]: 5 },
    card: { id: 'craft_dragons_breath', name: "Dragon's Breath", type: 'spell', cost: 7, sprite: 'fire_elemental.png', effect: { kind: 'dealDamage', target: 'enemy_any', value: 8 } }
  }
];

export function loadResources() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
  catch { return {}; }
}

export function saveResources(res) {
  localStorage.setItem(KEY, JSON.stringify(res));
}

export function addResource(type, amount = 1) {
  const res = loadResources();
  res[type] = (res[type] || 0) + amount;
  saveResources(res);
  return res;
}

export function getResourceCount(type) {
  return loadResources()[type] || 0;
}

export function canCraft(recipe) {
  const res = loadResources();
  for (const [type, amt] of Object.entries(recipe.cost)) {
    if ((res[type] || 0) < amt) return false;
  }
  return true;
}

export function spendResources(recipe) {
  const res = loadResources();
  for (const [type, amt] of Object.entries(recipe.cost)) {
    res[type] = (res[type] || 0) - amt;
    if (res[type] < 0) res[type] = 0;
  }
  saveResources(res);
  return res;
}
