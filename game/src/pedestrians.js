// Pedestrians: the people on the sidewalks. They stroll along the pavements, cross at
// intersections, and run when shots ring out or a car bears down on them. A car that hits
// one is a crime the police notice.
import { WANTED, WORLD } from './config.js';
import { clampToCity, EVENT_HIT } from './world.js';

export function updatePedestrians(state, dt, harmless, helpers) {
  let events = 0;
  const p = state.player;
  for (let i = state.peds.length - 1; i >= 0; i -= 1) {
    const ped = state.peds[i];
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const d = Math.hypot(ped.fleeX - ped.x, ped.fleeY - ped.y);
      if (d > 8) {
        const a = Math.atan2(ped.fleeY - ped.y, ped.fleeX - ped.x);
        ped.angle = a;
        ped.x += Math.cos(a) * ped.speed * 2.1 * dt;
        ped.y += Math.sin(a) * ped.speed * 2.1 * dt;
      }
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      const fixed = clampToCity(ped.x, ped.y);
      ped.x = fixed.x;
      ped.y = fixed.y;
      continue;
    }
    // A fast car or a nearby gunshot sends them running.
    let threat = null;
    if (p.inCar && p.car && Math.abs(p.car.speed) > 260 && Math.hypot(p.car.x - ped.x, p.car.y - ped.y) < 130) {
      threat = { x: p.car.x, y: p.car.y };
    }
    if (state.bullets.length > 0) {
      for (const b of state.bullets) {
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 200) { threat = { x: b.x, y: b.y }; break; }
      }
    }
    if (threat) {
      const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
      ped.state = 'flee';
      ped.fleeTimer = 2.5 + state.rng() * 1.5;
      ped.fleeX = ped.x + Math.cos(a) * 320;
      ped.fleeY = ped.y + Math.sin(a) * 320;
      continue;
    }
    // Stroll along the sidewalk; turn at intersections now and then.
    const roads = state.city.roads;
    ped.s += ped.dir * ped.speed * dt;
    for (let j = 0; j < roads.length; j += 1) {
      const line = roads[j];
      if (Math.abs(ped.s - line) < 4 && ped.road !== j && state.rng() < 0.25) {
        const along = ped.axis === 'v' ? ped.x : ped.y;
        ped.axis = ped.axis === 'v' ? 'h' : 'v';
        ped.road = j;
        ped.s = along;
        ped.dir = state.rng() < 0.5 ? 1 : -1;
        ped.lane = ped.dir * (WORLD.roadWidth / 2 + 12);
        break;
      }
    }
    if (ped.s < 40) { ped.s = 40; ped.dir = 1; }
    if (ped.s > 2160) { ped.s = 2160; ped.dir = -1; }
    if (ped.axis === 'v') {
      ped.x = roads[ped.road] + ped.lane;
      ped.y = ped.s;
      ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      ped.x = ped.s;
      ped.y = roads[ped.road] + ped.lane;
      ped.angle = ped.dir > 0 ? 0 : Math.PI;
    }
    // The player's car can hit one — that is a crime.
    if (p.inCar && p.car && Math.abs(p.car.speed) > 60 && Math.hypot(p.car.x - ped.x, p.car.y - ped.y) < 34) {
      if (!harmless) helpers.addWanted(state, WANTED.hitPed);
      state.stats.pedsHit += 1;
      helpers.spawnParticles(state, ped.x, ped.y, 12, '#ff8a80', 150, 0.6);
      p.car.speed *= 0.7;
      state.peds.splice(i, 1);
      helpers.spawnPedestrian(state);
      events |= EVENT_HIT;
    }
  }
  return events;
}
