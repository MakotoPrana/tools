/* 音を作る小さな部品: 音量の山、正弦波などの音、雑音、物理の時刻から鳴らす時刻への換算 */
import { rand } from '../util.js';

// すぐ立ち上がって、decay 秒ごとに約 1/e ずつ小さくなる音量の山
export function envelope(ctx, at, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay * 6.9);
  return g;
}

// 減っていく音をひとつ鳴らす。toHz があれば、その高さへ下がる (または上がる)
export function tone(ctx, out, at, hz, peak, decay, toHz, type = 'sine') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, at);
  if (toHz) o.frequency.exponentialRampToValueAtTime(toHz, at + decay * 2);
  o.connect(envelope(ctx, at, peak, 0.0015, decay)).connect(out);
  o.start(at);
  o.stop(at + decay * 7 + 0.01);
  return o;
}

// 雑音をフィルターに通して、短く鳴らす
export function noise(ctx, out, at, type, hz, q, peak, decay, attack = 0.0008) {
  const src = ctx.createBufferSource();
  src.buffer = ctx.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  src.connect(f).connect(envelope(ctx, at, peak, attack, decay)).connect(out);
  src.start(at, rand(0, 1.5), attack + decay * 7);
  return src;
}

// 左右に振ってから、dry と wet (響き) へ流す入口を作る。pan は -1 (左) 〜 1 (右)
export function voiceInput(out, level, pan, wetLevel) {
  const { ctx } = out;
  const voice = ctx.createGain();
  voice.gain.value = level;
  let node = voice;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    voice.connect(p);
    node = p;
  }
  node.connect(out.dry);
  const send = ctx.createGain();
  send.gain.value = wetLevel;
  node.connect(send).connect(out.wet);
  return voice;
}

// 1フレームの間に物理は何ステップも進むので、当たった時刻 (物理の時計) どおりにずらして鳴らす。
// 物理の時刻を音の時計に直し、遅れすぎたり先に進みすぎたりしたら、今に合わせ直す
let anchor = null;
export function audioTime(ctx, worldTime) {
  const now = ctx.currentTime;
  let at = anchor ? anchor.audio + (worldTime - anchor.world) : -1;
  if (at < now || at > now + 0.08) {
    anchor = { world: worldTime, audio: now + 0.02 };
    at = anchor.audio;
  }
  return at;
}
