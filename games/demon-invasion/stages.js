/*
 * デモン・インベージョン: ステージのデータ
 *   座標はすべてマス (1 マス = 40px)。マップは最初ぜんぶ建物で埋まっていて、open の四角を道や広場として切り抜く。
 *     open: [x, y, w, h, 床の種類]  床: road (車道) / plaza (広場) / alley (路地)
 *     covers: 遮蔽物 { k: 種類, x, y, w, h }  種類: car (車・弾を止める) / barricade (バリケード・弾を止める) / planter (植え込み・弾は越える)
 *     hq: 本拠地 (4×4 マス) { team, x, y }
 *     barracks: 兵舎 { team, size: s/m/l/xl, x, y, face: 入口の向き n/s/e/w, lane: 兵士が進むレーン (-1 = 交互) }
 *     lanes: 自軍の本拠地 → 敵の本拠地へ向かう道筋 (マスの座標。小数は使ってよい)。敵はこれを逆にたどる
 *     points: 占領ポイント { k: 種類, x, y (中心のマス) }  種類: water (給水塔) / radio (電波塔) / ammo (弾薬庫) / tower (見張り塔)
 *     ruins: 最初から兵舎跡になっている場所 (兵舎と同じ書き方。team は元の持ち主)
 *     enemyTypes: このステージに出てくる悪魔 (兵舎の割合からこれ以外を除く。書いていなければ全部)
 *     captains: 敵の隊長 (units.js の CAPTAINS)
 *   locked: true のステージはまだ遊べない (開発中)
 */
(() => {
  'use strict';

  const STAGES = [
    {
      id: 1,
      name: '商店街', en: { name: 'Shopping Street' },
      desc: '2 本の通りで戦う、はじめての戦場。', descEn: 'Your first battlefield: two streets.',
      cols: 90, rows: 50,
      open: [
        [2, 6, 12, 38, 'plaza'], // 自軍の広場 (司令部)
        [76, 6, 12, 38, 'plaza'], // 敵軍の広場 (魔界の楔)
        [2, 9, 86, 6, 'road'], // 北の通り (アーケード)
        [2, 35, 86, 6, 'road'], // 南の通り
        [24, 9, 4, 32, 'road'], // 南北の通り
        [44, 9, 4, 32, 'road'],
        [63, 9, 4, 32, 'road'],
        [28, 22, 35, 3, 'alley'], // 裏通り
        [35, 15, 2, 7, 'alley'],
        [55, 25, 2, 10, 'alley'],
        [14, 15, 10, 3, 'alley'],
        [67, 32, 9, 3, 'alley'],
      ],
      covers: [
        { k: 'car', x: 19, y: 10, w: 2, h: 1 },
        { k: 'barricade', x: 31, y: 13, w: 1, h: 1 },
        { k: 'car', x: 39, y: 10, w: 2, h: 1 },
        { k: 'planter', x: 50, y: 12, w: 2, h: 1 },
        { k: 'barricade', x: 57, y: 10, w: 1, h: 1 },
        { k: 'car', x: 70, y: 13, w: 2, h: 1 },
        { k: 'car', x: 20, y: 39, w: 2, h: 1 },
        { k: 'barricade', x: 31, y: 36, w: 1, h: 1 },
        { k: 'planter', x: 38, y: 38, w: 2, h: 1 },
        { k: 'car', x: 52, y: 36, w: 2, h: 1 },
        { k: 'barricade', x: 59, y: 39, w: 1, h: 1 },
        { k: 'car', x: 71, y: 36, w: 2, h: 1 },
        { k: 'car', x: 25, y: 28, w: 1, h: 2 },
        { k: 'car', x: 46, y: 17, w: 1, h: 2 },
        { k: 'car', x: 64, y: 29, w: 1, h: 2 },
        { k: 'barricade', x: 33, y: 23, w: 1, h: 1 },
        { k: 'barricade', x: 51, y: 22, w: 1, h: 1 },
        { k: 'planter', x: 8, y: 11, w: 2, h: 1 },
        { k: 'planter', x: 8, y: 38, w: 2, h: 1 },
        { k: 'planter', x: 80, y: 11, w: 2, h: 1 },
        { k: 'planter', x: 80, y: 38, w: 2, h: 1 },
      ],
      hq: [
        { team: 0, x: 4, y: 23 },
        { team: 1, x: 82, y: 23 },
      ],
      barracks: [
        { team: 0, size: 's', x: 16, y: 6, face: 's', lane: 0 },
        { team: 0, size: 's', x: 16, y: 41, face: 'n', lane: 1 },
        { team: 0, size: 'm', x: 6, y: 16, face: 'e', lane: -1 },
        { team: 1, size: 'm', x: 34, y: 6, face: 's', lane: 0 },
        { team: 1, size: 'm', x: 40, y: 41, face: 'n', lane: 1 },
        { team: 1, size: 'l', x: 82, y: 31, face: 'w', lane: -1 },
      ],
      lanes: [
        [[9, 21], [12, 12], [78, 12], [84, 21]],
        [[9, 29], [12, 38], [78, 38], [84, 29]],
      ],
      points: [
        { k: 'ammo', x: 55, y: 12 }, // 北の通りの弾薬庫
        { k: 'water', x: 34, y: 38 }, // 南の通りの給水塔
      ],
      ruins: [],
      enemyTypes: ['imp', 'ghoul', 'soldier', 'hound', 'bomber'], // このステージに出てくる悪魔
      captains: ['varga'], // 敵の隊長
      // 敵の兵士の強さの倍率 (HP・攻撃力)。敵優勢のバランスを決める
      enemyMul: 1.0,
    },
    { id: 2, name: '住宅街', en: { name: 'Residential Area' }, locked: true },
    { id: 3, name: '駅前', en: { name: 'Station Square' }, locked: true },
    { id: 4, name: '港の倉庫街', en: { name: 'Harbor Warehouses' }, locked: true },
    { id: 5, name: 'オフィス街', en: { name: 'Office District' }, locked: true },
    { id: 6, name: '繁華街', en: { name: 'Nightlife District' }, locked: true },
    { id: 7, name: '旧市街と大聖堂', en: { name: 'Old Town Cathedral' }, locked: true },
    { id: 8, name: '魔界門', en: { name: 'The Demon Gate' }, locked: true },
  ];

  window.DI_STAGES = STAGES;
})();
