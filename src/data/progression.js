const KEYS = {
  level: 'player_level',
  xp:    'player_xp'
};

const parse = v => { try { return JSON.parse(v); } catch { return null; } };

export function xpToNext(level) {
  return 50 + level * 25;
}

export function loadProgression() {
  return {
    level: Number(localStorage.getItem(KEYS.level)) || 1,
    xp:    Number(localStorage.getItem(KEYS.xp)) || 0
  };
}

export function saveProgression(level, xp) {
  localStorage.setItem(KEYS.level, String(level));
  localStorage.setItem(KEYS.xp, String(xp));
}

export function grantXp(amount) {
  let { level, xp } = loadProgression();
  xp += amount;
  let needed = xpToNext(level);
  let leveled = false;
  while (xp >= needed) {
    xp -= needed;
    level++;
    needed = xpToNext(level);
    leveled = true;
  }
  saveProgression(level, xp);
  return { level, xp, leveled };
}

export function resetProgression() {
  localStorage.removeItem(KEYS.level);
  localStorage.removeItem(KEYS.xp);
}
