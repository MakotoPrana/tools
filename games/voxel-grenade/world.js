/*
 * ボクセル解体ボンバー: マス目の家と、爆発・くずれ落ちる計算。
 * three.js を使わない (画面は script.js が作る。node でも動く)
 */
(() => {
  'use strict';

  const Stages = typeof module !== 'undefined' && module.exports ? require('./stages.js') : window.VoxelStages;

  const CELL = Stages.CELL; // ボクセル1つの大きさ
  const RADIUS = 4.0; // 爆発がとどくきょり (ワールドの単位。ボクセルなら RADIUS / CELL 個ぶん)
  const POWER = 3.4; // 爆心でのダメージ。はなれるほど直線で弱くなる
  // ひとかたまりの建物は、地面に接するブロックの割合がはじめの COLLAPSE 倍より少なくなると、重さに負けてくずれる
  const COLLAPSE = 0.55;
  const JITTER = 0.5; // ダメージのばらつき (こわれた縁をぎざぎざにする)

  function createWorld(stageIndex) {
    const b = Stages.STAGES[stageIndex].build();
    const { w, h, d } = b;
    const cells = b.cells;
    const hp = new Float32Array(cells.length);
    let total = 0;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      hp[i] = Stages.MATERIALS[Stages.MATERIAL_NAMES[cells[i] - 1]].hp;
      total++;
    }
    const world = { w, h, d, cells, hp, total, alive: total, mark: new Uint32Array(cells.length), stamp: 0 };
    // はじめの、かたまりごとの地面に接する割合を、そのかたまりのブロックに覚えておく
    world.baseRatio = new Float32Array(cells.length);
    for (const c of components(world)) for (const i of c.cells) world.baseRatio[i] = c.base / c.cells.length;
    return world;
  }

  function index(world, x, y, z) {
    return x + world.w * (y + world.h * z);
  }

  function coords(world, i) {
    const x = i % world.w;
    const y = Math.floor(i / world.w) % world.h;
    const z = Math.floor(i / (world.w * world.h));
    return [x, y, z];
  }

  // そのマスにブロックがあるか (外は空)
  function solid(world, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= world.w || y >= world.h || z >= world.d) return false;
    return world.cells[x + world.w * (y + world.h * z)] !== 0;
  }

  // ボクセルの座標 (cx, cy, cz) で爆発させる。dist はワールドの単位。こわれたマスと、支えを失って落ちるマスを返す
  function explode(world, cx, cy, cz, rng = Math.random) {
    const removed = [];
    const r = Math.ceil(RADIUS / CELL);
    const x0 = Math.max(0, Math.floor(cx) - r), x1 = Math.min(world.w - 1, Math.floor(cx) + r);
    const y0 = Math.max(0, Math.floor(cy) - r), y1 = Math.min(world.h - 1, Math.floor(cy) + r);
    const z0 = Math.max(0, Math.floor(cz) - r), z1 = Math.min(world.d - 1, Math.floor(cz) + r);
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = index(world, x, y, z);
          if (!world.cells[i]) continue;
          const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) * CELL;
          if (dist >= RADIUS) continue;
          const dmg = POWER * (1 - dist / RADIUS) + (rng() - 0.5) * JITTER;
          if (dmg <= 0) continue;
          world.hp[i] -= dmg;
          if (world.hp[i] <= 0) {
            removed.push({ i, x, y, z, mat: world.cells[i], dist });
            world.cells[i] = 0;
          }
        }
      }
    }
    world.alive -= removed.length;
    const fallen = removed.length ? detach(world) : [];
    return { removed, fallen };
  }

  // 6方向につながったブロックのかたまりに分ける。base は地面 (y = 0 の段) に接するブロックの数
  function components(world) {
    const { w, h, d, cells, mark } = world;
    const stamp = ++world.stamp;
    const layer = w * h;
    const list = [];
    const stack = [];
    for (let start = 0; start < cells.length; start++) {
      if (!cells[start] || mark[start] === stamp) continue;
      const comp = { cells: [], base: 0 };
      mark[start] = stamp;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop();
        comp.cells.push(i);
        const x = i % w;
        const y = Math.floor(i / w) % h;
        const z = Math.floor(i / layer);
        if (y === 0) comp.base++;
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (y > 0) visit(i - w);
        if (y < h - 1) visit(i + w);
        if (z > 0) visit(i - layer);
        if (z < d - 1) visit(i + layer);
      }
      list.push(comp);
    }
    function visit(j) {
      if (cells[j] && mark[j] !== stamp) {
        mark[j] = stamp;
        stack.push(j);
      }
    }
    return list;
  }

  // 地面につながっていないかたまりと、支えが足りなくなったかたまりを外して返す
  function detach(world) {
    const fallen = [];
    for (const comp of components(world)) {
      const weak = comp.base < 8 || comp.base / comp.cells.length < world.baseRatio[comp.cells[0]] * COLLAPSE;
      if (comp.base > 0 && !weak) continue;
      for (const i of comp.cells) {
        const [x, y, z] = coords(world, i);
        fallen.push({ i, x, y, z, mat: world.cells[i] });
        world.cells[i] = 0;
      }
    }
    world.alive -= fallen.length;
    return fallen;
  }

  function destroyedRatio(world) {
    return 1 - world.alive / world.total;
  }

  const api = { CELL, RADIUS, POWER, COLLAPSE, createWorld, index, coords, solid, explode, destroyedRatio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.VoxelWorld = api;
})();
