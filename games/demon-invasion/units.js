/*
 * デモン・インベージョン: 兵種のデータ
 *   自軍 (team 0) と敵軍 (team 1) の兵士。数値の意味は script.js の兵士の処理を参照。
 *     hp: 体力 / r: 当たりの半径 / speed: 移動速度 (px/秒)
 *     melee: 近接攻撃なら true / range: 射程 (px) / aggro: 敵に気づいて向かっていく距離
 *     dmg: 1回のダメージ / rof: 攻撃の間隔 (秒) / spread: 弾のぶれ (ラジアン) / bulletSpeed: 弾の速さ
 *     xp: 倒したときの経験値 (魂の灯)
 *     maxPer: 1 つの兵舎から同時に出せる数の上限 / siege: 建物へのダメージの割合 (書いていなければ 15%)
 *     fly: 空を飛ぶ (建物を越える) / stealth: 姿を消して近づく / support: 自分では攻撃しない (祈祷師)
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
    sniper: {
      team: 0, name: '狙撃兵', en: { name: 'Sniper' },
      hp: 70, r: 10, speed: 62, range: 520, aggro: 540, dmg: 45, rof: 2.6, spread: 0.01, bulletSpeed: 1400,
      sniper: true, // 大きな悪魔・隊長・祈祷師・呪術師を優先して撃つ
      color: '#5a86c8', dark: '#22385e',
    },
    grenadier: {
      team: 0, name: '擲弾兵', en: { name: 'Grenadier' },
      hp: 110, r: 10, speed: 64, range: 320, aggro: 340, dmg: 28, rof: 2.2, spread: 0, bulletSpeed: 0,
      lob: 55, siege: 0.5, // 弾を放り投げて、着いた所で半径 55 の爆発。建物に強い
      color: '#4f7fd6', dark: '#24406e',
    },
    engineer: {
      team: 0, name: '工兵', en: { name: 'Engineer' },
      hp: 100, r: 10, speed: 68, range: 160, aggro: 220, dmg: 5, rof: 1.0, spread: 0.25, bulletSpeed: 750, pellets: 4,
      repair: 15, // 近くの傷ついた自軍の建物を 1 秒に 15 修理する。兵舎跡の再建も 1.5 倍
      color: '#d9a441', dark: '#6a4a10',
    },
    apc: {
      team: 0, name: '装甲車', en: { name: 'Armored Car' },
      hp: 900, r: 18, speed: 45, range: 330, aggro: 350, dmg: 7, rof: 0.15, spread: 0.09, bulletSpeed: 900,
      maxPer: 1, vehicle: true,
      color: '#3d5a86', dark: '#1a2a44',
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
    gargoyle: {
      team: 1, name: 'ガーゴイル', en: { name: 'Gargoyle' },
      hp: 120, r: 11, speed: 95, melee: true, range: 22, aggro: 300, dmg: 14, rof: 0.7, xp: 10,
      fly: true, stone: 0.2, // 建物を越えて飛ぶ。止まっているあいだは石になり、受けるダメージが 20% になる
      color: '#8a8f9a', dark: '#3a3d45',
    },
    witch: {
      team: 1, name: '呪術師', en: { name: 'Witch' },
      hp: 80, r: 10, speed: 60, range: 380, aggro: 400, dmg: 7, rof: 1.4, spread: 0.04, bulletSpeed: 300, xp: 10,
      curse: 3, // 当たった相手を 3 秒鈍らせる
      color: '#7a3aa8', dark: '#2e0d45',
    },
    bomber: {
      team: 1, name: '自爆デーモン', en: { name: 'Bomber' },
      hp: 70, r: 10, speed: 125, melee: true, range: 14, aggro: 300, dmg: 60, rof: 1, xp: 6,
      bomb: 80, siege: 1, // 相手にたどり着くと半径 80 で爆発する。撃たれて倒れても爆発し、まわりの悪魔を巻き込む
      color: '#ff6a2a', dark: '#6a1a04',
    },
    shaman: {
      team: 1, name: '祈祷師', en: { name: 'Shaman' },
      hp: 110, r: 10, speed: 58, range: 0, aggro: 280, dmg: 0, rof: 1, xp: 14,
      support: true, heal: 8, healRange: 170, buff: 0.2, buffRange: 180, // まわりの悪魔を回復し、攻撃力を 20% 上げる
      color: '#3a8a7a', dark: '#0e3a32',
    },
    shadow: {
      team: 1, name: '影の暗殺者', en: { name: 'Shadow' },
      hp: 90, r: 10, speed: 120, melee: true, range: 20, aggro: 500, dmg: 35, rof: 1.2, xp: 12,
      stealth: true, // 攻撃の直前と、攻撃を受けたときだけ姿が見える。プレイヤーをねらう
      color: '#2a2030', dark: '#0a060e',
    },
    ogre: {
      team: 1, name: 'オーガ', en: { name: 'Ogre' },
      hp: 600, r: 16, speed: 50, melee: true, range: 26, aggro: 260, dmg: 30, rof: 1.4, xp: 40,
      maxPer: 2, smash: 60, // 棍棒で半径 60 をなぎ払い、吹き飛ばす。遮蔽物を壊しながら進む
      color: '#7a5a3a', dark: '#2e1e0e',
    },
    behemoth: {
      team: 1, name: '破城獣', en: { name: 'Behemoth' },
      hp: 2000, r: 24, speed: 40, melee: true, range: 30, aggro: 300, dmg: 40, rof: 1.5, xp: 80,
      maxPer: 1, siege: 3, wrecker: true, // 建物を優先してねらい、建物に 3 倍のダメージ
      color: '#5a2a2a', dark: '#200808',
    },
  };

  // 敵の隊長 (魔将)。レベル 1 のときの値。レベルが上がるごとに hpUp・dmgUp の割合で強くなる
  //   skills: 覚える技とそのレベル (charge: 突進 / wave: 炎の斬撃 / ring: 炎の円 / summon: 手下を呼ぶ / rage: 怒り)
  const CAPTAINS = {
    varga: {
      name: '魔将ヴァルガ', title: '獄炎の戦鬼', en: { name: 'Varga', title: 'Hellfire Warlord' },
      hp: 900, hpUp: 0.12, dmg: 22, dmgUp: 0.06, r: 18, speed: 85, range: 30, aggro: 340, rof: 0.9, startLv: 3,
      skills: { charge: 1, wave: 5, ring: 10, summon: 15, rage: 20 },
      xp: 160, color: '#c4281d', dark: '#4a0904',
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
      m: [['infantry', 60], ['heavy', 20], ['medic', 10], ['engineer', 10]],
      l: [['infantry', 45], ['heavy', 15], ['medic', 10], ['engineer', 10], ['sniper', 10], ['grenadier', 10]],
      xl: [['infantry', 45], ['heavy', 15], ['medic', 10], ['engineer', 10], ['sniper', 10], ['grenadier', 10], ['apc', 6]],
    },
    1: {
      s: [['imp', 45], ['ghoul', 25], ['soldier', 30]],
      m: [['imp', 25], ['ghoul', 15], ['soldier', 25], ['hound', 15], ['gargoyle', 10], ['witch', 5], ['bomber', 5]],
      l: [['imp', 20], ['ghoul', 12], ['soldier', 22], ['hound', 12], ['gargoyle', 8], ['witch', 6], ['bomber', 6], ['shaman', 5], ['shadow', 5], ['ogre', 4]],
      xl: [['imp', 20], ['ghoul', 12], ['soldier', 22], ['hound', 12], ['gargoyle', 8], ['witch', 6], ['bomber', 6], ['shaman', 5], ['shadow', 5], ['ogre', 4], ['behemoth', 3]],
    },
  };

  window.DI_UNITS = { UNITS, BARRACKS, MIX, CAPTAINS };
})();
