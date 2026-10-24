/*
 * デモン・インベージョン: 兵種のデータ
 *   自軍 (team 0) と敵軍 (team 1) の兵士。数値の意味は script.js の兵士の処理を参照。
 *     hp: 体力 / r: 当たりの半径 / speed: 移動速度 (px/秒)
 *     melee: 近接攻撃なら true / range: 射程 (px) / aggro: 敵に気づいて向かっていく距離
 *     dmg: 1回のダメージ / rof: 攻撃の間隔 (秒) / spread: 弾のぶれ (ラジアン) / bulletSpeed: 弾の速さ
 *     xp: 倒したときの経験値 (魂の灯)
 */
(() => {
  'use strict';

  const UNITS = {
    // ---------------- 自軍 ----------------
    infantry: {
      team: 0, name: '歩兵', en: { name: 'Infantry' },
      hp: 100, r: 10, speed: 70, range: 300, aggro: 330, dmg: 8, rof: 0.6, spread: 0.07, bulletSpeed: 760,
      color: '#4f7fd6', dark: '#24406e',
    },
    heavy: {
      team: 0, name: '重装兵', en: { name: 'Heavy' },
      hp: 150, r: 12, speed: 50, range: 220, aggro: 260, dmg: 6, rof: 0.9, spread: 0.06, bulletSpeed: 700,
      shield: 0.6, // 前からの攻撃を 60% 防ぐ
      color: '#3e6fb8', dark: '#1d3560',
    },
    medic: {
      team: 0, name: '衛生兵', en: { name: 'Medic' },
      hp: 90, r: 10, speed: 66, range: 220, aggro: 240, dmg: 6, rof: 0.9, spread: 0.08, bulletSpeed: 700,
      heal: 5, healRange: 130, // 近くの一番弱っている味方を 1 秒に 5 回復する
      color: '#e9eef5', dark: '#5b6b80',
    },

    // ---------------- 敵軍 ----------------
    imp: {
      team: 1, name: 'インプ', en: { name: 'Imp' },
      hp: 80, r: 8, speed: 140, melee: true, range: 20, aggro: 280, dmg: 12, rof: 0.5, xp: 6,
      color: '#e2483d', dark: '#6e1611',
    },
    ghoul: {
      team: 1, name: 'グール', en: { name: 'Ghoul' },
      hp: 160, r: 11, speed: 60, melee: true, range: 22, aggro: 240, dmg: 18, rof: 0.8, xp: 10,
      revive: 0.3, // 倒れたあと 1 回だけ HP 30% で起き上がる
      color: '#7d9478', dark: '#2f3b2c',
    },
    soldier: {
      team: 1, name: '魔弾兵', en: { name: 'Demon Soldier' },
      hp: 100, r: 10, speed: 65, range: 300, aggro: 330, dmg: 9, rof: 0.7, spread: 0.06, bulletSpeed: 460, xp: 8,
      color: '#8a2a52', dark: '#3b0b22',
    },
    hound: {
      team: 1, name: 'ヘルハウンド', en: { name: 'Hellhound' },
      hp: 90, r: 10, speed: 150, melee: true, range: 22, aggro: 320, dmg: 14, rof: 0.5, xp: 8,
      color: '#e07a2a', dark: '#5e2a06',
    },
  };

  // 兵舎の大きさ。cap: 兵力 (同時に出せる兵士の最大数)、w・h: 大きさ (マス)
  const BARRACKS = {
    s: { cap: 10, hp: 1200, interval: 3.0, w: 3, h: 3, name: '小', en: { name: 'S' } },
    m: { cap: 20, hp: 2000, interval: 2.5, w: 4, h: 3, name: '中', en: { name: 'M' } },
    l: { cap: 35, hp: 3000, interval: 2.0, w: 5, h: 4, name: '大', en: { name: 'L' } },
    xl: { cap: 50, hp: 4500, interval: 1.6, w: 6, h: 4, name: '特大', en: { name: 'XL' } },
  };

  // 兵舎の大きさごとに湧く兵種の割合 [兵種, 重み]
  const MIX = {
    0: {
      s: [['infantry', 100]],
      m: [['infantry', 70], ['heavy', 20], ['medic', 10]],
      l: [['infantry', 60], ['heavy', 25], ['medic', 15]],
      xl: [['infantry', 60], ['heavy', 25], ['medic', 15]],
    },
    1: {
      s: [['imp', 45], ['ghoul', 25], ['soldier', 30]],
      m: [['imp', 30], ['ghoul', 20], ['soldier', 30], ['hound', 20]],
      l: [['imp', 30], ['ghoul', 20], ['soldier', 30], ['hound', 20]],
      xl: [['imp', 30], ['ghoul', 20], ['soldier', 30], ['hound', 20]],
    },
  };

  window.DI_UNITS = { UNITS, BARRACKS, MIX };
})();
