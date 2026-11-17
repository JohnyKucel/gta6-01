// The police response: wanted stars bring patrol cruisers that chase and ram, and foot
// officers who run the player down on foot, try to arrest them, and open fire at three
// stars and above. Lose them — break line of sight and wait — and the heat cools off.
import { WANTED } from './config.js';
import { resolveBuildings, EVENT_BUSTED, EVENT_SHOT } from './world.js';

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function spawnPatrolCar(state) {
  const p = state.player;
  const a = state.rng() * Math.PI * 2;
  const x = Math.max(80, Math.min(2120, p.x + Math.cos(a) * (520 + state.rng() * 200)));
  const y = Math.max(80, Math.min(2120, p.y + Math.sin(a) * (520 + state.rng() * 200)));
  const fixed = resolveBuildings(state.city, x, y, 30);
  state.cars.push({
    id: state.cars.length, kind: 'police', x: fixed.x, y: fixed.y,
    angle: Math.atan2(p.y - fixed.y, p.x - fixed.x), speed: 200,
    color: '#20242e', axis: 'v', road: 0, s: 0, dir: 1, lane: 0,
    parked: false, driver: true, siren: true, crashCooldown: 0,
  });
}

function spawnFootCop(state) {
  const p = state.player;
  const a = state.rng() * Math.PI * 2;
  const x = Math.max(60, Math.min(2140, p.x + Math.cos(a) * (380 + state.rng() * 180)));
  const y = Math.max(60, Math.min(2140, p.y + Math.sin(a) * (380 + state.rng() * 180)));
  const fixed = resolveBuildings(state.city, x, y, 14);
  state.cops.push({
    x: fixed.x, y: fixed.y, angle: 0, hp: 60, speed: 200 + state.rng() * 30,
    shootTimer: 1 + state.rng(), color: '#1d2f4d', arrest: 0,
  });
}

export function updatePolice(state, dt, harmless, helpers) {
  let events = 0;
  const p = state.player;
  const level = harmless ? 0 : state.wanted.level;

  // Cruisers: one per star, up to three on the road at once.
  const cruisers = state.cars.filter((c) => c.kind === 'police');
  const wantCruisers = Math.min(3, level);
  if (cruisers.length < wantCruisers && state.rng() < dt * 0.8) spawnPatrolCar(state);
  if (level === 0) {
    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      if (state.cars[i].kind === 'police' && Math.hypot(state.cars[i].x - p.x, state.cars[i].y - p.y) > 900) {
        state.cars.splice(i, 1);
      }
    }
  }
  // Foot officers: two per star once the player is out of the car (one at a time at 1 star).
  const wantCops = p.inCar ? 0 : Math.min(6, level * 2);
  if (state.cops.length < wantCops && state.rng() < dt * 1.2) spawnFootCop(state);
  if (level === 0) {
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      if (Math.hypot(state.cops[i].x - p.x, state.cops[i].y - p.y) > 1000) state.cops.splice(i, 1);
    }
  }

  for (const cop of state.cops) {
    const d = Math.hypot(p.x - cop.x, p.y - cop.y);
    const want = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = angleLerp(cop.angle, want, Math.min(1, dt * 6));
    // Close in and try to arrest; at three stars they shoot from a distance instead.
    if (level >= 3 && d > 150 && d < 420) {
      cop.shootTimer -= dt;
      if (cop.shootTimer <= 0) {
        cop.shootTimer = 1.4 + state.rng() * 0.8;
        const spread = (state.rng() - 0.5) * 0.3;
        state.bullets.push({
          x: cop.x, y: cop.y, vx: Math.cos(want + spread) * 780, vy: Math.sin(want + spread) * 780,
          life: 1.1, from: 'cop', dmg: 9,
        });
        events |= EVENT_SHOT;
      }
    } else if (d > 30) {
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      const fixed = resolveBuildings(state.city, nx, ny, 12);
      cop.x = fixed.x;
      cop.y = fixed.y;
    }
    if (d < 30 && !p.inCar) {
      cop.arrest += dt;
      if (cop.arrest > 1.2) {
        p.hp = 0;
        state.busted = true;
        events |= EVENT_BUSTED;
      }
    } else {
      cop.arrest = Math.max(0, cop.arrest - dt * 2);
    }
  }
  return events;
}
