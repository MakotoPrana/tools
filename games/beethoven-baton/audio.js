/*
 * 指揮棒ベートーヴェン: 音の部品
 *   - 曲のデータを音符の並びに直す (loadSong)
 *   - ピアノの録音 (作曲家サバイバーと同じ Salamander Grand Piano) と合成の音色で鳴らす
 *   - 曲をループで先読みして鳴らし、ゲームの時計 (拍) をにぎる
 *
 * 拍の時刻は AudioContext.currentTime を基準にする。画面のフレームの都合で音と攻撃の拍がずれないように。
 */
(() => {
  'use strict';

  const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const DYN = { pp: 0.3, p: 0.42, mp: 0.52, mf: 0.62, f: 0.78, ff: 0.92 };

  function parsePitch(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('bad pitch: ' + s);
    let p = NOTE_BASE[m[1]] + (parseInt(m[3], 10) + 1) * 12;
    if (m[2] === '#') p++;
    if (m[2] === 'b') p--;
    return p;
  }

  function parseLen(s) {
    const m = /^(\d+)(\.?)$/.exec(s);
    if (!m) throw new Error('bad length: ' + s);
    let b = 4 / parseInt(m[1], 10);
    if (m[2]) b *= 1.5;
    return b;
  }

  // 文字で書いた譜面 → [{t, d, p, v}] (拍で数える)
  function parseText(src, barLen, label) {
    const out = [];
    let t = 0;
    let len = 1;
    let vel = 0.62;
    let lastBar = 0;
    let barNo = 0;
    for (const tok of src.split(/\s+/).filter(Boolean)) {
      if (tok === '|') {
        barNo++;
        if (Math.abs(t - lastBar - barLen) > 1e-6) console.warn(`[${label}] bar ${barNo}: ${t - lastBar} beats`);
        lastBar = t;
        continue;
      }
      if (tok[0] === '!') {
        vel = DYN[tok.slice(1)];
        continue;
      }
      const [pitch, l] = tok.split('/');
      if (l) len = parseLen(l);
      if (pitch !== 'r') {
        for (const ps of pitch.split('+')) out.push({ t, d: len, p: parsePitch(ps), v: vel });
      }
      t += len;
    }
    return { notes: out, length: t };
  }

  // 曲 → { bpm, beatsPerBar, length, notes: [{t,d,p,v,inst,mel}], cues: [拍] }
  function loadSong(raw) {
    const notes = [];
    let length = raw.lengthBeats || 0;
    raw.parts.forEach((part, i) => {
      const inst = part.inst || 'piano';
      const vol = part.vol || 1;
      if (raw.text) {
        let t0 = 0;
        for (const sec of part.data) {
          const r = parseText(sec, raw.beatsPerBar, `${raw.title} part ${i}`);
          for (const n of r.notes) notes.push({ t: n.t + t0, d: n.d, p: n.p, v: n.v * vol, inst, mel: !!part.melody });
          t0 += r.length;
        }
        length = Math.max(length, t0);
      } else {
        for (const s of part.data.split(';')) {
          const [a, b, c, d] = s.split(',').map(Number);
          notes.push({ t: a / raw.ppq, d: b / raw.ppq, p: c, v: 0.25 + d * 0.07, inst, mel: !!part.melody });
        }
      }
    });
    notes.sort((a, b) => a.t - b.t);
    // 拍の合図 (cue): メロディの音が鳴る 8 分音符の位置。ただし近すぎる合図は間引き、拍の頭を優先する。
    // 細かい 16 分音符の走句でも、合わせる場所が 8 分より細かくならないように
    const set = new Set();
    for (const n of notes) {
      if (!n.mel) continue;
      const e = n.t * 2;
      if (Math.abs(e - Math.round(e)) < 0.02) set.add(Math.round(e) / 2);
    }
    // 拍の頭は、メロディが休みでも必ず合図にする (伴奏が刻んでいるので)
    for (let b = 0; b < length; b++) set.add(b);
    let cues = [...set].sort((a, b) => a - b);
    // 8 分の裏は、前後どちらかの拍の頭にメロディの音が無いときだけ残す (シンコペーションのような所)
    const melOn = new Set();
    for (const n of notes) if (n.mel) melOn.add(Math.round(n.t * 48));
    cues = cues.filter((c) => {
      if (Number.isInteger(c)) return true;
      const hasLong = notes.some((n) => n.mel && Math.abs(n.t - c) < 0.01 && n.d >= 0.5);
      return hasLong;
    });
    // 強拍 (小節の頭) かどうか
    const cueInfo = cues.map((c) => ({ t: c, down: Math.abs(c % raw.beatsPerBar) < 1e-6, mel: melOn.has(Math.round(c * 48)) }));
    // メロディの音の頭 (16 分音符の格子の上のものだけ。トリルや装飾音のような細かい音は除く)。攻撃はこれに合わせる
    const melMap = new Map();
    for (const n of notes) {
      if (!n.mel) continue;
      const q = n.t * 4;
      if (Math.abs(q - Math.round(q)) > 0.03) continue;
      const k = Math.round(q);
      const prev = melMap.get(k);
      if (!prev || n.d > prev.d) melMap.set(k, { t: k / 4, d: n.d, p: n.p });
      else if (n.p > prev.p) prev.p = n.p;
    }
    const mel = [...melMap.values()].sort((a, b) => a.t - b.t);
    // 次の音までの間 (判定の幅を決めるのに使う)
    mel.forEach((m, i) => {
      const nx = i + 1 < mel.length ? mel[i + 1].t : length + mel[0].t;
      const pv = i > 0 ? mel[i - 1].t : mel[mel.length - 1].t - length;
      m.gap = Math.min(nx - m.t, m.t - pv);
    });
    return { title: raw.title, bpm: raw.bpm, beatsPerBar: raw.beatsPerBar, length, notes, cues: cueInfo, mel };
  }

  // ---------- 鳴らす部品 ----------
  const Audio = {
    ctx: null,
    master: null,
    music: null,
    sfx: null,
    reverb: null,
    samples: { v8: new Map(), v13: new Map() },
    samplesBase: '../composer-survivors/samples/piano/',
    samplesReady: false,
    samplesLoaded: 0,
    samplesTotal: 0,
    noiseBuf: null,
    musicVol: 0.8,
    sfxVol: 0.9,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.gain.value = this.musicVol;
      this.sfx = ctx.createGain();
      this.sfx.gain.value = this.sfxVol;
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      // 小さなホールの残響 (雑音を減衰させた応答)
      const len = Math.floor(ctx.sampleRate * 1.6);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      this.reverbIn = ctx.createGain();
      this.reverbIn.connect(this.reverb).connect(wet).connect(this.master);
      this.music.connect(this.reverbIn);
      this.sfx.connect(this.reverbIn);
      // 雑音 (風切り音・打撃音用)
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
      this.loadSamples();
    },

    resume() {
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    },

    now() {
      return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
    },

    // 画面に出る音の時刻 = 予約した時刻 + 出力の遅れ
    latency() {
      if (!this.ctx) return 0;
      return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    },

    loadSamples() {
      const names = ['C', 'Ds', 'Fs', 'A'];
      const pcs = [0, 3, 6, 9];
      const jobs = [];
      for (let oct = 1; oct <= 7; oct++) {
        for (let k = 0; k < 4; k++) {
          const midi = (oct + 1) * 12 + pcs[k];
          for (const v of ['v8', 'v13']) {
            this.samplesTotal++;
            jobs.push(
              fetch(`${this.samplesBase}${names[k]}${oct}-${v}.mp3`)
                .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
                .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
                .then((buf) => {
                  this.samples[v].set(midi, buf);
                  this.samplesLoaded++;
                })
                .catch(() => {
                  this.samplesLoaded++;
                }),
            );
          }
        }
      }
      Promise.all(jobs).then(() => {
        this.samplesReady = this.samples.v8.size > 16;
      });
    },

    nearest(layer, p) {
      const m = this.samples[layer];
      for (let d = 0; d <= 2; d++) {
        if (m.has(p - d)) return [m.get(p - d), p - d];
        if (m.has(p + d)) return [m.get(p + d), p + d];
      }
      return null;
    },

    pan(node, p, dest) {
      const ctx = this.ctx;
      if (ctx.createStereoPanner) {
        const pn = ctx.createStereoPanner();
        pn.pan.value = Math.max(-0.6, Math.min(0.6, (p - 64) / 40));
        node.connect(pn).connect(dest);
      } else node.connect(dest);
    },

    piano(p, t, dur, vel, dest) {
      const ctx = this.ctx;
      const layer = vel > 0.66 ? 'v13' : 'v8';
      const hit = this.samplesReady && (this.nearest(layer, p) || this.nearest(layer === 'v13' ? 'v8' : 'v13', p));
      if (!hit) {
        // 録音を読みこむまでの代わり: 三角波を減衰させる
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 440 * Math.pow(2, (p - 69) / 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.005);
        g.gain.setTargetAtTime(0, t + 0.01, Math.min(0.5, dur * 0.6 + 0.05));
        o.connect(g);
        this.pan(g, p, dest);
        o.start(t);
        o.stop(t + dur + 1);
        return;
      }
      const [buf, sp] = hit;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (p - sp) / 12);
      const g = ctx.createGain();
      const level = (layer === 'v13' ? 0.62 + vel * 0.38 : 0.45 + vel * 0.75) * 0.85;
      g.gain.setValueAtTime(level, t);
      const off = t + Math.max(0.08, dur);
      const rel = p < 48 ? 0.35 : p < 72 ? 0.22 : 0.15;
      g.gain.setTargetAtTime(0, off, rel);
      src.connect(g);
      this.pan(g, p, dest);
      src.start(t);
      src.stop(Math.min(off + rel * 6, t + buf.duration / src.playbackRate.value));
    },

    // 弦 (のこぎり波 2 つを少しずらして、こもらせる)
    strings(p, t, dur, vel, dest, bright = 2400) {
      const ctx = this.ctx;
      const f = 440 * Math.pow(2, (p - 69) / 12);
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = bright;
      lp.Q.value = 0.6;
      const a = 0.25 * vel;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.03);
      g.gain.setValueAtTime(a * 0.85, t + Math.max(0.04, dur - 0.04));
      g.gain.linearRampToValueAtTime(0, t + dur + 0.12);
      lp.connect(g);
      this.pan(g, p, dest);
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.2);
      }
    },

    timp(p, t, dur, vel, dest) {
      const ctx = this.ctx;
      const f = 440 * Math.pow(2, (p - 69) / 12);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9 * vel, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 1);
      this.noise(t, 0.05, 0.25 * vel, 900, dest);
    },

    noise(t, dur, vol, freq, dest = this.sfx, type = 'bandpass', q = 1) {
      const ctx = this.ctx;
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f).connect(g).connect(dest);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.02);
    },

    playNote(n, t, secPerBeat) {
      const dur = n.d * secPerBeat;
      const dest = this.music;
      switch (n.inst) {
        case 'strings':
          return this.strings(n.p, t, dur * 0.92, n.v, dest);
        case 'bass':
          return this.strings(n.p, t, dur * 0.7, n.v * 1.1, dest, 900);
        case 'pad':
          return this.strings(n.p, t, dur, n.v * 0.6, dest, 1400);
        case 'timp':
          return this.timp(n.p, t, dur, n.v, dest);
        default:
          return this.piano(n.p, t, dur, n.v, dest);
      }
    },

    // ---------- 効果音 ----------
    sfxSwing(strong) {
      if (!this.ctx) return;
      const t = this.now();
      this.noise(t, strong ? 0.22 : 0.12, strong ? 0.5 : 0.3, strong ? 1800 : 2600, this.sfx, 'bandpass', 0.8);
    },
    sfxHit(power) {
      if (!this.ctx) return;
      const t = this.now();
      this.noise(t, 0.12 + power * 0.1, 0.5 + power * 0.3, 700, this.sfx, 'lowpass', 1);
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5 + power * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.25);
    },
    sfxBlock() {
      if (!this.ctx) return;
      const t = this.now();
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.08);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.15);
      this.noise(t, 0.06, 0.3, 3000, this.sfx, 'highpass');
    },
    // ジャストガード: 澄んだ鐘
    sfxJust() {
      if (!this.ctx) return;
      const t = this.now();
      for (const [f, v] of [[1568, 0.18], [2093, 0.12], [3136, 0.06]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        o.connect(g).connect(this.sfx);
        o.start(t);
        o.stop(t + 1.3);
      }
    },
    sfxHurt() {
      if (!this.ctx) return;
      const t = this.now();
      this.noise(t, 0.25, 0.6, 400, this.sfx, 'lowpass');
    },
    sfxCharge(level) {
      if (!this.ctx) return;
      const t = this.now();
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = level >= 2 ? 1046 : 784;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.35);
    },
    // タイミングが合った一撃: 曲に合う和音をピアノで (judge: 2 = PERFECT, 1 = GREAT)
    sfxChord(pitches, judge) {
      if (!this.ctx) return;
      const t = this.now();
      pitches.forEach((p, i) => this.piano(p, t + i * (judge >= 2 ? 0.035 : 0.05), 0.6, judge >= 2 ? 0.85 : 0.6, this.sfx));
    },
  };

  // ---------- 曲を流す ----------
  // 曲は start からの拍で数える。loopFrom から最後まで来たら loopFrom に戻る (道中・ボスとも 0)
  class Player {
    constructor(song) {
      this.song = song;
      this.spb = 60 / song.bpm;
      this.start = 0;
      this.cursor = 0; // 次に予約する音の位置 (曲を何周もした通しの拍)
      this.idx = 0;
      this.loop = 0;
      this.playing = false;
      this.gain = null;
      this.pausedAt = null;
    }
    play(delay = 0.15) {
      const A = Audio;
      if (!A.ctx) return;
      this.gain = A.ctx.createGain();
      this.gain.gain.value = 1;
      this.gain.connect(A.music);
      this.start = A.now() + delay;
      this.idx = 0;
      this.loop = 0;
      this.playing = true;
    }
    // 今の拍 (耳に届いている音の拍)。offset は設定のずれ (秒)
    beat(offset = 0) {
      if (!this.playing) return -1;
      const t = (this.pausedAt !== null ? this.pausedAt : Audio.now()) - Audio.latency() - offset;
      return (t - this.start) / this.spb;
    }
    timeOfBeat(b) {
      return this.start + b * this.spb;
    }
    update() {
      if (!this.playing || this.pausedAt !== null) return;
      const A = Audio;
      const horizon = A.now() + 0.25;
      const notes = this.song.notes;
      const L = this.song.length;
      for (let guard = 0; guard < 400; guard++) {
        if (this.idx >= notes.length) {
          this.idx = 0;
          this.loop++;
        }
        const n = notes[this.idx];
        const tb = this.loop * L + n.t;
        const at = this.timeOfBeat(tb);
        if (at > horizon) break;
        if (at > A.now() - 0.05) {
          const save = A.music;
          A.music = this.gain;
          A.playNote(n, Math.max(at, A.now()), this.spb);
          A.music = save;
        }
        this.idx++;
      }
    }
    pause() {
      if (this.pausedAt !== null || !this.playing) return;
      this.pausedAt = Audio.now();
      this.gain.gain.setTargetAtTime(0, Audio.now(), 0.03);
    }
    resume() {
      if (this.pausedAt === null) return;
      // 止めていたあいだの分だけ、曲の始まりを後ろへずらす
      const dt = Audio.now() - this.pausedAt + 0.1;
      this.start += dt;
      this.pausedAt = null;
      this.gain.gain.cancelScheduledValues(Audio.now());
      this.gain.gain.setTargetAtTime(1, Audio.now() + 0.08, 0.03);
      // 止める前に予約してあった音は鳴ってしまうので、少し前から予約し直す
      while (this.idx > 0 && this.timeOfBeat(this.loop * this.song.length + this.song.notes[this.idx - 1].t) > Audio.now()) this.idx--;
    }
    stop(fade = 0.6) {
      if (!this.playing) return;
      this.playing = false;
      if (this.gain) {
        const g = this.gain;
        g.gain.cancelScheduledValues(Audio.now());
        g.gain.setTargetAtTime(0, Audio.now(), fade / 3);
        setTimeout(() => g.disconnect(), fade * 1000 + 600);
      }
    }
    // 拍 b に一番近い合図 (曲を何周もした通しの拍で返す)
    nearestCue(b) {
      const L = this.song.length;
      const loop = Math.floor(b / L);
      const local = b - loop * L;
      const cues = this.song.cues;
      let best = null;
      let bd = 1e9;
      // 2 分探索
      let lo = 0;
      let hi = cues.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cues[mid].t < local) lo = mid + 1;
        else hi = mid;
      }
      for (const i of [lo - 1, lo, lo + 1]) {
        if (i < 0 || i >= cues.length) continue;
        const d = Math.abs(cues[i].t - local);
        if (d < bd) {
          bd = d;
          best = { t: cues[i].t + loop * L, down: cues[i].down };
        }
      }
      // ループの継ぎ目
      if (local > L - 1 && Math.abs(L - local) < bd) best = { t: (loop + 1) * L, down: true };
      return best;
    }
    // [from, to) のメロディの音の頭 (通しの拍)
    melBetween(from, to) {
      const L = this.song.length;
      const out = [];
      for (let loop = Math.floor(from / L); loop * L < to; loop++) {
        for (const m of this.song.mel) {
          const t = m.t + loop * L;
          if (t >= from && t < to) out.push({ t, d: m.d, p: m.p });
        }
      }
      return out;
    }
    // 拍 b のまわりで、まだ使っていない一番近いメロディの音 (used: 使った音の通しの拍 × 4 の集合)
    nearestMel(b, used) {
      const cand = this.melBetween(b - 1, b + 1);
      let best = null;
      let bd = 1e9;
      for (const m of cand) {
        if (used && used.has(Math.round(m.t * 4))) continue;
        const d = Math.abs(m.t - b);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        const i = this.song.mel.findIndex((x) => Math.abs(x.t - (((best.t % this.song.length) + this.song.length) % this.song.length)) < 1e-6);
        best.gap = i >= 0 ? this.song.mel[i].gap : 1;
      }
      return best;
    }
    // [from, to) の合図 (通しの拍)
    cuesBetween(from, to) {
      const L = this.song.length;
      const out = [];
      for (let loop = Math.floor(from / L); loop * L < to; loop++) {
        for (const c of this.song.cues) {
          const t = c.t + loop * L;
          if (t >= from && t < to) out.push({ t, down: c.down, mel: c.mel });
        }
      }
      return out;
    }
    // 拍 b で鳴っているメロディの音の高さ (演出の和音用)
    melodyAt(b) {
      const L = this.song.length;
      const local = ((b % L) + L) % L;
      let best = null;
      for (const n of this.song.notes) {
        if (!n.mel) continue;
        if (n.t > local + 0.01) break;
        if (n.t + n.d >= local - 0.01) best = n;
      }
      return best ? best.p : 72;
    }
  }

  window.BB_AUDIO = { Audio, Player, loadSong };
})();
