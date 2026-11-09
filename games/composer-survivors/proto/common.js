/*
 * 作曲家サバイバー 試作: 3 つの遊び方で共通の部分
 *   曲 (楽譜どおりの音符と BGM)、音符の強さ、効果、画面の大きさ合わせ、メニュー、結果と評価のメモ
 *   遊び方ごとの中身は lane.js (横スクロール)・topdown.js (見下ろし)・shooter.js (縦シューティング)
 */
(() => {
  'use strict';

  const { Synth, Track, parseScore, VEL } = window.CSAudio;
  const D = window.CSData;
  Synth.samplesBase = window.CPS_SAMPLES || '../samples/piano/';

  // ---------- 数値 ----------
  const STAR_MUL = [1.5, 1.8, 2.4, 3.1, 4];
  const HP_TABLE = [[0.125, 3], [0.25, 6], [0.5, 10], [1, 18], [2, 32], [4, 55], [8, 80]];
  const R_TABLE = [[0.125, 7], [0.25, 8], [0.5, 9.5], [1, 11], [2, 13], [4, 16], [8, 18]];
  const DIFFS = {
    easy: { name: 'やさしい', hp: 0.6, dmg: 0.6 },
    normal: { name: 'ふつう', hp: 1, dmg: 1 },
    hard: { name: 'シビア', hp: 1.6, dmg: 1.4 },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const logInterp = (table, x) => {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [x1, y1] = table[i];
      if (x <= x1) {
        const [x0, y0] = table[i - 1];
        return y0 + ((y1 - y0) * Math.log(x / x0)) / Math.log(x1 / x0);
      }
    }
    return table[table.length - 1][1];
  };
  const regOf = (p) => (p < 55 ? 'lo' : p >= 72 ? 'hi' : 'mid');
  const REG_NAME = { lo: '低音', mid: '中音', hi: '高音', all: '全音域' };
  const pitchColor = (p, l = 55) => `hsl(${((p % 12) * 30 + 350) % 360}, 75%, ${l}%)`;

  // ---------- 画面 ----------
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const view = { fw: 1280, fh: 720, scale: 1, offX: 0, offY: 0, w: 0, h: 0 };

  function setField(fw, fh) {
    view.fw = fw;
    view.fh = fh;
    resize();
  }
  function resize() {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(200, rect.width);
    view.h = Math.max(200, rect.height);
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    view.dpr = dpr;
    view.scale = Math.min(view.w / view.fw, view.h / view.fh);
    view.offX = (view.w - view.fw * view.scale) / 2;
    view.offY = (view.h - view.fh * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  // 上の表示が折り返して高さが変わったときも合わせる
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas.parentElement);
  function toField(ev) {
    const r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left - view.offX) / view.scale, (ev.clientY - r.top - view.offY) / view.scale];
  }

  // ---------- 曲 ----------
  // 音符の基本の強さ。mode ごとに倍率をかけて使う
  function prepareSong(song, diffId) {
    const score = window.CS_SCORES[song.score];
    const parsed = parseScore(score);
    const dens = parsed.notes.length / Math.max(30, parsed.lengthSec);
    const S = {
      song,
      score,
      parsed,
      diff: DIFFS[diffId],
      dens,
      densHp: clamp(Math.pow(6.7 / dens, 0.9), 0.3, 1.2),
      densLeak: clamp(Math.pow(6.7 / dens, 0.6), 0.4, 1),
      star: STAR_MUL[song.stars - 1] * (song.hpMul || 1),
    };
    markElites(parsed);
    return S;
  }
  function markElites(parsed) {
    const notes = parsed.notes;
    const elites = notes.filter((n) => n.mk.includes('>')).length;
    const want = Math.max(4, Math.round(parsed.lengthSec / 30));
    if (elites >= want) return;
    const span = parsed.lengthSec / (want - elites + 1);
    for (let k = 1; k <= want - elites; k++) {
      let best = null;
      for (const n of notes) {
        if (n.sec < span * k - span * 0.4 || n.sec > span * k + span * 0.4 || !n.melody || n.mk.includes('^')) continue;
        if (!best || n.d > best.d) best = n;
      }
      if (best && !best.mk.includes('>')) best.mk += '>';
    }
  }
  // 1 つの音符の強さ: 高い音は速く脆い、低い音は遅く硬い。短い音は脆く、長い音は硬い
  function noteStats(S, src, hpMul = 1) {
    const o = (src.p - 60) / 12;
    const prog = clamp((src.sec || 0) / S.parsed.lengthSec, 0, 1);
    const mk = src.mk || '';
    let hp = logInterp(HP_TABLE, src.d) * clamp(Math.pow(1.35, -o), 0.4, 2.5) * S.star * S.densHp * S.diff.hp * (src.melody ? 1 : 0.8) * (0.75 + 1.0 * prog) * hpMul;
    let r = logInterp(R_TABLE, src.d);
    const n = {
      p: src.p,
      d: src.d,
      v: src.v,
      reg: regOf(src.p),
      col: pitchColor(src.p),
      spd: clamp(Math.pow(1.3, o), 0.5, 2.4), // 1 が中音。mode ごとにかける
      elite: mk.includes('>'),
      fermata: mk.includes('^'),
      stacc: mk.includes("'"),
      grace: mk.includes('g'),
      atk: (3 + 2.2 * src.v) * S.diff.dmg * S.densHp, // 1 秒あたりの攻撃 (音符の多い曲ほど 1 つずつは弱い)
      flash: 0,
      dead: false,
      t: 0,
      phase: Math.random() * 6.28,
    };
    if (n.v >= 4) r *= n.v === 5 ? 1.15 : 1.08;
    if (n.elite) {
      hp *= 3;
      r *= 1.25;
      n.atk *= 1.6;
    }
    if (n.fermata) {
      hp *= 6;
      r *= 1.5;
      n.spd *= 0.7;
    }
    if (n.grace) {
      hp = 1;
      r = 5;
    }
    n.hp = n.maxHp = hp;
    n.r = r;
    return n;
  }
  function startTrack(S, countBeats = 2) {
    const bpm = S.parsed.bpmAt(0);
    const beat = 60 / bpm;
    const clicks = [];
    for (let i = 0; i < countBeats; i++) clicks.push([0.3 + i * beat, i === 0]);
    const tr = new Track(S.parsed.notes);
    tr.start(0, countBeats * beat + 0.3, clicks);
    return tr;
  }
  // 決戦: ボスが主題を繰り返し鳴らす (その音も敵になる)
  function themeTrack(S) {
    const sc = S.score;
    const th = sc.theme || { part: 0, from: 0, len: S.parsed.barLen * 4, tempo: 100 };
    const { notes } = window.CSAudio.partNotes(sc.parts[th.part], 0, 'theme', sc.ppq);
    const pick = (from) => {
      const out = [];
      for (const n of notes) {
        if (n.t < from - 1e-6 || n.t >= from + th.len - 1e-6) continue;
        out.push({ ...n, sec: ((n.t - from) * 60) / th.tempo, dur: (n.d * 60) / th.tempo, inst: sc.parts[th.part].inst, vol: 1, melody: true });
      }
      return out;
    };
    let list = pick(th.from);
    if (!list.length && notes.length) list = pick(Math.min(...notes.map((n) => n.t)));
    list.sort((a, b) => a.sec - b.sec);
    const tr = new Track(list, { loopLen: (th.len * 60) / th.tempo });
    tr.start(0, 0.6);
    return tr;
  }

  // ---------- 効果 ----------
  const fx = { parts: [], texts: [], rings: [], shake: 0 };
  function burst(x, y, col, n = 8, spd = 160, life = 0.5, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(spd * 0.3, spd);
      fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, col, size: rand(size * 0.6, size * 1.4) });
    }
  }
  function ring(x, y, r, col, life = 0.35, width = 4) {
    fx.rings.push({ x, y, r, col, life, max: life, width });
  }
  function text(x, y, s, col = '#fff', size = 18) {
    fx.texts.push({ x, y, s, col, size, life: 0.9, max: 0.9 });
  }
  function shake(v) {
    fx.shake = Math.max(fx.shake, v);
  }
  function updateFx(dt) {
    for (const p of fx.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
      p.life -= dt;
    }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
    for (const t of fx.texts) {
      t.y -= 40 * dt;
      t.life -= dt;
    }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const r of fx.rings) r.life -= dt;
    fx.rings = fx.rings.filter((r) => r.life > 0);
    fx.shake = Math.max(0, fx.shake - dt * 30);
  }
  function drawFx(c) {
    for (const r of fx.rings) {
      const k = 1 - r.life / r.max;
      c.globalAlpha = 1 - k;
      c.strokeStyle = r.col;
      c.lineWidth = r.width * (1 - k * 0.5);
      c.beginPath();
      c.arc(r.x, r.y, r.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      c.stroke();
    }
    for (const p of fx.parts) {
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.col;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.textAlign = 'center';
    for (const t of fx.texts) {
      c.globalAlpha = clamp(t.life / t.max * 1.5, 0, 1);
      c.font = `bold ${t.size}px system-ui, sans-serif`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(t.s, t.x, t.y);
      c.fillStyle = t.col;
      c.fillText(t.s, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  // ---------- 描画の部品 ----------
  // 音符: 玉 + 棒 + 旗 (短い音ほど旗が多い)。dir: 進む向き (旗のなびく向き)
  function drawNote(c, n, x, y, opt = {}) {
    const r = n.r;
    c.save();
    c.translate(x, y);
    if (opt.rot) c.rotate(opt.rot);
    const hollow = n.d >= 2;
    const col = n.flash > 0 ? '#fff' : n.col;
    if (n.elite) {
      c.strokeStyle = '#ffd84a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, r + 6 + Math.sin(n.t * 8) * 1.5, 0, Math.PI * 2);
      c.stroke();
    }
    // 棒
    if (n.d < 4) {
      const up = n.p < 71;
      const sx = up ? r * 0.85 : -r * 0.85;
      const sy = up ? -r * 3.2 : r * 3.2;
      c.strokeStyle = col;
      c.lineWidth = Math.max(2, r * 0.18);
      c.beginPath();
      c.moveTo(sx, 0);
      c.lineTo(sx, sy);
      c.stroke();
      const flags = n.d <= 0.25 ? 2 : n.d <= 0.5 ? 1 : 0;
      for (let i = 0; i < flags; i++) {
        const fy = sy + (up ? 1 : -1) * i * r * 0.7;
        c.beginPath();
        c.moveTo(sx, fy);
        c.quadraticCurveTo(sx + r * 1.2, fy + (up ? 1 : -1) * r * 0.6 + Math.sin(n.t * 12 + i) * 2, sx + r * 0.6, fy + (up ? 1 : -1) * r * 1.4);
        c.stroke();
      }
    }
    c.rotate(-0.35);
    c.beginPath();
    c.ellipse(0, 0, r * 1.15, r * 0.82, 0, 0, Math.PI * 2);
    if (hollow) {
      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = Math.max(2.5, r * 0.3);
      c.stroke();
    } else {
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.lineWidth = 1.5;
      c.stroke();
    }
    c.restore();
    if (n.fermata) {
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y - r - 8, r * 0.8, Math.PI, 0);
      c.stroke();
      c.fillStyle = '#fff';
      c.fillRect(x - 1.5, y - r - 10, 3, 3);
    }
    if (n.hp < n.maxHp && !n.grace) {
      const w = Math.max(18, r * 2.2);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(x - w / 2, y + r + 4, w, 3);
      c.fillStyle = '#ff6b6b';
      c.fillRect(x - w / 2, y + r + 4, (w * Math.max(0, n.hp)) / n.maxHp, 3);
    }
  }

  // 作曲家 (指揮者)。s: 大きさ (1 で高さ約 60)
  function drawComposer(c, comp, x, y, s = 1, t = 0, wave = 0) {
    const C = comp.colors;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    // 体
    c.fillStyle = C.coat;
    c.beginPath();
    c.moveTo(-16, 30);
    c.lineTo(-12, -2);
    c.quadraticCurveTo(0, -8, 12, -2);
    c.lineTo(16, 30);
    c.closePath();
    c.fill();
    c.fillStyle = C.scarf;
    c.beginPath();
    c.moveTo(-6, -4);
    c.lineTo(6, -4);
    c.lineTo(0, 8);
    c.closePath();
    c.fill();
    // 頭
    c.fillStyle = C.skin;
    c.beginPath();
    c.arc(0, -16, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = C.hair;
    c.beginPath();
    if (comp.id === 'mozart') {
      c.arc(0, -20, 11, Math.PI, 0);
      c.arc(-11, -12, 5, 0, Math.PI * 2);
      c.arc(11, -12, 5, 0, Math.PI * 2);
    } else if (comp.id === 'beethoven') {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        c.moveTo(0, -18);
        c.arc(Math.cos(a) * 11, -18 + Math.sin(a) * 9, 5.5, 0, Math.PI * 2);
      }
    } else {
      c.ellipse(-2, -23, 12, 6, -0.2, 0, Math.PI * 2);
      c.moveTo(-11, -18);
      c.ellipse(-10, -16, 4, 8, 0.2, 0, Math.PI * 2);
    }
    c.fill();
    c.fillStyle = '#222';
    c.fillRect(-5, -17, 2.5, 2.5);
    c.fillRect(3, -17, 2.5, 2.5);
    // 指揮棒を振る腕
    const a = -0.6 + Math.sin(t * 6) * 0.5 * (1 + wave);
    c.strokeStyle = C.coat;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(10, 2);
    const hx = 10 + Math.cos(a) * 16;
    const hy = 2 + Math.sin(a) * 16;
    c.lineTo(hx, hy);
    c.stroke();
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(hx + Math.cos(a - 0.4) * 18, hy + Math.sin(a - 0.4) * 18);
    c.stroke();
    c.restore();
  }

  // 楽器の小さな絵 (タワー・ユニットの印)
  const INST = {
    piano: { col: '#3a3a46', glyph: '🎹' },
    violin: { col: '#b5651d', glyph: '🎻' },
    cello: { col: '#7a3f17', glyph: '🎻' },
    timpani: { col: '#c9a227', glyph: '🥁' },
    flute: { col: '#9fb6c8', glyph: '🪈' },
    harp: { col: '#d4a017', glyph: '🪕' },
    baton: { col: '#f4efe4', glyph: '🪄' },
    trumpet: { col: '#e0b030', glyph: '🎺' },
    cymbal: { col: '#e8c860', glyph: '🔔' },
    organ: { col: '#6b5b95', glyph: '⛪' },
    horn: { col: '#d18f2a', glyph: '📯' },
  };
  function drawInst(c, id, x, y, r, opt = {}) {
    const I = INST[id] || INST.piano;
    c.save();
    c.translate(x, y);
    if (opt.bob) c.translate(0, Math.sin(opt.bob) * 2);
    c.fillStyle = opt.hurt ? '#fff' : I.col;
    c.strokeStyle = opt.ring || 'rgba(255,255,255,0.8)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.font = `${Math.round(r * 1.15)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(I.glyph, 0, 1);
    c.textBaseline = 'alphabetic';
    if (opt.lv > 1) {
      c.fillStyle = '#ffd84a';
      c.font = 'bold 11px system-ui';
      c.fillText('★'.repeat(opt.lv - 1), 0, -r - 3);
    }
    c.restore();
  }
  function hpBar(c, x, y, w, k, col = '#7ef0c8') {
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(x - w / 2, y, w, 4);
    c.fillStyle = k > 0.3 ? col : '#ff6b6b';
    c.fillRect(x - w / 2, y, w * clamp(k, 0, 1), 4);
  }

  // ボス: 曲ごとの色の大きな玉と、回る飾り
  function drawBoss(c, def, x, y, R, t, opt = {}) {
    const col = def.color || '#c0392b';
    c.save();
    c.translate(x, y);
    if (opt.shield) {
      c.strokeStyle = 'rgba(160,200,255,0.55)';
      c.lineWidth = 3;
      c.setLineDash([8, 6]);
      c.beginPath();
      c.arc(0, 0, R + 14, t, t + Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    c.rotate(t * 0.8);
    c.fillStyle = col;
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.ellipse(R * 0.9, 0, R * 0.32, R * 0.16, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    const g = c.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.35, opt.hurt ? '#fff' : col);
    g.addColorStop(1, '#1a1220');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, R * (1 + (opt.pulse || 0) * 0.08), 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.fillRect(x - R * 0.35, y - R * 0.15, R * 0.18, R * 0.22);
    c.fillRect(x + R * 0.17, y - R * 0.15, R * 0.18, R * 0.22);
    c.fillStyle = '#222';
    c.fillRect(x - R * 0.3, y - R * 0.08, R * 0.1, R * 0.12);
    c.fillRect(x + R * 0.22, y - R * 0.08, R * 0.1, R * 0.12);
    if (opt.name) {
      c.font = 'bold 14px system-ui';
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.strokeStyle = 'rgba(0,0,0,0.7)';
      c.lineWidth = 3;
      c.strokeText(def.ja, x, y + R + 22);
      c.fillText(def.ja, x, y + R + 22);
    }
  }

  // ---------- 評価のメモ (どの遊び方が楽しいか比べる) ----------
  const RKEY = 'cps-proto-ratings';
  function loadRatings() {
    try {
      return JSON.parse(localStorage.getItem(RKEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveRating(mode, entry) {
    const all = loadRatings();
    (all[mode] = all[mode] || []).push(entry);
    try {
      localStorage.setItem(RKEY, JSON.stringify(all));
    } catch (e) {
      /* 保存できなくても遊べる */
    }
  }

  // ---------- 進行 ----------
  const modes = {};
  const AUTO = new URLSearchParams(location.search).get('auto') === '1'; // 自動プレイを見る (確認用)
  let cur = null; // 遊んでいる mode
  let env = null;
  let last = 0;
  let paused = false;
  const $ = (id) => document.getElementById(id);

  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (!cur || !env) return;
    if (!paused && !env.over) {
      env.time += dt;
      if (AUTO && cur.bot) cur.bot(env, dt);
      cur.update(env, dt);
      updateFx(dt);
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, view.w, view.h);
    const sx = fx.shake ? rand(-fx.shake, fx.shake) : 0;
    const sy = fx.shake ? rand(-fx.shake, fx.shake) : 0;
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * (view.offX + sx * view.scale), view.dpr * (view.offY + sy * view.scale));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, view.fw, view.fh);
    ctx.clip();
    cur.render(env, ctx);
    drawFx(ctx);
    ctx.restore();
    hud();
  }
  requestAnimationFrame(loop);

  function hud() {
    const e = env;
    const S = e.S;
    const pos = e.track ? e.track.pos() : 0;
    const prog = e.phase === 'song' ? clamp(pos / S.parsed.lengthSec, 0, 1) : e.phase === 'boss' ? 1 : 0;
    $('hud-prog').style.width = (prog * 100).toFixed(1) + '%';
    const mm = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
    $('hud-time').textContent = e.phase === 'boss' ? '決戦' : e.phase === 'prep' ? '準備' : `${mm(pos)} / ${mm(S.parsed.lengthSec)}`;
    $('hud-hp').textContent = `♥ ${Math.max(0, Math.ceil(e.hp))}/${e.maxHp}`;
    $('hud-ink').textContent = `🖋 ${Math.floor(e.ink)}`;
    $('hud-kill').textContent = `♪ ${e.killed}/${e.total}`;
    if (cur.hud) cur.hud(e);
  }

  // 曲が終わって音符もいない → 決戦へ。決戦でボスを倒すと勝ち
  function songStep(e, onSpawn) {
    if (e.phase === 'song') {
      const pos = e.track.pos();
      for (const n of e.track.due(pos)) onSpawn(n, false);
      if (pos > e.S.parsed.lengthSec + 0.3 && e.track.remaining() === 0 && e.alive() === 0) {
        e.track.stop();
        e.phase = 'boss';
        e.boss.shield = false;
        e.btrack = themeTrack(e.S);
        Synth.sfx('cymbal');
        banner('決戦！ ボスを倒せ', 2);
        if (cur.onBoss) cur.onBoss(e);
      }
    } else if (e.phase === 'boss' && e.btrack) {
      for (const n of e.btrack.due(e.btrack.pos())) onSpawn(n, true);
    }
  }

  function banner(s, sec = 1.6) {
    const b = $('banner');
    b.textContent = s;
    b.hidden = false;
    clearTimeout(banner.tm);
    banner.tm = setTimeout(() => (b.hidden = true), sec * 1000);
  }

  function hurt(e, v) {
    if (e.over) return;
    e.hp -= v;
    e.dmgTaken += v;
    shake(6);
    Synth.sfx('hurt');
    if (e.hp <= 0) finish(false);
  }
  function onKill(e, n, x, y, ink) {
    e.killed++;
    e.ink += ink;
    burst(x, y, n.col, n.elite ? 18 : 7, n.elite ? 260 : 150, 0.45, n.elite ? 5 : 3);
    if (n.elite) text(x, y - 14, '+' + Math.round(ink), '#ffd84a', 16);
    if (Math.random() < 0.25) Synth.sfx('pop', { p: n.p + 12 });
  }

  function finish(win) {
    const e = env;
    if (!e || e.over) return;
    e.over = true;
    if (e.sim) {
      e.hp = win ? Math.max(1, e.hp) : Math.min(0, e.hp);
      return;
    }
    if (e.track) e.track.stop();
    if (e.btrack) e.btrack.stop();
    Synth.sfx(win ? 'applause' : 'boom');
    const S = e.S;
    const r = $('result');
    $('res-title').textContent = win ? 'ブラボー！ クリア' : '演奏は止まってしまった…';
    const pos = e.phase === 'song' ? e.track.pos() : S.parsed.lengthSec;
    $('res-stats').innerHTML =
      `<div>遊び方: <b>${cur.title}</b></div><div>曲: ${S.song.title.ja}（${S.diff.name}）</div>` +
      `<div>倒した音符: ${e.killed} / ${e.total}　通した音符: ${e.leaked}</div>` +
      `<div>受けたダメージ: ${Math.round(e.dmgTaken)}　${win ? 'クリアまで' : '止まったところ'}: ${Math.floor(pos / 60)}:${String(Math.floor(pos % 60)).padStart(2, '0')}</div>` +
      (cur.resultExtra ? cur.resultExtra(e) : '');
    r.dataset.win = win ? '1' : '0';
    setStars(0);
    $('res-memo').value = '';
    r.hidden = false;
  }
  function setStars(k) {
    $('res-rate').dataset.v = k;
    [...$('res-rate').children].forEach((b, i) => b.classList.toggle('on', i < k));
  }

  function newEnv(mode, song, comp, diffId) {
    const S = prepareSong(song, diffId);
    fx.parts = [];
    fx.texts = [];
    fx.rings = [];
    const e = {
      S,
      mode,
      comp,
      song,
      phase: 'prep',
      time: 0,
      ink: 0,
      hp: comp.hp,
      maxHp: comp.hp,
      killed: 0,
      leaked: 0,
      total: S.parsed.notes.length,
      dmgTaken: 0,
      over: false,
      track: null,
      btrack: null,
      boss: { hp: 1, maxHp: 1, shield: true, def: song.boss, pulse: 0, hurt: 0 },
      alive: () => 0,
    };
    return e;
  }

  function startGame(modeId, song, comp, diffId) {
    Synth.init();
    Synth.resume();
    Synth.setVolumes(0.85, 0.7);
    cur = modes[modeId];
    setField(cur.size[0], cur.size[1]);
    env = newEnv(modeId, song, comp, diffId);
    document.body.dataset.mode = modeId;
    $('menu').hidden = true;
    $('result').hidden = true;
    $('game').hidden = false;
    resize();
    paused = false;
    cur.start(env);
    resize(); // 下のボタンの列ができてから大きさを合わせる
    const h = $('hint');
    if (cur.size[0] > cur.size[1] && view.h > view.w * 1.2) h.textContent = '📱 横向きにすると大きく遊べます。' + h.textContent;
    h.style.opacity = 1;
    clearTimeout(startGame.tm);
    startGame.tm = setTimeout(() => (h.style.opacity = 0), 9000);
  }
  // 曲を始める (準備の時間があるモードは、開演のボタンから呼ぶ)
  function beginSong(e) {
    e.track = startTrack(e.S);
    e.phase = 'song';
  }
  function quit() {
    if (env) {
      if (env.track) env.track.stop();
      if (env.btrack) env.btrack.stop();
      env.over = true;
    }
    env = null;
    cur = null;
    $('game').hidden = true;
    $('result').hidden = true;
    $('menu').hidden = false;
    renderMenu();
  }
  function togglePause() {
    if (!env || env.over) return;
    paused = !paused;
    $('pause').hidden = !paused;
    const trs = [env.track, env.btrack].filter(Boolean);
    if (paused) trs.forEach((t) => t.pause());
    else trs.forEach((t) => t.start(t.pausedPos, 0.3));
  }

  // ---------- メニュー ----------
  const sel = { mode: 'lane', song: 'elise', comp: 'beethoven', diff: 'normal' };
  try {
    Object.assign(sel, JSON.parse(localStorage.getItem('cps-proto-sel')) || {});
  } catch (e) {
    /* なし */
  }
  function renderMenu() {
    const ms = $('modes');
    ms.innerHTML = '';
    const R = loadRatings();
    for (const [id, m] of Object.entries(modes)) {
      const list = R[id] || [];
      const rated = list.filter((x) => x.stars > 0);
      const avg = rated.length ? rated.reduce((a, x) => a + x.stars, 0) / rated.length : 0;
      const b = document.createElement('button');
      b.className = 'mode' + (sel.mode === id ? ' on' : '');
      b.innerHTML = `<span class="mode-no">${m.no}</span><b>${m.title}</b><span class="mode-desc">${m.desc}</span><span class="mode-rate">${rated.length ? '★' + avg.toFixed(1) + `（${rated.length} 回）` : 'まだ評価なし'}</span>`;
      b.onclick = () => {
        sel.mode = id;
        renderMenu();
      };
      ms.appendChild(b);
    }
    const sl = $('songs');
    sl.innerHTML = '';
    for (const c of D.COMPOSERS) {
      const g = document.createElement('div');
      g.className = 'song-group';
      g.innerHTML = `<div class="song-comp">${c.name.ja}</div>`;
      for (const s of D.SONGS.filter((x) => x.composer === c.id && x.score && window.CS_SCORES[x.score])) {
        const b = document.createElement('button');
        b.className = 'song' + (sel.song === s.id ? ' on' : '');
        b.innerHTML = `<span>${'♪'.repeat(s.stars)}</span> ${s.title.ja}`;
        b.onclick = () => {
          sel.song = s.id;
          renderMenu();
        };
        g.appendChild(b);
      }
      sl.appendChild(g);
    }
    const cl = $('comps');
    cl.innerHTML = '';
    for (const c of D.COMPOSERS) {
      const b = document.createElement('button');
      b.className = 'chip' + (sel.comp === c.id ? ' on' : '');
      b.textContent = c.name.ja;
      b.onclick = () => {
        sel.comp = c.id;
        renderMenu();
      };
      cl.appendChild(b);
    }
    const dl = $('diffs');
    dl.innerHTML = '';
    for (const [id, d] of Object.entries(DIFFS)) {
      const b = document.createElement('button');
      b.className = 'chip' + (sel.diff === id ? ' on' : '');
      b.textContent = d.name;
      b.onclick = () => {
        sel.diff = id;
        renderMenu();
      };
      dl.appendChild(b);
    }
    // 比べる表
    const tb = $('compare');
    let h = '<tr><th>遊び方</th><th>遊んだ</th><th>クリア</th><th>平均の評価</th><th>最近のメモ</th></tr>';
    for (const [id, m] of Object.entries(modes)) {
      const list = R[id] || [];
      const rated = list.filter((x) => x.stars > 0);
      const avg = rated.length ? (rated.reduce((a, x) => a + x.stars, 0) / rated.length).toFixed(1) : '—';
      const memo = [...list].reverse().find((x) => x.memo);
      h += `<tr><td>${m.no} ${m.title}</td><td>${list.length}</td><td>${list.filter((x) => x.win).length}</td><td>${avg}</td><td class="memo">${memo ? escapeHtml(memo.memo) : ''}</td></tr>`;
    }
    tb.innerHTML = h;
    try {
      localStorage.setItem('cps-proto-sel', JSON.stringify(sel));
    } catch (e) {
      /* なし */
    }
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function initUI() {
    $('start').onclick = () => {
      const song = D.SONGS.find((s) => s.id === sel.song) || D.SONGS[0];
      const comp = D.COMPOSERS.find((c) => c.id === sel.comp) || D.COMPOSERS[0];
      startGame(sel.mode, song, comp, sel.diff);
    };
    $('pause-btn').onclick = togglePause;
    $('resume').onclick = togglePause;
    $('quit').onclick = () => {
      paused = false;
      $('pause').hidden = true;
      quit();
    };
    [...$('res-rate').children].forEach((b, i) => (b.onclick = () => setStars(i + 1)));
    const save = () => {
      if (!env) return;
      saveRating(env.mode, {
        stars: +$('res-rate').dataset.v || 0,
        memo: $('res-memo').value.trim(),
        win: $('result').dataset.win === '1',
        song: env.song.id,
        diff: sel.diff,
        date: new Date().toISOString(),
      });
    };
    $('res-retry').onclick = () => {
      save();
      startGame(sel.mode, env.song, env.comp, sel.diff);
    };
    $('res-menu').onclick = () => {
      save();
      quit();
    };
    $('clear-ratings').onclick = () => {
      if (!confirm('評価のメモをすべて消しますか？')) return;
      try {
        localStorage.removeItem(RKEY);
      } catch (e) {
        /* なし */
      }
      renderMenu();
    };
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P') togglePause();
      if (cur && cur.key && env && !paused) cur.key(env, ev, true);
    });
    window.addEventListener('keyup', (ev) => {
      if (cur && cur.key && env) cur.key(env, ev, false);
    });
    const ptr = (type) => (ev) => {
      if (!cur || !env || paused || env.over) return;
      const [x, y] = toField(ev);
      if (cur[type]) cur[type](env, x, y, ev);
    };
    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      ptr('down')(ev);
    });
    canvas.addEventListener('pointermove', ptr('move'));
    canvas.addEventListener('pointerup', ptr('up'));
    canvas.addEventListener('pointercancel', ptr('up'));
    renderMenu();
  }

  // ---------- 自動プレイ (難しさを確かめる。?sim=<mode>&song=<id>&n=<回数>&diff=<easy|normal|hard>) ----------
  function simulate(modeId, songId, compId, diffId, maxSec = 900) {
    Synth.fake = true;
    Synth.fakeTime = 0;
    const song = D.SONGS.find((s) => s.id === songId);
    const comp = D.COMPOSERS.find((c) => c.id === (compId || song.composer));
    cur = modes[modeId];
    setField(cur.size[0], cur.size[1]);
    env = newEnv(modeId, song, comp, diffId);
    env.sim = true;
    const e = env;
    cur.start(e);
    const dt = 1 / 30;
    let t = 0;
    while (!e.over && t < maxSec) {
      Synth.fakeTime += dt;
      t += dt;
      e.time += dt;
      if (cur.bot) cur.bot(e, dt);
      cur.update(e, dt);
      updateFx(dt);
    }
    const pos = e.phase === 'song' && e.track ? e.track.pos() : e.S.parsed.lengthSec;
    const out = { mode: modeId, song: songId, diff: diffId, win: e.over && e.hp > 0, phase: e.phase, at: Math.round(pos), len: Math.round(e.S.parsed.lengthSec), hp: Math.round(e.hp), killed: e.killed, total: e.total, leaked: e.leaked, t: Math.round(t), extra: cur.simExtra ? cur.simExtra(e) : '' };
    env = null;
    cur = null;
    Synth.fake = false;
    return out;
  }
  function runSimFromUrl() {
    const q = new URLSearchParams(location.search);
    if (!q.get('sim')) return false;
    const out = [];
    for (let i = 0; i < +(q.get('n') || 1); i++) out.push(simulate(q.get('sim'), q.get('song') || 'elise', q.get('c'), q.get('diff') || 'normal', +(q.get('max') || 900)));
    window.SIM_RESULT = out;
    return true;
  }

  window.Proto = {
    simulate,
    runSimFromUrl,
    D,
    Synth,
    modes,
    clamp,
    rand,
    dist2,
    logInterp,
    regOf,
    REG_NAME,
    pitchColor,
    noteStats,
    beginSong,
    songStep,
    banner,
    hurt,
    onKill,
    finish,
    burst,
    ring,
    text,
    shake,
    drawNote,
    drawComposer,
    drawInst,
    drawBoss,
    hpBar,
    INST,
    view,
    initUI,
    get env() {
      return env;
    },
  };
})();
