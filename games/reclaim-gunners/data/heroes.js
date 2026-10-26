/*
 * 主人公・武器カテゴリ・能力ボードのデータ (SPEC.md の「主人公」「経験値と能力ボード」)
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

// 能力ボード。ランクを 1 上げるのに必要な経験値 = base × (次のランク) ^ 1.5 (切り上げ)
// max はヒーローごとに上書きできる (maxBy)
RG.BOARD = [
  { id: 'hp', name: '最大体力', max: 40, base: 20, fx: (r, h) => `+${r * (h === 'gald' ? 12 : 8)}` },
  { id: 'atk', name: '攻撃力', max: 40, base: 25, fx: (r) => `与えるダメージ +${r * 4}%` },
  { id: 'def', name: '防御', max: 30, base: 25, fx: (r) => `受けるダメージ −${(r * 1.5).toFixed(1)}%` },
  { id: 'spd', name: '移動速度', max: 20, maxBy: { gald: 15 }, base: 30, fx: (r) => `+${(r * 1.5).toFixed(1)}%` },
  { id: 'rel', name: 'リロード速度', max: 20, base: 20, fx: (r) => `リロード時間 −${(r * 2.5).toFixed(1)}%` },
  { id: 'crit', name: '会心率', max: 30, base: 30, fx: (r) => `+${r}%` },
  { id: 'critd', name: '会心ダメージ', max: 30, base: 30, fx: (r) => `×${(1.5 + r * 0.05).toFixed(2)}` },
  { id: 'dodge', name: '回避クールダウン', max: 15, base: 30, fx: (r) => `−${r * 3}%` },
  { id: 'gold', name: '金運', max: 25, base: 25, fx: (r) => `獲得するお金 +${r * 3}%` },
  { id: 'mat', name: '素材運', max: 25, base: 25, fx: (r) => `素材のドロップ率 +${r * 3}%` },
  { id: 'pot', name: '回復薬の所持数', max: 3, base: 400, fx: (r) => `${3 + r} 個` },
];

// 武器スロット (最初は 2 つ。4 回開けて最大 6 つ)
RG.SLOTS = [
  { exp: 1500, cond: null },
  { exp: 12000, cond: { gates: 2 }, condText: '境界の守護者を 2 体倒す' },
  { exp: 60000, cond: { gates: 5 }, condText: '境界の守護者を 5 体倒す' },
  { exp: 200000, cond: { nushi: 3 }, condText: 'ヌシを 3 体倒す' },
];
