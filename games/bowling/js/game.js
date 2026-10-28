/*
 * ゲームの進行: ステージを読みこみ、投げて、倒れた本数を数え、クリアを判定する
 *   画面には直接さわらず、出来事を events.js で知らせる
 */
import { STEP, PREVIEW_MS, DECK_END } from './config.js';
import { clamp } from './util.js';
import { emit, on } from './events.js';
import { game, shot } from './state.js';
import { THEMES } from './render/themes.js';
import { world, phys } from './physics/world.js';
import { ballBody, placeBall, launchBall } from './entities/ball.js';
import { assignPins, rackPins, clearFallen, countStanding, pinsQuiet } from './entities/pins.js';
import { env, buildEnvironment } from './world/environment.js';
import { stage, buildStage, addTreasure, floorTopAt, setMovers } from './stage/builder.js';
import './stage/interactions.js';
import { WORLDS, getStage } from './worlds.js';
import { peek, recordThrow, recordClear } from './records.js';
import { initAudio, chime, setRumble } from './audio.js';

let nextTimer = 0;
let builtTheme = null;

export const currentStage = () => getStage(game.worldIndex, game.stageIndex);

// レーンのワールドでは、ガターに落ちたピンは倒れた扱い
const laneOnly = () => env.theme.kind === 'lane';
const standing = () => countStanding(laneOnly());

function setMode(mode) {
  game.mode = mode;
  emit('modeChanged');
}

// ワールドの舞台は、ワールドが変わったときだけ作り直す
function useWorld(w) {
  const th = THEMES[WORLDS[w].theme];
  if (builtTheme !== th) {
    buildEnvironment(th);
    builtTheme = th;
  }
}

function resetShot() {
  placeBall(game.ballX);
  shot.inGutter = false;
  shot.fell = false;
  shot.portalLock = null;
}

export function loadStage(w, s) {
  clearTimeout(nextTimer);
  game.worldIndex = w;
  game.stageIndex = s;
  useWorld(w);
  const st = currentStage();
  buildStage(st);
  assignPins(st.pins, floorTopAt);
  rackPins(false);
  addTreasure(st.treasure, Boolean(peek(w, s).t));
  game.roll = 1;
  game.ballX = st.startX || 0;
  game.aimAngle = 0;
  game.hook = 0;
  resetShot();
  game.previewUntil = performance.now() + PREVIEW_MS;
  game.mode = 'preview';
  emit('stageLoaded');
  emit('modeChanged');
}

export const retryStage = () => loadStage(game.worldIndex, game.stageIndex);

export function startAim() {
  setMode('aim');
}

// 投げる。swiped はスワイプで投げたとき (線を見せている間に、速さとカーブを表示済み)
export function throwBall(speed, angle, spin) {
  if (game.mode !== 'aim' && game.mode !== 'windup') return;
  initAudio();
  const swiped = game.mode === 'windup';
  game.aimAngle = angle;
  game.hook = spin;
  launchBall(game.ballX, speed, angle);
  shot.throwTime = world.time;
  shot.doneAt = 0;
  shot.standingBefore = standing();
  recordThrow(game.worldIndex, game.stageIndex, game.roll);
  game.mode = 'rolling';
  emit('thrown', { speed, swiped });
  emit('modeChanged');
}

// 宝物に触れた。持ち帰ったことになるのは、ステージをクリアしたとき (ここではまだ保存しない)
on('treasureTouched', () => {
  const tr = stage.treasure;
  if (!tr || tr.taken) return;
  tr.taken = true;
  tr.burst = 0.001;
  chime();
  emit('treasureTaken', { kind: tr.def.kind, owned: tr.owned });
});

function finishRoll() {
  game.mode = 'result';
  setRumble(0);
  const left = standing();
  const knocked = shot.standingBefore - left;

  if (left === 0) {
    stageClear(game.roll === 1 ? 'strike' : 'spare');
    return;
  }
  emit('rollEnd', { left, knocked, fell: shot.fell, gutter: shot.inGutter, last: game.roll === 2 });
  if (game.roll === 2) {
    nextTimer = setTimeout(() => endStage(null, left, []), 1500);
    return;
  }
  nextTimer = setTimeout(() => {
    game.roll = 2;
    clearFallen(laneOnly());
    rackPins(true);
    resetShot();
    emit('rollReset');
    startAim();
  }, 1600);
}

function stageClear(kind) {
  const withTreasure = Boolean(stage.treasure && stage.treasure.taken);
  const fresh = recordClear(game.worldIndex, game.stageIndex, kind, withTreasure);
  emit('rollEnd', { clear: kind });
  emit('recordsChanged');
  nextTimer = setTimeout(() => endStage(kind, 0, fresh), 1600);
}

function endStage(kind, left, fresh) {
  game.mode = 'done';
  emit('result', { kind, left, fresh });
  emit('modeChanged');
}

// 遊んでいる途中でメニューを開くときに、待っている処理を止める
export function stopPlay() {
  clearTimeout(nextTimer);
  emit('stopped');
}

export function setMenuMode(mode) {
  setMode(mode);
}

// ---- 毎フレーム ----

// 物理は 1/240 秒ずつ進める。描画が遅い端末では、ゲームの時間ごとゆっくり進む
let stepAcc = 0;
export function updatePhysics(dt) {
  if (game.mode !== 'rolling' && game.mode !== 'result') {
    stepAcc = 0;
    stage.moverClock += dt;
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

// 投げたあと、ボールが落ちる・止まる・床の奥の端を越えるまで待ち、
// そのあとピンが止まるか一定時間たったら数える。時間は物理の時計 (world.time) で測る
export function updateGame() {
  if (game.mode === 'preview' && performance.now() > game.previewUntil) startAim();
  if (game.mode !== 'rolling') return;
  const bp = ballBody.position;
  const now = world.time;
  const t = now - shot.throwTime;
  const speed = ballBody.velocity.length();
  const onLane = !shot.fell && Math.abs(ballBody.velocity.y) < 0.3 && bp.z > DECK_END;
  setRumble(onLane ? clamp(speed / 10, 0, 1) : 0);
  const ballDone = (shot.fell && bp.y < -0.15) || bp.y < stage.killY || bp.z < DECK_END - 0.1 || (speed < 0.2 && t > 1.5);
  if (ballDone && !shot.doneAt) shot.doneAt = now;
  const since = shot.doneAt ? now - shot.doneAt : 0;
  // 落とし穴に落ちたら、ピンが止まるのを待たずに終わる
  if ((shot.doneAt && ((pinsQuiet() && since > (shot.fell ? 0.4 : 0.9)) || since > phys.settle)) || t > phys.maxT) finishRoll();
}
