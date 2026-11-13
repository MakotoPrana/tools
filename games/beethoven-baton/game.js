/*
 * 指揮棒ベートーヴェン (Baton Beethoven)
 * クラシック音楽に合わせて戦う 2D 横スクロールアクション。
 *   - 道中: モーツァルト ピアノソナタ第 16 番 K.545 第 1 楽章 (ループ) / 敵は英国紳士たち
 *   - ボス: マリー・アントワネット / ピアノ協奏曲第 21 番 K.467 第 1 楽章 (ループ)
 *   - ステージ 2〜5 は stages.js (ナポレオン・カサノヴァ・パガニーニ・モーツァルトの幻影)
 *   - 通常攻撃・ため攻撃・防御の三すくみ (通常 > ため > 防御 > 通常)。敵の攻撃は拍の上に来る
 *   - 拍 (メロディ) に合わせて動くと、ダメージと演出が派手になる。拍に合わせた防御はジャストガード
 */
(() => {
  'use strict';
  const { Audio, Player, loadSong } = window.BB_AUDIO;

  // ---------- 画面 ----------
  // 画面の論理サイズ。高さは 540 で決め、横幅は画面の比率に合わせて広げる (画面いっぱいに出す)。
  // 16:9 より縦長の画面では横幅 960 のまま、上に空 (OY) を足す
  let W = 960;
  const H = 540;
  let OY = 0;
  const GROUND = 440; // タイトルなどで使う、ふつうの足もとの高さ
  // ベルトスクロール: 地面は奥行きのある帯。z = 足もとの画面の y (奥 Z_TOP 〜 手前 Z_BOT)
  const HORIZON = 330;
  const Z_TOP = 362;
  const Z_BOT = 470;
  const DZ_HIT = 30; // これより奥行きがずれていたら当たらない
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let dpr = 1;
  let rotated = false;
  // ノッチやホームバーの幅 (論理の単位)。絵は端まで描き、ボタンと HUD だけこの内側に置く
  let SAFE_L = 0;
  let SAFE_R = 0;
  const safeProbe = document.createElement('div');
  safeProbe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(safeProbe);
  function readInsets() {
    const cs = getComputedStyle(safeProbe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    // 縦長の画面では、キャンバスを 90 度回して横向きに出す (端末を横にして遊ぶ)
    rotated = vh > vw * 1.1;
    if (rotated) [vw, vh] = [vh, vw];
    const aspect = vw / vh;
    if (aspect >= 960 / 540) {
      W = Math.round(Math.min(2200, 540 * aspect));
      scale = vh / H;
      OY = 0;
    } else {
      W = 960;
      scale = vw / W;
      OY = vh / scale - H;
    }
    // 回して出しているときは、画面の上下がゲームの左右になる
    const ins = readInsets();
    SAFE_L = (rotated ? ins.t : ins.l) / scale;
    SAFE_R = (rotated ? ins.b : ins.r) / scale;
    // 右下のボタンは右端からの位置で置く
    for (const b of TBTN) b.x = W - b.fromRight - SAFE_R;
    STICK_HOME.x = 130 + SAFE_L;
    canvas.style.width = `${Math.round(vw)}px`;
    canvas.style.height = `${Math.round(vh)}px`;
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = `translate(-50%, -50%)${rotated ? ' rotate(90deg)' : ''}`;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }
  window.addEventListener('resize', () => resize());
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));

  // ---------- 保存 ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* 保存できなくても遊べる */
      }
    },
  };
  let offsetMs = store.get('bb-offset', 0);
  let best = store.get('bb-best', { score: 0, rank: '-' });

  // ---------- アクセス解析 (games/ANALYTICS.md) ----------
  const trackEvent = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };
  const stageTrack = (() => {
    const GAME = 'beethoven_baton';
    const attempts = {};
    let playing = null;
    let ended = null;
    const send = (name, params) => trackEvent(name, { game: GAME, ...params });
    const end = (result, extra) => {
      if (!playing) return;
      send('stage_end', { stage: playing.stage, result, play_sec: Math.round((performance.now() - playing.at) / 1000), ...extra });
      ended = { stage: playing.stage, result };
      playing = null;
    };
    window.addEventListener('pagehide', () => end('quit'));
    return {
      start(stage, extra) {
        end('quit');
        if (ended && ended.stage === stage) send(`stage_retry_${ended.result}`, { stage });
        attempts[stage] = (attempts[stage] || 0) + 1;
        playing = { stage, at: performance.now() };
        ended = null;
        send('stage_start', { stage, attempt: attempts[stage], ...extra });
      },
      clear: (extra) => end('clear', extra),
      fail: (extra) => end('fail', extra),
      quit: () => end('quit'),
    };
  })();

  // ---------- 小物 ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function weighted(opts) {
    let s = 0;
    for (const o of opts) s += Math.max(0, o[1]);
    let r = Math.random() * s;
    for (const o of opts) {
      r -= Math.max(0, o[1]);
      if (r <= 0) return o[0];
    }
    return opts[opts.length - 1][0];
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 決まった乱数 (背景の並びを毎回同じにする)
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------- 曲 ----------
  const { fromCS } = window.BB_AUDIO;
  const { BASE, ENEMIES, BOSSES, STAGES } = window.BB_STAGES;
  const songCache = {};
  // 曲の指定 ({ song: 'k545' | 'cs:turkish', title, composer }) → 読みこんだ曲
  function songOf(spec) {
    if (songCache[spec.song]) return songCache[spec.song];
    let raw;
    if (spec.song.startsWith('cs:')) {
      const cs = window.CS_SCORES && window.CS_SCORES[spec.song.slice(3)];
      raw = fromCS(cs, spec.title);
      raw.composer = spec.composer;
    } else {
      raw = { ...window.BB_SONGS[spec.song], composer: spec.composer || 'モーツァルト' };
    }
    songCache[spec.song] = loadSong(raw);
    return songCache[spec.song];
  }
  // 進み具合 (どのステージまで開いたか・ステージごとの一番よい結果)
  let progress = store.get('bb-progress', { open: 1, best: {} });
  {
    // 前の版 (1 ステージだけのころ) のハイスコアを引きつぐ
    const old = store.get('bb-best', null);
    if (old && old.score > 0 && !progress.best[1]) {
      progress.best[1] = old;
      progress.open = Math.max(progress.open, 2);
    }
  }

  // ---------- 判定 ----------
  const JUDGE = [
    { name: 'MISS', color: '#9aa4b0', mult: 1, stop: 0.03 },
    { name: 'GREAT', color: '#7fd8ff', mult: 1.5, stop: 0.06 },
    { name: 'PERFECT', color: '#ffd84a', mult: 2.1, stop: 0.09 },
  ];
  const PERFECT_WIN = 0.07;
  const GREAT_WIN = 0.135;
  const JUST_WIN = 0.2; // ジャストガード: 当たる時刻の何秒前までに構えればよいか
  const JUST_LV2 = 0.1;
  const JUST_LV3 = 0.045; // これより近ければ「完璧」→ カデンツァ
  const JUST_LEVELS = {
    1: { label: 'JUST GUARD', short: 'JUST', color: '#8ff0ff', size: 28, score: 500 },
    2: { label: 'GREAT JUST!', short: 'GREAT JUST', color: '#7fd8ff', size: 32, score: 900 },
    3: { label: 'PERFECT JUST!!', short: 'PERFECT JUST', color: '#ffd84a', size: 38, score: 1500 },
  };
  // カデンツァ: 完璧なジャストガードのあと、敵がスローになり、画面の中央にメロディのガイドが出る。
  // ガイドどおりに打てたかで 100 点満点。80 点以上で相手に大ダメージ
  const CADENZA_PASS = 80;

  // ---------- 入力 ----------
  const keys = {};
  const input = { left: false, right: false, up: false, down: false, attack: false, guard: false };
  // スマホのスティック (傾きの向きと強さ。-1〜1)
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, ax: 0, ay: 0 };
  const pressQ = []; // { kind: 'attack' | 'guard', down: bool, beat, time }
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyJ: 'attack', KeyZ: 'attack',
    KeyK: 'guard', KeyX: 'guard',
  };
  function stamp() {
    return { time: Audio.now(), beat: game && game.music ? game.music.beat(offsetMs / 1000) : 0 };
  }
  function setInput(kind, down) {
    if (input[kind] === down) return;
    input[kind] = down;
    if (kind === 'attack' || kind === 'guard') pressQ.push({ kind, down, ...stamp() });
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) {
      if (KEYMAP[e.code] || e.code === 'Space') e.preventDefault();
      return;
    }
    Audio.init();
    Audio.resume();
    keys[e.code] = true;
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      setInput(k, true);
    }
    onKey(e.code);
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    const k = KEYMAP[e.code];
    if (k) setInput(k, false);
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(input)) setInput(k, false);
    if (scene === 'play') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scene === 'play') pauseGame();
  });

  // タッチ: 画面のボタン
  let touchMode = false;
  const STICK_R = 60;
  const STICK_HOME = { x: 130, y: 430 };
  const TBTN = [
    { id: 'guard', fromRight: 215, y: 470, r: 48, label: '防' },
    { id: 'attack', fromRight: 90, y: 440, r: 60, label: '攻' },
  ];
  resize();
  const pointers = new Map();
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    const VH = H + OY;
    if (rotated) {
      // 縦持ちのときはキャンバスを 90 度回して横向きに見せている
      return { x: ((e.clientY - r.top) / r.height) * W, y: ((r.right - e.clientX) / r.width) * VH - OY };
    }
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * VH - OY };
  }
  function moveStick(p) {
    let dx = p.x - stick.ox;
    let dy = p.y - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // 指が遠くへ行ったら、スティックの台もついてくる
      stick.ox += (dx / d) * (d - STICK_R);
      stick.oy += (dy / d) * (d - STICK_R);
      dx = p.x - stick.ox;
      dy = p.y - stick.oy;
    }
    stick.x = dx;
    stick.y = dy;
    const k = Math.hypot(dx, dy) < 10 ? 0 : 1;
    stick.ax = k * clamp(dx / STICK_R, -1, 1);
    stick.ay = k * clamp(dy / STICK_R, -1, 1);
  }
  function releaseStick() {
    stick.id = null;
    stick.x = stick.y = stick.ax = stick.ay = 0;
  }
  function btnAt(p) {
    let bestB = null;
    let bd = 1e9;
    for (const b of TBTN) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.r * 1.35 && d < bd) {
        bd = d;
        bestB = b;
      }
    }
    return bestB;
  }
  canvas.addEventListener('pointerdown', (e) => {
    Audio.init();
    Audio.resume();
    const p = toLogical(e);
    if (e.pointerType === 'touch') touchMode = true;
    if (scene === 'play' && touchMode) {
      if (p.x > W - 70 - SAFE_R && p.y < 60 - OY) {
        pauseGame();
        return;
      }
      // 画面の左側はどこを押してもスティック (押した所が中心)
      if (p.x < W * 0.45 && stick.id === null) {
        stick.id = e.pointerId;
        stick.ox = p.x;
        stick.oy = p.y;
        moveStick(p);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const b = btnAt(p);
      if (b) {
        pointers.set(e.pointerId, b.id);
        setInput(b.id, true);
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    onTap(p);
  });
  const releasePointer = (e) => {
    if (e.pointerId === stick.id) releaseStick();
    const id = pointers.get(e.pointerId);
    if (id) {
      pointers.delete(e.pointerId);
      if (![...pointers.values()].includes(id)) setInput(id, false);
    }
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) moveStick(toLogical(e));
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- 場面 ----------
  let scene = 'title'; // title | play | pause | result
  let game = null;
  let result = null;
  let titleT = 0;

  // ---------- 敵の種類 ----------
  const ETYPES = {};
  for (const [k, v] of Object.entries(ENEMIES)) ETYPES[k] = { ...BASE[v.base], ...v, key: k };
  for (const [k, v] of Object.entries(BOSSES)) ETYPES[k] = { ...v, key: k, boss: true };
  const MAX_LEN = Math.max(...STAGES.map((s) => s.road.len));

  // ---------- ゲームを作る ----------
  function newGame(no, fromBoss) {
    const def = STAGES[no - 1];
    const g = {
      no,
      def,
      roadLen: def.road.len,
      stage: fromBoss ? 'boss' : 'street',
      music: null,
      player: makePlayer(fromBoss ? 220 : 160),
      enemies: [],
      shots: [],
      parts: [],
      rings: [],
      texts: [],
      staffFx: [],
      camX: 0,
      lock: null,
      waveIdx: 0,
      wave: null,
      shake: 0,
      flash: 0,
      flashColor: '#fff',
      gold: 0,
      hitstop: 0,
      slowmo: 0,
      lastBeatInt: -1,
      beatPulse: 0,
      downPulse: 0,
      score: 0,
      combo: 0,
      maxCombo: 0,
      stats: { attacks: 0, perfect: 0, great: 0, just: 0, dmgTaken: 0, kills: 0 },
      laneJudge: null,
      hint: null,
      hintT: 0,
      trans: null,
      boss: null,
      bossIntro: 0,
      over: null,
      time: 0,
      fromBoss: !!fromBoss,
      goSign: 0,
      usedMel: new Set(),
      offStreak: 0, // メロディに関係ない攻撃が続いた回数
      lastAtkTime: -9,
    };
    return g;
  }

  function makePlayer(x) {
    return {
      x, y: 420, z: 420, vx: 0, vy: 0, face: 1, hp: 100, maxHp: 100, onGround: true,
      state: 'free', st: 0, // 状態と、その状態になってからの秒
      atk: null, // 振っている攻撃 { kind, judge, level, hit:Set, dur, a0, a1 }
      hold: null, // 攻撃ボタンを押している { time, beat, judge }
      chargeT: 0, chargeLv: 0,
      guardBeat: -99, guardTime: 0,
      inv: 0, walkT: 0, recent: [], // 最近の行動 (ボスが読む)
      glow: 0,
    };
  }

  function startStreet(g) {
    g.stage = 'street';
    g.music = new Player(songOf(g.def.road));
    g.music.play(0.3);
    g.pulse = g.music.song.pulse;
    stageTrack.start(`${g.no}-road`);
  }

  function startBoss(g) {
    g.stage = 'boss';
    g.enemies = [];
    g.shots = [];
    g.camX = 0;
    g.lock = null;
    g.player.x = 200;
    g.player.z = 420;
    g.player.y = 420;
    g.player.vx = 0;
    g.player.state = 'free';
    g.player.atk = null;
    g.player.hold = null;
    if (g.music) g.music.stop(0.4);
    g.music = new Player(songOf(g.def.boss));
    g.music.play(0.4);
    g.pulse = g.music.song.pulse;
    const b = makeEnemy(g.def.boss.type, W - 200, -1);
    b.state = 'intro';
    g.enemies.push(b);
    g.boss = b;
    g.bossIntro = 1;
    g.summoned = false;
    g.lastBeatInt = -1;
    say(b, b.T.intro, 4);
    stageTrack.start(`${g.no}-boss`);
  }

  function makeEnemy(type, x, face, z) {
    const T = ETYPES[type];
    if (z === undefined) z = T.boss ? 415 : rand(Z_TOP + 8, Z_BOT - 8);
    const e = mkEnemy(type, T, x, face);
    // ステージが進むほど硬い
    if (!T.boss && game && game.def) {
      e.hp = e.maxHp = Math.round(T.hp * game.def.road.hp);
    }
    e.z = z;
    e.y = z;
    return e;
  }
  function mkEnemy(type, T, x, face) {
    return {
      type, T, x, y: 0, z: 0, vx: 0, vy: 0, face, hp: T.hp, maxHp: T.hp,
      state: 'walk', st: 0, act: null, guardUntil: -1, stun: 0, hurtT: 0,
      hitBy: null, bob: Math.random() * 6, speech: null, speechT: 0, dead: false, deadT: 0,
      flash: 0, nextThink: 0, walkT: Math.random() * 10, spinA: 0, phase: 1, lunge: 0,
    };
  }

  function say(e, text, sec = 2) {
    e.speech = text;
    e.speechT = sec;
  }

  // ---------- 演出 ----------
  function burst(x, y, n, opts = {}) {
    const g = game;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(opts.min || 80, opts.max || 380);
      g.parts.push({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp - (opts.up || 120),
        life: rand(0.4, opts.life || 0.9), max: 1,
        color: opts.colors ? pick(opts.colors) : opts.color || '#ffd84a',
        size: rand(opts.smin || 2, opts.smax || 5),
        kind: opts.kind || 'spark',
        glyph: pick(['♪', '♫', '♩', '♬']),
        rot: rand(-1, 1), g: opts.grav === undefined ? 600 : opts.grav,
      });
      const p = g.parts[g.parts.length - 1];
      p.max = p.life;
    }
  }
  function ring(x, y, r, vr, color, width = 4, life = 0.5) {
    game.rings.push({ x, y, r, vr, color, width, life, max: life });
  }
  function popText(x, y, text, color, size = 26, life = 0.9, vy = -60) {
    game.texts.push({ x, y, text, color, size, life, max: life, vy });
  }
  function shake(v) {
    game.shake = Math.max(game.shake, v);
  }
  function flash(alpha, color = '#fff') {
    game.flash = Math.max(game.flash, alpha);
    game.flashColor = color;
  }

  // 合った拍の和音 (今のメロディの音 + その 3 度上 + 5 度上。ハ長調の音階で数える)
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  function diatonic(p, steps) {
    const oct = Math.floor(p / 12);
    const pc = p % 12;
    let idx = SCALE.indexOf(pc);
    if (idx < 0) return p + (steps === 2 ? 4 : steps === 4 ? 7 : 12);
    idx += steps;
    return oct * 12 + SCALE[idx % 7] + Math.floor(idx / 7) * 12;
  }
  function musicChord(beat, judge, big) {
    let p = game.music.melodyAt(beat);
    while (p < 72) p += 12;
    while (p > 88) p -= 12;
    const chord = big ? [p - 12, p, diatonic(p, 2), diatonic(p, 4), p + 12] : judge >= 2 ? [p, diatonic(p, 2), diatonic(p, 4)] : [p, diatonic(p, 4)];
    Audio.sfxChord(chord, judge);
  }

  // ---------- 拍の判定 ----------
  // 攻撃の判定: 一番近い、まだ使っていないメロディの音とのずれ。
  // 16 分音符の連打にも合わせられるように、判定の幅は音と音の間に合わせて狭める。
  // 同じ音で二度は合わない (連打のしすぎは「メロディに関係ない」扱い)
  function judgeAt(beat, press) {
    const m = game.music;
    if (!m) return { j: 0 };
    if (press) {
      // でたらめな連打を見分ける: 直前 1 拍で押した数が、その間のメロディの音の数より 2 つ以上多ければノイズ
      game.pressBeats = (game.pressBeats || []).filter((b) => b > beat - 1);
      game.pressBeats.push(beat);
      const notes = m.melBetween(beat - 1, beat + 0.15).length;
      if (game.pressBeats.length > notes + 1) return { j: 0, noise: true };
    }
    const n = m.nearestMel(beat, game.usedMel);
    if (!n) return { j: 0 };
    const dt = Math.abs(beat - n.t) * m.spb;
    const gapSec = n.gap * m.spb;
    const perf = Math.min(PERFECT_WIN, gapSec * 0.42);
    const great = Math.min(GREAT_WIN, gapSec * 0.5);
    const j = dt <= perf ? 2 : dt <= great ? 1 : 0;
    if (j > 0) {
      game.usedMel.add(Math.round(n.t * 4));
      if (game.usedMel.size > 400) game.usedMel = new Set([...game.usedMel].slice(-200));
    }
    return { j, note: n };
  }
  function showLaneJudge(j, label) {
    game.laneJudge = { j, label: label || JUDGE[j].name, t: 0.6 };
  }

  // ---------- プレイヤー ----------
  const P = {
    speed: 270,
    chargeSpeed: 95,
    grav: 1900,
    tapMax: 0.2, // これより短く離したら通常攻撃
    lv1: 0.35,
    lv2: 0.9,
  };

  function handleInputs(g) {
    const p = g.player;
    while (pressQ.length) {
      const ev = pressQ.shift();
      if (p.state === 'dead') continue;
      if (g.cadenza) {
        // カデンツァ中は、攻撃ボタン (押した瞬間) でメロディをなぞる。ほかの操作は効かない
        if (ev.kind === 'attack' && ev.down && g.cadenza.phase === 'play') cadenzaPress(g, ev.beat);
        continue;
      }
      if (ev.kind === 'attack') {
        if (ev.down) {
          if (canPress(p)) {
            p.hold = { time: ev.time, beat: ev.beat, jr: judgeAt(ev.beat, true) };
          }
        } else if (p.hold) {
          const held = ev.time - p.hold.time;
          if (p.state === 'charging') {
            releaseCharge(g, p, ev);
          } else if (held < P.tapMax + 0.05) {
            if (canAct(p)) normalAttack(g, p, p.hold.jr, p.hold.beat, ev.time);
            else p.buffered = { jr: p.hold.jr, beat: p.hold.beat, time: ev.time };
          }
          p.hold = null;
        }
      } else if (ev.kind === 'guard') {
        if (ev.down) {
          if (canGuard(p)) {
            p.state = 'guard';
            p.st = 0;
            p.guardBeat = ev.beat;
            p.guardTime = ev.time;
            p.hold = null;
            p.chargeT = 0;
            p.chargeLv = 0;
            p.atk = null;
            p.vx = 0;
          }
        } else if (p.state === 'guard') {
          p.state = 'free';
          p.st = 0;
        }
      }
    }
  }
  // 通常攻撃は振り終わる前に次を出せる (16 分音符の連打)
  function canAct(p) {
    return p.state === 'free' || (p.state === 'attack' && p.st >= p.atk.act1 - 0.01) || p.state === 'guard';
  }
  function canPress(p) {
    return canAct(p) || p.state === 'attack';
  }
  function canGuard(p) {
    return p.state === 'free' || p.state === 'charging' || (p.state === 'attack' && p.st > 0.12);
  }

  function normalAttack(g, p, jr, beat, time) {
    const judge = jr.j;
    // 連打: 前の攻撃から 0.3 秒以内
    const rapid = time - g.lastAtkTime < 0.3;
    g.lastAtkTime = time;
    // メロディに関係ない攻撃が続くと、威力が落ちていく
    let mult = 1;
    if (judge === 0) {
      g.offStreak = rapid ? g.offStreak + 1 : 1;
      mult = Math.max(0.15, 0.55 * Math.pow(0.7, g.offStreak - 1));
      if (g.offStreak >= 2) popText(p.x, p.y - 150, `ノイズ ×${mult.toFixed(1)}`, '#9aa4b0', 16, 0.5, -40);
    } else {
      g.offStreak = 0;
    }
    // 短い音に合わせた一撃は軽い (16 分音符 ≒ 0.45 倍)。連打の総量で長い音とつり合う
    const noteK = jr.note && judge > 0 ? clamp(0.25 + jr.note.d * 0.8, 0.45, 1) : 1;
    p.state = 'attack';
    p.st = 0;
    p.atk = { kind: 'normal', judge, level: 0, hit: new Set(), dur: 0.24, act0: 0.02, act1: 0.1, reach: 118, beat, mult: mult * noteK, rapid, note: jr.note };
    p.recent.push('normal');
    g.stats.attacks++;
    Audio.sfxSwing(false);
    showLaneJudge(judge);
    if (judge > 0) {
      // 合っていれば空振りでも少し光る
      burst(p.x + p.face * 60, p.y - 80, judge * 6, { colors: ['#ffd84a', '#fff4c0'], kind: 'note', min: 40, max: 160, grav: -40, up: 40, smin: 14, smax: 22 });
    }
  }

  function releaseCharge(g, p, ev) {
    const lv = p.chargeLv;
    const jr = judgeAt(ev.beat);
    const judge = jr.j;
    p.chargeT = 0;
    p.chargeLv = 0;
    if (lv === 0) {
      // ためが足りなかったら、ふつうの攻撃
      normalAttack(g, p, jr, ev.beat, ev.time);
      return;
    }
    p.state = 'cattack';
    p.st = 0;
    p.atk = { kind: 'charge', judge, level: lv, hit: new Set(), dur: 0.55, act0: 0.07, act1: 0.24, reach: lv >= 2 ? 175 : 150, beat: ev.beat };
    p.recent.push('charge');
    g.stats.attacks++;
    Audio.sfxSwing(true);
    showLaneJudge(judge);
    // 最大までためて拍に合わせたら、音の波を飛ばす
    if (lv >= 2 && judge >= 1) {
      g.shots.push({ kind: 'wave', x: p.x + p.face * 70, y: p.y - 70, z: p.z, vx: p.face * 720, life: 0.7, judge, hit: new Set(), friendly: true });
    }
    if (judge >= 2 && lv >= 2) {
      g.staffFx.push({ t: 0, max: 1.1, y: p.y - 90, dir: p.face });
      flash(0.35, '#fff3c4');
      g.gold = 1;
    }
  }

  function updatePlayer(g, dt) {
    const p = g.player;
    p.st += dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.glow > 0) p.glow -= dt;
    // ためておいた連打の一撃を、振れるようになったら出す
    if (p.buffered) {
      if (canAct(p) && p.state !== 'guard') {
        const b = p.buffered;
        p.buffered = null;
        normalAttack(g, p, b.jr, b.beat, Audio.now());
      } else if (Audio.now() - p.buffered.time > 0.25 || (p.state !== 'attack' && p.state !== 'free')) p.buffered = null;
    }
    // ため: 押しっぱなしで tapMax を越えたら、ための構えへ
    if (p.hold && p.state !== 'charging' && Audio.now() - p.hold.time >= P.tapMax && canAct(p) && input.attack) {
      p.state = 'charging';
      p.st = 0;
      p.chargeT = Audio.now() - p.hold.time;
      p.chargeLv = 0;
    }
    if (p.state === 'charging') {
      p.chargeT += dt;
      const lv = p.chargeT >= P.lv2 ? 2 : p.chargeT >= P.lv1 ? 1 : 0;
      if (lv > p.chargeLv) {
        p.chargeLv = lv;
        Audio.sfxCharge(lv);
        ring(p.x, p.y - 60, 10, 260, lv >= 2 ? '#ffd84a' : '#8fd3ff', 3, 0.4);
      }
      if (Math.random() < dt * (p.chargeLv >= 2 ? 40 : 15)) {
        const a = rand(0, Math.PI * 2);
        g.parts.push({ x: p.x + Math.cos(a) * 60, y: p.y - 60 + Math.sin(a) * 60, vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, life: 0.45, max: 0.45, color: p.chargeLv >= 2 ? '#ffd84a' : '#8fd3ff', size: 3, kind: 'spark', g: 0 });
      }
      if (!input.attack && !p.hold) {
        p.state = 'free';
        p.chargeLv = 0;
      }
    }

    // 防御ボタンを押したままなら、動けるようになった時点で構える
    if (input.guard && p.state !== 'guard' && p.state !== 'dead' && canGuard(p) && p.state !== 'charging') {
      const s = stamp();
      p.state = 'guard';
      p.st = 0;
      p.guardBeat = s.beat;
      p.guardTime = s.time;
      p.atk = null;
    }
    // 移動: キーは 8 方向、スティックは傾きの強さで速さが変わる
    let ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let az = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (stick.id !== null) {
      ax = stick.ax;
      az = stick.ay;
    }
    const dir = Math.abs(ax) < 0.2 ? 0 : Math.sign(ax);
    let sp = 0;
    if (p.state === 'free') sp = P.speed;
    else if (p.state === 'charging') sp = P.chargeSpeed;
    else if ((p.state === 'attack' || p.state === 'cattack') && !p.onGround) sp = P.speed * 0.6;
    p.vz = 0;
    if (sp > 0) {
      p.vx = clamp(ax, -1, 1) * sp;
      p.vz = clamp(az, -1, 1) * sp * 0.62;
      if (dir !== 0 && p.state === 'free') p.face = dir;
    } else if (p.state === 'hurt' || p.state === 'stagger' || p.state === 'broken') {
      p.vx *= Math.pow(0.02, dt);
    } else if (p.onGround) {
      p.vx = 0;
    }
    // 動いていなければ、近い敵の方を向く
    if (p.state === 'free' && dir === 0) {
      const t = nearestEnemy(g, p.x, 300);
      if (t) p.face = t.x > p.x ? 1 : -1;
    }
    if (p.state === 'charging' && dir !== 0) p.face = dir;

    p.x += p.vx * dt;
    // 奥行き (吹き飛ばされて宙にいる間は変えない)
    const oldZ = p.z;
    if (p.onGround) p.z = clamp(p.z + p.vz * dt, Z_TOP, Z_BOT);
    p.y += p.z - oldZ;
    p.vy += P.grav * dt;
    p.y += p.vy * dt;
    if (p.y >= p.z) {
      if (!p.onGround && p.vy > 300) burst(p.x, p.z, 5, { color: '#c9b79a', up: 20, min: 20, max: 100, life: 0.35, grav: 300 });
      p.y = p.z;
      p.vy = 0;
      p.onGround = true;
    }
    // 画面の端 / 止めている区間
    const minX = g.lock ? g.lock.min + 30 : 30;
    const maxX = g.lock ? g.lock.max - 30 : g.stage === 'street' ? g.roadLen - 30 : W - 30;
    p.x = clamp(p.x, minX, maxX);
    const mv = Math.hypot(p.vx, p.vz || 0);
    if (mv > 10 && p.onGround) p.walkT += (dt * mv) / 40;

    // 攻撃の当たり
    if (p.atk && (p.state === 'attack' || p.state === 'cattack')) {
      const a = p.atk;
      if (p.st >= a.act0 && p.st <= a.act1) {
        for (const e of g.enemies) {
          if (e.dead || a.hit.has(e) || e.state === 'intro') continue;
          const dx = (e.x - p.x) * p.face;
          const big = e.T.boss ? 40 : 0;
          const dzOk = Math.abs(e.z - p.z) < (a.kind === 'charge' ? DZ_HIT + 12 : DZ_HIT) + (e.T.boss ? 14 : 0);
          if (dx > -25 - big && dx < a.reach + big && dzOk && Math.abs(e.y - p.y) < 90) {
            a.hit.add(e);
            playerHits(g, p, e, a);
          }
        }
      }
      if (p.st >= a.dur) {
        p.state = 'free';
        p.st = 0;
        p.atk = null;
      }
    }
    if ((p.state === 'hurt' && p.st > 0.38) || (p.state === 'stagger' && p.st > 0.42) || (p.state === 'broken' && p.st > 0.85)) {
      p.state = 'free';
      p.st = 0;
    }
    if (p.recent.length > 8) p.recent.shift();
  }

  function nearestEnemy(g, x, within) {
    let best = null;
    let bd = within;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - x);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // プレイヤーの攻撃が敵に当たった
  function playerHits(g, p, e, a) {
    const J = JUDGE[a.judge];
    const hx = e.x - e.face * 10;
    const hy = e.y - (e.T.boss ? 110 : 75);
    const guarding = e.state === 'guard';
    const windupCharge = e.act && e.act.kind === 'charge' && e.state === 'windup';
    if (a.kind === 'normal' && guarding) {
      // 防御 > 通常攻撃: はじかれる
      Audio.sfxBlock();
      popText(hx, hy - 20, 'ガード！', '#9fc6ff', 22);
      burst(hx - e.face * 20, hy, 8, { color: '#cfe3ff', min: 60, max: 200, life: 0.3 });
      p.state = 'stagger';
      p.st = 0;
      p.vx = -p.face * 260;
      p.atk = null;
      g.combo = 0;
      // 紳士はすかさず反撃
      if (!e.act && Math.random() < (e.T.boss ? 0.8 : 0.55)) {
        const b = Math.ceil(g.music.beat(offsetMs / 1000) + 0.35);
        startAct(g, e, 'normal', [b]);
        e.guardUntil = -1;
      }
      return;
    }
    let mult = J.mult;
    let label = null;
    let stun = 0;
    let dmg = a.kind === 'normal' ? 12 : a.level >= 2 ? 34 : 24;
    if (a.kind === 'charge' && guarding) {
      // ため攻撃 > 防御: 防御くずし
      label = 'BREAK!';
      stun = e.T.boss ? 1.8 : 1.6;
      dmg *= 1.3;
      e.guardUntil = -1;
      ring(hx, hy, 20, 500, '#ff9a4a', 6, 0.5);
    } else if (a.kind === 'normal' && windupCharge) {
      // 通常攻撃 > ため攻撃: 出かかりをつぶす
      label = 'COUNTER!';
      stun = e.T.boss ? 1.2 : 1.0;
      mult *= 1.4;
      ring(hx, hy, 20, 420, '#ff5a7a', 5, 0.45);
    } else if (e.stun > 0) {
      mult *= 1.2;
    }
    if (a.mult) mult *= a.mult;
    dmg = Math.max(1, Math.round(dmg * mult * (1 + Math.min(g.combo, 50) * 0.01)));
    // 連打中は押し返しを小さく (間合いの外へ飛ばさない)
    damageEnemy(g, e, dmg, a.kind === 'charge' ? 380 : a.rapid ? 30 : 160, p.face);
    if (e.dead) {
      /* 倒れた */
    } else if (stun) {
      e.stun = stun;
      e.state = 'stun';
      e.st = 0;
      e.act = null;
      popText(hx, hy - 40, label, label === 'BREAK!' ? '#ffa24a' : '#ff6f8a', 30, 1.1);
      g.score += 300;
    } else if (!e.T.boss || e.state !== 'windup') {
      // ボスは通常の攻撃ではひるまない
      if (!e.T.boss) {
        e.act = null;
        if (e.state !== 'stun') {
          e.state = 'hurt';
          e.st = 0;
          e.hurtT = a.kind === 'charge' ? 0.5 : a.rapid ? 0.2 : 0.28;
        }
      }
    }
    // 判定ごとの演出
    // 連打中のヒットストップは短く (次の 16 分音符に間に合うように)
    g.hitstop = Math.max(g.hitstop, a.rapid ? 0.015 : J.stop + (a.kind === 'charge' ? 0.04 : 0));
    Audio.sfxHit(a.kind === 'charge' ? 1 : a.rapid ? 0.2 : 0.4);
    popText(hx + rand(-14, 14), hy + rand(-8, 8), String(dmg), a.judge >= 2 ? '#ffd84a' : a.judge === 1 ? '#bfeaff' : '#ffffff', a.rapid ? 22 : a.judge >= 2 ? 34 : 26, a.rapid ? 0.5 : 0.9);
    if (a.judge >= 1) {
      g.combo++;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.stats[a.judge >= 2 ? 'perfect' : 'great']++;
      if (a.rapid && a.note) {
        // 連打は、合わせたメロディの音を 1 オクターブ上で重ねる (指揮棒でメロディを弾く)
        let mp = a.note.p;
        while (mp < 76) mp += 12;
        Audio.sfxChord([mp], a.judge);
      } else musicChord(a.beat, a.judge, a.kind === 'charge' && a.judge >= 2);
    }
    g.score += dmg * 10 * (1 + a.judge);
    if (a.judge >= 2) {
      if (!a.rapid) popText(hx, hy - 70, a.kind === 'charge' ? (a.level >= 2 ? 'FORTISSIMO!!' : 'SFORZANDO!') : pick(['BRAVO!', 'BRAVISSIMO!', 'MAESTRO!']), '#ffd84a', a.kind === 'charge' ? 40 : 32, 1.1, -40);
      burst(hx, hy, a.kind === 'charge' ? 28 : a.rapid ? 7 : 16, { colors: ['#ffd84a', '#fff7d0', '#ff9ad5', '#9fe6ff'], kind: 'note', min: 120, max: 520, smin: 18, smax: 30, life: 1.1, grav: 200 });
      burst(hx, hy, 24, { colors: ['#fff', '#ffd84a'], min: 200, max: 700, life: 0.5 });
      ring(hx, hy, 10, 700, '#ffd84a', 7, 0.5);
      ring(hx, hy, 10, 420, '#fff', 3, 0.6);
      shake(a.kind === 'charge' ? 16 : a.rapid ? 4 : 9);
      flash(a.kind === 'charge' ? 0.35 : 0.18, '#fff6cc');
      g.gold = Math.max(g.gold, a.kind === 'charge' ? 1 : 0.5);
    } else if (a.judge === 1) {
      popText(hx, hy - 64, 'BENE!', '#7fd8ff', 28, 0.9, -40);
      burst(hx, hy, 10, { colors: ['#7fd8ff', '#ffffff'], kind: 'note', min: 100, max: 360, smin: 16, smax: 24, grav: 250 });
      burst(hx, hy, 12, { colors: ['#fff', '#7fd8ff'], min: 150, max: 450, life: 0.4 });
      ring(hx, hy, 10, 500, '#7fd8ff', 5, 0.4);
      shake(a.kind === 'charge' ? 10 : 6);
    } else {
      burst(hx, hy, 8, { color: '#ffffff', min: 100, max: 300, life: 0.3 });
      shake(a.kind === 'charge' ? 6 : 3);
    }
    if (a.kind === 'charge') {
      for (let i = 0; i < (a.judge + 1) * 2; i++) ring(hx, hy, 5 + i * 8, 300 + i * 120, a.judge >= 2 ? '#ffb74a' : '#ffffff', 3, 0.5);
    }
  }

  function damageEnemy(g, e, dmg, kb, dir) {
    e.hp -= dmg;
    e.flash = 0.12;
    if (!e.T.boss) e.vx = kb * (dir || 1);
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      e.deadT = 0;
      e.state = 'dead';
      e.act = null;
      e.vx = e.T.boss ? 0 : dir * 420;
      e.vy = e.T.boss ? 0 : -520;
      g.stats.kills++;
      g.score += e.T.boss ? 20000 : 500;
      burst(e.x, e.y - 70, 26, { colors: ['#ffd84a', '#ffffff', '#ff9ad5'], kind: 'note', min: 100, max: 480, smin: 16, smax: 26, grav: 300 });
      if (!e.T.boss) {
        popText(e.x, e.y - 150, pick(['Oh dear!', 'ぎゃふん', 'Good heavens!', '無念…', 'Blimey!']), '#ffffff', 20, 1.2, -30);
        // 体力の回復 (楽譜が落ちる)
        if (Math.random() < 0.35 || g.player.hp < 40) g.shots.push({ kind: 'heal', x: e.x, y: e.z - 60, z: e.z, vy: -300, vx: rand(-60, 60), life: 12 });
      } else {
        bossDefeated(g, e);
      }
    }
  }

  // ---------- カデンツァ ----------
  function startCadenza(g, target, nowBeat) {
    const m = g.music;
    // 次の拍の次から 1 小節。メロディの音が少なければ 2 小節
    const start = Math.ceil(nowBeat) + 1;
    let end = start + 4;
    let notes = m.melBetween(start, end);
    if (notes.length < 5) {
      end = start + 8;
      notes = m.melBetween(start, end);
    }
    if (notes.length === 0) return;
    const cz = {
      phase: 'play', start, end, from: nowBeat, target, t: 0,
      notes: notes.map((n) => ({ t: n.t, d: n.d, p: n.p, res: null })),
      extra: 0, score: 0, shown: 0,
    };
    g.cadenza = cz;
    // 敵の行動と飛んでいるケーキを、カデンツァが終わるまで後ろへずらす
    const shift = end - nowBeat + 1;
    for (const e of g.enemies) {
      if (!e.act) continue;
      e.act.start += shift;
      e.act.hits = e.act.hits.map((b) => b + shift);
      if (e.act.lastHit) e.act.lastHit += shift;
    }
    for (const s of g.shots) {
      if (s.kind === 'cake' && !s.done) {
        s.start += shift;
        s.end += shift;
      }
    }
    for (const e of g.enemies) if (e.guardUntil > nowBeat) e.guardUntil += shift;
    const p = g.player;
    p.state = 'free';
    p.atk = null;
    p.hold = null;
    p.buffered = null;
    p.chargeLv = 0;
    p.vx = 0;
    g.score += 500;
    popText(p.x, p.y - 200, 'CADENZA!', '#ffd84a', 42, 1.4, -30);
    flash(0.3, '#fff6cc');
  }

  function cadenzaPress(g, beat) {
    const cz = g.cadenza;
    const spb = g.music.spb;
    g.player.conduct = 0.16;
    // 一番近い、まだ打っていない音
    let best = null;
    let bd = 1e9;
    for (const n of cz.notes) {
      if (n.res) continue;
      const d = Math.abs(n.t - beat) * spb;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    const gap = best ? Math.max(0.06, Math.min(0.12, guideGap(cz, best) * spb * 0.5)) : 0;
    if (best && bd <= gap) {
      best.res = bd <= Math.min(0.06, gap * 0.85) ? 'perfect' : 'great';
      let mp = best.p;
      while (mp < 76) mp += 12;
      Audio.sfxChord([mp], best.res === 'perfect' ? 2 : 1);
      cz.hitFx = { t: 0.3, col: best.res === 'perfect' ? '#ffd84a' : '#7fd8ff' };
    } else {
      // ガイドに無い所で打った
      cz.extra++;
      cz.hitFx = { t: 0.3, col: '#ff6a6a' };
      Audio.sfxBlock();
    }
  }
  function guideGap(cz, n) {
    const i = cz.notes.indexOf(n);
    const a = i > 0 ? n.t - cz.notes[i - 1].t : 1;
    const b = i + 1 < cz.notes.length ? cz.notes[i + 1].t - n.t : 1;
    return Math.min(a, b, 1);
  }
  function cadenzaScore(cz) {
    let pts = 0;
    for (const n of cz.notes) pts += n.res === 'perfect' ? 1 : n.res === 'great' ? 0.7 : 0;
    pts -= cz.extra * 0.5;
    return clamp(Math.round((100 * pts) / cz.notes.length), 0, 100);
  }

  function updateCadenza(g, beat, dt) {
    const cz = g.cadenza;
    cz.t += dt;
    if (cz.hitFx) cz.hitFx.t -= dt;
    const spb = g.music.spb;
    if (cz.phase === 'play') {
      // 打たずに過ぎた音はミス
      for (const n of cz.notes) if (!n.res && (beat - n.t) * spb > 0.14) n.res = 'miss';
      if (beat > cz.end + 0.25 || g.music.beat(0) < 0) {
        for (const n of cz.notes) if (!n.res) n.res = 'miss';
        cz.score = cadenzaScore(cz);
        cz.phase = 'result';
        cz.rt = 0;
        finishCadenza(g, cz);
      }
    } else {
      cz.rt += dt;
      if (cz.rt > 1.6) g.cadenza = null;
    }
  }

  function finishCadenza(g, cz) {
    const e = cz.target;
    g.stats.cadenza = (g.stats.cadenza || 0) + 1;
    g.score += cz.score * 60;
    if (cz.score >= CADENZA_PASS && e && !e.dead) {
      // 大ダメージ: 紳士たちは一撃、ボスは 160〜320
      const dmg = e.T.boss ? Math.round(160 + (cz.score - CADENZA_PASS) * 8) : e.hp + 50;
      g.stats.cadenzaPass = (g.stats.cadenzaPass || 0) + 1;
      g.score += 3000;
      damageEnemy(g, e, dmg, 500, e.x > g.player.x ? 1 : -1);
      if (!e.dead) {
        e.state = 'stun';
        e.stun = 1.5;
        e.act = null;
      }
      const hx = e.x;
      const hy = e.y - (e.T.boss ? 130 : 80);
      popText(hx, hy - 40, String(dmg), '#ffd84a', 48, 1.4);
      popText(hx, hy - 100, 'FINALE!!', '#ffd84a', 46, 1.6, -30);
      for (let i = 0; i < 6; i++) ring(hx, hy, 10 + i * 18, 400 + i * 160, i % 2 ? '#ffd84a' : '#ffffff', 6, 0.9);
      burst(hx, hy, 50, { colors: ['#ffd84a', '#fff7d0', '#ff9ad5', '#9fe6ff'], kind: 'note', min: 160, max: 700, smin: 20, smax: 34, life: 1.4, grav: 150 });
      g.staffFx.push({ t: 0, max: 1.2, y: hy, dir: 1 });
      g.staffFx.push({ t: 0, max: 1.2, y: hy + 70, dir: -1 });
      flash(0.6, '#fff6cc');
      shake(22);
      g.gold = 1;
      g.hitstop = 0.15;
      Audio.sfxHit(1);
      musicChord(g.music.beat(offsetMs / 1000), 2, true);
    } else if (e && !e.dead) {
      // 届かなかったら、点数に応じた小さなダメージ
      const dmg = Math.round(cz.score * 0.3);
      if (dmg > 0) {
        damageEnemy(g, e, dmg, 120, e.x > g.player.x ? 1 : -1);
        popText(e.x, e.y - 140, String(dmg), '#ffffff', 26);
      }
    }
  }

  // カデンツァのガイド (画面の中央)
  const CZ_Y = 230;
  const CZ_PX = 150; // 1 拍あたりの幅
  function drawCadenza(g, beat) {
    const cz = g.cadenza;
    const cx = W / 2;
    const fadeIn = clamp(cz.t * 4, 0, 1);
    const fadeOut = cz.phase === 'result' ? clamp((1.6 - cz.rt) * 3, 0, 1) : 1;
    ctx.save();
    // 世界を暗く、時が止まったように
    ctx.globalAlpha = 0.45 * fadeIn * fadeOut;
    ctx.fillStyle = '#0b0820';
    ctx.fillRect(0, -OY, W, H + OY);
    ctx.globalAlpha = fadeIn * fadeOut;
    // 帯
    const bandH = 120;
    const grd = ctx.createLinearGradient(0, CZ_Y - bandH / 2, 0, CZ_Y + bandH / 2);
    grd.addColorStop(0, 'rgba(20,12,40,0)');
    grd.addColorStop(0.2, 'rgba(20,12,40,0.85)');
    grd.addColorStop(0.8, 'rgba(20,12,40,0.85)');
    grd.addColorStop(1, 'rgba(20,12,40,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, CZ_Y - bandH / 2, W, bandH);
    ctx.fillStyle = '#ffd84a';
    ctx.textAlign = 'center';
    ctx.font = `bold italic 22px ${FONT}`;
    ctx.fillText('— Cadenza —', cx, CZ_Y - 66);
    ctx.font = `13px ${SANS}`;
    ctx.fillStyle = '#fff6d8';
    ctx.fillText('メロディをなぞれ！ 音符が線に重なる瞬間に攻撃ボタン', cx, CZ_Y - 46);
    // 五線
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, CZ_Y + i * 8);
      ctx.lineTo(W, CZ_Y + i * 8);
      ctx.stroke();
    }
    // 判定の線 (真ん中より少し左)
    const jx = cx - 160;
    const pulse = g.beatPulse;
    ctx.strokeStyle = `rgba(255,216,74,${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 3 + pulse * 2;
    ctx.beginPath();
    ctx.moveTo(jx, CZ_Y - 30);
    ctx.lineTo(jx, CZ_Y + 30);
    ctx.stroke();
    if (cz.hitFx && cz.hitFx.t > 0) {
      const k = cz.hitFx.t / 0.3;
      ctx.strokeStyle = cz.hitFx.col;
      ctx.globalAlpha = fadeIn * fadeOut * k;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(jx, CZ_Y, 14 + (1 - k) * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fadeIn * fadeOut;
    }
    // 拍の線
    for (let bt = Math.ceil(beat - 2); bt <= cz.end + 1; bt++) {
      const x = jx + (bt - beat) * CZ_PX;
      if (x < -20 || x > W + 20) continue;
      ctx.strokeStyle = bt === cz.start || bt === cz.end ? 'rgba(255,216,74,0.6)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, CZ_Y - 22);
      ctx.lineTo(x, CZ_Y + 22);
      ctx.stroke();
    }
    // 音符
    for (const n of cz.notes) {
      const x = jx + (n.t - beat) * CZ_PX;
      if (x < -30 || x > W + 30) continue;
      const dy = clamp((n.p - 74) * -1.6, -22, 22);
      const r = n.d >= 1 ? 9 : n.d >= 0.5 ? 7.5 : 6;
      const col = n.res === 'perfect' ? '#ffd84a' : n.res === 'great' ? '#7fd8ff' : n.res === 'miss' ? 'rgba(160,160,180,0.45)' : '#ffffff';
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, CZ_Y + dy, r * 1.25, r * 0.9, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + r * 1.15, CZ_Y + dy);
      ctx.lineTo(x + r * 1.15, CZ_Y + dy - 24);
      ctx.stroke();
      if (n.d < 0.5) {
        ctx.beginPath();
        ctx.moveTo(x + r * 1.15, CZ_Y + dy - 24);
        ctx.quadraticCurveTo(x + r * 1.15 + 10, CZ_Y + dy - 16, x + r * 1.15 + 6, CZ_Y + dy - 8);
        ctx.stroke();
      }
      if (n.res === 'perfect' || n.res === 'great') {
        ctx.globalAlpha = fadeIn * fadeOut * clamp(1 - (beat - n.t) * 2, 0, 1);
        ctx.font = `bold 11px ${SANS}`;
        ctx.fillText(n.res === 'perfect' ? 'PERFECT' : 'GREAT', x, CZ_Y + dy + 26);
        ctx.globalAlpha = fadeIn * fadeOut;
      }
    }
    // 進み具合と、今の点数
    const live = cadenzaScore({ notes: cz.notes.map((n) => (n.res ? n : { res: 'perfect' })), extra: cz.extra });
    ctx.font = `bold 14px ${SANS}`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`${cz.notes.filter((n) => n.res).length} / ${cz.notes.length} 音`, W - 30, CZ_Y + 50);
    ctx.textAlign = 'left';
    ctx.fillText(cz.phase === 'play' ? `見込み ${live} 点` : '', 30, CZ_Y + 50);
    // 結果
    if (cz.phase === 'result') {
      const k = clamp(cz.rt * 4, 0, 1);
      const pass = cz.score >= CADENZA_PASS;
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(cx, CZ_Y + 6);
      ctx.scale(0.6 + k * 0.4, 0.6 + k * 0.4);
      ctx.font = `bold 64px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(30,10,20,0.9)';
      ctx.fillStyle = pass ? '#ffd84a' : '#d8d2e8';
      ctx.strokeText(`${cz.score} 点`, 0, 0);
      ctx.fillText(`${cz.score} 点`, 0, 0);
      ctx.font = `bold 22px ${SANS}`;
      ctx.fillStyle = pass ? '#fff6cc' : '#c9c3d8';
      ctx.fillText(pass ? 'BRAVISSIMO! 大ダメージ！' : `あと ${CADENZA_PASS - cz.score} 点… (${CADENZA_PASS} 点で大ダメージ)`, 0, 34);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------- 敵 ----------
  function startAct(g, e, kind, hits, extra = {}) {
    const now = g.music.beat(offsetMs / 1000);
    e.act = { kind, start: now, hits, i: 0, reach: extra.reach || (kind === 'charge' ? e.T.reach + 50 : e.T.reach), ...extra };
    e.state = 'windup';
    e.st = 0;
    e.face = g.player.x > e.x ? 1 : -1;
    if (kind === 'cake') e.state = 'throw';
  }

  // 敵が拍ごとに考える
  function think(g, e, beatInt) {
    const p = g.player;
    if (e.dead || e.act || e.state === 'stun' || e.state === 'hurt' || e.state === 'intro') return;
    if (e.state === 'guard' && beatInt < e.guardUntil) return;
    if (e.state === 'guard') {
      e.state = 'idle';
    }
    if (e.T.boss) return bossThink(g, e, beatInt);
    const dist = Math.abs(p.x - e.x);
    e.face = p.x > e.x ? 1 : -1;
    if (dist > e.T.reach + 10 || Math.abs(p.z - e.z) > DZ_HIT - 8) {
      e.state = 'walk';
      return;
    }
    // 同時に攻撃してくる敵の数を抑える
    const busy = g.enemies.filter((o) => o !== e && !o.dead && o.act).length;
    const maxBusy = g.waveIdx >= 3 || g.no >= 3 ? 2 : 1;
    const w = { ...e.T.w };
    if (busy >= maxBusy) {
      w.normal = 0;
      w.charge = 0;
    }
    // 三すくみ: プレイヤーの様子を見て、勝てる手を選びやすく
    if (p.state === 'charging') w.normal += 5;
    if (p.state === 'guard') w.charge += 4;
    const lastP = p.recent.slice(-3);
    if (lastP.filter((r) => r === 'normal').length >= 2) w.guard += 3;
    const choice = weighted(Object.entries(w));
    const u = g.pulse || 1;
    if (choice === 'normal') startAct(g, e, 'normal', [beatInt + u]);
    else if (choice === 'charge') startAct(g, e, 'charge', [beatInt + 2 * u]);
    else if (choice === 'guard') {
      e.state = 'guard';
      e.st = 0;
      e.guardUntil = beatInt + (Math.random() < 0.5 ? 2 : 3) * u;
    } else e.state = 'idle';
  }

  function bossThink(g, e, beatInt) {
    const p = g.player;
    const dist = Math.abs(p.x - e.x);
    e.face = p.x > e.x ? 1 : -1;
    const ph2 = e.hp < e.maxHp * 0.5;
    const T = e.T;
    const u = g.pulse || 1;
    if (ph2 && e.phase === 1) {
      e.phase = 2;
      say(e, T.phase2, 3);
      flash(0.4, '#ffc8e8');
      if (!g.summoned) {
        g.summoned = true;
        g.enemies.push(makeEnemy(T.summon[0], -40, 1, Z_TOP + 20), makeEnemy(T.summon[1], W + 40, -1, Z_BOT - 20));
      }
      e.state = 'guard';
      e.guardUntil = beatInt + 4 * u;
      return;
    }
    const w = {
      fan: dist < 200 ? 4 : 0,
      combo: dist < 200 ? (ph2 ? 3 : 1.5) : 0,
      spin: dist < 260 ? 2.5 : 0.8,
      cake: dist > 180 ? 4 : 1,
      cakes: ph2 && dist > 160 ? 2 : 0,
      guard: dist < 220 ? 2 : 0,
      walk: dist > 220 ? 2 : 0.3,
      wait: ph2 ? 0.3 : 1,
    };
    if (p.state === 'charging') w.fan += 5;
    if (p.state === 'guard') w.spin += 5;
    if (p.recent.slice(-3).filter((r) => r === 'normal').length >= 2) w.guard += 4;
    if (T.fastCombo) w.combo += 1.5;
    const c = weighted(Object.entries(w));
    // 連続攻撃: 後半 (または速い技を持つボス) は半分の間隔で
    const n = T.comboLen || 3;
    const step = (ph2 || (T.fastCombo && Math.random() < 0.5) ? 0.5 : 1) * u;
    const combo = [];
    for (let i = 0; i < n; i++) combo.push(beatInt + u + i * step);
    if (c === 'fan') startAct(g, e, 'normal', [beatInt + u], { anim: 'fan' });
    else if (c === 'combo') startAct(g, e, 'normal', combo, { anim: 'fan' });
    else if (c === 'spin') startAct(g, e, 'charge', [beatInt + 2 * u], { reach: 230, anim: 'spin' });
    else if (c === 'cake') startAct(g, e, 'cake', [beatInt + 2 * u]);
    else if (c === 'cakes') startAct(g, e, 'cake', [beatInt + 2 * u, beatInt + 3 * u, beatInt + 4 * u]);
    else if (c === 'guard') {
      e.state = 'guard';
      e.st = 0;
      e.guardUntil = beatInt + 2 * u;
    } else if (c === 'walk') e.state = 'walk';
    else e.state = 'idle';
  }

  function updateEnemies(g, dt, beat) {
    const p = g.player;
    for (const e of g.enemies) {
      e.st += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.speechT > 0) e.speechT -= dt;
      if (e.dead) {
        e.deadT += dt;
        e.x += e.vx * dt;
        e.vy += 1500 * dt;
        e.y += e.vy * dt;
        if (e.y > e.z) {
          e.y = e.z;
          e.vy = -e.vy * 0.3;
          e.vx *= 0.6;
        }
        continue;
      }
      if (e.state === 'intro') continue;
      if (e.state === 'stun') {
        e.stun -= dt;
        if (e.stun <= 0) {
          e.state = 'idle';
          e.st = 0;
        }
      }
      if (e.state === 'hurt') {
        e.hurtT -= dt;
        if (e.hurtT <= 0) {
          e.state = 'idle';
          e.st = 0;
        }
      }
      // 行動の進み: 拍の上で当たる
      if (e.act && !g.cadenza) {
        const a = e.act;
        const hb = a.hits[a.i];
        if (a.kind === 'charge' && a.anim === 'spin') e.spinA += dt * (4 + 20 * clamp((beat - a.start) / (hb - a.start), 0, 1));
        if (beat >= hb) {
          resolveEnemyHit(g, e, a);
          a.i++;
          a.lastHit = beat;
          if (a.i >= a.hits.length) {
            e.act = null;
            e.state = 'strike';
            e.st = 0;
          } else {
            e.state = a.kind === 'cake' ? 'throw' : 'windup';
          }
        }
      }
      if (e.state === 'strike' && e.st > (e.T.boss ? 0.45 : 0.35)) {
        e.state = 'idle';
        e.st = 0;
      }
      // 歩く
      let mv = 0;
      let mz = 0;
      if (e.state === 'walk') {
        const dist = Math.abs(p.x - e.x);
        const want = e.T.reach - 15;
        if (dist > want) mv = (p.x > e.x ? 1 : -1) * e.T.speed;
        const dz = p.z - e.z;
        if (Math.abs(dz) > 6) mz = Math.sign(dz) * Math.min(Math.abs(dz) * 4, e.T.speed * 0.7);
        e.face = p.x > e.x ? 1 : -1;
        e.walkT += dt * 6;
      }
      e.z = clamp(e.z + mz * dt, Z_TOP, Z_BOT);
      e.y = e.z;
      e.vx = lerp(e.vx, mv, Math.min(1, dt * (e.state === 'walk' ? 8 : 4)));
      if (e.lunge > 0) {
        e.lunge -= dt;
        e.x += e.face * 520 * dt;
      }
      e.x += e.vx * dt;
      // ほかの敵と重ならない
      for (const o of g.enemies) {
        if (o === e || o.dead) continue;
        const d = e.x - o.x;
        if (Math.abs(d) < 46 && Math.abs(e.z - o.z) < 24) {
          e.x += Math.sign(d || 1) * (46 - Math.abs(d)) * dt * 6;
          e.z = clamp(e.z + Math.sign(e.z - o.z || 1) * 20 * dt, Z_TOP, Z_BOT);
        }
      }
      if (g.lock) e.x = clamp(e.x, g.lock.min - 60, g.lock.max + 60);
      if (g.stage === 'boss') e.x = clamp(e.x, 60, W - 60);
    }
  }

  // 敵の一撃が拍の上で当たる
  function resolveEnemyHit(g, e, a) {
    const p = g.player;
    if (a.kind === 'cake') {
      // ケーキは投げてから 1 拍で落ちる (一投ずつ)
      const flyB = g.pulse || 1;
      const hb = a.hits[a.i];
      g.shots.push({ kind: 'cake', x: e.x + e.face * 40, y: e.y - 150, sx: e.x + e.face * 40, sy: e.y - 150, tx: p.x, tz: p.z, start: hb, end: hb + flyB, owner: e, dmg: e.T.dmgN, reflected: false });
      e.state = 'throw';
      e.st = 0;
      return;
    }
    if (a.kind === 'charge') {
      e.lunge = 0.12;
      if (a.anim === 'spin') e.lunge = 0.22;
    }
    e.state = 'strike';
    e.st = 0;
    const dx = (p.x - e.x) * e.face;
    const dzMax = DZ_HIT + (a.anim === 'spin' ? 26 : a.kind === 'charge' ? 8 : 0);
    const inRange = dx > -30 && dx < a.reach + (a.kind === 'charge' ? 70 : 10) && Math.abs(p.z - e.z) < dzMax && p.z - p.y < 70;
    if (a.kind === 'charge') shake(5);
    if (!inRange || p.state === 'dead') {
      Audio.sfxSwing(a.kind === 'charge');
      return;
    }
    hitPlayer(g, { kind: a.kind === 'charge' ? 'charge' : 'normal', dmg: a.kind === 'charge' ? e.T.dmgC : e.T.dmgN, from: e, beat: a.hits[a.i] });
  }

  // プレイヤーが攻撃を受ける (防御・ジャストガードの判定)
  function hitPlayer(g, h) {
    const p = g.player;
    const e = h.from;
    const facing = e ? (e.x - p.x) * p.face > -15 : true;
    const nowBeat = g.music.beat(offsetMs / 1000);
    const spb = g.music.spb;
    const hx = p.x + p.face * 30;
    const hy = p.y - 70;
    if (p.state === 'guard' && facing) {
      const early = (h.beat - p.guardBeat) * spb; // 何秒前に構えたか
      const just = early <= JUST_WIN && early >= -0.08;
      if (just) {
        // ジャストガード: ダメージなし。通常攻撃なら相手は大きくひるむ。
        // レベルは当たる瞬間とのずれで決まる: Lv3 (完璧) 0.045 秒以内 / Lv2 0.1 秒以内 / Lv1 それより外
        const off = Math.abs(early);
        const lv = off <= JUST_LV3 ? 3 : off <= JUST_LV2 ? 2 : 1;
        const LV = JUST_LEVELS[lv];
        g.stats.just++;
        g.stats['just' + lv] = (g.stats['just' + lv] || 0) + 1;
        g.combo++;
        g.maxCombo = Math.max(g.maxCombo, g.combo);
        g.score += LV.score;
        Audio.sfxJust();
        musicChord(nowBeat, 2, lv >= 2 || h.kind === 'charge');
        popText(hx, hy - 60, LV.label, LV.color, LV.size, 1.1, -40);
        showLaneJudge(2, LV.short);
        ring(hx, hy, 10, 600, LV.color, 4 + lv * 2, 0.5);
        ring(hx, hy, 30, 300, '#ffffff', 3, 0.6);
        if (lv >= 2) ring(hx, hy, 50, 800, '#ffd84a', 3, 0.7);
        burst(hx, hy, 12 + lv * 8, { colors: [LV.color, '#ffffff', '#ffd84a'], kind: 'note', min: 120, max: 360 + lv * 80, smin: 16, smax: 26, grav: 150 });
        flash(0.15 + lv * 0.08, '#d8fbff');
        shake(4 + lv * 3);
        g.hitstop = Math.max(g.hitstop, 0.06 + lv * 0.03);
        const target = e || h.owner;
        if (lv === 3 && target && !target.dead && !g.cadenza && !g.over) startCadenza(g, target, nowBeat);
        p.glow = 0.5;
        p.guardBeat = -99; // 同じ構えで何度もジャストにならないように (続けて来たら構え直す)
        if (e && h.kind !== 'cake') {
          e.act = null;
          e.state = 'stun';
          e.stun = h.kind === 'charge' ? 0.7 : e.T.boss ? 1.1 : 1.3;
          e.st = 0;
          if (!e.T.boss) e.vx = -e.face * 240;
          popText(e.x, e.y - 160, 'ひるみ', '#ffffff', 20);
        }
        return 'just';
      }
      if (h.kind === 'charge') {
        // ため攻撃 > 防御: 防御がくずれる
        const dmg = Math.round(h.dmg * 0.6);
        p.hp -= dmg;
        g.stats.dmgTaken += dmg;
        p.state = 'broken';
        p.st = 0;
        p.vx = -p.face * 380;
        g.combo = 0;
        Audio.sfxHurt();
        popText(hx, hy - 40, 'GUARD BREAK', '#ff7a5a', 28, 1.0);
        popText(hx, hy, String(dmg), '#ff6060', 24);
        ring(hx, hy, 10, 400, '#ff7a5a', 5, 0.45);
        shake(10);
        flash(0.2, '#ff8060');
        checkDeath(g);
        return 'broken';
      }
      // 防御 > 通常攻撃
      Audio.sfxBlock();
      popText(hx, hy - 30, 'ガード', '#9fc6ff', 20, 0.6);
      burst(hx, hy, 8, { color: '#cfe3ff', min: 60, max: 220, life: 0.3 });
      p.vx = -p.face * 140;
      return 'block';
    }
    if (p.inv > 0) return 'inv';
    const dmg = h.dmg;
    p.hp -= dmg;
    g.stats.dmgTaken += dmg;
    p.state = 'hurt';
    p.st = 0;
    p.atk = null;
    p.hold = null;
    p.chargeLv = 0;
    p.chargeT = 0;
    p.inv = 0.5;
    p.vx = (e ? Math.sign(p.x - e.x) || 1 : -p.face) * (h.kind === 'charge' ? 420 : 240);
    if (h.kind === 'charge') {
      p.vy = -360;
      p.onGround = false;
    }
    g.combo = 0;
    Audio.sfxHurt();
    popText(p.x, p.y - 140, String(dmg), '#ff6060', 28);
    burst(p.x, p.y - 70, 12, { color: '#ff8a8a', min: 80, max: 300, life: 0.4 });
    shake(h.kind === 'charge' ? 12 : 7);
    flash(0.22, '#ff4040');
    checkDeath(g);
    return 'hit';
  }

  function checkDeath(g) {
    const p = g.player;
    if (p.hp <= 0 && p.state !== 'dead') {
      p.hp = 0;
      p.state = 'dead';
      p.st = 0;
      g.over = { kind: 'fail', t: 0 };
      g.music.stop(2);
      g.slowmo = 1.2;
    }
  }

  // ---------- 飛ぶもの ----------
  function updateShots(g, dt, beat) {
    const p = g.player;
    for (const s of g.shots) {
      if (s.kind === 'wave') {
        s.x += s.vx * dt;
        s.life -= dt;
        for (const e of g.enemies) {
          if (e.dead || s.hit.has(e) || e.state === 'intro') continue;
          if (Math.abs(e.x - s.x) < (e.T.boss ? 70 : 40) && Math.abs(e.z - s.z) < DZ_HIT + 20) {
            s.hit.add(e);
            const guarding = e.state === 'guard';
            const dmg = Math.round((guarding ? 26 : 20) * JUDGE[s.judge].mult);
            damageEnemy(g, e, dmg, 300, Math.sign(s.vx));
            if (guarding && !e.dead) {
              e.state = 'stun';
              e.stun = 1.2;
              e.act = null;
              e.guardUntil = -1;
              popText(e.x, e.y - 170, 'BREAK!', '#ffa24a', 26);
            }
            popText(e.x, e.y - 130, String(dmg), '#ffd84a', 28);
            burst(e.x, e.y - 80, 12, { colors: ['#ffd84a', '#fff'], kind: 'note', smin: 16, smax: 24 });
            Audio.sfxHit(0.7);
          }
        }
      } else if (s.kind === 'cake') {
        const t = clamp((beat - s.start) / (s.end - s.start), 0, 1);
        if (!s.reflected) {
          s.x = lerp(s.sx, s.tx, t);
          s.y = lerp(s.sy, s.tz - 60, t) - Math.sin(t * Math.PI) * 140;
          s.rot = (s.rot || 0) + dt * 8;
          if (beat >= s.end && !s.done) {
            s.done = true;
            const near = Math.abs(p.x - s.x) < 60 && Math.abs(p.z - s.tz) < DZ_HIT && p.z - p.y < 60;
            if (near) {
              const r = hitPlayer(g, { kind: 'cake', dmg: s.dmg, from: null, owner: s.owner, beat: s.end });
              if (r === 'just' && s.owner && !s.owner.dead) {
                // ジャストガードでケーキを打ち返す
                s.reflected = true;
                s.rx = s.x;
                s.ry = s.y;
                s.rt = 0;
                popText(p.x, p.y - 190, '打ち返し！', '#ffd84a', 26);
                continue;
              }
              if (r === 'hit') burst(p.x, p.y - 60, 16, { colors: SHOT_COLORS[s.owner.T.shot] || SHOT_COLORS.cake, min: 80, max: 300 });
            } else {
              burst(s.x, s.tz - 10, 14, { colors: SHOT_COLORS[s.owner.T.shot] || SHOT_COLORS.cake, min: 60, max: 260, up: 160 });
              if (s.owner.T.shot === 'cannon') shake(6);
            }
            s.dead = true;
          }
        } else {
          s.rt += dt * 2.2;
          const o = s.owner;
          s.x = lerp(s.rx, o.x, s.rt);
          s.y = lerp(s.ry, o.y - 120, s.rt) - Math.sin(s.rt * Math.PI) * 80;
          s.rot += dt * 14;
          if (s.rt >= 1) {
            s.dead = true;
            if (!o.dead) {
              damageEnemy(g, o, 45, 0, 1);
              o.state = 'stun';
              o.stun = 1.4;
              o.act = null;
              popText(o.x, o.y - 220, o.T.reflect || '跳ね返った！', '#ffc3dc', 28, 1.2);
              burst(o.x, o.y - 120, 30, { colors: ['#ffc3dc', '#fff', '#ff6f91', '#ffd84a'], min: 100, max: 400 });
              shake(10);
              g.score += 1500;
            }
          }
        }
      } else if (s.kind === 'heal') {
        s.vy += 1200 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y > s.z - 14) {
          s.y = s.z - 14;
          s.vy = 0;
          s.vx = 0;
        }
        s.life -= dt;
        if (Math.abs(p.x - s.x) < 40 && Math.abs(p.z - s.z) < 30 && p.z - p.y < 60) {
          s.dead = true;
          p.hp = Math.min(p.maxHp, p.hp + 18);
          popText(p.x, p.y - 150, '+18', '#7dffa0', 24);
          burst(p.x, p.y - 60, 10, { colors: ['#7dffa0', '#fff'], kind: 'note', smin: 14, smax: 20, grav: -100 });
          Audio.sfxCharge(2);
        }
      }
      if (s.life !== undefined && s.life <= 0) s.dead = true;
    }
    g.shots = g.shots.filter((s) => !s.dead);
  }

  // ---------- 道中の流れ ----------
  function updateWaves(g, dt) {
    if (g.stage !== 'street') return;
    const p = g.player;
    const WAVES = g.def.road.waves;
    if (!g.wave && g.waveIdx < WAVES.length && p.x >= WAVES[g.waveIdx].x) {
      const wv = WAVES[g.waveIdx];
      g.wave = { def: wv, queue: [...wv.list], spawnT: 0.2 };
      const left = wv.x - 420;
      g.lock = { min: left, max: left + W };
      if (wv.hint) {
        g.hint = wv.hint;
        g.hintT = 7;
      }
    }
    if (g.wave) {
      const alive = g.enemies.filter((e) => !e.dead).length;
      g.wave.spawnT -= dt;
      if (g.wave.queue.length && alive < 3 && g.wave.spawnT <= 0) {
        const type = g.wave.queue.shift();
        const fromLeft = g.waveIdx >= 2 && Math.random() < 0.35;
        const e = makeEnemy(type, fromLeft ? g.lock.min - 40 : g.lock.max + 40, fromLeft ? 1 : -1);
        g.enemies.push(e);
        if (Math.random() < 0.6) say(e, pick(e.T.lines), 1.8);
        g.wave.spawnT = 1.2;
      }
      if (!g.wave.queue.length && alive === 0) {
        g.wave = null;
        g.lock = null;
        g.waveIdx++;
        g.goSign = 3;
        g.score += 1000;
        popText(p.x, p.y - 180, 'WAVE CLEAR', '#ffffff', 28, 1.2);
      }
    }
    // 倒れた敵を片づける
    g.enemies = g.enemies.filter((e) => !e.dead || e.deadT < 2.5);
    // 道の終わり: ヴェルサイユへ
    if (!g.wave && g.waveIdx >= WAVES.length && p.x > g.roadLen - 220 && !g.trans) {
      g.trans = { t: 0 };
      g.music.stop(1.2);
      stageTrack.clear({ score: g.score });
    }
  }

  function bossDefeated(g, e) {
    say(e, e.T.defeat, 4);
    g.over = { kind: 'clear', t: 0 };
    g.slowmo = 2.5;
    g.music.stop(3);
    flash(0.8, '#ffffff');
    shake(20);
    for (let i = 0; i < 6; i++) ring(e.x, e.y - 120, 10 + i * 20, 300 + i * 150, i % 2 ? '#ffd84a' : '#ff9ad5', 5, 1.2);
    // 最後の和音
    Audio.sfxChord([48, 60, 64, 67, 72, 76, 79, 84], 2);
  }

  // ---------- 1 コマ ----------
  function update(dt) {
    const g = game;
    g.time += dt;
    if (g.music) g.music.update();
    const beat = g.music ? g.music.beat(offsetMs / 1000) : 0;

    // 拍の頭
    const bi = Math.floor(beat);
    if (bi > g.lastBeatInt && beat >= 0) {
      g.lastBeatInt = bi;
      g.beatPulse = 1;
      if (g.music && Math.abs(bi % g.music.song.beatsPerBar) < 1e-6) g.downPulse = 1;
      if (!g.trans && !g.over && !g.cadenza && bi % (g.pulse || 1) === 0) {
        for (const e of g.enemies) think(g, e, bi);
      }
    }
    g.beatPulse = Math.max(0, g.beatPulse - dt * 3.5);
    g.downPulse = Math.max(0, g.downPulse - dt * 2);
    g.gold = Math.max(0, g.gold - dt * 1.2);

    // ボスの登場
    if (g.stage === 'boss' && g.bossIntro && beat >= 8 * (g.pulse || 1)) {
      g.bossIntro = 0;
      g.boss.state = 'idle';
      g.hint = g.boss.T.hint;
      g.hintT = 6;
    }

    let edt = dt;
    if (g.hitstop > 0) {
      g.hitstop -= dt;
      edt = dt * 0.05;
    }
    if (g.slowmo > 0) {
      g.slowmo -= dt;
      edt *= 0.35;
    }
    if (!g.trans) {
      handleInputs(g);
      if (g.cadenza) {
        // カデンツァ: 敵と飛ぶものはスロー (行動はずらしてあるので当たらない)。ベートーヴェンは指揮だけ
        updateCadenza(g, beat, dt);
        const pl = g.player;
        pl.st += dt;
        if (pl.conduct > 0) pl.conduct -= dt;
        pl.vx = 0;
        updateEnemies(g, edt * 0.12, beat);
        updateShots(g, edt * 0.12, beat);
      } else {
        updatePlayer(g, edt);
        updateEnemies(g, edt, beat);
        updateShots(g, edt, beat);
      }
      updateWaves(g, dt);
    } else pressQ.length = 0;

    // カメラ
    const p = g.player;
    if (g.stage === 'street') {
      let target = p.x - 380;
      if (g.lock) target = g.lock.min;
      target = clamp(target, 0, g.roadLen - W);
      g.camX = lerp(g.camX, target, Math.min(1, dt * 6));
    } else g.camX = 0;

    // 演出の更新
    for (const q of g.parts) {
      q.life -= dt;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.pow(0.3, dt);
    }
    g.parts = g.parts.filter((q) => q.life > 0);
    if (g.parts.length > 700) g.parts.splice(0, g.parts.length - 700);
    for (const r of g.rings) {
      r.life -= dt;
      r.r += r.vr * dt;
    }
    g.rings = g.rings.filter((r) => r.life > 0);
    for (const t of g.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
    }
    g.texts = g.texts.filter((t) => t.life > 0);
    for (const s of g.staffFx) s.t += dt;
    g.staffFx = g.staffFx.filter((s) => s.t < s.max);
    g.shake = Math.max(0, g.shake - dt * 40);
    g.flash = Math.max(0, g.flash - dt * 2.5);
    if (g.hintT > 0) g.hintT -= dt;
    if (g.goSign > 0) g.goSign -= dt;
    if (g.laneJudge) {
      g.laneJudge.t -= dt;
      if (g.laneJudge.t <= 0) g.laneJudge = null;
    }

    // 場面の切りかえ
    if (g.trans) {
      g.trans.t += dt;
      if (g.trans.t > 1.4 && !g.trans.switched) {
        g.trans.switched = true;
        startBoss(g);
      }
      if (g.trans.t > 3.6) g.trans = null;
    }
    if (g.over) {
      g.over.t += dt;
      if (g.over.t > (g.over.kind === 'clear' ? 4.5 : 2.6)) finish(g);
    }
  }

  function finish(g) {
    const s = g.stats;
    const rate = s.attacks ? (s.perfect + s.great * 0.6) / s.attacks : 0;
    let rank = 'C';
    if (g.over.kind === 'clear') {
      if (rate >= 0.55 && s.dmgTaken <= 80 && !g.fromBoss) rank = 'S';
      else if (rate >= 0.4) rank = 'A';
      else if (rate >= 0.2) rank = 'B';
    } else rank = '-';
    if (g.over.kind === 'clear') {
      g.score += Math.max(0, 100 - s.dmgTaken) * 100 + g.player.hp * 50;
      stageTrack.clear({ score: g.score, rank });
    } else {
      stageTrack.fail({ score: g.score, at: g.stage });
    }
    result = { kind: g.over.kind, no: g.no, score: g.score, rank, stats: { ...s }, maxCombo: g.maxCombo, stage: g.stage, rate, newBest: false };
    if (g.over.kind === 'clear') {
      const pb = progress.best[g.no];
      if (!pb || g.score > pb.score) {
        progress.best[g.no] = { score: g.score, rank };
        result.newBest = true;
      }
      progress.open = Math.max(progress.open, Math.min(STAGES.length, g.no + 1));
      if (g.no === STAGES.length) progress.allClear = true;
      store.set('bb-progress', progress);
    }
    scene = 'result';
  }

  // ---------- 場面の操作 ----------
  function startGame(no, fromBoss) {
    Audio.init();
    Audio.resume();
    pressQ.length = 0;
    selNo = no;
    game = null;
    game = newGame(no, fromBoss);
    scene = 'play';
    if (fromBoss) {
      startBoss(game);
    } else {
      startStreet(game);
      if (no === 1) {
        game.hint = touchMode ? '左側をなぞってスティックで移動（奥・手前にも動ける）。曲をよく聴いて戦おう' : '矢印キーで上下左右（奥・手前）に移動。曲をよく聴いて戦おう';
        game.hintT = 6;
      }
    }
  }
  let selNo = 1; // ステージ選びで選んでいるステージ
  function pauseGame() {
    if (scene !== 'play' || !game) return;
    scene = 'pause';
    if (game.music) game.music.pause();
    for (const k of Object.keys(input)) input[k] = false;
    pressQ.length = 0;
    game.player.hold = null;
  }
  function resumeGame() {
    if (scene !== 'pause') return;
    scene = 'play';
    if (game.music) game.music.resume();
    pressQ.length = 0;
  }
  function toTitle() {
    if (game && game.music) game.music.stop(0.4);
    if (scene === 'pause' || scene === 'play') stageTrack.quit();
    game = null;
    scene = 'title';
  }
  function toSelect() {
    if (game && game.music) game.music.stop(0.4);
    if (scene === 'pause' || scene === 'play') stageTrack.quit();
    game = null;
    selNo = Math.min(selNo, progress.open);
    scene = 'select';
  }

  function onKey(code) {
    if (scene === 'title') {
      if (code === 'Enter' || code === 'KeyJ' || code === 'KeyZ' || code === 'Space') toSelect();
      else if (code === 'BracketLeft' || code === 'Minus') setOffset(offsetMs - 10);
      else if (code === 'BracketRight' || code === 'Equal') setOffset(offsetMs + 10);
    } else if (scene === 'play') {
      if (code === 'Escape' || code === 'KeyP') pauseGame();
    } else if (scene === 'select') {
      if (code === 'ArrowUp' || code === 'KeyW' || code === 'ArrowLeft' || code === 'KeyA') selNo = Math.max(1, selNo - 1);
      else if (code === 'ArrowDown' || code === 'KeyS' || code === 'ArrowRight' || code === 'KeyD') selNo = Math.min(progress.open, selNo + 1);
      else if (code === 'Enter' || code === 'KeyJ' || code === 'KeyZ' || code === 'Space') startGame(selNo, false);
      else if (code === 'KeyB' && (progress.best[selNo] || selNo < progress.open)) startGame(selNo, true);
      else if (code === 'Escape') toTitle();
    } else if (scene === 'pause') {
      if (code === 'Escape' || code === 'KeyP' || code === 'Enter') resumeGame();
      else if (code === 'KeyQ') toSelect();
    } else if (scene === 'result') {
      const next = result.kind === 'clear' && result.no < STAGES.length;
      if (code === 'Enter') next ? startGame(result.no + 1, false) : startGame(result.no, false);
      else if (code === 'KeyN' && next) startGame(result.no + 1, false);
      else if (code === 'KeyR') startGame(result.no, false);
      else if (code === 'KeyB' && result.stage === 'boss') startGame(result.no, true);
      else if (code === 'Escape' || code === 'KeyT') toSelect();
    }
  }
  function setOffset(v) {
    offsetMs = clamp(Math.round(v), -200, 200);
    store.set('bb-offset', offsetMs);
  }

  // タップ・クリックで押せる場所 (場面ごとに描くときに登録する)
  let hotspots = [];
  function onTap(p) {
    for (const h of hotspots) {
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
        h.fn();
        return;
      }
    }
  }
  let hotDX = 0; // タイトルを真ん中に寄せて描くときのずれ
  function button(x, y, w, h, label, fn, opts = {}) {
    hotspots.push({ x: x + hotDX, y, w, h, fn });
    ctx.save();
    rr(x, y, w, h, 10);
    ctx.fillStyle = opts.fill || 'rgba(255,248,230,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = opts.stroke || '#b8902f';
    ctx.stroke();
    ctx.fillStyle = opts.color || '#3a2a10';
    ctx.font = `bold ${opts.size || 20}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  // =====================================================================
  // 描く
  // =====================================================================
  const FONT = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  const SANS = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", sans-serif';

  // ---------- 背景: ウィーンの夕暮れの街 ----------
  const town = (() => {
    const r = seeded(1770);
    const far = [];
    for (let x = -200; x < MAX_LEN * 0.3 + 2400; x += 70 + r() * 90) far.push({ x, w: 60 + r() * 80, h: 60 + r() * 90, dome: r() < 0.25, spire: r() < 0.12 });
    const mid = [];
    const cols = ['#e9d3a8', '#d8b88a', '#f0dcc0', '#cfa98a', '#e6c7a8', '#d9c2a0', '#c9b08e'];
    for (let x = -100; x < MAX_LEN * 0.6 + 2400; ) {
      const w = 150 + Math.floor(r() * 4) * 30;
      mid.push({ x, w, h: 170 + r() * 110, col: pick.call(null, cols), floors: 3 + Math.floor(r() * 2), roof: r() < 0.5 ? 'mansard' : 'gable', seed: r() });
      x += w + 6;
    }
    return { far, mid };
  })();

  function drawStreetBg(g, beatPulse, downPulse) {
    const cam = g ? g.camX : (titleT * 40) % 2000;
    // 空
    const sky = ctx.createLinearGradient(0, -OY, 0, HORIZON);
    sky.addColorStop(0, '#1d1b3d');
    sky.addColorStop(0.55, '#5b3b6b');
    sky.addColorStop(0.85, '#e0866a');
    sky.addColorStop(1, '#f4c27a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, -OY, W, HORIZON + OY);
    // 月と星
    ctx.fillStyle = 'rgba(255,250,230,0.9)';
    ctx.beginPath();
    ctx.arc(780 - cam * 0.03, 90, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5b3b6b';
    ctx.beginPath();
    ctx.arc(796 - cam * 0.03, 82, 30, 0, Math.PI * 2);
    ctx.globalAlpha = 0.0;
    ctx.fill();
    ctx.globalAlpha = 1;
    const sr = seeded(9);
    for (let i = 0; i < 50; i++) {
      const sx = ((sr() * 1400 - cam * 0.05) % 1400 + 1400) % 1400 - 200;
      const sy = sr() * 200;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + sr() * 0.5 + beatPulse * 0.2})`;
      ctx.fillRect(sx, sy, 2, 2);
    }
    // 遠くの屋根 (シュテファン大聖堂のような尖塔・丸屋根)
    ctx.fillStyle = '#3b2c4f';
    const fo = cam * 0.3;
    for (const b of town.far) {
      const x = b.x - fo;
      if (x > W + 100 || x + b.w < -100) continue;
      const top = HORIZON - 120 - b.h;
      ctx.fillRect(x, top, b.w, b.h + 130);
      if (b.dome) {
        ctx.beginPath();
        ctx.ellipse(x + b.w / 2, top, b.w * 0.35, b.w * 0.35, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(x + b.w / 2 - 2, top - b.w * 0.35 - 22, 4, 24);
      }
      if (b.spire) {
        ctx.beginPath();
        ctx.moveTo(x + b.w * 0.2, top);
        ctx.lineTo(x + b.w / 2, top - 160);
        ctx.lineTo(x + b.w * 0.8, top);
        ctx.fill();
      }
    }
    // 街並み
    const mo = cam * 0.6;
    for (const b of town.mid) {
      const x = b.x - mo;
      if (x > W + 20 || x + b.w < -20) continue;
      const top = HORIZON - 40 - b.h;
      ctx.fillStyle = b.col;
      ctx.fillRect(x, top, b.w, b.h + 40);
      // 夕日の当たり
      ctx.fillStyle = 'rgba(80,40,90,0.35)';
      ctx.fillRect(x, top, b.w, b.h + 40);
      // 屋根
      ctx.fillStyle = '#4a3d5c';
      ctx.beginPath();
      if (b.roof === 'mansard') {
        ctx.moveTo(x - 6, top);
        ctx.lineTo(x + 14, top - 34);
        ctx.lineTo(x + b.w - 14, top - 34);
        ctx.lineTo(x + b.w + 6, top);
      } else {
        ctx.moveTo(x - 6, top);
        ctx.lineTo(x + b.w / 2, top - 46);
        ctx.lineTo(x + b.w + 6, top);
      }
      ctx.fill();
      // 軒の線
      ctx.fillStyle = 'rgba(255,240,210,0.25)';
      ctx.fillRect(x - 4, top - 2, b.w + 8, 5);
      // 窓 (拍で明るくなる)
      const fh = b.h / b.floors;
      const nw = Math.floor(b.w / 40);
      for (let f = 0; f < b.floors; f++) {
        for (let i = 0; i < nw; i++) {
          const wx = x + 14 + i * ((b.w - 28) / nw) + 4;
          const wy = top + 16 + f * fh;
          const lit = ((i * 7 + f * 3 + Math.floor(b.seed * 100)) % 5) < 2;
          ctx.fillStyle = lit ? `rgba(255,${200 + downPulse * 40},${110 + beatPulse * 60},${0.75 + beatPulse * 0.25})` : 'rgba(40,30,60,0.75)';
          rr(wx, wy, 20, fh * 0.55, 8);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(wx - 3, wy + fh * 0.55, 26, 3);
        }
      }
    }
    // 道
    const road = ctx.createLinearGradient(0, HORIZON - 40, 0, H);
    road.addColorStop(0, '#6b5a66');
    road.addColorStop(1, '#3a2f3c');
    ctx.fillStyle = road;
    ctx.fillRect(0, HORIZON - 6, W, H - HORIZON + 6);
    // 石畳
    ctx.strokeStyle = 'rgba(30,20,30,0.35)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 9; row++) {
      const y = HORIZON + row * (14 + row * 1.6);
      const s = 40 + row * 9;
      const off = -((cam * (1 + row * 0.05)) % s) + (row % 2) * s * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      for (let x = off; x < W; x += s) {
        ctx.moveTo(x, y);
        ctx.lineTo(x - row * 3, y + 14 + row * 1.6);
      }
      ctx.stroke();
    }
    // 街灯 (拍で光る)
    for (let lx = Math.floor(cam / 420) * 420 - 420; lx < cam + W + 420; lx += 420) {
      const x = lx + 200 - cam;
      ctx.fillStyle = '#20181f';
      ctx.fillRect(x - 3, HORIZON + 14 - 190, 6, 190);
      ctx.fillRect(x - 10, HORIZON + 6, 20, 8);
      ctx.beginPath();
      ctx.moveTo(x - 14, HORIZON + 14 - 190);
      ctx.lineTo(x + 14, HORIZON + 14 - 190);
      ctx.lineTo(x + 9, HORIZON + 14 - 222);
      ctx.lineTo(x - 9, HORIZON + 14 - 222);
      ctx.fill();
      const glow = 0.5 + beatPulse * 0.5 + downPulse * 0.3;
      const rg = ctx.createRadialGradient(x, HORIZON + 14 - 205, 2, x, HORIZON + 14 - 205, 60 + beatPulse * 30);
      rg.addColorStop(0, `rgba(255,230,150,${0.9 * glow})`);
      rg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - 100, HORIZON + 14 - 300, 200, 200);
      ctx.fillStyle = `rgba(255,236,170,${0.7 + beatPulse * 0.3})`;
      ctx.fillRect(x - 8, HORIZON + 14 - 218, 16, 24);
      // 地面の光
      ctx.fillStyle = `rgba(255,220,140,${0.06 + beatPulse * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(x, HORIZON + 40, 110, 26, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 背景: ヴェルサイユ宮殿 鏡の間 ----------
  function drawPalaceBg(g, beatPulse, downPulse) {
    const wall = ctx.createLinearGradient(0, 0, 0, HORIZON);
    wall.addColorStop(0, '#5a3f2a');
    wall.addColorStop(0.3, '#c9a865');
    wall.addColorStop(1, '#f0dfb0');
    ctx.fillStyle = wall;
    ctx.fillRect(0, -OY, W, HORIZON + OY);
    // 天井画の帯
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(0, -OY, W, 60 + OY);
    const nArch = Math.ceil(W / 160) + 1;
    for (let i = 0; i < nArch; i++) {
      ctx.fillStyle = i % 2 ? '#8fa3c8' : '#d9b4a0';
      rr(20 + i * 160, 8, 140, 44, 20);
      ctx.fill();
      ctx.strokeStyle = '#e9c66a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 鏡のアーチ
    for (let i = 0; i < nArch; i++) {
      const x = 40 + i * 160;
      ctx.fillStyle = '#e8c35a';
      rr(x - 8, 74, 116, 244, 50);
      ctx.fill();
      const mg = ctx.createLinearGradient(x, 82, x + 100, 310);
      mg.addColorStop(0, '#d6e4ef');
      mg.addColorStop(0.5, `rgba(${170 + beatPulse * 60},${190 + beatPulse * 40},210,1)`);
      mg.addColorStop(1, '#9fb3c4');
      ctx.fillStyle = mg;
      rr(x, 82, 100, 228, 46);
      ctx.fill();
      // 鏡の格子
      ctx.strokeStyle = 'rgba(200,160,70,0.8)';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x, 82 + k * 57);
        ctx.lineTo(x + 100, 82 + k * 57);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x + 50, 82);
      ctx.lineTo(x + 50, 310);
      ctx.stroke();
      // 映りこみの光
      ctx.fillStyle = `rgba(255,255,255,${0.15 + beatPulse * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(x + 15 + ((g ? g.time : titleT) * 30) % 80, 92);
      ctx.lineTo(x + 30 + ((g ? g.time : titleT) * 30) % 80, 92);
      ctx.lineTo(x + 5 + ((g ? g.time : titleT) * 30) % 80, 300);
      ctx.lineTo(x - 10 + ((g ? g.time : titleT) * 30) % 80, 300);
      ctx.closePath();
      ctx.save();
      rr(x, 82, 100, 228, 46);
      ctx.clip();
      ctx.fill();
      ctx.restore();
      // 柱
      ctx.fillStyle = '#b98a4a';
      ctx.fillRect(x + 118, 80, 26, HORIZON - 80);
      ctx.fillStyle = '#e8c35a';
      ctx.fillRect(x + 114, 80, 34, 14);
    }
    // シャンデリア (拍でゆれて輝く)
    const t = g ? g.time : titleT;
    for (let i = 0; i < Math.ceil((W - 20) / 310); i++) {
      const cx = 170 + i * 310;
      const sw = Math.sin(t * 2 + i) * 4;
      ctx.strokeStyle = '#d9b54a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + sw, 70);
      ctx.stroke();
      ctx.save();
      ctx.translate(cx + sw, 70);
      ctx.fillStyle = '#e8c35a';
      ctx.beginPath();
      ctx.ellipse(0, 20, 60, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 4, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = -4; k <= 4; k++) {
        ctx.fillStyle = 'rgba(230,240,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(k * 13, 30);
        ctx.lineTo(k * 13 - 4, 44);
        ctx.lineTo(k * 13, 54);
        ctx.lineTo(k * 13 + 4, 44);
        ctx.fill();
        ctx.fillStyle = `rgba(255,240,180,${0.7 + beatPulse * 0.3})`;
        ctx.beginPath();
        ctx.arc(k * 13, 10, 3 + beatPulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      const rg = ctx.createRadialGradient(0, 20, 5, 0, 20, 120 + downPulse * 40);
      rg.addColorStop(0, `rgba(255,240,190,${0.35 + beatPulse * 0.3})`);
      rg.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(-160, -100, 320, 280);
      ctx.restore();
    }
    // 床 (寄木)
    const fl = ctx.createLinearGradient(0, HORIZON, 0, H);
    fl.addColorStop(0, '#8a5a30');
    fl.addColorStop(1, '#4a2c16');
    ctx.fillStyle = fl;
    ctx.fillRect(0, HORIZON - 6, W, H - HORIZON + 6);
    ctx.strokeStyle = 'rgba(255,220,160,0.18)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 9; row++) {
      const y = HORIZON + row * (14 + row * 1.6);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      for (let x = (row % 2) * 40; x < W; x += 80) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10, y + 14 + row * 1.6);
      }
      ctx.stroke();
    }
    // 赤じゅうたん
    ctx.fillStyle = 'rgba(150,20,40,0.55)';
    ctx.fillRect(0, HORIZON + 62, W, 64);
    ctx.fillStyle = 'rgba(230,190,80,0.6)';
    ctx.fillRect(0, HORIZON + 62, W, 3);
    ctx.fillRect(0, HORIZON + 123, W, 3);
  }

  // ---------- 背景の振り分け ----------
  function drawBg(key, g, bp, dp) {
    const f = BGS[key] || drawStreetBg;
    f(g, bp, dp);
  }
  function bgCam(g) {
    return g ? g.camX : (titleT * 40) % 2000;
  }
  function bgTime(g) {
    return g ? g.time : titleT;
  }
  // 床: 奥ほど細かい横の目地
  function drawFloor(top, bottom, line, cam, step = 60) {
    const fl = ctx.createLinearGradient(0, HORIZON, 0, H);
    fl.addColorStop(0, top);
    fl.addColorStop(1, bottom);
    ctx.fillStyle = fl;
    ctx.fillRect(0, HORIZON - 6, W, H - HORIZON + 6);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    for (let row = 0; row < 9; row++) {
      const y = HORIZON + row * (14 + row * 1.6);
      const s = step * (0.7 + row * 0.15);
      const off = -((cam * (1 + row * 0.05)) % s) + (row % 2) * s * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      for (let x = off; x < W; x += s) {
        ctx.moveTo(x, y);
        ctx.lineTo(x - row * 3, y + 14 + row * 1.6);
      }
      ctx.stroke();
    }
  }
  function skyGrad(stops) {
    const sky = ctx.createLinearGradient(0, -OY, 0, HORIZON);
    stops.forEach(([o, c]) => sky.addColorStop(o, c));
    ctx.fillStyle = sky;
    ctx.fillRect(0, -OY, W, HORIZON + OY);
  }
  function repeatX(cam, par, period, fn) {
    const off = cam * par;
    for (let i = Math.floor((off - 200) / period); i * period - off < W + 200; i++) fn(i * period - off, i);
  }

  // 2: シェーンブルン宮殿の庭 (昼下がり、遠くに砲煙)
  function drawSchonbrunn(g, bp, dp) {
    const cam = bgCam(g);
    const t = bgTime(g);
    skyGrad([[0, '#6fa8dc'], [0.7, '#cfe3f0'], [1, '#f6e7c8']]);
    // 雲
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    repeatX(cam, 0.08, 420, (x, i) => {
      const y = 50 + (i % 3) * 30;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(x + k * 26, y - (k % 2) * 10, 28, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // 丘の上のグロリエッテ
    ctx.fillStyle = '#b8c8a8';
    ctx.beginPath();
    ctx.ellipse(W * 0.7 - cam * 0.12, HORIZON - 40, 380, 90, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#e8e4d8';
    const gx = W * 0.7 - cam * 0.12;
    ctx.fillRect(gx - 90, HORIZON - 150, 180, 26);
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(gx - 78 + i * 26, HORIZON - 124, 9, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(gx - 87 + i * 26, HORIZON - 124, 18, 16);
    }
    // 砲煙
    for (let i = 0; i < 5; i++) {
      const sx = ((i * 260 - cam * 0.2 + t * 8) % 1400 + 1400) % 1400 - 200;
      ctx.fillStyle = 'rgba(220,220,225,0.16)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.ellipse(sx + k * 18, HORIZON - 120 - k * 20 - (t * 6 + i * 10) % 30, 30 + k * 10, 12 + k * 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 宮殿 (黄色い壁)
    repeatX(cam, 0.45, 760, (x) => {
      ctx.fillStyle = '#e8c25a';
      ctx.fillRect(x, HORIZON - 170, 720, 140);
      ctx.fillStyle = '#7a8a8a';
      ctx.fillRect(x - 6, HORIZON - 186, 732, 18);
      ctx.fillStyle = '#e8c25a';
      ctx.fillRect(x + 300, HORIZON - 210, 120, 50);
      ctx.beginPath();
      ctx.moveTo(x + 290, HORIZON - 210);
      ctx.lineTo(x + 360, HORIZON - 240);
      ctx.lineTo(x + 430, HORIZON - 210);
      ctx.fill();
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 14; c++) {
          ctx.fillStyle = `rgba(255,255,255,${0.75 + bp * 0.2})`;
          rr(x + 20 + c * 50, HORIZON - 160 + r * 60, 18, 36, 8);
          ctx.fill();
          ctx.fillStyle = '#5a7a8a';
          ctx.fillRect(x + 23 + c * 50, HORIZON - 150 + r * 60, 12, 22);
        }
      }
    });
    // 生け垣と円錐の植え込み
    repeatX(cam, 0.8, 240, (x, i) => {
      ctx.fillStyle = '#3f6a3a';
      rr(x, HORIZON - 40, 200, 40, 14);
      ctx.fill();
      ctx.fillStyle = '#2e5530';
      ctx.beginPath();
      ctx.moveTo(x + 212, HORIZON - 2);
      ctx.lineTo(x + 226, HORIZON - 78);
      ctx.lineTo(x + 240, HORIZON - 2);
      ctx.fill();
      // 三色旗 (拍で揺れる)
      if (i % 2 === 0) {
        ctx.fillStyle = '#4a3a2a';
        ctx.fillRect(x + 100, HORIZON - 150, 4, 150);
        const wv = Math.sin(t * 5 + i) * 4 + bp * 6;
        const cols = ['#203a8a', '#f0ece0', '#c8202a'];
        cols.forEach((c, k) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(x + 104 + k * 16, HORIZON - 150 + (k ? wv * k * 0.3 : 0));
          ctx.lineTo(x + 120 + k * 16, HORIZON - 150 + wv * (k + 1) * 0.3);
          ctx.lineTo(x + 120 + k * 16, HORIZON - 120 + wv * (k + 1) * 0.3);
          ctx.lineTo(x + 104 + k * 16, HORIZON - 120 + (k ? wv * k * 0.3 : 0));
          ctx.fill();
        });
      }
    });
    drawFloor('#d8c49a', '#a8946a', 'rgba(120,100,60,0.25)', cam, 70);
  }

  // 2 ボス: 夕焼けの戦場の丘
  function drawBattlefield(g, bp, dp) {
    const t = bgTime(g);
    skyGrad([[0, '#3a1a2a'], [0.45, '#a8402a'], [0.85, '#f0a050'], [1, '#f6d088']]);
    ctx.fillStyle = `rgba(255,220,140,${0.8 + bp * 0.2})`;
    ctx.beginPath();
    ctx.arc(W * 0.5, HORIZON - 30, 60, 0, Math.PI * 2);
    ctx.fill();
    // 遠くの丘
    ctx.fillStyle = '#5a2a2a';
    ctx.beginPath();
    ctx.moveTo(0, HORIZON);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, HORIZON - 60 - Math.sin(x * 0.01) * 30 - Math.sin(x * 0.023) * 14);
    ctx.lineTo(W, HORIZON);
    ctx.fill();
    // 天幕と大砲の影
    ctx.fillStyle = '#2a1414';
    for (let i = 0; i < Math.ceil(W / 180); i++) {
      const x = 40 + i * 180;
      ctx.beginPath();
      ctx.moveTo(x, HORIZON - 4);
      ctx.lineTo(x + 30, HORIZON - 50);
      ctx.lineTo(x + 60, HORIZON - 4);
      ctx.fill();
      ctx.fillRect(x + 90, HORIZON - 22, 40, 10);
      ctx.beginPath();
      ctx.arc(x + 100, HORIZON - 8, 9, 0, Math.PI * 2);
      ctx.fill();
      // 砲口の閃き (小節の頭)
      if (dp > 0.5 && i % 2 === (Math.floor(t) % 2)) {
        ctx.fillStyle = `rgba(255,220,120,${dp})`;
        ctx.beginPath();
        ctx.arc(x + 136, HORIZON - 18, 12 * dp, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a1414';
      }
    }
    // 煙
    for (let i = 0; i < 6; i++) {
      const sx = (i * 190 + t * 12) % (W + 200) - 100;
      ctx.fillStyle = 'rgba(90,60,60,0.18)';
      ctx.beginPath();
      ctx.ellipse(sx, HORIZON - 90 - (i % 3) * 30, 90, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 大きな軍旗
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(W - 140, HORIZON - 210, 6, 210);
    const wv = Math.sin(t * 4) * 6 + bp * 8;
    ['#203a8a', '#f0ece0', '#c8202a'].forEach((c, k) => {
      ctx.fillStyle = c;
      ctx.fillRect(W - 134 + k * 26, HORIZON - 210 + wv * k * 0.3, 26, 56);
    });
    drawFloor('#6a5a3a', '#3a2e1e', 'rgba(20,10,0,0.25)', 0, 80);
  }

  // 3: ヴェネツィアの夜の運河
  function drawVenice(g, bp, dp) {
    const cam = bgCam(g);
    const t = bgTime(g);
    skyGrad([[0, '#0c0a2a'], [0.7, '#2a2050'], [1, '#4a3060']]);
    ctx.fillStyle = 'rgba(255,250,230,0.9)';
    ctx.beginPath();
    ctx.arc(160 - cam * 0.03, 80, 30, 0, Math.PI * 2);
    ctx.fill();
    // 花火 (小節の頭で開く)
    if (g && dp > 0) {
      const fx = 200 + ((g.lastBeatInt * 137) % (W - 400));
      const fy = 70 + ((g.lastBeatInt * 53) % 80);
      const r = (1 - dp) * 70 + 10;
      const cols = ['#ffd84a', '#ff8fc0', '#8ff0ff'];
      ctx.fillStyle = cols[g.lastBeatInt % 3];
      ctx.globalAlpha = dp;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // 館 (ゴシックの尖った窓)
    const cols = ['#c87a6a', '#d8a878', '#b86a5a', '#d8c098', '#a87a8a'];
    repeatX(cam, 0.5, 170, (x, i) => {
      const h = 170 + ((i * 37) % 60);
      const top = HORIZON - 50 - h;
      ctx.fillStyle = cols[((i % 5) + 5) % 5];
      ctx.fillRect(x, top, 164, h);
      ctx.fillStyle = 'rgba(20,10,40,0.45)';
      ctx.fillRect(x, top, 164, h);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const wx = x + 16 + c * 36;
          const wy = top + 22 + r * (h / 3.4);
          const lit = (i + r + c) % 3 === 0;
          ctx.fillStyle = lit ? `rgba(255,210,120,${0.8 + bp * 0.2})` : 'rgba(30,20,50,0.8)';
          ctx.beginPath();
          ctx.moveTo(wx, wy + 34);
          ctx.lineTo(wx, wy + 10);
          ctx.quadraticCurveTo(wx + 9, wy - 6, wx + 18, wy + 10);
          ctx.lineTo(wx + 18, wy + 34);
          ctx.fill();
        }
      }
    });
    // 運河の水 (きらめき)
    const wy0 = HORIZON - 50;
    const wg = ctx.createLinearGradient(0, wy0, 0, HORIZON);
    wg.addColorStop(0, '#1a2a4a');
    wg.addColorStop(1, '#0a1428');
    ctx.fillStyle = wg;
    ctx.fillRect(0, wy0, W, 50);
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 83 - cam * 0.7 + Math.sin(t + i) * 10) % (W + 40) + W + 40) % (W + 40) - 20;
      ctx.fillStyle = `rgba(255,210,140,${0.25 + bp * 0.3})`;
      ctx.fillRect(sx, wy0 + 6 + (i % 5) * 9, 14 + (i % 3) * 6, 2);
    }
    // ゴンドラ
    repeatX(cam, 0.7, 640, (x) => {
      const gx = x + ((t * 20) % 640);
      ctx.fillStyle = '#0a0a10';
      ctx.beginPath();
      ctx.moveTo(gx - 50, wy0 + 26);
      ctx.quadraticCurveTo(gx, wy0 + 40, gx + 50, wy0 + 22);
      ctx.lineTo(gx + 56, wy0 + 10);
      ctx.lineTo(gx + 44, wy0 + 26);
      ctx.quadraticCurveTo(gx, wy0 + 32, gx - 46, wy0 + 22);
      ctx.fill();
      ctx.fillRect(gx + 24, wy0 - 4, 3, 26);
    });
    // 吊り提灯 (拍で明るく)
    repeatX(cam, 0.9, 300, (x) => {
      ctx.strokeStyle = 'rgba(40,30,30,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 120);
      ctx.quadraticCurveTo(x + 150, 170, x + 300, 120);
      ctx.stroke();
      for (let k = 1; k < 6; k++) {
        const lx = x + k * 50;
        const ly = 120 + Math.sin((k / 6) * Math.PI) * 48 + Math.sin(t * 2 + k) * 2;
        const c = ['#ff6a5a', '#ffd84a', '#8ff0a0', '#ff8fc0', '#8fc0ff'][k % 5];
        const rg = ctx.createRadialGradient(lx, ly + 8, 1, lx, ly + 8, 24 + bp * 10);
        rg.addColorStop(0, c);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.globalAlpha = 0.5 + bp * 0.4;
        ctx.fillRect(lx - 34, ly - 26, 68, 68);
        ctx.globalAlpha = 1;
        ctx.fillStyle = c;
        rr(lx - 6, ly, 12, 16, 5);
        ctx.fill();
      }
    });
    drawFloor('#8a7a7a', '#4a3e44', 'rgba(30,20,30,0.35)', cam, 50);
  }

  // 3 ボス: 嵐のサン・マルコ広場
  function drawPiazza(g, bp, dp) {
    const t = bgTime(g);
    skyGrad([[0, '#141828'], [0.6, '#2a3048'], [1, '#4a4a5a']]);
    // 稲妻 (小節の頭)
    if (dp > 0.6) {
      ctx.fillStyle = `rgba(220,230,255,${(dp - 0.6) * 1.2})`;
      ctx.fillRect(0, -OY, W, HORIZON + OY);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      const lx = 300 + (g ? (g.lastBeatInt * 211) % (W - 400) : 0);
      ctx.beginPath();
      ctx.moveTo(lx, -OY);
      for (let k = 1; k < 7; k++) ctx.lineTo(lx + (k % 2 ? 24 : -18), k * 30);
      ctx.stroke();
    }
    // 鐘楼
    ctx.fillStyle = '#6a4a3a';
    ctx.fillRect(80, HORIZON - 300, 70, 300);
    ctx.fillStyle = '#4a6a5a';
    ctx.beginPath();
    ctx.moveTo(74, HORIZON - 300);
    ctx.lineTo(115, HORIZON - 380);
    ctx.lineTo(156, HORIZON - 300);
    ctx.fill();
    ctx.fillStyle = `rgba(255,220,140,${0.4 + bp * 0.4})`;
    ctx.fillRect(98, HORIZON - 280, 34, 30);
    // 大聖堂の丸屋根
    const bx = W * 0.55;
    ctx.fillStyle = '#8a7a6a';
    ctx.fillRect(bx - 220, HORIZON - 150, 440, 150);
    ctx.fillStyle = '#5a6a6a';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(bx + i * 90, HORIZON - 150, 36, 40, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = '#e6c35a';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(bx - 180 + i * 90, HORIZON - 60, 30, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,20,20,0.85)';
      ctx.fillRect(bx - 205 + i * 90, HORIZON - 60, 50, 60);
      ctx.fillStyle = '#e6c35a';
    }
    // 回廊
    ctx.fillStyle = '#9a8a7a';
    ctx.fillRect(W - 260, HORIZON - 120, 260, 120);
    ctx.fillStyle = 'rgba(30,20,20,0.7)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(W - 244 + i * 32, HORIZON - 70, 12, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(W - 256 + i * 32, HORIZON - 70, 24, 70);
    }
    drawFloor('#9a9090', '#5a5058', 'rgba(255,255,255,0.12)', 0, 70);
    // 雨
    ctx.strokeStyle = 'rgba(200,210,240,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const rx = ((i * 97 + t * 300) % (W + 100)) - 50;
      const ry = ((i * 53 + t * 900) % (H + OY + 40)) - OY - 20;
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 6, ry + 18);
    }
    ctx.stroke();
  }

  // 4: オペラ座の客席 (金の桟敷)
  function drawOpera(g, bp, dp) {
    const cam = bgCam(g);
    skyGrad([[0, '#2a0a10'], [1, '#5a1420']]);
    // 桟敷 (3 段)
    repeatX(cam, 0.5, 120, (x, i) => {
      for (let r = 0; r < 3; r++) {
        const y = 40 + r * 82;
        ctx.fillStyle = '#3a0a14';
        ctx.fillRect(x + 6, y, 108, 64);
        // 客 (拍でうなずく)
        for (let k = 0; k < 3; k++) {
          const hx = x + 28 + k * 32;
          const nod = (i + k + r) % 2 ? bp * 3 : 0;
          ctx.fillStyle = 'rgba(20,10,10,0.9)';
          ctx.beginPath();
          ctx.arc(hx, y + 34 + nod, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(hx - 10, y + 42 + nod, 20, 20);
        }
        ctx.fillStyle = '#d8b04a';
        ctx.fillRect(x, y + 56, 120, 10);
        ctx.fillStyle = '#b8902a';
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.arc(x + 10 + k * 20, y + 66, 6, 0, Math.PI);
          ctx.fill();
        }
        ctx.fillStyle = '#e8c86a';
        ctx.fillRect(x - 4, y - 4, 10, 74);
      }
    });
    // 大シャンデリア
    const t = bgTime(g);
    const cx = W / 2 - ((cam * 0.2) % 400) + 200;
    ctx.fillStyle = '#e8c35a';
    ctx.beginPath();
    ctx.ellipse(cx, 30, 90, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let k = -6; k <= 6; k++) {
      ctx.fillStyle = `rgba(255,240,180,${0.7 + bp * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx + k * 14, 46 + Math.abs(k) * 1.5 + Math.sin(t * 2 + k) * 1, 3 + bp * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 手すり
    ctx.fillStyle = '#5a1420';
    ctx.fillRect(0, HORIZON - 30, W, 30);
    ctx.fillStyle = '#d8b04a';
    ctx.fillRect(0, HORIZON - 34, W, 6);
    drawFloor('#7a1a24', '#3a0a10', 'rgba(255,200,120,0.12)', cam, 90);
  }

  // 4 ボス: 大舞台 (幕と脚光)
  function drawStage(g, bp, dp) {
    const t = bgTime(g);
    // 書き割りの夜空
    skyGrad([[0, '#0a0a24'], [1, '#2a1a48']]);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(255,240,200,${0.4 + ((i * 7) % 5) * 0.1 + bp * 0.2})`;
      ctx.beginPath();
      ctx.arc((i * 137) % W, ((i * 71) % 220) + 30, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f0e6c0';
    ctx.beginPath();
    ctx.arc(W * 0.5, 110, 50, 0, Math.PI * 2);
    ctx.fill();
    // 幕
    const drape = (x0, dir) => {
      ctx.fillStyle = '#9a1020';
      ctx.beginPath();
      ctx.moveTo(x0, -OY);
      ctx.lineTo(x0 + dir * 200, -OY);
      ctx.quadraticCurveTo(x0 + dir * 120, 160, x0 + dir * 70 + Math.sin(t) * 4, HORIZON);
      ctx.lineTo(x0, HORIZON);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,0,10,0.5)';
      ctx.lineWidth = 3;
      for (let k = 1; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(x0 + dir * k * 36, -OY);
        ctx.quadraticCurveTo(x0 + dir * k * 22, 160, x0 + dir * k * 14, HORIZON);
        ctx.stroke();
      }
    };
    drape(0, 1);
    drape(W, -1);
    ctx.fillStyle = '#9a1020';
    ctx.fillRect(0, -OY, W, 40 + OY);
    ctx.fillStyle = '#e6c35a';
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.arc(x + 20, 40, 18, 0, Math.PI);
      ctx.fill();
    }
    // 床 (舞台の板)
    drawFloor('#8a5a2a', '#4a2a10', 'rgba(30,10,0,0.3)', 0, 120);
    // 脚光 (拍で明るく)
    for (let x = 30; x < W; x += 70) {
      const rg = ctx.createRadialGradient(x, H - 4, 2, x, H - 4, 60 + bp * 30);
      rg.addColorStop(0, `rgba(255,230,160,${0.5 + bp * 0.4})`);
      rg.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - 90, H - 100, 180, 100);
    }
    // スポットライト
    ctx.fillStyle = `rgba(255,250,220,${0.06 + dp * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(W * 0.3, -OY);
    ctx.lineTo(W * 0.15, H);
    ctx.lineTo(W * 0.45, H);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W * 0.7, -OY);
    ctx.lineTo(W * 0.55, H);
    ctx.lineTo(W * 0.85, H);
    ctx.fill();
  }

  // 5: 雲の上 (光の柱と金の五線)
  function drawHeaven(g, bp, dp) {
    const cam = bgCam(g);
    const t = bgTime(g);
    skyGrad([[0, '#6a7ad8'], [0.5, '#e8b8d8'], [1, '#fff0c8']]);
    // 光の柱
    ctx.save();
    ctx.globalAlpha = 0.18 + bp * 0.1;
    ctx.fillStyle = '#fff8d8';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 220 - cam * 0.1) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.beginPath();
      ctx.moveTo(x, -OY);
      ctx.lineTo(x + 50, -OY);
      ctx.lineTo(x + 130, HORIZON);
      ctx.lineTo(x + 40, HORIZON);
      ctx.fill();
    }
    ctx.restore();
    // 浮かぶ金の五線
    repeatX(cam, 0.25, 520, (x, i) => {
      const y = 90 + (i % 3) * 50 + Math.sin(t + i) * 6;
      ctx.strokeStyle = 'rgba(230,190,80,0.6)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(x, y + k * 6);
        ctx.bezierCurveTo(x + 100, y + k * 6 - 20, x + 200, y + k * 6 + 20, x + 300, y + k * 6);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(200,150,40,${0.6 + bp * 0.3})`;
      ctx.font = '22px serif';
      for (let k = 0; k < 4; k++) ctx.fillText(['♪', '♫', '♩', '♬'][k], x + 40 + k * 60, y + 18 - (k % 2) * 8);
    });
    // 雲の層
    const cloud = (par, y, col, period, sz) =>
      repeatX(cam, par, period, (x, i) => {
        ctx.fillStyle = col;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.ellipse(x + k * sz * 0.7, y - Math.abs(k - 2) * -sz * 0.12 - (i % 2) * 8, sz, sz * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    cloud(0.3, HORIZON - 90, 'rgba(255,255,255,0.7)', 360, 46);
    cloud(0.6, HORIZON - 30, 'rgba(255,250,240,0.9)', 300, 56);
    drawFloor('#fff8ee', '#e8d8e8', 'rgba(200,170,200,0.25)', cam, 90);
    // 足もとの雲
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    repeatX(cam, 1, 180, (x) => {
      ctx.beginPath();
      ctx.ellipse(x, H - 10, 70, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 5 ボス: 天上の大オルガン
  function drawOrgan(g, bp, dp) {
    const t = bgTime(g);
    skyGrad([[0, '#140a28'], [0.6, '#3a2050'], [1, '#6a4a6a']]);
    // 星
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,250,220,${0.3 + ((i * 13) % 7) * 0.08})`;
      ctx.fillRect((i * 151) % W, (i * 67) % 260, 2, 2);
    }
    // バラ窓
    const cx = W / 2;
    const cy = 110;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.1);
    const cols = ['#ff6a8a', '#6ac8ff', '#ffd84a', '#8aff9a'];
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.globalAlpha = 0.6 + bp * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 78, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e6c35a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // パイプ (拍ごとに一本ずつ光る)
    const n = Math.ceil(W / 34);
    const lit = g ? g.lastBeatInt % n : -1;
    for (let i = 0; i < n; i++) {
      const x = i * 34 + 4;
      const d = Math.abs(i - n / 2);
      const h = 240 - d * 9 + (i % 2) * 20;
      if (Math.abs(x + 13 - cx) < 90 && h > 150) continue; // バラ窓のところはあける
      const glow = i === lit ? bp : 0;
      const pg = ctx.createLinearGradient(x, 0, x + 26, 0);
      pg.addColorStop(0, '#b8902a');
      pg.addColorStop(0.5, glow ? '#fff4c0' : '#f0d070');
      pg.addColorStop(1, '#a07a20');
      ctx.fillStyle = pg;
      ctx.fillRect(x, HORIZON - h, 26, h);
      ctx.fillStyle = '#3a2a10';
      ctx.beginPath();
      ctx.ellipse(x + 13, HORIZON - h + 30, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFloor('#e8e0ea', '#a898b0', 'rgba(120,90,140,0.25)', 0, 90);
  }

  const BGS = {
    vienna: (g, bp, dp) => drawStreetBg(g, bp, dp),
    versailles: (g, bp, dp) => drawPalaceBg(g, bp, dp),
    schonbrunn: drawSchonbrunn,
    battlefield: drawBattlefield,
    venice: drawVenice,
    piazza: drawPiazza,
    opera: drawOpera,
    stage: drawStage,
    heaven: drawHeaven,
    organ: drawOrgan,
  };

  // ---------- 人物 ----------
  function depthScale(z) {
    return 0.86 + 0.18 * clamp((z - Z_TOP) / (Z_BOT - Z_TOP), 0, 1);
  }
  function shadow(x, z, w, h = 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, z + 4, w * clamp(1 - h / 300, 0.4, 1), 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 腕と持ち物を描く: 肩 (sx, sy) から角度 a (0 = 前、正 = 下)、長さ l
  function arm(sx, sy, a, l, color, w = 8) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    const ex = sx + Math.cos(a) * l;
    const ey = sy + Math.sin(a) * l;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    return [ex, ey];
  }

  function drawBeethoven(p, beat, g) {
    const t = g ? g.time : titleT;
    const x = p.x - (g ? g.camX : 0);
    const y = p.y;
    shadow(x, p.z === undefined ? y : p.z, 34, p.z === undefined ? 0 : p.z - p.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(p.face, 1);
    if (p.state === 'dead') {
      ctx.rotate(-Math.min(1.4, p.st * 3));
    }
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) ctx.globalAlpha = 0.5;
    const bounce = g ? Math.pow(g.beatPulse, 2) * 3 : 0;
    const walking = Math.abs(p.vx) > 10 && p.onGround;
    const leg = walking ? Math.sin(p.walkT) * 0.5 : 0;
    // 脚 (黒い長靴)
    ctx.strokeStyle = '#1b1b22';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    const hip = -44 + bounce * 0.5;
    ctx.beginPath();
    ctx.moveTo(-4, hip);
    ctx.lineTo(-4 + Math.sin(leg) * 22, -4);
    ctx.moveTo(6, hip);
    ctx.lineTo(6 - Math.sin(leg) * 22, -4);
    ctx.stroke();
    ctx.strokeStyle = '#efe6cf';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(-4, hip);
    ctx.lineTo(-4 + Math.sin(leg) * 10, hip + 18);
    ctx.moveTo(6, hip);
    ctx.lineTo(6 - Math.sin(leg) * 10, hip + 18);
    ctx.stroke();
    // 燕尾服 (深い緑)
    const lean = p.state === 'charging' ? -0.08 : p.state === 'cattack' ? 0.12 : 0;
    ctx.save();
    ctx.rotate(lean);
    ctx.fillStyle = '#244a3a';
    ctx.beginPath();
    ctx.moveTo(-16, -98 + bounce);
    ctx.lineTo(16, -98 + bounce);
    ctx.lineTo(18, -52);
    ctx.lineTo(4, -46);
    ctx.lineTo(-14, -20 - Math.sin(t * 6) * 3);
    ctx.lineTo(-24, -24 - Math.sin(t * 6) * 3);
    ctx.lineTo(-20, -60);
    ctx.closePath();
    ctx.fill();
    // ベスト
    ctx.fillStyle = '#8a1c24';
    ctx.beginPath();
    ctx.moveTo(2, -96 + bounce);
    ctx.lineTo(15, -96 + bounce);
    ctx.lineTo(15, -54);
    ctx.lineTo(4, -52);
    ctx.fill();
    // 襟とクラヴァット
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-2, -100 + bounce);
    ctx.lineTo(14, -100 + bounce);
    ctx.lineTo(10, -84 + bounce);
    ctx.lineTo(4, -80 + bounce);
    ctx.fill();
    ctx.fillStyle = '#1d3a2d';
    ctx.beginPath();
    ctx.moveTo(-16, -98 + bounce);
    ctx.lineTo(-4, -98 + bounce);
    ctx.lineTo(-10, -76);
    ctx.fill();
    // 頭
    const hy = -114 + bounce;
    ctx.fillStyle = '#e9b98f';
    ctx.beginPath();
    ctx.ellipse(4, hy, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    // 髪 (白髪まじりのぼさぼさ。拍でふわっと)
    const hairPuff = 1 + (g ? g.beatPulse * 0.15 : 0) + (p.state === 'charging' ? 0.15 + Math.sin(t * 30) * 0.03 : 0);
    ctx.fillStyle = p.chargeLv >= 2 ? '#fff4c0' : '#d8d6d0';
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.55 + (i / 8) * Math.PI * 1.3;
      const r = 15 * hairPuff;
      ctx.beginPath();
      ctx.ellipse(2 + Math.cos(a) * r * 0.85, hy - 3 + Math.sin(a) * r * 0.8, 8 * hairPuff, 6 * hairPuff, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#a8a39a';
    ctx.beginPath();
    ctx.ellipse(-8, hy + 2, 7, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 顔 (しかめっつら)
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(5, hy - 5);
    ctx.lineTo(15, hy - 2);
    ctx.stroke();
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(10, hy - 1, 3, 3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.state === 'hurt' || p.state === 'broken') {
      ctx.arc(12, hy + 9, 3, 0, Math.PI * 2);
    } else {
      ctx.moveTo(8, hy + 9);
      ctx.lineTo(15, hy + 8);
    }
    ctx.stroke();
    ctx.fillStyle = '#d29a74';
    ctx.beginPath();
    ctx.moveTo(15, hy - 2);
    ctx.lineTo(19, hy + 4);
    ctx.lineTo(14, hy + 5);
    ctx.fill();

    // 指揮棒の腕
    const sx = 6;
    const sy = -92 + bounce;
    let a = -0.3 + Math.sin(t * 3) * 0.05;
    let batonLen = 52;
    if (g && p.state === 'free') a = -0.5 + (g.beatPulse) * 0.5; // 拍を振る
    if (p.state === 'attack' && p.atk) {
      const k = clamp(p.st / p.atk.act1, 0, 1);
      a = lerp(-2.0, 0.9, Math.pow(k, 0.6));
    }
    if (p.state === 'charging') a = -2.3 + Math.sin(t * 20) * 0.04;
    if (p.state === 'cattack' && p.atk) {
      const k = clamp(p.st / p.atk.act1, 0, 1);
      a = lerp(-2.6, 1.2, Math.pow(k, 0.5));
      batonLen = 60;
    }
    if (p.state === 'guard') a = -0.9;
    if (p.state === 'hurt' || p.state === 'broken') a = -2.6;
    if (g && g.cadenza) a = p.conduct > 0 ? lerp(0.5, -1.7, p.conduct / 0.16) : -1.7 + Math.sin(t * 4) * 0.05; // 指揮する
    // うしろの腕
    arm(-8, -92 + bounce, Math.PI * 0.55 + leg * 0.4, 30, '#1f4033', 8);
    const [hx2, hy2] = arm(sx, sy, a, 30, '#2b5444', 9);
    ctx.fillStyle = '#e9b98f';
    ctx.beginPath();
    ctx.arc(hx2, hy2, 5, 0, Math.PI * 2);
    ctx.fill();
    // 指揮棒
    const ba = a + (p.state === 'guard' ? -0.7 : -0.25);
    const bx = hx2 + Math.cos(ba) * batonLen;
    const by = hy2 + Math.sin(ba) * batonLen;
    ctx.strokeStyle = '#f8f4e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx2, hy2);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // 先の光
    const tipGlow = p.state === 'charging' ? (p.chargeLv >= 2 ? 22 : p.chargeLv ? 14 : 6) : p.glow > 0 ? 18 : 4 + (g ? g.beatPulse * 6 : 0);
    const tipCol = p.chargeLv >= 2 ? '255,216,74' : p.chargeLv ? '143,211,255' : '255,250,220';
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, tipGlow + 6);
    rg.addColorStop(0, `rgba(${tipCol},1)`);
    rg.addColorStop(1, `rgba(${tipCol},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(bx, by, tipGlow + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 振りの軌跡
    if ((p.state === 'attack' || p.state === 'cattack') && p.atk && p.st < p.atk.act1 + 0.12) {
      const A = p.atk;
      const col = A.judge >= 2 ? '255,216,74' : A.judge === 1 ? '127,216,255' : '255,255,255';
      const k = clamp(p.st / A.act1, 0, 1);
      const r0 = A.kind === 'charge' ? 100 : 80;
      const a0 = A.kind === 'charge' ? -2.6 : -2.0;
      const a1 = lerp(a0, A.kind === 'charge' ? 1.2 : 0.9, k);
      const fade = 1 - clamp((p.st - A.act1) / 0.12, 0, 1);
      ctx.strokeStyle = `rgba(${col},${0.75 * fade})`;
      ctx.lineWidth = A.kind === 'charge' ? 18 + A.judge * 8 : 10 + A.judge * 6;
      ctx.beginPath();
      ctx.arc(6, -92, r0, a0 + 0.2, a1 - 0.25);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(6, -92, r0, a0 + 0.3, a1 - 0.25);
      ctx.stroke();
    }
    // ガード: 光る五線の盾
    if (p.state === 'guard') {
      const just = p.glow > 0;
      const al = 0.55 + (g ? g.beatPulse * 0.25 : 0) + (just ? 0.4 : 0);
      ctx.strokeStyle = just ? `rgba(143,240,255,${al})` : `rgba(180,210,255,${al})`;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(10, -70, 54 + i * 7, -1.0, 1.0);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(160,200,255,${0.12 + (just ? 0.2 : 0)})`;
      ctx.beginPath();
      ctx.arc(10, -70, 82, -1.0, 1.0);
      ctx.arc(10, -70, 50, 1.0, -1.0, true);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${al})`;
      ctx.font = '26px serif';
      ctx.fillText('𝄞', 62, -60);
    }
    // ため: オーラ
    if (p.state === 'charging') {
      const lv = p.chargeLv;
      const col = lv >= 2 ? '255,216,74' : lv ? '143,211,255' : '255,255,255';
      const rad = 50 + lv * 14 + Math.sin(t * 25) * 3;
      const ag = ctx.createRadialGradient(0, -60, 10, 0, -60, rad + 30);
      ag.addColorStop(0, `rgba(${col},0)`);
      ag.addColorStop(0.7, `rgba(${col},${0.15 + lv * 0.1})`);
      ag.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, -60, rad + 30, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 英国紳士たち
  // 人物を描く (ボスのマリーは専用、ほかは look の組み合わせ)
  function drawFigure(e, beat, g, portrait) {
    if (e.T.draw === 'marie') return drawMarie(e, beat, g, portrait);
    return drawEnemy(e, beat, g, portrait);
  }

  const SKIN = '#f2cfae';
  // アルレッキーノの菱形模様で塗る
  function harlequinFill(x, y, w, h) {
    const cols = ['#c8202a', '#2c7a3a', '#e6c35a', '#203a8a'];
    const s = 9;
    for (let i = 0; i * s < w + s; i++) {
      for (let j = 0; j * s < h + s; j++) {
        ctx.fillStyle = cols[(i + j * 3) % 4];
        ctx.beginPath();
        const cx = x + i * s + (j % 2) * (s / 2);
        const cy = y + j * s;
        ctx.moveTo(cx, cy - s / 2 - 1);
        ctx.lineTo(cx + s / 2 + 1, cy);
        ctx.lineTo(cx, cy + s / 2 + 1);
        ctx.lineTo(cx - s / 2 - 1, cy);
        ctx.fill();
      }
    }
  }
  // 塗りつぶし: 色か、アルレッキーノ模様か
  function fillPath(color, bx, by, bw, bh) {
    if (color === 'harlequin') {
      ctx.save();
      ctx.clip();
      harlequinFill(bx, by, bw, bh);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function drawEnemy(e, beat, g, portrait) {
    const T = e.T;
    const L0 = T.look;
    const S = T.scale || 1;
    const time = g ? g.time : titleT;
    const x = e.x - (g ? g.camX : 0);
    const y = e.y;
    if (!portrait && (x < -220 || x > W + 220)) return;
    // 石像は灰色に、亡霊は青白く
    const L = L0.statue ? { ...L0, coat: '#9a9a96', pants: '#8a8a86', hatColor: '#8a8a86' } : L0;
    const skin = L.statue ? '#b4b4ae' : L.pale ? '#f2e8ee' : L.ghost ? '#e8eef8' : SKIN;
    const fat = L.fat || 1;
    if (!portrait) shadow(x, e.z, 30 * S * fat, e.z - e.y);
    ctx.save();
    if (e.flash > 0) ctx.filter = `brightness(${1 + e.flash * 8})`;
    else if (L.statue) ctx.filter = 'grayscale(0.6)';
    ctx.translate(x, y);
    ctx.scale(e.face * S, S);
    if (e.dead) {
      ctx.rotate(-Math.min(1.5, e.deadT * 4));
      ctx.globalAlpha = clamp(2.5 - e.deadT, 0, 1);
    }
    // 羽や亡霊は少し浮く
    const floatY = L.wings || L.ghost ? Math.sin(time * 3 + e.bob) * 4 - 10 : 0;
    ctx.translate(0, floatY);
    if (L.ghost) {
      const gg = ctx.createRadialGradient(0, -80, 10, 0, -80, 110);
      gg.addColorStop(0, 'rgba(160,200,255,0.35)');
      gg.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(-120, -200, 240, 220);
      ctx.globalAlpha *= 0.82 + Math.sin(time * 4 + e.bob) * 0.08;
    }
    const bob = Math.sin((beat % 1) * Math.PI) * 2;
    const walk = e.state === 'walk' ? Math.sin(e.walkT) * 0.5 : 0;
    const by = -46 - bob;
    // 羽 (背中)
    if (L.wings) {
      const fl = Math.sin(time * 12 + e.bob) * 0.35;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      for (const k of [1, 0.7]) {
        ctx.save();
        ctx.translate(-8, by - 36);
        ctx.rotate(-0.6 - fl * k);
        ctx.beginPath();
        ctx.ellipse(-20, 0, 26 * k, 11 * k, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,130,170,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
    // 脚
    if (L.body !== 'robe') {
      ctx.strokeStyle = L.pants === 'harlequin' ? '#c8202a' : L.pants;
      ctx.lineWidth = 9 * fat;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, -42);
      ctx.lineTo(-5 + Math.sin(walk) * 18, -3);
      ctx.moveTo(6, -42);
      ctx.lineTo(6 - Math.sin(walk) * 18, -3);
      ctx.stroke();
      if (L.boots || L.body === 'coat') {
        ctx.strokeStyle = L.statue ? '#7a7a76' : '#141414';
        ctx.lineWidth = 10 * fat;
        ctx.beginPath();
        ctx.moveTo(-5 + Math.sin(walk) * 9, -22);
        ctx.lineTo(-5 + Math.sin(walk) * 18, -3);
        ctx.moveTo(6 - Math.sin(walk) * 9, -22);
        ctx.lineTo(6 - Math.sin(walk) * 18, -3);
        ctx.stroke();
      }
      ctx.fillStyle = L.statue ? '#7a7a76' : '#0d0d10';
      ctx.fillRect(-12 + Math.sin(walk) * 18, -6, 16, 6);
      ctx.fillRect(-1 - Math.sin(walk) * 18, -6, 16, 6);
    }
    // 胴
    ctx.beginPath();
    if (L.body === 'round') {
      ctx.ellipse(2, by - 22, 26, 32, 0, 0, Math.PI * 2);
    } else if (L.body === 'coat') {
      ctx.moveTo(-15 * fat, by - 46);
      ctx.lineTo(15 * fat, by - 46);
      ctx.lineTo(19 * fat, by + 30);
      ctx.lineTo(-21 * fat, by + 30);
    } else if (L.body === 'robe') {
      ctx.moveTo(-13 * fat, by - 46);
      ctx.lineTo(13 * fat, by - 46);
      ctx.lineTo(22 * fat, -2);
      ctx.lineTo(-22 * fat, -2);
    } else if (L.body === 'tunic') {
      ctx.moveTo(-14 * fat, by - 46);
      ctx.lineTo(14 * fat, by - 46);
      ctx.lineTo(15 * fat, by + 6);
      ctx.lineTo(-15 * fat, by + 6);
    } else {
      ctx.moveTo(-14, by - 46);
      ctx.lineTo(14, by - 46);
      ctx.lineTo(16, by);
      ctx.lineTo(-10, by + 26); // 燕尾
      ctx.lineTo(-18, by + 22);
      ctx.lineTo(-16, by - 10);
    }
    ctx.closePath();
    fillPath(L.coat, -30, by - 50, 60, 100);
    if (L.tutu) {
      ctx.fillStyle = 'rgba(255,230,240,0.95)';
      ctx.beginPath();
      ctx.ellipse(0, by + 4, 26, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 折り返しの色 (軍服の前立て)
    if (L.facing) {
      ctx.fillStyle = L.facing;
      ctx.fillRect(6, by - 44, 7, L.body === 'coat' ? 70 : 44);
      if (L.body === 'tunic') {
        ctx.strokeStyle = L.facing;
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(-6, by - 38 + i * 9);
          ctx.lineTo(12, by - 38 + i * 9);
          ctx.stroke();
        }
      }
    }
    if (L.sash) {
      ctx.strokeStyle = L.sash;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-12, by - 44);
      ctx.lineTo(13, by - 6);
      ctx.stroke();
    }
    // シャツとネクタイ
    if (L.tie || L.bow) {
      ctx.fillStyle = '#f4f1e8';
      ctx.beginPath();
      ctx.moveTo(2, by - 46);
      ctx.lineTo(13, by - 46);
      ctx.lineTo(9, by - 22);
      ctx.fill();
      ctx.fillStyle = L.bow || L.tie;
      if (L.bow) ctx.fillRect(4, by - 46, 10, 5);
      else ctx.fillRect(7, by - 44, 4, 14);
    }
    if (L.watch) {
      ctx.strokeStyle = '#e6c35a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(14, by - 20, 8, 0.3, 2.5);
      ctx.stroke();
    }
    // 太鼓 (鼓手は腰に)
    if (L.weapon === 'drum' && e.state !== 'guard') drawDrum(14, by - 8, 1);
    // ヴァイオリン (肩に乗せている)
    if (L.weapon === 'violin' && e.state !== 'guard') drawViolin(-6, by - 40, -0.5, 0.9);
    // 頭
    const hy = by - 60;
    if (L.hat === 'longhair') {
      ctx.fillStyle = L.hatColor;
      ctx.beginPath();
      ctx.ellipse(-2, hy + 10, 15, 26, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (L.hat === 'wig') {
      ctx.fillStyle = L.hatColor;
      ctx.beginPath();
      ctx.ellipse(-4, hy + 2, 15, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-18, hy + 8, 6, 8); // 後ろで結んだリボン
    }
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(4, hy, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // 顔
    if (L.mask === 'bauta') {
      ctx.fillStyle = '#f4f2ea';
      ctx.beginPath();
      ctx.moveTo(-2, hy - 13);
      ctx.quadraticCurveTo(16, hy - 14, 17, hy - 2);
      ctx.lineTo(21, hy + 10);
      ctx.lineTo(8, hy + 14);
      ctx.lineTo(-2, hy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.ellipse(11, hy - 4, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e6c35a';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      if (L.stache) {
        ctx.fillStyle = L.stache;
        ctx.beginPath();
        ctx.ellipse(10, hy + 6, 9, 3.5, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(19, hy + 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = L.statue ? '#6a6a66' : '#222';
      ctx.fillRect(10, hy - 4, 3, 3);
      if (L.mask === 'domino') {
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(10, hy - 3, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(10, hy - 4, 3, 2);
      }
      if (L.monocle) {
        ctx.strokeStyle = '#e6c35a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(11.5, hy - 3, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(11, hy + 2);
        ctx.lineTo(8, hy + 16);
        ctx.stroke();
      }
      if (L.pale) {
        // 落ちくぼんだ目と鷲鼻
        ctx.fillStyle = 'rgba(80,40,80,0.35)';
        ctx.beginPath();
        ctx.ellipse(11, hy - 3, 5, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d8c8d0';
        ctx.beginPath();
        ctx.moveTo(15, hy - 2);
        ctx.lineTo(21, hy + 5);
        ctx.lineTo(15, hy + 6);
        ctx.fill();
      }
    }
    if (e.state === 'stun') {
      ctx.fillStyle = '#ffd84a';
      ctx.font = '16px serif';
      for (let i = 0; i < 3; i++) ctx.fillText('★', Math.cos(time * 6 + i * 2.1) * 18 - 4, hy - 30 + Math.sin(time * 6 + i * 2.1) * 5);
    }
    drawHat(L, hy, time);
    // 武器の腕
    const sx = 4;
    const sy = by - 40;
    let a = 0.9;
    let charge = false;
    if ((e.state === 'windup' || e.state === 'throw') && e.act) {
      const hb = e.act.hits[e.act.i];
      const st = e.act.i > 0 ? e.act.lastHit || e.act.start : e.act.start;
      const k = clamp((beat - st) / Math.max(0.01, hb - st), 0, 1);
      charge = e.act.kind === 'charge';
      a = lerp(0.9, charge ? -2.7 : -2.0, Math.min(1, k * 1.6)) + (charge ? Math.sin(time * 30) * 0.05 * k : 0);
    }
    if (e.state === 'strike') a = lerp(-2.0, 0.9, clamp(e.st / 0.12, 0, 1));
    if (e.state === 'hurt' || e.state === 'stun') a = 2.2;
    const guard = e.state === 'guard';
    if (guard) a = -0.2;
    const sleeve = L.coat === 'harlequin' ? '#2c7a3a' : L.coat;
    const [hx, hy2] = arm(sx, sy, a, 26, sleeve, 7 * fat);
    ctx.fillStyle = L.gloves || skin;
    ctx.beginPath();
    ctx.arc(hx, hy2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    if (guard) drawShield(L, hx, hy2, time);
    else if (e.state === 'throw' && e.act && e.act.kind === 'cake') drawShotArt(T.shot, hx, hy2 - 8, 0, 0.8);
    else drawWeapon(L, hx, hy2, a, charge);
    // 回転の大技
    const spinning = e.act && e.act.anim === 'spin' && (e.state === 'windup' || e.state === 'strike');
    if (spinning || (e.state === 'strike' && T.boss && e.lunge > 0)) {
      ctx.strokeStyle = 'rgba(255,120,160,0.55)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, -60, 70 + i * 18, 18 + i * 4, 0, e.spinA + i, e.spinA + i + 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (!portrait) {
      drawTelegraph(e, beat, g, x, y + floatY * S - 150 * S);
      drawSpeech(e, x, y - 175 * S);
      if (!T.boss) drawEnemyHp(e, x, y + 14);
    }
  }

  function drawHat(L, hy, time) {
    const c = L.hatColor;
    switch (L.hat) {
      case 'top':
        ctx.fillStyle = c;
        ctx.fillRect(-9, hy - 40, 26, 30);
        ctx.fillRect(-15, hy - 12, 38, 5);
        ctx.fillStyle = L.band || '#7a1f2b';
        ctx.fillRect(-9, hy - 18, 26, 5);
        break;
      case 'bowler':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(4, hy - 12, 15, 13, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-14, hy - 13, 36, 4);
        break;
      case 'slick':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(1, hy - 8, 13, 8, -0.2, Math.PI, 0);
        ctx.fill();
        break;
      case 'bicorne':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(2, hy - 12, 26, 11, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-24, hy - 13, 52, 4);
        // 三色の花形帽章
        ctx.fillStyle = '#203a8a';
        ctx.beginPath();
        ctx.arc(10, hy - 16, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(10, hy - 16, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c8202a';
        ctx.beginPath();
        ctx.arc(10, hy - 16, 1.8, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bearskin':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(3, hy - 28, 16, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(-10 + i * 4.5, hy - 46 + Math.abs(i - 3) * 3, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        if (L.plume) {
          ctx.fillStyle = L.plume;
          ctx.fillRect(14, hy - 46, 4, 18);
        }
        break;
      case 'shako':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-8, hy - 10);
        ctx.lineTo(16, hy - 10);
        ctx.lineTo(18, hy - 36);
        ctx.lineTo(-10, hy - 36);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(-10, hy - 12, 32, 4);
        ctx.fillStyle = '#e6c35a';
        ctx.fillRect(2, hy - 30, 6, 6);
        if (L.plume) {
          ctx.fillStyle = L.plume;
          ctx.beginPath();
          ctx.ellipse(4, hy - 44, 4, 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'tricorn':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(-18, hy - 10);
        ctx.lineTo(4, hy - 28);
        ctx.lineTo(26, hy - 10);
        ctx.lineTo(4, hy - 14);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e6c35a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (L.plume) {
          ctx.fillStyle = L.plume;
          ctx.beginPath();
          ctx.ellipse(-6, hy - 24, 12, 4, -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'jester': {
        const sw = Math.sin(time * 8) * 3;
        for (const [dx, col] of [[-10, c], [16, '#2c7a3a']]) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(-6, hy - 10);
          ctx.quadraticCurveTo(dx, hy - 30, dx + (dx < 0 ? -6 : 6) + sw, hy - 34);
          ctx.lineTo(14, hy - 10);
          ctx.fill();
          ctx.fillStyle = '#e6c35a';
          ctx.beginPath();
          ctx.arc(dx + (dx < 0 ? -6 : 6) + sw, hy - 34, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'halo':
        ctx.fillStyle = '#f6e6b0';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(-6 + i * 5, hy - 10 + Math.abs(i - 2), 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(4, hy - 26 + Math.sin(time * 4) * 2, 13, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'wig':
        ctx.fillStyle = c;
        for (const yy of [-6, 4]) {
          ctx.beginPath();
          ctx.ellipse(-8, hy + yy, 6, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.ellipse(3, hy - 10, 13, 7, 0, Math.PI, 0);
        ctx.fill();
        break;
      case 'longhair':
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(2, hy - 9, 14, 8, -0.1, Math.PI, 0);
        ctx.fill();
        break;
      case 'bald':
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, hy - 8, 4, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      default:
        break;
    }
  }

  function drawDrum(x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = '#f0ece0';
    ctx.fillRect(-12, -10, 24, 20);
    ctx.strokeStyle = '#c8202a';
    ctx.lineWidth = 3;
    ctx.strokeRect(-12, -10, 24, 20);
    ctx.strokeStyle = '#8a6a30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-12 + i * 8, -10);
      ctx.lineTo(-8 + i * 8, 10);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawViolin(x, y, rot, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(k, k);
    ctx.fillStyle = '#9a4a1a';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 9, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(10, -1.5, 18, 3);
    ctx.beginPath();
    ctx.arc(29, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 武器 (手の位置 hx, hy、腕の角度 a)
  function drawWeapon(L, hx, hy, a, charge) {
    const w = L.weapon;
    let tip = null;
    const along = (len, off = -0.4) => [hx + Math.cos(a + off) * len, hy + Math.sin(a + off) * len];
    const line = (len, color, width, off) => {
      const [ex, ey] = along(len, off);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      return [ex, ey];
    };
    if (w === 'cane' || w === 'umbrella') {
      tip = line(w === 'umbrella' ? 62 : 56, L.weaponColor || (w === 'umbrella' ? '#1a1a1a' : '#6b3e1e'), w === 'umbrella' ? 6 : 4);
      ctx.fillStyle = '#d9d9e0';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (w === 'tray') {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a + 1.57);
      ctx.fillStyle = '#d8dde4';
      ctx.beginPath();
      ctx.ellipse(0, -8, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-6, -22, 12, 10);
      ctx.restore();
      tip = along(24, 0);
    } else if (w === 'musket') {
      const [bx, bey] = along(-22, -0.4);
      ctx.strokeStyle = '#6b3e1e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx, bey);
      ctx.lineTo(...along(40));
      ctx.stroke();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(...along(30));
      ctx.lineTo(...along(62));
      ctx.stroke();
      tip = line(84, '#d8dde4', 2, -0.4);
    } else if (w === 'saber' || w === 'rapier' || w === 'sword') {
      const len = w === 'rapier' ? 70 : w === 'sword' ? 62 : 58;
      ctx.fillStyle = '#e6c35a';
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      if (w === 'saber') {
        const [ex, ey] = along(len);
        const [mx, my] = along(len * 0.55, -0.25);
        ctx.strokeStyle = '#e8eef4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
        tip = [ex, ey];
      } else tip = line(len, '#e8eef4', w === 'rapier' ? 2 : 5);
      if (w === 'sword') {
        const [gx, gy] = along(8);
        ctx.strokeStyle = '#7a7a76';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(a + 1.17) * 10, gy + Math.sin(a + 1.17) * 10);
        ctx.lineTo(gx - Math.cos(a + 1.17) * 10, gy - Math.sin(a + 1.17) * 10);
        ctx.stroke();
      }
    } else if (w === 'halberd') {
      const [bx, bey] = along(-30);
      ctx.strokeStyle = '#6b3e1e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(bx, bey);
      ctx.lineTo(...along(80));
      ctx.stroke();
      const [ax, ay] = along(70);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a - 0.4);
      ctx.fillStyle = '#d8dde4';
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-2, -20, 12, -16);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      tip = along(88);
    } else if (w === 'quill') {
      const [ex, ey] = along(56);
      ctx.strokeStyle = '#f4f2f8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = 'rgba(250,250,255,0.95)';
      ctx.save();
      ctx.translate((hx + ex) / 2, (hy + ey) / 2);
      ctx.rotate(a - 0.4);
      ctx.beginPath();
      ctx.ellipse(8, 0, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      tip = [ex, ey];
    } else if (w === 'lyre') {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a - 1.2);
      ctx.strokeStyle = '#ffd84a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.quadraticCurveTo(-12, -22, -4, -26);
      ctx.moveTo(8, 0);
      ctx.quadraticCurveTo(12, -22, 4, -26);
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 3, 0);
        ctx.lineTo(i * 2, -22);
      }
      ctx.stroke();
      ctx.restore();
      tip = along(24);
    } else if (w === 'drum') {
      tip = line(26, '#c89a50', 3);
    } else if (w === 'violin') {
      // 弓
      tip = line(64, '#2a1a10', 2.5, -0.5);
      const [ex, ey] = along(64, -0.5);
      ctx.strokeStyle = 'rgba(240,235,220,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...along(6, -0.62));
      ctx.lineTo(ex + 2, ey + 3);
      ctx.stroke();
    } else {
      tip = along(10);
    }
    if (charge && tip) {
      const rg = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 22);
      rg.addColorStop(0, 'rgba(255,90,90,0.9)');
      rg.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 防御の構え
  function drawShield(L, hx, hy, time) {
    const sh = L.shield;
    const col = L.shieldColor || '#15151a';
    if (sh === 'umbrella') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(hx + 26, hy - 46);
      ctx.quadraticCurveTo(hx + 52, hy, hx + 26, hy + 46);
      ctx.lineTo(hx + 8, hy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,190,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (sh === 'tray') {
      ctx.fillStyle = '#d8dde4';
      ctx.beginPath();
      ctx.ellipse(hx + 10, hy, 8, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a929e';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (sh === 'cape') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 40);
      ctx.quadraticCurveTo(hx + 40 + Math.sin(time * 8) * 4, hy, hx + 4, hy + 50);
      ctx.quadraticCurveTo(hx + 14, hy, hx - 6, hy - 40);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,190,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (sh === 'drum') {
      drawDrum(hx + 12, hy, 1.8);
    } else if (sh === 'buckler') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(hx + 12, hy, 12, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e6c35a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#e6c35a';
      ctx.beginPath();
      ctx.arc(hx + 14, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (sh === 'book') {
      ctx.fillStyle = col;
      ctx.fillRect(hx + 4, hy - 28, 12, 56);
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(hx + 14, hy - 26, 4, 52);
    } else if (sh === 'violin') {
      drawViolin(hx + 10, hy, -1.4, 1.5);
    }
  }

  // マリー・アントワネット
  function drawMarie(e, beat, g, portrait) {
    const x = e.x - (g ? g.camX : 0);
    const y = e.y;
    const time = g ? time : titleT;
    if (!portrait) shadow(x, e.z, 80);
    ctx.save();
    if (e.flash > 0) ctx.filter = `brightness(${1 + e.flash * 8})`;
    ctx.translate(x, y);
    if (e.dead) {
      ctx.globalAlpha = clamp(3.5 - e.deadT, 0.3, 1);
    }
    const spinning = e.act && e.act.anim === 'spin' && (e.state === 'windup' || e.state === 'strike');
    const bob = Math.sin((beat % 1) * Math.PI) * 3;
    ctx.scale(e.face, 1);
    // ドレス (大きく広がる)
    const dy = -10;
    const dg = ctx.createLinearGradient(-80, 0, 80, 0);
    dg.addColorStop(0, '#e9a3c4');
    dg.addColorStop(0.5, '#ffd6e8');
    dg.addColorStop(1, '#e9a3c4');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(-20, -100 - bob);
    ctx.lineTo(20, -100 - bob);
    ctx.quadraticCurveTo(70, -50, 84, dy);
    ctx.lineTo(-84, dy);
    ctx.quadraticCurveTo(-70, -50, -20, -100 - bob);
    ctx.fill();
    // フリル (回転するとしましまが流れる)
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) {
      const fx = -78 + i * 19.5 + (spinning ? ((e.spinA * 30) % 19.5) : 0);
      if (fx > 80) continue;
      ctx.beginPath();
      ctx.arc(fx, dy, 10, Math.PI, 0);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(200,90,150,0.5)';
    ctx.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
      const off = spinning ? Math.sin(e.spinA + i) * 20 : 0;
      ctx.beginPath();
      ctx.moveTo(i * 6, -96 - bob);
      ctx.quadraticCurveTo(i * 20 + off, -50, i * 24 + off, dy - 6);
      ctx.stroke();
    }
    // 上半身
    ctx.fillStyle = '#9fc4ea';
    ctx.beginPath();
    ctx.moveTo(-16, -140 - bob);
    ctx.lineTo(16, -140 - bob);
    ctx.lineTo(10, -96 - bob);
    ctx.lineTo(-10, -96 - bob);
    ctx.fill();
    ctx.fillStyle = '#ff8fbf';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, -134 + i * 12 - bob, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 首と頭
    const hy = -160 - bob;
    ctx.fillStyle = '#fbe3d2';
    ctx.fillRect(-4, hy + 8, 8, 14);
    ctx.beginPath();
    ctx.ellipse(2, hy, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f08ab0';
    ctx.beginPath();
    ctx.arc(9, hy + 4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(8, hy - 3, 3, 3);
    ctx.fillStyle = '#c03060';
    ctx.fillRect(9, hy + 8, 5, 2);
    // 盛り髪 (高く積み上げる)
    ctx.fillStyle = '#eef0f6';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(-2 + Math.sin(i) * 3, hy - 14 - i * 14, 20 - i * 1.5, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#ff7fb0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, hy - 40);
    ctx.quadraticCurveTo(0, hy - 30, 18, hy - 46);
    ctx.stroke();
    // 羽根
    ctx.strokeStyle = '#7ac8ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-6, hy - 90);
    ctx.quadraticCurveTo(-26, hy - 120, -10, hy - 140 + Math.sin(beat * Math.PI) * 4);
    ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath();
    ctx.arc(10, hy - 60, 5, 0, Math.PI * 2);
    ctx.fill();
    if (e.state === 'stun') {
      ctx.fillStyle = '#ffd84a';
      ctx.font = '20px serif';
      for (let i = 0; i < 4; i++) ctx.fillText('★', Math.cos(time * 5 + i * 1.6) * 30 - 6, hy - 40 + Math.sin(time * 5 + i * 1.6) * 8);
    }
    // 扇の腕
    let a = 0.6;
    let charge = false;
    if ((e.state === 'windup' || e.state === 'throw') && e.act) {
      const hb = e.act.hits[e.act.i];
      const st = e.act.i > 0 ? e.act.lastHit || e.act.start : e.act.start;
      const k = clamp((beat - st) / Math.max(0.01, hb - st), 0, 1);
      charge = e.act.kind === 'charge';
      a = lerp(0.6, -2.2, Math.min(1, k * 1.5));
    }
    if (e.state === 'strike') a = -2.2 + clamp(e.st / 0.12, 0, 1) * 3.0;
    if (e.state === 'guard') a = -0.3;
    const [hx, hy2] = arm(8, -130 - bob, a, 30, '#fbe3d2', 6);
    if (e.state === 'throw' && e.act && e.act.kind === 'cake') {
      drawShotArt('cake', hx, hy2 - 10, 0, 0.8);
    } else {
      // 扇子
      ctx.save();
      ctx.translate(hx, hy2);
      ctx.rotate(a + (e.state === 'guard' ? -1.2 : 0));
      const big = e.state === 'guard' ? 1.9 : 1;
      ctx.fillStyle = charge ? '#ff7a9a' : '#ffb3d1';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 34 * big, -0.8, 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#b0507a';
      ctx.lineWidth = 1.5;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(i * 0.25) * 34 * big, Math.sin(i * 0.25) * 34 * big);
        ctx.stroke();
      }
      if (e.state === 'guard') {
        ctx.strokeStyle = 'rgba(160,190,255,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 34 * big + 4, -0.8, 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (spinning) {
      ctx.strokeStyle = 'rgba(255,120,160,0.5)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, -50, 100 + i * 20, 22 + i * 4, 0, e.spinA + i, e.spinA + i + 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (!portrait) {
      drawTelegraph(e, beat, g, x + e.face * 70, y - 250);
      drawSpeech(e, x, y - 290);
    }
  }

  // ボスが投げる物: cake ケーキ / cannon 砲弾 / rose 薔薇 / note 音符
  const SHOT_ICON = { cake: '🍰', cannon: '●', rose: '🌹', note: '♪' };
  const SHOT_COLORS = {
    cake: ['#ffc3dc', '#fff', '#ff6f91'],
    cannon: ['#5a5a5a', '#ffb347', '#ffe0a0'],
    rose: ['#d9203f', '#ff8fa8', '#2c7a3a'],
    note: ['#ffd84a', '#ffffff', '#b8a0ff'],
  };
  function drawShotArt(art, x, y, rot, k = 1) {
    if (art === 'cake' || !art) return drawCake(x, y, rot, k);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(k, k);
    if (art === 'cannon') {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(-4, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(9, -10, 3 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (art === 'rose') {
      ctx.strokeStyle = '#2c7a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.lineTo(0, 24);
      ctx.stroke();
      ctx.fillStyle = '#2c7a3a';
      ctx.beginPath();
      ctx.ellipse(5, 14, 6, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9203f';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a0a20';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 光る音符
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      rg.addColorStop(0, 'rgba(255,240,170,0.9)');
      rg.addColorStop(1, 'rgba(184,160,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(-rot);
      ctx.fillStyle = '#1a1030';
      ctx.font = 'bold 34px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♫', 0, 0);
    }
    ctx.restore();
  }

  function drawCake(x, y, rot, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = '#fff3e0';
    rr(-18, -6, 36, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#ffb3d1';
    rr(-14, -18, 28, 13, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 6, -18, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d9203f';
    ctx.beginPath();
    ctx.arc(0, -24, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 攻撃の予告: 通常 = 黄色の「!」、ため = 赤い「!!」、ケーキ = 桃色。輪が縮んで重なった瞬間が当たる拍
  function drawTelegraph(e, beat, g, x, y) {
    if (e.dead) return;
    if (e.state === 'guard') {
      ctx.fillStyle = 'rgba(140,180,255,0.9)';
      ctx.font = `bold 20px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText('🛡', x, y + 10);
      ctx.textAlign = 'left';
      return;
    }
    if (!e.act) return;
    const a = e.act;
    const hb = a.hits[a.i];
    if (hb === undefined) return;
    const st = a.i > 0 ? a.lastHit || a.start : a.start;
    const k = clamp((beat - st) / Math.max(0.01, hb - st), 0, 1);
    const charge = a.kind === 'charge';
    const col = charge ? '#ff4a5a' : a.kind === 'cake' ? '#ff8fc0' : '#ffd84a';
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + Math.sin(k * Math.PI * 6) * 0.08;
    ctx.scale(pulse, pulse);
    // 縮む輪
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4 + k * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + (1 - k) * 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1020';
    ctx.font = `bold ${charge ? 20 : 24}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(charge ? '!!' : a.kind === 'cake' ? SHOT_ICON[e.T.shot] || '🍰' : '!', 0, 1);
    if (a.hits.length > 1) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold 13px ${SANS}`;
      ctx.fillText(`×${a.hits.length - a.i}`, 24, -14);
    }
    ctx.restore();
  }

  function drawSpeech(e, x, y) {
    if (!e.speech || e.speechT <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(e.speechT * 2, 0, 1);
    ctx.font = `bold 15px ${SANS}`;
    const w = ctx.measureText(e.speech).width + 20;
    const bx = clamp(x - w / 2, 8, W - w - 8);
    rr(bx, y - 26, w, 30, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.speech, bx + 10, y - 11);
    ctx.restore();
  }

  function drawEnemyHp(e, x, y) {
    if (e.dead || e.hp >= e.maxHp) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 24, y, 48, 5);
    ctx.fillStyle = '#ff6f6f';
    ctx.fillRect(x - 24, y, 48 * clamp(e.hp / e.maxHp, 0, 1), 5);
  }

  function drawJudgeLabel(g) {
    if (!g.laneJudge || g.cadenza) return;
    const lj = g.laneJudge;
    if (lj.label === 'MISS') return;
    const p = g.player;
    const J = JUDGE[lj.j];
    ctx.save();
    ctx.globalAlpha = clamp(lj.t * 3, 0, 1);
    ctx.fillStyle = lj.label.includes('JUST') ? '#8ff0ff' : J.color;
    ctx.font = `bold italic 16px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(20,10,30,0.8)';
    const y = p.y - 150 - (0.6 - lj.t) * 20;
    ctx.strokeText(lj.label, p.x - g.camX, y);
    ctx.fillText(lj.label, p.x - g.camX, y);
    ctx.restore();
  }

  // ---------- 下の拍の帯 (今は使っていない。カデンツァのガイドに置きかえた) ----------
  let LANE_Y = 506;
  const JUDGE_X = 300;
  const PX_PER_BEAT = 120;
  function drawLane(g, beat) {
    const m = g.music;
    if (!m) return;
    // スマホでは下に操作ボタンがあるので、帯は上に出す
    LANE_Y = touchMode ? 172 : 506;
    ctx.save();
    // 帯
    const grd = ctx.createLinearGradient(0, LANE_Y - 22, 0, LANE_Y + 22);
    grd.addColorStop(0, 'rgba(10,8,20,0)');
    grd.addColorStop(0.5, 'rgba(10,8,20,0.55)');
    grd.addColorStop(1, 'rgba(10,8,20,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, LANE_Y - 26, W, 52);
    // 五線
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, LANE_Y + i * 6);
      ctx.lineTo(W, LANE_Y + i * 6);
      ctx.stroke();
    }
    // 判定の線
    const jp = g.beatPulse;
    ctx.strokeStyle = `rgba(255,230,160,${0.6 + jp * 0.4})`;
    ctx.lineWidth = 3 + jp * 3;
    ctx.beginPath();
    ctx.moveTo(JUDGE_X, LANE_Y - 22);
    ctx.lineTo(JUDGE_X, LANE_Y + 22);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,230,160,${0.25 + jp * 0.35})`;
    ctx.beginPath();
    ctx.arc(JUDGE_X, LANE_Y, 14 + jp * 6, 0, Math.PI * 2);
    ctx.fill();
    // 拍の線 (敵の攻撃とジャストガードはこの上に来る)
    for (let bt = Math.ceil(beat - 1.5); bt < beat + 5.5; bt++) {
      const x = JUDGE_X + (bt - beat) * PX_PER_BEAT;
      const down = ((bt % m.song.beatsPerBar) + m.song.beatsPerBar) % m.song.beatsPerBar === 0;
      ctx.globalAlpha = bt < beat ? clamp(1 - (beat - bt) * 2, 0, 1) * 0.6 : clamp(1 - (bt - beat - 4) / 1.5, 0, 1) * 0.6;
      ctx.strokeStyle = down ? '#ffe7a0' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = down ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, LANE_Y - (down ? 18 : 13));
      ctx.lineTo(x, LANE_Y + (down ? 18 : 13));
      ctx.stroke();
    }
    // メロディの音 (攻撃はこれに合わせる。長い音ほど大きく、使った音は暗く)
    const mels = m.melBetween(beat - 1.5, beat + 5.5);
    for (const c of mels) {
      const x = JUDGE_X + (c.t - beat) * PX_PER_BEAT;
      const past = c.t < beat;
      const used = g.usedMel.has(Math.round(c.t * 4));
      const al = past ? clamp(1 - (beat - c.t) * 2, 0, 1) : clamp(1 - (c.t - beat - 4) / 1.5, 0, 1);
      ctx.globalAlpha = al * (used ? 0.35 : 1);
      const r = c.d >= 1 ? 7.5 : c.d >= 0.5 ? 6 : 4.2;
      // 音の高さで少し上下させる (五線の上の音符のように)
      const dy = clamp((c.p - 72) * -0.9, -12, 12);
      ctx.fillStyle = used ? '#ffd84a' : Number.isInteger(c.t) ? '#ffffff' : '#e6e0f2';
      ctx.beginPath();
      ctx.ellipse(x, LANE_Y + dy, r * 1.2, r * 0.9, -0.35, 0, Math.PI * 2);
      ctx.fill();
      if (c.d < 0.5) {
        // 8 分・16 分音符の旗
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + r * 1.1, LANE_Y + dy);
        ctx.lineTo(x + r * 1.1, LANE_Y + dy - 14);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 敵の攻撃の予告 (当たる拍に印)
    for (const e of g.enemies) {
      if (!e.act || e.dead) continue;
      for (let i = e.act.i; i < e.act.hits.length; i++) {
        const hb = e.act.kind === 'cake' ? e.act.hits[i] + 1 : e.act.hits[i];
        const x = JUDGE_X + (hb - beat) * PX_PER_BEAT;
        if (x < JUDGE_X - 20 || x > W) continue;
        const col = e.act.kind === 'charge' ? '#ff4a5a' : e.act.kind === 'cake' ? '#ff8fc0' : '#ffd84a';
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x, LANE_Y - 12);
        ctx.lineTo(x + 9, LANE_Y - 26);
        ctx.lineTo(x - 9, LANE_Y - 26);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, LANE_Y - 12);
        ctx.lineTo(x, LANE_Y + 14);
        ctx.stroke();
      }
    }
    // 空中のケーキ
    for (const s of g.shots) {
      if (s.kind !== 'cake' || s.done) continue;
      const x = JUDGE_X + (s.end - beat) * PX_PER_BEAT;
      if (x < JUDGE_X - 20 || x > W) continue;
      ctx.fillStyle = '#ff8fc0';
      ctx.beginPath();
      ctx.moveTo(x, LANE_Y - 12);
      ctx.lineTo(x + 9, LANE_Y - 26);
      ctx.lineTo(x - 9, LANE_Y - 26);
      ctx.fill();
    }
    // 判定の文字
    if (g.laneJudge) {
      const J = JUDGE[g.laneJudge.j];
      ctx.globalAlpha = clamp(g.laneJudge.t * 3, 0, 1);
      ctx.fillStyle = g.laneJudge.label === 'JUST' ? '#8ff0ff' : J.color;
      ctx.font = `bold italic 20px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText(g.laneJudge.label === 'MISS' ? '…' : g.laneJudge.label, JUDGE_X, LANE_Y - 30 - (0.6 - g.laneJudge.t) * 20);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ---------- HUD ----------
  function drawHud(g, beat) {
    const p = g.player;
    ctx.save();
    // 縦長の画面では、上に足した空 (OY) のぶん HUD を画面の上端へ寄せる。左右はノッチを避ける
    ctx.translate(SAFE_L, -OY);
    const fullW = W;
    W = fullW - SAFE_L - SAFE_R;
    try {
      drawHudBody(g, beat, p);
    } finally {
      W = fullW;
      ctx.restore();
    }
  }
  function drawHudBody(g, beat, p) {
    // 体力
    ctx.fillStyle = 'rgba(10,8,20,0.6)';
    rr(14, 12, 270, 46, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('L. v. ベートーヴェン', 26, 31);
    ctx.fillStyle = '#3a2a3a';
    ctx.fillRect(26, 38, 246, 10);
    const hpk = clamp(p.hp / p.maxHp, 0, 1);
    ctx.fillStyle = hpk > 0.5 ? '#6fe08a' : hpk > 0.25 ? '#ffd84a' : '#ff5a5a';
    ctx.fillRect(26, 38, 246 * hpk, 10);
    // 点数とコンボ
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `bold 22px ${SANS}`;
    ctx.fillText(String(g.score).padStart(7, '0'), W - 80, 36);
    if (g.combo >= 2) {
      const pop = 1 + g.beatPulse * 0.1;
      ctx.save();
      ctx.translate(W - 80, 66);
      ctx.scale(pop, pop);
      ctx.fillStyle = g.combo >= 20 ? '#ffd84a' : '#bfeaff';
      ctx.font = `bold italic 20px ${SANS}`;
      ctx.fillText(`${g.combo} COMBO`, 0, 0);
      ctx.restore();
    }
    // 曲名
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT}`;
    const songTxt = `♪ ${g.music ? `${g.music.song.composer}：${g.music.song.title}` : ''}`;
    ctx.fillStyle = 'rgba(10,8,20,0.45)';
    rr(292, 14, ctx.measureText(songTxt).width + 16, 22, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(songTxt, 300, 30);
    // 一時停止
    ctx.fillStyle = 'rgba(10,8,20,0.5)';
    rr(W - 62, 12, 48, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(W - 46, 22, 5, 20);
    ctx.fillRect(W - 35, 22, 5, 20);
    hotspots.push({ x: W - 62 + SAFE_L, y: 12 - OY, w: 48, h: 40, fn: pauseGame });
    // ボスの体力
    if (g.boss && g.stage === 'boss' && !g.bossIntro) {
      const b = g.boss;
      ctx.fillStyle = 'rgba(10,8,20,0.6)';
      rr(W / 2 - 220, 64, 440, 34, 8);
      ctx.fill();
      ctx.fillStyle = '#ffd6e8';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(b.T.name, W / 2, 80);
      ctx.fillStyle = '#3a2a3a';
      ctx.fillRect(W / 2 - 205, 85, 410, 7);
      ctx.fillStyle = '#ff7fb0';
      ctx.fillRect(W / 2 - 205, 85, 410 * clamp(b.hp / b.maxHp, 0, 1), 7);
    }
    // 道しるべ
    if (g.stage === 'street') {
      const prog = clamp(p.x / g.roadLen, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(300, 40, 300, 4);
      ctx.fillStyle = '#ffe7a0';
      ctx.fillRect(300, 40, 300 * prog, 4);
      ctx.font = '14px serif';
      ctx.fillText('👑', 600, 48);
    }
    if (g.goSign > 0 && !g.wave) {
      ctx.globalAlpha = Math.min(1, g.goSign) * (0.6 + Math.sin(g.time * 10) * 0.4);
      ctx.fillStyle = '#ffe7a0';
      ctx.font = `bold italic 40px ${SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText('GO ▶', W - 40, 220);
      ctx.globalAlpha = 1;
    }
    // ヒント
    if (g.hint && g.hintT > 0) {
      ctx.globalAlpha = clamp(g.hintT, 0, 1);
      ctx.font = `bold 16px ${SANS}`;
      ctx.textAlign = 'center';
      const tw = ctx.measureText(g.hint).width + 30;
      ctx.fillStyle = 'rgba(20,14,30,0.75)';
      rr(W / 2 - tw / 2, 108, tw, 34, 10);
      ctx.fill();
      ctx.fillStyle = '#fff6d8';
      ctx.fillText(g.hint, W / 2, 131);
      ctx.globalAlpha = 1;
    }
  }

  function drawTouchButtons() {
    if (!touchMode) return;
    ctx.save();
    // スティック: 押していないときは定位置に薄く出す
    const on = stick.id !== null;
    const bx = on ? stick.ox : STICK_HOME.x;
    const by = on ? stick.oy : STICK_HOME.y;
    ctx.globalAlpha = on ? 0.45 : 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, STICK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = on ? 0.9 : 0.5;
    ctx.strokeStyle = '#ffe7a0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffe7a0';
    ctx.beginPath();
    ctx.arc(bx + stick.x, by + stick.y, 28, 0, Math.PI * 2);
    ctx.fill();
    for (const b of TBTN) {
      const on = input[b.id];
      ctx.globalAlpha = on ? 0.7 : 0.35;
      ctx.fillStyle = b.id === 'attack' ? '#ffd84a' : b.id === 'guard' ? '#8fc0ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#1a1020';
      ctx.font = `bold ${b.r * 0.6}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x, b.y + 2);
    }
    ctx.restore();
  }

  // ---------- 演出の描画 ----------
  function drawFx(g) {
    const cx = g.camX;
    for (const r of g.rings) {
      ctx.globalAlpha = clamp(r.life / r.max, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x - cx, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const q of g.parts) {
      ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
      ctx.fillStyle = q.color;
      if (q.kind === 'note') {
        ctx.font = `${q.size}px serif`;
        ctx.fillText(q.glyph, q.x - cx, q.y);
      } else {
        ctx.fillRect(q.x - cx - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const t of g.texts) {
      const k = t.life / t.max;
      const sc = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.save();
      ctx.translate(t.x - cx, t.y);
      ctx.scale(sc, sc);
      ctx.globalAlpha = clamp(k * 2, 0, 1);
      ctx.font = `bold italic ${t.size}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,10,30,0.8)';
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    // FORTISSIMO の五線が画面を走る
    for (const s of g.staffFx) {
      const k = s.t / s.max;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#ffd84a';
      ctx.lineWidth = 3;
      const x0 = s.dir > 0 ? -W + k * W * 2.4 : W * 2 - k * W * 2.4;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 - W, s.y + i * 12 - 24);
        ctx.lineTo(x0 + W * 0.4, s.y + i * 12 - 24);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff3c4';
      ctx.font = '40px serif';
      for (let i = 0; i < 8; i++) ctx.fillText(pick(['♪', '♫', '♬']), x0 - i * 110, s.y - 30 + Math.sin(i * 2 + s.t * 10) * 20);
      ctx.restore();
    }
  }

  function drawShots(g, beat) {
    const cx = g.camX;
    for (const s of g.shots) {
      if (s.kind === 'wave') {
        ctx.save();
        ctx.translate(s.x - cx, s.y);
        ctx.scale(Math.sign(s.vx), 1);
        ctx.globalAlpha = clamp(s.life * 2, 0, 1);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 0 ? '#fff' : '#ffd84a';
          ctx.lineWidth = 6 - i * 1.5;
          ctx.beginPath();
          ctx.arc(-i * 18, 0, 46 - i * 6, -1.1, 1.1);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff3c4';
        ctx.font = '30px serif';
        ctx.fillText('♫', -10, 10);
        ctx.restore();
      } else if (s.kind === 'cake') {
        drawShotArt(s.owner ? s.owner.T.shot : 'cake', s.x - cx, s.y, s.rot || 0, 1.1);
        if (!s.reflected && !s.done) {
          // 落ちる場所の印
          const k = clamp((beat - s.start) / (s.end - s.start), 0, 1);
          ctx.strokeStyle = `rgba(255,143,192,${0.3 + k * 0.6})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(s.tx - cx, s.tz + 2, 40 - k * 16, 8, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (s.kind === 'heal') {
        ctx.save();
        ctx.translate(s.x - cx, s.y + Math.sin(g.time * 4) * 3);
        ctx.globalAlpha = s.life < 2 ? (Math.floor(s.life * 8) % 2 ? 0.4 : 1) : 1;
        ctx.fillStyle = '#fbf3dc';
        ctx.fillRect(-12, -15, 24, 30);
        ctx.strokeStyle = '#7a6a4a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(-9, -9 + i * 6);
          ctx.lineTo(9, -9 + i * 6);
          ctx.stroke();
        }
        ctx.fillStyle = '#2a8a4a';
        ctx.font = 'bold 14px serif';
        ctx.fillText('♪', -4, 4);
        ctx.restore();
      }
    }
  }

  function drawGame(g) {
    const beat = g.music ? g.music.beat(offsetMs / 1000) : 0;
    ctx.save();
    if (g.shake > 0) ctx.translate(rand(-g.shake, g.shake), rand(-g.shake, g.shake) * 0.6);
    drawBg(g.stage === 'street' ? g.def.road.bg : g.def.boss.bg, g, g.beatPulse, g.downPulse);
    // 金色の光 (ばっちり合ったとき)
    if (g.gold > 0) {
      ctx.fillStyle = `rgba(255,200,80,${g.gold * 0.18})`;
      ctx.fillRect(0, -OY, W, H + OY);
    }
    // 人物 (奥から)
    const list = [...g.enemies, g.player].sort((a, b) => a.z - b.z);
    for (const e of list) {
      const sx = e.x - g.camX;
      const k = depthScale(e.z);
      ctx.save();
      ctx.translate(sx, e.z);
      ctx.scale(k, k);
      ctx.translate(-sx, -e.z);
      if (e === g.player) drawBeethoven(e, beat, g);
      else drawFigure(e, beat, g);
      ctx.restore();
    }
    drawShots(g, beat);
    drawFx(g);
    ctx.restore();
    // 普段は音符のガイドを出さない (曲を聴いて合わせる)。判定の文字だけ頭の上に
    drawJudgeLabel(g);
    if (g.cadenza) drawCadenza(g, beat);
    drawHud(g, beat);
    drawTouchButtons();
    if (g.flash > 0) {
      ctx.globalAlpha = clamp(g.flash, 0, 1);
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, -OY, W, H + OY);
      ctx.globalAlpha = 1;
    }
    // 場面の切りかえ
    if (g.trans) {
      const t = g.trans.t;
      const a = t < 1.4 ? t / 1.2 : t < 2.6 ? 1 : 1 - (t - 2.6);
      ctx.fillStyle = `rgba(8,4,14,${clamp(a, 0, 1)})`;
      ctx.fillRect(0, -OY, W, H + OY);
      if (t > 1.0 && t < 3.4) {
        ctx.globalAlpha = clamp(Math.min(t - 1.0, 3.4 - t) * 2, 0, 1);
        ctx.fillStyle = '#ffe7a0';
        ctx.textAlign = 'center';
        ctx.font = `bold 40px ${FONT}`;
        ctx.fillText(g.def.boss.place, W / 2, H / 2 - 10);
        ctx.font = `18px ${FONT}`;
        ctx.fillStyle = '#fff';
        const bs = songOf(g.def.boss);
        ctx.fillText(`♪ ${bs.composer}：${bs.title}`, W / 2, H / 2 + 30);
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      }
    }
    if (g.stage === 'street' && g.time < 4) {
      ctx.save();
      ctx.globalAlpha = clamp(Math.min(g.time * 2, (4 - g.time) * 1.5), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 170, W, 96);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe7a0';
      ctx.font = `bold italic 18px ${SANS}`;
      ctx.fillText(`STAGE ${g.no}`, W / 2, 196);
      ctx.font = `bold 36px ${FONT}`;
      ctx.fillText(g.def.name, W / 2, 236);
      ctx.font = `14px ${SANS}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(`♪ ${g.music.song.composer}：${g.music.song.title}`, W / 2, 258);
      ctx.restore();
    }
    if (g.stage === 'boss' && g.bossIntro) {
      const k = clamp((beat + 2) / 2, 0, 1);
      ctx.save();
      const introB = 8 * (g.pulse || 1);
      ctx.globalAlpha = k * clamp((introB - beat) / 1.5, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 160, W, 90);
      ctx.fillStyle = '#ffd6e8';
      ctx.textAlign = 'center';
      ctx.font = `bold 38px ${FONT}`;
      ctx.fillText(g.boss.T.name, W / 2, 212);
      ctx.font = `15px ${SANS}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(`${Math.max(1, Math.ceil(introB - beat))} 拍後に開戦`, W / 2, 238);
      ctx.restore();
    }
    if (g.over) {
      const t = g.over.t;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(t - 0.5, 0, 1);
      if (g.over.kind === 'clear') {
        ctx.fillStyle = '#ffe7a0';
        ctx.font = `bold 64px ${FONT}`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(40,20,10,0.8)';
        ctx.strokeText('Bravo, Maestro!', W / 2, H / 2 - 40);
        ctx.fillText('Bravo, Maestro!', W / 2, H / 2 - 40);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, -OY, W, H + OY);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 48px ${FONT}`;
        ctx.fillText('演奏中断…', W / 2, H / 2 - 20);
      }
      ctx.restore();
    }
  }

  // ---------- タイトル ----------
  const titleBeethoven = makePlayer(250);
  function drawTitle(dt) {
    titleT += dt;
    const pulse = Math.pow(Math.max(0, Math.cos(titleT * Math.PI * 2 * (132 / 60) / 2)), 8);
    drawBg('vienna', null, pulse, 0);
    ctx.fillStyle = 'rgba(10,6,20,0.45)';
    ctx.fillRect(0, -OY, W, H + OY);
    const realW = W;
    hotDX = Math.round((W - 960) / 2);
    ctx.save();
    ctx.translate(hotDX, 0);
    W = 960;
    try {
      drawTitleBody();
    } finally {
      W = realW;
      ctx.restore();
      hotDX = 0;
    }
  }
  function drawTitleBody() {
    // 題
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe7a0';
    ctx.strokeStyle = 'rgba(40,20,10,0.9)';
    ctx.lineWidth = 6;
    ctx.font = `bold 58px ${FONT}`;
    ctx.strokeText('指揮棒ベートーヴェン', W / 2 + 90, 92);
    ctx.fillText('指揮棒ベートーヴェン', W / 2 + 90, 92);
    ctx.font = `italic 20px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('— Baton Beethoven: Allegro con Brio —', W / 2 + 90, 124);
    ctx.restore();
    // 主人公
    titleBeethoven.x = 170;
    titleBeethoven.y = 330;
    titleBeethoven.z = 330;
    titleBeethoven.face = 1;
    titleBeethoven.state = 'free';
    ctx.save();
    ctx.translate(-40, -60);
    ctx.scale(1.25, 1.25);
    drawBeethoven(titleBeethoven, 0, null);
    ctx.restore();
    // 遊び方
    ctx.save();
    ctx.fillStyle = 'rgba(20,14,30,0.78)';
    rr(330, 150, 600, 262, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,231,160,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffe7a0';
    ctx.font = `bold 17px ${SANS}`;
    ctx.fillText('音楽に合わせて戦え！', 352, 178);
    ctx.fillStyle = '#fff';
    ctx.font = `14px ${SANS}`;
    const lines = [
      '移動 矢印キー / WASD（左右と、奥・手前）',
      '攻撃 J / Z（短く押す）　ため攻撃 J / Z 長押し → 離す',
      '防御 K / X（押している間）',
      'メロディの音に合わせて攻撃すると威力と演出が倍増（16 分音符は連打で）',
      '敵の攻撃は拍の上。ぴったり防ぐと「ジャストガード」→ 完璧ならカデンツァ',
      'スマホ: 画面の左側がスティック、右下が 防 / 攻',
    ];
    lines.forEach((l, i) => ctx.fillText(l, 352, 200 + i * 21));
    // 三すくみ
    const cx = 520;
    const cy = 360;
    const nodes = [
      { label: '通常攻撃', x: cx, y: cy - 34, col: '#ffd84a' },
      { label: 'ため攻撃', x: cx + 120, y: cy + 26, col: '#ff6a7a' },
      { label: '防御', x: cx - 120, y: cy + 26, col: '#8fc0ff' },
    ];
    ctx.font = `bold 13px ${SANS}`;
    ctx.textAlign = 'center';
    const arrowsTxt = ['出かかりを潰す', '防御くずし', 'はじき返す'];
    for (let i = 0; i < 3; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % 3];
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      const ax = lerp(a.x, b.x, 0.22);
      const ay = lerp(a.y, b.y, 0.22);
      const bx = lerp(a.x, b.x, 0.78);
      const by = lerp(a.y, b.y, 0.78);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const ang = Math.atan2(by - ay, bx - ax);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.cos(ang - 0.4) * 10, by - Math.sin(ang - 0.4) * 10);
      ctx.lineTo(bx - Math.cos(ang + 0.4) * 10, by - Math.sin(ang + 0.4) * 10);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `11px ${SANS}`;
      ctx.fillText(arrowsTxt[i], (a.x + b.x) / 2 + (i === 1 ? 0 : i === 0 ? 40 : -40), (a.y + b.y) / 2 + (i === 1 ? 18 : -4));
    }
    for (const n of nodes) {
      ctx.fillStyle = n.col;
      rr(n.x - 42, n.y - 13, 84, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#1a1020';
      ctx.font = `bold 13px ${SANS}`;
      ctx.fillText(n.label, n.x, n.y + 5);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9c3d8';
    ctx.font = `12px ${SANS}`;
    ctx.fillText('強い ← 矢印の向きに勝つ', 730, 404);
    ctx.restore();

    hotspots = [];
    const blink = 0.6 + Math.sin(titleT * 4) * 0.4;
    ctx.globalAlpha = blink;
    button(W / 2 - 40, 418, 260, 50, '▶ 演奏開始 (Enter)', toSelect, { size: 22 });
    ctx.globalAlpha = 1;
    // タイミング調整
    ctx.fillStyle = '#fff';
    ctx.font = `13px ${SANS}`;
    ctx.fillText(`タイミング調整 ${offsetMs > 0 ? '+' : ''}${offsetMs} ms`, 30, 448);
    ctx.fillStyle = '#c9c3d8';
    ctx.font = `11px ${SANS}`;
    ctx.fillText('判定が遅く感じたら + (] キー)', 30, 466);
    button(200, 432, 34, 26, '−', () => setOffset(offsetMs - 10), { size: 16 });
    button(240, 432, 34, 26, '+', () => setOffset(offsetMs + 10), { size: 16 });
    const cleared = Object.keys(progress.best).length;
    if (cleared > 0) {
      ctx.fillStyle = '#ffe7a0';
      ctx.font = `14px ${SANS}`;
      ctx.fillText(`クリアしたステージ ${cleared} / ${STAGES.length}${progress.allClear ? '　全曲制覇！' : ''}`, 30, 420);
    }
    // 読みこみ
    if (Audio.ctx && Audio.samplesTotal) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `11px ${SANS}`;
      ctx.fillText(Audio.samplesReady ? 'ピアノの音: 準備完了' : `ピアノの音を読みこみ中 ${Math.round((Audio.samplesLoaded / Audio.samplesTotal) * 100)}%`, 30, 520);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `11px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText('音楽: W. A. モーツァルト / 譜面 Mutopia Project (CC BY-SA 3.0) / ピアノ Salamander Grand Piano (CC BY 3.0)', W - 16, 520);
    ctx.fillText('ボス曲はこのゲーム用の短い編曲です', W - 16, 534);
    ctx.textAlign = 'left';
  }

  // ---------- ステージ選び ----------
  function drawSelect(dt) {
    titleT += dt;
    const def = STAGES[selNo - 1];
    drawBg(def.road.bg, null, 0, 0);
    hotspots = [];
    ctx.fillStyle = 'rgba(8,4,14,0.6)';
    ctx.fillRect(0, -OY, W, H + OY);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe7a0';
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText('演目を選ぶ', W / 2, 62);
    ctx.restore();
    // カード
    const n = STAGES.length;
    const cw = Math.min(170, (W - 60 - (n - 1) * 12) / n);
    const x0 = W / 2 - (n * cw + (n - 1) * 12) / 2;
    STAGES.forEach((st, i) => {
      const x = x0 + i * (cw + 12);
      const y = 92;
      const open = st.no <= progress.open;
      const sel = st.no === selNo;
      ctx.save();
      rr(x, y, cw, 214, 12);
      ctx.fillStyle = sel ? 'rgba(255,231,160,0.18)' : 'rgba(20,14,30,0.82)';
      ctx.fill();
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeStyle = sel ? '#ffe7a0' : 'rgba(255,231,160,0.35)';
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = open ? '#ffe7a0' : '#7a7488';
      ctx.font = `bold italic 14px ${SANS}`;
      ctx.fillText(`STAGE ${st.no}`, x + cw / 2, y + 26);
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = open ? '#fff' : '#7a7488';
      wrapText(open ? st.name : '？？？', x + cw / 2, y + 54, cw - 16, 20);
      if (open) {
        // ボスの小さな肖像
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + cw / 2, y + 128, 34, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.clip();
        const bt = st.boss.type;
        const fake = { x: x + cw / 2, y: y + 128 + (bt === 'marie' ? 96 : 112), z: y + 230, face: 1, T: ETYPES[bt], type: bt, state: 'idle', st: 0, hp: 1, maxHp: 1, flash: 0, walkT: 0, spinA: 0, deadT: 0, act: null };
        const k = bt === 'marie' ? 0.55 : 0.75;
        ctx.translate(fake.x, fake.y);
        ctx.scale(k, k);
        ctx.translate(-fake.x, -fake.y);
        drawFigure(fake, titleT, null, true);
        ctx.restore();
        ctx.fillStyle = '#c9c3d8';
        ctx.font = `12px ${SANS}`;
        ctx.fillText(ETYPES[bt].name.split(' ').pop(), x + cw / 2, y + 182);
        const pb = progress.best[st.no];
        ctx.fillStyle = pb ? '#ffd84a' : '#8a849a';
        ctx.font = `bold 13px ${SANS}`;
        ctx.fillText(pb ? `ランク ${pb.rank}　${pb.score}` : '未クリア', x + cw / 2, y + 202);
      } else {
        ctx.font = '40px serif';
        ctx.fillStyle = '#5a5468';
        ctx.fillText('🔒', x + cw / 2, y + 140);
      }
      ctx.restore();
      if (open) hotspots.push({ x, y, w: cw, h: 214, fn: () => (selNo === st.no ? startGame(st.no, false) : (selNo = st.no)) });
    });
    // 選んでいるステージの説明
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `14px ${SANS}`;
    const rs = songOf(def.road);
    const bs = songOf(def.boss);
    ctx.fillText(`道中 ♪ ${rs.composer}：${rs.title}`, W / 2, 334);
    ctx.fillText(`ボス ♪ ${bs.composer}：${bs.title}`, W / 2, 356);
    ctx.restore();
    button(W / 2 - 230, 380, 220, 52, '▶ 開演 (Enter)', () => startGame(selNo, false), { size: 20 });
    const bossOk = progress.best[selNo] || selNo < progress.open;
    if (bossOk) button(W / 2 + 10, 380, 220, 52, 'ボスから (B)', () => startGame(selNo, true), { size: 18 });
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `12px ${SANS}`;
      ctx.fillText('クリアすると、ボスから始められる', W / 2 + 20, 410);
    }
    button(30, 470, 140, 40, '‹ タイトル', toTitle, { size: 15 });
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `12px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText('← → で選ぶ。カードをもう一度押すと開演', W - 20, 495);
    ctx.textAlign = 'left';
  }
  function wrapText(text, cx, y, maxW, lh) {
    let line = '';
    let yy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = ch;
        yy += lh;
      } else line += ch;
    }
    ctx.fillText(line, cx, yy);
  }

  // ---------- 一時停止・結果 ----------
  function drawPause() {
    drawGame(game);
    hotspots = [];
    ctx.fillStyle = 'rgba(8,4,14,0.7)';
    ctx.fillRect(0, -OY, W, H + OY);
    ctx.fillStyle = '#ffe7a0';
    ctx.textAlign = 'center';
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText('— Fermata —', W / 2, 190);
    ctx.textAlign = 'left';
    button(W / 2 - 130, 240, 260, 50, '再開 (Esc)', resumeGame);
    button(W / 2 - 130, 306, 260, 50, 'ステージ選びへ (Q)', toSelect);
  }

  function drawResult(dt) {
    titleT += dt;
    drawBg(STAGES[result.no - 1][result.stage === 'boss' ? 'boss' : 'road'].bg, null, 0, 0);
    hotspots = [];
    ctx.fillStyle = 'rgba(8,4,14,0.72)';
    ctx.fillRect(0, -OY, W, H + OY);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = result.kind === 'clear' ? '#ffe7a0' : '#ffb0b0';
    ctx.font = `bold 46px ${FONT}`;
    ctx.fillText(result.kind === 'clear' ? '終演 ― 大喝采！' : '演奏中断', W / 2, 92);
    ctx.font = `16px ${SANS}`;
    ctx.fillStyle = '#fff';
    if (result.kind === 'fail') ctx.fillText(result.stage === 'boss' ? `${ETYPES[STAGES[result.no - 1].boss.type].name} に敗れた…` : `${STAGES[result.no - 1].name} の途中で力尽きた…`, W / 2, 124);
    else ctx.fillText(`STAGE ${result.no}「${STAGES[result.no - 1].name}」クリア`, W / 2, 124);
    const s = result.stats;
    const rows = [
      ['スコア', String(result.score)],
      ['最大コンボ', String(result.maxCombo)],
      ['PERFECT / GREAT', `${s.perfect} / ${s.great}`],
      ['ジャストガード（うち完璧）', `${s.just}（${s.just3 || 0}）`],
      ['カデンツァ 成功 / 回数', `${s.cadenzaPass || 0} / ${s.cadenza || 0}`],
      ['拍に合った割合', `${Math.round(result.rate * 100)}%`],
      ['受けたダメージ', String(s.dmgTaken)],
    ];
    ctx.font = `18px ${SANS}`;
    rows.forEach((r, i) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#c9c3d8';
      ctx.fillText(r[0], W / 2 - 20, 170 + i * 32);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(r[1], W / 2 + 10, 170 + i * 32);
    });
    if (result.kind === 'clear') {
      ctx.textAlign = 'center';
      ctx.fillStyle = result.rank === 'S' ? '#ffd84a' : '#fff';
      ctx.font = `bold 80px ${FONT}`;
      ctx.fillText(result.rank, W - 180, 260);
      ctx.font = `14px ${SANS}`;
      ctx.fillText('ランク', W - 180, 180);
      if (result.newBest) {
        ctx.fillStyle = '#ffd84a';
        ctx.fillText('ハイスコア更新！', W - 180, 290);
      }
    }
    ctx.restore();
    let y = 380;
    const no = result.no;
    const btns = [];
    if (result.kind === 'clear' && no < STAGES.length) btns.push([`次のステージへ (Enter)`, () => startGame(no + 1, false)]);
    if (result.kind === 'fail' && result.stage === 'boss') btns.push(['ボスから (B)', () => startGame(no, true)]);
    btns.push([result.kind === 'clear' ? 'もう一度 (R)' : '最初から (R)', () => startGame(no, false)]);
    btns.push(['ステージ選び (T)', toSelect]);
    const bw = 200;
    const gap = 14;
    const x0 = W / 2 - (btns.length * bw + (btns.length - 1) * gap) / 2;
    btns.forEach(([label, fn], i) => button(x0 + i * (bw + gap), y, bw, 50, label, fn, { size: 17 }));
    if (result.kind === 'clear' && no === STAGES.length) {
      ctx.fillStyle = '#ffd84a';
      ctx.font = `bold 18px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('全ステージ制覇！ 楽聖の指揮棒は、天上にまで届いた。', W / 2, y - 14);
      ctx.textAlign = 'left';
    }
    y += 70;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `12px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('拍にぴったり合わせた一撃ほど、指揮棒は輝く。', W / 2, y + 20);
    ctx.textAlign = 'left';
  }

  // ---------- ループ ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, OY * scale * dpr);
    ctx.textBaseline = 'alphabetic';
    if (scene === 'title') {
      drawTitle(dt);
    } else if (scene === 'play') {
      hotspots = [];
      update(dt);
      if (scene === 'play') drawGame(game);
    } else if (scene === 'pause') {
      drawPause();
    } else if (scene === 'result') {
      drawResult(dt);
    } else if (scene === 'select') {
      drawSelect(dt);
    }
    if (document.body.dataset.scene !== scene) document.body.dataset.scene = scene;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // テスト用の窓口 (ブラウザの開発ツールから)
  window.BB_DEBUG = {
    get game() {
      return game;
    },
    get scene() {
      return scene;
    },
    startGame,
    songOf,
    STAGES,
    cadenza: () => startCadenza(game, game.boss || game.enemies.find((e) => !e.dead), game.music.beat(offsetMs / 1000)),
  };
})();
