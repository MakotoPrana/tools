// ピアノ協奏曲第 21 番 ハ長調 K. 467 第 1 楽章 (モーツァルト) より。ボス戦の曲
// 自由に使える譜面のデータが見つからなかったので、このゲームのために書いた短い編曲 (行進曲風の冒頭の主題と、
// ピアノ独奏の 16 分音符の走句)。原曲の音とは違うところがある。ループする 24 小節
//
// 書き方: 音名 + オクターブ (中央のド = C4)、/4 は 4 分音符、/8. は付点 8 分、/16 は 16 分。書かなければ前の長さ。
// r は休符、+ で和音、| は小節線 (長さの確かめ用)。強さは !p !mf !f (以降の音すべて)
window.BB_SONGS = window.BB_SONGS || {};
(() => {
  // A: オーケストラの行進曲 (8 小節)
  const A_MEL = `
    !p C4/4 C4/8. E4/16 G4/4 G4/8. C5/16 | E5/4 D5/8. C5/16 B4/4 G4/4 |
    F4/4 F4/8. A4/16 D5/4 D5/8. F5/16 | E5/4 D5/8. C5/16 C5/4 r/4 |
    !f G4/8 C5 E5 G5 E5 C5 E5 G5 | A5/8 F5 D5 B4 G4/4 r/4 |
    C5/8 E5 G5 C6 B5 A5 G5 F5 | E5/4 D5/4 C5/2 |`;
  const A_BASS = `
    !p C3/4 C2 C3 C2 | C3 C2 G2 G2 | F2 F2 G2 G2 | C3 G2 C3 r |
    !f C3/8 C3 C3 C3 C3 C3 C3 C3 | F2 F2 F2 F2 G2 G2 G2 G2 | A2 A2 A2 A2 F2 F2 F2 F2 | G2/4 G2 C2/2 |`;
  const A_PAD = `
    !p C4+E4+G4/1 | C4+E4+G4/2 B3+D4+G4/2 | A3+C4+F4/2 B3+D4+G4/2 | C4+E4+G4/2 r/2 |
    !f C4+E4+G4/1 | A3+D4+F4/2 B3+D4+G4/2 | C4+E4+A4/2 A3+C4+F4/2 | B3+D4+G4/2 C4+E4+G4/2 |`;
  const A_TIMP = `
    r/1 | r/1 | r/1 | C2/4 G1 C2 r |
    C2/4 r C2 r | r/2 G1/4 G1 | C2/4 r r r | G1/4 G1 C2/2 |`;

  // B: ピアノ独奏の走句 (8 小節)。左手は 8 分音符の分散和音
  const B_PIANO = `
    !mf C5/16 E5 G5 C6 G5 E5 C5 E5 G4 B4 D5 G5 D5 B4 G4 B4 |
    A4 C5 E5 A5 E5 C5 A4 C5 F4 A4 C5 F5 C5 A4 F4 A4 |
    G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6 D6 E6/4 |
    D6/8 C6 B5 A5 G5/4 r/4 |
    !f E5/16 F5 E5 D5 C5 D5 E5 F5 G5/4 G5/4 |
    A5/16 G5 F5 E5 D5 C5 B4 A4 G4/2 |
    C5/16 E5 G5 C6 E6 G6 E6 C6 D6 F6 D6 B5 G5 B5 D6 B5 |
    C6/4 G5/4 C5/2 |`;
  const B_LH = `
    !p C3/8 G3 E3 G3 G2 D3 B2 D3 | A2 E3 C3 E3 F2 C3 A2 C3 | G2 D3 B2 D3 G2 D3 B2 D3 | G2 D3 B2 D3 G2/4 r/4 |
    C3/8 G3 E3 G3 C3 G3 E3 G3 | F2 C3 A2 C3 G2 D3 B2 D3 | C3 G3 E3 G3 G2 D3 B2 D3 | C3/4 G2/4 C2/2 |`;
  const B_PAD = `
    !p r/1 | r/1 | r/1 | r/1 | C4+E4+G4/1 | A3+C4+F4/2 B3+D4+G4/2 | C4+E4+G4/2 B3+D4+G4/2 | C4+E4+G4/2 r/2 |`;

  // A': もう一度行進曲。今度はピアノも高い音で重ねる
  const A2_PIANO = `
    !f C5/4 C5/8. E5/16 G5/4 G5/8. C6/16 | E6/4 D6/8. C6/16 B5/4 G5/4 |
    F5/4 F5/8. A5/16 D6/4 D6/8. F6/16 | E6/16 F6 E6 D6 C6 D6 E6 D6 C6/4 r/4 |
    G5/16 C6 E6 G6 E6 C6 E6 G6 C6 E6 G6 C7 G6 E6 C6 G5 | A5/16 F5 D5 B4 D5 F5 A5 F5 G5/4 r/4 |
    C6/16 E6 G6 C7 B6 A6 G6 F6 E6 D6 C6 B5 A5 G5 F5 E5 | E6/4 D6/4 C6/2 |`;

  window.BB_SONGS.k467 = {
    title: 'ピアノ協奏曲第21番 K.467 第1楽章',
    bpm: 126,
    beatsPerBar: 4,
    text: true,
    parts: [
      { inst: 'strings', melody: true, data: [A_MEL, 'r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |', A_MEL] },
      { inst: 'piano', melody: true, data: ['r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |', B_PIANO, A2_PIANO] },
      { inst: 'piano', vol: 0.7, data: ['r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |', B_LH, 'r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |'] },
      { inst: 'bass', data: [A_BASS, 'r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |', A_BASS] },
      { inst: 'pad', vol: 0.55, data: [A_PAD, B_PAD, A_PAD] },
      { inst: 'timp', data: [A_TIMP, 'r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 | r/1 |', A_TIMP] },
    ],
  };
})();
