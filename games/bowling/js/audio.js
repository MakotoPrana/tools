/* 効果音 (Web Audio で合成): ピンの音、ボールが転がる音、宝物、ワープ */
import { clamp, rand, store } from './util.js';

const SOUND_KEY = 'bowling-sound';
let audio = null;
let soundOn = store.get(SOUND_KEY) !== 'off';
let rumble = null;
let lastClack = 0;

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
  // ボールが転がるゴロゴロ音
  const src = audio.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = audio.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  const gain = audio.createGain();
  gain.gain.value = 0;
  src.connect(lp).connect(gain).connect(audio.destination);
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

// ピンやバンパーに当たったカチッという音。strength は当たった速さ
export function clack(strength, pitch) {
  if (!audio || !soundOn || strength < 0.4) return;
  const now = audio.currentTime;
  if (now - lastClack < 0.018) return;
  lastClack = now;
  const vol = clamp(strength / 6, 0.05, 0.6);
  const src = audio.createBufferSource();
  src.buffer = audio.noise;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = pitch * rand(0.85, 1.15);
  bp.Q.value = 2.5;
  const g = audio.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  src.connect(bp).connect(g).connect(audio.destination);
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
    o.connect(g).connect(audio.destination);
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
  o.connect(g).connect(audio.destination);
  o.start(now);
  o.stop(now + 0.35);
}
