// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player through Porto Sol — water and beach at the edges, roads and sidewalks, buildings
// with shadows, traffic, pedestrians, police lights at night — then the HUD, then a panel
// for the screen the game is on. Flat canvas shapes, no images, no network.
import { FONT, PALETTE, VIEW, WORLD } from './config.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_MISSIONS = 'missions';
export const SCREEN_HOWTO = 'howto';

const PANEL = { width: 640, line: 32 };

function isNight(state) {
  const h = Math.floor(state.time) % 24;
  return h >= 19 || h < 6;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /** Convert a screen point (CSS pixels) into world coordinates. */
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    const lx = (sx - view.x) / view.scale;
    const ly = (sy - view.y) / view.scale;
    return { x: stateCamera.x - VIEW.width / 2 + lx, y: stateCamera.y - VIEW.height / 2 + ly };
  }
  let stateCamera = { x: 1100, y: 900 };

  function drawCar(car, state) {
    const night = isNight(state);
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.fillRect(-26 + 4, -13 + 5, 52, 26);
    // Body.
    context.fillStyle = car.color;
    context.fillRect(-26, -13, 52, 26);
    // Roof + windows.
    context.fillStyle = 'rgba(20,28,40,0.85)';
    context.fillRect(-8, -11, 18, 22);
    context.fillStyle = 'rgba(180,220,255,0.7)';
    context.fillRect(-6, -10, 6, 20);
    // Headlights + taillights.
    context.fillStyle = night ? '#ffe9a8' : '#fff2c0';
    context.fillRect(24, -11, 3, 6);
    context.fillRect(24, 5, 3, 6);
    context.fillStyle = '#ff3b30';
    context.fillRect(-27, -11, 3, 6);
    context.fillRect(-27, 5, 3, 6);
    if (car.kind === 'police') {
      const flash = Math.floor(state.elapsed * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      context.fillRect(-4, -13, 8, 5);
      context.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      context.fillRect(-4, 8, 8, 5);
    }
    context.restore();
    if (night) {
      // Headlight cone.
      context.save();
      context.translate(car.x, car.y);
      context.rotate(car.angle);
      const grad = context.createLinearGradient(26, 0, 190, 0);
      grad.addColorStop(0, 'rgba(255,233,168,0.28)');
      grad.addColorStop(1, 'rgba(255,233,168,0)');
      context.fillStyle = grad;
      context.beginPath();
      context.moveTo(26, -8);
      context.lineTo(190, -46);
      context.lineTo(190, 46);
      context.lineTo(26, 8);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawPerson(x, y, angle, shirt, skin, state) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.arc(2, 3, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = skin;
    context.beginPath();
    context.arc(4, 0, 6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawWorld(state) {
    const city = state.city;
    const cam = state.camera;
    stateCamera = cam;
    // Camera transform: the view window centres on the camera.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.translate(VIEW.width / 2 - cam.x, VIEW.height / 2 - cam.y);
    const vx0 = cam.x - VIEW.width / 2 - 60;
    const vy0 = cam.y - VIEW.height / 2 - 60;
    const vx1 = cam.x + VIEW.width / 2 + 60;
    const vy1 = cam.y + VIEW.height / 2 + 60;

    // Ground: grass everywhere, sand then water at the south and east edges.
    context.fillStyle = '#557d46';
    context.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    context.fillStyle = PALETTE.water;
    context.fillRect(2060, vy0, vx1 - 2060 > 0 ? vx1 - 2060 : 0, vy1 - vy0);
    context.fillRect(vx0, 2060, vx1 - vx0, vy1 - 2060 > 0 ? vy1 - 2060 : 0);
    context.fillStyle = PALETTE.sand;
    context.fillRect(1980, vy0, 80, vy1 - vy0);
    context.fillRect(vx0, 1980, vx1 - vx0, 80);
    // Parks and trees.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    for (const tree of city.trees) {
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.arc(tree.x + 3, tree.y + 4, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2f6b34';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4d8a4a';
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }
    // Sidewalks (a pale band) then roads, with dashed centre lines.
    const hw = WORLD.roadWidth / 2;
    context.fillStyle = PALETTE.sidewalk;
    for (const line of city.roads) {
      context.fillRect(line - hw - 10, 0, WORLD.roadWidth + 20, WORLD.size);
      context.fillRect(0, line - hw - 10, WORLD.size, WORLD.roadWidth + 20);
    }
    context.fillStyle = PALETTE.road;
    for (const line of city.roads) {
      context.fillRect(line - hw, 0, WORLD.roadWidth, WORLD.size);
      context.fillRect(0, line - hw, WORLD.size, WORLD.roadWidth);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const line of city.roads) {
      for (let s = 60; s < WORLD.size; s += 60) {
        context.fillRect(line - 2, s, 4, 26);
        context.fillRect(s, line - 2, 26, 4);
      }
    }
    // Buildings: shadow, roof, windows, and a taller downtown silhouette.
    for (const b of city.buildings) {
      if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(b.x + 8, b.y + 10, b.w, b.h);
      context.fillStyle = b.color;
      context.globalAlpha = b.shade;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(0,0,0,0.4)';
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,240,180,0.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if ((cx * 7 + cy * 3 + Math.floor(b.x)) % 3 !== 0) continue;
          context.fillRect(b.x + 8 + cx * 26, b.y + 8 + cy * 26, 10, 8);
        }
      }
      if (b.landmark) {
        text(b.landmark === 'bank' ? 'SOL BANK' : b.landmark === 'hideout' ? 'HIDEOUT' : 'DOCKS', b.x + b.w / 2, b.y + b.h / 2, 15, '#ffffff', 'center', 'middle');
      }
    }
    // Health packs.
    for (const pack of city.pickups) {
      if (pack.taken) continue;
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.12;
      context.save();
      context.translate(pack.x, pack.y);
      context.scale(pulse, pulse);
      context.fillStyle = '#ffffff';
      context.fillRect(-11, -11, 22, 22);
      context.fillStyle = '#e5534b';
      context.fillRect(-3, -9, 6, 18);
      context.fillRect(-9, -3, 18, 6);
      context.restore();
    }
    // Skid marks.
    context.strokeStyle = 'rgba(20,20,20,0.5)';
    context.lineWidth = 4;
    for (const skid of state.skids) {
      context.globalAlpha = Math.min(1, skid.life / 2);
      context.beginPath();
      context.moveTo(skid.x1, skid.y1);
      context.lineTo(skid.x2, skid.y2);
      context.stroke();
    }
    context.globalAlpha = 1;
    // Mission marker: a light pillar and a bouncing arrow.
    if (state.mission.target) {
      const t = state.mission.target;
      const bob = Math.sin(state.elapsed * 4) * 8;
      context.fillStyle = 'rgba(242,201,76,0.18)';
      context.fillRect(t.x - 26, t.y - 130, 52, 130);
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(t.x, t.y - 66 + bob);
      context.lineTo(t.x + 14, t.y - 88 + bob);
      context.lineTo(t.x - 14, t.y - 88 + bob);
      context.closePath();
      context.fill();
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(t.x, t.y, 26 + Math.sin(state.elapsed * 3) * 4, 0, Math.PI * 2);
      context.stroke();
    }
    // Cars, pedestrians, thugs, cops, player, bullets, particles.
    for (const car of state.cars) drawCar(car, state);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.color, state);
    for (const thug of state.thugs) {
      drawPerson(thug.x, thug.y, thug.angle, '#3a2a2a', '#c98d5f', state);
      context.fillStyle = '#e5534b';
      context.fillRect(thug.x - 12, thug.y - 22, 24 * (thug.hp / 60), 4);
    }
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#1d2f4d', '#e8b88a', state);
      context.fillStyle = '#3b82ff';
      context.fillRect(cop.x - 12, cop.y - 22, 24 * (cop.hp / 60), 4);
    }
    const p = state.player;
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.face, '#f2c94c', '#e8b88a', state);
      // Aim line while the pistol is out.
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(p.x + Math.cos(p.face) * 18, p.y + Math.sin(p.face) * 18);
      context.lineTo(p.x + Math.cos(p.face) * 44, p.y + Math.sin(p.face) * 44);
      context.stroke();
      if (p.hurtTimer > 0 && Math.floor(p.hurtTimer * 10) % 2 === 0) {
        context.fillStyle = 'rgba(255,60,60,0.35)';
        context.beginPath();
        context.arc(p.x, p.y, 16, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const part of state.particles) {
      context.globalAlpha = Math.max(0, part.life / part.maxLife);
      context.fillStyle = part.color;
      context.fillRect(part.x - part.size / 2, part.y - part.size / 2, part.size, part.size);
    }
    context.globalAlpha = 1;
    // Night falls over the city.
    if (isNight(state)) {
      context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
      context.translate(VIEW.width / 2 - cam.x, VIEW.height / 2 - cam.y);
      context.fillStyle = 'rgba(10,16,48,0.34)';
      context.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    }
  }

  function drawPanel(title, lines, prompt, selected) {
    const height = 150 + lines.length * PANEL.line + 70;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.fillStyle = 'rgba(10,14,22,0.82)';
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 72, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      const isSel = selected === index;
      text((isSel ? '▸ ' : '') + lines[index], VIEW.width / 2, y + 140 + index * PANEL.line, 21, isSel ? PALETTE.gold : PALETTE.muted, 'center');
    }
    if (prompt) text(prompt, VIEW.width / 2, y + height - 34, 20, PALETTE.gold, 'center');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, extra) {
    extra = extra || {};
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      const lines = [
        '1  New Game',
        '2  Continue' + (extra.hasSave ? '' : '  (no save yet)'),
        '3  Missions',
        '4  How to Play',
      ];
      drawPanel('PORTO SOL', lines, 'A sun-soaked open-world crime story — press 1 to start', extra.selected);
      text('WASD move  •  E steal car  •  F punch  •  Click shoot  •  P pause  •  M mute', VIEW.width / 2, VIEW.height - 24, 16, PALETTE.muted, 'center', 'alphabetic');
      return;
    }
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawHud(context, state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['P / Esc — resume', 'Q — save & quit to title', 'M — mute'], 'Porto Sol waits for no one. Well — right now it does.', -1);
    } else if (screen === SCREEN_OVER) {
      const title = state.overReason === 'busted' ? 'BUSTED' : 'WASTED';
      const lines = [`Money kept: $${state.player.money}`, `Missions done: ${state.stats.missionsDone} / 6`, `Cars stolen: ${state.stats.carsStolen}`];
      drawPanel(title, lines, 'Press Space or click to play again', -1);
    } else if (screen === SCREEN_MISSIONS) {
      drawPanel('Missions — Mara Voss', extra.missionLines || [], 'Press 3 or Esc to go back', -1);
    } else if (screen === SCREEN_HOWTO) {
      const lines = [
        'WASD / arrows — walk or drive',
        'E — steal a car / get out',
        'F — punch    Mouse + click — shoot',
        'P / Esc — pause    M — mute    Q — save',
        'Steal cars, dodge the law, finish Mara\'s six jobs.',
        'Stars rise when you break the law — lose the cops to cool off.',
      ];
      drawPanel('How to Play', lines, 'Press 4 or Esc to go back', -1);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, isNight };
}
