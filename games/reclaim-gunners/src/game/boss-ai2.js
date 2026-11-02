// ステージ3〜6 のボスの動き
//   G4 オルトロス・G5 ヴァルカン・G6 ユグドラ・G7 バルログ・N3 キングワーム・N4 モルガナ・N5 フェニクス・N6 アザゼル・K 魔王ベリアル
//   どのボスも「ため (赤い予兆) → 攻撃 → すき」をくり返す。予兆は G.teles (circle / line) で見せる
import { sfx } from '../audio/sound.js';
import { TAU, TILE } from '../core/config.js';
import { angNorm, clamp, dist, pick, rnd } from '../core/util.js';
import { bossSpot } from './boss-ai.js';
import { bossPart, setTimeLater } from './bosses.js';
import { addPoison, enemyShot, ring } from './bullets.js';
import { spawnEnemy } from './enemies.js';
import { addPart, addText } from './fx.js';
import { hurtPlayer } from './player.js';
import { G, P } from './stage.js';
import { segDist } from './weapons.js';
import { tr } from '../core/config.js';
import { toast } from '../ui/toast.js';

const toP = (p) => Math.atan2(P.y - p.y, P.x - p.x);
const alive = (b, p) => b.state === 'fight' && p && !p.dead;

// 扇の弾
function fan(b, x, y, a, n, spread, speed, mul, color, slow = false, r = 4) {
  for (let i = 0; i < n; i++) enemyShot(x, y, a + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), speed, b.atk * mul, b.lv, color, r, 3, slow);
}

// 地面に円の予兆を出し、時間が来たら当たる (after: 当たったあとに何かする)
function blast(b, x, y, r, dur, mul, color, after, rock) {
  G.teles.push({ type: 'circle', x, y, r, t: 0, dur, rock, onDone: () => {
    if (b.state !== 'fight') return;
    if (!G.dead && dist(x, y, P.x, P.y) < r + P.r) hurtPlayer(b.atk * mul, b.lv);
    for (let i = 0; i < 12; i++) addPart({ x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.6, vx: rnd(-70, 70), vy: rnd(-70, 20), life: 0.45, color, size: rnd(2, 4) });
    G.shake = Math.max(G.shake, 2);
    if (after) after(x, y);
  } });
}

// 直線の予兆を出し、時間が来たら線の上に当たる
function slash(b, x, y, a, len, w, dur, mul, color) {
  G.teles.push({ type: 'line', x, y, a, len, w, t: 0, dur, onDone: () => {
    if (b.state !== 'fight') return;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    if (!G.dead && segDist(P.x, P.y, x, y, ex, ey) < w / 2 + P.r) hurtPlayer(b.atk * mul, b.lv);
    for (let i = 0; i < 10; i++) {
      const k = Math.random();
      addPart({ x: x + (ex - x) * k, y: y + (ey - y) * k, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.35, color, size: 2.5 });
    }
  } });
}

// 決闘場のボスの手下を呼ぶ (多くなりすぎない)
function summon(b, id, n, max, x, y) {
  const have = G.enemies.filter((e) => e.lair === b && !e.dead).length;
  for (let i = 0; i < n && have + i < max; i++) {
    const a = rnd(0, TAU);
    const e = spawnEnemy(id, x + Math.cos(a) * 30, y + Math.sin(a) * 30, G.areas[b.area], null, { lv: b.lv - 4, chase: true, lair: b });
    if (e) for (let k = 0; k < 8; k++) addPart({ x: e.x, y: e.y, vx: rnd(-40, 40), vy: rnd(-40, 40), life: 0.5, color: '#c05aff', size: 2.5 });
  }
}

function walk(p, a, sp, dt) {
  p.x += Math.cos(a) * sp * dt;
  p.y += Math.sin(a) * sp * dt;
}

// ---------- 最初の形 (resetBoss から呼ぶ) ----------
export function resetBoss2(b) {
  const T = b.total;
  b.mode = null;
  b.atkT = 1.2;
  if (b.id === 'G4') {
    b.bx = b.cx;
    b.by = b.cy;
    b.face = Math.PI / 2;
    b.parts = [
      bossPart(b, b.cx - 14, b.cy, 16, T / 2, { head: 'fire' }),
      bossPart(b, b.cx + 14, b.cy, 16, T / 2, { head: 'ice' }),
    ];
  } else if (b.id === 'G5') b.parts = [bossPart(b, b.cx, b.cy, 28, T, { mode: 'walk', t: 1.5 })];
  else if (b.id === 'G6') {
    b.parts = [bossPart(b, b.cx, b.cy, 30, T * 0.6, { core: true, armored: true })];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      b.parts.push(bossPart(b, b.cx + Math.cos(a) * 46, b.cy + Math.sin(a) * 40, 10, T * 0.1, { eye: true, t: 1 + i * 0.4 }));
    }
  } else if (b.id === 'G7') b.parts = [bossPart(b, b.cx, b.cy, 26, T, { mode: 'walk', t: 1.5, h: 0 })];
  else if (b.id === 'N3') {
    b.trail = [];
    b.parts = [];
    for (let i = 0; i < 8; i++) b.parts.push(bossPart(b, b.cx, b.cy + i * 14, i ? 13 : 16, T / 8, { seg: i }));
    b.mode = 'crawl';
    b.mt = 5;
  } else if (b.id === 'N4') b.parts = [bossPart(b, b.cx, b.cy, 16, T, { fade: 1 })];
  else if (b.id === 'N5') {
    b.eggUsed = false;
    b.orb = 0;
    b.parts = [bossPart(b, b.cx, b.cy - b.R * 0.6, 24, T, { mode: 'fly' })];
  } else if (b.id === 'N6') {
    b.lastDodge = null;
    b.parts = [bossPart(b, b.cx, b.cy, 15, T, { mode: 'move', t: 1 })];
  } else if (b.id === 'K') {
    b.form = 1;
    b.parts = [bossPart(b, b.cx, b.cy - b.R * 0.45, 26, T, { mode: 'throne', t: 1.5 })];
  }
}

export function updateBoss2(b, dt) {
  const f = { G4: orthros, G5: vulcan, G6: yggdra, G7: balrog, N3: kingWorm, N4: morgana, N5: phoenix, N6: azazel, K: belial }[b.id];
  if (f) f(b, dt);
}

// G4 双頭の番犬 オルトロス: 2 つの頭が炎と氷を交互に吐く。片方を倒すと残りが狂暴になる
function orthros(b, dt) {
  const heads = b.parts;
  if (!heads.length) return;
  const mad = heads.length === 1 || b.phase2;
  const dp = dist(b.bx, b.by, P.x, P.y);
  const want = Math.atan2(P.y - b.by, P.x - b.bx);
  if (b.mode === 'dash') {
    b.mt -= dt;
    b.bx += Math.cos(b.dashA) * 400 * dt;
    b.by += Math.sin(b.dashA) * 400 * dt;
    if (b.mt <= 0) b.mode = null;
  } else if (b.mode !== 'wind') {
    b.face += clamp(angNorm(want - b.face), -2 * dt, 2 * dt);
    if (dp > 80) {
      b.bx += Math.cos(b.face) * (mad ? 62 : 40) * dt;
      b.by += Math.sin(b.face) * (mad ? 62 : 40) * dt;
    }
  } else {
    b.mt -= dt;
    if (b.mt <= 0) {
      b.mode = 'dash';
      b.mt = 0.45;
      G.shake = 3;
    }
  }
  // 頭は体の前に左右に並ぶ (1 つになったらまん中)
  const px = Math.cos(b.face + Math.PI / 2);
  const py = Math.sin(b.face + Math.PI / 2);
  heads.forEach((h) => {
    const s = heads.length === 1 ? 0 : h.head === 'fire' ? -1 : 1;
    h.x = b.bx + Math.cos(b.face) * 12 + px * s * 15;
    h.y = b.by + Math.sin(b.face) * 12 + py * s * 15;
  });
  b.atkT -= dt;
  if (b.atkT > 0 || b.mode) return;
  b.step = (b.step || 0) + 1;
  b.atkT = mad ? 0.9 : 1.5;
  if (mad && b.step % 3 === 0) {
    b.mode = 'wind';
    b.mt = 0.7;
    b.dashA = want;
    G.teles.push({ type: 'line', x: b.bx, y: b.by, a: want, len: 180, w: 40, t: 0, dur: 0.7 });
    return;
  }
  const h = heads[b.step % heads.length];
  const a = toP(h);
  if (h.head === 'fire') fan(b, h.x, h.y, a, mad ? 9 : 7, 0.9, 170, 0.7, '#ff8a3c');
  else fan(b, h.x, h.y, a, mad ? 7 : 5, 0.6, 220, 0.7, '#8fd8ff', true);
  sfx('swing');
}

// G5 炉心竜 ヴァルカン: 床を溶岩に変える・突進・火球の雨
function vulcan(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  p.t -= dt;
  p.face = p.mode === 'dash' ? p.dashA : toP(p);
  if (p.mode === 'walk') {
    if (dist(p.x, p.y, P.x, P.y) > 70) walk(p, toP(p), 30, dt);
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    const act = b.step % 3;
    if (act === 1) {
      const n = b.phase2 ? 5 : 3;
      for (let i = 0; i < n; i++) blast(b, P.x + rnd(-60, 60), P.y + rnd(-60, 60), 30, 1.1, 0.8, '#ff7a2c', (x, y) => addPoison(x, y, 30, b.atk * 0.9, b.lv, 6, 'lava'));
      p.t = b.phase2 ? 1.4 : 2;
    } else if (act === 2) {
      p.mode = 'wind';
      p.t = 0.8;
      p.dashA = toP(p);
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: p.dashA, len: 300, w: 56, t: 0, dur: 0.8 });
    } else {
      const n = b.phase2 ? 9 : 6;
      for (let i = 0; i < n; i++) blast(b, P.x + rnd(-80, 80), P.y + rnd(-80, 80), 24, 0.9 + i * 0.1, 1.1, '#ffb84a', b.phase2 ? (x, y) => ring(x, y, 6, 110, b.atk * 0.5, b.lv, Math.random(), '#ff8a3c') : null, { sx: p.x, sy: p.y - 20 });
      p.t = b.phase2 ? 1.6 : 2.2;
    }
  } else if (p.mode === 'wind') {
    if (p.t <= 0) {
      p.mode = 'dash';
      p.t = 0.6;
    }
  } else if (p.mode === 'dash') {
    walk(p, p.dashA, 430, dt);
    if (Math.random() < 0.6) addPart({ x: p.x, y: p.y, vx: rnd(-30, 30), vy: rnd(-30, 30), life: 0.4, color: '#ff8a3c', size: 3 });
    if (p.t <= 0) {
      p.mode = 'walk';
      p.t = 1.2;
    }
  }
}

// G6 千年樹の魔 ユグドラ: 動かない。根を突き出し、毒の実を落とす。枝の 4 つの目を潰すと本体が開く
function yggdra(b, dt) {
  const core = b.parts.find((p) => p.core);
  const eyes = b.parts.filter((p) => p.eye);
  if (core) core.armored = eyes.length > 0;
  for (const e of eyes) {
    e.t -= dt;
    if (e.t <= 0) {
      e.t = b.phase2 ? 1.3 : 1.9;
      fan(b, e.x, e.y, toP(e), 1, 0, 200, 0.6, '#d8ff5a');
    }
  }
  b.atkT -= dt;
  if (b.atkT > 0) return;
  b.step = (b.step || 0) + 1;
  b.atkT = b.phase2 ? 1.6 : 2.4;
  if (b.step % 2) {
    const n = b.phase2 ? 4 : 3;
    for (let i = 0; i < n; i++) blast(b, P.x + (i ? rnd(-55, 55) : 0), P.y + (i ? rnd(-55, 55) : 0), 22, 0.9, 1.3, '#8a6a3a');
  } else {
    for (let i = 0; i < 3; i++) blast(b, P.x + rnd(-70, 70), P.y + rnd(-70, 70), 26, 1.1, 0.6, '#b8ff5a', (x, y) => addPoison(x, y, 26, b.atk * 0.7, b.lv, 5), core ? { sx: core.x, sy: core.y - 30 } : null);
  }
  if (core && !core.armored) ring(core.x, core.y, b.phase2 ? 16 : 12, 110, b.atk * 0.6, b.lv, b.t, '#b8ff5a');
}

// G7 炎獄将 バルログ: 炎の鞭でなぎ払う・飛び上がって着地で炎の輪・デーモンナイトを呼ぶ
function balrog(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  p.t -= dt;
  if (p.mode === 'walk') {
    p.face = toP(p);
    if (dist(p.x, p.y, P.x, P.y) > 60) walk(p, p.face, b.phase2 ? 52 : 40, dt);
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    const act = b.step % 3;
    if (act === 1) {
      const a = toP(p);
      for (const o of b.phase2 ? [-0.7, -0.35, 0, 0.35, 0.7] : [-0.5, 0, 0.5]) slash(b, p.x, p.y, a + o, 170, 24, 0.75, 1.3, '#ff7a2c');
      p.t = 1.6;
    } else if (act === 2) {
      p.mode = 'fly';
      p.t = 1.2;
      p.tx = P.x;
      p.ty = P.y;
      G.teles.push({ type: 'circle', x: p.tx, y: p.ty, r: 60, t: 0, dur: 1.2 });
    } else {
      summon(b, 'dknight', 2, 3, p.x, p.y);
      p.t = 1.2;
    }
  } else if (p.mode === 'fly') {
    // 飛び上がっている間は当たらない
    p.h = Math.min(60, (p.h || 0) + 160 * dt);
    p.x += (p.tx - p.x) * Math.min(1, dt * 3);
    p.y += (p.ty - p.y) * Math.min(1, dt * 3);
    if (p.t <= 0) {
      p.h = 0;
      p.x = p.tx;
      p.y = p.ty;
      if (!G.dead && dist(p.x, p.y, P.x, P.y) < 60 + P.r) hurtPlayer(b.atk * 1.5, b.lv);
      ring(p.x, p.y, b.phase2 ? 20 : 14, 120, b.atk * 0.7, b.lv, Math.random(), '#ff7a2c');
      G.shake = 8;
      sfx('explode');
      p.mode = 'walk';
      p.t = 1.4;
    }
  }
}

// N3 王蟲 キングワーム: 体の節が続いて地面を這う。ときどき地中に潜って、主人公の下から飛び出す。尾から爆裂ワームを生む
function kingWorm(b, dt) {
  const head = b.parts[0];
  if (!head) return;
  b.mt -= dt;
  b.t2 = (b.t2 || 0) + dt;
  if (b.mode === 'crawl') {
    const a = toP(head) + Math.sin(b.t2 * 2.4) * 0.7;
    head.face = a;
    walk(head, a, b.phase2 ? 105 : 85, dt);
    b.spawnT = (b.spawnT == null ? 3 : b.spawnT) - dt;
    if (b.spawnT <= 0) {
      b.spawnT = b.phase2 ? 3 : 4.5;
      const tail = b.parts[b.parts.length - 1];
      summon(b, 'worm', 1, 4, tail.x, tail.y);
    }
    if (b.mt <= 0) {
      b.mode = 'burrow';
      b.mt = 1.4;
      for (const p of b.parts) p.hidden = true;
      for (let i = 0; i < 16; i++) addPart({ x: head.x + rnd(-14, 14), y: head.y + rnd(-14, 14), vx: rnd(-60, 60), vy: rnd(-60, 0), life: 0.5, color: '#8a6a4a', size: 3 });
    }
  } else if (b.mode === 'burrow') {
    walk(head, toP(head), 200, dt);
    if (b.mt <= 0) {
      b.mode = 'emerge';
      b.mt = 0.8;
      b.ex = P.x;
      b.ey = P.y;
      G.teles.push({ type: 'circle', x: P.x, y: P.y, r: 50, t: 0, dur: 0.8 });
    }
  } else if (b.mode === 'emerge') {
    if (b.mt <= 0) {
      head.x = b.ex;
      head.y = b.ey;
      b.trail = [];
      for (const p of b.parts) {
        p.hidden = false;
        p.x = b.ex;
        p.y = b.ey;
      }
      if (!G.dead && dist(b.ex, b.ey, P.x, P.y) < 50 + P.r) hurtPlayer(b.atk * 1.5, b.lv);
      ring(b.ex, b.ey, b.phase2 ? 18 : 12, 110, b.atk * 0.6, b.lv, Math.random(), '#c8a050');
      G.shake = 7;
      sfx('explode');
      b.mode = 'crawl';
      b.mt = b.phase2 ? 4 : 6;
    }
  }
  // 体の節は、頭の通った跡についていく
  b.trail.unshift({ x: head.x, y: head.y });
  if (b.trail.length > 120) b.trail.length = 120;
  b.parts.forEach((p, i) => {
    if (!i) return;
    const k = Math.min(b.trail.length - 1, i * 7);
    if (k >= 0 && b.mode !== 'burrow') {
      p.x = b.trail[k].x;
      p.y = b.trail[k].y;
    }
  });
}

// N4 黒森の魔女 モルガナ: ワープしながら呪いの弾幕。床に魔法陣。使い魔の毒蛾を呼ぶ
function morgana(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  p.bob = Math.sin(G.t * 2.5) * 3;
  if (b.mode === 'warp') {
    b.mt -= dt;
    p.fade = clamp(Math.abs(b.mt - 0.3) / 0.3, 0, 1);
    if (b.mt <= 0.3 && !b.moved) {
      b.moved = true;
      const s = bossSpot(b, 40, b.R * 1.3);
      p.x = s.x;
      p.y = s.y;
    }
    if (b.mt <= 0) {
      b.mode = null;
      p.fade = 1;
      p.hidden = false;
    }
    return;
  }
  b.atkT -= dt;
  if (b.atkT > 0) return;
  b.step = (b.step || 0) + 1;
  b.atkT = b.phase2 ? 1.3 : 1.9;
  const act = b.step % 4;
  if (act === 1) {
    for (let k = 0; k < 3; k++) setTimeLater(k * 0.28, () => alive(b, p) && ring(p.x, p.y, 10, 100, b.atk * 0.6, b.lv, b.t * 0.7 + k * 0.2, '#c070ff'));
  } else if (act === 2) {
    for (let i = 0; i < 3; i++) blast(b, P.x + rnd(-50, 50), P.y + rnd(-50, 50), 30, 1, 0.8, '#c070ff', (x, y) => addPoison(x, y, 30, b.atk * 0.7, b.lv, 5, 'curse'));
  } else if (act === 3) {
    if (b.phase2) fan(b, p.x, p.y, toP(p), 5, 0.6, 210, 0.8, '#ff70d0');
    summon(b, 'moth', 2, 4, p.x, p.y);
  } else {
    b.mode = 'warp';
    b.mt = 0.6;
    b.moved = false;
    p.hidden = true;
  }
}

// N5 灼熱の不死鳥 フェニクス: 決闘場の上をまわって飛ぶ。羽の扇・急降下・炎の輪。
//   1 度倒すと卵になり、10 秒以内に壊さないと HP 50% で生き返る
function phoenix(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  if (p.mode === 'egg') {
    p.eggT -= dt;
    if (p.eggT <= 0) {
      p.mode = 'fly';
      p.hp = p.maxHp = b.total * 0.5;
      p.r = 24;
      toast(tr('{name} がよみがえった!', { name: b.def.name }), 2);
      ring(p.x, p.y, 20, 120, b.atk * 0.7, b.lv, 0, '#ffb84a');
      sfx('boss');
    }
    return;
  }
  p.t -= dt;
  if (p.mode === 'fly') {
    b.orb += dt * (b.phase2 ? 1.1 : 0.8);
    const tx = b.cx + Math.cos(b.orb) * b.R * 0.75;
    const ty = b.cy + Math.sin(b.orb) * b.R * 0.55;
    p.x += (tx - p.x) * Math.min(1, dt * 2.5);
    p.y += (ty - p.y) * Math.min(1, dt * 2.5);
    p.face = toP(p);
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    const act = b.step % 3;
    if (act === 1) {
      fan(b, p.x, p.y, toP(p), b.phase2 ? 11 : 9, 1.2, 190, 0.6, '#ffb84a');
      p.t = 1.3;
    } else if (act === 2) {
      p.mode = 'wind';
      p.t = 0.7;
      p.dashA = toP(p);
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: p.dashA, len: 320, w: 40, t: 0, dur: 0.7 });
    } else {
      ring(p.x, p.y, b.phase2 ? 18 : 14, 120, b.atk * 0.7, b.lv, Math.random(), '#ff7a2c');
      p.t = 1.2;
    }
  } else if (p.mode === 'wind') {
    if (p.t <= 0) {
      p.mode = 'dive';
      p.t = 0.55;
    }
  } else if (p.mode === 'dive') {
    walk(p, p.dashA, 540, dt);
    addPart({ x: p.x, y: p.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.4, color: '#ffb84a', size: 3, glow: true });
    if (p.t <= 0) {
      p.mode = 'fly';
      p.t = 1;
    }
  }
}
// 倒されたとき: 1 回目は卵になる (true を返したら、まだ倒れていない)
export function phoenixEgg(b, p) {
  if (b.id !== 'N5' || b.eggUsed) return false;
  b.eggUsed = true;
  p.dead = false;
  p.mode = 'egg';
  p.eggT = 10;
  p.r = 16;
  p.hp = p.maxHp = b.total * 0.2;
  addText(p.x, p.y - 30, tr('10 秒以内に卵を壊せ!'), '#ffd84a', 10);
  return true;
}

// N6 堕天騎士 アザゼル: 剣と翼の高速戦。回避した直後をねらって追いかけてくる。聖属性が効きにくい
function azazel(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  p.t -= dt;
  // 主人公が回避したら、その先へすぐ斬りかかる
  if (P.dodgeAt != null && P.dodgeAt !== b.lastDodge && p.mode === 'move') {
    b.lastDodge = P.dodgeAt;
    p.mode = 'wind';
    p.t = 0.35;
    setTimeLater(0.15, () => {
      if (!alive(b, p)) return;
      p.dashA = toP(p);
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: p.dashA, len: 220, w: 30, t: 0, dur: 0.2 });
    });
    return;
  }
  if (p.mode === 'move') {
    const a = toP(p) + Math.PI / 2;
    walk(p, a, 70, dt); // 主人公のまわりを回りこむ
    if (dist(p.x, p.y, P.x, P.y) > 120) walk(p, toP(p), 80, dt);
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    if (b.step % 2) {
      p.mode = 'wind';
      p.t = 0.45;
      p.dashA = toP(p);
      G.teles.push({ type: 'line', x: p.x, y: p.y, a: p.dashA, len: 240, w: 30, t: 0, dur: 0.45 });
    } else {
      fan(b, p.x, p.y, toP(p), b.phase2 ? 5 : 3, 0.5, 260, 0.8, '#e8e8ff', false, 6);
      p.t = b.phase2 ? 0.8 : 1.2;
    }
  } else if (p.mode === 'wind') {
    if (p.t <= 0) {
      p.mode = 'dash';
      p.t = 0.38;
    }
  } else if (p.mode === 'dash') {
    walk(p, p.dashA, 580, dt);
    addPart({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, color: '#c0c0ff', size: 4 });
    if (p.t <= 0) {
      ring(p.x, p.y, 8, 170, b.atk * 0.6, b.lv, Math.random(), '#e8e8ff');
      p.mode = 'move';
      p.t = b.phase2 ? 0.7 : 1.1;
    }
  }
}

// K 魔王 ベリアル: 3 つの形。①玉座から弾幕 ②玉座を降りて剣と魔法 ③画面いっぱいの弾幕と、これまでのボスの技
function belial(b, dt) {
  const p = b.parts[0];
  if (!p) return;
  const k = p.hp / b.total;
  const form = k > 0.66 ? 1 : k > 0.33 ? 2 : 3;
  if (form !== b.form) {
    b.form = form;
    p.mode = form === 2 ? 'walk' : 'center';
    p.t = 1.5;
    G.ebullets = [];
    toast(form === 2 ? tr('魔王が玉座を降りた!') : tr('魔王が魔門と一体になった!'), 2.2);
    sfx('boss');
    G.shake = 8;
  }
  p.t -= dt;
  b.spin = (b.spin || 0) + dt * (form === 3 ? 1.6 : 1.1);
  if (form === 1) {
    p.x += (b.cx - p.x) * Math.min(1, dt * 2);
    p.y += (b.cy - b.R * 0.45 - p.y) * Math.min(1, dt * 2);
    b.streamT = (b.streamT || 0) - dt;
    if (b.streamT <= 0) {
      b.streamT = 0.16;
      for (let s = 0; s < 3; s++) enemyShot(p.x, p.y, b.spin + (s / 3) * TAU, 120, b.atk * 0.5, b.lv, '#ff4a8a', 4, 4);
    }
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    if (b.step % 2) fan(b, p.x, p.y, toP(p), 7, 0.9, 200, 0.7, '#ff70a0');
    else ring(p.x, p.y, 16, 110, b.atk * 0.6, b.lv, b.spin, '#c04aff');
    p.t = 1.4;
  } else if (form === 2) {
    if (dist(p.x, p.y, P.x, P.y) > 50) walk(p, toP(p), 62, dt);
    if (p.t > 0) return;
    b.step = (b.step || 0) + 1;
    const act = b.step % 3;
    if (act === 1) {
      G.teles.push({ type: 'circle', x: p.x, y: p.y, r: 70, t: 0, dur: 0.7, onDone: (t) => {
        if (b.state === 'fight' && !G.dead && dist(t.x, t.y, P.x, P.y) < 70 + P.r) hurtPlayer(b.atk * 1.6, b.lv);
        G.shake = 6;
        sfx('explode');
      } });
      p.t = 1.3;
    } else if (act === 2) {
      for (let s = 0; s < 3; s++) setTimeLater(s * 0.2, () => alive(b, p) && fan(b, p.x, p.y, toP(p), 5, 0.5, 250, 0.7, '#ff4a8a'));
      p.t = 1.4;
    } else {
      summon(b, 'dknight', 2, 3, p.x, p.y);
      p.t = 1.2;
    }
  } else {
    p.x += (b.cx - p.x) * Math.min(1, dt * 2);
    p.y += (b.cy - p.y) * Math.min(1, dt * 2);
    b.streamT = (b.streamT || 0) - dt;
    if (b.streamT <= 0) {
      b.streamT = 0.12;
      for (let s = 0; s < 4; s++) enemyShot(p.x, p.y, -b.spin + (s / 4) * TAU, 130, b.atk * 0.5, b.lv, '#ff4a8a', 4, 4);
    }
    if (p.t > 0) return;
    // これまでのボスの技を真似る
    const act = pick(['lava', 'beam', 'ring', 'rain']);
    if (act === 'lava') for (let i = 0; i < 4; i++) blast(b, P.x + rnd(-60, 60), P.y + rnd(-60, 60), 28, 1, 0.9, '#ff7a2c', (x, y) => addPoison(x, y, 28, b.atk * 0.8, b.lv, 5, 'lava'));
    else if (act === 'beam') for (let s = 0; s < 4; s++) slash(b, p.x, p.y, b.spin + (s / 4) * TAU, 260, 28, 0.9, 1.4, '#ff4a8a');
    else if (act === 'ring') for (let s = 0; s < 3; s++) setTimeLater(s * 0.3, () => alive(b, p) && ring(p.x, p.y, 18, 120, b.atk * 0.6, b.lv, s * 0.17, '#c04aff'));
    else for (let i = 0; i < 7; i++) blast(b, P.x + rnd(-90, 90), P.y + rnd(-90, 90), 24, 0.8 + i * 0.1, 1.1, '#ff70a0', null, { sx: p.x, sy: p.y - 30 });
    p.t = 1.5;
  }
}

// 決闘場の外へ出ないように (G4 は体の位置で見る)
export function clampBody(b) {
  if (b.id !== 'G4') return;
  const tx = Math.floor(b.bx / TILE);
  const ty = Math.floor(b.by / TILE);
  const ok = tx > 0 && ty > 0 && tx < G.map.w - 1 && ty < G.map.h - 1 && G.map.areaOf[ty * G.map.w + tx] === b.area;
  if (ok) {
    b.lbx = b.bx;
    b.lby = b.by;
  } else if (b.lbx != null) {
    b.bx = b.lbx;
    b.by = b.lby;
  }
}
