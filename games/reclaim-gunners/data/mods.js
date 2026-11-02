/*
 * 武器の改造 (スキルツリー)。SPEC.md の「武器の改造」
 *   どの武器にも、カテゴリごとの基礎の 4 つ (RG.MOD_BASE) と、その武器だけの 3〜4 つ (RG.MOD_UNIQUE) がある。どれも Lv10 まで
 *   stat: 変える値 / per: 1 Lv あたりの量
 *   mode: mul (もとの値 × (1 + per × Lv)) / add (もとの値 + per × Lv) / step (Lv が step 上がるごとに + per)
 *   show: 説明の {v} の出し方 (pct: per × Lv × 100 の % / num: そのまま / sec: 秒)
 *   req: [前の改造の id, 必要な Lv]。ツリーの枝。基礎の改造は最初から上げられる
 *   cost: 値段の倍率 (武器だけの改造は高め)
 */
window.RG = window.RG || {};

RG.MOD_MAX = 10;

(() => {

// 改造の値を持たない武器のときに使う、もとの値
RG.MOD_DEFAULTS = {
  knock: 15, crit: 0, critd: 0, bossMul: 0, execute: 0, close: 0, burn: 0, burnT: 3, slowT: 2, freezeN: 5, freezeT: 1.5,
  chain: 0, chainMul: 0.8, chargeT: 0.8, twinBoost: 1.5, twinT: 1, weakMul: 1.5, movePen: 0.25, turn: 5, demonBonus: 1,
  demonHeal: 0, lifesteal: 0, pierce: 0, aoe: 0, pellets: 1,
};

const M = (id, name, stat, per, mode, desc, o = {}) => ({ id, name, stat, per, mode, desc, show: 'pct', cost: 1, ...o });

// 基礎の改造 (カテゴリごと)
RG.MOD_BASE = {
  hand: [
    M('dmg', '威力', 'dmg', 0.06, 'mul', '威力 +{v}%'),
    M('rate', '連射', 'rate', 0.04, 'mul', '連射 +{v}%'),
    M('mag', '装弾数', 'mag', 0.08, 'mul', '装弾数 +{v}%'),
    M('reload', 'リロード', 'reload', -0.04, 'mul', 'リロード時間 −{v}%'),
  ],
  shot: [
    M('dmg', '威力', 'dmg', 0.06, 'mul', '威力 +{v}%'),
    M('spread', '絞り', 'spread', -0.04, 'mul', '散らばり −{v}%'),
    M('reload', 'リロード', 'reload', -0.04, 'mul', 'リロード時間 −{v}%'),
    M('range', '射程', 'range', 0.03, 'mul', '射程 +{v}%'),
  ],
  heavy: [
    M('dmg', '威力', 'dmg', 0.06, 'mul', '威力 +{v}%'),
    M('mag', '装弾数', 'mag', 0.08, 'mul', '装弾数 +{v}%'),
    M('reload', 'リロード', 'reload', -0.04, 'mul', 'リロード時間 −{v}%'),
    M('move', '軽量化', 'movePen', -0.02, 'add', '撃っている間の減速 −{v}%'),
  ],
  prec: [
    M('dmg', '威力', 'dmg', 0.06, 'mul', '威力 +{v}%'),
    M('crit', '照準器', 'crit', 0.015, 'add', '会心率 +{v}%'),
    M('reload', 'リロード', 'reload', -0.04, 'mul', 'リロード時間 −{v}%'),
    M('range', '射程', 'range', 0.03, 'mul', '射程 +{v}%'),
  ],
  magic: [
    M('dmg', '威力', 'dmg', 0.06, 'mul', '威力 +{v}%'),
    M('manaMax', '魔力の器', 'manaMax', 0.06, 'mul', '魔力の最大 +{v}%'),
    M('manaRegen', '魔力の泉', 'manaRegen', 0.06, 'mul', '魔力の回復 +{v}%'),
    M('manaCost', '省魔力', 'manaCost', -0.03, 'mul', '消費する魔力 −{v}%'),
  ],
  special: [
    M('dmg', '威力', 'dmg', 0.05, 'mul', '威力 +{v}%'),
    M('rate', '連射', 'rate', 0.03, 'mul', '連射 +{v}%'),
    M('crit', '魔性', 'crit', 0.01, 'add', '会心率 +{v}%'),
    M('range', '射程', 'range', 0.03, 'mul', '射程 +{v}%'),
  ],
};

// 武器だけの改造。cost は 1.5 (高め)
const U = (id, name, stat, per, mode, desc, req, o = {}) => M(id, name, stat, per, mode, desc, { req, cost: 1.5, ...o });
const PIERCE = (req) => U('pierce', '貫通弾', 'pierce', 1, 'step', '貫通 +{v}（Lv5・Lv10 で +1）', req, { step: 5, show: 'num' });

RG.MOD_UNIQUE = {
  A1: [
    U('acc', '精度', 'spread', -0.08, 'mul', '弾のばらつき −{v}%', ['dmg', 3]),
    U('vital', '急所撃ち', 'crit', 0.015, 'add', '会心率 +{v}%', ['rate', 3]),
    U('critd', '会心の一撃', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['vital', 5]),
  ],
  A2: [
    U('recoil', '反動制御', 'spread', -0.06, 'mul', '弾のばらつき −{v}%', ['rate', 3]),
    U('velo', '高速弾', 'speed', 0.04, 'mul', '弾の速さ +{v}%', ['dmg', 3]),
    U('sting', '蜂の一刺し', 'crit', 0.01, 'add', '会心率 +{v}%', ['recoil', 5]),
    U('burn', '巣焼き', 'bossMul', 0.04, 'add', '魔巣・ボスへのダメージ +{v}%', ['velo', 5]),
  ],
  A3: [
    U('dance', '銃舞', 'twinBoost', 0.06, 'add', '回避のあとの連射 +{v}%', ['rate', 3]),
    U('linger', '余韻', 'twinT', 0.1, 'add', '回避のあとの連射が続く時間 +{v} 秒', ['dance', 5], { show: 'sec' }),
    U('fang', '牙', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['dmg', 3]),
    U('eye', '狩人の眼', 'crit', 0.01, 'add', '会心率 +{v}%', ['fang', 5]),
  ],
  A4: [
    U('bless', '聖別', 'demonBonus', 0.05, 'add', '悪魔系へのダメージ +{v}%', ['dmg', 3]),
    U('purge', '浄化', 'demonHeal', 0.3, 'add', '悪魔を倒したときの回復 +{v}', ['bless', 5], { show: 'num' }),
    PIERCE(['rate', 3]),
    U('judge', '断罪', 'execute', 0.05, 'add', '体力が 30% 以下の敵へのダメージ +{v}%', ['pierce', 5]),
  ],
  B1: [
    U('slug', 'スラッグ', 'knock', 0.1, 'mul', 'ノックバック +{v}%', ['dmg', 3]),
    U('buck', '鹿撃ち弾', 'pellets', 1, 'step', '粒の数 +{v}（Lv4・Lv8 で +1）', ['spread', 3], { step: 4, show: 'num' }),
    U('close', '至近距離', 'close', 0.05, 'add', '近く (70px まで) の敵へのダメージ +{v}%', ['slug', 5]),
  ],
  B2: [
    U('impact', '二連の衝撃', 'knock', 0.12, 'mul', 'ノックバック +{v}%', ['dmg', 3]),
    U('close', '至近距離', 'close', 0.05, 'add', '近く (70px まで) の敵へのダメージ +{v}%', ['range', 3]),
    U('vital', '急所', 'crit', 0.015, 'add', '会心率 +{v}%', ['close', 5]),
  ],
  B3: [
    PIERCE(['dmg', 3]),
    U('sharp', '鋭い針', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['spread', 3]),
    U('rain', '針の雨', 'pellets', 1, 'step', '粒の数 +{v}（Lv4・Lv8 で +1）', ['pierce', 5], { step: 4, show: 'num' }),
  ],
  B4: [
    U('inferno', '業火', 'burn', 0.03, 'add', '燃えるダメージ +{v}%（毎秒 威力に対して）', ['dmg', 3]),
    U('long', '燃えつき', 'burnT', 0.3, 'add', '燃える時間 +{v} 秒', ['inferno', 5], { show: 'sec' }),
    U('roar', '竜の咆哮', 'knock', 0.1, 'mul', 'ノックバック +{v}%', ['range', 3]),
  ],
  C1: [
    U('oil', '潤滑', 'spin', -0.07, 'mul', '回り始めの時間 −{v}%', ['dmg', 3]),
    U('idle', '回転維持', 'rateMin', 0.08, 'mul', '回り始めの連射 +{v}%', ['oil', 5]),
    PIERCE(['mag', 3]),
    U('sweep', '掃射', 'spread', -0.05, 'mul', '弾のばらつき −{v}%', ['reload', 3]),
  ],
  C2: [
    U('blast', '大型炸薬', 'aoe', 0.05, 'mul', '爆発の広さ +{v}%', ['dmg', 3]),
    U('napalm', '焼夷弾', 'burn', 0.02, 'add', '当たった敵を燃やす（毎秒 威力の {v}%）', ['blast', 5]),
    U('barrel', '長砲身', 'speed', 0.05, 'mul', '弾の速さ +{v}%', ['reload', 3]),
    U('siege', '破城', 'bossMul', 0.05, 'add', '魔巣・ボスへのダメージ +{v}%', ['barrel', 5]),
  ],
  C3: [
    U('nozzle', '高圧ノズル', 'range', 0.04, 'mul', '射程 +{v}%', ['dmg', 3]),
    U('sticky', '粘る炎', 'burn', 0.02, 'add', '当たった敵を燃やす（毎秒 威力の {v}%）', ['mag', 3]),
    U('long', '燃焼時間', 'burnT', 0.3, 'add', '燃える時間 +{v} 秒', ['sticky', 5], { show: 'sec' }),
  ],
  C4: [
    U('blast', '大爆発', 'aoe', 0.05, 'mul', '爆発の広さ +{v}%', ['dmg', 3]),
    U('seek', '追尾', 'turn', 0.08, 'mul', '曲がる力 +{v}%', ['reload', 3]),
    U('siege', '破城', 'bossMul', 0.05, 'add', '魔巣・ボスへのダメージ +{v}%', ['blast', 5]),
    U('war', '徹甲弾頭', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['seek', 5]),
  ],
  D1: [
    U('strong', '強弓', 'charge', 0.1, 'add', '引き絞ったときの威力 +{v} 倍', ['dmg', 3], { show: 'num' }),
    U('quick', '速引き', 'chargeT', -0.05, 'mul', '引き絞る時間 −{v}%', ['reload', 3]),
    PIERCE(['strong', 5]),
    U('vital', '急所', 'crit', 0.015, 'add', '会心率 +{v}%', ['quick', 5]),
  ],
  D2: [
    U('hawk', '鷹の目', 'critd', 0.06, 'add', '会心ダメージ +{v}%', ['crit', 3]),
    PIERCE(['dmg', 3]),
    U('velo', '高速弾', 'speed', 0.04, 'mul', '弾の速さ +{v}%', ['range', 3]),
    U('finish', 'とどめ', 'execute', 0.05, 'add', '体力が 30% 以下の敵へのダメージ +{v}%', ['hawk', 5]),
  ],
  D3: [
    U('drain', '吸血', 'lifesteal', 0.003, 'add', '与えたダメージの回復 +{v}%', ['dmg', 3]),
    U('silver', '銀の矢', 'demonBonus', 0.05, 'add', '悪魔系へのダメージ +{v}%', ['crit', 3]),
    U('stake', '杭打ち', 'knock', 0.1, 'mul', 'ノックバック +{v}%', ['reload', 3]),
    U('vital', '急所', 'crit', 0.015, 'add', '会心率 +{v}%', ['drain', 5]),
  ],
  D4: [
    U('spear', '神槍', 'charge', 0.15, 'add', 'チャージしたときの威力 +{v} 倍', ['dmg', 3], { show: 'num' }),
    U('quick', '速充填', 'chargeT', -0.05, 'mul', 'チャージの時間 −{v}%', ['reload', 3]),
    U('holy', '対魔', 'demonBonus', 0.05, 'add', '悪魔系へのダメージ +{v}%', ['spear', 5]),
    U('siege', '破城', 'bossMul', 0.05, 'add', '魔巣・ボスへのダメージ +{v}%', ['quick', 5]),
  ],
  E1: [
    U('big', '大火球', 'aoe', 0.06, 'mul', '爆発の広さ +{v}%', ['dmg', 3]),
    U('burn', '燃焼', 'burn', 0.02, 'add', '当たった敵を燃やす（毎秒 威力の {v}%）', ['big', 5]),
    U('velo', '火の矢', 'speed', 0.04, 'mul', '弾の速さ +{v}%', ['manaCost', 3]),
    U('chant', '詠唱短縮', 'rate', 0.04, 'mul', '連射 +{v}%', ['manaRegen', 3]),
  ],
  E2: [
    U('freeze', '凍結', 'freezeN', -1, 'step', '凍らせるのに必要な回数 −{v}（Lv5・Lv10 で −1）', ['dmg', 3], { step: 5, show: 'num' }),
    U('perma', '永久凍土', 'freezeT', 0.1, 'add', '凍っている時間 +{v} 秒', ['freeze', 5], { show: 'sec' }),
    U('chill', '冷気', 'slowT', 0.2, 'add', '遅くする時間 +{v} 秒', ['manaCost', 3], { show: 'sec' }),
    PIERCE(['chill', 5]),
  ],
  E3: [
    U('chain', '連鎖', 'chain', 1, 'step', '連鎖の回数 +{v}（Lv4・Lv8 で +1）', ['dmg', 3], { step: 4, show: 'num' }),
    U('keep', '減衰抑制', 'chainMul', 0.02, 'add', '連鎖のたびの威力 +{v}%', ['chain', 5]),
    U('velo', '雷速', 'speed', 0.04, 'mul', '弾の速さ +{v}%', ['manaRegen', 3]),
    U('surge', '過電流', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['velo', 5]),
  ],
  E4: [
    U('lumen', '光量', 'rate', 0.04, 'mul', '光線の当たる回数 +{v}%', ['dmg', 3]),
    U('reach', '長い光', 'range', 0.04, 'mul', '光線の長さ +{v}%', ['manaMax', 3]),
    U('holy', '対魔', 'demonBonus', 0.05, 'add', '悪魔系へのダメージ +{v}%', ['lumen', 5]),
    U('siege', '破城', 'bossMul', 0.05, 'add', '魔巣・ボスへのダメージ +{v}%', ['reach', 5]),
  ],
  S1: [
    U('weak', '弱点突き', 'weakMul', 0.05, 'add', '弱点の属性で当てたときのダメージ +{v}%', ['dmg', 3]),
    PIERCE(['rate', 3]),
    U('glut', '暴食', 'lifesteal', 0.003, 'add', '与えたダメージの回復 +{v}%', ['weak', 5]),
    U('critd', '魔弾', 'critd', 0.05, 'add', '会心ダメージ +{v}%', ['pierce', 5]),
  ],
  S2: [
    U('fam', '使い魔', 'pellets', 1, 'step', '使い魔の数 +{v}（Lv5・Lv10 で +1）', ['dmg', 3], { step: 5, show: 'num' }),
    U('seek', '星の導き', 'turn', 0.08, 'mul', '曲がる力 +{v}%', ['range', 3]),
    U('weak', '弱点突き', 'weakMul', 0.05, 'add', '弱点の属性で当てたときのダメージ +{v}%', ['fam', 5]),
    U('siege', '星喰い', 'bossMul', 0.05, 'add', '魔巣・ボスへのダメージ +{v}%', ['seek', 5]),
  ],
};

// ---------- 迷路のツリー ----------
//   改造は 9 × 5 のマスに並ぶ。まん中のマス (核) から、迷路の通り道でつながる
//   核のとなり 4 つが基礎の改造。固有の改造は迷路の奥。ほかのマスは「通路」(小さな強化。Lv2 まで)
//   行き止まりのマスは「秘宝」(Lv3 まで。基礎の改造と同じ強さ)
//   上げられる改造 = Lv が 1 以上か、となりに「通れる」改造があるもの
//   通れる = 核 / その改造の Lv が gate 以上 (基礎 Lv3・固有 Lv5・通路と秘宝 Lv1)
//   マスの並びは武器の id から決まる (いつも同じ迷路になる)
RG.MOD_GRID = { w: 9, h: 5 };
const KIND = {
  base: { max: 10, gate: 3 },
  uniq: { max: 10, gate: 5 },
  minor: { max: 2, gate: 1, mul: 0.5, cost: 0.5 },
  treasure: { max: 3, gate: 1, mul: 1, cost: 0.9 },
};
RG.MOD_KIND = KIND;

const rngOf = (str) => {
  let a = 2166136261;
  for (const ch of str) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

function buildTree(w) {
  const { w: GW, h: GH } = RG.MOD_GRID;
  const rng = rngOf('tree:' + w.id);
  const ri = (n) => Math.floor(rng() * n);
  const key = (x, y) => y * GW + x;
  const RX = (GW - 1) >> 1;
  const RY = (GH - 1) >> 1;
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const near = (k) => dirs.map(([dx, dy]) => [(k % GW) + dx, ((k / GW) | 0) + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < GW && y < GH).map(([x, y]) => key(x, y));
  const root = key(RX, RY);
  const bases = dirs.map(([dx, dy]) => key(RX + dx, RY + dy));
  // 穴 (マスのない所)。残りがひとつながりになるまで選び直す
  let holes;
  for (let tries = 0; tries < 50; tries++) {
    holes = new Set();
    while (holes.size < 5) {
      const k = ri(GW * GH);
      if (k !== root && !bases.includes(k)) holes.add(k);
    }
    const seen = new Set([root]);
    const q = [root];
    while (q.length) for (const n of near(q.pop())) if (!holes.has(n) && !seen.has(n)) seen.add(n), q.push(n);
    if (seen.size === GW * GH - holes.size) break;
  }
  // 迷路を掘る (核 → 基礎 4 つ → そこから枝分かれ。新しいマスから掘り進むことが多いので、長い通路になる)
  const edges = new Set();
  const ek = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const visited = new Set([root, ...bases]);
  for (const b of bases) edges.add(ek(root, b));
  const parent = { [root]: null };
  for (const b of bases) parent[b] = root;
  const active = [...bases];
  while (active.length) {
    const i = rng() < 0.75 ? active.length - 1 : ri(active.length);
    const c = active[i];
    const opts = near(c).filter((n) => !holes.has(n) && !visited.has(n));
    if (!opts.length) {
      active.splice(i, 1);
      continue;
    }
    const n = opts[ri(opts.length)];
    visited.add(n);
    edges.add(ek(c, n));
    parent[n] = c;
    active.push(n);
  }
  // 抜け道を少しだけ足す (迷路に輪をつくる。核と基礎のまわりには足さない)
  const cand = [];
  for (const a of visited) {
    for (const b of near(a)) {
      if (b < a || !visited.has(b) || edges.has(ek(a, b))) continue;
      if ([a, b].some((k) => k === root || bases.includes(k))) continue;
      cand.push(ek(a, b));
    }
  }
  for (let n = 0; n < 3 && cand.length; n++) edges.add(cand.splice(ri(cand.length), 1)[0]);
  const adjK = {};
  for (const k of visited) adjK[k] = [];
  for (const e of edges) {
    const [a, b] = e.split('-').map(Number);
    adjK[a].push(b);
    adjK[b].push(a);
  }
  // 核からの道のり
  const depth = { [root]: 0 };
  const q = [root];
  for (let h = 0; h < q.length; h++) for (const n of adjK[q[h]]) if (depth[n] == null) depth[n] = depth[q[h]] + 1, q.push(n);
  const maxD = Math.max(...Object.values(depth));
  // 固有の改造を迷路の奥へ (前の改造が固有なら、もっと奥へ)。ほかの固有とはなるべく離す
  const uniq = RG.MOD_UNIQUE[w.id] || [];
  const byU = Object.fromEntries(uniq.map((m) => [m.id, m]));
  const tier = (m) => (m.req && byU[m.req[0]] ? 1 + tier(byU[m.req[0]]) : 1);
  const order = uniq.slice().sort((a, b) => tier(b) - tier(a));
  const place = {};
  const used = new Set([root, ...bases]);
  const md = (a, b) => Math.abs((a % GW) - (b % GW)) + Math.abs(((a / GW) | 0) - ((b / GW) | 0));
  for (const m of order) {
    const t = tier(m);
    const target = t >= 2 ? maxD : Math.max(3, Math.round(maxD * 0.55));
    let best = null;
    let bs = -1e9;
    for (const k of visited) {
      if (used.has(k)) continue;
      let s = -Math.abs(depth[k] - target) + (adjK[k].length === 1 ? 0.6 : 0) + rng() * 0.4;
      for (const u of Object.values(place)) {
        const d = md(k, u);
        if (d <= 1) s -= 5;
        else if (d === 2) s -= 1.5;
      }
      if (s > bs) bs = s, best = k;
    }
    place[m.id] = best;
    used.add(best);
  }
  // マスに改造を入れる
  const baseMods = RG.MOD_BASE[w.cat];
  const pool = (list) => list.filter((m) => m.mode !== 'step');
  const nodeAt = {};
  const mk = (src, kind, k, extra = {}) => {
    const n = Object.create(src);
    Object.assign(n, { kind, x: k % GW, y: (k / GW) | 0, max: KIND[kind].max, gate: KIND[kind].gate, req: null }, extra);
    nodeAt[k] = n;
    return n;
  };
  mk({ id: 'core', get name() { return w.name; }, desc: '', stat: null }, 'base', root, { kind: 'root', max: 0, gate: 0 });
  baseMods.forEach((m, i) => mk(m, 'base', bases[i]));
  for (const m of uniq) mk(m, 'uniq', place[m.id]);
  const minorPool = pool(baseMods);
  const treasurePool = pool([...baseMods, ...uniq]);
  for (const k of visited) {
    if (nodeAt[k]) continue;
    const leaf = adjK[k].length === 1;
    const kind = leaf ? 'treasure' : 'minor';
    const src = leaf ? treasurePool[ri(treasurePool.length)] : minorPool[ri(minorPool.length)];
    mk(src, kind, k, { id: `n${k % GW}${(k / GW) | 0}`, per: src.per * KIND[kind].mul, cost: KIND[kind].cost, src });
  }
  const nodes = Object.values(nodeAt);
  const adj = {};
  for (const k of visited) adj[nodeAt[k].id] = adjK[k].map((n) => nodeAt[n]);
  const links = [...edges].map((e) => e.split('-').map((k) => nodeAt[k]));
  return { nodes, adj, links, holes: Array.from({ length: GW * GH }, (_, k) => k).filter((k) => !visited.has(k)).map((k) => [k % GW, (k / GW) | 0]), root: nodeAt[root], byId: Object.fromEntries(nodes.map((n) => [n.id, n])) };
}

const trees = {};
RG.modTree = (w) => trees[w.id] || (trees[w.id] = buildTree(w));
// その武器の改造の一覧 (核をのぞく、ツリーのすべてのマス)
RG.modsOf = (w) => RG.modTree(w).nodes.filter((n) => n.kind !== 'root');
// ★ に数える改造 (基礎と固有。通路と秘宝は数えない)
RG.modMajor = (m) => m.kind === 'base' || m.kind === 'uniq';
})();
