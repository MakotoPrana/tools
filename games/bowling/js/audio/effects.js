/* 効果音 (Web Audio で合成): ボールが転がる音、バンパー、宝物、ワープ */
import { rand } from '../util.js';
import { audioOut } from './output.js';
import { noise } from './synth.js';

// ボールが転がるゴロゴロ音 (雑音を低い音だけにして、ずっと流しておく)。最初に使うときに作る
let rumble = null;
function rumbleGain(out) {
  if (rumble) return rumble;
  const { ctx } = out;
  const src = ctx.createBufferSource();
  src.buffer = ctx.noise;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 160;
  rumble = ctx.createGain();
  rumble.gain.value = 0;
  src.connect(lp).connect(rumble).connect(out.dry);
  src.start();
  return rumble;
}

// 転がる音の大きさ (0〜1)
export function setRumble(level) {
  const out = audioOut();
  if (!out || (!rumble && level === 0)) return;
  rumbleGain(out).gain.setTargetAtTime(level * 0.35, out.ctx.currentTime, 0.05);
}

// バンパーにはじかれたときのカチッという音
export function bumperSound() {
  const out = audioOut();
  if (!out) return;
  const g = out.ctx.createGain();
  g.connect(out.dry);
  g.connect(out.wet);
  noise(out.ctx, g, out.ctx.currentTime, 'bandpass', 900 * rand(0.85, 1.15), 2.5, 0.4, 0.017);
}

// 宝物を取ったときのきらきら音
export function chime() {
  const out = audioOut();
  if (!out) return;
  const { ctx } = out;
  const now = ctx.currentTime;
  [1318.5, 1760, 2637].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now + i * 0.07);
    g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.07 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
    o.connect(g).connect(out.dry);
    g.connect(out.wet);
    o.start(now + i * 0.07);
    o.stop(now + i * 0.07 + 0.4);
  });
}

// ワープの音 (下がって上がる)
export function warpSound() {
  const out = audioOut();
  if (!out) return;
  const { ctx } = out;
  const now = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, now);
  o.frequency.exponentialRampToValueAtTime(200, now + 0.12);
  o.frequency.exponentialRampToValueAtTime(1400, now + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.15, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
  o.connect(g).connect(out.dry);
  o.start(now);
  o.stop(now + 0.35);
}
