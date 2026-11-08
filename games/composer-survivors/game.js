/*
 * 作曲家サバイバー: ゲームの本体 (楽譜のタワーディフェンス)
 *   音符は鳴った瞬間に右端 (ボス) から現れ、音の高さの位置を右から左へ流れていく。
 *   左端の指揮台に届くと体力が減る。譜面の上にタワーを置いて止める。
 *   メニューの画面は ui.js
 */
(() => {
  'use strict';

  const { Synth, Track, parseScore } = window.CSAudio;
  const D = window.CSData;

  // ---------- 定数 ----------
  const FW = 1280; // 譜面 (フィールド) の広さ
  const FH = 720;
  const CELL = 64;
  const COLS = 20;
  const ROWS = 11;
  const TOP = (FH - ROWS * CELL) / 2;
  const PODIUM_X = 96; // 指揮台 (ここに届くと体力が減る)
  const SPAWN_X = FW - 56; // 音符が現れる位置 (ボスの前)
  const BUILD_COL0 = 2; // 建てられる列 (左の 2 列は指揮台、右の 1 列はボス)
  const BUILD_COL1 = COLS - 2;
  const P_LO = 33; // 譜面の一番下 (A1)
  const P_HI = 96; // 一番上 (C7)
  const STAR_MUL = [1.5, 1.8, 2.4, 3.1, 4];
  const HARD = { tempo: 1.15, hp: 2.2, leak: 1.5, gold: 1.6 };
  const DYN_LEAK = [3, 3, 4, 5, 6, 8];
  const HP_TABLE = [[0.125, 3], [0.25, 6], [0.5, 10], [1, 18], [2, 32], [4, 55], [8, 80]];
  const R_TABLE = [[0.125, 7], [0.25, 8], [0.5, 9.5], [1, 11], [2, 13], [4, 16], [8, 18]];
  const BLACK_KEYS = [1, 3, 6, 8, 10];
  const MAX_TOWERS = 14; // 楽団の人数 (建てられるタワーの数) の上限
  const MAX_EVOS = 3; // 進化できるタワー (ソリスト) の数の上限

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
  const pitchColor = (p, l = 55) => `hsl(${((p % 12) * 30 + 350) % 360}, 75%, ${l}%)`;
  const pitchY = (p) => TOP + ((P_HI - clamp(p, P_LO, P_HI)) / (P_HI - P_LO)) * (ROWS * CELL);
  const yPitch = (y) => P_HI - ((y - TOP) / (ROWS * CELL)) * (P_HI - P_LO);
  const cellCenter = (c, r) => [c * CELL + CELL / 2, TOP + r * CELL + CELL / 2];

  // ---------- 状態 ----------
  let G = null;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let scale = 1;
  let offX = 0;
  let offY = 0;
  const input = {};

  function resize() {
    const wrap = canvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(300, rect.width);
    H = Math.max(240, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 上に HUD の帯 (40px)、下は余白なし。譜面全体が入るように縮める
    const hudH = 40;
    scale = Math.min(W / FW, (H - hudH) / FH);
    offX = (W - FW * scale) / 2;
    // 縦長の画面では譜面を上に寄せ、下の空きをパネルに使う
    const portrait = H > W * 0.8;
    offY = portrait ? hudH : hudH + (H - hudH - FH * scale) / 2;
  }
  // 画面の座標 → 譜面の座標
  function toField(px, py) {
    return [(px - offX) / scale, (py - offY) / scale];
  }
  function toScreen(x, y) {
    return [offX + x * scale, offY + y * scale];
  }

  // ---------- 能力値 ----------
  function computeStats() {
    const up = G.up;
    const c = G.composer;
    G.stats = {
      maxHp: c.hp + 10 * (up.hp || 0),
      might: (1 + 0.05 * (up.might || 0)) * (G.own ? 1.1 : 1),
      cd: (1 - 0.03 * (up.cd || 0)) * (c.id === 'chopin' ? 0.9 : 1),
      area: 1 + 0.05 * (up.area || 0),
      income: (1 + 0.05 * (up.income || 0)) * (c.id === 'mozart' ? 1.2 : 1),
      discount: 1 - 0.03 * (up.discount || 0),
      greed: 1 + 0.1 * (up.greed || 0),
    };
  }
  function globalMight() {
    let m = G.stats.might;
    if (G.composer.id === 'beethoven' && G.hp < G.stats.maxHp * 0.5) m *= 1.3;
    return m;
  }

  // タワーの値段
  function buildCost(id) {
    const fav = id === G.composer.weapon ? 0.8 : 1;
    return Math.round(D.TOWERS[id].cost * fav * G.stats.discount);
  }
  function upgradeCost(t) {
    return Math.round(D.TOWERS[t.id].cost * 0.7 * t.lv * G.stats.discount);
  }
  function evolveCost(t) {
    return Math.round(D.TOWERS[t.id].cost * 3 * G.stats.discount);
  }
  function towerUnlocked(id) {
    const lock = D.TOWERS[id].locked;
    return !lock || (window.CSUI && window.CSUI.songClearedByAnyone(lock));
  }

  // ---------- 開始 ----------
  function start(opt) {
    const song = opt.song;
    const score = window.CS_SCORES[song.score];
    const hard = opt.mode === 'hard';
    const parsed = parseScore(score, hard ? HARD.tempo : 1);
    G = {
      song,
      score,
      parsed,
      composer: opt.composer,
      mode: opt.mode,
      hard,
      own: song.composer === opt.composer.id,
      up: opt.up || {},
      sim: !!opt.sim,
      t: 0,
      phase: 'prep', // prep (準備) → song → coda (曲が終わって残りを待つ) → boss → win / dead
      phaseT: 0,
      paused: false,
      hp: 100,
      ink: 0,
      towers: [],
      grid: new Map(),
      notes: [],
      shots: [],
      fx: [],
      texts: [],
      boss: null,
      track: new Track(parsed.notes),
      btrack: null,
      beat: 0,
      tick: -1,
      bpm: parsed.bpmAt(0),
      killed: 0,
      leaked: 0,
      total: parsed.notes.length,
      inkEarned: 0,
      dmgTaken: 0,
      revived: false,
      result: null,
      sel: null, // 選んでいるマス { c, r }
      hover: null,
      shake: 0,
      timers: [],
      songEnd: parsed.lengthSec,
    };
    computeStats();
    G.hp = G.stats.maxHp;
    G.ink = 260 + 25 * (G.up.ink || 0);
    // 音符のインク: 曲全体で、だいたい決まった量になるように配る
    let wsum = 0;
    for (const n of parsed.notes) {
      n.w = logInterp(HP_TABLE, n.d) * clamp(Math.pow(1.35, -(n.p - 60) / 12), 0.4, 2.5);
      wsum += n.w;
    }
    const mins = parsed.lengthSec / 60;
    G.inkPool = (1100 + 900 * Math.pow(mins, 0.85)) * [1, 1.2, 1.4, 1.6, 1.8][song.stars - 1];
    G.inkPer = G.inkPool / wsum;
    markElites(parsed);
    G.boss = {
      x: SPAWN_X + 20,
      y: TOP + (ROWS * CELL) / 2,
      r: 40,
      hp: 1,
      maxHp: 1,
      shield: true,
      pulse: 0,
      hurtT: 0,
      def: song.boss,
      moving: false,
    };
    return G;
  }

  // 強い音符 (アクセント) が少ない曲は、旋律の長い音を何個かエリートにする (インクが多い)
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

  // 準備が終わって曲を始める
  function begin() {
    if (!G || G.phase !== 'prep') return;
    const beatSec = 60 / G.bpm;
    const countBeats = Math.max(2, Math.min(4, Math.round(G.parsed.barLen)));
    const clicks = [];
    for (let i = 0; i < countBeats; i++) clicks.push([0.3 + i * beatSec, i === 0]);
    G.track.start(0, countBeats * beatSec + 0.3, clicks);
    G.phase = 'song';
    G.phaseT = 0;
    G.sel = null;
    if (window.CSUI) window.CSUI.closeTowerPanel();
  }

  // ---------- 音符 ----------
  function spawnNote(src) {
    const o = (src.p - 60) / 12;
    const hardMul = G.hard ? HARD.hp : 1;
    const accomp = src.melody ? 1 : 0.8;
    // 曲が進むほど音符は硬くなる (出だし ×0.75 → 最後 ×2.4)。タワーが育つのに合わせて、終盤まで気が抜けないように
    // 長い曲はタワーが育ちきるので、3 分を過ぎたら経過した分数でもさらに硬くする (1 分ごとに +2)
    const grow = 0.75 + 1.65 * clamp((src.sec || 0) / G.parsed.lengthSec, 0, 1) + 4.5 * Math.max(0, (src.sec || 0) / 60 - 3);
    let hp = logInterp(HP_TABLE, src.d) * clamp(Math.pow(1.35, -o), 0.4, 2.5) * STAR_MUL[G.song.stars - 1] * (G.song.hpMul || 1) * hardMul * accomp * grow;
    let r = logInterp(R_TABLE, src.d);
    const mk = src.mk || '';
    const n = {
      x: SPAWN_X,
      y: pitchY(src.p) + rand(-2, 2),
      p: src.p,
      d: src.d,
      reg: regOf(src.p),
      col: pitchColor(src.p),
      melody: src.melody,
      v: src.v,
      spd: clamp(72 * Math.pow(1.3, o), 36, 175),
      kx: 0,
      flash: 0,
      slowT: 0,
      slowF: 1,
      stunT: 0,
      charm: 0,
      dead: false,
      stacc: mk.includes("'"),
      trill: mk.includes('~'),
      elite: mk.includes('>'),
      fermata: mk.includes('^'),
      grace: mk.includes('g'),
      sharp: BLACK_KEYS.includes(src.p % 12),
      phase: Math.random() * 6.28,
      dashT: rand(0, 1.2),
      t: 0,
      lastX: SPAWN_X,
      harpHit: null,
    };
    if (n.v >= 4) r *= n.v === 5 ? 1.15 : 1.08;
    if (n.elite) {
      hp *= 3;
      r *= 1.25;
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
    if (G.sim) G.dbgHp = Math.max(G.dbgHp || 0, hp);
    n.leak = DYN_LEAK[n.v] * (G.hard ? HARD.leak : 1) * (n.fermata ? 2 : 1);
    n.ink = G.inkPer * (src.w || 1) * (n.elite ? 4 : 1);
    G.notes.push(n);
    G.boss.pulse = 1;
    return n;
  }

  // 押し戻しとしびれは、続けて受けるほど効きにくい (同じ音符をずっと止め続けられないように)
  function knock(n, v) {
    n.kx += v / (1 + (n.kbRes || 0));
    n.kbRes = (n.kbRes || 0) + 1;
  }
  function stunNote(n, t) {
    if ((n.stunImm || 0) > 0) return;
    n.stunT = Math.max(n.stunT, t);
    n.stunImm = t + 1.5;
  }

  function hitNote(n, dmg, reg) {
    if (n === G.boss) return hitBoss(dmg);
    if (n.dead) return;
    let d = dmg * globalMight();
    if (reg && reg !== 'all' && reg === n.reg) d *= 1.5;
    n.hp -= d;
    n.flash = 0.1;
    if (n.hp <= 0) killNote(n);
  }

  function hitBoss(dmg) {
    const b = G.boss;
    if (b.shield || G.phase !== 'boss') return;
    b.hp -= dmg * globalMight();
    b.hurtT = 0.1;
    if (b.hp <= 0) {
      b.hp = 0;
      winStage();
    }
  }

  function killNote(n) {
    if (n.dead) return;
    n.dead = true;
    if (n.minion) {
      gainInk(n.ink, n.x, n.y);
      return;
    }
    G.killed++;
    gainInk(n.ink, n.x, n.y);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(60, 150);
      G.fx.push({ kind: 'spark', x: n.x, y: n.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: 0.3, col: n.col });
    }
    if (Math.random() < 0.3) Synth.sfx('pop', { p: scaleTone(n.p) });
  }

  function gainInk(v, x, y) {
    const got = v * G.stats.income;
    G.ink += got;
    G.inkEarned += got;
    if (got >= 3 && !G.sim) G.texts.push({ x, y: y - 10, s: '+' + Math.round(got), col: '#9ff3d0', t: 0, life: 0.7, size: 13, world: true });
  }

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

  // ---------- タワー ----------
  function canBuildAt(c, r) {
    return c >= BUILD_COL0 && c <= BUILD_COL1 && r >= 0 && r < ROWS && !G.grid.has(c + ',' + r);
  }
  function build(id, c, r) {
    if (!G || !canBuildAt(c, r) || !towerUnlocked(id) || G.towers.length >= MAX_TOWERS) return false;
    const cost = buildCost(id);
    if (G.ink < cost) return false;
    G.ink -= cost;
    const [x, y] = cellCenter(c, r);
    const t = { id, c, r, x, y, lv: 1, evo: false, spent: cost, cdT: 0.3, ready: false, a: 0, side: 1, flash: 0 };
    G.towers.push(t);
    G.grid.set(c + ',' + r, t);
    Synth.sfx('pick', { p: 79 });
    return t;
  }
  function evoCount() {
    return G.towers.filter((x) => x.evo).length;
  }
  function upgrade(t) {
    if (!t || t.evo) return false;
    if (t.lv >= 5) {
      const cost = evolveCost(t);
      if (G.ink < cost || evoCount() >= MAX_EVOS) return false;
      G.ink -= cost;
      t.spent += cost;
      t.evo = true;
      Synth.sfx('cymbal');
      G.texts.push({ s: '★ ' + L(D.EVOS[D.TOWERS[t.id].evo].name), col: '#e7c3ff', t: 0, life: 2.2, size: 20, world: false });
      return true;
    }
    const cost = upgradeCost(t);
    if (G.ink < cost) return false;
    G.ink -= cost;
    t.spent += cost;
    t.lv++;
    t.flash = 0.4;
    Synth.sfx('level', { p: 72 + t.lv * 2 });
    return true;
  }
  function sell(t) {
    if (!t) return;
    G.ink += Math.round(t.spent * 0.7);
    G.towers = G.towers.filter((x) => x !== t);
    G.grid.delete(t.c + ',' + t.r);
    Synth.sfx('pick', { p: 67 });
  }
  function tParams(t) {
    const def = D.TOWERS[t.id];
    const P = { ...def.lv(t.lv) };
    const S = G.stats;
    if (P.range) P.range *= S.area;
    if (P.len) P.len *= S.area;
    if (P.dmg) P.dmg *= t.id === G.composer.weapon ? 1.25 : 1;
    if (P.cd) P.cd *= S.cd;
    // 指揮棒の強化 (一番強いもの 1 つ)
    if (def.kind !== 'buff') {
      let mt = 0;
      let hs = 0;
      for (const b of G.towers) {
        if (b.id !== 'baton') continue;
        const BP = D.TOWERS.baton.lv(b.lv);
        const range = BP.range * S.area * (b.evo ? 1.25 : 1);
        if (dist2(b.x, b.y, t.x, t.y) <= range * range) {
          mt = Math.max(mt, BP.might * (b.evo ? 1.6 : 1));
          hs = Math.max(hs, BP.haste * (b.evo ? 1.6 : 1));
        }
      }
      if (P.dmg) P.dmg *= 1 + mt;
      if (P.cd) P.cd *= 1 - hs;
      t.buffed = mt > 0;
    }
    return P;
  }

  // 範囲の中で一番先頭 (左) の音符
  function firstInRange(x, y, range, skip) {
    let best = null;
    for (const n of G.notes) {
      if (n.dead || n.charm > 0 || n === skip) continue;
      if (dist2(n.x, n.y, x, y) > (range + n.r) * (range + n.r)) continue;
      if (!best || n.x < best.x) best = n;
    }
    if (!best && G.phase === 'boss' && !G.boss.shield && dist2(G.boss.x, G.boss.y, x, y) < (range + G.boss.r) ** 2) return G.boss;
    return best;
  }
  function inRadius(x, y, r, fn) {
    for (const n of G.notes) if (!n.dead && dist2(n.x, n.y, x, y) <= (r + n.r) * (r + n.r)) fn(n);
    if (G.phase === 'boss' && dist2(G.boss.x, G.boss.y, x, y) <= (r + G.boss.r) ** 2) fn(G.boss);
  }

  function updateTowers(dt, newTick) {
    for (const t of G.towers) {
      t.flash = Math.max(0, t.flash - dt);
      const def = D.TOWERS[t.id];
      const P = tParams(t);
      t.P = P;
      if (def.kind === 'aura') {
        // チェロ: まわりを遅くし、少しずつ削る
        const r = P.range * (t.evo ? 1.4 : 1);
        const slow = Math.min(0.4, P.slow + (t.evo ? 0.1 : 0));
        t.cdT -= dt;
        const tickNow = t.cdT <= 0;
        if (tickNow) t.cdT = P.cd;
        inRadius(t.x, t.y, r, (n) => {
          if (n === G.boss) {
            if (tickNow) hitBoss(P.dmg);
            return;
          }
          n.slowT = 0.2;
          n.slowF = Math.min(n.slowF, 1 - slow);
          if (tickNow) hitNote(n, P.dmg * (t.evo ? 1.5 : 1), def.reg);
        });
        continue;
      }
      if (def.kind === 'buff') {
        if (t.evo) {
          inRadius(t.x, t.y, P.range * G.stats.area * 1.25, (n) => {
            if (n === G.boss) return;
            n.slowT = 0.2;
            n.slowF = Math.min(n.slowF, 0.85);
          });
        }
        continue;
      }
      if (def.kind === 'string') {
        // ハープ: 縦の弦を通りぬけた音符に
        const h = P.range * (t.evo ? 1.4 : 1);
        const xs = t.evo ? [t.x - 18, t.x + 18] : [t.x];
        for (const n of G.notes) {
          if (n.dead || Math.abs(n.y - t.y) > h + n.r) continue;
          for (const sx of xs) {
            if (n.lastX > sx && n.x <= sx) {
              hitNote(n, P.dmg, def.reg);
              t.flash = 0.15;
            }
          }
        }
        if (G.phase === 'boss' && !G.boss.shield && Math.abs(G.boss.y - t.y) < h + G.boss.r) {
          for (const sx of xs) if (G.boss.lastX > sx && G.boss.x <= sx) hitBoss(P.dmg * 6);
        }
        continue;
      }
      t.cdT -= dt;
      if (t.cdT <= 0) t.ready = true;
      if (!t.ready || !newTick) continue;
      if (fireTower(t, def, P)) {
        t.ready = false;
        t.cdT = P.cd * (t.evo ? 0.85 : 1);
      }
    }
  }

  // 撃てたら true
  function fireTower(t, def, P) {
    const reg = def.reg;
    switch (def.kind) {
      case 'shot': {
        const target = firstInRange(t.x, t.y, P.range);
        if (!target) return false;
        const cnt = 1 + (G.composer.id === 'chopin' ? 1 : 0);
        const per = t.evo ? 3 : 1;
        const base = Math.atan2(target.y - t.y, target.x - t.x);
        for (let i = 0; i < cnt; i++)
          for (let j = 0; j < per; j++) {
            const a = base + (i - (cnt - 1) / 2) * 0.12 + (j - (per - 1) / 2) * 0.1;
            G.shots.push({ kind: 'key', x: t.x, y: t.y, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, r: 6, dmg: P.dmg, pierce: t.evo ? 3 : 1, t: 0, life: (P.range + 60) / 620, hit: new Set(), reg, burst: t.evo, target });
          }
        Synth.sfx('shot', { p: scaleTone(84) });
        return true;
      }
      case 'beam': {
        const len = P.len * (t.evo ? 1.4 : 1);
        const width = P.width * (t.evo ? 1.7 : 1);
        let any = false;
        for (const n of G.notes) if (!n.dead && n.x > t.x && n.x < t.x + len && Math.abs(n.y - t.y) < width / 2 + n.r) any = true;
        if (G.phase === 'boss' && G.boss.x > t.x && G.boss.x < t.x + len + G.boss.r && Math.abs(G.boss.y - t.y) < width / 2 + G.boss.r) any = true;
        if (!any) return false;
        const beam = { kind: 'beam', x: t.x, y: t.y, len, width, t: 0, life: t.evo ? 0.6 : 0.18, tick: 0, dmg: P.dmg, reg, evo: t.evo };
        beamHit(beam, P.dmg);
        G.fx.push(beam);
        return true;
      }
      case 'pulse': {
        let any = false;
        inRadius(t.x, t.y, P.range, () => (any = true));
        if (!any) return false;
        const pulse = (r, stun) => {
          G.fx.push({ kind: 'ring', x: t.x, y: t.y, r, t: 0, life: 0.35, col: '#ffcf7a' });
          inRadius(t.x, t.y, r, (n) => {
            if (n === G.boss) return hitBoss(P.dmg);
            hitNote(n, P.dmg, reg);
            knock(n, P.kb * 4 / (1 + n.d * 0.3));
            if (stun) stunNote(n, stun);
          });
        };
        pulse(P.range, t.evo ? 0.5 : 0);
        if (t.evo) G.timers.push({ t: 0.25, fn: () => pulse(P.range * 1.25, 0.5) });
        Synth.sfx('boom');
        return true;
      }
      case 'homing': {
        const target = firstInRange(t.x, t.y, P.range);
        if (!target) return false;
        for (let i = 0; i < P.count; i++) {
          const a = Math.PI + rand(-1.2, 1.2);
          G.shots.push({ kind: 'wind', x: t.x, y: t.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, sp: 340, r: 5, dmg: P.dmg, pierce: 1, t: 0, life: 2.5, hit: new Set(), reg, homing: true, range: P.range, home: t, charm: t.evo ? 0.12 : 0 });
        }
        return true;
      }
      case 'cone': {
        let any = false;
        const half = 0.55;
        const hitCone = (mul) => {
          G.fx.push({ kind: 'cone', x: t.x, y: t.y, a: 0, half, r: P.range, t: 0, life: 0.25 });
          inRadius(t.x, t.y, P.range, (n) => {
            const a = Math.atan2(n.y - t.y, n.x - t.x);
            if (Math.abs(a) > half + 0.2) return;
            if (n === G.boss) return hitBoss(P.dmg * mul);
            hitNote(n, P.dmg * mul, reg);
            knock(n, (P.kb * 4 * mul) / (1 + n.d * 0.3));
          });
        };
        inRadius(t.x, t.y, P.range, (n) => {
          if (Math.abs(Math.atan2(n.y - t.y, n.x - t.x)) <= half + 0.2) any = true;
        });
        if (!any) return false;
        hitCone(1);
        if (t.evo) G.timers.push({ t: 0.3, fn: () => hitCone(1) });
        return true;
      }
      case 'splash': {
        const target = firstInRange(t.x, t.y, P.range);
        if (!target) return false;
        const throwAt = (tx, ty) => G.shots.push({ kind: 'cymbal', x: t.x, y: t.y, tx, ty, t: 0, life: 0.35, sx: t.x, sy: t.y, dmg: P.dmg, splash: P.splash * (t.evo ? 1.5 : 1), reg, lob: true, spin: 0 });
        throwAt(target.x - 20, target.y);
        if (t.evo) {
          const t2 = firstInRange(t.x, t.y, P.range, target);
          if (t2) throwAt(t2.x - 20, t2.y);
        }
        return true;
      }
      case 'pillar': {
        // 一番硬い音符を狙う
        let best = null;
        for (const n of G.notes) {
          if (n.dead || dist2(n.x, n.y, t.x, t.y) > P.range * P.range) continue;
          if (!best || n.hp > best.hp) best = n;
        }
        if (!best && G.phase === 'boss' && dist2(G.boss.x, G.boss.y, t.x, t.y) < (P.range + G.boss.r) ** 2) best = G.boss;
        if (!best) return false;
        const spots = [[best.x - best.spd * 0.35 * (best === G.boss ? 0 : 1), best.y]];
        if (t.evo) {
          const others = G.notes.filter((n) => !n.dead && n !== best && dist2(n.x, n.y, t.x, t.y) < P.range * P.range);
          for (let i = 0; i < 2 && others.length; i++) {
            const o = others.splice((Math.random() * others.length) | 0, 1)[0];
            spots.push([o.x - o.spd * 0.35, o.y]);
          }
        }
        for (const [sx, sy] of spots) {
          G.fx.push({ kind: 'pipeWarn', x: sx, y: sy, r: P.splash, t: 0, life: 0.35 });
          G.timers.push({
            t: 0.35,
            fn: () => {
              G.fx.push({ kind: 'pipe', x: sx, y: sy, r: P.splash, t: 0, life: 0.4 });
              inRadius(sx, sy, P.splash, (n) => (n === G.boss ? hitBoss(P.dmg) : hitNote(n, P.dmg, reg)));
            },
          });
        }
        return true;
      }
      default:
        return false;
    }
  }

  function beamHit(b, dmg) {
    for (const n of G.notes) if (!n.dead && n.x > b.x - n.r && n.x < b.x + b.len && Math.abs(n.y - b.y) < b.width / 2 + n.r) hitNote(n, dmg, b.reg);
    const B = G.boss;
    if (G.phase === 'boss' && B.x > b.x && B.x < b.x + b.len + B.r && Math.abs(B.y - b.y) < b.width / 2 + B.r) hitBoss(dmg);
  }

  function updateShots(dt) {
    for (const s of G.shots) {
      s.t += dt;
      if (s.lob) {
        // シンバル: 放物線で飛んで、着いたところで爆ぜる
        const k = Math.min(1, s.t / s.life);
        s.x = s.sx + (s.tx - s.sx) * k;
        s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * 40;
        s.spin += dt * 20;
        if (k >= 1) {
          G.fx.push({ kind: 'ring', x: s.tx, y: s.ty, r: s.splash, t: 0, life: 0.3, col: '#ffe066' });
          inRadius(s.tx, s.ty, s.splash, (n) => (n === G.boss ? hitBoss(s.dmg) : hitNote(n, s.dmg, s.reg)));
          s.t = 99;
          if (Math.random() < 0.3) Synth.sfx('cymbal');
        }
        continue;
      }
      if (s.homing) {
        if (!s.target || s.target.dead) s.target = firstInRange(s.home.x, s.home.y, s.range + 60);
        if (s.target) {
          const a = Math.atan2(s.target.y - s.y, s.target.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let da = a - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const na = cur + clamp(da, -7 * dt, 7 * dt);
          s.vx = Math.cos(na) * s.sp;
          s.vy = Math.sin(na) * s.sp;
        }
      } else if (s.target && !s.target.dead && s.target !== G.boss) {
        // ピアノの弾は少しだけ追う
        const a = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const sp = Math.hypot(s.vx, s.vy);
        const cur = Math.atan2(s.vy, s.vx);
        let da = a - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const na = cur + clamp(da, -4 * dt, 4 * dt);
        s.vx = Math.cos(na) * sp;
        s.vy = Math.sin(na) * sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const n of G.notes) {
        if (n.dead || s.t >= s.life || s.hit.has(n) || n.charm > 0) continue;
        if (dist2(n.x, n.y, s.x, s.y) < (s.r + n.r) ** 2) {
          s.hit.add(n);
          hitNote(n, s.dmg, s.reg);
          if (s.charm && !n.dead && !n.fermata && Math.random() < s.charm) n.charm = 4;
          if (s.burst) {
            G.fx.push({ kind: 'ring', x: s.x, y: s.y, r: 36, t: 0, life: 0.2, col: '#bfe3ff' });
            inRadius(s.x, s.y, 36, (m) => m !== n && m !== G.boss && hitNote(m, s.dmg * 0.5, null));
          }
          s.pierce--;
          if (s.pierce <= 0) s.t = 99;
        }
      }
      const B = G.boss;
      if (G.phase === 'boss' && s.t < s.life && !s.hit.has(B) && dist2(B.x, B.y, s.x, s.y) < (s.r + B.r) ** 2) {
        s.hit.add(B);
        hitBoss(s.dmg);
        s.t = 99;
      }
    }
    G.shots = G.shots.filter((s) => s.t < s.life);
    for (const f of G.fx) {
      if (f.kind === 'beam' && f.evo) {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.1;
          beamHit(f, f.dmg * 0.3);
        }
      }
    }
  }

  // ---------- 1 フレーム ----------
  function update(dt) {
    if (!G || G.paused) return;
    G.t += dt;
    G.phaseT += dt;
    const tr = G.phase === 'boss' ? G.btrack : G.track;
    const pos = tr ? tr.pos() : 0;

    // 拍の時計 (タワーの攻撃は 16 分音符の刻みに合わせる)
    if (G.phase === 'song' && pos >= 0) {
      G.beat = G.parsed.secToBeat(pos);
      G.bpm = G.parsed.bpmAt(G.beat);
    } else if (G.phase === 'boss' && pos >= 0) {
      G.beat = (pos * G.bpm) / 60;
    } else {
      G.beat += (dt * G.bpm) / 60;
    }
    const tick = Math.floor(G.beat * 4);
    const newTick = tick !== G.tick;
    G.tick = tick;

    if (G.phase === 'prep') {
      updateFx(dt);
      return;
    }

    // --- 段階 ---
    if (G.phase === 'song') {
      for (const n of G.track.due(pos)) spawnNote(n);
      if (pos > G.songEnd + 0.3 && G.track.remaining() === 0) {
        G.phase = 'coda';
        G.phaseT = 0;
      }
    } else if (G.phase === 'coda') {
      if (!G.notes.length) startBoss();
    } else if (G.phase === 'boss') {
      for (const n of G.btrack.due(pos)) spawnMinion(n);
    } else if (G.phase === 'win') {
      if (G.phaseT > 3 && !G.result) finish(true);
    } else if (G.phase === 'dead') {
      if (G.phaseT > 1.6 && !G.result) finish(false);
    }

    // --- 音符 ---
    if (G.sim) G.dbgAlive = Math.max(G.dbgAlive || 0, G.notes.length);
    for (const n of G.notes) updateNote(n, dt);
    G.notes = G.notes.filter((n) => !n.dead);

    // --- ボス ---
    const B = G.boss;
    B.pulse = Math.max(0, B.pulse - dt * 4);
    B.hurtT -= dt;
    B.lastX = B.x;
    if (G.phase === 'boss') {
      B.x -= B.spd * dt;
      if (B.x - B.r < PODIUM_X) {
        // 指揮台に届いた: 負け
        damagePodium(9999);
      }
    }

    // --- タワーと弾 ---
    if (G.phase !== 'dead' && G.phase !== 'win') updateTowers(dt, newTick);
    updateShots(dt);
    for (const tm of G.timers) {
      tm.t -= dt;
      if (tm.t <= 0) tm.fn();
    }
    G.timers = G.timers.filter((tm) => tm.t > 0);
    updateFx(dt);
  }

  function updateFx(dt) {
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
      if (t.world) t.y -= 18 * dt;
    }
    G.texts = G.texts.filter((t) => t.t < t.life);
    G.shake = Math.max(0, G.shake - dt);
  }

  function updateNote(n, dt) {
    n.t += dt;
    n.flash -= dt;
    n.slowT -= dt;
    if (n.slowT <= 0) n.slowF = 1;
    n.stunT -= dt;
    n.stunImm = (n.stunImm || 0) - dt;
    n.kbRes = Math.max(0, (n.kbRes || 0) - dt * 0.6);
    n.lastX = n.x;
    let sp = n.spd * n.slowF;
    if (n.stunT > 0) sp = 0;
    if (n.stacc) {
      // スタッカート: 止まっては、ぴょんと進む
      n.dashT -= dt;
      if (n.dashT < 0) n.dashT = 1.0;
      sp *= n.dashT < 0.25 ? 2.6 : 0.5;
    }
    if (n.charm > 0) {
      // 魅了: 右へ戻りながら、ぶつかった音符を攻撃する
      n.charm -= dt;
      n.x += n.spd * 0.8 * dt;
      for (const m of G.notes) {
        if (m === n || m.dead || m.charm > 0) continue;
        if (dist2(m.x, m.y, n.x, n.y) < (m.r + n.r) ** 2) {
          hitNote(m, 12, null);
          n.charm -= 0.6;
        }
      }
      if (n.charm <= 0 || n.x > SPAWN_X) killNote(n);
      return;
    }
    n.x -= sp * dt;
    n.x += n.kx * dt;
    n.kx *= Math.pow(0.02, dt);
    if (n.x > SPAWN_X) n.x = SPAWN_X;
    if (n.trill) n.y += Math.sin(n.t * 16 + n.phase) * 0.6;
    if (n.x - n.r < PODIUM_X) {
      n.dead = true;
      if (!n.minion) {
        G.leaked++;
        if (G.sim) (G.dbgLeak = G.dbgLeak || []).push(Math.round(G.t));
      }
      damagePodium(n.leak);
    }
  }

  function damagePodium(d) {
    if (G.phase === 'dead' || G.phase === 'win') return;
    G.hp -= d;
    G.dmgTaken += d;
    G.shake = Math.max(G.shake, 0.15);
    G.hurtT = 0.25;
    Synth.sfx('hurt');
    if (G.hp <= 0) {
      if (G.up.revive && !G.revived) {
        G.revived = true;
        G.hp = G.stats.maxHp * 0.5;
        G.texts.push({ s: T('revived'), col: '#ffe9a8', t: 0, life: 2.4, size: 20, world: false });
        for (const n of G.notes) n.kx += 500;
        if (G.phase === 'boss') G.boss.x = Math.min(SPAWN_X, G.boss.x + 300);
        return;
      }
      G.hp = 0;
      G.phase = 'dead';
      G.phaseT = 0;
      G.track.stop();
      if (G.btrack) G.btrack.stop();
    }
  }

  // 曲が終わり、音符がいなくなった: ボスが主題を鳴らしながら流れてくる
  function startBoss() {
    const sc = G.score;
    const th = sc.theme || { part: 0, from: 0, len: G.parsed.barLen * 4, tempo: 100 };
    const bpm = th.tempo * (G.hard ? HARD.tempo : 1);
    const { notes } = window.CSAudio.partNotes(sc.parts[th.part], 0, 'theme', sc.ppq);
    const list = [];
    for (const n of notes) {
      if (n.t < th.from - 1e-6 || n.t >= th.from + th.len - 1e-6) continue;
      list.push({ ...n, sec: ((n.t - th.from) * 60) / bpm, dur: (n.d * 60) / bpm, inst: sc.parts[th.part].inst, vol: 1 });
    }
    list.sort((a, b) => a.sec - b.sec);
    G.track.stop();
    G.btrack = new Track(list, { loopLen: (th.len * 60) / bpm });
    G.bpm = bpm;
    const B = G.boss;
    B.shield = false;
    B.maxHp = B.hp = 3200 * STAR_MUL[G.song.stars - 1] * (G.hard ? HARD.hp : 1);
    B.spd = 24;
    B.y = TOP + (ROWS * CELL) / 2;
    G.phase = 'boss';
    G.phaseT = 0;
    G.lastMinion = -1;
    G.btrack.start(0, 0.6);
    Synth.sfx('cymbal');
    G.texts.push({ s: T('bossIncoming'), col: '#ffd27a', t: 0, life: 3, size: 20, world: false });
  }

  // 決戦: 主題の音が、ボスから小さな音符になって流れ出す (倒すとインク。数には入れない)
  function spawnMinion(src) {
    if (G.t - G.lastMinion < 0.22) return;
    G.lastMinion = G.t;
    const n = spawnNote(src);
    n.x = G.boss.x - G.boss.r;
    n.minion = true;
    n.hp = n.maxHp = n.hp * 0.6;
    n.ink *= 0.3;
    n.leak *= 0.7;
  }

  function winStage() {
    if (G.phase === 'win') return;
    G.phase = 'win';
    G.phaseT = 0;
    if (G.btrack) G.btrack.stop();
    for (const n of G.notes) n.dead = true;
    Synth.sfx('cymbal');
    Synth.sfx('applause');
    G.shake = 0.5;
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
    const leakRate = G.leaked / Math.max(1, G.total);
    const hpRate = G.hp / G.stats.maxHp;
    const rank = !win ? '-' : G.leaked === 0 ? 'S' : leakRate < 0.02 && hpRate > 0.6 ? 'A' : hpRate > 0.3 ? 'B' : 'C';
    let gold = G.killed * 0.1 * G.song.stars + progress * 25 * G.song.stars;
    if (win) gold += 40 * G.song.stars;
    if (G.hard) gold *= HARD.gold;
    if (!G.own) gold *= 1.2;
    gold = Math.round(gold * G.stats.greed);
    G.result = { win, progress, killed: G.killed, total: G.total, leaked: G.leaked, dmg: Math.round(G.dmgTaken), time, rank, gold, towers: G.towers.length, bar: Math.floor(G.parsed.secToBeat(pos) / P.barLen) + 1, bars: Math.ceil(P.lengthBeats / P.barLen) };
    if (G.onFinish) G.onFinish(G.result);
  }

  function pause() {
    if (!G || G.paused || G.result) return;
    G.paused = true;
    const tr = G.phase === 'boss' ? G.btrack : G.track;
    if (tr && G.phase !== 'prep') tr.pause();
  }
  function resume() {
    if (!G || !G.paused) return;
    G.paused = false;
    const tr = G.phase === 'boss' ? G.btrack : G.track;
    if (!tr || G.phase === 'prep' || G.phase === 'win' || G.phase === 'dead' || G.phase === 'coda') return;
    const beatSec = 60 / G.bpm;
    tr.start(Math.max(0, tr.pausedPos - beatSec), beatSec * 2, [[0, true], [beatSec, false]]);
  }
  function quit() {
    if (!G) return;
    G.track && G.track.stop();
    G.btrack && G.btrack.stop();
    Synth.hush(0.2);
    if (window.CSUI) window.CSUI.closeTowerPanel();
    G = null;
  }

  // ---------- 入力 (マスを押す) ----------
  function tapAt(px, py) {
    if (!G || G.result) return null;
    const [x, y] = toField(px, py);
    const c = Math.floor(x / CELL);
    const r = Math.floor((y - TOP) / CELL);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) {
      G.sel = null;
      return null;
    }
    const t = G.grid.get(c + ',' + r);
    if (t) {
      G.sel = { c, r, tower: t };
      return { tower: t };
    }
    if (canBuildAt(c, r)) {
      G.sel = { c, r };
      return { cell: { c, r } };
    }
    G.sel = null;
    return null;
  }
  function hoverAt(px, py) {
    if (!G) return;
    const [x, y] = toField(px, py);
    const c = Math.floor(x / CELL);
    const r = Math.floor((y - TOP) / CELL);
    G.hover = c >= 0 && c < COLS && r >= 0 && r < ROWS ? { c, r } : null;
  }

  // ---------- 描画 ----------
  const STAFF_LINES = [64, 67, 71, 74, 77, 43, 47, 50, 53, 57];
  function render() {
    ctx.save();
    ctx.fillStyle = '#14101a';
    ctx.fillRect(0, 0, W, H);
    if (!G) {
      ctx.restore();
      return;
    }
    let sx = 0;
    let sy = 0;
    if (G.shake > 0 && window.CSUI.settings.shake) {
      sx = rand(-1, 1) * G.shake * 10;
      sy = rand(-1, 1) * G.shake * 10;
    }
    ctx.translate(offX + sx, offY + sy);
    ctx.scale(scale, scale);
    drawField();
    // 選んでいるマス・カーソル
    const showRange = (t) => {
      const P = t.P || tParams(t);
      const def = D.TOWERS[t.id];
      ctx.save();
      ctx.fillStyle = 'rgba(255, 230, 150, 0.12)';
      ctx.strokeStyle = 'rgba(255, 230, 150, 0.6)';
      ctx.lineWidth = 2;
      if (def.kind === 'beam') {
        const w = P.width * (t.evo ? 1.7 : 1);
        ctx.fillRect(t.x, t.y - w / 2, P.len * (t.evo ? 1.4 : 1), w);
        ctx.strokeRect(t.x, t.y - w / 2, P.len * (t.evo ? 1.4 : 1), w);
      } else if (def.kind === 'string') {
        const h = P.range * (t.evo ? 1.4 : 1);
        ctx.fillRect(t.x - 10, t.y - h, 20, h * 2);
        ctx.strokeRect(t.x - 10, t.y - h, 20, h * 2);
      } else {
        const r = (P.range || 0) * (def.kind === 'buff' ? G.stats.area * (t.evo ? 1.25 : 1) : def.kind === 'aura' && t.evo ? 1.4 : 1);
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };
    if (G.sel) {
      const [x, y] = cellCenter(G.sel.c, G.sel.r);
      if (G.sel.tower) showRange(G.sel.tower);
      else if (G.sel.preview) showRange({ id: G.sel.preview, x, y, lv: 1, evo: false });
      ctx.strokeStyle = '#ffd84a';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - CELL / 2 + 2, y - CELL / 2 + 2, CELL - 4, CELL - 4);
    } else if (G.hover && canBuildAt(G.hover.c, G.hover.r)) {
      const [x, y] = cellCenter(G.hover.c, G.hover.r);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
    }
    for (const t of G.towers) drawTower(t);
    // チェロの範囲 (いつも薄く)
    for (const t of G.towers) {
      if (D.TOWERS[t.id].kind !== 'aura') continue;
      const P = t.P || tParams(t);
      ctx.fillStyle = 'rgba(140, 100, 220, 0.10)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, P.range * (t.evo ? 1.4 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    // ハープの弦
    for (const t of G.towers) {
      if (D.TOWERS[t.id].kind !== 'string') continue;
      const P = t.P || tParams(t);
      const h = P.range * (t.evo ? 1.4 : 1);
      for (const x of t.evo ? [t.x - 18, t.x + 18] : [t.x]) {
        ctx.strokeStyle = t.flash > 0 ? '#fffbe0' : 'rgba(240, 220, 150, 0.85)';
        ctx.lineWidth = t.flash > 0 ? 3 : 2;
        ctx.shadowColor = '#ffe9a0';
        ctx.shadowBlur = t.flash > 0 ? 10 : 4;
        ctx.beginPath();
        ctx.moveTo(x, t.y - h);
        ctx.lineTo(x, t.y + h);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    for (const f of G.fx) if (f.kind === 'pipeWarn') drawFx(f);
    for (const n of G.notes) drawNote(ctx, n);
    drawBoss(G.boss);
    for (const s of G.shots) drawShot(s);
    for (const f of G.fx) if (f.kind !== 'pipeWarn') drawFx(f);
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
    drawHud();
  }

  function drawField() {
    // 五線紙
    const g = ctx.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, '#f6efdf');
    g.addColorStop(1, '#eadfc6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FW, FH);
    // 建てられるマス
    ctx.strokeStyle = 'rgba(120, 95, 60, 0.13)';
    ctx.lineWidth = 1;
    for (let c = BUILD_COL0; c <= BUILD_COL1 + 1; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, TOP);
      ctx.lineTo(c * CELL, TOP + ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(BUILD_COL0 * CELL, TOP + r * CELL);
      ctx.lineTo((BUILD_COL1 + 1) * CELL, TOP + r * CELL);
      ctx.stroke();
    }
    // 大譜表の線
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.55)';
    ctx.lineWidth = 2;
    for (const p of STAFF_LINES) {
      const y = pitchY(p);
      ctx.beginPath();
      ctx.moveTo(PODIUM_X - 10, y);
      ctx.lineTo(FW - 10, y);
      ctx.stroke();
    }
    // ト音記号とヘ音記号
    ctx.fillStyle = 'rgba(40, 30, 20, 0.7)';
    ctx.font = `${Math.round(pitchY(64) - pitchY(77) + 26)}px serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('𝄞', PODIUM_X - 4, pitchY(62));
    ctx.font = `${Math.round(pitchY(43) - pitchY(57) + 6)}px serif`;
    ctx.fillText('𝄢', PODIUM_X - 4, pitchY(46));
    // オクターブの目盛り (左端)
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    for (let p = 36; p <= 96; p += 12) {
      ctx.fillStyle = 'rgba(90, 70, 50, 0.55)';
      ctx.fillText('C' + (p / 12 - 1), 4, pitchY(p) + 4);
    }
    // 指揮台 (左端)
    ctx.fillStyle = 'rgba(80, 40, 30, 0.12)';
    ctx.fillRect(0, 0, PODIUM_X, FH);
    ctx.strokeStyle = G.hurtT > 0 ? '#ff5050' : '#8b3a2e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(PODIUM_X, TOP);
    ctx.lineTo(PODIUM_X, TOP + ROWS * CELL);
    ctx.stroke();
    G.hurtT = Math.max(0, (G.hurtT || 0) - 1 / 60);
    // 指揮台に立つ作曲家
    const cy = FH / 2;
    ctx.fillStyle = '#5a2f1f';
    ctx.fillRect(18, cy + 30, 60, 22);
    drawComposer(ctx, G.composer, 48, cy + 8, 1.6, 1, G.phase === 'song' ? G.beat * Math.PI : 0, false);
    // 右端 (ボスの側)
    ctx.fillStyle = 'rgba(60, 20, 60, 0.10)';
    ctx.fillRect(SPAWN_X, 0, FW - SPAWN_X, FH);
  }

  function drawTower(t) {
    const def = D.TOWERS[t.id];
    ctx.save();
    ctx.translate(t.x, t.y);
    const s = 1 + t.flash * 0.25;
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.evo ? '#3a2a10' : '#2c2433';
    roundRect(-25, -25, 50, 50, 10);
    ctx.fill();
    ctx.strokeStyle = t.evo ? '#ffd84a' : t.buffed ? '#7ef0c8' : regColor(def.reg);
    ctx.lineWidth = t.evo ? 3.5 : 2.5;
    roundRect(-25, -25, 50, 50, 10);
    ctx.stroke();
    ctx.fillStyle = '#f4efe0';
    roundRect(-19, -21, 38, 34, 7);
    ctx.fill();
    drawIcon(ctx, t.evo ? def.evo : t.id, 0, -4, 30);
    // レベル
    if (t.evo) {
      ctx.fillStyle = '#ffd84a';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('★', 0, 22);
    } else {
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < t.lv ? '#ffd84a' : 'rgba(255,255,255,0.2)';
        ctx.fillRect(-17 + i * 7, 16, 5, 5);
      }
    }
    ctx.restore();
  }
  function regColor(reg) {
    return { lo: '#d08a4a', mid: '#6fb5ff', hi: '#ff8ad0', all: '#b9b0c8' }[reg];
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
      ctx.strokeStyle = s.charm ? '#d6338f' : '#2a8fb0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.quadraticCurveTo(-5, -5, 0, 0);
      ctx.quadraticCurveTo(5, 5, 9, 0);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(8, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.kind === 'cymbal') {
      ctx.rotate(s.spin);
      ctx.fillStyle = '#5a4210';
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6c04a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFx(f) {
    const k = f.t / f.life;
    ctx.save();
    switch (f.kind) {
      case 'spark':
      case 'petal':
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.col;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.kind === 'petal' ? 5 : 3 * (1 - k) + 1, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#2a1600';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = f.col;
        ctx.lineWidth = 4;
        ctx.stroke();
        break;
      case 'cone':
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.translate(f.x, f.y);
        ctx.fillStyle = 'rgba(255, 190, 80, 0.5)';
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, f.r * (0.6 + 0.4 * k), -f.half, f.half);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'beam': {
        ctx.globalAlpha = f.evo ? 0.85 : 1 - k;
        ctx.fillStyle = '#5a1f00';
        ctx.fillRect(f.x, f.y - f.width / 2 - 2, f.len, f.width + 4);
        const g = ctx.createLinearGradient(0, f.y - f.width / 2, 0, f.y + f.width / 2);
        g.addColorStop(0, '#ff9d3a');
        g.addColorStop(0.5, '#fff7d6');
        g.addColorStop(1, '#ff9d3a');
        ctx.fillStyle = g;
        ctx.fillRect(f.x, f.y - f.width / 2, f.len, f.width);
        break;
      }
      case 'pipeWarn':
        ctx.fillStyle = `rgba(80, 120, 200, ${0.15 + k * 0.3})`;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'pipe': {
        ctx.globalAlpha = 1 - k;
        const h = 80 * (1 - Math.abs(k - 0.3));
        const g = ctx.createLinearGradient(f.x - f.r / 2, 0, f.x + f.r / 2, 0);
        g.addColorStop(0, '#9fb3c8');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, '#7c90a6');
        ctx.fillStyle = '#4a5a6a';
        ctx.fillRect(f.x - f.r * 0.5 - 2, f.y - h - 2, f.r + 4, h + 4);
        ctx.fillStyle = g;
        ctx.fillRect(f.x - f.r * 0.5, f.y - h, f.r, h);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  // 画面の上の帯
  function drawHud() {
    ctx.save();
    const S = G.stats;
    ctx.fillStyle = 'rgba(20, 14, 28, 0.92)';
    ctx.fillRect(0, 0, W, 40);
    const P = G.parsed;
    const prog = G.phase === 'prep' ? 0 : G.phase === 'song' ? clamp(G.track.pos() / G.songEnd, 0, 1) : 1;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 36, W, 4);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(0, 36, W * prog, 4);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    let x = 10;
    const put = (s, col) => {
      ctx.fillStyle = col;
      ctx.fillText(s, x, 19);
      x += ctx.measureText(s).width + 16;
    };
    put('🖋 ' + Math.floor(G.ink), '#9ff3d0');
    put('🎻 ' + G.towers.length + '/' + MAX_TOWERS, G.towers.length >= MAX_TOWERS ? '#ffb3b3' : '#cfc3ff');
    // 体力
    const hpw = Math.min(140, W * 0.18);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, 12, hpw, 14);
    ctx.fillStyle = G.hp / S.maxHp < 0.3 ? '#ff5e5e' : '#5ee08a';
    ctx.fillRect(x, 12, hpw * clamp(G.hp / S.maxHp, 0, 1), 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(G.hp)}/${S.maxHp}`, x + 4, 19);
    x += hpw + 14;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const bar = clamp(Math.floor(G.beat / P.barLen) + 1, 1, 9999);
    const totalBars = Math.ceil(P.lengthBeats / P.barLen);
    let right = G.hard ? 'HARD  ' : '';
    if (G.phase === 'song') right += `${T('bar')} ${Math.min(bar, totalBars)}/${totalBars}  ♪ ${G.track.remaining()}  `;
    if (G.leaked) right += `↯ ${G.leaked}`;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(right, W - 54, 19);
    // バナー
    const banners = G.texts.filter((t) => !t.world);
    let by = H * 0.32;
    ctx.textAlign = 'center';
    for (const t of banners.slice(-3)) {
      ctx.globalAlpha = Math.min(1, (t.life - t.t) * 2, t.t * 6);
      ctx.font = `bold ${t.size}px system-ui, sans-serif`;
      const w = Math.min(W - 20, ctx.measureText(t.s).width + 30);
      ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
      ctx.fillRect(W / 2 - w / 2, by - 18, w, 36);
      ctx.fillStyle = t.col;
      ctx.fillText(t.s, W / 2, by);
      by += 42;
    }
    ctx.globalAlpha = 1;
    // 準備中 (パネルを開いている間は出さない)
    if (G.phase === 'prep' && !G.sel) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      const s = T('prepHint');
      const w = Math.min(W - 20, ctx.measureText(s).width + 24);
      ctx.fillStyle = 'rgba(20, 14, 28, 0.85)';
      ctx.fillRect(W / 2 - w / 2, offY + 8, w, 28);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(s, W / 2, offY + 22, W - 30);
      // 縦長の画面では横向きをすすめる
      if (H > W * 0.8) {
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = '#cfc3ff';
        ctx.fillText('📱↻ ' + T('landscape'), W / 2, offY + FH * scale + 24, W - 30);
      }
    }
    ctx.restore();
  }

  // ---------- 自動プレイ (バランスの確認用) ----------
  // 曲の音の高さの分布を見て、音符の多い高さにタワーを建て、強化していく
  function botThink() {
    if (!G.botRows) {
      const rows = new Array(ROWS).fill(0);
      for (const n of G.parsed.notes) rows[clamp(Math.floor((pitchY(n.p) - TOP) / CELL), 0, ROWS - 1)] += 1 + n.w * 0.2;
      G.botRows = rows;
      G.botCol = 0;
    }
    const rows = G.botRows;
    const order = rows.map((w, r) => [w, r]).sort((a, b) => b[0] - a[0]);
    // 強化できるなら、音符の多い高さのタワーから
    const up = G.towers.filter((t) => !t.evo && t.id !== 'baton' && (t.lv < 5 || evoCount() < MAX_EVOS)).sort((a, b) => rows[b.r] / (b.lv + 1) - rows[a.r] / (a.lv + 1))[0];
    const towersInRow = (r) => G.towers.filter((t) => Math.abs(t.r - r) <= 1).length;
    // 建てる高さ: 音符の重さ ÷ (そこにあるタワー + 1)
    let bestR = order[0][1];
    let bestV = -1;
    for (const [w, r] of order) {
      const v = w / (towersInRow(r) + 1);
      if (v > bestV) {
        bestV = v;
        bestR = r;
      }
    }
    const reg = regOf(Math.round(yPitch(TOP + bestR * CELL + CELL / 2)));
    const picks = { lo: ['cello', 'timpani', 'piano', 'organ'], hi: ['flute', 'violin', 'piano', 'harp'], mid: ['piano', 'harp', 'violin', 'cymbal', 'trumpet'] }[reg].filter(towerUnlocked);
    const id = G.towers.length >= 6 && !G.towers.some((t) => t.id === 'baton') ? 'baton' : picks[G.towers.length % picks.length];
    const upCost = up ? (up.lv >= 5 ? evolveCost(up) : upgradeCost(up)) : Infinity;
    const wantUp = up && ((G.towers.length >= 12 && G.towers.length % 3 !== 0) || G.towers.length >= MAX_TOWERS);
    if (!wantUp && (G.towers.length < 4 || (G.ink >= buildCost(id) && (G.towers.length < 14 || upCost > G.ink)))) {
      if (G.ink < buildCost(id)) return;
      const cols = [8, 10, 6, 12, 4, 14, 9, 11, 7, 13, 5, 15, 3, 16, 17, 2];
      for (const c of cols) {
        for (const dr of [0, 1, -1]) {
          const r = bestR + dr;
          if (canBuildAt(c, r)) {
            build(id, c, r);
            return;
          }
        }
      }
    } else if (up && G.ink >= upCost) upgrade(up);
  }

  function simulate(opt, maxSec = 1500) {
    Synth.fake = true;
    Synth.fakeTime = 0;
    const g = start({ ...opt, sim: true });
    const dt = 1 / 30;
    let think = 0;
    for (let i = 0; i < 6; i++) botThink();
    begin();
    while (!g.result && g.t < maxSec) {
      Synth.fakeTime += dt;
      update(dt);
      think -= dt;
      if (think <= 0) {
        think = 0.5;
        botThink();
      }
    }
    const r = g.result || { timeout: true, phase: g.phase };
    r.towersList = g.towers.map((t) => t.id + t.lv + (t.evo ? '*' : '')).join(',');
    r.bossHp = Math.round(g.boss.hp);
    r.inkLeft = Math.round(g.ink);
    r.inkEarned = Math.round(g.inkEarned);
    r.maxNoteHp = Math.round(g.dbgHp || 0);
    r.leakTimes = (g.dbgLeak || []).join(',');
    r.alivePeak = g.dbgAlive || 0;
    r.towerDps = g.towers.map((t) => (t.P && t.P.dmg ? Math.round(t.P.dmg / (t.P.cd || 1)) : 0)).join(',');
    Synth.fake = false;
    G = null;
    return r;
  }

  function T(k) {
    return window.CSUI.T(k);
  }
  function L(o) {
    return window.CSUI.L(o);
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

  function drawNote(c, n) {
    const r = n.r;
    const p = { x: n.x - 100, y: n.y }; // 目は進む方向 (左) を見る
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
    if (G.phase === 'boss' || G.phase === 'win') {
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
    begin,
    update,
    render,
    resize,
    pause,
    resume,
    quit,
    tapAt,
    hoverAt,
    build,
    upgrade,
    sell,
    buildCost,
    upgradeCost,
    evolveCost,
    towerUnlocked,
    MAX_TOWERS,
    MAX_EVOS,
    evoCount,
    simulate,
    drawComposer,
    drawIcon,
    drawNote,
    input,
  };
})();
