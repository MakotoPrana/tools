/*
 * SUMMIT ROUTES 本体
 *   描画 (three.js)、キャラクターの動き、カメラ、入力、表示、画面の流れ、地図と道案内、記録、効果音
 *   地形は terrain.js、難所の部品は obstacles.js、ダメージは hazards.js、道具は items.js、山のデータは mountains/
 */
(() => {
  'use strict';

  const I18N = window.SUMMIT_I18N;
  const ITEMS = window.SummitItems;
  const HZ = window.SummitHazards;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const DEG = Math.PI / 180;

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
  };

  // =====================================================================
  // 言語
  // =====================================================================
  function pickLang() {
    const saved = store.get('summit-lang');
    if (saved && I18N.ui[saved]) return saved;
    for (const l of navigator.languages || [navigator.language || 'ja']) {
      const code = String(l).toLowerCase();
      if (code.startsWith('ja')) return 'ja';
      if (code.startsWith('zh')) return 'zh';
      if (code.startsWith('ko')) return 'ko';
      if (code.startsWith('en')) return 'en';
    }
    return 'en';
  }
  let lang = pickLang();
  function t(key, vars) {
    let s = (I18N.ui[lang] && I18N.ui[lang][key]) ?? I18N.ui.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  const L = (obj) => (obj ? obj[lang] ?? obj.en ?? obj.ja ?? '' : '');
  function applyLang() {
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    for (const sec of document.querySelectorAll('section.help')) sec.hidden = sec.dataset.lang !== lang;
  }
  const langSelect = $('lang-select');
  for (const [code, label] of I18N.langs) {
    const o = document.createElement('option');
    o.value = code; o.textContent = label;
    langSelect.appendChild(o);
  }
  langSelect.value = lang;
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    store.set('summit-lang', lang);
    applyLang();
    refreshScreen();
  });
  applyLang();

  if (!window.THREE) { $('load-error').hidden = false; return; }

  // =====================================================================
  // 保存
  // =====================================================================
  const SAVE_KEY = 'summit-save';
  const PHOTO_KEY = 'summit-photos';
  function freshSave() {
    return {
      v: 1, mountains: {}, run: null, tools: [], bag: { herb: 1, food: 1 }, charms: 0,
      stats: { climb: 0, dist: 0, dmg: 0, falls: 0, deaths: 0, obs: {} },
    };
  }
  let save = freshSave();
  try {
    const raw = store.get(SAVE_KEY);
    if (raw) save = Object.assign(freshSave(), JSON.parse(raw));
  } catch (e) { save = freshSave(); }
  let photos = { views: {}, user: [] };
  try { const raw = store.get(PHOTO_KEY); if (raw) photos = Object.assign(photos, JSON.parse(raw)); } catch (e) { /* なくてもよい */ }
  const writeSave = () => store.set(SAVE_KEY, JSON.stringify(save));
  const writePhotos = () => {
    try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); }
    catch (e) {
      // 入りきらないときは自分で撮った古い写真から消す
      while (photos.user.length) { photos.user.shift(); try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photos)); return; } catch (e2) { /* もう1枚 */ } }
    }
  };
  function mrec(id) {
    if (!save.mountains[id]) save.mountains[id] = { cp: [], starts: [], edges: [], views: [], items: [], goals: {}, summit: false };
    return save.mountains[id];
  }
  const maxHearts = () => clamp(ITEMS.HP.start + Math.floor(save.charms / ITEMS.HP.charmsPerHeart), ITEMS.HP.start, ITEMS.HP.max);
  function totalViews() { let n = 0; for (const id in save.mountains) n += save.mountains[id].views.length; return n; }
  const maxStamina = () => 1 + 0.2 * Math.floor(totalViews() / 4);
  const hasTool = (id) => save.tools.includes(id);
  function statObs(type, ok) {
    const o = save.stats.obs[type] || (save.stats.obs[type] = [0, 0]);
    o[ok ? 0 : 1]++;
  }

  // =====================================================================
  // 効果音 (WebAudio で作る)
  // =====================================================================
  let soundOn = store.get('summit-sound') !== 'off';
  const soundBtn = $('sound-btn');
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    store.set('summit-sound', soundOn ? 'on' : 'off');
    if (windGain) windGain.gain.value = 0;
  });
  let actx = null, windGain = null, windFilter = null, noiseBuf = null;
  function audio() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        // 風の音 (ずっと鳴らして大きさを変える)
        const src = actx.createBufferSource();
        src.buffer = noiseBuf; src.loop = true;
        windFilter = actx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 400; windFilter.Q.value = 0.6;
        windGain = actx.createGain(); windGain.gain.value = 0;
        src.connect(windFilter).connect(windGain).connect(actx.destination);
        src.start();
      } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slide, delay) {
    if (!soundOn || !actx) return;
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, vol, q, delay) {
    if (!soundOn || !actx) return;
    const t0 = actx.currentTime + (delay || 0);
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(actx.destination);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  const SFX = {
    step: (soft) => noise(0.07, soft ? 900 : 600, soft ? 0.03 : 0.06, 1.2),
    plank: () => { noise(0.08, 300, 0.08, 2); tone(140 + Math.random() * 40, 0.08, 'triangle', 0.05); },
    creak: () => tone(220, 0.35, 'sawtooth', 0.04, 0.6),
    crack: () => { noise(0.25, 1800, 0.3, 0.8); tone(90, 0.3, 'square', 0.08, 0.5); },
    jump: () => tone(300, 0.12, 'triangle', 0.08, 1.6),
    land: () => noise(0.12, 300, 0.12, 0.8),
    hurt: () => { tone(220, 0.22, 'square', 0.12, 0.5); noise(0.1, 700, 0.12); },
    pick: () => { tone(660, 0.1, 'triangle', 0.1); tone(990, 0.16, 'triangle', 0.1, 1, 0.08); },
    tool: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, 1, i * 0.1)); },
    cp: () => { [392, 523, 659].forEach((f, i) => tone(f, 0.4, 'sine', 0.12, 1, i * 0.12)); },
    view: () => { [523, 784, 1046, 1318].forEach((f, i) => tone(f, 0.6, 'sine', 0.07, 1, i * 0.15)); },
    grab: () => noise(0.06, 1200, 0.08, 2),
    whoosh: () => noise(0.35, 700, 0.12, 0.6),
    rumble: () => { noise(1.2, 120, 0.25, 0.7); },
    cut: () => { noise(0.12, 2500, 0.15, 1.5); noise(0.1, 1600, 0.12, 1.5, 0.12); },
    drink: () => { tone(500, 0.08, 'sine', 0.08, 1.4); tone(560, 0.08, 'sine', 0.08, 1.4, 0.12); },
    shutter: () => { noise(0.05, 3000, 0.2, 2); noise(0.06, 2000, 0.15, 2, 0.07); },
    arrive: () => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 1, i * 0.13)); },
    gust: () => noise(1.6, 500, 0.12, 0.5),
  };

  // =====================================================================
  // 描画の準備
  // =====================================================================
  const canvas = $('view');
  const gameEl = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 26000);
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x5d6b45, 0.75);
  const sun = new THREE.DirectionalLight(0xfff1dc, 0.85);
  sun.position.set(0.45, 0.8, 0.35);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog(0xcfe3f2, 200, 1200);
  const SKY = new THREE.Color(0xcfe3f2);

  function resize() {
    const w = gameEl.clientWidth, h = gameEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- 山 ----
  let W = null, S = null, O = null, mountainId = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.body.appendChild(s);
    });
  }
  async function loadMountain(id) {
    if (mountainId === id) return;
    showScreen('loading');
    await new Promise((r) => setTimeout(r, 30));
    const entry = window.SUMMIT_MOUNTAIN_LIST.find((m) => m.id === id);
    if (!window.SUMMIT_MOUNTAINS || !window.SUMMIT_MOUNTAINS[id]) await loadScript(entry.file + '?v=1');
    // 前の山を片付ける
    while (scene.children.length) scene.remove(scene.children[0]);
    scene.add(hemi, sun, player.group, shadowBlob, guide, hookLine, rain);
    W = window.SummitTerrain.build(window.SUMMIT_MOUNTAINS[id]);
    S = window.SummitTerrain.createScene(W, scene);
    O = window.SummitObstacles.create(W, scene);
    mountainId = id;
    const mr = mrec(id);
    for (const uid of mr.items) O.setTaken(uid, true);
    for (const cp of mr.cp) O.setFlag(cp, true);
    mapImage = null;
  }

  // =====================================================================
  // キャラクター
  // =====================================================================
  function makeHiker() {
    const g = new THREE.Group();
    const m = (c) => new THREE.MeshLambertMaterial({ color: c });
    const shirt = m(0xe0562f), pants = m(0x34465c), skin = m(0xf1c9a5), pack = m(0x2f6fb3), hat = m(0xe8d9b0), boot = m(0x4a3528);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.3), shirt);
    body.position.y = 1.12; g.add(body);
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.24), pack);
    backpack.position.set(0, 1.15, -0.26); g.add(backpack);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 8), m(0xd1a03a));
    roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.46, -0.26); g.add(roll);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    head.position.y = 1.6; g.add(head);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 14), hat);
    brim.position.y = 1.7; g.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 12), hat);
    crown.position.y = 1.78; g.add(crown);
    const limb = (w, h, mat, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      mesh.position.y = -h / 2;
      pivot.add(mesh);
      g.add(pivot);
      return pivot;
    };
    const armL = limb(0.13, 0.56, shirt, -0.31, 1.38), armR = limb(0.13, 0.56, shirt, 0.31, 1.38);
    const legL = limb(0.17, 0.82, pants, -0.12, 0.82), legR = limb(0.17, 0.82, pants, 0.12, 0.82);
    for (const leg of [legL, legR]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.28), boot);
      b.position.set(0, -0.78, 0.04); leg.add(b);
    }
    return { group: g, armL, armR, legL, legR, body };
  }
  const player = makeHiker();
  scene.add(player.group);
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2;
  scene.add(shadowBlob);
  // 次のチェックポイントの目印
  const guide = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.85, fog: false }));
  scene.add(guide);
  // 鉤縄の縄
  const hookLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xd8c08a }));
  hookLine.visible = false; hookLine.frustumCulled = false;
  scene.add(hookLine);
  // 雨
  const RAIN_N = 1400;
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 3), 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xcfe0ee, size: 0.09, transparent: true, opacity: 0.7 }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);

  // 動きの定数
  const G = 22;
  const JUMP_V = 7.1;
  const SPEED = { sneak: 1.5, walk: 4.2, run: 7.0 };
  const CLIMB_SPEED = 1.45;
  const MAX_WALK_SLOPE = Math.cos(45 * DEG);

  const P = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, state: 'ground',
    hp: 12, stamina: 1, exhausted: false, staminaShow: 0, takeoffY: 0, slideStartY: 0, slideT: 0,
    face: null, u: 0, v: 0, deck: null, s: 0, bal: 0, rope: null, hook: null, mantle: null, stunT: 0,
    rash: 0, rashTick: 0, flowerTick: 0, plantCd: 0, invuln: 0, foodT: 0, stepT: 0, stepSide: 1,
    anim: 0, speed: 0, mode: 'walk', jumpT: 0, slipT: 3, grabCd: 0, lastRope: null, edgeCd: 0,
  };

  // =====================================================================
  // 入力
  // =====================================================================
  const keys = new Set();
  const pressed = new Set(); // このフレームで押されたボタン
  let inputKind = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    Space: 'jump', ShiftLeft: 'run', ShiftRight: 'run', ControlLeft: 'sneak', ControlRight: 'sneak', KeyC: 'sneak',
    KeyE: 'use', KeyX: 'release', KeyP: 'photo', Escape: 'pause', Digit1: 'herb', Digit2: 'food', KeyQ: 'camL', KeyR: 'camR',
  };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (mode === 'play' || mode === 'photo') e.preventDefault();
    audio();
    inputKind = 'kb';
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());

  // カメラの向き
  let camYaw = 0, camPitch = 0.32, camDist = 6.5, camDistT = 6.5, camIdle = 0, camShake = 0;
  let camAuto = null; // { yaw, pitch, t } 展望スポットなど
  // マウス・タッチ
  const touch = { stickId: null, sx: 0, sy: 0, x: 0, y: 0, camId: null, cx: 0, cy: 0 };
  let mouseDrag = null;
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    if (mode !== 'play' && mode !== 'photo') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      inputKind = 'touch';
      showTouch(true);
      if (x < rect.width * 0.45 && touch.stickId === null && mode === 'play') {
        touch.stickId = e.pointerId; touch.sx = x; touch.sy = y; touch.x = x; touch.y = y;
      } else if (touch.camId === null) {
        touch.camId = e.pointerId; touch.cx = x; touch.cy = y;
      }
    } else {
      inputKind = 'kb';
      mouseDrag = { x: e.clientX, y: e.clientY };
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.pointerId === touch.stickId) { touch.x = x; touch.y = y; }
    else if (e.pointerId === touch.camId) {
      turnCamera((x - touch.cx) * 0.008, (y - touch.cy) * 0.006);
      touch.cx = x; touch.cy = y;
    } else if (mouseDrag && e.pointerType === 'mouse') {
      turnCamera((e.clientX - mouseDrag.x) * 0.006, (e.clientY - mouseDrag.y) * 0.005);
      mouseDrag.x = e.clientX; mouseDrag.y = e.clientY;
    }
  });
  const endPointer = (e) => {
    if (e.pointerId === touch.stickId) touch.stickId = null;
    if (e.pointerId === touch.camId) touch.camId = null;
    if (e.pointerType === 'mouse') mouseDrag = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { if (mode === 'play' || mode === 'photo') { camDistT = clamp(camDistT + Math.sign(e.deltaY) * 0.8, 3, 14); e.preventDefault(); } }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  function turnCamera(dx, dy) {
    camYaw -= dx;
    camPitch = clamp(camPitch + dy, -0.35, 1.25);
    camIdle = 0;
    camAuto = null;
  }
  // スマホのボタン
  const holdBtn = (el, name) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); audio(); inputKind = 'touch'; pressed.add(name); keys.add(name); el.classList.add('is-down'); });
    const up = () => { keys.delete(name); el.classList.remove('is-down'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  };
  holdBtn($('btn-jump'), 'jump');
  holdBtn($('btn-use'), 'use');
  holdBtn($('btn-release'), 'release');
  $('btn-photo').addEventListener('click', () => { pressed.add('photo'); });
  $('btn-pause').addEventListener('click', () => { pressed.add('pause'); });
  $('use-herb').addEventListener('click', () => pressed.add('herb'));
  $('use-food').addEventListener('click', () => pressed.add('food'));
  function showTouch(on) { $('touch').hidden = !on || mode !== 'play'; }

  // ゲームパッド
  let padPrev = {};
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const st = { lx: dz(gp.axes[0] || 0), ly: dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: dz(gp.axes[3] || 0),
      jump: b(0), run: b(1), release: b(2), photo: b(3), use: b(5), pause: b(9), herb: b(14), food: b(15) };
    for (const k of ['jump', 'release', 'photo', 'use', 'pause', 'herb', 'food']) if (st[k] && !padPrev[k]) { pressed.add(k); inputKind = 'pad'; }
    if (st.lx || st.ly || st.rx || st.ry) inputKind = 'pad';
    padPrev = st;
    return st;
  }

  // 移動の入力: カメラから見た向き (x 右、y 前) と大きさ
  function moveInput(pad) {
    let x = 0, y = 0, analog = false, mag = 0;
    if (keys.has('up')) y += 1;
    if (keys.has('down')) y -= 1;
    if (keys.has('left')) x -= 1;
    if (keys.has('right')) x += 1;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; mag = 1; }
    if (pad && (pad.lx || pad.ly)) { x = pad.lx; y = -pad.ly; mag = Math.min(1, Math.hypot(x, y)); analog = true; }
    if (touch.stickId !== null) {
      const dx = touch.x - touch.sx, dy = touch.y - touch.sy;
      const l = Math.hypot(dx, dy);
      const R = 55;
      if (l > 6) { x = dx / l; y = -dy / l; mag = Math.min(1, l / R); analog = true; }
    }
    if (analog && mag > 0) { const l = Math.hypot(x, y) || 1; x /= l; y /= l; }
    return { x, y, mag, analog };
  }

  // =====================================================================
  // 表示 (HUD)
  // =====================================================================
  const hud = $('hud');
  const heartsEl = $('hearts');
  const HEART_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath d='M12 21 C5 15 0 11 0 6 A6 6 0 0 1 12 3.5 A6 6 0 0 1 24 6 C24 11 19 15 12 21Z'/%3E%3C/svg%3E\")";
  let heartsKey = '';
  function drawHearts() {
    const n = maxHearts();
    const key = `${n}:${P.hp}`;
    if (key === heartsKey) return;
    heartsKey = key;
    heartsEl.textContent = '';
    for (let i = 0; i < n; i++) {
      const fill = clamp(P.hp - i * 4, 0, 4) / 4;
      const h = document.createElement('span');
      h.className = 'heart';
      h.style.cssText = `-webkit-mask:${HEART_MASK} center/contain no-repeat;mask:${HEART_MASK} center/contain no-repeat;background:conic-gradient(#ff4b5c 0 ${fill * 100}%, rgba(0,0,0,0.45) ${fill * 100}% 100%);display:inline-block;filter:drop-shadow(0 1px 1px #000)`;
      heartsEl.appendChild(h);
    }
  }
  const effectsEl = $('effects');
  let effectsKey = '';
  function drawEffects(windOn) {
    const list = [];
    if (P.rash > 0) list.push(['', t('rash')]);
    if (P.foodT > 0) list.push(['is-wind', t('fed')]);
    if (windOn) list.push(['is-wind', t('windy')]);
    const key = list.map((x) => x[1]).join('|');
    if (key === effectsKey) return;
    effectsKey = key;
    effectsEl.textContent = '';
    for (const [cls, txt] of list) { const s = document.createElement('span'); s.className = 'effect ' + cls; s.textContent = txt; effectsEl.appendChild(s); }
  }
  const toastEl = $('toast');
  let toastT = 0;
  function toast(msg, dur) { toastEl.textContent = msg; toastEl.classList.add('is-on'); toastT = dur || 2.6; }
  const bannerEl = $('banner');
  let bannerT = 0;
  function banner(main, sub, dur) {
    bannerEl.innerHTML = '';
    if (sub) { const s = document.createElement('small'); s.textContent = sub; bannerEl.appendChild(s); }
    bannerEl.appendChild(document.createTextNode(main));
    bannerEl.classList.add('is-on'); bannerT = dur || 3.5;
  }
  const promptEl = $('prompt');
  function setPrompt(txt, enabled) {
    if (!txt) { promptEl.classList.remove('is-on'); $('btn-use').hidden = true; return; }
    const keyLabel = inputKind === 'pad' ? 'RB' : 'E';
    promptEl.innerHTML = '';
    if (enabled && inputKind !== 'touch') { const k = document.createElement('span'); k.className = 'key'; k.textContent = keyLabel; promptEl.appendChild(k); }
    promptEl.appendChild(document.createTextNode(txt));
    promptEl.classList.toggle('is-off', !enabled);
    promptEl.classList.add('is-on');
    $('btn-use').hidden = !(enabled && inputKind === 'touch');
  }
  const vignette = $('vignette');
  let vignetteT = 0;
  const staminaEl = $('stamina'), stFill = $('st-fill'), stExtra = $('st-extra');
  const balEl = $('balance'), balMark = $('bal-mark');
  const ringEl = $('land-ring');
  const CIRC = 2 * Math.PI * 18, CIRC2 = 2 * Math.PI * 22;
  const proj = new THREE.Vector3();
  function toScreen(x, y, z) {
    proj.set(x, y, z).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * gameEl.clientWidth, y: (-proj.y * 0.5 + 0.5) * gameEl.clientHeight, ok: proj.z < 1 };
  }

  // =====================================================================
  // 地面と当たり
  // =====================================================================
  const info = {};
  const nrm = {};
  function groundAt(x, z) { return W.height(x, z, false, info); }

  // 登れる壁を探す (p から見て向き (dx, dz) へ動いたとき)
  function findFace(x, z, y, dx, dz) {
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    for (const f of O.faces) {
      const rx = x - f.ox, rz = z - f.oz;
      if (Math.abs(rx) > f.halfW + 8 || Math.abs(rz) > f.halfW + 8) continue;
      const n = rx * f.nx + rz * f.nz;
      const u = rx * f.tx + rz * f.tz;
      if (n > 0.9 || n < -0.6) continue;
      if (Math.abs(u) > f.halfW - 0.3) continue;
      if (y < f.y0 - 0.8 || y > f.y1 - 0.5) continue;
      if (dx * f.nx + dz * f.nz > -0.35) continue; // 壁に向かっていない
      return { f, u };
    }
    return null;
  }
  // 壁の上の縁に立っていて、外へ向かって歩いたとき
  function faceBelow(x, z, y, dx, dz) {
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl; dz /= dl;
    for (const f of O.faces) {
      const rx = x - f.ox, rz = z - f.oz;
      if (Math.abs(rx) > f.halfW + 8 || Math.abs(rz) > f.halfW + 8) continue;
      const n = rx * f.nx + rz * f.nz, u = rx * f.tx + rz * f.tz;
      if (n < -2.5 || n > 0.4 || Math.abs(u) > f.halfW - 0.4 || Math.abs(y - f.y1) > 0.7) continue;
      if (dx * f.nx + dz * f.nz < 0.5) continue;
      return { f, u };
    }
    return null;
  }
  function canGrip(f) {
    if (f.kind === 'smooth') return false;
    if (f.kind === 'ice') return hasTool('pickaxe');
    return true;
  }

  function collideStatic(x, z) {
    // 木・建物・やぶ: 押し出す
    for (const tr of S.treesNear(x, z)) {
      const dx = x - tr[0], dz = z - tr[1], d = Math.hypot(dx, dz), r = tr[2] + 0.32;
      if (d < r && d > 1e-4) { x = tr[0] + dx / d * r; z = tr[1] + dz / d * r; }
    }
    for (const b of O.blockers) {
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz), r = b.r + 0.3;
      if (d < r && d > 1e-4) { x = b.x + dx / d * r; z = b.z + dz / d * r; }
    }
    for (const b of O.brambles) {
      if (b.cut) continue;
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz), r = b.r;
      if (d < r && d > 1e-4) {
        x = b.x + dx / d * r; z = b.z + dz / d * r;
        if (!hasTool('gloves')) hurt(2, 'thorn', { x: dx / d * 3, z: dz / d * 3 });
        else if (P.plantCd <= 0) { toast(t('brambleBlock')); P.plantCd = 2; }
      }
    }
    // 海に出ない
    const r = Math.hypot(x, z), lim = W.M.terrain.coastR + 60;
    if (r > lim) { x *= lim / r; z *= lim / r; }
    return [x, z];
  }

  // =====================================================================
  // ダメージ
  // =====================================================================
  function hurt(q, kind, push) {
    if (q <= 0 || P.state === 'dead') return;
    if (kind !== 'fall' && kind !== 'abyss' && P.invuln > 0) return;
    P.hp = Math.max(0, P.hp - q);
    save.stats.dmg += Math.min(q, 99);
    run && (run.dmg += Math.min(q, 99));
    P.invuln = 0.8;
    vignetteT = 0.35;
    camShake = 0.25;
    SFX.hurt();
    if (push) { P.vx += push.x; P.vz += push.z; }
    if (P.hp <= 0) die(kind);
  }
  function die(kind) {
    P.state = 'dead';
    save.stats.deaths++;
    $('dead-text').textContent = t(kind === 'abyss' || kind === 'fall' ? 'deadFall' : 'deadHp');
    showScreen('dead');
    setTimeout(() => { if (P.state === 'dead') respawn(); }, 1800);
  }
  function landFrom(dropH, soft) {
    const r = HZ.fallDamage(dropH, soft);
    if (r.all) { hurt(999, 'fall'); save.stats.falls++; return; }
    if (r.dmg > 0) {
      hurt(r.dmg, 'fall');
      save.stats.falls++;
      if (run) run.falls++;
      P.stunT = r.stun;
      toast(t('fellM', { m: Math.round(dropH) }));
    } else if (dropH > 1.5) SFX.land();
  }

  // =====================================================================
  // キャラクターの動き (1/120 秒ずつ)
  // =====================================================================
  const STEP = 1 / 120;
  const cam = { f: { x: 0, z: -1 }, r: { x: 1, z: 0 } };
  let curIn = { x: 0, y: 0, mag: 0, analog: false };
  let runHeld = false, sneakHeld = false;
  let windNow = false;

  function worldInput() {
    const x = cam.r.x * curIn.x + cam.f.x * curIn.y;
    const z = cam.r.z * curIn.x + cam.f.z * curIn.y;
    return { x, z, mag: curIn.mag };
  }
  function moveMode() {
    if (sneakHeld || (curIn.analog && curIn.mag < 0.32)) return 'sneak';
    const wantRun = runHeld || (curIn.analog && curIn.mag > 0.92 && inputKind === 'touch');
    if (wantRun && !P.exhausted && P.stamina > 0) return 'run';
    return 'walk';
  }
  function useStamina(amount) {
    P.stamina = Math.max(0, P.stamina - amount);
    P.staminaShow = 1.5;
    if (P.stamina <= 0) P.exhausted = true;
  }
  function regenStamina(dt, mult) {
    const altK = lerp(1, 0.7, clamp(P.y / 1000, 0, 1));
    P.stamina = Math.min(maxStamina(), P.stamina + 0.32 * altK * (mult || 1) * dt);
    if (P.exhausted && P.stamina > 0.3 * maxStamina()) P.exhausted = false;
    if (P.stamina < maxStamina()) P.staminaShow = 1.2;
  }
  const drainK = () => (P.foodT > 0 ? 0.5 : 1);

  function setState(s) {
    P.state = s;
    if (s === 'air') { P.edgeCd = 0; }
    if (s === 'ground' || s === 'balance') P.lastRope = null;
  }
  function goAir(vx, vy, vz, fromY) {
    P.vx = vx; P.vy = vy; P.vz = vz;
    P.takeoffY = fromY != null ? fromY : P.y;
    setState('air');
  }

  function physics(dt) {
    if (!W) return;
    P.invuln = Math.max(0, P.invuln - dt);
    P.plantCd = Math.max(0, P.plantCd - dt);
    P.grabCd = Math.max(0, P.grabCd - dt);
    P.foodT = Math.max(0, P.foodT - dt);
    P.edgeCd = Math.max(0, P.edgeCd - dt);
    switch (P.state) {
      case 'ground': stepGround(dt); break;
      case 'slide': stepSlide(dt); break;
      case 'air': stepAir(dt); break;
      case 'climb': stepClimb(dt); break;
      case 'balance': stepBalance(dt); break;
      case 'swing': stepSwing(dt); break;
      case 'hook': stepHook(dt); break;
      case 'mantle': stepMantle(dt); break;
      default: break;
    }
    if (P.state !== 'dead') hazards(dt);
  }

  function stepGround(dt) {
    if (P.stunT > 0) { P.stunT -= dt; P.vx *= 0.8; P.vz *= 0.8; }
    const wi = worldInput();
    P.mode = moveMode();
    const surf = info.surf;
    const sp = SPEED[P.mode] * (curIn.analog && P.mode !== 'sneak' ? clamp(curIn.mag * 1.15, 0.4, 1) : 1);
    let tx = 0, tz = 0;
    if (P.stunT <= 0 && wi.mag > 0) { tx = wi.x * sp; tz = wi.z * sp; }
    // 地面の滑りやすさ
    const crampons = hasTool('crampons');
    let acc = 30;
    if (surf === 'snow' && !crampons) acc = 7;
    if (surf === 'ice' && !crampons) acc = 2.2;
    P.vx += clamp(tx - P.vx, -acc * dt, acc * dt) * (acc > 20 ? 1 : 1);
    P.vz += clamp(tz - P.vz, -acc * dt, acc * dt);
    if (acc > 20) { P.vx = lerp(P.vx, tx, Math.min(1, dt * 14)); P.vz = lerp(P.vz, tz, Math.min(1, dt * 14)); }
    // 滑る地面: 坂の下へ引っぱられる
    W.normal(P.x, P.z, nrm);
    if ((surf === 'ice' || surf === 'snow') && !crampons) {
      const k = surf === 'ice' ? 26 : 9;
      P.vx += nrm.x * k * dt; P.vz += nrm.z * k * dt;
    }
    // 風
    let push = windPush();
    if (push) { P.vx += push.x * dt * 6; P.vz += push.z * dt * 6; }
    if (P.mode === 'run' && Math.hypot(P.vx, P.vz) > 1) useStamina(0.11 * dt * drainK());
    else regenStamina(dt);

    // ジャンプ
    if (pressed.has('jump') && P.stunT <= 0) {
      pressed.delete('jump');
      goAir(P.vx, JUMP_V, P.vz, P.y);
      SFX.jump();
      return;
    }
    tryMoveGround(P.vx * dt, P.vz * dt, !!push);
    P.speed = Math.hypot(P.vx, P.vz);
    if (P.speed > 0.3) P.yaw = Math.atan2(P.vx, P.vz);
    footsteps(dt, P.speed);
  }

  function tryMoveGround(dx, dz, pushed) {
    if (dx === 0 && dz === 0) { snapGround(); return; }
    let nx = P.x + dx, nz = P.z + dz;
    [nx, nz] = collideStatic(nx, nz);
    // 橋に乗る
    for (const d of O.decks) {
      const pr = d.project(nx, nz);
      if (pr.s > 0.05 && pr.s < d.L - 0.05 && Math.abs(pr.l) < d.width / 2 + 1.0) {
        const dy = d.yAt(pr.s) - P.y;
        if (Math.abs(dy) < 1.3) { enterDeck(d, pr.s); return; }
      }
    }
    const gh = groundAt(nx, nz);
    const dy = gh - P.y;
    if (dy > 0.55) {
      // 段 (壁) にぶつかった
      const ff = findFace(nx, nz, P.y, dx, dz);
      if (ff && canGrip(ff.f) && P.stunT <= 0 && !P.exhausted && P.stamina > 0.05) { startClimb(ff.f, ff.u, P.y + 0.1); return; }
      if (ff && canGrip(ff.f) && P.exhausted && faceHintCd <= 0) { faceHintCd = 3; toast(t('tooTired')); }
      if (ff && !canGrip(ff.f)) hintFace(ff.f);
      slideAlong(dx, dz, pushed);
      return;
    }
    W.normal(nx, nz, nrm);
    if (dy > 0.02 && nrm.y < MAX_WALK_SLOPE) { slideAlong(dx, dz, pushed); return; }
    // 崖の縁: 歩いているときは止まる (走っている・風に押されているときは落ちる)
    const steepDown = dy < -0.6 || (dy < 0 && nrm.y < 0.66);
    // 登れる壁の上なら、向きを変えて下へつかまる
    if (steepDown && P.mode !== 'run' && !pushed && P.stunT <= 0) {
      const fb = faceBelow(P.x, P.z, P.y, dx, dz);
      if (fb && canGrip(fb.f) && !P.exhausted && P.stamina > 0.05) { startClimb(fb.f, fb.u, fb.f.y1 - 1.1); P.climbLock = 0.6; climbPos(); return; }
    }
    if (steepDown && P.mode !== 'run' && !pushed && P.edgeCd <= 0) {
      const l = Math.hypot(dx, dz) || 1;
      const fx = nx + dx / l * 1.0, fz = nz + dz / l * 1.0;
      if (P.y - groundAt(fx, fz) > 2.2) { P.vx = 0; P.vz = 0; snapGround(); return; }
    }
    const moved = Math.hypot(nx - P.x, nz - P.z);
    save.stats.dist += moved;
    if (run) run.dist = (run.dist || 0) + moved;
    P.x = nx; P.z = nz;
    if (dy < -0.6) { goAir(P.vx, 0, P.vz, P.y); return; }
    if (dy > 0) addClimb(dy);
    P.y = gh;
    if (nrm.y < MAX_WALK_SLOPE - 0.03) { P.slideStartY = P.y; P.slideT = 0; setState('slide'); }
  }
  function slideAlong(dx, dz, pushed) {
    // x と z を別々に試す
    for (const [ax, az] of [[dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      const nx = P.x + ax, nz = P.z + az;
      const gh = groundAt(nx, nz);
      W.normal(nx, nz, nrm);
      if (gh - P.y <= 0.55 && !(gh - P.y > 0.02 && nrm.y < MAX_WALK_SLOPE)) {
        if (P.y - gh > 0.6 && !pushed && P.mode !== 'run') continue;
        P.x = nx; P.z = nz; P.y = Math.max(P.y - 0.6, gh);
        if (P.y > gh + 0.3) goAir(0, 0, 0, P.y);
        return;
      }
    }
    P.vx *= 0.5; P.vz *= 0.5;
    snapGround();
  }
  function snapGround() {
    const gh = groundAt(P.x, P.z);
    if (gh < P.y - 0.6) goAir(P.vx, 0, P.vz, P.y);
    else P.y = gh;
  }
  function addClimb(dy) { if (run) run.climb += dy; save.stats.climb += dy; }

  function footsteps(dt, speed) {
    if (speed < 0.5) { P.stepT = 0; return; }
    P.stepT += dt * speed / 1.6;
    if (P.stepT > 1) {
      P.stepT -= 1;
      if (P.state === 'balance' && P.deck && P.deck.kind === 'bridge') {
        SFX.plank();
        // 一歩ごとに橋を左右どちらかへ押す (向きはばらばら。そっと歩けば小さい)
        const k = P.mode === 'sneak' ? 0.02 : P.mode === 'run' ? 0.34 : 0.15;
        P.deck.impulse((Math.random() < 0.5 ? -1 : 1) * k * (0.6 + Math.random() * 0.8));
      } else SFX.step(P.mode === 'sneak');
    }
  }

  function stepSlide(dt) {
    W.normal(P.x, P.z, nrm);
    const g = 16;
    P.vx += nrm.x * g * dt; P.vz += nrm.z * g * dt;
    const wi = worldInput();
    P.vx += wi.x * 2 * dt; P.vz += wi.z * 2 * dt;
    P.vx *= Math.pow(0.7, dt); P.vz *= Math.pow(0.7, dt);
    let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
    [nx, nz] = collideStatic(nx, nz);
    const gh = groundAt(nx, nz);
    if (gh > P.y + 0.55) { P.vx *= -0.2; P.vz *= -0.2; return; }
    P.x = nx; P.z = nz;
    if (gh < P.y - 0.8) { goAir(P.vx, 0, P.vz, P.slideStartY); return; }
    P.y = gh;
    W.normal(P.x, P.z, nrm);
    if (nrm.y > Math.cos(40 * DEG)) {
      P.slideT += dt;
      if (P.slideT > 0.12) {
        const drop = P.slideStartY - P.y;
        setState('ground');
        landFrom(drop, info.surf === 'snow');
      }
    } else P.slideT = 0;
    P.yaw = Math.atan2(P.vx, P.vz);
    regenStamina(dt, 0.3);
  }

  function stepAir(dt) {
    // 空中では向きを少し変えられるが、速くはならない
    const wi = worldInput();
    const hs0 = Math.hypot(P.vx, P.vz);
    P.vx += wi.x * 4 * dt; P.vz += wi.z * 4 * dt;
    const hs = Math.hypot(P.vx, P.vz), maxH = Math.max(SPEED.walk * 0.8, hs0);
    if (hs > maxH) { P.vx *= maxH / hs; P.vz *= maxH / hs; }
    P.vy -= G * dt;
    const push = windPush();
    if (push) { P.vx += push.x * dt * 4; P.vz += push.z * dt * 4; }
    const prevY = P.y;
    let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
    let ny = P.y + P.vy * dt;
    [nx, nz] = collideStatic(nx, nz);
    // ロープにつかまる
    if (P.grabCd <= 0 && grabRope(nx, ny, nz)) return;
    // 橋に降りる
    for (const d of O.decks) {
      const pr = d.project(nx, nz);
      if (pr.s > 0 && pr.s < d.L && Math.abs(pr.l) < d.width / 2 + 0.25 && !d.hole(pr.s)) {
        const dyk = d.yAt(pr.s);
        if (prevY >= dyk - 0.05 && ny <= dyk && P.vy <= 0) {
          P.x = nx; P.z = nz; P.y = dyk;
          landFrom(P.takeoffY - dyk, false);
          if (P.state === 'dead') return;
          d.impulse((Math.random() < 0.5 ? -1 : 1) * clamp(-P.vy * 0.06, 0.1, 0.8));
          enterDeck(d, pr.s);
          P.bal += (Math.random() - 0.5) * 0.5;
          return;
        }
      }
    }
    let gh = groundAt(nx, nz);
    if (ny < gh && gh - P.y > 0.6 && gh > prevY + 0.4) {
      // 横から壁にぶつかった: つかめればつかまる。だめなら横には進まない
      const ff = findFace(nx, nz, P.y, P.vx, P.vz);
      if (ff && canGrip(ff.f) && P.stamina > 0 && !P.exhausted) { startClimb(ff.f, ff.u, Math.max(P.y, ff.f.y0) + 0.1); return; }
      if (ff) hintFace(ff.f);
      P.vx *= -0.15; P.vz *= -0.15;
      nx = P.x; nz = P.z;
      gh = groundAt(nx, nz);
    }
    if (ny < gh) {
      P.x = nx; P.z = nz; P.y = gh;
      const drop = P.takeoffY - gh;
      // 深い谷
      if (info.gorge && info.gorge.abyss && gh < info.gorge.y - 12) { hurt(999, 'abyss'); return; }
      W.normal(P.x, P.z, nrm);
      if (nrm.y < MAX_WALK_SLOPE - 0.03) { P.slideStartY = P.takeoffY; P.slideT = 0; setState('slide'); return; }
      setState('ground');
      P.vy = 0;
      landFrom(drop, info.surf === 'snow' || info.surf === 'gorge' && !info.gorge.abyss);
      return;
    }
    // 空中で壁につかまる
    if (P.vy < 2) {
      const ff = findFace(nx, nz, ny, P.vx, P.vz);
      if (ff && canGrip(ff.f) && !P.exhausted && P.stamina > 0) {
        const rx = nx - ff.f.ox, rz = nz - ff.f.oz;
        if (rx * ff.f.nx + rz * ff.f.nz < 0.5) { startClimb(ff.f, ff.u, ny); return; }
      }
    }
    P.x = nx; P.z = nz; P.y = ny;
    if (info.gorge && info.gorge.abyss && P.y < info.gorge.y - 30) { hurt(999, 'abyss'); return; }
    if (P.y < W.M.terrain.seaY - 30) { hurt(999, 'abyss'); }
  }

  // ---- 壁登り ----
  function startClimb(f, u, v) {
    P.face = f;
    P.u = clamp(u, -f.halfW + 0.4, f.halfW - 0.4);
    P.v = clamp(v, f.y0, f.y1 - 0.2);
    P.vx = P.vy = P.vz = 0;
    P.climbStartV = P.v;
    P.rappel = false;
    setState('climb');
    SFX.grab();
    if (f.kind === 'thorn' && !hasTool('gloves')) toast(t('thornWall'));
  }
  function climbPos() {
    const f = P.face;
    P.x = f.ox + f.tx * P.u + f.nx * 0.42;
    P.z = f.oz + f.tz * P.u + f.nz * 0.42;
    P.y = P.v;
    P.yaw = Math.atan2(-f.nx, -f.nz);
  }
  function onLedge() {
    const f = P.face;
    for (const l of f.ledges) if (Math.abs(P.v - l.v) < 0.5 && P.u > l.u0 && P.u < l.u1) return true;
    return false;
  }
  function letGo(push, reason) {
    const f = P.face;
    P.face = null;
    goAir(f.nx * (push || 1.5), 0, f.nz * (push || 1.5), P.y);
    P.grabCd = 0.4;
    if (reason) statObs('wall', false);
  }
  function stepClimb(dt) {
    const f = P.face;
    // 入力は世界の向きで見る: 壁へ向かう = 上、壁から離れる = 下、壁に沿う = 横
    // (カメラが壁を向いていれば「前」で登り、崖の上から外を見ていれば「前」で降りる)
    const wi = worldInput();
    let du = 0, dv = 0;
    P.climbLock = Math.max(0, (P.climbLock || 0) - dt);
    if (P.jumpT > 0) {
      P.jumpT -= dt;
      dv = 1.6 / 0.3;
    } else if (P.stunT <= 0) {
      du = (wi.x * f.tx + wi.z * f.tz) * CLIMB_SPEED;
      dv = -(wi.x * f.nx + wi.z * f.nz) * CLIMB_SPEED;
      const l = Math.hypot(du, dv);
      if (l > CLIMB_SPEED) { du *= CLIMB_SPEED / l; dv *= CLIMB_SPEED / l; }
    }
    if (P.rappel) { du = 0; dv = -(wi.x * f.nx + wi.z * f.nz) * 2.0; }
    const moving = Math.abs(du) + Math.abs(dv) > 0.05;
    // スタミナ
    if (!P.rappel) {
      let k = moving ? 0.1 : 0.022;
      if (f.kind === 'ladder' || f.kind === 'chain') k *= 0.4;
      if (f.overhang) k *= 1.5;
      if (weather === 'rain') k *= 1.3;
      k *= drainK();
      if (onLedge() && !moving) regenStamina(dt, 0.8);
      else useStamina(k * dt);
    }
    // 飛びつき
    if (pressed.has('jump') && !P.rappel && P.jumpT <= 0) {
      pressed.delete('jump');
      if (P.stamina > 0.05) { useStamina(0.25); P.jumpT = 0.3; SFX.jump(); }
    }
    if (pressed.has('release')) { pressed.delete('release'); letGo(1.5); return; }
    if (P.stamina <= 0 && !P.rappel) { toast(t('noStamina')); letGo(1.0, true); return; }
    // 雨で手が滑る
    if (weather === 'rain' && !hasTool('gloves') && !P.rappel) {
      P.slipT -= dt;
      if (P.slipT <= 0) { P.slipT = 3 + Math.random() * 4; P.v = Math.max(f.y0, P.v - 0.6); toast(t('slip'), 1.2); SFX.grab(); }
    }
    P.u = clamp(P.u + du * dt, -f.halfW + 0.4, f.halfW - 0.4);
    P.v += dv * dt;
    // イバラ
    if (f.thorns.length && !hasTool('gloves')) {
      const hv = P.v + 1.5;
      for (const th of f.thorns) {
        if (P.u > th.u0 - 0.2 && P.u < th.u1 + 0.2 && hv > th.v0 && P.v + 0.3 < th.v1) {
          hurt(2, 'thorn'); letGo(2, true);
          return;
        }
      }
    }
    // 下: 地面に着いたら降りる
    const footX = f.ox + f.tx * P.u + f.nx * 0.9, footZ = f.oz + f.tz * P.u + f.nz * 0.9;
    const below = groundAt(footX, footZ);
    if (P.v <= below + 0.02 && dv <= 0) {
      P.v = below;
      P.face = null;
      P.x = footX; P.z = footZ; P.y = below;
      setState('ground');
      return;
    }
    // 上: 縁を越える
    if (P.v >= f.y1 - 1.0 && dv > 0 && P.climbLock <= 0) {
      const tx = f.ox + f.tx * P.u - f.nx * 1.0, tz = f.oz + f.tz * P.u - f.nz * 1.0;
      P.mantle = { x0: P.x, y0: P.y, z0: P.z, x1: tx, y1: groundAt(tx, tz), z1: tz, t: 0 };
      statObs('wall', true);
      P.face = null;
      setState('mantle');
      return;
    }
    P.v = Math.min(P.v, f.y1 - 0.95);
    climbPos();
    P.speed = moving ? 1 : 0;
  }
  function stepMantle(dt) {
    const m = P.mantle;
    m.t += dt / 0.45;
    const k = smooth(m.t);
    P.x = lerp(m.x0, m.x1, k); P.z = lerp(m.z0, m.z1, k);
    P.y = lerp(m.y0, m.y1, Math.min(1, k * 1.6));
    if (m.t >= 1) { addClimb(Math.max(0, m.y1 - m.y0)); P.x = m.x1; P.y = m.y1; P.z = m.z1; P.vx = P.vz = 0; setState('ground'); }
  }
  let faceHintCd = 0;
  function hintFace(f) {
    if (faceHintCd > 0) return;
    faceHintCd = 3;
    if (f.kind === 'ice' && !hasTool('pickaxe')) toast(t('needPickaxe'));
    else if (f.kind === 'smooth') toast(hasTool('rope') ? t('useRopeHere') : t('needRope'));
  }

  // ---- 橋 ----
  function enterDeck(d, s) {
    P.deck = d; P.s = s; P.bal = P.bal || 0;
    setState('balance');
    P.balT = 0;
    P.vx = P.vz = P.vy = 0;
  }
  function stepBalance(dt) {
    const d = P.deck;
    const wi = worldInput();
    P.mode = moveMode();
    if (P.mode === 'run' && d.kind === 'log') P.mode = 'walk';
    const along = wi.x * d.ux + wi.z * d.uz;
    const lat = wi.x * d.px + wi.z * d.pz;
    const sp = (P.mode === 'sneak' ? 1.2 : P.mode === 'run' ? 4.6 : 2.6) * (d.kind === 'log' ? 0.85 : 1);
    const v = clamp(along * 1.6, -1, 1) * sp * (wi.mag > 0 ? 1 : 0);
    P.s += v * dt;
    P.speed = Math.abs(v);
    if (P.mode === 'run' && P.speed > 0.5) useStamina(0.11 * dt * drainK()); else regenStamina(dt);
    // 傾き
    const at = d.at(P.s, 0);
    const k = P.mode === 'sneak' ? 0.35 : P.mode === 'run' ? 1.6 : 1;
    let push = (at.roll || 0) * 3.2 + (d.swayAcc || 0) * 0.035;
    if (d.kind === 'log') push += Math.sin(P.balT * 2.3 + d.L) * 0.55 * (P.speed / 2.2) + Math.sin(P.balT * 5.1) * 0.25 * (P.speed / 2.2);
    else push += Math.sin(P.balT * 1.7 + d.L) * 0.22 * (P.speed / 2.6);
    P.balT += dt;
    for (const g of O.gusts) if (g.deck === d && g.power > 0) push += g.dir * g.power * 1.4;
    P.bal += push * k * dt;
    P.bal += lat * 2.4 * dt;
    if (wi.mag === 0) P.bal -= P.bal * 0.25 * dt;
    if (Math.abs(P.bal) >= 1) {
      // 落ちる
      const side = Math.sign(P.bal);
      toast(t('lostBalance'));
      statObs(d.kind, false);
      const y = at.y;
      P.x = at.x; P.z = at.z; P.y = y;
      P.deck = null; P.bal = 0;
      goAir(d.px * side * 2.4, 1.0, d.pz * side * 2.4, y);
      return;
    }
    // 抜けた板・腐った板
    const r = d.rottenAt(P.s);
    for (const rr of d.rotten) rr.pressed = false;
    if (r) {
      if (r.t === 0) SFX.creak();
      r.pressed = true;
      r.t += dt;
      if (r.t > 1) { r.broken = true; SFX.crack(); toast(t('plankBroke')); }
    }
    if (d.hole(P.s)) {
      const y = at.y;
      P.x = at.x; P.z = at.z; P.y = y;
      P.deck = null; P.bal = 0;
      statObs(d.kind, false);
      goAir(0, 0, 0, y);
      return;
    }
    if (pressed.has('jump')) {
      pressed.delete('jump');
      d.impulse((Math.random() < 0.5 ? -1 : 1) * 0.45);
      P.x = at.x; P.z = at.z; P.y = at.y;
      const vx = d.ux * v, vz = d.uz * v;
      P.deck = null;
      goAir(vx, JUMP_V * 0.9, vz, at.y);
      SFX.jump();
      return;
    }
    // 渡りきった・戻った
    if (P.s < -0.1 || P.s > d.L + 0.1) {
      const end = P.s < 0 ? d.A : d.B;
      if (P.s > d.L) statObs(d.kind, true);
      P.x = end.x + d.ux * (P.s < 0 ? -0.3 : 0.3); P.z = end.z + d.uz * (P.s < 0 ? -0.3 : 0.3);
      P.y = groundAt(P.x, P.z);
      P.deck = null; P.bal = 0;
      setState('ground');
      return;
    }
    P.x = at.x; P.z = at.z; P.y = at.y;
    if (Math.abs(v) > 0.2) P.yaw = Math.atan2(d.ux * Math.sign(v), d.uz * Math.sign(v));
    footsteps(dt, P.speed);
  }

  // ---- ターザンロープ ----
  const tmpB = {};
  function grabRope(nx, ny, nz) {
    for (const r of O.ropes) {
      if (P.lastRope === r) continue; // 手を離したロープには、着地するまでつかまらない
      if (Math.abs(r.px - nx) > 12 || Math.abs(r.pz - nz) > 12) continue;
      // ロープの線とキャラクターの胸の距離
      r.bottom(tmpB);
      const cx = nx, cy = ny + 1.4, cz = nz;
      const ax = r.px, ay = r.py, az = r.pz;
      const bx = tmpB.x - ax, by = tmpB.y - ay, bz = tmpB.z - az;
      const l2 = bx * bx + by * by + bz * bz;
      const tt = clamp(((cx - ax) * bx + (cy - ay) * by + (cz - az) * bz) / l2, 0.45, 1);
      const qx = ax + bx * tt, qy = ay + by * tt, qz = az + bz * tt;
      if (Math.hypot(cx - qx, cy - qy, cz - qz) < 1.0) {
        if (P.exhausted || P.stamina <= 0) return false;
        P.rope = r;
        r.held = true;
        // 速さを振り子の角速度に変える
        const tanX = r.ux * Math.cos(r.phi), tanY = Math.sin(r.phi), tanZ = r.uz * Math.cos(r.phi);
        const vt = P.vx * tanX + P.vy * tanY + P.vz * tanZ;
        r.omega = clamp(vt / r.len, -2.5, 2.5);
        setState('swing');
        SFX.grab();
        return true;
      }
    }
    return false;
  }
  function stepSwing(dt) {
    const r = P.rope;
    const wi = worldInput();
    const pump = (wi.x * r.ux + wi.z * r.uz);
    r.omega += (-(G / r.len) * Math.sin(r.phi) + pump * 0.6) * dt;
    r.omega *= Math.pow(0.92, dt);
    r.phi += r.omega * dt;
    if (r.phi > 1.25) { r.phi = 1.25; r.omega = Math.min(0, r.omega); }
    if (r.phi < -1.25) { r.phi = -1.25; r.omega = Math.max(0, r.omega); }
    useStamina(0.045 * dt * drainK());
    r.bottom(tmpB);
    P.x = tmpB.x; P.z = tmpB.z; P.y = tmpB.y - 1.55;
    P.yaw = Math.atan2(r.ux * Math.sign(r.omega || 1), r.uz * Math.sign(r.omega || 1));
    const rel = pressed.has('jump') || pressed.has('release');
    if (rel || P.stamina <= 0) {
      const boost = pressed.has('jump') ? 1 : 0;
      pressed.delete('jump'); pressed.delete('release');
      const v = r.omega * r.len;
      let vh = Math.cos(r.phi) * v + Math.sign(r.omega) * 0.8 * boost;
      const vy = Math.sin(r.phi) * v + 2.2 * boost;
      // 最後のロープから向こう岸へ飛ぶときは、岸を大きく飛び越えないように少し助ける
      if (r.idx === r.count - 1 && r.omega > 0) {
        const s0 = (P.x - r.gap.A.x) * r.ux + (P.z - r.gap.A.z) * r.uz;
        const tFly = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, P.y - r.landY))) / G;
        const sLand = s0 + vh * tFly;
        const L = r.gap.L;
        if (sLand > L + 2) vh *= (L + 1.2 - s0) / (sLand - s0);
        else if (sLand < L - 1.2 && sLand > L - 3) vh *= (L - 1 - s0) / Math.max(0.1, sLand - s0);
      }
      r.held = false; r.free = 3;
      P.lastRope = r; P.grabCd = 0.5;
      P.rope = null;
      goAir(r.ux * vh, vy, r.uz * vh, P.y);
      SFX.whoosh();
    }
  }
  // 手を離したら着く場所を予測する
  function predictLanding() {
    const r = P.rope;
    if (!r) return null;
    const v = r.omega * r.len;
    let x = P.x, y = P.y, z = P.z;
    let vx = r.ux * Math.cos(r.phi) * v + r.ux * Math.sign(r.omega) * 0.8;
    let vz = r.uz * Math.cos(r.phi) * v + r.uz * Math.sign(r.omega) * 0.8;
    let vy = Math.sin(r.phi) * v + 2.2;
    for (let i = 0; i < 200; i++) {
      const dt = 0.02;
      vy -= G * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      for (const d of O.decks) {
        const pr = d.project(x, z);
        if (pr.s > 0 && pr.s < d.L && Math.abs(pr.l) < d.width / 2 && Math.abs(y - d.yAt(pr.s)) < 0.4) return { x, y: d.yAt(pr.s), z };
      }
      const gh = W.height(x, z);
      if (y <= gh) return { x, y: gh, z, deep: r.landY - gh > 4 };
    }
    return null;
  }

  // ---- 鉤縄 ----
  function stepHook(dt) {
    const h = P.hook;
    const dx = h.T.x - P.x, dy = h.T.y - 1.2 - P.y, dz = h.T.z - P.z;
    const d = Math.hypot(dx, dy, dz);
    const sp = 18;
    if (d < 1.0 || P.hookT > 3) {
      P.x = h.land.x; P.z = h.land.z; P.y = groundAt(h.land.x, h.land.z);
      P.hook = null;
      hookLine.visible = false;
      setState('ground');
      statObs('hook', true);
      return;
    }
    P.hookT += dt;
    P.x += dx / d * sp * dt; P.y += dy / d * sp * dt; P.z += dz / d * sp * dt;
    P.yaw = Math.atan2(dx, dz);
    const pos = hookLine.geometry.attributes.position;
    pos.setXYZ(0, P.x, P.y + 1.3, P.z); pos.setXYZ(1, h.T.x, h.T.y, h.T.z);
    pos.needsUpdate = true;
  }

  // ---- 風 ----
  function windPush() {
    windNow = false;
    for (const g of O.gusts) {
      if (g.kind !== 'ridge' || g.power <= 0) continue;
      const rx = P.x - g.A.x, rz = P.z - g.A.z;
      const s = rx * g.ux + rz * g.uz, l = rx * g.nx + rz * g.nz;
      if (s < -2 || s > g.L + 2 || Math.abs(l) > 4) continue;
      windNow = true;
      const k = (P.mode === 'sneak' ? 0.75 : 2.6) * g.power * (hasTool('crampons') ? 0.6 : 1);
      return { x: g.nx * g.dir * k, z: g.nz * g.dir * k };
    }
    for (const g of O.gusts) if (g.kind === 'bridge' && g.power > 0 && P.deck === g.deck) windNow = true;
    return null;
  }

  // =====================================================================
  // 植物・落石・花畑・拾う物・チェックポイント
  // =====================================================================
  function hazards(dt) {
    // 植物
    if (P.state === 'ground' || P.state === 'slide' || P.state === 'balance') {
      const hitR = P.mode === 'sneak' ? 0.18 : 0.32;
      for (const h of HZ.touchPlants(O, P.x, P.z, P.y, hitR)) {
        const def = HZ.PLANT[h.p.kind];
        if (h.p.kind === 'urushi') {
          // かぶれている間は、もう一度触れても長くならない
          if (P.rash <= 0) { toast(t('rashOn')); SFX.hurt(); P.rash = def.rash; P.rashTick = 0; }
        } else if (!(def.gloves && hasTool('gloves')) && P.plantCd <= 0) {
          const d = h.d || 1;
          hurt(def.dmg, 'plant', def.push ? { x: h.dx / d * def.push, z: h.dz / d * def.push } : null);
          P.plantCd = def.cooldown;
          if (h.p.kind === 'nettle') toast(t('nettleHit'), 1.4);
        }
      }
      // 毒の花畑
      if (HZ.inFlowers(O, P.x, P.z)) {
        P.flowerTick += dt;
        if (P.flowerTick >= HZ.FLOWER_TICK) { P.flowerTick = 0; P.invuln = 0; hurt(1, 'flower'); toast(t('flowerHit'), 1.2); }
      } else P.flowerTick = Math.min(P.flowerTick, 0.6);
    }
    if (P.rash > 0) {
      P.rash -= dt;
      P.rashTick += dt;
      if (P.rashTick >= HZ.RASH_TICK) { P.rashTick = 0; P.invuln = 0; hurt(1, 'rash'); }
    }
    // 落石
    for (const b of O.boulders) {
      if (b.hit) continue;
      if (Math.hypot(b.x - P.x, b.z - P.z) < b.r + 0.45 && Math.abs(b.y - (P.y + 0.9)) < b.r + 0.9) {
        b.hit = true;
        const sp = Math.hypot(b.vx, b.vz) || 1;
        if (P.state === 'climb') letGo(2, true);
        else if (P.state === 'balance') { P.deck = null; goAir(0, 0, 0, P.y); }
        hurt(2, 'rock', { x: b.vx / sp * 5, z: b.vz / sp * 5 });
        if (P.state === 'ground') { P.vy = 4; goAir(P.vx, 4, P.vz, P.y); }
        toast(t('rockHit'));
      }
    }
    // 拾う物
    for (const it of O.items) {
      if (it.taken) continue;
      if (Math.abs(it.x - P.x) > 2 || Math.abs(it.z - P.z) > 2) continue;
      if (Math.hypot(it.x - P.x, it.z - P.z) < 1.3 && Math.abs(it.y - P.y) < 2.2) pickUp(it);
    }
    if (!run) return;
    // チェックポイント
    for (const id in W.cps) {
      const c = W.cps[id];
      if (Math.abs(c.x - P.x) > c.R || Math.abs(c.z - P.z) > c.R) continue;
      if (Math.hypot(c.x - P.x, c.z - P.z) < c.R - 1 && Math.abs(c.y - P.y) < 3) reachCp(id);
    }
    // 展望スポット
    for (const v of O.views) {
      if (Math.abs(v.x - P.x) > 3 || Math.abs(v.z - P.z) > 3) continue;
      if (Math.hypot(v.x - P.x, v.z - P.z) < 2.4 && P.state === 'ground') atView(v);
    }
  }

  function pickUp(it) {
    const mr = mrec(mountainId);
    if (it.kind === 'herb') {
      if (save.bag.herb >= ITEMS.CONSUMABLES.herb.max) { if (P.plantCd <= 0) { toast(t('bagFull')); P.plantCd = 2; } return; }
      save.bag.herb++;
      run.herbs.push(it.uid);
      O.setTaken(it.uid, true);
      SFX.pick();
      toast(t('gotHerb'));
    } else if (it.kind === 'charm') {
      save.charms++;
      mr.items.push(it.uid);
      O.setTaken(it.uid, true);
      SFX.tool();
      const before = maxHearts();
      const left = ITEMS.HP.charmsPerHeart - (save.charms % ITEMS.HP.charmsPerHeart);
      if (save.charms % ITEMS.HP.charmsPerHeart === 0 && before <= ITEMS.HP.max) {
        P.hp = maxHearts() * 4;
        banner(t('heartUp'), t('charm'));
      } else toast(t('gotCharm', { n: left }));
      run.found.push('charm');
    } else if (it.kind === 'tool') {
      const before = Object.values(W.edges).filter((e) => usable(e, save.tools)).length;
      if (!save.tools.includes(it.id)) save.tools.push(it.id);
      const opened = Object.values(W.edges).filter((e) => usable(e, save.tools)).length - before;
      mr.items.push(it.uid);
      O.setTaken(it.uid, true);
      SFX.tool();
      banner(t('tool_' + it.id), t('gotTool'), 4);
      toast(t('toolDesc_' + it.id), 5);
      if (opened > 0) setTimeout(() => toast(t('routesOpened', { n: opened }), 4), 5200);
      run.found.push(it.id);
    }
    writeSave();
  }

  function reachCp(id) {
    const c = W.cps[id];
    const mr = mrec(mountainId);
    const first = !mr.cp.includes(id);
    const newHere = run.lastCp !== id;
    // 体力とスタミナは触れるたびに全快
    P.hp = maxHearts() * 4;
    P.stamina = maxStamina();
    P.exhausted = false;
    P.rash = 0;
    if (!newHere) return;
    if (first) {
      mr.cp.push(id);
      O.setFlag(id, true);
      // 登山口が開く
      for (const st of W.M.starts) {
        if (st.unlock && st.unlock.includes(id) && !mr.starts.includes(st.cp)) {
          mr.starts.push(st.cp);
          setTimeout(() => toast(t('startUnlocked', { name: L(W.cps[st.cp].name) }), 4), 2600);
        }
      }
    }
    // 通った区間を記録する
    const prev = run.lastCp;
    const eid = edgeBetween(prev, id, run.edges);
    if (eid && !mr.edges.includes(eid)) mr.edges.push(eid);
    if (eid) run.walked.push(eid);
    run.lastCp = id;
    run.path.push(id);
    // 道案内
    const ri = run.route.indexOf(id);
    if (ri >= 0) run.idx = ri;
    else {
      const plan = planRoute(id, run.goal, 'short', save.tools);
      if (plan) { run.route = plan.cps; run.edges = plan.edges; run.idx = 0; setTimeout(() => toast(t('rerouted')), 2600); }
    }
    SFX.cp();
    banner(L(c.name), t('checkpoint'), 3);
    writeSave();
    saveRun();
    if (id === run.goal) arrive();
  }
  function edgeBetween(a, b, prefer) {
    if (!a || !b) return null;
    let best = null;
    for (const id in W.edges) {
      const e = W.edges[id];
      if ((e.from === a && e.to === b) || (e.from === b && e.to === a)) {
        if (prefer && prefer.includes(id)) return id;
        best = best || id;
      }
    }
    return best;
  }

  let viewLock = null;
  function atView(v) {
    if (run.viewsSeen.includes(v.id)) return;
    run.viewsSeen.push(v.id);
    const mr = mrec(mountainId);
    const first = !mr.views.includes(v.id);
    // 見る向き (角度 a: 東 0・北 90) の反対側にカメラを置く
    const la = v.lookA * DEG;
    camAuto = { yaw: Math.atan2(-Math.cos(la), Math.sin(la)), pitch: 0.12, t: 3.2 };
    banner(L(v.name), t('viewSpot'), 4);
    SFX.view();
    if (first) {
      const beforeMax = maxStamina();
      mr.views.push(v.id);
      run.found.push('view');
      writeSave();
      viewLock = { v, t: 2.4 };
      if (maxStamina() > beforeMax) setTimeout(() => toast(t('staminaUp'), 4), 2000);
      else setTimeout(() => toast(t('viewsLeft', { n: 4 - (totalViews() % 4) }), 3), 2000);
    }
  }

  // ---- 「使う」 ----
  function contextAction() {
    if (P.state !== 'ground') return null;
    const near = (x, z, r) => Math.hypot(x - P.x, z - P.z) < r;
    // 山小屋で補充
    for (const id in W.cps) {
      const c = W.cps[id];
      if (c.kind !== 'hut') continue;
      const door = O.cpMarks[id].door;
      if (near(door.x, door.z, 3.2)) {
        if (run.restocked.includes(id)) return { txt: t('restockedAlready'), ok: false };
        return { txt: t('restock'), ok: true, run: () => {
          run.restocked.push(id);
          save.bag.herb = ITEMS.CONSUMABLES.herb.max; save.bag.food = ITEMS.CONSUMABLES.food.max;
          writeSave(); SFX.pick(); toast(t('restocked'));
        } };
      }
    }
    for (const sp of O.springs) {
      if (near(sp.x, sp.z, 2.0)) return { txt: t('drink'), ok: true, run: () => {
        P.hp = Math.min(maxHearts() * 4, P.hp + ITEMS.SPRING_HEAL); P.rash = 0; SFX.drink(); toast(t('drank'));
      } };
    }
    for (const b of O.brambles) {
      if (!b.cut && near(b.x, b.z, b.r + 1.6)) {
        if (!hasTool('machete')) return { txt: t('needMachete'), ok: false };
        return { txt: t('cutBramble'), ok: true, run: () => { b.cut = true; b.mesh.visible = false; SFX.cut(); statObs('bramble', true); } };
      }
    }
    if (hasTool('machete')) {
      for (const p of O.plants) {
        if (p.cut || p.kind === 'nettle') continue;
        if (near(p.x, p.z, 1.9)) return { txt: t('cutPlant'), ok: true, run: () => { O.cutPlant(p); SFX.cut(); } };
      }
    }
    for (const f of O.faces) {
      if (f.kind !== 'smooth') continue;
      const bx = f.ox + f.nx * 1.0, bz = f.oz + f.nz * 1.0;
      const atBase = near(bx, bz, 3) && Math.abs(P.y - f.y0) < 1.5;
      const atTop = f.anchor && near(f.anchor.x, f.anchor.z, 2.5) && Math.abs(P.y - f.y1) < 1.5;
      if (atBase || atTop) {
        if (!hasTool('rope')) return { txt: t('needRope'), ok: false };
        return { txt: t('hangRope'), ok: true, run: () => {
          O.hangRope(f);
          P.face = f; P.u = 0; P.rappel = true;
          P.v = atTop ? f.y1 - 1.0 : f.y0 + 0.1;
          setState('climb');
          climbPos();
          SFX.grab();
          statObs('rope', true);
        } };
      }
    }
    for (const h of O.hooks) {
      const dx = h.T.x - P.x, dz = h.T.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d < h.range && (P.x - h.T.x) * h.ux + (P.z - h.T.z) * h.uz < -3 && Math.abs(P.y - h.land.y) < 8) {
        if (!hasTool('hook')) return { txt: t('needHook'), ok: false };
        return { txt: t('throwHook'), ok: true, run: () => {
          P.hook = h; P.hookT = 0;
          hookLine.visible = true;
          setState('hook');
          SFX.whoosh();
        } };
      }
    }
    return null;
  }

  function useConsumable(kind) {
    if (!run) return;
    if (save.bag[kind] <= 0) return;
    if (kind === 'herb') {
      if (P.hp >= maxHearts() * 4 && P.rash <= 0) { toast(t('notNeeded')); return; }
      save.bag.herb--;
      P.hp = Math.min(maxHearts() * 4, P.hp + ITEMS.HERB_HEAL); P.rash = 0;
      toast(t('usedHerb'));
    } else {
      save.bag.food--;
      P.stamina = maxStamina(); P.exhausted = false; P.foodT = 30;
      toast(t('usedFood'));
    }
    SFX.pick();
    writeSave();
  }

  // =====================================================================
  // 登山 (run)
  // =====================================================================
  let run = null;
  let weather = 'sunny';
  function pickWeather() {
    const w = W.M.weather || { sunny: 1 };
    let r = Math.random(), acc = 0;
    for (const k in w) { acc += w[k]; if (r < acc) return k; }
    return 'sunny';
  }
  function saveRun() {
    if (!run) { save.run = null; writeSave(); return; }
    save.run = {
      m: mountainId, start: run.start, goal: run.goal, route: run.route, edges: run.edges, idx: run.idx, lastCp: run.lastCp,
      elapsed: run.elapsed, weather, hp: P.hp, restocked: run.restocked, path: run.path, walked: run.walked,
      climb: run.climb, falls: run.falls, dmg: run.dmg, found: run.found, herbs: run.herbs, viewsSeen: run.viewsSeen, planned: run.planned,
    };
    writeSave();
  }
  async function startRun(opts) {
    await loadMountain(opts.m);
    O.resetRun();
    run = {
      start: opts.start, goal: opts.goal, route: opts.route.slice(), edges: opts.edges.slice(), idx: opts.idx || 0,
      lastCp: opts.lastCp || opts.start, elapsed: opts.elapsed || 0, restocked: opts.restocked || [], path: opts.path || [opts.start],
      walked: opts.walked || [], climb: opts.climb || 0, falls: opts.falls || 0, dmg: opts.dmg || 0, found: opts.found || [],
      herbs: opts.herbs || [], viewsSeen: opts.viewsSeen || [], planned: opts.planned || { route: opts.route.slice(), edges: opts.edges.slice() },
    };
    weather = opts.weather || pickWeather();
    // 薬草は登山ごとに生える
    for (const it of O.items) if (it.kind === 'herb') O.setTaken(it.uid, run.herbs.includes(it.uid));
    const mr = mrec(mountainId);
    if (!mr.cp.includes(run.start)) { mr.cp.push(run.start); O.setFlag(run.start, true); }
    if (!mr.starts.includes(run.start)) mr.starts.push(run.start);
    placeAtCp(run.lastCp);
    P.hp = opts.hp != null ? opts.hp : maxHearts() * 4;
    applyWeather();
    saveRun();
    setMode('play');
    banner(L(W.cps[run.lastCp].name), t(opts.elapsed ? 'resumeClimb' : 'startClimb'), 3);
    setTimeout(() => toast(t('weather_' + weather), 3), 1500);
  }
  function placeAtCp(id) {
    const c = W.cps[id];
    // 次に向かう方向を向いて、広場の中ほどに立つ
    const next = run.route[run.idx + 1];
    let dx = 0, dz = 1;
    const eid = run.edges[run.idx];
    if (next && eid) {
      const e = W.edges[eid];
      const pts = e.from === id ? e.polys[0] : e.polys[e.polys.length - 1];
      const p = e.from === id ? (pts.find((q) => Math.hypot(q.x - c.x, q.z - c.z) > c.R) || pts[pts.length - 1]) : ([...pts].reverse().find((q) => Math.hypot(q.x - c.x, q.z - c.z) > c.R) || pts[0]);
      dx = p.x - c.x; dz = p.z - c.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    }
    P.x = c.x + dx * 2; P.z = c.z + dz * 2;
    P.y = groundAt(P.x, P.z);
    P.vx = P.vy = P.vz = 0;
    P.yaw = Math.atan2(dx, dz);
    camYaw = Math.atan2(-dx, -dz);
    camPitch = 0.3;
    P.state = 'ground';
    P.stamina = maxStamina(); P.exhausted = false; P.rash = 0; P.bal = 0;
    P.deck = null; P.face = null; P.rope = null; P.hook = null;
    for (const r of O.ropes) r.held = false;
    hookLine.visible = false;
    S.prime(P.x, P.z);
  }
  function respawn() {
    if (!run) return;
    O.resetRun();
    placeAtCp(run.lastCp);
    P.hp = maxHearts() * 4;
    setMode('play');
    toast(t('respawned'));
    saveRun();
  }
  function arrive() {
    const c = W.cps[run.goal];
    const mr = mrec(mountainId);
    const g = mr.goals[run.goal];
    const isNew = !g || run.elapsed < g.t;
    if (isNew) mr.goals[run.goal] = { t: Math.round(run.elapsed), route: run.path.slice(), from: run.start };
    if (run.goal === 'summit') mr.summit = true;
    SFX.arrive();
    const st = $('arrive-stats');
    st.textContent = '';
    const row = (k, v, nw) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      if (nw) { const s = document.createElement('span'); s.className = 'new'; s.textContent = 'NEW'; dd.appendChild(s); }
      st.append(dt, dd);
    };
    row(t('statTime'), fmtTime(run.elapsed), isNew && g);
    row(t('statClimb'), `${Math.round(run.climb)} m`);
    row(t('statFrom'), L(W.cps[run.start].name));
    row(t('statFalls'), String(run.falls));
    row(t('statDamage'), heartsText(run.dmg));
    const walls = run.walked.reduce((n, id) => n + W.edges[id].obstacles.length, 0);
    row(t('statObstacles'), String(walls));
    const views = run.found.filter((x) => x === 'view').length;
    if (views) row(t('statViews'), String(views));
    const tools = run.found.filter((x) => ITEMS.TOOLS.includes(x)).map((x) => t('tool_' + x));
    if (tools.length) row(t('statTools'), tools.join('、'));
    $('arrive-title').textContent = run.goal === 'summit' ? t('summitReached') : t('arrived');
    $('arrive-name').textContent = L(c.name);
    lastRunOpts = { m: mountainId, start: run.start, goal: run.goal, route: run.planned.route, edges: run.planned.edges };
    run = null;
    save.run = null;
    writeSave();
    setMode('menu');
    showScreen('arrive');
  }
  let lastRunOpts = null;
  const fmtTime = (s) => { s = Math.round(s); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
  const heartsText = (q) => (q % 4 === 0 ? `${q / 4}` : (q / 4).toFixed(2).replace(/0$/, ''));

  // =====================================================================
  // 経路の計画 (ダイクストラ)
  // =====================================================================
  function edgeCost(e, kind) {
    if (kind === 'short') return e.time;
    if (kind === 'easy') return e.time * (1 + (e.stars - 1) * 0.9);
    if (kind === 'scenic') {
      const v = O.views.filter((vv) => W.views.find((wv) => wv.id === vv.id && wv.at.edge === e.id)).length;
      return e.time * (1 - 0.2 * Math.min(3, e.scenic + v));
    }
    return e.time;
  }
  function usable(e, tools) { return e.needs.every((n) => tools.includes(n)); }
  function planRoute(from, to, kind, tools) {
    const dist = {}, prev = {};
    const q = new Set(Object.keys(W.cps));
    for (const id of q) dist[id] = Infinity;
    dist[from] = 0;
    while (q.size) {
      let u = null;
      for (const id of q) if (u === null || dist[id] < dist[u]) u = id;
      if (dist[u] === Infinity) break;
      q.delete(u);
      if (u === to) break;
      for (const id in W.edges) {
        const e = W.edges[id];
        if (!usable(e, tools)) continue;
        let v = null;
        if (e.from === u) v = e.to;
        else if (e.to === u && !e.oneway) v = e.from;
        if (!v || !q.has(v)) continue;
        const nd = dist[u] + edgeCost(e, kind);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = { u, e: id }; }
      }
    }
    if (dist[to] === Infinity) return null;
    const cps = [to], edges = [];
    let cur = to;
    while (cur !== from) { edges.unshift(prev[cur].e); cur = prev[cur].u; cps.unshift(cur); }
    return summarize(cps, edges);
  }
  function summarize(cps, edges) {
    let len = 0, time = 0, stars = 1, climb = 0;
    for (let i = 0; i < edges.length; i++) {
      const e = W.edges[edges[i]];
      len += e.length; time += e.time; stars = Math.max(stars, e.stars);
      const dy = W.cps[cps[i + 1]].y - W.cps[cps[i]].y;
      if (dy > 0) climb += dy;
    }
    return { cps, edges, len, time, stars, climb };
  }

  // =====================================================================
  // 画面の切り替え
  // =====================================================================
  let mode = 'menu'; // menu / play / pause / photo
  const SCREENS = ['title', 'mountains', 'map', 'pause', 'arrive', 'tools', 'records', 'album', 'dead', 'loading'];
  let curScreen = 'title';
  let backTo = 'title';
  function showScreen(name) {
    curScreen = name;
    for (const s of SCREENS) $('screen-' + s).hidden = s !== name;
    $('overlay').classList.toggle('is-on', !!name);
    if (name === 'title') renderTitle();
    if (name === 'map') renderMapScreen();
    if (name === 'tools') renderTools();
    if (name === 'records') renderRecords();
    if (name === 'album') renderAlbum();
    if (name === 'pause') renderPause();
  }
  function hideScreens() {
    curScreen = null;
    for (const s of SCREENS) $('screen-' + s).hidden = true;
    $('overlay').classList.remove('is-on');
  }
  function setMode(m) {
    mode = m;
    hud.hidden = m !== 'play';
    $('btn-pause').hidden = m !== 'play';
    $('photo-ui').hidden = m !== 'photo';
    showTouch(inputKind === 'touch');
    if (m === 'play' || m === 'photo') hideScreens();
    keys.clear(); pressed.clear();
  }
  function refreshScreen() { if (curScreen) showScreen(curScreen); heartsKey = ''; effectsKey = ''; }

  // ---- タイトル ----
  function renderTitle() {
    $('btn-continue').hidden = !save.run;
    const n = window.SUMMIT_MOUNTAIN_LIST.length;
    const mr = save.mountains.tengu;
    const parts = [];
    if (mr) {
      if (mr.summit) parts.push(t('titleSummit'));
      parts.push(t('titleProgress', { cp: mr.cp.length, views: mr.views.length, tools: save.tools.length }));
    }
    void n;
    $('title-progress').textContent = parts.join('\n');
  }
  $('btn-continue').addEventListener('click', async () => {
    audio();
    const r = save.run;
    if (!r) return;
    await startRun(Object.assign({}, r, { weather: r.weather }));
  });
  $('btn-new').addEventListener('click', () => {
    audio();
    if (window.SUMMIT_MOUNTAIN_LIST.length > 1) { showScreen('mountains'); renderMountains(); }
    else openMap(window.SUMMIT_MOUNTAIN_LIST[0].id, 'start');
  });
  $('btn-title-tools').addEventListener('click', () => { backTo = 'title'; showScreen('tools'); });
  $('btn-title-records').addEventListener('click', async () => { backTo = 'title'; await loadMountain(window.SUMMIT_MOUNTAIN_LIST[0].id); showScreen('records'); });
  $('btn-title-album').addEventListener('click', async () => { backTo = 'title'; await loadMountain(window.SUMMIT_MOUNTAIN_LIST[0].id); showScreen('album'); });
  $('tools-back').addEventListener('click', () => showScreen(backTo));
  $('records-back').addEventListener('click', () => showScreen(backTo));
  $('album-back').addEventListener('click', () => showScreen(backTo));
  $('mountains-back').addEventListener('click', () => showScreen('title'));

  function renderMountains() {
    const box = $('mountain-list');
    box.textContent = '';
    window.SUMMIT_MOUNTAIN_LIST.forEach((m, i) => {
      const prev = window.SUMMIT_MOUNTAIN_LIST[i - 1];
      const open = !prev || (save.mountains[prev.id] && save.mountains[prev.id].summit);
      const b = document.createElement('button');
      b.className = 'pick';
      b.disabled = !open;
      b.innerHTML = '';
      b.append(L(m.name), Object.assign(document.createElement('span'), { className: 'pick-sub', textContent: open ? `${m.height} m` : t('mountainLocked', { name: L(prev.name) }) }));
      b.addEventListener('click', () => openMap(m.id, 'start'));
      box.appendChild(b);
    });
  }

  // ---- 一時停止 ----
  function renderPause() {
    if (!run) return;
    $('pause-info').textContent = t('pauseInfo', { goal: L(W.cps[run.goal].name), time: fmtTime(run.elapsed), cp: L(W.cps[run.lastCp].name) });
  }
  function pauseGame() { if (mode !== 'play') return; mode = 'pause'; hud.hidden = true; $('touch').hidden = true; $('btn-pause').hidden = true; showScreen('pause'); }
  $('pause-resume').addEventListener('click', () => setMode('play'));
  $('pause-tools').addEventListener('click', () => { backTo = 'pause'; showScreen('tools'); });
  $('pause-checkpoint').addEventListener('click', () => { if (run) respawn(); });
  $('pause-map').addEventListener('click', () => { openMap(mountainId, 'view'); });
  $('pause-quit').addEventListener('click', () => { saveRun(); run = null; setMode('menu'); showScreen('title'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') pauseGame(); });

  $('arrive-map').addEventListener('click', () => openMap(mountainId, 'start'));
  $('arrive-again').addEventListener('click', () => { if (lastRunOpts) startRun(lastRunOpts); });

  // ---- 道具 ----
  function renderTools() {
    const sum = $('tool-summary');
    sum.textContent = '';
    const add = (label, val) => { const s = document.createElement('span'); s.append(label + ' '); const b = document.createElement('b'); b.textContent = val; s.appendChild(b); sum.appendChild(s); };
    add('❤', `${maxHearts()} / ${ITEMS.HP.max}`);
    add(t('charm'), `${save.charms} (${t('nextHeartIn', { n: ITEMS.HP.charmsPerHeart - (save.charms % ITEMS.HP.charmsPerHeart) })})`);
    add(t('stamina'), `${Math.round(maxStamina() * 100)}%`);
    add(ITEMS.CONSUMABLES.herb.icon, `${save.bag.herb}/${ITEMS.CONSUMABLES.herb.max}`);
    add(ITEMS.CONSUMABLES.food.icon, `${save.bag.food}/${ITEMS.CONSUMABLES.food.max}`);
    const grid = $('tool-grid');
    grid.textContent = '';
    for (const id of ITEMS.TOOLS) {
      const have = hasTool(id);
      const c = document.createElement('div');
      c.className = 'tool-card' + (have ? '' : ' is-missing');
      const ic = document.createElement('span'); ic.className = 'tool-icon'; ic.textContent = have ? ITEMS.TOOL_ICON[id] : '？';
      const b = document.createElement('b'); b.textContent = have ? t('tool_' + id) : '？？？';
      const p = document.createElement('span'); p.textContent = have ? t('toolDesc_' + id) : t('toolHint_' + id);
      c.append(ic, b, p);
      grid.appendChild(c);
    }
    for (const k of ['herb', 'food']) {
      const c = document.createElement('div');
      c.className = 'tool-card';
      const ic = document.createElement('span'); ic.className = 'tool-icon'; ic.textContent = ITEMS.CONSUMABLES[k].icon;
      const b = document.createElement('b'); b.textContent = `${t('item_' + k)} ×${save.bag[k]}`;
      const p = document.createElement('span'); p.textContent = t('itemDesc_' + k);
      c.append(ic, b, p);
      grid.appendChild(c);
    }
  }

  // =====================================================================
  // 地図
  // =====================================================================
  const mapCanvas = $('map-canvas');
  let mapImage = null;
  const MAP_E = 1560;
  let mapState = null;
  function buildMapImage() {
    const N = 360;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N);
    const hs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N * 2 - 1) * MAP_E, z = (j / N * 2 - 1) * MAP_E;
      hs[j * N + i] = W.height(x, z, true);
    }
    const col = new THREE.Color();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h = hs[j * N + i];
      const hx = hs[j * N + Math.min(N - 1, i + 1)] - hs[j * N + Math.max(0, i - 1)];
      const hz = hs[Math.min(N - 1, j + 1) * N + i] - hs[Math.max(0, j - 1) * N + i];
      // 陰影: 北西から光が当たる
      const cell = 2 * (2 * MAP_E / N);
      const nl = Math.hypot(hx, cell, hz);
      const lam = Math.max(0, (-hx * -0.5 + cell * 0.7 + -hz * -0.5) / nl / Math.hypot(0.5, 0.7, 0.5));
      const shade = 0.5 + 0.62 * lam;
      if (h < W.M.terrain.seaY + 0.3) col.setHex(0x3f7fa8);
      else if (h < 4) col.setHex(0x9dbd6a);
      else if (h < 250) col.setHex(0x6f9a4c);
      else if (h < 550) col.setHex(0x8fa060);
      else if (h < 850) col.setHex(0x9c978c);
      else col.setHex(0xd8dce0);
      // 等高線 (100m ごと)
      const band = Math.floor(h / 100);
      const bandR = Math.floor(hs[j * N + Math.min(N - 1, i + 1)] / 100);
      const bandD = Math.floor(hs[Math.min(N - 1, j + 1) * N + i] / 100);
      const line = h > 5 && (band !== bandR || band !== bandD) ? 0.82 : 1;
      const k = (j * N + i) * 4;
      img.data[k] = clamp(col.r * 255 * shade * line, 0, 255);
      img.data[k + 1] = clamp(col.g * 255 * shade * line, 0, 255);
      img.data[k + 2] = clamp(col.b * 255 * shade * line, 0, 255);
      img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    mapImage = cv;
  }
  const STAR_COL = ['#7bd36a', '#7bd36a', '#d8d84a', '#f2a33a', '#ef6b3a', '#d93a3a'];
  function edgePath(e) {
    // 坂と難所をつないだ線
    const pts = [];
    for (const pc of e.pieces) {
      if (pc.kind === 'ramp') for (const p of pc.pts) pts.push(p);
    }
    return pts;
  }
  function drawMap(cv, opts) {
    if (!mapImage) buildMapImage();
    const ctx = cv.getContext('2d');
    const N = cv.width;
    const toPx = (x, z) => [(x / MAP_E * 0.5 + 0.5) * N, (z / MAP_E * 0.5 + 0.5) * N];
    ctx.drawImage(mapImage, 0, 0, N, N);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const mr = mrec(mountainId);
    const sel = opts.route ? new Set(opts.route.edges) : new Set();
    // 道
    for (const id in W.edges) {
      const e = W.edges[id];
      const pts = edgePath(e);
      const ok = usable(e, save.tools);
      const walked = mr.edges.includes(id);
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = toPx(p.x, p.z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (sel.has(id)) { ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = N / 90; ctx.setLineDash([]); ctx.stroke(); }
      ctx.setLineDash(ok ? [] : [N / 120, N / 160]);
      ctx.strokeStyle = opts.records ? (walked ? '#ffb347' : 'rgba(60,60,60,0.55)') : STAR_COL[e.stars];
      ctx.lineWidth = opts.records ? (walked ? N / 150 : N / 280) : N / 200;
      ctx.stroke();
      ctx.setLineDash([]);
      // 道具が要る区間には印
      if (!ok && !opts.records) {
        const mid = pts[Math.floor(pts.length / 2)];
        const [x, y] = toPx(mid.x, mid.z);
        ctx.font = `${Math.round(N / 34)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(e.needs.filter((n) => !hasTool(n)).map((n) => ITEMS.TOOL_ICON[n]).join(''), x, y);
      }
    }
    // チェックポイント
    const startIds = W.M.starts.map((s) => s.cp);
    for (const id in W.cps) {
      const c = W.cps[id];
      const [x, y] = toPx(c.x, c.z);
      const visited = mr.cp.includes(id);
      const isStart = startIds.includes(id);
      const isGoal = W.M.goals.includes(id);
      const r = N / (isGoal || isStart ? 70 : 95);
      const hi = (opts.highlight || []).includes(id);
      ctx.beginPath();
      if (isStart) ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = hi ? '#ff8a1f' : visited ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.fill();
      ctx.lineWidth = N / 360; ctx.strokeStyle = '#1b2633'; ctx.stroke();
      if (isGoal) { ctx.fillStyle = '#e8402e'; ctx.fillRect(x + r * 0.6, y - r * 2.4, r * 1.3, r * 0.8); ctx.fillStyle = '#1b2633'; ctx.fillRect(x + r * 0.5, y - r * 2.4, N / 400, r * 2.4); }
      if (opts.labels !== false && (visited || isStart || isGoal || hi)) {
        ctx.font = `${hi ? 'bold ' : ''}${Math.round(N / 46)}px system-ui, sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const label = L(c.name);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(label, x + r * 1.6, y + r * 0.2);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + r * 1.6, y + r * 0.2);
      }
    }
    if (opts.player) {
      const [x, y] = toPx(P.x, P.z);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(-P.yaw + Math.PI);
      ctx.beginPath(); ctx.moveTo(0, -N / 60); ctx.lineTo(N / 110, N / 120); ctx.lineTo(-N / 110, N / 120); ctx.closePath();
      ctx.fillStyle = '#ffd04a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    // 方位
    ctx.font = `bold ${Math.round(N / 32)}px system-ui`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('N', N - N / 20, N / 18);
    return toPx;
  }

  async function openMap(mid, kind) {
    await loadMountain(mid);
    mapState = { kind, step: kind === 'view' ? 'view' : 'start', start: null, goal: null, routes: [], sel: 0, custom: null };
    if (kind !== 'view') { run = null; setMode('menu'); }
    showScreen('map');
  }
  function routeOptions(start, goal) {
    const out = [];
    const seen = new Set();
    for (const kind of ['short', 'easy', 'scenic']) {
      const r = planRoute(start, goal, kind, save.tools);
      if (!r) continue;
      const key = r.edges.join(',');
      if (seen.has(key)) { const prev = out.find((o) => o.edges.join(',') === key); prev.tags.push(kind); continue; }
      seen.add(key);
      r.tags = [kind];
      out.push(r);
    }
    // 道具があればもっと近い道があるか
    const all = planRoute(start, goal, 'short', ITEMS.TOOLS);
    let hint = null;
    if (all && (!out.length || all.time < out[0].time * 0.85)) {
      const need = new Set();
      for (const id of all.edges) for (const n of W.edges[id].needs) if (!hasTool(n)) need.add(n);
      if (need.size) hint = t('shortcutWithTools', { n: need.size });
    }
    return { routes: out, hint };
  }
  function renderMapScreen() {
    if (!W || !mapState) return;
    const ms = mapState;
    $('map-title').textContent = L(W.M.name);
    const panel = $('map-panel');
    const foot = $('map-foot');
    panel.textContent = '';
    foot.textContent = '';
    const mr = mrec(mountainId);
    const btn = (label, cls, fn, disabled) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.disabled = !!disabled; b.addEventListener('click', fn); return b; };
    const pick = (main, sub, on, fn, disabled, tag) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pick' + (on ? ' is-on' : ''); b.disabled = !!disabled;
      if (tag) { const tg = document.createElement('span'); tg.className = 'pick-tag'; tg.textContent = tag; b.appendChild(tg); }
      b.append(main);
      if (sub) { const s = document.createElement('span'); s.className = 'pick-sub'; s.textContent = sub; b.appendChild(s); }
      b.addEventListener('click', fn);
      panel.appendChild(b);
      return b;
    };
    const label = (txt) => { const p = document.createElement('p'); p.className = 'panel-label'; p.textContent = txt; panel.appendChild(p); };
    let highlight = [];
    let route = null;
    if (ms.step === 'start') {
      $('map-step').textContent = t('mapStepStart');
      for (const st of W.M.starts) {
        const c = W.cps[st.cp];
        const open = !st.unlock || mr.starts.includes(st.cp);
        const sub = open ? `${c.y} m` : t('startLocked');
        pick(L(c.name), sub, ms.start === st.cp, () => { ms.start = st.cp; ms.step = 'goal'; renderMapScreen(); }, !open);
        if (open) highlight.push(st.cp);
      }
      foot.appendChild(btn(t('back'), 'start-btn is-sub', () => showScreen('title')));
    } else if (ms.step === 'goal') {
      $('map-step').textContent = t('mapStepGoal', { start: L(W.cps[ms.start].name) });
      label(t('goals'));
      for (const id of W.M.goals) {
        if (id === ms.start) continue;
        const c = W.cps[id];
        const best = mr.goals[id];
        pick(L(c.name), `${c.y} m${best ? ' · ' + t('bestTime', { t: fmtTime(best.t) }) : ''}`, ms.goal === id, () => chooseGoal(id));
      }
      const others = mr.cp.filter((id) => !W.M.goals.includes(id) && id !== ms.start && !W.M.starts.some((s) => s.cp === id));
      if (others.length) {
        label(t('visitedCps'));
        for (const id of others) pick(L(W.cps[id].name), `${W.cps[id].y} m`, ms.goal === id, () => chooseGoal(id));
      }
      highlight = [ms.start];
      foot.appendChild(btn(t('back'), 'start-btn is-sub', () => { ms.step = 'start'; ms.start = null; renderMapScreen(); }));
    } else if (ms.step === 'route') {
      $('map-step').textContent = t('mapStepRoute', { start: L(W.cps[ms.start].name), goal: L(W.cps[ms.goal].name) });
      if (!ms.routes.length) {
        label(t('noRoute'));
      }
      ms.routes.forEach((r, i) => {
        const tags = r.tags.map((k) => t('route_' + k)).join(' · ');
        const b = pick(tags, t('routeInfo', { km: (r.len / 1000).toFixed(1), m: Math.round(r.climb), min: Math.round(r.time / 60), stars: '★'.repeat(r.stars) }), ms.sel === i, () => { ms.sel = i; renderMapScreen(); });
        b.classList.add('route-card');
        const via = document.createElement('span'); via.className = 'pick-sub';
        via.textContent = t('via') + ' ' + r.cps.slice(1, -1).map((id) => L(W.cps[id].name)).join(' → ');
        if (r.cps.length > 2) b.appendChild(via);
      });
      if (ms.hint) { const p = document.createElement('p'); p.className = 'route-hint'; p.textContent = ms.hint; panel.appendChild(p); }
      pick(t('customRoute'), t('customRouteSub'), false, () => { ms.step = 'custom'; ms.custom = [ms.start]; ms.customEdges = []; renderMapScreen(); });
      route = ms.routes[ms.sel] || null;
      highlight = [ms.start, ms.goal];
      foot.appendChild(btn(t('back'), 'start-btn is-sub', () => { ms.step = 'goal'; ms.goal = null; renderMapScreen(); }));
      foot.appendChild(btn(t('climbThis'), 'start-btn', () => {
        const r = ms.routes[ms.sel];
        startRun({ m: mountainId, start: ms.start, goal: ms.goal, route: r.cps, edges: r.edges });
      }, !route));
    } else if (ms.step === 'custom') {
      const cur = ms.custom[ms.custom.length - 1];
      $('map-step').textContent = t('mapStepCustom');
      label(t('customNow', { name: L(W.cps[cur].name) }));
      // 隣のチェックポイント
      for (const id in W.edges) {
        const e = W.edges[id];
        let v = null;
        if (e.from === cur) v = e.to; else if (e.to === cur && !e.oneway) v = e.from;
        if (!v) continue;
        const ok = usable(e, save.tools);
        const c = W.cps[v];
        pick(L(c.name), `${c.y} m · ${'★'.repeat(e.stars)} · ${Math.round(e.time / 60)} ${t('minutes')}${ok ? '' : ' · ' + t('needsTool')}`, false, () => {
          ms.custom.push(v); ms.customEdges.push(id); renderMapScreen();
        }, !ok);
      }
      route = summarize(ms.custom, ms.customEdges);
      highlight = ms.custom.slice();
      foot.appendChild(btn(t('undo'), 'start-btn is-sub', () => {
        if (ms.custom.length > 1) { ms.custom.pop(); ms.customEdges.pop(); renderMapScreen(); }
        else { ms.step = 'route'; renderMapScreen(); }
      }));
      const goal = ms.custom[ms.custom.length - 1];
      foot.appendChild(btn(t('climbToHere', { name: L(W.cps[goal].name) }), 'start-btn', () => {
        startRun({ m: mountainId, start: ms.start, goal, route: ms.custom.slice(), edges: ms.customEdges.slice() });
      }, ms.custom.length < 2));
    } else if (ms.step === 'view') {
      $('map-step').textContent = t('mapStepView');
      if (run) {
        route = summarize(run.route, run.edges);
        label(t('descendTitle'));
        const lower = mr.cp.filter((id) => W.cps[id].y < P.y - 5 && id !== run.lastCp);
        if (!lower.length) label(t('descendNone'));
        for (const id of lower.sort((a, b) => W.cps[b].y - W.cps[a].y)) {
          pick(L(W.cps[id].name), `${W.cps[id].y} m`, false, () => descendTo(id));
        }
      }
      highlight = run ? [run.goal] : [];
      foot.appendChild(btn(t('back'), 'start-btn', () => { mode = 'pause'; showScreen('pause'); }));
    }
    mapState.drawn = { route, highlight };
    mapCanvas.toPx = drawMap(mapCanvas, { route, highlight, player: ms.step === 'view' });
  }
  function chooseGoal(id) {
    const ms = mapState;
    ms.goal = id;
    const r = routeOptions(ms.start, id);
    ms.routes = r.routes; ms.hint = r.hint; ms.sel = 0;
    ms.step = 'route';
    renderMapScreen();
  }
  function descendTo(id) {
    run.lastCp = id;
    run.path.push(id);
    const plan = planRoute(id, run.goal, 'short', save.tools);
    if (plan) { run.route = plan.cps; run.edges = plan.edges; run.idx = 0; }
    O.resetRun();
    placeAtCp(id);
    saveRun();
    setMode('play');
    banner(L(W.cps[id].name), t('descended'), 3);
  }
  mapCanvas.addEventListener('click', (e) => {
    if (!mapState || !mapCanvas.toPx) return;
    const rect = mapCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * mapCanvas.width, my = (e.clientY - rect.top) / rect.height * mapCanvas.height;
    let best = null, bd = mapCanvas.width / 22;
    for (const id in W.cps) {
      const [x, y] = mapCanvas.toPx(W.cps[id].x, W.cps[id].z);
      const d = Math.hypot(x - mx, y - my);
      if (d < bd) { bd = d; best = id; }
    }
    if (!best) return;
    const ms = mapState;
    const mr = mrec(mountainId);
    if (ms.step === 'start') {
      const st = W.M.starts.find((s) => s.cp === best);
      if (st && (!st.unlock || mr.starts.includes(best))) { ms.start = best; ms.step = 'goal'; renderMapScreen(); }
    } else if (ms.step === 'goal' || ms.step === 'route') {
      if (best !== ms.start && (W.M.goals.includes(best) || mr.cp.includes(best))) chooseGoal(best);
    } else if (ms.step === 'custom') {
      const cur = ms.custom[ms.custom.length - 1];
      for (const id in W.edges) {
        const ed = W.edges[id];
        if (!usable(ed, save.tools)) continue;
        if ((ed.from === cur && ed.to === best) || (ed.to === cur && ed.from === best && !ed.oneway)) {
          ms.custom.push(best); ms.customEdges.push(id); renderMapScreen(); return;
        }
      }
    }
  });

  // ---- 記録 ----
  function renderRecords() {
    const mr = mrec(mountainId);
    drawMap($('rec-canvas'), { records: true, labels: false });
    const box = $('records-text');
    box.textContent = '';
    const total = Object.keys(W.edges).length;
    const h = (txt) => { const e = document.createElement('h3'); e.textContent = txt; box.appendChild(e); };
    const table = (rows) => {
      const tb = document.createElement('table');
      for (const [k, v] of rows) { const tr = document.createElement('tr'); const th = document.createElement('th'); th.textContent = k; const td = document.createElement('td'); td.textContent = v; tr.append(th, td); tb.appendChild(tr); }
      box.appendChild(tb);
    };
    h(L(W.M.name));
    const charmsHere = W.items.filter((it) => it.kind === 'charm');
    const toolsHere = W.items.filter((it) => it.kind === 'tool');
    table([
      [t('recEdges'), `${mr.edges.length} / ${total} (${Math.floor(mr.edges.length / total * 100)}%)`],
      [t('recCps'), `${mr.cp.length} / ${Object.keys(W.cps).length}`],
      [t('recViews'), `${mr.views.length} / ${W.views.length}`],
      [t('recCharms'), `${charmsHere.filter((c) => mr.items.includes(c.uid)).length} / ${charmsHere.length}`],
      [t('recTools'), `${toolsHere.filter((c) => mr.items.includes(c.uid)).length} / ${toolsHere.length}`],
    ]);
    h(t('recBest'));
    table(W.M.goals.map((id) => {
      const g = mr.goals[id];
      return [L(W.cps[id].name), g ? `${fmtTime(g.t)} (${L(W.cps[g.from].name)})` : '—'];
    }));
    h(t('recTotal'));
    const st = save.stats;
    table([
      [t('statClimb'), `${Math.round(st.climb).toLocaleString()} m`],
      [t('recDist'), `${(st.dist / 1000).toFixed(1)} km`],
      [t('recDamage'), heartsText(st.dmg)],
      [t('statFalls'), String(st.falls)],
      [t('recDeaths'), String(st.deaths)],
    ]);
    const obsRows = Object.entries(st.obs).map(([k, v]) => [t('obs_' + k), t('okNg', { ok: v[0], ng: v[1] })]);
    if (obsRows.length) { h(t('recObstacles')); table(obsRows); }
  }

  // ---- アルバム ----
  function renderAlbum() {
    const grid = $('album-grid');
    grid.textContent = '';
    const mr = mrec(mountainId);
    $('album-count').textContent = t('albumCount', { n: mr.views.length, total: W.views.length });
    for (const v of W.views) {
      const fig = document.createElement('figure');
      fig.className = 'album-item';
      const img = photos.views[v.id];
      if (mr.views.includes(v.id) && img) { const im = document.createElement('img'); im.src = img; im.alt = L(v.name); fig.appendChild(im); }
      else { fig.classList.add('is-locked'); const d = document.createElement('div'); d.textContent = mr.views.includes(v.id) ? '📷' : '？'; fig.appendChild(d); }
      const cap = document.createElement('figcaption'); cap.textContent = mr.views.includes(v.id) ? L(v.name) : '？？？';
      fig.appendChild(cap);
      grid.appendChild(fig);
    }
    for (const p of photos.user.slice().reverse()) {
      const fig = document.createElement('figure');
      fig.className = 'album-item';
      const im = document.createElement('img'); im.src = p.img; im.alt = '';
      const cap = document.createElement('figcaption'); cap.textContent = t('myPhoto', { m: p.alt });
      fig.append(im, cap);
      grid.appendChild(fig);
    }
  }

  // ---- 写真 ----
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = 320; snapCanvas.height = 180;
  function snapshot() {
    renderer.render(scene, camera);
    const ctx = snapCanvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const ar = 16 / 9;
    let sw = w, sh = w / ar;
    if (sh > h) { sh = h; sw = h * ar; }
    ctx.drawImage(canvas, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 320, 180);
    return snapCanvas.toDataURL('image/jpeg', 0.72);
  }
  function flash() { const f = $('flash'); f.classList.add('is-on'); setTimeout(() => f.classList.remove('is-on'), 60); }
  let photoCam = null;
  function enterPhoto() {
    if (mode !== 'play' || !run) return;
    photoCam = { yaw: camYaw, pitch: camPitch, dist: camDist };
    setMode('photo');
  }
  $('btn-shutter').addEventListener('click', () => {
    hud.hidden = true;
    $('photo-ui').hidden = true;
    const img = snapshot();
    $('photo-ui').hidden = false;
    photos.user.push({ img, alt: Math.round(P.y), t: Date.now() });
    while (photos.user.length > 12) photos.user.shift();
    writePhotos();
    SFX.shutter(); flash();
  });
  $('btn-photo-close').addEventListener('click', () => { setMode('play'); });

  // =====================================================================
  // 空気 (霧・空・雨)
  // =====================================================================
  function applyWeather() {
    rain.visible = weather === 'rain';
  }
  const fogCol = new THREE.Color();
  const skyTint = new THREE.Color();
  function atmosphere() {
    const y = camera.position.y;
    let near = lerp(150, 1500, smooth(y / 1000));
    let far = lerp(750, 4600, smooth(y / 1000));
    fogCol.setHex(0xcfe3f2);
    let light = 1;
    if (weather === 'cloudy') { near *= 0.8; far *= 0.8; fogCol.setHex(0xc4ccd4); light = 0.85; }
    if (weather === 'rain') { near *= 0.45; far *= 0.5; fogCol.setHex(0xa9b3bc); light = 0.7; }
    if (weather === 'fog') { near *= 0.2; far *= 0.28; fogCol.setHex(0xdde3e8); light = 0.9; }
    // 雲の中
    const dc = Math.abs(y - W.cloudY);
    if (dc < 30) {
      const k = 1 - dc / 30;
      near = lerp(near, 2, k); far = lerp(far, 70, k);
      fogCol.lerp(new THREE.Color(0xf2f4f6), k);
    }
    // 雲の下は少し暗い
    if (y < W.cloudY && weather !== 'fog') light *= lerp(0.92, 1, smooth((W.cloudY - y) / 600) * 0);
    scene.fog.near = near; scene.fog.far = far;
    scene.fog.color.copy(fogCol);
    renderer.setClearColor(fogCol);
    hemi.intensity = 0.75 * light; sun.intensity = 0.85 * light;
    skyTint.setRGB(light, light, light);
    S.skyMat.color.copy(skyTint);
    // 遠くの山並みは雲の上から見える
    S.farMat.opacity = smooth((y - 380) / 300) * (weather === 'fog' ? 0.3 : weather === 'rain' ? 0.5 : 1);
    S.cloud.material.opacity = weather === 'fog' ? 0.98 : 0.93;
    if (windGain && soundOn) {
      const wv = clamp((y - 200) / 900, 0, 1) * 0.06 + (windNow ? 0.08 : 0) + (weather === 'rain' ? 0.03 : 0);
      windGain.gain.value = lerp(windGain.gain.value, mode === 'play' ? wv : 0, 0.05);
      windFilter.frequency.value = 300 + (windNow ? 300 : 0);
    }
  }
  function updateRain() {
    if (!rain.visible) return;
    const a = rainGeo.attributes.position.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < RAIN_N; i++) {
      let x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      y -= 0.5;
      if (y < cy - 12 || Math.abs(x - cx) > 20 || Math.abs(z - cz) > 20) {
        x = cx + (Math.random() - 0.5) * 40; z = cz + (Math.random() - 0.5) * 40; y = cy + 10 + Math.random() * 10;
      }
      a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // =====================================================================
  // カメラ
  // =====================================================================
  const camTarget = new THREE.Vector3();
  function updateCamera(dt, pad) {
    if (pad && (pad.rx || pad.ry)) turnCamera(pad.rx * 2.4 * dt, pad.ry * 1.6 * dt);
    if (keys.has('camL')) turnCamera(-1.8 * dt, 0);
    if (keys.has('camR')) turnCamera(1.8 * dt, 0);
    camIdle += dt;
    // 状態ごとの距離
    let want = camDistT;
    if (P.state === 'balance' || windNow) want = Math.max(want, 8.5);
    if (P.state === 'climb') want = Math.max(want, 7.5);
    if (P.state === 'swing') want = Math.max(want, 9);
    camDist = lerp(camDist, want, 1 - Math.pow(0.1, dt));
    if (camAuto) {
      camAuto.t -= dt;
      let d = camAuto.yaw - camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * (1 - Math.pow(0.25, dt));
      camPitch = lerp(camPitch, camAuto.pitch, 1 - Math.pow(0.3, dt));
      if (camAuto.t <= 0) camAuto = null;
    } else if (P.state === 'climb' && P.face && camIdle > 0.6) {
      const want2 = Math.atan2(P.face.nx, P.face.nz);
      let d = want2 - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * (1 - Math.pow(0.4, dt));
      camPitch = lerp(camPitch, 0.05, 1 - Math.pow(0.5, dt));
    } else if ((P.state === 'ground' || P.state === 'balance') && camIdle > 2.5 && P.speed > 1 && curIn.y > 0.5) {
      // 進む向きの後ろへゆっくり回り込む
      const want2 = P.yaw + Math.PI;
      let d = want2 - camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * (1 - Math.pow(0.7, dt));
    }
    camTarget.set(P.x, P.y + 1.5, P.z);
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    let dist = camDist;
    // 地面や建物にめりこまないよう縮める
    const blk = O.blockers.filter((b) => Math.abs(b.x - camTarget.x) < 25 && Math.abs(b.z - camTarget.z) < 25);
    for (let k = 1; k <= 12; k++) {
      const f = (k / 12) * dist;
      const x = camTarget.x + Math.sin(camYaw) * cp * f, z = camTarget.z + Math.cos(camYaw) * cp * f, y = camTarget.y + sp * f;
      let hit = W.height(x, z, true) > y - 0.4;
      for (const b of blk) if (Math.hypot(x - b.x, z - b.z) < b.r + 0.5 && y < b.y + b.h) hit = true;
      if (hit) { dist = Math.max(1.2, f - dist / 12); break; }
    }
    camera.position.set(camTarget.x + Math.sin(camYaw) * cp * dist, camTarget.y + sp * dist, camTarget.z + Math.cos(camYaw) * cp * dist);
    const gy = W.height(camera.position.x, camera.position.z, true) + 0.4;
    if (camera.position.y < gy) camera.position.y = gy;
    if (camShake > 0) { camShake -= dt; camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake; }
    camera.lookAt(camTarget);
    cam.f.x = -Math.sin(camYaw); cam.f.z = -Math.cos(camYaw);
    cam.r.x = Math.cos(camYaw); cam.r.z = -Math.sin(camYaw);
  }

  // =====================================================================
  // キャラクターの見た目
  // =====================================================================
  function animateHiker(dt) {
    const g = player.group;
    g.position.set(P.x, P.y, P.z);
    let dy = P.yaw - g.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.rotation.y += dy * Math.min(1, dt * 14);
    g.rotation.z = 0; g.rotation.x = 0;
    const H = player;
    let aL = 0, aR = 0, lL = 0, lR = 0, aLz = 0, aRz = 0;
    P.anim += dt * (P.speed * 2.2 + 0.001);
    const s = Math.sin(P.anim * 2.4);
    switch (P.state) {
      case 'ground': case 'balance': {
        const k = clamp(P.speed / 4, 0, 1.2);
        lL = s * 0.6 * k; lR = -s * 0.6 * k; aL = -s * 0.5 * k; aR = s * 0.5 * k;
        if (P.state === 'balance') { aLz = 1.2 + P.bal * 0.5; aRz = -1.2 + P.bal * 0.5; g.rotation.z = -P.bal * 0.45; }
        if (P.mode === 'sneak') { lL *= 0.5; lR *= 0.5; }
        if (P.stunT > 0) g.rotation.x = -0.4;
        break;
      }
      case 'air': aL = aR = -2.2; lL = 0.3; lR = -0.2; break;
      case 'slide': aL = aR = -1.0; lL = lR = 0.5; g.rotation.x = -0.3; break;
      case 'climb': case 'mantle': {
        const c = Math.sin(P.anim * 1.5);
        aL = -2.6 + c * 0.4; aR = -2.6 - c * 0.4; lL = -0.4 - c * 0.3; lR = -0.4 + c * 0.3;
        if (P.rappel) { aL = aR = -2.4; lL = lR = -0.5; }
        if (P.speed === 0) P.anim -= dt * 0.001;
        if (P.state === 'climb') P.anim += dt * (Math.abs(curIn.x) + Math.abs(curIn.y)) * 2;
        break;
      }
      case 'swing': aL = aR = -3.0; lL = lR = 0.2 + Math.sin(perfTime * 2) * 0.1; break;
      case 'hook': aL = -2.8; aR = -2.2; lL = 0.2; lR = -0.1; break;
      default: break;
    }
    H.armL.rotation.set(aL, 0, aLz); H.armR.rotation.set(aR, 0, aRz);
    H.legL.rotation.x = lL; H.legR.rotation.x = lR;
    // 影
    const gy = W.height(P.x, P.z);
    shadowBlob.position.set(P.x, gy + 0.06, P.z);
    shadowBlob.visible = P.y - gy < 30 && P.state !== 'climb';
    const k = clamp(1 - (P.y - gy) / 15, 0.3, 1);
    shadowBlob.scale.setScalar(k);
    // 点滅 (ダメージ直後)
    g.visible = !(P.invuln > 0 && Math.floor(P.invuln * 12) % 2 === 1 && P.state !== 'dead');
  }

  // =====================================================================
  // 表示の更新
  // =====================================================================
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function updateHud(dt) {
    drawHearts();
    drawEffects(windNow);
    $('alt').textContent = `${Math.max(0, Math.round(P.y))} m`;
    // 方位: カメラの向き
    const heading = ((Math.atan2(cam.f.x, -cam.f.z) / DEG) + 360) % 360;
    const strip = [];
    for (let k = -2; k <= 2; k++) {
      const h = (heading + k * 45 + 360) % 360;
      const idx = Math.round(h / 45) % 8;
      strip.push(k === 0 ? `[${DIRS[idx]}]` : DIRS[idx]);
    }
    $('compass').textContent = strip.join(' ');
    // 次のチェックポイント
    const nextId = run && run.route[run.idx + 1];
    const nextEl = $('next');
    if (nextId) {
      const c = W.cps[nextId];
      const dx = c.x - P.x, dz = c.z - P.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, -dz) - Math.atan2(cam.f.x, -cam.f.z);
      nextEl.innerHTML = '';
      const ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '▲'; ar.style.transform = `rotate(${ang}rad)`;
      nextEl.append(ar, `${L(c.name)} ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}`);
      guide.visible = true;
      guide.position.set(c.x, c.y + 14 + Math.sin(perfTime * 2) * 0.6, c.z);
      guide.rotation.y += dt;
      const sc = clamp(d / 70, 1, 12);
      guide.scale.setScalar(sc);
      guide.material.opacity = d < 40 ? 0.35 : 0.85;
    } else { nextEl.textContent = ''; guide.visible = false; }
    $('clock').textContent = run ? `⏱ ${fmtTime(run.elapsed)}` : '';
    $('herb-count').textContent = save.bag.herb;
    $('food-count').textContent = save.bag.food;
    $('use-herb').disabled = save.bag.herb <= 0;
    $('use-food').disabled = save.bag.food <= 0;
    // スタミナの輪
    const ms = maxStamina();
    P.staminaShow -= dt;
    const showSt = P.staminaShow > 0 || P.state === 'climb' || P.state === 'swing' || P.stamina < ms;
    const sp = toScreen(P.x, P.y + 1.2, P.z);
    staminaEl.style.transform = `translate(${sp.x + 46}px, ${sp.y - 10}px)`;
    staminaEl.classList.toggle('is-on', showSt && sp.ok);
    const base = Math.min(1, P.stamina);
    stFill.style.strokeDasharray = `${CIRC * base} ${CIRC}`;
    const extra = clamp(P.stamina - 1, 0, 1) / Math.max(0.0001, ms - 1);
    stExtra.style.strokeDasharray = ms > 1 ? `${CIRC2 * extra * (ms - 1)} ${CIRC2}` : `0 ${CIRC2}`;
    staminaEl.classList.toggle('is-low', P.stamina < 0.25 * ms && !P.exhausted);
    staminaEl.classList.toggle('is-tired', P.exhausted);
    // バランス
    const bp = toScreen(P.x, P.y - 0.2, P.z);
    balEl.style.transform = `translate(${bp.x}px, ${bp.y + 16}px)`;
    balEl.classList.toggle('is-on', P.state === 'balance');
    balMark.style.left = `${50 + clamp(P.bal, -1, 1) * 48}%`;
    // 着地の予測 (麓と中腹だけ)
    if (P.state === 'swing' && P.y < 550) {
      const lp = predictLanding();
      if (lp) {
        const rp = toScreen(lp.x, lp.y + 0.05, lp.z);
        ringEl.style.transform = `translate(${rp.x}px, ${rp.y}px)`;
        ringEl.classList.toggle('is-on', rp.ok);
        ringEl.style.borderColor = lp.deep ? 'rgba(255,90,70,0.9)' : 'rgba(255,245,160,0.9)';
      } else ringEl.classList.remove('is-on');
    } else ringEl.classList.remove('is-on');
    // 使う
    const act = contextAction();
    if (P.state === 'climb' || P.state === 'swing') {
      setPrompt(t('releaseHint'), true);
      promptEl.querySelector('.key') && (promptEl.querySelector('.key').textContent = inputKind === 'pad' ? 'X' : 'X');
      $('btn-use').hidden = true;
    } else setPrompt(act && act.txt, act && act.ok);
    $('btn-release').hidden = !(inputKind === 'touch' && (P.state === 'climb' || P.state === 'swing'));
    // 文字の表示時間
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('is-on'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('is-on'); }
    if (vignetteT > 0) { vignetteT -= dt; vignette.classList.add('is-on'); } else vignette.classList.toggle('is-on', P.hp > 0 && P.hp <= 2);
    return act;
  }

  // =====================================================================
  // メインループ
  // =====================================================================
  let last = performance.now();
  let acc = 0;
  let perfTime = 0;
  let saveTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    perfTime += dt;
    const pad = readPad();
    if (!W) { renderer.render(scene, camera); return; }
    if (mode === 'play') {
      curIn = moveInput(pad);
      runHeld = keys.has('run') || !!(pad && pad.run);
      sneakHeld = keys.has('sneak');
      if (pressed.has('pause')) { pressed.clear(); pauseGame(); }
      else if (pressed.has('photo')) { pressed.clear(); enterPhoto(); }
      if (pressed.has('herb')) { pressed.delete('herb'); useConsumable('herb'); }
      if (pressed.has('food')) { pressed.delete('food'); useConsumable('food'); }
      if (pressed.has('use')) {
        pressed.delete('use');
        const a = contextAction();
        if (a && a.ok) a.run();
      }
      // 地面のスティック表示
      const st = $('stick');
      st.classList.toggle('is-on', touch.stickId !== null);
      if (touch.stickId !== null) {
        st.style.left = touch.sx + 'px'; st.style.top = touch.sy + 'px';
        const dx = touch.x - touch.sx, dy = touch.y - touch.sy, l = Math.hypot(dx, dy), R = 55;
        const k = l > R ? R / l : 1;
        $('stick-knob').style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      }
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 16) {
        physics(STEP);
        acc -= STEP; n++;
        pressed.delete('jump'); pressed.delete('release');
      }
      if (run && P.state !== 'dead') run.elapsed += dt;
      O.update(dt, P, { onGustWarn: (g) => { if (Math.hypot(g.A.x - P.x, g.A.z - P.z) < 80) SFX.gust(); }, onRockWarn: (z) => { if (Math.hypot(z.x - P.x, z.z - P.z) < 70) { SFX.rumble(); toast(t('rockWarn'), 1.5); } } });
      faceHintCd = Math.max(0, faceHintCd - dt);
      if (viewLock) {
        viewLock.t -= dt;
        if (viewLock.t <= 0) {
          hud.hidden = true;
          photos.views[viewLock.v.id] = snapshot();
          hud.hidden = false;
          writePhotos();
          SFX.shutter(); flash();
          viewLock = null;
        }
      }
      saveTimer += dt;
      if (saveTimer > 10) { saveTimer = 0; if (run) { save.run && (save.run.elapsed = run.elapsed); saveRun(); } }
      updateCamera(dt, pad);
      updateHud(dt);
    } else if (mode === 'photo') {
      if (pad && (pad.rx || pad.ry || pad.lx || pad.ly)) turnCamera((pad.rx + pad.lx) * 2 * dt, (pad.ry + pad.ly) * 1.5 * dt);
      if (pressed.has('photo') || pressed.has('pause')) { pressed.clear(); setMode('play'); }
      updateCamera(dt, null);
    } else if (curScreen === 'title' || (mode === 'menu' && !run)) {
      // メニューの後ろで山をゆっくり回す
      const a = perfTime * 0.03;
      camera.position.set(Math.cos(a) * 1900, 900, Math.sin(a) * 1900);
      camera.lookAt(0, 420, 0);
    }
    pressed.clear();
    S.update(camera.position.x, camera.position.z, mode === 'play' ? 2 : 1);
    S.tick(dt);
    O.animateFlags(perfTime);
    animateHiker(dt);
    atmosphere();
    updateRain();
    S.sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  // =====================================================================
  // はじめる
  // =====================================================================
  (async () => {
    showScreen('loading');
    try {
      await loadMountain(window.SUMMIT_MOUNTAIN_LIST[0].id);
    } catch (e) {
      $('load-error').hidden = false;
      return;
    }
    setMode('menu');
    showScreen('title');
    requestAnimationFrame(frame);
  })();

  // テスト用: 入力を決めて物理だけを進める (dx, dz は世界の向き)
  function simWorld(dx, dz, n, opt) {
    opt = opt || {};
    const l = Math.hypot(dx, dz);
    if (l > 0) { cam.f.x = dx / l; cam.f.z = dz / l; cam.r.x = -cam.f.z; cam.r.z = cam.f.x; }
    curIn = { x: opt.x || 0, y: l > 0 ? (opt.y != null ? opt.y : 1) : 0, mag: l > 0 || opt.x ? (opt.mag || 1) : 0, analog: !!opt.analog };
    runHeld = !!opt.run; sneakHeld = !!opt.sneak;
    for (const k of opt.press || []) pressed.add(k);
    for (let i = 0; i < n; i++) {
      if (pressed.has('use')) { pressed.delete('use'); const a = contextAction(); if (a && a.ok) a.run(); }
      physics(STEP);
      pressed.delete('jump'); pressed.delete('release');
      if (i % 4 === 0) O.update(STEP * 4, P, {});
      if (run && P.state !== 'dead') run.elapsed += STEP;
    }
    pressed.clear();
    return { x: P.x, y: P.y, z: P.z, state: P.state, hp: P.hp, st: P.stamina, bal: P.bal, s: P.s };
  }
  window.__summit = {
    scene,
    simWorld, contextAction: () => { const a = contextAction(); return a && { txt: a.txt, ok: a.ok }; }, giveTool: (id) => { if (!save.tools.includes(id)) save.tools.push(id); },
    teleport: (x, z, y) => { P.x = x; P.z = z; P.y = y != null ? y : W.height(x, z); P.vx = P.vy = P.vz = 0; P.state = 'ground'; P.deck = null; P.face = null; P.rope = null; S.prime(x, z); }, P, get W() { return W; }, get O() { return O; }, get run() { return run; }, save: () => save, startRun, physics, setKeys: (k) => { keys.clear(); for (const x of k) keys.add(x); }, press: (k) => pressed.add(k), get mode() { return mode; }, camYawSet: (y) => { camYaw = y; }, reachCp, planRoute };
})();
