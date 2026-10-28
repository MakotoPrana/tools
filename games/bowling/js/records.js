/*
 * 成績: ステージごとの記録の保存と集計、遊べるステージの判定
 *   ステージごとに { s: ストライククリア, p: スペアクリア, st: 宝物込みストライク, pt: 宝物込みスペア,
 *                    t: 宝物を持っている, n: 挑戦した回数, r: 投げた回数, c: クリアした回数 }
 */
import { store } from './util.js';
import { WORLDS, stageId } from './worlds.js';

const RECORD_KEY = 'strike-lane-records';
let records = {};
try {
  records = JSON.parse(store.get(RECORD_KEY)) || {};
} catch (e) {
  records = {};
}
if (typeof records !== 'object' || Array.isArray(records)) records = {};
// 前の版 (1ワールドだけの頃) の進み具合を引きつぐ
try {
  const old = JSON.parse(store.get('strike-lane-progress'));
  if (Array.isArray(old) && !store.get(RECORD_KEY)) {
    old.forEach((pr, i) => {
      if (!pr) return;
      const r = (records[stageId(0, i)] = {});
      if (pr.best === 'strike') r.s = 1;
      if (pr.best === 'spare') r.p = 1;
      if (pr.treasure) r.t = 1;
    });
  }
} catch (e) { /* 読めなければ引きつがない */ }
// ストライクを取ったステージは、スペアも取ったことにする (前の版で保存した記録もそろえる)
for (const r of Object.values(records)) {
  if (r && r.s) r.p = 1;
  if (r && r.st) r.pt = 1;
}

const save = () => store.set(RECORD_KEY, JSON.stringify(records));
const rec = (w, s) => records[stageId(w, s)] || (records[stageId(w, s)] = {});

// 記録を見る (書きかえない)
export const peek = (w, s) => records[stageId(w, s)] || {};
export const cleared = (w, s) => Boolean(peek(w, s).s || peek(w, s).p);

// ひとつ前のステージ (ワールドの最初なら前のワールドの最後) をクリアすると遊べる
export function isUnlocked(w, s) {
  if (w === 0 && s === 0) return true;
  if (s > 0) return cleared(w, s - 1);
  return cleared(w - 1, WORLDS[w - 1].stages.length - 1);
}
export const worldUnlocked = (w) => isUnlocked(w, 0);

// 遊べる中でいちばん先のワールド
export function lastPlayableWorld() {
  let w = 0;
  for (let i = 0; i < WORLDS.length; i++) if (worldUnlocked(i)) w = i;
  return w;
}

// 投げた。1投目なら挑戦の回数も数える
export function recordThrow(w, s, roll) {
  const r = rec(w, s);
  if (roll === 1) r.n = (r.n || 0) + 1;
  r.r = (r.r || 0) + 1;
  save();
}

// クリアした。ストライクはスペアも取ったことにする。宝物はクリアしたときに持ち帰る。
// 今回はじめて取った記録の名前を返す
export function recordClear(w, s, kind, withTreasure) {
  const r = rec(w, s);
  const keys = kind === 'strike' ? ['s', 'p', withTreasure && 'st', withTreasure && 'pt'] : ['p', withTreasure && 'pt'];
  if (withTreasure) keys.push('t');
  const fresh = keys.filter((k) => k && !r[k]);
  for (const k of keys) if (k) r[k] = 1;
  r.c = (r.c || 0) + 1;
  save();
  return fresh;
}

// 集計 (filterWorld を渡すと、そのワールドだけ)
export function tally(filterWorld) {
  const sum = { s: 0, p: 0, st: 0, pt: 0, t: 0, n: 0, r: 0, clear: 0, total: 0 };
  WORLDS.forEach((wd, w) => {
    if (filterWorld !== undefined && filterWorld !== w) return;
    wd.stages.forEach((_, s) => {
      const r = peek(w, s);
      sum.total++;
      for (const k of ['s', 'p', 'st', 'pt', 't']) if (r[k]) sum[k]++;
      if (r.s || r.p) sum.clear++;
      sum.n += r.n || 0;
      sum.r += r.r || 0;
    });
  });
  return sum;
}

// 全体の達成率: 1ステージにつき、4つの記録と宝物の5つ
const PER_STAGE = 5;
export function overallProgress() {
  const sum = tally();
  const got = sum.s + sum.p + sum.st + sum.pt + sum.t;
  const max = sum.total * PER_STAGE;
  return { sum, got, max, pct: Math.floor((got / max) * 100) };
}
