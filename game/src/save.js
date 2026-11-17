// Local save for SOLANO HEAT: cash, completed missions, day count and the
// player's last position. localStorage only — no network, no cookies.
// A corrupt or missing save simply means a fresh start.
const SAVE_KEY = 'solano-heat-save-v1';

export function defaultSave() {
  return {
    cash: 0,
    day: 1,
    completedMissions: [],
    totalEarned: 0,
    carsStolen: 0,
    bestWanted: 0,
    playSeconds: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultSave();
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked (private mode): the game keeps playing, the
    // save just does not persist.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do: a missing save is a fresh start.
  }
}
