// Keyboard and pointer input. Held keys give a move vector; one-shot presses (enter a car,
// punch, pause, confirm) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims the pistol.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_SAVE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let digit = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (ENTER.has(event.code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (PUNCH.has(event.code)) { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (MUTE.has(event.code)) { if (!event.repeat) actions |= ACTION_MUTE; }
    else if (event.code === 'KeyQ') { if (!event.repeat) actions |= ACTION_SAVE; }
    else if (event.code.startsWith('Digit')) { digit = Number(event.code.slice(5)); }
    else return;
    if (CONFIRM.has(event.code) || PAUSE.has(event.code) || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    mouseDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  window.addEventListener('pointerup', () => { mouseDown = false; });

  return {
    /** Move vector, each component -1, 0 or 1. */
    move() {
      return {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** A menu digit pressed since the last call (0 when none). */
    takeDigit() {
      const taken = digit;
      digit = 0;
      return taken;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
  };
}
