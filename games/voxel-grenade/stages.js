/*
 * ボクセル解体ボンバー: 5つのステージの家の形と、手榴弾の数。
 * three.js を使わない (爆発の計算 world.js と画面の両方が使う。node でも動く)
 *
 * 家は w × h × d のマス目に、材料の名前を置いて作る。y = 0 が地面に接する段。
 * 材料ごとに色と固さ (hp) があり、爆発のダメージが hp を超えたマスがこわれる。
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
  };
  const MATERIAL_NAMES = Object.keys(MATERIALS);

  class Builder {
    constructor(w, h, d) {
      this.w = w;
      this.h = h;
      this.d = d;
      this.cells = new Uint8Array(w * h * d); // 0 は空、1 から MATERIAL_NAMES の順
    }

    set(x, y, z, mat) {
      if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return;
      this.cells[x + this.w * (y + this.h * z)] = mat ? MATERIAL_NAMES.indexOf(mat) + 1 : 0;
    }

    // 箱をうめる (両端をふくむ)
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

    // 切妻屋根。棟は z の向き。屋根は2マスの厚みの階段で、軒が1マス出る。妻側の三角は wallMat でうめる
    gable(x0, z0, x1, z1, y, mat, wallMat) {
      for (let k = 0; ; k++) {
        const left = x0 - 1 + k;
        const right = x1 + 1 - k;
        if (left > right) break;
        const yy = y + k;
        for (let z = z0 - 1; z <= z1 + 1; z++) {
          this.set(left, yy, z, mat);
          this.set(right, yy, z, mat);
          if (left + 1 <= right) {
            this.set(left + 1, yy, z, mat);
            this.set(right - 1, yy, z, mat);
          }
        }
        for (let x = left + 2; x <= right - 2; x++) {
          this.set(x, yy, z0, wallMat);
          this.set(x, yy, z1, wallMat);
        }
      }
    }

    // 寄棟 (四角すい) の屋根。2マスの厚みの輪を1段ずつ小さくする
    pyramid(x0, z0, x1, z1, y, mat) {
      for (let k = 0; ; k++) {
        const ax = x0 - 1 + k, bx = x1 + 1 - k, az = z0 - 1 + k, bz = z1 + 1 - k;
        if (ax > bx || az > bz) break;
        for (let t = 0; t < 2; t++) {
          const cx0 = ax + t, cx1 = bx - t, cz0 = az + t, cz1 = bz - t;
          if (cx0 > cx1 || cz0 > cz1) {
            this.fill(ax, y + k, az, bx, y + k, bz, mat);
            break;
          }
          this.walls(cx0, cz0, cx1, cz1, y + k, y + k, mat);
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

  // 1. 木の小屋
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

  // 2. 町の一軒家
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

  // 3. 二階建てのレンガの家
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

  // 4. 見張り塔のある屋敷
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

  // 5. 石のお城
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

  const STAGES = [
    { name: '木の小屋', sub: '丸太の壁は、やわらかい', grenades: 5, build: cabin },
    { name: '町の一軒家', sub: '石の土台に、しっくいの壁', grenades: 8, build: townHouse },
    { name: 'レンガの家', sub: '二階建て。レンガは少し固い', grenades: 9, build: brickHouse },
    { name: '見張り塔の屋敷', sub: '石の塔は、根元をねらおう', grenades: 10, build: manor },
    { name: '石のお城', sub: '城壁と4つの塔と天守', grenades: 18, build: castle },
  ];

  const api = { MATERIALS, MATERIAL_NAMES, STAGES, Builder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.VoxelStages = api;
})();
