// エリーゼのために (ベートーヴェン, WoO 59)。ゲーム用の編曲 (A-B 部分。C 部分は省き、2 回目は左手を厚くする)
(() => {
  // 右手
  const pk = 'E5/16 D#5 |';
  const a1 = 'E5/16 D#5 E5 B4 D5 C5 |';
  const a2 = 'A4/8 r/16 C4 E4 A4 |';
  const a3 = 'B4/8 r/16 E4 G#4 B4 |';
  const a4 = 'C5/8 r/16 E4 E5 D#5 |';
  const a6 = 'A4/8 r/16 C4 E4 A4 |';
  const a7 = 'B4/8 r/16 E4 C5 B4 |';
  const a8a = 'A4/8 r/16 r/16 E5 D#5 |';
  const a8b = 'A4/8 r/16 B4 C5 D5 |';
  const a8z = 'A4/4.^ |';
  const A = (end) => [a1, a2, a3, a4, a1, a6, a7, end].join(' ');
  const B = [
    '!mf E5/8. G4/16 F5 E5 |',
    'D5/8. F4/16 E5 D5 |',
    'C5/8. E4/16 D5 C5 |',
    'B4/8 r/16 E4 E5 r |',
    '!p r/16 E5 E6 r r D#5 |',
    'E5/16 r r D#5 E5 D#5 |',
  ].join(' ');
  const rhOnce = ['!p', A(a8a), A(a8b), B, '!p', A(a8b), B, '!p', A(a8a)].join(' ');
  const rh = ['!p', pk, rhOnce, '!mp', rhOnce, '!p', A(a8z)].join(' ');

  // 左手 (1 回目はあっさり、2 回目はオクターブを足す)
  const lhA = (thick) => {
    const am = thick ? 'A2+A1/16 E3 A3 r r/8 |' : 'A2/16 E3 A3 r r/8 |';
    const em = thick ? 'E2+E1/16 E3 G#3 r r/8 |' : 'E2/16 E3 G#3 r r/8 |';
    return ['r/4. |', am, em, am, 'r/4. |', am, em, am].join(' ');
  };
  const lhB = (thick) =>
    [
      thick ? 'C3+C2/16 G3 C4 r r/8 |' : 'C3/16 G3 C4 r r/8 |',
      thick ? 'G2+G1/16 G3 B3 r r/8 |' : 'G2/16 G3 B3 r r/8 |',
      thick ? 'A2+A1/16 E3 A3 r r/8 |' : 'A2/16 E3 A3 r r/8 |',
      'E2/16 E3 E4 r r/8 |',
      'r/4. |',
      'r/4. |',
    ].join(' ');
  const lhOnce = (thick) => [lhA(thick), lhA(thick), lhB(thick), lhA(thick), lhB(thick), lhA(thick)].join(' ');
  const lhEnd = ['r/4. |', 'A2/16 E3 A3 r r/8 |', 'E2/16 E3 G#3 r r/8 |', 'A2/16 E3 A3 r r/8 |', 'r/4. |', 'A2/16 E3 A3 r r/8 |', 'E2/16 E3 G#3 r r/8 |', 'A2+A1/4.^ |'].join(' ');
  const lh = ['!p', 'r/8 |', lhOnce(false), '!mp', lhOnce(true), '!p', lhEnd].join(' ');

  window.CS_SCORES.elise = {
    id: 'elise',
    tempo: [[0, 66]],
    timeSig: [3, 8],
    key: { tonic: 9, minor: true }, // イ短調
    parts: [
      { inst: 'piano', vol: 1, melody: true, src: rh },
      { inst: 'piano', vol: 0.8, src: lh },
    ],
    // 決戦の BGM: 有名な出だし (8 小節) を、少し速くして繰り返す。from・len は拍
    theme: { part: 0, from: 0.5, len: 12, tempo: 84 },
  };
})();
