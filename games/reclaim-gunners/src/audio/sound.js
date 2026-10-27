// 効果音: Web Audio で銃声・爆発などを作って鳴らす
import { settings } from '../core/save.js';

// ===================================================================
// 効果音 (Web Audio で作る)
//   銃声は「破裂の高い音 (クラック)」「胴の音 (ノイズを絞った音)」「低いドン (サイン波)」「残響」を重ねて作る
// ===================================================================
export let actx = null;
export let AU = null;
export const sfxLast = {};

export function audioInit() {
  if (AU) return AU;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = actx.createDynamicsCompressor(); // たくさん同時に鳴っても割れないように
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 8;
  comp.attack.value = 0.002;
  comp.release.value = 0.15;
  comp.connect(actx.destination);
  const master = actx.createGain();
  master.connect(comp);
  // 残響 (外で撃ったときの、はね返る音)
  const sr = actx.sampleRate;
  const ir = actx.createBuffer(2, Math.floor(sr * 1.4), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < sr * 0.012 ? 0.3 : 1);
    }
  }
  const verb = actx.createConvolver();
  verb.buffer = ir;
  const verbOut = actx.createGain();
  verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(master);
  // ノイズの元 (2 秒ぶん。毎回ちがう所から鳴らす)
  const noise = actx.createBuffer(1, sr * 2, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU = { master, comp, verb, noise };
  return AU;
}

// ノイズの音。type: lowpass / highpass / bandpass。f1 を渡すと、周波数をなめらかに変える
export function nz(t, { type = 'bandpass', f = 1200, f1 = null, q = 0.8, gain = 0.5, attack = 0.001, dur = 0.1, verb = 0.25, pan = 0 }) {
  const src = actx.createBufferSource();
  src.buffer = AU.noise;
  const filt = actx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(f, t);
  if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  filt.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g);
  out(g, verb, pan);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}
// 音の高さのある音 (低いドン・弦・金属の響き)
export function tn(t, { wave = 'sine', f = 120, f1 = null, gain = 0.5, attack = 0.002, dur = 0.12, verb = 0.2, pan = 0 }) {
  const o = actx.createOscillator();
  o.type = wave;
  o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  out(g, verb, pan);
  o.start(t);
  o.stop(t + dur + 0.05);
}
export function out(node, verb, pan) {
  let n = node;
  if (pan && actx.createStereoPanner) {
    const p = actx.createStereoPanner();
    p.pan.value = pan;
    n.connect(p);
    n = p;
  }
  n.connect(AU.master);
  if (verb > 0) {
    const s = actx.createGain();
    s.gain.value = verb;
    n.connect(s).connect(AU.verb);
  }
}
// 金属の小さな音 (遊底・弾倉・ポンプ)
export function clack(t, f = 2600, gain = 0.25) {
  nz(t, { type: 'bandpass', f, q: 6, gain, dur: 0.035, verb: 0.08 });
  nz(t, { type: 'highpass', f: 4000, gain: gain * 0.6, dur: 0.018, verb: 0 });
}

// 武器ごとの銃声
export const GUN_SOUNDS = {
  // リボルバー: 乾いた破裂と、低いドン
  A1: (t) => {
    nz(t, { type: 'bandpass', f: 2600, q: 0.7, gain: 0.8, dur: 0.06, verb: 0.35 });
    nz(t, { type: 'lowpass', f: 1400, f1: 300, gain: 0.7, dur: 0.16, verb: 0.4 });
    tn(t, { f: 170, f1: 50, gain: 0.55, dur: 0.12, verb: 0.1 });
  },
  // サブマシンガン: 軽く短い連射音
  A2: (t) => {
    nz(t, { type: 'bandpass', f: 3000, q: 0.9, gain: 0.45, dur: 0.035, verb: 0.2 });
    nz(t, { type: 'lowpass', f: 1600, f1: 500, gain: 0.35, dur: 0.07, verb: 0.2 });
    tn(t, { f: 210, f1: 80, gain: 0.3, dur: 0.05, verb: 0 });
  },
  // 二丁拳銃: リボルバーより少し高く、左右に振る
  A3: (t, side) => {
    nz(t, { type: 'bandpass', f: 3000, q: 0.8, gain: 0.6, dur: 0.05, verb: 0.3, pan: side * 0.4 });
    nz(t, { type: 'lowpass', f: 1600, f1: 400, gain: 0.5, dur: 0.12, verb: 0.3, pan: side * 0.4 });
    tn(t, { f: 190, f1: 60, gain: 0.4, dur: 0.09, verb: 0.05, pan: side * 0.4 });
  },
  // 聖銀銃: 破裂のあとに、澄んだ鐘の響き
  A4: (t) => {
    GUN_SOUNDS.A1(t);
    tn(t + 0.01, { wave: 'triangle', f: 1760, gain: 0.12, dur: 0.6, verb: 0.6 });
    tn(t + 0.01, { wave: 'sine', f: 2637, gain: 0.07, dur: 0.5, verb: 0.6 });
  },
  // ショットガン: 重く広がる爆音。ポンプは撃ったあとにガシャッと引く
  B1: (t) => {
    GUN_SOUNDS._shot(t, 1);
    clack(t + 0.34, 1800, 0.28);
    clack(t + 0.46, 2400, 0.3);
  },
  B2: (t) => GUN_SOUNDS._shot(t, 1.15),
  B3: (t) => {
    GUN_SOUNDS._shot(t, 0.9);
    nz(t + 0.01, { type: 'highpass', f: 5000, gain: 0.25, dur: 0.12, verb: 0.2 });
  },
  B4: (t) => {
    GUN_SOUNDS._shot(t, 1.1);
    nz(t + 0.02, { type: 'bandpass', f: 600, f1: 2400, q: 0.6, gain: 0.35, dur: 0.35, verb: 0.3 });
  },
  _shot: (t, k) => {
    nz(t, { type: 'lowpass', f: 3400, f1: 600, gain: 0.95 * k, dur: 0.26, verb: 0.55 });
    nz(t, { type: 'bandpass', f: 1300, q: 0.5, gain: 0.6 * k, dur: 0.12, verb: 0.3 });
    tn(t, { f: 120, f1: 38, gain: 0.85 * k, dur: 0.22, verb: 0.1 });
  },
  // ガトリング: 短い破裂が続く
  C1: (t) => {
    nz(t, { type: 'bandpass', f: 1900, q: 1, gain: 0.42, dur: 0.04, verb: 0.15 });
    tn(t, { f: 150, f1: 60, gain: 0.32, dur: 0.045, verb: 0 });
  },
  // グレネード: ポンッという低い発射音
  C2: (t) => {
    tn(t, { f: 95, f1: 45, gain: 0.8, dur: 0.16, verb: 0.2 });
    nz(t, { type: 'lowpass', f: 700, gain: 0.45, dur: 0.12, verb: 0.2 });
    clack(t + 0.02, 1200, 0.15);
  },
  // 火炎放射器: シューッという炎の音
  C3: (t) => nz(t, { type: 'bandpass', f: 900, f1: 1600, q: 0.4, gain: 0.22, attack: 0.02, dur: 0.14, verb: 0.15 }),
  // 魔導ロケット: ドンと撃って、シュオーッと飛ぶ
  C4: (t) => {
    tn(t, { f: 110, f1: 40, gain: 0.7, dur: 0.2, verb: 0.3 });
    nz(t, { type: 'bandpass', f: 500, f1: 3000, q: 0.7, gain: 0.45, attack: 0.03, dur: 0.6, verb: 0.35 });
  },
  // 狩猟弓: 弦がビンと鳴る
  D1: (t) => {
    tn(t, { wave: 'triangle', f: 240, f1: 170, gain: 0.4, dur: 0.18, verb: 0.15 });
    nz(t, { type: 'highpass', f: 3500, gain: 0.2, dur: 0.05, verb: 0.1 });
  },
  // ライフル: 鋭い破裂と、長く残る残響
  D2: (t) => {
    nz(t, { type: 'highpass', f: 2800, gain: 0.85, dur: 0.05, verb: 0.6 });
    nz(t, { type: 'bandpass', f: 900, q: 0.6, gain: 0.7, dur: 0.2, verb: 0.6 });
    tn(t, { f: 130, f1: 40, gain: 0.7, dur: 0.16, verb: 0.2 });
    clack(t + 0.28, 2200, 0.18);
  },
  // クロスボウ: ガシッと撃ち出す
  D3: (t) => {
    tn(t, { wave: 'triangle', f: 320, f1: 130, gain: 0.45, dur: 0.1, verb: 0.1 });
    clack(t, 1600, 0.3);
    nz(t, { type: 'highpass', f: 3000, gain: 0.15, dur: 0.06, verb: 0.1 });
  },
  // 対魔ライフル: いちばん重い銃声と、光のうなり
  D4: (t) => {
    nz(t, { type: 'highpass', f: 2200, gain: 1, dur: 0.07, verb: 0.7 });
    nz(t, { type: 'lowpass', f: 1800, f1: 200, gain: 0.85, dur: 0.35, verb: 0.7 });
    tn(t, { f: 90, f1: 30, gain: 0.95, dur: 0.3, verb: 0.2 });
    tn(t, { wave: 'sawtooth', f: 880, f1: 1760, gain: 0.06, dur: 0.3, verb: 0.4 });
  },
  // 魔導: 火の玉のボッ / 氷のキン / 雷のバチッ
  E1: (t) => {
    nz(t, { type: 'bandpass', f: 500, f1: 1400, q: 0.8, gain: 0.4, attack: 0.01, dur: 0.2, verb: 0.3 });
    tn(t, { f: 180, f1: 90, gain: 0.25, dur: 0.12, verb: 0.1 });
  },
  E2: (t) => {
    nz(t, { type: 'highpass', f: 5000, gain: 0.25, attack: 0.005, dur: 0.15, verb: 0.4 });
    tn(t, { wave: 'sine', f: 1500, f1: 2400, gain: 0.12, dur: 0.18, verb: 0.5 });
  },
  E3: (t) => {
    nz(t, { type: 'bandpass', f: 3200, q: 0.4, gain: 0.55, dur: 0.1, verb: 0.35 });
    nz(t + 0.03, { type: 'bandpass', f: 2200, q: 0.5, gain: 0.35, dur: 0.08, verb: 0.3 });
    tn(t, { wave: 'square', f: 70, f1: 40, gain: 0.15, dur: 0.12, verb: 0.1 });
  },
  E4: (t) => tn(t, { wave: 'sawtooth', f: 220, f1: 230, gain: 0.05, attack: 0.02, dur: 0.12, verb: 0.2 }),
  S1: (t) => {
    GUN_SOUNDS.A1(t);
    tn(t, { wave: 'sawtooth', f: 140, f1: 70, gain: 0.15, dur: 0.2, verb: 0.3 });
  },
  S2: (t) => GUN_SOUNDS.E1(t),
};

export function gunSound(w, side = 0) {
  if (!settings.se) return;
  const now = performance.now();
  const key = `g_${w.id}`;
  if (sfxLast[key] && now - sfxLast[key] < 45) return;
  sfxLast[key] = now;
  try {
    audioInit();
    if (actx.state === 'suspended') actx.resume();
    AU.master.gain.value = settings.se * 0.6;
    const fn = GUN_SOUNDS[w.id] || GUN_SOUNDS.A1;
    fn(actx.currentTime + 0.005, side);
  } catch (e) { /* 音が鳴らなくても遊べる */ }
}

export function sfx(type) {
  if (!settings.se) return;
  const now = performance.now();
  if (sfxLast[type] && now - sfxLast[type] < 40) return;
  sfxLast[type] = now;
  try {
    audioInit();
    if (actx.state === 'suspended') actx.resume();
    AU.master.gain.value = settings.se * 0.6;
    const t = actx.currentTime + 0.005;
    switch (type) {
      case 'hit': // 弾が肉に当たる、にぶい音
        nz(t, { type: 'lowpass', f: 900, gain: 0.16, dur: 0.05, verb: 0 });
        break;
      case 'kill':
        nz(t, { type: 'bandpass', f: 700, f1: 220, q: 1.2, gain: 0.3, dur: 0.16, verb: 0.15 });
        tn(t, { f: 160, f1: 60, gain: 0.2, dur: 0.12, verb: 0 });
        break;
      case 'block': // 盾や鎧に弾かれる、キンという音
        tn(t, { wave: 'triangle', f: 2400, f1: 2100, gain: 0.18, dur: 0.12, verb: 0.3 });
        nz(t, { type: 'highpass', f: 4000, gain: 0.15, dur: 0.03, verb: 0.1 });
        break;
      case 'hurt':
        nz(t, { type: 'lowpass', f: 600, gain: 0.45, dur: 0.15, verb: 0.1 });
        tn(t, { wave: 'sawtooth', f: 160, f1: 70, gain: 0.18, dur: 0.18, verb: 0.05 });
        break;
      case 'explode': // 地面がゆれる爆発
        nz(t, { type: 'lowpass', f: 900, f1: 120, gain: 1, attack: 0.004, dur: 0.9, verb: 0.6 });
        nz(t, { type: 'bandpass', f: 2000, q: 0.4, gain: 0.35, dur: 0.12, verb: 0.3 });
        tn(t, { f: 70, f1: 28, gain: 0.9, dur: 0.7, verb: 0.2 });
        break;
      case 'nest': // 魔巣がつぶれる: 爆発と、うなり声
        nz(t, { type: 'lowpass', f: 700, f1: 100, gain: 0.95, dur: 1, verb: 0.6 });
        tn(t, { wave: 'sawtooth', f: 110, f1: 35, gain: 0.3, attack: 0.03, dur: 0.9, verb: 0.5 });
        tn(t, { f: 55, f1: 25, gain: 0.7, dur: 0.8, verb: 0.2 });
        break;
      case 'reload': // 弾倉を抜いて、差しこむ
        clack(t, 1700, 0.3);
        clack(t + 0.13, 2600, 0.32);
        tn(t + 0.13, { wave: 'triangle', f: 3200, f1: 3000, gain: 0.05, dur: 0.08, verb: 0.1 });
        break;
      case 'coin':
        tn(t, { wave: 'triangle', f: 2100, gain: 0.08, dur: 0.12, verb: 0.2 });
        tn(t + 0.04, { wave: 'triangle', f: 2800, gain: 0.07, dur: 0.14, verb: 0.2 });
        break;
      case 'pick':
        tn(t, { wave: 'sine', f: 700, f1: 1400, gain: 0.18, dur: 0.14, verb: 0.3 });
        break;
      case 'dodge': // 衣のこすれる音
        nz(t, { type: 'bandpass', f: 1200, f1: 500, q: 0.6, gain: 0.25, attack: 0.02, dur: 0.18, verb: 0.05 });
        break;
      case 'ui':
        clack(t, 2200, 0.12);
        break;
      case 'buy':
        tn(t, { wave: 'triangle', f: 660, gain: 0.18, dur: 0.25, verb: 0.4 });
        tn(t + 0.07, { wave: 'triangle', f: 990, gain: 0.16, dur: 0.3, verb: 0.4 });
        clack(t, 1400, 0.15);
        break;
      case 'boss': // 低く重いうなり
        tn(t, { wave: 'sawtooth', f: 60, f1: 40, gain: 0.35, attack: 0.1, dur: 1.6, verb: 0.6 });
        tn(t, { f: 45, gain: 0.5, attack: 0.1, dur: 1.6, verb: 0.3 });
        nz(t, { type: 'lowpass', f: 300, gain: 0.4, attack: 0.2, dur: 1.4, verb: 0.5 });
        break;
      case 'liberate': // 霧が晴れる、明るい和音
        [523, 659, 784, 1047].forEach((f, i) => {
          tn(t + i * 0.12, { wave: 'triangle', f, gain: 0.22, attack: 0.02, dur: 0.9, verb: 0.6 });
          tn(t + i * 0.12, { wave: 'sine', f: f * 2, gain: 0.06, attack: 0.02, dur: 0.7, verb: 0.6 });
        });
        break;
      case 'special': // 必殺技: 力をためて解き放つ
        tn(t, { wave: 'sawtooth', f: 220, f1: 880, gain: 0.22, attack: 0.02, dur: 0.35, verb: 0.5 });
        nz(t + 0.2, { type: 'lowpass', f: 1600, f1: 200, gain: 0.7, dur: 0.6, verb: 0.6 });
        tn(t + 0.2, { f: 90, f1: 40, gain: 0.6, dur: 0.5, verb: 0.3 });
        break;
      case 'just': // ジャスト回避: 澄んだ金属音
        tn(t, { wave: 'triangle', f: 1760, gain: 0.25, dur: 0.5, verb: 0.7 });
        tn(t + 0.05, { wave: 'sine', f: 2637, gain: 0.15, dur: 0.6, verb: 0.7 });
        break;
      case 'ready': // 必殺技ゲージが満タンになった
        tn(t, { wave: 'triangle', f: 880, gain: 0.14, dur: 0.18, verb: 0.4 });
        tn(t + 0.08, { wave: 'triangle', f: 1320, gain: 0.14, dur: 0.3, verb: 0.4 });
        break;
      case 'swing': // 中級悪魔の大振り
        nz(t, { type: 'bandpass', f: 600, f1: 1800, q: 0.8, gain: 0.5, attack: 0.03, dur: 0.22, verb: 0.2 });
        break;
      default: break;
    }
  } catch (e) { /* 音が鳴らなくても遊べる */ }
}
