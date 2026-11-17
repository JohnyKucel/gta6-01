// The staged scenes behind ?shot=chase|street|night|start. Each scene replays the real
// rules forward from a fresh world for a fixed number of seconds, steered by a small
// autopilot, so the frame is a genuine slice of play — and the same seed always stages
// the same frame. No Date.now, no Math.random; only the world's seeded stream.
import { STEP, WORLD } from './config.js';
import { EVENT_OVER } from './world.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** How long each scene plays before the frame is taken, in seconds. */
const SCENE_LENGTH = { chase: 16, street: 7, night: 10, start: 12 };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Smallest signed turn from heading `from` to heading `to`, in (-PI, PI]. */
function turnTo(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function noInput(aimX, aimY) {
  return { mx: 0, my: 0, enter: false, punch: false, shoot: false, aimX, aimY };
}

/** Step the world for `seconds`, asking `inputFn` for each tick's bundle. Stops early
 * if the game ends. `harmless` runs the backdrop with no crimes and no death. */
function runFor(world, seconds, inputFn, harmless = false) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.step(STEP, inputFn(), harmless) & EVENT_OVER) break;
    if (world.state.over) break;
  }
}

/** Walk the player toward (tx, ty) on foot. */
function walkToward(state, tx, ty) {
  const dx = tx - state.player.x;
  const dy = ty - state.player.y;
  const d = Math.hypot(dx, dy) || 1;
  return { mx: clamp(dx / d, -1, 1), my: clamp(dy / d, -1, 1), enter: false, punch: false, shoot: false, aimX: tx, aimY: ty };
}

/** The road line closest to a coordinate. */
function closestRoad(roads, v) {
  let best = roads[0];
  for (const line of roads) {
    if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  }
  return best;
}

/** A Manhattan route across the grid: from the car's nearest crossing to the target's,
 * one intersection at a time, always picking the step that leaves the least distance
 * behind, so the route shortens every step and can never loop. */
function planRoute(state, tx, ty) {
  const roads = state.city.roads;
  const gap = WORLD.roadGap;
  let cx = closestRoad(roads, state.player.car.x);
  let cy = closestRoad(roads, state.player.car.y);
  const gx = closestRoad(roads, tx);
  const gy = closestRoad(roads, ty);
  const pts = [{ x: cx, y: cy }];
  let guard = 0;
  while ((cx !== gx || cy !== gy) && guard < 40) {
    guard += 1;
    const moves = [];
    if (cx < gx) moves.push({ x: cx + gap, y: cy });
    if (cx > gx) moves.push({ x: cx - gap, y: cy });
    if (cy < gy) moves.push({ x: cx, y: cy + gap });
    if (cy > gy) moves.push({ x: cx, y: cy - gap });
    moves.sort((a, b) => (Math.abs(gx - a.x) + Math.abs(gy - a.y)) - (Math.abs(gx - b.x) + Math.abs(gy - b.y)));
    const next = moves[0];
    cx = next.x;
    cy = next.y;
    pts.push({ x: cx, y: cy });
  }
  pts.push({ x: tx, y: ty });
  return pts;
}

/** Drive the player's car toward a point, following the road grid: the car walks a
 * planned route of intersections, braking early when a turn waits at the next crossing
 * and turning (almost) in place when the heading change is sharp. Exported so a
 * playtest can steer with the same autopilot the screenshots use. */
export function driveInput(state, tx, ty) {
  const car = state.player.car;
  const idle = noInput(tx, ty);
  if (!car) return idle;
  if (!car._route || car._route.tx !== tx || car._route.ty !== ty) {
    car._route = { tx, ty, pts: planRoute(state, tx, ty), i: 0 };
  }
  const route = car._route;
  // Arrived: brake to a stop at the destination instead of orbiting the point.
  if (Math.hypot(tx - car.x, ty - car.y) < 80) {
    return { ...idle, my: Math.abs(car.speed) > 20 ? 0.6 : 0 };
  }
  // Advance only once the car is really at the crossing: advancing early makes it cut
  // the corner through the block instead of turning on the road.
  while (route.i < route.pts.length - 1 && Math.hypot(route.pts[route.i].x - car.x, route.pts[route.i].y - car.y) < 25) {
    route.i += 1;
  }
  const wp = route.pts[Math.min(route.i, route.pts.length - 1)];
  const next = route.pts[Math.min(route.i + 1, route.pts.length - 1)];
  const want = Math.atan2(wp.y - car.y, wp.x - car.x);
  const diff = turnTo(car.angle, want);
  const steer = clamp(diff * 2.2, -1, 1);
  const distWp = Math.hypot(wp.x - car.x, wp.y - car.y);
  const turnAhead = Math.abs(turnTo(want, Math.atan2(next.y - wp.y, next.x - wp.x))) > 0.5;
  let throttle = -1; // full speed ahead
  if (Math.abs(diff) > 1.2 || Math.abs(diff) > 0.5) {
    // Sharp heading change: brake if moving, coast if slow, creep if stopped.
    throttle = Math.abs(car.speed) > 60 ? 0.6 : Math.abs(car.speed) > 5 ? 0 : -0.15;
  } else if (turnAhead && distWp < 200 && Math.abs(car.speed) > 140) {
    throttle = 0.6; // a turn waits at this crossing: slow down before it, not in it
  } else if (Math.abs(car.speed) > 480) {
    throttle = 0; // don't outrun the brakes
  }
  return { ...idle, mx: steer, my: throttle };
}

/** Put the player in the nearest civilian car, parked at (x, y), facing south. */
function putPlayerInCar(state, x, y) {
  let car = null;
  let bestD = 1e9;
  for (const c of state.cars) {
    if (c.kind === 'police') continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      bestD = d;
      car = c;
    }
  }
  if (!car) return;
  car.parked = false;
  car.kind = 'player';
  car.x = x;
  car.y = y;
  car.angle = Math.PI / 2;
  car.speed = 0;
  state.player.x = x;
  state.player.y = y;
  state.player.inCar = true;
  state.player.car = car;
  state.player.angle = car.angle;
  state.camera.x = x;
  state.camera.y = y;
}

/** Drop a siren-blaring cruiser into the world, already pointed at the player. */
function addPoliceCar(state, x, y) {
  state.cars.push({
    id: state.cars.length, kind: 'police', x, y,
    angle: Math.atan2(state.player.y - y, state.player.x - x), speed: 300,
    color: '#20242e', axis: 'v', road: 0, s: 0, dir: 1, lane: 0,
    parked: false, driver: true, siren: true, crashCooldown: 0,
  });
}

/** The nearest living threat (thug or cop on foot) to the player, if any. */
function nearestThreat(state) {
  let nearest = null;
  let nearestD = 1e9;
  for (const t of [...state.thugs, ...state.cops]) {
    const d = Math.hypot(t.x - state.player.x, t.y - state.player.y);
    if (d < nearestD) {
      nearestD = d;
      nearest = t;
    }
  }
  return nearest;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * chase: a police chase at 3 stars, the player fleeing in a stolen car.
 * street: on foot downtown, traffic and pedestrians, a car to steal.
 * night: a night shootout at a police roadblock.
 * start: the title screen over a living city.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;

  if (name === 'chase') {
    putPlayerInCar(state, 800, 800);
    state.wanted.points = 45; // three stars
    state.wanted.level = 3;
    addPoliceCar(state, 700, 620);
    addPoliceCar(state, 980, 940);
    addPoliceCar(state, 620, 980);
    startMission(state, 2);
    state.mission.timer = 62;
    runFor(world, SCENE_LENGTH.chase, () => driveInput(state, 1920, 1900));
    // Ramming traffic on the way raises the heat; pin the frame back to three stars.
    state.wanted.points = 45;
    state.wanted.level = 3;
    return { screen: SCREEN_PLAY, best: state.player.money };
  }

  if (name === 'street') {
    state.player.x = 1100;
    state.player.y = 900;
    state.camera.x = 1100;
    state.camera.y = 900;
    // A parked car a short walk away, the mission's first temptation.
    const car = state.cars.find((c) => c.parked);
    if (car) {
      car.x = 1240;
      car.y = 900;
    }
    runFor(world, SCENE_LENGTH.street, () => {
      const d = Math.hypot(1240 - state.player.x, 900 - state.player.y);
      return d < 70 ? noInput(1240, 900) : walkToward(state, 1240, 900);
    });
    return { screen: SCREEN_PLAY, best: state.player.money };
  }

  if (name === 'night') {
    state.elapsed = (22.3 - 9.5) * 240; // night, 22:18
    state.player.x = 820;
    state.player.y = 1060;
    state.player.hp = 200; // the scene needs the player alive for the full ten seconds
    state.player.ammo = 120;
    state.camera.x = 820;
    state.camera.y = 1060;
    state.wanted.points = 45;
    state.wanted.level = 3;
    startMission(state, 3);
    // A police roadblock across the street ahead.
    addPoliceCar(state, 1020, 860);
    addPoliceCar(state, 1020, 960);
    runFor(world, SCENE_LENGTH.night, () => {
      const threat = nearestThreat(state);
      const aim = threat ? { x: threat.x, y: threat.y } : { x: 1020, y: 900 };
      // Hold a firing position southwest of the crew instead of walking into them.
      const d = Math.hypot(820 - state.player.x, 1060 - state.player.y);
      const input = d < 40 ? noInput(aim.x, aim.y) : walkToward(state, 820, 1060);
      input.shoot = true;
      input.aimX = aim.x;
      input.aimY = aim.y;
      return input;
    });
    // The shootout raises the heat past three stars; pin the frame back to the scene.
    state.wanted.points = 45;
    state.wanted.level = 3;
    return { screen: SCREEN_PLAY, best: state.player.money };
  }

  // start (and any unknown name): the title screen over a living city.
  runFor(world, SCENE_LENGTH.start, () => noInput(0, 0), true);
  state.camera.x = 1100;
  state.camera.y = 850;
  return { screen: SCREEN_TITLE, best: 0 };
}
