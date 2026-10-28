/*
 * ボールと仕掛けのやりとり (物理の1ステップごと)
 *   落とし穴 (ボールと倒れたピン)、ワープゲート、ベルトコンベア、宝物、ガター、カーブ、バンパー、跳ね返ったあとの回転、
 *   当たった音 (ピン、ボールと壁や床)
 *   力は1ステップごとに消えるので、カーブやコンベアの力も毎回かける
 */
import {
  BALL_R, LANE_HALF, HEAD_Z, DECK_END, HOOK_START_Z, HOOK_RAMP, HOOK_FORCE, TREASURE_REACH, LANE_GROUP, STEP,
} from '../config.js';
import { clamp } from '../util.js';
import { emit } from '../events.js';
import { game, shot } from '../state.js';
import { world, M, phys } from '../physics/world.js';
import { ballBody, rollWithVelocity } from '../entities/ball.js';
import { pins } from '../entities/pins.js';
import { env } from '../world/environment.js';
import { stage, setMovers, inHole } from './builder.js';
import { bumperSound, warpSound } from '../audio/effects.js';
import { pinHit } from '../audio/pinSound.js';
import { ballHit } from '../audio/ballSound.js';

const force = new CANNON.Vec3();

// 落とし穴: 穴の上を床の高さで転がったら落ちる (飛び越えれば落ちない)。落ちたボールは床をすり抜ける
function checkHoles(bp, onGround) {
  if (!shot.fell && onGround) {
    for (const h of stage.holes) {
      if (inHole(h, bp.x, bp.z)) {
        shot.fell = true;
        ballBody.collisionFilterMask = -1 & ~LANE_GROUP;
        break;
      }
    }
  }
  if (shot.fell && bp.y < -0.8) {
    // 穴の底。見えないところで止めておく
    bp.y = -0.8;
    ballBody.velocity.setZero();
  }
}

// 倒れて転がったピンも、穴の上に来たら落ちる (立っているピンは、穴のふちの台に乗っているので落ちない)
function checkPinHoles() {
  if (!stage.holes.length) return;
  for (const p of pins) {
    const b = p.body;
    if (!p.active || b.sleepState === CANNON.Body.SLEEPING || !(b.collisionFilterMask & LANE_GROUP)) continue;
    if (b.position.y < 0.12 && stage.holes.some((h) => inHole(h, b.position.x, b.position.z))) {
      b.collisionFilterMask = -1 & ~LANE_GROUP;
    }
  }
}

// ワープゲート: a に入ったら、速さはそのままで b から出る。dir があればその向きへ
function checkPortals(bp) {
  for (const p of stage.portals) {
    if (shot.portalLock === p) {
      if (Math.hypot(bp.x - p.b[0], bp.z - p.b[1]) > p.r + 0.15) shot.portalLock = null;
      continue;
    }
    if (Math.hypot(bp.x - p.a[0], bp.z - p.a[1]) < p.r && Math.abs(bp.y - (p.ay + BALL_R)) < 0.12) {
      const v = ballBody.velocity;
      const speed = Math.hypot(v.x, v.z);
      let hx = v.x / (speed || 1);
      let hz = v.z / (speed || 1);
      if (p.dir !== undefined) {
        const a = (p.dir * Math.PI) / 180;
        hx = Math.sin(a);
        hz = -Math.cos(a);
      }
      bp.set(p.b[0] + hx * 0.05, p.by + BALL_R + 0.005, p.b[1] + hz * 0.05);
      v.set(hx * speed, 0, hz * speed);
      // 回転も出る向きに合わせる (そのままだと摩擦で一気に遅くなる)
      rollWithVelocity();
      shot.portalLock = p;
      warpSound();
      break;
    }
  }
}

function applyConveyors(bp, onGround) {
  if (!onGround) return;
  for (const c of stage.conveyors) {
    if (Math.abs(bp.x - c.x) < c.w / 2 && Math.abs(bp.z - c.z) < c.d / 2) {
      force.set(c.fx, 0, c.fz);
      ballBody.applyForce(force, bp);
    }
  }
}

function checkTreasure(bp) {
  const tr = stage.treasure;
  if (!tr || tr.taken) return;
  const td = tr.def;
  if (Math.hypot(bp.x - td.x, bp.y - td.y, bp.z - td.z) < TREASURE_REACH) emit('treasureTouched');
}

// オイルの薄い奥のほうで、回転の向きに曲がる。ガター、坂の上、空中では曲がらない
function applyHook(bp) {
  if (env.theme.kind === 'lane' && !shot.inGutter && Math.abs(bp.x) > LANE_HALF + 0.01 && bp.y < BALL_R && bp.z > HEAD_Z) shot.inGutter = true;
  if (shot.inGutter || shot.fell || bp.z > HOOK_START_Z || bp.z < stage.pinCenter.front + 0.3 || Math.abs(ballBody.velocity.y) > 0.3) return;
  force.set(game.hook * HOOK_FORCE * phys.hook * clamp((HOOK_START_Z - bp.z) / HOOK_RAMP, 0, 1), 0, 0);
  ballBody.applyForce(force, bp);
}

world.addEventListener('preStep', () => {
  stage.moverClock += STEP;
  setMovers(true);
  if (game.mode !== 'rolling') return;
  const bp = ballBody.position;
  const onGround = bp.y < BALL_R + 0.02 && bp.y > BALL_R - 0.05;
  checkHoles(bp, onGround);
  checkPinHoles();
  checkPortals(bp);
  applyConveyors(bp, onGround);
  checkTreasure(bp);
  applyHook(bp);
});

// 跳ね返る物に当たったら、次のステップで回転を進む向きに合わせ直す。
// そのままだと前向きの回転が残っていて、すぐに当たった物へ転がり戻ってしまう
let reroll = false;
world.addEventListener('postStep', () => {
  if (!reroll) return;
  reroll = false;
  rollWithVelocity();
});

// ボールが当たった音の種類 (ピンの音は下のピンの側で鳴らす)。ピットの奥は幕なので鈍い音
const BALL_HIT = new Map([[M.lane, 'ground'], [M.wall, 'wall'], [M.rail, 'rail'], [M.tire, 'tire']]);

ballBody.addEventListener('collide', (e) => {
  const m = e.body.material;
  if (m === M.rail || m === M.tire) reroll = true;
  // バンパーに当たったら、外向きにはじく
  const kick = stage.bumpers.get(e.body);
  if (!kick) {
    let what = BALL_HIT.get(m);
    if (what === 'wall' && ballBody.position.z < DECK_END) what = 'cushion';
    if (what) {
      const speed = Math.abs(e.contact.getImpactVelocityAlongNormal());
      ballHit(what, env.theme.surface, speed, ballBody.position.x, e.body, world.time);
    }
    return;
  }
  const dx = ballBody.position.x - e.body.position.x;
  const dz = ballBody.position.z - e.body.position.z;
  const l = Math.hypot(dx, dz) || 1;
  ballBody.velocity.x += (dx / l) * kick;
  ballBody.velocity.z += (dz / l) * kick;
  bumperSound();
});

// ピンが当たった音。相手で鳴り方を変える (ピン同士は、両方のピンがそれぞれ鳴る)
// ピンデッキより奥 (ピット) は、床も壁もクッションなので鈍い音にする
const HIT_KIND = new Map([[M.ball, 'ball'], [M.pin, 'pin'], [M.lane, 'floor'], [M.wall, 'wall'], [M.rail, 'wall'], [M.tire, 'soft']]);
pins.forEach((p, i) => {
  p.body.addEventListener('collide', (e) => {
    let kind = HIT_KIND.get(e.body.material);
    if (!kind) return;
    if (kind === 'wall' && p.body.position.z < DECK_END) kind = 'soft';
    pinHit(kind, Math.abs(e.contact.getImpactVelocityAlongNormal()), i, p.body.position.x, p.body, world.time);
  });
});
