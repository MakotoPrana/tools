/*
 * おそうじサバイバー2 のデータ (難易度・ゴミ・ボス・ステージ・清掃ギア・パッシブ・必殺技・トレーニング)
 * 数値の意味は SPEC.md を参照。ゲームの動きは game.js、画面は ui.js
 */
(() => {
  'use strict';
  const G = (window.CS2 = {});

  // 難易度: ゴミの体力・受けるダメージ・湧く量・速さ・コインの倍率
  G.DIFFS = [
    { id: 'normal', n: 'ノーマル', hp: 1, dmg: 1, spawn: 1, spd: 1, coin: 1 },
    { id: 'hard', n: 'ハード', hp: 1.7, dmg: 1.5, spawn: 1.25, spd: 1.08, coin: 2 },
    { id: 'hell', n: 'ゴミ屋敷級', hp: 2.6, dmg: 1.8, spawn: 1.4, spd: 1.12, coin: 3.5 },
  ];

  G.RUN = {
    bossAt: 240, // ボスが出る時刻 (秒)
    eliteAt: [80, 160], // エリートが出る時刻
    maxEnemies: 230,
    gearSlots: 5,
    passiveSlots: 5,
    gearMax: 6, // プレイ中のギアの最大レベル (工房 Lv10 で 7)
  };

  // ゴミ (敵)。sh: 形、r: 半径、sp: 速さ、dm: 接触ダメージ、xp: 落とすダスト、ai: 動き
  G.ENEMIES = {
    // 家の中
    dust: { n: 'ホコリ', sh: 'fluff', c: '#b9b4ab', r: 9, hp: 6, sp: 55, dm: 4, xp: 1, pack: 4, info: '群れで押し寄せる' },
    hair: { n: '抜け毛', sh: 'hair', c: '#5a4636', r: 9, hp: 10, sp: 70, dm: 5, xp: 1, slow: 1.2, pack: 2, info: 'からみつくと足が遅くなる' },
    paper: { n: '紙くず', sh: 'crumple', c: '#f1ede2', c2: '#b8b2a2', r: 10, hp: 18, sp: 62, dm: 6, xp: 1, info: 'まっすぐ追いかけてくる' },
    sock: { n: 'かたっぽ靴下', sh: 'sock', c: '#e9728f', c2: '#fff', r: 10, hp: 16, sp: 96, dm: 6, xp: 1, ai: 'zig', info: 'ジグザグにすばやく動く' },
    can: { n: '空き缶', sh: 'can', c: '#d9483b', c2: '#e8e8e8', r: 10, hp: 22, sp: 190, dm: 9, xp: 3, ai: 'roll', info: 'まっすぐ転がって突っこむ' },
    bottle: { n: 'ペットボトル', sh: 'bottle', c: '#8fd3f0', c2: '#3a7bd5', r: 11, hp: 34, sp: 215, dm: 10, xp: 3, ai: 'roll', info: '空き缶より速くて硬い' },
    fly: { n: 'コバエ', sh: 'fly', c: '#3c3c44', r: 6, hp: 5, sp: 122, dm: 3, xp: 1, ai: 'erratic', pack: 5, info: 'ふらふら飛ぶ小さな群れ' },
    grease: { n: '油汚れ', sh: 'blob', c: '#c98a1e', c2: '#8a5a0c', r: 15, hp: 90, sp: 34, dm: 12, xp: 6, slow: 2.5, info: '遅いが硬い。さわるとベタベタ' },
    mold: { n: 'カビ胞子', sh: 'spore', c: '#5f9a57', c2: '#2f5a2c', r: 11, hp: 30, sp: 50, dm: 6, xp: 3, ai: 'ranged', keep: 170, rof: 2.6, shot: { n: 1, sp: 120, dm: 7, c: '#7fc46f' }, moldy: 1, info: '離れて胞子を飛ばす' },
    bag: { n: '生ゴミ袋', sh: 'bag', c: '#4d7fbf', c2: '#2c4f80', r: 16, hp: 110, sp: 42, dm: 12, xp: 6, split: ['fly', 6], info: '破れるとコバエが飛び出す' },
    spider: { n: 'クモ', sh: 'spider', c: '#4a3b58', r: 11, hp: 45, sp: 78, dm: 7, xp: 3, ai: 'ranged', keep: 140, rof: 3.2, shot: { n: 1, sp: 150, dm: 4, slow: 2, c: '#e8e8f4' }, info: '糸を吐いて足を止める' },
    scale: { n: '水アカ', sh: 'crust', c: '#c9e4ec', c2: '#7fa9b8', r: 13, hp: 70, sp: 45, dm: 9, xp: 3, armor: 3, moldy: 1, info: 'カチカチ。1発ごとのダメージを 3 減らす' },
    // 外
    leaf: { n: '落ち葉', sh: 'leaf', c: '#d98a2b', c2: '#9a4f12', r: 9, hp: 12, sp: 76, dm: 5, xp: 1, ai: 'sine', pack: 4, info: '風に乗ってゆらゆら群れる' },
    butt: { n: '吸いがら', sh: 'butt', c: '#f4f0e6', c2: '#d98a2b', r: 7, hp: 14, sp: 106, dm: 6, xp: 1, pack: 2, info: '小さくて速い' },
    mud: { n: '泥だんご', sh: 'blob', c: '#7a5a3a', c2: '#4a3420', r: 16, hp: 130, sp: 40, dm: 13, xp: 6, puddle: 1, info: '倒すと泥の水たまりを残す' },
    crow: { n: 'カラス', sh: 'crow', c: '#23232b', c2: '#f2b632', r: 12, hp: 60, sp: 110, dm: 14, xp: 4, ai: 'swoop', info: 'まわりを飛んでから急降下' },
    pbag: { n: 'レジ袋', sh: 'pbag', c: '#f4f6fa', c2: '#b8c2d0', r: 11, hp: 26, sp: 86, dm: 7, xp: 2, ai: 'sine', wide: 1, info: '大きくゆれて近づく' },
    weed: { n: '雑草', sh: 'weed', c: '#4c9a3a', c2: '#2a5a20', r: 12, hp: 80, sp: 0, dm: 8, xp: 4, ai: 'static', rof: 3.5, shot: { n: 3, sp: 130, dm: 6, c: '#b6d96a' }, info: '足もとに生えて種を飛ばす' },
    glass: { n: '空きビン', sh: 'bottle', c: '#a8743a', c2: '#5a3a16', r: 11, hp: 40, sp: 60, dm: 8, xp: 3, shards: 6, info: '割れると破片が飛び散る' },
    tire: { n: '古タイヤ', sh: 'tire', c: '#2a2a30', c2: '#6a6a74', r: 18, hp: 160, sp: 170, dm: 16, xp: 8, ai: 'roll', info: '重くて硬い。転がって突っこむ' },
    graffiti: { n: 'スプレー缶', sh: 'can', c: '#9a4fd0', c2: '#f2e24a', r: 10, hp: 50, sp: 56, dm: 7, xp: 4, ai: 'ranged', keep: 190, rof: 2.8, shot: { n: 3, sp: 140, dm: 7, c: '#d06af2' }, info: '離れて 3 方向にペンキを吹く' },
    sludge: { n: 'ヘドロ', sh: 'blob', c: '#3d4a3a', c2: '#1f2a1e', r: 17, hp: 150, sp: 38, dm: 14, xp: 8, ai: 'trail', slow: 2, info: '通り道にヘドロを残す' },
  };

  // ボス。pat: 順番にくり返す技 (ring 全方向弾・aim ねらい撃ち・charge 突進・summon 手下・puddle 水たまり・spiral うず巻き弾)
  G.BOSSES = {
    dustking: { n: 'ダストキング', sh: 'fluff', c: '#8f8a80', r: 40, hp: 2000, sp: 46, dm: 14, pat: ['summon', 'charge'], minion: 'dust' },
    hairdjinn: { n: 'ぬけ毛魔人', sh: 'hair', c: '#3a2a20', r: 42, hp: 2400, sp: 50, dm: 15, pat: ['aim', 'summon', 'charge'], minion: 'hair' },
    namagomi: { n: '生ゴミ妖怪', sh: 'bag', c: '#3f8f6a', c2: '#1f5a3e', r: 44, hp: 2800, sp: 44, dm: 16, pat: ['summon', 'ring', 'puddle'], minion: 'fly' },
    kabi: { n: 'カビ怪獣', sh: 'spore', c: '#3f7a3a', c2: '#1c401a', r: 44, hp: 3200, sp: 42, dm: 16, pat: ['ring', 'spiral', 'summon'], minion: 'mold' },
    yaneura: { n: '大グモ ヤネウラ', sh: 'spider', c: '#2e2238', r: 42, hp: 3600, sp: 62, dm: 17, pat: ['aim', 'charge', 'summon', 'ring'], minion: 'spider' },
    ochiba: { n: '落ち葉将軍', sh: 'leaf', c: '#c96a1a', c2: '#7a3408', r: 44, hp: 4000, sp: 56, dm: 17, pat: ['spiral', 'summon', 'charge'], minion: 'leaf' },
    crowboss: { n: 'カラスの親分', sh: 'crow', c: '#15151c', c2: '#f2b632', r: 42, hp: 4400, sp: 70, dm: 18, pat: ['charge', 'aim', 'charge', 'summon'], minion: 'crow' },
    golem: { n: '粗大ゴミゴーレム', sh: 'golem', c: '#7a6a5a', c2: '#3a4a6a', r: 48, hp: 5200, sp: 40, dm: 20, pat: ['ring', 'charge', 'aim', 'summon'], minion: 'can' },
    hedoro: { n: 'ヘドロ大魔王', sh: 'blob', c: '#2f3d2c', c2: '#141c13', r: 48, hp: 5800, sp: 42, dm: 20, pat: ['puddle', 'spiral', 'summon', 'ring'], minion: 'sludge' },
    emperor: { n: 'ゴミ山の帝王', sh: 'golem', c: '#5a4a6a', c2: '#c9483b', r: 52, hp: 7000, sp: 48, dm: 22, pat: ['spiral', 'charge', 'summon', 'ring', 'puddle', 'aim'], minion: 'bag' },
  };

  // ステージ。out: 外か、gim: しかけ、pool: [ゴミ, 出はじめる秒, 重み]、unlock: クリアで使えるようになるギア
  G.STAGES = [
    { n: '玄関とろうか', out: false, w: 1500, h: 1500, floor: ['plank', '#c79a63', '#a87a48'], wall: '#5a4030', deco: ['rug', '#b9534a', '#3f6a8a'], gim: [],
      pool: [['dust', 0, 10], ['hair', 20, 5], ['paper', 55, 6], ['sock', 110, 4], ['can', 150, 3]], boss: 'dustking', unlock: 'washer', sub: 'まずはここから。ホコリと抜け毛を片付けよう' },
    { n: 'リビング', out: false, w: 1600, h: 1600, floor: ['speckle', '#b9a88f', '#a39078'], wall: '#4f4438', deco: ['rug', '#4f7a6a', '#c9a24a'], gim: [],
      pool: [['dust', 0, 8], ['hair', 0, 6], ['paper', 30, 6], ['sock', 60, 5], ['fly', 90, 4], ['can', 120, 4], ['bottle', 170, 3]], boss: 'hairdjinn', unlock: 'bomb', sub: 'ソファの下から次々と出てくる' },
    { n: 'キッチン', out: false, w: 1500, h: 1500, floor: ['grid', '#e9e2d0', '#c9bfa6'], wall: '#6a5a48', deco: ['rug', '#d9a03a', '#8a9a6a'], gim: [],
      pool: [['fly', 0, 8], ['paper', 0, 6], ['can', 40, 4], ['grease', 60, 4], ['bottle', 100, 4], ['bag', 130, 3], ['dust', 0, 4]], boss: 'namagomi', unlock: 'roller', sub: '油汚れと生ゴミ袋に注意' },
    { n: 'おふろ', out: false, w: 1400, h: 1400, floor: ['grid', '#bfe0ea', '#8fbfd0'], wall: '#3f6a7a', deco: ['rug', '#f4f8fa', '#7fb0c4'], gim: ['slip'],
      pool: [['hair', 0, 9], ['mold', 30, 5], ['scale', 70, 4], ['grease', 110, 3], ['bottle', 140, 4], ['dust', 0, 4]], boss: 'kabi', unlock: 'sponge', sub: '床がすべる。カビ胞子は離れて撃ってくる' },
    { n: '屋根裏', out: false, w: 1700, h: 1300, floor: ['plank', '#7a5f44', '#5f4832'], wall: '#2a1f18', deco: ['rug', '#5a4a3a', '#6a5a4a'], gim: ['dark'],
      pool: [['dust', 0, 12], ['spider', 25, 5], ['sock', 50, 4], ['paper', 0, 5], ['mold', 100, 4], ['bag', 140, 3], ['scale', 180, 2]], boss: 'yaneura', unlock: 'static', sub: 'まっ暗で遠くが見えない' },
    { n: '庭', out: true, w: 2100, h: 2100, floor: ['speckle', '#6fae54', '#5f9a48'], wall: '#3a5a2a', deco: ['flower', '#f2d24a', '#f29ab0'], gim: ['wind'],
      pool: [['leaf', 0, 11], ['fly', 0, 4], ['weed', 35, 3], ['pbag', 70, 5], ['butt', 100, 4], ['mud', 120, 3]], boss: 'ochiba', unlock: 'sprinkler', sub: 'ここからは外。ときどき突風が吹く' },
    { n: '公園', out: true, w: 2200, h: 2200, floor: ['speckle', '#d9c79a', '#c9b486'], wall: '#5a7a3a', deco: ['flower', '#6fae54', '#8fbf6a'], gim: ['puddle'],
      pool: [['butt', 0, 8], ['can', 0, 5], ['leaf', 0, 5], ['pbag', 30, 5], ['crow', 60, 3], ['glass', 100, 4], ['weed', 130, 3], ['bottle', 160, 3]], boss: 'crowboss', unlock: 'trap', sub: '水たまりで足が遅くなる。カラスの急降下に注意' },
    { n: '商店街', out: true, w: 2400, h: 1800, floor: ['brick', '#b8a89a', '#9a8a7c'], wall: '#4a4a54', deco: ['stone', '#8a8a94', '#a8a8b0'], gim: ['traffic'],
      pool: [['butt', 0, 8], ['can', 0, 6], ['pbag', 0, 5], ['bottle', 30, 5], ['graffiti', 60, 4], ['glass', 90, 4], ['bag', 130, 3], ['tire', 180, 2]], boss: 'golem', unlock: 'glove', sub: '自転車が走りぬける。赤い帯から離れよう' },
    { n: '河川敷', out: true, w: 2400, h: 2000, floor: ['speckle', '#7a9a5a', '#6a8a4c'], wall: '#3a5a6a', deco: ['stone', '#8a9a8a', '#5a7a5a'], gim: ['rain'],
      pool: [['leaf', 0, 6], ['mud', 0, 4], ['bottle', 0, 5], ['sludge', 40, 3], ['weed', 70, 3], ['tire', 110, 3], ['glass', 140, 4], ['crow', 170, 3]], boss: 'hedoro', unlock: 'wiper', sub: '雨で水たまりが増えていく' },
    { n: 'ゴミ処理場', out: true, w: 2300, h: 2300, floor: ['grid', '#9a9a9a', '#7f7f84'], wall: '#33333a', deco: ['stone', '#6a6a70', '#b8a03a'], gim: ['traffic', 'wind'],
      pool: [['bag', 25, 5], ['can', 0, 6], ['tire', 45, 3], ['sludge', 50, 3], ['graffiti', 70, 4], ['glass', 0, 4], ['fly', 0, 6], ['crow', 110, 3], ['grease', 140, 3], ['mold', 170, 3]], boss: 'emperor', unlock: 'drone', sub: '最終ステージ。収集車と突風の中で帝王を倒せ' },
  ];
  G.GIMMICKS = {
    slip: ['🧼', 'すべる床'],
    dark: ['🔦', 'まっ暗'],
    wind: ['🍃', '突風'],
    puddle: ['💧', '水たまり'],
    traffic: ['🚲', '乗り物が通る'],
    rain: ['🌧️', '雨'],
  };

  /*
   * 清掃ギア。dmg・cd (秒)・count は Lv1 の値。レベルごとにダメージ +20%、さらに ups の分だけ伸びる
   * ups: dmg (追加ダメージの割合)・cd (間隔を縮める割合)・area (範囲)・count (数)・dur (効果時間)
   * multi: パッシブ「増設キット」で数が増えるか。start: 最初から使える
   */
  const U = (o) => o;
  G.GEARS = {
    vacuum: { n: '超強力掃除機', ic: '🌀', dmg: 9, cd: 0.9, count: 1, start: true, d: '近くのゴミへ扇形に吸いこむ。ダストも引き寄せる',
      ups: U({ 2: { area: 0.15 }, 3: { cd: 0.12 }, 4: { dmg: 0.2 }, 5: { area: 0.15 }, 6: { cd: 0.12 }, 7: { dmg: 0.3 } }) },
    mop: { n: 'モップ', ic: '🧹', dmg: 16, cd: 1.3, count: 1, start: true, d: '近くのゴミを大きくなぎ払って押し返す',
      ups: U({ 2: { dmg: 0.2 }, 3: { area: 0.15 }, 4: { cd: 0.12 }, 5: { count: 1 }, 6: { area: 0.15 }, 7: { dmg: 0.3 } }) },
    robot: { n: 'お掃除ロボ', ic: '🤖', dmg: 7, cd: 1, count: 2, start: true, d: 'まわりをぐるぐる回ってゴミを砕く',
      ups: U({ 2: { count: 1 }, 3: { area: 0.15 }, 4: { count: 1 }, 5: { cd: 0.2 }, 6: { count: 1 }, 7: { dmg: 0.3 } }) },
    spray: { n: '除菌スプレー', ic: '🧴', dmg: 5, cd: 2.4, count: 1, multi: true, start: true, d: 'しばらく残る除菌ミスト。カビ・水アカに 2 倍',
      ups: U({ 2: { area: 0.2 }, 3: { count: 1 }, 4: { dur: 0.3 }, 5: { area: 0.2 }, 6: { count: 1 }, 7: { dmg: 0.3 } }) },
    duster: { n: 'はたき', ic: '🪶', dmg: 10, cd: 1.8, count: 1, multi: true, start: true, d: 'ブーメランのように飛び、行きと帰りで貫通する',
      ups: U({ 2: { count: 1 }, 3: { dmg: 0.2 }, 4: { area: 0.25 }, 5: { count: 1 }, 6: { cd: 0.15 }, 7: { dmg: 0.3 } }) },
    purifier: { n: '空気清浄機', ic: '🌬️', dmg: 5, cd: 0.7, count: 1, start: true, d: 'まわりの円の中のゴミにダメージを与え続ける',
      ups: U({ 2: { area: 0.15 }, 3: { dmg: 0.2 }, 4: { cd: 0.12 }, 5: { area: 0.15 }, 6: { dmg: 0.2 }, 7: { area: 0.2 } }) },
    washer: { n: '高圧洗浄機', ic: '💦', dmg: 14, cd: 1.6, count: 1, multi: true, lock: 1, d: 'まっすぐな水流が全部を貫通して押し返す',
      ups: U({ 2: { cd: 0.1 }, 3: { count: 1 }, 4: { area: 0.2 }, 5: { cd: 0.1 }, 6: { count: 1 }, 7: { dmg: 0.3 } }) },
    bomb: { n: '洗剤ボム', ic: '🫧', dmg: 26, cd: 2.8, count: 1, multi: true, lock: 2, d: 'ゴミの群れへ投げて、泡の爆発でまとめて片付ける',
      ups: U({ 2: { area: 0.15 }, 3: { count: 1 }, 4: { dmg: 0.2 }, 5: { area: 0.15 }, 6: { count: 1 }, 7: { cd: 0.15 } }) },
    roller: { n: 'コロコロ', ic: '🧻', dmg: 12, cd: 2.2, count: 1, lock: 3, d: '進む向きへ転がる太いローラー。通り道を全部巻き取る',
      ups: U({ 2: { area: 0.2 }, 3: { cd: 0.12 }, 4: { count: 1 }, 5: { area: 0.2 }, 6: { count: 2 }, 7: { dmg: 0.3 } }) },
    sponge: { n: 'メラミンスポンジ', ic: '🧽', dmg: 9, cd: 3.4, count: 1, multi: true, lock: 4, d: '画面の端ではね返りながら飛び回る',
      ups: U({ 2: { dur: 0.25 }, 3: { count: 1 }, 4: { dmg: 0.2 }, 5: { dur: 0.25 }, 6: { count: 1 }, 7: { area: 0.3 } }) },
    static: { n: '静電気モップ', ic: '⚡', dmg: 13, cd: 1.9, count: 3, lock: 5, d: '静電気がゴミからゴミへ次々に飛び移る',
      ups: U({ 2: { count: 1 }, 3: { dmg: 0.2 }, 4: { cd: 0.12 }, 5: { count: 2 }, 6: { dmg: 0.2 }, 7: { cd: 0.15 } }) },
    sprinkler: { n: '重曹スプリンクラー', ic: '⛲', dmg: 6, cd: 0.3, count: 2, lock: 6, d: '回転する水の筋が、まわりのゴミを洗い続ける',
      ups: U({ 2: { count: 1 }, 3: { area: 0.15 }, 4: { dmg: 0.2 }, 5: { count: 1 }, 6: { area: 0.15 }, 7: { dmg: 0.3 } }) },
    trap: { n: 'ねんちゃくシート', ic: '🪤', dmg: 6, cd: 2.0, count: 1, lock: 7, d: '足もとに置く。乗ったゴミは遅くなってダメージを受ける',
      ups: U({ 2: { area: 0.2 }, 3: { dur: 0.3 }, 4: { dmg: 0.25 }, 5: { cd: 0.2 }, 6: { area: 0.2 }, 7: { dmg: 0.3 } }) },
    glove: { n: 'ゴム手袋パンチ', ic: '🧤', dmg: 40, cd: 2.6, count: 1, multi: true, lock: 8, d: 'いちばん硬いゴミを追いかけて殴る。ボスに強い',
      ups: U({ 2: { dmg: 0.25 }, 3: { cd: 0.12 }, 4: { count: 1 }, 5: { dmg: 0.25 }, 6: { cd: 0.12 }, 7: { count: 1 } }) },
    wiper: { n: '窓ふきワイパー', ic: '🪟', dmg: 18, cd: 5.5, count: 1, lock: 9, d: '長いワイパーが画面を横切って、全部を押し流す',
      ups: U({ 2: { dmg: 0.2 }, 3: { cd: 0.12 }, 4: { count: 1 }, 5: { dmg: 0.2 }, 6: { cd: 0.15 }, 7: { dmg: 0.3 } }) },
    drone: { n: 'おそうじドローン', ic: '🛸', dmg: 11, cd: 0.35, count: 1, multi: true, lock: 10, d: '自分でゴミを探して体当たりし続ける',
      ups: U({ 2: { dmg: 0.2 }, 3: { count: 1 }, 4: { cd: 0.15 }, 5: { dmg: 0.2 }, 6: { count: 1 }, 7: { dmg: 0.3 } }) },
  };
  G.GEAR_IDS = Object.keys(G.GEARS);

  // 工房 (ギアの恒久アップグレード): Lv ごとにダメージ +7%。節目で追加の効果
  G.FORGE = {
    max: 10,
    dmg: 0.07,
    cost: (lv) => Math.round((30 * Math.pow(1.5, lv)) / 5) * 5,
    miles: { 3: '範囲 +10%', 6: '間隔 −10%', 10: 'プレイ中の最大レベル 7' },
  };

  // パッシブ
  G.PASSIVES = {
    boiler: { n: '温水ボイラー', ic: '♨️', max: 5, d: '攻撃力 +10%' },
    battery: { n: 'バッテリー', ic: '🔋', max: 5, d: '攻撃間隔 −7%' },
    bleach: { n: '漂白剤', ic: '🧪', max: 5, d: '攻撃範囲 +9%' },
    wax: { n: 'フロアワックス', ic: '✨', max: 5, d: '移動速度 +7%' },
    boots: { n: '防水ブーツ', ic: '🥾', max: 5, d: '最大体力 +20、水たまりで遅くなりにくい' },
    pack: { n: 'ダストパック', ic: '🎒', max: 5, d: '回収範囲 +25%' },
    hepa: { n: 'HEPAフィルター', ic: '🍃', max: 5, d: '体力が毎秒 0.4 回復' },
    apron: { n: 'エプロン', ic: '🦺', max: 4, d: '受けるダメージ −1.5' },
    kit: { n: '増設キット', ic: '➕', max: 2, d: '飛ばすギアの数 +1' },
    timer: { n: 'キッチンタイマー', ic: '⏱️', max: 5, d: '効果時間 +10%' },
    drink: { n: 'エナジードリンク', ic: '🥤', max: 5, d: '必殺技ゲージのたまり +15%' },
  };

  // 必殺技。need: 必要なゲージ、cost: 買う値段。Lv ごとに威力 +20% (最大 Lv5)
  G.ULTS = {
    flash: { n: '大掃除フラッシュ', ic: '💥', need: 100, cost: 0, d: '画面じゅうのゴミに大ダメージ。敵の弾も消す' },
    megabot: { n: 'メガロボ出動', ic: '🤖', need: 120, cost: 400, d: '巨大なお掃除ロボが 7 秒間まわりを走り回る' },
    typhoon: { n: '放水タイフーン', ic: '🌊', need: 120, cost: 800, d: '8 本の水流が 5 秒間回転して、全部を押し流す' },
    dome: { n: '除菌ドーム', ic: '🛡️', need: 110, cost: 1200, d: '6 秒間無敵。体力を 35% 回復し、まわりにダメージ' },
    hole: { n: 'ブラックホール吸引', ic: '🕳️', need: 140, cost: 2000, d: 'ゴミを 1 か所に吸い集めて、最後に大爆発' },
    shine: { n: 'ピカピカタイム', ic: '⏳', need: 150, cost: 3000, d: 'ゴミの動きを止め、そのあいだギアが 2.5 倍の速さで動く' },
  };
  G.ULT_MAX = 5;
  G.ultCost = (lv) => 300 * lv; // Lv → Lv+1

  // トレーニング (清掃員の恒久強化)
  G.TRAIN = {
    hp: { n: '体力', ic: '❤️', max: 10, base: 40, d: '最大体力 +10' },
    atk: { n: '腕力', ic: '💪', max: 10, base: 60, d: '攻撃力 +4%' },
    spd: { n: '脚力', ic: '👟', max: 5, base: 80, d: '移動速度 +2%' },
    pick: { n: '回収', ic: '🧲', max: 5, base: 50, d: '回収範囲 +10%' },
    coin: { n: '金運', ic: '🪙', max: 5, base: 100, d: 'コイン +10%' },
    xp: { n: '学習', ic: '📘', max: 5, base: 100, d: '経験値 +5%' },
    revive: { n: '栄養ドリンク', ic: '💖', max: 1, base: 1500, d: '力尽きたとき 1 回だけ体力半分で復活' },
  };
  G.trainCost = (id, lv) => Math.round((G.TRAIN[id].base * Math.pow(1.5, lv)) / 5) * 5;

  // ギアのレベルを上げたときの説明 (「ダメージ +20%・数 +1」など)
  G.upText = (id, lv) => {
    const u = G.GEARS[id].ups[lv] || {};
    const parts = [`ダメージ +${20 + Math.round((u.dmg || 0) * 100)}%`];
    if (u.count) parts.push(`数 +${u.count}`);
    if (u.area) parts.push(`範囲 +${Math.round(u.area * 100)}%`);
    if (u.cd) parts.push(`間隔 −${Math.round(u.cd * 100)}%`);
    if (u.dur) parts.push(`効果時間 +${Math.round(u.dur * 100)}%`);
    return parts.join('・');
  };
})();
