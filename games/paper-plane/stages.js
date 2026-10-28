/*
 * 窓から紙ひこうき のステージ (three.js を使わない。飛ぶ物理と画面の両方が使う)
 *   窓のある部屋はどのステージでも同じ高さ (床 8m、窓 9.0〜10.3m) にあり、外の地面の形と、建物などのじゃま物が変わる。
 *   ground(x, z): 地面の高さ (外壁 x = 0 より外)
 *   boxes: じゃま物の箱 { x0, x1, y0, y1, z0, z1, kind }。当たると落ちる。上に着いたら、そこに着地 (屋上)
 *   wind: 風の強さの範囲 (m/s)。thermals: 上昇気流の数と、出る範囲 (窓からの距離)
 *   arcMax: 距離の線をどこまで引くか。flags: 風見の旗の位置 [x, z]
 *   look: 見た目 (script.js が使う)
 */
(function (root) {
  'use strict';

  // 同じ種なら同じ並びの乱数 (じゃま物の配置を、物理と画面でそろえる)
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  const flatFlags = () => {
    const out = [];
    for (let d = 20; d <= 100; d += 20) for (const s of [-1, 1]) out.push([Math.cos(0.5) * d, s * Math.sin(0.5) * d]);
    return out;
  };

  // ---- 2 下り坂の町: 建物の前から、ずっと下っていく道 (250m 先で谷の町に着く) ----
  const HILL_START = 6;
  const HILL_GRADE = 0.12;
  const HILL_FLOOR = -30;                   // 坂の下 (谷の町) の高さ。ここから先は平ら
  const hillGround = (x) => (x <= HILL_START ? 0 : Math.max(HILL_FLOOR, -(x - HILL_START) * HILL_GRADE));
  function hillBoxes() {
    const r = rng(11);
    const out = [];
    for (const side of [-1, 1]) {
      for (let x = 12; x < 420; x += 9 + r() * 7) {
        if (r() < 0.18) continue;              // 空き地
        const w = 6 + r() * 3;
        const d = 6 + r() * 3;
        const zc = side * (13 + r() * 6);
        const top = hillGround(x + w / 2) + 4.5 + r() * 3;
        out.push({ x0: x, x1: x + w, y0: hillGround(x + w) - 3, y1: top, z0: zc - d / 2, z1: zc + d / 2, kind: 'house', hue: r() });
      }
    }
    return out;
  }

  // ---- 3 街なか: 両側にビルがならぶ通り。歩道橋と商店街のアーチ ----
  const STREET_HALF = 12;
  function cityBoxes() {
    const r = rng(23);
    const out = [];
    for (const side of [-1, 1]) {
      for (let x = 8; x < 330;) {
        const w = 10 + r() * 12;
        const inner = STREET_HALF + r() * 2;
        const d = 12 + r() * 10;
        const h = 7 + r() * r() * 30;
        const z0 = side > 0 ? inner : -inner - d;
        out.push({ x0: x, x1: x + w, y0: 0, y1: h, z0, z1: z0 + d, kind: 'building', hue: r() });
        x += w + (r() < 0.25 ? 6 + r() * 4 : 0.6);   // ときどき横道
      }
    }
    // 歩道橋
    out.push({ x0: 42, x1: 44.5, y0: 5.4, y1: 6.6, z0: -STREET_HALF, z1: STREET_HALF, kind: 'bridge' });
    for (const s of [-1, 1]) out.push({ x0: 42.6, x1: 43.9, y0: 0, y1: 5.4, z0: s > 0 ? STREET_HALF - 1.4 : -STREET_HALF, z1: s > 0 ? STREET_HALF : -STREET_HALF + 1.4, kind: 'bridge' });
    // 商店街のアーチ
    out.push({ x0: 96, x1: 97, y0: 8.2, y1: 9.6, z0: -STREET_HALF + 0.6, z1: STREET_HALF - 0.6, kind: 'arch' });
    for (const s of [-1, 1]) out.push({ x0: 96, x1: 97, y0: 0, y1: 8.2, z0: s > 0 ? STREET_HALF - 1.2 : -STREET_HALF + 0.6, z1: s > 0 ? STREET_HALF - 0.6 : -STREET_HALF + 1.2, kind: 'arch' });
    return out;
  }

  // ---- 4 海の見える崖: 32m 先で崖になり、30m 下が海 ----
  const CLIFF_X = 32;
  const SEA_Y = -30;
  const cliffGround = (x) => (x < CLIFF_X ? 0 : SEA_Y);

  // ---- 5 高層ビル: 窓の下 42m に街。屋上にも着地できる ----
  const TOWER_Y = -42;
  function towerBoxes() {
    const r = rng(37);
    const out = [];
    for (let x = 14; x < 460; x += 20 + r() * 6) {
      for (let z = -120; z < 120; z += 20 + r() * 6) {
        if (Math.abs(z + 8) < 14) continue;    // まっすぐ伸びる大通り
        if (r() < 0.15) continue;              // 公園
        const w = 10 + r() * 8;
        const d = 10 + r() * 8;
        const near = Math.max(0, 1 - x / 160);
        const h = 6 + r() * 22 + near * r() * 18;
        out.push({ x0: x, x1: x + w, y0: TOWER_Y, y1: TOWER_Y + h, z0: z, z1: z + d, kind: 'building', hue: r() });
      }
    }
    return out;
  }

  const STAGES = [
    {
      id: 'field',
      ground: () => 0,
      boxes: [],
      wind: [0, 3],
      thermals: { n: 2, x: [18, 90] },
      arcMax: 120,
      flags: flatFlags(),
      look: { sky: 'day', groundKind: 'grass' },
    },
    {
      id: 'hill',
      ground: (x) => hillGround(x),
      boxes: hillBoxes(),
      wind: [0, 3],
      thermals: { n: 2, x: [20, 140] },
      arcMax: 340,
      flags: [[30, -7], [30, 7], [80, -7], [80, 7], [140, -7], [140, 7], [200, -7], [200, 7]],
      look: { sky: 'day', groundKind: 'hill' },
    },
    {
      id: 'city',
      ground: () => 0,
      boxes: cityBoxes(),
      wind: [0, 1.8],
      thermals: { n: 1, x: [25, 80], zMax: 5 },
      arcMax: 150,
      flags: [[20, -7.5], [20, 7.5], [60, -7.5], [60, 7.5], [120, -7.5], [120, 7.5]],
      look: { sky: 'haze', groundKind: 'asphalt' },
    },
    {
      id: 'cliff',
      ground: (x) => cliffGround(x),
      boxes: [{ x0: 20, x1: 24, y0: 0, y1: 13, z0: -30, z1: -26, kind: 'lighthouse' }],
      wind: [1, 5],
      thermals: { n: 3, x: [28, 160] },
      arcMax: 420,
      flags: [[15, -10], [15, 10], [60, -20], [60, 20], [120, -30], [120, 30], [180, -40], [180, 40]],
      look: { sky: 'sea', groundKind: 'cliff' },
    },
    {
      id: 'tower',
      ground: () => TOWER_Y,
      boxes: towerBoxes(),
      wind: [1, 5],
      thermals: { n: 4, x: [20, 260] },
      arcMax: 460,
      flags: [],
      look: { sky: 'sunset', groundKind: 'town' },
    },
  ];

  const byId = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

  // 地面と屋上をあわせた、その場所でいちばん上の面の高さ
  function surfaceY(stage, x, z) {
    let y = stage.ground(x, z);
    for (const b of stage.boxes) {
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.y1 > y) y = b.y1;
    }
    return y;
  }

  // 投げるたびに作る上昇気流。rand() は 0〜1 の乱数
  //   中心 (x, z)、半径 r、中心の上向きの風 v (m/s)、高さ top より上では弱まる
  function makeThermals(stage, rand) {
    const t = stage.thermals;
    const zMax = t.zMax ?? 14;
    const out = [];
    for (let i = 0; i < t.n; i++) {
      let x = 0;
      for (let tries = 0; tries < 8; tries++) {
        x = t.x[0] + rand() * (t.x[1] - t.x[0]);
        if (out.every((o) => Math.abs(o.x - x) > 18)) break;    // 重ならないように離す
      }
      out.push({ x, z: (rand() * 2 - 1) * zMax, r: 4 + rand() * 4, v: 1.6 + rand() * 1.2, top: 28 });
    }
    return out.sort((a, b) => a.x - b.x);
  }

  // 投げるたびに変わる風: ステージの範囲の強さで、向きはランダム
  function makeWind(stage, rand) {
    const s = Math.round((stage.wind[0] + rand() * (stage.wind[1] - stage.wind[0])) * 10) / 10;
    const a = rand() * Math.PI * 2;
    return { x: Math.cos(a) * s, z: Math.sin(a) * s };
  }

  const api = { STAGES, byId, surfaceY, makeThermals, makeWind, rng, CLIFF_X, SEA_Y, TOWER_Y, HILL_START, HILL_GRADE, HILL_FLOOR, STREET_HALF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaperPlaneStages = api;
})(typeof window !== 'undefined' ? window : this);
