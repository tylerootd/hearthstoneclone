/**
 * Builds help items (keywords + effects) for display in the tooltip bar and help panel.
 * Returns array of { icon, msg } for each keyword and effect on the card.
 */

const KEYWORD_DEFS = {
  guardian: { icon: 'guardian', msg: 'Guardian: Must be attacked first. Blocks all attacks to your hero until defeated.' },
  rage: { icon: 'sword', msg: 'Charge (Rage): Can attack immediately on the turn it is played.' },
  attacksTwice: { icon: 'sword', msg: 'Can attack twice per turn.' },
};

const EFFECT_DEFS = {
  dealDamage: (e, card) => {
    const val = e.value ?? 0;
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    if (e.target === 'enemy_hero') return { icon, msg: `${prefix}Deal ${val} damage to the enemy hero.` };
    if (e.target === 'enemy_any') return { icon, msg: `${prefix}Deal ${val} damage to a chosen enemy (minion or hero).` };
    if (e.target === 'friendly_hero') return { icon: 'zzz', msg: `Deals ${val} damage to your own hero (harmful effect).` };
    return { icon, msg: `${prefix}Deal ${val} damage to target.` };
  },
  heal: (e, card) => {
    const val = e.value ?? 0;
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    if (e.target === 'friendly_hero') return { icon, msg: `${prefix}Heal your hero for ${val}.` };
    if (e.target === 'friendly_minion') return { icon, msg: `${prefix}Heal a friendly minion for ${val}.` };
    return { icon, msg: `${prefix}Heal target for ${val}.` };
  },
  draw: (e, card) => {
    const n = e.value;
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    return { icon, msg: `${prefix}Draw ${n} card${n > 1 ? 's' : ''}.` };
  },
  drawOverTurns: (e, card) => {
    const n = e.value || 2;
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: `Draw ${n} cards over ${n} turns (1 now, ${n - 1} at start of your next turn).` };
  },
  buff: (e, card) => {
    const atk = e.value?.atk ?? 0;
    const hp = e.value?.hp ?? 0;
    const parts = [];
    if (atk) parts.push(`+${atk} Attack`);
    if (hp) parts.push(`+${hp} Health`);
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    return { icon, msg: `${prefix}Give a friendly minion ${parts.join(' and ')}.` };
  },
  buffAllFriendly: (e, card) => {
    const atk = e.value?.atk ?? 0;
    const hp = e.value?.hp ?? 0;
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    return { icon, msg: `${prefix}Give ALL friendly minions +${atk}/+${hp}.` };
  },
  dealDamageAllEnemies: (e, card) => {
    const val = e.value ?? 0;
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    return { icon, msg: `${prefix}Deal ${val} damage to ALL enemy minions and the enemy hero.` };
  },
  summon: (e, card) => {
    const ids = Array.isArray(e.value) ? e.value : [e.value];
    const isSpell = card?.type === 'spell';
    const prefix = isSpell ? '' : 'Battlecry: ';
    const icon = isSpell ? 'spell' : 'battlecry';
    return { icon, msg: `${prefix}Summon ${ids.length} minion${ids.length > 1 ? 's' : ''}.` };
  },
  manaLock: (e, card) => {
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: 'Your opponent cannot spend mana on their next turn.' };
  },
  dealDamageAndDraw: (e, card) => {
    const damage = e.damage ?? 0;
    const draw = e.draw || 0;
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    const dmgPart = e.target === 'enemy_any' ? `Deal ${damage} damage to a chosen enemy (minion or hero)` : `Deal ${damage} damage`;
    const drawPart = draw > 0 ? ` and draw ${draw} card${draw > 1 ? 's' : ''}` : '';
    return { icon, msg: `${dmgPart}${drawPart}.` };
  },
  drawRandom: (e, card) => {
    const min = e.min || 0;
    const max = e.max || min;
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    const msg = min === max ? `Draw ${min} card${min !== 1 ? 's' : ''}.` : `Draw a random number of cards (${min}-${max}).`;
    return { icon, msg };
  },
  dealDamageBothHeroes: (e, card) => {
    const val = e.value ?? 0;
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: `Deal ${val} damage to BOTH heroes.` };
  },
  skipOpponentTurn: (e, card) => {
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: 'Your opponent skips their next turn.' };
  },
  dealDamageAll: (e, card) => {
    const val = e.value ?? 0;
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: `Deal ${val} damage to ALL minions and BOTH heroes.` };
  },
  freeCardsThisTurn: (e, card) => {
    const icon = card?.type === 'spell' ? 'spell' : 'battlecry';
    return { icon, msg: 'All your cards cost 0 this turn.' };
  },
  newShoes: (e, card) => {
    const items = [
      { icon: 'spell', msg: 'Skip opponent\'s turn.' },
      { icon: 'spell', msg: 'Equip on Lady Luck: Transform her into Lady Luck with Shoes (Charge + Attack twice, 750/1600).' }
    ];
    return items;
  },
};

const TRIGGER_WHEN = {
  turn_start: 'At the start of your turn',
  turn_end: 'At the end of your turn',
};

export function buildHelpItemsForCard(card) {
  if (!card) return [];
  const items = [];
  if (card.keywords && Array.isArray(card.keywords)) {
    for (const kw of card.keywords) {
      const def = KEYWORD_DEFS[kw];
      if (def) items.push(def);
    }
  }
  if (card.effect) {
    const fn = EFFECT_DEFS[card.effect.kind];
    if (fn) {
      const result = fn(card.effect, card);
      if (Array.isArray(result)) items.push(...result);
      else items.push(result);
    }
  }
  if (card.triggers && Array.isArray(card.triggers)) {
    for (const t of card.triggers) {
      const when = TRIGGER_WHEN[t.when] || t.when;
      const fn = t.effect && EFFECT_DEFS[t.effect.kind];
      const eff = fn ? fn(t.effect, card) : null;
      const msg = eff ? `${when}: ${eff.msg}` : `${when}: ${t.effect?.kind || '?'}`;
      items.push({ icon: eff?.icon || 'zzz', msg });
    }
  }
  return items;
}

export function getPlaceholderHelpItems() {
  return [{ icon: 'guardian', msg: 'Hover over a card to see its keywords and effects explained here.' }];
}
