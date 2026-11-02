/*
 * ボクセル解体ボンバー: 自動で投げる練習相手で、各ステージのクリアに要る手榴弾の数を調べ、
 * stages.js の GRENADES にする数を出す。ゲームでは読まない。
 *
 *   node tune.js          全ステージ (数分かかる)
 *   node tune.js 21 30    ステージ21〜30だけ
 *
 * 練習相手は、地面ぎわ70か所とそれ以外20か所に投げたときを試し、いちばん壊せる (同じなら地面の段を多く削る) 場所に、
 * 少しずらして投げる。これを3回くり返し、80%に届くまでに使った数のまん中の値を「要る数」とする。
 * 手榴弾の数は、要る数に、ステージが進むほど少しずつ小さくなる倍率をかけ、おまけを足して決める。
 */
'use strict';

const Stages = require('./stages.js');
const World = require('./world.js');

const RUNS = 3;
const LIMIT = 40;

let seed = 1;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function clone(w) {
  return { ...w, cells: w.cells.slice(), hp: w.hp.slice(), mark: new Uint32Array(w.cells.length), stamp: 0 };
}

// 投げる場所の候補: ブロックのとなりの空いたボクセル。地面ぎわ (下から2段) とそれ以外に分ける
function candidates(w) {
  const base = [], other = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < w.cells.length; i++) {
    if (!w.cells[i]) continue;
    const [x, y, z] = World.coords(w, i);
    for (const [dx, dy, dz] of dirs) {
      const ax = x + dx, ay = y + dy, az = z + dz;
      if (!World.solid(w, ax, ay, az)) (ay < 2 ? base : other).push([ax + 0.5, ay + 0.5, az + 0.5]);
    }
  }
  return { base, other };
}

function sample(list, n) {
  const out = [];
  for (let k = 0; k < n && list.length; k++) out.push(list[Math.floor(rnd() * list.length)]);
  return out;
}

function groundCount(w) {
  let n = 0;
  for (let x = 0; x < w.w; x++) for (let z = 0; z < w.d; z++) if (w.cells[World.index(w, x, 0, z)]) n++;
  return n;
}

function play(stageIndex) {
  const w = World.createWorld(stageIndex);
  for (let g = 1; g <= LIMIT; g++) {
    const { base, other } = candidates(w);
    let best = null;
    for (const p of sample(base, 70).concat(sample(other, 20))) {
      const t = clone(w);
      World.explode(t, ...p, () => 0.5);
      const score = World.destroyedRatio(t) * 1000 - groundCount(t);
      if (!best || score > best.score) best = { score, p };
    }
    const [x, y, z] = best.p;
    World.explode(w, x + (rnd() - 0.5) * 3, y, z + (rnd() - 0.5) * 3, rnd);
    if (World.destroyedRatio(w) >= 0.8) return g;
  }
  return LIMIT + 1;
}

function grenadesFor(need, i, n) {
  const t = i / (n - 1);
  return Math.ceil(need * (2.2 - 0.8 * t)) + Math.round(2 - t);
}

const n = Stages.STAGES.length;
const from = process.argv[2] ? +process.argv[2] - 1 : 0;
const to = process.argv[3] ? +process.argv[3] - 1 : n - 1;
const result = [];
for (let s = from; s <= to; s++) {
  const runs = [];
  for (let k = 0; k < RUNS; k++) {
    seed = 1 + k * 7919 + s * 31;
    runs.push(play(s));
  }
  runs.sort((a, b) => a - b);
  const need = runs[1];
  const grenades = grenadesFor(need, s, n);
  result.push(grenades);
  console.log(`${s + 1}\t${Stages.STAGES[s].name}\t要る数 ${need} (${runs.join(', ')})\t手榴弾 ${grenades}`);
}
console.log(`GRENADES = [${result.join(', ')}]`);
