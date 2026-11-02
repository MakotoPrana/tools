/*
 * ボクセル解体ボンバー: 画面 (家・地面・手榴弾・がれき・爆発)、視点と投げる操作、ステージの進み方。
 * 家のマス目と爆発の計算は world.js、家の形は stages.js
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  if (typeof THREE === 'undefined') {
    $('load-error').hidden = false;
    return;
  }

  const { STAGES, WORLDS, MATERIALS, MATERIAL_NAMES } = window.VoxelStages;
  const World = window.VoxelWorld;
  const CELL = World.CELL; // ボクセル1つの大きさ

  const GOAL = 0.8; // こわせばクリアになる割合
  const GRAVITY = 22;
  const GRENADE_R = 0.22;
  const DEBRIS_MAX = 4000;
  const STARS_KEY = 'voxel-grenade-stars-50'; // 50ステージにしたときに、前の記録とは分けた
  const SOUND_KEY = 'voxel-grenade-sound';

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  }

  // ---------- アクセス解析: ステージの開始・結末・リトライ (全ゲーム共通の形で GA4 に送る) ----------
  // stage_start / stage_end (result: clear・fail・quit) / stage_retry_fail・stage_retry_clear・stage_retry_quit
  // 終わったステージをそのまま遊び直したら、直前の結末に合わせたリトライとして送る
  const stageTrack = (() => {
    const GAME = 'voxel_grenade';
    const attempts = {};
    let playing = null; // { stage, at } 遊んでいる途中のステージ
    let ended = null; // { stage, result } 直前に終わったステージ
    const send = (name, params) => track(name, { game: GAME, ...params });
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

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 保存できなくても遊べる
    }
  }

  // ---------- three.js の土台 ----------

  const canvas = $('board');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7b267);
  scene.fog = new THREE.Fog(0xf7b267, 60, 140);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b5a3a, 0.75));
  const sun = new THREE.DirectionalLight(0xffe2b8, 0.85);
  sun.position.set(-30, 45, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04; // 小さなボクセルの階段に出る影のぎざぎざをおさえる
  scene.add(sun);
  scene.add(sun.target);

  // 地面: 市松模様。色はワールドごとに塗りなおす
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = groundCanvas.height = 64;
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(100, 100);
  groundTex.magFilter = THREE.NearestFilter;
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // 橋のステージの川
  const river = new THREE.Mesh(new THREE.PlaneGeometry(1, 400), new THREE.MeshLambertMaterial({ color: 0x3f8fd0 }));
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.02;
  river.receiveShadow = true;
  river.visible = false;
  scene.add(river);

  // ワールドの空と地面の色、川
  function applyTheme(stage) {
    const theme = WORLDS[stage.world];
    scene.background.setHex(theme.sky);
    scene.fog.color.setHex(theme.sky);
    document.body.style.background = '#' + theme.sky.toString(16).padStart(6, '0');
    const g = groundCanvas.getContext('2d');
    g.fillStyle = theme.ground[0];
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = theme.ground[1];
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    groundTex.needsUpdate = true;
    river.visible = !!stage.river;
    if (stage.river) {
      river.scale.x = stage.river;
      river.position.x = stage.riverX || 0;
    }
  }

  // ブロックの面に、うすい縁取りを描いておく (色はブロックごとに掛ける)
  const blockTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 32, 32);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 29, 29);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    return tex;
  })();
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const blockMat = new THREE.MeshLambertMaterial({ map: blockTex });

  const matColors = MATERIAL_NAMES.map((n) => new THREE.Color(MATERIALS[n].color));

  const tmpMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const tmpVec = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------- がれき ----------

  const debris = {
    mesh: new THREE.InstancedMesh(blockGeo, blockMat, DEBRIS_MAX),
    pos: new Float32Array(DEBRIS_MAX * 3),
    vel: new Float32Array(DEBRIS_MAX * 3),
    rot: new Float32Array(DEBRIS_MAX * 3),
    spin: new Float32Array(DEBRIS_MAX * 3),
    size: new Float32Array(DEBRIS_MAX),
    life: new Float32Array(DEBRIS_MAX),
    active: new Uint8Array(DEBRIS_MAX),
    next: 0,
  };
  debris.mesh.castShadow = true;
  debris.mesh.frustumCulled = false;
  for (let i = 0; i < DEBRIS_MAX; i++) {
    debris.mesh.setMatrixAt(i, ZERO);
    debris.mesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
  }
  scene.add(debris.mesh);

  function spawnDebris(x, y, z, vx, vy, vz, size, color, life) {
    const i = debris.next;
    debris.next = (debris.next + 1) % DEBRIS_MAX;
    debris.active[i] = 1;
    debris.pos.set([x, y, z], i * 3);
    debris.vel.set([vx, vy, vz], i * 3);
    debris.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    const s = 2 + Math.hypot(vx, vy, vz) * 0.6;
    debris.spin.set([(Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s], i * 3);
    debris.size[i] = size;
    debris.life[i] = life;
    debris.mesh.setColorAt(i, color);
    debris.mesh.instanceColor.needsUpdate = true;
  }

  function clearDebris() {
    debris.active.fill(0);
    for (let i = 0; i < DEBRIS_MAX; i++) debris.mesh.setMatrixAt(i, ZERO);
    debris.mesh.instanceMatrix.needsUpdate = true;
  }

  function updateDebris(dt) {
    let any = false;
    for (let i = 0; i < DEBRIS_MAX; i++) {
      if (!debris.active[i]) continue;
      any = true;
      const p = i * 3;
      debris.life[i] -= dt;
      if (debris.life[i] <= 0) {
        debris.active[i] = 0;
        debris.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      const size = debris.size[i];
      const half = size / 2;
      debris.vel[p + 1] -= GRAVITY * dt;
      for (let a = 0; a < 3; a++) {
        const old = debris.pos[p + a];
        debris.pos[p + a] += debris.vel[p + a] * dt;
        // 残っている家にぶつかったら、はね返る
        if (solidAtWorld(debris.pos[p], debris.pos[p + 1], debris.pos[p + 2])) {
          debris.pos[p + a] = old;
          debris.vel[p + a] *= -0.25;
        }
      }
      if (debris.pos[p + 1] < half) {
        debris.pos[p + 1] = half;
        if (debris.vel[p + 1] < 0) debris.vel[p + 1] *= -0.3;
        debris.vel[p] *= 0.82;
        debris.vel[p + 2] *= 0.82;
        for (let a = 0; a < 3; a++) debris.spin[p + a] *= 0.8;
      }
      for (let a = 0; a < 3; a++) debris.rot[p + a] += debris.spin[p + a] * dt;
      const shrink = Math.min(1, debris.life[i] / 0.6);
      tmpEuler.set(debris.rot[p], debris.rot[p + 1], debris.rot[p + 2]);
      tmpQuat.setFromEuler(tmpEuler);
      tmpVec.set(debris.pos[p], debris.pos[p + 1], debris.pos[p + 2]);
      tmpScale.setScalar(size * shrink);
      tmpMat.compose(tmpVec, tmpQuat, tmpScale);
      debris.mesh.setMatrixAt(i, tmpMat);
    }
    debris.mesh.instanceMatrix.needsUpdate = true;
    return any;
  }

  // 爆風でがれきを吹き飛ばす
  function pushDebris(x, y, z, strength) {
    for (let i = 0; i < DEBRIS_MAX; i++) {
      if (!debris.active[i]) continue;
      const p = i * 3;
      const dx = debris.pos[p] - x, dy = debris.pos[p + 1] - y, dz = debris.pos[p + 2] - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 7 || dist < 0.01) continue;
      const f = (strength * (1 - dist / 7)) / dist;
      debris.vel[p] += dx * f;
      debris.vel[p + 1] += Math.abs(dy) * f + 3;
      debris.vel[p + 2] += dz * f;
    }
  }

  // ---------- 家 ----------

  let world = null;
  let house = null; // InstancedMesh
  let cellToInstance = null; // マスの番号 → インスタンスの番号
  let ox = 0, oz = 0; // ボクセル (0, 0, 0) の角の、ワールド座標

  function buildHouse() {
    if (house) {
      scene.remove(house);
      house.dispose();
    }
    house = new THREE.InstancedMesh(blockGeo, blockMat, world.total);
    house.castShadow = true;
    house.receiveShadow = true;
    house.frustumCulled = false;
    cellToInstance = new Int32Array(world.cells.length).fill(-1);
    ox = (-world.w * CELL) / 2;
    oz = (-world.d * CELL) / 2;
    let n = 0;
    for (let i = 0; i < world.cells.length; i++) {
      const m = world.cells[i];
      if (!m) continue;
      const [x, y, z] = World.coords(world, i);
      tmpMat.makeScale(CELL, CELL, CELL).setPosition(ox + (x + 0.5) * CELL, (y + 0.5) * CELL, oz + (z + 0.5) * CELL);
      house.setMatrixAt(n, tmpMat);
      // 同じ材料でも少しずつ明るさを変えて、ボクセルらしくする
      const k = 0.9 + Math.random() * 0.14;
      tmpColor.copy(matColors[m - 1]).multiplyScalar(k);
      house.setColorAt(n, tmpColor);
      cellToInstance[i] = n++;
    }
    scene.add(house);
  }

  function hideCell(i) {
    const n = cellToInstance[i];
    if (n >= 0) house.setMatrixAt(n, ZERO);
  }

  function cellColor(i, mat) {
    const n = cellToInstance[i];
    if (n >= 0) house.getColorAt(n, tmpColor);
    else tmpColor.copy(matColors[mat - 1]);
    return tmpColor;
  }

  function solidAtWorld(x, y, z) {
    if (!world) return false;
    return World.solid(world, Math.floor((x - ox) / CELL), Math.floor(y / CELL), Math.floor((z - oz) / CELL));
  }

  // ---------- 視点 ----------

  const view = { theta: 0.7, phi: 0.5, dist: 30, target: new THREE.Vector3(), shake: 0 };

  function frameStage() {
    const size = Math.max(world.w, world.d, world.h) * CELL;
    // 縦長の画面では、家が横にはみ出さないように少し離れる
    const far = camera.aspect < 1 ? 1 / Math.pow(camera.aspect, 0.4) : 1;
    view.dist = (size * 1.55 + 12) * far;
    view.minDist = size * 0.9 + 8;
    view.maxDist = (size * 2.6 + 20) * far;
    view.theta = 0.7;
    view.phi = 0.42;
    view.target.set(0, world.h * CELL * 0.32, 0);
    const s = Math.max(world.w, world.d) * CELL * 0.9 + 8;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function placeCamera() {
    // 霧は、カメラから家までのきょりに合わせて遠ざける (大きなステージがかすまないように)
    scene.fog.near = view.dist + 25;
    scene.fog.far = view.dist * 2 + 90;
    const c = Math.cos(view.phi);
    camera.position.set(
      view.target.x + view.dist * c * Math.sin(view.theta),
      view.target.y + view.dist * Math.sin(view.phi),
      view.target.z + view.dist * c * Math.cos(view.theta)
    );
    camera.lookAt(view.target);
    if (view.shake > 0) {
      const s = view.shake * 0.6;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では少し広く見せる
    camera.fov = w < h ? 62 : 50;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ---------- ねらい ----------

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // 画面の点から、家のブロックか地面に当たる点を探す (マス目を1つずつたどる)
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, dir = raycaster.ray.direction;
    let best = null;
    if (dir.y < -1e-4) {
      const t = -o.y / dir.y;
      if (t < 160) best = { t, normal: new THREE.Vector3(0, 1, 0) };
    }
    // マス目はボクセル単位で数えるので、たどる距離もボクセル単位にして、戻す
    const hit = traceGrid((o.x - ox) / CELL, o.y / CELL, (o.z - oz) / CELL, dir.x, dir.y, dir.z, (best ? best.t : 160) / CELL);
    if (hit) best = { t: hit.t * CELL, normal: hit.normal };
    if (!best) return null;
    const point = o.clone().addScaledVector(dir, best.t);
    return { point, normal: best.normal };
  }

  function traceGrid(px, py, pz, dx, dy, dz, maxT) {
    // マス目の箱に入るところまで進める
    let t0 = 0, t1 = maxT;
    const lo = [0, 0, 0], hi = [world.w, world.h, world.d], p = [px, py, pz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (p[a] < lo[a] || p[a] > hi[a]) return null;
      } else {
        let ta = (lo[a] - p[a]) / d[a], tb = (hi[a] - p[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
    }
    if (t0 > t1) return null;
    const start = t0 + 1e-4;
    const cell = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      cell[a] = Math.min(hi[a] - 1, Math.max(0, Math.floor(p[a] + d[a] * start)));
      step[a] = d[a] > 0 ? 1 : -1;
      const next = d[a] > 0 ? cell[a] + 1 : cell[a];
      tMax[a] = Math.abs(d[a]) < 1e-9 ? Infinity : (next - p[a]) / d[a];
      tDelta[a] = Math.abs(d[a]) < 1e-9 ? Infinity : Math.abs(1 / d[a]);
    }
    let t = start, axis = -1;
    while (t <= t1) {
      if (World.solid(world, cell[0], cell[1], cell[2])) {
        const normal = new THREE.Vector3();
        if (axis >= 0) normal.setComponent(axis, -step[axis]);
        else normal.set(0, 1, 0);
        return { t, normal };
      }
      axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
      t = tMax[axis];
      cell[axis] += step[axis];
      tMax[axis] += tDelta[axis];
      if (cell[axis] < 0 || cell[axis] >= hi[axis]) return null;
    }
    return null;
  }

  // ねらう点の目印と、とぶ道すじ
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.7, 24),
    new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide })
  );
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  const ARC_POINTS = 40;
  const arc = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3)),
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.85 })
  );
  arc.visible = false;
  arc.frustumCulled = false;
  scene.add(arc);

  const THROW_REACH = 26; // 投げはじめる点から目標までの、いちばん遠いきょり

  // 投げはじめる点。ふだんはカメラの少し前。大きなステージで遠いときは、目標から THROW_REACH の点まで近づける
  function throwOrigin(target) {
    const fwd = tmpVec.subVectors(view.target, camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const origin = camera.position.clone().addScaledVector(fwd, 2).addScaledVector(right, 0.8).add(new THREE.Vector3(0, -1.2, 0));
    const back = origin.clone().sub(target);
    if (back.length() > THROW_REACH) {
      back.setLength(THROW_REACH);
      origin.copy(target).add(back);
      // ブロックの中から投げないように、カメラの方へずらす
      const step = camera.position.clone().sub(origin).normalize();
      for (let k = 0; k < 80 && solidAtWorld(origin.x, origin.y, origin.z); k++) origin.add(step);
    }
    return origin;
  }

  // 目標に届く初速と、とぶ時間
  function solveThrow(origin, target) {
    const dist = origin.distanceTo(target);
    const T = 0.75 + dist * 0.022;
    const v = target.clone().sub(origin).divideScalar(T);
    v.y += 0.5 * GRAVITY * T;
    return { v, T };
  }

  let aim = null;

  function updateAim(clientX, clientY) {
    if (state !== 'play' || bombsLeft <= 0) {
      hideAim();
      return;
    }
    const hit = pick(clientX, clientY);
    if (!hit) {
      hideAim();
      return;
    }
    const target = hit.point.clone().addScaledVector(hit.normal, 0.3);
    aim = target;
    marker.visible = true;
    marker.position.copy(hit.point).addScaledVector(hit.normal, 0.03);
    marker.lookAt(tmpVec.copy(marker.position).add(hit.normal));
    const origin = throwOrigin(target);
    const { v, T } = solveThrow(origin, target);
    const arr = arc.geometry.attributes.position.array;
    for (let k = 0; k < ARC_POINTS; k++) {
      const t = (T * k) / (ARC_POINTS - 1);
      arr[k * 3] = origin.x + v.x * t;
      arr[k * 3 + 1] = origin.y + v.y * t - 0.5 * GRAVITY * t * t;
      arr[k * 3 + 2] = origin.z + v.z * t;
    }
    arc.geometry.attributes.position.needsUpdate = true;
    arc.geometry.computeBoundingSphere();
    arc.computeLineDistances();
    arc.visible = true;
  }

  function hideAim() {
    aim = null;
    marker.visible = false;
    arc.visible = false;
  }

  // ---------- 手榴弾 ----------

  const grenadeGeo = new THREE.SphereGeometry(GRENADE_R, 14, 10);
  const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x3d4f2a });
  const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8);
  const capMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  let grenades = [];

  function throwGrenade() {
    if (!aim || bombsLeft <= 0 || state !== 'play' || cleared) return;
    const origin = throwOrigin(aim);
    const { v, T } = solveThrow(origin, aim);
    const group = new THREE.Group();
    const body = new THREE.Mesh(grenadeGeo, grenadeMat.clone());
    body.castShadow = true;
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = GRENADE_R;
    group.add(body, cap);
    group.position.copy(origin);
    scene.add(group);
    grenades.push({ group, body, pos: origin, vel: v, fuse: T + 0.9, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    bombsLeft--;
    thrown++;
    renderBombs();
    sound.whoosh();
    hideAim();
    $('hint').classList.add('fade');
  }

  function updateGrenades(dt) {
    for (const g of grenades) {
      g.fuse -= dt;
      const sub = 4;
      const h = dt / sub;
      for (let s = 0; s < sub; s++) {
        g.vel.y -= GRAVITY * h;
        for (let a = 0; a < 3; a++) {
          const old = g.pos.getComponent(a);
          const va = g.vel.getComponent(a);
          g.pos.setComponent(a, old + va * h);
          tmpVec.copy(g.pos);
          tmpVec.setComponent(a, tmpVec.getComponent(a) + Math.sign(va) * GRENADE_R);
          if (solidAtWorld(tmpVec.x, tmpVec.y, tmpVec.z)) {
            g.pos.setComponent(a, old);
            g.vel.setComponent(a, -va * 0.3);
            for (let b = 0; b < 3; b++) if (b !== a) g.vel.setComponent(b, g.vel.getComponent(b) * 0.7);
            if (Math.abs(va) > 3) sound.clink();
          }
        }
        if (g.pos.y < GRENADE_R) {
          g.pos.y = GRENADE_R;
          if (g.vel.y < -3) sound.clink();
          g.vel.y = Math.abs(g.vel.y) * 0.3;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
          g.spin.multiplyScalar(0.7);
        }
      }
      g.group.position.copy(g.pos);
      g.group.rotation.x += g.spin.x * dt;
      g.group.rotation.z += g.spin.y * dt;
      // 爆発の直前は赤く点滅する
      const blink = g.fuse < 0.7 && Math.floor(g.fuse * 14) % 2 === 0;
      g.body.material.emissive.setHex(blink ? 0xff2200 : 0x000000);
    }
    const done = grenades.filter((g) => g.fuse <= 0);
    if (done.length) {
      grenades = grenades.filter((g) => g.fuse > 0);
      for (const g of done) {
        scene.remove(g.group);
        g.body.material.dispose();
        explodeAt(g.pos);
      }
    }
  }

  function clearGrenades() {
    for (const g of grenades) {
      scene.remove(g.group);
      g.body.material.dispose();
    }
    grenades = [];
  }

  // ---------- 爆発 ----------

  const flashes = [];
  const flashGeo = new THREE.SphereGeometry(1, 20, 14);
  const boomLight = new THREE.PointLight(0xffa040, 0, 30, 2);
  scene.add(boomLight);

  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const smokes = [];

  function explodeAt(pos) {
    lastBoom = clock;
    const gx = (pos.x - ox) / CELL, gy = pos.y / CELL, gz = (pos.z - oz) / CELL;
    const { removed, fallen } = World.explode(world, gx, gy, gz);

    // 破片が多すぎると重くなるので、こわれたボクセルが多いときは一部だけ破片にする
    const chance = Math.min(1, 450 / Math.max(1, removed.length));
    for (const r of removed) {
      hideCell(r.i);
      if (Math.random() > chance) continue;
      // こわれたブロックは、小さな破片になって外へ飛ぶ
      const wx = ox + (r.x + 0.5) * CELL, wy = (r.y + 0.5) * CELL, wz = oz + (r.z + 0.5) * CELL;
      const dx = wx - pos.x, dy = wy - pos.y, dz = wz - pos.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = (World.RADIUS - r.dist) * 3.2 + Math.random() * 4;
      const color = cellColor(r.i, r.mat);
      spawnDebris(wx, wy, wz, (dx / len) * sp, (dy / len) * sp + 4 + Math.random() * 4, (dz / len) * sp, CELL * (0.5 + Math.random() * 0.5), color, 2.2 + Math.random() * 1.5);
    }
    // 支えを失ったブロックは、2 × 2 × 2 ボクセルずつのかたまりになってくずれ落ちる
    const chunks = new Map();
    for (const f of fallen) {
      hideCell(f.i);
      const key = (f.x >> 1) + ',' + (f.y >> 1) + ',' + (f.z >> 1);
      if (!chunks.has(key)) chunks.set(key, f);
    }
    for (const f of chunks.values()) {
      const wx = ox + ((f.x >> 1) * 2 + 1) * CELL, wy = ((f.y >> 1) * 2 + 1) * CELL, wz = oz + ((f.z >> 1) * 2 + 1) * CELL;
      const dx = wx - pos.x, dz = wz - pos.z;
      const len = Math.hypot(dx, dz) || 1;
      const push = Math.max(0, 6 - len) * 0.5;
      spawnDebris(wx, wy, wz, (dx / len) * push + (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (dz / len) * push + (Math.random() - 0.5) * 1.5, CELL * 1.9, cellColor(f.i, f.mat), 4 + Math.random() * 3);
    }
    house.instanceMatrix.needsUpdate = true;
    pushDebris(pos.x, pos.y, pos.z, 14);

    // ほかの手榴弾も吹き飛ばす
    for (const g of grenades) {
      const d = g.pos.distanceTo(pos);
      if (d < 5 && d > 0.01) g.vel.addScaledVector(tmpVec.subVectors(g.pos, pos).normalize(), (5 - d) * 2.5).y += 2;
    }

    // 光と煙
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 1, depthWrite: false }));
    flash.position.copy(pos);
    scene.add(flash);
    flashes.push({ mesh: flash, t: 0 });
    boomLight.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    boomLight.intensity = 6;
    for (let k = 0; k < 10; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: k < 3 ? 0xffb050 : 0x8a8580, transparent: true, opacity: 0.85, depthWrite: false }));
      sp.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2));
      sp.scale.setScalar(1.5);
      scene.add(sp);
      smokes.push({
        sprite: sp,
        t: 0,
        life: 1.2 + Math.random() * 1.2,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
        grow: 3 + Math.random() * 3,
      });
    }
    // 落ちたブロックが多いと、土ぼこりも立てる
    const dust = Math.min(14, Math.floor(chunks.size / 25));
    for (let k = 0; k < dust; k++) {
      const f = fallen[Math.floor(Math.random() * fallen.length)];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xcbb89a, transparent: true, opacity: 0.6, depthWrite: false }));
      sp.position.set(ox + (f.x + 0.5) * CELL, 0.8, oz + (f.z + 0.5) * CELL);
      sp.scale.setScalar(2);
      scene.add(sp);
      smokes.push({ sprite: sp, t: -0.3 - Math.random() * 0.4, life: 2.5, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2), grow: 4 });
    }

    // 音やゆれの大きさは、以前の1マス (ボクセル8つ) を単位にして決める
    const fallenUnits = fallen.length / 8, removedUnits = removed.length / 8;
    const camDist = camera.position.distanceTo(pos);
    view.shake = Math.min(1.2, 0.5 + fallenUnits / 300) * Math.min(1, 30 / camDist);
    sound.boom(Math.min(1, 0.6 + fallenUnits / 400));
    if (fallenUnits > 30) sound.crumble(Math.min(1, fallenUnits / 300));

    if (fallenUnits > 150) callout('大崩壊!');
    else if (fallenUnits > 40) callout('ガラガラ!');
    else if (removedUnits > 25) callout('ドカーン!');
    updateMeter();
  }

  function updateEffects(dt) {
    for (let k = flashes.length - 1; k >= 0; k--) {
      const f = flashes[k];
      f.t += dt;
      const u = f.t / 0.35;
      f.mesh.scale.setScalar(0.5 + World.RADIUS * 0.9 * Math.min(1, u * 1.6));
      f.mesh.material.opacity = Math.max(0, 1 - u);
      f.mesh.material.color.setHex(u < 0.3 ? 0xfff0a0 : 0xff8030);
      if (u >= 1) {
        scene.remove(f.mesh);
        f.mesh.material.dispose();
        flashes.splice(k, 1);
      }
    }
    for (let k = smokes.length - 1; k >= 0; k--) {
      const s = smokes[k];
      s.t += dt;
      if (s.t < 0) {
        s.sprite.visible = false;
        continue;
      }
      s.sprite.visible = true;
      const u = s.t / s.life;
      s.sprite.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 1.5);
      s.sprite.scale.setScalar(1.5 + s.grow * Math.sqrt(u));
      s.sprite.material.opacity = 0.8 * (1 - u);
      if (u >= 1) {
        scene.remove(s.sprite);
        s.sprite.material.dispose();
        smokes.splice(k, 1);
      }
    }
    boomLight.intensity = Math.max(0, boomLight.intensity - dt * 20);
    view.shake = Math.max(0, view.shake - dt * 2.5);
  }

  function clearEffects() {
    for (const f of flashes) {
      scene.remove(f.mesh);
      f.mesh.material.dispose();
    }
    for (const s of smokes) {
      scene.remove(s.sprite);
      s.sprite.material.dispose();
    }
    flashes.length = 0;
    smokes.length = 0;
    boomLight.intensity = 0;
    view.shake = 0;
  }

  // ---------- 音 ----------

  const sound = (() => {
    let ctx = null;
    let enabled = load(SOUND_KEY, true);
    let noise = null;

    function ready() {
      if (!enabled) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function noiseBurst({ dur, freq, freqEnd, gain, type = 'lowpass', q = 0.7 }) {
      const c = ready();
      if (!c) return;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(c.destination);
      src.start(t, Math.random());
      src.stop(t + dur);
    }

    return {
      get enabled() {
        return enabled;
      },
      toggle() {
        enabled = !enabled;
        save(SOUND_KEY, enabled);
        return enabled;
      },
      unlock: ready,
      boom(size) {
        noiseBurst({ dur: 1.4, freq: 1400, freqEnd: 60, gain: 0.9 * size });
        const c = ready();
        if (!c) return;
        const t = c.currentTime;
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
        const g = c.createGain();
        g.gain.setValueAtTime(0.8 * size, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.7);
      },
      crumble(size) {
        noiseBurst({ dur: 1.8, freq: 700, freqEnd: 120, gain: 0.5 * size, type: 'bandpass', q: 0.8 });
      },
      whoosh() {
        noiseBurst({ dur: 0.25, freq: 600, freqEnd: 2400, gain: 0.25, type: 'bandpass', q: 1.5 });
      },
      clink() {
        noiseBurst({ dur: 0.06, freq: 3200, freqEnd: 1800, gain: 0.12, type: 'bandpass', q: 4 });
      },
      fanfare() {
        const c = ready();
        if (!c) return;
        const t = c.currentTime;
        [523, 659, 784, 1047].forEach((hz, k) => {
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.value = hz;
          const g = c.createGain();
          g.gain.setValueAtTime(0, t + k * 0.12);
          g.gain.linearRampToValueAtTime(0.08, t + k * 0.12 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.12 + (k === 3 ? 0.6 : 0.2));
          o.connect(g).connect(c.destination);
          o.start(t + k * 0.12);
          o.stop(t + k * 0.12 + 0.7);
        });
      },
    };
  })();

  const soundBtn = $('sound-btn');
  soundBtn.setAttribute('aria-pressed', String(sound.enabled));
  soundBtn.addEventListener('click', () => soundBtn.setAttribute('aria-pressed', String(sound.toggle())));

  // ---------- 画面の文字 ----------

  let calloutTimer = 0;
  function callout(text) {
    const el = $('callout');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(calloutTimer);
    calloutTimer = setTimeout(() => el.classList.remove('show'), 1200);
  }

  function updateMeter() {
    const ratio = World.destroyedRatio(world);
    const pct = Math.floor(ratio * 100);
    $('meter-fill').style.width = `${Math.min(100, ratio * 100)}%`;
    $('meter-text').textContent = `こわした割合 ${pct}%`;
    $('meter-fill').parentElement.classList.toggle('done', ratio >= GOAL);
  }

  function renderBombs() {
    const total = STAGES[stageIndex].grenades;
    const el = $('hud-bombs');
    el.innerHTML = '';
    // 数が多いときは、アイコンを並べずに数で出す
    if (total > 10) {
      el.textContent = `💣 × ${bombsLeft}`;
    } else {
      for (let k = 0; k < total; k++) {
        const s = document.createElement('span');
        s.textContent = '💣';
        if (k >= bombsLeft) s.className = 'used';
        el.appendChild(s);
      }
    }
    el.setAttribute('aria-label', `のこりの手榴弾 ${bombsLeft}個`);
  }

  // ---------- ステージ ----------

  let state = 'menu';
  let stageIndex = 0;
  let bombsLeft = 0;
  let thrown = 0;
  let cleared = false;
  let resultAt = 0;
  let lastBoom = 0;
  let clock = 0;
  let stars = load(STARS_KEY, []);
  if (!Array.isArray(stars)) stars = [];

  function starText(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function unlocked(k) {
    return k === 0 || stars[k - 1] > 0;
  }

  // ワールドごとに、10ステージのタイルを並べる
  function renderMenu() {
    const list = $('stage-list');
    list.innerHTML = '';
    let next = null;
    WORLDS.forEach((w, wi) => {
      const ks = STAGES.map((st, k) => k).filter((k) => STAGES[k].world === wi);
      const got = ks.reduce((n, k) => n + (stars[k] || 0), 0);
      const sec = document.createElement('section');
      sec.className = 'world';
      sec.innerHTML = `<h3 class="world-head"><span class="world-no">ワールド${wi + 1}</span><span class="world-name"></span><span class="world-stars">★ ${got} / ${ks.length * 3}</span></h3><ol class="tiles"></ol>`;
      sec.querySelector('.world-name').textContent = w.name;
      const ol = sec.querySelector('.tiles');
      for (const k of ks) {
        const st = STAGES[k];
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile';
        const open = unlocked(k);
        btn.disabled = !open;
        btn.innerHTML = '<span class="tile-no"></span><span class="tile-name"></span><span class="tile-stars"></span>';
        btn.querySelector('.tile-no').textContent = k + 1;
        btn.querySelector('.tile-name').textContent = open ? st.name : '???';
        btn.querySelector('.tile-stars').textContent = open ? starText(stars[k] || 0) : '🔒';
        btn.title = open ? `${st.name}: ${st.sub} (手榴弾 ${st.grenades}個)` : '前のステージをクリアすると遊べます';
        btn.setAttribute('aria-label', open ? `ステージ${k + 1} ${st.name} ${st.sub} 手榴弾${st.grenades}個 星${stars[k] || 0}` : `ステージ${k + 1} まだ遊べません`);
        if (open && !(stars[k] > 0) && next === null) {
          next = btn;
          btn.classList.add('next');
        }
        btn.addEventListener('click', () => startStage(k));
        li.appendChild(btn);
        ol.appendChild(li);
      }
      list.appendChild(sec);
    });
    // 次に遊ぶステージが見えるところまでスクロールする
    if (next) requestAnimationFrame(() => next.scrollIntoView({ block: 'center' }));
  }

  function showMenu() {
    stageTrack.quit();
    state = 'menu';
    hideAim();
    renderMenu();
    $('menu').hidden = false;
    $('result').hidden = true;
    $('hud').hidden = true;
    $('hud-actions').hidden = true;
    $('hint').hidden = true;
  }

  function startStage(k) {
    sound.unlock();
    stageIndex = k;
    world = World.createWorld(k);
    applyTheme(STAGES[k]);
    clearGrenades();
    clearDebris();
    clearEffects();
    buildHouse();
    frameStage();
    bombsLeft = STAGES[k].grenades;
    thrown = 0;
    cleared = false;
    resultAt = 0;
    lastBoom = clock;
    state = 'play';
    $('menu').hidden = true;
    $('result').hidden = true;
    $('hud').hidden = false;
    $('hud-actions').hidden = false;
    $('hint').hidden = false;
    $('hint').classList.remove('fade');
    $('hud-stage').textContent = `ステージ ${k + 1} ・ ${STAGES[k].name}`;
    renderBombs();
    updateMeter();
    track('voxel_grenade_start', { stage: k + 1 });
    stageTrack.start(k + 1);
  }

  function checkEnd() {
    if (state !== 'play') return;
    const ratio = World.destroyedRatio(world);
    if (!cleared && ratio >= GOAL) {
      cleared = true;
      resultAt = clock + 2.2;
      // 結果の画面が出る前にやり直しても、クリアしたことは残す
      stageTrack.clear({ destroyed_pct: Math.floor(ratio * 100), grenades: thrown });
      callout('ステージクリア!');
      sound.fanfare();
      hideAim();
    }
    if (!cleared && bombsLeft === 0 && grenades.length === 0 && !resultAt) {
      resultAt = clock + 2;
    }
    if (resultAt && clock >= resultAt) showResult();
  }

  function showResult() {
    state = 'result';
    const ratio = World.destroyedRatio(world);
    const pct = Math.floor(ratio * 100);
    const total = STAGES[stageIndex].grenades;
    const win = ratio >= GOAL;
    $('result-title').textContent = win ? 'ステージクリア!' : 'くずしきれなかった…';
    let n = 0;
    if (win) {
      n = 1 + (ratio >= 0.95 ? 1 : 0) + (bombsLeft >= Math.ceil(total * 0.3) ? 1 : 0);
      if (n > (stars[stageIndex] || 0)) {
        stars[stageIndex] = n;
        save(STARS_KEY, stars);
      }
      track('voxel_grenade_clear', { stage: stageIndex + 1, stars: n, grenades: thrown });
    } else {
      stageTrack.fail({ destroyed_pct: pct, grenades: thrown });
    }
    $('result-stars').innerHTML = win ? '★'.repeat(n) + `<span class="off">${'★'.repeat(3 - n)}</span>` : '';
    $('result-stars').hidden = !win;
    $('result-text').innerHTML = win
      ? `こわした割合 <strong>${pct}%</strong> ・ 使った手榴弾 ${thrown}個 / ${total}個<br />★2: 95%以上こわす ・ ★3: 手榴弾を${Math.ceil(total * 0.3)}個以上のこす`
      : `こわした割合 <strong>${pct}%</strong> (クリアは80%以上)<br />壁や柱の根元をこわすと、上がまとめてくずれ落ちます。`;
    const hasNext = win && stageIndex < STAGES.length - 1;
    $('next-btn').hidden = !hasNext;
    if (win && stageIndex === STAGES.length - 1) $('result-text').innerHTML += '<br />全ステージ制覇! おめでとう!';
    $('result').hidden = false;
    $('hud-actions').hidden = true;
    hideAim();
  }

  $('next-btn').addEventListener('click', () => startStage(stageIndex + 1));
  $('again-btn').addEventListener('click', () => startStage(stageIndex));
  $('result-menu-btn').addEventListener('click', showMenu);
  $('retry-btn').addEventListener('click', () => startStage(stageIndex));
  $('menu-btn').addEventListener('click', showMenu);

  // ---------- 操作 ----------

  const pointers = new Map();
  let drag = null; // { x, y, moved }
  let pinch = 0;

  canvas.addEventListener('pointerdown', (e) => {
    sound.unlock();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
      hideAim();
      return;
    }
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    updateAim(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoom(pinch / dist);
      pinch = dist;
      return;
    }
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) {
        drag.moved = true;
        hideAim();
      }
      if (drag.moved) {
        view.theta -= (e.clientX - drag.x) * 0.008;
        view.phi = Math.min(1.25, Math.max(0.08, view.phi + (e.clientY - drag.y) * 0.005));
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') updateAim(e.clientX, e.clientY);
  });

  function endPointer(e, canceled) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && !drag.moved && !canceled) {
      updateAim(e.clientX, e.clientY);
      throwGrenade();
      // マウスなら、投げたあとも次のねらいを出しておく
      if (e.pointerType === 'mouse') setTimeout(() => updateAim(e.clientX, e.clientY), 300);
    }
    drag = null;
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !drag) hideAim();
  });

  function zoom(f) {
    if (!world) return;
    view.dist = Math.min(view.maxDist, Math.max(view.minDist, view.dist * f));
  }
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(Math.exp(e.deltaY * 0.001));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (state !== 'play') return;
    if (e.key === 'ArrowLeft') view.theta += 0.08;
    else if (e.key === 'ArrowRight') view.theta -= 0.08;
    else if (e.key === 'ArrowUp') view.phi = Math.min(1.25, view.phi + 0.05);
    else if (e.key === 'ArrowDown') view.phi = Math.max(0.08, view.phi - 0.05);
    else return;
    e.preventDefault();
  });

  // ---------- ループ ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (world) {
      if (state === 'menu') view.theta += dt * 0.12; // 選ぶ画面のうしろで、家をゆっくり回す
      updateGrenades(dt);
      updateDebris(dt);
      updateEffects(dt);
      checkEnd();
    }
    placeCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  // 最初の画面のうしろに、1つめの家を出しておく
  world = World.createWorld(0);
  applyTheme(STAGES[0]);
  buildHouse();
  frameStage();
  showMenu();
  requestAnimationFrame(frame);

  // 動作確認用 (コンソールから)
  window.__voxelGrenade = {
    get state() {
      return state;
    },
    get ratio() {
      return World.destroyedRatio(world);
    },
    explodeAt: (x, y, z) => explodeAt(new THREE.Vector3(x, y, z)),
    start: (k) => startStage(k),
  };
})();
