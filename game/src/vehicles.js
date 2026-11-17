// Cars: the traffic that fills the roads, the parked cars waiting to be borrowed, and the
// police cruisers that hunt the player. Traffic follows the road grid (lanes, turns at
// intersections, slowing for the car ahead); police steer straight at the player.
import { CAR, WANTED, WORLD } from './config.js';
import { resolveBuildings, EVENT_CRASH } from './world.js';

const TRAFFIC_COLORS = ['#d94f3d', '#3d7ad9', '#e8c33a', '#7ac74f', '#c9c9c9', '#8a5fd0', '#e07b39', '#3fb8a6', '#e8e8e8', '#5a6a7a'];

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function nearestCar(state, x, y, maxD, kinds) {
  let best = null;
  let bestD = maxD;
  for (const car of state.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function spawnTraffic(state, count) {
  for (let i = 0; i < count; i += 1) {
    const axis = state.rng() < 0.5 ? 'v' : 'h';
    const road = Math.floor(state.rng() * 10);
    const s = 60 + state.rng() * 2080;
    const dir = state.rng() < 0.5 ? 1 : -1;
    const lane = dir * 12;
    const x = axis === 'v' ? state.city.roads[road] + lane : s;
    const y = axis === 'v' ? s : state.city.roads[road] + lane;
    state.cars.push({
      id: state.cars.length, kind: 'traffic', x, y,
      angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
      speed: CAR.trafficSpeed * (0.8 + state.rng() * 0.4),
      color: TRAFFIC_COLORS[Math.floor(state.rng() * TRAFFIC_COLORS.length)],
      axis, road, s, dir, lane, parked: false, driver: true, siren: false,
    });
  }
}

function stepTraffic(state, car, dt) {
  const roads = state.city.roads;
  const prevS = car.s;
  // Slow down for the car ahead on the same lane.
  let targetSpeed = CAR.trafficSpeed;
  for (const other of state.cars) {
    if (other === car || other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
    const gap = (other.s - car.s) * car.dir;
    if (gap > 0 && gap < 90) targetSpeed = gap < 46 ? 0 : other.speed * 0.6;
  }
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
  car.s += car.dir * car.speed * dt;
  // Turning at an intersection: pick a cross street at random.
  for (let j = 0; j < roads.length; j += 1) {
    const line = roads[j];
    const crossed = (prevS - line) * (car.s - line) <= 0 && Math.abs(car.s - line) < 6;
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
  if (car.s < 40) { car.s = 40; car.dir = 1; }
  if (car.s > 2160) { car.s = 2160; car.dir = -1; }
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

function stepPoliceCar(state, car, dt, helpers) {
  const p = state.player;
  const want = Math.atan2(p.y - car.y, p.x - car.x);
  car.angle = angleLerp(car.angle, want, Math.min(1, dt * 2.2));
  car.speed += (CAR.policeSpeed - car.speed) * Math.min(1, dt * 1.2);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = resolveBuildings(state.city, nx, ny, 16);
  car.x = fixed.x;
  car.y = fixed.y;
  car.siren = true;
  // Ramming the player: on foot it hurts, in a car it shoves.
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

export function updateVehicles(state, dt, harmless, helpers) {
  let events = 0;
  const p = state.player;
  for (const car of state.cars) {
    if (car.kind === 'traffic' && !car.parked) stepTraffic(state, car, dt);
    else if (car.kind === 'police') events |= stepPoliceCar(state, car, dt, helpers);
  }
  // Player car bumping traffic: a hard hit is a crime and a crash.
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
  // Traffic stays near the action: cars that drifted far away come back near the player.
  for (const car of state.cars) {
    if (car.kind !== 'traffic' || car.parked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d > 1100) {
      const axis = state.rng() < 0.5 ? 'v' : 'h';
      const road = Math.floor(state.rng() * 10);
      const along = p.x + (state.rng() - 0.5) * 1200;
      car.axis = axis;
      car.road = road;
      car.s = Math.max(60, Math.min(2140, axis === 'v' ? p.y + (state.rng() - 0.5) * 1200 : along));
      car.dir = state.rng() < 0.5 ? 1 : -1;
      car.lane = car.dir * 12;
    }
  }
  // Keep the streets busy.
  const moving = state.cars.filter((c) => c.kind === 'traffic' && !c.parked).length;
  if (moving < 12) spawnTraffic(state, 12 - moving);
  return events;
}
