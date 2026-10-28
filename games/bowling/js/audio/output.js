/*
 * 音の出口 (Web Audio)
 *   効果音は dry (そのまま) と wet (場内の響き) へ、BGM は music と musicWet (響き) へ流す。
 *   最後に、まとめて大きくなりすぎないよう抑えてからスピーカーへ出す
 */
import { store } from '../util.js';
import { emit } from '../events.js';

const SOUND_KEY = 'bowling-sound';
const MUSIC_LEVEL = 0.13;   // BGM は効果音 (転がる音やピンの音) を消さない大きさに
let ctx = null;
let bus = null;
let soundOn = store.get(SOUND_KEY) !== 'off';

// ボウリング場の響き: 少しずつ小さくなる雑音を、時間とともにこもらせて作る
function hallImpulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const k = 0.55 * Math.exp(-t * 3.5) + 0.04; // 後ろほど高い音が消える
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t * 3.2) * (t < 0.012 ? t / 0.012 : 1);
    }
  }
  return ir;
}

// 鳴らせるときは { ctx, dry, wet, music, musicWet } を返す。音を切っているときや準備前は null
export function audioOut() {
  return ctx && soundOn ? bus : null;
}

export const isSoundOn = () => soundOn;

// 音は、ボタンを押すなどの操作のあとでないと鳴らせない。最初の操作で準備する
export function initAudio() {
  if (ctx || !soundOn) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  ctx = new Ctx();
  // 効果音のもとにする雑音 (2秒)
  const len = ctx.sampleRate * 2;
  ctx.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = ctx.noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;
  comp.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.connect(comp);
  const verb = ctx.createConvolver();
  verb.buffer = hallImpulse(1.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  wet.connect(verb).connect(comp);
  const music = ctx.createGain();
  music.gain.value = MUSIC_LEVEL;
  music.connect(comp);
  const musicWet = ctx.createGain();
  musicWet.gain.value = MUSIC_LEVEL;
  musicWet.connect(wet);
  bus = { ctx, dry, wet, music, musicWet };
  emit('audioReady');
}

export function toggleSound() {
  soundOn = !soundOn;
  store.set(SOUND_KEY, soundOn ? 'on' : 'off');
  if (soundOn) initAudio();
  if (ctx) (soundOn ? ctx.resume() : ctx.suspend()).catch(() => {});
  if (soundOn && ctx) emit('audioReady');
  return soundOn;
}

// 別のタブに移ったら止め、戻ったら鳴らし直す
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else if (soundOn) ctx.resume().catch(() => {});
});
