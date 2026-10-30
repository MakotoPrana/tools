/*
 * 酷道デリバリー: 仕事 (どこで荷物を受け取って、どこへ運ぶか) の一覧。
 * 制限時間は、道順の長さと路面から script.js が計算する (slack はその何倍の時間をくれるか)
 */
(() => {
  'use strict';

  const JOBS = [
    {
      id: 'wagashi',
      title: '峠の茶屋へ、おだんご',
      from: 'wagashi',
      to: 'teahouse',
      cargo: 'できたての和菓子',
      icon: '🍡',
      fragility: 0.8,
      slack: 1.6,
      reward: 3000,
      penalty: 1000,
      note: '峠の茶屋の看板メニュー。ふらふら峠は、つづら折りの酷道444号の先。',
    },
    {
      id: 'bulb',
      title: '岬の灯台へ、大きな電球',
      from: 'denki',
      to: 'lighthouse',
      cargo: '灯台の電球',
      icon: '💡',
      fragility: 1.3,
      slack: 1.55,
      reward: 4500,
      penalty: 1500,
      note: '切れた電球の交換品。岬へは、海の上の崖をけずった細い道を登る。',
    },
    {
      id: 'egg',
      title: '峠の茶屋へ、生たまご',
      from: 'egg',
      to: 'teahouse',
      cargo: '生たまご 300個',
      icon: '🥚',
      fragility: 1.6,
      slack: 1.55,
      reward: 5500,
      penalty: 2000,
      note: '名物の峠プリンの材料。ガタンと揺らすと、すぐに割れる。',
    },
    {
      id: 'machine',
      title: '電波塔へ、精密機器',
      from: 'seiki',
      to: 'tower',
      cargo: '送信機の部品',
      icon: '📡',
      fragility: 1.4,
      slack: 1.55,
      reward: 7000,
      penalty: 2500,
      note: '峠からさらに、尾根の砂利道を登る。砂利道は飛ばすと荷物が揺れる。',
    },
    {
      id: 'food',
      title: '山頂の山小屋へ、食料',
      from: 'mart',
      to: 'hut',
      cargo: '食料と水 1週間分',
      icon: '🥫',
      fragility: 0.9,
      slack: 1.55,
      reward: 8000,
      penalty: 3000,
      note: 'てっぺん岳の山頂まで、ヘアピンカーブがつづく酷道999号。',
    },
    {
      id: 'cake',
      title: '山頂の結婚式へ、ケーキ',
      from: 'cake',
      to: 'hut',
      cargo: 'ウェディングケーキ',
      icon: '🎂',
      fragility: 2.0,
      slack: 1.5,
      reward: 15000,
      penalty: 6000,
      note: '山頂で結婚式がはじまる。5段のケーキを、くずさずに届けて。',
    },
  ];

  const api = { JOBS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.KokudoJobs = api;
})();
