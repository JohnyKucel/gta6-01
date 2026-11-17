// Porto Sol traffic: civilian cars that cruise the road grid, parked cars waiting to
// be borrowed, and police cruisers that chase the player. Traffic sticks to its lane,
// brakes for the car ahead and sometimes turns at a crossing; police drive straight at
// the player and ram. Everything here is deterministic: every roll comes from the
// world's seeded stream, never from Math.random or the clock.
import { CAR, WANTED, WORLD } from './config.js';
import { EVENT_CRASH, resolveBuildings } from './world.js';

/** Paint jobs a civilian car can be born with. */
const PAINT = [
  '#d94f3d', '#3d7ad9', '#e8c33a', '#7ac74f', '#c9c9c9',
  '#8a5fd0', '#e07b39', '#3fb8a6', '#e8e8e8', '#5a6a7a',
];

/** Smallest signed turn from heading `from` to heading `to`, in (-PI, PI]. */
function turnTo(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move `v` toward `target` by at most `rate * dt` of the remaining gap. */
function easeToward(v, target, rate, dt) {
  return v + (target - v) * Math.min(1, dt * rate);
}

/** Closest car to (x, y) within maxD, optionally restricted to the given kinds. */
export function nearestCar(state, x, y, maxD, kinds) {
  let found = null;
  let foundD = maxD;
  for (const car of state.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < foundD) {
      foundD = d;
      found = car;
    }
  }
  return found;
}

/** Put `count` fresh civilian cars on random roads, rolling in a random direction. */
export function spawnTraffic(state, count) {
  for (let n = 0; n < count; n += 1) {
    const vertical = state.rng() < 0.5;
    const road = Math.floor(state.rng() * 10);
    const along = 60 + state.rng() * 2080;
    const dir = state.rng() < 0.5 ? 1 : -1;
    const lane = dir * 12;
    state.cars.push({
      id: state.cars.length,
      kind: 'traffic',
      x: vertical ? state.city.roads[road] + lane : along,
      y: vertical ? along : state.city.roads[road] + lane,
      angle: vertical ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: CAR.trafficSpeed * (0.8 + state.rng() * 0.4),
      color: PAINT[Math.floor(state.rng() * PAINT.length)],
      axis: vertical ? 'v' : 'h',
      road,
      s: along,
      dir,
      lane,
      parked: false,
      driver: true,
      siren: false,
    });
  }
}

/** How fast the car ahead allows this one to go (same lane, same direction only). */
function speedAllowedByLeader(state, car) {
  let allowed = CAR.trafficSpeed;
  for (const other of state.cars) {
    if (other === car || other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
    const gap = (other.s - car.s) * car.dir;
    if (gap > 0 && gap < 90) allowed = gap < 46 ? 0 : other.speed * 0.6;
  }
  return allowed;
}

/** One traffic step: brake for the leader, roll forward, maybe turn at a crossing. */
function stepTrafficCar(state, car, dt) {
  const roads = state.city.roads;
  const wasS = car.s;
  car.speed = easeToward(car.speed, speedAllowedByLeader(state, car), 2, dt);
  car.s += car.dir * car.speed * dt;
  for (let j = 0; j < roads.length; j += 1) {
    const line = roads[j];
    const crossed = (wasS - line) * (car.s - line) <= 0 && Math.abs(car.s - line) < 6;
    if (crossed && car.road !== j && state.rng() < 0.35) {
      const newDir = state.rng() < 0.5 ? 1 : -1;
      const along = car.axis === 'v' ? car.x : car.y;
      car.axis = car.axis === 'v' ? 'h' : 'v';
      car.road = j;
      car.s = along;
      car.dir = newDir;
      car.lane = newDir * 12;
      break;
    }
  }
  if (car.s < 40) {
    car.s = 40;
    car.dir = 1;
  }
  if (car.s > 2160) {
    car.s = 2160;
    car.dir = -1;
  }
  if (car.axis === 'v') {
    car.x = roads[car.road] + car.lane;
    car.y = car.s;
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = car.s;
    car.y = roads[car.road] + car.lane;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
}

/** One police step: steer at the player, ram on contact, cool down between hits. */
function stepPoliceCruiser(state, car, dt, helpers) {
  const p = state.player;
  const want = Math.atan2(p.y - car.y, p.x - car.x);
  car.angle += turnTo(car.angle, want) * Math.min(1, dt * 2.2);
  car.speed = easeToward(car.speed, CAR.policeSpeed, 1.2, dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = resolveBuildings(state.city, nx, ny, 16);
  car.x = fixed.x;
  car.y = fixed.y;
  car.siren = true;
  const d = Math.hypot(p.x - car.x, p.y - car.y);
  if (d < 44) {
    if (!p.inCar && p.hurtTimer <= 0) {
      p.hp -= 12;
      p.hurtTimer = 0.8;
      helpers.spawnParticles(state, p.x, p.y, 8, '#ff6b6b', 140, 0.5);
      helpers.addWanted(state, 0);
      return EVENT_CRASH;
    }
    if (p.inCar && p.car && car.crashCooldown <= 0) {
      p.car.speed *= 0.55;
      car.speed *= 0.6;
      helpers.spawnParticles(state, car.x, car.y, 10, '#ffb347', 180, 0.5);
      car.crashCooldown = 0.5;
      return EVENT_CRASH;
    }
  }
  if (car.crashCooldown) car.crashCooldown = Math.max(0, car.crashCooldown - dt);
  return 0;
}

/** Advance every car one step; returns event flags (crashes the player caused or took). */
export function updateVehicles(state, dt, harmless, helpers) {
  let events = 0;
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind === 'traffic' && !car.parked) stepTrafficCar(state, car, dt);
    else if (car.kind === 'police') events |= stepPoliceCruiser(state, car, dt, helpers);
  }
  // The player's car shoving traffic: a fast hit is a crime as well as a crash.
  if (p.inCar && p.car) {
    for (const other of state.cars) {
      if (other === p.car || other.kind === 'police') continue;
      const d = Math.hypot(other.x - p.car.x, other.y - p.car.y);
      if (d < 46) {
        const push = (46 - d) / 2;
        const a = Math.atan2(other.y - p.car.y, other.x - p.car.x);
        other.x += Math.cos(a) * push;
        other.y += Math.sin(a) * push;
        if (Math.abs(p.car.speed) > 200 && !other.bumped) {
          other.bumped = true;
          if (!harmless) helpers.addWanted(state, WANTED.hitCar);
          helpers.spawnParticles(state, other.x, other.y, 10, '#ffb347', 160, 0.5);
          p.car.speed *= 0.6;
          events |= EVENT_CRASH;
        }
      } else if (d > 80) {
        other.bumped = false;
      }
    }
  }
  // Traffic that wandered far from the action reappears on a road near the player.
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.parked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d > 1100) {
      const vertical = state.rng() < 0.5;
      const road = Math.floor(state.rng() * 10);
      const along = p.x + (state.rng() - 0.5) * 1200;
      car.axis = vertical ? 'v' : 'h';
      car.road = road;
      car.s = Math.max(60, Math.min(2140, vertical ? p.y + (state.rng() - 0.5) * 1200 : along));
      car.dir = state.rng() < 0.5 ? 1 : -1;
      car.lane = car.dir * 12;
    }
  }
  // Never let the streets empty out.
  const moving = state.cars.filter((c) => c.kind === 'traffic' && !c.parked).length;
  if (moving < 12) spawnTraffic(state, 12 - moving);
  return events;
}
