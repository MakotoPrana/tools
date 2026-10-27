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

// その武器の改造の一覧 (基礎 → 固有の順)
RG.modsOf = (w) => [...RG.MOD_BASE[w.cat], ...(RG.MOD_UNIQUE[w.id] || [])];
})();
