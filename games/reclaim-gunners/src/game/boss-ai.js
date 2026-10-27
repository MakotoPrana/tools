// ボスごとの動き (ブロブキング・ゴーレム・骨竜・ローレライ・ゲロイア)
import { sfx } from '../audio/sound.js';
import { MOVE_BLOCK, TAU, TILE } from '../core/config.js';
import { angNorm, clamp, dist, lerp, rnd } from '../core/util.js';
import { bossPart, setTimeLater } from './bosses.js';
import { addPoison, enemyShot, ring } from './bullets.js';
import { spawnEnemy } from './enemies.js';
import { addPart } from './fx.js';
import { hurtPlayer } from './player.js';
import { G, P } from './stage.js';
import { segDist } from './weapons.js';

// G1 ブロブキング: 跳ねて押しつぶし、着地で粘液弾。倒すと 2 体に分かれる (大 → 中 2 → 小 4)
export function updateBlob(b, dt) {
  for (const p of b.parts) {
    p.t -= dt;
    if (p.mode === 'rest') {
      p.h = 0;
      p.sq = Math.sin(b.t * 8) * 0.06;
      if (p.t <= 0) {
        p.mode = 'jump';
        p.sx = p.x;
        p.sy = p.y;
        const lead = rnd(0, 30);
        p.tx = P.x + rnd(-lead, lead);
        p.ty = P.y + rnd(-lead, lead);
        p.dur = [0.55, 0.7, 0.95][p.size];
        p.jt = 0;
        G.teles.push({ type: 'circle', x: p.tx, y: p.ty, r: p.r + 10, t: 0, dur: p.dur });
      }
    } else {
      p.jt += dt;
      const k = Math.min(1, p.jt / p.dur);
      p.x = lerp(p.sx, p.tx, k);
      p.y = lerp(p.sy, p.ty, k);
      p.h = Math.sin(k * Math.PI) * (30 + p.size * 15);
      if (k >= 1) {
        p.mode = 'rest';
        p.h = 0;
        p.t = (b.phase2 ? rnd(0.4, 0.8) : rnd(0.8, 1.4)) * (1 + p.size * 0.2);
        ring(p.x, p.y, [5, 8, 12][p.size], 110, b.atk * 0.8, b.lv, Math.random(), '#7dff7a');
        if (dist(p.x, p.y, P.x, P.y) < p.r + 10 + P.r) hurtPlayer(b.atk * 1.3, b.lv);
        G.shake = Math.max(G.shake, 2 + p.size * 2);
        for (let i = 0; i < 10; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y + p.r * 0.6, vx: rnd(-60, 60), vy: rnd(-40, 0), life: 0.4, color: '#7ad06a', size: 3 });
      }
    }
  }
}

// G2 鉄喰いゴーレム: 正面は硬い。近くでは叩きつけ、遠くでは岩を投げる
export function updateGolem(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  const toP = Math.atan2(P.y - p.y, P.x - p.x);
  const dp = dist(p.x, p.y, P.x, P.y);
  p.t -= dt;
  if (p.mode === 'walk') {
    const turn = (b.phase2 ? 1.6 : 1.2) * dt;
    p.facing += clamp(angNorm(toP - p.facing), -turn, turn);
    if (dp > 60) {
      p.x += Math.cos(p.facing) * 28 * dt;
      p.y += Math.sin(p.facing) * 28 * dt;
    }
    p.ph = (p.ph || 0) + dt * 4;
    if (p.t <= 0) {
      if (dp < 100) {
        p.mode = 'slam';
        p.t = 0.8;
        p.slamX = p.x + Math.cos(p.facing) * 40;
        p.slamY = p.y + Math.sin(p.facing) * 40;
        G.teles.push({ type: 'circle', x: p.slamX, y: p.slamY, r: 70, t: 0, dur: 0.8 });
      } else {
        p.mode = 'throw';
        p.t = 0.5;
        const n = b.phase2 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const tx = P.x + (i ? P.vx || 0 : 0) + rnd(-20, 20) * i;
          const ty = P.y + rnd(-20, 20) * i;
          G.teles.push({ type: 'circle', x: tx, y: ty, r: 34, t: 0, dur: 1.0 + i * 0.25, rock: { sx: p.x, sy: p.y - 20 }, onDone: (tl) => {
            if (dist(tl.x, tl.y, P.x, P.y) < 34 + P.r) hurtPlayer(b.atk * 1.2, b.lv);
            for (let k = 0; k < 14; k++) addPart({ x: tl.x, y: tl.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: 0.4, color: '#8a8070', size: 3 });
            G.shake = Math.max(G.shake, 3);
            sfx('explode');
          } });
        }
      }
    }
  } else if (p.mode === 'slam') {
    if (p.t <= 0) {
      if (dist(p.slamX, p.slamY, P.x, P.y) < 70 + P.r) hurtPlayer(b.atk * 1.6, b.lv);
      ring(p.slamX, p.slamY, b.phase2 ? 16 : 12, 120, b.atk * 0.7, b.lv, Math.random(), '#d0c0a0');
      G.shake = 8;
      sfx('explode');
      p.mode = 'stuck';
      p.t = 1.3; // 叩きつけたあとは動けない (背中をねらうチャンス)
    }
  } else if (p.mode === 'throw') {
    if (p.t <= 0) {
      p.mode = 'walk';
      p.t = b.phase2 ? 1.6 : 2.4;
    }
  } else if (p.mode === 'stuck') {
    if (p.t <= 0) {
      p.mode = 'walk';
      p.t = b.phase2 ? 1.4 : 2;
    }
  }
}

// N1 骨竜: 骨のブレス・全方位の骨・スケルトン射手を呼ぶ
export function updateDragon(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  const toP = Math.atan2(P.y - p.y, P.x - p.x);
  p.t -= dt;
  p.x += Math.cos(toP) * 14 * dt;
  p.y += Math.sin(toP) * 14 * dt;
  p.face = toP;
  if (p.mode === 'breath') {
    p.bt -= dt;
    p.bf -= dt;
    if (p.bf <= 0 && p.bt > 0) {
      p.bf = 0.04;
      enemyShot(p.x + Math.cos(p.ba) * 20, p.y + Math.sin(p.ba) * 20, p.ba + rnd(-0.06, 0.06), 320, b.atk * 0.6, b.lv, '#e8e0c8', 4, 1.2);
    }
    if (p.bt <= 0) {
      p.mode = 'idle';
      p.t = b.phase2 ? 0.8 : 1.4;
    }
    return;
  }
  if (p.t > 0) return;
  if (p.mode === 'windup') {
    // ためが終わったら、ねらった向きへブレスを吐く
    p.mode = 'breath';
    p.bt = 0.7;
    p.bf = 0;
    return;
  }
  b.step++;
  const act = b.step % 4;
  if (act === 1 || act === 3) {
    p.ba = toP;
    G.teles.push({ type: 'line', x: p.x, y: p.y, a: toP, len: 340, w: 28, t: 0, dur: 0.9 });
    p.mode = 'windup';
    p.t = 0.9;
  } else if (act === 2) {
    ring(p.x, p.y, 16, 120, b.atk * 0.7, b.lv, b.t, '#e8e0c8');
    if (b.phase2) setTimeLater(0.35, () => b.state === 'fight' && !p.dead && ring(p.x, p.y, 16, 140, b.atk * 0.7, b.lv, b.t + 0.2, '#e8e0c8'));
    p.t = b.phase2 ? 1 : 1.6;
  } else {
    const n = G.enemies.filter((e) => e.lair === b).length;
    for (let i = 0; i < 2 && n + i < 4; i++) {
      const a = rnd(0, TAU);
      const e = spawnEnemy('skel', b.cx + Math.cos(a) * b.R * 0.75, b.cy + Math.sin(a) * b.R * 0.75, G.areas[G.map.areaOf[Math.floor(b.cy / TILE) * G.map.w + Math.floor(b.cx / TILE)]], null, { lv: b.lv - 5, chase: true, lair: b });
      if (e) for (let k = 0; k < 8; k++) addPart({ x: e.x, y: e.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.5, color: '#e8e0c8', size: 2.5 });
    }
    p.t = 1.2;
  }
}

// ボスがエリアの中で動ける場所 (決闘場のまわり) を、でたらめに選ぶ
export function bossSpot(b, rmin, rmax) {
  for (let k = 0; k < 30; k++) {
    const a = rnd(0, TAU);
    const d = rnd(rmin, rmax);
    const x = b.cx + Math.cos(a) * d;
    const y = b.cy + Math.sin(a) * d;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx <= 0 || ty <= 0 || tx >= G.map.w - 1 || ty >= G.map.h - 1) continue;
    const i = ty * G.map.w + tx;
    if (G.map.areaOf[i] !== b.area || MOVE_BLOCK[G.tiles[i]]) continue;
    if (dist(x, y, P.x, P.y) < 90) continue;
    return { x, y };
  }
  return { x: b.cx, y: b.cy };
}

// G3 霧の女王 ローレライ: 霧で姿を消し、分身の中に本物が 1 体。歌 (全方位の弾) と氷の槍 (当たると遅くなる)
export function updateSiren(b, dt) {
  const real = b.parts.find((p) => !p.clone);
  if (!real) return;
  b.mt = (b.mt == null ? 1 : b.mt) - dt;
  const show = b.phase2 ? 3 : 4;
  if (b.mode === 'show') {
    b.atkT = (b.atkT == null ? 0.6 : b.atkT) - dt;
    if (b.atkT <= 0) {
      b.atkT = b.phase2 ? 1.1 : 1.5;
      b.song = (b.song || 0) + 1;
      for (const p of b.parts) {
        if (p.dead) continue;
        if (b.song % 2) ring(p.x, p.y, p.clone ? 7 : 10, 95, b.atk * 0.7, b.lv, b.t + (p.clone ? 0.3 : 0), '#bfe8ff');
        else if (!p.clone) {
          const toP = Math.atan2(P.y - p.y, P.x - p.x);
          for (let i = 0; i < 5; i++) enemyShot(p.x, p.y, toP + (i - 2) * 0.16, 230, b.atk * 0.9, b.lv, '#8fd8ff', 4, 2.5, true);
        }
      }
    }
    if (b.mt <= 0) {
      b.mode = 'vanish';
      b.mt = 0.6;
    }
  } else if (b.mode === 'vanish') {
    for (const p of b.parts) p.fade = clamp(b.mt / 0.6, 0, 1);
    if (b.mt <= 0) {
      // 姿を消している間に、本物と分身の場所を入れかえる
      const n = b.phase2 ? 4 : 3;
      b.parts = b.parts.filter((p) => !p.clone);
      const sp = bossSpot(b, 30, b.R * 1.4);
      real.x = sp.x;
      real.y = sp.y;
      for (let i = 0; i < n; i++) {
        const c = bossSpot(b, 30, b.R * 1.4);
        b.parts.push(bossPart(b, c.x, c.y, real.r, 1, { clone: true, fade: 0, hidden: true }));
      }
      for (const p of b.parts) p.hidden = true;
      b.mode = 'appear';
      b.mt = 0.5;
    }
  } else if (b.mode === 'appear') {
    for (const p of b.parts) p.fade = clamp(1 - b.mt / 0.5, 0, 1);
    if (b.mt <= 0) {
      for (const p of b.parts) {
        p.hidden = false;
        p.fade = 1;
      }
      b.mode = 'show';
      b.mt = show;
    }
  } else {
    b.mode = 'show';
    b.mt = show;
  }
  for (const p of b.parts) p.bob = Math.sin(G.t * 2 + p.x) * 3;
}

// N2 大蝦蟇 ゲロイア: 長い舌で引き寄せ、水に潜ってから飛び出して押しつぶす。毒の泡を吐く
export function updateToad(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  const toP = Math.atan2(P.y - p.y, P.x - p.x);
  p.t -= dt;
  if (p.mode === 'idle') {
    p.face = toP;
    p.x += Math.cos(toP) * 22 * dt;
    p.y += Math.sin(toP) * 22 * dt;
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    const act = b.step % 3;
    if (act === 1) {
      p.mode = 'tongueWind';
      p.t = 0.7;
      p.ta = toP;
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: toP, len: 230, w: 20, t: 0, dur: 0.7 });
    } else if (act === 2) {
      p.mode = 'dive';
      p.t = b.phase2 ? 1 : 1.4;
      p.hidden = true;
      for (let i = 0; i < 12; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y, vx: rnd(-60, 60), vy: rnd(-80, -20), life: 0.5, color: '#7ab8d8', size: 3 });
    } else {
      p.mode = 'spit';
      p.t = 0.6;
      const n = b.phase2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const tx = P.x + rnd(-50, 50);
        const ty = P.y + rnd(-50, 50);
        G.teles.push({ type: 'circle', x: tx, y: ty, r: 22, t: 0, dur: 0.9 + i * 0.12, rock: { sx: p.x, sy: p.y - 16 }, onDone: () => addPoison(tx, ty, 22, b.atk * 0.8, b.lv, 5) });
      }
    }
  } else if (p.mode === 'tongueWind') {
    if (p.t <= 0) {
      p.mode = 'tongue';
      p.t = 0.35;
      p.tl = 0;
    }
  } else if (p.mode === 'tongue') {
    p.tl = Math.min(230, (p.tl || 0) + 900 * dt);
    const ex = p.x + Math.cos(p.ta) * p.tl;
    const ey = p.y + Math.sin(p.ta) * p.tl;
    if (!P.pull && P.inv <= 0 && segDist(P.x, P.y, p.x, p.y, ex, ey) < 12 + P.r) {
      hurtPlayer(b.atk, b.lv);
      P.pull = { x: p.x, y: p.y, t: 0.45 };
    }
    if (p.t <= 0) {
      p.mode = 'idle';
      p.t = b.phase2 ? 1 : 1.6;
      p.tl = 0;
    }
  } else if (p.mode === 'dive') {
    // 水の中を主人公の下へ泳いでくる (影だけ見える)
    p.x += Math.cos(toP) * 160 * dt;
    p.y += Math.sin(toP) * 160 * dt;
    if (p.t <= 0) {
      p.mode = 'emerge';
      p.t = 0.75;
      p.ex = P.x;
      p.ey = P.y;
      G.teles.push({ type: 'circle', x: P.x, y: P.y, r: 60, t: 0, dur: 0.75 });
    }
  } else if (p.mode === 'emerge') {
    if (p.t <= 0) {
      p.x = p.ex;
      p.y = p.ey;
      p.hidden = false;
      if (dist(p.x, p.y, P.x, P.y) < 60 + P.r) hurtPlayer(b.atk * 1.5, b.lv);
      ring(p.x, p.y, b.phase2 ? 18 : 14, 110, b.atk * 0.7, b.lv, Math.random(), '#7ab8d8');
      G.shake = 8;
      sfx('explode');
      for (let i = 0; i < 20; i++) addPart({ x: p.x + rnd(-p.r, p.r), y: p.y + rnd(-10, 10), vx: rnd(-90, 90), vy: rnd(-90, 0), life: 0.6, color: '#9ad0f0', size: 3 });
      p.mode = 'idle';
      p.t = b.phase2 ? 1 : 1.8;
    }
  } else if (p.mode === 'spit') {
    if (p.t <= 0) {
      p.mode = 'idle';
      p.t = b.phase2 ? 1 : 1.5;
    }
  }
}
