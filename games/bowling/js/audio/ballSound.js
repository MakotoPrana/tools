/*
 * ボールが当たる音 (Web Audio で合成): 壁、跳ね返る反射板、タイヤ、地面へのバウンド
 *   ボールは 7kg の硬い樹脂の球。当たると、相手の物が鳴る音が大きい。
 *   ・地面に落ちたときは、ワールドの床の材質 (木、石、氷、金属、月の砂 …) で鳴り方を変える
 *   ・強く当たるほど大きく、高い成分も多く鳴る
 *   ・当たった時刻 (物理の時計) どおりにずらして鳴らす
 */
import { clamp, rand } from '../util.js';
import { audioOut } from './output.js';
import { tone, noise, voiceInput, audioTime } from './synth.js';

// 床の材質ごとの鳴り方
//   thud: 重いものが落ちた「ドン」の高さ、body: 床そのものが鳴る高さ (いくつか)、ring: その鳴りが続く長さ、
//   crack: 当たった瞬間の雑音の明るさ (Hz) と量、dust: 砂や土のざらつき
const SURFACES = {
  wood: { thud: 70, body: [190, 410], ring: 0.05, crack: [2200, 0.7], gain: 1 },
  asphalt: { thud: 60, body: [150], ring: 0.025, crack: [1600, 0.5], dust: 0.5, gain: 0.85 },
  beam: { thud: 85, body: [240, 530, 980], ring: 0.07, crack: [2600, 0.7], gain: 0.9 },
  stone: { thud: 65, body: [320, 870], ring: 0.03, crack: [3400, 0.9], gain: 0.9 },
  ice: { thud: 75, body: [1900, 3150, 4400], ring: 0.06, crack: [5000, 1], gain: 0.8 },
  regolith: { thud: 50, body: [120], ring: 0.03, crack: [700, 0.3], dust: 1, gain: 0.6 },
  neon: { thud: 80, body: [620, 1850], ring: 0.05, crack: [3200, 0.8], gain: 0.85 },
  tech: { thud: 75, body: [430, 1130, 2050, 3020], ring: 0.16, crack: [3800, 0.8], gain: 0.75 },
  steel: { thud: 70, body: [260, 710, 1390, 2290], ring: 0.28, crack: [3000, 0.8], gain: 0.75 },
  marble: { thud: 70, body: [880, 2370], ring: 0.04, crack: [4200, 1], gain: 0.85 },
};

// 壁などの鳴り方 (相手の物で決まる)
const OBJECTS = {
  wall: { thud: 90, body: [210, 470], ring: 0.04, crack: [2000, 0.6], gain: 0.85 },        // 木の板の壁、ガター、ブロック
  cushion: { thud: 60, body: [], ring: 0.02, crack: [500, 0.15], gain: 0.5 },               // ピットの奥の幕
  rail: { thud: 140, body: [520, 1340, 2600], ring: 0.09, crack: [3600, 0.9], gain: 0.75, boing: 1 }, // はね返す反射板
  tire: { thud: 55, body: [95], ring: 0.05, crack: [420, 0.2], gain: 0.7, boing: 0.5 },    // ゴムのタイヤ
};

const MIN_SPEED = 0.6;   // これより弱い当たりは鳴らさない (転がりながら床の継ぎ目を越えるときなど)
const FULL_SPEED = 5;    // これより強く当たったら最大の音
const MIN_GAP = 0.05;    // 同じ相手で続けて鳴るまでの間 (秒)
const lastHit = new WeakMap();

/*
 * ボールが何かに当たった音を鳴らす
 *   what: 'ground' (床) / 'wall' / 'cushion' / 'rail' / 'tire'、surface: 床の材質 (ground のとき)
 *   speed: 当たった速さ (m/s)、x: ボールの左右の位置、key: 当たった相手 (続けて鳴りすぎないよう見張る)
 */
export function ballHit(what, surface, speed, x, key, worldTime) {
  const out = audioOut();
  const s = what === 'ground' ? SURFACES[surface] || SURFACES.wood : OBJECTS[what];
  if (!out || !s || speed < MIN_SPEED) return;
  if (worldTime - (lastHit.get(key) ?? -1) < MIN_GAP) return;
  lastHit.set(key, worldTime);
  const { ctx } = out;
  const at = audioTime(ctx, worldTime);
  const hit = clamp((speed - MIN_SPEED) / (FULL_SPEED - MIN_SPEED), 0, 1);
  const level = s.gain * (0.12 + 0.88 * Math.pow(hit, 1.2));
  const voice = voiceInput(out, level * 0.55, clamp(x / 1.5, -1, 1) * 0.5, 0.4 + 0.6 * hit);

  // 重い球が当たった「ドン」(高さが少し下がる)
  tone(ctx, voice, at, s.thud * rand(0.95, 1.05) * 1.6, 1, 0.06 + 0.05 * hit, s.thud);
  // 相手の物が鳴る音。高いものほど早く消え、強く当たるほどよく鳴る
  s.body.forEach((hz, i) => {
    tone(ctx, voice, at, hz * rand(0.97, 1.03), 0.55 * Math.pow(0.7, i) * (0.4 + 0.6 * hit), s.ring / (1 + i * 0.4));
  });
  // 当たった瞬間の「カツッ」
  noise(ctx, voice, at, 'bandpass', s.crack[0] * (0.7 + 0.3 * hit), 0.8, s.crack[1] * (0.3 + 0.7 * hit), 0.006);
  // 砂や土の「ザッ」
  if (s.dust) noise(ctx, voice, at, 'lowpass', 1200, 0.7, 0.5 * s.dust * hit, 0.05, 0.004);
  // はね返す物の「ボヨン」(少し揺れながら下がる音)
  if (s.boing) {
    const o = tone(ctx, voice, at, 330 * rand(0.95, 1.05), 0.4 * s.boing * hit, 0.07, 190, 'triangle');
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const depth = ctx.createGain();
    depth.gain.value = 18;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(at);
    lfo.stop(at + 0.5);
  }
}
