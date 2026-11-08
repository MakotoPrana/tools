// きらきら星変奏曲 (モーツァルト, K. 265)。ゲーム用の編曲: 主題と 5 つの変奏
// 変奏ごとに音符の長さが変わる (4 分 → 8 分 → 16 分 → 3 連符 → 短調 → 終曲)
(() => {
  const { parsePitch } = window.CSAudio;
  const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const name = (p) => NAMES[p % 12] + (Math.floor(p / 12) - 1);

  // 主題 (2/4 拍子・1 小節に 4 分音符 2 つ)。24 小節 = A B A
  const mA = ['C5 C5', 'G5 G5', 'A5 A5', 'G5/2', 'F5 F5', 'E5 E5', 'D5 D5', 'C5/2'];
  const mB = ['G5 G5', 'F5 F5', 'E5 E5', 'D5/2', 'G5 G5', 'F5 F5', 'E5 E5', 'D5/2'];
  // 小節ごとの和音 (低音, 和音の構成音)
  const hA = [
    ['C3', 'C E G'], ['E3', 'C E G'], ['F3', 'F A C'], ['E3', 'C E G'],
    ['D3', 'D F A'], ['C3', 'C E G'], ['G2', 'G B D F'], ['C3', 'C E G'],
  ];
  const hB = [
    ['E3', 'C E G'], ['D3', 'G B D F'], ['C3', 'C E G'], ['B2', 'G B D'],
    ['E3', 'C E G'], ['D3', 'G B D F'], ['C3', 'C E G'], ['B2', 'G B D'],
  ];
  const melody = [...mA, ...mB, ...mA];
  const harmony = [...hA, ...hB, ...hA];

  // 小節の旋律を [高さ, 拍] に
  const notesOf = (bar) =>
    bar.split(' ').map((s) => {
      const [n, l] = s.split('/');
      return [parsePitch(n), l === '2' ? 2 : 1];
    });
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const step = (p, k) => {
    // ハ長調の音階で k 段ずらす
    let pc = p % 12;
    let oct = Math.floor(p / 12);
    let idx = SCALE.indexOf(pc);
    if (idx < 0) return p + k;
    idx += k;
    while (idx < 0) {
      idx += 7;
      oct--;
    }
    while (idx >= 7) {
      idx -= 7;
      oct++;
    }
    return oct * 12 + SCALE[idx];
  };
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // 和音の音で、p より上の近い音を順に
  const chordAbove = (p, chord, n) => {
    const pcs = chord.split(' ').map((c) => PC[c]);
    const out = [];
    for (let q = p + 1; out.length < n; q++) if (pcs.includes(q % 12)) out.push(q);
    return out;
  };
  const chordNear = (base, chord) => {
    const pcs = chord.split(' ').map((c) => PC[c]);
    const out = [];
    for (let q = base; out.length < 3; q++) if (pcs.includes(q % 12)) out.push(q);
    return out;
  };
  const minor = (p) => {
    // ハ短調に (E → Eb, A → Ab, B はそのまま)
    const pc = p % 12;
    if (pc === 4 || pc === 9) return p - 1;
    return p;
  };

  const rhBars = [];
  const lhBars = [];
  const push = (rh, lh) => {
    rhBars.push(rh + ' |');
    lhBars.push(lh + ' |');
  };

  // 主題: 右手は 4 分音符、左手は低音と和音
  rhBars.push('!mf');
  lhBars.push('!mp');
  melody.forEach((bar, i) => {
    const [bass, chord] = harmony[i];
    const c = chordNear(parsePitch('E4') - 3, chord).slice(0, 2).map(name).join('+');
    push(bar.split(' ').map((s) => (s.includes('/') ? s : s + '/4')).join(' '), `${bass}/4 ${c}/4`);
  });

  // 第 1 の変奏: 8 分音符 (旋律の音と、その上の和音の音)
  rhBars.push('!mf');
  melody.forEach((bar, i) => {
    const [bass, chord] = harmony[i];
    const r = [];
    for (const [p, l] of notesOf(bar)) {
      const up = chordAbove(p, chord, 1)[0];
      for (let k = 0; k < l; k++) r.push(`${name(p)}/8 ${name(up > p + 7 ? p : up)}/8`);
    }
    push(r.join(' '), `${bass}/4 ${name(parsePitch(bass) + 12)}/4`);
  });

  // 第 2 の変奏: 右手が 16 分音符で旋律のまわりを回る
  rhBars.push('!f');
  lhBars.push('!mp');
  melody.forEach((bar, i) => {
    const [bass] = harmony[i];
    const r = [];
    for (const [p, l] of notesOf(bar)) {
      for (let k = 0; k < l; k++) r.push(`${name(p)}/16 ${name(step(p, 1))} ${name(p)} ${name(step(p, -1))}`);
    }
    push(r.join(' '), `${bass}/2`);
  });

  // 第 3 の変奏: 左手が 16 分音符 (分散和音)、右手は旋律
  rhBars.push('!mf');
  lhBars.push('!mf');
  melody.forEach((bar, i) => {
    const [bass, chord] = harmony[i];
    const [c1, c2, c3] = chordNear(parsePitch(bass) + 1, chord);
    const pat = `${bass}/16 ${name(c2)} ${name(c1)} ${name(c2)}`;
    push(bar.split(' ').map((s) => (s.includes('/') ? s : s + '/4')).join(' '), `${pat} ${bass}/16 ${name(c3)} ${name(c1)} ${name(c3)}`);
  });

  // 第 4 の変奏: 3 連符の分散和音
  rhBars.push('!f');
  lhBars.push('!mp');
  melody.forEach((bar, i) => {
    const [bass, chord] = harmony[i];
    const r = [];
    for (const [p, l] of notesOf(bar)) {
      const [u1, u2] = chordAbove(p, chord, 2);
      for (let k = 0; k < l; k++) r.push(`${name(p)}/8t ${name(u1)} ${name(u2)}`);
    }
    push(r.join(' '), `${bass}/4 ${bass}/4`);
  });

  // 第 5 の変奏: ハ短調で、ゆったりと (長い音)
  rhBars.push('!p');
  lhBars.push('!p');
  melody.forEach((bar, i) => {
    const [bass, chord] = harmony[i];
    const r = notesOf(bar).map(([p, l]) => `${name(minor(p))}/${l === 2 ? 2 : 4}`);
    const cs = chordNear(parsePitch(bass) + 7, chord).slice(0, 2).map((p) => name(minor(p)));
    push(r.join(' '), `${name(minor(parsePitch(bass)))}+${cs.join('+')}/2`);
  });

  // 終曲: 旋律をオクターブで、左手は 16 分音符の分散オクターブ
  rhBars.push('!ff');
  lhBars.push('!f');
  melody.forEach((bar, i) => {
    const [bass] = harmony[i];
    const b = parsePitch(bass);
    const r = notesOf(bar).map(([p, l]) => `${name(p)}+${name(p - 12)}/${l === 2 ? 2 : 4}${l === 1 && i % 8 === 0 ? '>' : ''}`);
    push(r.join(' '), `${name(b)}/16 ${name(b + 12)} ${name(b)} ${name(b + 12)} ${name(b)} ${name(b + 12)} ${name(b)} ${name(b + 12)}`);
  });
  push('C5+C4+E5/2^', 'C3+C2/2^');

  window.CS_SCORES.twinkle = {
    id: 'twinkle',
    tempo: [
      [0, 104],
      [24 * 2 * 5, 76], // 短調の変奏はゆっくり
      [24 * 2 * 6, 120], // 終曲は速く
    ],
    timeSig: [2, 4],
    key: { tonic: 0, minor: false },
    parts: [
      { inst: 'piano', vol: 1, melody: true, src: rhBars.join(' ') },
      { inst: 'piano', vol: 0.75, src: lhBars.join(' ') },
    ],
    theme: { part: 0, from: 0, len: 16, tempo: 120 },
  };
})();
