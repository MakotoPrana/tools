/*
 * STRIKE LANE: 3D ボウリング
 *   描画は three.js、ピンとボールの動きは cannon.js の物理演算。
 *   長さの単位はメートル。ファウルラインが z = 0 で、ピンは -z の方向 (奥) にある。
 */
(() => {
  'use strict';

  const errorEl = document.getElementById('load-error');
  if (!window.THREE || !window.CANNON) {
    errorEl.hidden = false;
    document.getElementById('start-btn').disabled = true;
    return;
  }

  // ---- レーンの寸法 (公認規格に近い値) ----
  const BOARDS = 39;                       // レーンの板の枚数
  const LANE_W = 1.054;                    // レーン幅 41.5in
  const LANE_HALF = LANE_W / 2;
  const BOARD_W = LANE_W / BOARDS;
  const GUTTER_W = 0.235;                  // ガターの幅 9.25in
  const GUTTER_R = GUTTER_W / 2;
  const WALL_X = LANE_HALF + GUTTER_W;
  const HEAD_Z = -18.29;                   // ファウルラインから1番ピンまで 60ft
  const PIN_SPACING = 0.3048;              // ピンの間隔 12in
  const ROW_DZ = PIN_SPACING * Math.sqrt(3) / 2;
  const DECK_END = HEAD_Z - 0.87;          // ピンデッキの奥の端
  const PIT_FLOOR = -0.45;
  const BALL_R = 0.108;
  const BALL_MASS = 7;
  const PIN_MASS = 1.5;
  const PIN_COM = 0.145;                   // ピンの重心の高さ
  const START_Z = -0.3;
  const BALL_X_MAX = LANE_HALF - BALL_R;
  const OIL_END_Z = -9;                    // ここより奥はオイルが薄く、カーブがかかり始める

  const MIN_SPEED = 4.5;                   // m/s
  const MAX_SPEED = 10.5;
  const MAX_ANGLE = 0.05;                  // rad
  const HOOK_FORCE = 5.5;                  // N (カーブ最大のときの横向きの力)

  // ---- DOM ----
  const canvas = document.getElementById('board');
  const wrap = document.getElementById('board-wrap');
  const sheetEl = document.getElementById('sheet');
  const hudFrame = document.getElementById('hud-frame');
  const hudSpeed = document.getElementById('hud-speed');
  const hintEl = document.getElementById('hint');
  const calloutEl = document.getElementById('callout');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const titleScreen = document.getElementById('title-screen');
  const startBtn = document.getElementById('start-btn');
  const bestEl = document.getElementById('best');
  const powerEl = document.getElementById('power');
  const powerFill = document.getElementById('power-fill');
  const soundBtn = document.getElementById('sound-btn');

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* 保存できなくても遊べる */ } },
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  // =====================================================================
  // 描画 (three.js)
  // =====================================================================
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e18);
  scene.fog = new THREE.Fog(0x0c0e18, 26, 44);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 80);
  const camPos = new THREE.Vector3(0, 1.3, 2.3);
  const camLook = new THREE.Vector3(0, 0, -12);
  camera.position.copy(camPos);

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x1a1c2c, 0.65));
  // 影を落とすライト。注目している場所 (ボールかピン) の上についていく
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -1.6;
  sun.shadow.camera.right = 1.6;
  sun.shadow.camera.top = 1.6;
  sun.shadow.camera.bottom = -1.6;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 12;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  // ピンデッキを照らすスポットライト (ボウリング場のピンはまぶしいほど明るい)
  const deckLight = new THREE.SpotLight(0xffffff, 1.1, 9, 0.6, 0.5, 1);
  deckLight.position.set(0, 2.4, HEAD_Z + 1.6);
  deckLight.target.position.set(0, 0, HEAD_Z - 0.5);
  scene.add(deckLight, deckLight.target);

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  // メープルとパインの板を39枚並べた木目
  function laneTexture(light) {
    return canvasTexture(BOARDS * 8, 256, (g, w, h) => {
      for (let b = 0; b < BOARDS; b++) {
        const tone = rand(-10, 10);
        const base = light ? [226, 190, 140] : [212, 168, 112];
        g.fillStyle = `rgb(${base[0] + tone},${base[1] + tone},${base[2] + tone * 0.8})`;
        g.fillRect(b * 8, 0, 8, h);
        // 木目のすじ
        g.globalAlpha = 0.12;
        for (let i = 0; i < 6; i++) {
          g.fillStyle = Math.random() < 0.5 ? '#7a4b22' : '#fff2d8';
          g.fillRect(b * 8 + rand(0, 7), 0, 1, h);
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(70, 40, 15, 0.35)';
        g.fillRect(b * 8, 0, 1, h);
      }
      // 板の継ぎ目
      g.fillStyle = 'rgba(70, 40, 15, 0.25)';
      for (let b = 0; b < BOARDS; b++) g.fillRect(b * 8, rand(0, h), 8, 1);
    });
  }

  const laneTex = laneTexture(false);
  laneTex.wrapS = laneTex.wrapT = THREE.RepeatWrapping;
  const laneLen = 3 - DECK_END;
  laneTex.repeat.set(1, laneLen / 2.4);
  const laneMat = new THREE.MeshPhongMaterial({ map: laneTex, shininess: 90, specular: 0x3a3226 });
  const deckTex = laneTexture(true);
  deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
  const deckMat = new THREE.MeshPhongMaterial({ map: deckTex, shininess: 60, specular: 0x2a2620 });
  const gutterMat = new THREE.MeshPhongMaterial({ color: 0x2b2f3d, shininess: 70, specular: 0x555566, side: THREE.DoubleSide });
  const capMat = new THREE.MeshPhongMaterial({ color: 0x3c2a1e, shininess: 30 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x0a0b12 });
  const spotMat = new THREE.MeshBasicMaterial({ color: 0x3a1f10 });

  // ---- ピンの形 (回転体) ----
  // [高さ in, 半径 in] 公認ピンの断面をなぞった値
  const PIN_PROFILE = [
    [0, 0.0], [0, 1.0], [0.75, 1.41], [2.25, 1.93], [3.375, 2.25], [4.5, 2.383], [5.875, 2.34],
    [7.25, 2.0], [8.625, 1.38], [10.0, 0.9], [10.875, 0.95], [11.75, 1.15], [12.625, 1.28],
    [13.5, 1.27], [14.25, 1.05], [14.75, 0.65], [15.0, 0.0],
  ];
  function pinRadiusAt(hIn) {
    for (let i = 2; i < PIN_PROFILE.length; i++) {
      const [h0, r0] = PIN_PROFILE[i - 1];
      const [h1, r1] = PIN_PROFILE[i];
      if (hIn <= h1) return r0 + (r1 - r0) * ((hIn - h0) / (h1 - h0 || 1));
    }
    return 0;
  }
  function makePinGeometry() {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(1.0 * 0.0254, 0)];
    const STEPS = 120;
    for (let i = 0; i <= STEPS; i++) {
      const hIn = (i / STEPS) * 15;
      pts.push(new THREE.Vector2(Math.max(pinRadiusAt(hIn), 0.0001) * 0.0254, hIn * 0.0254));
    }
    const geo = new THREE.LatheGeometry(pts, 22);
    geo.translate(0, -PIN_COM, 0);
    // 首の2本の赤いライン
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const white = new THREE.Color(0xf7f5ef);
    const red = new THREE.Color(0xc8261c);
    for (let i = 0; i < pos.count; i++) {
      const hIn = (pos.getY(i) + PIN_COM) / 0.0254;
      const c = (hIn > 9.35 && hIn < 9.85) || (hIn > 10.45 && hIn < 10.95) ? red : white;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }
  const pinGeo = makePinGeometry();
  const pinMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 110, specular: 0x666666 });

  // ---- ボール (マーブル模様と3つの指穴) ----
  const ballTex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#1d2f6b';
    g.fillRect(0, 0, w, h);
    const swirl = ['#3a63d8', '#7b3fc4', '#12204d', '#5a8cff'];
    for (let i = 0; i < 140; i++) {
      g.strokeStyle = swirl[i % swirl.length];
      g.globalAlpha = rand(0.15, 0.45);
      g.lineWidth = rand(2, 10);
      g.beginPath();
      let x = rand(0, w);
      let y = rand(0, h);
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += rand(-60, 60);
        y += rand(-30, 30);
        g.quadraticCurveTo(x + rand(-40, 40), y + rand(-40, 40), x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#05060a';
    for (const [x, y, r] of [[250, 70, 9], [274, 70, 9], [262, 108, 10]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 36, 24),
    new THREE.MeshPhongMaterial({ map: ballTex, shininess: 140, specular: 0x8888aa }),
  );
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // ---- レーン・ガター・ピンデッキ (隣のレーンにも同じ物を置く) ----
  function buildLane(offsetX, withPins) {
    const group = new THREE.Group();
    group.position.x = offsetX;

    const approachLen = 3;
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, -HEAD_Z + 0.6), laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(0, 0, (HEAD_Z + 0.6) / 2 - 0.3);
    lane.receiveShadow = true;
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, HEAD_Z + 0.9 - DECK_END - 0.6), deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.0005, (HEAD_Z + 0.3 + DECK_END) / 2);
    deck.receiveShadow = true;
    const approach = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, approachLen), deckMat);
    approach.rotation.x = -Math.PI / 2;
    approach.position.set(0, 0, approachLen / 2 - 0.3);
    approach.receiveShadow = true;
    group.add(lane, deck, approach);

    // ファウルライン
    const foul = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W + GUTTER_W * 2 + 0.1, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1a22 }));
    foul.rotation.x = -Math.PI / 2;
    foul.position.set(0, 0.001, -0.3);
    group.add(foul);

    // スパット (7つの三角) は 12〜16ft、ドットは 7ft
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -BOARD_W * 0.7, 0, 0.09, BOARD_W * 0.7, 0, 0.09, 0, 0, -0.09,
    ], 3));
    for (const board of [5, 10, 15, 20, 25, 30, 35]) {
      const fromCenter = Math.abs(board - 20) / 5;
      const arrow = new THREE.Mesh(arrowGeo, spotMat);
      arrow.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - (4.88 - fromCenter * 0.305));
      group.add(arrow);
    }
    const dotGeo = new THREE.CircleGeometry(0.011, 12);
    for (const board of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) {
      const dot = new THREE.Mesh(dotGeo, spotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(LANE_HALF - (board - 0.5) * BOARD_W, 0.001, -0.3 - 2.13);
      group.add(dot);
    }
    // ピンの置き場所の印
    for (const spot of PIN_SPOTS) {
      const mark = new THREE.Mesh(dotGeo, spotMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(spot.x, 0.0012, spot.z);
      group.add(mark);
    }

    // ガター (半円の溝) と外側のふち
    const gutterLen = -DECK_END;
    for (const side of [-1, 1]) {
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(GUTTER_R, GUTTER_R, gutterLen, 18, 1, true, -Math.PI / 2, Math.PI), gutterMat);
      gutter.rotation.x = Math.PI / 2;
      gutter.position.set(side * (LANE_HALF + GUTTER_R), 0, DECK_END / 2);
      gutter.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, gutterLen + 3), capMat);
      cap.position.set(side * (WALL_X + 0.03), 0.025, (DECK_END + 3) / 2 - 0.3);
      // ピンデッキの横の壁 (キックバック)
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 3), darkMat);
      kick.position.set(side * (WALL_X + 0.025), 0.375 - 0.1, HEAD_Z - 0.9);
      group.add(gutter, cap, kick);
    }

    // ピットとマスキング (ピンの上の看板)
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 2), darkMat);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, PIT_FLOOR, DECK_END - 1);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.1, 1.4), new THREE.MeshLambertMaterial({ color: 0x14121c }));
    curtain.position.set(0, 0.25, DECK_END - 1.5);
    group.add(pit, curtain);

    const masking = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.06, 0.62), new THREE.MeshBasicMaterial({ map: maskingTex(Math.round(7 + offsetX / LANE_PITCH)) }));
    masking.position.set(0, 1.08, HEAD_Z + 0.55);
    group.add(masking);

    if (withPins) {
      for (const spot of PIN_SPOTS) {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(spot.x, PIN_COM, spot.z);
        group.add(pin);
      }
    }
    scene.add(group);
  }

  function maskingTex(laneNo) {
    return canvasTexture(512, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#151a3a');
      grad.addColorStop(0.5, '#25205a');
      grad.addColorStop(1, '#151a3a');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      // 星くずとネオンの線
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${rand(0.1, 0.6)})`;
        g.fillRect(rand(0, w), rand(0, h), 2, 2);
      }
      g.strokeStyle = '#ff5e7a';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#ffd25e';
      g.font = '700 54px "Bungee", "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(laneNo), w / 2, h / 2 + 2);
      g.font = '700 22px "Bungee", "Arial Black", sans-serif';
      g.fillStyle = '#9fd8ff';
      g.fillText('STRIKE', w * 0.2, h / 2);
      g.fillText('LANE', w * 0.8, h / 2);
    });
  }

  // 1〜10番ピンの位置。手前から1列目に1番、2列目に2・3番…。番号は投げる人から見て左から
  const PIN_SPOTS = [];
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i <= row; i++) {
      PIN_SPOTS.push({ x: (i - row / 2) * PIN_SPACING, z: HEAD_Z - row * ROW_DZ });
    }
  }

  const LANE_PITCH = WALL_X * 2 + 0.5;
  buildLane(0, false);
  buildLane(-LANE_PITCH, true);
  buildLane(LANE_PITCH, true);
  buildLane(-LANE_PITCH * 2, true);
  buildLane(LANE_PITCH * 2, true);

  // レーンの間のボールリターンと、両側の壁
  for (const side of [-1, 1]) {
    const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 22), new THREE.MeshPhongMaterial({ color: 0x23284a, shininess: 40 }));
    ret.position.set(side * LANE_PITCH / 2, 0.06, -9.6);
    scene.add(ret);
  }
  const wallMatSide = new THREE.MeshLambertMaterial({ color: 0x161433 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 4), wallMatSide);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * LANE_PITCH * 2.6, 1.6, -9);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 24), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff5e7a : 0x5ad1ff }));
    neon.position.set(side * (LANE_PITCH * 2.6 - 0.05), 1.4, -9);
    scene.add(wall, neon);
  }

  // 狙いの線 (投げる前だけ見える)
  const aimLine = new THREE.Group();
  const aimDotGeo = new THREE.CircleGeometry(0.018, 10);
  const aimDotMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(aimDotGeo, aimDotMat);
    d.rotation.x = -Math.PI / 2;
    aimLine.add(d);
  }
  scene.add(aimLine);

  // =====================================================================
  // 物理 (cannon.js)
  // =====================================================================
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 14;
  world.allowSleep = true;

  const M = {
    lane: new CANNON.Material('lane'),
    ball: new CANNON.Material('ball'),
    pin: new CANNON.Material('pin'),
    wall: new CANNON.Material('wall'),
  };
  const contact = (a, b, friction, restitution) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
  contact(M.ball, M.lane, 0.05, 0.02);
  contact(M.pin, M.lane, 0.35, 0.15);
  contact(M.ball, M.pin, 0.12, 0.3);
  contact(M.pin, M.pin, 0.2, 0.5);
  contact(M.pin, M.wall, 0.2, 0.35);
  contact(M.ball, M.wall, 0.1, 0.15);

  function staticBox(material, hx, hy, hz, x, y, z) {
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(x, y, z);
    world.addBody(body);
    return body;
  }
  // レーン (上面が y = 0)
  const laneZ0 = 3;
  staticBox(M.lane, LANE_HALF, 0.15, (laneZ0 - DECK_END) / 2, 0, -0.15, (laneZ0 + DECK_END) / 2);
  // 手前のアプローチ (ガターの上もふさぐ)
  staticBox(M.lane, WALL_X, 0.15, 1.5 - 0.15, 0, -0.15, 1.5 - 0.15 + 0.0);
  for (const side of [-1, 1]) {
    // ガターの底
    staticBox(M.wall, GUTTER_R, 0.1, -DECK_END / 2, side * (LANE_HALF + GUTTER_R), -GUTTER_R - 0.1, DECK_END / 2);
    // 外側の壁 (ガターから出ないように)
    staticBox(M.wall, 0.03, 0.4, (3 - DECK_END) / 2, side * (WALL_X + 0.03), 0.2, (3 + DECK_END) / 2);
    // キックバック
    staticBox(M.wall, 0.03, 0.6, 2, side * (WALL_X + 0.03), 0.3, HEAD_Z - 1.2);
  }
  // ピット
  staticBox(M.wall, WALL_X + 0.2, 0.1, 1.2, 0, PIT_FLOOR - 0.1, DECK_END - 1.2);
  staticBox(M.wall, WALL_X + 0.2, 0.8, 0.1, 0, 0.3, DECK_END - 1.6);

  // ボール
  const ballBody = new CANNON.Body({ mass: BALL_MASS, material: M.ball, linearDamping: 0.01, angularDamping: 0.02 });
  ballBody.addShape(new CANNON.Sphere(BALL_R));
  ballBody.allowSleep = false;
  world.addBody(ballBody);

  // ピンは3つの円すい台を重ねた形で近似する。cannon の円柱は z 軸向きなので y 軸向きに回す
  const toY = new CANNON.Quaternion();
  toY.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  function pinPart(body, rBottom, rTop, yBottom, yTop) {
    const h = yTop - yBottom;
    body.addShape(new CANNON.Cylinder(rTop, rBottom, h, 10), new CANNON.Vec3(0, (yBottom + yTop) / 2 - PIN_COM, 0), toY);
  }
  const pins = PIN_SPOTS.map((spot, i) => {
    const body = new CANNON.Body({ mass: PIN_MASS, material: M.pin });
    pinPart(body, 0.026, 0.06, 0, 0.115);
    pinPart(body, 0.06, 0.04, 0.115, 0.22);
    pinPart(body, 0.03, 0.032, 0.22, 0.381);
    body.sleepSpeedLimit = 0.12;
    body.sleepTimeLimit = 0.4;
    body.linearDamping = 0.05;
    body.angularDamping = 0.08;
    const mesh = new THREE.Mesh(pinGeo, pinMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { no: i + 1, spot, body, mesh, active: false };
  });

  // =====================================================================
  // 効果音 (Web Audio で合成)
  // =====================================================================
  let audio = null;
  let soundOn = store.get('bowling-sound') !== 'off';
  let rumble = null;
  soundBtn.setAttribute('aria-pressed', String(soundOn));

  function initAudio() {
    if (audio || !soundOn) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    const len = audio.sampleRate * 2;
    const noise = audio.createBuffer(1, len, audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.noise = noise;
    // ボールが転がるゴロゴロ音
    const src = audio.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const gain = audio.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(audio.destination);
    src.start();
    rumble = gain;
  }

  let lastClack = 0;
  function clack(strength, pitch) {
    if (!audio || !soundOn || strength < 0.4) return;
    const now = audio.currentTime;
    if (now - lastClack < 0.018) return;
    lastClack = now;
    const vol = clamp(strength / 6, 0.05, 0.6);
    const src = audio.createBufferSource();
    src.buffer = audio.noise;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = pitch * rand(0.85, 1.15);
    bp.Q.value = 2.5;
    const g = audio.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(bp).connect(g).connect(audio.destination);
    src.start(now, rand(0, 1.5), 0.15);
  }

  ballBody.addEventListener('collide', (e) => {
    if (e.body.material === M.pin) clack(Math.abs(e.contact.getImpactVelocityAlongNormal()), 1500);
  });
  for (const p of pins) {
    p.body.addEventListener('collide', (e) => {
      if (e.body.material === M.pin) clack(Math.abs(e.contact.getImpactVelocityAlongNormal()), 2400);
    });
  }

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    store.set('bowling-sound', soundOn ? 'on' : 'off');
    if (soundOn) initAudio();
    if (audio) (soundOn ? audio.resume() : audio.suspend()).catch(() => {});
    soundBtn.blur();
  });

  // =====================================================================
  // ゲームの進行
  // =====================================================================
  // state: title → aim → rolling → result → (aim …) → over
  let state = 'title';
  let frames = [];          // フレームごとの倒した本数 [[7, 2], [10], …]
  let splits = [];          // スプリットになった投球 (フレーム番号 → 1投目なら true)
  let frameIndex = 0;
  let ballX = 0.18;         // 投げる位置。最初は少し右から
  let aimAngle = 0;
  let hook = 0;
  let throwTime = 0;
  let ballDoneAt = 0;
  let inGutter = false;
  let standingBefore = 0;
  let nextTimer = 0;

  function rackPins(onlyStanding) {
    for (const p of pins) {
      if (onlyStanding && !p.active) continue;
      const b = p.body;
      if (!onlyStanding) {
        b.position.set(p.spot.x, PIN_COM + 0.002, p.spot.z);
      } else {
        // 立っているピンはその場で起こし直す (機械がつかんで置き直すイメージ)
        b.position.set(b.position.x, PIN_COM + 0.002, b.position.z);
      }
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      if (!p.active) {
        world.addBody(b);
        p.active = true;
      }
      p.mesh.visible = true;
      b.sleep();
    }
  }

  function clearFallen() {
    for (const p of pins) {
      if (p.active && !isStanding(p)) {
        world.remove(p.body);
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  function isStanding(p) {
    if (!p.active) return false;
    const b = p.body;
    const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return up.y > 0.85 && b.position.y > PIN_COM - 0.04 && b.position.z > DECK_END && Math.abs(b.position.x) < LANE_HALF + 0.02;
  }

  const countStanding = () => pins.filter(isStanding).length;

  function resetBall() {
    ballBody.velocity.setZero();
    ballBody.angularVelocity.setZero();
    ballBody.quaternion.setFromEuler(rand(0, 6), rand(0, 6), 0);
    ballBody.position.set(ballX, BALL_R, START_Z);
    inGutter = false;
  }

  function startGame() {
    frames = [[]];
    splits = [];
    frameIndex = 0;
    rackPins(false);
    standingBefore = 10;
    resetBall();
    overlay.hidden = true;
    state = 'aim';
    hudSpeed.textContent = '';
    renderSheet();
    updateHud();
  }

  function throwBall(speed, angle, spin) {
    if (state !== 'aim') return;
    initAudio();
    aimAngle = angle;
    hook = spin;
    ballBody.position.set(ballX, BALL_R, START_Z);
    ballBody.velocity.set(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed);
    // 転がりながら手を離れる (すべるだけだと摩擦で一気に遅くなる)
    ballBody.angularVelocity.set(-speed / BALL_R, 0, -spin * 6);
    throwTime = world.time;
    ballDoneAt = 0;
    standingBefore = countStanding();
    state = 'rolling';
    hudSpeed.textContent = `${(speed * 3.6).toFixed(1)} km/h`;
    hintEl.textContent = '';
    powerEl.hidden = true;
  }

  // ---- スコア計算 ----
  function scoreFrames() {
    const rolls = frames.flat();
    const totals = [];
    let r = 0;
    let sum = 0;
    for (let f = 0; f < 10; f++) {
      const fr = frames[f];
      if (!fr || fr.length === 0) break;
      if (f < 9) {
        if (fr[0] === 10) {
          if (rolls.length < r + 3) break;
          sum += 10 + rolls[r + 1] + rolls[r + 2];
          r += 1;
        } else {
          if (fr.length < 2) break;
          if (fr[0] + fr[1] === 10) {
            if (rolls.length < r + 3) break;
            sum += 10 + rolls[r + 2];
          } else {
            sum += fr[0] + fr[1];
          }
          r += 2;
        }
      } else {
        if (!frameDone(9)) break;
        sum += fr.reduce((a, b) => a + b, 0);
      }
      totals.push(sum);
    }
    return totals;
  }

  function frameDone(f) {
    const fr = frames[f] || [];
    if (f < 9) return fr[0] === 10 || fr.length === 2;
    if (fr.length < 2) return false;
    if (fr.length === 3) return true;
    return fr[0] + fr[1] < 10;
  }

  // 投げた本数を記号にする (X / - 数字)
  function rollMarks(f) {
    const fr = frames[f] || [];
    const marks = [];
    if (f < 9) {
      if (fr[0] === 10) return ['', 'X'];
      marks.push(fr.length > 0 ? digit(fr[0]) : '');
      marks.push(fr.length > 1 ? (fr[0] + fr[1] === 10 ? '/' : digit(fr[1])) : '');
      return marks;
    }
    for (let i = 0; i < 3; i++) {
      if (i >= fr.length) { marks.push(''); continue; }
      const v = fr[i];
      // 直前の投球が新しいラックでなければ、合わせて10本でスペア
      const freshRack = i === 0 || (i === 1 && fr[0] === 10) || (i === 2 && (fr[1] === 10 || fr[0] + fr[1] === 10) && !(fr[0] === 10 && fr[1] < 10));
      if (!freshRack && fr[i - 1] + v === 10) marks.push('/');
      else if (v === 10) marks.push('X');
      else marks.push(digit(v));
    }
    return marks;
  }
  const digit = (v) => (v === 0 ? '-' : String(v));

  function renderSheet() {
    const totals = scoreFrames();
    let html = '';
    for (let f = 0; f < 10; f++) {
      const marks = rollMarks(f);
      const now = state !== 'over' && state !== 'title' && f === frameIndex;
      html += `<div class="frame${f === 9 ? ' frame-10' : ''}${now ? ' is-now' : ''}">`;
      html += `<span class="frame-no">${f + 1}</span><div class="frame-rolls">`;
      marks.forEach((m, i) => {
        const cls = m === 'X' || m === '/' ? 'is-mark' : splits[`${f}-${i}`] ? 'is-split' : '';
        html += `<span class="${cls}">${m}</span>`;
      });
      html += `</div><span class="frame-total">${totals[f] ?? ''}</span></div>`;
    }
    const total = totals.length ? totals[totals.length - 1] : 0;
    html += `<div class="frame frame-sum"><span class="frame-no">TOTAL</span><span class="frame-total">${total}</span></div>`;
    sheetEl.innerHTML = html;
  }

  function updateHud() {
    const fr = frames[frameIndex] || [];
    hudFrame.textContent = `FRAME ${frameIndex + 1} · ${fr.length + 1}投目`;
    if (state === 'aim') {
      const touch = matchMedia('(pointer: coarse)').matches;
      hintEl.textContent = touch ? '左右になぞって位置合わせ、上にスワイプで投球' : 'ドラッグで位置合わせ、上へはじいて投球 (キーボードも使えます)';
    }
  }

  function showCallout(main, sub) {
    calloutEl.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
    calloutEl.classList.add('is-shown');
  }
  const hideCallout = () => calloutEl.classList.remove('is-shown');

  // スプリット: 1番ピンが倒れていて、残ったピンが2つ以上のかたまりに分かれている
  function isSplit(standingNos) {
    if (standingNos.includes(1) || standingNos.length < 2) return false;
    const near = (a, b) => {
      const pa = PIN_SPOTS[a - 1];
      const pb = PIN_SPOTS[b - 1];
      const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
      // となり合うピン、または真後ろに隠れたピン (2-8, 3-9 など)
      return d < PIN_SPACING * 1.05 || (Math.abs(pa.x - pb.x) < 0.01 && d < ROW_DZ * 2.1);
    };
    const seen = new Set([standingNos[0]]);
    const queue = [standingNos[0]];
    while (queue.length) {
      const a = queue.shift();
      for (const b of standingNos) {
        if (!seen.has(b) && near(a, b)) { seen.add(b); queue.push(b); }
      }
    }
    return seen.size < standingNos.length;
  }

  function finishRoll() {
    state = 'result';
    if (rumble) rumble.gain.setTargetAtTime(0, audio.currentTime, 0.05);
    const standing = pins.filter(isStanding);
    const knocked = standingBefore - standing.length;
    const fr = frames[frameIndex];
    fr.push(knocked);
    const rollNo = fr.length - 1;
    const freshRack = standingBefore === 10;
    const split = freshRack && knocked < 10 && isSplit(standing.map((p) => p.no));
    if (split) splits[`${frameIndex}-${rollNo}`] = true;

    let main;
    let sub = '';
    if (freshRack && knocked === 10) {
      main = 'STRIKE!';
      const prev = frames[frameIndex - 1];
      if (frameIndex === 9 && rollNo > 0 && fr[rollNo - 1] === 10) sub = rollNo === 2 ? 'TURKEY' : 'DOUBLE';
      else if (prev && prev[0] === 10 && rollNo === 0) sub = frames[frameIndex - 2] && frames[frameIndex - 2][0] === 10 ? 'TURKEY' : 'DOUBLE';
    } else if (!freshRack && standing.length === 0) {
      main = 'SPARE!';
    } else if (knocked === 0) {
      main = inGutter ? 'GUTTER' : 'MISS';
    } else {
      main = `${knocked}<small>${split ? 'SPLIT · ' : ''}${knocked}本倒れた</small>`;
    }
    showCallout(main, sub);
    renderSheet();

    nextTimer = setTimeout(() => {
      hideCallout();
      advance();
    }, 1700);
  }

  function advance() {
    const fr = frames[frameIndex];
    if (frameIndex < 9) {
      if (frameDone(frameIndex)) {
        frameIndex++;
        frames.push([]);
        rackPins(false);
      } else {
        clearFallen();
        rackPins(true);
      }
    } else if (frameDone(9)) {
      gameOver();
      return;
    } else {
      // 10フレーム目: ストライクかスペアのあとは新しいラック
      const last = fr[fr.length - 1];
      const spare = fr.length === 2 && fr[0] < 10 && fr[0] + fr[1] === 10;
      if ((last === 10 && countStanding() === 0) || spare) {
        rackPins(false);
      } else {
        clearFallen();
        rackPins(true);
      }
    }
    standingBefore = countStanding();
    resetBall();
    state = 'aim';
    renderSheet();
    updateHud();
  }

  function gameOver() {
    state = 'over';
    const totals = scoreFrames();
    const total = totals[9] ?? 0;
    const best = Math.max(total, Number(store.get('bowling-best')) || 0);
    store.set('bowling-best', String(best));
    renderSheet();
    hudFrame.textContent = '';
    hintEl.textContent = '';
    titleScreen.hidden = false;
    overlayText.innerHTML = `スコア<strong>${total}</strong>${total === 300 ? 'パーフェクトゲーム!' : total >= 200 ? 'すばらしい! 200点越え' : ''}`;
    startBtn.textContent = 'もう一度あそぶ';
    bestEl.textContent = `ベストスコア ${best}`;
    overlay.hidden = false;
  }

  // =====================================================================
  // 入力
  // =====================================================================
  let gesture = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'aim') return;
    canvas.setPointerCapture(e.pointerId);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, startX: ballX, mode: 'idle', pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || state !== 'aim') return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    gesture.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (gesture.pts.length > 80) gesture.pts.shift();
    if (gesture.mode === 'idle') {
      if (dy < -16 && -dy > Math.abs(dx)) {
        gesture.mode = 'throw';
      } else if (Math.abs(dx) > 8) {
        gesture.mode = 'move';
      }
    }
    if (gesture.mode === 'move') {
      ballX = clamp(gesture.startX + (dx / canvas.clientWidth) * 1.4, -BALL_X_MAX, BALL_X_MAX);
      ballBody.position.x = ballX;
    }
    if (gesture.mode === 'throw') {
      aimAngle = swipeAngle(gesture.pts);
    }
  });

  function swipeAngle(pts) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a.y - b.y < 10) return aimAngle;
    return clamp(Math.atan2(b.x - a.x, a.y - b.y) * 0.13, -MAX_ANGLE, MAX_ANGLE);
  }

  function endGesture(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (g.mode !== 'throw' || state !== 'aim') return;
    const pts = g.pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a.y - b.y < 40) return;
    // はじく速さは最後の 120ms で測る
    let k = pts.length - 1;
    while (k > 0 && b.t - pts[k - 1].t < 120) k--;
    const p = pts[k];
    const dt = Math.max(b.t - p.t, 16);
    const v = Math.hypot(b.x - p.x, b.y - p.y) / dt * 1000 / canvas.clientHeight; // 画面の高さ / 秒
    const speed = clamp(3.4 + v * 1.6, MIN_SPEED, MAX_SPEED);
    // 弧を描いたスワイプ: 最後の向きが全体の向きよりどちらに曲がったか
    const chord = Math.atan2(b.x - a.x, a.y - b.y);
    const tailFrom = pts[Math.floor(pts.length * 0.65)];
    const tail = Math.atan2(b.x - tailFrom.x, tailFrom.y - b.y + 0.001);
    const spin = pts.length > 5 ? clamp((tail - chord) * 2.2, -1, 1) : 0;
    throwBall(speed, swipeAngle(pts), spin);
  }
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', (e) => { if (gesture && e.pointerId === gesture.id) gesture = null; });

  // キーボード
  const keys = new Set();
  let charging = false;
  let power = 0;
  let powerDir = 1;
  window.addEventListener('keydown', (e) => {
    // ボタンやリンクにフォーカスがあるときは、そちらの操作に任せる
    if (e.target.closest && e.target.closest('button, a')) return;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key) && state !== 'title' && state !== 'over') e.preventDefault();
    if ((e.key === 'Enter' || e.key === ' ') && !overlay.hidden) {
      e.preventDefault();
      startBtn.click();
      return;
    }
    if (state !== 'aim') return;
    keys.add(e.key.toLowerCase());
    const k = e.key.toLowerCase();
    if (k === 'a') aimAngle = clamp(aimAngle - 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'd') aimAngle = clamp(aimAngle + 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'q') hook = clamp(Math.round((hook - 0.25) * 4) / 4, -1, 1);
    if (k === 'e') hook = clamp(Math.round((hook + 0.25) * 4) / 4, -1, 1);
    if (['a', 'd', 'q', 'e'].includes(k)) showAimHud();
    if (e.key === ' ' && !charging && !e.repeat) {
      initAudio();
      charging = true;
      power = 0;
      powerDir = 1;
      powerEl.hidden = false;
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === ' ' && charging) {
      charging = false;
      powerEl.hidden = true;
      if (state === 'aim') throwBall(MIN_SPEED + (MAX_SPEED - MIN_SPEED) * power, aimAngle, hook);
    }
  });

  function showAimHud() {
    const deg = (aimAngle * 180 / Math.PI).toFixed(1);
    const hookText = hook === 0 ? 'なし' : `${hook < 0 ? '左' : '右'} ${Math.abs(hook) * 100}%`;
    hudSpeed.textContent = `向き ${deg}° · カーブ ${hookText}`;
  }

  startBtn.addEventListener('click', () => {
    clearTimeout(nextTimer);
    hideCallout();
    initAudio();
    startBtn.blur();
    startGame();
  });

  // =====================================================================
  // ループ
  // =====================================================================
  const tmpV = new THREE.Vector3();
  const focus = new THREE.Vector3();

  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面ではレーン全体が入るように画角を広げる
    camera.fov = w / h < 0.75 ? 52 : 44;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // オイルの薄い奥のほうで、回転の向きに曲がる (力は物理の1ステップごとに消えるので毎ステップかける)
  const hookForce = new CANNON.Vec3();
  world.addEventListener('preStep', () => {
    const bp = ballBody.position;
    if (!inGutter && Math.abs(bp.x) > LANE_HALF + 0.01 && bp.z > HEAD_Z) inGutter = true;
    if (state !== 'rolling' || inGutter || bp.z > OIL_END_Z || bp.z < HEAD_Z + 0.3 || bp.y < 0) return;
    hookForce.set(hook * HOOK_FORCE * clamp((OIL_END_Z - bp.z) / 4, 0, 1), 0, 0);
    ballBody.applyForce(hookForce, bp);
  });

  function updatePhysics(dt) {
    if (state === 'rolling' || state === 'result') world.step(1 / 240, dt, 10);
  }

  // 時間は物理の時計 (world.time) で測る。描画が遅い端末でも判定がずれないように
  function updateGame(dt) {
    if (state === 'aim') {
      ballBody.position.set(ballX, BALL_R, START_Z);
      if (keys.has('arrowleft')) ballX = clamp(ballX - dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
      if (keys.has('arrowright')) ballX = clamp(ballX + dt * 0.7, -BALL_X_MAX, BALL_X_MAX);
      if (charging) {
        power += powerDir * dt * 0.9;
        if (power >= 1) { power = 1; powerDir = -1; }
        if (power <= 0) { power = 0; powerDir = 1; }
        powerFill.style.height = `${power * 100}%`;
      }
    }
    if (state === 'rolling') {
      const bp = ballBody.position;
      const now = world.time;
      const t = now - throwTime;
      const speed = ballBody.velocity.length();
      if (rumble && audio) {
        const onLane = bp.y > 0 && bp.y < 0.2 && bp.z > DECK_END;
        rumble.gain.setTargetAtTime(onLane ? clamp(speed / 10, 0, 1) * 0.35 : 0, audio.currentTime, 0.05);
      }
      const ballDone = bp.y < -0.15 || bp.z < DECK_END - 0.1 || (speed < 0.2 && t > 1.5);
      if (ballDone && !ballDoneAt) ballDoneAt = now;
      const quiet = pins.every((p) => !p.active || p.body.sleepState === CANNON.Body.SLEEPING
        || (p.body.velocity.length() < 0.06 && p.body.angularVelocity.length() < 0.4));
      const since = ballDoneAt ? now - ballDoneAt : 0;
      if ((ballDoneAt && ((quiet && since > 0.9) || since > 4)) || t > 14) finishRoll();
    }
  }

  function updateCamera(dt) {
    const bp = ballBody.position;
    if (state === 'title' || state === 'over') {
      const t = performance.now() / 1000;
      tmpV.set(Math.sin(t * 0.25) * 0.6, 1.1, HEAD_Z + 6.5);
      focus.set(0, 0.2, HEAD_Z - 0.3);
    } else if (state === 'aim') {
      tmpV.set(ballX * 0.6, 1.25, START_Z + 2.4);
      focus.set(ballX * 0.25, 0, -12);
    } else if (state === 'rolling' && bp.z > HEAD_Z + 5) {
      const near = clamp((-bp.z) / -HEAD_Z, 0, 1);
      tmpV.set(bp.x * 0.5, 1.25 - near * 0.4, bp.z + 2.4);
      focus.set(bp.x * 0.3, 0.05, Math.min(bp.z - 9, HEAD_Z));
    } else {
      tmpV.set(0, 1.0, HEAD_Z + 3.2);
      focus.set(0, 0.15, HEAD_Z - 0.4);
    }
    const k = 1 - Math.exp(-dt * (state === 'rolling' ? 7 : 3));
    camPos.lerp(tmpV, k);
    camLook.lerp(focus, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // 影のライトは、ボールかピンのどちらか近いほうに合わせる
    const fz = state === 'rolling' && bp.z > HEAD_Z + 1.5 ? bp.z : HEAD_Z - 0.4;
    const fx = state === 'rolling' && bp.z > HEAD_Z + 1.5 ? bp.x : 0;
    sun.position.set(fx + 1.2, 5, fz + 2);
    sun.target.position.set(fx, 0, fz);
  }

  function updateAimLine() {
    aimLine.visible = state === 'aim';
    if (!aimLine.visible) return;
    aimLine.children.forEach((d, i) => {
      const dist = 0.45 + i * 0.32;
      d.position.set(ballX + Math.sin(aimAngle) * dist, 0.003, START_Z - Math.cos(aimAngle) * dist);
      d.material.opacity = 0.85;
      d.scale.setScalar(1 - i / 40);
    });
  }

  function sync() {
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
    for (const p of pins) {
      if (!p.active) continue;
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
      // ピットに落ちて見えなくなったピンは止めておく
      if (p.body.position.y < -1.5) {
        p.body.velocity.setZero();
        p.body.sleep();
      }
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    updateGame(dt);
    updatePhysics(dt);
    sync();
    updateCamera(dt);
    updateAimLine();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // タイトル画面の後ろにもピンを並べておく
  rackPins(false);
  resetBall();
  const best = Number(store.get('bowling-best')) || 0;
  if (best) bestEl.textContent = `ベストスコア ${best}`;
  renderSheet();
  requestAnimationFrame(loop);
})();
