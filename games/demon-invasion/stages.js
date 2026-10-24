/*
 * デモン・インベージョン: ステージのデータ
 *   座標はすべてマス (1 マス = 40px)。マップは最初ぜんぶ建物で埋まっていて、open の四角を道や広場として切り抜く。
 *     open: [x, y, w, h, 床の種類]  床: road (車道) / plaza (広場) / alley (路地) / yard (コンテナ置き場) / bridge (陸橋)
 *           / rail (線路: 通れないが弾は越える)。あとに書いた四角が上書きする
 *     blocks: [x, y, w, h] 切り抜いたあとで、もう一度建物にする四角 (倉庫など)
 *     covers: 遮蔽物 { k: 種類, x, y, w, h }  種類: car (車・弾を止める) / barricade (バリケード・弾を止める) / planter (植え込み・弾は越える) / container (コンテナ・硬い)
 *     hq: 本拠地 (4×4 マス) { team, x, y }
 *     barracks: 兵舎 { team, size: s/m/l/xl, x, y, face: 入口の向き n/s/e/w, lane: 兵士が進むレーン (-1 = 交互) }
 *     lanes: 自軍の本拠地 → 敵の本拠地へ向かう道筋 (マスの座標。小数は使ってよい)。敵はこれを逆にたどる
 *     points: 占領ポイント { k: 種類, x, y (中心のマス) }  種類: water (給水塔) / radio (電波塔) / ammo (弾薬庫) / tower (見張り塔)
 *     ruins: 最初から兵舎跡になっている場所 (兵舎と同じ書き方。team は元の持ち主)
 *     enemyTypes: このステージに出てくる悪魔 (兵舎の割合からこれ以外を除く。書いていなければ全部)
 *     captains: 敵の隊長 (units.js の CAPTAINS)
 *     fog: 夜霧。プレイヤーから見える距離 (px)
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
        [[9, 29], [12, 38], [78, 38], [80, 28]],
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
    {
      id: 2,
      name: '住宅街', en: { name: 'Residential Area' },
      desc: '3 本の通りと、家々のあいだの細い路地。回り込みやすい。', descEn: 'Three streets and narrow alleys between the houses. Easy to flank.',
      cols: 96, rows: 56,
      open: [
        [2, 6, 13, 44, 'plaza'],
        [81, 6, 13, 44, 'plaza'],
        [2, 8, 92, 5, 'road'], // 北の通り
        [2, 26, 92, 5, 'road'], // 真ん中の通り
        [2, 44, 92, 5, 'road'], // 南の通り
        [22, 8, 2, 41, 'alley'],
        [32, 8, 2, 41, 'alley'],
        [42, 13, 2, 31, 'alley'],
        [52, 8, 2, 41, 'alley'],
        [62, 8, 2, 41, 'alley'],
        [72, 8, 2, 41, 'alley'],
        [15, 18, 66, 2, 'alley'],
        [15, 37, 66, 2, 'alley'],
      ],
      covers: [
        { k: 'car', x: 27, y: 9, w: 2, h: 1 }, { k: 'barricade', x: 37, y: 11, w: 1, h: 1 }, { k: 'car', x: 57, y: 11, w: 2, h: 1 }, { k: 'planter', x: 67, y: 9, w: 2, h: 1 },
        { k: 'car', x: 26, y: 29, w: 2, h: 1 }, { k: 'barricade', x: 46, y: 27, w: 1, h: 1 }, { k: 'planter', x: 58, y: 29, w: 2, h: 1 }, { k: 'car', x: 68, y: 27, w: 2, h: 1 },
        { k: 'planter', x: 27, y: 47, w: 2, h: 1 }, { k: 'car', x: 37, y: 45, w: 2, h: 1 }, { k: 'barricade', x: 56, y: 47, w: 1, h: 1 }, { k: 'car', x: 67, y: 45, w: 2, h: 1 },
        { k: 'barricade', x: 22, y: 23, w: 2, h: 1 }, { k: 'barricade', x: 62, y: 33, w: 2, h: 1 },
      ],
      hq: [
        { team: 0, x: 4, y: 26 },
        { team: 1, x: 88, y: 26 },
      ],
      barracks: [
        { team: 0, size: 's', x: 17, y: 5, face: 's', lane: 0 },
        { team: 0, size: 'm', x: 6, y: 38, face: 'e', lane: -1 },
        { team: 1, size: 'm', x: 39, y: 5, face: 's', lane: 0 },
        { team: 1, size: 's', x: 55, y: 31, face: 'n', lane: 1 },
        { team: 1, size: 's', x: 45, y: 49, face: 'n', lane: 2 },
        { team: 1, size: 'm', x: 88, y: 38, face: 'w', lane: -1 },
      ],
      ruins: [
        { team: 0, size: 's', x: 17, y: 49, face: 'n', lane: 2 },
      ],
      lanes: [
        [[9, 24], [10, 10.5], [85, 10.5], [86, 24]],
        [[11, 28.5], [84, 28.5]],
        [[9, 33], [10, 46.5], [85, 46.5], [86, 33]],
      ],
      points: [
        { k: 'radio', x: 37, y: 28.5 },
        { k: 'tower', x: 66, y: 10.5 },
      ],
      enemyTypes: ['imp', 'ghoul', 'soldier', 'hound', 'gargoyle', 'witch', 'bomber'],
      captains: ['nephilis'],
      enemyMul: 0.7,
    },
    {
      id: 3,
      name: '駅前', en: { name: 'Station Square' },
      desc: '線路が街を上下に分ける。渡れるのは踏切と陸橋の 3 か所だけ。', descEn: 'The railway splits the town in two. Only three crossings lead across.',
      cols: 64, rows: 90,
      open: [
        [6, 78, 52, 10, 'plaza'], // 自軍の広場 (南)
        [6, 2, 52, 10, 'plaza'], // 敵軍の広場 (北)
        [0, 43, 64, 4, 'rail'], // 線路
        [10, 2, 6, 86, 'road'], // 西の通り (踏切)
        [29, 2, 6, 86, 'bridge'], // 駅前大通り (陸橋)
        [46, 2, 6, 86, 'road'], // 東の通り (踏切)
        [10, 20, 42, 4, 'road'],
        [10, 64, 42, 4, 'road'],
        [20, 36, 24, 6, 'plaza'], // 駅の北口
        [20, 48, 24, 5, 'plaza'], // 駅の南口
        [16, 29, 13, 2, 'alley'],
        [35, 56, 11, 2, 'alley'],
      ],
      covers: [
        { k: 'car', x: 11, y: 28, w: 1, h: 2 }, { k: 'barricade', x: 14, y: 50, w: 1, h: 1 }, { k: 'car', x: 14, y: 70, w: 1, h: 2 },
        { k: 'planter', x: 30, y: 26, w: 1, h: 2 }, { k: 'car', x: 33, y: 58, w: 1, h: 2 }, { k: 'barricade', x: 31, y: 40, w: 2, h: 1 }, { k: 'barricade', x: 31, y: 49, w: 2, h: 1 },
        { k: 'car', x: 47, y: 30, w: 1, h: 2 }, { k: 'barricade', x: 49, y: 50, w: 1, h: 1 }, { k: 'car', x: 50, y: 60, w: 1, h: 2 },
        { k: 'planter', x: 24, y: 38, w: 2, h: 1 }, { k: 'planter', x: 38, y: 50, w: 2, h: 1 },
      ],
      hq: [
        { team: 0, x: 30, y: 82 },
        { team: 1, x: 30, y: 4 },
      ],
      barracks: [
        { team: 0, size: 's', x: 16, y: 70, face: 'w', lane: 0 },
        { team: 0, size: 'm', x: 35, y: 72, face: 'w', lane: 1 },
        { team: 0, size: 'm', x: 43, y: 70, face: 'e', lane: 2 },
        { team: 1, size: 'm', x: 35, y: 50, face: 'w', lane: 1 },
        { team: 1, size: 'm', x: 43, y: 50, face: 'e', lane: 2 },
        { team: 1, size: 'm', x: 16, y: 30, face: 'w', lane: 0 },
        { team: 1, size: 'l', x: 52, y: 3, face: 'w', lane: -1 },
      ],
      ruins: [
        { team: 0, size: 's', x: 16, y: 58, face: 'w', lane: 0 },
      ],
      lanes: [
        [[27, 80], [13, 80], [13, 8], [27, 8]],
        [[32, 79], [32, 10]],
        [[37, 80], [49, 80], [49, 8], [37, 8]],
      ],
      points: [
        { k: 'tower', x: 24, y: 39 },
        { k: 'water', x: 24, y: 50 },
      ],
      enemyTypes: ['imp', 'ghoul', 'soldier', 'hound', 'gargoyle', 'witch', 'bomber', 'shaman'],
      captains: ['grados'],
      enemyMul: 0.9,
    },
    {
      id: 4,
      name: '港の倉庫街', en: { name: 'Harbor Warehouses' },
      desc: 'コンテナが積まれた倉庫街。夜霧で遠くが見えない。', descEn: 'Container yards between warehouses. Night fog hides everything beyond a short distance.',
      cols: 100, rows: 60,
      open: [
        [2, 6, 12, 48, 'plaza'],
        [86, 6, 12, 48, 'plaza'],
        [14, 6, 72, 48, 'yard'], // コンテナ置き場
      ],
      blocks: [
        // 倉庫 (通れない建物)
        [22, 18, 10, 6], [40, 18, 10, 6], [58, 18, 10, 6], [76, 18, 6, 6],
        [22, 36, 10, 6], [40, 36, 10, 6], [58, 36, 10, 6], [76, 36, 6, 6],
      ],
      covers: [
        { k: 'container', x: 26, y: 8, w: 3, h: 1 }, { k: 'container', x: 36, y: 14, w: 3, h: 1 }, { k: 'container', x: 52, y: 9, w: 1, h: 3 },
        { k: 'container', x: 66, y: 14, w: 3, h: 1 }, { k: 'container', x: 74, y: 8, w: 3, h: 1 },
        { k: 'container', x: 20, y: 27, w: 1, h: 3 }, { k: 'container', x: 34, y: 25, w: 3, h: 1 }, { k: 'container', x: 52, y: 32, w: 3, h: 1 },
        { k: 'container', x: 70, y: 26, w: 1, h: 3 }, { k: 'container', x: 64, y: 33, w: 3, h: 1 },
        { k: 'container', x: 26, y: 51, w: 3, h: 1 }, { k: 'container', x: 36, y: 45, w: 3, h: 1 }, { k: 'container', x: 56, y: 46, w: 1, h: 3 },
        { k: 'container', x: 66, y: 45, w: 3, h: 1 }, { k: 'container', x: 74, y: 51, w: 3, h: 1 },
        { k: 'barricade', x: 34, y: 20, w: 1, h: 2 }, { k: 'barricade', x: 52, y: 38, w: 1, h: 2 }, { k: 'barricade', x: 70, y: 20, w: 1, h: 2 },
      ],
      hq: [
        { team: 0, x: 4, y: 28 },
        { team: 1, x: 92, y: 28 },
      ],
      barracks: [
        { team: 0, size: 's', x: 18, y: 6, face: 's', lane: 0 },
        { team: 0, size: 'm', x: 18, y: 50, face: 'n', lane: 2 },
        { team: 0, size: 'm', x: 6, y: 16, face: 'e', lane: -1 },
        { team: 1, size: 'm', x: 44, y: 6, face: 's', lane: 0 },
        { team: 1, size: 'm', x: 46, y: 24, face: 's', lane: 1 },
        { team: 1, size: 'm', x: 50, y: 50, face: 'n', lane: 2 },
        { team: 1, size: 'l', x: 90, y: 40, face: 'w', lane: -1 },
      ],
      ruins: [
        { team: 0, size: 's', x: 30, y: 25, face: 's', lane: 1 },
      ],
      lanes: [
        [[9, 26], [12, 12], [88, 12], [91, 26]],
        [[14, 30], [86, 30]],
        [[9, 34], [12, 48], [88, 48], [91, 34]],
      ],
      points: [
        { k: 'ammo', x: 60, y: 12 },
        { k: 'water', x: 34, y: 48 },
        { k: 'tower', x: 62, y: 30 },
      ],
      fog: 360, // プレイヤーから見える距離 (px)
      enemyTypes: ['imp', 'ghoul', 'soldier', 'hound', 'gargoyle', 'witch', 'bomber', 'shaman', 'shadow'],
      captains: ['mirage'],
      enemyMul: 0.95,
    },
    { id: 5, name: 'オフィス街', en: { name: 'Office District' }, locked: true },
    { id: 6, name: '繁華街', en: { name: 'Nightlife District' }, locked: true },
    { id: 7, name: '旧市街と大聖堂', en: { name: 'Old Town Cathedral' }, locked: true },
    { id: 8, name: '魔界門', en: { name: 'The Demon Gate' }, locked: true },
  ];

  window.DI_STAGES = STAGES;
})();
