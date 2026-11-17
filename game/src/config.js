// Porto Sol — every tuning number, colour and world constant in one place.
// The city is a fixed 2200 x 2200 world; the camera shows a 1280x720 window of it,
// scaled to the browser window, so no rule below depends on the screen size.

export const WORLD = { size: 2200, roadGap: 220, roadWidth: 48, firstRoad: 140 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Logical view the renderer frames (matches the 1280x720 screenshots). */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  walkSpeed: 235,
  radius: 14,
  maxHp: 100,
  punchDamage: 30,
  punchRange: 46,
  punchArc: 1.1,
  pistolDamage: 34,
  bulletSpeed: 980,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  accel: 620,
  brake: 900,
  reverseAccel: 320,
  maxSpeed: 560,
  maxReverse: 170,
  turnRate: 2.5,
  drag: 0.55,
  length: 52,
  width: 26,
  trafficSpeed: 150,
  policeSpeed: 520,
};

export const WANTED = {
  stealCar: 12,
  hitPed: 10,
  hitCar: 6,
  shoot: 8,
  killCop: 20,
  /** Points at which each star lights up (index = stars). */
  thresholds: [0, 10, 25, 45, 65, 85],
  /** Seconds unseen before points start draining. */
  coolSeconds: 9,
  drainPerSecond: 6,
};

export const MISSIONS = [
  { id: 1, title: 'Borrowed Wheels', reward: 500 },
  { id: 2, title: 'Hot Delivery', reward: 800 },
  { id: 3, title: 'Street Cleanup', reward: 1200 },
  { id: 4, title: 'Heat Wave', reward: 1500 },
  { id: 5, title: 'The Escort', reward: 2000 },
  { id: 6, title: 'The Last Vault', reward: 5000 },
];

export const PALETTE = {
  backdrop: '#0d1420',
  water: '#1d6f8f',
  sand: '#d9c08a',
  grass: '#4d8a4a',
  park: '#3f7a44',
  road: '#333a45',
  roadLine: '#c8b45a',
  sidewalk: '#6b7280',
  buildingRoof: '#8a6f5c',
  text: '#f2f0e8',
  muted: '#aab3c0',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
  green: '#58c96b',
  panel: '#141c28',
  panelEdge: '#2c3a4e',
  star: '#ffd23f',
  minimapWater: '#155a75',
  minimapRoad: '#565e6a',
  minimapBuilding: '#2c3542',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'porto-sol.save.v1';
export const BEST_KEY = 'porto-sol.best';
