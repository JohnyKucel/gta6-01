// Save and load: the player's money, health, position, mission progress and the clock,
// kept in localStorage between visits. Saving never blocks play — a closed storage just
// means the run lasts this visit only.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  const data = {
    money: state.player.money,
    hp: state.player.hp,
    ammo: state.player.ammo,
    x: state.player.x,
    y: state.player.y,
    time: state.time,
    elapsed: state.elapsed,
    missionIndex: state.mission.index,
    missionDone: state.mission.done,
    stats: state.stats,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.x !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Apply a loaded save onto a fresh world (the city is rebuilt from the seed). */
export function applySave(world, data) {
  const state = world.state;
  state.player.money = data.money;
  state.player.hp = data.hp;
  state.player.ammo = data.ammo;
  state.player.x = data.x;
  state.player.y = data.y;
  state.elapsed = data.elapsed || 0;
  state.time = data.time || 9.5;
  state.camera.x = data.x;
  state.camera.y = data.y;
  state.mission.done = Array.isArray(data.missionDone) ? data.missionDone : [];
  state.stats = { ...state.stats, ...(data.stats || {}) };
  return state;
}

export function hasSave() {
  return loadGame() !== null;
}
