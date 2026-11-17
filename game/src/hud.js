// The HUD and the minimap: health, cash, ammo, wanted stars, the mission objective, the
// clock, the speedometer, and a live map of Porto Sol in the corner. Drawn in screen space
// (1280x720 logical) on top of the world, so it stays readable when a screenshot shrinks.
import { FONT, MISSIONS, PALETTE, PLAYER, VIEW, WANTED } from './config.js';

const MAP_SIZE = 200;
const MAP_X = VIEW.width - MAP_SIZE - 16;
const MAP_Y = 16;

export function drawMinimap(ctx, state) {
  const scale = MAP_SIZE / 2200;
  const ox = MAP_X;
  const oy = MAP_Y;
  ctx.fillStyle = PALETTE.minimapWater;
  ctx.fillRect(ox, oy, MAP_SIZE, MAP_SIZE);
  ctx.fillStyle = '#3a5a3a';
  ctx.fillRect(ox, oy, MAP_SIZE - 13, MAP_SIZE - 13); // land; the sea is the last 13 px
  // Roads.
  ctx.fillStyle = PALETTE.minimapRoad;
  for (const line of state.city.roads) {
    ctx.fillRect(ox, oy + line * scale - 2, MAP_SIZE, 4);
    ctx.fillRect(ox + line * scale - 2, oy, 4, MAP_SIZE);
  }
  // Buildings.
  ctx.fillStyle = PALETTE.minimapBuilding;
  for (const b of state.city.buildings) {
    ctx.fillRect(ox + b.x * scale, oy + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  }
  // Mission marker: a pulsing yellow diamond.
  if (state.mission.target) {
    const t = state.mission.target;
    const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
    ctx.fillStyle = PALETTE.star;
    ctx.beginPath();
    ctx.moveTo(ox + t.x * scale, oy + t.y * scale - 6 - pulse);
    ctx.lineTo(ox + t.x * scale + 5 + pulse, oy + t.y * scale);
    ctx.lineTo(ox + t.x * scale, oy + t.y * scale + 6 + pulse);
    ctx.lineTo(ox + t.x * scale - 5 - pulse, oy + t.y * scale);
    ctx.closePath();
    ctx.fill();
  }
  // Thugs, police, then the player on top.
  ctx.fillStyle = '#ff8c42';
  for (const thug of state.thugs) ctx.fillRect(ox + thug.x * scale - 2, oy + thug.y * scale - 2, 4, 4);
  ctx.fillStyle = '#ff3b30';
  for (const car of state.cars) {
    if (car.kind === 'police') ctx.fillRect(ox + car.x * scale - 2, oy + car.y * scale - 2, 4, 4);
  }
  for (const cop of state.cops) ctx.fillRect(ox + cop.x * scale - 2, oy + cop.y * scale - 2, 4, 4);
  const p = state.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ox + p.x * scale, oy + p.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, MAP_SIZE, MAP_SIZE);
}

function text(ctx, value, x, y, size, color, align, baseline) {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'top';
  ctx.fillText(value, x, y);
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? PALETTE.star : 'rgba(255,255,255,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHud(ctx, state) {
  const p = state.player;
  // Health bar + cash + ammo, top left.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(14, 14, 224, 64);
  text(ctx, 'HEALTH', 22, 20, 13, PALETTE.muted);
  ctx.fillStyle = '#3a2020';
  ctx.fillRect(22, 38, 200, 14);
  ctx.fillStyle = p.hp > 50 ? PALETTE.green : p.hp > 25 ? PALETTE.gold : PALETTE.red;
  ctx.fillRect(22, 38, Math.max(0, 200 * (p.hp / PLAYER.maxHp)), 14);
  text(ctx, `${Math.max(0, Math.ceil(p.hp))}`, 228, 36, 14, PALETTE.text, 'right');
  text(ctx, `$${p.money}`, 22, 56, 18, PALETTE.gold);
  if (!p.inCar) text(ctx, `Ammo ${p.ammo}`, 150, 56, 16, PALETTE.text, 'left');
  // Wanted stars, top centre.
  const level = state.wanted.level;
  for (let i = 0; i < 5; i += 1) star(ctx, VIEW.width / 2 - 66 + i * 33, 34, 13, i < level);
  if (level > 0) text(ctx, 'WANTED', VIEW.width / 2, 52, 12, PALETTE.red, 'center');
  // Clock, under the minimap.
  const hours = Math.floor(state.time) % 24;
  const minutes = Math.floor((state.time % 1) * 60);
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const night = hours >= 19 || hours < 6;
  text(ctx, `${clock} ${night ? 'NIGHT' : 'DAY'}`, MAP_X + MAP_SIZE, MAP_Y + MAP_SIZE + 8, 15, night ? '#9db8ff' : PALETTE.text, 'right');
  // Speedometer, bottom right, while driving.
  if (p.inCar && p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.22);
    text(ctx, `${kmh}`, VIEW.width - 24, VIEW.height - 64, 34, PALETTE.text, 'right', 'alphabetic');
    text(ctx, 'km/h', VIEW.width - 24, VIEW.height - 30, 14, PALETTE.muted, 'right', 'alphabetic');
  }
  // Objective + message, bottom left. The line stays short so the timer never collides.
  if (state.mission.label) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(14, VIEW.height - 66, 560, 52);
    const headline = state.mission.index >= 1 && state.mission.index <= 6
      ? `JOB ${state.mission.index}/6 — ${MISSIONS[state.mission.index - 1].title}`
      : state.mission.label;
    text(ctx, headline, 24, VIEW.height - 58, 14, PALETTE.gold);
    if (state.mission.target) text(ctx, state.mission.target.label, 24, VIEW.height - 36, 15, PALETTE.text);
    if (state.mission.index === 2 && state.mission.timer > 0) {
      text(ctx, `${Math.ceil(state.mission.timer)}s`, 560, VIEW.height - 58, 16, state.mission.timer < 15 ? PALETTE.red : PALETTE.text, 'right');
    }
    if (state.mission.index === 6 && state.mission.stage === 1) {
      text(ctx, `Vault ${Math.ceil(state.mission.grabTimer)}s`, 560, VIEW.height - 58, 16, PALETTE.gold, 'right');
    }
  }
  if (state.messageTimer > 0 && state.message) {
    text(ctx, state.message, VIEW.width / 2, 92, 17, PALETTE.text, 'center');
  }
  drawMinimap(ctx, state);
}
