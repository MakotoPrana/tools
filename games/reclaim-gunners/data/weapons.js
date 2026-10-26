/*
 * 武器のデータ (SPEC.md の「武器の一覧」)
 *   kind: gun (弾) / grenade (放物線で飛んで爆発) / flame (炎) / rocket (誘導して爆発) / magic (魔力で撃つ弾) / beam (光線)
 *   dmg は +0 のときの 1 発のダメージ。pellets は散弾の粒の数
 *   speed: 弾の速さ (px/秒)、range: 射程 (px)、spread: ばらつき (ラジアン。散弾は扇の広さ)
 *   pierce: 貫通する敵の数 (99 = 全貫通)、aoe: 爆発の半径
 *   charge: 長押しで引き絞る (最大の倍率)、spin: 撃ち始めに回す時間 (秒)
 *   mana: 魔導の魔力 (最大・1 発の消費・毎秒の回復)
 */
window.RG = window.RG || {};

RG.WEAPONS = [
  // ハンドガン
  { id: 'A1', name: 'リボルバー ルーキー', cat: 'hand', tier: 1, kind: 'gun', dmg: 14, rate: 3.5, mag: 8, reload: 1.0, elem: 'phys', speed: 440, range: 330, spread: 0.03, price: 0, basePrice: 300, desc: '初期装備。クセがない' },
  { id: 'A2', name: 'サブマシンガン ホーネット', cat: 'hand', tier: 2, kind: 'gun', dmg: 7, rate: 10, mag: 30, reload: 1.6, elem: 'phys', speed: 460, range: 300, spread: 0.12, price: 3500, desc: '連射が速い。弾が少しばらける' },
  { id: 'A3', name: '二丁拳銃 ツインファング', cat: 'hand', tier: 3, kind: 'gun', dmg: 18, rate: 6, mag: 24, reload: 1.4, elem: 'phys', speed: 470, range: 320, spread: 0.06, twin: true, price: 28000, desc: '左右から交互に撃つ。回避の直後 1 秒は連射 ×1.5' },
  { id: 'A4', name: '聖銀銃 エクソシスト', cat: 'hand', tier: 4, kind: 'gun', dmg: 55, rate: 3, mag: 8, reload: 1.0, elem: 'holy', speed: 520, range: 360, spread: 0.02, demonBonus: 1.5, demonHeal: 1, price: 180000, desc: '悪魔系に 1.5 倍。倒した悪魔から体力を 1 回復' },
  // ショットガン
  { id: 'B1', name: '狩猟用ポンプ', cat: 'shot', tier: 1, kind: 'gun', dmg: 6, pellets: 6, rate: 1.2, mag: 5, reload: 2.0, elem: 'phys', speed: 380, range: 190, spread: 0.38, knock: 60, price: 600, desc: '近距離の基本。ノックバック小' },
  { id: 'B2', name: 'ソードオフ ブルドッグ', cat: 'shot', tier: 2, kind: 'gun', dmg: 9, pellets: 8, rate: 2, mag: 2, reload: 1.3, elem: 'phys', speed: 360, range: 150, spread: 0.55, knock: 90, price: 4800, desc: '2 連射してすぐリロード。射程が短いぶん粒が多い' },
  { id: 'B3', name: 'フレシェット ヤマアラシ', cat: 'shot', tier: 3, kind: 'gun', dmg: 14, pellets: 7, rate: 1.5, mag: 6, reload: 2.2, elem: 'phys', speed: 420, range: 220, spread: 0.32, pierce: 2, knock: 40, price: 32000, desc: '針が敵を 2 体まで貫通する' },
  { id: 'B4', name: '竜息砲 ドラゴンブレス', cat: 'shot', tier: 4, kind: 'gun', dmg: 30, pellets: 8, rate: 1.3, mag: 6, reload: 2.0, elem: 'fire', speed: 380, range: 200, spread: 0.42, burn: 0.2, knock: 60, price: 220000, hardOnly: true, desc: '当たった敵を 3 秒燃やす（毎秒 威力の 20%）' },
  // 重火器
  { id: 'C1', name: '手回しガトリング', cat: 'heavy', tier: 1, kind: 'gun', dmg: 5, rate: 12, rateMin: 4, spin: 1, mag: 80, reload: 3.0, elem: 'phys', speed: 430, range: 300, spread: 0.1, price: 900, desc: '回し始めに時間がかかる' },
  { id: 'C2', name: 'グレネード ポムポム', cat: 'heavy', tier: 2, kind: 'grenade', dmg: 40, rate: 1, mag: 6, reload: 2.5, elem: 'fire', speed: 240, range: 260, spread: 0, aoe: 60, price: 5500, desc: '放物線で飛び、着弾で爆発。自分は爆発でダメージを受けない' },
  { id: 'C3', name: '火炎放射器 サラマンダー', cat: 'heavy', tier: 3, kind: 'flame', dmg: 6, rate: 10, mag: 100, reload: 2.8, elem: 'fire', speed: 230, range: 160, spread: 0.22, pierce: 99, price: 36000, desc: '射程 160px の炎。敵を貫通' },
  { id: 'C4', name: '魔導ロケット 流星', cat: 'heavy', tier: 4, kind: 'rocket', dmg: 120, rate: 0.8, mag: 4, reload: 3.0, elem: 'fire', speed: 260, range: 420, spread: 0, aoe: 80, price: 240000, desc: 'ねらいの近くの敵へ曲がって飛ぶ' },
  // 精密射撃
  { id: 'D1', name: '狩猟弓', cat: 'prec', tier: 1, kind: 'gun', dmg: 22, rate: 1.5, mag: 1, reload: 0.6, elem: 'phys', speed: 520, range: 380, spread: 0.01, charge: 2, pierce: 1, price: 500, desc: '長押しで引き絞り、最大で威力 ×2' },
  { id: 'D2', name: 'マークスマン ホークアイ', cat: 'prec', tier: 2, kind: 'gun', dmg: 45, rate: 1.2, mag: 8, reload: 2.0, elem: 'phys', speed: 700, range: 440, spread: 0.01, crit: 0.15, pierce: 2, price: 4200, desc: '会心率 +15%。2 体まで貫通' },
  { id: 'D3', name: 'クロスボウ ヴァンパイアキラー', cat: 'prec', tier: 3, kind: 'gun', dmg: 70, rate: 1, mag: 5, reload: 1.8, elem: 'phys', speed: 620, range: 420, spread: 0.01, lifesteal: 0.03, pierce: 1, price: 30000, desc: '与えたダメージの 3% だけ体力を回復' },
  { id: 'D4', name: '対魔ライフル ロンギヌス', cat: 'prec', tier: 4, kind: 'gun', dmg: 260, rate: 0.6, mag: 4, reload: 2.4, elem: 'holy', speed: 900, range: 520, spread: 0, pierce: 99, charge: 2.5, price: 250000, hardOnly: true, desc: '全貫通。長押しでチャージして威力 ×2.5' },
  // 魔導
  { id: 'E1', name: '見習いの火杖', cat: 'magic', tier: 1, kind: 'magic', dmg: 14, rate: 2, mana: [100, 8, 20], elem: 'fire', speed: 300, range: 300, spread: 0.04, aoe: 24, price: 700, desc: '火の玉。当たると小さく爆発する' },
  { id: 'E2', name: '氷の魔導書 ニヴル', cat: 'magic', tier: 2, kind: 'magic', dmg: 20, rate: 2.5, mana: [100, 10, 20], elem: 'ice', speed: 320, range: 310, spread: 0.04, slow: true, price: 5000, desc: '当たった敵を 2 秒遅くする。5 回当てると凍結' },
  { id: 'E3', name: '雷杖 トール', cat: 'magic', tier: 3, kind: 'magic', dmg: 35, rate: 2, mana: [100, 12, 22], elem: 'thunder', speed: 420, range: 320, spread: 0.03, chain: 3, price: 34000, desc: '近くの敵へ 3 回まで連鎖する' },
  { id: 'E4', name: '聖光杖 サンクタム', cat: 'magic', tier: 4, kind: 'beam', dmg: 18, rate: 10, mana: [150, 50, 25], elem: 'holy', range: 300, price: 230000, desc: '押している間ずっと出る光線。貫通' },
  // 隠し武器
  { id: 'S1', name: '魔銃 ベルゼバブ', cat: 'special', tier: 4, kind: 'gun', dmg: 90, rate: 4, mag: 12, reload: 1.5, elem: 'cycle', speed: 520, range: 360, spread: 0.03, price: 0, secret: true, desc: '撃つたびに属性が炎 → 氷 → 雷と変わる' },
  { id: 'S2', name: '星喰いの魔典', cat: 'special', tier: 4, kind: 'magic', dmg: 40, pellets: 3, rate: 3, mana: [200, 12, 40], elem: 'holy', speed: 340, range: 340, spread: 0.3, homing: true, price: 0, secret: true, desc: '3 つの使い魔が自動でねらって撃つ' },
];

RG.WEAPON = Object.fromEntries(RG.WEAPONS.map((w) => [w.id, w]));

RG.ELEMS = {
  phys: { name: '物理', color: '#e8e2d0' },
  fire: { name: '炎', color: '#ff8a3c' },
  ice: { name: '氷', color: '#8fd8ff' },
  thunder: { name: '雷', color: '#ffe45c' },
  holy: { name: '聖', color: '#fff3b0' },
};
