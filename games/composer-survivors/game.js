/*
 * 作曲家サバイバー: ゲームの本体 (縦のシューティング)
 *   曲の音符は鳴った瞬間に画面の上から降ってくる (左ほど低い音、右ほど高い音)。
 *   作曲家 (自機) を動かし、自動で撃つ弾で落とす。装備した楽器 2 つが左右について撃ち、
 *   配置できる楽器 3 つを曲の中で好きな場所に置ける。下の鍵盤を越えた音符とぶつかった音符で体力が減る。
 *   倒した音符は金貨を落とし、楽器に経験値が入る。通しで曲を終えるとボスが出る。
 *   メニューの画面と保存は ui.js
 */
(() => {
  'use strict';

  const { Synth, Track, parseScore, partNotes, VEL } = window.CSAudio;
  const D = window.CSData;
  const ART = window.CSArt;

  // ---------- 定数 ----------
  const FW = 720; // 画面 (フィールド) の広さ
  const FH = 1280;
  const LINE_Y = 1200; // ここを越えた音符で体力が減る
  const PLAYER_Y0 = 420; // 自機が動ける範囲 (上の端)
  const TOWER_Y1 = LINE_Y - 80; // 楽器が動ける下の端 (鍵盤や体力のバーにかからない)
  const STAR_STEP = 1.7; // 曲集の中で 1 曲進むごとの強さ
  const HP_TABLE = [[0.125, 3], [0.25, 6], [0.5, 10], [1, 18], [2, 32], [4, 55], [8, 80]];
  const R_TABLE = [[0.125, 7], [0.25, 8], [0.5, 9.5], [1, 11], [2, 13], [4, 16], [8, 18]];
  const DYN_LEAK = [3, 3, 4, 5, 6, 8];
  const BLACK_KEYS = [1, 3, 6, 8, 10];
  const COIN_K = 0.12; // 音符の硬さ → 金貨
  const NOTE_SPEED = 105; // 音符の落ちる速さ (px/秒)。難しさの倍率をかける
  const EXP_K = 0.12; // 音符の硬さ → 楽器の経験値 (倒した楽器)
  const EXP_SHARE = 0.03; // ほかが倒したときに、呼び出した楽器みんなに入る分
  const REDEPLOY = 15; // 壊れた楽器を置き直せるまでの秒
  const BOSS_HP = 2600;

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
  // 音符の色は強さ (曲の強さをかける前の硬さ) で: 白 → 青 → 緑 → 赤 → 紫 → 黒 の順に強い
  const RANK_COLORS = ['#f4f1ea', '#4a90e2', '#3cc46a', '#e5484d', '#a15be6', '#141414'];
  const RANK_EDGES = [5, 8, 14, 25, 50];
  const rankOf = (base) => {
    let i = 0;
    while (i < RANK_EDGES.length && base >= RANK_EDGES[i]) i++;
    return i;
  };

  // ---------- 画面 ----------
  const canvas = document.getElementById('board');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const view = { scale: 1, offX: 0, offY: 0, w: 0, h: 0, dpr: 1 };
  function resize() {
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = Math.max(200, rect.width);
    view.h = Math.max(200, rect.height);
    view.dpr = dpr;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    view.scale = Math.min(view.w / FW, view.h / FH);
    view.offX = (view.w - FW * view.scale) / 2;
    view.offY = (view.h - FH * view.scale) / 2;
  }
  if (canvas) {
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(canvas.parentElement);
  }
  function toField(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return [(clientX - r.left - view.offX) / view.scale, (clientY - r.top - view.offY) / view.scale];
  }

  // ---------- 曲とパート ----------
  const parsedCache = new Map();
  function parsedOf(song) {
    if (!parsedCache.has(song.score)) {
      const score = window.CS_SCORES[song.score];
      const parsed = parseScore(score);
      parsed.score = score;
      markElites(parsed);
      parsed.sections = buildSections(parsed);
      parsed.hpRate = hpRate(parsed);
      parsedCache.set(song.score, parsed);
    }
    return parsedCache.get(song.score);
  }
  // 強い音符 (アクセント) が少ない曲は、旋律の長い音を何個かエリートにする
  function markElites(parsed) {
    const notes = parsed.notes;
    const elites = notes.filter((n) => n.mk.includes('>')).length;
    const want = Math.max(4, Math.round(parsed.lengthSec / 25));
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
  // 曲の「1 秒あたりの硬さ」(強さの倍率をかける前)。曲ごとの難しさをそろえるのに使う
  function hpRate(parsed) {
    const dens = parsed.notes.length / Math.max(30, parsed.lengthSec);
    const dh = clamp(Math.pow(6.7 / dens, 0.9), 0.3, 1.2);
    let sum = 0;
    for (const n of parsed.notes) sum += logInterp(HP_TABLE, n.d) * clamp(Math.pow(1.35, -(n.p - 60) / 12), 0.4, 2.5) * dh * (n.melody ? 1 : 0.8) * (n.mk.includes('>') ? 3 : 1);
    return sum / Math.max(1, parsed.lengthSec);
  }
  // 曲をパートに分ける: だいたい 40 秒ごと、4 小節の切れ目で (2〜6 パート)
  function buildSections(parsed) {
    const barLen = parsed.barLen;
    const bars = Math.max(1, Math.round(parsed.lengthBeats / barLen));
    const n = clamp(Math.round(parsed.lengthSec / 40), 2, 6);
    const out = [];
    let a = 0;
    for (let i = 0; i < n; i++) {
      let b = i === n - 1 ? bars : Math.round(((i + 1) * bars) / n / 4) * 4;
      b = clamp(b, a + 1, bars);
      if (i < n - 1 && b >= bars) b = bars - 1;
      if (b <= a) continue;
      out.push({ barA: a + 1, barB: b, beatA: a * barLen, beatB: i === n - 1 ? parsed.lengthBeats : b * barLen });
      a = b;
      if (a >= bars) break;
    }
    return out;
  }
  // part: 0 = 通し、1〜 = パート
  function stageInfo(song, part) {
    const parsed = parsedOf(song);
    if (!part) return { parsed, notes: parsed.notes, lengthSec: parsed.lengthSec, offsetSec: 0, full: true };
    const sec = parsed.sections[part - 1];
    const s0 = parsed.beatToSec(sec.beatA);
    const s1 = parsed.beatToSec(sec.beatB);
    const notes = [];
    for (const n of parsed.notes) if (n.t >= sec.beatA - 1e-6 && n.t < sec.beatB - 1e-6) notes.push({ ...n, sec: n.sec - s0 });
    return { parsed, notes, lengthSec: s1 - s0, offsetSec: s0, full: false, section: sec };
  }
  // ステージの強さ = 曲集の強さ × 曲の順番 × 難しさ × (1 秒あたりの硬さを 70 にそろえる倍率)
  const HP_RATE_REF = 70;
  function songPower(song, tier) {
    const book = D.BOOKS.find((b) => b.id === song.book);
    const P = parsedOf(song);
    // 長い曲 (3 分より長い) は少しやさしく
    const norm = clamp(HP_RATE_REF / P.hpRate, 0.5, 2) * clamp(Math.pow(180 / P.lengthSec, 0.3), 0.75, 1);
    return book.power * Math.pow(book.step || STAR_STEP, song.no - 1) * D.TIERS[tier].hp * norm;
  }

  // ---------- 能力 ----------
  function playerStats(save, compId) {
    const lv = (save.stats[compId] || {});
    const L = (id) => lv[id] || 0;
    const ps = {
      dmg: 4 * Math.pow(1.04, L('atk')),
      interval: 0.16 * Math.pow(0.99, L('rate')),
      ways: 1 + Math.floor(L('ways') / 12),
      maxHp: 100 + 5 * L('hp'),
      def: Math.pow(0.993, L('def')),
      speed: 380 * (1 + 0.01 * L('speed')),
      crit: 0.005 * L('crit'),
      magnet: 140 * (1 + 0.03 * L('magnet')),
      greed: 1 + 0.03 * L('greed'),
      bombTime: 40 / (1 + 0.01 * L('bomb')),
      bombPow: 1 + 0.05 * L('bomb'),
      pierce: 0,
    };
    if (compId === 'chopin') ps.interval *= 0.9;
    if (compId === 'mozart') ps.greed *= 1.2;
    if (compId === 'tchaikovsky') {
      ps.bombTime /= 1.3;
      ps.bombPow *= 1.5;
    }
    if (compId === 'debussy') {
      ps.pierce = 1;
      ps.dmg *= 0.9;
    }
    return ps;
  }
  // 楽器 1 体の能力 (種類・格・レベルから)。star: 攻撃の強化の段階 (格 3 で 2、格 5 で 3)
  function towerStats(unit) {
    const T = D.TOWERS[unit.id];
    const g = clamp(unit.grade || 1, 1, 5);
    const lv = unit.lv || 0;
    const star = g >= 5 ? 3 : g >= 3 ? 2 : 1;
    const gm = D.GRADES[g - 1].mul;
    return {
      id: unit.id,
      kind: T.kind,
      star,
      grade: g,
      dmg: T.dmg * 0.55 * gm * Math.pow(1.05, lv), // 10 体呼べるので 1 体ずつは控えめ
      cd: T.cd * Math.pow(0.99, lv),
      range: T.range * (1 + 0.006 * lv) * (star >= 3 && (T.kind === 'aura' || T.kind === 'cone' || T.kind === 'string') ? 1.35 : 1),
      hp: T.hp * Math.sqrt(gm) * 1.5 * Math.pow(1.05, lv),
      move: 150 * (1 + 0.01 * lv),
    };
  }

  // ---------- 状態 ----------
  let G = null;
  const keys = {};

  function start(opt) {
    const { song, part, tier, comp, save } = opt;
    const info = stageInfo(song, part);
    const parsed = info.parsed;
    const ps = playerStats(save, comp.id);
    const power = songPower(song, tier);
    const T = D.TIERS[tier];
    // 曲の音域を横いっぱいに広げる
    const sorted = parsed.notes.map((n) => n.p).sort((a, b) => a - b);
    let lo = sorted[Math.floor(sorted.length * 0.01)] - 2;
    let hi = sorted[Math.floor(sorted.length * 0.99)] + 2;
    if (hi - lo < 24) {
      const m = (hi + lo) / 2;
      lo = m - 12;
      hi = m + 12;
    }
    const dens = parsed.notes.length / Math.max(30, parsed.lengthSec);
    G = {
      opt,
      song,
      part,
      tier,
      T,
      comp,
      save,
      ps,
      info,
      parsed,
      power,
      sim: !!opt.sim,
      lo,
      hi,
      densHp: clamp(Math.pow(6.7 / dens, 0.9), 0.3, 1.2),
      densLeak: clamp(Math.pow(6.7 / dens, 0.6), 0.4, 1),
      // 短い曲ほど 1 つの音符の金貨を多く (曲の長さで金貨がかたよりすぎないように)
      income: D.BOOKS.find((b) => b.id === song.book).income || 1, // 曲集ごとの金貨・経験値・素材の倍率
      coinLen: clamp(Math.pow(120 / Math.max(20, parsed.lengthSec), 0.6), 0.5, 2.5),
      phase: 'intro',
      t: 0,
      phaseT: 0,
      hp: ps.maxHp,
      maxHp: ps.maxHp,
      notes: [],
      bullets: [],
      ebul: [],
      drops: [],
      shots: [],
      fx: { parts: [], texts: [], rings: [], shake: 0 },
      towers: [], // 場にいる楽器 (自分で動いて攻撃する)
      party: [], // 呼び出す楽器 { unit, st, state: wait / out / cool, cool }
      coins: 0,
      coinsLost: 0,
      exp: {}, // 楽器 (uid) ごとの経験値
      mats: {}, // 拾った素材
      popT: 0, // プチプチ音の間引き
      killed: 0,
      leaked: 0,
      total: info.notes.length,
      dmgTaken: 0,
      bomb: 0.35,
      volley: 0,
      echo: [],
      me: { x: FW / 2, y: 1080, tx: FW / 2, ty: 1080, inv: 0, fire: 0, t: 0, drag: null },
      boss: { def: song.boss, x: FW / 2, y: 120, r: 56, hp: 1, maxHp: 1, shield: true, pulse: 0, hurtT: 0, fire: 1, t: 0, active: false },
      track: null,
      btrack: null,
      result: null,
      season: 0,
      hpSum: 0,
    };
    // 呼び出す楽器 (最大 10 体)。曲が始まると自機のところから順に現れる
    const party = (save.party || []).map((uid) => (save.units || []).find((u) => u.uid === uid)).filter(Boolean).slice(0, D.MAX_PARTY);
    party.forEach((u, i) => G.party.push({ unit: u, st: towerStats(u), state: 'wait', cool: 0.4 + i * 0.25 }));
    // 曲
    G.track = new Track(info.notes);
    const bpm = parsed.bpmAt(info.full ? 0 : info.section.beatA);
    const beat = 60 / bpm;
    const count = 2;
    const clicks = [];
    for (let i = 0; i < count; i++) clicks.push([0.3 + i * beat, i === 0]);
    G.introLen = count * beat + 0.3;
    G.track.start(0, G.introLen, clicks);
    G.phase = 'song';
    resize();
    return G;
  }

  // ---------- 音符 ----------
  function pitchX(p) {
    return 30 + ((clamp(p, G.lo, G.hi) - G.lo) / (G.hi - G.lo)) * (FW - 60);
  }
  function spawnNote(src, minion) {
    const o = (src.p - 60) / 12;
    const absSec = (src.sec || 0) + G.info.offsetSec;
    const prog = minion ? 1 : clamp(absSec / G.parsed.lengthSec, 0, 1);
    const mk = src.mk || '';
    let hp = logInterp(HP_TABLE, src.d) * clamp(Math.pow(1.35, -o), 0.4, 2.5) * G.densHp * G.power * (0.8 + 0.6 * prog) * (src.melody ? 1 : 0.8) * (minion ? 0.6 : 1);
    let r = logInterp(R_TABLE, src.d);
    const n = {
      p: src.p,
      d: src.d,
      v: src.v,
      reg: regOf(src.p),
      col: '#fff',
      x: minion ? clamp(G.boss.x + (pitchX(src.p) - FW / 2) * 0.5, 30, FW - 30) : pitchX(src.p) + rand(-4, 4),
      y: minion ? G.boss.y + 50 : -24,
      vy: NOTE_SPEED * G.T.spd, // 音符はみんな同じ速さ (難しさでだけ変わる)
      slow: 1,
      push: 0,
      stun: 0,
      flash: 0,
      t: 0,
      phase: Math.random() * 6.28,
      elite: mk.includes('>'),
      fermata: mk.includes('^'),
      stacc: mk.includes("'"),
      trill: mk.includes('~'),
      grace: mk.includes('g'),
      sharp: BLACK_KEYS.includes(src.p % 12),
      dead: false,
      minion,
      strings: null,
    };
    if (n.v >= 4) r *= n.v === 5 ? 1.15 : 1.08;
    if (n.elite) {
      hp *= 3;
      r *= 1.25;
    }
    if (n.fermata) {
      hp *= 6;
      r *= 1.5;
    }
    if (n.grace) {
      hp = Math.min(hp, 1 * G.power);
      r = 5;
    }
    n.hp = n.maxHp = hp;
    n.rank = rankOf(hp / (G.power * G.densHp * (minion ? 0.6 : 1)));
    n.col = RANK_COLORS[n.rank];
    if (!minion) G.hpSum += hp;
    n.r = r;
    n.shoot = n.elite || n.fermata ? rand(0.8, 1.6) : 0;
    G.notes.push(n);
    G.boss.pulse = 1;
  }

  // dmg を音符に。src: 倒したときの経験値の行き先 (楽器の id。自機なら null)
  function hitNote(n, dmg, src, crit) {
    if (n.dead) return;
    n.hp -= dmg;
    n.flash = 0.06;
    if (crit && !G.sim) text(n.x, n.y - n.r - 6, Math.round(dmg).toString(), '#ffd84a', 15);
    if (n.hp <= 0) killNote(n, src);
  }
  function killNote(n, src) {
    n.dead = true;
    G.killed += n.minion ? 0 : 1;
    // 金貨を落とす
    const coin = n.maxHp * COIN_K * G.income * G.coinLen * G.ps.greed * (G.comp.id === 'vivaldi' && G.season === 2 ? 1.4 : 1) * (G.T.reward / G.T.hp);
    G.drops.push({ x: n.x, y: n.y, v: coin, t: 0, vy: -70 });
    // 経験値 (倒した楽器に。呼び出した楽器みんなにも少し)
    const e = n.maxHp * EXP_K * G.income * (G.T.reward / G.T.hp);
    if (src) G.exp[src] = (G.exp[src] || 0) + e;
    for (const pm of G.party) G.exp[pm.unit.uid] = (G.exp[pm.unit.uid] || 0) + e * EXP_SHARE;
    // 素材: 音符の色のかけら (強い音符ほどよく落とす)
    if (!n.minion && Math.random() < [0.05, 0.05, 0.05, 0.06, 0.08, 0.2][n.rank] * Math.sqrt(G.income)) {
      const k = D.MATS[n.rank].id;
      const cnt = Math.max(1, Math.round(G.T.reward * (0.6 + Math.random() * 0.8)));
      G.drops.push({ x: n.x, y: n.y, mat: k, v: cnt, t: 0, vy: -90 });
    }
    if (!G.sim) {
      burst(n.x, n.y, n.rank >= 5 ? '#9a9a9a' : n.col, n.elite ? 16 : 6, n.elite ? 240 : 140, 0.4, n.elite ? 5 : 3);
      // プチッ (多すぎるときは間引く)
      if (G.popT <= 0) {
        Synth.sfx('petit', { vol: n.elite ? 1.4 : 1 });
        G.popT = 0.035;
      }
    }
  }
  function hitBoss(dmg) {
    const B = G.boss;
    if (B.shield || !B.active || G.phase !== 'boss') return;
    B.hp -= dmg;
    B.hurtT = 0.06;
    if (B.hp <= 0) {
      B.active = false;
      // ボスの素材: 結晶と、強い色のかけら
      const rw = G.T.reward;
      G.mats.boss = (G.mats.boss || 0) + Math.max(1, Math.round(rw));
      const best = D.MATS[clamp(Math.floor(Math.log2(G.power + 1) / 2), 1, 5)].id;
      G.mats[best] = (G.mats[best] || 0) + Math.round(4 * rw);
      if (!G.sim) {
        burst(B.x, B.y, '#ffd84a', 80, 460, 1.3, 7);
        Synth.sfx('cymbal');
      }
      finish(true);
    }
  }
  function playerDmg() {
    let m = 1;
    if (G.comp.id === 'beethoven' && G.hp < G.maxHp * 0.5) m *= 1.3;
    if (G.comp.id === 'vivaldi' && G.season === 0) m *= 1.25;
    m *= buffAt(G.me.x, G.me.y).might;
    return G.ps.dmg * m;
  }
  // 指揮棒の強化 (近くにあれば)
  function buffAt(x, y) {
    let might = 1;
    let haste = 1;
    const apply = (st, bx, by) => {
      if (st.kind !== 'buff') return;
      if (dist2(bx, by, x, y) > st.range * st.range) return;
      const k = st.star >= 3 ? 1.6 : st.star >= 2 ? 1.3 : 1;
      might = Math.max(might, 1 + 0.25 * k * (1 + st.dmg));
      haste = Math.max(haste, 1 + 0.15 * k);
    };
    for (const t of G.towers) apply(t.st, t.x, t.y);
    return { might, haste };
  }

  // ---------- 1 フレーム ----------
  function update(dt) {
    if (!G || G.phase === 'end') return;
    G.t += dt;
    G.phaseT += dt;
    const me = G.me;
    const B = G.boss;
    me.t += dt;
    me.inv = Math.max(0, me.inv - dt);
    B.pulse = Math.max(0, B.pulse - dt * 4);
    B.hurtT = Math.max(0, B.hurtT - dt);
    G.bomb = Math.min(1, G.bomb + dt / G.ps.bombTime);
    G.popT -= dt;
    if (G.comp.id === 'vivaldi') G.season = Math.floor(G.t / 20) % 4;

    // 音符を出す
    if (G.phase === 'song') {
      const pos = G.track.pos();
      for (const n of G.track.due(pos)) spawnNote(n, false);
      if (pos > G.info.lengthSec + 0.3 && G.track.remaining() === 0) G.phase = 'clear';
    } else if (G.phase === 'clear') {
      if (G.notes.length === 0) {
        if (G.info.full) startBoss();
        else finish(true);
      }
    } else if (G.phase === 'boss' && G.btrack) {
      for (const n of G.btrack.due(G.btrack.pos())) if (G.notes.length < 160) spawnNote(n, true);
    }

    // 自機
    const kx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    const ky = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    if (kx || ky) {
      const k = (kx && ky ? 0.707 : 1) * G.ps.speed * dt;
      me.tx = clamp(me.x + kx * k * 3, 24, FW - 24);
      me.ty = clamp(me.y + ky * k * 3, PLAYER_Y0, LINE_Y - 20);
    }
    const mv = G.ps.speed * dt * (me.drag ? 3 : 1);
    me.x += clamp(me.tx - me.x, -mv, mv);
    me.y += clamp(me.ty - me.y, -mv, mv);

    // 自機の弾
    const haste = buffAt(me.x, me.y).haste * (G.comp.id === 'vivaldi' && G.season === 1 ? 1.25 : 1);
    me.fire -= dt * haste;
    if (me.fire <= 0) {
      me.fire += G.ps.interval;
      if (me.fire < 0) me.fire = 0;
      volley(1);
      G.volley++;
      if (G.comp.id === 'bach' && G.volley % 4 === 0) G.echo.push(0.12);
      if (!G.sim && Math.random() < 0.25) Synth.sfx('shot', { p: 88 });
    }
    for (let i = G.echo.length - 1; i >= 0; i--) {
      G.echo[i] -= dt;
      if (G.echo[i] <= 0) {
        volley(0.8);
        G.echo.splice(i, 1);
      }
    }

    updateNotes(dt);
    updateBullets(dt);
    updateSummons(dt);
    updateTowers(dt);
    updateDrops(dt);
    if (G.phase === 'boss') updateBoss(dt);
    for (const s of G.shots) s.life -= dt;
    G.shots = G.shots.filter((s) => s.life > 0);
    updateFx(dt);
  }

  function volley(mul) {
    const me = G.me;
    const w = G.ps.ways;
    const dmg = playerDmg() * mul;
    for (let i = 0; i < w; i++) {
      const off = i - (w - 1) / 2;
      const a = -Math.PI / 2 + off * 0.07;
      G.bullets.push({ x: me.x + off * 9, y: me.y - 24, vx: Math.cos(a) * 980, vy: Math.sin(a) * 980, dmg, pierce: G.ps.pierce, hit: null, src: null });
    }
  }

  // 音符を x で桶に分ける (当たり判定を速くする)
  const BUCKET = 48;
  let buckets = [];
  function bucketNotes() {
    const nb = Math.ceil(FW / BUCKET) + 1;
    buckets = Array.from({ length: nb }, () => []);
    for (const n of G.notes) {
      if (n.dead) continue;
      const i0 = clamp(Math.floor((n.x - n.r) / BUCKET), 0, nb - 1);
      const i1 = clamp(Math.floor((n.x + n.r) / BUCKET), 0, nb - 1);
      for (let i = i0; i <= i1; i++) buckets[i].push(n);
    }
  }
  function notesNear(x) {
    return buckets[clamp(Math.floor(x / BUCKET), 0, buckets.length - 1)] || [];
  }

  function updateNotes(dt) {
    const me = G.me;
    const winter = G.comp.id === 'vivaldi' && G.season === 3 ? 0.8 : 1;
    for (const n of G.notes) {
      if (n.dead) continue;
      n.t += dt;
      n.flash = Math.max(0, n.flash - dt);
      if (n.stun > 0) {
        n.stun -= dt;
        n.slow = 1;
        continue;
      }
      if (n.push > 0) {
        const k = Math.min(n.push, 320 * dt);
        n.y -= k;
        n.push -= k;
      }
      let vy = n.vy * n.slow * winter;
      n.y += vy * dt;
      if (n.trill) n.x += Math.sin(n.t * 18) * 30 * dt;
      n.slow = 1;
      // 強い音符は弾を撃つ
      if (n.shoot) {
        n.shoot -= dt;
        if (n.shoot <= 0 && n.y > 0 && n.y < me.y - 140) {
          n.shoot = n.fermata ? 1.3 : 2.2;
          const a = Math.atan2(me.y - n.y, me.x - n.x);
          const cnt = n.fermata ? 5 : 1;
          for (let k = 0; k < cnt; k++) {
            const aa = a + (k - (cnt - 1) / 2) * 0.22;
            const bs = 200 * Math.sqrt(G.T.spd);
            G.ebul.push({ x: n.x, y: n.y, vx: Math.cos(aa) * bs, vy: Math.sin(aa) * bs, r: 6, col: n.rank >= 5 ? '#888' : n.col, dmg: 6 });
          }
        }
      }
      // ぶつかる
      if (me.inv <= 0 && dist2(n.x, n.y, me.x, me.y) < (n.r + 13) ** 2) {
        me.inv = 1.0;
        hurt((3 + n.v) * G.T.dmg);
        hitNote(n, n.maxHp * 0.5 + playerDmg() * 5, null);
      }
      // 置いた楽器に当たる (楽器は削られ、音符は遅くなる)
      for (const t of G.towers) {
        if (t.dead) continue;
        if (dist2(n.x, n.y, t.x, t.y) < (n.r + 20) ** 2) {
          t.hp -= (3 + 2.2 * n.v) * G.T.dmg * (n.elite ? 1.6 : 1) * dt * 2.2;
          t.hurtT = 0.06;
          n.slow = Math.min(n.slow, 0.3);
        }
      }
      if (n.y > LINE_Y) {
        n.dead = true;
        if (!n.minion) G.leaked++;
        hurt(DYN_LEAK[n.v] * G.densLeak * G.T.dmg * (n.fermata ? 2 : 1) * (n.grace ? 0.2 : 1) * 0.9);
        if (!G.sim) burst(n.x, LINE_Y, '#ff6b6b', 6, 120, 0.4, 3);
      }
      if (n.x < -40 || n.x > FW + 40) n.dead = true;
    }
    G.notes = G.notes.filter((n) => !n.dead);
  }

  function updateBullets(dt) {
    bucketNotes();
    const B = G.boss;
    for (const b of G.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      for (const n of notesNear(b.x)) {
        if (n.dead || (b.hit && b.hit.has(n))) continue;
        if (dist2(b.x, b.y, n.x, n.y) < (n.r + 5) ** 2) {
          const crit = Math.random() < G.ps.crit;
          hitNote(n, b.dmg * (crit ? 2.5 : 1), b.src, crit);
          if (b.pierce > 0) {
            b.pierce--;
            (b.hit = b.hit || new Set()).add(n);
          } else {
            b.dead = true;
            break;
          }
        }
      }
      if (!b.dead && B.active && dist2(b.x, b.y, B.x, B.y) < (B.r + 6) ** 2) {
        const crit = Math.random() < G.ps.crit;
        hitBoss(b.dmg * (crit ? 2.5 : 1));
        b.dead = true;
      }
      if (b.y < -30 || b.x < -30 || b.x > FW + 30 || b.y > FH + 30) b.dead = true;
    }
    G.bullets = G.bullets.filter((b) => !b.dead);
    const me = G.me;
    for (const b of G.ebul) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (me.inv <= 0 && dist2(b.x, b.y, me.x, me.y) < (b.r + 7) ** 2) {
        me.inv = 1.0;
        b.dead = true;
        hurt(b.dmg * G.T.dmg);
      }
      if (b.y > FH + 20 || b.y < -40 || b.x < -20 || b.x > FW + 20) b.dead = true;
    }
    G.ebul = G.ebul.filter((b) => !b.dead);
  }

  // 楽器の攻撃 (装備と配置で共通)。holder: { x, y, st, cd, act, id, ... }。fixed: 置いた楽器か
  function fireTower(h, dt, fixed) {
    const st = h.st;
    const B = G.boss;
    const haste = buffAt(h.x, h.y).haste;
    const might = buffAt(h.x, h.y).might * (G.comp.id === 'beethoven' && G.hp < G.maxHp * 0.5 ? 1.3 : 1);
    const dmg = st.dmg * might;
    const src = h.uid;
    if (st.kind === 'aura') {
      for (const n of G.notes) if (dist2(n.x, n.y, h.x, h.y) < (st.range + n.r) ** 2) n.slow = Math.min(n.slow, 0.55 - (st.star >= 2 ? 0.1 : 0));
    }
    if (st.kind === 'string') {
      // 横の弦: 通りぬける音符を削る (1 つの音符に 1 回)
      const lines = st.star >= 2 ? [h.y - 50, h.y - 110] : [h.y - 60];
      h.lines = lines;
      for (const ly of lines) {
        for (const n of G.notes) {
          if (n.dead || Math.abs(n.x - h.x) > st.range * 1.6 || Math.abs(n.y - ly) > n.r + 4) continue;
          n.strings = n.strings || new Set();
          const key = h.uid + ':' + ly;
          if (n.strings.has(key)) continue;
          n.strings.add(key);
          hitNote(n, dmg, src);
          h.act = 0.2;
          if (!G.sim) G.shots.push({ kind: 'pluck', x: n.x, y: ly, life: 0.2, max: 0.2, col: '#fff2a8' });
        }
      }
      return;
    }
    if (st.kind === 'buff') return;
    h.cd -= dt * haste;
    if (h.cd > 0) return;
    const near = (R) => {
      const out = [];
      for (const n of G.notes) if (!n.dead && n.y > -10 && dist2(n.x, n.y, h.x, h.y) < (R + n.r) ** 2) out.push(n);
      return out;
    };
    const bossIn = (R) => B.active && dist2(B.x, B.y, h.x, h.y) < (R + B.r) ** 2;
    switch (st.kind) {
      case 'shot': {
        const list = near(st.range).filter((n) => n.y < h.y + 40);
        list.sort((a, b) => b.y - a.y);
        if (!list.length && !bossIn(st.range)) return;
        h.cd = st.cd;
        h.act = 0.2;
        const k = st.star >= 3 ? 3 : st.star >= 2 ? 2 : 1;
        for (let i = 0; i < k; i++) {
          const tg = list[i % Math.max(1, list.length)];
          const tx = tg ? tg.x : B.x;
          const ty = tg ? tg.y : B.y;
          const a = Math.atan2(ty - h.y, tx - h.x) + (i - (k - 1) / 2) * 0.08;
          G.bullets.push({ x: h.x, y: h.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, dmg, pierce: st.star >= 3 ? 2 : 0, hit: null, src, big: true });
        }
        if (!G.sim) Synth.sfx('shot', { p: 76 });
        break;
      }
      case 'homing': {
        const list = near(st.range).sort((a, b) => b.y - a.y);
        if (!list.length && !bossIn(st.range)) return;
        h.cd = st.cd;
        h.act = 0.2;
        const k = st.star >= 3 ? 5 : st.star >= 2 ? 3 : 2;
        for (let i = 0; i < k; i++) {
          const n = list[i % Math.max(1, list.length)];
          if (n) hitNote(n, dmg, src);
          else hitBoss(dmg);
          if (!G.sim) G.shots.push({ kind: 'spark', x: h.x, y: h.y, tx: n ? n.x : B.x, ty: n ? n.y : B.y, life: 0.3, max: 0.3, arc: i % 2 ? 40 : -40, col: '#bfe8ff' });
        }
        break;
      }
      case 'beam': {
        const w = st.star >= 2 ? 26 : 16;
        const list = G.notes.filter((n) => !n.dead && n.y < h.y && n.y > -10 && Math.abs(n.x - h.x) < w + n.r);
        const bossHit = B.active && Math.abs(B.x - h.x) < w + B.r && B.y < h.y;
        if (!list.length && !bossHit) return;
        h.cd = st.cd;
        h.act = 0.3;
        for (const n of list) hitNote(n, dmg, src);
        if (bossHit) hitBoss(dmg);
        if (!G.sim) {
          G.shots.push({ kind: 'beam', x: h.x, y: h.y, w, life: st.star >= 3 ? 0.6 : 0.25, max: st.star >= 3 ? 0.6 : 0.25, col: '#ffe9a8' });
          Synth.sfx('shot', { p: 84 });
        }
        if (st.star >= 3) h.linger = { t: 0.6, w, dmg: dmg * 0.25 };
        break;
      }
      case 'aura': {
        h.cd = st.cd;
        for (const n of near(st.range)) {
          hitNote(n, dmg, src);
          if (st.star >= 3 && Math.random() < 0.05) n.stun = 1.2;
        }
        if (bossIn(st.range)) hitBoss(dmg);
        break;
      }
      case 'pulse': {
        const list = near(st.range);
        if (!list.length && !bossIn(st.range)) return;
        h.cd = st.cd;
        h.act = 0.3;
        const rings = st.star >= 2 ? 2 : 1;
        for (const n of list) {
          hitNote(n, dmg * rings, src);
          n.push += 70 * rings;
          if (st.star >= 3) n.stun = Math.max(n.stun, 0.6);
        }
        if (bossIn(st.range)) hitBoss(dmg * rings);
        if (!G.sim) {
          for (let i = 0; i < rings; i++) ring(h.x, h.y, st.range * (1.1 + i * 0.25), '#ffd84a', 0.4 + i * 0.1, 6);
          Synth.sfx('boom');
          shake(3);
        }
        break;
      }
      case 'cone': {
        const R = st.range;
        const half = st.star >= 3 ? 0.75 : 0.5;
        const hitCone = () => {
          let any = false;
          for (const n of G.notes) {
            if (n.dead) continue;
            const dx = n.x - h.x;
            const dy = n.y - h.y;
            if (dy > 0 || dx * dx + dy * dy > (R + n.r) ** 2) continue;
            const a = Math.atan2(dx, -dy);
            if (Math.abs(a) > half) continue;
            hitNote(n, dmg, src);
            n.push += 90;
            any = true;
          }
          if (bossIn(R)) hitBoss(dmg);
          return any;
        };
        const list = near(R).filter((n) => n.y < h.y);
        if (!list.length && !bossIn(R)) return;
        h.cd = st.cd;
        h.act = 0.3;
        hitCone();
        if (st.star >= 2) h.echoCone = 0.25;
        h.coneFn = hitCone;
        if (!G.sim) {
          G.shots.push({ kind: 'cone', x: h.x, y: h.y, r: R, half, life: 0.3, max: 0.3, col: '#ffd166' });
          Synth.sfx('shot', { p: 67 });
        }
        break;
      }
      case 'boomerang': {
        const list = near(st.range).filter((n) => n.y < h.y);
        if (!list.length && !bossIn(st.range)) return;
        h.cd = st.cd;
        h.act = 0.2;
        const k = st.star >= 2 ? 2 : 1;
        for (let i = 0; i < k; i++) {
          const tg = list[i] || list[0];
          const tx = tg ? tg.x : B.x;
          const ty = tg ? tg.y : B.y;
          G.shots.push({ kind: 'boomerang', x: h.x, y: h.y, sx: h.x, sy: h.y, tx, ty, t: 0, life: 1.2, max: 1.2, dmg, src, hit: new Set(), back: false, burst: st.star >= 3, owner: h });
        }
        break;
      }
      case 'pillar': {
        const list = near(st.range);
        if (!list.length && !bossIn(st.range)) return;
        h.cd = st.cd;
        h.act = 0.3;
        const k = st.star >= 3 ? 3 : st.star >= 2 ? 2 : 1;
        const sorted = list.sort((a, b) => b.hp - a.hp);
        for (let i = 0; i < k; i++) {
          const tg = sorted[i];
          const px = tg ? tg.x : B.x;
          const py = tg ? tg.y : B.y;
          for (const n of G.notes) if (dist2(n.x, n.y, px, py) < (40 + n.r) ** 2) hitNote(n, dmg, src);
          if (!tg || dist2(B.x, B.y, px, py) < 90 * 90) hitBoss(dmg);
          if (!G.sim) G.shots.push({ kind: 'pillar', x: px, y: py, life: 0.45, max: 0.45, col: '#c7b8ff' });
        }
        if (!G.sim) {
          Synth.sfx('boom');
          shake(4);
        }
        break;
      }
      default:
        break;
    }
  }
  function towerAfter(h, dt) {
    // 残る光線 (ヴァイオリン ★3)・2 回目の扇 (トランペット ★2)
    if (h.linger) {
      h.linger.t -= dt;
      for (const n of G.notes) if (!n.dead && n.y < h.y && Math.abs(n.x - h.x) < h.linger.w + n.r) hitNote(n, h.linger.dmg * dt * 4, h.uid);
      if (h.linger.t <= 0) h.linger = null;
    }
    if (h.echoCone) {
      h.echoCone -= dt;
      if (h.echoCone <= 0) {
        h.echoCone = 0;
        if (h.coneFn) h.coneFn();
      }
    }
  }

  // 呼び出し: 待っている楽器を自機のところから出す。壊れた楽器は 15 秒で戻る
  function updateSummons(dt) {
    if (G.phase === 'end') return;
    for (const pm of G.party) {
      if (pm.state === 'out') continue;
      pm.cool -= dt;
      if (pm.cool > 0) continue;
      pm.state = 'out';
      const me = G.me;
      const t = { id: pm.unit.id, uid: pm.unit.uid, st: pm.st, pm, x: clamp(me.x + rand(-40, 40), 24, FW - 24), y: me.y - 30, hp: pm.st.hp, maxHp: pm.st.hp, cd: rand(0.2, 0.6), act: 0, hurtT: 0, t: 0, tx: me.x, ty: me.y - 120, think: 0, born: 0.5 };
      G.towers.push(t);
      if (!G.sim) {
        ring(t.x, t.y, 44, '#9ff3d0', 0.4, 4);
        Synth.sfx('pick', { p: 67 + (G.towers.length % 5) * 2 });
      }
    }
  }
  // 楽器の動き: 種類ごとに、ねらう場所へ自分で動く
  function towerThink(t) {
    const st = t.st;
    const me = G.me;
    let tx = t.tx;
    let ty = t.ty;
    // 一番下まで来ている音符と、まわりの音符の重心
    let lead = null;
    for (const n of G.notes) if (n.y > 0 && (!lead || n.y > lead.y)) lead = n;
    const crowd = (x, y, R) => {
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (const n of G.notes) if (n.y > 0 && dist2(n.x, n.y, x, y) < R * R) {
        sx += n.x;
        sy += n.y;
        c++;
      }
      return c ? [sx / c, sy / c, c] : null;
    };
    // 縦の列ごとの音符の数 (光線・弦の置き場所)
    const colBest = () => {
      const cols = new Array(12).fill(0);
      for (const n of G.notes) if (n.y > 0) cols[clamp(Math.floor(n.x / (FW / 12)), 0, 11)] += 1 + n.y / 600;
      for (const o of G.towers) if (o !== t && o.st.kind === st.kind) cols[clamp(Math.floor(o.x / (FW / 12)), 0, 11)] -= 3;
      let bi = 0;
      for (let k = 1; k < 12; k++) if (cols[k] > cols[bi]) bi = k;
      return (bi + 0.5) * (FW / 12);
    };
    const B = G.boss;
    switch (st.kind) {
      case 'aura':
      case 'pulse': {
        // 近づいて戦う: 音符のかたまりの少し下へ
        const c = lead ? crowd(lead.x, lead.y, 260) : null;
        if (c) {
          tx = c[0];
          ty = c[1] + 50;
        } else if (B.active) {
          tx = B.x;
          ty = B.y + 160;
        } else {
          tx = me.x + rand(-80, 80);
          ty = me.y - 160;
        }
        break;
      }
      case 'beam':
      case 'string': {
        tx = colBest();
        ty = st.kind === 'string' ? 700 : 900;
        if (B.active && G.notes.length < 6) tx = B.x;
        break;
      }
      case 'buff': {
        // 仲間のまん中あたり
        let sx = me.x;
        let sy = me.y;
        let c = 1;
        for (const o of G.towers) if (o !== t) {
          sx += o.x;
          sy += o.y;
          c++;
        }
        tx = sx / c;
        ty = sy / c;
        break;
      }
      default: {
        // 遠くから撃つ: 持ち場 (横に散らばる) のまわりで、近くの音符のかたまりへ寄る。高さは画面の中ほど
        const ranged = G.towers.filter((o) => !['aura', 'pulse', 'beam', 'string', 'buff'].includes(o.st.kind));
        const idx = Math.max(0, ranged.indexOf(t));
        const home = ((idx + 0.5) / Math.max(1, ranged.length)) * FW;
        const c = crowd(home, 500, 320);
        if (B.active && G.notes.length < 8) {
          tx = B.x + (idx - ranged.length / 2) * 50;
          ty = 760;
        } else if (c) {
          tx = home * 0.5 + c[0] * 0.5;
          ty = clamp(c[1] + Math.min(st.range * 0.5, 300), 700, 1040);
        } else {
          tx = home;
          ty = 900;
        }
      }
    }
    t.tx = clamp(tx, 24, FW - 24);
    t.ty = clamp(ty, PLAYER_Y0, TOWER_Y1);
  }
  function moveTower(t, dt) {
    t.think -= dt;
    if (t.think <= 0) {
      t.think = 0.25 + Math.random() * 0.15;
      towerThink(t);
    }
    let vx = t.tx - t.x;
    let vy = t.ty - t.y;
    // 仲間・自機と重ならない
    for (const o of G.towers) {
      if (o === t) continue;
      const d2 = dist2(o.x, o.y, t.x, t.y);
      if (d2 < 44 * 44 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        vx += ((t.x - o.x) / d) * 60;
        vy += ((t.y - o.y) / d) * 60;
      }
    }
    // 遠くから撃つ楽器は、近づいた音符から離れる
    if (t.st.kind !== 'aura' && t.st.kind !== 'pulse') {
      for (const n of G.notes) {
        const d2 = dist2(n.x, n.y, t.x, t.y);
        if (d2 < 70 * 70 && n.y < t.y + 20) {
          const d = Math.sqrt(d2) || 1;
          vx += ((t.x - n.x) / d) * 120;
          vy += 80;
        }
      }
    }
    const len = Math.hypot(vx, vy);
    const sp = t.st.move * dt;
    if (len > 1) {
      const k = Math.min(1, sp / len);
      t.x = clamp(t.x + vx * k, 24, FW - 24);
      t.y = clamp(t.y + vy * k, PLAYER_Y0, TOWER_Y1);
    }
  }

  function updateTowers(dt) {
    for (const t of G.towers) {
      if (t.dead) continue;
      t.t += dt;
      t.born = Math.max(0, t.born - dt);
      moveTower(t, dt);
      t.act = Math.max(0, t.act - dt);
      t.hurtT = Math.max(0, t.hurtT - dt);
      fireTower(t, dt, true);
      towerAfter(t, dt);
      if (t.hp <= 0) {
        t.dead = true;
        t.pm.state = 'cool';
        t.pm.cool = REDEPLOY;
        if (!G.sim) {
          burst(t.x, t.y, '#c9b28f', 18, 220, 0.6, 5);
          text(t.x, t.y - 26, D.TEXT.broken[lang()], '#ff8aa8', 18);
          Synth.sfx('clang');
        }
      }
    }
    G.towers = G.towers.filter((t) => !t.dead);
    // ブーメラン
    for (const s of G.shots) {
      if (s.kind !== 'boomerang') continue;
      s.t += dt;
      const k = s.t / (s.max / 2);
      if (k <= 1) {
        s.x = s.sx + (s.tx - s.sx) * k;
        s.y = s.sy + (s.ty - s.sy) * k;
      } else {
        if (!s.back) {
          s.back = true;
          s.hit = new Set();
          if (s.burst) for (const n of G.notes) if (dist2(n.x, n.y, s.x, s.y) < (70 + n.r) ** 2) hitNote(n, s.dmg, s.src);
          if (s.burst && !G.sim) ring(s.x, s.y, 70, '#f7dc6f', 0.35, 5);
        }
        const hx = s.owner ? s.owner.x : s.sx;
        const hy = s.owner ? s.owner.y : s.sy;
        const kk = clamp(k - 1, 0, 1);
        s.x = s.tx + (hx - s.tx) * kk;
        s.y = s.ty + (hy - s.ty) * kk;
      }
      for (const n of G.notes) {
        if (n.dead || s.hit.has(n)) continue;
        if (dist2(n.x, n.y, s.x, s.y) < (n.r + 14) ** 2) {
          s.hit.add(n);
          hitNote(n, s.dmg, s.src);
        }
      }
      if (G.boss.active && dist2(G.boss.x, G.boss.y, s.x, s.y) < (G.boss.r + 14) ** 2 && !s.hitBoss) {
        s.hitBoss = true;
        hitBoss(s.dmg);
      }
    }
  }

  function updateDrops(dt) {
    const me = G.me;
    for (const d of G.drops) {
      d.t += dt;
      const dd = dist2(d.x, d.y, me.x, me.y);
      if (d.t < 0.3) {
        d.y += d.vy * dt;
      } else if (d.mat || dd < G.ps.magnet * G.ps.magnet || d.pull) {
        d.pull = true;
        const a = Math.atan2(me.y - d.y, me.x - d.x);
        const sp = 400 + d.t * 600;
        d.x += Math.cos(a) * sp * dt;
        d.y += Math.sin(a) * sp * dt;
      } else {
        d.y += 45 * dt; // ゆっくり落ちる
      }
      if (dist2(d.x, d.y, me.x, me.y) < 26 * 26) {
        d.dead = true;
        if (d.mat) G.mats[d.mat] = (G.mats[d.mat] || 0) + d.v;
        else G.coins += d.v;
      } else if (!d.mat && (d.t > 9 || d.y > FH + 10)) {
        d.dead = true;
        G.coinsLost += d.v;
      }
    }
    G.drops = G.drops.filter((d) => !d.dead);
  }

  // ---------- ボス ----------
  function startBoss() {
    const sc = G.parsed.score;
    const B = G.boss;
    const th = sc.theme || { part: 0, from: 0, len: G.parsed.barLen * 4, tempo: 100 };
    const { notes } = partNotes(sc.parts[th.part], 0, 'theme', sc.ppq);
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
    G.track.stop();
    G.btrack = new Track(list, { loopLen: (th.len * 60) / th.tempo });
    G.btrack.start(0, 0.8);
    // ボスの体力: 曲の音符の硬さの合計の 12% (長い曲・密な曲ほど硬い)
    B.maxHp = B.hp = Math.max(BOSS_HP * G.power * 0.15, G.hpSum * 0.12);
    B.shield = false;
    B.active = true;
    B.y = -80;
    G.phase = 'boss';
    G.phaseT = 0;
    if (!G.sim) {
      Synth.sfx('cymbal');
      banner(D.TEXT.bossIncoming[lang()]);
    }
  }
  function updateBoss(dt) {
    const B = G.boss;
    const me = G.me;
    B.t += dt;
    B.x = FW / 2 + Math.sin(B.t * 0.7) * 220;
    B.y += ((150 + Math.sin(B.t * 1.3) * 30) - B.y) * Math.min(1, dt * 2);
    B.fire -= dt;
    if (B.fire > 0 || B.y < 60) return;
    const pat = B.def.pattern || 'radial';
    const sp = 170 * Math.sqrt(G.T.spd);
    const col = B.def.color || '#fff';
    const dmg = 8;
    if (pat === 'radial') {
      B.fire = 1.4;
      for (let k = 0; k < 14; k++) {
        const a = B.t + (k / 14) * Math.PI * 2;
        G.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, col, dmg });
      }
    } else if (pat === 'aimed') {
      B.fire = 0.8;
      const a = Math.atan2(me.y - B.y, me.x - B.x);
      for (let k = -1; k <= 1; k++) G.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a + k * 0.13) * sp * 1.4, vy: Math.sin(a + k * 0.13) * sp * 1.4, r: 6, col, dmg });
    } else {
      B.fire = 1.1;
      for (let k = -3; k <= 3; k++) {
        const a = Math.PI / 2 + k * 0.2 + Math.sin(B.t) * 0.3;
        G.ebul.push({ x: B.x, y: B.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, col, dmg });
      }
    }
  }

  // ---------- 体力・終わり ----------
  function hurt(v) {
    if (!G || G.phase === 'end') return;
    const d = v * G.ps.def;
    G.hp -= d;
    G.dmgTaken += d;
    if (!G.sim) {
      shake(6);
      Synth.sfx('hurt');
    }
    if (G.hp <= 0) finish(false);
  }
  function finish(win) {
    if (!G || G.phase === 'end') return;
    // 画面に残った金貨は拾ったことにする
    for (const d of G.drops) {
      if (d.mat) G.mats[d.mat] = (G.mats[d.mat] || 0) + d.v;
      else G.coins += d.v;
    }
    G.drops = [];
    // 弾けたところ = 倒した音符の割合
    const prog = G.total ? clamp(G.killed / G.total, 0, 1) : 1;
    const bonus = win ? 0.5 : 0;
    const coins = Math.round(G.coins * (1 + bonus));
    const exp = {};
    for (const k in G.exp) exp[k] = Math.round(G.exp[k] * (1 + bonus));
    G.result = {
      win,
      prog,
      coins,
      exp,
      mats: { ...G.mats },
      killed: G.killed,
      total: G.total,
      leaked: G.leaked,
      dmg: Math.round(G.dmgTaken),
      time: G.t,
      song: G.song.id,
      part: G.part,
      tier: G.tier,
      comp: G.comp.id,
    };
    G.phase = 'end';
    if (G.track) G.track.stop();
    if (G.btrack) G.btrack.stop();
    if (!G.sim) Synth.sfx(win ? 'applause' : 'boom');
    if (G.opt.onFinish) G.opt.onFinish(G.result);
  }

  // ---------- 操作 ----------
  function pointer(type, cx, cy) {
    if (!G || G.phase === 'end') return;
    const [x, y] = toField(cx, cy);
    const me = G.me;
    if (type === 'down') {
      me.drag = { px: x, py: y, mx: me.tx, my: me.ty };
    } else if (type === 'move' && me.drag) {
      me.tx = clamp(me.drag.mx + (x - me.drag.px) * 1.4, 24, FW - 24);
      me.ty = clamp(me.drag.my + (y - me.drag.py) * 1.4, PLAYER_Y0, LINE_Y - 20);
    } else if (type === 'up') {
      me.drag = null;
    }
  }
  function sweep() {
    if (!G || G.bomb < 1 || G.phase === 'end') return;
    G.bomb = 0;
    G.ebul = [];
    const p = G.ps.bombPow;
    for (const n of G.notes) if (n.y > -10) hitNote(n, (0.35 * n.maxHp + playerDmg() * 25) * p, null);
    hitBoss(G.boss.maxHp * 0.03 * p);
    if (!G.sim) {
      ring(G.me.x, G.me.y, 900, '#ffd84a', 0.7, 14);
      shake(12);
      Synth.sfx('cymbal');
      Synth.sfx('boom');
      banner(G.comp.name[lang()] + ' ' + D.TEXT.sweep[lang()] + '!');
    }
  }
  function key(ev, down) {
    keys[ev.key.toLowerCase()] = down;
    if (!down || !G) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      sweep();
    }
    if (ev.key.startsWith('Arrow')) ev.preventDefault();
  }
  function clearKeys() {
    for (const k in keys) keys[k] = false;
  }

  // ---------- 効果 ----------
  function burst(x, y, col, n = 8, spd = 160, life = 0.5, size = 3) {
    const fx = G.fx;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(spd * 0.3, spd);
      fx.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, col, size: rand(size * 0.6, size * 1.4) });
    }
    if (fx.parts.length > 700) fx.parts.splice(0, fx.parts.length - 700);
  }
  function ring(x, y, r, col, life = 0.35, width = 4) {
    G.fx.rings.push({ x, y, r, col, life, max: life, width });
  }
  function text(x, y, s, col = '#fff', size = 18) {
    G.fx.texts.push({ x, y, s, col, size, life: 0.9, max: 0.9 });
    if (G.fx.texts.length > 60) G.fx.texts.shift();
  }
  function shake(v) {
    if (window.CSUI && window.CSUI.settings && window.CSUI.settings.shake === false) return;
    G.fx.shake = Math.max(G.fx.shake, v);
  }
  function banner(s) {
    if (window.CSUI && window.CSUI.banner) window.CSUI.banner(s);
  }
  function lang() {
    return (window.CSUI && window.CSUI.lang) || 'ja';
  }
  function updateFx(dt) {
    const fx = G.fx;
    for (const p of fx.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vy *= 1 - 2.5 * dt;
      p.life -= dt;
    }
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const t of fx.texts) {
      t.y -= 40 * dt;
      t.life -= dt;
    }
    fx.texts = fx.texts.filter((t) => t.life > 0);
    for (const r of fx.rings) r.life -= dt;
    fx.rings = fx.rings.filter((r) => r.life > 0);
    fx.shake = Math.max(0, fx.shake - dt * 30);
  }

  // ---------- 描画 ----------
  function render() {
    if (!ctx || !G) return;
    const c = ctx;
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.fillStyle = '#0d0f14';
    c.fillRect(0, 0, view.w, view.h);
    const sh = G.fx.shake;
    const sx = sh ? rand(-sh, sh) : 0;
    const sy = sh ? rand(-sh, sh) : 0;
    c.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * (view.offX + sx * view.scale), view.dpr * (view.offY + sy * view.scale));
    c.save();
    c.beginPath();
    c.rect(0, 0, FW, FH);
    c.clip();
    drawField(c);
    drawTowers(c);
    for (const n of G.notes) drawNote(c, n);
    drawShots(c);
    drawBullets(c);
    if (G.phase === 'boss' || G.boss.active) {
      ART.drawBoss(c, G.boss, G.t);
      const B = G.boss;
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(B.x - 70, B.y - B.r - 34, 140, 8);
      c.fillStyle = '#ff5e7a';
      c.fillRect(B.x - 70, B.y - B.r - 34, 140 * clamp(B.hp / B.maxHp, 0, 1), 8);
    }
    drawPlayer(c);
    drawFx(c);
    c.restore();
  }

  function drawField(c) {
    const book = D.BOOKS.find((b) => b.id === G.song.book);
    const g = c.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, '#0f0b1e');
    g.addColorStop(0.65, '#1d1730');
    g.addColorStop(1, book ? book.color : '#2a2140');
    c.fillStyle = g;
    c.fillRect(0, 0, FW, FH);
    // 鍵盤の位置の縦線 (音の高さの目安)
    c.lineWidth = 1;
    for (let p = Math.ceil(G.lo); p <= G.hi; p++) {
      if (p % 12 !== 0 && p % 12 !== 5) continue;
      const x = pitchX(p);
      c.strokeStyle = p % 12 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, LINE_Y);
      c.stroke();
    }
    // 流れる星
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 46; i++) {
      const x = (i * 97) % FW;
      const y = (i * 211 + G.t * (40 + (i % 5) * 25)) % FH;
      c.fillRect(x, y, 2, 2);
    }
    // 下の鍵盤
    c.fillStyle = '#efe7d6';
    c.fillRect(0, LINE_Y, FW, FH - LINE_Y);
    for (let p = Math.ceil(G.lo); p <= G.hi; p++) {
      if (BLACK_KEYS.includes(p % 12)) {
        c.fillStyle = '#1a1620';
        c.fillRect(pitchX(p) - 4, LINE_Y, 8, 46);
      }
    }
    c.strokeStyle = 'rgba(255,138,168,0.75)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, LINE_Y);
    c.lineTo(FW, LINE_Y);
    c.stroke();
  }

  function drawNote(c, n) {
    const r = n.r;
    const x = n.x;
    const y = n.y;
    c.save();
    c.translate(x, y);
    const hollow = n.d >= 2;
    const col = n.flash > 0 ? (n.rank === 0 ? '#ffd84a' : '#fff') : n.stun > 0 ? '#bfe8ff' : n.col;
    if (n.elite) {
      c.strokeStyle = '#ffd84a';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, r + 6 + Math.sin(n.t * 8) * 1.5, 0, Math.PI * 2);
      c.stroke();
    }
    if (n.d < 4) {
      const up = n.p < 71;
      const sxx = up ? r * 0.85 : -r * 0.85;
      const syy = up ? -r * 3.2 : r * 3.2;
      if (n.rank >= 5) {
        // 黒い音符は暗い背景で見えるように、棒と旗に白いふち
        c.strokeStyle = 'rgba(255,255,255,0.75)';
        c.lineWidth = Math.max(2, r * 0.18) + 3;
        c.beginPath();
        c.moveTo(sxx, 0);
        c.lineTo(sxx, syy);
        c.stroke();
      }
      c.strokeStyle = col;
      c.lineWidth = Math.max(2, r * 0.18);
      c.beginPath();
      c.moveTo(sxx, 0);
      c.lineTo(sxx, syy);
      c.stroke();
      const flags = n.d <= 0.25 ? 2 : n.d <= 0.5 ? 1 : 0;
      for (let i = 0; i < flags; i++) {
        const fy = syy + (up ? 1 : -1) * i * r * 0.7;
        c.beginPath();
        c.moveTo(sxx, fy);
        c.quadraticCurveTo(sxx + r * 1.2, fy + (up ? 1 : -1) * r * 0.6 + Math.sin(n.t * 12 + i) * 2, sxx + r * 0.6, fy + (up ? 1 : -1) * r * 1.4);
        c.stroke();
      }
    }
    c.rotate(-0.35);
    c.beginPath();
    c.ellipse(0, 0, r * 1.15, r * 0.82, 0, 0, Math.PI * 2);
    if (hollow) {
      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.fill();
      if (n.rank >= 5) {
        c.strokeStyle = 'rgba(255,255,255,0.75)';
        c.lineWidth = Math.max(2.5, r * 0.3) + 3;
        c.stroke();
      }
      c.strokeStyle = col;
      c.lineWidth = Math.max(2.5, r * 0.3);
      c.stroke();
    } else {
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = n.rank >= 4 ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.5)';
      c.lineWidth = n.rank >= 4 ? 2.5 : 1.5;
      c.stroke();
    }
    c.restore();
    if (n.sharp) {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.font = `bold ${Math.round(r)}px serif`;
      c.textAlign = 'center';
      c.fillText('♯', x - r * 1.7, y + r * 0.35);
    }
    if (n.fermata) {
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y - r - 8, r * 0.8, Math.PI, 0);
      c.stroke();
    }
    if (n.hp < n.maxHp && !n.grace) {
      const w = Math.max(18, r * 2.2);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(x - w / 2, y + r + 4, w, 3);
      c.fillStyle = '#ff6b6b';
      c.fillRect(x - w / 2, y + r + 4, (w * Math.max(0, n.hp)) / n.maxHp, 3);
    }
  }

  function drawTowerIcon(c, id, x, y, size, star, opt = {}) {
    c.save();
    c.fillStyle = opt.hurt ? '#ffffff' : 'rgba(30,24,44,0.9)';
    c.strokeStyle = ['rgba(255,255,255,0.7)', '#9fd8ff', '#c0c8d8', '#ff9ad5', '#ffd84a'][(opt.grade || 1) - 1];
    c.lineWidth = (opt.grade || 1) >= 3 ? 3 : 2;
    c.beginPath();
    c.arc(x, y, size * 0.62, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
    ART.drawIcon(c, id, x, y, size * 0.95);
    if (opt.grade > 1) {
      c.fillStyle = '#ffd84a';
      c.font = 'bold 10px system-ui';
      c.textAlign = 'center';
      c.fillText('◆'.repeat(opt.grade - 1), x, y - size * 0.68);
    }
  }
  function drawTowers(c) {
    for (const t of G.towers) {
      const st = t.st;
      if (st.kind === 'aura' || st.kind === 'buff') {
        c.fillStyle = st.kind === 'aura' ? 'rgba(122,63,23,0.12)' : 'rgba(126,240,200,0.06)';
        c.beginPath();
        c.arc(t.x, t.y, st.range * (1 + Math.sin(t.t * 3) * 0.03), 0, Math.PI * 2);
        c.fill();
      }
      if (st.kind === 'string' && t.lines) drawStrings(c, t);
      const sc = 1 - t.born * 1.2;
      drawTowerIcon(c, t.id, t.x, t.y + (t.act > 0 ? -Math.sin((t.act / 0.3) * Math.PI) * 4 : 0), 38 * Math.max(0.3, sc), st.star, { hurt: t.hurtT > 0, grade: st.grade });
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(t.x - 22, t.y + 26, 44, 4);
      c.fillStyle = t.hp / t.maxHp > 0.3 ? '#7ef0c8' : '#ff6b6b';
      c.fillRect(t.x - 22, t.y + 26, 44 * clamp(t.hp / t.maxHp, 0, 1), 4);
    }
  }
  function drawStrings(c, h) {
    const st = h.st;
    for (const ly of h.lines || []) {
      c.strokeStyle = h.act > 0 ? '#fff6c8' : 'rgba(212,160,23,0.75)';
      c.lineWidth = h.act > 0 ? 3 : 2;
      c.beginPath();
      c.moveTo(h.x - st.range * 1.6, ly + (h.act > 0 ? Math.sin(G.t * 80) * 2 : 0));
      c.lineTo(h.x + st.range * 1.6, ly);
      c.stroke();
    }
  }
  function drawShots(c) {
    for (const s of G.shots) {
      const k = 1 - s.life / s.max;
      c.globalAlpha = 1 - k * 0.7;
      c.strokeStyle = s.col || '#fff';
      c.fillStyle = s.col || '#fff';
      if (s.kind === 'beam') {
        c.globalAlpha = 0.75 * (1 - k);
        c.fillRect(s.x - s.w / 2, 0, s.w, s.y);
        c.fillStyle = '#fff';
        c.fillRect(s.x - s.w / 6, 0, s.w / 3, s.y);
      } else if (s.kind === 'spark') {
        const x = s.x + (s.tx - s.x) * k + Math.sin(k * Math.PI) * s.arc;
        const y = s.y + (s.ty - s.y) * k;
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'cone') {
        c.globalAlpha = 0.35 * (1 - k);
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.arc(s.x, s.y, s.r * (0.4 + 0.6 * k), -Math.PI / 2 - s.half, -Math.PI / 2 + s.half);
        c.closePath();
        c.fill();
      } else if (s.kind === 'pillar') {
        c.globalAlpha = 0.6 * (1 - k);
        c.fillRect(s.x - 22, s.y - 40, 44, LINE_Y - s.y + 40);
        c.beginPath();
        c.arc(s.x, s.y, 40 * (0.5 + k), 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'pluck') {
        c.beginPath();
        c.arc(s.x, s.y, 10 * (1 - k) + 2, 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'boomerang') {
        c.globalAlpha = 1;
        c.save();
        c.translate(s.x, s.y);
        c.rotate(s.t * 18);
        c.fillStyle = '#f7dc6f';
        c.beginPath();
        c.ellipse(0, 0, 14, 5, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }
  }
  function drawBullets(c) {
    for (const b of G.bullets) {
      if (b.big) {
        c.fillStyle = '#fff2c4';
        c.beginPath();
        c.arc(b.x, b.y, 5, 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = '#fff6c8';
        c.fillRect(b.x - 2, b.y - 9, 4, 14);
      }
    }
    for (const b of G.ebul) {
      c.fillStyle = b.col;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
      c.fill();
    }
    for (const d of G.drops) {
      if (d.mat) {
        // 素材のかけら (ひし形)
        const m = D.MATS.find((x) => x.id === d.mat);
        c.save();
        c.translate(d.x, d.y);
        c.rotate(d.t * 4);
        c.fillStyle = m.col;
        c.strokeStyle = d.mat === 'k' ? '#ffffff' : 'rgba(0,0,0,0.6)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(0, -8);
        c.lineTo(6, 0);
        c.lineTo(0, 8);
        c.lineTo(-6, 0);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
        continue;
      }
      c.fillStyle = '#ffd84a';
      c.beginPath();
      c.arc(d.x, d.y, 5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#b8860b';
      c.lineWidth = 1.5;
      c.stroke();
    }
  }
  function drawPlayer(c) {
    const me = G.me;
    if (me.inv > 0 && Math.floor(me.inv * 12) % 2) return;
    c.fillStyle = 'rgba(255,216,74,0.16)';
    c.beginPath();
    c.arc(me.x, me.y, 30, 0, Math.PI * 2);
    c.fill();
    ART.drawComposer(c, G.comp, me.x, me.y, 1.5, 1, me.t * 10, false);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(me.x, me.y, 4, 0, Math.PI * 2);
    c.fill();
  }
  function drawFx(c) {
    const fx = G.fx;
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
      c.globalAlpha = clamp((t.life / t.max) * 1.5, 0, 1);
      c.font = `bold ${t.size}px system-ui, sans-serif`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(t.s, t.x, t.y);
      c.fillStyle = t.col;
      c.fillText(t.s, t.x, t.y);
    }
    c.globalAlpha = 1;
  }

  // ---------- 一時停止 ----------
  function pause() {
    if (!G) return;
    if (G.track && G.phase !== 'boss') G.track.pause();
    if (G.btrack) G.btrack.pause();
  }
  function resume() {
    if (!G) return;
    if (G.phase === 'boss' && G.btrack) G.btrack.start(G.btrack.pausedPos, 0.4);
    else if (G.track && G.track.pausedPos !== undefined) G.track.start(G.track.pausedPos, 0.4);
  }
  function quit() {
    if (!G) return;
    if (G.track) G.track.stop();
    if (G.btrack) G.btrack.stop();
    G.phase = 'end';
    G = null;
  }

  // ---------- 自動プレイ (難しさを確かめる) ----------
  // 一番下まで来た音符の真下へ動き、弾をよける。配置の楽器は、音符の多い高さの下に置く
  function botThink(dt) {
    const me = G.me;
    let best = null;
    for (const n of G.notes) if (n.y > 0 && (!best || n.y > best.y)) best = n;
    let tx = me.x;
    if (G.phase === 'boss' && G.boss.active && (!best || best.y < 600)) tx = G.boss.x;
    else if (best) tx = best.x;
    let push = 0;
    for (const b of G.ebul) {
      const dx = me.x - b.x;
      const dy = me.y - b.y;
      if (dy > -10 && dy < 160 && Math.abs(dx) < 54) push += dx >= 0 ? 1 : -1;
    }
    for (const n of G.notes) {
      const dx = me.x - n.x;
      const dy = me.y - n.y;
      if (dy > 0 && dy < 120 && Math.abs(dx) < n.r + 20) push += dx >= 0 ? 1 : -1;
    }
    if (push) tx = me.x + Math.sign(push) * 90;
    me.tx = clamp(tx, 24, FW - 24);
    me.ty = 1060;
    G.botT = (G.botT || 0) - dt;
    if (G.botT > 0) return;
    G.botT = 0.5;
    if (G.bomb >= 1 && (G.notes.filter((n) => n.y > 850).length >= 6 || G.hp < G.maxHp * 0.35 || (G.phase === 'boss' && G.boss.active))) sweep();
  }
  function simulate(opt, maxSec = 1200) {
    Synth.fake = true;
    Synth.fakeTime = 0;
    let res = null;
    start({ ...opt, sim: true, onFinish: (r) => (res = r) });
    const dt = 1 / 30;
    let t = 0;
    while (G && G.phase !== 'end' && t < maxSec) {
      Synth.fakeTime += dt;
      t += dt;
      botThink(dt);
      update(dt);
    }
    if (!res && G) {
      res = { win: false, timeout: true, phase: G.phase, prog: G.track ? G.track.pos() / G.info.lengthSec : 0, coins: Math.round(G.coins), killed: G.killed, total: G.total, hp: Math.round(G.hp), bossHp: Math.round(G.boss.hp) };
    }
    G = null;
    Synth.fake = false;
    return res;
  }

  window.CSGame = {
    FW,
    FH,
    start,
    update,
    render,
    pointer,
    sweep,
    key,
    clearKeys,
    pause,
    resume,
    quit,
    simulate,
    resize,
    stageInfo,
    parsedOf,
    songPower,
    playerStats,
    towerStats,
    get G() {
      return G;
    },
  };
})();
