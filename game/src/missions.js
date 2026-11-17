// Missions and the story: six jobs from Mara Voss, the fixer who runs Porto Sol from a
// booth at the back of the marina cafe. Each mission has a marker on the map and the
// minimap, an objective line on the HUD, and a cash reward. Finishing one starts the next;
// finishing the sixth closes the story and leaves the city open to roam.
import { MISSIONS } from './config.js';
import { EVENT_MISSION } from './world.js';

const MARA = 'Mara Voss';

export const STORY = [
  `${MARA}: "New in Porto Sol? Prove it. Borrow any car on the street — press E next to one."`,
  `${MARA}: "Package in the trunk. Docks, southwest, 75 seconds. Don't scratch the paint."`,
  `${MARA}: "Rico's boys are shaking down my corner. Three of them. Fists or pistol, your call."`,
  `${MARA}: "The heat is on you now. Get to three stars, then vanish. No cops on your tail."`,
  `${MARA}: "My niece needs a lift to the beach. Pick her up, drive careful — she's family."`,
  `${MARA}: "Last one. The Sol Bank vault, then the hideout up north. Make it count, kid."`,
];

function marker(state, x, y, label) {
  state.mission.target = { x, y, label };
}

export function startMission(state, n) {
  const m = state.mission;
  m.index = n;
  m.stage = 0;
  m.timer = 0;
  m.grabTimer = 0;
  m.passenger = null;
  m.flags = {};
  if (n < 1 || n > 6) {
    m.target = null;
    m.label = '';
    return;
  }
  m.label = STORY[n - 1];
  // The fixer's words flash across the top of the screen; the HUD keeps the short title.
  state.message = STORY[n - 1];
  state.messageTimer = 6;
  if (n === 1) {
    marker(state, state.player.x + 160, state.player.y, 'Steal a car (E)');
  } else if (n === 2) {
    m.timer = 75;
    marker(state, state.city.landmarks.shed.x, state.city.landmarks.shed.y, 'Deliver to the docks');
  } else if (n === 3) {
    marker(state, 900, 900, 'Deal with Rico\'s crew');
    for (let i = 0; i < 3; i += 1) {
      state.thugs.push({
        x: 860 + i * 60, y: 860 + (i % 2) * 70, angle: 0, hp: 60,
        shootTimer: 1 + i * 0.5, color: '#3a2a2a',
      });
    }
  } else if (n === 4) {
    marker(state, state.player.x, state.player.y, 'Reach 3 stars, then lose the cops');
  } else if (n === 5) {
    const px = state.player.x + 120;
    const py = state.player.y + 40;
    m.passenger = { x: px, y: py, aboard: false };
    marker(state, px, py, 'Pick up Ana');
  } else if (n === 6) {
    marker(state, state.city.landmarks.bank.x, state.city.landmarks.bank.y, 'Hit the Sol Bank vault');
  }
}

function completeMission(state, helpers) {
  const n = state.mission.index;
  const reward = MISSIONS[n - 1].reward;
  state.player.money += reward;
  state.player.ammo = Math.min(120, state.player.ammo + 12);
  state.mission.done.push(n);
  state.stats.missionsDone += 1;
  helpers.addMessage(state, `Job done — $${reward}. ${n < 6 ? 'Next job from Mara.' : 'Story complete. Porto Sol is yours.'}`);
  helpers.spawnParticles(state, state.player.x, state.player.y, 20, '#f2c94c', 180, 0.8);
  if (n < 6) startMission(state, n + 1);
  else {
    state.mission.index = 0;
    state.mission.target = null;
    state.mission.label = 'Story complete — free roam. Press 3 for the mission list.';
  }
  return EVENT_MISSION;
}

export function updateMissions(state, dt, harmless, helpers) {
  const m = state.mission;
  const p = state.player;
  if (harmless || m.index < 1 || m.index > 6) return 0;
  const n = m.index;
  if (n === 1) {
    if (p.inCar) return completeMission(state, helpers);
    marker(state, state.player.x + 160, state.player.y, 'Steal a car (E)');
  } else if (n === 2) {
    m.timer -= dt;
    if (m.timer <= 0) {
      helpers.addMessage(state, 'Too slow — Mara gives you another shot.');
      startMission(state, 2);
      return 0;
    }
    if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 70) {
      return completeMission(state, helpers);
    }
  } else if (n === 3) {
    if (state.thugs.length === 0) return completeMission(state, helpers);
  } else if (n === 4) {
    if (!m.flags.reached3 && state.wanted.level >= 3) {
      m.flags.reached3 = true;
      helpers.addMessage(state, 'Three stars! Now vanish — lose them all.');
    }
    if (m.flags.reached3 && state.wanted.level === 0) return completeMission(state, helpers);
    if (m.target) { m.target.x = p.x; m.target.y = p.y; }
  } else if (n === 5) {
    const pas = m.passenger;
    if (pas && !pas.aboard) {
      if (p.inCar && Math.hypot(p.x - pas.x, p.y - pas.y) < 70) {
        pas.aboard = true;
        helpers.addMessage(state, 'Ana is in. Get her to the beach, nice and easy.');
        marker(state, 1920, 1900, 'Drop Ana at the beach');
      } else {
        marker(state, pas.x, pas.y, 'Pick up Ana');
      }
    } else if (pas && pas.aboard) {
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 80) {
        state.mission.passenger = null;
        return completeMission(state, helpers);
      }
    }
  } else if (n === 6) {
    if (m.stage === 0) {
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 70) {
        m.stage = 1;
        m.grabTimer = 5;
        helpers.addMessage(state, 'Cracking the vault… stay put.');
      }
    } else if (m.stage === 1) {
      m.grabTimer -= dt;
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) > 110) {
        m.stage = 0;
        helpers.addMessage(state, 'You left the vault — get back in there.');
      } else if (m.grabTimer <= 0) {
        m.stage = 2;
        helpers.addWanted(state, 45);
        helpers.addMessage(state, 'Vault emptied! Lose the heat — reach the hideout.');
        marker(state, state.city.landmarks.hideout.x, state.city.landmarks.hideout.y, 'Escape to the hideout');
      }
    } else if (m.stage === 2) {
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 80) {
        return completeMission(state, helpers);
      }
    }
  }
  return 0;
}

/** Mission list text for the menu screen. */
export function missionListText(state) {
  return MISSIONS.map((m) => {
    const done = state.mission.done.includes(m.id);
    const current = state.mission.index === m.id;
    return `${done ? '[DONE] ' : current ? '[NOW]  ' : '[    ] '}${m.id}. ${m.title} — $${m.reward}`;
  });
}
