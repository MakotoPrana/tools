/*
 * 主人公・武器カテゴリ・能力ボードのデータ (SPEC.md の「主人公」「お金と能力ボード」)
 */
window.RG = window.RG || {};

RG.CATS = {
  hand: { name: 'ハンドガン', desc: '軽い・リロードが速い・移動しながら撃ちやすい' },
  shot: { name: 'ショットガン', desc: '近距離で強い。散弾・ノックバック' },
  heavy: { name: '重火器', desc: '撃っている間は移動速度 −25%。高火力・範囲攻撃' },
  prec: { name: '精密射撃', desc: '遠距離・貫通・会心が出やすい。連射は遅い' },
  magic: { name: '魔導', desc: '属性攻撃・特殊効果。弾のかわりに魔力（自然に回復）' },
  special: { name: '特殊', desc: '誰でも装備できる' },
};

RG.HEROES = [
  {
    id: 'kai',
    name: 'カイ',
    title: '元騎士の銃士',
    desc: '滅んだ騎士団の生き残り。銃を手にした元騎士。まっすぐな性格。',
    hp: 100,
    speed: 100,
    cats: ['hand', 'shot', 'prec'],
    dodge: 'roll',
    dodgeName: 'ローリング',
    dodgeDesc: '無敵 0.3 秒・クールダウン 1.2 秒',
    dodgeCd: 1.2,
    trait: '会心率 +5%。会心が出ると、次のリロードが一瞬で終わる',
    color: '#4a7fd4',
    accent: '#e8c46a',
  },
  {
    id: 'mira',
    name: 'ミラ',
    title: '魔導銃の天才',
    desc: '魔導学院の落ちこぼれ。杖を銃に改造した天才肌。',
    hp: 80,
    speed: 105,
    cats: ['hand', 'prec', 'magic'],
    dodge: 'blink',
    dodgeName: 'ブリンク',
    dodgeDesc: '前方 120px へ瞬間移動・クールダウン 2 秒',
    dodgeCd: 2,
    trait: '属性ダメージ +15%。素材のドロップ率 +20%',
    color: '#a35ad8',
    accent: '#7fe3ff',
  },
  {
    id: 'gald',
    name: 'ガルド',
    title: '大男の傭兵',
    desc: '各地を渡り歩く大男の傭兵。悪魔に故郷を焼かれた。',
    hp: 140,
    speed: 90,
    cats: ['hand', 'shot', 'heavy'],
    dodge: 'tackle',
    dodgeName: 'タックル',
    dodgeDesc: '突進して敵を押しのける。被ダメージ −70%・クールダウン 1.5 秒',
    dodgeCd: 1.5,
    trait: '受けるダメージ −10%。体力が 30% 以下のとき攻撃力 +25%',
    color: '#c9623a',
    accent: '#d9d2c0',
  },
];

// 能力ボード。ランクを 1 上げるのに必要なお金 = base × (次のランク) ^ 1.5 (切り上げ)
// max はヒーローごとに上書きできる (maxBy)
RG.BOARD = [
  { id: 'hp', name: '最大体力', max: 40, base: 20, fx: (r, h) => `+${r * (h === 'gald' ? 12 : 8)}` },
  { id: 'atk', name: '攻撃力', max: 40, base: 25, fx: (r) => RG.t('与えるダメージ +{v}%', { v: r * 4 }) },
  { id: 'def', name: '防御', max: 30, base: 25, fx: (r) => RG.t('受けるダメージ −{v}%', { v: (r * 1.5).toFixed(1) }) },
  { id: 'spd', name: '移動速度', max: 20, maxBy: { gald: 15 }, base: 30, fx: (r) => `+${(r * 1.5).toFixed(1)}%` },
  { id: 'rel', name: 'リロード速度', max: 20, base: 20, fx: (r) => RG.t('リロード時間 −{v}%', { v: (r * 2.5).toFixed(1) }) },
  { id: 'crit', name: '会心率', max: 30, base: 30, fx: (r) => `+${r}%` },
  { id: 'critd', name: '会心ダメージ', max: 30, base: 30, fx: (r) => `×${(1.5 + r * 0.05).toFixed(2)}` },
  { id: 'dodge', name: '回避クールダウン', max: 15, base: 30, fx: (r) => `−${r * 3}%` },
  { id: 'sp', name: '必殺技チャージ', max: 25, base: 35, fx: (r) => RG.t('ゲージのたまり方 +{v}%', { v: r * 4 }) },
  { id: 'gold', name: '金運', max: 25, base: 25, fx: (r) => RG.t('獲得するお金 +{v}%', { v: r * 3 }) },
  { id: 'mat', name: '素材運', max: 25, base: 25, fx: (r) => RG.t('素材のドロップ率 +{v}%', { v: r * 3 }) },
  { id: 'pot', name: '回復薬の所持数', max: 3, base: 400, fx: (r) => RG.t('{v} 個', { v: 3 + r }) },
];

// 能力ボードの形 (スフィア盤): まん中から 6 本の腕がのび、とちゅうで 2 本の枝に分かれる。となりの腕どうしは輪でつながる
//   ノード 1 つ = その能力 +2 ランク (回復薬は +1)。解放できるのは、解放ずみのノードとつながっているノードだけ
//   ノードの値段 = その能力の、上がるランクぶんの値段の合計 (ランクが上がるほど高い)。能力が最大なら 0 G (道としてだけ使う)
//   ab: ノードの中に書く 1 文字
RG.BOARD_AB = { hp: '体', atk: '攻', def: '防', spd: '速', rel: '装', crit: '会', critd: '撃', dodge: '避', sp: '必', gold: '金', mat: '素', pot: '薬' };
RG.GRID = (() => {
  const STEP = 34;
  // 腕: 名前・幹 (まん中に近い 4 つ)・左の枝・右の枝 [能力, ノードの数]
  const ARMS = [
    { name: '力', trunk: ['atk', 'crit', 'atk', 'crit'], left: ['atk', 18], right: ['crit', 13] },
    { name: '技', trunk: ['rel', 'critd', 'rel', 'critd'], left: ['rel', 8], right: ['critd', 13] },
    { name: '魔', trunk: ['sp', 'pot', 'sp', 'sp'], left: ['sp', 10], right: ['pot', 2] },
    { name: '運', trunk: ['gold', 'mat', 'gold', 'mat'], left: ['gold', 11], right: ['mat', 11] },
    { name: '疾', trunk: ['spd', 'dodge', 'spd', 'dodge'], left: ['spd', 8], right: ['dodge', 6] },
    { name: '守', trunk: ['hp', 'def', 'hp', 'def'], left: ['hp', 18], right: ['def', 13] },
  ];
  const nodes = [{ id: 'c', x: 0, y: 0, stat: null, v: 0 }];
  const links = [];
  const val = (st) => (st === 'pot' ? 1 : 2);
  ARMS.forEach((arm, i) => {
    const th = -Math.PI / 2 + (i / ARMS.length) * Math.PI * 2;
    let prev = 'c';
    arm.trunk.forEach((st, k) => {
      const id = `a${i}t${k}`;
      nodes.push({ id, x: Math.cos(th) * STEP * (k + 1), y: Math.sin(th) * STEP * (k + 1), stat: st, v: val(st), arm: i });
      links.push([prev, id]);
      prev = id;
    });
    const ex = Math.cos(th) * STEP * arm.trunk.length;
    const ey = Math.sin(th) * STEP * arm.trunk.length;
    for (const [side, [st, n], da] of [['l', arm.left, -0.3], ['r', arm.right, 0.3]]) {
      let p2 = prev;
      for (let j = 0; j < n; j++) {
        const id = `a${i}${side}${j}`;
        // 枝は少しずつ外へ曲がる
        const a = th + da * (1 + j * 0.035);
        nodes.push({ id, x: ex + Math.cos(a) * STEP * (j + 1), y: ey + Math.sin(a) * STEP * (j + 1), stat: st, v: val(st), arm: i });
        links.push([p2, id]);
        p2 = id;
      }
    }
  });
  // 輪: となりの腕の幹 2 つ目どうし・枝の 4 つ目どうし (右の枝 → となりの腕の左の枝)
  const has = (id) => nodes.some((n) => n.id === id);
  ARMS.forEach((arm, i) => {
    const j = (i + 1) % ARMS.length;
    links.push([`a${i}t1`, `a${j}t1`]);
    const r = `a${i}r${Math.min(3, arm.right[1] - 1)}`;
    const l = `a${j}l${Math.min(3, ARMS[j].left[1] - 1)}`;
    if (has(r) && has(l)) links.push([r, l]);
  });
  return { nodes, links, arms: ARMS.map((a) => a.name) };
})();

// 武器スロット (最初は 2 つ。4 回開けて最大 6 つ)
RG.SLOTS = [
  { cost: 1500, cond: null },
  { cost: 12000, cond: { gates: 2 }, condText: '境界の守護者を 2 体倒す' },
  { cost: 60000, cond: { gates: 5 }, condText: '境界の守護者を 5 体倒す' },
  { cost: 200000, cond: { nushi: 3 }, condText: 'ヌシを 3 体倒す' },
];
