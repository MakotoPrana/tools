/* ボール: 物理の体と見た目 */
import { BALL_R, BALL_MASS, START_Z } from '../config.js';
import { rand } from '../util.js';
import { scene } from '../render/renderer.js';
import { ballTexture } from '../render/textures.js';
import { world, M } from '../physics/world.js';

export const ballBody = new CANNON.Body({ mass: BALL_MASS, material: M.ball, linearDamping: 0.01, angularDamping: 0.02 });
ballBody.addShape(new CANNON.Sphere(BALL_R));
ballBody.allowSleep = false;
world.addBody(ballBody);

export const ballMat = new THREE.MeshPhongMaterial({ shininess: 140, specular: 0x8888aa });
export const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 36, 24), ballMat);
ballMesh.castShadow = true;
scene.add(ballMesh);

// ボールの色 (マーブル模様) はワールドごとに変える
export function setBallColors(colors) {
  if (ballMat.map) ballMat.map.dispose();
  ballMat.map = ballTexture(colors);
  ballMat.needsUpdate = true;
}

// 投げる位置に置き直す
export function placeBall(x) {
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.quaternion.setFromEuler(rand(0, 6), rand(0, 6), 0);
  ballBody.position.set(x, BALL_R, START_Z);
  ballBody.aabbNeedsUpdate = true;
  ballBody.collisionFilterMask = -1;
  ballMesh.visible = true;
}

// 投げる。転がりながら手を離れる (すべるだけだと摩擦で一気に遅くなる)。
// 横回転はかけない (かけると手前から曲がり始めてしまう)。カーブは奥でかける力で表す
export function launchBall(x, speed, angle) {
  ballBody.position.set(x, BALL_R, START_Z);
  ballBody.velocity.set(Math.sin(angle) * speed, 0, -Math.cos(angle) * speed);
  ballBody.angularVelocity.set(-speed / BALL_R, 0, 0);
}

// 回転を、いま進んでいる向きに転がる回転に合わせる (跳ね返ったあとやワープのあと)
export function rollWithVelocity() {
  const v = ballBody.velocity;
  ballBody.angularVelocity.set(v.z / BALL_R, 0, -v.x / BALL_R);
}

// 見た目を物理に合わせる
export function syncBall(hidden) {
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
  ballMesh.visible = !hidden;
}

// 投げる前は、投げる位置に止めておく
export function holdBall(x) {
  ballBody.position.set(x, BALL_R, START_Z);
}
