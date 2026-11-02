/*
 * ボクセル解体ボンバー: 50のステージの形 (家・橋・ランドマーク・像) と、手榴弾の数。
 * three.js を使わない (爆発の計算 world.js と画面の両方が使う。node でも動く)
 *
 * 形は w × h × d のマス目に、材料の名前を置いて作る。y = 0 が地面に接する段。
 * 1マスは 2 × 2 × 2 のボクセルに分けて持ち、球や円柱、ななめの柱はボクセル単位でえがく。
 * 材料ごとに色と固さ (hp) があり、爆発のダメージが hp を超えたボクセルがこわれる。
 */
(() => {
  'use strict';

  // 材料。hp は爆発のダメージ何回分の固さか (world.js の POWER と比べる)
  const MATERIALS = {
    stone: { color: 0x8d9198, hp: 1.5 },
    brick: { color: 0xb5533c, hp: 1.3 },
    plaster: { color: 0xf0e5cc, hp: 1.0 },
    log: { color: 0x8a5a32, hp: 0.9 },
    wood: { color: 0xc49563, hp: 0.7 },
    roof: { color: 0xc9412c, hp: 0.7 },
    slate: { color: 0x4f5b75, hp: 0.9 },
    glass: { color: 0x9fdaf3, hp: 0.2 },
    door: { color: 0x6b4426, hp: 0.7 },
    straw: { color: 0xe2c15a, hp: 0.5 },
    thatch: { color: 0xb8913f, hp: 0.6 },
    redwood: { color: 0x9e3b2a, hp: 0.8 },
    cream: { color: 0xf3dfa6, hp: 1.0 },
    concrete: { color: 0xb9b4aa, hp: 1.2 },
    iron: { color: 0x5d6470, hp: 1.1 },
    redpaint: { color: 0xd8352a, hp: 0.9 },
    white: { color: 0xf4f4ef, hp: 1.0 },
    awning: { color: 0x2f8f5b, hp: 0.5 },
    marble: { color: 0xe8e4da, hp: 1.2 },
    sand: { color: 0xd9b77a, hp: 1.2 },
    bronze: { color: 0x5f9e8a, hp: 1.3 },
    fur: { color: 0x8a5a3a, hp: 1.0 },
    tan: { color: 0xd8b48a, hp: 1.0 },
    black: { color: 0x2a2a2e, hp: 1.0 },
    gold: { color: 0xe8b923, hp: 1.0 },
    moai: { color: 0x7d7368, hp: 1.3 },
    redrock: { color: 0xa4553b, hp: 1.2 },
    green: { color: 0x5aa04a, hp: 1.1 },
    blue: { color: 0x2f6fd6, hp: 1.0 },
    yellow: { color: 0xf2c230, hp: 1.0 },
    gorilla: { color: 0x45403f, hp: 1.1 },
    pink: { color: 0xf3a6b8, hp: 0.9 },
  };
  const MATERIAL_NAMES = Object.keys(MATERIALS);

  // 1マスを RES × RES × RES のボクセルに分ける
  const RES = 2;
  const CELL = 1 / RES; // ボクセル1つの大きさ (ワールドの単位)

  class Builder {
    constructor(w, h, d) {
      this.w = w * RES;
      this.h = h * RES;
      this.d = d * RES;
      this.cells = new Uint8Array(this.w * this.h * this.d); // 0 は空、1 から MATERIAL_NAMES の順
      this.clipped = 0; // マス目からはみ出して置けなかったボクセルの数 (形の確認用)
    }

    // ボクセル1つ
    setFine(x, y, z, mat) {
      if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) {
        if (mat) this.clipped++;
        return;
      }
      this.cells[x + this.w * (y + this.h * z)] = mat ? MATERIAL_NAMES.indexOf(mat) + 1 : 0;
    }

    // 1マス (RES × RES × RES のボクセル)
    set(x, y, z, mat) {
      for (let i = 0; i < RES; i++) for (let j = 0; j < RES; j++) for (let k = 0; k < RES; k++) this.setFine(x * RES + i, y * RES + j, z * RES + k, mat);
    }

    // 箱をうめる (両端のマスをふくむ)
    fill(x0, y0, z0, x1, y1, z1, mat) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, mat);
    }

    // 外まわりの壁だけ
    walls(x0, z0, x1, z1, y0, y1, mat) {
      this.fill(x0, y0, z0, x1, y1, z0, mat);
      this.fill(x0, y0, z1, x1, y1, z1, mat);
      this.fill(x0, y0, z0, x0, y1, z1, mat);
      this.fill(x1, y0, z0, x1, y1, z1, mat);
    }

    // ここからはマス単位の小数で書く形。ボクセルの中心が形の中に入れば置く (mat が null なら消す)
    shape(x0, y0, z0, x1, y1, z1, mat, test) {
      for (let fz = Math.floor(z0 * RES); fz < Math.ceil(z1 * RES); fz++) {
        for (let fy = Math.floor(y0 * RES); fy < Math.ceil(y1 * RES); fy++) {
          for (let fx = Math.floor(x0 * RES); fx < Math.ceil(x1 * RES); fx++) {
            const px = (fx + 0.5) / RES, py = (fy + 0.5) / RES, pz = (fz + 0.5) / RES;
            if (test(px, py, pz)) this.setFine(fx, fy, fz, mat);
          }
        }
      }
    }

    // 箱 (x0 <= x < x1 など)
    box(x0, y0, z0, x1, y1, z1, mat) {
      this.shape(x0, y0, z0, x1, y1, z1, mat, () => true);
    }

    ellipsoid(cx, cy, cz, rx, ry, rz, mat) {
      this.shape(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, mat, (x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1);
    }

    sphere(cx, cy, cz, r, mat) {
      this.ellipsoid(cx, cy, cz, r, r, r, mat);
    }

    // 立てた円柱 (y0 <= y < y1)。inner を与えると筒になる
    cylinder(cx, cz, y0, y1, r, mat, inner = 0) {
      this.shape(cx - r, y0, cz - r, cx + r, y1, cz + r, mat, (x, y, z) => {
        const d = Math.hypot(x - cx, z - cz);
        return d <= r && d >= inner;
      });
    }

    // 立てた円すい台。下の半径 r0 から上の半径 r1 へ細くなる。shell を与えると厚みがその分の殻になる
    cone(cx, cz, y0, y1, r0, r1, mat, shell = 0) {
      const r = Math.max(r0, r1);
      this.shape(cx - r, y0, cz - r, cx + r, y1, cz + r, mat, (x, y, z) => {
        const rr = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
        const d = Math.hypot(x - cx, z - cz);
        return d <= rr && (!shell || d >= rr - shell);
      });
    }

    // 2点を結ぶ太さ r の柱 (ななめでもよい)
    beam(ax, ay, az, bx, by, bz, r, mat) {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz || 1;
      this.shape(Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r, Math.max(az, bz) + r, mat, (x, y, z) => {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2));
        return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) <= r;
      });
    }

    // 切妻屋根。ridge は棟の向き ('z' か 'x')。ボクセル1段ずつの斜面で、厚みは3ボクセル、軒が1マス出る。妻側の三角は wallMat でうめる
    gable(x0, z0, x1, z1, y, mat, wallMat, ridge = 'z') {
      const T = 3;
      const alongX = ridge === 'x';
      // a は棟と直角の向き、b は棟の向き
      const [a0, a1, b0, b1] = alongX ? [z0, z1, x0, x1] : [x0, x1, z0, z1];
      const put = (a, yy, bb, m) => (alongX ? this.setFine(bb, yy, a, m) : this.setFine(a, yy, bb, m));
      const fa0 = a0 * RES - RES, fa1 = (a1 + 1) * RES - 1 + RES;
      const fb0 = (b0 - 1) * RES, fb1 = (b1 + 2) * RES - 1;
      const wb0 = b0 * RES, wb1 = (b1 + 1) * RES - 1;
      for (let k = 0; ; k++) {
        const left = fa0 + k, right = fa1 - k;
        if (left > right) break;
        const yy = y * RES + k;
        for (let bb = fb0; bb <= fb1; bb++) {
          for (let t = 0; t < T && left + t <= right - t; t++) {
            put(left + t, yy, bb, mat);
            put(right - t, yy, bb, mat);
          }
        }
        for (let a = left + T; a <= right - T; a++) {
          for (let r = 0; r < RES; r++) {
            put(a, yy, wb0 + r, wallMat);
            put(a, yy, wb1 - r, wallMat);
          }
        }
      }
    }

    // 寄棟 (四角すい) の屋根。厚み3ボクセルの輪を1段ずつ小さくする
    pyramid(x0, z0, x1, z1, y, mat) {
      const T = 3;
      for (let k = 0; ; k++) {
        const ax = (x0 - 1) * RES + k, bx = (x1 + 2) * RES - 1 - k;
        const az = (z0 - 1) * RES + k, bz = (z1 + 2) * RES - 1 - k;
        if (ax > bx || az > bz) break;
        const yy = y * RES + k;
        for (let x = ax; x <= bx; x++) {
          for (let z = az; z <= bz; z++) {
            const edge = Math.min(x - ax, bx - x, z - az, bz - z);
            if (edge < T) this.setFine(x, yy, z, mat);
          }
        }
      }
    }

    // 城壁の上のぎざぎざ
    battlements(x0, z0, x1, z1, y, mat) {
      for (let x = x0; x <= x1; x++) {
        if ((x - x0) % 2 === 0) {
          this.set(x, y, z0, mat);
          this.set(x, y, z1, mat);
        }
      }
      for (let z = z0; z <= z1; z++) {
        if ((z - z0) % 2 === 0) {
          this.set(x0, y, z, mat);
          this.set(x1, y, z, mat);
        }
      }
    }
  }

  // 家をひとつ建てる。壁・土台・階ごとの床・窓・扉・屋根。屋根が始まる段を返す
  function house(b, o) {
    const { x0, z0, x1, z1, y = 0, floors = 1, floorH = 5, wall = 'plaster', base = 'stone', roof = 'gable', roofMat = 'roof', ridge = 'z', windows = true, door = true } = o;
    const top = y + (o.height || floors * floorH);
    b.walls(x0, z0, x1, z1, y, top - 1, wall);
    if (base) b.walls(x0, z0, x1, z1, y, y, base);
    for (let f = 1; f < floors; f++) b.fill(x0 + 1, y + f * floorH, z0 + 1, x1 - 1, y + f * floorH, z1 - 1, 'wood');
    if (windows) {
      for (let f = 0; f < floors; f++) {
        const wy = y + f * floorH + 2;
        for (let x = x0 + 2; x + 1 <= x1 - 2; x += 4) {
          b.fill(x, wy, z0, x + 1, wy + 1, z0, 'glass');
          b.fill(x, wy, z1, x + 1, wy + 1, z1, 'glass');
        }
        for (let z = z0 + 2; z + 1 <= z1 - 2; z += 4) {
          b.fill(x0, wy, z, x0, wy + 1, z + 1, 'glass');
          b.fill(x1, wy, z, x1, wy + 1, z + 1, 'glass');
        }
      }
    }
    if (door) {
      const cx = Math.floor((x0 + x1) / 2);
      b.fill(cx, y + (base ? 1 : 0), z0, cx + 1, y + 3, z0, 'door');
    }
    if (roof === 'gable') b.gable(x0, z0, x1, z1, top, roofMat, wall, ridge);
    else if (roof === 'hip') b.pyramid(x0, z0, x1, z1, top, roofMat);
    else if (roof === 'flat') {
      b.fill(x0, top, z0, x1, top, z1, roofMat);
      b.walls(x0, z0, x1, z1, top + 1, top + 1, roofMat);
    }
    return top;
  }

  // ---------- はじめに作った5つの形 ----------


  // 木の小屋
  function cabin() {
    const b = new Builder(10, 10, 9);
    b.walls(1, 1, 8, 7, 0, 4, 'log');
    b.fill(4, 0, 1, 5, 2, 1, 'door');
    b.fill(1, 2, 3, 1, 3, 5, 'glass');
    b.fill(8, 2, 3, 8, 3, 5, 'glass');
    b.fill(2, 2, 7, 3, 3, 7, 'glass');
    b.fill(6, 2, 7, 7, 3, 7, 'glass');
    b.gable(1, 1, 8, 7, 5, 'roof', 'wood');
    return b;
  }

  // 町の一軒家
  function townHouse() {
    const b = new Builder(15, 17, 13);
    b.walls(1, 1, 13, 11, 0, 0, 'stone');
    b.walls(1, 1, 13, 11, 1, 6, 'plaster');
    b.fill(6, 1, 1, 8, 4, 1, 'door');
    for (const x of [3, 10]) {
      b.fill(x, 2, 1, x + 1, 4, 1, 'glass');
      b.fill(x, 2, 11, x + 1, 4, 11, 'glass');
    }
    b.fill(1, 2, 4, 1, 4, 7, 'glass');
    b.fill(13, 2, 4, 13, 4, 7, 'glass');
    b.gable(1, 1, 13, 11, 7, 'roof', 'plaster');
    b.fill(10, 10, 7, 11, 16, 8, 'brick');
    return b;
  }

  // 二階建てのレンガの家
  function brickHouse() {
    const b = new Builder(17, 23, 15);
    b.walls(1, 1, 15, 13, 0, 0, 'stone');
    b.walls(1, 1, 15, 13, 1, 11, 'brick');
    b.fill(2, 6, 2, 14, 6, 12, 'wood');
    b.fill(7, 1, 1, 9, 4, 1, 'door');
    for (const x of [3, 12]) {
      b.fill(x, 2, 1, x + 1, 4, 1, 'glass');
      b.fill(x, 2, 13, x + 1, 4, 13, 'glass');
    }
    for (const x of [3, 7, 12]) {
      b.fill(x, 8, 1, x + 1, 10, 1, 'glass');
      b.fill(x, 8, 13, x + 1, 10, 13, 'glass');
    }
    for (const z of [4, 9]) {
      b.fill(1, 2, z, 1, 4, z + 1, 'glass');
      b.fill(15, 2, z, 15, 4, z + 1, 'glass');
      b.fill(1, 8, z, 1, 10, z + 1, 'glass');
      b.fill(15, 8, z, 15, 10, z + 1, 'glass');
    }
    b.gable(1, 1, 15, 13, 12, 'slate', 'brick');
    b.fill(3, 13, 9, 4, 22, 10, 'brick');
    return b;
  }

  // 見張り塔のある屋敷
  function manor() {
    const b = new Builder(23, 22, 16);
    b.walls(1, 2, 13, 13, 0, 0, 'stone');
    b.walls(1, 2, 13, 13, 1, 6, 'plaster');
    b.fill(6, 1, 2, 8, 4, 2, 'door');
    for (const x of [3, 10]) {
      b.fill(x, 2, 2, x + 1, 4, 2, 'glass');
      b.fill(x, 2, 13, x + 1, 4, 13, 'glass');
    }
    b.fill(1, 2, 6, 1, 4, 9, 'glass');
    b.gable(1, 2, 13, 13, 7, 'roof', 'plaster');
    // 母屋と塔をつなぐ渡り廊下
    b.walls(14, 6, 15, 9, 0, 4, 'wood');
    b.fill(14, 5, 6, 15, 5, 9, 'roof');
    // 塔
    b.walls(16, 4, 21, 11, 0, 16, 'stone');
    for (const y of [3, 8, 13]) {
      b.fill(18, y, 4, 19, y + 1, 4, 'glass');
      b.fill(18, y, 11, 19, y + 1, 11, 'glass');
      b.fill(21, y, 7, 21, y + 1, 8, 'glass');
    }
    b.pyramid(16, 4, 21, 11, 17, 'slate');
    return b;
  }

  // 石のお城
  function castle() {
    const b = new Builder(22, 18, 22);
    // 城壁と門
    b.walls(2, 2, 19, 19, 0, 4, 'stone');
    b.battlements(2, 2, 19, 19, 5, 'stone');
    b.fill(9, 0, 2, 12, 3, 2, 'door');
    // 四隅の塔
    for (const [x, z] of [[0, 0], [17, 0], [0, 17], [17, 17]]) {
      b.walls(x, z, x + 4, z + 4, 0, 8, 'stone');
      b.battlements(x, z, x + 4, z + 4, 9, 'stone');
      b.fill(x + 2, 5, z, x + 2, 6, z, 'glass');
      b.fill(x + 2, 5, z + 4, x + 2, 6, z + 4, 'glass');
    }
    // 天守
    b.walls(7, 8, 14, 15, 0, 0, 'stone');
    b.walls(7, 8, 14, 15, 1, 10, 'brick');
    b.fill(8, 5, 9, 13, 5, 14, 'wood');
    b.fill(10, 1, 8, 11, 4, 8, 'door');
    for (const y of [2, 7]) {
      for (const x of [8, 12]) {
        b.fill(x, y, 8, x + 1, y + 1, 8, 'glass');
        b.fill(x, y, 15, x + 1, y + 1, 15, 'glass');
      }
      b.fill(7, y, 11, 7, y + 1, 12, 'glass');
      b.fill(14, y, 11, 14, y + 1, 12, 'glass');
    }
    b.pyramid(7, 8, 14, 15, 11, 'slate');
    return b;
  }


  // ---------- ワールド1: はじまりの村 ----------

  function shed() {
    const b = new Builder(7, 8, 7);
    b.walls(1, 1, 5, 5, 0, 2, 'wood');
    b.fill(3, 0, 1, 3, 1, 1, 'door');
    b.gable(1, 1, 5, 5, 3, 'roof', 'wood');
    return b;
  }

  function strawHut() {
    const b = new Builder(10, 9, 10);
    b.cylinder(5, 5, 0, 3.5, 3.6, 'straw', 2.6);
    b.box(4.5, 0, 1, 5.5, 2.5, 3, null);
    b.cone(5, 5, 3, 8, 4.8, 0.4, 'thatch', 1.2);
    return b;
  }

  function barn() {
    const b = new Builder(13, 14, 11);
    b.walls(1, 1, 11, 9, 0, 5, 'redwood');
    b.fill(5, 0, 1, 7, 3, 1, 'door');
    b.fill(1, 3, 4, 1, 4, 6, 'glass');
    b.fill(11, 3, 4, 11, 4, 6, 'glass');
    b.gable(1, 1, 11, 9, 6, 'slate', 'redwood');
    return b;
  }

  function watchtower() {
    const b = new Builder(9, 18, 9);
    for (const [x, z] of [[1, 1], [7, 1], [1, 7], [7, 7]]) b.fill(x, 0, z, x, 8, z, 'log');
    // すじかい
    b.beam(1.5, 0.5, 1.5, 7.5, 7, 1.5, 0.8, 'log');
    b.beam(1.5, 0.5, 7.5, 7.5, 7, 7.5, 0.8, 'log');
    b.beam(1.5, 0.5, 1.5, 1.5, 7, 7.5, 0.8, 'log');
    b.beam(7.5, 0.5, 1.5, 7.5, 7, 7.5, 0.8, 'log');
    b.fill(0, 9, 0, 8, 9, 8, 'wood');
    b.walls(1, 1, 7, 7, 10, 12, 'wood');
    b.fill(3, 11, 1, 5, 12, 1, 'glass');
    b.fill(3, 11, 7, 5, 12, 7, 'glass');
    b.pyramid(1, 1, 7, 7, 13, 'roof');
    return b;
  }

  function windmillHouse() {
    const b = new Builder(15, 19, 13);
    b.cone(7.5, 7, 0, 12, 4, 3, 'plaster', 1);
    b.box(7, 0, 2.5, 8, 2.5, 4.5, 'door');
    b.cone(7.5, 7, 12, 16, 3.8, 0.3, 'roof', 1.2);
    // 羽根の軸と4枚の羽根
    b.beam(7.5, 10, 4.5, 7.5, 10, 1.5, 0.8, 'wood');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      b.beam(7.5, 10, 1.8, 7.5 + dx * 6, 10 + dy * 6, 1.8, 0.7, 'wood');
      // 帆
      const px = dy, py = -dx;
      b.beam(7.5 + dx * 2 + px, 10 + dy * 2 + py, 1.8, 7.5 + dx * 5.5 + px, 10 + dy * 5.5 + py, 1.8, 0.6, 'white');
    }
    return b;
  }

  function twinHouses() {
    const b = new Builder(22, 12, 12);
    house(b, { x0: 1, z0: 1, x1: 8, z1: 8, wall: 'plaster', roofMat: 'roof' });
    house(b, { x0: 12, z0: 2, x1: 19, z1: 9, wall: 'brick', roof: 'hip', roofMat: 'slate' });
    return b;
  }

  function church() {
    const b = new Builder(15, 30, 21);
    b.walls(2, 6, 12, 19, 0, 7, 'plaster');
    b.walls(2, 6, 12, 19, 0, 0, 'stone');
    for (const z of [9, 13, 17]) {
      b.fill(2, 2, z, 2, 5, z, 'glass');
      b.fill(12, 2, z, 12, 5, z, 'glass');
    }
    b.gable(2, 6, 12, 19, 8, 'slate', 'plaster');
    // 正面の鐘楼と尖塔
    b.walls(4, 1, 10, 6, 0, 14, 'stone');
    b.fill(6, 1, 1, 8, 4, 1, 'door');
    b.fill(7, 9, 1, 7, 12, 1, 'glass');
    b.cone(7.5, 4, 15, 25, 3.9, 0.3, 'slate', 1.2);
    b.beam(7.5, 24.5, 4, 7.5, 28.5, 4, 0.5, 'gold');
    b.beam(6.3, 27.2, 4, 8.7, 27.2, 4, 0.5, 'gold');
    return b;
  }

  // ---------- ワールド2: にぎやかな町 ----------

  function bakery() {
    const b = new Builder(13, 13, 12);
    house(b, { x0: 1, z0: 2, x1: 11, z1: 10, wall: 'cream', roofMat: 'roof', door: false });
    b.fill(2, 1, 2, 4, 3, 2, 'glass');
    b.fill(8, 1, 2, 10, 3, 2, 'glass');
    b.fill(5, 1, 2, 6, 3, 2, 'door');
    // 緑のひさし
    b.box(1.5, 4, 1, 10.5, 4.5, 2, 'awning');
    b.box(1.5, 4.5, 1.5, 10.5, 5, 2, 'awning');
    return b;
  }

  function rowHouses() {
    const b = new Builder(28, 13, 11);
    const mats = [['plaster', 'roof'], ['cream', 'slate'], ['brick', 'roof']];
    for (let k = 0; k < 3; k++) {
      const x0 = 1 + k * 8;
      house(b, { x0, z0: 1, x1: x0 + 8, z1: 9, wall: mats[k][0], roofMat: mats[k][1] });
    }
    return b;
  }

  function waterTower() {
    const b = new Builder(13, 22, 13);
    const legs = [[2.5, 2.5, 4.5, 4.5], [10.5, 2.5, 8.5, 4.5], [2.5, 10.5, 4.5, 8.5], [10.5, 10.5, 8.5, 8.5]];
    for (const [x, z, tx, tz] of legs) b.beam(x, 0.3, z, tx, 12.5, tz, 0.9, 'iron');
    b.beam(3.5, 6, 3.5, 9.5, 6, 3.5, 0.6, 'iron');
    b.beam(3.5, 6, 9.5, 9.5, 6, 9.5, 0.6, 'iron');
    b.beam(3.5, 6, 3.5, 3.5, 6, 9.5, 0.6, 'iron');
    b.beam(9.5, 6, 3.5, 9.5, 6, 9.5, 0.6, 'iron');
    b.cylinder(6.5, 6.5, 12, 13, 4, 'wood');
    b.cylinder(6.5, 6.5, 13, 18, 4, 'wood', 3);
    b.cone(6.5, 6.5, 18, 21, 4.6, 0.3, 'slate', 1.2);
    return b;
  }

  function lighthouse() {
    const b = new Builder(13, 28, 13);
    b.cone(6.5, 6.5, 0, 20, 4, 2.6, 'white', 1.1);
    for (const y0 of [3, 10, 17]) b.cone(6.5, 6.5, y0, y0 + 3, 4 - (1.4 * y0) / 20, 4 - (1.4 * (y0 + 3)) / 20, 'redpaint', 1.1);
    b.box(6, 0, 2, 7, 2.5, 3.5, 'door');
    b.cylinder(6.5, 6.5, 20, 21, 3.6, 'iron');
    b.cylinder(6.5, 6.5, 21, 24, 2.4, 'glass', 1.4);
    b.cone(6.5, 6.5, 24, 27, 3, 0.3, 'redpaint', 1.1);
    return b;
  }

  function clockTower() {
    const b = new Builder(11, 33, 11);
    b.walls(2, 2, 8, 8, 0, 22, 'brick');
    b.walls(2, 2, 8, 8, 0, 0, 'stone');
    for (const y of [6, 12]) b.fill(3, y, 3, 7, y, 7, 'wood');
    b.fill(5, 1, 2, 5, 3, 2, 'door');
    for (const y of [5, 10, 15]) {
      b.fill(5, y, 2, 5, y + 1, 2, 'glass');
      b.fill(5, y, 8, 5, y + 1, 8, 'glass');
      b.fill(2, y, 5, 2, y + 1, 5, 'glass');
      b.fill(8, y, 5, 8, y + 1, 5, 'glass');
    }
    // 4面の時計
    for (const [x0, z0, x1, z1] of [[4, 2, 6, 2], [4, 8, 6, 8], [2, 4, 2, 6], [8, 4, 8, 6]]) {
      b.fill(x0, 18, z0, x1, 20, z1, 'white');
    }
    b.fill(5, 19, 2, 5, 20, 2, 'black');
    b.fill(5, 19, 8, 5, 20, 8, 'black');
    b.fill(2, 19, 5, 2, 20, 5, 'black');
    b.fill(8, 19, 5, 8, 20, 5, 'black');
    b.pyramid(2, 2, 8, 8, 23, 'slate');
    b.beam(5.5, 27, 5.5, 5.5, 31.5, 5.5, 0.5, 'gold');
    return b;
  }

  function apartment() {
    const b = new Builder(16, 23, 12);
    house(b, { x0: 1, z0: 1, x1: 14, z1: 10, floors: 4, wall: 'concrete', roof: 'flat', roofMat: 'concrete' });
    return b;
  }

  function school() {
    const b = new Builder(30, 19, 12);
    house(b, { x0: 1, z0: 1, x1: 28, z1: 10, floors: 2, wall: 'cream', roof: 'hip', roofMat: 'slate' });
    b.walls(13, 4, 17, 8, 11, 15, 'cream');
    b.fill(14, 13, 4, 16, 14, 4, 'white');
    b.fill(15, 13, 4, 15, 14, 4, 'black');
    b.pyramid(13, 4, 17, 8, 16, 'slate');
    return b;
  }

  function pagoda() {
    const b = new Builder(17, 34, 17);
    const c = 8;
    let y = 0;
    for (const s of [4, 4, 3, 3, 2]) {
      b.walls(c - s, c - s, c + s, c + s, y, y + 3, 'redwood');
      b.fill(c, y, c - s, c, y + 2, c - s, 'door');
      b.fill(c - s - 2, y + 4, c - s - 2, c + s + 2, y + 4, c + s + 2, 'slate');
      b.fill(c - s - 1, y + 5, c - s - 1, c + s + 1, y + 5, c + s + 1, 'slate');
      y += 6;
    }
    b.beam(c + 0.5, y - 0.5, c + 0.5, c + 0.5, y + 3.5, c + 0.5, 0.5, 'gold');
    for (let k = 0; k < 3; k++) b.cylinder(c + 0.5, c + 0.5, y + k, y + k + 0.5, 1.2, 'gold');
    return b;
  }

  // ---------- ワールド3: 川と橋 (橋はどれも x の向きにかかり、下を川が流れる) ----------

  function logBridge() {
    const b = new Builder(26, 6, 8);
    b.fill(0, 0, 1, 2, 1, 6, 'stone');
    b.fill(23, 0, 1, 25, 1, 6, 'stone');
    for (const x of [8, 16]) {
      b.fill(x, 0, 1, x + 1, 1, 1, 'log');
      b.fill(x, 0, 6, x + 1, 1, 6, 'log');
    }
    b.fill(0, 2, 1, 25, 2, 6, 'wood');
    b.fill(1, 3, 1, 24, 3, 1, 'log');
    b.fill(1, 3, 6, 24, 3, 6, 'log');
    return b;
  }

  // 下の面の高さ under(x) から上の面 top までを石でうめた橋。らんかんつき
  function solidBridge(b, length, z0, z1, top, under, mat) {
    b.shape(0, 0, z0, length, top, z1, mat, (x, y) => y >= under(x));
    b.shape(0, top, z0, length, top + 1, z1, mat, (x, y, z) => z < z0 + 1 || z >= z1 - 1);
  }

  function arch(x, c, half, height) {
    const t = (x - c) / half;
    return Math.abs(t) < 1 ? height * Math.sqrt(1 - t * t) : 0;
  }

  function stoneArchBridge() {
    const b = new Builder(24, 10, 8);
    solidBridge(b, 24, 1, 7, 8, (x) => arch(x, 12, 9.5, 6), 'stone');
    return b;
  }

  function drumBridge() {
    const b = new Builder(24, 10, 6);
    const h = (x) => 1 + 5 * (1 - ((x - 12) / 11) ** 2);
    b.shape(1, 0, 1, 23, 9, 5, 'redpaint', (x, y) => y >= h(x) && y < h(x) + 1);
    b.shape(1, 0, 1, 23, 9, 5, 'redpaint', (x, y, z) => (z < 1.5 || z >= 4.5) && y >= h(x) + 1 && y < h(x) + 2);
    for (const x of [1, 5, 9, 14, 18, 22]) {
      b.box(x, 0, 1, x + 1, h(x + 0.5) + 0.5, 2, 'redpaint');
      b.box(x, 0, 4, x + 1, h(x + 0.5) + 0.5, 5, 'redpaint');
    }
    return b;
  }

  function trussBridge() {
    const b = new Builder(32, 9, 7);
    b.fill(0, 0, 1, 2, 3, 5, 'stone');
    b.fill(29, 0, 1, 31, 3, 5, 'stone');
    b.fill(15, 0, 2, 16, 3, 4, 'stone');
    b.fill(0, 4, 1, 31, 4, 5, 'iron');
    b.fill(0, 5, 2, 31, 5, 2, 'black');
    b.fill(0, 5, 4, 31, 5, 4, 'black');
    for (const z of [1, 5]) {
      b.fill(0, 8, z, 31, 8, z, 'iron');
      for (let x = 0; x <= 28; x += 4) {
        b.fill(x, 5, z, x, 7, z, 'iron');
        b.beam(x + 0.5, 5, z + 0.5, x + 4.5, 8.5, z + 0.5, 0.7, 'iron');
      }
      b.fill(31, 5, z, 31, 7, z, 'iron');
    }
    return b;
  }

  function waterMill() {
    const b = new Builder(18, 13, 14);
    house(b, { x0: 1, z0: 2, x1: 9, z1: 11, wall: 'log', base: 'stone', roofMat: 'thatch' });
    // 水車 (軸は x の向き)
    b.shape(11, 0, 2, 12.5, 9, 12, 'wood', (x, y, z) => {
      const d = Math.hypot(y - 4.3, z - 7);
      return d <= 4.3 && d >= 3.3;
    });
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      b.beam(11.7, 4.3 - Math.sin(a) * 3.6, 7 - Math.cos(a) * 3.6, 11.7, 4.3 + Math.sin(a) * 3.6, 7 + Math.cos(a) * 3.6, 0.6, 'wood');
    }
    b.beam(9.5, 4.3, 7, 12.8, 4.3, 7, 0.8, 'log');
    return b;
  }

  function tripleArchBridge() {
    const b = new Builder(36, 10, 8);
    solidBridge(b, 36, 1, 7, 8, (x) => Math.max(arch(x, 7, 4.6, 5.5), arch(x, 18, 4.6, 5.5), arch(x, 29, 4.6, 5.5)), 'brick');
    return b;
  }

  // つり橋。塔の高さ towerH、橋げたの高さ deckY
  function suspension(len, towerXs, towerH, deckY, deckMat, towerMat, d) {
    const b = new Builder(len, towerH + 2, d);
    const z0 = 1, z1 = d - 2;
    b.fill(0, 0, z0, 2, deckY - 1, z1, 'stone');
    b.fill(len - 3, 0, z0, len - 1, deckY - 1, z1, 'stone');
    b.fill(0, deckY, z0, len - 1, deckY, z1, deckMat);
    for (const tx of towerXs) {
      b.fill(tx, 0, z0, tx + 1, towerH, z0, towerMat);
      b.fill(tx, 0, z1, tx + 1, towerH, z1, towerMat);
      b.fill(tx, towerH - 1, z0, tx + 1, towerH, z1, towerMat);
      b.fill(tx, deckY - 2, z0, tx + 1, deckY - 1, z1, towerMat);
    }
    const [ta, tb] = [towerXs[0] + 1, towerXs[1] + 1];
    const mid = (ta + tb) / 2, half = (tb - ta) / 2;
    const low = deckY + 2;
    const cable = (x) => {
      if (x < ta) return deckY + 1 + ((towerH - deckY) * (x - 1.5)) / (ta - 1.5);
      if (x > tb) return deckY + 1 + ((towerH - deckY) * (len - 1.5 - x)) / (len - 1.5 - tb);
      return low + (towerH - low) * ((x - mid) / half) ** 2;
    };
    for (const z of [z0, z1]) {
      b.shape(1.5, deckY, z, len - 1.5, towerH + 1, z + 1, 'iron', (x, y) => y >= cable(x) && y < cable(x) + 1.6);
      for (let x = 2; x < len - 2; x += 2) {
        b.shape(x, deckY + 1, z, x + 0.5, towerH, z + 1, 'iron', (px, y) => y < cable(px) + 0.5);
      }
    }
    return b;
  }

  function coveredBridge() {
    const b = new Builder(24, 12, 8);
    b.fill(0, 0, 1, 2, 2, 6, 'stone');
    b.fill(21, 0, 1, 23, 2, 6, 'stone');
    b.fill(11, 0, 2, 12, 2, 5, 'stone');
    b.fill(0, 3, 1, 23, 3, 6, 'wood');
    for (const z of [1, 6]) {
      b.fill(1, 4, z, 22, 6, z, 'redwood');
      for (let x = 3; x <= 19; x += 4) b.fill(x, 5, z, x + 1, 5, z, null);
    }
    b.fill(1, 4, 2, 1, 6, 5, 'redwood');
    b.fill(22, 4, 2, 22, 6, 5, 'redwood');
    b.fill(1, 4, 3, 1, 5, 4, null);
    b.fill(22, 4, 3, 22, 5, 4, null);
    b.gable(1, 1, 22, 6, 7, 'slate', 'redwood', 'x');
    return b;
  }

  function aqueduct() {
    const b = new Builder(36, 16, 5);
    b.shape(0, 0, 1, 36, 8, 4, 'sand', (x, y) => {
      const k = Math.floor(x / 6);
      const inPier = x - k * 6 < 1.5;
      return inPier || y >= 4.8 + arch(x, k * 6 + 3.75, 2.25, 2.2);
    });
    b.shape(0, 8, 1, 36, 14, 4, 'sand', (x, y) => {
      const k = Math.floor(x / 3);
      const inPier = x - k * 3 < 1;
      return inPier || y >= 10 + arch(x, k * 3 + 2, 1, 1.5);
    });
    b.shape(0, 14, 1, 36, 15, 4, 'sand', (x, y, z) => z < 1.5 || z >= 3.5);
    return b;
  }

  // ---------- ワールド4: 世界のランドマーク ----------

  function toriiRow() {
    const b = new Builder(16, 13, 17);
    for (const z of [2, 8, 14]) {
      b.cylinder(3.5, z + 0.5, 0, 10, 0.9, 'redpaint');
      b.cylinder(12.5, z + 0.5, 0, 10, 0.9, 'redpaint');
      b.fill(2, 8, z, 13, 8, z, 'redpaint');
      b.fill(7, 9, z, 8, 9, z, 'redpaint');
      b.fill(1, 10, z - 1, 14, 10, z + 1, 'redpaint');
      b.fill(0, 11, z - 1, 15, 11, z + 1, 'black');
    }
    return b;
  }

  function triumphArch() {
    const b = new Builder(22, 21, 10);
    b.walls(1, 1, 20, 8, 0, 16, 'marble');
    b.fill(1, 17, 1, 20, 18, 8, 'marble');
    b.fill(0, 19, 0, 21, 19, 9, 'marble');
    // 通路の両側の壁
    b.fill(6, 0, 2, 6, 12, 7, 'marble');
    b.fill(15, 0, 2, 15, 12, 7, 'marble');
    // 正面の大きなアーチと、横の小さなアーチ
    b.shape(0, 0, 0, 22, 13, 10, null, (x, y, z) => (z < 2 || z >= 8) && Math.abs(x - 11) < 4 && y < 8 + arch(x, 11, 4, 4));
    b.shape(0, 0, 0, 22, 8, 10, null, (x, y, z) => (x < 2 || x >= 20 || (x >= 6 && x < 7) || (x >= 15 && x < 16)) && Math.abs(z - 5) < 1.6 && y < 4.5 + arch(z, 5, 1.6, 1.6));
    // かざりの帯
    b.fill(1, 14, 0, 20, 14, 0, 'gold');
    b.fill(1, 14, 9, 20, 14, 9, 'gold');
    return b;
  }

  function stepPyramid() {
    const b = new Builder(24, 13, 24);
    for (let k = 0; k < 12; k++) {
      const a = k, c = 23 - k;
      if (k === 11) b.fill(a, k, a, c, k, c, 'sand');
      else {
        b.walls(a, a, c, c, k, k, 'sand');
        b.walls(a + 1, a + 1, c - 1, c - 1, k, k, 'sand');
      }
    }
    b.fill(11, 0, 0, 12, 0, 1, null);
    b.fill(11, 11, 11, 12, 11, 12, 'gold');
    return b;
  }

  function ironTower() {
    const b = new Builder(26, 40, 26);
    const c = 13;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.beam(c + sx * 10, 0.3, c + sz * 10, c + sx * 4, 14, c + sz * 4, 1.1, 'iron');
      b.beam(c + sx * 4, 14, c + sz * 4, c + sx * 2, 26, c + sz * 2, 0.9, 'iron');
      b.beam(c + sx * 2, 26, c + sz * 2, c, 36, c, 0.7, 'iron');
    }
    // 足のあいだのアーチと、まんなかの輪
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
      const p = (s, t) => c + s * t;
      b.beam(p(ax, 8), 5, p(az, 8), (p(ax, 8) + p(bx, 8)) / 2, 8, (p(az, 8) + p(bz, 8)) / 2, 0.7, 'iron');
      b.beam(p(bx, 8), 5, p(bz, 8), (p(ax, 8) + p(bx, 8)) / 2, 8, (p(az, 8) + p(bz, 8)) / 2, 0.7, 'iron');
      b.beam(p(ax, 3), 20, p(az, 3), p(bx, 3), 20, p(bz, 3), 0.6, 'iron');
    }
    b.walls(c - 5, c - 5, c + 5, c + 5, 14, 14, 'iron');
    b.walls(c - 3, c - 3, c + 3, c + 3, 26, 26, 'iron');
    b.beam(c + 0.5, 35, c + 0.5, c + 0.5, 39.5, c + 0.5, 0.5, 'iron');
    return b;
  }

  function leaningTower() {
    const b = new Builder(18, 30, 14);
    const cx = (y) => 7 + y * 0.15;
    b.shape(0, 0, 0, 18, 24, 14, 'marble', (x, y, z) => {
      const d = Math.hypot(x - cx(y), z - 7);
      const floor = y % 3.5 < 0.5;
      const balcony = y % 3.5 < 1 && d <= 4.5;
      return (d <= 3.9 && (d >= 2.9 || floor)) || balcony;
    });
    b.shape(0, 24, 0, 18, 27, 14, 'marble', (x, y, z) => {
      const d = Math.hypot(x - cx(y), z - 7);
      return d <= 2.9 && (d >= 1.9 || y < 24.5 || y >= 26.5);
    });
    b.shape(0, 0, 0, 18, 3, 14, 'door', (x, y, z) => Math.abs(x - cx(y)) < 0.8 && z < 4 && y < 2.5);
    return b;
  }

  function dutchWindmill() {
    const b = new Builder(22, 30, 18);
    // 八角形に近い、れんがの土台
    b.cylinder(11, 10, 0, 4, 6, 'brick', 5);
    b.cylinder(11, 10, 4, 5, 6.5, 'wood');
    b.cone(11, 10, 5, 18, 5, 3.6, 'wood', 1);
    b.cone(11, 10, 18, 23, 4.2, 0.5, 'thatch', 1.2);
    b.box(10.5, 0, 3.5, 11.5, 3, 4.5, 'door');
    b.beam(11, 16, 7, 11, 16, 3.5, 1, 'log');
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const dx = Math.cos(a), dy = Math.sin(a);
      b.beam(11, 16, 3.8, 11 + dx * 10, 16 + dy * 10, 3.8, 0.7, 'wood');
      b.beam(11 + dx * 3 - dy * 1.2, 16 + dy * 3 + dx * 1.2, 3.8, 11 + dx * 9.5 - dy * 1.2, 16 + dy * 9.5 + dx * 1.2, 3.8, 0.8, 'white');
    }
    return b;
  }

  function tvTower() {
    const b = new Builder(22, 36, 22);
    const c = 11;
    const mat = (y) => (Math.floor(y / 4) % 2 ? 'white' : 'redpaint');
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let y = 0; y < 24; y += 2) {
        const r0 = 8 - (6 * y) / 24, r1 = 8 - (6 * (y + 2)) / 24;
        b.beam(c + sx * r0, y + 0.3, c + sz * r0, c + sx * r1, y + 2.3, c + sz * r1, 0.9, mat(y));
      }
    }
    for (const y of [6, 18]) {
      const r = 8 - (6 * y) / 24;
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
        b.beam(c + ax * r, y, c + az * r, c + bx * r, y, c + bz * r, 0.6, mat(y));
      }
    }
    b.fill(c - 5, 13, c - 5, c + 5, 13, c + 5, 'white');
    b.walls(c - 5, c - 5, c + 5, c + 5, 14, 15, 'glass');
    b.fill(c - 5, 16, c - 5, c + 5, 16, c + 5, 'white');
    b.fill(c - 2, 24, c - 2, c + 2, 24, c + 2, 'redpaint');
    b.beam(c + 0.5, 24.5, c + 0.5, c + 0.5, 35.5, c + 0.5, 0.6, 'redpaint');
    return b;
  }

  function colosseum() {
    const b = new Builder(24, 13, 20);
    const cx = 12, cz = 10;
    b.shape(0, 0, 0, 24, 13, 20, 'sand', (x, y, z) => {
      const o = ((x - cx) / 11) ** 2 + ((z - cz) / 9) ** 2;
      const i = ((x - cx) / 8.5) ** 2 + ((z - cz) / 6.5) ** 2;
      if (o > 1 || i < 1) return false;
      const a = Math.atan2(z - cz, x - cx) + Math.PI;
      if (y >= 9 && a > Math.PI * 1.1) return false; // 上の段は半分くずれている
      const frac = ((a / (Math.PI * 2)) * 28) % 1;
      const level = y % 3;
      return !(y < 11 && level >= 0.5 && level < 2.3 && frac > 0.3 && frac < 0.75 && o > 0.72);
    });
    return b;
  }

  function ferrisWheel() {
    const b = new Builder(26, 28, 10);
    const cx = 13, cy = 14.5, R = 11;
    b.shape(1, 2, 4, 25, 27, 6, 'white', (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return d >= R - 1 && d <= R;
    });
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      b.beam(cx, cy, 5, cx + Math.cos(a) * (R - 0.5), cy + Math.sin(a) * (R - 0.5), 5, 0.55, 'white');
      const gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R;
      b.box(gx - 0.9, gy - 2.6, 4, gx + 0.9, gy - 0.9, 6, k % 2 ? 'yellow' : 'redpaint');
      b.beam(gx, gy - 1, 5, gx, gy - 0.3, 5, 0.5, 'iron');
    }
    b.beam(cx, cy, 2, cx, cy, 8, 1, 'iron');
    for (const [x, z] of [[6, 1.5], [20, 1.5], [6, 8.5], [20, 8.5]]) b.beam(cx, cy, z < 5 ? 2.5 : 7.5, x, 0.3, z, 0.9, 'iron');
    return b;
  }

  function skyscraper() {
    const b = new Builder(12, 46, 12);
    b.walls(2, 2, 9, 9, 0, 40, 'glass');
    for (const [x, z] of [[2, 2], [9, 2], [2, 9], [9, 9]]) b.fill(x, 0, z, x, 40, z, 'concrete');
    for (let y = 4; y <= 40; y += 4) {
      b.fill(3, y, 3, 8, y, 8, 'concrete');
      b.walls(2, 2, 9, 9, y, y, 'concrete');
    }
    b.fill(5, 0, 2, 6, 2, 2, 'door');
    b.walls(4, 4, 7, 7, 41, 43, 'concrete');
    b.fill(4, 44, 4, 7, 44, 7, 'concrete');
    b.beam(6, 44.5, 6, 6, 45.8, 6, 0.4, 'redpaint');
    return b;
  }

  // ---------- ワールド5: 巨大な像 ----------

  function bearStatue() {
    const b = new Builder(14, 16, 13);
    b.fill(3, 0, 3, 10, 0, 10, 'stone');
    b.ellipsoid(7, 6, 7, 4, 4.6, 3.5, 'fur');
    b.ellipsoid(4.8, 2.4, 4.2, 1.5, 1.3, 2, 'fur');
    b.ellipsoid(9.2, 2.4, 4.2, 1.5, 1.3, 2, 'fur');
    b.ellipsoid(3.3, 7, 5.5, 1.2, 2.6, 1.2, 'fur');
    b.ellipsoid(10.7, 7, 5.5, 1.2, 2.6, 1.2, 'fur');
    b.ellipsoid(7, 5.5, 3.8, 2.6, 3, 0.8, 'tan');
    b.sphere(7, 11.6, 6.6, 2.8, 'fur');
    b.sphere(5, 13.8, 6.8, 0.9, 'fur');
    b.sphere(9, 13.8, 6.8, 0.9, 'fur');
    b.ellipsoid(7, 11, 4.2, 1.3, 1, 1, 'tan');
    b.sphere(7, 11.4, 3.3, 0.5, 'black');
    b.sphere(6, 12.3, 4.4, 0.4, 'black');
    b.sphere(8, 12.3, 4.4, 0.4, 'black');
    return b;
  }

  function moaiRow() {
    const b = new Builder(20, 14, 8);
    for (const [k, x] of [[0, 1], [1, 8], [2, 15]]) {
      b.fill(x, 0, 2, x + 3, 3, 5, 'moai');
      b.fill(x, 4, 2, x + 3, 10, 5, 'moai');
      b.fill(x - 0, 8, 1, x + 3, 8, 1, 'moai');
      b.fill(x + 1, 5, 1, x + 2, 7, 1, 'moai');
      b.box(x + 0.5, 4.5, 1.5, x + 3.5, 5, 2, 'moai');
      b.fill(x - 1, 6, 3, x - 1, 8, 4, 'moai');
      b.fill(x + 4, 6, 3, x + 4, 8, 4, 'moai');
      if (k === 1) b.cylinder(x + 2, 3.5, 11, 12.5, 1.8, 'redrock');
    }
    return b;
  }

  function catStatue() {
    const b = new Builder(14, 17, 12);
    b.fill(2, 0, 2, 11, 0, 9, 'stone');
    b.ellipsoid(7, 5, 6, 3.6, 4.4, 3, 'cream');
    b.ellipsoid(5.2, 1.8, 3.6, 1.2, 1, 1.5, 'cream');
    b.ellipsoid(8.8, 1.8, 3.6, 1.2, 1, 1.5, 'cream');
    b.sphere(7, 10.8, 5.5, 2.9, 'cream');
    b.cone(5.2, 5.5, 12.5, 15.5, 1.3, 0.2, 'cream');
    b.cone(8.8, 5.5, 12.5, 15.5, 1.3, 0.2, 'cream');
    b.sphere(5.9, 11.4, 2.9, 0.5, 'green');
    b.sphere(8.1, 11.4, 2.9, 0.5, 'green');
    b.sphere(7, 10.3, 2.7, 0.4, 'pink');
    // しっぽ
    b.beam(9.5, 1.5, 8.5, 11.5, 2, 6, 0.8, 'cream');
    b.beam(11.5, 2, 6, 11.8, 4.5, 3.5, 0.8, 'cream');
    return b;
  }

  function sphinx() {
    const b = new Builder(31, 15, 13);
    b.fill(1, 0, 1, 29, 0, 11, 'sand');
    b.ellipsoid(12, 3.5, 6, 9.5, 3, 3.8, 'sand');
    b.box(19, 1, 2.5, 28, 2.6, 4.6, 'sand');
    b.box(19, 1, 7.4, 28, 2.6, 9.5, 'sand');
    b.box(19, 3, 3, 24, 9, 9, 'sand');
    // 頭と頭巾
    b.box(21, 8, 3.5, 26, 13, 8.5, 'sand');
    b.box(20.5, 8, 2.5, 24.5, 12.5, 3.5, 'gold');
    b.box(20.5, 8, 8.5, 24.5, 12.5, 9.5, 'gold');
    b.box(20.5, 13, 3, 25, 13.8, 9, 'gold');
    b.box(26, 10, 5.5, 26.6, 11.2, 6.5, 'sand');
    b.box(25.9, 11.5, 4.3, 26.2, 12, 5.2, 'black');
    b.box(25.9, 11.5, 6.8, 26.2, 12, 7.7, 'black');
    return b;
  }

  function dinosaur() {
    const b = new Builder(31, 17, 10);
    // 足
    b.box(9, 0, 1.5, 12, 1, 4, 'green');
    b.box(9, 0, 6, 12, 1, 8.5, 'green');
    b.beam(10.5, 0.8, 2.8, 12, 6, 3.2, 1.2, 'green');
    b.beam(10.5, 0.8, 7.2, 12, 6, 6.8, 1.2, 'green');
    b.ellipsoid(13, 8, 5, 3, 3.5, 2.6, 'green');
    // 胴としっぽ
    b.ellipsoid(16, 9, 5, 6, 3, 2.6, 'green');
    b.beam(10, 8.5, 5, 5, 7, 5, 1.6, 'green');
    b.beam(5, 7, 5, 1.5, 5, 5, 1, 'green');
    // 首と頭
    b.beam(20, 10, 5, 22.5, 12.5, 5, 1.6, 'green');
    b.box(21.5, 11.5, 3, 29, 14.5, 7, 'green');
    b.box(23, 10.3, 3.4, 29, 11.5, 6.6, 'green');
    b.box(23, 11.5, 3.2, 29, 11.9, 6.8, 'white');
    b.box(24, 13.4, 2.8, 25, 14.2, 3.2, 'black');
    b.box(24, 13.4, 6.8, 25, 14.2, 7.2, 'black');
    // 小さな前足
    b.beam(20, 8, 3.5, 21.5, 6.5, 3, 0.6, 'green');
    b.beam(20, 8, 6.5, 21.5, 6.5, 7, 0.6, 'green');
    return b;
  }

  function knightStatue() {
    const b = new Builder(16, 23, 12);
    b.fill(3, 0, 3, 12, 2, 9, 'stone');
    b.box(5.5, 3, 5, 7.5, 9, 7, 'iron');
    b.box(8.5, 3, 5, 10.5, 9, 7, 'iron');
    b.box(5, 9, 4.5, 11, 15, 7.5, 'iron');
    b.box(5, 13, 4.3, 11, 14, 4.5, 'blue');
    b.box(6, 15, 4.5, 10, 19, 7.5, 'iron');
    b.box(6.5, 17, 4.3, 9.5, 17.5, 4.5, 'black');
    b.box(7.5, 19, 5.5, 8.5, 20.5, 6.5, 'redpaint');
    // 右手の剣と左手の盾
    b.beam(10.8, 14.5, 6, 12, 10, 4.5, 0.8, 'iron');
    b.beam(12.5, 10, 4, 12.5, 21.5, 4, 0.5, 'white');
    b.beam(11, 11.5, 4, 14, 11.5, 4, 0.5, 'gold');
    b.beam(5.2, 14.5, 6, 2.6, 11, 5.5, 0.8, 'iron');
    b.box(1.5, 7, 3.5, 3, 13, 8, 'blue');
    b.box(1.3, 9.5, 5.3, 1.5, 10.5, 6.2, 'gold');
    return b;
  }

  function robotStatue() {
    const b = new Builder(18, 27, 10);
    b.box(4, 0, 2, 8, 1.5, 7.5, 'blue');
    b.box(10, 0, 2, 14, 1.5, 7.5, 'blue');
    b.box(4.5, 1.5, 3, 7.5, 9, 6.5, 'white');
    b.box(10.5, 1.5, 3, 13.5, 9, 6.5, 'white');
    b.box(4, 9, 2.5, 14, 11, 7, 'redpaint');
    b.box(3.5, 11, 2.5, 14.5, 18, 7, 'white');
    b.box(6, 13, 2.3, 12, 16, 2.5, 'blue');
    b.box(8, 14, 2.1, 10, 15, 2.3, 'yellow');
    // 腕
    b.box(0.5, 15, 3.5, 3.5, 18, 6, 'redpaint');
    b.box(14.5, 15, 3.5, 17.5, 18, 6, 'redpaint');
    b.box(1, 8, 3.5, 3, 15, 6, 'white');
    b.box(15, 8, 3.5, 17, 15, 6, 'white');
    b.box(0.5, 6, 3, 3.5, 8, 6.5, 'iron');
    b.box(14.5, 6, 3, 17.5, 8, 6.5, 'iron');
    // 頭
    b.box(7, 18, 3.5, 11, 18.8, 6, 'iron');
    b.box(5.5, 18.8, 2.5, 12.5, 23, 7, 'white');
    b.box(6.5, 20.5, 2.3, 11.5, 21.5, 2.5, 'yellow');
    b.box(5, 21, 2.5, 13, 21.6, 7, 'redpaint');
    b.beam(9, 23, 4.75, 9, 25.5, 4.75, 0.4, 'yellow');
    b.sphere(9, 25.8, 4.75, 0.7, 'redpaint');
    return b;
  }

  function goddessStatue() {
    const b = new Builder(16, 38, 16);
    b.fill(3, 0, 3, 12, 1, 12, 'stone');
    b.walls(4, 4, 11, 11, 2, 10, 'stone');
    b.fill(4, 11, 4, 11, 11, 11, 'stone');
    b.fill(5, 12, 5, 10, 12, 10, 'stone');
    b.fill(7, 1, 4, 8, 4, 4, 'door');
    // 衣をまとった体
    b.cone(7.5, 7.5, 13, 27, 3.6, 2.2, 'bronze', 1.4);
    b.cylinder(7.5, 7.5, 13, 14, 3.6, 'bronze');
    b.cone(7.5, 7.5, 27, 28.5, 2.2, 1, 'bronze');
    b.sphere(7.5, 30, 7.5, 1.8, 'bronze');
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (0.15 + (0.7 * k) / 6);
      b.beam(7.5, 30.8, 7.5, 7.5 + Math.cos(a) * 3, 32.2, 7.5 - Math.sin(a) * 1.5, 0.35, 'bronze');
    }
    // かかげた右手のたいまつと、左手の本
    b.beam(9.4, 26, 7.5, 11, 33.5, 7.5, 0.8, 'bronze');
    b.cone(11.1, 7.5, 33.5, 35, 0.6, 1.1, 'bronze');
    b.cone(11.1, 7.5, 35, 37.5, 1, 0.2, 'gold');
    b.beam(5.6, 25, 7.5, 4.5, 21.5, 6.5, 0.7, 'bronze');
    b.box(3.3, 20, 5.5, 5, 23.5, 8, 'bronze');
    return b;
  }

  function gorillaStatue() {
    const b = new Builder(18, 19, 14);
    b.ellipsoid(9, 7.5, 7.5, 4.6, 5, 4, 'gorilla');
    b.ellipsoid(9, 6.8, 4.3, 2.8, 3, 0.9, 'black');
    b.ellipsoid(6.2, 2, 5.5, 1.8, 2, 2, 'gorilla');
    b.ellipsoid(11.8, 2, 5.5, 1.8, 2, 2, 'gorilla');
    // 地面につく長い腕
    b.beam(4.8, 10.5, 7, 2.3, 1.2, 5, 1.5, 'gorilla');
    b.beam(13.2, 10.5, 7, 15.7, 1.2, 5, 1.5, 'gorilla');
    b.ellipsoid(2.3, 0.9, 4.6, 1.6, 0.9, 1.6, 'black');
    b.ellipsoid(15.7, 0.9, 4.6, 1.6, 0.9, 1.6, 'black');
    b.sphere(9, 13.8, 6.6, 3, 'gorilla');
    b.ellipsoid(9, 13, 3.9, 2, 1.6, 0.9, 'black');
    b.box(7, 14.5, 3.6, 11, 15.2, 4.4, 'black');
    b.sphere(8, 14.2, 3.7, 0.35, 'white');
    b.sphere(10, 14.2, 3.7, 0.35, 'white');
    return b;
  }

  function grandCastle() {
    const b = new Builder(32, 26, 32);
    // 城壁と門 (まんなかは x = z = 16)
    b.walls(4, 4, 27, 27, 0, 6, 'stone');
    b.battlements(4, 4, 27, 27, 7, 'stone');
    b.fill(14, 0, 4, 17, 4, 4, 'door');
    for (const [x, z] of [[4.5, 4.5], [27.5, 4.5], [4.5, 27.5], [27.5, 27.5]]) {
      b.cylinder(x, z, 0, 12, 3, 'stone', 2);
      b.cylinder(x, z, 12, 13, 3.4, 'stone');
      b.cone(x, z, 13, 18, 3.6, 0.3, 'slate', 1.2);
    }
    // 門の上の2つの小さな塔
    b.walls(12, 3, 13, 5, 0, 9, 'stone');
    b.walls(18, 3, 19, 5, 0, 9, 'stone');
    b.fill(12, 10, 3, 19, 10, 5, 'stone');
    // 天守
    house(b, { x0: 10, z0: 13, x1: 21, z1: 23, floors: 2, wall: 'cream', base: 'stone', roofMat: 'slate' });
    b.walls(13, 16, 18, 20, 14, 20, 'cream');
    b.fill(15, 18, 16, 16, 19, 16, 'glass');
    b.pyramid(13, 16, 18, 20, 21, 'slate');
    return b;
  }

  // ---------- ワールドとステージ ----------

  // 空と地面の色
  const WORLDS = [
    { name: 'はじまりの村', sky: 0xf7b267, ground: ['#6f9a45', '#668f3f'] },
    { name: 'にぎやかな町', sky: 0x9fd3f0, ground: ['#7d9c5a', '#739151'] },
    { name: '川と橋', sky: 0x8ec9ef, ground: ['#5f9a4a', '#578e43'] },
    { name: '世界のランドマーク', sky: 0xe9b38f, ground: ['#a7a46a', '#9b9862'] },
    { name: '巨大な像', sky: 0xf2a0a6, ground: ['#d6b77c', '#cbab70'] },
  ];

  // river は川の幅 (ワールドの単位)。x は川の中心 (ワールドの単位、ふだんは 0)
  const STAGES = [
    { name: '物置', sub: 'まずは1つ投げてみよう', build: shed },
    { name: 'わらの小屋', sub: 'わらはとてもやわらかい', build: strawHut },
    { name: '木の小屋', sub: '丸太の壁は、やわらかい', build: cabin },
    { name: '粉ひき風車', sub: '羽根のついた円い塔', build: windmillHouse },
    { name: '丸太の見張り台', sub: '4本の足をねらおう', build: watchtower },
    { name: '村の教会', sub: '高い尖塔のある教会', build: church },
    { name: 'レンガの家', sub: '二階建て。レンガは少し固い', build: brickHouse },
    { name: '赤い納屋', sub: '大きな扉の納屋', build: barn },
    { name: '町の一軒家', sub: '石の土台に、しっくいの壁', build: townHouse },
    { name: 'ふたごの家', sub: '2けんの家をまとめて', build: twinHouses },

    { name: '五重塔', sub: '5つの屋根が重なる塔', build: pagoda },
    { name: '灯台', sub: '赤白しまの細い塔', build: lighthouse },
    { name: 'アパート', sub: '4階建ての大きな建物', build: apartment },
    { name: '見張り塔の屋敷', sub: '石の塔は、根元をねらおう', build: manor },
    { name: '時計塔', sub: '4面の時計がある塔', build: clockTower },
    { name: '給水塔', sub: 'ななめの足で立つタンク', build: waterTower },
    { name: '町の学校', sub: '横に長い二階建て', build: school },
    { name: 'パン屋さん', sub: '緑のひさしのお店', build: bakery },
    { name: '石のお城', sub: '城壁と4つの塔と天守', build: castle },
    { name: '三軒長屋', sub: '壁でつながった3けん', build: rowHouses },

    { name: '石のアーチ橋', sub: 'アーチの根元をねらおう', build: stoneArchBridge, river: 15 },
    { name: '大きなつり橋', sub: '高い塔の長い橋', build: () => suspension(46, [10, 34], 20, 6, 'iron', 'redpaint', 8), river: 30 },
    { name: '三連アーチ橋', sub: 'レンガの3つのアーチ', build: tripleArchBridge, river: 30 },
    { name: '赤い太鼓橋', sub: 'まるく反った木の橋', build: drumBridge, river: 16 },
    { name: '屋根つき橋', sub: '屋根と壁のある木の橋', build: coveredBridge, river: 17 },
    { name: '鉄道の鉄橋', sub: '鉄骨を組んだ橋', build: trussBridge, river: 24 },
    { name: 'つり橋', sub: 'ケーブルでつるした橋', build: () => suspension(34, [7, 25], 14, 4, 'wood', 'redpaint', 7), river: 22 },
    { name: '丸太の橋', sub: '川にかかる小さな橋', build: logBridge, river: 16 },
    { name: '水車小屋', sub: '川のほとりの小屋と水車', build: waterMill, river: 5, riverX: 2.7 },
    { name: '水道橋', sub: '2段に重なるアーチ', build: aqueduct, river: 14 },

    { name: '摩天楼', sub: 'ガラスの高層ビル', build: skyscraper },
    { name: '凱旋門', sub: '大理石の大きな門', build: triumphArch },
    { name: '斜塔', sub: 'かたむいた大理石の塔', build: leaningTower },
    { name: '大観覧車', sub: '支えの足をねらおう', build: ferrisWheel },
    { name: '鉄の塔', sub: '4本の足で立つ鉄塔', build: ironTower },
    { name: 'コロッセオ', sub: 'アーチが並ぶ円い闘技場', build: colosseum },
    { name: '鳥居の参道', sub: '3つ並んだ鳥居', build: toriiRow },
    { name: 'オランダの風車', sub: '大きな羽根の風車', build: dutchWindmill },
    { name: '電波塔', sub: '赤と白の鉄塔', build: tvTower },
    { name: 'ピラミッド', sub: '段々の石の山', build: stepPyramid },

    { name: 'ネコの像', sub: 'おすわりするネコ', build: catStatue },
    { name: '恐竜の像', sub: '2本足で立つ恐竜', build: dinosaur },
    { name: 'クマの像', sub: 'すわっているクマ', build: bearStatue },
    { name: 'ゴリラの像', sub: '長い腕で立つゴリラ', build: gorillaStatue },
    { name: '巨大ロボ', sub: '赤と白のロボット', build: robotStatue },
    { name: '騎士の像', sub: '剣と盾をもつ騎士', build: knightStatue },
    { name: 'モアイ', sub: '3体ならんだ石像', build: moaiRow },
    { name: '女神像', sub: 'たいまつをかかげる像', build: goddessStatue },
    { name: 'スフィンクス', sub: '寝そべる砂岩の像', build: sphinx },
    { name: '王さまのお城', sub: '最後のお城', build: grandCastle },
  ];

  // 手榴弾の数。tune.js (自動で投げる練習相手) が、クリアに要る数から決めた
  const GRENADES = [5, 9, 11, 13, 13, 13, 15, 15, 21, 25, 9, 9, 11, 10, 14, 14, 16, 16, 20, 23, 8, 8, 8, 8, 8, 7, 9, 10, 12, 22, 5, 7, 7, 6, 8, 11, 11, 11, 13, 17, 5, 5, 5, 6, 7, 7, 9, 10, 14, 25];
  // 後半のワールドほど、根元を多くこわさないとくずれない (細い足の像が1発で倒れないように)
  const COLLAPSE_BY_WORLD = [0.55, 0.55, 0.5, 0.42, 0.32];
  STAGES.forEach((s, i) => {
    s.world = Math.floor(i / 10);
    if (!s.collapse) s.collapse = COLLAPSE_BY_WORLD[s.world];
    s.grenades = GRENADES[i];
  });

  const api = { MATERIALS, MATERIAL_NAMES, WORLDS, STAGES, Builder, CELL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.VoxelStages = api;
})();
