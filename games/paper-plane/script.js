/*
 * 窓から紙ひこうき: 机の上で紙ひこうきを折って、窓から飛ばして飛距離を競う 3D ゲーム
 *   描画は three.js。紙の形の計算と飛ぶときの物理は model.js (PaperPlaneModel)。
 *   長さの単位はメートル。建物の外壁が x = 0 で、窓の外 (+x) に向かって飛ばす。
 *   流れ: タイトル → 折る (8手順) → 完成 → 窓から投げる (角度と力) → 飛ぶ (カメラが追う) → 記録
 */
(() => {
  'use strict';

  const PM = window.PaperPlaneModel;
  const $ = (id) => document.getElementById(id);
  if (!window.THREE || !PM) {
    $('load-error').hidden = false;
    $('start-btn').disabled = true;
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
  const ARC_MAX = 120;                   // 地面の距離の線 (m)
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
  const throwBtn = $('throw-btn');
  const resultDist = $('result-dist');
  const resultNote = $('result-note');
  const resultTop = $('result-top');
  const againBtn = $('again-btn');
  const refoldBtn = $('refold-btn');

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
  };
  const trackEvent = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };

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

  // ---- 地面 (5m ごとの芝刈りのしま。進んだ距離がわかる) ----
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6fae4f';
    g.fillRect(0, 0, w / 2, h);
    g.fillStyle = '#62a046';
    g.fillRect(w / 2, 0, w / 2, h);
    speckle(g, w, h, 2600, '#3f7a2e', 0.5, 2);
    speckle(g, w, h, 1400, '#a6d47a', 0.4, 2);
  }, [70, 70]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(250, 0, 0);
  scene.add(ground);

  // 距離の線 (窓の下の壁ぎわを中心にした円弧) と数字
  const arcMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 });
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
  for (let d = 10; d <= ARC_MAX; d += 10) {
    const arc = new THREE.Mesh(new THREE.RingGeometry(d - 0.07, d + 0.07, 160, 1, -0.45, 0.9), arcMat);
    arc.rotation.x = -Math.PI / 2;
    arc.position.y = 0.02;
    scene.add(arc);
    for (const a of [-0.3, 0, 0.3]) {
      const label = groundLabel(`${d}m`, a === 0 ? 3.2 : 2.2, '#ffffff');
      label.position.set(Math.cos(a) * (d - 1.6), 0.03, Math.sin(a) * (d - 1.6));
      label.rotation.z = -Math.PI / 2 - a;
      scene.add(label);
    }
  }

  // 風見の旗 (風の向きと強さがわかる)
  const flags = [];
  const poleMat = lambert('#d9dde2');
  const flagMat = new THREE.MeshLambertMaterial({ color: '#ff7a3d', side: THREE.DoubleSide });
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, -0.35, 0, 0, -0.7, 0], 3));
  flagGeo.computeVertexNormals();
  for (let d = 20; d <= 100; d += 20) {
    for (const s of [-1, 1]) {
      const x = Math.cos(0.5) * d;
      const z = s * Math.sin(0.5) * d;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 8), poleMat);
      pole.position.set(x, 2, z);
      scene.add(pole);
      const fg = new THREE.Group();
      fg.position.set(x, 3.95, z);
      const f = new THREE.Mesh(flagGeo, flagMat);
      fg.add(f);
      scene.add(fg);
      flags.push({ g: fg, f, phase: Math.random() * 6 });
    }
  }

  // 木 (コースの両わきと奥)
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 2.4, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const trunkMat = lambert('#7b5a3a');
  const leafMats = ['#3f8a3a', '#4f9b45', '#367a35'].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 1 }));
  function tree(x, z, s) {
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 1.2 * s, z);
    t.scale.setScalar(s);
    const l = new THREE.Mesh(leafGeo, leafMats[Math.floor(Math.random() * leafMats.length)]);
    l.position.set(x, 3.3 * s, z);
    l.scale.set(s * rand(0.9, 1.2), s * rand(1.1, 1.5), s * rand(0.9, 1.2));
    l.rotation.y = rand(0, 3);
    scene.add(t, l);
  }
  for (let x = 8; x < 240; x += rand(5, 9)) {
    for (const s of [-1, 1]) tree(x, s * rand(64, 90), rand(1.2, 2.2));
  }
  for (let z = -90; z < 90; z += rand(5, 9)) tree(rand(175, 200), z, rand(1.6, 2.6));

  // ---- 建物 (外壁は x = 0 から内側へ厚さ 0.25。窓の穴をあけてある) ----
  const wallMat = lambert('#ece3d3');
  const WX = -BLD.wallT / 2;
  box(BLD.wallT, BLD.sillY, 28, wallMat, WX, BLD.sillY / 2, 0);
  box(BLD.wallT, 12.6 - BLD.topY, 28, wallMat, WX, (12.6 + BLD.topY) / 2, 0);
  const sideW = 14 - BLD.halfZ;
  const winH = BLD.topY - BLD.sillY;
  box(BLD.wallT, winH, sideW, wallMat, WX, BLD.sillY + winH / 2, -BLD.halfZ - sideW / 2);
  box(BLD.wallT, winH, sideW, wallMat, WX, BLD.sillY + winH / 2, BLD.halfZ + sideW / 2);
  box(0.5, 0.25, 28.4, lambert('#d6ccba'), 0, 12.7, 0);
  for (const y of [4.3, 7.9]) box(0.12, 0.18, 28.2, lambert('#ddd3c1'), 0.05, y, 0);
  // ほかの窓 (飾り)
  const glassMat = lambert('#45647e', { emissive: '#1b2a38', emissiveIntensity: 0.3 });
  const frameMat = lambert('#f7f5f0');
  for (const y of [2.65, 6.15, 9.65]) {
    for (let z = -9; z <= 9; z += 3) {
      if (z === 0 && y > 9) continue;
      const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), frameMat);
      fr.rotation.y = Math.PI / 2;
      fr.position.set(0.01, y, z);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), glassMat);
      gl.rotation.y = Math.PI / 2;
      gl.position.set(0.015, y, z);
      scene.add(fr, gl);
    }
  }
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
  function loadRecords() {
    try {
      const r = JSON.parse(store.get(REC_KEY));
      if (r && Array.isArray(r.top)) return r;
    } catch (e) { /* 壊れていたら作り直す */ }
    return { best: null, top: [], throws: 0 };
  }
  let records = loadRecords();
  const saveRecords = () => store.set(REC_KEY, JSON.stringify(records));

  function showBest() {
    const b = records.best;
    hudBest.textContent = b ? `ベスト ${fmtM(b.d)}` : '';
    titleBest.textContent = b ? `ベスト記録 ${fmtM(b.d)}` : '';
    if (b) {
      bestFlag.g.position.set(b.x, 0, b.z);
      bestFlag.setText(`BEST ${b.d.toFixed(1)}m`);
      bestFlag.g.visible = true;
    }
  }

  // =====================================================================
  // 風 (投げるたびに変わる。折る前から見えるので、翼の幅を風に合わせて選べる)
  // =====================================================================
  let wind = { x: 0, z: 0 };
  function newWind() {
    const s = Math.round(rand(0, 3) * 10) / 10;
    const a = rand(0, Math.PI * 2);
    wind = { x: Math.cos(a) * s, z: Math.sin(a) * s };
    showWind();
  }
  function windLabel() {
    const s = Math.hypot(wind.x, wind.z);
    if (s < 0.3) return '風なし';
    const along = wind.x / s;
    let kind;
    if (along > 0.7) kind = '追い風';
    else if (along < -0.7) kind = '向かい風';
    else kind = wind.z > 0 ? '左からの横風' : '右からの横風';
    return `${kind} ${s.toFixed(1)}m/s`;
  }
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
  const STEPS = [
    { kind: 'flat', flat: 0, title: '左上の角を折る', text: 'オレンジの角をドラッグして、青い点 (まん中の折り筋) まで運ぼう。ぴったり合わせるほど、まっすぐ飛ぶ' },
    { kind: 'flat', flat: 1, title: '右上の角を折る', text: '右上の角も、まん中の折り筋まで運ぼう' },
    { kind: 'flat', flat: 2, title: '左のふちを折る', text: 'ななめのふちを、まん中の折り筋に合わせて折ろう' },
    { kind: 'flat', flat: 3, title: '右のふちを折る', text: '右のふちも、まん中の折り筋に合わせて折ろう' },
    { kind: 'half', title: '半分に折る', text: '左のはしを右へドラッグして、まん中の折り筋で半分に折ろう' },
    { kind: 'line', title: '翼の線を決める', text: '左右にドラッグして、翼を折る線を動かそう。線より外側が翼になる' },
    { kind: 'wing', side: 1, title: '右の翼を折る', text: '翼のはしを外へ倒すようにドラッグしよう' },
    { kind: 'wing', side: -1, title: '左の翼を折る', text: '反対側の翼も、同じように外へ倒そう' },
  ];

  let phase = 'title';       // title / fold / done / launch / flight / landed / result
  const fold = {
    step: 0,
    flat: null,              // 平らに折っている間の多角形
    body: null,              // 半分に折ってからの多角形
    pose: null,
    k: PM.K_DEFAULT,
    misses: [],
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
    });
  }

  function resetFold() {
    fold.step = 0;
    fold.flat = PM.makeSheet();
    fold.body = null;
    fold.pose = null;
    fold.k = PM.K_DEFAULT;
    fold.misses = [];
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
  function praise(miss) {
    if (miss <= 0) callout('ぴったり!');
    else callout(`ずれ ${(miss * 100).toFixed(1)}cm`, true);
  }

  // ---- 半分に折る・翼を折る (画面の上で、つまんだ点から目標の点へ向かうドラッグの割合で角度を決める) ----
  function sweepEnds() {
    const st = STEPS[fold.step];
    const p = fold.pose;
    if (st.kind === 'half') {
      const v = [-HW + 0.004, 0.04];
      return [
        paperToWorld(bodyPoint(-1, false, v, p)),
        paperToWorld(bodyPoint(-1, false, v, Object.assign({}, p, { aL: Math.PI }))),
      ];
    }
    const s = st.side;
    const v = [s * (HW - 0.004), 0.01];
    const key = s > 0 ? 'wR' : 'wL';
    return [
      paperToWorld(bodyPoint(s, true, v, Object.assign({}, p, { [key]: 0 }))),
      paperToWorld(bodyPoint(s, true, v, Object.assign({}, p, { [key]: WING_FOLD }))),
    ];
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
    if (fold.k < 0.02) type = '翼が広い: ゆっくり長く飛ぶ。追い風に強く、向かい風に弱い';
    else if (fold.k > 0.038) type = '翼がせまい: 速くまっすぐ飛ぶ。向かい風に強い';
    else type = 'ふつう: 速さと飛びのバランスがいい';
    guideStats.textContent = `胴の高さ ${body.toFixed(1)}cm ・ 翼のはば ${wing.toFixed(1)}cm\n${type}`;
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
    hudStep.textContent = `手順 ${fold.step + 1} / ${STEPS.length}`;
    guideTitle.textContent = st.title;
    guideText.textContent = st.text;
    guideStats.textContent = '';
    guideLine.visible = false;
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
      { label: 'おまかせで折る', onClick: autoStep },
      { label: 'ひとつ戻る', onClick: undo, disabled: !fold.history.length },
    ];
    if (st.kind === 'line') acts.unshift({ label: 'この線で折る', onClick: confirmLine, primary: true });
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
    fold.preview = null;
    dirty = true;
    enterStep();
  }

  function finishFold() {
    hudStep.textContent = '完成';
    guideTitle.textContent = '完成!';
    guideText.textContent = '胴を少し開いて、翼をととのえています…';
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
      trackEvent('paper_plane_fold', { wing_cm: Math.round((HW - fold.k) * 1000) / 10, symmetry: Math.round(design.sym * 100) });
    });
    setCamGoal('show');
  }

  function planeType(d) {
    const fp = PM.flightParams(d);
    if (fp.vGlide < 4.6) return 'ゆっくり長く飛ぶグライダー型 (追い風に強い)';
    if (fp.vGlide > 6.2) return '速くまっすぐ飛ぶダーツ型 (向かい風に強い)';
    return '速さと飛びのバランス型';
  }

  function showDesign() {
    const d = design;
    const fp = PM.flightParams(d);
    const totalMiss = fold.misses.reduce((s, m) => s + m, 0);
    guideTitle.textContent = '完成!';
    guideText.textContent = planeType(d);
    const lines = [
      `翼の面積 ${(d.wing * 1e4).toFixed(0)}cm² ・ 左右のそろい ${(d.sym * 100).toFixed(1)}%`,
      totalMiss <= 0 ? '折りのずれ なし (ぴったり!)' : `折りのずれ 合計 ${(totalMiss * 100).toFixed(1)}cm`,
    ];
    if (Math.abs(fp.rollBias) > 0.6) lines.push(`左右がずれているので、${fp.rollBias > 0 ? '左' : '右'}へ曲がりやすい`);
    guideStats.textContent = lines.join('\n');
    setActions([
      { label: '窓から飛ばす', onClick: goLaunch, primary: true },
      { label: '折りなおす', onClick: startFold },
    ]);
  }

  // ---- ドラッグ ----
  canvas.addEventListener('pointerdown', (e) => {
    if (phase !== 'fold' || busy || drag) return;
    const st = STEPS[fold.step];
    if (!st) return;
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
        if (moved > 0.02) callout('青い点の近くで離そう', true);
      }
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
    const fit = (v, h) => Math.max(v / 2 / tanV, h / 2 / (tanV * asp));
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
      const dist = fit(0.42, 0.46);
      camGoal.pos.set(c.x - dist * 0.62, c.y + dist * 0.55, c.z + dist * 0.55);
      camGoal.look.set(c.x + 0.02, c.y + 0.02, c.z);
    } else if (mode === 'launch') {
      // 部屋の中から、窓わくごしに外を見る
      const L = PM.LAUNCH;
      camGoal.pos.set(L.x - 1.05, L.y + 0.3, L.z + 0.22);
      camGoal.look.set(L.x + 4, L.y - 0.35, L.z);
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
    const floorY = goal.x < -BLD.wallT ? BLD.floorY : 0;
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
  let fast = false;
  let landTime = 0;
  let orbit = 0;

  function launchQuat(angleDeg) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (angleDeg * Math.PI) / 180));
  }
  const launchAngle = () => Number(angleInput.value);
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
    phase = 'launch';
    flight = null;
    fast = false;
    hudFlight.textContent = '';
    hudStep.textContent = '窓から飛ばす';
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
    guideTitle.textContent = '窓から飛ばそう';
    guideText.textContent = '角度と力を決めて「投げる」。風の向きと強さも見ておこう';
    guideStats.textContent = `${planeType(design)}`;
    setActions([{ label: '折りなおす', onClick: startFold }]);
    launchEl.hidden = false;
    updateLaunchLabels();
  }

  function updateLaunchLabels() {
    const a = launchAngle();
    angleVal.textContent = `${a > 0 ? '上 ' : a < 0 ? '下 ' : ''}${Math.abs(a)}°`;
    powerVal.textContent = `${launchPower()}% (${(launchSpeed() * 3.6).toFixed(0)}km/h)`;
  }

  function updateAim() {
    if (phase !== 'launch') { aimArrow.visible = false; return; }
    const a = (launchAngle() * Math.PI) / 180;
    if (!busy) root.quaternion.copy(launchQuat(launchAngle()));
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    aimArrow.position.copy(root.position).addScaledVector(dir, 0.2);
    aimArrow.setDirection(dir);
    aimArrow.setLength(0.15 + launchPower() / 100 * 0.6, 0.07, 0.045);
    aimArrow.visible = !busy;
  }

  angleInput.addEventListener('input', () => { updateLaunchLabels(); updateAim(); });
  powerInput.addEventListener('input', () => { updateLaunchLabels(); updateAim(); });
  throwBtn.addEventListener('click', doThrow);

  function doThrow() {
    if (phase !== 'launch' || busy) return;
    flight = PM.createFlight(design, { speed: launchSpeed(), angle: (launchAngle() * Math.PI) / 180 }, wind, Math.floor(Math.random() * 1e9));
    phase = 'flight';
    aimArrow.visible = false;
    launchEl.hidden = true;
    trailCount = 0;
    trail.visible = true;
    blob.visible = true;
    camMode = 'chase';
    chaseDir.set(1, 0, 0);
    hudStep.textContent = '';
    guideTitle.textContent = '飛んでいる!';
    guideText.textContent = 'あとは風と紙ひこうきにおまかせ';
    guideStats.textContent = '';
    setActions([{ label: '早送り', onClick: toggleFast }]);
    store.set('paper-plane-launch', JSON.stringify({ a: launchAngle(), p: launchPower() }));
  }

  function toggleFast() {
    fast = !fast;
    setActions([{ label: fast ? 'ふつうの速さ' : '早送り', onClick: toggleFast }]);
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
    hudFlight.textContent = `${d.toFixed(1)} m ・ 高さ ${flight.p.y.toFixed(1)} m ・ ${(flight.speed * 3.6).toFixed(0)} km/h`;
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
    const restY = (flight.p.x < -BLD.wallT ? BLD.floorY : 0) + design.cgLocal[1] + 0.004;
    tween(0.35, (k) => {
      root.quaternion.copy(fromQ).slerp(restQ, k);
      root.position.y = lerp(fromY, restY, k);
    });
    landFlag.g.position.set(flight.p.x + 0.4, flight.p.x < -BLD.wallT ? BLD.floorY : 0, flight.p.z);
    landFlag.setText(`${dist.toFixed(2)}m`);
    landFlag.g.visible = dist > 0;
    callout(flight.hitWall && dist < 2 ? '壁にぶつかった…' : fmtM(dist), false, 1600);
    setActions([]);
    guideTitle.textContent = '着地!';
    guideText.textContent = '';

    records.throws = (records.throws || 0) + 1;
    const entry = { d: Math.round(dist * 100) / 100, x: flight.p.x, z: flight.p.z, k: fold.k, wind: windLabel(), t: Date.now() };
    const prevBest = records.best ? records.best.d : 0;
    const isBest = entry.d > prevBest;
    if (isBest) records.best = entry;
    records.top.push(entry);
    records.top.sort((a, b) => b.d - a.d);
    records.top = records.top.slice(0, 5);
    saveRecords();
    trackEvent('paper_plane_throw', { distance: entry.d, angle: launchAngle(), power: launchPower() });

    setTimeout(() => showResult(entry, isBest, prevBest), 1700);
  }

  function showResult(entry, isBest, prevBest) {
    phase = 'result';
    resultDist.textContent = fmtM(entry.d);
    if (isBest && prevBest > 0) resultNote.textContent = `ベスト更新! (これまで ${fmtM(prevBest)})`;
    else if (isBest) resultNote.textContent = 'はじめての記録!';
    else resultNote.textContent = `ベスト ${fmtM(records.best.d)} まで あと ${(records.best.d - entry.d).toFixed(2)} m`;
    resultNote.classList.toggle('is-best', isBest);
    resultTop.innerHTML = '';
    records.top.forEach((r, i) => {
      const li = document.createElement('li');
      const date = new Date(r.t);
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="d">${fmtM(r.d)}</span><span class="meta">翼 ${((HW - r.k) * 100).toFixed(1)}cm ・ ${r.wind} ・ ${date.getMonth() + 1}/${date.getDate()}</span>`;
      if (r.t === entry.t) li.classList.add('is-now');
      resultTop.appendChild(li);
    });
    showOverlay(screenResult);
    showBest();
  }

  againBtn.addEventListener('click', () => {
    hideOverlay();
    newWind();
    readyLaunch(false);
  });
  refoldBtn.addEventListener('click', () => {
    hideOverlay();
    newWind();
    startFold();
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
    for (const s of [screenTitle, screenResult]) s.hidden = s !== screen;
  }
  function hideOverlay() { overlay.hidden = true; }

  function startFold() {
    if (busy) return;
    hideOverlay();
    phase = 'fold';
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

  // 色えらび
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'color-chip';
    b.style.background = c;
    b.setAttribute('aria-label', `紙の色 ${c}`);
    b.setAttribute('aria-pressed', String(c === paperColor));
    b.addEventListener('click', () => {
      setPaperColor(c);
      store.set('paper-plane-color', c);
      for (const el of colorRow.children) el.setAttribute('aria-pressed', String(el === b));
    });
    colorRow.appendChild(b);
  });
  startBtn.addEventListener('click', startFold);

  // キーボード: 投げるときは ↑↓ で角度、←→ で力、スペースで投げる。飛んでいる間はスペースで早送り
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (phase === 'launch') {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        angleInput.value = String(clamp(launchAngle() + (e.key === 'ArrowUp' ? 1 : -1), ANGLE_MIN, ANGLE_MAX));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        powerInput.value = String(clamp(launchPower() + (e.key === 'ArrowRight' ? 2 : -2), 0, 100));
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
    }
  } catch (e) { /* なければ初期値 */ }

  // =====================================================================
  // ループ
  // =====================================================================
  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 55 : 45;
    camera.updateProjectionMatrix();
    if (camMode !== 'chase') setCamGoal(camMode);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  let last = performance.now();
  let acc = 0;
  let trailTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    runTweens(dt);

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
      const gy = flight.p.x < -BLD.wallT ? BLD.floorY : 0;
      const hgt = Math.max(0, flight.p.y - gy);
      blob.position.set(flight.p.x, gy + 0.015, flight.p.z);
      blob.scale.setScalar(1 + hgt * 0.15);
      blob.material.opacity = clamp(1 - hgt / 12, 0.15, 1);
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
  newWind();
  showBest();
  showOverlay(screenTitle);
  guideTitle.textContent = 'ようこそ';
  guideText.textContent = '紙の色を選んで「折りはじめる」を押そう';
  requestAnimationFrame(frame);
})();
