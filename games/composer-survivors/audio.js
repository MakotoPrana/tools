/*
 * 作曲家サバイバー: 音の部品
 *   - 譜面の文字列を音符の並びに直す (parseScore)
 *   - 音色を Web Audio API で合成して鳴らす (Synth)
 *   - 曲を先読みで予約して鳴らし、敵を出すための時計をにぎる (Track)
 *
 * 音を鳴らす時刻と敵を出す時刻は、どちらも AudioContext.currentTime を基準に決める。
 * 画面のフレームの都合で、音と敵がずれないようにするため。
 */
(() => {
  'use strict';

  // ---------- 譜面の文字列 ----------
  // 1 つの音符: 音名 (C D E F G A B) + 変化記号 (# ## b bb) + オクターブ (中央のド = C4)。休符は r
  // 和音は + でつなぐ (C4+E4+G4)。長さは /4 (4 分音符) /8. (付点 8 分) /8t (3 連符の 8 分) など。書かなければ前の長さ
  // 記号 (長さのあとに続ける): ' スタッカート、> アクセント、~ トリル、^ フェルマータ、_ 次の同じ高さの音とタイ、g 装飾音
  // 強弱: !pp !p !mp !mf !f !ff。 クレッシェンド: !< (次の強弱まで)。 | は小節線 (長さの確かめにだけ使う)
  const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const DYN = { pp: 0, p: 1, mp: 2, mf: 3, f: 4, ff: 5 };

  function parsePitch(s) {
    const m = /^([A-G])(##|#|bb|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('bad pitch: ' + s);
    let p = NOTE_BASE[m[1]] + (parseInt(m[3], 10) + 1) * 12;
    if (m[2] === '#') p += 1;
    else if (m[2] === '##') p += 2;
    else if (m[2] === 'b') p -= 1;
    else if (m[2] === 'bb') p -= 2;
    return p;
  }

  function parseLen(s) {
    // 4 → 1 拍、8. → 0.75 拍、8t → 1/3 拍
    const m = /^(\d+)(\.?)(t?)$/.exec(s);
    if (!m) throw new Error('bad length: ' + s);
    let b = 4 / parseInt(m[1], 10);
    if (m[2]) b *= 1.5;
    if (m[3]) b *= 2 / 3;
    return b;
  }

  // src: 譜面の文字列。barLen: 1 小節の拍の数 (確かめ用)。返すのは [{t, d, p, v, mk}] (拍で数える)
  function parsePart(src, barLen, label) {
    const out = [];
    let t = 0;
    let len = 1;
    let dyn = 3;
    let cresc = null; // クレッシェンドの始まり { at: out の位置 }
    let lastBar = null;
    let barNo = 0;
    const ties = new Map(); // 高さ → タイでつなぐ前の音
    const toks = src.split(/\s+/).filter(Boolean);
    for (const tok of toks) {
      if (tok === '|') {
        barNo++;
        if (lastBar !== null && barLen && Math.abs(t - lastBar - barLen) > 1e-6 && typeof console !== 'undefined') {
          console.warn(`[score ${label}] bar ${barNo}: ${(t - lastBar).toFixed(3)} beats (expected ${barLen})`);
        }
        lastBar = t;
        continue;
      }
      if (tok[0] === '!') {
        const k = tok.slice(1);
        if (k === '<') {
          cresc = { at: out.length, from: dyn };
        } else if (k in DYN) {
          if (cresc) {
            // クレッシェンドの間に出た音符に、cresc フラグをつける (だんだん大きく硬く)
            const n = out.length - cresc.at;
            for (let i = cresc.at; i < out.length; i++) {
              out[i].cr = (i - cresc.at + 1) / Math.max(1, n);
            }
            cresc = null;
          }
          dyn = DYN[k];
        } else throw new Error('bad dynamic: ' + tok);
        continue;
      }
      const m = /^([^/]+)(?:\/([0-9.t]+))?(['>~^_g]*)$/.exec(tok);
      if (!m) throw new Error('bad token: ' + tok + ' in ' + label);
      if (m[2]) len = parseLen(m[2]);
      const marks = m[3] || '';
      if (m[1] !== 'r') {
        const pitches = m[1].split('+').map(parsePitch);
        for (const p of pitches) {
          const prev = ties.get(p);
          if (prev && Math.abs(prev.t + prev.d - t) < 1e-6) {
            prev.d += len;
            if (!marks.includes('_')) ties.delete(p);
            continue;
          }
          const n = { t, d: len, p, v: dyn, mk: marks.replace('_', ''), chord: pitches.length };
          out.push(n);
          if (marks.includes('_')) ties.set(p, n);
          else ties.delete(p);
        }
      }
      if (!marks.includes('g')) t += len; // 装飾音は時間をとらない (次の音の直前に鳴らす)
    }
    // 装飾音は次の音の少し前にずらす
    for (const n of out) {
      if (n.mk.includes('g')) {
        n.t = Math.max(0, n.t - 0.12);
        n.d = 0.12;
      }
    }
    return { notes: out, length: t };
  }

  // 楽譜から作ったデータ (tools/build_scores.py): 「前の音からの間,長さ,高さ,強弱[,記号]」を ; でつないだもの。単位は 1 拍 / ppq
  function decodePart(data, ppq) {
    const notes = [];
    let t = 0;
    let end = 0;
    if (!data) return { notes, length: 0 };
    for (const tok of data.split(';')) {
      const f = tok.split(',');
      t += +f[0];
      const n = { t: t / ppq, d: +f[1] / ppq, p: +f[2], v: +f[3], mk: f[4] || '', chord: 1 };
      notes.push(n);
      end = Math.max(end, n.t + n.d);
    }
    // 同じ時刻に始まる音の数 (和音)
    for (let i = 0; i < notes.length; ) {
      let j = i;
      while (j < notes.length && notes[j].t === notes[i].t) j++;
      for (let k = i; k < j; k++) notes[k].chord = j - i;
      i = j;
    }
    return { notes, length: end };
  }
  function partNotes(part, barLen, label, ppq) {
    return part.data !== undefined ? decodePart(part.data, ppq || 96) : parsePart(part.src, barLen, label);
  }

  // score: { tempo: [[拍, bpm], ...], timeSig: [分子, 分母], parts: [{ inst, vol, melody, src | data }] }
  // 返すのは秒に直した音符の並び (時刻の順) と、曲の長さ (秒)
  function parseScore(score, tempoMul = 1) {
    const barLen = (score.timeSig[0] * 4) / score.timeSig[1];
    const all = [];
    let lengthBeats = 0;
    score.parts.forEach((part, pi) => {
      const { notes, length } = partNotes(part, barLen, `${score.id}#${pi}`, score.ppq);
      lengthBeats = Math.max(lengthBeats, length);
      for (const n of notes) {
        n.part = pi;
        n.inst = part.inst;
        n.vol = part.vol ?? 1;
        n.melody = !!part.melody;
        all.push(n);
      }
    });
    const tempo = (score.tempo || [[0, 100]]).map(([b, bpm]) => [b, bpm * tempoMul]);
    // 拍 → 秒
    const segs = [];
    let sec = 0;
    for (let i = 0; i < tempo.length; i++) {
      const [b, bpm] = tempo[i];
      if (i > 0) {
        const [pb, pbpm] = tempo[i - 1];
        sec += ((b - pb) * 60) / pbpm;
      }
      segs.push({ b, bpm, sec });
    }
    const beatToSec = (beat) => {
      let s = segs[0];
      for (const g of segs) if (g.b <= beat) s = g;
      return s.sec + ((beat - s.b) * 60) / s.bpm;
    };
    const secToBeat = (t) => {
      let s = segs[0];
      for (const g of segs) if (g.sec <= t) s = g;
      return s.b + ((t - s.sec) * s.bpm) / 60;
    };
    const bpmAt = (beat) => {
      let s = segs[0];
      for (const g of segs) if (g.b <= beat) s = g;
      return s.bpm;
    };
    for (const n of all) {
      const s0 = beatToSec(n.t);
      n.sec = s0;
      n.dur = beatToSec(n.t + n.d) - s0;
    }
    all.sort((a, b) => a.sec - b.sec || a.p - b.p);
    return {
      notes: all,
      lengthBeats,
      lengthSec: beatToSec(lengthBeats),
      barLen,
      beatToSec,
      secToBeat,
      bpmAt,
    };
  }

  // ---------- 音色の合成 ----------
  const mtof = (p) => 440 * Math.pow(2, (p - 69) / 12);

  const Synth = {
    ctx: null,
    master: null,
    bgm: null,
    se: null,
    noise: null,
    voices: [],
    maxVoices: 40,
    init() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      this.bgm = ctx.createGain();
      this.bgm.connect(this.master);
      this.se = ctx.createGain();
      this.se.connect(this.master);
      // 部屋の響き (短い残響)
      const conv = ctx.createConvolver();
      conv.buffer = this.makeReverb(2.6);
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      conv.connect(wet);
      wet.connect(this.master);
      this.reverb = conv;
      const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
      this.loadSamples();
      return ctx;
    },
    // 響き (ホールの残響)。左右で別の雑音、はじめに少し間 (プリディレイ) と初期反射、
    // 後ろの尾は高い音から先に消える (時間とともに低域通過を強める)
    makeReverb(sec) {
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const len = Math.floor(sr * sec);
      const pre = Math.floor(sr * 0.018);
      const buf = ctx.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        let lp = 0;
        for (let i = pre; i < len; i++) {
          const k = (i - pre) / (len - pre);
          const env = Math.pow(1 - k, 2.2) * Math.exp(-k * 2.5);
          const a = 0.55 + 0.4 * k; // 後ろほど丸く
          lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
          d[i] = lp * env * 2.2;
        }
        // 初期反射
        for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [37, 0.22], [53, 0.16]]) {
          const j = pre + Math.floor((sr * (ms + c * 3)) / 1000);
          if (j < len) d[j] += g * (c ? -1 : 1);
        }
      }
      return buf;
    },
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setVolumes(bgm, se) {
      if (!this.ctx) return;
      this.bgm.gain.value = bgm;
      this.se.gain.value = se;
    },
    // fake: 音を出さずに時計だけ進める (自動プレイでのバランス確認用)
    fake: false,
    fakeTime: 0,
    now() {
      if (this.fake) return this.fakeTime;
      return this.ctx ? this.ctx.currentTime : 0;
    },
    // ---------- ピアノの録音 (Salamander Grand Piano V3, Alexander Holm, CC BY 3.0) ----------
    // samples/piano/ に、3 半音おき (C・D#・F#・A) の音を 2 つの強さ (v8・v13) で置いてある。
    // 読みこみ終わるまでは合成の音で鳴らす
    samples: { v8: new Map(), v13: new Map() },
    samplesBase: 'samples/piano/',
    samplesLoading: false,
    samplesReady: false,
    loadSamples() {
      if (this.samplesLoading || !this.ctx || this.fake) return;
      this.samplesLoading = true;
      const names = ['C', 'Ds', 'Fs', 'A'];
      const pcs = [0, 3, 6, 9];
      const jobs = [];
      for (let oct = 0; oct <= 8; oct++) {
        for (let k = 0; k < 4; k++) {
          const midi = (oct + 1) * 12 + pcs[k];
          if (midi < 21 || midi > 108) continue;
          for (const v of ['v8', 'v13']) {
            const url = `${this.samplesBase}${names[k]}${oct}-${v}.mp3`;
            jobs.push(
              fetch(url)
                .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
                .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
                .then((buf) => this.samples[v].set(midi, buf))
                .catch(() => {}),
            );
          }
        }
      }
      Promise.all(jobs).then(() => {
        this.samplesReady = this.samples.v8.size > 20;
      });
    },
    // 一番近い録音 (半音 2 つ以内)
    nearestSample(layer, p) {
      const m = this.samples[layer];
      for (let d = 0; d <= 2; d++) {
        if (m.has(p - d)) return [m.get(p - d), p - d];
        if (m.has(p + d)) return [m.get(p + d), p + d];
      }
      return null;
    },
    playSample(p, t, dur, vel, dest) {
      const ctx = this.ctx;
      const layer = vel > 0.66 ? 'v13' : 'v8';
      const hit = this.nearestSample(layer, p) || this.nearestSample(layer === 'v13' ? 'v8' : 'v13', p);
      if (!hit) return false;
      const [buf, sp] = hit;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.setValueAtTime(Math.pow(2, (p - sp) / 12), t);
      const g = ctx.createGain();
      // 強い層は少し抑え、弱い層は少し持ち上げて、強弱がなめらかにつながるように
      const level = (layer === 'v13' ? 0.62 + vel * 0.38 : 0.45 + vel * 0.75) * 0.9;
      g.gain.setValueAtTime(level, t);
      // 鍵盤を離したら (音の長さが終わったら) ダンパーで消える。低い音ほどゆっくり
      const off = t + Math.max(0.08, dur);
      const rel = p < 48 ? 0.35 : p < 72 ? 0.22 : 0.15;
      g.gain.setTargetAtTime(0, off, rel);
      const end = Math.min(off + rel * 6, t + buf.duration / src.playbackRate.value);
      src.connect(g);
      // 高さで左右に少し振る (低音は左、高音は右。客席から見たピアノのように)
      let node = g;
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-0.6, Math.min(0.6, (p - 64) / 40));
        g.connect(pan);
        node = pan;
      }
      node.connect(dest);
      const send = ctx.createGain();
      send.gain.value = 0.45;
      node.connect(send);
      send.connect(this.reverb);
      src.start(t);
      src.stop(end + 0.05);
      if (dest === this.bgm) {
        this.addVoice(g, [src], end);
        this.limit(t);
      }
      return true;
    },

    // 鳴っている音を管理する (一時停止で消す・同時に鳴らす数を抑える)
    addVoice(g, nodes, end) {
      const v = { g, nodes, end };
      this.voices.push(v);
      if (this.voices.length > this.maxVoices * 3) this.gc();
      return v;
    },
    gc() {
      const t = this.now();
      this.voices = this.voices.filter((v) => v.end > t);
    },
    // いま鳴っている BGM の音をすっと消す
    hush(fade = 0.12) {
      const t = this.now();
      for (const v of this.voices) {
        try {
          v.g.gain.cancelScheduledValues(t);
          v.g.gain.setValueAtTime(v.g.gain.value, t);
          v.g.gain.linearRampToValueAtTime(0, t + fade);
          for (const n of v.nodes) n.stop(t + fade + 0.02);
        } catch (e) {
          /* もう止まっている */
        }
      }
      this.voices = [];
    },
    // 同時に鳴っている数が多すぎるとき、古い音から消す
    limit(at) {
      const live = this.voices.filter((v) => v.end > at);
      this.voices = live;
      while (live.length > this.maxVoices) {
        const v = live.shift();
        try {
          v.g.gain.cancelScheduledValues(at);
          v.g.gain.setTargetAtTime(0, at, 0.02);
          for (const n of v.nodes) n.stop(at + 0.15);
        } catch (e) {
          /* 何もしない */
        }
      }
    },
    osc(type, freq, t) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      return o;
    },
    // inst の音色で、高さ p の音を時刻 t から dur 秒鳴らす
    play(inst, p, t, dur, vel, dest) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      dest = dest || this.bgm;
      if (inst === 'piano' && this.samplesReady && this.playSample(p, t, dur, vel, dest)) return;
      const f = mtof(p);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      const nodes = [];
      let end = t + dur + 0.6;
      const send = ctx.createGain();
      send.gain.value = 0.35;
      g.connect(dest);
      g.connect(send);
      send.connect(this.reverb);
      const vib = (o, rate, depth) => {
        const l = ctx.createOscillator();
        l.frequency.value = rate;
        const lg = ctx.createGain();
        lg.gain.value = f * depth;
        l.connect(lg);
        lg.connect(o.frequency);
        l.start(t);
        l.stop(end);
        nodes.push(l);
      };
      switch (inst) {
        case 'piano':
        case 'harpsi': {
          const o1 = this.osc('triangle', f, t);
          const o2 = this.osc(inst === 'harpsi' ? 'sawtooth' : 'sine', f * 2, t);
          const o3 = this.osc('sine', f, t);
          const g2 = ctx.createGain();
          g2.gain.value = inst === 'harpsi' ? 0.12 : 0.22;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(Math.min(9000, f * 8 + 800), t);
          lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 3 + 400), t + 0.6);
          o1.connect(lp);
          o2.connect(g2);
          g2.connect(lp);
          o3.connect(lp);
          lp.connect(g);
          const peak = vel * 0.32;
          const tau = 0.35 * Math.pow(2, (60 - p) / 20);
          g.gain.linearRampToValueAtTime(peak, t + 0.004);
          g.gain.setTargetAtTime(peak * 0.08, t + 0.01, tau);
          g.gain.setTargetAtTime(0, t + Math.max(0.06, dur), 0.09);
          end = t + Math.max(0.06, dur) + 0.6;
          for (const o of [o1, o2, o3]) {
            o.start(t);
            o.stop(end);
            nodes.push(o);
          }
          break;
        }
        case 'strings':
        case 'cello':
        case 'choir': {
          const det = inst === 'choir' ? [-9, 0, 9] : [-6, 6];
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = inst === 'cello' ? 1100 : inst === 'choir' ? 1500 : 2600;
          lp.Q.value = inst === 'choir' ? 4 : 0.7;
          lp.connect(g);
          for (const c of det) {
            const o = this.osc('sawtooth', f, t);
            o.detune.value = c;
            o.connect(lp);
            vib(o, 5.2, 0.004);
            o.start(t);
            o.stop(end);
            nodes.push(o);
          }
          const peak = (vel * 0.17) / Math.sqrt(det.length / 2);
          const atk = inst === 'choir' ? 0.12 : 0.06;
          g.gain.linearRampToValueAtTime(peak, t + atk);
          g.gain.setValueAtTime(peak, t + Math.max(atk, dur));
          g.gain.linearRampToValueAtTime(0, t + Math.max(atk, dur) + 0.18);
          end = t + Math.max(atk, dur) + 0.3;
          break;
        }
        case 'pizz': {
          const o = this.osc('triangle', f, t);
          o.connect(g);
          g.gain.linearRampToValueAtTime(vel * 0.35, t + 0.004);
          g.gain.setTargetAtTime(0, t + 0.01, 0.09);
          end = t + 0.6;
          o.start(t);
          o.stop(end);
          nodes.push(o);
          break;
        }
        case 'flute':
        case 'clarinet': {
          const o = this.osc(inst === 'flute' ? 'sine' : 'square', f, t);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = inst === 'flute' ? 5000 : 1600;
          o.connect(lp);
          lp.connect(g);
          vib(o, 5, 0.005);
          const peak = vel * (inst === 'flute' ? 0.26 : 0.1);
          g.gain.linearRampToValueAtTime(peak, t + 0.04);
          g.gain.setValueAtTime(peak * 0.9, t + Math.max(0.05, dur));
          g.gain.linearRampToValueAtTime(0, t + Math.max(0.05, dur) + 0.08);
          end = t + Math.max(0.05, dur) + 0.15;
          o.start(t);
          o.stop(end);
          nodes.push(o);
          break;
        }
        case 'brass': {
          const o = this.osc('sawtooth', f, t);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(300, t);
          lp.frequency.linearRampToValueAtTime(Math.min(5000, f * 6), t + 0.05);
          lp.frequency.setTargetAtTime(Math.min(3000, f * 4), t + 0.06, 0.2);
          o.connect(lp);
          lp.connect(g);
          const peak = vel * 0.18;
          g.gain.linearRampToValueAtTime(peak, t + 0.03);
          g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.04, dur));
          g.gain.linearRampToValueAtTime(0, t + Math.max(0.04, dur) + 0.1);
          end = t + Math.max(0.04, dur) + 0.2;
          o.start(t);
          o.stop(end);
          nodes.push(o);
          break;
        }
        case 'timpani': {
          const o = this.osc('sine', f * 1.05, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
          o.connect(g);
          const nz = ctx.createBufferSource();
          nz.buffer = this.noise;
          const nlp = ctx.createBiquadFilter();
          nlp.type = 'lowpass';
          nlp.frequency.value = 600;
          const ng = ctx.createGain();
          ng.gain.setValueAtTime(vel * 0.25, t);
          ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          nz.connect(nlp);
          nlp.connect(ng);
          ng.connect(g);
          g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.005);
          g.gain.setTargetAtTime(0, t + 0.02, 0.35);
          end = t + 1.6;
          o.start(t);
          o.stop(end);
          nz.start(t);
          nz.stop(t + 0.2);
          nodes.push(o, nz);
          break;
        }
        case 'bell':
        default: {
          const o = this.osc('sine', f, t);
          const o2 = this.osc('sine', f * 2.76, t);
          const g2 = ctx.createGain();
          g2.gain.value = 0.25;
          o.connect(g);
          o2.connect(g2);
          g2.connect(g);
          g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.003);
          g.gain.setTargetAtTime(0, t + 0.01, 0.4);
          end = t + 2;
          o.start(t);
          o.stop(end);
          o2.start(t);
          o2.stop(end);
          nodes.push(o, o2);
        }
      }
      if (dest === this.bgm) {
        this.addVoice(g, nodes, end);
        this.limit(t);
      }
    },
    // 指揮者のカウント (拍の頭のクリック)
    click(t, strong) {
      if (!this.ctx) return;
      const o = this.osc('square', strong ? 1760 : 1320, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g);
      g.connect(this.se);
      o.start(t);
      o.stop(t + 0.06);
    },
    // 効果音 (BGM とは別の音量)
    sfx(kind, opt = {}) {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      const g = ctx.createGain();
      g.connect(this.se);
      const tone = (type, f0, f1, dur, vol) => {
        const o = this.osc(type, f0, t);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(vol, t);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(gg);
        gg.connect(g);
        o.start(t);
        o.stop(t + dur + 0.02);
      };
      const noise = (dur, vol, freq) => {
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq || 2000;
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(vol, t);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f);
        f.connect(gg);
        gg.connect(g);
        s.start(t);
        s.stop(t + dur + 0.02);
      };
      const p = opt.p ?? 72;
      switch (kind) {
        case 'pop': // 音符を倒した (曲の調の音)
          tone('sine', mtof(p), 0, 0.09, 0.05);
          break;
        case 'pick':
          tone('sine', mtof(p), 0, 0.06, 0.035);
          break;
        case 'hurt':
          tone('sawtooth', 220, 110, 0.18, 0.12);
          break;
        case 'clang': // 結界にはじかれた
          tone('triangle', 1900, 1500, 0.15, 0.05);
          break;
        case 'level':
          [0, 4, 7, 12].forEach((d, i) => {
            const o = this.osc('triangle', mtof(p + d), t + i * 0.07);
            const gg = ctx.createGain();
            gg.gain.setValueAtTime(0.0001, t + i * 0.07);
            gg.gain.exponentialRampToValueAtTime(0.12, t + i * 0.07 + 0.01);
            gg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.3);
            o.connect(gg);
            gg.connect(g);
            o.start(t + i * 0.07);
            o.stop(t + i * 0.07 + 0.32);
          });
          break;
        case 'chest':
          [0, 7, 12, 16, 19].forEach((d, i) => {
            const o = this.osc('sine', mtof(p + d), t + i * 0.06);
            const gg = ctx.createGain();
            gg.gain.setValueAtTime(0.0001, t + i * 0.06);
            gg.gain.exponentialRampToValueAtTime(0.1, t + i * 0.06 + 0.01);
            gg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.5);
            o.connect(gg);
            gg.connect(g);
            o.start(t + i * 0.06);
            o.stop(t + i * 0.06 + 0.52);
          });
          break;
        case 'cymbal':
          noise(1.2, 0.3, 6000);
          noise(0.6, 0.2, 9000);
          break;
        case 'boom':
          tone('sine', 120, 40, 0.5, 0.35);
          noise(0.25, 0.15, 400);
          break;
        case 'applause':
          for (let i = 0; i < 40; i++) {
            const s = ctx.createBufferSource();
            s.buffer = this.noise;
            const f = ctx.createBiquadFilter();
            f.type = 'bandpass';
            f.frequency.value = 1500 + Math.random() * 1500;
            const gg = ctx.createGain();
            const at = t + Math.random() * 2.5;
            gg.gain.setValueAtTime(0.0001, at);
            gg.gain.exponentialRampToValueAtTime(0.06, at + 0.005);
            gg.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
            s.connect(f);
            f.connect(gg);
            gg.connect(g);
            s.start(at, Math.random() * 0.5);
            s.stop(at + 0.06);
          }
          break;
        case 'shot':
          tone('triangle', mtof(p), 0, 0.05, 0.025);
          break;
        default:
          break;
      }
    },
  };

  // ---------- 曲の再生と時計 ----------
  // notes: parseScore の notes。loopLen を渡すと繰り返す (決戦の BGM)
  class Track {
    constructor(notes, opt = {}) {
      this.notes = notes;
      this.loopLen = opt.loopLen || 0;
      this.playing = false;
      this.startAt = 0;
      this.pausedPos = 0;
      this.si = 0; // 次に予約する音
      this.sc = 0; // 繰り返しの何周目か (予約)
      this.di = 0; // 次に「出す」音 (敵を出す)
      this.dc = 0;
      this.timer = null;
      this.mute = false;
    }
    noteTime(i, c) {
      return this.notes[i].sec + c * this.loopLen;
    }
    // pos 秒の位置から鳴らす。countIn 秒あけて始める (その間はクリック)
    start(pos, countIn = 0, clicks = []) {
      const S = Synth;
      if (!S.ctx && !S.fake) return;
      this.stopTimer();
      const now = S.now() + 0.05;
      this.startAt = now + countIn - pos;
      for (const [dt, strong] of clicks) S.click(now + dt, strong);
      // 予約の位置を pos に合わせる (出した音符の位置 di はそのまま。巻き戻しても敵は二重に出さない)
      this.sc = this.loopLen ? Math.max(0, Math.floor(pos / this.loopLen)) : 0;
      const local = this.loopLen ? pos - this.sc * this.loopLen : pos;
      this.si = this.lower(local - 1e-4);
      this.playing = true;
      if (!S.fake) {
        this.timer = setInterval(() => this.schedule(), 25);
        this.schedule();
      }
    }
    lower(sec) {
      let lo = 0;
      let hi = this.notes.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (this.notes[m].sec < sec) lo = m + 1;
        else hi = m;
      }
      return lo;
    }
    stopTimer() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    }
    pos() {
      return this.playing ? Synth.now() - this.startAt : this.pausedPos;
    }
    pause(fade = 0.15) {
      if (!this.playing) return;
      this.pausedPos = this.pos();
      this.playing = false;
      this.stopTimer();
      Synth.hush(fade);
    }
    stop() {
      this.pause(0.3);
    }
    schedule() {
      if (!this.playing || !this.notes.length) return;
      const horizon = Synth.now() + 0.15;
      for (let guard = 0; guard < 400; guard++) {
        if (this.si >= this.notes.length) {
          if (!this.loopLen) return;
          this.si = 0;
          this.sc++;
        }
        const n = this.notes[this.si];
        const at = this.startAt + this.noteTime(this.si, this.sc);
        if (at > horizon) return;
        if (at >= Synth.now() - 0.03 && !this.mute) Synth.play(n.inst, n.p, at, n.dur, VEL[n.v] * n.vol * (n.velMul || 1));
        this.si++;
      }
    }
    // pos までに鳴った音符 (まだ出していないもの) を返す
    due(pos) {
      const out = [];
      if (!this.notes.length) return out;
      for (let guard = 0; guard < 500; guard++) {
        if (this.di >= this.notes.length) {
          if (!this.loopLen) break;
          this.di = 0;
          this.dc++;
        }
        if (this.noteTime(this.di, this.dc) > pos) break;
        out.push(this.notes[this.di]);
        this.di++;
      }
      return out;
    }
    // これから dt 秒の間に出る音符 (譜面プレビュー用)。[音符, 出る時刻]
    upcoming(pos, dt) {
      const out = [];
      if (!this.notes.length) return out;
      let i = this.di;
      let c = this.dc;
      for (let guard = 0; guard < 300; guard++) {
        if (i >= this.notes.length) {
          if (!this.loopLen) break;
          i = 0;
          c++;
        }
        const tt = this.noteTime(i, c);
        if (tt > pos + dt) break;
        out.push([this.notes[i], tt]);
        i++;
      }
      return out;
    }
    remaining() {
      return this.loopLen ? Infinity : this.notes.length - this.di;
    }
    // 曲の最後に音符を足す (アンコール)。notes は sec を足し終えたもの
    append(extra) {
      for (const n of extra) this.notes.push(n);
    }
  }

  const VEL = [0.35, 0.47, 0.58, 0.7, 0.85, 1];

  window.CSAudio = { parseScore, parsePart, partNotes, parsePitch, Synth, Track, mtof, VEL };
  window.CS_SCORES = window.CS_SCORES || {};
})();
