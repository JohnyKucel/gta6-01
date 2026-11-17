// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, paused, game over, missions and
// how to play. Sound starts on the first gesture.
//
// ?seed=N fixes the city. ?shot=chase|street|night|start (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP, EVENT_SHOT, EVENT_STEAL } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, createInput } from './input.js';
import { createRenderer, SCREEN_HOWTO, SCREEN_MISSIONS, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { applySave, hasSave, loadGame, saveGame } from './save.js';
import { missionListText, startMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__porto = { state: world.state, screen: () => scene.screen };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, hasSave: false, selected: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let selected = 0;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // For playtests and the outside world to read the live state.
  window.__porto = { state: world.state, screen: () => screen };

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Porto Sol. Mara Voss has your first job.');
  }

  function startContinue() {
    const data = loadGame();
    world.reset();
    if (data) {
      applySave(world, data);
      if (data.missionIndex >= 1 && data.missionIndex <= 6) startMission(world.state, data.missionIndex);
      announce('Save loaded. Welcome back to Porto Sol.');
    } else {
      announce('No save yet — starting a new game.');
    }
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.player.money > best) {
      best = world.state.player.money;
      saveBest(best);
    }
    audio.busted();
    announce(world.state.overReason === 'busted' ? 'Busted. The Porto Sol police got you.' : 'Wasted. Porto Sol got you.');
  }

  function playEvents(events) {
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) audio.mission();
    if (events & EVENT_STEAL) audio.steal();
    if (events & EVENT_BUSTED) audio.busted();
    if (events & EVENT_OVER) endGame();
  }

  function step(actionFlags) {
    const move = input.move();
    const mouse = input.mouse();
    const aim = renderer.screenToWorld(mouse.x, mouse.y);
    const bundle = {
      mx: move.mx,
      my: move.my,
      enter: Boolean(actionFlags & ACTION_ENTER),
      punch: Boolean(actionFlags & ACTION_PUNCH),
      shoot: mouse.down,
      aimX: aim.x,
      aimY: aim.y,
    };
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, enter: false, punch: false, shoot: false, aimX: 0, aimY: 0 }, true);
      return;
    }
    const events = world.step(STEP, bundle, false);
    playEvents(events);
  }

  function handleActions(actions, digit) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (digit === 1 || (actions & ACTION_CONFIRM)) startNewGame();
      else if (digit === 2) startContinue();
      else if (digit === 3) { screen = SCREEN_MISSIONS; announce('Missions.'); }
      else if (digit === 4) { screen = SCREEN_HOWTO; announce('How to play.'); }
      return;
    }
    if (screen === SCREEN_MISSIONS) {
      if (digit === 3 || (actions & ACTION_PAUSE)) screen = SCREEN_TITLE;
      return;
    }
    if (screen === SCREEN_HOWTO) {
      if (digit === 4 || (actions & ACTION_PAUSE)) screen = SCREEN_TITLE;
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_SAVE) {
        if (saveGame(world.state)) announce('Saved.');
        else announce('Save failed — storage is off.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_SAVE) {
        saveGame(world.state);
        screen = SCREEN_TITLE;
        announce('Saved. Back at the title.');
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startNewGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One-shot presses are taken once per frame and handed to the first step, so a
    // press between two frames is never lost and never counted twice.
    const actions = input.takeActions();
    const digit = input.takeDigit();
    handleActions(actions, digit);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    audio.engine(p.inCar && p.car ? Math.abs(p.car.speed) / 560 : 0, p.inCar);
    const sirenNear = world.state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 650);
    audio.siren(sirenNear && screen === SCREEN_PLAY);
    renderer.draw(world.state, screen, {
      best,
      hasSave: hasSave(),
      selected,
      missionLines: missionListText(world.state),
    });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Porto Sol. Press 1 for a new game, 2 to continue.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
