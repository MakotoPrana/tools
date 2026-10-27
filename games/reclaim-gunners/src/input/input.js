// 入力: キーボード・マウス・タッチ・スマホのボタン
import { VH, VW } from '../core/config.js';
import { doInteract } from '../game/interact.js';
import { dodge, manualReload, usePotion } from '../game/player.js';
import { useSpecial } from '../game/specials.js';
import { G } from '../game/stage.js';
import { canvas } from '../render/canvas.js';
import { localFrac } from '../render/screen.js';
import { screen, ui, uiBack } from '../ui/core.js';
import { showPause } from '../ui/pause.js';
import { showStageMap } from '../ui/stage-map.js';

export const keys = {};
export const mouse = { x: VW / 2, y: VH / 2, down: false, inside: false };
export const sticks = { move: null, aim: null };
export let touchMode = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

export function logical(e) {
  const f = localFrac(canvas, e);
  return { x: f.u * VW, y: f.v * VH };
}

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  const k = e.code;
  if (k === 'Escape') {
    e.preventDefault();
    if (ui.open) uiBack();
    else if (screen === 'play') showPause();
    return;
  }
  if (screen !== 'play' || ui.open) return;
  keys[k] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  touchMode = false;
  if (k === 'KeyR') manualReload();
  else if (k === 'Space' || k === 'ShiftLeft' || k === 'ShiftRight') dodge();
  else if (k === 'KeyE') doInteract();
  else if (k === 'KeyQ') useSpecial();
  else if (k === 'KeyF') usePotion();
  else if (k === 'KeyM') showStageMap('view');
  else if (k === 'KeyP') showPause();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouse.down = false;
  if (screen === 'play' && !ui.open && G && !G.dead) showPause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'play' && !ui.open && G && !G.dead) showPause();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (screen !== 'play' || ui.open) return;
  const p = logical(e);
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    touchMode = true;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (p.x < VW / 2) {
      if (!sticks.move) sticks.move = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    } else if (!sticks.aim) {
      sticks.aim = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
  } else {
    touchMode = false;
    mouse.x = p.x;
    mouse.y = p.y;
    if (e.button === 0) mouse.down = true;
    else if (e.button === 2) dodge();
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = logical(e);
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    for (const s of [sticks.move, sticks.aim]) {
      if (s && s.id === e.pointerId) {
        s.x = p.x;
        s.y = p.y;
      }
    }
  } else {
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.inside = true;
  }
});
export const endPointer = (e) => {
  if (sticks.move && sticks.move.id === e.pointerId) sticks.move = null;
  if (sticks.aim && sticks.aim.id === e.pointerId) sticks.aim = null;
  if (e.pointerType === 'mouse' && e.button === 0) mouse.down = false;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
window.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') mouse.down = false;
});

// スマホのボタン
export const touchEl = document.getElementById('touch');
export const bindBtn = (id, fn) => {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    touchMode = true;
    if (screen === 'play' && !ui.open) fn();
  });
};
bindBtn('t-dodge', () => dodge());
export const dodgeBtn = document.getElementById('t-dodge');
export const potionBtn = document.getElementById('t-potion');
bindBtn('t-reload', () => manualReload());
bindBtn('t-special', () => useSpecial());
export const specialBtn = document.getElementById('t-special');
bindBtn('t-potion', () => usePotion());
bindBtn('t-interact', () => doInteract());
for (const id of ['pause-btn', 'pause-in']) {
  document.getElementById(id).addEventListener('click', () => {
    if (screen === 'play' && !ui.open) showPause();
  });
}

export function moveInput() {
  let mx = 0;
  let my = 0;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (sticks.move) {
    const dx = sticks.move.x - sticks.move.ox;
    const dy = sticks.move.y - sticks.move.oy;
    const l = Math.hypot(dx, dy);
    if (l > 4) {
      const k = Math.min(1, l / 36);
      mx = (dx / l) * k;
      my = (dy / l) * k;
    }
  }
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  return { mx, my };
}
