/*
 * ステージの組み立て: stages.js の書き方から、仕掛けの見た目と物理を作る
 *   置ける仕掛けの一覧は data/stages.js の冒頭のコメント
 */
import { LANE_W, LANE_HALF, HEAD_Z, VOID_GROUND } from '../config.js';
import { scene, deckLight } from '../render/renderer.js';
import { rampTex, tireTex, kerbTex, beltTex, haloTex } from '../render/textures.js';
import {
  phong, sideMat, wallMat, moverMat, deflectMat, railMat, bumperMat, bumperTopMat, spinnerMat, holeMat, rimMat, disposeTree,
} from '../render/materials.js';
import { pinGeo, TREASURE_GEO, TREASURE_GEOS, TREASURE_KINDS } from '../render/models.js';
import { world, M, toY } from '../physics/world.js';
import { env } from '../world/environment.js';

const stageGroup = new THREE.Group();
scene.add(stageGroup);
let stageBodies = [];

// いまのステージの仕掛けと宝物
//   killY: ボールがここより下に落ちたら、その投球はおしまい
//   pinCenter: ピンの真ん中 (x, z)、いちばん手前の z (front)、置いた高さ (y)。カメラとライトが使う
export const stage = {
  holes: [],
  movers: [],
  spinners: [],
  portals: [],
  conveyors: [],
  bumpers: new Map(),
  floors: [],
  treasure: null,
  moverClock: 0,
  animTextures: [],
  killY: -0.6,
  pinCenter: { x: 0, z: HEAD_Z, front: HEAD_Z, y: 0 },
};

function addStatic(body) {
  world.addBody(body);
  stageBodies.push(body);
  return body;
}

function addMesh(mesh, parent = stageGroup) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function clearStage() {
  for (const b of stageBodies) world.remove(b);
  stageBodies = [];
  disposeTree(stageGroup, new Set([pinGeo, ...TREASURE_GEOS, env.floorMat]));
  stageGroup.clear();
  stage.holes = [];
  stage.movers = [];
  stage.spinners = [];
  stage.portals = [];
  stage.conveyors = [];
  stage.bumpers = new Map();
  stage.floors = [];
  stage.treasure = null;
  stage.animTextures = [];
}

// 床の模様を、台の大きさに合わせてくり返す
function surfaceMat(w, d) {
  const tex = env.floorTex.clone();
  tex.needsUpdate = true;
  const unit = env.theme.surface === 'beam' ? 0.3 : env.theme.surface === 'wood' ? LANE_W : 1;
  tex.repeat.set(Math.max(w / unit, 0.2), Math.max(d / unit, 0.2));
  return phong({ map: tex, shininess: env.theme.surface === 'ice' ? 120 : 40, specular: 0x333333 });
}
const sideColorMat = () => phong({ color: env.theme.side, shininess: 30 });

// 斜面: 手前の端が y0 (ふつうは床の面 0) にそろうように、傾けた板を置く
function addRamp(r) {
  const th = (r.angle * Math.PI) / 180;
  const t = 0.02;
  const y0 = r.y0 || 0;
  const top = new THREE.Vector3(r.x, y0 + (r.len / 2) * Math.sin(th), r.z - (r.len / 2) * Math.cos(th));
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
  const topMat = phong({ map: tex, shininess: 50 });
  const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, t * 2, r.len), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]));
  mesh.position.copy(c);
  mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th);

  // 奥の端を支える柱
  const h = r.len * Math.sin(th);
  const zBack = r.z - r.len * Math.cos(th);
  if (h > 0.05) {
    const support = new CANNON.Body({ mass: 0, material: M.wall });
    support.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, (h - 0.02) / 2, 0.02)));
    support.position.set(r.x, y0 + (h - 0.02) / 2, zBack + 0.03);
    addStatic(support);
    const leg = addMesh(new THREE.Mesh(new THREE.BoxGeometry(r.w, h - 0.02, 0.04), sideMat));
    leg.position.set(r.x, y0 + (h - 0.02) / 2, zBack + 0.03);
  }
}

function addBlock(b, kind) {
  const body = new CANNON.Body({
    mass: 0,
    material: b.bouncy ? M.rail : M.wall,
    type: kind === 'mover' ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
  });
  const y0 = b.y0 || 0;
  body.addShape(new CANNON.Box(new CANNON.Vec3(b.w / 2, b.h / 2, b.d / 2)));
  body.position.set(b.x, y0 + b.h / 2, b.z);
  if (b.rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), b.rotY);
  addStatic(body);
  let mat = wallMat;
  if (b.bouncy) mat = deflectMat;
  if (kind === 'mover') mat = moverMat;
  const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat));
  mesh.position.set(b.x, y0 + b.h / 2, b.z);
  if (b.rotY) mesh.rotation.y = b.rotY;
  if (kind === 'mover') stage.movers.push({ def: b, body, mesh });
}

// 台 (ピンを乗せる台、平均台、階段の段)。top が上面の高さ
function addFloor(f) {
  const th = f.th || (env.theme.kind === 'void' ? 0.2 : Math.max(f.top, 0.02));
  const top = f.top || 0;
  const body = new CANNON.Body({ mass: 0, material: M.lane });
  body.addShape(new CANNON.Box(new CANNON.Vec3(f.w / 2, th / 2, f.d / 2)));
  body.position.set(f.x, top - th / 2, f.z);
  if (f.rotY) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), f.rotY);
  addStatic(body);
  const side = sideColorMat();
  const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(f.w, th, f.d), [side, side, surfaceMat(f.w, f.d), side, side, side]));
  mesh.position.set(f.x, top - th / 2, f.z);
  if (f.rotY) mesh.rotation.y = f.rotY;
  stage.floors.push({ ...f, top });
  // 床のないワールドでは、台を支える脚を地面まで伸ばす
  if (env.theme.kind === 'void') {
    const legH = top - th - VOID_GROUND;
    const ends = f.d > 1.2 ? [-f.d / 2 + 0.3, f.d / 2 - 0.3] : [0];
    for (const dz of ends) {
      const leg = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, legH, 8), side));
      const ca = Math.cos(f.rotY || 0);
      const sa = Math.sin(f.rotY || 0);
      leg.position.set(f.x + sa * dz, VOID_GROUND + legH / 2, f.z + ca * dz);
    }
  }
}

// 床の高さ (台の上ならその上面)。ピンを置く高さを決めるのに使う
export function floorTopAt(x, z) {
  let top = env.theme.kind === 'void' ? -Infinity : 0;
  for (const f of stage.floors) {
    const a = f.rotY || 0; // 台の向きに合わせて、点を台の座標に直す
    const dx = x - f.x;
    const dz = z - f.z;
    const lx = dx * Math.cos(a) - dz * Math.sin(a);
    const lz = dx * Math.sin(a) + dz * Math.cos(a);
    if (Math.abs(lx) <= f.w / 2 && Math.abs(lz) <= f.d / 2) top = Math.max(top, f.top);
  }
  return top === -Infinity ? 0 : top;
}

// 壁の1区間 (2点を結ぶ)
function addWall(w) {
  const dx = w.x2 - w.x1;
  const dz = w.z2 - w.z1;
  const len = Math.hypot(dx, dz);
  const h = w.h || 0.25;
  const t = w.t || 0.08;
  const y0 = w.y0 || 0;
  const rot = Math.atan2(dx, dz);
  const material = w.tire ? M.tire : w.bouncy ? M.rail : M.wall;
  const body = new CANNON.Body({ mass: 0, material });
  body.addShape(new CANNON.Box(new CANNON.Vec3(t / 2, h / 2, len / 2 + t / 2)));
  body.position.set((w.x1 + w.x2) / 2, y0 + h / 2, (w.z1 + w.z2) / 2);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rot);
  addStatic(body);
  let mat;
  if (w.tire) {
    const tex = tireTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, len / 0.5);
    mat = phong({ map: tex, shininess: 20 });
  } else if (w.bouncy) {
    mat = deflectMat;
  } else {
    mat = env.theme.kind === 'void' ? sideColorMat() : wallMat;
  }
  const mesh = addMesh(new THREE.Mesh(new THREE.BoxGeometry(t, h, len + t), mat));
  mesh.position.set((w.x1 + w.x2) / 2, y0 + h / 2, (w.z1 + w.z2) / 2);
  mesh.rotation.y = rot;
}

// サーキットのコース: 中心線の点列と幅から、両側のタイヤの壁と路面を作る
function addTrack(tr) {
  const pts = tr.pts;
  const half = tr.w / 2;
  const normals = pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    return [-dz / l, dx / l]; // 進む向きの右手側 (-z へ進むと +x)
  });
  for (const side of [-1, 1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const n0 = normals[i];
      const n1 = normals[i + 1];
      addWall({
        x1: p[0] + side * n0[0] * (half + 0.05), z1: p[1] + side * n0[1] * (half + 0.05),
        x2: q[0] + side * n1[0] * (half + 0.05), z2: q[1] + side * n1[1] * (half + 0.05),
        h: 0.3, t: 0.1, tire: true,
      });
    }
  }
  // 路面 (少し明るいアスファルトと、ふちの赤白の縁石)
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const rot = Math.atan2(q[0] - p[0], q[1] - p[1]);
    const road = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(tr.w, len + 0.02), phong({ color: 0x4a4d55, shininess: 10 })));
    road.rotation.order = 'YXZ';
    road.rotation.y = rot;
    road.rotation.x = -Math.PI / 2;
    road.position.set((p[0] + q[0]) / 2, 0.001, (p[1] + q[1]) / 2);
    road.castShadow = false;
    for (const side of [-1, 1]) {
      const tex = kerbTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, len / 0.4);
      const kerb = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.06, len + 0.02), new THREE.MeshBasicMaterial({ map: tex })));
      kerb.rotation.order = 'YXZ';
      kerb.rotation.y = rot;
      kerb.rotation.x = -Math.PI / 2;
      const nx = Math.cos(rot) * side * (half - 0.03);
      const nz = -Math.sin(rot) * side * (half - 0.03);
      kerb.position.set((p[0] + q[0]) / 2 + nx, 0.002, (p[1] + q[1]) / 2 + nz);
      kerb.castShadow = false;
    }
  }
}

function addHole(h) {
  stage.holes.push(h);
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

// ピンボールのバンパー: 当たったボールをはじき返す丸い柱
function addBumper(b) {
  const r = b.r || 0.12;
  const y0 = b.y0 ?? floorTopAt(b.x, b.z);
  const body = new CANNON.Body({ mass: 0, material: M.rail });
  body.addShape(new CANNON.Cylinder(r, r, 0.3, 16), new CANNON.Vec3(0, 0, 0), toY);
  body.position.set(b.x, y0 + 0.15, b.z);
  addStatic(body);
  stage.bumpers.set(body, b.kick ?? 2.5);
  const mesh = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 24), bumperMat));
  mesh.position.set(b.x, y0 + 0.15, b.z);
  const cap = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.02, 24), bumperTopMat));
  cap.position.set(b.x, y0 + 0.31, b.z);
}

// 回転するバー (中心のまわりを回り続ける)
function addSpinner(s) {
  const y0 = s.y0 ?? floorTopAt(s.x, s.z);
  const body = new CANNON.Body({ mass: 0, material: M.rail, type: CANNON.Body.KINEMATIC });
  body.addShape(new CANNON.Box(new CANNON.Vec3(s.len / 2, 0.1, 0.035)));
  body.position.set(s.x, y0 + 0.1, s.z);
  addStatic(body);
  const group = new THREE.Group();
  group.position.set(s.x, y0, s.z);
  const bar = addMesh(new THREE.Mesh(new THREE.BoxGeometry(s.len, 0.2, 0.07), spinnerMat), group);
  bar.position.y = 0.1;
  const hub = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), bumperTopMat), group);
  hub.position.y = 0.13;
  stageGroup.add(group);
  stage.spinners.push({ def: s, body, group });
}

// ワープゲート: a に入ったボールを b から出す。dir があればその向き (度、0 が奥、+ が右) へ出す
function addPortal(p) {
  const r = p.r || 0.2;
  const pair = { ...p, r, ay: floorTopAt(p.a[0], p.a[1]), by: floorTopAt(p.b[0], p.b[1]) };
  stage.portals.push(pair);
  for (const [end, color] of [['a', 0x2de2ff], ['b', 0xff8a3d]]) {
    const [x, z] = pair[end];
    const y = end === 'a' ? pair.ay : pair.by;
    const ring = addMesh(new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 10, 40), new THREE.MeshBasicMaterial({ color })));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.02, z);
    const disc = addMesh(new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, y + 0.004, z);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(r * 3, r * 2, 1);
    glow.position.set(x, y + 0.15, z);
    stageGroup.add(glow);
    pair[`${end}Ring`] = ring;
  }
}

// ベルトコンベア: 上を転がるボールを fx, fz (N) の向きに押す
function addConveyor(c) {
  stage.conveyors.push(c);
  const tex = beltTex.clone();
  tex.needsUpdate = true;
  const along = Math.abs(c.fx) > Math.abs(c.fz);
  // 矢印の模様は画像の上向き (= 奥向き)。押す向きに合わせて板を回す
  const angle = Math.atan2(c.fx, -c.fz);
  const len = along ? c.w : c.d;
  const wid = along ? c.d : c.w;
  tex.repeat.set(Math.max(1, Math.round(wid / 0.3)), len / 0.3);
  const group = new THREE.Group();
  group.position.set(c.x, 0.003, c.z);
  group.rotation.y = -angle;
  const belt = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(wid, len), phong({ map: tex, shininess: 30 })), group);
  belt.rotation.x = -Math.PI / 2;
  belt.castShadow = false;
  stageGroup.add(group);
  stage.animTextures.push({ tex, speed: Math.hypot(c.fx, c.fz) / 40 });
}

export function addTreasure(tdef, owned) {
  const [shape, color] = TREASURE_KINDS[tdef.kind] || TREASURE_KINDS.coinG;
  const mat = phong({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.35),
    specular: 0xffffff,
    shininess: 140,
    transparent: true,
    opacity: owned ? 0.4 : 1,
    side: shape === 'flag' || shape === 'crown' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(TREASURE_GEO[shape], mat);
  if (shape === 'pin') mesh.position.y = -0.02;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity: owned ? 0.25 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.42);
  group.add(halo, mesh);
  group.position.set(tdef.x, tdef.y, tdef.z);
  stageGroup.add(group);
  stage.treasure = { def: tdef, group, mesh, halo, taken: false, owned, burst: 0 };
}

export function setMovers(withVelocity) {
  for (const m of stage.movers) {
    const w = (Math.PI * 2) / m.def.period;
    m.body.position.x = m.def.x + m.def.range * Math.sin(stage.moverClock * w + (m.def.phase || 0));
    m.body.velocity.x = withVelocity ? m.def.range * w * Math.cos(stage.moverClock * w + (m.def.phase || 0)) : 0;
  }
  for (const s of stage.spinners) {
    const a = (s.def.phase || 0) + s.def.speed * stage.moverClock;
    s.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), a);
    s.body.angularVelocity.set(0, withVelocity ? s.def.speed : 0, 0);
  }
}

export function inHole(h, x, z) {
  const m = 0.03; // ボールの中心が少し入りこんだら落ちる
  if (h.r) return Math.hypot(x - h.x, z - h.z) < h.r - m;
  return Math.abs(x - h.x) < h.w / 2 - m && Math.abs(z - h.z) < h.d / 2 - m;
}

export function buildStage(st) {
  clearStage();
  (st.floors || []).forEach(addFloor);
  (st.platforms || []).forEach((p) => addFloor({ x: p.x, z: p.z, w: p.w, d: p.d, top: p.h, th: p.h }));
  (st.ramps || []).forEach(addRamp);
  (st.blocks || []).forEach((b) => addBlock(b, 'block'));
  (st.movers || []).forEach((b) => addBlock(b, 'mover'));
  (st.walls || []).forEach(addWall);
  if (st.track) addTrack(st.track);
  (st.holes || []).forEach(addHole);
  (st.rails || []).forEach(addRail);
  (st.bumpers || []).forEach(addBumper);
  (st.spinners || []).forEach(addSpinner);
  (st.portals || []).forEach(addPortal);
  (st.conveyors || []).forEach(addConveyor);
  stage.moverClock = 0;
  setMovers(false);
  const lowest = Math.min(0, ...stage.floors.map((f) => f.top));
  stage.killY = env.theme.kind === 'void' ? lowest - 0.6 : -0.6;
  const xs = st.pins.map((p) => p.x);
  const zs = st.pins.map((p) => p.z);
  stage.pinCenter = {
    x: xs.reduce((a, b) => a + b, 0) / xs.length,
    z: zs.reduce((a, b) => a + b, 0) / zs.length,
    front: Math.max(...zs),
    y: Math.max(0, ...st.pins.map((p) => (p.y ?? floorTopAt(p.x, p.z)))),
  };
  deckLight.position.set(stage.pinCenter.x, stage.pinCenter.y + 2.4, stage.pinCenter.front + 1.8);
  deckLight.target.position.set(stage.pinCenter.x, stage.pinCenter.y, stage.pinCenter.z - 0.3);
}

// 仕掛けの動き (ベルトコンベアの模様、ワープゲートの輪、宝物)
export function animateStage(dt) {
  for (const a of stage.animTextures) a.tex.offset.y += a.speed * dt;
  for (const p of stage.portals) {
    p.aRing.rotation.z += dt * 2;
    p.bRing.rotation.z -= dt * 2;
  }
  for (const m of stage.movers) m.mesh.position.copy(m.body.position);
  for (const s of stage.spinners) s.group.quaternion.copy(s.body.quaternion);
  const tr = stage.treasure;
  if (!tr) return;
  const time = performance.now() / 1000;
  tr.mesh.rotation.y += dt * 2.2;
  tr.group.position.y = tr.def.y + Math.sin(time * 2.4) * 0.015;
  if (tr.burst > 0) {
    // 取った瞬間にふくらんで消える
    tr.burst += dt;
    const k = Math.min(Math.max(tr.burst / 0.45, 0), 1);
    tr.group.scale.setScalar(1 + k * 1.6);
    tr.mesh.material.opacity = (tr.owned ? 0.4 : 1) * (1 - k);
    tr.halo.material.opacity = 0.9 * (1 - k);
    if (k >= 1) {
      tr.group.visible = false;
      tr.burst = 0;
    }
  }
}
