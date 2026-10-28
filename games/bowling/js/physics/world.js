/* cannon.js の物理の世界: 重力、材質の組み合わせ (摩擦と反発) */
import { PHYS_DEFAULT } from '../render/themes.js';

export const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 14;
world.allowSleep = true;

export const M = {
  lane: new CANNON.Material('lane'),
  ball: new CANNON.Material('ball'),
  pin: new CANNON.Material('pin'),
  wall: new CANNON.Material('wall'),
  rail: new CANNON.Material('rail'),
  tire: new CANNON.Material('tire'),
};
const contact = (a, b, friction, restitution) => {
  const cm = new CANNON.ContactMaterial(a, b, { friction, restitution });
  world.addContactMaterial(cm);
  return cm;
};
const cmBallLane = contact(M.ball, M.lane, 0.05, 0.02);
const cmPinLane = contact(M.pin, M.lane, 0.35, 0.15);
contact(M.ball, M.pin, 0.12, 0.3);
contact(M.pin, M.pin, 0.2, 0.5);
contact(M.pin, M.wall, 0.2, 0.35);
contact(M.ball, M.wall, 0.1, 0.15);
// 反射板とバンパーはよく跳ね返す。サーキットのタイヤはそこそこ
contact(M.ball, M.rail, 0.02, 0.75);
contact(M.pin, M.rail, 0.2, 0.6);
contact(M.ball, M.tire, 0.05, 0.45);
contact(M.pin, M.tire, 0.2, 0.4);

// cannon の円柱は z 軸向きなので、y 軸向きに立てるときはこの向きで置く
export const toY = new CANNON.Quaternion();
toY.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);

// ワールドの物理 (重力、床の摩擦、カーブの効き、ピンが止まるまで待つ秒数)
export let phys = { ...PHYS_DEFAULT };

export function applyPhysics(themePhys) {
  phys = { ...PHYS_DEFAULT, ...(themePhys || {}) };
  world.gravity.set(0, -phys.gravity, 0);
  cmBallLane.friction = phys.ballFric;
  cmPinLane.friction = phys.pinFric;
}

// 動かない箱を物理の世界に置く
export function staticBox(material, hx, hy, hz, x, y, z, group) {
  const body = new CANNON.Body({ mass: 0, material });
  body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
  body.position.set(x, y, z);
  if (group) body.collisionFilterGroup = group;
  world.addBody(body);
  return body;
}
