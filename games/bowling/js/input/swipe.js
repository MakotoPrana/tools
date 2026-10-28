/*
 * スワイプで投げる
 *   左右になぞると投げる位置、上へなぞると投げる。なぞった線の長さで速さ、出だしの向きで向き、
 *   途中で曲げた分でカーブ。指を離したら線を少し見せてから投げる
 */
import { BALL_X_MAX, MIN_SPEED, MAX_SPEED, MAX_ANGLE, SWIPE_MIN, SWIPE_MAX, TRAIL_HOLD_MS } from '../config.js';
import { $, clamp } from '../util.js';
import { on } from '../events.js';
import { game } from '../state.js';
import { canvas } from '../render/renderer.js';
import { ballBody } from '../entities/ball.js';
import { startAim, throwBall } from '../game.js';
import { setThrowInfo, setHint, describeThrow } from '../ui/hud.js';

const wrap = $('board-wrap');
const trailEl = $('trail');
let gesture = null;
let throwTimer = 0;

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
export function sizeTrail() {
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

export function clearTrail(fade) {
  if (fade) {
    trailEl.classList.add('is-fading');
  } else {
    trailEl.classList.remove('is-fading');
    trailCtx.clearRect(0, 0, trailEl.width, trailEl.height);
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.mode === 'preview') {
    startAim();
    return;
  }
  if (game.mode !== 'aim') return;
  canvas.setPointerCapture(e.pointerId);
  gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, startX: game.ballX, mode: 'idle', pts: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
});

canvas.addEventListener('pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id || game.mode !== 'aim') return;
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
    game.ballX = clamp(gesture.startX + (dx / canvas.clientWidth) * 1.4, -BALL_X_MAX, BALL_X_MAX);
    ballBody.position.x = game.ballX;
  }
  if (gesture.mode === 'throw') {
    const pts = gesture.pts;
    const swipe = readSwipe(pts);
    if (swipe) game.aimAngle = swipe.angle;
    drawTrail(pts, swipe);
  }
});

function endGesture(e) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture;
  gesture = null;
  if (g.mode !== 'throw' || game.mode !== 'aim') {
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
  game.mode = 'windup';
  game.aimAngle = swipe.angle;
  drawTrail(pts, swipe);
  setThrowInfo(describeThrow(swipe.speed, swipe.spin));
  setHint('');
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

// ステージを読みこんだときや、メニューを開いたときは、線と投げる予定を消す
function cancel() {
  clearTimeout(throwTimer);
  clearTrail(false);
}
on('stageLoaded', cancel);
on('stopped', cancel);
