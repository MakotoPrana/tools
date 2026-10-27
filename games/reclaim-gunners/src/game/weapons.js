// 武器を撃つ: 連射・リロード・チャージ・光線
import { gunSound } from '../audio/sound.js';
import { SHOT_BLOCK } from '../core/config.js';
import { clamp, dist, lerp, rnd } from '../core/util.js';
import { tileAt } from './collision.js';
import { damageTarget, forAllTargets } from './damage.js';
import { addPart } from './fx.js';
import { startReload } from './player.js';
import { G, P } from './stage.js';

// ang: 撃つ向き (null ならねらう相手がいないので撃たない)。tdist: 相手までの距離 (グレネードの着弾点)
export function updateWeapon(w, st, dt, ang, tdist, slot) {
  st.cd -= dt;
  st.beaming = false;
  const firing = ang != null;
  st.active = firing;
  const mag = w.mag;
  // 必殺技「連射」の間は、リロードも弾・魔力の消費もなし
  const rapid = P.rapid && P.rapid.id === w.id ? P.rapid.k : 0;
  if (rapid) {
    st.reloadT = 0;
    if (w.mag) st.ammo = Math.max(st.ammo, 1);
    if (w.spin) st.spin = 1;
  }
  if (st.reloadT > 0) {
    st.reloadT -= dt;
    if (st.reloadT <= 0) {
      st.reloadT = 0;
      st.ammo = mag;
    }
    return;
  }
  if (w.mag && st.ammo <= 0) {
    startReload(w, st);
    return;
  }
  if (w.spin) st.spin = firing ? Math.min(1, st.spin + dt / w.spin) : Math.max(0, st.spin - dt * 2);
  // 引き絞る武器は、ためきったら撃つ (相手がいなくなったら、ためた分で撃つ)
  if (w.charge) {
    if (firing && st.cd <= 0) {
      st.charge += dt;
      st.chargeAim = ang;
    }
    const full = st.charge >= w.chargeT;
    if (st.charge > 0 && (full || !firing)) {
      const k = Math.min(1, st.charge / w.chargeT);
      st.charge = 0;
      if (st.cd <= 0 && st.ammo > 0 && k > 0.15) {
        fire(w, 1 + (w.charge - 1) * k, firing ? ang : st.chargeAim, tdist, slot);
        st.ammo--;
        st.cd = 1 / w.rate;
      }
    }
    return;
  }
  if (w.kind === 'beam') {
    if (firing && st.mana > 0) {
      st.beaming = true;
      st.mana = Math.max(0, st.mana - w.mana[1] * dt);
      fireBeam(w, st, dt, ang);
    }
    return;
  }
  if (!firing || st.cd > 0) return;
  let rate = w.rate;
  if (w.spin) rate = lerp(w.rateMin, w.rate, st.spin);
  if (w.twin && 3 - P.twinBoost < w.twinT) rate *= w.twinBoost;
  if (rapid) rate *= rapid;
  else if (w.mana) {
    if (st.mana < w.mana[1]) return;
    st.mana -= w.mana[1];
  } else {
    st.ammo--;
  }
  st.cd = 1 / rate;
  fire(w, 1, ang, tdist, slot);
}

export function fire(w, mult, a, tdist, slot = 0) {
  const dmg = w.dmg * mult;
  // 2 丁目からは、少し横から撃つ (左右の手)
  const side = slot % 2 ? -1 : 1;
  let ox = P.x + Math.cos(a) * 12 + Math.cos(a + Math.PI / 2) * 3 * side * (slot ? 1 : 0.5);
  let oy = P.y + Math.sin(a) * 12 + Math.sin(a + Math.PI / 2) * 3 * side * (slot ? 1 : 0.5);
  if (w.twin) {
    P.twinSide *= -1;
    ox += Math.cos(a + Math.PI / 2) * 4 * P.twinSide;
    oy += Math.sin(a + Math.PI / 2) * 4 * P.twinSide;
  }
  if (w.cat === 'heavy') {
    P.heavyT = 0.25;
    P.heavyPen = w.movePen;
  }
  gunSound(w, w.twin ? P.twinSide : 0);
  addPart({ x: ox, y: oy, vx: 0, vy: 0, life: 0.06, color: '#fff3b0', size: 5, glow: true });
  if (w.kind === 'grenade') {
    const d = clamp(tdist, 40, w.range);
    G.bullets.push({ type: 'grenade', w, sx: ox, sy: oy, tx: P.x + Math.cos(a) * d, ty: P.y + Math.sin(a) * d, t: 0, dur: d / w.speed, x: ox, y: oy, dmg, elem: w.elem });
    return;
  }
  let elem = w.elem;
  if (elem === 'cycle') {
    P.cycle = ((P.cycle || 0) + 1) % 3;
    elem = ['fire', 'ice', 'thunder'][P.cycle];
  }
  const n = w.pellets || 1;
  for (let i = 0; i < n; i++) {
    let ang = a;
    if (n > 1) ang += (i / (n - 1) - 0.5) * w.spread + rnd(-0.05, 0.05);
    else ang += rnd(-w.spread, w.spread);
    const sp = w.speed * (n > 1 ? rnd(0.9, 1.1) : 1);
    G.bullets.push({
      type: w.kind, w, x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, travel: 0,
      range: w.range * (n > 1 ? rnd(0.85, 1.05) : 1), dmg, elem, pierce: w.pierce || 0, hit: new Set(),
      r: w.kind === 'flame' ? 4 : w.kind === 'magic' ? 4 : 2.5, homing: w.kind === 'rocket' || w.homing, life: 0,
    });
  }
}

export function fireBeam(w, st, dt, a) {
  const sx = P.x + Math.cos(a) * 12;
  const sy = P.y + Math.sin(a) * 12;
  let len = w.range;
  for (let d = 0; d < w.range; d += 6) {
    if (SHOT_BLOCK[tileAt(sx + Math.cos(a) * d, sy + Math.sin(a) * d)]) {
      len = d;
      break;
    }
  }
  const ex = sx + Math.cos(a) * len;
  const ey = sy + Math.sin(a) * len;
  G.beam = { sx, sy, ex, ey };
  st.beamT = (st.beamT || 0) - dt;
  if (st.beamT > 0) return;
  st.beamT = 1 / w.rate;
  gunSound(w);
  const dmg = w.dmg;
  forAllTargets((t) => {
    const d = segDist(t.x, t.y, sx, sy, ex, ey);
    if (d < t.r + 5) damageTarget(t, dmg, { elem: w.elem, w, dirx: Math.cos(a), diry: Math.sin(a), sx: P.x, sy: P.y });
  });
}

export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}
