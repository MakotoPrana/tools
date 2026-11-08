/*
 * 作曲家サバイバー: ゲームの本体 (プレイ中の動き・描画)
 *   メニューの画面は ui.js。ここは「曲を流し、音符を出し、戦う」部分
 */
(() => {
  'use strict';

  const { Synth, Track, parseScore } = window.CSAudio;
  const D = window.CSData;

  // ---------- 定数 ----------
  const ROOM = 1300; // 部屋の広さ (正方形)
  const VIEW = 560; // 画面の短い辺に見える広さ
  const MAX_NOTES = 350;
  const STAR_MUL = [0.85, 1.3, 1.7, 2.2, 2.8];
  const HARD = { tempo: 1.15, hp: 2.5, dmg: 2, gold: 1.6 };
  const DYN_DMG = [3, 4, 5, 6, 8, 10];
  const HP_TABLE = [[0.125, 3], [0.25, 6], [0.5, 10], [1, 18], [2, 32], [4, 55], [8, 80]];
  const R_TABLE = [[0.125, 7], [0.25, 8], [0.5, 10], [1, 12], [2, 15], [4, 19], [8, 22]];
  const ENCORE_WAIT = 45;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  const logInterp = (table, x) => {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [x1, y1] = table[i];
      if (x <= x1) {
        const [x0, y0] = table[i - 1];
        const f = Math.log(x / x0) / Math.log(x1 / x0);
        return y0 + (y1 - y0) * f;
      }
    }
    return table[table.length - 1][1];
  };
  // 音域: 低 (G3 より下)・中・高 (C5 以上)
  const regOf = (p) => (p < 55 ? 'lo' : p >= 72 ? 'hi' : 'mid');
  const pitchColor = (p, l = 55) => `hsl(${((p % 12) * 30 + 350) % 360}, 75%, ${l}%)`;
  const BLACK_KEYS = [1, 3, 6, 8, 10];

  // ---------- 状態 ----------
  let G = null; // 1 回のプレイの状態
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let scale = 1;
  const input = { up: false, down: false, left: false, right: false, jx: 0, jy: 0, stick: null };

  function resize() {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(300, rect.width);
    H = Math.max(300, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = clamp(Math.min(W, H) / VIEW, 0.6, 1.4);
  }

  // ---------- 空間ハッシュ ----------
  const CELL = 48;
  const grid = new Map();
  function gridBuild(list) {
    grid.clear();
    for (const n of list) {
      const k = ((n.x / CELL) | 0) * 1000 + ((n.y / CELL) | 0);
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(n);
    }
  }
  function gridQuery(x, y, r, fn) {
    const x0 = ((x - r) / CELL) | 0;
    const x1 = ((x + r) / CELL) | 0;
    const y0 = ((y - r) / CELL) | 0;
    const y1 = ((y + r) / CELL) | 0;
    for (let i = x0; i <= x1; i++)
      for (let j = y0; j <= y1; j++) {
        const c = grid.get(i * 1000 + j);
        if (c) for (const n of c) fn(n);
      }
  }

  // ---------- 部屋 ----------
  function makeRoom(room) {
    const furn = [];
    const add = (x, y, w, h, kind) => furn.push({ x, y, w, h, kind });
    switch (room.floor) {
      case 'wood':
        add(260, 240, 190, 80, 'piano');
        add(880, 930, 120, 120, 'table');
        add(200, 1020, 60, 60, 'chair');
        add(1050, 260, 60, 60, 'chair');
        break;
      case 'marble':
        add(600, 250, 100, 100, 'column');
        add(250, 900, 100, 100, 'column');
        add(950, 900, 100, 100, 'column');
        add(560, 980, 190, 80, 'piano');
        break;
      default:
        add(560, 560, 190, 80, 'piano');
        add(230, 230, 90, 90, 'table');
        add(980, 980, 90, 90, 'table');
        add(980, 230, 60, 60, 'chair');
        add(230, 1010, 60, 60, 'chair');
    }
    // 床の絵 (1 回だけ描いておく)
    const c = document.createElement('canvas');
    c.width = ROOM;
    c.height = ROOM;
    const g = c.getContext('2d');
    if (room.floor === 'wood') {
      g.fillStyle = '#b98a5a';
      g.fillRect(0, 0, ROOM, ROOM);
      for (let y = 0; y < ROOM; y += 26) {
        const off = ((y / 26) % 3) * 70;
        for (let x = -off; x < ROOM; x += 210) {
          g.fillStyle = `hsl(28, ${38 + ((x * 7 + y) % 9)}%, ${44 + ((x * 13 + y * 3) % 7)}%)`;
          g.fillRect(x + 1, y + 1, 208, 24);
        }
      }
    } else if (room.floor === 'marble') {
      for (let y = 0; y < ROOM; y += 100)
        for (let x = 0; x < ROOM; x += 100) {
          g.fillStyle = ((x + y) / 100) % 2 ? '#e9e4da' : '#cfc6b6';
          g.fillRect(x, y, 100, 100);
        }
      g.strokeStyle = 'rgba(120,110,95,0.25)';
      for (let i = 0; i < 60; i++) {
        g.beginPath();
        const x = Math.random() * ROOM;
        const y = Math.random() * ROOM;
        g.moveTo(x, y);
        g.bezierCurveTo(x + rand(-40, 40), y + rand(-40, 40), x + rand(-80, 80), y + rand(-80, 80), x + rand(-120, 120), y + rand(-120, 120));
        g.stroke();
      }
    } else {
      g.fillStyle = '#5a1f2c';
      g.fillRect(0, 0, ROOM, ROOM);
      g.strokeStyle = '#c9a04a';
      g.lineWidth = 6;
      g.strokeRect(60, 60, ROOM - 120, ROOM - 120);
      g.lineWidth = 2;
      g.strokeRect(80, 80, ROOM - 160, ROOM - 160);
      g.fillStyle = 'rgba(201,160,74,0.18)';
      for (let y = 140; y < ROOM - 100; y += 90)
        for (let x = 140; x < ROOM - 100; x += 90) {
          g.beginPath();
          g.moveTo(x, y - 14);
          g.lineTo(x + 14, y);
          g.lineTo(x, y + 14);
          g.lineTo(x - 14, y);
          g.fill();
        }
    }
    // 五線のもよう (うすく)
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 2;
    for (let s = 0; s < 3; s++) {
      const y0 = 300 + s * 350;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(0, y0 + i * 18);
        g.lineTo(ROOM, y0 + i * 18);
        g.stroke();
      }
    }
    return { furn, floor: c };
  }

  // 円を家具と壁から押し出す
  function collide(o, r) {
    if (o.x < r) o.x = r;
    if (o.y < r) o.y = r;
    if (o.x > ROOM - r) o.x = ROOM - r;
    if (o.y > ROOM - r) o.y = ROOM - r;
    for (const f of G.room.furn) {
      const cx = clamp(o.x, f.x, f.x + f.w);
      const cy = clamp(o.y, f.y, f.y + f.h);
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          o.x = cx + (dx / d) * r;
          o.y = cy + (dy / d) * r;
        } else {
          // 中に入りこんだ: 一番近い辺へ
          const l = o.x - f.x;
          const rr = f.x + f.w - o.x;
          const t = o.y - f.y;
          const b = f.y + f.h - o.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) o.x = f.x - r;
          else if (m === rr) o.x = f.x + f.w + r;
          else if (m === t) o.y = f.y - r;
          else o.y = f.y + f.h + r;
        }
      }
    }
  }

  // ---------- 能力値 ----------
  function computeStats() {
    const P = G.passives;
    const up = G.up;
    const c = G.composer;
    const lv = (id) => P[id] || 0;
    const s = {};
    s.maxHp = c.hp + 20 * lv('tailcoat') + 10 * (up.hp || 0);
    s.might = (1 + 0.1 * lv('rosin')) * (1 + 0.05 * (up.might || 0)) * (G.own ? 1.1 : 1);
    s.armor = lv('soundproof') + (up.armor || 0);
    s.speed = 150 * c.speed * (1 + 0.03 * (up.speed || 0));
    s.cd = (1 - 0.08 * lv('metronome')) * (1 - 0.03 * (up.cd || 0)) * (c.id === 'chopin' ? 0.9 : 1);
    s.area = (1 + 0.1 * lv('stand')) * (1 + 0.05 * (up.area || 0));
    s.dur = (1 + 0.1 * lv('pedal')) * (1 + 0.05 * (up.dur || 0));
    s.amount = lv('pageturner');
    s.pspeed = 1 + 0.1 * lv('lungs');
    s.magnet = 70 * (1 + 0.2 * lv('applause')) * (1 + 0.1 * (up.magnet || 0));
    s.growth = (1 + 0.08 * lv('quill')) * (1 + 0.05 * (up.growth || 0)) * (c.id === 'mozart' ? 1.2 : 1);
    s.luck = (1 + 0.1 * lv('bouquet')) * (1 + 0.1 * (up.luck || 0));
    s.regen = 0.25 * lv('coffee') + 0.1 * (up.regen || 0);
    s.greed = 1 + 0.1 * (up.greed || 0);
    const old = G.stats;
    G.stats = s;
    if (old && s.maxHp > old.maxHp) G.player.hp += s.maxHp - old.maxHp;
    G.player.hp = Math.min(G.player.hp, s.maxHp);
  }
  // いまの攻撃力 (ベートーヴェンの「不屈」を含む)
  function might() {
    let m = G.stats.might;
    if (G.composer.id === 'beethoven' && G.player.hp < G.stats.maxHp * 0.5) m *= 1.3;
    return m;
  }

  // ---------- 開始 ----------
  // opt: { song, composer, mode, save (作曲家ごとの練習室の段階), sim }
  function start(opt) {
    const song = opt.song;
    const score = window.CS_SCORES[song.score];
    const hard = opt.mode === 'hard';
    const parsed = parseScore(score, hard ? HARD.tempo : 1);
    const composer = opt.composer;
    G = {
      song,
      score,
      parsed,
      composer,
      mode: opt.mode,
      hard,
      own: song.composer === composer.id,
      up: opt.up || {},
      sim: !!opt.sim,
      t: 0,
      phase: 'intro',
      phaseT: 0,
      paused: false,
      overlay: null, // 'level' などメニューを重ねている
      player: { x: 0, y: 0, r: 13, hp: 100, inv: 0, fx: 1, fy: 0, face: 1, walk: 0, hurtT: 0 },
      weapons: [],
      passives: {},
      stats: null,
      level: 1,
      xp: 0,
      xpNext: 0,
      notes: [],
      shots: [],
      fx: [],
      inks: [],
      items: [],
      bullets: [],
      zones: [],
      timers: [],
      texts: [],
      boss: null,
      track: null,
      btrack: null,
      beat: 0,
      tick: -1,
      bpm: parsed.bpmAt(0),
      spawned: 0,
      killed: 0,
      total: parsed.notes.length,
      encore: 0,
      codaT: 0,
      dmgTaken: 0,
      gold: 0,
      chestsGiven: 0,
      shake: 0,
      revived: false,
      rerolls: (opt.up && opt.up.reroll) || 0,
      pendingLevels: 0,
      result: null,
      camX: 0,
      camY: 0,
      dark: 0,
      lastPad: 0,
      showsDone: new Set(),
      resoT: 0,
      codaPadT: 0,
      songEnd: parsed.lengthSec,
    };
    G.room = makeRoom(song.room);
    G.player.x = ROOM * 0.5;
    G.player.y = ROOM * 0.82;
    G.boss = {
      x: ROOM * 0.5,
      y: ROOM * 0.28,
      r: 34,
      hp: 1,
      maxHp: 1,
      shield: true,
      tx: ROOM * 0.5,
      ty: ROOM * 0.3,
      pulse: 0,
      dash: null,
      hurtT: 0,
      def: song.boss,
    };
    // 武器
    addWeapon(composer.weapon);
    computeStats();
    G.player.hp = G.stats.maxHp;
    // 経験値の配分: 曲を最後まで弾くと、だいたい目標のレベルに届く
    const mins = parsed.lengthSec / 60;
    G.targetLv = clamp(Math.round(8 + mins * 5), 14, 30);
    let need = 0;
    for (let L = 1; L < G.targetLv; L++) need += xpReq(L);
    let wsum = 0;
    for (const n of parsed.notes) {
      n.w = Math.sqrt(logInterp(HP_TABLE, n.d) * clamp(Math.pow(1.35, -(n.p - 60) / 12), 0.4, 2.5));
      wsum += n.w;
    }
    G.xpPer = (need * 1.1) / wsum;
    G.xpNext = xpReq(1);
    markElites(parsed);
    G.track = new Track(parsed.notes);
    // 開演: 1 小節のカウントのあと曲が始まる
    const beatSec = 60 / G.bpm;
    const countBeats = Math.max(2, Math.min(4, Math.round(parsed.barLen)));
    const clicks = [];
    for (let i = 0; i < countBeats; i++) clicks.push([i * beatSec, i === 0]);
    G.track.start(0, countBeats * beatSec + 0.6, clicks.map(([t, s]) => [t + 0.6, s]));
    G.phase = 'song';
    G.camX = G.player.x;
    G.camY = G.player.y;
    return G;
  }

  // 強い音符 (アクセント) が少ない曲は、旋律の長い音を何個かエリートにする (楽譜ケースを出すため)
  function markElites(parsed) {
    const notes = parsed.notes;
    let elites = notes.filter((n) => n.mk.includes('>')).length;
    const want = Math.max(4, Math.round(parsed.lengthSec / 32));
    if (elites >= want) return;
    const span = parsed.lengthSec / (want - elites + 1);
    for (let k = 1; k <= want - elites; k++) {
      const a = span * k - span * 0.4;
      const b = span * k + span * 0.4;
      let best = null;
      for (const n of notes) {
        if (n.sec < a || n.sec > b || !n.melody || n.mk.includes('^')) continue;
        if (!best || n.d > best.d) best = n;
      }
      if (best && !best.mk.includes('>')) best.mk += '>';
    }
  }

  function xpReq(L) {
    // 最初の数レベルは早く上がる (楽譜どおりの音数だと出だしから密度が高いため)
    return Math.round(3 + L * 2.6 + Math.max(0, L - 5) * 1.2 + Math.max(0, L - 20) * 3);
  }

  // ---------- 武器とパッシブ ----------
  function addWeapon(id) {
    const w = { id, lv: 1, evo: false, t: 0.5, ready: false, side: 1, a: 0, n: 0 };
    G.weapons.push(w);
    return w;
  }
  function wParams(w) {
    return D.WEAPONS[w.id].lv(w.lv);
  }

  // 一番近い音符 (いなければ null)
  function nearest(x, y, maxD = 600, skip) {
    let best = null;
    let bd = maxD * maxD;
    for (const n of G.notes) {
      if (n.dead || n.charm > 0 || n === skip) continue;
      const d = dist2(x, y, n.x, n.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    // 決戦ではボスも狙う
    if (!best && G.phase === 'battle') {
      const b = G.boss;
      if (dist2(x, y, b.x, b.y) < maxD * maxD * 1.5) return b;
    }
    return best;
  }

  function aimAt(target) {
    const p = G.player;
    if (target) {
      const a = Math.atan2(target.y - p.y, target.x - p.x);
      return a;
    }
    return Math.atan2(p.fy, p.fx);
  }

  // 音符にダメージを与える。reg は楽器の得意な音域
  function hitNote(n, dmg, opt = {}) {
    if (n === G.boss) {
      hitBoss(dmg, opt);
      return;
    }
    if (n.dead) return;
    let d = dmg * might();
    if (opt.reg && (opt.reg === 'all' || opt.reg === n.reg)) {
      if (opt.reg !== 'all') {
        d *= 1.5;
        if (G.t - G.resoT > 0.6 && Math.random() < 0.15) {
          G.resoT = G.t;
          addText(n.x, n.y - n.r - 8, T('resonance'), '#fff6a8', 0.7, 12);
        }
      }
    }
    n.hp -= d;
    n.flash = 0.12;
    if (opt.kb) {
      const p = G.player;
      const a = opt.kbFrom ? Math.atan2(n.y - opt.kbFrom.y, n.x - opt.kbFrom.x) : Math.atan2(n.y - p.y, n.x - p.x);
      const k = opt.kb / (1 + n.d * 0.4);
      n.kx += Math.cos(a) * k;
      n.ky += Math.sin(a) * k;
    }
    if (opt.slow) {
      n.slowT = Math.max(n.slowT, opt.slowT || 1);
      n.slowF = Math.min(n.slowF || 1, 1 - opt.slow);
    }
    if (opt.stun) n.stunT = Math.max(n.stunT, opt.stun);
    if (opt.charm && n.hp > 0 && !n.boss && !n.fermata && Math.random() < opt.charm) {
      n.charm = 5;
    }
    if (n.hp <= 0) killNote(n);
  }

  function hitBoss(dmg, opt = {}) {
    const b = G.boss;
    if (b.shield) {
      if (G.t - (b.clangT || 0) > 0.25) {
        b.clangT = G.t;
        Synth.sfx('clang');
      }
      return;
    }
    if (G.phase !== 'battle') return;
    b.hp -= dmg * might();
    b.hurtT = 0.1;
    if (b.hp <= 0) {
      b.hp = 0;
      winStage();
    }
    void opt;
  }

  function killNote(n) {
    if (n.dead) return;
    n.dead = true;
    G.killed++;
    // インク (経験値)
    const xp = n.xp;
    G.xpDropped = (G.xpDropped || 0) + xp;
    G.inks.push({ x: n.x, y: n.y, v: xp, vx: rand(-30, 30), vy: rand(-30, 30), r: xp > G.xpPer * 6 ? 7 : xp > G.xpPer * 2.5 ? 5.5 : 4, col: n.col, pull: false });
    // 落とし物
    const L = G.stats.luck;
    const r = Math.random();
    if (n.elite || n.fermata) {
      if (n.fermata || Math.random() < 0.6 * L) G.items.push({ x: n.x, y: n.y, kind: 'chest', t: 0 });
    } else if (r < 0.004 * L) G.items.push({ x: n.x, y: n.y, kind: 'coffee', t: 0 });
    else if (r < 0.0055 * L) G.items.push({ x: n.x, y: n.y, kind: 'applause', t: 0 });
    else if (r < 0.0065 * L) G.items.push({ x: n.x, y: n.y, kind: 'rest', t: 0 });
    else if (r < 0.0075 * L) G.items.push({ x: n.x, y: n.y, kind: 'ffff', t: 0 });
    else if (r < 0.0175 * L) G.items.push({ x: n.x, y: n.y, kind: 'ducat', t: 0 });
    // はじける
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(60, 160);
      G.fx.push({ kind: 'spark', x: n.x, y: n.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.35, col: n.col });
    }
    if (Math.random() < 0.35) Synth.sfx('pop', { p: scaleTone(n.p) });
  }

  // 曲の調の音階にそろえた効果音の高さ
  function scaleTone(p) {
    const key = G.score.key || { tonic: 0, minor: false };
    const sc = key.minor ? [0, 2, 3, 5, 7, 8, 11] : [0, 2, 4, 5, 7, 9, 11];
    let q = clamp(p, 70, 90);
    for (let i = 0; i < 12; i++) {
      if (sc.includes((((q - key.tonic) % 12) + 12) % 12)) return q;
      q++;
    }
    return q;
  }

  // ---------- 音符を出す ----------
  function spawnNote(src) {
    const b = G.boss;
    const hardMul = G.hard ? HARD.hp : 1;
    const encMul = Math.pow(1.15, G.encore);
    const o = (src.p - 60) / 12;
    // 曲の出だしは弱め (120 秒かけて本来の強さに)。伴奏の音符は旋律より少し脆い
    const ramp = G.encore ? 1 : Math.min(1, 0.3 + (0.7 * G.t) / 120);
    const accomp = src.melody ? 1 : 0.75;
    let hp = logInterp(HP_TABLE, src.d) * clamp(Math.pow(1.35, -o), 0.4, 2.5) * STAR_MUL[G.song.stars - 1] * hardMul * encMul * ramp * accomp;
    let r = logInterp(R_TABLE, src.d);
    let spd = clamp(55 * Math.pow(1.4, o), 22, 150) * Math.pow(1.04, G.encore);
    const mk = src.mk || '';
    const n = {
      x: b.x,
      y: b.y,
      p: src.p,
      d: src.d,
      reg: regOf(src.p),
      col: pitchColor(src.p),
      melody: src.melody,
      v: src.v,
      kx: 0,
      ky: 0,
      flash: 0,
      slowT: 0,
      slowF: 1,
      stunT: 0,
      charm: 0,
      hitCD: 0,
      dead: false,
      launch: 0.4,
      stacc: mk.includes("'"),
      trill: mk.includes('~'),
      elite: mk.includes('>'),
      fermata: mk.includes('^'),
      grace: mk.includes('g'),
      sharp: BLACK_KEYS.includes(src.p % 12),
      phase: Math.random() * 6.28,
      dashT: rand(0, 1.2),
      t: 0,
    };
    if (src.cr) {
      hp *= 1 + 0.5 * src.cr;
      r *= 1 + 0.15 * src.cr;
    }
    if (n.v >= 4) r *= n.v === 5 ? 1.2 : 1.1;
    if (n.elite) {
      hp *= 4;
      r *= 1.25;
    }
    if (n.fermata) {
      hp *= 8;
      r *= 1.6;
      spd *= 0.8;
    }
    if (n.grace) {
      hp = 1;
      r = 5;
    }
    n.hp = n.maxHp = hp;
    n.r = r;
    n.spd = spd;
    n.dmg = DYN_DMG[n.v] * (G.hard ? HARD.dmg : 1) * (n.fermata ? 1.6 : 1) * (0.4 + 0.6 * ramp);
    n.xp = G.xpPer * (src.w || 1) * (n.melody ? 1.5 : 1) * (n.elite ? 3 : 1);
    // 吐き出す向き: 主人公の方向 ± 60° (和音は扇に広がる)
    const p = G.player;
    let a = Math.atan2(p.y - b.y, p.x - b.x) + rand(-1, 1) * 1.05;
    if (src.chord > 1) a += ((src.p % 7) - 3) * 0.25;
    n.lvx = Math.cos(a) * 190;
    n.lvy = Math.sin(a) * 190;
    n.x += Math.cos(a) * (b.r * 0.6);
    n.y += Math.sin(a) * (b.r * 0.6);
    if (G.notes.length >= MAX_NOTES) {
      // 上限を超えたら、同じ高さの音符に重ねる
      let host = null;
      for (const m of G.notes) if (!m.dead && m.p === n.p) host = m;
      if (!host) host = G.notes[(Math.random() * G.notes.length) | 0];
      host.hp += n.hp * 0.7;
      host.maxHp += n.hp * 0.7;
      host.xp += n.xp;
      host.r = Math.min(host.r * 1.04, 26);
      G.killed++; // 数は合わせる (重ねた音符はいなくなった扱い)
      return;
    }
    G.notes.push(n);
    G.spawned++;
    b.pulse = 1;
  }

  // ---------- レベルアップ ----------
  function gainXp(v) {
    G.xp += v * G.stats.growth;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.level++;
      G.xpNext = xpReq(G.level);
      G.pendingLevels++;
      if (G.choices) window.CSUI.levelDockCount(G.pendingLevels);
    }
  }

  function weaponUnlocked(id) {
    const lock = D.WEAPONS[id].locked;
    return !lock || (window.CSUI && window.CSUI.songClearedByAnyone(lock));
  }

  // レベルアップの候補を作る
  function makeChoices() {
    const pool = [];
    for (const w of G.weapons) if (!w.evo && w.lv < 8) pool.push({ kind: 'weapon', id: w.id, lv: w.lv + 1, weight: 3 });
    for (const [id, lv] of Object.entries(G.passives)) if (lv < D.PASSIVES[id].max) pool.push({ kind: 'passive', id, lv: lv + 1, weight: 2.5 });
    if (G.weapons.length < 4)
      for (const id of Object.keys(D.WEAPONS))
        if (!G.weapons.some((w) => w.id === id) && weaponUnlocked(id)) pool.push({ kind: 'weapon', id, lv: 1, weight: 1.6, isNew: true });
    if (Object.keys(G.passives).length < 4)
      for (const id of Object.keys(D.PASSIVES)) if (!(id in G.passives)) pool.push({ kind: 'passive', id, lv: 1, weight: 1.2, isNew: true });
    const n = (G.up.choices ? 4 : 3);
    const out = [];
    while (out.length < n && pool.length) {
      let sum = 0;
      for (const c of pool) sum += c.weight;
      let r = Math.random() * sum;
      let idx = 0;
      for (; idx < pool.length; idx++) {
        r -= pool[idx].weight;
        if (r <= 0) break;
      }
      idx = Math.min(idx, pool.length - 1);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    if (!out.length) {
      out.push({ kind: 'heal' });
      out.push({ kind: 'gold' });
    }
    return out;
  }

  function applyChoice(c) {
    // 候補を出してから選ぶまでの間に、楽譜ケースで上がっていることがあるので上限を守る
    if (c.kind === 'weapon') {
      const w = G.weapons.find((x) => x.id === c.id);
      if (w) w.lv = Math.min(8, w.lv + 1);
      else if (G.weapons.length < 4) addWeapon(c.id);
    } else if (c.kind === 'passive') {
      if (c.id in G.passives || Object.keys(G.passives).length < 4) G.passives[c.id] = Math.min(D.PASSIVES[c.id].max, (G.passives[c.id] || 0) + 1);
    } else if (c.kind === 'heal') {
      G.player.hp = Math.min(G.stats.maxHp, G.player.hp + 30);
    } else if (c.kind === 'gold') {
      G.gold += 10;
    }
    computeStats();
  }

  // 楽譜ケース (宝箱): 進化できるものがあれば進化、なければ 1〜3 個レベルアップ
  function openChest() {
    Synth.sfx('chest', { p: 72 });
    const evo = G.weapons.find((w) => !w.evo && w.lv >= 8 && G.passives[D.WEAPONS[w.id].passive]);
    if (evo) {
      evo.evo = true;
      const name = L(D.EVOS[D.WEAPONS[evo.id].evo].name);
      addBanner(T('evolved').replace('{w}', name), '#e7c3ff');
      Synth.sfx('cymbal');
      return;
    }
    const k = Math.random() < 0.1 * G.stats.luck ? 3 : 1;
    const got = [];
    for (let i = 0; i < k; i++) {
      const opts = [];
      for (const w of G.weapons) if (!w.evo && w.lv < 8) opts.push(() => (w.lv++, L(D.WEAPONS[w.id].name) + ' Lv' + w.lv));
      for (const [id, lv] of Object.entries(G.passives)) if (lv < D.PASSIVES[id].max) opts.push(() => (G.passives[id]++, L(D.PASSIVES[id].name) + ' Lv' + G.passives[id]));
      if (!opts.length) {
        G.gold += 15;
        got.push('+15 ' + T('ducats'));
        continue;
      }
      got.push(opts[(Math.random() * opts.length) | 0]());
    }
    computeStats();
    addBanner('🎼 ' + got.join(' / '), '#ffe9a8');
  }

  // ---------- テキストと演出 ----------
  function addText(x, y, s, col, life = 0.9, size = 14) {
    G.texts.push({ x, y, s, col, t: 0, life, size, world: true });
  }
  function addBanner(s, col = '#fff') {
    G.texts.push({ s, col, t: 0, life: 2.6, size: 20, world: false });
  }

  // ---------- 1 フレーム ----------
  function update(dt) {
    if (!G || G.paused || G.overlay) return;
    G.t += dt;
    G.phaseT += dt;
    const p = G.player;
    const S = G.stats;
    const tr = G.phase === 'battle' ? G.btrack : G.track;
    const pos = tr ? tr.pos() : 0;

    // 拍の時計 (楽器の攻撃は 16 分音符の刻みに合わせる)
    if (G.phase === 'song' && pos >= 0) {
      G.beat = G.parsed.secToBeat(pos);
      G.bpm = G.parsed.bpmAt(G.beat);
    } else if (G.phase === 'battle' && pos >= 0) {
      G.beat = (pos * G.bpm) / 60;
    } else {
      G.beat += (dt * G.bpm) / 60;
    }
    const tick = Math.floor(G.beat * 4);
    const newTick = tick !== G.tick;
    G.tick = tick;

    G.maxAlive = Math.max(G.maxAlive || 0, G.notes.length);
    if (G.sim) {
      G.lvAt = G.lvAt || {};
      const k = Math.floor(G.t / 30) * 30;
      if (!(k in G.lvAt)) G.lvAt[k] = G.level + '/' + Math.round(G.player.hp);
    }
    // --- 段階 ---
    if (G.phase === 'song') {
      for (const n of G.track.due(pos)) spawnNote(n);
      runShows();
      if (pos > G.songEnd + 0.3 && G.track.remaining() === 0) {
        G.phase = 'coda';
        G.phaseT = 0;
        G.codaT = 0;
        // 曲が終わったら拍手: 部屋中のインクを集める
        for (const k of G.inks) k.pull = true;
        addBanner(T('remainNotes'), '#ffe9a8');
      }
    } else if (G.phase === 'coda') {
      G.codaT += dt;
      G.codaPadT -= dt;
      if (G.codaPadT <= 0 && !G.sim) {
        // 最後の和音を小さく鳴らし続ける
        G.codaPadT = 3.2;
        const last = G.parsed.notes.filter((n) => n.sec >= G.parsed.lengthSec - 3);
        const t0 = Synth.now() + 0.02;
        for (const n of last.slice(-4)) Synth.play('strings', n.p, t0, 3, 0.18);
      }
      if (!G.notes.length) {
        G.phase = 'break';
        G.phaseT = 0;
        G.track.stop();
        Synth.sfx('cymbal');
        G.boss.shield = false;
        G.shake = 0.5;
        addBanner(T('shieldBreak'), '#ffd27a');
        for (let i = 0; i < 5; i++) G.fx.push({ kind: 'line', x: G.boss.x, y: G.boss.y, a: (i / 5) * 6.28, t: 0, life: 0.9 });
      } else if (G.codaT > ENCORE_WAIT) {
        startEncore();
      }
    } else if (G.phase === 'break') {
      if (G.phaseT > 1.4) startBattle();
    } else if (G.phase === 'battle') {
      for (const n of G.btrack.due(pos)) bossFire(n);
      if (newTick && tick % (G.btrack.barTicks * 2) === 0) bossDash();
    } else if (G.phase === 'win') {
      if (G.phaseT > 3 && !G.result) finish(true);
    } else if (G.phase === 'dead') {
      if (G.phaseT > 1.6 && !G.result) finish(false);
    }

    // --- 主人公 ---
    if (G.phase !== 'dead' && G.phase !== 'win') {
      let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.jx;
      let my = (input.down ? 1 : 0) - (input.up ? 1 : 0) + input.jy;
      if (G.bot) [mx, my] = botMove();
      const m = Math.hypot(mx, my);
      if (m > 0.05) {
        const k = Math.min(1, m) / m;
        mx *= k;
        my *= k;
        p.fx = mx;
        p.fy = my;
        if (Math.abs(mx) > 0.1) p.face = mx > 0 ? 1 : -1;
        p.walk += dt * 10;
      }
      p.x += mx * S.speed * dt;
      p.y += my * S.speed * dt;
      collide(p, p.r);
      p.hp = Math.min(S.maxHp, p.hp + S.regen * dt);
    }
    p.inv -= dt;
    p.hurtT -= dt;

    // --- 楽器 ---
    if (G.phase !== 'dead' && G.phase !== 'win') updateWeapons(dt, newTick);

    // --- 音符 ---
    gridBuild(G.notes);
    let fermataAlive = false;
    for (const n of G.notes) if (n.fermata && !n.dead) fermataAlive = true;
    for (const n of G.notes) updateNote(n, dt, fermataAlive);
    G.notes = G.notes.filter((n) => !n.dead);

    // --- 弾・ゾーン・遅れて出る攻撃 ---
    updateShots(dt);
    for (const z of G.zones) {
      z.t += dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.45;
        gridQuery(z.x, z.y, z.r + 20, (n) => {
          if (!n.dead && dist2(n.x, n.y, z.x, z.y) < (z.r + n.r) * (z.r + n.r)) hitNote(n, z.dmg, { reg: 'lo', slow: z.slow, slowT: 0.6 });
        });
        if (G.phase === 'battle' && dist2(G.boss.x, G.boss.y, z.x, z.y) < (z.r + G.boss.r) ** 2) hitBoss(z.dmg);
      }
    }
    G.zones = G.zones.filter((z) => z.t < z.life);
    for (const tm of G.timers) {
      tm.t -= dt;
      if (tm.t <= 0) tm.fn();
    }
    G.timers = G.timers.filter((tm) => tm.t > 0);

    // --- ボス ---
    updateBoss(dt);

    // --- 弾 (ボス) ---
    for (const b of G.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.t += dt;
      if (G.phase !== 'dead' && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 3) ** 2) {
        hurt(b.dmg);
        b.t = 99;
      }
    }
    G.bullets = G.bullets.filter((b) => b.t < 6 && b.x > -20 && b.y > -20 && b.x < ROOM + 20 && b.y < ROOM + 20);

    // --- インクと落とし物 ---
    const mag = S.magnet;
    for (const k of G.inks) {
      const d2 = dist2(k.x, k.y, p.x, p.y);
      if (k.pull || d2 < mag * mag) {
        k.pull = true;
        const d = Math.sqrt(d2) || 1;
        const sp = 420 + (k.sp || 0);
        k.sp = (k.sp || 0) + dt * 600;
        k.x += ((p.x - k.x) / d) * sp * dt;
        k.y += ((p.y - k.y) / d) * sp * dt;
        if (d < p.r + 6) {
          k.got = true;
          G.xpGot = (G.xpGot || 0) + k.v;
          gainXp(k.v);
          if (Math.random() < 0.3) Synth.sfx('pick', { p: 84 + ((G.level * 2) % 12) });
        }
      } else {
        // 近くのインクは、ゆっくり作曲家に寄ってくる
        if (d2 < (mag * 3.2) ** 2) {
          const d = Math.sqrt(d2) || 1;
          k.vx += ((p.x - k.x) / d) * 90 * dt;
          k.vy += ((p.y - k.y) / d) * 90 * dt;
        }
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.vx *= 0.96;
        k.vy *= 0.96;
      }
    }
    G.inks = G.inks.filter((k) => !k.got);
    for (const it of G.items) {
      it.t += dt;
      if (dist2(it.x, it.y, p.x, p.y) < (p.r + 16) ** 2) {
        it.got = true;
        pickItem(it);
      }
    }
    G.items = G.items.filter((it) => !it.got);

    // --- 演出 ---
    for (const f of G.fx) {
      f.t += dt;
      if (f.vx !== undefined) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vx *= 0.92;
        f.vy *= 0.92;
      }
    }
    G.fx = G.fx.filter((f) => f.t < f.life);
    for (const t of G.texts) {
      t.t += dt;
      if (t.world) t.y -= 20 * dt;
    }
    G.texts = G.texts.filter((t) => t.t < t.life);
    G.shake = Math.max(0, G.shake - dt);
    if (G.dark > 0) G.dark = Math.max(0, G.dark - dt * 0.05);

    // カメラ
    G.camX += (p.x - G.camX) * Math.min(1, dt * 10);
    G.camY += (p.y - G.camY) * Math.min(1, dt * 10);

    // レベルアップ: 曲もゲームも止めずに、画面の下に候補を出す (選ぶまで次の候補は待つ)
    if (G.pendingLevels > 0 && !G.choices && G.phase !== 'dead' && G.phase !== 'win') {
      G.pendingLevels--;
      openLevelUp();
    }
    if ((G.phase === 'dead' || G.phase === 'win') && G.choices) {
      G.choices = null;
      window.CSUI.hideLevelDock();
    }
  }

  function hurt(dmg) {
    const p = G.player;
    if (p.inv > 0 || G.phase === 'dead' || G.phase === 'win') return;
    const d = Math.max(1, dmg - G.stats.armor);
    p.hp -= d;
    G.dmgTaken += d;
    p.inv = 0.5;
    p.hurtT = 0.2;
    G.shake = Math.max(G.shake, 0.18);
    Synth.sfx('hurt');
    if (p.hp <= 0) {
      if (G.up.revive && !G.revived) {
        G.revived = true;
        p.hp = G.stats.maxHp * 0.5;
        p.inv = 2;
        addBanner(T('revived'), '#ffe9a8');
        for (const n of G.notes) {
          const a = Math.atan2(n.y - p.y, n.x - p.x);
          n.kx += Math.cos(a) * 600;
          n.ky += Math.sin(a) * 600;
        }
        return;
      }
      p.hp = 0;
      G.phase = 'dead';
      G.phaseT = 0;
      (G.phase === 'battle' ? G.btrack : G.track)?.stop();
      if (G.btrack) G.btrack.stop();
      G.track.stop();
    }
  }

  function updateNote(n, dt, fermataAlive) {
    const p = G.player;
    n.t += dt;
    n.flash -= dt;
    n.hitCD -= dt;
    n.slowT -= dt;
    if (n.slowT <= 0) n.slowF = 1;
    n.stunT -= dt;
    if (n.launch > 0) {
      n.launch -= dt;
      n.x += n.lvx * dt;
      n.y += n.lvy * dt;
      n.lvx *= 0.94;
      n.lvy *= 0.94;
      collide(n, n.r);
      return;
    }
    let tx = p.x;
    let ty = p.y;
    if (n.charm > 0) {
      // 魅了: ほかの音符を追いかけて体当たりする
      n.charm -= dt;
      const t = nearest(n.x, n.y, 500, n);
      if (t && t !== G.boss) {
        tx = t.x;
        ty = t.y;
        if (dist2(n.x, n.y, t.x, t.y) < (n.r + t.r) ** 2 && n.hitCD <= 0) {
          n.hitCD = 0.3;
          hitNote(t, 10, {});
        }
      }
      if (n.charm <= 0) killNote(n);
    }
    let sp = n.spd * n.slowF * (fermataAlive && !n.fermata ? 0.7 : 1);
    if (n.stunT > 0) sp = 0;
    if (G.restT > G.t) sp = 0;
    if (n.stacc) {
      n.dashT -= dt;
      if (n.dashT < 0) n.dashT = 1.2;
      if (n.dashT < 0.25) sp *= 3;
      else sp *= 0.6;
    }
    let dx = tx - n.x;
    let dy = ty - n.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    if (n.trill) {
      const w = Math.sin(n.t * 14 + n.phase) * 0.9;
      const ox = -dy * w;
      const oy = dx * w;
      dx += ox;
      dy += oy;
    }
    n.x += (dx * sp + n.kx) * dt;
    n.y += (dy * sp + n.ky) * dt;
    n.kx *= Math.pow(0.002, dt);
    n.ky *= Math.pow(0.002, dt);
    // 押し合い
    gridQuery(n.x, n.y, n.r + 22, (m) => {
      if (m === n || m.dead) return;
      const rr = n.r + m.r;
      const ddx = n.x - m.x;
      const ddy = n.y - m.y;
      const dd = ddx * ddx + ddy * ddy;
      if (dd < rr * rr && dd > 0.01) {
        const q = Math.sqrt(dd);
        const push = ((rr - q) / q) * 0.25;
        n.x += ddx * push;
        n.y += ddy * push;
      }
    });
    collide(n, n.r);
    // 主人公に当たる
    if (n.charm <= 0 && G.phase !== 'dead') {
      const hr = n.r * (n.trill ? 0.8 : 1) + p.r - 4;
      if (dist2(n.x, n.y, p.x, p.y) < hr * hr) hurt(n.dmg);
    }
  }

  // ---------- 楽器の動き ----------
  function updateWeapons(dt, newTick) {
    const S = G.stats;
    for (const w of G.weapons) {
      const P = wParams(w);
      if (w.id === 'harp') {
        updateHarp(w, P, dt);
        continue;
      }
      w.t -= dt;
      if (w.t <= 0) w.ready = true;
      // 攻撃は 16 分音符の刻みに合わせる
      if (w.ready && newTick) {
        w.ready = false;
        w.t = P.cd * S.cd * (w.evo ? 0.85 : 1);
        // 最初の楽器はその作曲家の得意な楽器 (攻撃力 +25%)
        if (w.id === G.composer.weapon) P.dmg *= 1.25;
        fire(w, P);
      }
    }
  }

  function fire(w, P) {
    const p = G.player;
    const S = G.stats;
    const reg = D.WEAPONS[w.id].reg;
    switch (w.id) {
      case 'piano': {
        const t = nearest(p.x, p.y, 520);
        const base = aimAt(t);
        const cnt = P.count + S.amount + (G.composer.id === 'chopin' ? 1 : 0);
        const per = w.evo ? 3 : 1;
        for (let i = 0; i < cnt; i++) {
          for (let j = 0; j < per; j++) {
            const a = base + (i - (cnt - 1) / 2) * 0.16 + (j - (per - 1) / 2) * 0.09;
            const sp = P.speed * S.pspeed;
            G.shots.push({ kind: 'key', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, dmg: P.dmg, pierce: P.pierce + (w.evo ? 2 : 0), t: 0, life: 1.1 * S.pspeed, hit: new Set(), reg, burst: w.evo });
          }
        }
        Synth.sfx('shot', { p: scaleTone(84) });
        break;
      }
      case 'baton': {
        const t = nearest(p.x, p.y, 300);
        const base = t ? aimAt(t) : Math.atan2(p.fy, p.fx);
        const range = P.range * S.area * (w.evo ? 1.2 : 1);
        const sides = w.evo ? [0] : P.both ? [0, Math.PI] : [w.side > 0 ? 0 : Math.PI];
        w.side = -w.side;
        const half = w.evo ? Math.PI : 1.15;
        for (const s of sides) {
          const dir = base + s;
          G.fx.push({ kind: 'arc', x: p.x, y: p.y, a: dir, half, r: range, t: 0, life: 0.22, col: w.evo ? '#ffe28a' : '#fff' });
          sweep(p.x, p.y, range, dir, half, (n) => hitNote(n, P.dmg, { reg, kb: 80, slow: w.evo ? 0.5 : 0, slowT: 2 }));
        }
        break;
      }
      case 'timpani': {
        const r = P.radius * S.area;
        const ring = (rr, stun) => {
          G.fx.push({ kind: 'ring', x: p.x, y: p.y, r: rr, t: 0, life: 0.35, col: '#ffcf7a' });
          G.shake = Math.max(G.shake, 0.08);
          gridQuery(p.x, p.y, rr + 30, (n) => {
            if (!n.dead && dist2(n.x, n.y, p.x, p.y) < (rr + n.r) ** 2) hitNote(n, P.dmg, { reg, kb: P.kb, stun });
          });
          if (G.phase === 'battle' && dist2(G.boss.x, G.boss.y, p.x, p.y) < (rr + G.boss.r) ** 2) hitBoss(P.dmg);
        };
        ring(r, w.evo ? 0.4 : 0);
        if (w.evo) G.timers.push({ t: 0.25, fn: () => ring(r * 1.3, 0.4) });
        Synth.sfx('boom');
        break;
      }
      case 'violin': {
        const cnt = P.count + S.amount;
        let skip = null;
        for (let i = 0; i < cnt; i++) {
          const t = nearest(p.x, p.y, 600, skip);
          skip = t;
          const a = t ? aimAt(t) : Math.atan2(p.fy, p.fx) + i * Math.PI;
          const len = P.len * S.area * (w.evo ? 1.5 : 1) * S.pspeed;
          const width = P.width * (w.evo ? 2 : 1) * S.area;
          const beam = { kind: 'beam', x: p.x, y: p.y, a, len, width, t: 0, life: w.evo ? 0.6 * S.dur : 0.2, tick: 0, dmg: P.dmg, evo: w.evo, follow: w.evo };
          G.fx.push(beam);
          beamHit(beam, P.dmg, reg);
          if (w.evo) beam.repeat = (b) => beamHit(b, P.dmg * 0.35, reg);
        }
        break;
      }
      case 'cello': {
        const r = P.radius * S.area * (w.evo ? 2.2 : 1);
        G.zones.push({ x: p.x, y: p.y, r, t: 0, life: P.life * S.dur, tick: 0, dmg: P.dmg * (w.evo ? 1.6 : 1), slow: w.evo ? 0.4 : P.slow });
        break;
      }
      case 'flute': {
        const cnt = P.count + S.amount;
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = P.speed * S.pspeed;
          G.shots.push({ kind: 'wind', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, r: 6, dmg: P.dmg, pierce: 1, t: 0, life: 2.4 * S.dur, hit: new Set(), reg, homing: true, charm: w.evo ? 0.1 : 0 });
        }
        break;
      }
      case 'trumpet': {
        const t = nearest(p.x, p.y, 300);
        const moving = Math.hypot(input.jx + (input.right - input.left), input.jy + (input.down - input.up)) > 0.1;
        const base = moving ? Math.atan2(p.fy, p.fx) : aimAt(t);
        const range = P.range * S.area * S.pspeed;
        const blast = (dir) => {
          G.fx.push({ kind: 'cone', x: p.x, y: p.y, a: dir, half: P.arc / 2, r: range, t: 0, life: 0.25 });
          sweep(p.x, p.y, range, dir, P.arc / 2, (n) => hitNote(n, P.dmg, { reg, kb: P.kb }));
        };
        const dirs = w.evo ? [base, base + Math.PI] : [base];
        for (const d of dirs) blast(d);
        if (w.evo) G.timers.push({ t: 0.3, fn: () => dirs.forEach(blast) });
        break;
      }
      case 'cymbal': {
        const cnt = P.count + S.amount;
        const t = nearest(p.x, p.y, 500);
        const base = aimAt(t);
        const throwOne = (a) => {
          const sp = 380 * S.pspeed;
          G.shots.push({ kind: 'cymbal', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, r: 13 * S.area, dmg: P.dmg, pierce: 999, t: 0, life: 4, hit: new Set(), reg, boomer: true, dist: P.dist * S.pspeed, out: 0, back: false, evo: w.evo, spin: 0 });
        };
        for (let i = 0; i < cnt; i++) {
          const a = base + (i - (cnt - 1) / 2) * 0.5;
          throwOne(a);
          if (w.evo) throwOne(a + Math.PI);
        }
        break;
      }
      case 'organ': {
        const cnt = P.count + S.amount + (w.evo ? 3 : 0);
        const r = P.radius * S.area * (w.evo ? 1.5 : 1);
        const vis = G.notes.filter((n) => Math.abs(n.x - G.camX) < W / scale / 2 && Math.abs(n.y - G.camY) < H / scale / 2);
        for (let i = 0; i < cnt; i++) {
          let tx;
          let ty;
          if (vis.length) {
            const n = vis[(Math.random() * vis.length) | 0];
            tx = n.x;
            ty = n.y;
          } else if (G.phase === 'battle') {
            tx = G.boss.x + rand(-30, 30);
            ty = G.boss.y + rand(-30, 30);
          } else {
            tx = p.x + rand(-200, 200);
            ty = p.y + rand(-200, 200);
          }
          G.fx.push({ kind: 'pipeWarn', x: tx, y: ty, r, t: 0, life: 0.35 });
          G.timers.push({
            t: 0.35,
            fn: () => {
              G.fx.push({ kind: 'pipe', x: tx, y: ty, r, t: 0, life: 0.4 });
              gridQuery(tx, ty, r + 30, (n) => {
                if (!n.dead && dist2(n.x, n.y, tx, ty) < (r + n.r) ** 2) hitNote(n, P.dmg, { reg });
              });
              if (G.phase === 'battle' && dist2(G.boss.x, G.boss.y, tx, ty) < (r + G.boss.r) ** 2) hitBoss(P.dmg);
            },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  // 扇形の範囲の音符に fn
  function sweep(x, y, r, dir, half, fn) {
    gridQuery(x, y, r + 30, (n) => {
      if (n.dead) return;
      const dx = n.x - x;
      const dy = n.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r + n.r) return;
      let da = Math.atan2(dy, dx) - dir;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) <= half + n.r / Math.max(d, 1)) fn(n);
    });
    if (G.phase === 'battle') {
      const b = G.boss;
      const d = Math.hypot(b.x - x, b.y - y);
      let da = Math.atan2(b.y - y, b.x - x) - dir;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (d < r + b.r && Math.abs(da) <= half + 0.4) fn(b);
    }
  }

  function beamHit(b, dmg, reg) {
    const ex = b.x + Math.cos(b.a) * b.len;
    const ey = b.y + Math.sin(b.a) * b.len;
    const test = (n) => {
      const vx = ex - b.x;
      const vy = ey - b.y;
      const l2 = vx * vx + vy * vy;
      const tt = clamp(((n.x - b.x) * vx + (n.y - b.y) * vy) / l2, 0, 1);
      const px = b.x + vx * tt;
      const py = b.y + vy * tt;
      return dist2(n.x, n.y, px, py) < (b.width / 2 + n.r) ** 2;
    };
    for (const n of G.notes) if (!n.dead && test(n)) hitNote(n, dmg, { reg });
    if (G.phase === 'battle' && test(G.boss)) hitBoss(dmg);
  }

  function updateHarp(w, P, dt) {
    const p = G.player;
    if (w.id === G.composer.weapon) P.dmg *= 1.25;
    const S = G.stats;
    const cnt = (P.count + S.amount) * (w.evo ? 2 : 1);
    const rad = (P.radius + (w.evo ? 30 : 0)) * S.area;
    w.a += P.spin * dt;
    w.pts = [];
    for (let i = 0; i < cnt; i++) {
      const a = w.a + (i / cnt) * Math.PI * 2;
      const x = p.x + Math.cos(a) * rad;
      const y = p.y + Math.sin(a) * rad;
      w.pts.push([x, y, a]);
      gridQuery(x, y, 40, (n) => {
        if (n.dead || n.harpT > G.t) return;
        if (dist2(n.x, n.y, x, y) < (14 + n.r) ** 2) {
          n.harpT = G.t + 0.45;
          hitNote(n, P.dmg, { reg: 'all', kb: 40, kbFrom: p });
        }
      });
      if (G.phase === 'battle' && dist2(G.boss.x, G.boss.y, x, y) < (14 + G.boss.r) ** 2 && (G.boss.harpT || 0) < G.t) {
        G.boss.harpT = G.t + 0.45;
        hitBoss(P.dmg);
      }
    }
  }

  function updateShots(dt) {
    const p = G.player;
    for (const s of G.shots) {
      s.t += dt;
      if (s.homing) {
        if (!s.target || s.target.dead) s.target = nearest(s.x, s.y, 500);
        if (s.target && s.t > 0.15) {
          const a = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let da = a - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const na = cur + clamp(da, -6 * dt, 6 * dt);
          s.vx = Math.cos(na) * s.sp;
          s.vy = Math.sin(na) * s.sp;
        }
      }
      if (s.boomer) {
        s.spin += dt * 20;
        if (!s.back) {
          s.out += Math.hypot(s.vx, s.vy) * dt;
          if (s.out >= s.dist) {
            s.back = true;
            s.hit = new Set();
          }
        } else {
          const a = Math.atan2(p.y - s.y, p.x - s.x);
          s.vx = Math.cos(a) * s.sp * 1.1;
          s.vy = Math.sin(a) * s.sp * 1.1;
          if (dist2(s.x, s.y, p.x, p.y) < 20 * 20) {
            s.t = 99;
            if (s.evo) {
              // 戻ってきて打ち合わせる: 爆発
              G.fx.push({ kind: 'ring', x: p.x, y: p.y, r: 90 * G.stats.area, t: 0, life: 0.35, col: '#ffe066' });
              gridQuery(p.x, p.y, 120, (n) => {
                if (!n.dead && dist2(n.x, n.y, p.x, p.y) < (90 * G.stats.area + n.r) ** 2) hitNote(n, s.dmg * 1.5, { reg: s.reg, kb: 120 });
              });
              if (Math.random() < 0.5) Synth.sfx('cymbal');
            }
          }
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < 0 || s.y < 0 || s.x > ROOM || s.y > ROOM) {
        if (s.boomer) s.back = true;
        else s.t = 99;
      }
      gridQuery(s.x, s.y, s.r + 26, (n) => {
        if (n.dead || s.t >= s.life || s.hit.has(n)) return;
        if (dist2(n.x, n.y, s.x, s.y) < (s.r + n.r) ** 2) {
          s.hit.add(n);
          hitNote(n, s.dmg, { reg: s.reg, charm: s.charm, kb: s.kind === 'key' ? 30 : 0 });
          if (s.burst) {
            G.fx.push({ kind: 'ring', x: s.x, y: s.y, r: 40, t: 0, life: 0.2, col: '#bfe3ff' });
            gridQuery(s.x, s.y, 60, (m) => {
              if (m !== n && !m.dead && dist2(m.x, m.y, s.x, s.y) < (40 + m.r) ** 2) hitNote(m, s.dmg * 0.6, {});
            });
          }
          s.pierce--;
          if (s.pierce <= 0) s.t = 99;
        }
      });
      if (G.phase === 'battle' && !s.hit.has(G.boss) && dist2(G.boss.x, G.boss.y, s.x, s.y) < (s.r + G.boss.r) ** 2) {
        s.hit.add(G.boss);
        hitBoss(s.dmg);
        if (!s.boomer) s.t = 99;
      }
    }
    G.shots = G.shots.filter((s) => s.t < s.life);
    // ヴァイオリンの進化: 光線が残って当たり続ける
    for (const f of G.fx) {
      if (f.kind === 'beam' && f.repeat) {
        f.tick -= dt;
        if (f.follow) {
          f.x = p.x;
          f.y = p.y;
        }
        if (f.tick <= 0) {
          f.tick = 0.1;
          f.repeat(f);
        }
      }
    }
  }

  function pickItem(it) {
    const p = G.player;
    switch (it.kind) {
      case 'chest':
        openChest();
        break;
      case 'coffee':
        p.hp = Math.min(G.stats.maxHp, p.hp + 30);
        addText(p.x, p.y - 20, '+30', '#9effa1');
        break;
      case 'applause':
        for (const k of G.inks) k.pull = true;
        Synth.sfx('applause');
        addBanner('👏', '#fff');
        break;
      case 'rest':
        G.restT = G.t + 4;
        addBanner('𝄻 ' + (window.CSUI.lang === 'ja' ? '全休符! 音符が止まった' : 'Whole rest! Notes freeze'), '#cfe8ff');
        break;
      case 'ffff':
        G.shake = 0.4;
        Synth.sfx('boom');
        G.fx.push({ kind: 'flash', t: 0, life: 0.3 });
        for (const n of G.notes) {
          if (Math.abs(n.x - G.camX) < W / scale / 2 + 40 && Math.abs(n.y - G.camY) < H / scale / 2 + 40) hitNote(n, 30 / might(), {});
        }
        break;
      case 'ducat': {
        const v = 1 + ((Math.random() * 5) | 0);
        G.gold += v;
        addText(p.x, p.y - 20, '+' + v, '#ffd84a');
        break;
      }
      default:
        break;
    }
  }

  // ---------- ボス ----------
  function updateBoss(dt) {
    const b = G.boss;
    const p = G.player;
    b.pulse = Math.max(0, b.pulse - dt * 4);
    b.hurtT -= dt;
    if (b.dash) {
      const d = b.dash;
      d.t += dt;
      if (d.t < d.warn) {
        // 予告
      } else if (d.t < d.warn + d.len) {
        b.x += Math.cos(d.a) * d.sp * dt;
        b.y += Math.sin(d.a) * d.sp * dt;
        b.x = clamp(b.x, b.r, ROOM - b.r);
        b.y = clamp(b.y, b.r, ROOM - b.r);
      } else b.dash = null;
    } else if (G.phase === 'song' || G.phase === 'battle') {
      // ゆっくり動き回る (中央寄り)
      if (dist2(b.x, b.y, b.tx, b.ty) < 30 * 30) {
        b.tx = rand(ROOM * 0.25, ROOM * 0.75);
        b.ty = rand(ROOM * 0.25, ROOM * 0.75);
        if (G.phase === 'battle' && Math.random() < 0.5) {
          b.tx = (b.tx + p.x) / 2;
          b.ty = (b.ty + p.y) / 2;
        }
      }
      const a = Math.atan2(b.ty - b.y, b.tx - b.x);
      const sp = G.phase === 'battle' ? 55 : 32;
      b.x += Math.cos(a) * sp * dt;
      b.y += Math.sin(a) * sp * dt;
    }
    collide(b, b.r * 0.8);
    if (G.phase !== 'dead' && G.phase !== 'win' && G.phase !== 'break' && dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 6) ** 2) {
      hurt(12 * (G.hard ? HARD.dmg : 1) * STAR_MUL[G.song.stars - 1] ** 0.5);
    }
  }

  function bossDash() {
    const b = G.boss;
    if (b.dash) return;
    const p = G.player;
    const a = Math.atan2(p.y - b.y, p.x - b.x);
    b.dash = { a, t: 0, warn: 0.75, len: 0.55, sp: 560 };
  }

  // 曲の決まった小節で「見せ場」
  function runShows() {
    const shows = G.song.shows || [];
    const bar = Math.floor(G.beat / G.parsed.barLen);
    for (const s of shows) {
      if (G.showsDone.has(s) || bar < s.bar) continue;
      G.showsDone.add(s);
      if (s.type === 'dash') bossDash();
      else if (s.type === 'rain') {
        const p = G.player;
        for (let i = 0; i < 9; i++) {
          const x = clamp(p.x + rand(-260, 260), 40, ROOM - 40);
          const y = clamp(p.y + rand(-220, 220), 40, ROOM - 40);
          const delay = 0.6 + i * 0.12;
          G.fx.push({ kind: 'starWarn', x, y, r: 42, t: 0, life: delay });
          G.timers.push({
            t: delay,
            fn: () => {
              G.fx.push({ kind: 'starHit', x, y, r: 42, t: 0, life: 0.35 });
              if (dist2(x, y, G.player.x, G.player.y) < (42 + G.player.r) ** 2) hurt(10 * (G.hard ? HARD.dmg : 1));
            },
          });
        }
      } else if (s.type === 'dark') {
        G.dark = 1;
      }
    }
  }

  function startEncore() {
    const P = G.parsed;
    const fromBeat = Math.max(0, P.lengthBeats - 8 * P.barLen);
    const from = P.beatToSec(fromBeat);
    const base = G.track.pos() + 1.2;
    const add = [];
    for (const n of P.notes) {
      if (n.sec < from) continue;
      add.push({ ...n, sec: n.sec - from + base, mk: n.mk.replace('>', '') });
    }
    G.track.append(add);
    G.songEnd = base + (P.lengthSec - from);
    G.encore++;
    G.phase = 'song';
    G.phaseT = 0;
    G.total += add.length;
    addBanner('👏 ' + T('encore'), '#ffb3b3');
    Synth.sfx('applause');
  }

  function startBattle() {
    const sc = G.score;
    const th = sc.theme || { part: 0, from: 0, len: G.parsed.barLen * 4, tempo: 100 };
    const mul = G.hard ? HARD.tempo : 1;
    const bpm = th.tempo * mul;
    const { notes } = window.CSAudio.partNotes(sc.parts[th.part], 0, 'theme', sc.ppq);
    const list = [];
    for (const n of notes) {
      if (n.t < th.from - 1e-6 || n.t >= th.from + th.len - 1e-6) continue;
      list.push({ ...n, sec: ((n.t - th.from) * 60) / bpm, dur: (n.d * 60) / bpm, inst: sc.parts[th.part].inst, vol: 1, velMul: 1 });
    }
    list.sort((a, b) => a.sec - b.sec);
    const loopLen = (th.len * 60) / bpm;
    G.btrack = new Track(list, { loopLen });
    G.btrack.barTicks = Math.round(G.parsed.barLen * 4);
    G.bpm = bpm;
    const b = G.boss;
    b.maxHp = b.hp = 1250 * STAR_MUL[G.song.stars - 1] * (G.hard ? HARD.hp : 1);
    G.phase = 'battle';
    G.phaseT = 0;
    G.hpAtBattle = Math.round(G.player.hp) + '/' + G.level + ' t=' + Math.round(G.t);
    G.btrack.start(0, 0.4);
    G.fireN = 0;
  }

  // 決戦: 主題の音が弾になって飛んでくる
  function bossFire(n) {
    const b = G.boss;
    const p = G.player;
    const def = G.song.boss;
    // 速い装飾音まで全部撃つと弾幕になるので、0.15 秒に 1 回まで
    if (G.t - (G.lastFire || -1) < (def.pattern === 'aimed' ? 0.15 : 0.28)) return;
    G.lastFire = G.t;
    G.fireN++;
    const sp = (110 + (n.p - 60) * 2) * (G.hard ? 1.15 : 1);
    const dmg = (4 + n.v * 1.2) * (G.hard ? HARD.dmg : 1) * Math.sqrt(STAR_MUL[G.song.stars - 1]);
    const col = pitchColor(n.p);
    const shoot = (a) => G.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, dmg, col, t: 0 });
    const aim = Math.atan2(p.y - b.y, p.x - b.x);
    if (def.pattern === 'radial') {
      const k = 5;
      for (let i = 0; i < k; i++) shoot(G.fireN * 0.35 + (i / k) * Math.PI * 2);
    } else if (def.pattern === 'spread') {
      for (let i = -1; i <= 1; i++) shoot(aim + i * 0.28 + ((n.p % 5) - 2) * 0.05);
    } else {
      shoot(aim + ((n.p % 7) - 3) * 0.06);
      if (n.melody && G.fireN % 3 === 0) shoot(aim + Math.PI);
    }
    b.pulse = 1;
  }

  function winStage() {
    if (G.phase === 'win') return;
    G.phase = 'win';
    G.phaseT = 0;
    G.btrack.stop();
    G.bullets = [];
    Synth.sfx('cymbal');
    Synth.sfx('applause');
    G.shake = 0.6;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28;
      const s = rand(80, 320);
      G.fx.push({ kind: 'petal', x: G.boss.x, y: G.boss.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 2.5, col: `hsl(${rand(320, 400) % 360},80%,70%)` });
    }
  }

  function finish(win) {
    const P = G.parsed;
    const pos = Math.min(G.track.pos(), P.lengthSec);
    const progress = win ? 1 : clamp(pos / P.lengthSec, 0, 1);
    const time = G.t;
    // 評価
    let score = 100 - G.encore * 15 - (G.dmgTaken / G.stats.maxHp) * 18 - Math.max(0, time - P.lengthSec - 20) * 0.3;
    const rank = !win ? '-' : score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
    // 金貨
    let gold = G.killed * 0.12 * G.song.stars + progress * 25 * G.song.stars;
    if (win) gold += 40 * G.song.stars;
    if (G.hard) gold *= HARD.gold;
    if (!G.own) gold *= 1.2;
    gold *= G.stats.greed;
    gold = Math.round(gold + G.gold);
    G.result = { win, progress, killed: G.killed, total: G.total, encore: G.encore, dmg: Math.round(G.dmgTaken), time, rank, gold, level: G.level, bar: Math.floor(G.parsed.secToBeat(pos) / P.barLen) + 1, bars: Math.ceil(P.lengthBeats / P.barLen) };
    if (G.onFinish) G.onFinish(G.result);
  }

  function openLevelUp() {
    Synth.sfx('level', { p: 72 });
    if (G.bot) {
      // 自動プレイ: 進化の組み合わせを優先
      const ch = makeChoices();
      ch.sort((a, b) => botScore(b) - botScore(a));
      applyChoice(ch[0]);
      return;
    }
    G.choices = makeChoices();
    G.choicesLv = G.level - G.pendingLevels;
    window.CSUI.showLevelDock(G.choices);
  }

  // 候補を選ぶ (i 番目)。プレイを続けたまま
  function pickChoice(i) {
    if (!G || !G.choices || !G.choices[i] || G.paused) return;
    const c = G.choices[i];
    G.choices = null;
    window.CSUI.hideLevelDock();
    applyChoice(c);
    addText(G.player.x, G.player.y - 30, '♪ ' + choiceName(c), '#fff6a8', 1, 13);
  }
  function rerollChoices() {
    if (!G || !G.choices || G.rerolls <= 0 || G.paused) return;
    G.rerolls--;
    G.choices = makeChoices();
    window.CSUI.showLevelDock(G.choices);
  }
  function choiceName(c) {
    if (c.kind === 'weapon') return L(D.WEAPONS[c.id].name) + ' Lv' + c.lv;
    if (c.kind === 'passive') return L(D.PASSIVES[c.id].name) + ' Lv' + c.lv;
    return c.kind === 'heal' ? T('healOpt') : T('goldOpt');
  }

  function resumeMusic() {
    const tr = G.phase === 'battle' ? G.btrack : G.track;
    if (!tr || G.phase === 'break' || G.phase === 'win' || G.phase === 'dead') return;
    const beatSec = 60 / G.bpm;
    const pos = tr.pausedPos;
    tr.start(Math.max(0, pos - beatSec), beatSec * 2, [[0, true], [beatSec, false]]);
  }

  function pause() {
    if (!G || G.paused || G.result) return;
    G.paused = true;
    const tr = G.phase === 'battle' ? G.btrack : G.track;
    if (tr) tr.pause();
  }
  function resume() {
    if (!G || !G.paused) return;
    G.paused = false;
    resumeMusic();
  }
  function quit() {
    if (!G) return;
    G.track && G.track.stop();
    G.btrack && G.btrack.stop();
    Synth.hush(0.2);
    window.CSUI.hideLevelDock();
    G = null;
  }

  // ---------- 描画 ----------
  function render() {
    ctx.save();
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);
    if (!G) {
      ctx.restore();
      return;
    }
    const p = G.player;
    let sx = 0;
    let sy = 0;
    if (G.shake > 0 && window.CSUI.settings.shake) {
      sx = rand(-1, 1) * G.shake * 18;
      sy = rand(-1, 1) * G.shake * 18;
    }
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(scale, scale);
    ctx.translate(-G.camX, -G.camY);
    const vw = W / scale / 2 + 60;
    const vh = H / scale / 2 + 60;
    const vis = (x, y) => Math.abs(x - G.camX) < vw && Math.abs(y - G.camY) < vh;

    // 床と壁
    ctx.drawImage(G.room.floor, 0, 0);
    ctx.strokeStyle = '#3a2a1e';
    ctx.lineWidth = 24;
    ctx.strokeRect(-12, -12, ROOM + 24, ROOM + 24);
    ctx.strokeStyle = '#c9a04a';
    ctx.lineWidth = 3;
    ctx.strokeRect(-1, -1, ROOM + 2, ROOM + 2);
    for (const f of G.room.furn) drawFurniture(f);

    // ゾーン (チェロ)
    for (const z of G.zones) {
      const k = 1 - z.t / z.life;
      ctx.fillStyle = `rgba(120, 90, 200, ${0.18 * k + 0.05})`;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(180, 150, 255, ${0.5 * k})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (((z.t * 0.8 + i / 3) % 1) * 0.9 + 0.1), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // インク
    for (const k of G.inks) {
      if (!vis(k.x, k.y)) continue;
      ctx.fillStyle = '#1a1030';
      ctx.beginPath();
      ctx.arc(k.x, k.y, k.r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = k.r > 6 ? '#d2a8ff' : k.r > 5 ? '#8fc8ff' : '#7ef0c8';
      ctx.beginPath();
      ctx.moveTo(k.x, k.y - k.r * 1.3);
      ctx.quadraticCurveTo(k.x + k.r, k.y, k.x, k.y + k.r);
      ctx.quadraticCurveTo(k.x - k.r, k.y, k.x, k.y - k.r * 1.3);
      ctx.fill();
    }
    // 落とし物
    for (const it of G.items) drawItem(it);

    // 予告など (下に描くもの)
    for (const f of G.fx) {
      if (f.kind === 'starWarn' || f.kind === 'pipeWarn') {
        const k = f.t / f.life;
        ctx.fillStyle = f.kind === 'starWarn' ? `rgba(255, 220, 80, ${0.15 + k * 0.25})` : `rgba(160, 200, 255, ${0.15 + k * 0.3})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // ボスの突進の予告
    const b = G.boss;
    if (b.dash && b.dash.t < b.dash.warn) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.dash.a);
      ctx.fillStyle = `rgba(255, 60, 60, ${0.15 + 0.2 * Math.sin(G.t * 30)})`;
      ctx.fillRect(0, -b.r, b.dash.sp * b.dash.len, b.r * 2);
      ctx.restore();
    }

    // 音符
    for (const n of G.notes) if (vis(n.x, n.y)) drawNote(ctx, n);

    // ボス
    drawBoss(b);

    // 主人公
    drawComposer(ctx, G.composer, p.x, p.y, 1, p.face, p.walk, p.inv > 0 && Math.floor(G.t * 20) % 2 === 0);
    // 体力のゲージ (足元)
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(p.x - 18, p.y + 22, 36, 5);
    ctx.fillStyle = p.hp / G.stats.maxHp < 0.3 ? '#ff5e5e' : '#5ee08a';
    ctx.fillRect(p.x - 18, p.y + 22, 36 * clamp(p.hp / G.stats.maxHp, 0, 1), 5);

    // ハープの弦
    for (const w of G.weapons) {
      if (w.id !== 'harp' || !w.pts) continue;
      for (const [x, y, a] of w.pts) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.strokeStyle = w.evo ? '#fff3b0' : '#e8d7a0';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffe9a0';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-12, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
    // 弾
    for (const s of G.shots) drawShot(s);
    for (const bl of G.bullets) {
      if (!vis(bl.x, bl.y)) continue;
      ctx.fillStyle = '#1a0010';
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r + 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bl.col;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bl.x - 2, bl.y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 演出
    for (const f of G.fx) drawFx(f);
    // 文字 (部屋の中)
    ctx.textAlign = 'center';
    for (const t of G.texts) {
      if (!t.world) continue;
      ctx.globalAlpha = 1 - t.t / t.life;
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 暗転 (ノクターンの見せ場)
    if (G.dark > 0) {
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, 60 * scale, W / 2, H / 2, 260 * scale);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,10,${0.85 * Math.min(1, G.dark * 3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    drawHud();
  }

  function drawFurniture(f) {
    ctx.save();
    if (f.kind === 'piano') {
      ctx.fillStyle = '#111';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(f.x + 6, f.y + 6, f.w - 12, f.h * 0.45);
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(f.x + 4, f.y + f.h - 22, f.w - 8, 18);
      ctx.fillStyle = '#111';
      for (let x = f.x + 10; x < f.x + f.w - 10; x += 12) if ((x / 12) % 7 !== 2 && (x / 12) % 7 !== 6) ctx.fillRect(x, f.y + f.h - 22, 6, 10);
    } else if (f.kind === 'column') {
      ctx.fillStyle = '#bfb6a5';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = '#e8e2d4';
      ctx.beginPath();
      ctx.arc(f.x + f.w / 2, f.y + f.h / 2, f.w * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#9d9483';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (f.kind === 'table') {
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = '#8a5a36';
      ctx.fillRect(f.x + 6, f.y + 6, f.w - 12, f.h - 12);
      // 燭台
      ctx.fillStyle = '#e8c35a';
      ctx.fillRect(f.x + f.w / 2 - 3, f.y + f.h / 2 - 10, 6, 14);
      ctx.fillStyle = '#ffdd88';
      ctx.beginPath();
      ctx.arc(f.x + f.w / 2, f.y + f.h / 2 - 14, 4 + Math.sin(performance.now() / 120) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = '#9b2c3a';
      ctx.fillRect(f.x + 6, f.y + 6, f.w - 12, f.h - 12);
    }
    ctx.restore();
  }

  function drawItem(it) {
    const bob = Math.sin(it.t * 4) * 3;
    ctx.save();
    ctx.translate(it.x, it.y + bob);
    if (it.kind === 'chest') {
      ctx.shadowColor = '#ffd84a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#3a2416';
      ctx.fillRect(-15, -10, 30, 20);
      ctx.fillStyle = '#c9a04a';
      ctx.fillRect(-15, -10, 30, 5);
      ctx.fillRect(-3, -5, 6, 8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.fillText('♪', 8, 7);
    } else {
      const icon = { coffee: '☕', applause: '👏', rest: '𝄻', ffff: 'ffff', ducat: '🪙' }[it.kind];
      ctx.font = it.kind === 'ffff' ? 'bold italic 14px serif' : '18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (it.kind === 'ffff' || it.kind === 'rest') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe9a8';
      }
      ctx.fillText(icon, 0, 0);
    }
    ctx.restore();
  }

  function drawShot(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.kind === 'key') {
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = '#111';
      ctx.fillRect(-9, -5, 18, 10);
      ctx.fillStyle = s.burst ? '#d8f0ff' : '#fbf8f0';
      ctx.fillRect(-8, -4, 16, 8);
      ctx.fillStyle = '#111';
      ctx.fillRect(-1, -4, 2, 5);
    } else if (s.kind === 'wind') {
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.strokeStyle = s.charm ? '#ffb3f0' : '#bff6ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.quadraticCurveTo(-6, -6, 0, 0);
      ctx.quadraticCurveTo(6, 6, 10, 0);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(8, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'cymbal') {
      ctx.rotate(s.spin);
      ctx.fillStyle = '#5a4210';
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r + 2, (s.r + 2) * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.evo ? '#ffe680' : '#e6c04a';
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r, s.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFx(f) {
    const k = f.t / f.life;
    ctx.save();
    switch (f.kind) {
      case 'spark':
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.col;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 3 * (1 - k) + 1, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'petal':
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.col;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.t * 5);
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#2a1600';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = f.col;
        ctx.lineWidth = 5;
        ctx.stroke();
        break;
      case 'arc':
      case 'cone':
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.fillStyle = f.kind === 'cone' ? 'rgba(255, 210, 120, 0.55)' : 'rgba(255,255,255,0.5)';
        ctx.strokeStyle = f.kind === 'cone' ? '#7a4a00' : '#1d2b4a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, f.r * (0.6 + 0.4 * k), -f.half, f.half);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'beam': {
        ctx.globalAlpha = f.evo ? 0.85 : 1 - k;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a);
        ctx.fillStyle = '#2a0f00';
        ctx.fillRect(0, -f.width / 2 - 2, f.len, f.width + 4);
        const g = ctx.createLinearGradient(0, -f.width / 2, 0, f.width / 2);
        g.addColorStop(0, '#ffb35a');
        g.addColorStop(0.5, '#fff7d6');
        g.addColorStop(1, '#ffb35a');
        ctx.fillStyle = g;
        ctx.fillRect(0, -f.width / 2, f.len, f.width);
        break;
      }
      case 'pipe': {
        ctx.globalAlpha = 1 - k;
        const h = 90 * (1 - Math.abs(k - 0.3));
        ctx.fillStyle = '#5a6a7a';
        ctx.fillRect(f.x - f.r * 0.5 - 2, f.y - h - 2, f.r + 4, h + 4);
        const g = ctx.createLinearGradient(f.x - f.r / 2, 0, f.x + f.r / 2, 0);
        g.addColorStop(0, '#c9d6e3');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, '#93a5b8');
        ctx.fillStyle = g;
        ctx.fillRect(f.x - f.r * 0.5, f.y - h, f.r, h);
        ctx.strokeStyle = '#dfe9f5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.6 + k), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'starHit':
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ffe14a';
        drawStar(ctx, f.x, f.y, f.r * (0.6 + 0.4 * k), 5);
        break;
      case 'line':
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffe9b0';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(f.a) * 40 * (1 + k * 6), f.y + Math.sin(f.a) * 40 * (1 + k * 6));
        ctx.lineTo(f.x + Math.cos(f.a) * 80 * (1 + k * 6), f.y + Math.sin(f.a) * 80 * (1 + k * 6));
        ctx.stroke();
        break;
      default:
        break;
    }
    ctx.restore();
  }

  function drawStar(c, x, y, r, n) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  // 音符を描く (形 = 長さ、色 = 高さ)
  function drawNote(c, n) {
    const r = n.r;
    const p = G ? G.player : { x: n.x, y: n.y + 1 };
    c.save();
    c.translate(n.x, n.y);
    if (n.elite || n.fermata) {
      c.shadowColor = n.fermata ? '#ff7a7a' : '#ffd84a';
      c.shadowBlur = 14;
    }
    if (n.charm > 0) {
      c.shadowColor = '#ff8ae0';
      c.shadowBlur = 12;
    }
    const hollow = n.d >= 1.9;
    const flags = n.d <= 0.14 ? 3 : n.d <= 0.27 ? 2 : n.d <= 0.55 ? 1 : 0;
    const stem = n.d < 3.5;
    const col = n.flash > 0 ? '#ffffff' : n.col;
    // 棒と旗
    if (stem) {
      c.strokeStyle = '#111';
      c.lineWidth = Math.max(2, r * 0.18);
      c.beginPath();
      c.moveTo(r * 0.85, -r * 0.1);
      c.lineTo(r * 0.85, -r * 2.5);
      c.stroke();
      for (let i = 0; i < flags; i++) {
        c.beginPath();
        c.moveTo(r * 0.85, -r * 2.5 + i * r * 0.5);
        c.quadraticCurveTo(r * 1.9, -r * 1.9 + i * r * 0.5, r * 1.4, -r * 1.2 + i * r * 0.5);
        c.stroke();
      }
    }
    // 玉
    c.rotate(-0.35);
    c.fillStyle = '#111';
    c.beginPath();
    c.ellipse(0, 0, r + 2, r * 0.78 + 2, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
    c.fill();
    if (hollow) {
      c.fillStyle = '#fbf6ea';
      c.beginPath();
      c.ellipse(0, 0, r * 0.62, r * 0.36, -0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.rotate(0.35);
    c.shadowBlur = 0;
    // 目
    if (r >= 6) {
      const a = Math.atan2(p.y - n.y, p.x - n.x);
      const ex = Math.cos(a) * r * 0.12;
      const ey = Math.sin(a) * r * 0.12;
      const er = Math.max(1.6, r * 0.2);
      const hurt = n.flash > 0;
      for (const s of [-1, 1]) {
        const x = s * r * 0.32;
        const y = -r * 0.1;
        if (hurt) {
          c.strokeStyle = '#111';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x - er, y);
          c.lineTo(x + er, y);
          c.stroke();
        } else {
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(x, y, er, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#111';
          c.beginPath();
          c.arc(x + ex, y + ey, er * 0.55, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // 記号
    if (n.sharp && r >= 7) {
      c.fillStyle = '#111';
      c.font = `bold ${Math.round(r * 0.9)}px serif`;
      c.textAlign = 'center';
      c.fillText('♯', -r * 1.35, r * 0.3);
    }
    if (n.stacc) {
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(0, r * 1.2, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    if (n.fermata) {
      c.strokeStyle = '#111';
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(0, -r * 1.1, r * 0.8, Math.PI, 0);
      c.stroke();
      c.fillStyle = '#111';
      c.beginPath();
      c.arc(0, -r * 1.25, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    if (n.melody && !n.elite) {
      c.strokeStyle = 'rgba(255, 216, 74, 0.9)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(0, 0, r + 3.5, r * 0.78 + 3.5, -0.35, 0, Math.PI * 2);
      c.stroke();
    }
    // HP (硬い音符だけ)
    if (n.maxHp > 40 && n.hp < n.maxHp) {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(-r, r + 4, r * 2, 3);
      c.fillStyle = '#ff7171';
      c.fillRect(-r, r + 4, r * 2 * clamp(n.hp / n.maxHp, 0, 1), 3);
    }
    c.restore();
  }

  function drawBoss(b) {
    const def = b.def;
    ctx.save();
    ctx.translate(b.x, b.y);
    const s = 1 + b.pulse * 0.08;
    ctx.scale(s, s);
    const hurt = b.hurtT > 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, b.r * 0.9, b.r, b.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (def.id === 'star') {
      ctx.fillStyle = '#5a4300';
      drawStar(ctx, 0, 0, b.r + 5, 5);
      ctx.fillStyle = hurt ? '#fff' : '#ffd93b';
      ctx.save();
      ctx.rotate(Math.sin(G.t) * 0.15);
      drawStar(ctx, 0, 0, b.r, 5);
      ctx.restore();
      face(0, 2, b.r * 0.5);
    } else if (def.id === 'candle') {
      ctx.fillStyle = '#5a3a10';
      ctx.fillRect(-6, -10, 12, 40);
      ctx.fillRect(-26, 28, 52, 8);
      ctx.strokeStyle = hurt ? '#fff' : '#e8c35a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-30, -14);
      ctx.quadraticCurveTo(0, 10, 30, -14);
      ctx.stroke();
      for (const x of [-30, 0, 30]) {
        ctx.fillStyle = '#f4efe0';
        ctx.fillRect(x - 5, -38, 10, 24);
        const fl = 1 + Math.sin(G.t * 12 + x) * 0.15;
        ctx.fillStyle = '#ff9a2a';
        ctx.beginPath();
        ctx.ellipse(x, -46, 6 * fl, 11 * fl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff2a0';
        ctx.beginPath();
        ctx.ellipse(x, -44, 3, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      face(0, 6, 12);
    } else {
      // 謎の令嬢エリーゼ (ドレスと扇。顔は描かず、ヴェールで隠す)
      ctx.fillStyle = hurt ? '#fff' : def.color || '#9b59b6';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(b.r, b.r * 0.95);
      ctx.lineTo(-b.r, b.r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a1450';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#f0d9c4';
      ctx.beginPath();
      ctx.arc(0, -28, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a2a1a';
      ctx.beginPath();
      ctx.arc(0, -34, 13, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -46, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,10,60,0.75)';
      ctx.fillRect(-13, -30, 26, 9);
      // 扇
      ctx.fillStyle = '#f8e1f0';
      ctx.beginPath();
      ctx.moveTo(16, -6);
      ctx.arc(16, -6, 18, -1.9 + Math.sin(G.t * 3) * 0.2, -0.6 + Math.sin(G.t * 3) * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    // 結界: まわりを回る 5 本の線
    if (b.shield) {
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.75)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate(G.t * 0.6 + i * 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.r + 16 + i * 5, (b.r + 16 + i * 5) * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    // 決戦の体力
    if (G.phase === 'battle' || G.phase === 'win') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(b.x - 40, b.y - b.r - 30, 80, 7);
      ctx.fillStyle = '#ff5e7a';
      ctx.fillRect(b.x - 40, b.y - b.r - 30, 80 * clamp(b.hp / b.maxHp, 0, 1), 7);
    }
    function face(x, y, r) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
      ctx.arc(x + r * 0.4, y - r * 0.1, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + r * 0.15, r * 0.3, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
  }

  // 作曲家 (2 頭身)。s は大きさ
  function drawComposer(c, comp, x, y, s, face = 1, walk = 0, blink = false) {
    const col = comp.colors;
    c.save();
    c.translate(x, y);
    c.scale(s * face, s);
    if (blink) c.globalAlpha = 0.45;
    const bob = Math.sin(walk) * 1.5;
    // 影
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 17, 12, 4, 0, 0, Math.PI * 2);
    c.fill();
    // 足
    c.fillStyle = '#222';
    c.fillRect(-7, 8 + Math.max(0, bob), 5, 9);
    c.fillRect(2, 8 + Math.max(0, -bob), 5, 9);
    // 体 (上着)
    c.fillStyle = col.coat;
    c.beginPath();
    c.moveTo(-10, -4);
    c.lineTo(10, -4);
    c.lineTo(12, 12);
    c.lineTo(-12, 12);
    c.closePath();
    c.fill();
    c.strokeStyle = '#111';
    c.lineWidth = 1.5;
    c.stroke();
    // スカーフ・タイ
    c.fillStyle = col.scarf;
    c.beginPath();
    c.moveTo(-5, -5);
    c.lineTo(5, -5);
    c.lineTo(0, 4);
    c.closePath();
    c.fill();
    // 頭
    c.fillStyle = col.skin;
    c.beginPath();
    c.arc(0, -14, 11, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // 髪
    c.fillStyle = col.hair;
    if (comp.id === 'beethoven') {
      // ボサボサ
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        const rr = 13 + (i % 2 ? 4 : 0);
        c.lineTo(Math.cos(a) * rr, -15 + Math.sin(a) * rr);
      }
      c.lineTo(13, -8);
      c.lineTo(9, -12);
      c.lineTo(-9, -12);
      c.lineTo(-13, -8);
      c.closePath();
      c.fill();
    } else if (comp.id === 'mozart') {
      // 白いかつら (横のカールと後ろのリボン)
      c.beginPath();
      c.arc(0, -17, 11.5, Math.PI, 0);
      c.fill();
      c.beginPath();
      c.arc(-11, -11, 4, 0, Math.PI * 2);
      c.arc(-11, -5, 3.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a2a2a';
      c.fillRect(-15, -14, 4, 3);
    } else {
      // 横に流した髪
      c.beginPath();
      c.moveTo(-12, -12);
      c.quadraticCurveTo(-12, -28, 4, -26);
      c.quadraticCurveTo(14, -24, 12, -10);
      c.quadraticCurveTo(6, -18, -2, -18);
      c.quadraticCurveTo(-8, -16, -12, -12);
      c.fill();
    }
    // 目
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(3, -13, 1.6, 0, Math.PI * 2);
    c.arc(8, -13, 1.6, 0, Math.PI * 2);
    c.fill();
    if (comp.id === 'beethoven') {
      c.strokeStyle = '#222';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(1, -17);
      c.lineTo(5, -16);
      c.moveTo(7, -16);
      c.lineTo(10, -17);
      c.stroke();
    }
    c.restore();
  }

  // 楽器のアイコン
  function drawIcon(c, id, x, y, s) {
    c.save();
    c.translate(x, y);
    c.scale(s / 32, s / 32);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const stroke = () => {
      c.strokeStyle = '#111';
      c.lineWidth = 2;
      c.stroke();
    };
    switch (id) {
      case 'piano':
      case 'hammer':
        c.fillStyle = '#fff';
        c.fillRect(-13, -9, 26, 18);
        c.strokeStyle = '#111';
        c.lineWidth = 2;
        c.strokeRect(-13, -9, 26, 18);
        c.fillStyle = '#111';
        for (const k of [-8, -3, 5]) c.fillRect(k, -9, 3, 10);
        for (const k of [-7, -2, 3, 8]) c.fillRect(k - 0.5, -9, 1, 18);
        break;
      case 'baton':
      case 'maestro':
        c.strokeStyle = '#111';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(-11, 11);
        c.lineTo(12, -12);
        c.stroke();
        c.strokeStyle = '#f4f1ea';
        c.lineWidth = 3;
        c.stroke();
        c.fillStyle = '#6b4226';
        c.beginPath();
        c.arc(-10, 10, 4, 0, Math.PI * 2);
        c.fill();
        stroke();
        break;
      case 'timpani':
      case 'thunder':
        c.fillStyle = '#b8732f';
        c.beginPath();
        c.moveTo(-13, -4);
        c.quadraticCurveTo(-12, 12, 0, 13);
        c.quadraticCurveTo(12, 12, 13, -4);
        c.closePath();
        c.fill();
        stroke();
        c.fillStyle = '#f0e6cf';
        c.beginPath();
        c.ellipse(0, -4, 13, 4, 0, 0, Math.PI * 2);
        c.fill();
        stroke();
        break;
      case 'violin':
      case 'strad':
      case 'cello':
      case 'contrabass': {
        const big = id === 'cello' || id === 'contrabass';
        c.rotate(big ? 0 : -0.6);
        c.fillStyle = big ? '#7a3f1a' : '#b5581f';
        c.beginPath();
        c.ellipse(0, 5, 8, 7, 0, 0, Math.PI * 2);
        c.ellipse(0, -5, 6.5, 6, 0, 0, Math.PI * 2);
        c.fill();
        stroke();
        c.fillStyle = '#222';
        c.fillRect(-1.5, -16, 3, 16);
        if (big) c.fillRect(-0.8, 12, 1.6, 6);
        break;
      }
      case 'flute':
      case 'magicflute':
        c.rotate(-0.5);
        c.fillStyle = id === 'magicflute' ? '#ffd84a' : '#d9dee5';
        c.fillRect(-15, -3, 30, 6);
        c.strokeStyle = '#111';
        c.lineWidth = 2;
        c.strokeRect(-15, -3, 30, 6);
        c.fillStyle = '#111';
        for (const k of [-6, -1, 4, 9]) {
          c.beginPath();
          c.arc(k, 0, 1.4, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case 'trumpet':
      case 'fanfare':
        c.fillStyle = '#e6c04a';
        c.fillRect(-14, -3, 18, 6);
        c.beginPath();
        c.moveTo(4, -3);
        c.lineTo(14, -9);
        c.lineTo(14, 9);
        c.lineTo(4, 3);
        c.closePath();
        c.fill();
        stroke();
        c.strokeRect(-14, -3, 18, 6);
        c.fillRect(-6, -8, 3, 5);
        c.fillRect(-1, -8, 3, 5);
        break;
      case 'harp':
      case 'celestial':
        c.strokeStyle = '#8a5a1a';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(-10, 13);
        c.lineTo(-10, -12);
        c.quadraticCurveTo(4, -16, 11, 4);
        c.lineTo(-10, 13);
        c.stroke();
        c.strokeStyle = '#f4e3b0';
        c.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(-7 + i * 4, -11 + i * 1.5);
          c.lineTo(-7 + i * 4, 11 - i * 2.5);
          c.stroke();
        }
        break;
      case 'cymbal':
      case 'janissary':
        for (const dx of [-6, 6]) {
          c.fillStyle = '#e6c04a';
          c.beginPath();
          c.ellipse(dx, 0, 9, 4, dx > 0 ? 0.5 : -0.5, 0, Math.PI * 2);
          c.fill();
          stroke();
        }
        break;
      case 'organ':
      case 'cathedral':
        for (let i = 0; i < 5; i++) {
          const h = [14, 20, 26, 20, 14][i];
          c.fillStyle = '#c9d6e3';
          c.fillRect(-13 + i * 5.4, 13 - h, 4.4, h);
          c.strokeStyle = '#111';
          c.lineWidth = 1.2;
          c.strokeRect(-13 + i * 5.4, 13 - h, 4.4, h);
        }
        break;
      default:
        break;
    }
    c.restore();
  }

  // ---------- 画面の上の表示 ----------
  function drawHud() {
    const p = G.player;
    const S = G.stats;
    ctx.save();
    const pad = 10;
    let y = pad;
    // 曲の進み具合
    const P = G.parsed;
    const totalBars = Math.ceil(P.lengthBeats / P.barLen);
    const bar = clamp(Math.floor(G.beat / P.barLen) + 1, 1, 9999);
    const prog = G.phase === 'song' ? clamp(G.track.pos() / G.songEnd, 0, 1) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(pad, y, W - pad * 2, 5);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(pad, y, (W - pad * 2) * prog, 5);
    y += 9;
    // 経験値
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(pad, y, W - pad * 2, 8);
    ctx.fillStyle = '#7ef0c8';
    ctx.fillRect(pad, y, (W - pad * 2) * clamp(G.xp / G.xpNext, 0, 1), 8);
    y += 12;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const shadowText = (s, x, yy, col = '#fff') => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(s, x, yy);
      ctx.fillStyle = col;
      ctx.fillText(s, x, yy);
    };
    shadowText(`Lv ${G.level}${G.hard ? '  HARD' : ''}`, pad, y);
    shadowText(`HP ${Math.ceil(p.hp)}/${Math.round(S.maxHp)}`, pad, y + 18, p.hp / S.maxHp < 0.3 ? '#ff8080' : '#9effb0');
    ctx.textAlign = 'right';
    if (G.phase === 'song') shadowText(`${T('bar')} ${Math.min(bar, totalBars)}/${totalBars}`, W - pad, y);
    const unseen = G.phase === 'song' ? G.track.remaining() : 0;
    if (G.phase === 'song' || G.phase === 'coda') shadowText(`♪ ${T('unseen')} ${unseen} / ${T('onField')} ${G.notes.length}`, W - pad, y + 18, '#ffe9a8');
    if (G.phase === 'coda') {
      const left = Math.max(0, Math.ceil(ENCORE_WAIT - G.codaT));
      shadowText(T('encoreIn').replace('{s}', left), W - pad, y + 36, left < 10 ? '#ff9090' : '#fff');
    }
    if (G.encore) shadowText(`👏×${G.encore}`, W - pad, y + 54, '#ffb3b3');
    // 持ち物 (左下)
    let ix = pad;
    const iy = H - pad - 30;
    for (const w of G.weapons) {
      ctx.fillStyle = w.evo ? 'rgba(90, 60, 10, 0.85)' : 'rgba(0,0,0,0.55)';
      ctx.fillRect(ix, iy, 30, 30);
      if (w.evo) {
        ctx.strokeStyle = '#ffd84a';
        ctx.lineWidth = 2;
        ctx.strokeRect(ix, iy, 30, 30);
      }
      ctx.fillStyle = '#f4efe0';
      ctx.fillRect(ix + 2, iy + 2, 26, 26);
      drawIcon(ctx, w.evo ? D.WEAPONS[w.id].evo : w.id, ix + 15, iy + 14, 24);
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      shadowText(w.evo ? '★' : String(w.lv), ix + 29, iy + 31, w.evo ? '#ffd84a' : '#fff');
      ix += 33;
    }
    ix += 6;
    for (const [id, lv] of Object.entries(G.passives)) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(ix, iy + 4, 26, 26);
      ctx.font = '16px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(D.PASSIVES[id].icon, ix + 13, iy + 17);
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      shadowText(String(lv), ix + 25, iy + 31);
      ix += 29;
    }
    // バナー
    const banners = G.texts.filter((t) => !t.world);
    let by = H * 0.3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of banners.slice(-3)) {
      const a = Math.min(1, (t.life - t.t) * 2, t.t * 6);
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      const w = Math.min(W - 20, ctx.measureText(t.s).width + 30);
      ctx.fillStyle = 'rgba(10, 10, 20, 0.75)';
      ctx.fillRect(W / 2 - w / 2, by - 18, w, 36);
      shadowText(t.s, W / 2, by, t.col);
      by += 42;
    }
    ctx.globalAlpha = 1;
    // フラッシュ
    for (const f of G.fx) {
      if (f.kind === 'flash') {
        ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - f.t / f.life)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    if (G.player.hurtT > 0) {
      ctx.fillStyle = `rgba(255,0,0,${G.player.hurtT * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---------- 自動プレイ (バランスの確認用) ----------
  function botMove() {
    const p = G.player;
    let fx = 0;
    let fy = 0;
    for (const n of G.notes) {
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 260 * 260) continue;
      const w = (n.dmg + 2) / (d2 + 400);
      fx += dx * w;
      fy += dy * w;
    }
    for (const bl of G.bullets) {
      const dx = p.x - bl.x;
      const dy = p.y - bl.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 160 * 160) continue;
      const w = 20 / (d2 + 200);
      fx += dx * w;
      fy += dy * w;
    }
    const b = G.boss;
    {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d2 = dx * dx + dy * dy;
      const w = (b.dash ? 300 : 60) / (d2 + 400);
      fx += dx * w;
      fy += dy * w;
      // 決戦では離れすぎない (攻撃が届く距離まで寄る)
      if (G.phase === 'battle' && !b.dash && d2 > 260 * 260) {
        const d = Math.sqrt(d2);
        fx -= (dx / d) * 0.02;
        fy -= (dy / d) * 0.02;
      }
    }
    // 壁から離れる
    const wall = (v) => (v < 150 ? (150 - v) / 150 : 0);
    fx += wall(p.x) * 0.05 - wall(ROOM - p.x) * 0.05;
    fy += wall(p.y) * 0.05 - wall(ROOM - p.y) * 0.05;
    // インクと落とし物に寄る
    let best = null;
    let bd = 1e9;
    for (const k of G.items.length ? G.items : G.inks) {
      const d = dist2(k.x, k.y, p.x, p.y);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best && bd < 700 * 700) {
      const d = Math.sqrt(bd) || 1;
      const w = G.items.length ? 0.06 : 0.035;
      fx += ((best.x - p.x) / d) * w;
      fy += ((best.y - p.y) / d) * w;
    }
    const m = Math.hypot(fx, fy);
    return m > 0.001 ? [fx / m, fy / m] : [0, 0];
  }
  function botScore(c) {
    if (c.kind !== 'weapon' && c.kind !== 'passive') return 0;
    let s = Math.random();
    if (c.kind === 'weapon') {
      s += 2;
      const pv = D.WEAPONS[c.id].passive;
      if (G.passives[pv]) s += 1.5;
    } else {
      for (const w of G.weapons) if (D.WEAPONS[w.id].passive === c.id) s += 2.5;
      if (c.id === 'rosin' || c.id === 'tailcoat' || c.id === 'metronome') s += 1;
    }
    return s;
  }

  // 音を出さずに速く進める (?sim で使う)
  function simulate(opt, maxSec = 900) {
    Synth.fake = true;
    Synth.fakeTime = 0;
    W = 900;
    H = 600;
    scale = 1;
    const g = start({ ...opt, sim: true });
    g.bot = true;
    const dt = 1 / 30;
    while (!g.result && g.t < maxSec) {
      Synth.fakeTime += dt;
      update(dt);
    }
    const r = g.result || { timeout: true };
    r.levelEnd = g.level;
    r.xpRate = Math.round(((g.xpGot || 0) / (g.xpDropped || 1)) * 100);
    r.maxAlive = g.maxAlive;
    r.lvAt = g.lvAt;
    r.hpAtBattle = g.hpAtBattle;
    r.weapons = g.weapons.map((w) => w.id + w.lv + (w.evo ? '*' : '')).join(',');
    r.phase = g.phase;
    r.bossHp = Math.round(g.boss.hp);
    Synth.fake = false;
    G = null;
    return r;
  }

  // ---------- 共通 ----------
  function T(k) {
    return window.CSUI.T(k);
  }
  function L(o) {
    return window.CSUI.L(o);
  }

  window.CSGame = {
    start(opt, onFinish) {
      resize();
      start(opt);
      G.onFinish = onFinish;
      return G;
    },
    get G() {
      return G;
    },
    update,
    render,
    resize,
    pause,
    resume,
    quit,
    pickChoice,
    rerollChoices,
    simulate,
    drawComposer,
    drawIcon,
    drawNote,
    input,
  };
})();
