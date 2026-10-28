/* ピン: 物理の体と見た目をまとめた入れ物。ステージごとに使う分だけ並べる */
import { PIN_MASS, PIN_COM, MAX_PINS, DECK_END, LANE_HALF } from '../config.js';
import { scene } from '../render/renderer.js';
import { pinGeo, pinMat } from '../render/models.js';
import { world, M, toY } from '../physics/world.js';

// ピンは3つの円すい台を重ねた形で近似する
function pinPart(body, rBottom, rTop, yBottom, yTop) {
  const h = yTop - yBottom;
  body.addShape(new CANNON.Cylinder(rTop, rBottom, h, 10), new CANNON.Vec3(0, (yBottom + yTop) / 2 - PIN_COM, 0), toY);
}

export const pins = [];
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

// ステージのピンの置き場所を決める (floorTopAt で、置く台の高さを調べる)
export function assignPins(defs, floorTopAt) {
  pins.forEach((p, k) => {
    const def = defs[k];
    p.used = Boolean(def);
    if (def) {
      p.home = { x: def.x, z: def.z };
      p.baseY = def.y ?? floorTopAt(def.x, def.z);
    }
  });
}

// ピンを立てる。onlyStanding なら、立っているピンだけをその場で起こし直す (機械がつかんで置き直すイメージ)
export function rackPins(onlyStanding) {
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
      b.position.set(b.position.x, p.baseY + PIN_COM + 0.002, b.position.z);
    }
    b.quaternion.set(0, 0, 0, 1);
    b.velocity.setZero();
    b.angularVelocity.setZero();
    // 眠っている体は物理が更新しないので、当たり判定の箱と回りにくさを、置いた姿勢で作り直しておく。
    // そうしないと、前のステージで倒れた位置のままの箱が残り、ボールがすり抜けてしまう
    b.aabbNeedsUpdate = true;
    b.updateInertiaWorld(true);
    if (!p.active) {
      world.addBody(b);
      p.active = true;
    }
    p.mesh.visible = true;
    b.sleep();
  }
}

// 立っているピン: 傾きが約30度以内で、置かれた台の高さに残っているもの。
// レーンのワールド (laneOnly) では、ガターに落ちたピンは倒れた扱い
const upVec = new CANNON.Vec3();
const yAxis = new CANNON.Vec3(0, 1, 0);
export function isStanding(p, laneOnly) {
  if (!p.active) return false;
  const b = p.body;
  b.quaternion.vmult(yAxis, upVec);
  if (upVec.y < 0.85 || b.position.y < p.baseY + PIN_COM - 0.04 || b.position.z < DECK_END) return false;
  return !laneOnly || Math.abs(b.position.x) < LANE_HALF + 0.02;
}

export const countStanding = (laneOnly) => pins.filter((p) => isStanding(p, laneOnly)).length;

// 倒れたピンを片付ける
export function clearFallen(laneOnly) {
  for (const p of pins) {
    if (p.active && !isStanding(p, laneOnly)) {
      world.remove(p.body);
      p.active = false;
      p.mesh.visible = false;
    }
  }
}

// ピンがみんな止まったか
export const pinsQuiet = () => pins.every((p) => !p.active || p.body.sleepState === CANNON.Body.SLEEPING
  || (p.body.velocity.length() < 0.06 && p.body.angularVelocity.length() < 0.4));

// 見た目を物理に合わせる。ずっと下まで落ちたピンは止めておく
export function syncPins(killY) {
  for (const p of pins) {
    if (!p.active) continue;
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
    if (p.body.position.y < killY - 1) {
      p.body.velocity.setZero();
      p.body.sleep();
    }
  }
}
