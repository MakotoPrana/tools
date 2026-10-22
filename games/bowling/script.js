/*
 * STRIKE LANE: 仕掛けのあるレーンでトリックショットを決める 3D ボウリング
 *   描画は three.js、ピンとボールの動きは cannon.js の物理演算。
 *   ステージは全10。2投までにピンを全部倒すとクリア (1投ならストライク、2投ならスペア)。
 *   長さの単位はメートル。ファウルラインが z = 0 で、ピンは -z の方向 (奥) にある。
 */
(() => {
  'use strict';

  const errorEl = document.getElementById('load-error');
  if (!window.THREE || !window.CANNON) {
    errorEl.hidden = false;
    document.getElementById('start-btn').disabled = true;
    document.getElementById('menu-btn').disabled = true;
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
  const HOOK_START_Z = -5;                 // ここより奥はオイルが薄く、カーブがかかり始める
  const HOOK_RAMP = 3;                     // カーブの力が最大になるまでの距離

  const MIN_SPEED = 4.5;                   // m/s
  const MAX_SPEED = 10.5;
  const MAX_ANGLE = 0.05;                  // rad
  const SWIPE_MIN = 0.12;                  // この長さ (画面の高さに対する割合) 以下は最も遅い球
  const SWIPE_MAX = 0.7;                   // この長さ以上は最も速い球
  const TRAIL_HOLD_MS = 700;               // スワイプの線を見せてから投げるまで
  const HOOK_FORCE = 11;                   // N (カーブ最大のときの横向きの力)
  const TREASURE_REACH = 0.2;              // ボールの中心からこの距離で宝物を取る
  const LANE_GROUP = 2;                    // 落とし穴に落ちたボールは、この組の物 (レーン) をすり抜ける

  // ---- DOM ----
  const canvas = document.getElementById('board');
  const wrap = document.getElementById('board-wrap');
  const stageNoEl = document.getElementById('stage-no');
  const stageNameEl = document.getElementById('stage-name');
  const stageGoalEl = document.getElementById('stage-goal');
  const retryBtn = document.getElementById('retry-btn');
  const menuBtn = document.getElementById('menu-btn');
  const hudTreasure = document.getElementById('hud-treasure');
  const toastEl = document.getElementById('toast');
  const hudFrame = document.getElementById('hud-frame');
  const hudSpeed = document.getElementById('hud-speed');
  const hintEl = document.getElementById('hint');
  const calloutEl = document.getElementById('callout');
  const overlay = document.getElementById('overlay');
  const screens = {
    title: document.getElementById('screen-title'),
    select: document.getElementById('screen-select'),
    result: document.getElementById('screen-result'),
  };
  const startBtn = document.getElementById('start-btn');
  const progressEl = document.getElementById('progress');
  const gridEl = document.getElementById('stage-grid');
  const selectBack = document.getElementById('select-back');
  const resultTitle = document.getElementById('result-title');
  const resultStage = document.getElementById('result-stage');
  const resultText = document.getElementById('result-text');
  const resultActions = document.getElementById('result-actions');
  const powerEl = document.getElementById('power');
  const powerFill = document.getElementById('power-fill');
  const soundBtn = document.getElementById('sound-btn');
  const trailEl = document.getElementById('trail');

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

  // ---- ステージの仕掛けの見た目 ----
  function stripeTexture(c1, c2, arrow) {
    const tex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = c1;
      g.fillRect(0, 0, w, h);
      g.fillStyle = c2;
      if (arrow) {
        // 奥へ向かう山形 (ジャンプ台の向き)
        for (let y = -64; y < h + 64; y += 64) {
          g.beginPath();
          g.moveTo(0, y + 64);
          g.lineTo(w / 2, y + 20);
          g.lineTo(w, y + 64);
          g.lineTo(w, y + 88);
          g.lineTo(w / 2, y + 44);
          g.lineTo(0, y + 88);
          g.closePath();
          g.fill();
        }
      } else {
        for (let i = -h; i < w; i += 32) {
          g.beginPath();
          g.moveTo(i, h);
          g.lineTo(i + 16, h);
          g.lineTo(i + 16 + h, 0);
          g.lineTo(i + h, 0);
          g.closePath();
          g.fill();
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const rampTex = stripeTexture('#2a2338', '#ffc24a', true);
  const hazardTex = stripeTexture('#1b1d21', '#f7d308', false);
  const rampSideMat = new THREE.MeshPhongMaterial({ color: 0x2a2338, shininess: 30 });
  const wallMat = new THREE.MeshPhongMaterial({ color: 0x6c4bd8, emissive: 0x1d1240, shininess: 60 });
  const moverMat = new THREE.MeshPhongMaterial({ map: hazardTex, emissive: 0x2a1a00, shininess: 40 });
  const deflectMat = new THREE.MeshPhongMaterial({ color: 0x2ec4b6, emissive: 0x0b3a36, shininess: 120 });
  const railMat = new THREE.MeshPhongMaterial({ color: 0xe8492f, emissive: 0x3a0d06, shininess: 90 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x030306 });
  const rimMat = new THREE.MeshBasicMaterial({ map: hazardTex });

  const haloTex = canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });

  function starGeometry() {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.035 : 0.08;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      shape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
    geo.center();
    return geo;
  }
  const TREASURE_GEO = {
    coin: new THREE.CylinderGeometry(0.07, 0.07, 0.016, 28).rotateX(Math.PI / 2),
    gem: new THREE.OctahedronGeometry(0.07).scale(1, 1.35, 1),
    pin: pinGeo.clone().scale(0.42, 0.42, 0.42),
    star: starGeometry(),
  };

  // =====================================================================
  // 物理 (cannon.js)
  // =====================================================================
  const STEP = 1 / 240;
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
    rail: new CANNON.Material('rail'),
  };
  const contact = (a, b, friction, restitution) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
  contact(M.ball, M.lane, 0.05, 0.02);
  contact(M.pin, M.lane, 0.35, 0.15);
  contact(M.ball, M.pin, 0.12, 0.3);
  contact(M.pin, M.pin, 0.2, 0.5);
  contact(M.pin, M.wall, 0.2, 0.35);
  contact(M.ball, M.wall, 0.1, 0.15);
  // 反射板とバンパーはよく跳ね返す
  contact(M.ball, M.rail, 0.02, 0.75);
  contact(M.pin, M.rail, 0.2, 0.6);

  function staticBox(material, hx, hy, hz, x, y, z) {
    const body = new CANNON.Body({ mass: 0, material });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(x, y, z);
    world.addBody(body);
    return body;
  }
  // レーン (上面が y = 0)。落とし穴に落ちたボールだけすり抜けられるよう、組を分けておく
  const laneZ0 = 3;
  staticBox(M.lane, LANE_HALF, 0.15, (laneZ0 - DECK_END) / 2, 0, -0.15, (laneZ0 + DECK_END) / 2).collisionFilterGroup = LANE_GROUP;
  // 手前のアプローチ (ガターの上もふさぐ)
  staticBox(M.lane, WALL_X, 0.15, 1.35, 0, -0.15, 1.35);
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
  // ステージごとに本数が変わるので、多めに作っておいて使う分だけ並べる
  const MAX_PINS = 12;
  const pins = [];
  for (let i = 0; i < MAX_PINS; i++) {
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
    mesh.visible = false;
    scene.add(mesh);
    pins.push({ body, mesh, active: false, used: false, home: { x: 0, z: 0 }, baseY: 0 });
  }

  // =====================================================================
  // ステージ
  // =====================================================================
  const PIN = (n) => ({ x: PIN_SPOTS[n - 1].x, z: PIN_SPOTS[n - 1].z });
  const rack = (...nos) => nos.map(PIN);
  const deg = (d) => (d * Math.PI) / 180;

  // 座標: x は右が +、z はファウルラインが 0 で奥が - (1番ピンは z = -18.29)
  //   ramps:     ジャンプ台・坂。z は手前の端、len は斜面の長さ、angle は傾き (度)
  //   holes:     落とし穴 (r で丸、w と d で四角い谷)
  //   blocks:    壁。rotY で斜めに置ける。bouncy なら反射板
  //   movers:    左右に動く壁。range の幅を period 秒で往復する
  //   platforms: ピンを乗せる台
  //   rails:     ガターをふさぐバンパー
  const STAGES = [
    {
      name: 'はじめの一投',
      goal: '3本のピンを倒そう。宝物はレーンの左に浮かんでいる',
      startX: 0,
      pins: rack(1, 2, 3),
      treasure: { x: -0.3, y: 0.16, z: -7, name: '銅のコイン', shape: 'coin', color: 0xd27d46 },
    },
    {
      name: 'たて一列',
      goal: '一列に並んだピン。宝物を取るなら右から投げて、カーブで真ん中へ戻そう',
      startX: 0.3,
      pins: [
        { x: 0, z: HEAD_Z + 0.4 }, { x: 0, z: HEAD_Z }, { x: 0, z: HEAD_Z - 0.39 }, { x: 0, z: HEAD_Z - 0.78 },
      ],
      treasure: { x: 0.35, y: 0.16, z: -9.5, name: '銀のコイン', shape: 'coin', color: 0xd9dee6 },
    },
    {
      name: 'ジャンプ台',
      goal: '壁はジャンプで飛び越えよう。宝物は高いところ。速い球ほど高く飛ぶ',
      startX: 0,
      pins: rack(1, 2, 3, 4, 5, 6),
      ramps: [{ x: 0, z: -11.5, w: LANE_W, len: 1.2, angle: 12 }],
      blocks: [{ x: 0, z: -13.7, w: WALL_X * 2, d: 0.12, h: 0.16 }],
      treasure: { x: 0, y: 0.6, z: -14.6, name: '金のコイン', shape: 'coin', color: 0xffc83a },
    },
    {
      name: '落とし穴',
      goal: '穴をよけてカーブで抜けよう。落ちたらその投球はおしまい',
      startX: 0.28,
      pins: rack(1, 2, 3, 5),
      holes: [
        { x: 0, z: -9, r: 0.24 },
        { x: 0.4, z: -13.5, r: 0.17 },
        { x: -0.4, z: -13.5, r: 0.17 },
      ],
      treasure: { x: 0.3, y: 0.16, z: -11.5, name: 'エメラルド', shape: 'gem', color: 0x2fd27a },
    },
    {
      name: 'スラローム',
      goal: '左カーブで2つの壁をよけよう。ピンはレーンの途中に立っている',
      startX: 0.4,
      pins: [{ x: -0.3, z: -15.7 }, { x: -0.45, z: -16 }, { x: -0.15, z: -16 }, { x: -0.3, z: -16.3 }],
      blocks: [
        { x: -0.2, z: -8, w: 0.66, d: 0.15, h: 0.25 },
        { x: 0.36, z: -13, w: 0.34, d: 0.15, h: 0.25 },
      ],
      treasure: { x: 0.42, y: 0.16, z: -10.5, name: 'サファイア', shape: 'gem', color: 0x3a7bff },
    },
    {
      name: '動く壁',
      goal: '左右に動く壁のすきまを通して、10本のストライクを狙え',
      startX: 0.15,
      pins: rack(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
      movers: [{ x: 0, z: -13, w: 0.42, d: 0.15, h: 0.3, range: 0.34, period: 2.4 }],
      treasure: { x: 0, y: 0.16, z: -15.6, name: 'ルビー', shape: 'gem', color: 0xff3b5c },
    },
    {
      name: 'ピンの島',
      goal: 'ピンは高い台の上。真ん中の坂を登らないと届かない',
      startX: 0,
      pins: rack(1, 2, 3, 4, 5, 6).map((p) => ({ ...p, y: 0.12 })),
      platforms: [{ x: 0, z: HEAD_Z + 0.015, w: LANE_W, d: 1.77, h: 0.12 }],
      ramps: [{ x: 0, z: HEAD_Z + 0.9 + 0.9 * Math.cos(Math.asin(0.12 / 0.9)), w: 0.42, len: 0.9, angle: Math.asin(0.12 / 0.9) * 180 / Math.PI }],
      treasure: { x: 0.36, y: 0.16, z: -9, name: 'アメジスト', shape: 'gem', color: 0xb05cff },
    },
    {
      name: '谷越え',
      goal: '左のジャンプ台で谷を飛び越えろ。右の宝物は、谷に落ちる覚悟で',
      startX: -0.25,
      pins: rack(2, 4, 7, 8),
      ramps: [{ x: -0.25, z: -11, w: 0.36, len: 1.0, angle: 13 }],
      holes: [{ x: 0, z: -13.5, w: LANE_W + 0.02, d: 1.6 }],
      treasure: { x: 0.3, y: 0.16, z: -12.2, name: 'ダイヤモンド', shape: 'gem', color: 0xe6f6ff },
    },
    {
      name: 'ピンボール',
      goal: 'ピンは壁の裏。右はしをまっすぐ投げて、反射板で横から倒せ',
      startX: 0.4,
      pins: [{ x: 0.17, z: HEAD_Z + 0.6 }, { x: -0.05, z: HEAD_Z + 0.6 }, { x: -0.27, z: HEAD_Z + 0.6 }],
      blocks: [
        { x: -0.14, z: HEAD_Z + 1.1, w: 0.78, d: 0.1, h: 0.32 },
        { x: 0.43, z: HEAD_Z + 0.45, w: 0.36, d: 0.05, h: 0.3, rotY: -Math.PI / 4, bouncy: true },
      ],
      treasure: { x: -0.47, y: 0.15, z: HEAD_Z + 0.6, name: '金のピン', shape: 'pin', color: 0xffc83a },
    },
    {
      name: 'グランドフィナーレ',
      goal: 'ジャンプ台、落とし穴、動く壁。全部こえて7本を倒せ',
      startX: 0,
      pins: [{ x: 0, z: HEAD_Z + 0.6 }, ...rack(1, 2, 3, 4, 5, 6)],
      ramps: [{ x: 0, z: -7.5, w: 0.5, len: 1.0, angle: 12 }],
      holes: [{ x: -0.3, z: -10.5, r: 0.17 }, { x: 0.3, z: -10.5, r: 0.17 }],
      movers: [{ x: 0, z: -15, w: 0.34, d: 0.12, h: 0.28, range: 0.32, period: 2.2 }],
      treasure: { x: 0, y: 0.55, z: -9.4, name: '王者の星', shape: 'star', color: 0xffd25e },
    },
  ];

  const stageGroup = new THREE.Group();
  scene.add(stageGroup);
  let stageBodies = [];
  let holes = [];
  let movers = [];
  let treasure = null;
  let moverClock = 0;

  function addStatic(body) {
    world.addBody(body);
    stageBodies.push(body);
    return body;
  }

  function addMesh(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stageGroup.add(mesh);
    return mesh;
  }

  function clearStage() {
    for (const b of stageBodies) world.remove(b);
    stageBodies = [];
    stageGroup.traverse((o) => {
      if (o.geometry && o.geometry !== pinGeo && !Object.values(TREASURE_GEO).includes(o.geometry)) o.geometry.dispose();
    });
    stageGroup.clear();
    holes = [];
    movers = [];
    treasure = null;
  }

  // 斜面: 手前の端がレーンの面 (y = 0) にそろうように、傾けた板を置く
  function addRamp(r) {
    const th = deg(r.angle);
    const t = 0.02;
    const top = new THREE.Vector3(r.x, (r.len / 2) * Math.sin(th), r.z - (r.len / 2) * Math.cos(th));
    const n = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
    const c = top.addScaledVector(n, -t);
    const body = new CANNON.Body({ mass: 0, material: M.lane });
    body.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, t, r.len / 2)));
    body.position.set(c.x, c.y, c.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), th);
    addStatic(body);

    const tex = rampTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(r.w / 0.35)), r.len / 0.35);
    const topMat = new THREE.MeshPhongMaterial({ map: tex, shininess: 50 });
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, t * 2, r.len), [rampSideMat, rampSideMat, topMat, rampSideMat, rampSideMat, rampSideMat]));
    mesh.position.copy(c);
    mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th);

    // 奥の端を支える柱
    const h = r.len * Math.sin(th);
    const zBack = r.z - r.len * Math.cos(th);
    if (h > 0.05) {
      const support = new CANNON.Body({ mass: 0, material: M.wall });
      support.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, (h - 0.02) / 2, 0.02)));
      support.position.set(r.x, (h - 0.02) / 2, zBack + 0.03);
      addStatic(support);
      const leg = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, h - 0.02, 0.04), rampSideMat));
      leg.position.set(r.x, (h - 0.02) / 2, zBack + 0.03);
    }
  }

  function addBlock(b, kind) {
    const body = new CANNON.Body({
      mass: 0,
      material: b.bouncy ? M.rail : kind === 'platform' ? M.lane : M.wall,
      type: kind === 'mover' ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2)));
    body.position.set(b.x, b.h / 2, b.z);
    if (b.rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), b.rotY);
    addStatic(body);

    let mat = wallMat;
    if (b.bouncy) mat = deflectMat;
    if (kind === 'mover') mat = moverMat;
    if (kind === 'platform') mat = [rampSideMat, rampSideMat, deckMat, rampSideMat, rampSideMat, rampSideMat];
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat));
    mesh.position.set(b.x, b.h / 2, b.z);
    if (b.rotY) mesh.rotation.y = b.rotY;
    if (kind === 'mover') movers.push({ def: b, body, mesh });
  }

  function addHole(h) {
    holes.push(h);
    if (h.r) {
      const disc = addMesh(new THREE.Mesh(new THREE.CircleGeometry(h.r, 36), holeMat));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(h.x, 0.0015, h.z);
      const rim = addMesh(new THREE.Mesh(new THREE.RingGeometry(h.r, h.r + 0.022, 36), rimMat));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(h.x, 0.0016, h.z);
    } else {
      const pit = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(h.w, h.d), holeMat));
      pit.rotation.x = -Math.PI / 2;
      pit.position.set(h.x, 0.0015, h.z);
      for (const side of [-1, 1]) {
        const edge = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(h.w, 0.04), rimMat));
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(h.x, 0.0016, h.z + side * (h.d / 2 + 0.02));
      }
    }
  }

  function addRail(r) {
    const len = r.z1 - r.z2;
    const x = r.side * (LANE_HALF + 0.04);
    const body = new CANNON.Body({ mass: 0, material: M.rail });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.04, 0.13, len / 2)));
    body.position.set(x, 0.01, (r.z1 + r.z2) / 2);
    addStatic(body);
    const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, len), railMat));
    mesh.position.set(x, 0.01, (r.z1 + r.z2) / 2);
  }

  function addTreasure(t, owned) {
    const mat = new THREE.MeshPhongMaterial({
      color: t.color,
      emissive: new THREE.Color(t.color).multiplyScalar(0.35),
      specular: 0xffffff,
      shininess: 140,
      transparent: true,
      opacity: owned ? 0.4 : 1,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(TREASURE_GEO[t.shape], mat);
    if (t.shape === 'pin') mesh.position.y = -0.02;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: t.color, transparent: true, opacity: owned ? 0.25 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.42);
    group.add(halo, mesh);
    group.position.set(t.x, t.y, t.z);
    stageGroup.add(group);
    treasure = { def: t, group, mesh, halo, taken: false, owned, burst: 0 };
  }

  function setMovers(withVelocity) {
    for (const m of movers) {
      const w = (Math.PI * 2) / m.def.period;
      m.body.position.x = m.def.x + m.def.range * Math.sin(moverClock * w);
      m.body.velocity.x = withVelocity ? m.def.range * w * Math.cos(moverClock * w) : 0;
    }
  }

  function buildStage(st) {
    clearStage();
    (st.ramps || []).forEach(addRamp);
    (st.blocks || []).forEach((b) => addBlock(b, 'block'));
    (st.platforms || []).forEach((b) => addBlock(b, 'platform'));
    (st.movers || []).forEach((b) => addBlock(b, 'mover'));
    (st.holes || []).forEach(addHole);
    (st.rails || []).forEach(addRail);
    moverClock = 0;
    setMovers(false);
  }

  function inHole(h, x, z) {
    const m = 0.03; // ボールの中心が少し入りこんだら落ちる
    if (h.r) return Math.hypot(x - h.x, z - h.z) < h.r - m;
    return Math.abs(x - h.x) < h.w / 2 - m && Math.abs(z - h.z) < h.d / 2 - m;
  }

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

  // 宝物を取ったときのきらきら音
  function chime() {
    if (!audio || !soundOn) return;
    const now = audio.currentTime;
    [1318.5, 1760, 2637].forEach((f, i) => {
      const o = audio.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = audio.createGain();
      g.gain.setValueAtTime(0.0001, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
      o.connect(g).connect(audio.destination);
      o.start(now + i * 0.07);
      o.stop(now + i * 0.07 + 0.4);
    });
  }

  // =====================================================================
  // ゲームの進行
  // =====================================================================
  // state: title / select → preview (レーン全体を見せる) → aim → windup → rolling → result
  //        → (2投目: aim …) → done (結果画面)
  let state = 'title';
  let stageIndex = 0;
  let roll = 1;
  let ballX = 0;
  let aimAngle = 0;
  let hook = 0;
  let throwTime = 0;
  let ballDoneAt = 0;
  let inGutter = false;
  let ballFell = false;
  let standingBefore = 0;
  let previewUntil = 0;
  const PREVIEW_MS = 2800;
  let nextTimer = 0;
  let throwTimer = 0;
  let toastTimer = 0;

  // 進み具合: ステージごとに { best: 'strike' | 'spare', treasure: true }
  let progress = [];
  try {
    progress = JSON.parse(store.get('strike-lane-progress')) || [];
  } catch (e) {
    progress = [];
  }
  if (!Array.isArray(progress)) progress = [];
  const saveProgress = () => store.set('strike-lane-progress', JSON.stringify(progress));
  const stageProgress = (i) => progress[i] || (progress[i] = {});
  const isUnlocked = (i) => i === 0 || Boolean(progress[i - 1] && progress[i - 1].best);

  function rackPins(onlyStanding) {
    for (const p of pins) {
      const b = p.body;
      if (!p.used) {
        if (p.active) world.remove(b);
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      if (onlyStanding && !p.active) continue;
      if (!onlyStanding) {
        b.position.set(p.home.x, p.baseY + PIN_COM + 0.002, p.home.z);
      } else {
        // 立っているピンはその場で起こし直す (機械がつかんで置き直すイメージ)
        b.position.set(b.position.x, p.baseY + PIN_COM + 0.002, b.position.z);
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

  const upVec = new CANNON.Vec3();
  function isStanding(p) {
    if (!p.active) return false;
    const b = p.body;
    b.quaternion.vmult(new CANNON.Vec3(0, 1, 0), upVec);
    return upVec.y > 0.85 && b.position.y > p.baseY + PIN_COM - 0.04 && b.position.z > DECK_END && Math.abs(b.position.x) < LANE_HALF + 0.02;
  }

  const countStanding = () => pins.filter(isStanding).length;

  function resetBall() {
    ballBody.velocity.setZero();
    ballBody.angularVelocity.setZero();
    ballBody.quaternion.setFromEuler(rand(0, 6), rand(0, 6), 0);
    ballBody.position.set(ballX, BALL_R, START_Z);
    ballBody.collisionFilterMask = -1;
    ballMesh.visible = true;
    inGutter = false;
    ballFell = false;
  }

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    overlay.hidden = !name;
    if (name === 'select') renderSelect();
  }

  function loadStage(i) {
    clearTimeout(nextTimer);
    clearTimeout(throwTimer);
    clearTrail(false);
    hideCallout();
    stageIndex = i;
    const st = STAGES[i];
    buildStage(st);
    pins.forEach((p, k) => {
      const def = st.pins[k];
      p.used = Boolean(def);
      if (def) {
        p.home = { x: def.x, z: def.z };
        p.baseY = def.y || 0;
      }
    });
    rackPins(false);
    const owned = Boolean(progress[i] && progress[i].treasure);
    addTreasure(st.treasure, owned);
    roll = 1;
    ballX = st.startX || 0;
    aimAngle = 0;
    hook = 0;
    resetBall();
    stageNoEl.textContent = `STAGE ${i + 1}`;
    stageNameEl.textContent = st.name;
    stageGoalEl.textContent = st.goal;
    retryBtn.disabled = false;
    hudSpeed.textContent = '';
    showScreen(null);
    state = 'preview';
    previewUntil = performance.now() + PREVIEW_MS;
    hintEl.textContent = 'タップでスキップ';
    updateHud();
  }

  function startAim() {
    state = 'aim';
    updateHud();
  }

  function throwBall(speed, angle, spin) {
    if (state !== 'aim' && state !== 'windup') return;
    initAudio();
    aimAngle = angle;
    hook = spin;
    ballBody.position.set(ballX, BALL_R, START_Z);
    ballBody.velocity.set(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed);
    // 転がりながら手を離れる (すべるだけだと摩擦で一気に遅くなる)。
    // 横回転はかけない (かけると手前から曲がり始めてしまう)。カーブは奥でかける力で表す
    ballBody.angularVelocity.set(-speed / BALL_R, 0, 0);
    throwTime = world.time;
    ballDoneAt = 0;
    standingBefore = countStanding();
    // スワイプで投げたときは、投げる前に速さとカーブを表示済み
    if (state !== 'windup') hudSpeed.textContent = `${(speed * 3.6).toFixed(1)} km/h`;
    state = 'rolling';
    hintEl.textContent = '';
    powerEl.hidden = true;
  }

  function updateHud() {
    if (state === 'title' || state === 'select') {
      hudFrame.textContent = '';
      hudTreasure.textContent = '';
      hintEl.textContent = '';
      return;
    }
    hudFrame.textContent = `${roll}投目 / 2`;
    const t = treasure;
    if (t) {
      const got = t.taken || t.owned;
      hudTreasure.textContent = `◆ ${t.taken ? 'ゲット!' : t.owned ? '入手済み' : '宝物あり'}`;
      hudTreasure.classList.toggle('is-got', got);
    }
    if (state === 'aim') {
      const touch = matchMedia('(pointer: coarse)').matches;
      hintEl.textContent = touch ? '左右になぞって位置合わせ、上にスワイプで投球' : 'ドラッグで位置合わせ、上へなぞって投球 (キーボードも使えます)';
    }
  }

  function showCallout(main, sub) {
    calloutEl.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
    calloutEl.classList.add('is-shown');
  }
  const hideCallout = () => calloutEl.classList.remove('is-shown');

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2200);
  }

  function takeTreasure() {
    const t = treasure;
    if (!t || t.taken) return;
    t.taken = true;
    t.burst = 0.001;
    const pr = stageProgress(stageIndex);
    const first = !pr.treasure;
    pr.treasure = true;
    saveProgress();
    chime();
    showToast(first ? `宝物ゲット! ${t.def.name}` : `${t.def.name} (入手済み)`);
    updateHud();
  }

  function finishRoll() {
    state = 'result';
    if (rumble) rumble.gain.setTargetAtTime(0, audio.currentTime, 0.05);
    const left = countStanding();
    const knocked = standingBefore - left;

    if (left === 0) {
      stageClear(roll === 1 ? 'strike' : 'spare');
      return;
    }
    if (roll === 2) {
      showCallout('MISS', `のこり ${left}本`);
      nextTimer = setTimeout(() => {
        hideCallout();
        showResult(null, left);
      }, 1500);
      return;
    }
    let main = `${knocked}`;
    let sub = `のこり ${left}本`;
    if (ballFell) main = '落ちた!';
    else if (knocked === 0) main = inGutter ? 'GUTTER' : 'MISS';
    showCallout(main, sub);
    nextTimer = setTimeout(() => {
      hideCallout();
      roll = 2;
      clearFallen();
      rackPins(true);
      resetBall();
      startAim();
    }, 1600);
  }

  function stageClear(kind) {
    const pr = stageProgress(stageIndex);
    if (kind === 'strike' || !pr.best) pr.best = kind;
    saveProgress();
    showCallout(kind === 'strike' ? 'STRIKE!' : 'SPARE!', 'STAGE CLEAR');
    nextTimer = setTimeout(() => {
      hideCallout();
      showResult(kind, 0);
    }, 1600);
  }

  function showResult(kind, left) {
    state = 'done';
    const st = STAGES[stageIndex];
    resultTitle.textContent = kind === 'strike' ? 'STRIKE CLEAR' : kind === 'spare' ? 'SPARE CLEAR' : 'もう一歩!';
    resultTitle.classList.toggle('is-fail', !kind);
    resultStage.textContent = `STAGE ${stageIndex + 1}  ${st.name}`;
    const t = treasure;
    let text = kind ? (kind === 'strike' ? '1投ですべてのピンを倒した!' : '2投ですべてのピンを倒した!') : `ピンが ${left}本 残ってしまった。`;
    if (t && t.taken && !t.owned) text += `\n宝物「${t.def.name}」を手に入れた!`;
    else if (t && (t.taken || t.owned)) text += `\n宝物「${t.def.name}」は入手済み`;
    else text += '\n宝物はまだ。取らなくてもクリアできます';
    resultText.textContent = text;

    const buttons = [];
    if (kind && stageIndex < STAGES.length - 1) buttons.push(['next', '次のステージへ', '']);
    buttons.push(['retry', kind ? 'もう一度' : 'もう一度挑戦', kind && stageIndex < STAGES.length - 1 ? ' is-sub' : '']);
    buttons.push(['select', 'ステージ選択', ' is-sub']);
    resultActions.innerHTML = buttons.map(([action, label, cls]) => `<button type="button" class="start-btn${cls}" data-action="${action}">${label}</button>`).join('');
    showScreen('result');
    hudSpeed.textContent = '';
    hintEl.textContent = '';
    const first = resultActions.querySelector('button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  }

  resultActions.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'next') loadStage(stageIndex + 1);
    if (action === 'retry') loadStage(stageIndex);
    if (action === 'select') openSelect();
  });

  function renderSelect() {
    const cleared = STAGES.filter((_, i) => progress[i] && progress[i].best).length;
    const strikes = STAGES.filter((_, i) => progress[i] && progress[i].best === 'strike').length;
    const gems = STAGES.filter((_, i) => progress[i] && progress[i].treasure).length;
    progressEl.textContent = `クリア ${cleared}/${STAGES.length} · ストライク ${strikes}/${STAGES.length} · 宝物 ${gems}/${STAGES.length}`;
    gridEl.innerHTML = STAGES.map((st, i) => {
      const pr = progress[i] || {};
      const locked = !isUnlocked(i);
      const label = pr.best === 'strike' ? 'STRIKE' : pr.best === 'spare' ? 'SPARE' : '';
      return `<button type="button" class="stage-tile${pr.best ? ` is-${pr.best}` : ''}" data-stage="${i}"${locked ? ' disabled' : ''}>`
        + `<span class="tile-no">${i + 1}</span><span class="tile-name">${locked ? '???' : st.name}</span>`
        + `<span class="tile-badges"><span class="badge-result">${label}</span>`
        + `<span class="tile-gem${pr.treasure ? ' is-got' : ''}" title="${pr.treasure ? st.treasure.name : '宝物はまだ'}"></span></span></button>`;
    }).join('');
  }

  gridEl.addEventListener('click', (e) => {
    const tile = e.target.closest('button[data-stage]');
    if (!tile || tile.disabled) return;
    initAudio();
    loadStage(Number(tile.dataset.stage));
  });

  function openSelect() {
    clearTimeout(nextTimer);
    clearTimeout(throwTimer);
    clearTrail(false);
    hideCallout();
    powerEl.hidden = true;
    charging = false;
    state = 'select';
    showScreen('select');
    updateHud();
    hudSpeed.textContent = '';
  }

  // =====================================================================
  // 入力
  // =====================================================================
  let gesture = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (state === 'preview') {
      startAim();
      return;
    }
    if (state !== 'aim') return;
    canvas.setPointerCapture(e.pointerId);
    gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, startX: ballX, mode: 'idle', pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.id || state !== 'aim') return;
    const dx = e.clientX - gesture.x0;
    const dy = e.clientY - gesture.y0;
    gesture.pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
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
      const pts = gesture.pts;
      const swipe = readSwipe(pts);
      if (swipe) aimAngle = swipe.angle;
      drawTrail(pts, swipe);
    }
  });
  // スワイプの線を、長さの割合 (0〜1) の位置で切ったときの点
  function pathPoint(pts, lens, frac) {
    const target = lens[lens.length - 1] * frac;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < target) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const u = clamp((target - lens[i - 1]) / seg, 0, 1);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
  }

  // 画面の上方向を 0 とした、2点を結ぶ向き (右が +)
  const dirOf = (p, q) => Math.atan2(q.x - p.x, p.y - q.y);

  // スワイプの線から投げ方を決める
  //   速さ: 線の長さ (画面の高さに対する割合)
  //   向き: 線の出だしの向き
  //   カーブ: 出だしの向きと、終わりの向きの差 (途中で曲げた分)
  function readSwipe(pts) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = lens[lens.length - 1];
    if (total < 1) return null;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const lenRatio = total / canvas.clientHeight;
    const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * clamp((lenRatio - SWIPE_MIN) / (SWIPE_MAX - SWIPE_MIN), 0, 1);
    const startDir = dirOf(a, pathPoint(pts, lens, 0.3));
    const endDir = dirOf(pathPoint(pts, lens, 0.7), b);
    let bend = endDir - startDir;
    // 少しの手ぶれではカーブにしない
    bend = Math.sign(bend) * Math.max(Math.abs(bend) - 0.1, 0);
    return {
      speed,
      angle: clamp(startDir * 0.13, -MAX_ANGLE, MAX_ANGLE),
      spin: clamp(bend * 1.6, -1, 1),
      up: a.y - b.y,
      lenRatio,
    };
  }

  // ---- スワイプの線 ----
  const trailCtx = trailEl.getContext('2d');
  function sizeTrail() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailEl.width = Math.round(wrap.clientWidth * dpr);
    trailEl.height = Math.round(wrap.clientHeight * dpr);
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawTrail(pts, swipe) {
    const rect = trailEl.getBoundingClientRect();
    trailCtx.clearRect(0, 0, rect.width, rect.height);
    trailEl.classList.remove('is-fading');
    if (pts.length < 2) return;
    // 線の長さで色が変わる (短い = 緑、長い = 赤)
    const power = swipe ? (swipe.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED) : 0;
    const hue = 130 - power * 125;
    trailCtx.lineCap = 'round';
    trailCtx.lineJoin = 'round';
    trailCtx.beginPath();
    pts.forEach((p, i) => trailCtx[i ? 'lineTo' : 'moveTo'](p.x - rect.left, p.y - rect.top));
    trailCtx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    trailCtx.lineWidth = 12;
    trailCtx.stroke();
    trailCtx.strokeStyle = `hsl(${hue}, 95%, 60%)`;
    trailCtx.lineWidth = 6;
    trailCtx.stroke();
    // 終わりに矢印
    const b = pts[pts.length - 1];
    const p = pts[Math.max(0, pts.length - 4)];
    const ang = Math.atan2(b.y - p.y, b.x - p.x);
    trailCtx.save();
    trailCtx.translate(b.x - rect.left, b.y - rect.top);
    trailCtx.rotate(ang);
    trailCtx.beginPath();
    trailCtx.moveTo(10, 0);
    trailCtx.lineTo(-8, -9);
    trailCtx.lineTo(-8, 9);
    trailCtx.closePath();
    trailCtx.fillStyle = `hsl(${hue}, 95%, 60%)`;
    trailCtx.fill();
    trailCtx.restore();
  }

  function clearTrail(fade) {
    if (fade) {
      trailEl.classList.add('is-fading');
    } else {
      trailEl.classList.remove('is-fading');
      trailCtx.clearRect(0, 0, trailEl.width, trailEl.height);
    }
  }

  function describeThrow(swipe) {
    const curve = swipe.spin === 0 ? 'ストレート' : `${swipe.spin < 0 ? '左' : '右'}カーブ ${Math.round(Math.abs(swipe.spin) * 100)}%`;
    return `${(swipe.speed * 3.6).toFixed(1)} km/h · ${curve}`;
  }

  function endGesture(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (g.mode !== 'throw' || state !== 'aim') {
      clearTrail(false);
      return;
    }
    const pts = g.pts;
    const swipe = readSwipe(pts);
    if (!swipe || swipe.up < 40) {
      clearTrail(false);
      return;
    }
    // なぞった線を少し見せてから投げる
    state = 'windup';
    aimAngle = swipe.angle;
    drawTrail(pts, swipe);
    hudSpeed.textContent = describeThrow(swipe);
    hintEl.textContent = '';
    throwTimer = setTimeout(() => {
      clearTrail(true);
      throwBall(swipe.speed, swipe.angle, swipe.spin);
    }, TRAIL_HOLD_MS);
  }
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', (e) => {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture = null;
    clearTrail(false);
  });

  // キーボード
  const keys = new Set();
  let charging = false;
  let power = 0;
  let powerDir = 1;
  window.addEventListener('keydown', (e) => {
    // ボタンやリンクにフォーカスがあるときは、そちらの操作に任せる
    if (e.target.closest && e.target.closest('button, a')) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' '].includes(k) && !['title', 'select', 'done'].includes(state)) e.preventDefault();
    if (state === 'title' && (k === 'enter' || k === ' ')) {
      e.preventDefault();
      startBtn.click();
      return;
    }
    if (k === 'escape' && state !== 'title' && state !== 'select') {
      openSelect();
      return;
    }
    if (k === 'r' && !['title', 'select'].includes(state)) {
      loadStage(stageIndex);
      return;
    }
    if (state === 'preview' && (k === ' ' || k === 'enter')) {
      startAim();
      return;
    }
    if (state !== 'aim') return;
    keys.add(k);
    if (k === 'a') aimAngle = clamp(aimAngle - 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'd') aimAngle = clamp(aimAngle + 0.005, -MAX_ANGLE, MAX_ANGLE);
    if (k === 'q') hook = clamp(Math.round((hook - 0.25) * 4) / 4, -1, 1);
    if (k === 'e') hook = clamp(Math.round((hook + 0.25) * 4) / 4, -1, 1);
    if (['a', 'd', 'q', 'e'].includes(k)) showAimHud();
    if (k === ' ' && !charging && !e.repeat) {
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
    initAudio();
    startBtn.blur();
    openSelect();
  });
  selectBack.addEventListener('click', () => {
    state = 'title';
    showScreen('title');
  });
  menuBtn.addEventListener('click', () => {
    menuBtn.blur();
    openSelect();
  });
  retryBtn.addEventListener('click', () => {
    retryBtn.blur();
    if (state !== 'title' && state !== 'select') loadStage(stageIndex);
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
  new ResizeObserver(() => { resize(); sizeTrail(); }).observe(wrap);
  resize();

  // 物理の1ステップごとの処理 (力は毎ステップ消えるので、カーブの力も毎回かける)
  const hookForce = new CANNON.Vec3();
  world.addEventListener('preStep', () => {
    moverClock += STEP;
    setMovers(true);
    const bp = ballBody.position;
    if (state !== 'rolling') return;

    // 落とし穴: 穴の上をレーンの高さで転がったら落ちる (飛び越えれば落ちない)
    if (!ballFell && bp.y < BALL_R + 0.02) {
      for (const h of holes) {
        if (inHole(h, bp.x, bp.z)) {
          ballFell = true;
          ballBody.collisionFilterMask = -1 & ~LANE_GROUP;
          break;
        }
      }
    }
    if (bp.y < -0.8) {
      // 穴の底。見えないところで止めておく
      bp.y = -0.8;
      ballBody.velocity.setZero();
    }

    if (treasure && !treasure.taken) {
      const t = treasure.def;
      if (Math.hypot(bp.x - t.x, bp.y - t.y, bp.z - t.z) < TREASURE_REACH) takeTreasure();
    }

    if (!inGutter && Math.abs(bp.x) > LANE_HALF + 0.01 && bp.y < BALL_R && bp.z > HEAD_Z) inGutter = true;
    // オイルの薄い奥のほうで、回転の向きに曲がる。坂の上や空中では曲がらない
    if (inGutter || ballFell || bp.z > HOOK_START_Z || bp.z < HEAD_Z + 0.3 || Math.abs(ballBody.velocity.y) > 0.3) return;
    hookForce.set(hook * HOOK_FORCE * clamp((HOOK_START_Z - bp.z) / HOOK_RAMP, 0, 1), 0, 0);
    ballBody.applyForce(hookForce, bp);
  });

  // 物理は 1/240 秒ずつ進める。描画が遅い端末では、ゲームの時間ごとゆっくり進む
  let stepAcc = 0;
  function updatePhysics(dt) {
    if (state !== 'rolling' && state !== 'result') {
      stepAcc = 0;
      moverClock += dt;
      setMovers(false);
      return;
    }
    stepAcc += dt;
    let n = 0;
    while (stepAcc >= STEP && n < 12) {
      world.step(STEP);
      stepAcc -= STEP;
      n++;
    }
    if (n === 12) stepAcc = 0;
  }

  // 時間は物理の時計 (world.time) で測る。描画が遅い端末でも判定がずれないように
  function updateGame(dt) {
    if (state === 'preview' && performance.now() > previewUntil) startAim();
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
        const onLane = !ballFell && bp.y > 0 && bp.y < 0.2 && bp.z > DECK_END;
        rumble.gain.setTargetAtTime(onLane ? clamp(speed / 10, 0, 1) * 0.35 : 0, audio.currentTime, 0.05);
      }
      const ballDone = bp.y < -0.15 || bp.z < DECK_END - 0.1 || (speed < 0.2 && t > 1.5);
      if (ballDone && !ballDoneAt) ballDoneAt = now;
      const quiet = pins.every((p) => !p.active || p.body.sleepState === CANNON.Body.SLEEPING
        || (p.body.velocity.length() < 0.06 && p.body.angularVelocity.length() < 0.4));
      const since = ballDoneAt ? now - ballDoneAt : 0;
      // 落とし穴に落ちたら、ピンが止まるのを待たずに終わる
      if ((ballDoneAt && ((quiet && since > (ballFell ? 0.4 : 0.9)) || since > 4)) || t > 14) finishRoll();
    }
  }

  function updateCamera(dt) {
    const bp = ballBody.position;
    const by = Math.max(bp.y - BALL_R, 0);
    if (state === 'title' || state === 'select' || state === 'done') {
      const t = performance.now() / 1000;
      tmpV.set(Math.sin(t * 0.25) * 0.6, 1.1, HEAD_Z + 6.5);
      focus.set(0, 0.2, HEAD_Z - 0.3);
    } else if (state === 'preview') {
      // ピンの手前から投げる位置まで、レーンの上を引いてくる。仕掛けが順に見える
      const p = clamp(1 - (previewUntil - performance.now()) / PREVIEW_MS, 0, 1);
      const e = p * p * (3 - 2 * p);
      const z = HEAD_Z + 3.4 + (START_Z + 2.4 - HEAD_Z - 3.4) * e;
      camPos.set(ballX * 0.6 * e, 1.9 - 0.65 * e, z);
      camLook.set(ballX * 0.25 * e, 0, Math.min(z - 8, HEAD_Z - 0.4 + (-12 - HEAD_Z + 0.4) * e));
      tmpV.copy(camPos);
      focus.copy(camLook);
    } else if (state === 'aim' || state === 'windup') {
      tmpV.set(ballX * 0.6, 1.25, START_Z + 2.4);
      focus.set(ballX * 0.25, 0, -12);
    } else if (state === 'rolling' && bp.z > HEAD_Z + 5 && !ballFell) {
      const near = clamp((-bp.z) / -HEAD_Z, 0, 1);
      tmpV.set(bp.x * 0.5, 1.25 - near * 0.4 + by * 0.6, bp.z + 2.4);
      focus.set(bp.x * 0.3, 0.05 + by * 0.4, Math.min(bp.z - 9, HEAD_Z));
    } else if (state === 'rolling' && ballFell) {
      // 落ちた穴をのぞきこむ
      tmpV.set(bp.x * 0.5, 1.4, Math.max(bp.z, HEAD_Z + 2) + 2.6);
      focus.set(bp.x * 0.5, 0, Math.max(bp.z, HEAD_Z + 2) - 1);
    } else {
      tmpV.set(0, 1.0, HEAD_Z + 3.2);
      focus.set(0, 0.15, HEAD_Z - 0.4);
    }
    const k = 1 - Math.exp(-dt * (state === 'rolling' ? 7 : state === 'preview' ? 2.2 : 3));
    camPos.lerp(tmpV, k);
    camLook.lerp(focus, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // 影のライトは、ボールかピンのどちらか近いほうに合わせる
    const followBall = state === 'rolling' && bp.z > HEAD_Z + 1.5 && !ballFell;
    const fz = followBall ? bp.z : HEAD_Z - 0.4;
    const fx = followBall ? bp.x : 0;
    sun.position.set(fx + 1.2, 5, fz + 2);
    sun.target.position.set(fx, 0, fz);
  }

  function updateAimLine() {
    aimLine.visible = state === 'aim' || state === 'windup';
    if (!aimLine.visible) return;
    aimLine.children.forEach((d, i) => {
      const dist = 0.45 + i * 0.32;
      d.position.set(ballX + Math.sin(aimAngle) * dist, 0.003, START_Z - Math.cos(aimAngle) * dist);
      d.scale.setScalar(1 - i / 40);
    });
  }

  function updateTreasure(dt) {
    const t = treasure;
    if (!t) return;
    const time = performance.now() / 1000;
    t.mesh.rotation.y += dt * 2.2;
    t.group.position.y = t.def.y + Math.sin(time * 2.4) * 0.015;
    if (t.burst > 0) {
      // 取った瞬間にふくらんで消える
      t.burst += dt;
      const k = clamp(t.burst / 0.45, 0, 1);
      t.group.scale.setScalar(1 + k * 1.6);
      t.mesh.material.opacity = (t.owned ? 0.4 : 1) * (1 - k);
      t.halo.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        t.group.visible = false;
        t.burst = 0;
      }
    }
  }

  function sync() {
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
    ballMesh.visible = ballBody.position.y > -0.3;
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
    for (const m of movers) m.mesh.position.copy(m.body.position);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    updateGame(dt);
    updatePhysics(dt);
    sync();
    updateTreasure(dt);
    updateCamera(dt);
    updateAimLine();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  // タイトル画面の後ろには、最初のステージを並べておく
  loadStage(0);
  state = 'title';
  hintEl.textContent = '';
  retryBtn.disabled = true;
  showScreen('title');
  updateHud();
  requestAnimationFrame(loop);
})();
