// ぜんぶ削る: ゲームのデータ (ステージ・道具・強化・実績・換算単位)
// 体積の単位はすべて m³。実在の物の体積は外形でざっくり見積もった概算
(function (root) {
  'use strict';

  // 削る対象。vol は実寸の体積 (m³)
  const STAGES = [
    { id: 'pencil',   name: '鉛筆',               icon: '✏️', vol: 7e-6,     note: '長さ17.5cmの鉛筆1本' },
    { id: 'brick',    name: 'レンガ',             icon: '🧱', vol: 1.3e-3,   note: '21×10×6cmの普通レンガ1個' },
    { id: 'drum',     name: 'ドラム缶',           icon: '🛢️', vol: 0.2,      note: '200リットル入り' },
    { id: 'car',      name: '自動車',             icon: '🚗', vol: 11,       note: '全長4.5mの乗用車' },
    { id: 'house',    name: '一軒家',             icon: '🏠', vol: 500,      note: '2階建ての家' },
    { id: 'dome',     name: '東京ドーム',         icon: '🏟️', vol: 1.24e6,   note: '東京の野球場。量の単位としてもおなじみ' },
    { id: 'pyramid',  name: 'ギザの大ピラミッド', icon: '🔺', vol: 2.6e6,    note: '石のブロック約230万個' },
    { id: 'itokawa',  name: '小惑星イトカワ',     icon: '☄️', vol: 1.8e7,    note: '長さ約535mのラッコ形の小惑星' },
    { id: 'fuji',     name: '富士山',             icon: '🗻', vol: 1.4e12,   note: '標高3,776mの日本一の山' },
    { id: 'maunaloa', name: 'マウナ・ロア山',     icon: '🌋', vol: 7.5e13,   note: 'ハワイの火山。富士山の約50倍の大きさ' },
    { id: 'ceres',    name: '準惑星ケレス',       icon: '🪨', vol: 4.2e17,   note: '小惑星帯で一番大きい天体。直径約940km' },
    { id: 'moon',     name: '月',                 icon: '🌕', vol: 2.2e19,   note: '直径3,474km' },
    { id: 'earth',    name: '地球',               icon: '🌍', vol: 1.08e21,  note: '直径12,742km' },
    { id: 'jupiter',  name: '木星',               icon: '🪐', vol: 1.43e24,  note: '地球1,300個ぶん' },
    { id: 'sun',      name: '太陽',               icon: '☀️', vol: 1.41e27,  note: '地球130万個ぶん' },
  ];

  const stageNo = (id) => STAGES.findIndex((x) => x.id === id) + 1;

  // 自動で削る道具。cost は1台目の値段、payback は元を取るまでの秒数 (1台あたりの秒間破壊量 = cost / payback)
  // unlock: この番号のステージ (1〜) に来たら買えるようになる
  // 値は試算 (1周目は富士山まで約16時間、転生をくり返して太陽まで約2週間) で決めた
  const TOOLS = [
    { id: 'file',    name: '紙やすり',               icon: '🧽', cost: 5e-7,   payback: 10,     unlock: 1 },
    { id: 'cutter',  name: 'カッター',               icon: '🔪', cost: 1.2e-5, payback: 40,     unlock: 1 },
    { id: 'hammer',  name: 'ハンマー',               icon: '🔨', cost: 4e-4,   payback: 160,    unlock: 2 },
    { id: 'drill',   name: '電動ドリル',             icon: '🪛', cost: 3e-2,   payback: 640,    unlock: 3 },
    { id: 'digger',  name: '解体用の重機',           icon: '🚜', cost: 2,      payback: 2560,   unlock: 4 },
    { id: 'ball',    name: '鉄球クレーン',           icon: '🏗️', cost: 200,    payback: 10240,  unlock: 5 },
    { id: 'plant',   name: '採掘プラント',           icon: '🏭', cost: 1e5,    payback: 40960,  unlock: 6 },
    { id: 'robots',  name: '掘削ロボ艦隊',           icon: '🤖', cost: 3e7,    payback: 163840, unlock: 8 },
    { id: 'laser',   name: '軌道レーザー',           icon: '🛰️', cost: 1e11,   payback: 655360, unlock: 9 },
    { id: 'hole',    name: 'ブラックホール発生装置', icon: '🕳️', cost: 1e17,   payback: 2e8,    unlock: 11 },
    { id: 'nova',    name: '超新星ハンマー',         icon: '💫', cost: 1e23,   payback: 3e12,   unlock: 14 },
  ];
  const TOOL_GROWTH = 1.15;
  // この台数をそろえるたびに、その道具の破壊量が2倍
  const MILESTONES = [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

  // 強化 (段階的に何度も買える)
  // tap: 1タップで削る量を倍に / tech: 全体の破壊量を倍に / link: タップに秒間破壊量の一部を上乗せ
  const UPGRADES = [
    { id: 'tap',  name: '握力トレーニング', desc: 'タップで削る量 ×3', base: 3e-6, growth: 40, max: 30 },
    { id: 'tech', name: '技術革新',         desc: 'すべての道具の破壊量 ×2', base: 5e-3, growth: 1000, max: 40 },
    { id: 'link', name: '道具と息を合わせる', desc: 'タップで、秒間破壊量の +2% ぶんも削る', base: 50, growth: 1e4, max: 10 },
  ];
  const TAP_BASE = 1e-7; // 1タップで削る量 (0.1cm³)
  const CLEAR_BONUS = 1.5; // 対象を1つ壊すたびに全体の破壊量 ×1.5

  // 転生: 富士山を壊すと解放。そのプレイで削った総量 V から「破壊の記憶」を得る
  const REBIRTH_STAGE = stageNo('fuji') + 1; // 富士山を壊したら転生できる
  const MEMORY_BONUS = 0.05; // 記憶1個につき ×1.05 (重ねがけ)
  const SKILLS = [
    { id: 'offline', name: '寝ている間も働く', desc: 'オフラインで削れる上限 +4時間', cost: 5, growth: 2, max: 10 },
    { id: 'idle',    name: '放置の達人',       desc: 'オフラインで削る効率 +10%',     cost: 8, growth: 2, max: 5 },
    { id: 'start',   name: '前世の道具箱',     desc: '最初から各道具を5台ずつ持って始める (段階ごとに解放される道具が増える)', cost: 10, growth: 3, max: 5 },
    { id: 'auto',    name: '自動発注',         desc: '一番安い道具を自動で買い続ける', cost: 20, growth: 1, max: 1 },
  ];
  const OFFLINE_HOURS = 8;
  const OFFLINE_RATE = 0.5;

  // 量の例え。量が大きくなるほど大きい単位で表す
  const COMPARES = [
    { name: '角砂糖',       unit: '個', vol: 2.5e-6 },
    { name: '牛乳パック',   unit: '本', vol: 1e-3 },
    { name: 'バケツ',       unit: '杯', vol: 1e-2 },
    { name: 'お風呂',       unit: '杯', vol: 0.2 },
    { name: 'ダンプカー',   unit: '台', vol: 6 },
    { name: '25mプール',    unit: '杯', vol: 375 },
    { name: '東京ドーム',   unit: '杯', vol: 1.24e6 },
    { name: '琵琶湖',       unit: '杯', vol: 2.75e10 },
    { name: '富士山',       unit: '個', vol: 1.4e12 },
    { name: '月',           unit: '個', vol: 2.2e19 },
    { name: '地球',         unit: '個', vol: 1.08e21 },
    { name: '太陽',         unit: '個', vol: 1.41e27 },
  ];

  // 実績。check(s) が true になったら達成。1つにつき全体の破壊量 +1%
  const ACHIEVEMENTS = [
    { id: 'first_tap',  name: 'はじめの一削り',     desc: '1回タップする',                        check: (s) => s.taps >= 1 },
    { id: 'tap1000',    name: '指が痛い',           desc: '累計1,000回タップする',                check: (s) => s.taps >= 1000 },
    { id: 'tap10000',   name: '指が削れる',         desc: '累計10,000回タップする',               check: (s) => s.taps >= 10000 },
    { id: 'hand_pencil',name: '手作業の職人',       desc: '道具を買わずに鉛筆を削り切る',         check: (s) => s.flags.handPencil },
    { id: 'tools100',   name: '道具マニア',         desc: '道具を合計100台持つ',                  check: (s) => s.toolTotal >= 100 },
    { id: 'tools500',   name: '工場長',             desc: '道具を合計500台持つ',                  check: (s) => s.toolTotal >= 500 },
    { id: 'all_tools',  name: '全種そろい踏み',     desc: '11種類すべての道具を持つ',             check: (s) => s.toolKinds >= 11 },
    { id: 'v_bathtub',  name: 'お風呂1杯分',        desc: '累計でお風呂1杯分 (0.2m³) 削る',       check: (s) => s.lifetime >= 0.2 },
    { id: 'v_pool',     name: 'プールが空っぽ',     desc: '累計で25mプール1杯分削る',             check: (s) => s.lifetime >= 375 },
    { id: 'v_dome',     name: '東京ドーム1杯分',    desc: '累計で東京ドーム1杯分削る',            check: (s) => s.lifetime >= 1.24e6 },
    { id: 'v_biwa',     name: '琵琶湖が干上がる',   desc: '累計で琵琶湖1杯分削る',                check: (s) => s.lifetime >= 2.75e10 },
    { id: 'v_earth',    name: '地球1個分',          desc: '累計で地球1個分削る',                  check: (s) => s.lifetime >= 1.08e21 },
    { id: 'one_tap_house', name: '1タップで一軒家', desc: '1回のタップで一軒家ぶん (500m³) 削る', check: (s) => s.bestTap >= 500 },
    { id: 'idle_clear', name: '寝ている間に',       desc: '放置中に対象を壊す',                   check: (s) => s.flags.offlineClear },
    { id: 'idle_earth', name: '起きたら地球がない', desc: '放置中に地球を壊す',                   check: (s) => s.flags.offlineEarth },
    { id: 'fuji',       name: '日本一を削り切る',   desc: '富士山を壊す',                         check: (s) => s.bestStage > stageNo('fuji') },
    { id: 'earth',      name: '帰る星がない',       desc: '地球を壊す',                           check: (s) => s.bestStage > stageNo('earth') },
    { id: 'sun',        name: 'ぜんぶ削った',       desc: '太陽を壊す',                           check: (s) => s.flags.sunDone },
    { id: 'rebirth1',   name: '生まれ変わっても',   desc: '1回転生する',                          check: (s) => s.rebirths >= 1 },
    { id: 'rebirth5',   name: '輪廻の削り師',       desc: '5回転生する',                          check: (s) => s.rebirths >= 5 },
  ];
  const ACH_BONUS = 0.01;

  root.KZ_DATA = {
    STAGES, TOOLS, TOOL_GROWTH, MILESTONES, UPGRADES, TAP_BASE, CLEAR_BONUS,
    REBIRTH_STAGE, MEMORY_BONUS, SKILLS, OFFLINE_HOURS, OFFLINE_RATE, COMPARES, ACHIEVEMENTS, ACH_BONUS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
