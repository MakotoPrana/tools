// 演出: 粒・文字・バナー
import { MAX_PARTS } from '../core/config.js';
import { clamp } from '../core/util.js';
import { G } from './stage.js';

export function addPart(p) {
  if (G.parts.length >= MAX_PARTS) G.parts.shift();
  p.max = p.life;
  G.parts.push(p);
}

export function addText(x, y, text, color, size = 9) {
  if (G.texts.length > 80) G.texts.shift();
  G.texts.push({ x, y, text, color, size, life: 0.8, max: 0.8 });
}

export function updateFx(dt) {
  for (const p of G.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.1, dt);
    p.vy *= Math.pow(0.1, dt);
  }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const t of G.texts) {
    t.life -= dt;
    t.y -= 22 * dt;
  }
  G.texts = G.texts.filter((t) => t.life > 0);
  for (const t of G.teles) t.t += dt;
  const done = G.teles.filter((t) => t.t >= t.dur);
  G.teles = G.teles.filter((t) => t.t < t.dur);
  for (const t of done) if (t.onDone) t.onDone(t);
  for (const m of G.matLog) m.t -= dt;
  G.matLog = G.matLog.filter((m) => m.t > 0);
  G.soulPopT = Math.max(0, G.soulPopT - dt);
  if (G.soulPopT <= 0) G.soulPop = 0;
  G.shake = Math.max(0, G.shake - dt * 20);
  if (G.banner) {
    G.banner.t -= dt;
    if (G.banner.t <= 0) G.banner = null;
  }
  for (const a of G.areas) {
    const target = a.free ? 0 : 1;
    a.fog += clamp(target - a.fog, -dt * 0.6, dt * 0.6);
  }
  G.fade = Math.max(0, G.fade - dt * 2.5);
}

export function showBanner(text, sub = '', warn = '', t = 2.6, color = '#ffffff') {
  G.banner = { text, sub, warn, t, max: t, color };
}
