/*
 * BGM の楽器 (Web Audio で合成)
 *   どの楽器も play(ctx, out, at, midi, dur, vel, opt) の形。
 *   at: 鳴らし始める時刻、midi: 音の高さ (MIDI 番号。打楽器は使わない)、dur: 長さ (秒)、vel: 強さ (0〜1)
 */
import { envelope, tone, noise } from './synth.js';

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 音量を「立ち上がり → 保つ → 離す」の形で動かす
function adsr(ctx, at, dur, peak, attack, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + Math.max(attack, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(attack, dur) + release);
  return g;
}

function osc(ctx, type, hz, at, end, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  o.detune.value = detune;
  o.start(at);
  o.stop(end);
  return o;
}

function lowpass(ctx, hz, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = hz;
  f.Q.value = q;
  return f;
}

// 揺れ (ビブラート) をつける
function vibrato(ctx, target, at, end, rate, cents) {
  const lfo = osc(ctx, 'sine', rate, at, end);
  const depth = ctx.createGain();
  depth.gain.value = cents;
  lfo.connect(depth).connect(target.detune);
}

// ---- 打楽器 ----
const drums = {
  kick: (ctx, out, at, vel) => {
    tone(ctx, out, at, 150, vel, 0.05, 45);
    tone(ctx, out, at, 55, vel * 0.8, 0.09);
    noise(ctx, out, at, 'lowpass', 1500, 0.7, vel * 0.3, 0.004);
  },
  snare: (ctx, out, at, vel) => {
    tone(ctx, out, at, 190, vel * 0.5, 0.025, 160);
    noise(ctx, out, at, 'bandpass', 1900, 0.6, vel * 0.9, 0.035);
    noise(ctx, out, at, 'highpass', 5000, 0.7, vel * 0.4, 0.03);
  },
  clap: (ctx, out, at, vel) => {
    [0, 0.011, 0.022].forEach((d) => noise(ctx, out, at + d, 'bandpass', 1300, 1.2, vel * 0.7, 0.008));
    noise(ctx, out, at + 0.03, 'bandpass', 1300, 1.2, vel * 0.6, 0.04);
  },
  hat: (ctx, out, at, vel) => noise(ctx, out, at, 'highpass', 7500, 0.7, vel * 0.45, 0.012),
  ohat: (ctx, out, at, vel) => noise(ctx, out, at, 'highpass', 7000, 0.7, vel * 0.4, 0.06),
  ride: (ctx, out, at, vel) => {
    noise(ctx, out, at, 'bandpass', 6500, 1.5, vel * 0.35, 0.09);
    tone(ctx, out, at, 3150, vel * 0.06, 0.12);
    tone(ctx, out, at, 4730, vel * 0.04, 0.1);
  },
  rim: (ctx, out, at, vel) => {
    tone(ctx, out, at, 1700, vel * 0.4, 0.008);
    noise(ctx, out, at, 'bandpass', 2400, 3, vel * 0.5, 0.006);
  },
  shaker: (ctx, out, at, vel) => noise(ctx, out, at, 'bandpass', 6000, 1, vel * 0.3, 0.015, 0.006),
  tom: (ctx, out, at, vel, midi) => {
    const hz = mtof(midi || 45);
    tone(ctx, out, at, hz * 1.5, vel, 0.07, hz);
    noise(ctx, out, at, 'lowpass', 900, 0.7, vel * 0.25, 0.01);
  },
  timpani: (ctx, out, at, vel, midi) => {
    const hz = mtof(midi || 38);
    tone(ctx, out, at, hz, vel, 0.25, hz * 0.97);
    tone(ctx, out, at, hz * 1.5, vel * 0.4, 0.15);
    noise(ctx, out, at, 'lowpass', 600, 0.7, vel * 0.3, 0.02);
  },
  // 工場の金属音 (倍音がずれた音を重ねる)
  metal: (ctx, out, at, vel) => {
    [527, 1243, 1871, 2799].forEach((hz, i) => tone(ctx, out, at, hz, vel * 0.18 / (1 + i * 0.3), 0.05 + 0.03 * (3 - i), 0, 'square'));
    noise(ctx, out, at, 'highpass', 3000, 0.7, vel * 0.3, 0.01);
  },
};
export const isDrum = (inst) => inst in drums;
export function playDrum(inst, ctx, out, at, vel, midi) {
  drums[inst](ctx, out, at, vel, midi);
}

// ---- 音程のある楽器 ----
const melodic = {
  // ベース。opt.wave で音色、opt.cutoff で明るさ。opt.acid なら、こもった音から開く
  bass: (ctx, out, at, hz, dur, vel, opt) => {
    const end = at + dur + 0.2;
    const o = osc(ctx, opt.wave || 'triangle', hz, at, end);
    const f = lowpass(ctx, opt.cutoff || 900, opt.acid ? 8 : 1);
    if (opt.acid) {
      f.frequency.setValueAtTime(300, at);
      f.frequency.exponentialRampToValueAtTime(2400 * vel, at + 0.02);
      f.frequency.exponentialRampToValueAtTime(300, at + 0.18);
    }
    o.connect(f).connect(adsr(ctx, at, dur * 0.9, vel * 0.55, 0.005, 0.06)).connect(out);
    if (opt.sub) osc(ctx, 'sine', hz / 2, at, end).connect(adsr(ctx, at, dur * 0.9, vel * 0.35, 0.005, 0.06)).connect(out);
  },
  // エレクトリックピアノ (やわらかい鐘のような音を重ねる)
  epiano: (ctx, out, at, hz, dur, vel) => {
    tone(ctx, out, at, hz, vel * 0.35, 0.35 + dur * 0.3);
    tone(ctx, out, at, hz * 2, vel * 0.08, 0.12);
    tone(ctx, out, at, hz * 7.02, vel * 0.03, 0.02);
  },
  // ビブラフォン (金属の板。ゆれながら長く残る)
  vibes: (ctx, out, at, hz, dur, vel) => {
    const g = envelope(ctx, at, vel * 0.3, 0.002, 0.25 + dur * 0.3);
    const trem = ctx.createGain();
    const lfo = osc(ctx, 'sine', 5.5, at, at + 2.5);
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(trem.gain);
    osc(ctx, 'sine', hz, at, at + 2.5).connect(g).connect(trem).connect(out);
    tone(ctx, out, at, hz * 4, vel * 0.05, 0.05);
  },
  // マリンバ (木の板。すぐ消える)
  marimba: (ctx, out, at, hz, dur, vel) => {
    tone(ctx, out, at, hz, vel * 0.4, 0.09);
    tone(ctx, out, at, hz * 3.93, vel * 0.08, 0.025);
    tone(ctx, out, at, hz * 9.2, vel * 0.03, 0.008);
  },
  // はじいた弦 (琴やハープ)
  pluck: (ctx, out, at, hz, dur, vel, opt) => {
    const f = lowpass(ctx, hz * 6);
    f.frequency.setValueAtTime(hz * 10, at);
    f.frequency.exponentialRampToValueAtTime(hz * 1.5, at + 0.3);
    osc(ctx, opt.wave || 'sawtooth', hz, at, at + 1.6).connect(f).connect(envelope(ctx, at, vel * 0.22, 0.002, opt.decay || 0.18)).connect(out);
  },
  // 鐘・チェレスタ (高い倍音がずれた澄んだ音)
  bell: (ctx, out, at, hz, dur, vel) => {
    tone(ctx, out, at, hz, vel * 0.25, 0.3);
    tone(ctx, out, at, hz * 2.76, vel * 0.1, 0.12);
    tone(ctx, out, at, hz * 5.4, vel * 0.05, 0.05);
  },
  // 包むような和音 (少しずらしたのこぎり波を、こもらせる)
  pad: (ctx, out, at, hz, dur, vel, opt) => {
    const end = at + dur + 1.2;
    const g = adsr(ctx, at, dur, vel * 0.09, opt.attack || 0.4, 1);
    const f = lowpass(ctx, opt.cutoff || 1400);
    [-9, 0, 8].forEach((d) => osc(ctx, opt.wave || 'sawtooth', hz, at, end, d).connect(f));
    f.connect(g).connect(out);
  },
  // 笛 (やわらかい正弦波に、ゆれと息の音)
  flute: (ctx, out, at, hz, dur, vel) => {
    const end = at + dur + 0.3;
    const o = osc(ctx, 'sine', hz, at, end);
    vibrato(ctx, o, at + 0.15, end, 5, 12);
    o.connect(adsr(ctx, at, dur * 0.95, vel * 0.32, 0.04, 0.12)).connect(out);
    osc(ctx, 'triangle', hz * 2, at, end).connect(adsr(ctx, at, dur * 0.95, vel * 0.04, 0.04, 0.1)).connect(out);
    noise(ctx, out, at, 'bandpass', hz * 2, 2, vel * 0.08, 0.03, 0.02);
  },
  // シンセのリード。opt.wave で音色
  lead: (ctx, out, at, hz, dur, vel, opt) => {
    const end = at + dur + 0.3;
    const f = lowpass(ctx, opt.cutoff || 2600, 2);
    [-6, 6].forEach((d) => {
      const o = osc(ctx, opt.wave || 'sawtooth', hz, at, end, d);
      vibrato(ctx, o, at + 0.18, end, 5.5, 10);
      o.connect(f);
    });
    f.connect(adsr(ctx, at, dur * 0.95, vel * 0.13, 0.01, 0.12)).connect(out);
  },
  // 金管 (明るさがあとから開く)
  brass: (ctx, out, at, hz, dur, vel) => {
    const end = at + dur + 0.3;
    const f = lowpass(ctx, hz * 2, 1.5);
    f.frequency.setValueAtTime(hz * 1.5, at);
    f.frequency.linearRampToValueAtTime(hz * 5, at + 0.08);
    f.frequency.linearRampToValueAtTime(hz * 3.5, at + 0.3);
    [-5, 5].forEach((d) => osc(ctx, 'sawtooth', hz, at, end, d).connect(f));
    f.connect(adsr(ctx, at, dur * 0.95, vel * 0.13, 0.04, 0.12)).connect(out);
  },
  // テルミン (宇宙らしい、ゆれの大きな音)
  theremin: (ctx, out, at, hz, dur, vel) => {
    const end = at + dur + 0.5;
    const o = osc(ctx, 'sine', hz, at, end);
    o.frequency.setValueAtTime(hz * 0.97, at);
    o.frequency.exponentialRampToValueAtTime(hz, at + 0.12);
    vibrato(ctx, o, at, end, 6, 22);
    o.connect(adsr(ctx, at, dur, vel * 0.3, 0.08, 0.35)).connect(out);
  },
};
export function playNote(inst, ctx, out, at, midi, dur, vel, opt) {
  melodic[inst](ctx, out, at, mtof(midi), dur, vel, opt);
}
