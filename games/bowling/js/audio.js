/* 効果音 (Web Audio で合成): 音の出口 (響きと音量の整え)、ボールが転がる音、バンパー、宝物、ワープ
 *   ピンの音は pinSound.js で作り、ここの出口に流す
 */
import { rand, store } from './util.js';

const SOUND_KEY = 'bowling-sound';
let audio = null;
let soundOn = store.get(SOUND_KEY) !== 'off';
let rumble = null;
let bus = null;

// ボウリング場の響き: 少しずつ小さくなる雑音を、時間とともにこもらせて作る
function hallImpulse(ctx, seconds) {
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

// 音の出口。dry はそのまま、wet は場内の響きを通る。最後に、まとめて大きくなりすぎないよう抑える
export function audioOut() {
  return audio && soundOn ? bus : null;
}

export const isSoundOn = () => soundOn;

// 音は、ボタンを押すなどの操作のあとでないと鳴らせない。最初の操作で準備する
export function initAudio() {
  if (audio || !soundOn) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio = new Ctx();
  const len = audio.sampleRate * 2;
  const noise = audio.createBuffer(1, len, audio.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  audio.noise = noise;
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;
  comp.connect(audio.destination);
  const dry = audio.createGain();
  dry.connect(comp);
  const verb = audio.createConvolver();
  verb.buffer = hallImpulse(audio, 1.6);
  const wet = audio.createGain();
  wet.gain.value = 0.28;
  wet.connect(verb).connect(comp);
  bus = { ctx: audio, dry, wet };
  // ボールが転がるゴロゴロ音
  const src = audio.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  const gain = audio.createGain();
  gain.gain.value = 0;
  src.connect(lp).connect(gain).connect(dry);
  src.start();
  rumble = gain;
}

export function toggleSound() {
  soundOn = !soundOn;
  store.set(SOUND_KEY, soundOn ? 'on' : 'off');
  if (soundOn) initAudio();
  if (audio) (soundOn ? audio.resume() : audio.suspend()).catch(() => {});
  return soundOn;
}

// バンパーにはじかれたときのカチッという音
export function bumperSound() {
  if (!audio || !soundOn) return;
  const now = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = audio.noise;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 * rand(0.85, 1.15);
  bp.Q.value = 2.5;
  const g = audio.createGain();
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  src.connect(bp).connect(g);
  g.connect(bus.dry);
  g.connect(bus.wet);
  src.start(now, rand(0, 1.5), 0.15);
}

// 転がる音の大きさ (0〜1)
export function setRumble(level) {
  if (rumble && audio) rumble.gain.setTargetAtTime(level * 0.35, audio.currentTime, 0.05);
}

// 宝物を取ったときのきらきら音
export function chime() {
  if (!audio || !soundOn) return;
  const now = audio.currentTime;
  [1318.5, 1760, 2637].forEach((f, i) => {
    const o = audio.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, now + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
    o.connect(g).connect(bus.dry);
    g.connect(bus.wet);
    o.start(now + i * 0.07);
    o.stop(now + i * 0.07 + 0.4);
  });
}

// ワープの音 (下がって上がる)
export function warpSound() {
  if (!audio || !soundOn) return;
  const now = audio.currentTime;
  const o = audio.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, now);
  o.frequency.exponentialRampToValueAtTime(200, now + 0.12);
  o.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.15, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  o.connect(g).connect(bus.dry);
  o.start(now);
  o.stop(now + 0.35);
}
