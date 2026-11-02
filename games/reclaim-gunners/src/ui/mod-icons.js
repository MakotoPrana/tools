// 改造のアイコン (24 × 24 の線画)。改造が変える値 (stat) ごとに 1 つ
//   iconDefs() を SVG の <defs> に入れておき、<use href="#mi-◯◯"> で描く
const I = {
  // 威力: はじける星
  dmg: '<path d="M12 2l2.4 6.2L21 9l-5 4.3L17.6 21 12 17.2 6.4 21 8 13.3 3 9l6.6-.8z"/>',
  // 連射: 重なった矢じり
  rate: '<path d="M4 6l6 6-6 6M11 6l6 6-6 6M18 6v12"/>',
  // 装弾数: 並んだ弾
  mag: '<path d="M5 9a2 2 0 014 0v11H5zM10 7a2 2 0 014 0v13h-4zM15 9a2 2 0 014 0v11h-4z"/>',
  // リロード: まわる矢印
  reload: '<path d="M20 12a8 8 0 11-2.4-5.7"/><path d="M20 3v5h-5"/>',
  // ばらつき・散らばり: 寄ってくる矢印
  spread: '<path d="M3 5l7 7-7 7M21 5l-7 7 7 7"/><path d="M12 4v16"/>',
  // 射程: 遠くへのびる矢
  range: '<path d="M3 12h16M15 7l5 5-5 5"/><path d="M3 8v8"/>',
  // 軽量化: 羽根
  movePen: '<path d="M20 4C10 4 5 10 5 19"/><path d="M20 4c0 8-5 12-11 12M9 11h6M7 15h5"/>',
  // 会心率: 照準
  crit: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  // 会心ダメージ: 剣
  critd: '<path d="M19 3l-9.5 9.5M19 3l-1 5-8 8M19 3l-5 1"/><path d="M6 13l5 5M8 16l-4 4"/>',
  // とどめ: どくろ
  execute: '<path d="M12 3a7 7 0 00-7 7c0 2.6 1.3 4 3 5v3h8v-3c1.7-1 3-2.4 3-5a7 7 0 00-7-7z"/><circle cx="9.3" cy="10.5" r="1.6" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.6" fill="currentColor"/><path d="M10 18v3M14 18v3"/>',
  // 魔巣・ボス: 王冠
  bossMul: '<path d="M3 18l1.5-10 4.5 4.5L12 5l3 7.5L19.5 8 21 18z"/><path d="M3 21h18"/>',
  // ノックバック: 押しだす衝撃
  knock: '<path d="M3 12h11M10 7l5 5-5 5"/><path d="M18 5v14M21 8v8"/>',
  // 粒の数: 散る粒
  pellets: '<circle cx="6" cy="8" r="2"/><circle cx="13" cy="5" r="2"/><circle cx="18" cy="11" r="2"/><circle cx="9" cy="15" r="2"/><circle cx="16" cy="18" r="2"/>',
  // 至近距離: 小さな的
  close: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/>',
  // 弾の速さ: 走る弾
  speed: '<path d="M11 8h6a4 4 0 010 8h-6z"/><path d="M2 9h6M4 12h5M2 15h6"/>',
  // 貫通: 板をつらぬく矢
  pierce: '<path d="M2 12h19M17 8l4 4-4 4"/><path d="M10 4v5M10 15v5"/>',
  // 燃える: 炎
  burn: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 2.8-5.3 3.6-9.3 2.1 1.6 2.7 3.7 2.6 5.5 1.3-.8 2.1-2.2 2.3-3.8 2.6 2.1 4.5 4.8 4.5 7.6 0 3.5-2.5 6.2-6.5 6.2z"/>',
  // 時間がのびる: 砂時計
  time: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
  // 凍らせる: 雪の結晶
  freezeN: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/>',
  // 遅くする: うず
  slowT: '<path d="M12 12a2 2 0 102-2 4 4 0 00-6 2 6 6 0 0010 4 8 8 0 00-4-12"/>',
  // 連鎖: いなずま
  chain: '<path d="M13 2L5 13h6l-2 9 9-12h-6z"/>',
  // 連鎖の威力: つながった輪
  chainMul: '<rect x="2.5" y="8" width="11" height="8" rx="4"/><rect x="10.5" y="8" width="11" height="8" rx="4"/>',
  // 回避のあとの連射: つむじ風
  twinBoost: '<path d="M3 8h11a3 3 0 10-3-3M3 12h15a3 3 0 11-3 3M3 16h7"/>',
  // 悪魔系: 聖なる十字
  demonBonus: '<path d="M10 2h4v6h6v4h-6v10h-4V12H4V8h6z"/>',
  // 悪魔を倒して回復: 十字のハート
  demonHeal: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 9c0 6-8 11-8 11z"/><path d="M12 9v6M9 12h6"/>',
  // 吸血: 牙
  lifesteal: '<path d="M3 5h18"/><path d="M6 5l2.5 11L11 5M13 5l2.5 11L18 5"/>',
  // 爆発の広さ: ひろがる輪
  aoe: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19"/>',
  // 回り始め: 歯車
  spin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/><circle cx="12" cy="12" r="7"/>',
  // 回り始めの連射: 計器
  rateMin: '<path d="M3 17a9 9 0 0118 0"/><path d="M12 17l5-6"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/>',
  // 曲がる力: 曲がる矢
  turn: '<path d="M4 20V12a7 7 0 017-7h7"/><path d="M14 1l4 4-4 4"/>',
  // 引き絞り: 弓
  charge: '<path d="M6 3c7 3 7 15 0 18"/><path d="M6 3v18M4 12h17M17 9l3 3-3 3"/>',
  // 弱点: ひび割れた盾
  weakMul: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 6l-2 5 4 2-2 5"/>',
  // 魔力の最大: 小びん
  manaMax: '<path d="M9 3h6M10 3v5L5 17a3 3 0 002.6 4h8.8A3 3 0 0019 17l-5-9V3"/><path d="M7 15h10"/>',
  // 魔力の回復: しずく
  manaRegen: '<path d="M12 3s-6 7-6 11a6 6 0 0012 0c0-4-6-11-6-11z"/><path d="M12 11v6M9 14h6"/>',
  // 消費する魔力: 結晶
  manaCost: '<path d="M12 2l7 7-7 13-7-13z"/><path d="M5 9h14M9 9l3 13 3-13"/>',
  // 不明
  _: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 115 0c0 2-2.5 2-2.5 4M12 17v.5"/>',
};
// 同じ絵を使う値
const SAME = { burnT: 'time', freezeT: 'time', twinT: 'time', chargeT: 'time', mana: 'manaMax' };

export const modIconId = (stat) => 'mi-' + (I[stat] ? stat : SAME[stat] || '_');

export function iconDefs() {
  return Object.entries(I).map(([k, d]) => `<symbol id="mi-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('');
}
