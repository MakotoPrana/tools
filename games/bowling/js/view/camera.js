/*
 * カメラとライトの動き
 *   メニュー中はピンのまわりをゆっくり回る。ステージの最初はピンの手前から投げる位置まで引いてくる。
 *   投げたらボールを追いかけ、ピンに近づいたらピンを映す。影のライトは注目している場所の上へ
 */
import { BALL_R, HEAD_Z, START_Z, PREVIEW_MS } from '../config.js';
import { clamp } from '../util.js';
import { game, shot, isMenu } from '../state.js';
import { camera, camPos, camLook, sun } from '../render/renderer.js';
import { ballBody } from '../entities/ball.js';
import { env } from '../world/environment.js';
import { stage } from '../stage/builder.js';
import { on } from '../events.js';

const tmpV = new THREE.Vector3();
const focus = new THREE.Vector3();
const camDir = new THREE.Vector3(0, 0, -1);

on('thrown', () => camDir.set(0, 0, -1));

export function updateCamera(dt) {
  const bp = ballBody.position;
  const by = Math.max(bp.y - BALL_R, 0);
  const pc = stage.pinCenter;
  const mode = game.mode;
  if (isMenu() || mode === 'done') {
    const tm = performance.now() / 1000;
    tmpV.set(pc.x + Math.sin(tm * 0.25) * 0.6, pc.y + 1.1, pc.front + 6.5);
    focus.set(pc.x, pc.y + 0.2, pc.z - 0.3);
  } else if (mode === 'preview') {
    // ピンの手前から投げる位置まで、レーンの上を引いてくる。仕掛けが順に見える
    const p = clamp(1 - (game.previewUntil - performance.now()) / PREVIEW_MS, 0, 1);
    const e = p * p * (3 - 2 * p);
    const z0 = pc.front + 3.4;
    const z = z0 + (START_Z + 2.4 - z0) * e;
    camPos.set(pc.x + (game.ballX * 0.6 - pc.x) * e, pc.y + 1.9 + (1.25 - pc.y - 1.9) * e, z);
    camLook.set(pc.x + (game.ballX * 0.25 - pc.x) * e, pc.y * (1 - e), Math.min(z - 8, pc.z - 0.4 + (-12 - pc.z + 0.4) * e));
    tmpV.copy(camPos);
    focus.copy(camLook);
  } else if (mode === 'aim' || mode === 'windup') {
    tmpV.set(game.ballX * 0.6, 1.25, START_Z + 2.4);
    focus.set(game.ballX * 0.25, 0, -12);
  } else if (mode === 'rolling' && bp.z > pc.front + 4 && !shot.fell) {
    // ボールの進む向きを、少し遅れて追いかける (曲がったコースでも前が見える)
    const v = ballBody.velocity;
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.8) {
      tmpV.set(v.x / hs, 0, v.z / hs);
      camDir.lerp(tmpV, 1 - Math.exp(-dt * 3)).normalize();
    }
    const near = clamp(-bp.z / -HEAD_Z, 0, 1);
    const straight = env.theme.kind === 'lane' ? 1 : 0;
    const cx = straight ? bp.x * 0.5 : bp.x - camDir.x * 2.4;
    tmpV.set(cx, Math.max(bp.y, 0) + 1.15 - near * 0.4 + by * 0.4, bp.z - camDir.z * 2.4);
    focus.set(straight ? bp.x * 0.3 : bp.x + camDir.x * 8, Math.max(bp.y - BALL_R, -0.5) + 0.05, Math.max(bp.z + camDir.z * 9, pc.z));
  } else if (mode === 'rolling' && shot.fell) {
    // 落ちた穴をのぞきこむ
    tmpV.set(bp.x * 0.5, 1.4, Math.max(bp.z, HEAD_Z + 2) + 2.6);
    focus.set(bp.x * 0.5, 0, Math.max(bp.z, HEAD_Z + 2) - 1);
  } else {
    tmpV.set(pc.x, pc.y + 1.0, pc.front + 3.2);
    focus.set(pc.x, pc.y + 0.15, pc.z - 0.4);
  }
  const k = 1 - Math.exp(-dt * (mode === 'rolling' ? 7 : 3));
  if (mode !== 'preview') {
    camPos.lerp(tmpV, k);
    camLook.lerp(focus, k);
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // 影のライトは、ボールかピンのどちらか近いほうに合わせる
  const followBall = mode === 'rolling' && bp.z > pc.front + 1.5 && !shot.fell;
  const fx = followBall ? bp.x : pc.x;
  const fy = followBall ? Math.max(bp.y, 0) : pc.y;
  const fz = followBall ? bp.z : pc.z;
  sun.position.set(fx + 1.2, fy + 5, fz + 2);
  sun.target.position.set(fx, fy, fz);
}
