// Combat: the player's fists and pistol, the bullets in the air, and the thugs who shoot
// back. Bullets fly straight, spark off buildings, and hurt whoever they touch — thugs,
// cops, pedestrians, or the player when an enemy fires.
import { PLAYER, WANTED } from './config.js';
import { resolveBuildings, EVENT_SHOT, EVENT_HIT } from './world.js';

function hitBuilding(state, x, y) {
  for (const b of state.city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function playerPunch(state, helpers) {
  const p = state.player;
  let hit = false;
  const reach = (target) => {
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (d > PLAYER.punchRange + 14) return false;
    let diff = Math.atan2(target.y - p.y, target.x - p.x) - p.face;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < PLAYER.punchArc;
  };
  for (let i = state.thugs.length - 1; i >= 0; i -= 1) {
    const t = state.thugs[i];
    if (reach(t)) {
      t.hp -= PLAYER.punchDamage;
      helpers.spawnParticles(state, t.x, t.y, 8, '#ffd23f', 140, 0.4);
      hit = true;
      if (t.hp <= 0) state.thugs.splice(i, 1);
    }
  }
  for (let i = state.cops.length - 1; i >= 0; i -= 1) {
    const c = state.cops[i];
    if (reach(c)) {
      c.hp -= PLAYER.punchDamage;
      helpers.spawnParticles(state, c.x, c.y, 8, '#ffd23f', 140, 0.4);
      hit = true;
      if (c.hp <= 0) {
        helpers.addWanted(state, WANTED.killCop);
        state.cops.splice(i, 1);
      }
    }
  }
  if (hit) helpers.spawnParticles(state, p.x + Math.cos(p.face) * 30, p.y + Math.sin(p.face) * 30, 4, '#ffffff', 80, 0.3);
  return hit ? EVENT_HIT : 0;
}

export function playerShoot(state, aimX, aimY, helpers) {
  const p = state.player;
  if (p.ammo <= 0) {
    helpers.addMessage(state, 'Out of ammo — find the green crates');
    return 0;
  }
  p.ammo -= 1;
  state.stats.shotsFired += 1;
  const a = Math.atan2(aimY - p.y, aimX - p.x);
  state.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
    life: 0.9, from: 'player', dmg: PLAYER.pistolDamage,
  });
  helpers.spawnParticles(state, p.x + Math.cos(a) * 26, p.y + Math.sin(a) * 26, 3, '#ffd23f', 120, 0.2);
  helpers.addWanted(state, WANTED.shoot);
  // Every shot in earshot makes the street run.
  for (const ped of state.peds) {
    if (Math.hypot(ped.x - p.x, ped.y - p.y) < 260 && ped.state !== 'flee') {
      const fa = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.state = 'flee';
      ped.fleeTimer = 3;
      ped.fleeX = ped.x + Math.cos(fa) * 320;
      ped.fleeY = ped.y + Math.sin(fa) * 320;
    }
  }
  return EVENT_SHOT;
}

function updateThugs(state, dt, helpers) {
  const p = state.player;
  for (let i = state.thugs.length - 1; i >= 0; i -= 1) {
    const t = state.thugs[i];
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    t.shootTimer -= dt;
    if (d < 420 && !p.inCar) {
      const want = Math.atan2(p.y - t.y, p.x - t.x);
      t.angle = want;
      if (d > 180) {
        const nx = t.x + Math.cos(want) * 130 * dt;
        const ny = t.y + Math.sin(want) * 130 * dt;
        const fixed = resolveBuildings(state.city, nx, ny, 12);
        t.x = fixed.x;
        t.y = fixed.y;
      }
      if (t.shootTimer <= 0 && d < 380) {
        t.shootTimer = 1.3 + state.rng() * 0.9;
        const spread = (state.rng() - 0.5) * 0.35;
        state.bullets.push({
          x: t.x, y: t.y, vx: Math.cos(want + spread) * 720, vy: Math.sin(want + spread) * 720,
          life: 1.1, from: 'thug', dmg: 8,
        });
      }
    } else if (d < 420 && p.inCar) {
      // Thugs scatter from a car bearing down on them.
      const away = Math.atan2(t.y - p.y, t.x - p.x);
      t.x += Math.cos(away) * 150 * dt;
      t.y += Math.sin(away) * 150 * dt;
    }
  }
}

export function updateCombat(state, dt, harmless, helpers) {
  let events = 0;
  const p = state.player;
  updateThugs(state, dt, helpers);
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || hitBuilding(state, b.x, b.y);
    if (dead && hitBuilding(state, b.x, b.y)) {
      helpers.spawnParticles(state, b.x, b.y, 5, '#ffb347', 120, 0.3);
    }
    if (!dead && b.from === 'player') {
      for (let j = state.thugs.length - 1; j >= 0; j -= 1) {
        const t = state.thugs[j];
        if (Math.hypot(t.x - b.x, t.y - b.y) < 18) {
          t.hp -= b.dmg;
          helpers.spawnParticles(state, t.x, t.y, 8, '#ff6b6b', 150, 0.4);
          if (t.hp <= 0) state.thugs.splice(j, 1);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (let j = state.cops.length - 1; j >= 0; j -= 1) {
          const c = state.cops[j];
          if (Math.hypot(c.x - b.x, c.y - b.y) < 18) {
            c.hp -= b.dmg;
            helpers.spawnParticles(state, c.x, c.y, 8, '#ff6b6b', 150, 0.4);
            if (c.hp <= 0) {
              helpers.addWanted(state, WANTED.killCop);
              state.cops.splice(j, 1);
            }
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (let j = state.peds.length - 1; j >= 0; j -= 1) {
          const ped = state.peds[j];
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
            state.peds.splice(j, 1);
            helpers.addWanted(state, WANTED.hitPed);
            helpers.spawnParticles(state, ped.x, ped.y, 10, '#ff8a80', 140, 0.5);
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from !== 'player' && !p.inCar) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < 16 && p.hurtTimer <= 0) {
        p.hp -= b.dmg;
        p.hurtTimer = 0.5;
        helpers.spawnParticles(state, p.x, p.y, 8, '#ff6b6b', 140, 0.4);
        dead = true;
        events |= EVENT_HIT;
      }
    }
    if (!dead && b.from !== 'player' && p.inCar && p.car) {
      if (Math.hypot(p.car.x - b.x, p.car.y - b.y) < 28) {
        helpers.spawnParticles(state, b.x, b.y, 6, '#ffb347', 130, 0.3);
        dead = true;
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
  return events;
}
