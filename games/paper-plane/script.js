/*
 * 窓から紙ひこうき: 机の上で紙ひこうきを折って、窓から飛ばして飛距離を競う 3D ゲーム
 *   描画は three.js。紙の形の計算と飛ぶときの物理は model.js (PaperPlaneModel)。
 *   長さの単位はメートル。建物の外壁が x = 0 で、窓の外 (+x) に向かって飛ばす。
 *   流れ: タイトル → 折る (8手順) → 完成 → 窓から投げる (角度と力) → 飛ぶ (カメラが追う) → 記録
 */
(() => {
  'use strict';

  const PM = window.PaperPlaneModel;
  const PS = window.PaperPlaneStages;
  const I18N = window.PAPER_PLANE_I18N;
  const $ = (id) => document.getElementById(id);
  if (!window.THREE || !PM || !PS || !I18N) {
    $('load-error').hidden = false;
    $('start-btn').disabled = true;
    $('free-btn').disabled = true;
    return;
  }

  const { W, H, HW, EPS } = PM;
  const BLD = PM.BUILDING;
  const DESK_X = -0.78;                  // 机の中心 (窓の手前)
  const DESK_TOP = BLD.floorY + 0.75;
  const SNAP = 0.006;                    // 目印からこの距離までなら、ぴったりに吸いつく
  const MAX_MISS = 0.03;                 // 目印からこれ以上離れたところで離したら、折らずに戻す
  const PREVIEW_THETA = Math.PI * 0.93;  // ドラッグ中は少し浮かせて見せる
  const WING_FOLD = Math.PI / 2 - PM.DIHEDRAL;
  const MIN_SPEED = 2;                   // m/s (力 0%)
  const MAX_SPEED = 14;                  // m/s (力 100%)
  const ANGLE_MIN = -20;
  const ANGLE_MAX = 45;
  const AIM_MAX = 25;                    // 左右の向き (度)。スライダーは左が - (左)、右が + (右)
  const COLORS = ['#e8473d', '#2c7be5', '#f2b632', '#3fae6a', '#8a5cd1', '#f07fb0'];

  // ---- DOM ----
  const canvas = $('board');
  const wrap = $('board-wrap');
  const hudStep = $('hud-step');
  const hudWind = $('hud-wind');
  const windArrow = $('wind-arrow');
  const windText = $('wind-text');
  const hudBest = $('hud-best');
  const hudFlight = $('hud-flight');
  const calloutEl = $('callout');
  const overlay = $('overlay');
  const screenTitle = $('screen-title');
  const screenResult = $('screen-result');
  const startBtn = $('start-btn');
  const colorRow = $('color-row');
  const titleBest = $('title-best');
  const guideTitle = $('guide-title');
  const guideText = $('guide-text');
  const guideStats = $('guide-stats');
  const actionsEl = $('actions');
  const launchEl = $('launch');
  const angleInput = $('angle');
  const angleVal = $('angle-val');
  const powerInput = $('power');
  const powerVal = $('power-val');
  const aimInput = $('aim');
  const aimVal = $('aim-val');
  const throwBtn = $('throw-btn');
  const resultDist = $('result-dist');
  const resultCrash = $('result-crash');
  const resultNote = $('result-note');
  const resultTop = $('result-top');
  const againBtn = $('again-btn');
  const refoldBtn = $('refold-btn');
  const shareBtn = $('share-btn');
  const langSelect = $('lang-select');
  const stageRow = $('stage-row');
  const replayBtn = $('replay-btn');
  const panelEl = $('panel');
  const hudEl = $('hud');
  const progressEl = $('progress');
  const progressFill = $('progress-fill');
  const helpEl = $('help');
  const helpBtn = $('help-btn');
  const sharePreview = $('share-preview');
  const shareNote = $('share-note');

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
  };
  // ---- 言語 ----
  function pickLang() {
    const saved = store.get('paper-plane-lang');
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
  // t('key', { n: 3 }) → 選んだ言語の文。{n} を差しこむ
  function t(key, vars) {
    let s = (I18N.ui[lang] && I18N.ui[lang][key]) ?? I18N.ui.ja[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }

  const trackEvent = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };

  // ---------- アクセス解析: ステージの開始・結末・リトライ (全ゲーム共通の形で GA4 に送る) ----------
  // stage_start / stage_end (result: clear・fail・quit) / stage_retry_fail・stage_retry_clear・stage_retry_quit
  // 終わったステージをそのまま遊び直したら、直前の結末に合わせたリトライとして送る
  const stageTrack = (() => {
    const GAME = 'paper_plane';
    const attempts = {};
    let playing = null; // { stage, at } 遊んでいる途中のステージ
    let ended = null; // { stage, result } 直前に終わったステージ
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

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const fmtM = (d) => `${d.toFixed(2)} m`;

  // =====================================================================
  // 描画の準備
  // =====================================================================
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9d6f5');
  scene.fog = new THREE.Fog('#cbe6f7', 140, 460);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.02, 1200);

  const hemi = new THREE.HemisphereLight('#f2f8ff', '#7d9a5c', 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 0.7);
  sun.position.set(DESK_X + 1.4, DESK_TOP + 2.6, 0.9);
  sun.target.position.set(DESK_X, DESK_TOP, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -0.6;
  sun.shadow.camera.right = 0.6;
  sun.shadow.camera.top = 0.6;
  sun.shadow.camera.bottom = -0.6;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 6;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    if (repeat) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    return t;
  }

  function speckle(g, w, h, n, color, alpha, size) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      g.globalAlpha = Math.random() * alpha;
      g.fillRect(Math.random() * w, Math.random() * h, size * (0.5 + Math.random()), size * (0.5 + Math.random()));
    }
    g.globalAlpha = 1;
  }

  const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // ---- 空 ----
  const skyTex = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#4f9fe0');
    gr.addColorStop(0.42, '#a9d6f5');
    gr.addColorStop(0.5, '#e3f2fb');
    gr.addColorStop(0.56, '#cfe3c8');
    gr.addColorStop(1, '#9fbf86');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);

  // 雲
  const cloudMat = lambert('#ffffff', { emissive: '#d8e6f0', emissiveIntensity: 0.35 });
  const puff = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 18; i++) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(puff, cloudMat);
      const s = rand(4, 8);
      m.scale.set(s * 1.4, s * 0.7, s);
      m.position.set(j * rand(4, 7) - n * 2.5, rand(-1, 1.5), rand(-3, 3));
      g.add(m);
    }
    const ang = rand(-1.2, 1.2);
    const dist = rand(120, 380);
    g.position.set(Math.cos(ang) * dist, rand(45, 85), Math.sin(ang) * dist);
    g.rotation.y = rand(0, Math.PI);
    scene.add(g);
  }

  // 風見の旗の形 (ステージごとに立てる)
  const poleMat = lambert('#d9dde2');
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, -0.35, 0, 0, -0.7, 0], 3));
  flagGeo.computeVertexNormals();

  // ---- 建物 (外壁は x = 0 から内側へ厚さ 0.25。窓の穴をあけてある) ----
  const wallMat = lambert('#ece3d3');
  const WX = -BLD.wallT / 2;
  const WALL_BOTTOM = -70;
  box(BLD.wallT, BLD.sillY - WALL_BOTTOM, 28, wallMat, WX, (BLD.sillY + WALL_BOTTOM) / 2, 0);
  box(BLD.wallT, 12.6 - BLD.topY, 28, wallMat, WX, (12.6 + BLD.topY) / 2, 0);
  const sideW = 14 - BLD.halfZ;
  const winH = BLD.topY - BLD.sillY;
  box(BLD.wallT, winH, sideW, wallMat, WX, BLD.sillY + winH / 2, -BLD.halfZ - sideW / 2);
  box(BLD.wallT, winH, sideW, wallMat, WX, BLD.sillY + winH / 2, BLD.halfZ + sideW / 2);
  box(0.5, 0.25, 28.4, lambert('#d6ccba'), 0, 12.7, 0);
  // ほかの窓 (飾り) はステージの地面の高さに合わせて、buildStage で作る
  const glassMat = lambert('#45647e', { emissive: '#1b2a38', emissiveIntensity: 0.3 });
  const frameMat = lambert('#f7f5f0');
  const bandMat = lambert('#ddd3c1');
  // 飛ばす窓の枠
  box(0.34, 0.06, BLD.halfZ * 2 + 0.2, frameMat, -0.1, BLD.sillY - 0.03, 0);
  box(BLD.wallT + 0.02, 0.06, BLD.halfZ * 2 + 0.1, frameMat, WX, BLD.topY + 0.03, 0);
  for (const s of [-1, 1]) box(BLD.wallT + 0.02, winH, 0.06, frameMat, WX, BLD.sillY + winH / 2, s * (BLD.halfZ + 0.03));

  // ---- 部屋 ----
  const ROOM = { x0: -4.6, x1: -BLD.wallT, z: 3, y0: BLD.floorY, y1: BLD.floorY + 2.9 };
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#b98a5b' : '#c49566';
      g.fillRect(0, (i * h) / 8, w, h / 8);
    }
    speckle(g, w, h, 900, '#6e4a2a', 0.25, 3);
    g.fillStyle = 'rgba(70, 40, 20, 0.35)';
    for (let i = 0; i < 8; i++) g.fillRect(0, (i * h) / 8, w, 1.5);
  }, [3, 4]);
  function roomPlane(w, h, mat, pos, rot) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.set(rot[0], rot[1], rot[2]);
    scene.add(m);
    return m;
  }
  const roomW = ROOM.x1 - ROOM.x0;
  const roomCx = (ROOM.x0 + ROOM.x1) / 2;
  const roomH = ROOM.y1 - ROOM.y0;
  const roomWallMat = lambert('#f4eee3');
  const floor = roomPlane(roomW, ROOM.z * 2, new THREE.MeshLambertMaterial({ map: floorTex }), [roomCx, ROOM.y0 + 0.001, 0], [-Math.PI / 2, 0, 0]);
  floor.receiveShadow = true;
  roomPlane(roomW, ROOM.z * 2, lambert('#fbfaf6'), [roomCx, ROOM.y1, 0], [Math.PI / 2, 0, 0]);
  roomPlane(ROOM.z * 2, roomH, roomWallMat, [ROOM.x0, ROOM.y0 + roomH / 2, 0], [0, Math.PI / 2, 0]);
  roomPlane(roomW, roomH, roomWallMat, [roomCx, ROOM.y0 + roomH / 2, -ROOM.z], [0, 0, 0]);
  roomPlane(roomW, roomH, roomWallMat, [roomCx, ROOM.y0 + roomH / 2, ROOM.z], [0, Math.PI, 0]);
  // 天井の明かり
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fffdf2' });
  roomPlane(1.2, 0.5, lampMat, [-2.2, ROOM.y1 - 0.01, 0], [Math.PI / 2, 0, 0]);
  // カーテン
  const curtainMat = lambert('#9cc3d8', { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.3, 8, 1), curtainMat);
    const pos = c.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.04);
    c.geometry.computeVertexNormals();
    c.rotation.y = Math.PI / 2;
    c.position.set(-0.32, ROOM.y1 - 1.2, s * (BLD.halfZ + 0.3));
    scene.add(c);
  }
  // 本棚
  box(0.35, 1.8, 1.4, lambert('#a4774d'), ROOM.x0 + 0.2, ROOM.y0 + 0.9, -1.6);
  const bookColors = ['#c0392b', '#2c7be5', '#f2b632', '#3fae6a', '#8a5cd1', '#e67e22', '#34495e'];
  for (let r = 0; r < 3; r++) {
    for (let z = -2.2; z < -1.0; z += 0.09) {
      const hgt = rand(0.26, 0.38);
      box(0.25, hgt, 0.07, lambert(bookColors[Math.floor(Math.random() * bookColors.length)]), ROOM.x0 + 0.24, ROOM.y0 + 0.25 + r * 0.55 + hgt / 2, z);
    }
  }

  // ---- 机 ----
  const woodTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b98b5e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110, 70, 38, 0.3)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = rand(0.5, 2);
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rand(-8, 8), w * 0.6, y + rand(-8, 8), w, y + rand(-4, 4));
      g.stroke();
    }
    speckle(g, w, h, 400, '#8a5f37', 0.15, 2);
  }, [1, 2]);
  const deskTop = box(0.74, 0.04, 1.4, new THREE.MeshLambertMaterial({ map: woodTex }), DESK_X, DESK_TOP - 0.02, 0);
  deskTop.receiveShadow = true;
  const legMat = lambert('#8c6a48');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.71, 0.05, legMat, DESK_X + sx * 0.32, BLD.floorY + 0.355, sz * 0.65);
  // 鉛筆と定規 (飾り)
  const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), lambert('#f2b632'));
  pencil.rotation.set(0, 0.3, Math.PI / 2);
  pencil.position.set(DESK_X - 0.05, DESK_TOP + 0.004, -0.36);
  pencil.castShadow = true;
  scene.add(pencil);
  const ruler = box(0.3, 0.003, 0.035, lambert('#e8eef2'), DESK_X + 0.05, DESK_TOP + 0.0015, 0.38);
  ruler.rotation.y = -0.15;
  ruler.castShadow = true;

  // 木の形 (ステージごとに植える)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const trunkMat = lambert('#7b5a3a');
  const leafMats = ['#3f8a3a', '#4f9b45', '#367a35'].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1 }));

  // =====================================================================
  // ステージ (窓の外の景色)。ステージを変えるたびに stageGroup を作りなおす
  // =====================================================================
  const SKIES = {
    day: { stops: ['#4f9fe0', '#a9d6f5', '#e3f2fb', '#cfe3c8', '#9fbf86'], fog: '#cbe6f7', hemiSky: '#f2f8ff', hemiGround: '#7d9a5c', sun: '#fff4e0' },
    haze: { stops: ['#6aa6d6', '#b9d3e6', '#e6eef3', '#c9ccc8', '#9a9e98'], fog: '#d3dde4', hemiSky: '#eef3f8', hemiGround: '#8a8d88', sun: '#fff6ea' },
    sea: { stops: ['#2f8ee0', '#8fd0fb', '#e8f7ff', '#5fb7e6', '#2a7fc0'], fog: '#cfeaf9', hemiSky: '#f4fbff', hemiGround: '#5e9bc4', sun: '#fffaf0' },
    sunset: { stops: ['#3a4d92', '#c97a8e', '#ffb07a', '#f6c48f', '#8b7f78'], fog: '#efb58f', hemiSky: '#ffe2c4', hemiGround: '#7a6a66', sun: '#ffc48a' },
  };
  const FOG_FAR = { field: 460, hill: 760, city: 420, cliff: 900, tower: 950 };

  function setSky(kind, stageId) {
    const sk = SKIES[kind] || SKIES.day;
    const c = sky.material.map.image;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, c.height);
    [0, 0.42, 0.5, 0.56, 1].forEach((o, i) => gr.addColorStop(o, sk.stops[i]));
    g.fillStyle = gr;
    g.fillRect(0, 0, c.width, c.height);
    sky.material.map.needsUpdate = true;
    scene.fog.color.set(sk.fog);
    scene.fog.far = FOG_FAR[stageId] || 460;
    scene.fog.near = scene.fog.far * 0.3;
    hemi.color.set(sk.hemiSky);
    hemi.groundColor.set(sk.hemiGround);
    sun.color.set(sk.sun);
  }

  // 地面の模様
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6fae4f';
    g.fillRect(0, 0, w / 2, h);
    g.fillStyle = '#62a046';
    g.fillRect(w / 2, 0, w / 2, h);
    speckle(g, w, h, 2600, '#3f7a2e', 0.5, 2);
    speckle(g, w, h, 1400, '#a6d47a', 0.4, 2);
  });
  const asphaltTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d6166';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, '#2f3236', 0.5, 2);
    speckle(g, w, h, 1500, '#9a9ea3', 0.35, 2);
  });
  const roadTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#55595e';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1200, '#2f3236', 0.5, 2);
    g.fillStyle = '#f2f2ea';
    g.fillRect(0, 2, w, 3);
    g.fillRect(0, h - 5, w, 3);
    g.fillStyle = '#f2c94c';
    g.fillRect(0, h / 2 - 2, w * 0.55, 4);
  });
  const seaTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#2b86c6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 8, y - 4, x + 16, y);
      g.stroke();
    }
  });
  const rockTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8c7b68';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, '#5d5044', 0.6, 5);
    speckle(g, w, h, 500, '#b8a690', 0.5, 4);
  });
  const windowTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3c5a74';
    g.fillRect(w * 0.18, h * 0.22, w * 0.64, h * 0.5);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    g.fillRect(w * 0.18, h * 0.22, w * 0.22, h * 0.5);
  });
  function tiled(tex, rx, ry) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }

  // 箱の面の UV を、面の大きさ (m) / tile に合わせる (窓の模様がどの建物でも同じ大きさになる)
  function scaledBox(w, h, d, tile) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x, -x, +y, -y, +z, -z
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, uv.getX(k) * spans[f][0] / tile, uv.getY(k) * spans[f][1] / tile);
      }
    }
    return geo;
  }
  const BUILDING_COLORS = ['#e9e1d3', '#d7dde4', '#e8d2bf', '#c9d6cf', '#f0e6c8', '#d9cfe0'];
  const HOUSE_COLORS = ['#f4e3c7', '#e7f0f4', '#f6d6cc', '#e2eedb', '#fff3d6'];
  const ROOF_COLORS = ['#b5523b', '#3f6b8c', '#5c7d4a', '#8a5a3c', '#555b66'];
  const buildingMats = BUILDING_COLORS.map((c) => {
    const side = new THREE.MeshLambertMaterial({ color: c, map: tiled(windowTex, 1, 1) });
    const top = lambert(new THREE.Color(c).multiplyScalar(0.82));
    return [side, side, top, top, side, side];
  });
  const houseMats = HOUSE_COLORS.map((c) => lambert(c));
  const roofMats = ROOF_COLORS.map((c) => lambert(c, { flatShading: true }));
  const concreteMat = lambert('#b9bcc0');
  const archMat = lambert('#e2483c');
  const pick = (arr, f) => arr[Math.floor(f * arr.length) % arr.length];

  let stage = PS.byId(store.get('paper-plane-stage'));
  let stageGroup = null;
  let flags = [];

  function buildStage(st) {
    if (stageGroup) {
      scene.remove(stageGroup);
      stageGroup.traverse((o) => { if (o.geometry && o.geometry !== flagGeo) o.geometry.dispose(); });
    }
    const G = new THREE.Group();
    stageGroup = G;
    scene.add(G);
    flags = [];
    setSky(st.look.sky, st.id);
    const add = (m) => { G.add(m); return m; };
    const gy = (x, z) => st.ground(x, z);
    const kind = st.look.groundKind;

    // 地面
    if (kind === 'grass' || kind === 'asphalt' || kind === 'town') {
      const y0 = gy(10, 0);
      const tex = kind === 'grass' ? tiled(grassTex, 100, 100) : tiled(asphaltTex, 160, 160);
      const g = add(new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshLambertMaterial({ map: tex, color: kind === 'town' ? '#9aa39a' : '#ffffff' })));
      g.rotation.x = -Math.PI / 2;
      g.position.set(400, y0, 0);
      if (kind === 'asphalt') {
        // 通りの真ん中の線
        const line = add(new THREE.Mesh(new THREE.PlaneGeometry(500, 0.25), new THREE.MeshBasicMaterial({ color: '#f2c94c' })));
        line.rotation.x = -Math.PI / 2;
        line.position.set(250, 0.015, 0);
      }
    } else if (kind === 'hill') {
      // x の向きにだけ高さが変わるので、x を細かく分けた板を曲げる
      const geo = new THREE.PlaneGeometry(1200, 900, 240, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, gy(pos.getX(i) + 500, 0));
      geo.computeVertexNormals();
      const g = add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tiled(grassTex, 120, 90) })));
      g.rotation.x = -Math.PI / 2;
      g.position.set(500, 0, 0);
      const rgeo = new THREE.PlaneGeometry(1200, 8, 240, 1);
      const rpos = rgeo.attributes.position;
      for (let i = 0; i < rpos.count; i++) rpos.setZ(i, gy(rpos.getX(i) + 500, 0) + 0.04);
      rgeo.computeVertexNormals();
      const road = add(new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ map: tiled(roadTex, 150, 1) })));
      road.rotation.x = -Math.PI / 2;
      road.position.set(500, 0, 0);
    } else if (kind === 'cliff') {
      const cx = PS.CLIFF_X;
      const land = add(new THREE.Mesh(new THREE.PlaneGeometry(cx + 300, 900), new THREE.MeshLambertMaterial({ map: tiled(grassTex, (cx + 300) / 10, 90) })));
      land.rotation.x = -Math.PI / 2;
      land.position.set((cx - 300) / 2, 0, 0);
      const face = add(new THREE.Mesh(new THREE.PlaneGeometry(900, -PS.SEA_Y + 2, 1, 1), new THREE.MeshLambertMaterial({ map: tiled(rockTex, 60, 3) })));
      face.rotation.y = Math.PI / 2;
      face.position.set(cx, PS.SEA_Y / 2 - 1, 0);
      const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ map: tiled(seaTex, 120, 120) })));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(cx + 800, PS.SEA_Y, 0);
      sea.userData.sea = true;
    }

    // 建物の壁のほかの窓 (地面の高さから窓の下まで)
    const baseY = gy(1, 0);
    for (let y = baseY + 2.65; y < 10; y += 3.5) {
      for (let z = -9; z <= 9; z += 3) {
        if (z === 0 && y > 9) continue;
        const fr = add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), frameMat));
        fr.rotation.y = Math.PI / 2;
        fr.position.set(0.01, y, z);
        const gl = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), glassMat));
        gl.rotation.y = Math.PI / 2;
        gl.position.set(0.015, y, z);
      }
      const band = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 28.2), bandMat));
      band.position.set(0.05, y + 1.65, 0);
    }

    // じゃま物
    for (const b of st.boxes) {
      const w = b.x1 - b.x0;
      const h = b.y1 - b.y0;
      const d = b.z1 - b.z0;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      if (b.kind === 'building') {
        const m = add(new THREE.Mesh(scaledBox(w, h, d, 3.6), pick(buildingMats, b.hue)));
        m.position.set(cx, b.y0 + h / 2, cz);
      } else if (b.kind === 'house') {
        const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(houseMats, b.hue)));
        m.position.set(cx, b.y0 + h / 2, cz);
        const roof = add(new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4), pick(roofMats, b.hue * 7)));
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(w * 1.08, 2.2, d * 1.08);
        roof.position.set(cx, b.y1 + 1.1, cz);
      } else if (b.kind === 'lighthouse') {
        const tower = add(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 16), lambert('#f7f7f2')));
        tower.position.set(cx, b.y0 + h / 2, cz);
        const top = add(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 1.6, 16), lambert('#e2483c')));
        top.position.set(cx, b.y1 + 0.8, cz);
      } else {
        const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), b.kind === 'arch' ? archMat : concreteMat));
        m.position.set(cx, b.y0 + h / 2, cz);
      }
    }

    // 距離の線: 窓の下の壁ぎわを中心にした円弧を、地面の起伏に沿わせて引く
    const arcMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
    const step = st.arcMax > 200 ? 20 : 10;
    for (let d = step; d <= st.arcMax; d += step) {
      const n = 96;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= n; i++) {
        const a = -0.45 + (0.9 * i) / n;
        for (const r of [d - 0.08, d + 0.08]) {
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          pos.push(x, gy(x, z) + 0.03, z);
        }
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      add(new THREE.Mesh(geo, arcMat));
      for (const a of [-0.3, 0, 0.3]) {
        const x = Math.cos(a) * (d - 1.6);
        const z = Math.sin(a) * (d - 1.6);
        const label = groundLabel(`${d}m`, (a === 0 ? 3.2 : 2.2) * (step / 10), '#ffffff');
        label.position.set(x, gy(x, z) + 0.05, z);
        label.rotation.z = -Math.PI / 2 - a;
        if (kind === 'hill') label.rotation.y = -Math.atan(PS.HILL_GRADE) * (x > PS.HILL_START && gy(x, z) > PS.HILL_FLOOR ? 1 : 0);
        add(label);
      }
    }

    // 風見の旗
    const flagMat = new THREE.MeshLambertMaterial({ color: '#ff7a3d', side: THREE.DoubleSide });
    for (const [x, z] of st.flags) {
      const y = PS.surfaceY(st, x, z);
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 8), poleMat));
      pole.position.set(x, y + 2, z);
      const fg = add(new THREE.Group());
      fg.position.set(x, y + 3.95, z);
      const f = new THREE.Mesh(flagGeo, flagMat);
      fg.add(f);
      flags.push({ g: fg, f, phase: Math.random() * 6 });
    }

    // 木
    const r = PS.rng(st.id.length * 101 + 7);
    const tree = (x, z, s) => {
      const y = gy(x, z);
      const t = add(new THREE.Mesh(trunkGeo, trunkMat));
      t.position.set(x, y + 1.2 * s, z);
      t.scale.setScalar(s);
      const l = add(new THREE.Mesh(leafGeo, leafMats[Math.floor(r() * leafMats.length)]));
      l.position.set(x, y + 3.3 * s, z);
      l.scale.set(s * (0.9 + r() * 0.3), s * (1.1 + r() * 0.4), s * (0.9 + r() * 0.3));
      l.rotation.y = r() * 3;
    };
    if (kind === 'grass') {
      for (let x = 8; x < 240; x += 5 + r() * 4) for (const s of [-1, 1]) tree(x, s * (64 + r() * 26), 1.2 + r());
      for (let z = -90; z < 90; z += 5 + r() * 4) tree(175 + r() * 25, z, 1.6 + r());
    } else if (kind === 'hill') {
      for (let x = 10; x < 500; x += 4 + r() * 6) for (const s of [-1, 1]) tree(x, s * (26 + r() * 50), 1.1 + r());
    } else if (kind === 'cliff') {
      for (let i = 0; i < 40; i++) {
        const x = -40 + r() * (PS.CLIFF_X + 30);
        const z = (r() < 0.5 ? -1 : 1) * (20 + r() * 80);
        if (x < PS.CLIFF_X - 3 && (x < -2 || Math.abs(z) > 16)) tree(x, z, 1 + r());
      }
    } else if (kind === 'asphalt') {
      for (let x = 14; x < 300; x += 14) for (const s of [-1, 1]) tree(x, s * (PS.STREET_HALF - 1.2), 0.75);
    }
  }

  // 3D の地面の数字
  function groundLabel(text, size, color) {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.font = '800 72px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(30, 60, 20, 0.55)';
      g.strokeText(text, w / 2, h / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    return m;
  }

  // ---- 上昇気流: 光の粒が上っていく柱。投げるたびに場所が変わる ----
  const sparkTex = canvasTex(32, 32, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gr.addColorStop(0.4, 'rgba(255, 246, 200, 0.7)');
    gr.addColorStop(1, 'rgba(255, 246, 200, 0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const columnTex = canvasTex(64, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gr.addColorStop(0.5, 'rgba(255, 250, 220, 0.6)');
    gr.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 6; i++) g.fillRect((i * w) / 6, 0, 2, h);
  });
  let thermals = [];
  let thermalViews = [];
  const thermalGroup = new THREE.Group();
  scene.add(thermalGroup);
  const SPARKS = 160;

  function buildThermals() {
    for (const v of thermalViews) {
      v.points.geometry.dispose();
      v.column.geometry.dispose();
    }
    thermalGroup.clear();
    thermalViews = thermals.map((th) => {
      const base = stage.ground(th.x, th.z);
      const height = th.top + 10 - base;
      const pos = new Float32Array(SPARKS * 3);
      const speed = new Float32Array(SPARKS);
      for (let i = 0; i < SPARKS; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * th.r * 0.9;
        pos[i * 3] = th.x + Math.cos(a) * rr;
        pos[i * 3 + 1] = base + Math.random() * height;
        pos[i * 3 + 2] = th.z + Math.sin(a) * rr;
        speed[i] = th.v * (1.4 + Math.random());
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.55, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff3c4',
      }));
      points.frustumCulled = false;
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(th.r * 0.75, th.r * 0.95, height, 24, 1, true),
        new THREE.MeshBasicMaterial({ map: columnTex.clone(), transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      column.material.map.needsUpdate = true;
      column.material.map.wrapS = THREE.RepeatWrapping;
      column.material.map.repeat.set(3, 1);
      column.position.set(th.x, base + height / 2, th.z);
      thermalGroup.add(points, column);
      return { points, column, speed, base, height, th };
    });
  }

  function animateThermals(dt, time) {
    for (const v of thermalViews) {
      const pos = v.points.geometry.attributes.position;
      for (let i = 0; i < SPARKS; i++) {
        let y = pos.array[i * 3 + 1] + v.speed[i] * dt;
        if (y > v.base + v.height) y = v.base;
        pos.array[i * 3 + 1] = y;
      }
      pos.needsUpdate = true;
      v.column.material.map.offset.x = (time * 0.05) % 1;
      v.column.rotation.y = time * 0.2;
    }
  }

  // =====================================================================
  // 紙
  // =====================================================================
  const root = new THREE.Group();          // 机の上では紙の置き場所、飛ぶときは機体の重心
  const paperObj = new THREE.Group();      // 紙の座標 → 機体の座標 (飛ぶときは重心だけずらす)
  root.add(paperObj);
  scene.add(root);
  const paperGeo = new THREE.BufferGeometry();
  const lineGeo = new THREE.BufferGeometry();
  let paperColor = store.get('paper-plane-color');
  if (!COLORS.includes(paperColor)) paperColor = COLORS[0];

  function paperTexture(color, plain) {
    return canvasTex(256, 362, (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1800, plain ? '#d8d2c4' : '#000000', plain ? 0.35 : 0.08, 2);
      speckle(g, w, h, 900, '#ffffff', plain ? 0.3 : 0.12, 2);
    });
  }
  const paperMat = {
    front: new THREE.MeshStandardMaterial({ side: THREE.FrontSide, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    back: new THREE.MeshStandardMaterial({ map: paperTexture('#f7f4ec', true), side: THREE.BackSide, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  };
  function setPaperColor(c) {
    paperColor = c;
    if (paperMat.front.map) paperMat.front.map.dispose();
    paperMat.front.map = paperTexture(c, false);
    paperMat.front.needsUpdate = true;
  }
  setPaperColor(paperColor);
  const paperFront = new THREE.Mesh(paperGeo, paperMat.front);
  const paperBack = new THREE.Mesh(paperGeo, paperMat.back);
  paperFront.castShadow = true;
  paperBack.castShadow = true;
  const paperLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2 }));
  paperObj.add(paperFront, paperBack, paperLines);

  // 多角形と、その頂点の位置 (紙の座標) から形を作る
  function setPaperShape(polys, verts) {
    let tris = 0;
    let edges = 0;
    for (const p of polys) { tris += p.c.length - 2; edges += p.c.length; }
    const pos = new Float32Array(tris * 9);
    const uv = new Float32Array(tris * 6);
    const lp = new Float32Array(edges * 6);
    let pi = 0;
    let ui = 0;
    let li = 0;
    const put = (v) => { pos[pi++] = v[0]; pos[pi++] = v[2]; pos[pi++] = -v[1]; };
    const putUV = (o) => { uv[ui++] = (o[0] + HW) / W; uv[ui++] = o[1] / H; };
    polys.forEach((p, k) => {
      const vs = verts[k];
      for (let j = 1; j + 1 < vs.length; j++) {
        put(vs[0]); put(vs[j]); put(vs[j + 1]);
        putUV(p.o[0]); putUV(p.o[j]); putUV(p.o[j + 1]);
      }
      for (let j = 0; j < vs.length; j++) {
        const a = vs[j];
        const b = vs[(j + 1) % vs.length];
        lp[li++] = a[0]; lp[li++] = a[2]; lp[li++] = -a[1];
        lp[li++] = b[0]; lp[li++] = b[2]; lp[li++] = -b[1];
      }
    });
    paperGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    paperGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // 頂点の数が変わるので、前の法線は捨てて作り直す (残すと古い長さのまま使われて黒くなる)
    paperGeo.deleteAttribute('normal');
    paperGeo.computeVertexNormals();
    paperGeo.computeBoundingSphere();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lineGeo.computeBoundingSphere();
  }

  // 机の上の紙の置き場所 (紙の中心が机の中心)。紙の座標 (x, y, z) → 世界 (root.x + y, root.y + z, root.z + x)
  const DESK_ROOT = new THREE.Vector3(DESK_X - H / 2, DESK_TOP + 0.0006, 0);
  const DESK_QUAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  const paperToWorld = (v) => new THREE.Vector3(root.position.x + v[1], root.position.y + v[2], root.position.z + v[0]);

  // ---- 目印 ----
  const markerGrab = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.012, 32), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, depthTest: false }));
  const markerTarget = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 24), new THREE.MeshBasicMaterial({ color: '#2f7de1', transparent: true, depthTest: false }));
  const markerTargetRing = new THREE.Mesh(new THREE.RingGeometry(0.0075, 0.009, 32), new THREE.MeshBasicMaterial({ color: '#2f7de1', transparent: true, opacity: 0.6, depthTest: false }));
  const guideLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#2f7de1', transparent: true, opacity: 0.9, depthTest: false }));
  guideLine.rotation.x = -Math.PI / 2;
  for (const m of [markerGrab, markerTarget, markerTargetRing, guideLine]) {
    m.renderOrder = 10;
    m.visible = false;
    scene.add(m);
  }

  // 投げる向きの矢印
  const aimArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.5, 0xff8a3d, 0.07, 0.045);
  aimArrow.visible = false;
  scene.add(aimArrow);

  // 飛んだ跡
  const TRAIL_MAX = 3000;
  const trailPos = new Float32Array(TRAIL_MAX * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 }));
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
  let trailCount = 0;

  // 地面の影 (ぼかした円)
  const blobTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.visible = false;
  scene.add(blob);

  // 着地点とベストの旗
  function makeFlag(color, label) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), poleMat);
    pole.position.y = 0.7;
    const cloth = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    cloth.scale.setScalar(0.35);
    cloth.position.y = 1.38;
    const tex = canvasTex(256, 96, () => {});
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(1.6, 0.6, 1);
    sprite.position.y = 1.9;
    sprite.renderOrder = 5;
    g.add(pole, cloth, sprite);
    g.visible = false;
    scene.add(g);
    const setText = (text) => {
      const c = tex.image;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'rgba(20, 30, 40, 0.72)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(8, 8, c.width - 16, c.height - 16, 22);
      else ctx.rect(8, 8, c.width - 16, c.height - 16);
      ctx.fill();
      ctx.font = '800 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, c.width / 2, c.height / 2 + 2);
      tex.needsUpdate = true;
    };
    setText(label);
    return { g, setText };
  }
  const landFlag = makeFlag('#ffffff', '');
  const bestFlag = makeFlag('#ffd25e', 'BEST');

  // =====================================================================
  // 記録
  // =====================================================================
  const REC_KEY = 'paper-plane-records';
  // ステージごとに { best, top } を残す。ステージがひとつだった前の版の記録は、原っぱの記録にする
  function loadRecords() {
    try {
      const r = JSON.parse(store.get(REC_KEY));
      if (r && typeof r === 'object') {
        if (!r.stages) r.stages = {};
        if (Array.isArray(r.top)) {
          r.stages.field = { best: r.best || null, top: r.top };
          delete r.top;
          delete r.best;
        }
        return r;
      }
    } catch (e) { /* 壊れていたら作り直す */ }
    return { stages: {}, throws: 0, plays: 0 };
  }
  let records = loadRecords();
  const saveRecords = () => store.set(REC_KEY, JSON.stringify(records));
  function stageRec(id) {
    const key = id || stage.id;
    if (!records.stages[key]) records.stages[key] = { best: null, top: [] };
    return records.stages[key];
  }

  function showBest() {
    const b = stageRec().best;
    hudBest.textContent = b ? t('best', { d: fmtM(b.d) }) : '';
    titleBest.textContent = '';
    bestFlag.g.visible = !!b;
    if (b) {
      bestFlag.g.position.set(b.x, typeof b.y === 'number' ? b.y : PS.surfaceY(stage, b.x, b.z), b.z);
      bestFlag.setText(`BEST ${b.d.toFixed(1)}m`);
    }
    renderStagePicker();
  }

  // =====================================================================
  // 風 (投げるたびに変わる。折る前から見えるので、翼の幅を風に合わせて選べる)
  // =====================================================================
  let wind = { x: 0, z: 0 };
  // 風と上昇気流を作りなおす (投げるたび・ステージを変えたとき)
  function newWind() {
    wind = PS.makeWind(stage, Math.random);
    thermals = PS.makeThermals(stage, Math.random);
    buildThermals();
    showWind();
  }
  // w は { x, z } (m/s)。省略したらいまの風
  function windLabel(w) {
    const v = w || wind;
    const s = Math.hypot(v.x, v.z);
    if (s < 0.3) return t('windNone');
    const along = v.x / s;
    let key;
    if (along > 0.7) key = 'windTail';
    else if (along < -0.7) key = 'windHead';
    else key = v.z > 0 ? 'windFromLeft' : 'windFromRight';
    return t(key, { s: s.toFixed(1) });
  }
  // 記録に残した風の文 (前の版は日本語の文そのものを残していた)
  const recordWind = (r) => (typeof r.wx === 'number' ? windLabel({ x: r.wx, z: r.wz }) : r.wind || '');
  function showWind() {
    const s = Math.hypot(wind.x, wind.z);
    windArrow.style.transform = `rotate(${(Math.atan2(wind.z, wind.x) * 180) / Math.PI}deg)`;
    windArrow.style.opacity = s < 0.3 ? '0.3' : '1';
    windText.textContent = windLabel();
    for (const fl of flags) fl.g.rotation.y = Math.atan2(-wind.z, wind.x);
  }

  // =====================================================================
  // 折る
  // =====================================================================
  const GUIDED_STEPS = [
    { kind: 'flat', flat: 0, key: 's1' },
    { kind: 'flat', flat: 1, key: 's2' },
    { kind: 'flat', flat: 2, key: 's3' },
    { kind: 'flat', flat: 3, key: 's4' },
    { kind: 'half', key: 's5' },
    { kind: 'line', key: 's6' },
    { kind: 'wing', side: 1, key: 's7' },
    { kind: 'wing', side: -1, key: 's8' },
  ];
  // 自由に折る: 平らに好きなだけ折ってから、半分に折る・翼の線・翼 (お手本の5手順目から) で仕上げる
  const FREE_STEPS = [{ kind: 'free', key: 'free' }].concat(GUIDED_STEPS.slice(4));
  let mode = 'guided';       // guided (お手本どおり) / free (自由に折る)
  let STEPS = GUIDED_STEPS;
  let mirror = store.get('paper-plane-mirror') !== 'off';

  let phase = 'title';       // title / fold / done / launch / flight / landed / result
  const fold = {
    step: 0,
    flat: null,              // 平らに折っている間の多角形
    body: null,              // 半分に折ってからの多角形
    pose: null,
    k: PM.K_DEFAULT,
    misses: [],
    count: 0,                // 自由に折った回数
    flips: 0,                // 裏返した回数
    history: [],
    preview: null,           // 平らに折るドラッグ中: { parts, anim }
  };
  let design = null;
  let drag = null;
  let busy = false;          // 動きの途中は入力を受けつけない
  let dirty = true;

  // ---- 動き (tween) ----
  const tweens = [];
  function tween(dur, update, done) {
    busy = true;
    tweens.push({ t: 0, dur, update, done });
  }
  function runTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t = Math.min(tw.dur, tw.t + dt);
      tw.update(ease(tw.t / tw.dur));
      if (tw.t >= tw.dur) {
        tweens.splice(i, 1);
        if (!tweens.length) busy = false;
        if (tw.done) tw.done();
      }
    }
  }

  function snapshot() {
    fold.history.push({
      step: fold.step,
      flat: PM.clonePolys(fold.flat),
      body: fold.body ? fold.body.map((p) => Object.assign(PM.clonePolys([p])[0], { sd: p.sd, wg: p.wg })) : null,
      pose: fold.pose ? Object.assign({}, fold.pose) : null,
      k: fold.k,
      misses: fold.misses.slice(),
      count: fold.count,
      flips: fold.flips,
    });
  }

  function resetFold() {
    fold.step = 0;
    fold.flat = PM.makeSheet();
    fold.body = null;
    fold.pose = null;
    fold.k = PM.K_DEFAULT;
    fold.misses = [];
    fold.count = 0;
    fold.flips = 0;
    fold.history = [];
    fold.preview = null;
    design = null;
    drag = null;
    root.position.copy(DESK_ROOT);
    root.quaternion.copy(DESK_QUAT);
    paperObj.position.set(0, 0, 0);
    dirty = true;
  }

  function drawPaper() {
    if (fold.body) setPaperShape(fold.body, PM.shape(fold.body, PM.bodyVertex, fold.pose));
    else if (fold.preview) setPaperShape(fold.preview.parts, PM.shape(fold.preview.parts, PM.flatVertex, fold.preview.anim));
    else setPaperShape(fold.flat, PM.shape(fold.flat, PM.flatVertex, null));
    dirty = false;
  }

  // 胴と翼の形での1点 (紙の座標)。fake は左右と翼かどうかだけを持つ多角形の代わり
  const bodyPoint = (sd, wg, v, pose) => PM.bodyVertex({ sd, wg, l: 0 }, v, pose);

  // ---- ポインター → 机の上の紙の座標 ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(DESK_TOP + 0.001));
  const hit = new THREE.Vector3();
  function pointerToPaper(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(deskPlane, hit)) return null;
    return [hit.z - root.position.z, hit.x - root.position.x];
  }
  function toScreen(v3) {
    const p = v3.clone().project(camera);
    const r = canvas.getBoundingClientRect();
    return [((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height];
  }
  const pointerXY = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // ---- 平らに折る ----
  function flatGrab() {
    const st = PM.FLAT_STEPS[STEPS[fold.step].flat];
    return { G: PM.nearestVertex(fold.flat, st.grab), T: st.target };
  }
  function setFlatPreview(G, Q, theta) {
    const fl = PM.foldLineFor(G, Q);
    if (!fl) { fold.preview = null; dirty = true; return null; }
    const parts = PM.splitAll(fold.flat, fl.p0, fl.n);
    const M = PM.foldTop(parts, fl.p0, fl.n);
    fold.preview = { parts, anim: { p0: fl.p0, n: fl.n, theta, M } };
    dirty = true;
    return fl;
  }
  function commitFlat(G, Q, miss) {
    const fl = PM.foldLineFor(G, Q);
    const from = fold.preview ? fold.preview.anim.theta : PREVIEW_THETA;
    setFlatPreview(G, Q, from);
    tween(0.16, (k) => { fold.preview.anim.theta = lerp(from, Math.PI, k); dirty = true; }, () => {
      snapshot();
      fold.flat = PM.foldFlat(fold.flat, fl.p0, fl.n);
      fold.preview = null;
      fold.misses.push(miss);
      dirty = true;
      praise(miss);
      nextStep();
    });
  }
  function cancelFlat() {
    if (!fold.preview) return;
    const from = fold.preview.anim.theta;
    tween(0.22, (k) => { fold.preview.anim.theta = lerp(from, 0, k); dirty = true; }, () => { fold.preview = null; dirty = true; });
  }
  // ---- 自由に折る ----
  const SNAP_FREE = 0.008;
  const GRAB_REACH = 0.02;     // 頂点からこの距離までなら、頂点をつまむ
  function freeGrab(P) {
    let best = null;
    let bd = GRAB_REACH;
    for (const p of fold.flat) {
      for (const v of p.c) {
        const d = Math.hypot(v[0] - P[0], v[1] - P[1]);
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best) return best.slice();
    return fold.flat.some((p) => PM.inside(p.c, P[0], P[1])) ? P.slice() : null;
  }
  // 重ねる先を、紙の頂点や中心線に吸いつける
  function freeSnap(G, Q) {
    let best = null;
    let bd = SNAP_FREE;
    for (const p of fold.flat) {
      for (const v of p.c) {
        if (Math.hypot(v[0] - G[0], v[1] - G[1]) < 1e-6) continue;
        const d = Math.hypot(v[0] - Q[0], v[1] - Q[1]);
        if (d < bd) { bd = d; best = v; }
      }
    }
    if (best) return [best.slice(), true];
    if (Math.abs(Q[0]) < SNAP_FREE) return [[0, Q[1]], true];
    return [Q, false];
  }
  // 折り線で紙が2つに分かれるか (どこも動かない・全部動く線では折れない)
  const splits = (parts) => parts.some((p) => p.mv) && parts.some((p) => !p.mv);

  // 左右対称にしたときの、反対側の折り線。同じ線になるとき (横の線や中心線) は null
  function mirrored(fl) {
    const m = { p0: [-fl.p0[0], fl.p0[1]], n: [-fl.n[0], fl.n[1]] };
    const same = Math.abs(m.n[0] * fl.n[0] + m.n[1] * fl.n[1]) > 0.9999
      && Math.abs((m.p0[0] - fl.p0[0]) * fl.n[0] + (m.p0[1] - fl.p0[1]) * fl.n[1]) < 1e-4;
    return same ? null : m;
  }

  // 線 fl で折る動きを見せてから、本当に折る
  function animateFold(fl, from, dur, done) {
    const parts = PM.splitAll(fold.flat, fl.p0, fl.n);
    if (!splits(parts)) { done(); return; }
    fold.preview = { parts, anim: { p0: fl.p0, n: fl.n, theta: from, M: PM.foldTop(parts, fl.p0, fl.n) } };
    tween(dur, (k) => { fold.preview.anim.theta = lerp(from, Math.PI, k); dirty = true; }, () => {
      fold.flat = PM.foldFlat(fold.flat, fl.p0, fl.n);
      fold.preview = null;
      dirty = true;
      done();
    });
  }

  function commitFree(G, Q) {
    const fl = PM.foldLineFor(G, Q);
    const from = fold.preview ? fold.preview.anim.theta : PREVIEW_THETA;
    snapshot();
    animateFold(fl, from, 0.16, () => {
      const m = mirror ? mirrored(fl) : null;
      const after = () => { fold.count++; enterStep(); };
      if (m) animateFold(m, 0, 0.35, after);
      else after();
    });
  }

  // 紙を裏返す (平らに折っている間だけ)。中心線のまわりに持ち上げながら半回転してから、紙の向きを入れかえる
  function flipPaper() {
    if (busy || drag || fold.body) return;
    snapshot();
    const h = (PM.maxLayer(fold.flat) * EPS) / 2;   // 重なりの真ん中の高さを軸にする
    const lift = 0.12;                              // 机にめりこまないように持ち上げる
    tween(0.6, (k) => {
      const a = Math.PI * k;
      paperObj.rotation.z = a;
      paperObj.position.set(h * Math.sin(a), h - h * Math.cos(a) + lift * Math.sin(a), 0);
    }, () => {
      fold.flat = PM.flipOver(fold.flat);
      fold.flips++;
      paperObj.rotation.z = 0;
      paperObj.position.set(0, 0, 0);
      dirty = true;
      enterStep();
    });
  }

  function toggleMirror() {
    mirror = !mirror;
    store.set('paper-plane-mirror', mirror ? 'on' : 'off');
    enterStep();
  }

  function praise(miss) {
    if (miss <= 0) callout(t('perfect'));
    else callout(t('miss', { cm: (miss * 100).toFixed(1) }), true);
  }

  // ---- 半分に折る・翼を折る (画面の上で、つまんだ点から目標の点へ向かうドラッグの割合で角度を決める) ----
  function sweepEnds() {
    const st = STEPS[fold.step];
    const p = fold.pose;
    if (st.kind === 'half') {
      const v = edgeVertex(-1, 0) || [-0.05, H / 2];
      return [
        paperToWorld(bodyPoint(-1, false, v, p)),
        paperToWorld(bodyPoint(-1, false, v, Object.assign({}, p, { aL: Math.PI }))),
      ];
    }
    const s = st.side;
    const v = edgeVertex(s, fold.k + 0.004) || [s * (fold.k + 0.01), H / 2];
    const key = s > 0 ? 'wR' : 'wL';
    return [
      paperToWorld(bodyPoint(s, true, v, Object.assign({}, p, { [key]: 0 }))),
      paperToWorld(bodyPoint(s, true, v, Object.assign({}, p, { [key]: WING_FOLD }))),
    ];
  }
  // 左右どちらか (side) で、中心線からいちばん遠い紙の頂点 (少し内側)。中心線から minU より近ければ null
  function edgeVertex(side, minU) {
    let best = null;
    let bu = minU;
    for (const p of fold.flat) {
      for (const v of p.c) {
        const u = side * v[0];
        if (u > bu + 1e-6 || (best && Math.abs(u - bu) < 1e-6 && v[1] < best[1])) { bu = u; best = v; }
      }
    }
    return best ? [best[0] - side * 0.004, best[1] + 0.004] : null;
  }

  function sweepKey() {
    const st = STEPS[fold.step];
    if (st.kind === 'half') return ['aL', Math.PI];
    return [st.side > 0 ? 'wR' : 'wL', WING_FOLD];
  }
  function sweepProgress(e) {
    const [a, b] = drag.ends;
    const [px, py] = pointerXY(e);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    return clamp(((px - drag.start[0]) * dx + (py - drag.start[1]) * dy) / len2, 0, 1);
  }
  function finishSweep(t) {
    const [key, full] = sweepKey();
    const from = fold.pose[key];
    if (t > 0.4) {
      tween(0.25, (k) => { fold.pose[key] = lerp(from, full, k); dirty = true; }, () => {
        snapshot();
        fold.history[fold.history.length - 1].pose[key] = 0;
        if (key === 'aL') fold.history[fold.history.length - 1].body = null;
        nextStep();
      });
    } else {
      tween(0.25, (k) => { fold.pose[key] = lerp(from, 0, k); dirty = true; });
    }
  }

  // ---- 翼の線 ----
  function lineLength(k) {
    // 線の上で紙のある範囲 (紙の y)
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let y = 0; y <= H; y += 0.002) {
      if (fold.flat.some((p) => PM.inside(p.c, k, y))) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    return y1 > y0 ? [y0, y1] : [0, H];
  }
  function placeGuide() {
    const [y0, y1] = lineLength(fold.k);
    const a = paperToWorld([fold.k, y0, 0.004]);
    const b = paperToWorld([fold.k, y1, 0.004]);
    guideLine.position.copy(a).add(b).multiplyScalar(0.5);
    guideLine.scale.set(Math.max(0.01, b.x - a.x), 0.0018, 1);
    guideLine.visible = true;
  }
  function showLineStats() {
    const body = fold.k * 100;
    const wing = (HW - fold.k) * 100;
    let type;
    if (fold.k < 0.02) type = t('lineWide');
    else if (fold.k > 0.038) type = t('lineNarrow');
    else type = t('lineMid');
    guideStats.textContent = `${t('lineStats', { body: body.toFixed(1), wing: wing.toFixed(1) })}\n${type}`;
  }
  function confirmLine() {
    if (busy) return;
    snapshot();
    guideLine.visible = false;
    fold.body = PM.splitWings(fold.flat, fold.k);
    fold.pose = Object.assign(fold.pose, { k: fold.k, h: PM.hingeHeight(fold.body) });
    // 半分に折った紙を、胴の折り筋を下にして立てる
    tween(0.8, (k) => {
      fold.pose.aL = lerp(Math.PI, Math.PI / 2, k);
      fold.pose.aR = lerp(0, Math.PI / 2, k);
      dirty = true;
    }, () => nextStep());
    setCamGoal('wing');
  }

  // ---- 手順を進める ----
  function nextStep() {
    fold.step++;
    if (fold.step >= STEPS.length) finishFold();
    else enterStep();
  }

  function enterStep() {
    const st = STEPS[fold.step];
    setProgress(fold.step / STEPS.length);
    if (mode === 'free') hudStep.textContent = st.kind === 'free' ? t('hudFree', { n: fold.count }) : t('hudFinish', { i: fold.step, n: STEPS.length - 1 });
    else hudStep.textContent = t('hudStep', { i: fold.step + 1, n: STEPS.length });
    guideTitle.textContent = t(`${st.key}Title`);
    guideText.textContent = t(`${st.key}Text`);
    guideStats.textContent = '';
    guideLine.visible = false;
    if (st.kind === 'free') {
      fold.body = null;
      fold.pose = null;
      dirty = true;
      setCamGoal('top');
      guideStats.textContent = t('freeStats', { n: fold.count, m: t(mirror ? 'on' : 'off') });
      setActions([
        { label: t('toHalf'), onClick: () => { if (!busy && !drag) nextStep(); }, primary: true },
        { label: t(mirror ? 'mirrorOn' : 'mirrorOff'), onClick: toggleMirror },
        { label: t('flip'), onClick: flipPaper },
        { label: t('undo'), onClick: undo, disabled: !fold.history.length },
        { label: t('restart'), onClick: () => startFold(mode) },
      ]);
      return;
    }
    if (st.kind === 'half' && !fold.body) {
      fold.body = PM.tagBody(PM.clonePolys(fold.flat), 0);
      fold.pose = { aL: 0, aR: 0, wL: 0, wR: 0, k: 0, h: PM.hingeHeight(fold.body) };
      dirty = true;
    }
    if (st.kind === 'line') {
      placeGuide();
      showLineStats();
    }
    setCamGoal(st.kind === 'wing' ? 'wing' : st.kind === 'line' ? 'line' : 'top');
    const acts = [
      { label: t('auto'), onClick: autoStep },
      { label: t('undo'), onClick: undo, disabled: !fold.history.length },
    ];
    if (mode === 'free' && fold.step === 1) acts[1] = { label: t('backToFree'), onClick: () => { if (!busy && !drag) { fold.step = 0; enterStep(); } } };
    if (st.kind === 'flat') acts.push({ label: t('flip'), onClick: flipPaper });
    if (st.kind === 'line') acts.unshift({ label: t('foldHere'), onClick: confirmLine, primary: true });
    setActions(acts);
  }

  function autoStep() {
    if (busy || drag) return;
    const st = STEPS[fold.step];
    if (st.kind === 'flat') {
      const { G, T } = flatGrab();
      tween(0.55, (k) => {
        const Q = [lerp(G[0], T[0], k), lerp(G[1], T[1], k)];
        if (Math.hypot(Q[0] - G[0], Q[1] - G[1]) > 1e-4) setFlatPreview(G, Q, PREVIEW_THETA);
      }, () => { busy = false; commitFlat(G, T, 0); });
    } else if (st.kind === 'line') {
      confirmLine();
    } else {
      finishSweep(1);
    }
  }

  function undo() {
    if (busy || drag || !fold.history.length) return;
    const h = fold.history.pop();
    fold.step = h.step;
    fold.flat = h.flat;
    fold.body = h.body;
    fold.pose = h.pose;
    fold.k = h.k;
    fold.misses = h.misses;
    fold.count = h.count;
    fold.flips = h.flips || 0;
    fold.preview = null;
    dirty = true;
    enterStep();
  }

  function finishFold() {
    hudStep.textContent = t('hudDone');
    setProgress(1);
    guideTitle.textContent = t('doneTitle');
    guideText.textContent = t('doneOpening');
    guideStats.textContent = '';
    setActions([]);
    const p = fold.pose;
    const from = { a: p.aL, w: p.wL };
    tween(0.6, (k) => {
      p.aL = p.aR = lerp(from.a, PM.OPEN, k);
      p.wL = p.wR = lerp(from.w, PM.OPEN - PM.DIHEDRAL, k);
      dirty = true;
    }, () => {
      design = PM.analyze(PM.splitWings(fold.flat, fold.k), fold.k);
      phase = 'done';
      showDesign();
      trackEvent('paper_plane_fold', { mode, folds: fold.count, flips: fold.flips, wing_cm: Math.round((HW - fold.k) * 1000) / 10, symmetry: Math.round(design.sym * 100) });
    });
    setCamGoal('show');
  }

  function planeType(d) {
    const fp = PM.flightParams(d);
    if (fp.vGlide < 4.6) return t('typeGlider');
    if (fp.vGlide > 6.2) return t('typeDart');
    return t('typeBalanced');
  }

  function showDesign() {
    const d = design;
    const fp = PM.flightParams(d);
    const totalMiss = fold.misses.reduce((s, m) => s + m, 0);
    hudStep.textContent = t('hudDone');
    guideTitle.textContent = t('doneTitle');
    guideText.textContent = planeType(d);
    const lines = [
      t('statsArea', { a: (d.wing * 1e4).toFixed(0), s: (d.sym * 100).toFixed(1) }),
      mode === 'free' ? t('statsFolds', { n: fold.count })
        : totalMiss <= 0 ? t('statsNoMiss') : t('statsMiss', { cm: (totalMiss * 100).toFixed(1) }),
    ];
    if (Math.abs(fp.rollBias) > 0.6) lines.push(t(fp.rollBias > 0 ? 'turnsLeft' : 'turnsRight'));
    guideStats.textContent = lines.join('\n');
    setActions([
      { label: t('toWindow'), onClick: goLaunch, primary: true },
      { label: t('refoldShort'), onClick: () => startFold(mode) },
    ]);
  }

  // ---- ドラッグ ----
  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'fold' || busy || drag) return;
    const st = STEPS[fold.step];
    if (!st) return;
    if (st.kind === 'free') {
      const P = pointerToPaper(e);
      const G = P && freeGrab(P);
      if (!G) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, kind: 'free', G, off: [G[0] - P[0], G[1] - P[1]], Q: G.slice(), snapped: false };
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    if (st.kind === 'flat') {
      const P = pointerToPaper(e);
      if (!P) return;
      const { G, T } = flatGrab();
      drag = { id: e.pointerId, kind: 'flat', G, T, off: [G[0] - P[0], G[1] - P[1]], Q: G.slice(), snapped: false };
    } else if (st.kind === 'line') {
      drag = { id: e.pointerId, kind: 'line' };
      moveLine(e);
    } else {
      drag = { id: e.pointerId, kind: 'sweep', start: pointerXY(e), ends: sweepEnds().map(toScreen), t: 0 };
    }
  });

  function moveLine(e) {
    const P = pointerToPaper(e);
    if (!P) return;
    fold.k = clamp(P[0], PM.K_MIN, PM.K_MAX);
    placeGuide();
    showLineStats();
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.kind === 'flat') {
      const P = pointerToPaper(e);
      if (!P) return;
      let Q = [clamp(P[0] + drag.off[0], -0.25, 0.25), clamp(P[1] + drag.off[1], -0.15, H + 0.15)];
      drag.snapped = Math.hypot(Q[0] - drag.T[0], Q[1] - drag.T[1]) < SNAP;
      if (drag.snapped) Q = drag.T.slice();
      drag.Q = Q;
      setFlatPreview(drag.G, Q, PREVIEW_THETA);
    } else if (drag.kind === 'free') {
      const P = pointerToPaper(e);
      if (!P) return;
      const raw = [clamp(P[0] + drag.off[0], -0.3, 0.3), clamp(P[1] + drag.off[1], -0.2, H + 0.2)];
      const [Q, snapped] = freeSnap(drag.G, raw);
      drag.Q = Q;
      drag.snapped = snapped;
      setFlatPreview(drag.G, Q, PREVIEW_THETA);
    } else if (drag.kind === 'line') {
      moveLine(e);
    } else {
      drag.t = sweepProgress(e);
      const [key, full] = sweepKey();
      fold.pose[key] = full * drag.t * 0.97;
      dirty = true;
    }
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.kind === 'flat') {
      const miss = d.snapped ? 0 : Math.hypot(d.Q[0] - d.T[0], d.Q[1] - d.T[1]);
      const moved = Math.hypot(d.Q[0] - d.G[0], d.Q[1] - d.G[1]);
      if (fold.preview && moved > 0.02 && miss < MAX_MISS) commitFlat(d.G, d.Q, miss);
      else {
        cancelFlat();
        if (moved > 0.02) callout(t('releaseNear'), true);
      }
    } else if (d.kind === 'free') {
      const moved = Math.hypot(d.Q[0] - d.G[0], d.Q[1] - d.G[1]);
      if (fold.preview && moved > 0.01 && splits(fold.preview.parts)) commitFree(d.G, d.Q);
      else cancelFlat();
    } else if (d.kind === 'sweep') {
      finishSweep(d.t);
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function updateMarkers(time) {
    const show = phase === 'fold' && !busy && STEPS[fold.step];
    const st = show ? STEPS[fold.step] : null;
    markerGrab.visible = false;
    markerTarget.visible = false;
    markerTargetRing.visible = false;
    if (!st || st.kind === 'line') return;
    if (st.kind === 'free') {
      if (!drag || drag.kind !== 'free') return;
      markerGrab.position.copy(paperToWorld([drag.Q[0], drag.Q[1], 0.003]));
      markerGrab.scale.setScalar(0.8);
      markerGrab.quaternion.copy(camera.quaternion);
      markerGrab.material.color.set(drag.snapped ? '#3fae6a' : '#ff8a3d');
      markerGrab.visible = true;
      return;
    }
    let g;
    let t;
    if (st.kind === 'flat') {
      const gt = flatGrab();
      g = paperToWorld([gt.G[0], gt.G[1], (PM.maxLayer(fold.flat) + 1) * EPS]);
      t = paperToWorld([gt.T[0], gt.T[1], (PM.maxLayer(fold.flat) + 1) * EPS]);
      if (drag && drag.kind === 'flat') g = paperToWorld([drag.Q[0], drag.Q[1], 0.003]);
    } else {
      [g, t] = sweepEnds();
    }
    const pulse = 1 + Math.sin(time * 6) * 0.15;
    markerGrab.position.copy(g);
    markerGrab.scale.setScalar(drag ? 0.8 : pulse);
    markerGrab.quaternion.copy(camera.quaternion);
    markerGrab.material.color.set(drag && drag.snapped ? '#3fae6a' : '#ff8a3d');
    markerTarget.position.copy(t);
    markerTarget.quaternion.copy(camera.quaternion);
    markerTargetRing.position.copy(t);
    markerTargetRing.quaternion.copy(camera.quaternion);
    markerTargetRing.scale.setScalar(st.kind === 'flat' ? 1 : 1.6);
    markerTarget.scale.setScalar(st.kind === 'flat' ? 1 : 1.6);
    markerGrab.visible = true;
    markerTarget.visible = true;
    markerTargetRing.visible = true;
  }

  // =====================================================================
  // カメラ
  // =====================================================================
  const camGoal = { pos: new THREE.Vector3(-2.7, 9.95, -1.3), look: new THREE.Vector3(-0.3, 9.1, 0.2), rate: 3 };
  const camLook = camGoal.look.clone();
  camera.position.copy(camGoal.pos);
  let camMode = 'room';

  function setCamGoal(mode) {
    camMode = mode;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const asp = camera.aspect;
    const c = new THREE.Vector3(DESK_X, DESK_TOP, 0);
    // 上のチップと下のパネルのあいだに見える高さで合わせる
    const fit = (v, h) => Math.max(v / 2 / (tanV * view.frac), h / 2 / (tanV * asp));
    camGoal.rate = 4;
    if (mode === 'room') {
      camGoal.pos.set(-2.7, 9.95, -1.3);
      camGoal.look.set(-0.3, 9.1, 0.2);
      camGoal.rate = 2;
    } else if (mode === 'top' || mode === 'line') {
      const dist = fit(0.4, mode === 'line' ? 0.22 : 0.3);
      if (mode === 'line') c.z += 0.05;
      const tilt = 0.24;
      camGoal.pos.set(c.x - dist * Math.sin(tilt), c.y + dist * Math.cos(tilt), c.z);
      camGoal.look.copy(c);
    } else if (mode === 'wing') {
      // うしろ斜め上から。立てた胴と、外へ倒れていく翼が見える
      const dist = fit(0.44, 0.36);
      camGoal.pos.set(c.x - dist * 0.62, c.y + dist * 0.78, c.z);
      camGoal.look.set(c.x - 0.01, c.y + 0.03, c.z);
    } else if (mode === 'show') {
      const dist = fit(0.5, 0.56);
      camGoal.pos.set(c.x - dist * 0.62, c.y + dist * 0.55, c.z + dist * 0.55);
      camGoal.look.set(c.x - 0.02, c.y + 0.02, c.z);
    } else if (mode === 'launch') {
      // 紙ひこうきをうしろ斜め上から見て、見える場所 (上のチップと下のパネルのあいだ) の真ん中に置く。
      // 窓わくと外の景色はその先に見える。翼が見えるように、少し右に回りこむ
      const L = PM.LAUNCH;
      const dist = Math.max(0.75, fit(0.62, 0.62));
      const dir = new THREE.Vector3(-0.82, 0.36, 0.44).normalize();
      camGoal.pos.set(L.x + dir.x * dist, L.y + dir.y * dist, L.z + dir.z * dist);
      camGoal.look.set(L.x + 0.12, L.y + 0.02, L.z);
    }
  }

  function followGoal(dt) {
    const k = 1 - Math.exp(-dt * camGoal.rate);
    camera.position.lerp(camGoal.pos, k);
    camLook.lerp(camGoal.look, k);
    camera.lookAt(camLook);
  }

  // 飛んでいる間: うしろ斜め上から追う
  const chaseDir = new THREE.Vector3(1, 0, 0);
  const tmpV = new THREE.Vector3();
  function chase(dt) {
    const p = flight.p;
    const v = flight.v;
    tmpV.set(v.x, 0, v.z);
    if (tmpV.lengthSq() > 0.04) chaseDir.lerp(tmpV.normalize(), 1 - Math.exp(-dt * 1.5)).normalize();
    const side = new THREE.Vector3(-chaseDir.z, 0, chaseDir.x);
    const goal = new THREE.Vector3(p.x, p.y, p.z).addScaledVector(chaseDir, -1.05).addScaledVector(side, 0.32);
    goal.y += 0.32;
    const floorY = goal.x < -BLD.wallT ? BLD.floorY : stage.ground(goal.x, goal.z);
    goal.y = Math.max(goal.y, floorY + 0.25);
    camera.position.lerp(goal, 1 - Math.exp(-dt * 6));
    // 壁をぬけるときは窓の穴を通る
    const cp = camera.position;
    if (cp.x > -BLD.wallT - 0.35 && cp.x < 0.3 && cp.y > 1) {
      cp.y = clamp(cp.y, BLD.sillY + 0.1, BLD.topY - 0.1);
      cp.z = clamp(cp.z, -BLD.halfZ + 0.1, BLD.halfZ - 0.1);
    }
    if (cp.x < -BLD.wallT) cp.y = clamp(cp.y, BLD.floorY + 0.1, BLD.floorY + 2.8);
    tmpV.set(p.x + v.x * 0.12, p.y + v.y * 0.12, p.z + v.z * 0.12);
    camLook.lerp(tmpV, 1 - Math.exp(-dt * 8));
    camera.lookAt(camLook);
  }

  // =====================================================================
  // 投げる
  // =====================================================================
  let flight = null;
  let lastThermal = -1;   // 最後に「上昇気流!」と出した上昇気流の番号
  let fast = false;
  let landTime = 0;
  let orbit = 0;

  function launchQuat(angleDeg) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 + launchYaw());
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (angleDeg * Math.PI) / 180));
  }
  const launchAngle = () => Number(angleInput.value);
  const launchAim = () => Number(aimInput.value);
  // 機首を回す角度 (rad)。+ で左 (スライダーの値とは向きが逆)
  const launchYaw = () => (-launchAim() * Math.PI) / 180;
  const launchPower = () => Number(powerInput.value);
  const launchSpeed = () => lerp(MIN_SPEED, MAX_SPEED, launchPower() / 100);

  function goLaunch() {
    if (busy || !design) return;
    // 重心を回転の中心にする (見た目は動かさない)
    const cg = new THREE.Vector3(design.cgLocal[0], design.cgLocal[1], design.cgLocal[2]);
    const cgWorld = root.localToWorld(cg.clone());
    paperObj.position.copy(cg).multiplyScalar(-1);
    root.position.copy(cgWorld);
    readyLaunch(true);
  }

  function readyLaunch(fromDesk) {
    // 折り終えて机から持ち上げるときは、折りはじめから続く1回のまま。結果から投げなおすときは新しい1回
    if (!fromDesk) stageTrack.start(stage.id, { mode });
    phase = 'launch';
    setProgress(null);
    flight = null;
    fast = false;
    hudFlight.textContent = '';
    trail.visible = false;
    blob.visible = false;
    landFlag.g.visible = false;
    sun.castShadow = false;
    const L = PM.LAUNCH;
    const fromPos = root.position.clone();
    const fromQ = root.quaternion.clone();
    const toPos = new THREE.Vector3(L.x, L.y, L.z);
    setCamGoal('launch');
    camGoal.rate = fromDesk ? 2.5 : 5;
    if (!fromDesk) {
      camera.position.copy(camGoal.pos);
      camLook.copy(camGoal.look);
    }
    tween(fromDesk ? 1.2 : 0.01, (k) => {
      root.position.lerpVectors(fromPos, toPos, k);
      if (fromDesk) root.position.y += Math.sin(k * Math.PI) * 0.25;
      root.quaternion.copy(fromQ).slerp(launchQuat(launchAngle()), k);
    }, () => updateAim());
    launchEl.hidden = false;
    launchTexts();
  }

  function launchTexts() {
    hudStep.textContent = t(`stage_${stage.id}`);
    guideTitle.textContent = t('launchTitle');
    guideText.textContent = t('launchText');
    guideStats.textContent = planeType(design);
    setActions([{ label: t('refoldShort'), onClick: () => startFold(mode) }]);
    updateLaunchLabels();
  }

  function updateLaunchLabels() {
    const a = launchAngle();
    angleVal.textContent = t(a > 0 ? 'angleUp' : a < 0 ? 'angleDown' : 'angleFlat', { n: Math.abs(a) });
    powerVal.textContent = t('powerVal', { p: launchPower(), kmh: (launchSpeed() * 3.6).toFixed(0) });
    const m = launchAim();
    aimVal.textContent = m === 0 ? t('aimStraight') : t(m < 0 ? 'aimLeft' : 'aimRight', { n: Math.abs(m) });
  }

  function updateAim() {
    if (phase !== 'launch') { aimArrow.visible = false; return; }
    const a = (launchAngle() * Math.PI) / 180;
    if (!busy) root.quaternion.copy(launchQuat(launchAngle()));
    const y = launchYaw();
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(y), Math.sin(a), -Math.cos(a) * Math.sin(y));
    aimArrow.position.copy(root.position).addScaledVector(dir, 0.2);
    aimArrow.setDirection(dir);
    aimArrow.setLength(0.15 + launchPower() / 100 * 0.6, 0.07, 0.045);
    aimArrow.visible = !busy;
  }

  angleInput.addEventListener('input', () => { updateLaunchLabels(); updateAim(); });
  powerInput.addEventListener('input', () => { updateLaunchLabels(); updateAim(); });
  aimInput.addEventListener('input', () => { updateLaunchLabels(); updateAim(); });
  throwBtn.addEventListener('click', doThrow);

  function doThrow() {
    if (phase !== 'launch' || busy) return;
    flight = PM.createFlight(design, { speed: launchSpeed(), angle: (launchAngle() * Math.PI) / 180, yaw: launchYaw() }, wind, Math.floor(Math.random() * 1e9),
      { ground: stage.ground, boxes: stage.boxes, thermals });
    lastThermal = -1;
    phase = 'flight';
    aimArrow.visible = false;
    launchEl.hidden = true;
    trailCount = 0;
    trail.visible = true;
    blob.visible = true;
    camMode = 'chase';
    chaseDir.set(Math.cos(launchYaw()), 0, -Math.sin(launchYaw()));
    flightTexts();
    store.set('paper-plane-launch', JSON.stringify({ a: launchAngle(), p: launchPower(), m: launchAim() }));
  }

  function flightTexts() {
    hudStep.textContent = t(`stage_${stage.id}`);
    guideTitle.textContent = t('flyingTitle');
    guideText.textContent = t('flyingText');
    guideStats.textContent = '';
    setActions([{ label: t(fast ? 'normalSpeed' : 'fast'), onClick: toggleFast }]);
  }

  function toggleFast() {
    fast = !fast;
    setActions([{ label: t(fast ? 'normalSpeed' : 'fast'), onClick: toggleFast }]);
  }

  function syncPlane() {
    root.position.set(flight.p.x, flight.p.y, flight.p.z);
    root.quaternion.set(flight.q.x, flight.q.y, flight.q.z, flight.q.w);
  }

  function pushTrail() {
    if (trailCount >= TRAIL_MAX) return;
    trailPos[trailCount * 3] = flight.p.x;
    trailPos[trailCount * 3 + 1] = flight.p.y;
    trailPos[trailCount * 3 + 2] = flight.p.z;
    trailCount++;
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, trailCount);
  }

  function updateFlightHud() {
    const d = PM.distanceOf(flight);
    hudFlight.innerHTML = `<span class="meter-d">${d.toFixed(1)}<small>m</small></span><span class="meter-sub">${t('meterSub', { h: flight.p.y.toFixed(1), kmh: (flight.speed * 3.6).toFixed(0) })}</span>`;
  }

  function onLanded() {
    phase = 'landed';
    landTime = 0;
    orbit = Math.atan2(camera.position.z - flight.p.z, camera.position.x - flight.p.x);
    const dist = PM.distanceOf(flight);
    // 進んでいた向きのまま、片方の翼を少し下にして地面に寝かせる
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(root.quaternion);
    const head = Math.atan2(fwd.z, fwd.x);
    const restQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-Math.cos(head), -Math.sin(head)))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand(-0.25, 0.25)));
    const fromQ = root.quaternion.clone();
    const fromY = root.position.y;
    const restY = flight.p.y - 0.01 + design.cgLocal[1] + 0.004;
    if (!flight.crashed) {
      tween(0.35, (k) => {
        root.quaternion.copy(fromQ).slerp(restQ, k);
        root.position.y = lerp(fromY, restY, k);
      });
    }
    // 突っこんだときは、旗はぶつかった真下の地面に立てる
    const flagY = flight.crashed ? PS.surfaceY(stage, flight.p.x, flight.p.z) : flight.p.y - 0.01;
    landFlag.g.position.set(flight.p.x + 0.4, flagY, flight.p.z);
    landFlag.setText(`${dist.toFixed(2)}m`);
    landFlag.g.visible = dist > 0;
    if (flight.crashed) callout(t('crashed'), true, 1600);
    else callout(fmtM(dist), false, 1600);
    setActions([]);
    guideTitle.textContent = t(flight.crashed ? 'crashedTitle' : flight.onRoof ? 'landedRoof' : 'landed');
    guideText.textContent = '';

    records.throws = (records.throws || 0) + 1;
    const entry = { d: Math.round(dist * 100) / 100, x: flight.p.x, y: flagY, z: flight.p.z, k: fold.k, mode, stage: stage.id, crash: flight.crashed, wx: wind.x, wz: wind.z, t: Date.now() };
    const rec = stageRec();
    const prevBest = rec.best ? rec.best.d : 0;
    const isBest = entry.d > prevBest;
    if (isBest) rec.best = entry;
    rec.top.push(entry);
    rec.top.sort((a, b) => b.d - a.d);
    rec.top = rec.top.slice(0, 5);
    saveRecords();
    trackEvent('paper_plane_throw', {
      distance: entry.d,
      angle: launchAngle(),
      power: launchPower(),
      aim: launchAim(),
      mode,
      lang,
      stage: stage.id,
      updraft: flight.thermalHit >= 0,
      crashed: flight.crashed,
      wind_ms: Math.round(Math.hypot(wind.x, wind.z) * 10) / 10,
      is_best: isBest,
      throw_count: records.throws,
    });

    // 突っこまずに着地できたらクリア、建物に突っこんだら失敗として数える
    if (flight.crashed) stageTrack.fail({ distance: entry.d });
    else stageTrack.clear({ distance: entry.d, is_best: isBest });

    setTimeout(() => showResult(entry, isBest, prevBest), flight.crashed ? 1100 : 1700);
  }

  let lastResult = null;
  function showResult(entry, isBest, prevBest) {
    phase = 'result';
    lastResult = [entry, isBest, prevBest];
    hudFlight.textContent = '';
    renderResult(entry, isBest, prevBest);
    showOverlay(screenResult);
    showBest();
    prepareShare(entry, isBest);
  }

  function renderResult(entry, isBest, prevBest) {
    resultDist.textContent = fmtM(entry.d);
    resultCrash.hidden = !entry.crash;
    if (isBest && prevBest > 0) resultNote.textContent = t('newBest', { d: fmtM(prevBest) });
    else if (isBest) resultNote.textContent = t('firstRecord');
    else resultNote.textContent = t('toBest', { best: fmtM(stageRec().best.d), diff: (stageRec().best.d - entry.d).toFixed(2) });
    resultNote.classList.toggle('is-best', isBest);
    resultTop.innerHTML = '';
    stageRec().top.forEach((r, i) => {
      const li = document.createElement('li');
      const date = new Date(r.t);
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="d">${fmtM(r.d)}</span><span class="meta">${r.mode === 'free' ? `${t('rowFree')} · ` : ''}${t('rowWing', { cm: ((HW - r.k) * 100).toFixed(1) })} · ${recordWind(r)} · ${date.getMonth() + 1}/${date.getDate()}</span>`;
      if (r.t === entry.t) li.classList.add('is-now');
      resultTop.appendChild(li);
    });
  }

  // =====================================================================
  // 結果を X に投稿する
  //   X の投稿画面 (x.com/intent/post) には文と URL しか渡せないので、画像は
  //   ・スマホなど共有シートでファイルを渡せる端末: 共有シートに画像と文を渡す (X を選ぶと画像つきで投稿できる)
  //   ・それ以外: 投稿画面を開き、画像をクリップボードにコピーする (できなければ保存する)。投稿画面で貼り付けてもらう
  // =====================================================================
  const GAME_URL = 'https://tools.e-seventh.com/games/paper-plane/';
  const SHARE_W = 1200;
  const SHARE_H = 675;
  let share = null;          // { blob, file, text }

  function shareText(entry, isBest) {
    return t('shareText', {
      stage: t(`stage_${entry.stage || 'field'}`),
      how: t(entry.mode === 'free' ? 'shareHowFree' : 'shareHowGuided'),
      d: fmtM(entry.d),
      best: isBest ? t('shareBest') : '',
      wing: ((HW - entry.k) * 100).toFixed(1),
      wind: recordWind(entry),
    });
  }

  // 結果の画像: 着地した場面の 3D の絵に、飛距離と横から見た飛んだ道すじを重ねる
  function drawShareImage(entry, isBest) {
    const c = document.createElement('canvas');
    c.width = SHARE_W;
    c.height = SHARE_H;
    const g = c.getContext('2d');
    g.drawImage(renderShareScene(), 0, 0, SHARE_W, SHARE_H);

    const shade = g.createLinearGradient(0, 0, 0, SHARE_H);
    shade.addColorStop(0, 'rgba(10, 24, 38, 0.55)');
    shade.addColorStop(0.35, 'rgba(10, 24, 38, 0)');
    shade.addColorStop(0.55, 'rgba(10, 24, 38, 0)');
    shade.addColorStop(1, 'rgba(10, 24, 38, 0.8)');
    g.fillStyle = shade;
    g.fillRect(0, 0, SHARE_W, SHARE_H);

    const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", "Meiryo", "PingFang SC", "Microsoft YaHei", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffffff';
    g.font = font(800, 40);
    g.fillText(t('title'), 48, 76);
    g.font = font(600, 24);
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.fillText(`${t(`stage_${entry.stage || 'field'}`)} ・ ${t(entry.mode === 'free' ? 'imgSubFree' : 'imgSubGuided')}`, 48, 114);

    g.font = font(700, 30);
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    g.fillText(t('distance'), 48, SHARE_H - 196);
    g.font = font(900, 120);
    g.fillStyle = '#ffffff';
    g.fillText(entry.d.toFixed(2), 44, SHARE_H - 88);
    const numW = g.measureText(entry.d.toFixed(2)).width;
    g.font = font(800, 56);
    g.fillText('m', 56 + numW, SHARE_H - 88);
    if (isBest) {
      // 「飛距離」の右に置く (3けたの距離でも、右下の道すじの図と重ならない)
      g.font = font(700, 30);
      const bx = 48 + g.measureText(t('distance')).width + 18;
      g.font = font(800, 24);
      const bw = g.measureText(t('imgBest')).width + 36;
      g.fillStyle = '#ff8a3d';
      g.beginPath();
      if (g.roundRect) g.roundRect(bx, SHARE_H - 230, bw, 44, 22); else g.rect(bx, SHARE_H - 230, bw, 44);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillText(t('imgBest'), bx + 18, SHARE_H - 199);
    }
    g.font = font(600, 26);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fillText(t('imgWing', { cm: ((HW - entry.k) * 100).toFixed(1), wind: recordWind(entry) }), 48, SHARE_H - 44);

    drawProfile(g, SHARE_W - 48 - 420, SHARE_H - 48 - 190, 420, 190, entry);

    g.font = font(600, 22);
    g.fillStyle = 'rgba(255, 255, 255, 0.75)';
    g.textAlign = 'right';
    g.fillText('tools.e-seventh.com', SHARE_W - 48, 76);
    g.textAlign = 'left';
    return c;
  }

  // 画像用に、着地点をうしろ斜め上から見た絵を、画面とは別に 16:9・2倍の大きさで描く (縮めてなめらかにする)
  // 画像用に、折った紙ひこうきをアップで描く。着地点の上空で少し傾けて飛ばし、横の前から見上げる
  //   (画面とは別に 16:9・2倍の大きさで描いて縮める。ステージの空と地平線が後ろに入る)
  function renderShareScene() {
    const w = SHARE_W * 2;
    const h = SHARE_H * 2;
    const target = new THREE.WebGLRenderTarget(w, h);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.02, 1200);
    const dir = chaseDir.clone();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const savedPos = root.position.clone();
    const savedQ = root.quaternion.clone();
    const P = savedPos.clone().addScaledVector(dir, -8);
    // まわりの屋根より高く上げて、後ろに空と遠くの景色が入るようにする
    let top = Math.max(savedPos.y, PS.surfaceY(stage, P.x, P.z));
    for (const b of stage.boxes) {
      const dx = Math.max(b.x0 - P.x, 0, P.x - b.x1);
      const dz = Math.max(b.z0 - P.z, 0, P.z - b.z1);
      if (dx * dx + dz * dz < 50 * 50) top = Math.max(top, b.y1);
    }
    P.y = Math.max(top + 8, stage.ground(0.5, 0) + 4);   // 崖では崖の上より高く (海と水平線が後ろに入る)
    // 進む向き、機首を少し上げて、左の翼を下げる (上の面がカメラに向く)
    root.position.copy(P);
    root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-dir.x, -dir.z))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.14))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5));
    cam.position.copy(P).addScaledVector(right, -0.74).addScaledVector(dir, 0.4);
    cam.position.y += 0.05;
    cam.lookAt(P.clone().addScaledVector(dir, 0.02));
    // 文字のない右上に紙ひこうきが来るように、絵をずらす
    cam.setViewOffset(w, h, -w * 0.13, h * 0.13, w, h);
    const hidden = [trail, blob, landFlag.g, bestFlag.g, aimArrow, markerGrab, markerTarget, markerTargetRing, guideLine];
    const shown = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    renderer.setRenderTarget(target);
    renderer.render(scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
    renderer.setRenderTarget(null);
    target.dispose();
    hidden.forEach((o, i) => { o.visible = shown[i]; });
    root.position.copy(savedPos);
    root.quaternion.copy(savedQ);
    // WebGL は下の行から並ぶので、上下を入れかえる
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const img = c.getContext('2d').createImageData(w, h);
    const row = w * 4;
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  // 横から見た飛んだ道すじ (窓のある建物から着地点まで)
  function drawProfile(g, x0, y0, w, h, entry) {
    g.fillStyle = 'rgba(10, 24, 38, 0.6)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, w, h, 16); else g.rect(x0, y0, w, h);
    g.fill();
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    const pad = 22;
    let maxD = Math.max(entry.d, 10);
    let maxY = 12.6;
    for (let i = 0; i < trailCount; i++) {
      maxD = Math.max(maxD, Math.hypot(trailPos[i * 3], trailPos[i * 3 + 2]));
      maxY = Math.max(maxY, trailPos[i * 3 + 1]);
    }
    // 地面の形は、窓からまっすぐ前 (z = 0) の高さで描く。坂・崖・ビルのステージでは地面が下がる
    const groundAt = (d) => stage.ground(Math.max(d, 0.5), 0);
    let minY = Math.min(0, entry.y ?? 0);
    for (let i = 0; i <= 40; i++) minY = Math.min(minY, groundAt((maxD * i) / 40));
    const wallW = 14;
    const sx = (w - pad * 2 - wallW) / (maxD * 1.05);
    const sy = (h - pad * 2) / (maxY - minY);
    const s = Math.min(sx, sy * 3);   // 横に長いので、たては3倍まで引きのばす
    const ky = Math.min(sy, s * 3);
    const px = (d) => x0 + pad + wallW + d * s;
    const py = (y) => y0 + h - pad - (y - minY) * ky;
    // 地面
    g.strokeStyle = 'rgba(160, 220, 120, 0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0 + pad, py(0));
    for (let i = 0; i <= 80; i++) {
      const d = (maxD * 1.05 * i) / 80;
      g.lineTo(px(d), py(groundAt(d)));
    }
    g.stroke();
    // 建物と窓
    g.fillStyle = '#ece3d3';
    g.fillRect(x0 + pad, py(12.6), wallW, py(groundAt(0)) - py(12.6));
    g.fillStyle = '#45647e';
    g.fillRect(x0 + pad + 3, py(BLD.topY), wallW - 6, py(BLD.sillY) - py(BLD.topY));
    // 目もり (いちばん下に、きりのいい間隔で5つ前後)
    const tick = [10, 20, 50, 100, 200].find((v) => maxD / v <= 6) || 500;
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.font = '600 15px system-ui, sans-serif';
    g.textAlign = 'center';
    const base = y0 + h - pad + 2;
    for (let d = tick; d <= maxD; d += tick) {
      g.fillRect(px(d) - 1, base - 6, 2, 6);
      g.fillText(`${d}`, px(d), base + 16);
    }
    g.textAlign = 'left';
    // 道すじ
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.setLineDash([2, 7]);
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < trailCount; i++) {
      const x = trailPos[i * 3];
      const d = x < 0 ? x : Math.hypot(x, trailPos[i * 3 + 2]);
      const X = px(d);
      const Y = py(trailPos[i * 3 + 1]);
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    }
    g.stroke();
    g.setLineDash([]);
    // 着地点
    g.fillStyle = '#ff8a3d';
    g.beginPath();
    g.arc(px(entry.d), py(entry.y ?? 0), 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }


  function prepareShare(entry, isBest) {
    share = null;
    shareNote.textContent = '';
    const text = shareText(entry, isBest);
    const c = drawShareImage(entry, isBest);
    sharePreview.src = c.toDataURL('image/jpeg', 0.85);
    shareBtn.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(GAME_URL)}`;
    // 押したときにすぐ渡せるよう、先にファイルにしておく (待ってから共有すると、ブラウザが「押した直後」と見なさない)
    c.toBlob((blob) => {
      if (!blob) return;
      let file = null;
      try { file = new File([blob], `paper-plane-${entry.d.toFixed(2)}m.png`, { type: 'image/png' }); } catch (e) { /* File を作れない古いブラウザ */ }
      share = { blob, file, text };
    }, 'image/png');
  }

  function saveImage() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(share.blob);
    a.download = share.file ? share.file.name : 'paper-plane.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  shareBtn.addEventListener('click', (e) => {
    if (!share) {   // 画像がまだできていなければ、文だけの投稿画面を開く
      trackEvent('paper_plane_share', { method: 'intent_text_only' });
      return;
    }
    // 共有シートで画像を渡せる端末 (おもにスマホ)
    if (share.file && navigator.canShare && navigator.canShare({ files: [share.file] })) {
      e.preventDefault();
      navigator.share({ files: [share.file], text: `${share.text}\n${GAME_URL}` })
        .then(() => trackEvent('paper_plane_share', { method: 'share_sheet' }))
        .catch((err) => {
          if (err && err.name === 'AbortError') return;
          window.open(shareBtn.href, '_blank', 'noopener');
        });
      return;
    }
    // それ以外: リンクで投稿画面を開きつつ、画像をクリップボードへ (だめなら保存)
    trackEvent('paper_plane_share', { method: 'intent' });
    const copied = navigator.clipboard && window.ClipboardItem
      ? navigator.clipboard.write([new ClipboardItem({ 'image/png': share.blob })])
      : Promise.reject(new Error('no clipboard'));
    copied.then(() => {
      shareNote.textContent = t('copied');
    }).catch(() => {
      try { saveImage(); } catch (err) { /* 保存もできない */ }
      shareNote.textContent = t('saved');
    });
  });

  againBtn.addEventListener('click', () => {
    hideOverlay();
    newWind();
    readyLaunch(false);
  });
  refoldBtn.addEventListener('click', () => {
    hideOverlay();
    newWind();
    startFold(mode);
  });

  // =====================================================================
  // 画面
  // =====================================================================
  function setActions(list) {
    actionsEl.innerHTML = '';
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'act-btn is-primary' : 'act-btn';
      b.textContent = a.label;
      b.disabled = !!a.disabled;
      b.addEventListener('click', a.onClick);
      actionsEl.appendChild(b);
    }
  }

  let calloutTimer = 0;
  function callout(text, sub, ms) {
    calloutEl.textContent = text;
    calloutEl.classList.toggle('is-sub', !!sub);
    calloutEl.classList.add('is-shown');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => calloutEl.classList.remove('is-shown'), ms || 900);
  }

  function showOverlay(screen) {
    overlay.hidden = false;
    wrap.classList.add('has-overlay');
    for (const s of [screenTitle, screenResult]) s.hidden = s !== screen;
  }
  function hideOverlay() {
    overlay.hidden = true;
    wrap.classList.remove('has-overlay');
  }

  // 手順の進み具合 (frac が null なら隠す)
  function setProgress(frac) {
    progressEl.classList.toggle('is-off', frac === null);
    if (frac !== null) progressFill.style.width = `${Math.round(clamp(frac, 0, 1) * 100)}%`;
  }

  // 遊び方
  function setHelp(open) {
    helpEl.hidden = !open;
    helpBtn.setAttribute('aria-expanded', String(open));
    if (open) $('help-close').focus();
    else helpBtn.focus();
  }
  helpBtn.addEventListener('click', () => setHelp(helpEl.hidden));
  $('help-close').addEventListener('click', () => setHelp(false));
  helpEl.addEventListener('click', (e) => { if (e.target === helpEl) setHelp(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !helpEl.hidden) setHelp(false); });

  // 言語を切りかえる: 決まった文言を置きかえ、いまの場面の文を作りなおす
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    langSelect.value = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.setAttribute('title', t(el.dataset.i18nTitle));
    for (const el of document.querySelectorAll('[data-i18n-alt]')) el.setAttribute('alt', t(el.dataset.i18nAlt));
    for (const el of document.querySelectorAll('.help-body')) el.hidden = el.dataset.lang !== lang;
    for (const el of colorRow.children) el.setAttribute('aria-label', t('colorLabel', { c: el.dataset.color }));
    showWind();
    showBest();
    if (phase === 'fold' && !busy && !drag) enterStep();
    else if (phase === 'done') showDesign();
    else if (phase === 'launch') launchTexts();
    else if (phase === 'flight') flightTexts();
    else if (phase === 'result' && lastResult) {
      renderResult(...lastResult);
      prepareShare(lastResult[0], lastResult[1]);
    }
    // 見出しの書体が変わると下のパネルの高さが変わるので、カメラも合わせなおす
    measureView();
  }

  // m: 'guided' (お手本どおり) / 'free' (自由に折る)。省略したらいまのまま
  function startFold(m) {
    if (busy) return;
    if (m === 'guided' || m === 'free') mode = m;
    STEPS = mode === 'free' ? FREE_STEPS : GUIDED_STEPS;
    hideOverlay();
    phase = 'fold';
    // プレイした回数: 折りはじめるたびに1回 (折りなおし・最初からも数える)
    records.plays = (records.plays || 0) + 1;
    saveRecords();
    trackEvent('paper_plane_start', { mode, lang, stage: stage.id, play_count: records.plays });
    stageTrack.start(stage.id, { mode });
    launchEl.hidden = true;
    aimArrow.visible = false;
    trail.visible = false;
    blob.visible = false;
    landFlag.g.visible = false;
    hudFlight.textContent = '';
    sun.castShadow = true;
    resetFold();
    enterStep();
  }

  // ステージえらび (タイトルの画面)
  function renderStagePicker() {
    if (!stageRow) return;
    stageRow.innerHTML = '';
    PS.STAGES.forEach((st, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-btn';
      b.setAttribute('aria-pressed', String(st.id === stage.id));
      const best = records.stages[st.id] && records.stages[st.id].best;
      b.innerHTML = `<span class="stage-no">${i + 1}</span><span class="stage-name"></span><span class="stage-best"></span>`;
      b.querySelector('.stage-name').textContent = t(`stage_${st.id}`);
      b.querySelector('.stage-best').textContent = best ? fmtM(best.d) : '—';
      b.title = t(`stage_${st.id}_desc`);
      b.addEventListener('click', () => selectStage(st.id));
      stageRow.appendChild(b);
    });
    $('stage-desc').textContent = t(`stage_${stage.id}_desc`);
    replayBtn.hidden = !design;
  }

  function selectStage(id) {
    if (busy || id === stage.id) return;
    stage = PS.byId(id);
    store.set('paper-plane-stage', stage.id);
    buildStage(stage);
    newWind();
    landFlag.g.visible = false;
    trail.visible = false;
    blob.visible = false;
    showBest();
  }

  // 結果からタイトルへ (ステージを選びなおす)
  function openTitle() {
    phase = 'title';
    setCamGoal('room');
    landFlag.g.visible = false;
    trail.visible = false;
    blob.visible = false;
    hudFlight.textContent = '';
    showOverlay(screenTitle);
    showBest();
  }
  $('stage-btn').addEventListener('click', openTitle);
  replayBtn.addEventListener('click', () => {
    if (!design || busy) return;
    hideOverlay();
    readyLaunch(false);
  });

  // 色えらび
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-chip';
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute('aria-label', t('colorLabel', { c }));
    b.setAttribute('aria-pressed', String(c === paperColor));
    b.addEventListener('click', () => {
      setPaperColor(c);
      store.set('paper-plane-color', c);
      for (const el of colorRow.children) el.setAttribute('aria-pressed', String(el === b));
    });
    colorRow.appendChild(b);
  });
  startBtn.addEventListener('click', () => startFold('guided'));
  $('free-btn').addEventListener('click', () => startFold('free'));

  // キーボード: 投げるときは ↑↓ で角度、←→ で力、A D で左右の向き、スペースで投げる。飛んでいる間はスペースで早送り
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (phase === 'launch') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        angleInput.value = String(clamp(launchAngle() + (e.key === 'ArrowUp' ? 1 : -1), ANGLE_MIN, ANGLE_MAX));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        powerInput.value = String(clamp(launchPower() + (e.key === 'ArrowRight' ? 2 : -2), 0, 100));
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
        aimInput.value = String(clamp(launchAim() + (e.key.toLowerCase() === 'd' ? 1 : -1), -AIM_MAX, AIM_MAX));
      } else if (e.key === ' ' || e.key === 'Enter') {
        doThrow();
      } else return;
      e.preventDefault();
      updateLaunchLabels();
      updateAim();
    } else if (phase === 'flight' && e.key === ' ') {
      e.preventDefault();
      toggleFast();
    }
  });

  // 前回の角度と力
  try {
    const last = JSON.parse(store.get('paper-plane-launch'));
    if (last) {
      angleInput.value = String(clamp(Number(last.a) || 5, ANGLE_MIN, ANGLE_MAX));
      powerInput.value = String(clamp(Number(last.p) || 60, 0, 100));
      aimInput.value = String(clamp(Number(last.m) || 0, -AIM_MAX, AIM_MAX));
    }
  } catch (e) { /* なければ初期値 */ }

  // =====================================================================
  // ループ
  // =====================================================================
  // 3D の見える場所: 上のチップの下から、下のパネルの上まで。カメラの中心をそこへずらす
  const view = { frac: 1, target: 0, off: 0 };
  function measureView() {
    const h = wrap.clientHeight || 1;
    const wr = wrap.getBoundingClientRect();
    const top = Math.max(0, hudEl.getBoundingClientRect().bottom - wr.top) + 8;
    let bottom = h;
    if (panelEl.offsetParent) bottom = panelEl.getBoundingClientRect().top - wr.top - 8;
    view.frac = clamp((bottom - top) / h, 0.3, 1);
    view.target = (h - bottom - top) / 2;
  }
  function applyView(dt) {
    const k = dt === undefined ? 1 : 1 - Math.exp(-dt * 6);
    const next = view.off + (view.target - view.off) * k;
    if (Math.abs(next - view.off) < 0.05 && dt !== undefined) return;
    view.off = next;
    camera.setViewOffset(wrap.clientWidth, wrap.clientHeight, 0, view.off, wrap.clientWidth, wrap.clientHeight);
  }

  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 55 : 45;
    measureView();
    applyView();
    camera.updateProjectionMatrix();
    if (camMode !== 'chase') setCamGoal(camMode);
  }
  new ResizeObserver(resize).observe(wrap);
  new ResizeObserver(() => {
    measureView();
    if (camMode !== 'chase') setCamGoal(camMode);
  }).observe(panelEl);
  resize();

  let last = performance.now();
  let acc = 0;
  let trailTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    runTweens(dt);
    animateThermals(dt, time);
    applyView(dt);

    if (phase === 'flight') {
      acc += dt * (fast ? 3 : 1);
      while (acc >= PM.STEP && !flight.landed) {
        PM.stepFlight(flight, PM.STEP);
        acc -= PM.STEP;
        if (++trailTick % 6 === 0) pushTrail();
      }
      syncPlane();
      chase(dt);
      updateFlightHud();
      const gy = flight.p.x < -BLD.wallT ? BLD.floorY : PS.surfaceY(stage, flight.p.x, flight.p.z);
      const hgt = Math.max(0, flight.p.y - gy);
      blob.position.set(flight.p.x, gy + 0.015, flight.p.z);
      blob.scale.setScalar(1 + hgt * 0.15);
      blob.material.opacity = clamp(1 - hgt / 12, 0.15, 1);
      if (flight.thermalHit !== lastThermal && flight.thermalHit >= 0) {
        lastThermal = flight.thermalHit;
        callout(t('updraft'), true, 1100);
      }
      if (flight.landed) { pushTrail(); onLanded(); }
    } else if (phase === 'landed' || phase === 'result') {
      landTime += dt;
      orbit += dt * 0.35;
      const p = root.position;
      camGoal.pos.set(p.x + Math.cos(orbit) * 2.2, p.y + 1.1, p.z + Math.sin(orbit) * 2.2);
      camGoal.look.copy(p);
      camGoal.rate = 2.5;
      followGoal(dt);
    } else {
      followGoal(dt);
    }

    // 旗をはためかせる
    const ws = Math.hypot(wind.x, wind.z);
    for (const fl of flags) {
      fl.f.rotation.z = -(1 - Math.min(1, ws / 2.5)) * 1.2 + Math.sin(time * (2 + ws) + fl.phase) * 0.06;
      fl.f.rotation.y = Math.sin(time * (3 + ws * 2) + fl.phase) * 0.25 * Math.min(1, ws);
    }
    if (phase === 'done') {
      // 完成した紙ひこうきを、机の上で少しだけ浮かせて見せる
      root.position.y = DESK_ROOT.y + 0.012 + Math.sin(time * 2) * 0.004;
    }

    if (dirty && phase !== 'flight') drawPaper();
    updateMarkers(time);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  // 最初の画面
  resetFold();
  buildStage(stage);
  newWind();
  showBest();
  // 言語の選択肢
  for (const [code, name] of I18N.langs) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    langSelect.append(opt);
  }
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    store.set('paper-plane-lang', lang);
    applyLang();
    langSelect.blur();
  });
  applyLang();
  showOverlay(screenTitle);
  requestAnimationFrame(frame);
})();
