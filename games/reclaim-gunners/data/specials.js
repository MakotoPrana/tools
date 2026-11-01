/*
 * 必殺技のデータ (SPEC.md の「必殺技」)
 *   武器ごとに 3 つ。1 つ目 (いちばん弱い) は最初から持っている。2・3 つ目は武器屋で習得する
 *   セットできるのは武器ごとに 1 つ。必殺技ゲージが満タンのとき、スロット 1 の武器の必殺技を出せる
 *   kind: fan (前に扇状) / nova (全方向) / rapid (一定時間 連射が上がり弾が減らない) / blast (ねらった所で爆発)
 *         lance (前に貫く一撃) / volley (近くの敵を何体も同時に撃つ) / quake (自分のまわりに衝撃)
 *   mul: 1 発 (1 回) のダメージ = 武器の毎秒のダメージ × mul
 *   n: 発数・体数・爆発の回数 / arc: 扇の広さ / r: 爆発・衝撃の半径 / len・w: 一撃の長さと幅 / t・k: rapid の時間と連射の倍率
 *   grow: [値の名前, 足す量]。必殺技の Lv5 と Lv10 で足す (ほかに 1 Lv ごとに威力 +10%)
 */
window.RG = window.RG || {};

(() => {
  const S = (name, kind, o) => ({ name, kind, ...o });

  RG.SPECIALS = {
    A1: [
      S('ファニングショット', 'fan', { n: 6, arc: 0.7, mul: 0.7, grow: ['n', 2] }),
      S('早撃ち百連', 'rapid', { t: 3, k: 2.5, grow: ['t', 1] }),
      S('真昼の決闘', 'volley', { n: 6, mul: 3, grow: ['n', 2] }),
    ],
    A2: [
      S('群蜂', 'nova', { n: 16, mul: 0.5, grow: ['n', 4] }),
      S('蜂の巣', 'rapid', { t: 3, k: 2, grow: ['t', 1] }),
      S('女王蜂の針', 'volley', { n: 8, mul: 2.5, grow: ['n', 2] }),
    ],
    A3: [
      S('双牙乱舞', 'fan', { n: 10, arc: 1.2, mul: 0.5, grow: ['n', 3] }),
      S('輪舞', 'nova', { n: 20, mul: 0.6, grow: ['n', 4] }),
      S('牙の嵐', 'rapid', { t: 4, k: 3, grow: ['t', 1] }),
    ],
    A4: [
      S('聖印弾', 'blast', { n: 1, r: 50, mul: 3, grow: ['r', 10] }),
      S('祓魔の環', 'nova', { n: 16, mul: 1, grow: ['n', 4] }),
      S('審判の日', 'volley', { n: 10, mul: 4, grow: ['n', 2] }),
    ],
    B1: [
      S('至近一撃', 'quake', { r: 70, mul: 2.5, grow: ['r', 10] }),
      S('連続ポンプ', 'rapid', { t: 3, k: 2, grow: ['t', 1] }),
      S('散弾嵐', 'fan', { n: 24, arc: 1.4, mul: 0.4, grow: ['n', 6] }),
    ],
    B2: [
      S('ゼロ距離', 'quake', { r: 80, mul: 3, grow: ['r', 10] }),
      S('二連轟砲', 'fan', { n: 20, arc: 0.9, mul: 0.5, grow: ['n', 5] }),
      S('ブルドッグラッシュ', 'quake', { r: 120, mul: 6, grow: ['r', 15] }),
    ],
    B3: [
      S('針千本', 'nova', { n: 24, mul: 0.5, pierce: 3, grow: ['n', 6] }),
      S('鋼の雨', 'fan', { n: 30, arc: 1.6, mul: 0.4, pierce: 3, grow: ['n', 6] }),
      S('串刺し', 'lance', { len: 400, w: 24, mul: 7, grow: ['w', 8] }),
    ],
    B4: [
      S('火竜の吐息', 'fan', { n: 18, arc: 1, mul: 0.5, grow: ['n', 4] }),
      S('灼熱圏', 'quake', { r: 110, mul: 3, grow: ['r', 15] }),
      S('竜王の咆哮', 'lance', { len: 320, w: 60, mul: 8, grow: ['w', 12] }),
    ],
    C1: [
      S('全弾掃射', 'rapid', { t: 3, k: 1.6, grow: ['t', 1] }),
      S('回転弾幕', 'nova', { n: 30, mul: 0.5, grow: ['n', 6] }),
      S('鉄の嵐', 'fan', { n: 40, arc: 1.2, mul: 0.4, grow: ['n', 8] }),
    ],
    C2: [
      S('大玉', 'blast', { n: 1, r: 80, mul: 3, grow: ['r', 12] }),
      S('絨毯爆撃', 'blast', { n: 5, r: 60, mul: 2, spread: 70, grow: ['n', 1] }),
      S('終末花火', 'blast', { n: 9, r: 70, mul: 2.5, spread: 110, grow: ['n', 2] }),
    ],
    C3: [
      S('火炎旋風', 'quake', { r: 100, mul: 2.5, grow: ['r', 15] }),
      S('炎の壁', 'lance', { len: 200, w: 50, mul: 4, grow: ['len', 40] }),
      S('煉獄', 'blast', { n: 6, r: 60, mul: 2.5, spread: 80, grow: ['n', 2] }),
    ],
    C4: [
      S('多弾頭', 'blast', { n: 3, r: 60, mul: 2, spread: 60, grow: ['n', 1] }),
      S('流星群', 'blast', { n: 7, r: 70, mul: 2, spread: 120, grow: ['n', 2] }),
      S('隕石落とし', 'blast', { n: 1, r: 140, mul: 8, grow: ['r', 20] }),
    ],
    D1: [
      S('三本矢', 'fan', { n: 3, arc: 0.25, mul: 2, pierce: 2, grow: ['n', 1] }),
      S('矢の雨', 'blast', { n: 6, r: 40, mul: 1.5, spread: 80, grow: ['n', 2] }),
      S('破魔矢', 'lance', { len: 500, w: 16, mul: 8, grow: ['w', 6] }),
    ],
    D2: [
      S('狙撃', 'volley', { n: 1, mul: 8, grow: ['n', 1] }),
      S('ダブルタップ', 'volley', { n: 4, mul: 5, grow: ['n', 1] }),
      S('デッドアイ', 'volley', { n: 8, mul: 6, grow: ['n', 2] }),
    ],
    D3: [
      S('杭打ち', 'lance', { len: 380, w: 14, mul: 4, grow: ['w', 6] }),
      S('血の宴', 'volley', { n: 6, mul: 3, grow: ['n', 2] }),
      S('夜明けの矢', 'fan', { n: 12, arc: 0.8, mul: 2, pierce: 3, grow: ['n', 3] }),
    ],
    D4: [
      S('聖槍', 'lance', { len: 520, w: 20, mul: 6, grow: ['w', 6] }),
      S('神罰', 'volley', { n: 6, mul: 6, grow: ['n', 2] }),
      S('ロンギヌスの光', 'lance', { len: 600, w: 60, mul: 12, grow: ['w', 12] }),
    ],
    E1: [
      S('火球乱射', 'fan', { n: 5, arc: 0.5, mul: 1.2, grow: ['n', 2] }),
      S('炎の柱', 'blast', { n: 3, r: 50, mul: 2.5, spread: 50, grow: ['n', 1] }),
      S('大火球', 'blast', { n: 1, r: 110, mul: 7, grow: ['r', 15] }),
    ],
    E2: [
      S('氷の環', 'nova', { n: 14, mul: 0.8, grow: ['n', 4] }),
      S('吹雪', 'blast', { n: 6, r: 55, mul: 1.8, spread: 90, grow: ['n', 2] }),
      S('絶対零度', 'quake', { r: 150, mul: 5, grow: ['r', 20] }),
    ],
    E3: [
      S('放電', 'volley', { n: 4, mul: 2.5, grow: ['n', 1] }),
      S('雷鳴', 'volley', { n: 8, mul: 3, grow: ['n', 2] }),
      S('神の雷', 'blast', { n: 5, r: 70, mul: 3, spread: 90, grow: ['n', 2] }),
    ],
    E4: [
      S('光の矢', 'lance', { len: 300, w: 16, mul: 3, grow: ['w', 6] }),
      S('聖域', 'quake', { r: 120, mul: 3, grow: ['r', 15] }),
      S('天の裁き', 'lance', { len: 420, w: 70, mul: 9, grow: ['w', 12] }),
    ],
    S1: [
      S('三属弾', 'fan', { n: 9, arc: 0.8, mul: 1, grow: ['n', 3] }),
      S('魔弾の射手', 'volley', { n: 7, mul: 4, grow: ['n', 2] }),
      S('暴食', 'quake', { r: 140, mul: 6, grow: ['r', 20] }),
    ],
    S2: [
      S('星屑', 'nova', { n: 18, mul: 0.8, grow: ['n', 4] }),
      S('流星', 'volley', { n: 6, mul: 4, grow: ['n', 2] }),
      S('星喰い', 'blast', { n: 1, r: 160, mul: 9, grow: ['r', 20] }),
    ],
  };

  RG.SP_MAX = 10; // 必殺技の Lv の上限
  // 習得の条件と値段: 前の必殺技の Lv・お金 (武器の値段 × mul。下限 min)・悪魔の心臓 (中級悪魔が必ず落とす)
  RG.SP_UNLOCK = [
    null,
    { req: 3, mul: 0.6, min: 800, hearts: 1 },
    { req: 5, mul: 2, min: 3000, hearts: 3 },
  ];
  // ゲージ (最大 100) のたまる量
  RG.SP_GAIN = { kill: 2, elite: 6, mid: 15, nest: 8 };
  RG.JUST_WINDOW = 0.12; // ジャスト回避: 攻撃が当たる前の、この秒数の間に回避を始める
})();
