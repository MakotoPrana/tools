/*
 * BGM: メニューではメニューの曲、ステージではそのワールドの曲を流す
 *   楽譜 (data/music.js) を、こまごとの音の並びに直しておき、少し先の分まで音の時計で予約していく。
 *   曲が変わるときは、前の曲を小さくしながら次の曲を始める
 */
import { on } from '../events.js';
import { game, isMenu } from '../state.js';
import { audioOut } from './output.js';
import { isDrum, playDrum, playNote } from './instruments.js';
import MUSIC from '../data/music.js';

const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.15;  // この秒数先までの音を予約しておく
const TICK_MS = 40;
const FADE_OUT = 1.2;
const FADE_IN = 0.4;

// ---- 楽譜を読む ----
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], 6: [0, 4, 7, 9],
};
function pitchClass(name) {
  let pc = PITCH[name[0]];
  if (name[1] === '#') pc++;
  if (name[1] === 'b') pc--;
  return (pc + 12) % 12;
}
function parseChord(name) {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  if (!m || !(m[2] in QUALITY)) throw new Error('unknown chord ' + name);
  return { pc: pitchClass(m[1]), ivs: QUALITY[m[2]] };
}
const chordTones = (ch, oct) => ch.ivs.map((i) => 12 * (oct + 1) + ch.pc + i);
function noteNumber(tok) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(tok);
  if (!m) throw new Error('unknown note ' + tok);
  return 12 * (Number(m[2]) + 1) + pitchClass(m[1]);
}
// 「1〜6 / o」を、コードの音に直す (コードの音が足りなければ1オクターブ上へ)
function degree(ch, oct, c) {
  const tones = chordTones(ch, oct);
  if (c === 'o') return tones[0] + 12;
  const i = Number(c) - 1;
  return tones[i % tones.length] + 12 * Math.floor(i / tones.length);
}
// pat[i] から続く「-」の数 + 1 (のばす長さ、こま)
function holdOf(seq, i) {
  let n = 1;
  while (n < seq.length && seq[(i + n) % seq.length] === '-') n++;
  return n;
}

const DRUM_VEL = { x: 0.8, X: 1, g: 0.35 };
function compile(song) {
  const chords = song.chords.map(parseChord);
  const len = chords.length * STEPS_PER_BAR;
  const steps = Array.from({ length: len }, () => []);
  song.parts.forEach((part, p) => {
    const base = { part: p, inst: part.inst, opt: part.opt || {} };
    const vel = part.vel ?? 0.8;
    for (let s = 0; s < len; s++) {
      const ch = chords[Math.floor(s / STEPS_PER_BAR)];
      if (part.mel) {
        const toks = part.mel.join(' ').split(/\s+/);
        const tok = toks[s % toks.length];
        if (tok !== '.' && tok !== '-') steps[s].push({ ...base, midi: noteNumber(tok), hold: holdOf(toks, s % toks.length), vel });
      } else if (part.chord) {
        const c = part.chord[s % part.chord.length];
        if (c === 'x') {
          const hold = holdOf(part.chord, s % part.chord.length);
          chordTones(ch, part.oct).forEach((midi) => steps[s].push({ ...base, midi, hold, vel }));
        }
      } else {
        const c = part.pat[s % part.pat.length];
        if (isDrum(part.inst)) {
          if (c in DRUM_VEL) steps[s].push({ ...base, drum: true, midi: part.note, vel: vel * DRUM_VEL[c] });
        } else if (/[1-6o]/.test(c)) {
          steps[s].push({ ...base, midi: degree(ch, part.oct, c), hold: holdOf(part.pat, s % part.pat.length), vel });
        }
      }
    }
  });
  return { song, steps, len };
}
const compiled = new Map();
function songFor(key) {
  if (!compiled.has(key)) compiled.set(key, compile(key === 'menu' ? MUSIC.menu : MUSIC.worlds[key]));
  return compiled.get(key);
}

// ---- 鳴らす ----
let track = null;   // 流している曲 { key, data, step, nextTime, gain, wetGain, parts }
let timer = 0;

function startTrack(key, out) {
  const { ctx } = out;
  const data = songFor(key);
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const wetGain = ctx.createGain();
  [gain, wetGain].forEach((g) => {
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1, now + FADE_IN);
  });
  gain.connect(out.music);
  wetGain.connect(out.musicWet);
  // パートごとの入口。響きへ送る量はパートで変える
  const parts = data.song.parts.map((part) => {
    const input = ctx.createGain();
    input.connect(gain);
    const send = ctx.createGain();
    send.gain.value = part.wet ?? 0.25;
    input.connect(send).connect(wetGain);
    return input;
  });
  return { key, data, step: 0, nextTime: now + 0.1, gain, wetGain, parts };
}

function fadeOut(t, ctx) {
  const now = ctx.currentTime;
  [t.gain, t.wetGain].forEach((g) => {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);
  });
  setTimeout(() => {
    t.gain.disconnect();
    t.wetGain.disconnect();
  }, (FADE_OUT + 3) * 1000);
}

function tick() {
  const out = audioOut();
  if (!out || !track) return;
  const { ctx } = out;
  const { song, steps, len } = track.data;
  const stepDur = 60 / song.bpm / 4;
  // 止まっていた (音を切っていた、別のタブにいた) ときは、遅れた分を飛ばして今から続ける
  if (track.nextTime < ctx.currentTime - 0.1) track.nextTime = ctx.currentTime + 0.05;
  while (track.nextTime < ctx.currentTime + LOOKAHEAD) {
    const s = track.step;
    let at = track.nextTime;
    if (song.swing && s % 4 === 2) at += song.swing * stepDur;
    if (song.swing16 && s % 2 === 1) at += song.swing16 * stepDur;
    for (const ev of steps[s]) {
      const dest = track.parts[ev.part];
      if (ev.drum) playDrum(ev.inst, ctx, dest, at, ev.vel, ev.midi);
      else playNote(ev.inst, ctx, dest, at, ev.midi, ev.hold * stepDur, ev.vel, ev.opt);
    }
    track.step = (s + 1) % len;
    track.nextTime += stepDur;
  }
}

// 今の画面に合う曲にする
function syncMusic() {
  const out = audioOut();
  if (!out) return;
  const key = isMenu() ? 'menu' : game.worldIndex;
  if (track && track.key === key) return;
  if (track) fadeOut(track, out.ctx);
  track = startTrack(key, out);
  if (!timer) timer = setInterval(tick, TICK_MS);
  tick();
}

on('audioReady', syncMusic);
on('modeChanged', syncMusic);
on('stageLoaded', syncMusic);
