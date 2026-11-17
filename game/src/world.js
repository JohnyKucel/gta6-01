// Porto Sol's world: the city itself, the one shared state, and the fixed-step rules that
// move it. No drawing and no browser in here — step() advances one 1/60 s tick from an input
// bundle and returns what happened as bit flags, so the caller can play sounds and screens.
// Every roll comes from the seeded stream, so the same seed + the same inputs always replay
// the same city, the same traffic and the same frame.
import { CAR, MISSIONS, PALETTE, PLAYER, STEP, WANTED, WORLD } from './config.js';
import { createRandom, pick, range } from './random.js';
import { updatePlayer } from './player.js';
import { updateVehicles, spawnTraffic, nearestCar } from './vehicles.js';
import { updatePedestrians } from './pedestrians.js';
import { updatePolice } from './police.js';
import { updateCombat } from './combat.js';
import { updateMissions, startMission } from './missions.js';

export const EVENT_SHOT = 1;
export const EVENT_HIT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_OVER = 16;
export const EVENT_CRASH = 32;
export const EVENT_STEAL = 64;
export const EVENT_BUSTED = 128;

const CAR_COLORS = ['#d94f3d', '#3d7ad9', '#e8c33a', '#7ac74f', '#c9c9c9', '#8a5fd0', '#e07b39', '#3fb8a6'];
const ROOF_COLORS = ['#a8604a', '#7a6a9e', '#5d7a52', '#9e7a4a', '#6a7a8c', '#8c5a6e', '#b08a3e'];
const PED_COLORS = ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0c8a0', '#6e4a2f'];

/** District of a point: docks, downtown, residential, beach, park or streets. */
export function districtAt(x, y) {
  if (x > 1980 || y > 1980) return 'beach';
  if (x < 380 && y > 1480) return 'docks';
  if (x > 780 && x < 1560 && y > 380 && y < 1180) return 'downtown';
  if (y < 380) return 'residential';
  return 'streets';
}

/** True when the point is in the sea (east and south edges). */
export function inWater(x, y) {
  return x > 2060 || y > 2060;
}

/** Clamp a point into the walkable city (not into the sea, not past the edge). */
export function clampToCity(x, y) {
  return { x: Math.min(2040, Math.max(20, x)), y: Math.min(2040, Math.max(20, y)) };
}

/** Push a circle out of every building it overlaps; returns the corrected position. */
export function resolveBuildings(city, x, y, radius) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (x + radius <= b.x || x - radius >= b.x + b.w || y + radius <= b.y || y - radius >= b.y + b.h) continue;
    const left = x + radius - b.x;
    const right = b.x + b.w - (x - radius);
    const top = y + radius - b.y;
    const bottom = b.y + b.h - (y - radius);
    const min = Math.min(left, right, top, bottom);
    if (min === left) x = b.x - radius;
    else if (min === right) x = b.x + b.w + radius;
    else if (min === top) y = b.y - radius;
    else y = b.y + b.h + radius;
  }
  return { x, y };
}

/** The road centre lines of the grid. */
export function roadLines() {
  const lines = [];
  for (let i = 0; i < 10; i += 1) lines.push(WORLD.firstRoad + i * WORLD.roadGap);
  return lines;
}

/** Nearest road intersection to a point (snapped to the grid). */
export function nearestIntersection(city, x, y) {
  let bestX = city.roads[0];
  let bestY = city.roads[0];
  for (const line of city.roads) {
    if (Math.abs(line - x) < Math.abs(bestX - x)) bestX = line;
    if (Math.abs(line - y) < Math.abs(bestY - y)) bestY = line;
  }
  return { x: bestX, y: bestY };
}

function buildCity(random) {
  const roads = roadLines();
  const buildings = [];
  const parks = [];
  const trees = [];
  const half = WORLD.roadWidth / 2 + 6;
  for (let i = 0; i < 9; i += 1) {
    for (let j = 0; j < 9; j += 1) {
      const bx = roads[i] + half;
      const by = roads[j] + half;
      const bw = WORLD.roadGap - WORLD.roadWidth - 12;
      const bh = WORLD.roadGap - WORLD.roadWidth - 12;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      if (cx > 1980 || cy > 1980) continue; // beach blocks stay open sand
      if (random() < 0.16) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
        const count = 3 + Math.floor(random() * 4);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: bx + 20 + random() * (bw - 40), y: by + 20 + random() * (bh - 40), r: 12 + random() * 10 });
        }
        continue;
      }
      const district = districtAt(cx, cy);
      const tall = district === 'downtown';
      const count = tall ? 1 : 1 + Math.floor(random() * 2);
      for (let b = 0; b < count; b += 1) {
        const w = tall ? bw * (0.55 + random() * 0.2) : bw * (0.34 + random() * 0.22);
        const h = tall ? bh * (0.55 + random() * 0.2) : bh * (0.34 + random() * 0.22);
        const x = bx + (count === 1 ? (bw - w) / 2 : b * (bw - w) + random() * 8);
        const y = by + (count === 1 ? (bh - h) / 2 : random() * (bh - h));
        buildings.push({
          x, y, w, h,
          color: pick(random, ROOF_COLORS),
          tall,
          district,
          shade: 0.75 + random() * 0.25,
        });
      }
    }
  }
  // Landmarks the story names: the bank (downtown), the hideout (north houses), the docks shed.
  const bank = { x: 1020, y: 640, w: 120, h: 90, color: '#c9a227', tall: true, district: 'downtown', shade: 1, landmark: 'bank' };
  const hideout = { x: 1760, y: 180, w: 110, h: 80, color: '#5d7a52', tall: false, district: 'residential', shade: 1, landmark: 'hideout' };
  const shed = { x: 180, y: 1700, w: 130, h: 80, color: '#7a6a5a', tall: false, district: 'docks', shade: 1, landmark: 'shed' };
  buildings.push(bank, hideout, shed);
  return {
    roads,
    buildings,
    parks,
    trees,
    landmarks: { bank: { x: bank.x + 60, y: bank.y + 45 }, hideout: { x: hideout.x + 55, y: hideout.y + 40 }, shed: { x: shed.x + 65, y: shed.y + 40 } },
    pickups: [
      { x: 360, y: 360, taken: false, timer: 0 },
      { x: 1240, y: 1460, taken: false, timer: 0 },
      { x: 1900, y: 580, taken: false, timer: 0 },
      { x: 580, y: 1900, taken: false, timer: 0 },
    ],
  };
}

export function createWorld(seed) {
  const state = {
    seed,
    rng: createRandom(seed),
    time: 9.5, // morning: the city wakes sun-soaked
    elapsed: 0,
    city: null,
    player: null,
    cars: [],
    peds: [],
    cops: [],
    thugs: [],
    bullets: [],
    particles: [],
    skids: [],
    wanted: { points: 0, level: 0, unseen: 0 },
    mission: { index: 0, stage: 0, timer: 0, target: null, label: '', flags: {}, done: [], passenger: null, grabTimer: 0 },
    stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
    message: '',
    messageTimer: 0,
    over: false,
    overReason: '',
    busted: false,
    camera: { x: 1100, y: 900 },
    muted: false,
    started: false,
  };

  function reset() {
    state.rng = createRandom(seed);
    state.city = buildCity(state.rng);
    state.time = 9.5;
    state.elapsed = 0;
    state.player = {
      x: 1100, y: 900, angle: -Math.PI / 2, face: -Math.PI / 2,
      hp: PLAYER.maxHp, money: 0, ammo: PLAYER.startAmmo,
      inCar: false, car: null, speed: 0,
      punchCooldown: 0, shootCooldown: 0, hurtTimer: 0, arrestTimer: 0,
    };
    state.cars = [];
    state.peds = [];
    state.cops = [];
    state.thugs = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.wanted = { points: 0, level: 0, unseen: 0 };
    state.mission = { index: 0, stage: 0, timer: 0, target: null, label: '', flags: {}, done: [], passenger: null, grabTimer: 0 };
    state.stats = { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 };
    state.message = '';
    state.messageTimer = 0;
    state.over = false;
    state.overReason = '';
    state.busted = false;
    state.camera = { x: 1100, y: 900 };
    state.started = true;
    spawnTraffic(state, 14);
    // A few parked cars along the roads, ready to be borrowed.
    const parkedSpots = [
      { road: 4, s: 700, axis: 'v' }, { road: 5, s: 1300, axis: 'v' },
      { road: 3, s: 1000, axis: 'h' }, { road: 6, s: 500, axis: 'h' },
      { road: 2, s: 1600, axis: 'v' }, { road: 7, s: 900, axis: 'h' },
    ];
    for (const spot of parkedSpots) {
      const color = pick(state.rng, CAR_COLORS);
      const x = spot.axis === 'v' ? state.city.roads[spot.road] + 14 : spot.s;
      const y = spot.axis === 'v' ? spot.s : state.city.roads[spot.road] + 14;
      state.cars.push({
        id: state.cars.length, kind: 'traffic', x, y,
        angle: spot.axis === 'v' ? Math.PI / 2 : 0, speed: 0, color,
        axis: spot.axis, road: spot.road, s: spot.s, dir: 1, lane: 14,
        parked: true, driver: false,
      });
    }
    for (let i = 0; i < 26; i += 1) spawnPedestrian(state);
    startMission(state, 1);
  }

  function spawnPedestrian(s) {
    const axis = s.rng() < 0.5 ? 'v' : 'h';
    const road = Math.floor(s.rng() * 10);
    const along = 100 + s.rng() * 1900;
    const lane = (s.rng() < 0.5 ? -1 : 1) * (WORLD.roadWidth / 2 + 12);
    const x = axis === 'v' ? s.city.roads[road] + lane : along;
    const y = axis === 'v' ? along : s.city.roads[road] + lane;
    s.peds.push({
      x, y, angle: axis === 'v' ? Math.PI / 2 : 0, speed: 55 + s.rng() * 45,
      axis, road, s: along, dir: s.rng() < 0.5 ? 1 : -1, lane,
      color: pick(s.rng, PED_COLORS), shirt: pick(s.rng, CAR_COLORS),
      state: 'walk', fleeTimer: 0, fleeX: 0, fleeY: 0,
    });
  }

  function addMessage(s, text) {
    s.message = text;
    s.messageTimer = 4;
  }

  function addWanted(s, points) {
    s.wanted.points = Math.min(100, s.wanted.points + points);
    s.wanted.unseen = 0;
  }

  function spawnParticles(s, x, y, count, color, speed, life) {
    for (let i = 0; i < count; i += 1) {
      if (s.particles.length > 220) return;
      const a = s.rng() * Math.PI * 2;
      const v = speed * (0.4 + s.rng() * 0.6);
      s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.5 + s.rng() * 0.5), maxLife: life, color, size: 2 + s.rng() * 3 });
    }
  }

  /**
   * One fixed step. `input` is { mx, my, enter, punch, shoot, aimX, aimY } in world
   * coordinates; `harmless` runs the backdrop (title screen) with no crimes and no death.
   */
  function step(dt, input, harmless) {
    if (state.over) return 0;
    let events = 0;
    state.elapsed += dt;
    state.time = (9.5 + state.elapsed / 240) % 24;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    events |= updatePlayer(state, input, dt, harmless, { addWanted, addMessage, spawnParticles });
    events |= updateVehicles(state, dt, harmless, { addWanted, spawnParticles });
    events |= updatePedestrians(state, dt, harmless, { addWanted, spawnParticles, spawnPedestrian });
    events |= updatePolice(state, dt, harmless, { addWanted, addMessage, spawnParticles });
    events |= updateCombat(state, dt, harmless, { addWanted, addMessage, spawnParticles });
    events |= updateMissions(state, dt, harmless, { addMessage, addWanted, spawnParticles });

    // Particles and skid marks fade.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    // Health packs come back after a while.
    for (const pack of state.city.pickups) {
      if (pack.taken) {
        pack.timer -= dt;
        if (pack.timer <= 0) pack.taken = false;
      }
    }
    // Wanted level follows the points; unseen time drains them.
    const thresholds = WANTED.thresholds;
    let level = 0;
    for (let i = 5; i >= 1; i -= 1) if (state.wanted.points >= thresholds[i]) { level = i; break; }
    state.wanted.level = level;
    if (level > 0) {
      const nearPolice = state.cops.some((c) => Math.hypot(c.x - state.player.x, c.y - state.player.y) < 450)
        || state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 450);
      state.wanted.unseen = nearPolice ? 0 : state.wanted.unseen + dt;
      if (state.wanted.unseen > WANTED.coolSeconds) {
        state.wanted.points = Math.max(0, state.wanted.points - WANTED.drainPerSecond * dt);
      }
    }
    // Camera eases after the player.
    const focus = state.player.inCar && state.player.car ? state.player.car : state.player;
    state.camera.x += (focus.x - state.camera.x) * Math.min(1, dt * 4);
    state.camera.y += (focus.y - state.camera.y) * Math.min(1, dt * 4);

    if (state.player.hp <= 0 && !state.over) {
      state.over = true;
      state.overReason = state.busted ? 'busted' : 'wasted';
      events |= EVENT_OVER;
    }
    return events;
  }

  reset();
  return {
    state, reset, step,
    helpers: { addMessage, addWanted, spawnParticles, spawnPedestrian, clampToCity, resolveBuildings, districtAt, inWater, nearestIntersection, nearestCar },
  };
}

// Re-exported for modules that only need the helpers without a world instance.
export { clampToCity as clampPoint };
