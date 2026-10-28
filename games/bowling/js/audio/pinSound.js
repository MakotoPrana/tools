/*
 * ピンが当たる音 (Web Audio で合成)
 *   ピンは堅いカエデの木に樹脂を塗ったもの。叩くと、決まったいくつかの高さ (固有振動) で短く鳴る。
 *   その高さの正弦波を重ね、当たった瞬間の「カッ」という雑音と、相手の物の鳴りを足して作る。
 *   ・高さはピンごとに少しずつ違う (同じピンは同じ音で鳴る)
 *   ・相手がボールなら重く、ピン同士なら高く乾いた音、床なら木の床の「ドン」、壁なら鈍い音
 *   ・強く当たるほど大きく、高い成分も多く鳴る
 *   ・ピンの左右の位置で、音も左右に振る
 *   ・当たった時刻 (物理の時計) どおりにずらして鳴らす。ストライクの「ガラガラ」は、細かい当たりの間合いで決まるため
 */
import { clamp, rand } from '../util.js';
import { audioOut } from './output.js';
import { tone, noise, voiceInput, audioTime } from './synth.js';

// 細長い棒が両端自由で曲がって振動するときの、高さの比と、鳴り続ける長さ (秒)。
// 木は振動をすぐ吸うので短い (長いと金属の「キーン」になる)
const MODES = [
  { ratio: 1, decay: 0.055, gain: 1 },
  { ratio: 2.756, decay: 0.032, gain: 0.7 },
  { ratio: 5.404, decay: 0.018, gain: 0.45 },
  { ratio: 8.933, decay: 0.01, gain: 0.25 },
];
const BASE_HZ = 950;     // いちばん低い固有振動 (ピンごとに ±6% ずらす)
const HOLLOW_HZ = 380;   // 胴の「コッ」という鳴り
const MAX_VOICES = 32;   // 同時に鳴らす数の上限 (ストライクで一度に何十回も当たるため)
const MIN_GAP = 0.03;    // 同じピンが続けて鳴るまでの間 (秒)

// 相手ごとの鳴らし方。bright: 高い成分の出やすさ、knock: 相手の鳴り
const KINDS = {
  ball: { min: 0.3, full: 7, gain: 1, bright: 0.75, crack: 1, knock: { hz: 170, to: 110, decay: 0.09, gain: 0.8 } },
  pin: { min: 0.25, full: 4, gain: 0.75, bright: 1, crack: 0.8, knock: null },
  floor: { min: 0.35, full: 3.5, gain: 0.6, bright: 0.45, crack: 0.45, knock: { hz: 165, to: 120, decay: 0.08, gain: 0.7 } },
  wall: { min: 0.35, full: 4, gain: 0.5, bright: 0.35, crack: 0.35, knock: { hz: 130, to: 95, decay: 0.1, gain: 0.6 } },
  soft: { min: 0.5, full: 5, gain: 0.3, bright: 0.15, crack: 0.15, knock: { hz: 110, to: 80, decay: 0.07, gain: 0.5 } },
};

let voices = 0;
const lastHit = new WeakMap();

// ピンの番号から、そのピンの高さを決める (いつも同じ値になるように)。
// 木目や傷みで1本ずつ違うので、上の固有振動の比も少しずらす
const toneOf = (index) => 1 + (((index * 7919) % 13) / 12 - 0.5) * 0.12;
const ratioOf = (index, mode) => 1 + ((((index + 3) * (mode + 1) * 104729) % 17) / 16 - 0.5) * 0.06 * mode;

/*
 * ピンが何かに当たった音を鳴らす
 *   kind: 相手 ('ball' | 'pin' | 'floor' | 'wall' | 'soft')、speed: 当たった速さ (m/s)
 *   index: ピンの番号、x: ピンの左右の位置 (m)、key: 続けて鳴りすぎないよう見張る物 (ピンの物理の体)
 *   worldTime: 当たった時刻 (物理の時計)
 */
export function pinHit(kind, speed, index, x, key, worldTime) {
  const out = audioOut();
  const k = KINDS[kind];
  if (!out || !k || speed < k.min || voices >= MAX_VOICES) return;
  const { ctx } = out;
  if (worldTime - (lastHit.get(key) ?? -1) < MIN_GAP) return;
  lastHit.set(key, worldTime);
  const at = audioTime(ctx, worldTime);

  const hit = clamp((speed - k.min) / (k.full - k.min), 0, 1);
  const level = k.gain * (0.08 + 0.92 * Math.pow(hit, 1.3));
  // 強く当たるほど、高い成分まで鳴る
  const bright = k.bright * (0.35 + 0.65 * hit);

  // 大きな音ほど場内に響く
  const voice = voiceInput(out, level * 0.5, clamp(x / 0.9, -1, 1) * 0.7, 0.5 + 0.5 * hit);

  // ピンの木の鳴り
  const f0 = BASE_HZ * toneOf(index) * rand(0.985, 1.015);
  // いちばん最後まで鳴る音が終わったら、この音のつながりを外す
  let last = null;
  let lastDecay = 0;
  const keep = (o, decay) => {
    if (decay > lastDecay) [last, lastDecay] = [o, decay];
  };
  MODES.forEach((m, i) => {
    const peak = m.gain * Math.pow(bright, i * 0.6) * rand(0.7, 1.1);
    if (peak < 0.02) return;
    const decay = m.decay * (0.8 + 0.4 * hit);
    keep(tone(ctx, voice, at, f0 * m.ratio * ratioOf(index, i), peak, decay), decay);
  });
  tone(ctx, voice, at, HOLLOW_HZ * toneOf(index + 5), 0.22 * (0.5 + 0.5 * hit), 0.022);

  // 当たった瞬間の「カッ」(広い高さの雑音) と、それを受けて木の胴がざらっと鳴る音
  noise(ctx, voice, at, 'bandpass', 3000 + 3000 * bright, 0.7, 1.6 * k.crack * (0.4 + 0.6 * hit), 0.005 + 0.004 * hit);
  noise(ctx, voice, at, 'bandpass', f0 * 1.6, 3, 0.9 * k.crack * (0.3 + 0.7 * hit), 0.02);

  // 相手の鳴り (ボールの重い「ゴッ」、床の「ドン」)
  if (k.knock) {
    const kn = k.knock;
    keep(tone(ctx, voice, at, kn.hz * rand(0.95, 1.05), kn.gain * (0.4 + 0.6 * hit), kn.decay, kn.to), kn.decay);
    noise(ctx, voice, at, 'lowpass', 900, 0.7, 0.5 * kn.gain * (0.2 + 0.8 * hit), 0.02);
  }

  voices++;
  last.onended = () => {
    voices--;
    voice.disconnect();
  };
}
