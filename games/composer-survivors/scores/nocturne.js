// ノクターン第 2 番 変ホ長調 (ショパン, Op. 9-2)。ゲーム用のやさしい編曲 (A A' B A A' + 終わり)
// 左手は 12/8 拍子の「低音 + 和音の音 2 つ」の刻み
(() => {
  const { parsePitch } = window.CSAudio;
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const name = (p) => NAMES[p % 12] + (Math.floor(p / 12) - 1);
  const CH = {
    Eb: [3, 7, 10],
    Cm: [0, 3, 7],
    Bb7: [10, 2, 5, 8],
    Fm: [5, 8, 0],
    Ab: [8, 0, 3],
  };
  // 半小節 (付点 4 分 × 2) ぶんの左手
  const half = (c) => {
    const pcs = CH[c];
    let root = 38;
    while (root % 12 !== pcs[0]) root++;
    const ups = [];
    for (let q = 55; ups.length < 2; q++) if (pcs.includes(q % 12) && q % 12 !== pcs[0]) ups.push(q);
    const g = `${name(root)}/8 ${name(ups[0])} ${name(ups[1])}`;
    const g2 = `${name(root + 12)}/8 ${name(ups[0])} ${name(ups[1])}`;
    return `${g} ${g2}`;
  };

  const A = [
    ['G5/4 F5/8 G5/4. Eb5/4. Bb4/4.', 'Eb', 'Eb'],
    ['C6/4 Bb5/8 G5/4. Bb5/4. Ab5/8 G5 F5', 'Cm', 'Bb7'],
    ['G5/4. C5/8 D5 Eb5 F5/4. D5/4.', 'Cm', 'Bb7'],
    ['Eb5/2. r/4. r/4 Bb4/8', 'Eb', 'Eb'],
  ];
  const A2 = [
    ['G5/4 F5/8 G5/4. Eb5/4. Bb4/4.', 'Eb', 'Eb'],
    ['C6/4 Bb5/8 G5/4. Bb5/4. Ab5/8 G5 F5', 'Cm', 'Bb7'],
    ['G5/4. Bb5/8 Ab5 G5 F5/4. Bb4/4.', 'Eb', 'Bb7'],
    ['Eb5/2. r/4. r/4 Bb4/8', 'Eb', 'Eb'],
  ];
  const B = [
    ['!mp Eb5/4. D5/8 C5 D5 Eb5/4 G5/8 C6/4.', 'Cm', 'Cm'],
    ['Ab5/4. G5/8 F5 Ab5 D5/4 F5/8 Ab5/4.', 'Fm', 'Bb7'],
    ['G5/4. F5/8 Eb5 F5 G5/4 Bb5/8 Eb6/4.', 'Eb', 'Eb'],
    ['C6/4. Ab5/8 Eb5 Ab5 Bb5/4 Ab5/8 F5/4.', 'Ab', 'Bb7'],
    ['!< Eb5/4. D5/8 C5 D5 Eb5/4 G5/8 C6/4.', 'Cm', 'Cm'],
    ['C6/4. Eb6/8 D6 C6 Ab5/4 C6/8 Eb6/4.', 'Ab', 'Ab'],
    ['!f D6/4.> C6/8 Bb5 Ab5 F5/4 D5/8 Bb4/4.', 'Bb7', 'Bb7'],
    ['!mp Eb5/2. r/4. r/4 Bb4/8', 'Eb', 'Eb'],
  ];
  const CODA = [
    ['!p Bb5/4. G5/8 Bb5 Eb6 G6/2.', 'Eb', 'Eb'],
    ['C6/4. Ab5/8 Eb5 Ab5 C6/2.', 'Ab', 'Ab'],
    ['!pp D6/4. Bb5/8 F5 Ab5 D5/2.~', 'Bb7', 'Bb7'],
  ];
  const seq = ['!p', ...A, ...A2, ...B, '!p', ...A, ...A2, ...CODA];
  const rh = ['!p Bb4/8 |'];
  const lh = ['!p r/8 |'];
  for (const s of seq) {
    if (typeof s === 'string') {
      rh.push(s);
      continue;
    }
    rh.push(s[0] + ' |');
    lh.push(`${half(s[1])} ${half(s[2])} |`);
  }
  rh.push('Eb5+G5+Bb5/1.^ |');
  lh.push(`Eb2+Bb2/1.^ |`);

  window.CS_SCORES.nocturne = {
    id: 'nocturne',
    tempo: [[0, 66]],
    timeSig: [12, 8],
    key: { tonic: 3, minor: false },
    parts: [
      { inst: 'piano', vol: 1, melody: true, src: rh.join(' ') },
      { inst: 'piano', vol: 0.6, src: lh.join(' ') },
    ],
    theme: { part: 0, from: 0.5, len: 24, tempo: 84 },
  };
  void parsePitch;
})();
