/*
 * BGM の楽譜: メニューと、ワールドごとの曲
 *   1小節は16分音符 16 こま。chords は1小節ごとのコードで、最後まで行ったら最初に戻る。
 *   parts の書き方 (pat の1文字が1こま。パターンは長さぶんでくり返す)
 *     打楽器        x: 鳴らす  X: 強く  g: 弱く  .: 休み
 *     ベース・アルペジオ (pat)  1〜6: コードの何番目の音か (足りなければ1オクターブ上)  o: 根音の1オクターブ上
 *                              -: 前の音をのばす  .: 休み。oct は根音のオクターブ
 *     和音 (chord)  x: コードの音をみんな鳴らす  -: のばす  .: 休み
 *     メロディ (mel) 1小節ずつ、音名 (C5, F#4, Bb5 …) と - (のばす) と . (休み) を空白で区切って16こま
 *   swing: 8分音符の裏を遅らせる量 (ジャズのはね)、swing16: 16分音符の裏を遅らせる量
 *   wet: 場内の響きに送る量
 */
export default {
  // メニュー: 明るく楽しいボウリング場のテーマ
  menu: {
    bpm: 116, swing: 0.18,
    chords: ['F', 'Dm7', 'Gm7', 'C7', 'F', 'Dm7', 'Gm7', 'C7'],
    parts: [
      { inst: 'kick', pat: 'x.....x.x.......', vel: 0.8 },
      { inst: 'snare', pat: '....x.......x...', vel: 0.5 },
      { inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', vel: 0.5 },
      { inst: 'bass', pat: '1..1..3.1..1.3.4', oct: 2, vel: 0.9, opt: { wave: 'triangle', cutoff: 700 } },
      { inst: 'epiano', chord: '..x...x...x...x.', oct: 4, vel: 0.5 },
      {
        inst: 'vibes', vel: 0.75, wet: 0.5,
        mel: [
          'A4 - C5 . F5 - E5 . D5 - C5 . A4 - - .',
          'D5 - - . C5 . A4 . F4 - - . A4 - - .',
          'Bb4 - D5 . G5 - F5 . E5 - D5 . Bb4 - - .',
          'C5 - - . E5 . G5 . Bb5 - - - A5 - G5 .',
          'A5 - - . G5 . F5 . C5 - - . A4 . C5 .',
          'D5 - F5 . A5 - G5 . F5 - D5 . C5 - - .',
          'Bb4 . D5 . F5 . G5 - A5 - Bb5 . A5 . G5 .',
          'E5 - - - G5 - - - F5 - - - - - . .',
        ],
      },
    ],
  },
  worlds: [
    // 1 クラシックレーン: 昔ながらのボウリング場のラウンジ・ジャズ
    {
      bpm: 132, swing: 0.33,
      chords: ['Bbmaj7', 'Gm7', 'Cm7', 'F7', 'Dm7', 'G7', 'Cm7', 'F7'],
      parts: [
        { inst: 'ride', pat: 'x...x.x.x...x.x.', vel: 0.6 },
        { inst: 'hat', pat: '....x.......x...', vel: 0.35 },
        { inst: 'kick', pat: 'g.......g.......', vel: 0.5 },
        { inst: 'snare', pat: '..........g.....', vel: 0.3 },
        { inst: 'bass', pat: '1...2...3...4...1...4...3...2...', oct: 2, vel: 0.9, opt: { wave: 'sine', sub: false, cutoff: 600 } },
        { inst: 'epiano', chord: 'x.....x.........', oct: 4, vel: 0.45 },
        {
          inst: 'vibes', vel: 0.75, wet: 0.5,
          mel: [
            'D5 - - . F5 . A5 - - - G5 . F5 - - .',
            'D5 - - - - - . . Bb4 . D5 . F5 - - .',
            'Eb5 - - . G5 . Bb5 - - - A5 . G5 - - .',
            'F5 - - - Eb5 - - - C5 - - - A4 - - .',
            'F5 - - . A5 . C6 - - - A5 . F5 - - .',
            'D5 - - - B4 - - . D5 . F5 . G5 - - .',
            'Eb5 - G5 . Bb5 - G5 . Eb5 - C5 . Bb4 - - .',
            'A4 - - - C5 - - - Eb5 - - - D5 - - .',
          ],
        },
      ],
    },
    // 2 グランプリサーキット: 疾走するロック
    {
      bpm: 150,
      chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D'],
      parts: [
        { inst: 'kick', pat: 'x...x...x...x.x.', vel: 0.9 },
        { inst: 'snare', pat: '....x.......x...', vel: 0.75 },
        { inst: 'hat', pat: 'xgxgxgxgxgxgxgxg', vel: 0.5 },
        { inst: 'bass', pat: '1.1.o.1.1.1.o.1.', oct: 2, vel: 0.85, opt: { wave: 'sawtooth', cutoff: 800 } },
        { inst: 'pluck', pat: '1231123112311231', oct: 4, vel: 0.5, opt: { wave: 'square', decay: 0.07 } },
        {
          inst: 'lead', vel: 0.85, wet: 0.3, opt: { wave: 'sawtooth', cutoff: 3000 },
          mel: [
            'B4 - - . E5 - - . G5 - F#5 . E5 - D5 .',
            'E5 - - - - - . . C5 . D5 . E5 - G5 .',
            'D5 - - . G5 - - . B5 - A5 . G5 - F#5 .',
            'F#5 - - - A5 - - - D5 - - - - - . .',
            'E5 . G5 . B5 - - . A5 . G5 . E5 - - .',
            'G5 - - . E5 - - . C5 - - . E5 . G5 .',
            'B5 - - . A5 - G5 . D5 - - . G5 - A5 .',
            'F#5 - - - - - - - A5 - - - F#5 - - .',
          ],
        },
      ],
    },
    // 3 平均台: そっと渡る、軽やかなマリンバと笛
    {
      bpm: 104, swing16: 0.12,
      chords: ['G', 'Em7', 'Cmaj7', 'D'],
      parts: [
        { inst: 'kick', pat: 'x.......x.......', vel: 0.55 },
        { inst: 'rim', pat: '....x.......x...', vel: 0.6 },
        { inst: 'shaker', pat: 'x.xxx.xxx.xxx.xx', vel: 0.5 },
        { inst: 'bass', pat: '1.......3.......', oct: 2, vel: 0.8, opt: { wave: 'triangle', cutoff: 500 } },
        { inst: 'marimba', pat: '1.3.2.3.1.3.2.3.', oct: 4, vel: 0.8 },
        {
          inst: 'flute', vel: 0.8, wet: 0.5,
          mel: [
            'B5 - - - D6 - - - B5 - A5 - G5 - - -',
            'E5 - - - G5 - - - B5 - - - - - . .',
            'C6 - - - B5 - - - G5 - - - E5 - - -',
            'F#5 - - - A5 - - - D5 - - - - - . .',
          ],
        },
      ],
    },
    // 4 階段の神殿: 溶岩の上の、なぞめいた太鼓と琴
    {
      bpm: 92, swing16: 0.08,
      chords: ['Dm', 'Eb', 'Dm', 'C'],
      parts: [
        { inst: 'tom', pat: 'x..x..x...x.x...', vel: 0.75, note: 43 },
        { inst: 'tom', pat: '..............xx', vel: 0.6, note: 50 },
        { inst: 'kick', pat: 'x.......x..x....', vel: 0.7 },
        { inst: 'shaker', pat: '..x...x...x...x.', vel: 0.5 },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.8, opt: { cutoff: 900 } },
        { inst: 'pluck', pat: '1.2.3.o.3.2.1...', oct: 4, vel: 0.7, opt: { wave: 'triangle', decay: 0.25 } },
        {
          inst: 'lead', vel: 0.7, wet: 0.5, opt: { wave: 'square', cutoff: 1500 },
          mel: [
            'D5 - - - Eb5 - D5 - C5 - - - A4 - - -',
            'Bb4 - - - G4 - - - Bb4 - C5 - Eb5 - - -',
            'D5 - - - F5 - - - Eb5 - D5 - C5 - D5 -',
            'C5 - - - - - - - A4 - - - - - . .',
          ],
        },
      ],
    },
    // 5 アイスリンク: きらきらした鐘と、ゆったりした和音
    {
      bpm: 88,
      chords: ['Amaj7', 'F#m7', 'Dmaj7', 'E'],
      parts: [
        { inst: 'kick', pat: 'x.........x.....', vel: 0.5 },
        { inst: 'hat', pat: '..x...x...x...x.', vel: 0.4 },
        { inst: 'bass', pat: '1.......1.......', oct: 2, vel: 0.75, opt: { wave: 'sine', cutoff: 400 } },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.7, wet: 0.7, opt: { cutoff: 1600, attack: 0.8 } },
        { inst: 'bell', pat: '1234o4321234o432', oct: 5, vel: 0.45, wet: 0.7 },
        {
          inst: 'bell', vel: 0.9, wet: 0.7,
          mel: [
            'E6 - - - C#6 - - - B5 - - - A5 - - -',
            'C#6 - - - - - - - A5 - - - E5 - - -',
            'F#5 - - - A5 - - - C#6 - - - E6 - - -',
            'D6 - - - B5 - - - G#5 - - - - - - -',
          ],
        },
      ],
    },
    // 6 月面: 静かな宇宙。長い和音とテルミン
    {
      bpm: 76,
      chords: ['Cmaj9', 'D', 'Em7', 'D'],
      parts: [
        { inst: 'kick', pat: 'g...............', vel: 0.5 },
        { inst: 'rim', pat: '........g.......', vel: 0.5 },
        { inst: 'bass', pat: '1---------------', oct: 1, vel: 0.8, opt: { wave: 'sine', cutoff: 300 } },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.6, wet: 0.8, opt: { cutoff: 1100, attack: 1.2 } },
        { inst: 'bell', pat: '1...3...2...4...', oct: 5, vel: 0.35, wet: 0.9 },
        {
          inst: 'theremin', vel: 0.8, wet: 0.8,
          mel: [
            'G5 - - - - - - - E5 - - - D5 - - -',
            'F#5 - - - - - - - A5 - - - - - - -',
            'B5 - - - - - - - G5 - - - E5 - - -',
            'D5 - - - - - - - - - - - . . . .',
          ],
        },
      ],
    },
    // 7 ネオンピンボール: 80年代風のシンセウェーブ
    {
      bpm: 112,
      chords: ['Am', 'F', 'C', 'G'],
      parts: [
        { inst: 'kick', pat: 'x...x...x...x...', vel: 0.9 },
        { inst: 'clap', pat: '....x.......x...', vel: 0.7 },
        { inst: 'hat', pat: '..x...x...x...x.', vel: 0.55 },
        { inst: 'bass', pat: '1.o.1.o.1.o.1.o.', oct: 2, vel: 0.8, opt: { wave: 'sawtooth', cutoff: 900 } },
        { inst: 'pluck', pat: '123o123o123o123o', oct: 4, vel: 0.45, opt: { wave: 'square', decay: 0.06 } },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.6, opt: { cutoff: 1800 } },
        {
          inst: 'lead', vel: 0.85, wet: 0.5, opt: { wave: 'sawtooth', cutoff: 2800 },
          mel: [
            'E5 - - . A5 - - . C6 - B5 . A5 - G5 .',
            'A5 - - - - - - . F5 . G5 . A5 - C6 .',
            'G5 - - . E5 - - . G5 - C6 . B5 - G5 .',
            'B5 - - - - - - - D6 - - - B5 - - .',
          ],
        },
      ],
    },
    // 8 ワープ研究所: 電子音のテクノ
    {
      bpm: 126,
      chords: ['Dm', 'Dm', 'Bb', 'C'],
      parts: [
        { inst: 'kick', pat: 'x...x...x...x...', vel: 0.95 },
        { inst: 'clap', pat: '....x.......x...', vel: 0.55 },
        { inst: 'ohat', pat: '..x...x...x...x.', vel: 0.55 },
        { inst: 'hat', pat: 'gg.ggg.ggg.ggg.g', vel: 0.4 },
        { inst: 'bass', pat: '1.1o.1.1o.1.11.o', oct: 2, vel: 0.85, opt: { wave: 'sawtooth', acid: true } },
        { inst: 'pluck', pat: '1...3...o...3...', oct: 5, vel: 0.4, wet: 0.6, opt: { wave: 'square', decay: 0.05 } },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.5, opt: { cutoff: 1200, wave: 'square' } },
        {
          inst: 'lead', vel: 0.7, wet: 0.6, opt: { wave: 'square', cutoff: 2200 },
          mel: [
            'A5 - - - - - - - . . . . F5 . A5 .',
            'D6 - - - - - - - C6 - - - A5 - - -',
            'Bb5 - - - - - - - . . . . F5 . Bb5 .',
            'C6 - - - - - - - E6 - - - G5 - - -',
          ],
        },
      ],
    },
    // 9 工場: 金属の音が鳴りひびく、力強いインダストリアル
    {
      bpm: 100,
      chords: ['Em', 'Em', 'C', 'B'],
      parts: [
        { inst: 'kick', pat: 'x..x....x..x....', vel: 0.95 },
        { inst: 'snare', pat: '....x.......x...', vel: 0.8 },
        { inst: 'metal', pat: 'x...x.x...x.x..x', vel: 0.6 },
        { inst: 'hat', pat: 'x.x.x.x.x.x.x.x.', vel: 0.4 },
        { inst: 'bass', pat: '1..1..1.1..1..1.', oct: 2, vel: 0.85, opt: { wave: 'square', cutoff: 600, sub: true } },
        {
          inst: 'brass', vel: 0.85, wet: 0.4,
          mel: [
            'E5 - - - G5 - - - F#5 - E5 - D5 - - -',
            'E5 - - - - - - - B4 - - - - - . .',
            'C5 - - - E5 - - - G5 - F#5 - E5 - - -',
            'D#5 - - - F#5 - - - B5 - - - - - . .',
          ],
        },
      ],
    },
    // 10 天空の城: 雲の上の、壮大なハープと金管
    {
      bpm: 96,
      chords: ['Eb', 'Bb', 'Cm', 'Ab', 'Eb', 'Bb', 'Ab', 'Bb'],
      parts: [
        { inst: 'timpani', pat: 'x.......x.....x.', vel: 0.7, note: 39 },
        { inst: 'snare', pat: '....g.......g...', vel: 0.4 },
        { inst: 'ride', pat: 'g.g.g.g.g.g.g.g.', vel: 0.3 },
        { inst: 'bass', pat: '1.......1...3...', oct: 2, vel: 0.8, opt: { wave: 'triangle', cutoff: 600 } },
        { inst: 'pad', chord: 'x---------------', oct: 3, vel: 0.8, wet: 0.7, opt: { cutoff: 2000, attack: 0.6 } },
        { inst: 'pluck', pat: '123o3o21123o3o21', oct: 4, vel: 0.5, wet: 0.6, opt: { wave: 'triangle', decay: 0.3 } },
        {
          inst: 'brass', vel: 0.8, wet: 0.6,
          mel: [
            'G5 - - - Bb5 - - - Eb6 - - - D6 - C6 -',
            'D6 - - - - - - - Bb5 - - - F5 - - -',
            'G5 - - - C6 - - - Eb6 - - - D6 - C6 -',
            'C6 - - - - - - - Ab5 - - - Bb5 - - -',
            'Bb5 - - - G5 - - - Eb5 - - - G5 - Bb5 -',
            'D6 - - - - - - - F6 - - - D6 - - -',
            'Eb6 - - - C6 - - - Ab5 - - - C6 - - -',
            'Bb5 - - - - - - - - - - - . . . .',
          ],
        },
      ],
    },
  ],
};
