// The player on foot and behind the wheel: walking, driving, stealing a car, getting out,
// punching and shooting (the hits themselves live in combat.js), and picking up health.
import { CAR, PLAYER, WANTED } from './config.js';
import { resolveBuildings, clampToCity, EVENT_CRASH, EVENT_PICKUP, EVENT_STEAL } from './world.js';
import { playerPunch, playerShoot } from './combat.js';

function nearestStealableCar(state, x, y) {
  let best = null;
  let bestD = 90;
  for (const car of state.cars) {
    if (car.kind === 'police') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function driveCar(state, car, input, dt, helpers) {
  const throttle = -input.my; // up (my = -1) is the accelerator
  const steer = input.mx;
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) > 2) {
    // A crawling car turns sharply (parking), a fast one wide — like a real wheel.
    // The threshold is 2, not 20: a car turning (almost) in place must still steer.
    const steerAuthority = Math.max(0.45, Math.min(1.2, 1.2 - Math.abs(car.speed) / 600));
    car.angle += steer * CAR.turnRate * steerAuthority * dt * (car.speed < 0 ? -1 : 1);
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 300 && state.rng() < 0.5) {
      if (state.skids.length < 120) {
        state.skids.push({ x1: car.x, y1: car.y, x2: car.x - Math.cos(car.angle) * 20, y2: car.y - Math.sin(car.angle) * 20, life: 5 });
      }
    }
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Collision radius 16, not the car's full half-length: the visual body is long, but
  // the road only leaves 4 units of slack at radius 26, so any turn drift wedged the car.
  const fixed = resolveBuildings(state.city, nx, ny, 16);
  if (Math.abs(fixed.x - nx) > 0.5 || Math.abs(fixed.y - ny) > 0.5) {
    if (Math.abs(car.speed) > 180) {
      helpers.spawnParticles(state, nx, ny, 10, '#ffb347', 160, 0.5);
      helpers.addWanted(state, 0);
      car.speed *= 0.3;
      state.player.hurtTimer = Math.max(state.player.hurtTimer, 0.2);
      car.x = fixed.x;
      car.y = fixed.y;
      return EVENT_CRASH;
    }
    car.speed *= 0.5;
  }
  car.x = fixed.x;
  car.y = fixed.y;
  const clamped = clampToCity(car.x, car.y);
  car.x = clamped.x;
  car.y = clamped.y;
  if (Math.abs(car.speed) > 380 && state.rng() < 0.3) {
    helpers.spawnParticles(state, car.x - Math.cos(car.angle) * 24, car.y - Math.sin(car.angle) * 24, 1, '#9a9a9a', 40, 0.6);
  }
  return 0;
}

export function updatePlayer(state, input, dt, harmless, helpers) {
  const p = state.player;
  let events = 0;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.hurtTimer > 0) p.hurtTimer -= dt;

  if (input.enter && !harmless) {
    if (!p.inCar) {
      const car = nearestStealableCar(state, p.x, p.y);
      if (car) {
        if (car.driver) {
          // The driver bails out and runs.
          state.peds.push({
            x: car.x + 30, y: car.y + 30, angle: 0, speed: 200,
            axis: 'v', road: 0, s: 0, dir: 1, lane: 0,
            color: '#e8b88a', shirt: car.color, state: 'flee', fleeTimer: 3, fleeX: car.x + 200, fleeY: car.y + 200,
          });
          car.driver = false;
        }
        car.parked = false;
        car.kind = 'player';
        p.inCar = true;
        p.car = car;
        state.stats.carsStolen += 1;
        helpers.addWanted(state, WANTED.stealCar);
        helpers.addMessage(state, 'Car stolen — the police noticed.');
        helpers.spawnParticles(state, car.x, car.y, 8, '#ffffff', 90, 0.4);
        events |= EVENT_STEAL;
      }
    } else if (p.car) {
      const car = p.car;
      car.kind = 'traffic';
      car.parked = true;
      car.speed = 0;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const fixed = resolveBuildings(state.city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      p.inCar = false;
      p.car = null;
    }
  }

  if (p.inCar && p.car) {
    events |= driveCar(state, p.car, input, dt, helpers);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    p.face = p.car.angle;
    p.speed = p.car.speed;
    return events;
  }

  // On foot.
  const len = Math.hypot(input.mx, input.my) || 1;
  const vx = (input.mx / len) * PLAYER.walkSpeed;
  const vy = (input.my / len) * PLAYER.walkSpeed;
  const moving = input.mx !== 0 || input.my !== 0;
  if (moving) {
    const nx = p.x + vx * dt;
    const ny = p.y + vy * dt;
    const fixed = resolveBuildings(state.city, nx, ny, PLAYER.radius);
    p.x = fixed.x;
    p.y = fixed.y;
    const clamped = clampToCity(p.x, p.y);
    p.x = clamped.x;
    p.y = clamped.y;
    p.face = Math.atan2(vy, vx);
    if (state.rng() < 0.12) {
      helpers.spawnParticles(state, p.x, p.y + 10, 1, '#b8a888', 20, 0.4);
    }
  }
  p.speed = moving ? PLAYER.walkSpeed : 0;
  // Face the mouse while shooting, the road while walking.
  if (input.shoot || input.aimX !== undefined) {
    const dx = input.aimX - p.x;
    const dy = input.aimY - p.y;
    if (Math.hypot(dx, dy) > 12) p.face = Math.atan2(dy, dx);
  }
  if (input.punch && p.punchCooldown <= 0 && !harmless) {
    p.punchCooldown = 0.35;
    events |= playerPunch(state, helpers);
  }
  if (input.shoot && p.shootCooldown <= 0 && !harmless) {
    p.shootCooldown = 0.22;
    events |= playerShoot(state, input.aimX, input.aimY, helpers);
  }
  // Health packs.
  for (const pack of state.city.pickups) {
    if (!pack.taken && Math.hypot(pack.x - p.x, pack.y - p.y) < 34) {
      pack.taken = true;
      pack.timer = 45;
      p.hp = Math.min(PLAYER.maxHp, p.hp + 50);
      helpers.addMessage(state, '+50 health');
      helpers.spawnParticles(state, pack.x, pack.y, 12, '#58c96b', 120, 0.6);
      events |= EVENT_PICKUP;
    }
  }
  return events;
}
