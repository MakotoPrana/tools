/*
 * おそうじサバイバー
 *   押し寄せるゴミと汚れを、自動で動く清掃ギアで片付けながら、10分以内に家じゅうの部屋をピカピカにするヴァンサバ風アクション。
 *   仕様は SPEC.md を参照。
 */
(() => {
  'use strict';

  // ===================================================================
  // 基本の値
  // ===================================================================
  const TILE = 16; // 汚れマップの1マス (px)
  const ROOM = 1920; // 家の広さ (px、正方形)
  const TN = ROOM / TILE; // 汚れマップの1辺のマス数
  const DIRT_PX = 1; // 汚れ用 Canvas での1マスの大きさ (拡大してぼかすと、汚れらしい柔らかい縁になる)
  const BLOCK = 48; // 間取り (壁・ドア・段ボール) の1マス
  const BN = ROOM / BLOCK;
  const CELL = 64; // 当たり判定の空間ハッシュ
  const GN = Math.ceil(ROOM / CELL);
  const GAME_TIME = 600; // 10分
  const ROOM_DONE = 0.9; // 部屋の清掃が完了する、きれいな床の割合
  // 発生源の汚れバリア: まわり (半径 SHIELD_R、同じ部屋) の汚れ具合で、受けるダメージが減る
  const SHIELD_R = 150;
  const SHIELD_MIN = 0.08; // いちばん汚れているときに通るダメージの割合
  // 汚れ具合 d (0 = ピカピカ / 1 = 全部ドロドロ) から、通るダメージの割合を決める
  const shieldMul = (d) => clamp(1 - ((d - 0.1) / 0.5) * (1 - SHIELD_MIN), SHIELD_MIN, 1);
  const MAX_ENEMIES = 400;
  const MAX_GEMS = 300;
  const MAX_PARTICLES = 700;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'cleaning-survivors-save';
  // テスト版は <meta name="cs-test-unlock"> で全部屋・全主人公を開放する
  const TEST_UNLOCK = !!document.querySelector('meta[name="cs-test-unlock"]');
  // このサイト (tools.e-seventh.com) 以外 (CrazyGames などに埋めこまれたとき) は、ゲームの画面だけを全面に出す。
  // CrazyGames 用の zip は <html class="embed"> にしてあるので、読みこみの途中からサイトの見た目が出ない
  const EMBED = document.documentElement.classList.contains('embed') || location.hostname !== 'tools.e-seventh.com';
  document.documentElement.classList.toggle('embed', EMBED);

  // 言語: 日本語と英語。保存がなければ、ブラウザの言語が日本語なら日本語、それ以外は英語
  const LANG_KEY = 'cleaning-survivors-lang';
  // 日本語・英語はこのファイルに、ほかの言語の文言は lang/<言語>.js にある (読みこめた言語だけ選べる)
  const I18N = window.CS_I18N || {};
  const LANGS = [
    ['ja', '日本語'], ['en', 'English'], ['zh', '简体中文'], ['ko', '한국어'],
    ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'],
  ].filter(([code]) => code === 'ja' || code === 'en' || I18N[code]);
  const LANG_CODES = LANGS.map(([code]) => code);
  const PACK_CODES = LANG_CODES.filter((code) => I18N[code]);
  // ラテン文字の言語 (ロゴを英字用の大きさにする)
  const LATIN = ['en', 'fr', 'de', 'es', 'it', 'pt'];
  const loadLang = () => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (LANG_CODES.includes(saved)) return saved;
    } catch (e) { /* 保存がなければブラウザの言語から決める */ }
    for (const l of navigator.languages || [navigator.language || '']) {
      const code = String(l).toLowerCase().slice(0, 2);
      if (LANG_CODES.includes(code)) return code;
    }
    return 'en';
  };
  let lang = loadLang();
  // データの名前や説明: 日本語以外のときは、その言語の名前 (.en・.zh・.ko) にある方を使う
  const L = (o, f) => (lang !== 'ja' && o[lang] && o[lang][f] != null ? o[lang][f] : o[f]);

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const angleDiff = (a, b) => {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const hash = (i) => {
    let h = (i * 2654435761) >>> 0;
    h ^= h >>> 15;
    return h;
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // ===================================================================
  // データ
  // ===================================================================

  // gem: 落とすダスト 0=小 1=中 2=大
  const ENEMIES = {
    dust: { name: 'ホコリ', hp: 1, speed: 40, dmg: 1, r: 9, gem: 0, move: 'chase', desc: '弱いけれど大量に群れて湧く。部屋のどこにでもいる。' },
    hair: { name: '抜け毛', hp: 2, speed: 56, dmg: 2, r: 9, gem: 0, move: 'chase', touch: 'tangle', desc: 'ホコリに混ざって湧く。絡みつかれると少し歩きにくくなる。' },
    paper: { name: '紙くず', hp: 4, speed: 58, dmg: 3, r: 11, gem: 0, move: 'chase', desc: 'まっすぐ追いかけてくる、いちばんふつうのゴミ。' },
    can: { name: '空き缶', hp: 6, speed: 150, dmg: 5, r: 10, gem: 1, move: 'roll', desc: 'コロコロ転がって突っ込んでくる。当たると痛い。' },
    bottle: { name: 'ペットボトル', hp: 10, speed: 170, dmg: 6, r: 12, gem: 1, move: 'roll', bounce: true, desc: '空き缶より速くて硬い。壁で跳ね返る。' },
    grease: { name: '粘着油汚れ', hp: 30, speed: 26, dmg: 4, r: 18, gem: 2, move: 'chase', touch: 'stick', desc: 'ベタベタのスライム。通った床をドロドロにし、触れると大きく減速する。' },
    spore: { name: 'カビの胞子', hp: 15, speed: 46, dmg: 3, r: 13, gem: 1, move: 'keep', mold: true, desc: '距離をとって胞子をまく。胞子を吸うとアレルギーで体力が減る。' },
    bag: { name: '生ゴミ袋', hp: 50, speed: 40, dmg: 6, r: 17, gem: 2, move: 'chase', burst: 8, desc: '片付けると破れて、中のゴミがあふれ出す。' },
    pile: { name: 'ゴミの山', hp: 110, speed: 0, dmg: 0, r: 26, gem: 2, move: 'none', source: true, desc: 'ゴミが次々と湧き出す発生源。潰すまで周りの床も汚し続ける。' },
    drain: { name: 'あふれた排水口', hp: 140, speed: 0, dmg: 0, r: 24, gem: 2, move: 'none', source: true, desc: '油汚れや抜け毛が湧き出す発生源。' },
    nest: { name: 'カビの巣', hp: 120, speed: 0, dmg: 0, r: 26, gem: 2, move: 'none', source: true, mold: true, desc: 'カビの胞子が湧き出す発生源。除菌スプレーがよく効く。' },
    boxes: { name: '段ボールの山', hp: 150, speed: 0, dmg: 0, r: 28, gem: 2, move: 'none', source: true, desc: '紙くずや空き缶が転がり出てくる発生源。' },
    yokai: { name: '生ゴミ妖怪', hp: 800, speed: 42, dmg: 12, r: 44, gem: 2, move: 'chase', boss: 'mid', desc: '5分たつと現れる中ボス。ゴミを撒き散らしながら迫ってくる。' },
    kaiju: { name: 'カビ怪獣', hp: 2000, speed: 36, dmg: 16, r: 56, gem: 2, move: 'chase', boss: 'boss', mold: true, desc: '9分たつと現れるボス。床をカビで汚し、胞子弾を撃つ。' },
    master: { name: 'ゴミ屋敷の主', hp: 3600, speed: 38, dmg: 20, r: 64, gem: 2, move: 'chase', boss: 'boss', desc: '屋敷の主の間のボス。ゴミ屋敷のすべてを操る。' },
  };
  const ENEMY_ORDER = ['dust', 'hair', 'paper', 'can', 'bottle', 'grease', 'spore', 'bag', 'pile', 'drain', 'nest', 'boxes', 'yokai', 'kaiju', 'master'];
  const GEM_XP = [1, 3, 8];
  // 全体の調整。ゴミ圧縮 (画面中のゴミをまとめて倒して経験値も一気に入った) をなくしたぶん、
  // ゴミの湧く量を減らし、ギアの攻撃力と経験値を上げ、中ボス・ボスの体力を下げる
  const BAL = { spawn: 0.8, might: 1.6, boss: 0.7, xp: 1.3 };
  const DUMP_TIME = 0.6; // ゴミ捨て場に立って空になるまでの秒数
  const ELITE_MAX = 2;
  const ELITE_CHEST_GAP = 35;
  // レベル n から n+1 に必要な経験値 (レベルが上がるほど多く必要になる)
  const xpFor = (n) => Math.round(12 + 5 * n + 0.4 * n * n);
  const GEM_BOX = [1, 1, 3];

  // lv: レベル2〜8で足す値と、その説明
  const WEAPONS = {
    vacuum: {
      name: '超強力掃除機', desc: '近くのゴミに扇形の吸引ノズルを向けて、まとめてダメージを与える', evo: 'blackhole', passive: 'battery', power: 1,
      base: { dmg: 6, cd: 0.5, range: 85, angle: 70 },
      lv: [
        [{ dmg: 2 }, '攻撃力 +2'], [{ range: 15 }, '吸引距離 +15'], [{ angle: 15 }, '吸引の角度 +15°'], [{ dmg: 3 }, '攻撃力 +3'],
        [{ cd: -0.06 }, '吸引の間隔 -0.06秒'], [{ range: 20 }, '吸引距離 +20'], [{ dmg: 4, angle: 15 }, '攻撃力 +4・角度 +15°'],
      ],
    },
    washer: {
      name: '高圧洗浄機', desc: '近くのゴミに向けて水流を発射し、貫通して吹き飛ばす', evo: 'steam', passive: 'boiler', power: 2,
      base: { dmg: 10, cd: 1.5, len: 240, width: 10, count: 1 },
      lv: [
        [{ count: 1 }, '水流 +1本'], [{ dmg: 5 }, '攻撃力 +5'], [{ width: 5 }, '水流の太さ +5'], [{ count: 1 }, '水流 +1本'],
        [{ dmg: 6 }, '攻撃力 +6'], [{ len: 80, cd: -0.2 }, '射程 +80・間隔 -0.2秒'], [{ count: 1, dmg: 6 }, '水流 +1本・攻撃力 +6'],
      ],
    },
    robot: {
      name: 'お掃除ロボット', desc: 'まわりをクルクル回ってゴミを粉砕し、床も磨く', evo: 'army', passive: 'roomba', power: 1,
      base: { dmg: 6, count: 2, radius: 62, spin: 3.4, size: 12 },
      lv: [
        [{ count: 1 }, 'ロボ +1台'], [{ dmg: 3 }, '攻撃力 +3'], [{ radius: 16 }, '回る半径 +16'], [{ count: 1 }, 'ロボ +1台'],
        [{ spin: 0.8, dmg: 3 }, '回る速さアップ・攻撃力 +3'], [{ size: 4 }, 'ロボの大きさ +4'], [{ count: 1 }, 'ロボ +1台'],
      ],
    },
    spray: {
      name: '除菌スプレー', desc: 'まわりに除菌ミストをまき、しばらく残る。カビ系に2倍ダメージ', evo: 'acid', passive: 'bleach', power: 1,
      base: { dmg: 4, cd: 3, count: 2, radius: 38, dur: 2.5 },
      lv: [
        [{ count: 1 }, 'ミスト +1'], [{ radius: 8 }, 'ミストの大きさ +8'], [{ dmg: 2 }, '攻撃力 +2'], [{ dur: 0.6 }, '効果時間 +0.6秒'],
        [{ count: 1 }, 'ミスト +1'], [{ radius: 10 }, 'ミストの大きさ +10'], [{ dmg: 3, count: 1 }, '攻撃力 +3・ミスト +1'],
      ],
    },
    roller: {
      name: 'コロコロ', desc: '後ろについてきて、通り道のゴミと汚れを巻き取る', evo: 'giant', passive: 'tape', power: 2,
      base: { dmg: 5, width: 28, count: 1 },
      lv: [
        [{ dmg: 3 }, '攻撃力 +3'], [{ width: 8 }, '幅 +8'], [{ dmg: 3 }, '攻撃力 +3'], [{ count: 1 }, 'ローラー +1個'],
        [{ width: 8 }, '幅 +8'], [{ dmg: 4 }, '攻撃力 +4'], [{ count: 1 }, 'ローラー +1個'],
      ],
    },
    mop: {
      name: 'モップ', desc: '前方を大きくなぎ払い、ゴミを弾き飛ばす。通った床もしっかり磨く', evo: 'tornado', passive: 'gloves', power: 2,
      base: { dmg: 11, cd: 1.3, range: 78, angle: 150 },
      lv: [
        [{ dmg: 4 }, '攻撃力 +4'], [{ range: 12 }, 'なぎ払う距離 +12'], [{ cd: -0.12 }, '間隔 -0.12秒'], [{ dmg: 5 }, '攻撃力 +5'],
        [{ angle: 40 }, 'なぎ払う角度 +40°'], [{ range: 16 }, 'なぎ払う距離 +16'], [{ dmg: 6, cd: -0.1 }, '攻撃力 +6・間隔 -0.1秒'],
      ],
    },
    duster: {
      name: 'はたき', desc: 'ブーメランのように投げて、行きと帰りでゴミを払う。貫通する', evo: 'gale', passive: 'boots', power: 1,
      base: { dmg: 7, cd: 1.6, len: 210, size: 14, count: 1 },
      lv: [
        [{ dmg: 3 }, '攻撃力 +3'], [{ count: 1 }, 'はたき +1本'], [{ len: 40 }, '飛ぶ距離 +40'], [{ size: 4, dmg: 3 }, '大きさ +4・攻撃力 +3'],
        [{ count: 1 }, 'はたき +1本'], [{ cd: -0.25 }, '間隔 -0.25秒'], [{ dmg: 5, count: 1 }, '攻撃力 +5・はたき +1本'],
      ],
    },
    bomb: {
      name: '洗剤ボム', desc: 'ゴミの集まりに洗剤を投げこみ、はじける泡でまとめて片付ける', evo: 'foam', passive: 'dustpack', power: 3,
      base: { dmg: 18, cd: 2.6, radius: 52, count: 1 },
      lv: [
        [{ dmg: 6 }, '攻撃力 +6'], [{ radius: 10 }, '爆発の大きさ +10'], [{ count: 1 }, 'ボム +1個'], [{ cd: -0.3 }, '間隔 -0.3秒'],
        [{ dmg: 8 }, '攻撃力 +8'], [{ radius: 12 }, '爆発の大きさ +12'], [{ count: 1, dmg: 6 }, 'ボム +1個・攻撃力 +6'],
      ],
    },
    purifier: {
      name: '空気清浄機', desc: 'まわりの空気をきれいにし続け、近づいたゴミに少しずつダメージを与えて押し返す', evo: 'aura', passive: 'filter', power: 1,
      base: { dmg: 4, cd: 0.75, radius: 54 },
      lv: [
        [{ radius: 8 }, '範囲 +8'], [{ dmg: 2 }, '攻撃力 +2'], [{ cd: -0.08 }, '間隔 -0.08秒'], [{ radius: 10 }, '範囲 +10'],
        [{ dmg: 3 }, '攻撃力 +3'], [{ radius: 10, cd: -0.06 }, '範囲 +10・間隔 -0.06秒'], [{ dmg: 4 }, '攻撃力 +4'],
      ],
    },
    press: {
      name: 'ダストプレス', desc: 'ダストボックスの中身を少しずつ押し固めて、まわりに衝撃波を出す。ダストが多いほど強く、ダストボックスも空く', evo: 'megapress', passive: 'hydraulic', power: 1,
      base: { dmg: 8, cd: 6.5, radius: 150, use: 0.2 },
      lv: [
        [{ radius: 20 }, '衝撃波の大きさ +20'], [{ dmg: 4 }, '攻撃力 +4'], [{ cd: -0.6 }, '間隔 -0.6秒'], [{ use: 0.05 }, '一度に押し固める量 +5%'],
        [{ radius: 25 }, '衝撃波の大きさ +25'], [{ dmg: 6 }, '攻撃力 +6'], [{ cd: -0.7, use: 0.05 }, '間隔 -0.7秒・押し固める量 +5%'],
      ],
    },
    sponge: {
      name: 'メラミンスポンジ', desc: '壁で跳ね返りながら部屋を飛び回り、ゴミと汚れをこすり落とす', evo: 'meteor', passive: 'wax', power: 2,
      base: { dmg: 6, cd: 3.2, size: 10, dur: 3, speed: 300, count: 1 },
      lv: [
        [{ dmg: 3 }, '攻撃力 +3'], [{ count: 1 }, 'スポンジ +1個'], [{ dur: 1 }, '飛ぶ時間 +1秒'], [{ size: 4 }, '大きさ +4'],
        [{ dmg: 4, speed: 60 }, '攻撃力 +4・速さアップ'], [{ count: 1 }, 'スポンジ +1個'], [{ dmg: 5, dur: 1 }, '攻撃力 +5・飛ぶ時間 +1秒'],
      ],
    },
  };
  const WEAPON_IDS = Object.keys(WEAPONS);
  const MAX_WEAPON_LV = 8;

  const EVOS = {
    blackhole: { name: 'ブラックホール掃除機', desc: '前方に吸引の渦を置き、渦の中のゴミにまとめてダメージを与える' },
    steam: { name: '超高温スチームカノン', desc: '太く長い蒸気ビームで、通った線を一気にピカピカにする' },
    army: { name: 'お掃除ロボ軍団', desc: 'ロボが増えて大きくなり、まわりを速く回りながらゴミを粉砕し、床も広く磨く' },
    acid: { name: '酸性雨ミスト', desc: '画面中に除菌の雨を降らせる' },
    giant: { name: '巨大圧雪ローラー', desc: '太いローラーで通り道を全部ピカピカにし、ゴミを潰す' },
    tornado: { name: '竜巻モップ', desc: 'まわり全部を高速でなぎ払い続ける' },
    gale: { name: '風神はたき', desc: '大きなはたきが何本も飛び、通り道のダストを集めてくる' },
    foam: { name: '泡の大爆発', desc: '大爆発のあとに泡が残り、しばらくゴミを溶かし続ける' },
    aura: { name: '浄化の結界', desc: '大きな結界でゴミを焼き、結界の中のゴミの足を遅くする' },
    megapress: { name: '超圧縮プレス機', desc: '画面いっぱいの衝撃波で、床もまとめてきれいにする' },
    meteor: { name: 'メラミン流星群', desc: '大きなスポンジが何個も長く跳ね回り、部屋じゅうを磨き上げる' },
  };

  const PASSIVES = {
    battery: { name: 'バッテリー増設', max: 5, desc: 'ギアの攻撃間隔 -8%' },
    boiler: { name: '温水ボイラー', max: 5, desc: 'ギアの攻撃力 +10%' },
    roomba: { name: 'お掃除ロボット増設', max: 2, desc: 'ギアの数 +1 (水流・ロボ・ミスト・はたき・ボム・スポンジ)' },
    bleach: { name: '強力漂白剤', max: 5, desc: '攻撃範囲 +10%' },
    tape: { name: '超強力粘着テープ', max: 5, desc: '効果時間 +10%' },
    dustpack: { name: '大容量ダストパック', max: 5, desc: 'ダストボックスの容量 +40・回収範囲 +20%' },
    boots: { name: '防水ブーツ', max: 3, desc: '汚れた床での減速を半分にする・体力 +20' },
    gloves: { name: 'ゴム手袋', max: 3, desc: '受けるダメージ -1' },
    hydraulic: { name: '油圧シリンダー', max: 5, desc: 'ゴミを押し返す力 +25%・ダストボックスの容量 +15' },
    filter: { name: 'HEPAフィルター', max: 5, desc: '体力が毎秒 0.25 回復' },
    wax: { name: 'フロアワックス', max: 5, desc: '移動速度 +6%・ギアの弾の速さ +10%' },
  };
  const PASSIVE_IDS = Object.keys(PASSIVES);
  // 1回のプレイで持てるギアとパッシブの数。全部は持てないので、どれを組み合わせるかでビルドが決まる
  const MAX_GEARS = 4;
  const MAX_PASSIVES = 4;

  // 清掃員。unlock: その番号のステージのノーマルの宝物を見つけると仲間になる (-1 は最初から)
  //   power: 強さのめやす (★1〜5。★1 はやりこみ向けの弱い清掃員)。最初のギア (weapons) が得意なギアで、攻撃力が fav 倍 (書いていなければ FAV_MUL)
  //   mods: 個性 (scrub: 歩いて磨く範囲 / might: 攻撃力 / noDirtSlow: 汚れた床で遅くならない / magnet: 回収範囲 /
  //   box: ダストボックス容量 / allergyImmune: アレルギー無効 / mold: カビ系へのダメージ / xp: 経験値)
  const CHARS = [
    { id: 'cleaner', name: '清掃員 ハジメ', weapons: ['vacuum'], hp: 100, speed: 1, unlock: -1, power: 3, trait: '床みがきの達人', traitDesc: '歩くだけで床を磨く範囲 +40%', desc: '伝説の清掃員。どんな汚れも見逃さない、まじめなベテラン。', mods: { scrub: 0.4 } },
    { id: 'tsugumi', name: '見習い ツグミ', weapons: ['sponge'], hp: 70, speed: 1, unlock: 0, power: 1, trait: 'まだ見習い', traitDesc: '攻撃力 -20%・経験値 +10%', desc: '屋敷に来たばかりの見習い。メラミンスポンジだけは誰にも負けない。', mods: { might: -0.2, xp: 0.1 } },
    { id: 'mizuki', name: '洗浄屋 ミズキ', weapons: ['washer'], hp: 90, speed: 1.05, unlock: 1, power: 3, trait: '水圧マニア', traitDesc: '攻撃力 +15%', desc: '高圧洗浄機を愛する、せっかちな洗浄屋。', mods: { might: 0.15 } },
    { id: 'hayate', name: '疾風 ハヤテ', weapons: ['duster'], hp: 80, speed: 1.2, unlock: 2, power: 3, trait: '疾風のはたき', traitDesc: '攻撃間隔 -10%', desc: 'はたきを風のように投げる、足の速い掃除人。打たれ弱いのが玉にきず。', mods: { cd: 0.1 } },
    { id: 'runta', name: 'お掃除ロボ ルン太', weapons: ['robot'], hp: 95, speed: 1.1, unlock: 3, power: 4, trait: '全地形タイヤ', traitDesc: '汚れた床でも遅くならない', desc: '物置の設計図から生まれたお掃除ロボ。', mods: { noDirtSlow: true } },
    { id: 'reika', name: 'お嬢様 レイカ', weapons: ['purifier'], hp: 60, speed: 0.9, unlock: 4, power: 1, trait: '箱入り娘', traitDesc: '体力が低く足も遅く、攻撃力 -15%。そのかわり、もらえるコイン +30%', desc: 'お屋敷育ちのお嬢様。空気清浄機がないと一歩も動けない。', mods: { coin: 0.3, might: -0.15 } },
    { id: 'koroko', name: 'コロコロ使い コロ子', weapons: ['roller'], hp: 110, speed: 1, unlock: 5, power: 3, trait: '拾い上手', traitDesc: '回収範囲 +40%・ダストボックス +40', desc: '伝説のコロコロを受け継いだ、片付け好きの女の子。', mods: { magnet: 0.4, box: 40 } },
    { id: 'kiyoshi', name: '除菌博士 キヨシ', weapons: ['spray'], hp: 85, speed: 1, unlock: 7, power: 3, trait: '免疫ばっちり', traitDesc: 'アレルギーにならない・カビ系へのダメージ +50%', desc: 'カビの研究ひとすじの博士。なくした研究ノートを探していた。', mods: { allergyImmune: true, mold: 0.5 } },
    { id: 'gou', name: 'お掃除番長 ゴウ', weapons: ['mop'], fav: 1.6, hp: 160, speed: 0.95, unlock: 8, power: 5, trait: '番長の気合', traitDesc: '攻撃力 +15%・受けるダメージ -2', desc: 'モップ一本で町じゅうを掃除してきた番長。打たれ強さは屋敷いち。', mods: { might: 0.15, armor: 2 } },
    { id: 'tome', name: '片付け名人 トメ', weapons: ['vacuum', 'roller'], hp: 130, speed: 0.9, unlock: 9, power: 4, trait: '年の功', traitDesc: '2つのギアで出撃・経験値 +25%', desc: '屋敷の昔の管理人。足は遅いが、知恵と経験は誰にも負けない。', mods: { xp: 0.25 } },
  ];

  const FAV_MUL = 1.25; // 得意なギア (清掃員の最初のギア) の攻撃力

  // モード。ハードは恒久スキルを半分ほど上げてから挑む想定
  const MODES = {
    normal: { key: 'n', name: 'ノーマル', hp: 1, dmg: 1, density: 1, src: 1, coin: 1 },
    hard: { key: 'h', name: 'ハード', hp: 3, dmg: 2.7, density: 1.2, src: 2.5, coin: 1.6 },
  };
  // ハードのステージごとの強さ (ゴミの HP・接触ダメージ・発生源の HP にかける)。自動プレイで、
  // 恒久スキルが半分未満だとまずクリアできず、半分でクリアが見えてくるようにそろえた。
  // 最終ステージは恒久スキルを 8 割ほど上げて、勝率が半分くらいになる強さ
  const HARD_STAGE = [2.5, 1.65, 1.25, 1.2, 1.45, 1.6, 1.05, 1, 0.95, 0.95];
  const modeOf = (mode, stageIdx) => {
    const md = MODES[mode];
    const k = mode === 'hard' ? HARD_STAGE[stageIdx] || 1 : 1;
    return { ...md, hp: md.hp * k, dmg: md.dmg * k, src: md.src * k };
  };

  // 部屋を完全に清掃したときの特典
  const ROOM_BONUS = {
    speed: '移動速度 +10%',
    magnet: '回収範囲 +25%',
    hp: '最大体力 +20',
    regen: '体力が毎秒 0.5 回復',
    might: '攻撃力 +10%',
    cd: '攻撃間隔 -6%',
    box: 'ダストボックス容量 +40',
    armor: '受けるダメージ -1',
    area: '攻撃範囲 +10%',
    heal: '体力が全回復',
  };

  // 部屋の汚れレベル (★1〜5)。高いほど汚れがキツく、ゴミが多くて強い
  //   density: 湧く量 / hp・dmg・speed: ゴミの HP・接触ダメージ・速さ / src: 発生源の HP / dirt: 最初の汚れ方
  //   upgrade: 落とすダストが一段大きくなる確率 / elite: 金色のふちのゴミになる確率 / types: 湧くゴミ
  const DANGER = [
    null,
    { density: 0.6, hp: 0.8, dmg: 0.8, speed: 1, src: 0.7, dirt: -0.35, upgrade: 0, elite: 0, types: ['dust', 'hair', 'paper'] },
    { density: 0.9, hp: 0.9, dmg: 0.9, speed: 1, src: 1, dirt: -0.15, upgrade: 0.05, elite: 0, types: ['dust', 'hair', 'paper', 'can'] },
    { density: 1.3, hp: 1.4, dmg: 1.4, speed: 1.05, src: 1.3, dirt: 0.05, upgrade: 0.2, elite: 0, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore'] },
    { density: 2.2, hp: 2.6, dmg: 2.4, speed: 1.12, src: 1.8, dirt: 0.2, upgrade: 0.4, elite: 0.01, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore', 'bag'] },
    { density: 3, hp: 4, dmg: 3.2, speed: 1.2, src: 2.5, dirt: 0.3, upgrade: 0.6, elite: 0.03, types: ['dust', 'hair', 'paper', 'can', 'grease', 'bottle', 'spore', 'bag'] },
  ];
  const TYPE_WEIGHT = { dust: 6, hair: 2.5, paper: 3, can: 1.1, grease: 0.6, bottle: 0.8, spore: 0.7, bag: 0.45 };
  const stars = (d) => '★'.repeat(d) + '☆'.repeat(5 - d);
  const DANGER_COLOR = [null, '#9fe3c8', '#d8f08a', '#ffcf4a', '#ff9a4a', '#ff5a5a'];

  // 発生源から湧きやすいゴミ (書いていないゴミは 0.25 倍)。main はどの汚れレベルでも湧く得意なゴミ
  const SOURCE_MIX = {
    pile: { dust: 1.5, hair: 1, paper: 1.5, can: 1, bag: 1, main: 'paper' },
    drain: { grease: 4, hair: 2, dust: 0.6, main: 'grease' },
    nest: { spore: 4, dust: 1, hair: 0.5, main: 'spore' },
    boxes: { paper: 2, can: 1.5, bottle: 1.5, dust: 0.6, main: 'can' },
  };

  // 間取りは 40×40 マス (1マス = BLOCK px)。rect: [x, y, 幅, 高さ]。部屋の境目は壁になり、doors の組み合わせの間にドアを開ける
  const STAGES = [
    {
      name: 'ゴミ屋敷の1階', desc: 'リビングまわり。ホコリ・紙くず・空き缶が中心。', dirt: [74, 64, 52], weights: {}, spawnMul: 1, hpMul: 1, growth: 1, boss: 'kaiju',
      rooms: [
        { id: 'genkan', name: '玄関', rect: [24, 28, 16, 12], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'rouka', name: '廊下', rect: [24, 20, 16, 8], floor: 'wood', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'living', name: 'リビング', rect: [0, 0, 24, 24], floor: 'wood', bonus: 'hp', danger: 4, src: ['pile', 'pile', 'boxes'] },
        { id: 'washitsu', name: '和室', rect: [24, 0, 16, 20], floor: 'tatami', bonus: 'regen', danger: 2, src: ['pile'] },
        { id: 'dining', name: 'ダイニング', rect: [0, 24, 24, 16], floor: 'wood', bonus: 'might', danger: 3, src: ['pile', 'boxes'] },
      ],
      doors: [['genkan', 'rouka'], ['rouka', 'washitsu'], ['rouka', 'living'], ['rouka', 'dining'], ['living', 'dining']],
      start: 'genkan',
      treasure: { room: 'living', name: '家族のアルバム', desc: 'ゴミの下から出てきた、屋敷の家族の古いアルバム。' },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '招き猫の置物', desc: '玄関の靴箱の上に埋もれていた、金色の招き猫。', cond: { type: 'kills', enemy: 'dust', n: 1500 } },
      dumps: [['rouka', 0.5, 0.5], ['living', 0.3, 0.3]],
    },
    {
      name: '呪われた台所', desc: '油汚れと生ゴミが多い。排水口から油汚れが湧き、床がすぐドロドロに戻る。', dirt: [112, 86, 24], weights: { grease: 3, bag: 2 }, spawnMul: 1.15, hpMul: 1.25, growth: 1.7, boss: 'kaiju',
      rooms: [
        { id: 'rouka', name: '廊下', rect: [0, 16, 40, 7], floor: 'wood', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'dining', name: 'ダイニング', rect: [0, 0, 22, 16], floor: 'wood', bonus: 'might', danger: 3, src: ['pile', 'pile'] },
        { id: 'kitchen', name: 'キッチン', rect: [22, 0, 18, 16], floor: 'kitchen', bonus: 'heal', danger: 5, src: ['drain', 'drain', 'pile'] },
        { id: 'pantry', name: 'パントリー', rect: [0, 23, 14, 17], floor: 'concrete', bonus: 'box', danger: 3, src: ['boxes', 'boxes'], boxes: 5 },
        { id: 'laundry', name: '洗濯室', rect: [14, 23, 14, 17], floor: 'bath', bonus: 'area', danger: 2, src: ['drain'] },
        { id: 'katte', name: '勝手口', rect: [28, 23, 12, 17], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
      ],
      doors: [['rouka', 'dining'], ['rouka', 'kitchen'], ['dining', 'kitchen'], ['rouka', 'pantry'], ['rouka', 'laundry'], ['rouka', 'katte']],
      start: 'katte',
      treasure: { room: 'kitchen', name: '金の蛇口', desc: 'ピカピカに光る純金の蛇口。水の使い手が欲しがっていた。', cond: { type: 'kills', enemy: 'grease', n: 120 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '銀のお玉', desc: '屋敷の料理番が愛用していた、ずっしり重い銀のお玉。', cond: { type: 'roomTime', room: 'pantry', t: 240 } },
      dumps: [['rouka', 0.2, 0.5], ['rouka', 0.8, 0.5]],
    },
    {
      name: 'カビだらけの水まわり', desc: 'カビの胞子が多い。浴室の床は滑る。', dirt: [52, 78, 50], weights: { spore: 2.5 }, spawnMul: 1.2, hpMul: 1.35, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'rouka', name: '廊下', rect: [16, 0, 8, 40], floor: 'wood', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'bath', name: '浴室', rect: [24, 0, 16, 22], floor: 'bath', bonus: 'cd', danger: 5, src: ['nest', 'nest', 'nest'], slippery: true },
        { id: 'datsui', name: '脱衣所', rect: [24, 22, 16, 18], floor: 'wood', bonus: 'regen', danger: 3, src: ['nest', 'nest'] },
        { id: 'toilet', name: 'トイレ', rect: [0, 0, 16, 14], floor: 'bath', bonus: 'armor', danger: 2, src: ['drain'] },
        { id: 'senmen', name: '洗面所', rect: [0, 14, 16, 26], floor: 'bath', bonus: 'area', danger: 3, src: ['nest', 'drain'] },
      ],
      doors: [['rouka', 'bath'], ['rouka', 'datsui'], ['rouka', 'toilet'], ['rouka', 'senmen'], ['bath', 'datsui']],
      start: 'rouka',
      treasure: { room: 'bath', name: '真珠の石けん', desc: '泡が真珠のように光る、不思議な石けん。', cond: { type: 'kills', enemy: 'spore', n: 180 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '幸運のサイコロ', desc: '湯船の底に沈んでいた、運命を選び直せるというサイコロ。', perk: 'reroll' },
      dumps: [['rouka', 0.5, 0.25], ['datsui', 0.5, 0.6]],
    },
    {
      name: '開かずの物置と2階', desc: '物置と納戸は段ボールだらけで通路が狭い。', dirt: [70, 62, 52], weights: { paper: 1.5, bag: 1.5 }, spawnMul: 1.3, hpMul: 1.55, growth: 1.2, boss: 'kaiju',
      rooms: [
        { id: 'kids', name: '子ども部屋', rect: [0, 0, 24, 14], floor: 'wood', bonus: 'speed', danger: 2, src: ['pile'] },
        { id: 'study', name: '書斎', rect: [24, 0, 16, 26], floor: 'carpet', bonus: 'might', danger: 3, src: ['boxes', 'pile'] },
        { id: 'hall', name: '階段ホール', rect: [0, 14, 24, 12], floor: 'wood', bonus: 'heal', danger: 1, src: ['pile'] },
        { id: 'storage', name: '物置', rect: [0, 26, 22, 14], floor: 'concrete', bonus: 'box', danger: 5, src: ['boxes', 'boxes', 'boxes'], boxes: 14 },
        { id: 'nando', name: '納戸', rect: [22, 26, 18, 14], floor: 'concrete', bonus: 'armor', danger: 4, src: ['boxes', 'boxes'], boxes: 10 },
      ],
      doors: [['hall', 'kids'], ['hall', 'study'], ['hall', 'storage'], ['study', 'nando'], ['storage', 'nando']],
      start: 'hall',
      treasure: { room: 'storage', name: 'ロボットの設計図', desc: '物置の奥にしまわれていた、お掃除ロボの設計図。', cond: { type: 'roomTime', room: 'study', t: 180 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: 'からくり人形', desc: 'ねじを巻くと、ほうきで床を掃くしぐさをする古い人形。', cond: { type: 'srcTime', t: 390 } },
      dumps: [['hall', 0.5, 0.5], ['study', 0.5, 0.75]],
    },
    {
      name: '荒れ果てた庭', desc: '生け垣で区切られた庭。池のまわりはカビだらけ。', dirt: [58, 70, 38], weights: { spore: 1.5, hair: 1.5 }, spawnMul: 1.35, hpMul: 1.65, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'gate', name: '門', rect: [16, 32, 8, 8], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'path', name: '小道', rect: [16, 14, 8, 18], floor: 'stone', bonus: 'magnet', danger: 1, src: ['pile'] },
        { id: 'front', name: '前庭', rect: [0, 24, 16, 16], floor: 'grass', bonus: 'regen', danger: 2, src: ['pile'] },
        { id: 'flower', name: '花壇', rect: [24, 24, 16, 16], floor: 'grass', bonus: 'area', danger: 3, src: ['nest', 'pile'] },
        { id: 'yard', name: '物干し場', rect: [0, 0, 16, 24], floor: 'grass', bonus: 'might', danger: 3, src: ['pile', 'boxes'] },
        { id: 'shed', name: '物置小屋', rect: [24, 14, 16, 10], floor: 'concrete', bonus: 'box', danger: 4, src: ['boxes', 'boxes'], boxes: 4 },
        { id: 'pond', name: '池のほとり', rect: [16, 0, 24, 14], floor: 'grass', bonus: 'cd', danger: 5, src: ['nest', 'nest', 'drain'] },
      ],
      doors: [['gate', 'path'], ['gate', 'front'], ['path', 'front'], ['path', 'flower'], ['path', 'shed'], ['path', 'pond'], ['path', 'yard'], ['yard', 'pond'], ['flower', 'shed']],
      start: 'gate',
      treasure: { room: 'pond', name: '四つ葉のクローバー', desc: '池のほとりに一本だけ生えていた、幸運の四つ葉。', cond: { type: 'roomTime', room: 'flower', t: 120 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '金のじょうろ', desc: '花壇の土に埋まっていた、金色に輝くじょうろ。', cond: { type: 'kills', enemy: 'spore', n: 100 } },
      dumps: [['path', 0.5, 0.4], ['front', 0.5, 0.5]],
    },
    {
      name: 'ほこりの屋根裏', desc: 'ホコリと抜け毛が舞う屋根裏。段ボールだらけ。', dirt: [84, 76, 66], weights: { dust: 1.8, hair: 1.5, paper: 1.3 }, spawnMul: 1.4, hpMul: 1.75, growth: 1.2, boss: 'kaiju',
      rooms: [
        { id: 'stairs', name: '階段口', rect: [16, 30, 8, 10], floor: 'attic', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'passage', name: '通路', rect: [0, 22, 40, 8], floor: 'attic', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'oldclothes', name: '古着部屋', rect: [0, 0, 14, 22], floor: 'attic', bonus: 'regen', danger: 3, src: ['pile', 'nest'] },
        { id: 'chests', name: '長持ち置き場', rect: [14, 0, 12, 22], floor: 'attic', bonus: 'box', danger: 4, src: ['boxes', 'boxes'], boxes: 8 },
        { id: 'skylight', name: '天窓の間', rect: [26, 0, 14, 22], floor: 'attic', bonus: 'might', danger: 3, src: ['pile', 'pile'] },
        { id: 'nook', name: '物置き', rect: [0, 30, 16, 10], floor: 'attic', bonus: 'armor', danger: 2, src: ['boxes'], boxes: 4 },
        { id: 'secret', name: '奥の隠し部屋', rect: [24, 30, 16, 10], floor: 'attic', bonus: 'heal', danger: 5, src: ['nest', 'pile', 'boxes'] },
      ],
      doors: [['stairs', 'passage'], ['nook', 'passage'], ['secret', 'passage'], ['passage', 'oldclothes'], ['passage', 'chests'], ['passage', 'skylight']],
      start: 'stairs',
      treasure: { room: 'secret', name: '伝説のコロコロ', desc: 'どんなゴミでも巻き取るという、伝説の粘着ローラー。', cond: { type: 'kills', enemy: 'paper', n: 200 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '不死鳥の羽根ぼうき', desc: '屋根裏の奥に隠されていた、何度でもよみがえるという羽根ぼうき。', perk: 'revive' },
      dumps: [['passage', 0.2, 0.5], ['passage', 0.8, 0.5]],
    },
    {
      name: '地下のボイラー室', desc: '油汚れとカビが広がる地下。ボイラー室は排水口だらけ。', dirt: [62, 56, 44], weights: { grease: 2.5, spore: 1.5 }, spawnMul: 1.5, hpMul: 1.9, growth: 1.6, boss: 'kaiju',
      rooms: [
        { id: 'under', name: '階段下', rect: [0, 32, 10, 8], floor: 'concrete', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'corridor', name: '地下通路', rect: [0, 24, 40, 8], floor: 'concrete', bonus: 'magnet', danger: 2, src: ['drain'] },
        { id: 'cellar', name: 'ワイン蔵', rect: [0, 0, 13, 24], floor: 'stone', bonus: 'regen', danger: 3, src: ['boxes', 'nest'] },
        { id: 'washroom', name: '洗い場', rect: [13, 0, 14, 24], floor: 'bath', bonus: 'area', danger: 3, src: ['drain', 'drain'], slippery: true },
        { id: 'boiler', name: 'ボイラー室', rect: [27, 0, 13, 24], floor: 'concrete', bonus: 'might', danger: 5, src: ['drain', 'drain', 'pile'] },
        { id: 'store', name: '貯蔵庫', rect: [10, 32, 30, 8], floor: 'concrete', bonus: 'box', danger: 4, src: ['boxes', 'pile'], boxes: 6 },
      ],
      doors: [['under', 'corridor'], ['store', 'corridor'], ['corridor', 'cellar'], ['corridor', 'washroom'], ['corridor', 'boiler'], ['under', 'store']],
      start: 'under',
      treasure: { room: 'boiler', name: '古い懐中時計', desc: 'ボイラーの裏で見つかった、まだ動いている懐中時計。', cond: { type: 'boss', boss: 'yokai' } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '真鍮の歯車', desc: 'ボイラーの心臓部から外れた、ピカピカの大きな歯車。', cond: { type: 'clearTime', t: 450 } },
      dumps: [['corridor', 0.25, 0.5], ['corridor', 0.75, 0.5]],
    },
    {
      name: 'ガラクタの車庫', desc: '空き缶とペットボトルが転がる車庫。物置は段ボールの山。', dirt: [56, 56, 60], weights: { can: 2.5, bottle: 2.5, paper: 1.2 }, spawnMul: 1.55, hpMul: 2.05, growth: 1.3, boss: 'kaiju',
      rooms: [
        { id: 'side', name: '通用口', rect: [0, 0, 10, 14], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'bench', name: '作業台', rect: [10, 0, 14, 14], floor: 'concrete', bonus: 'cd', danger: 2, src: ['boxes'] },
        { id: 'garage', name: '車庫', rect: [0, 14, 24, 26], floor: 'concrete', bonus: 'hp', danger: 3, src: ['pile', 'boxes'], boxes: 6 },
        { id: 'tools', name: '工具置き場', rect: [24, 0, 16, 12], floor: 'concrete', bonus: 'might', danger: 3, src: ['boxes', 'pile'] },
        { id: 'tires', name: '廃タイヤの山', rect: [24, 12, 16, 14], floor: 'concrete', bonus: 'armor', danger: 4, src: ['pile', 'pile'] },
        { id: 'back', name: '奥の物置', rect: [24, 26, 16, 14], floor: 'concrete', bonus: 'heal', danger: 5, src: ['boxes', 'boxes', 'drain'], boxes: 8 },
      ],
      doors: [['side', 'bench'], ['side', 'garage'], ['bench', 'garage'], ['bench', 'tools'], ['garage', 'tires'], ['tools', 'tires'], ['tires', 'back'], ['garage', 'back']],
      start: 'side',
      treasure: { room: 'back', name: '除菌博士の研究ノート', desc: 'カビと戦い続けた博士の研究ノート。持ち主が探している。', cond: { type: 'kills', enemy: 'bottle', n: 35 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: 'レトロなラジオ', desc: 'ガラクタの山から出てきた、まだ音が鳴る古いラジオ。', cond: { type: 'dumps', n: 10 } },
      dumps: [['garage', 0.3, 0.3], ['garage', 0.5, 0.85]],
    },
    {
      name: '幽霊の大宴会場', desc: '宴のあとの大広間。生ゴミと油汚れが山盛り。', dirt: [76, 52, 40], weights: { bag: 2, grease: 1.5 }, spawnMul: 1.6, hpMul: 2.2, growth: 1.5, boss: 'kaiju',
      rooms: [
        { id: 'lobby', name: 'ロビー', rect: [14, 30, 12, 10], floor: 'carpet', bonus: 'speed', danger: 1, src: ['pile'] },
        { id: 'cloak', name: 'クローク', rect: [0, 30, 14, 10], floor: 'wood', bonus: 'magnet', danger: 2, src: ['pile'] },
        { id: 'pantry', name: '配膳室', rect: [26, 30, 14, 10], floor: 'kitchen', bonus: 'regen', danger: 3, src: ['drain', 'pile'] },
        { id: 'hall', name: '大宴会場', rect: [0, 0, 26, 30], floor: 'carpet', bonus: 'hp', danger: 4, src: ['pile', 'pile', 'boxes', 'drain'] },
        { id: 'stage', name: '舞台', rect: [26, 0, 14, 16], floor: 'wood', bonus: 'might', danger: 5, src: ['nest', 'pile', 'boxes'] },
        { id: 'green', name: '楽屋', rect: [26, 16, 14, 14], floor: 'wood', bonus: 'area', danger: 3, src: ['nest'] },
      ],
      doors: [['lobby', 'cloak'], ['lobby', 'pantry'], ['lobby', 'hall'], ['cloak', 'hall'], ['hall', 'stage'], ['hall', 'green'], ['green', 'stage'], ['green', 'pantry']],
      start: 'lobby',
      treasure: { room: 'stage', name: '銀の燭台', desc: '舞台の上に残されていた、幽霊のお気に入りの燭台。', cond: { type: 'kills', enemy: 'bag', n: 80 } },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '幽霊の招待状', desc: '宴に招かれた幽霊たちの名前が並ぶ、古い招待状。', cond: { type: 'hpKeep', pct: 30 } },
      dumps: [['hall', 0.3, 0.85], ['lobby', 0.5, 0.5]],
    },
    {
      name: '屋敷の主の間', desc: 'すべてのゴミが現れる最後のステージ。ボスは「ゴミ屋敷の主」。', dirt: [52, 40, 46], weights: { grease: 1.5, spore: 1.5, bag: 1.5 }, spawnMul: 1.7, hpMul: 2.4, growth: 1.5, boss: 'master',
      rooms: [
        { id: 'shoko', name: '書庫', rect: [0, 0, 14, 14], floor: 'carpet', bonus: 'cd', danger: 3, src: ['boxes', 'boxes'] },
        { id: 'bedroom', name: '寝室', rect: [14, 0, 12, 14], floor: 'carpet', bonus: 'regen', danger: 3, src: ['pile', 'nest'] },
        { id: 'closet', name: '衣装部屋', rect: [26, 0, 14, 14], floor: 'wood', bonus: 'area', danger: 4, src: ['nest', 'pile'] },
        { id: 'hall', name: '大広間', rect: [0, 14, 22, 26], floor: 'carpet', bonus: 'hp', danger: 2, src: ['pile', 'drain'] },
        { id: 'master', name: '主の間', rect: [22, 14, 18, 26], floor: 'carpet', bonus: 'might', danger: 5, src: ['pile', 'nest', 'boxes', 'drain'] },
      ],
      doors: [['hall', 'shoko'], ['hall', 'bedroom'], ['shoko', 'bedroom'], ['bedroom', 'closet'], ['closet', 'master'], ['hall', 'master']],
      start: 'hall',
      treasure: { room: 'master', name: '屋敷の鍵', desc: '屋敷じゅうの扉を開けられる古い鍵。昔の管理人が持っていた。' },
      // ハードの宝物 (見つかる部屋はノーマルと同じ)
      treasureH: { name: '黄金のちりとり', desc: '屋敷の主が最後まで手放さなかった、純金のちりとり。', cond: { type: 'boss', boss: 'master' } },
      dumps: [['hall', 0.3, 0.3], ['master', 0.5, 0.85]],
    },
  ];

  // 恒久スキル (コインで上げる。次のプレイからずっと効く)。段階数は前の2倍 (選択肢の数だけはそのまま)
  const SHOP = [
    { id: 'hp', name: '体力', desc: '最大体力 +12', max: 20, cost: 40 },
    { id: 'might', name: '攻撃力', desc: '攻撃力 +8%', max: 20, cost: 60 },
    { id: 'clean', name: '清掃力', desc: '歩いて磨く範囲 +12%・ギアが床を磨く範囲 +6%', max: 10, cost: 70 },
    { id: 'speed', name: '移動速度', desc: '移動速度 +4%', max: 10, cost: 60 },
    { id: 'armor', name: '防御', desc: '受けるダメージ -1', max: 6, cost: 250 },
    { id: 'regen', name: '自然回復', desc: '体力が毎秒 0.2 回復', max: 6, cost: 150 },
    { id: 'magnet', name: '回収範囲', desc: '回収範囲 +10%', max: 10, cost: 40 },
    { id: 'xp', name: '経験値', desc: 'もらえる経験値 +8%', max: 10, cost: 80 },
    { id: 'box', name: 'ダストボックス容量', desc: '容量 +20', max: 6, cost: 50 },
    { id: 'coin', name: 'コイン', desc: 'もらえるコイン +10%', max: 10, cost: 100 },
    { id: 'choices', name: '選択肢の数', desc: 'レベルアップの候補 3 → 4', max: 1, cost: 500 },
  ];
  const shopCost = (item, lv) => item.cost * (lv + 1);

  // ---- 英語の名前と説明 (日本語はそれぞれのデータに書いてある) ----
  const EN_ENEMIES = {
    dust: ['Dust Bunny', 'Weak, but swarms in huge numbers. Found in every room.'],
    hair: ['Hairball', 'Mixed in with the dust. Getting tangled up slows you down a little.'],
    paper: ['Paper Wad', 'The most ordinary trash. Chases you straight on.'],
    can: ['Empty Can', 'Rolls in and rams you. It hurts.'],
    bottle: ['Plastic Bottle', 'Faster and tougher than a can. Bounces off walls.'],
    grease: ['Sticky Grease', 'A gooey slime. Turns the floor filthy and slows you a lot on contact.'],
    spore: ['Mold Spore', 'Keeps its distance and scatters spores. Breathing them in causes an allergy that drains HP.'],
    bag: ['Garbage Bag', 'Bursts when cleared, spilling the trash inside.'],
    pile: ['Trash Heap', 'A source that keeps spawning trash and dirtying the floor until you destroy it.'],
    drain: ['Overflowing Drain', 'A source that spews sticky grease and hair.'],
    nest: ['Mold Nest', 'A source of mold spores. Sanitizer spray works well on it.'],
    boxes: ['Box Pile', 'A source that rolls out paper wads and cans.'],
    yokai: ['Garbage Ghoul', 'The mid-boss that appears at 5:00. Scatters trash as it closes in.'],
    kaiju: ['Mold Monster', 'The boss that appears at 9:00. Covers the floor in mold and fires spore shots.'],
    master: ['Lord of the Trash House', 'The boss of the Master\'s Hall. Controls everything in the trash house.'],
  };
  const EN_WEAPONS = {
    vacuum: ['Turbo Vacuum', 'Points a cone-shaped nozzle at nearby trash and damages everything in it.',
      ['Damage +2', 'Suction range +15', 'Suction angle +15°', 'Damage +3', 'Suction interval −0.06s', 'Suction range +20', 'Damage +4, angle +15°']],
    washer: ['Pressure Washer', 'Fires a water jet at nearby trash, piercing and knocking it back.',
      ['Jets +1', 'Damage +5', 'Jet width +5', 'Jets +1', 'Damage +6', 'Range +80, interval −0.2s', 'Jets +1, damage +6']],
    robot: ['Cleaning Robot', 'Spins around you, smashing trash and polishing the floor.',
      ['Robots +1', 'Damage +3', 'Orbit radius +16', 'Robots +1', 'Faster spin, damage +3', 'Robot size +4', 'Robots +1']],
    spray: ['Sanitizer Spray', 'Leaves a lingering sanitizing mist around you. Double damage to mold.',
      ['Mists +1', 'Mist size +8', 'Damage +2', 'Duration +0.6s', 'Mists +1', 'Mist size +10', 'Damage +3, mists +1']],
    roller: ['Lint Roller', 'Follows behind you, rolling up trash and dirt along your path.',
      ['Damage +3', 'Width +8', 'Damage +3', 'Rollers +1', 'Width +8', 'Damage +4', 'Rollers +1']],
    mop: ['Mop', 'Sweeps a wide arc ahead, knocking trash away and scrubbing the floor hard.',
      ['Damage +4', 'Reach +12', 'Interval −0.12s', 'Damage +5', 'Sweep angle +40°', 'Reach +16', 'Damage +6, interval −0.1s']],
    duster: ['Feather Duster', 'Thrown like a boomerang, it swats trash on the way out and back. Pierces.',
      ['Damage +3', 'Dusters +1', 'Distance +40', 'Size +4, damage +3', 'Dusters +1', 'Interval −0.25s', 'Damage +5, dusters +1']],
    bomb: ['Detergent Bomb', 'Lobs detergent into clusters of trash; the bursting foam cleans them all up.',
      ['Damage +6', 'Blast size +10', 'Bombs +1', 'Interval −0.3s', 'Damage +8', 'Blast size +12', 'Bombs +1, damage +6']],
    purifier: ['Air Purifier', 'Keeps the air around you clean, slowly damaging and pushing back trash that comes close.',
      ['Radius +8', 'Damage +2', 'Interval −0.08s', 'Radius +10', 'Damage +3', 'Radius +10, interval −0.06s', 'Damage +4']],
    press: ['Dust Press', 'Packs down the contents of your dust box bit by bit to release a shockwave. The more dust, the stronger it is, and it frees up box space too.',
      ['Shockwave size +20', 'Damage +4', 'Interval −0.6s', 'Amount packed +5%', 'Shockwave size +25', 'Damage +6', 'Interval −0.7s, amount packed +5%']],
    sponge: ['Magic Sponge', 'Bounces off walls as it flies around the room, scrubbing off trash and dirt.',
      ['Damage +3', 'Sponges +1', 'Flight time +1s', 'Size +4', 'Damage +4, faster', 'Sponges +1', 'Damage +5, flight time +1s']],
  };
  const EN_EVOS = {
    blackhole: ['Black Hole Vacuum', 'Places a suction vortex ahead that damages all trash inside it.'],
    steam: ['Superheated Steam Cannon', 'A thick, long steam beam that instantly polishes everything along its line.'],
    army: ['Robot Cleaning Squad', 'More, bigger robots spin around you faster, smashing trash and polishing a wider path.'],
    acid: ['Acid Rain Mist', 'Rains sanitizer all over the screen.'],
    giant: ['Giant Steamroller', 'A huge roller that polishes everything along your path and crushes trash.'],
    tornado: ['Tornado Mop', 'Keeps sweeping all around you at high speed.'],
    gale: ['Wind God Duster', 'Several big dusters fly out and bring back the dust along their path.'],
    foam: ['Foam Explosion', 'Huge blasts leave foam behind that keeps dissolving trash for a while.'],
    aura: ['Purifying Barrier', 'A huge barrier that burns trash and slows anything inside it.'],
    megapress: ['Mega Compactor', 'A screen-wide shockwave that also cleans the floor in one go.'],
    meteor: ['Sponge Meteor Shower', 'Many big sponges bounce around for a long time, polishing the whole room.'],
  };
  const EN_PASSIVES = {
    battery: ['Extra Battery', 'Gear attack interval −8%'],
    boiler: ['Hot Water Boiler', 'Gear damage +10%'],
    roomba: ['Extra Cleaning Robot', 'Gear count +1 (jets, robots, mists, dusters, bombs, sponges)'],
    bleach: ['Strong Bleach', 'Attack area +10%'],
    tape: ['Super Sticky Tape', 'Effect duration +10%'],
    dustpack: ['Big Dust Pack', 'Dust box capacity +40, pickup range +20%'],
    boots: ['Rain Boots', 'Halves slowdown on dirty floors, HP +20'],
    gloves: ['Rubber Gloves', 'Damage taken −1'],
    hydraulic: ['Hydraulic Cylinder', 'Knockback +25%, dust box capacity +15'],
    filter: ['HEPA Filter', 'Regenerate 0.25 HP per second'],
    wax: ['Floor Wax', 'Move speed +6%, gear projectile speed +10%'],
  };
  // [名前, 個性, 個性の説明, 紹介]
  const EN_CHARS = {
    cleaner: ['Hajime the Cleaner', 'Floor Polishing Pro', 'Polishing radius while walking +40%', 'A legendary cleaner. A serious veteran who never misses a speck of dirt.'],
    mizuki: ['Mizuki the Washer', 'Pressure Fanatic', 'Damage +15%', 'An impatient washer who loves her pressure washer.'],
    runta: ['Runta the Robo', 'All-Terrain Wheels', 'Not slowed by dirty floors', 'A cleaning robot built from the blueprints in the storeroom.'],
    koroko: ['Koroko the Roller', 'Good Picker', 'Pickup range +40%, dust box +40', 'A tidy-loving girl who inherited the legendary lint roller.'],
    kiyoshi: ['Dr. Kiyoshi', 'Strong Immunity', 'Immune to allergies, +50% damage to mold', 'A doctor devoted to mold research. He was looking for his lost notebook.'],
    tsugumi: ['Tsugumi the Trainee', 'Still Learning', 'Damage −20%, XP +10%', 'A trainee who just arrived at the mansion. Nobody beats her with a magic sponge, though.'],
    hayate: ['Hayate the Gale', 'Gale Duster', 'Attack interval −10%', 'A fast cleaner who throws dusters like the wind. Not great at taking hits.'],
    reika: ['Lady Reika', 'Sheltered Princess', 'Low HP, slow and damage −15%, but coins +30%', 'A young lady raised in a mansion. She can\'t take a step without her air purifier.'],
    gou: ['Gou the Boss', 'Boss\'s Grit', 'Damage +15%, damage taken −2', 'A tough boss who has cleaned the whole town with just a mop. Nobody in the mansion is sturdier.'],
    tome: ['Grandma Tome', 'Wisdom of Age', 'Starts with 2 gears, XP +25%', 'The mansion\'s former caretaker. Slow on her feet, but nobody beats her wisdom and experience.'],
  };
  const EN_BONUS = {
    speed: 'Move speed +10%',
    magnet: 'Pickup range +25%',
    hp: 'Max HP +20',
    regen: 'Regenerate 0.5 HP/s',
    might: 'Damage +10%',
    cd: 'Attack interval −6%',
    box: 'Dust box capacity +40',
    armor: 'Damage taken −1',
    area: 'Attack area +10%',
    heal: 'Fully restores HP',
  };
  const EN_SHOP = {
    hp: ['Health', 'Max HP +12'],
    might: ['Power', 'Damage +8%'],
    clean: ['Cleaning Power', 'Walking polish radius +12%, gear polish area +6%'],
    speed: ['Move Speed', 'Move speed +4%'],
    armor: ['Defense', 'Damage taken −1'],
    regen: ['Regeneration', 'Regenerate 0.2 HP/s'],
    magnet: ['Pickup Range', 'Pickup range +10%'],
    xp: ['Experience', 'XP gained +8%'],
    box: ['Dust Box', 'Capacity +20'],
    coin: ['Coins', 'Coins earned +10%'],
    choices: ['Choices', 'Level-up choices 3 → 4'],
  };
  // ステージごとに [名前, 説明, { 部屋: 名前 }, [宝物の名前, 説明]]
  const EN_STAGES = [
    ['The Trash House: 1st Floor', 'Around the living room. Mostly dust, paper and cans.',
      { genkan: 'Entrance', rouka: 'Hallway', living: 'Living Room', washitsu: 'Tatami Room', dining: 'Dining Room' },
      ['Family Album', 'An old album of the mansion\'s family, found under the trash.']],
    ['The Cursed Kitchen', 'Lots of grease and garbage. Drains spew grease and the floor gets filthy fast.',
      { rouka: 'Hallway', dining: 'Dining Room', kitchen: 'Kitchen', pantry: 'Pantry', laundry: 'Laundry Room', katte: 'Back Door' },
      ['Golden Faucet', 'A shiny faucet of pure gold. A certain water expert has always wanted one.']],
    ['The Moldy Washrooms', 'Full of mold spores. The bathroom floor is slippery.',
      { rouka: 'Hallway', bath: 'Bathroom', datsui: 'Changing Room', toilet: 'Toilet', senmen: 'Washroom' },
      ['Pearl Soap', 'A mysterious soap whose bubbles shine like pearls.']],
    ['The Sealed Storeroom & 2nd Floor', 'The storeroom and closet are packed with cardboard, and the paths are narrow.',
      { kids: 'Kids\' Room', study: 'Study', hall: 'Stair Hall', storage: 'Storeroom', nando: 'Closet' },
      ['Robot Blueprints', 'Blueprints of a cleaning robot, stashed deep in the storeroom.']],
    ['The Overgrown Garden', 'A garden divided by hedges. The pond is full of mold.',
      { gate: 'Gate', path: 'Path', front: 'Front Yard', flower: 'Flower Bed', yard: 'Laundry Yard', shed: 'Shed', pond: 'Pondside' },
      ['Four-Leaf Clover', 'A lucky four-leaf clover, the only one growing by the pond.']],
    ['The Dusty Attic', 'An attic swirling with dust and hair. Cardboard everywhere.',
      { stairs: 'Attic Stairs', passage: 'Passage', oldclothes: 'Old Clothes Room', chests: 'Chest Storage', skylight: 'Skylight Room', nook: 'Nook', secret: 'Secret Room' },
      ['Legendary Lint Roller', 'A legendary lint roller said to pick up any kind of trash.']],
    ['The Basement Boiler Room', 'A basement overrun by grease and mold. The boiler room is full of drains.',
      { under: 'Under the Stairs', corridor: 'Basement Corridor', cellar: 'Wine Cellar', washroom: 'Wash Area', boiler: 'Boiler Room', store: 'Storage' },
      ['Old Pocket Watch', 'A pocket watch found behind the boiler. It still ticks.']],
    ['The Junk Garage', 'A garage littered with cans and bottles. The back shed is a mountain of boxes.',
      { side: 'Side Door', bench: 'Workbench', garage: 'Garage', tools: 'Tool Corner', tires: 'Tire Pile', back: 'Back Shed' },
      ['Dr. Sanitizer\'s Notebook', 'Notes of a doctor who fought mold for years. Its owner is looking for it.']],
    ['The Haunted Banquet Hall', 'The great hall after the feast. Heaps of garbage and grease.',
      { lobby: 'Lobby', cloak: 'Cloakroom', pantry: 'Serving Room', hall: 'Banquet Hall', stage: 'Stage', green: 'Green Room' },
      ['Silver Candlestick', 'A candlestick left on the stage. The ghosts\' favorite.']],
    ['The Master\'s Hall', 'The final stage, where every kind of trash appears. The boss is the Lord of the Trash House.',
      { shoko: 'Library', bedroom: 'Bedroom', closet: 'Wardrobe', hall: 'Great Hall', master: 'Master\'s Room' },
      ['Mansion Key', 'An old key that opens every door in the mansion. It belonged to the former caretaker.']],
  ];

  // チュートリアル: 10 ステージとは別の、3部屋だけの小さな家 (達成率や記録には入らない)。
  // 家のまわりは「外」(通れない、何も描かない) にして、2〜3分で回れる広さにする
  const TUT = -1;
  const TUTORIAL = {
    name: 'チュートリアル', desc: '遊び方を覚える、3部屋だけの小さな家。', dirt: [74, 64, 52], weights: {}, spawnMul: 0.7, hpMul: 0.75, growth: 0.5, boss: 'kaiju',
    rooms: [
      { id: 'genkan', name: '玄関', rect: [9, 20, 12, 10], floor: 'stone', bonus: 'speed', danger: 1, src: ['pile'] },
      { id: 'living', name: 'リビング', rect: [21, 20, 10, 10], floor: 'wood', bonus: 'hp', danger: 1, src: ['pile'] },
      { id: 'washitsu', name: '和室', rect: [9, 12, 22, 8], floor: 'tatami', bonus: 'might', danger: 2, src: ['pile', 'boxes'] },
    ],
    doors: [['genkan', 'living'], ['genkan', 'washitsu'], ['living', 'washitsu']],
    start: 'genkan',
    startAt: [0.3, 0.78],
    treasure: null,
    dumps: [['genkan', 0.78, 0.78]],
  };
  const stageOf = (i) => (i === TUT ? TUTORIAL : STAGES[i]);

  // ハードの宝物の英語 [名前, 説明] (ステージ順)
  const EN_HARD_TREASURES = [
    ['Lucky Cat Figurine', 'A golden beckoning cat buried on top of the shoe cabinet in the entrance.'],
    ['Silver Ladle', 'The heavy silver ladle the mansion\'s cook loved to use.'],
    ['Lucky Die', 'A die from the bottom of the bathtub, said to let you reroll your fate.'],
    ['Clockwork Doll', 'An old doll that sweeps the floor with a tiny broom when you wind it up.'],
    ['Golden Watering Can', 'A shining golden watering can buried in the flower bed.'],
    ['Phoenix Feather Duster', 'A feather duster hidden deep in the attic, said to rise again and again.'],
    ['Brass Gear', 'A big, gleaming gear that came loose from the heart of the boiler.'],
    ['Retro Radio', 'An old radio dug out of the junk pile. It still plays.'],
    ['Ghostly Invitation', 'An old invitation listing the names of the ghosts invited to the feast.'],
    ['Golden Dustpan', 'A pure-gold dustpan the Lord of the house never let go of.'],
  ];

  // 日本語以外の名前と説明を、それぞれのデータの .en・.zh・.ko に入れる
  //   P: { enemies, weapons, evos, passives, chars, bonus, shop, modes, stages, hardTreasures, tutorial } (形は EN_* と同じ)
  const BONUS_TEXT = { ja: ROOM_BONUS };
  function addLang(code, P) {
    for (const k in P.enemies) ENEMIES[k][code] = { name: P.enemies[k][0], desc: P.enemies[k][1] };
    for (const k in P.weapons) WEAPONS[k][code] = { name: P.weapons[k][0], desc: P.weapons[k][1], lvText: P.weapons[k][2] };
    for (const k in P.evos) EVOS[k][code] = { name: P.evos[k][0], desc: P.evos[k][1] };
    for (const k in P.passives) PASSIVES[k][code] = { name: P.passives[k][0], desc: P.passives[k][1] };
    for (const c of CHARS) {
      const [name, trait, traitDesc, desc] = P.chars[c.id];
      c[code] = { name, trait, traitDesc, desc };
    }
    for (const it of SHOP) it[code] = { name: P.shop[it.id][0], desc: P.shop[it.id][1] };
    for (const m in MODES) MODES[m][code] = { name: P.modes[m] };
    STAGES.forEach((st, i) => {
      const [name, desc, rooms, [tName, tDesc]] = P.stages[i];
      st[code] = { name, desc };
      for (const r of st.rooms) r[code] = { name: rooms[r.id] };
      st.treasure[code] = { name: tName, desc: tDesc };
      if (P.hardTreasures) st.treasureH[code] = { name: P.hardTreasures[i][0], desc: P.hardTreasures[i][1] };
    });
    const [tutName, tutDesc, tutRooms] = P.tutorial;
    TUTORIAL[code] = { name: tutName, desc: tutDesc };
    for (const r of TUTORIAL.rooms) r[code] = { name: tutRooms[r.id] };
    BONUS_TEXT[code] = P.bonus;
  }
  addLang('en', {
    enemies: EN_ENEMIES, weapons: EN_WEAPONS, evos: EN_EVOS, passives: EN_PASSIVES, chars: EN_CHARS, bonus: EN_BONUS, shop: EN_SHOP,
    modes: { normal: 'Normal', hard: 'Hard' },
    stages: EN_STAGES,
    hardTreasures: EN_HARD_TREASURES,
    tutorial: ['Tutorial', 'A tiny three-room house for learning how to play.', { genkan: 'Entrance', living: 'Living Room', washitsu: 'Tatami Room' }],
  });
  for (const code of PACK_CODES) addLang(code, I18N[code]);

  const bonusText = (key) => (BONUS_TEXT[lang] || ROOM_BONUS)[key];
  // ギアのレベルアップの説明 (レベル lv → lv+1)
  const lvText = (id, lv) => (lang === 'ja' ? WEAPONS[id].lv[lv - 1][1] : L(WEAPONS[id], 'lvText')[lv - 1]);

  // ---- 画面の文言 ----
  const TEXT = {
    ja: {
      pageTitle: 'おそうじサバイバー',
      pageDesc: '押し寄せるゴミと汚れを、清掃ギアで一気に片付けるヴァンサバ風アクション。全10ステージ・ノーマルとハード。汚れレベルの違う部屋を、10分以内に全部ピカピカにしよう。',
      gameTitle: 'おそうじサバイバー',
      backToGames: '‹ ゲーム一覧',
      pause: '一時停止',
      compress: 'ゴミ圧縮',
      board: 'ゲーム画面',
      language: '言語',
      // プレイ中
      warn: (name) => `警報! ${name}が近づいている!`,
      rush: '大群ラッシュ!',
      tooTough: 'かたい! まわりを掃除しよう',
      shieldDmg: (n) => `ダメージ ${n}%`,
      shieldNone: 'バリアなし',
      bossDown: (name) => `${name}を片付けた!`,
      srcLeft: (room, n) => `発生源を潰した! (${room} 残り ${n})`,
      srcAll: (room) => `${room}の発生源を全部潰した!`,
      dumped: (c) => `ゴミ捨て完了! +${c} コイン`,
      roomDone: (room, bonus) => `${room} ピカピカ完了! ${bonus}`,
      roomTreasure: (room) => `${room} ピカピカ完了! 宝物が現れた!`,
      timeUp: '時間切れ…',
      allClean: '全部屋 清掃完了!',
      dumpLabel: 'ゴミ',
      hudDone: (room) => `${room} 完了!`,
      hudRooms: (d, n) => `部屋 ${d}/${n} 完了`,
      hudSrc: (s, d, n) => `発生源 ${s} ・ 部屋 ${d}/${n} 完了`,
      hudKills: (k) => `片付け ${k}`,
      hudHp: (a, b) => `体力 ${a}/${b}`,
      hudBoxFull: '満タン!',
      hudBox: (a, b) => `ダストボックス ${a}/${b}`,
      // メニュー
      completion: '達成率',
      completionMeta: (c, ct, tr, tt) => `クリア ${c}/${ct} ・ 宝物 ${tr}/${tt}`,
      logoSmall: 'CLEANING SURVIVORS',
      logo: 'おそうじ<br>サバイバー',
      tagline: '押し寄せるゴミと汚れを、清掃ギアで一気に片付けろ!',
      play: 'はじめる',
      cleaners: '清掃員',
      tutorial: 'チュートリアル',
      tutorialMeta: '2〜3分で遊び方を覚える、3部屋だけの小さな家',
      recommended: 'はじめての方に',
      toStage1: 'ステージ1へ',
      noteTutorial: 'チュートリアル完了! 次はステージ1「ゴミ屋敷の1階」に挑戦しよう',
      noteTutorialRetry: 'もう一度チュートリアルに挑戦してみよう',
      tutMove: 'まずは歩いてみよう。<b>WASD・矢印キー</b> で移動。清掃ギアは<b>自動で</b>動く',
      tutMoveTouch: 'まずは歩いてみよう。<b>画面を指でなぞって</b>移動。清掃ギアは<b>自動で</b>動く',
      tutKill: 'ゴミに近づこう。近くのゴミに、清掃ギアが<b>自動で</b>ダメージを与える。キャラの足もとの<b>体力ゲージ</b>に気をつけて',
      tutDust: '片付けたゴミは<b>ダスト</b> (ひし形) を落とす。拾うと経験値になり、たまると<b>レベルアップ</b>',
      tutLevelUp: (a, b) => `レベルアップ! 清掃ギアかパッシブを1つ選ぼう。ギアは${a}つ・パッシブは${b}つまでしか持てないので、組み合わせを考えよう`,
      tutSource: '赤い点線の輪が<b>発生源</b>。ゴミはここから湧く。上のゲージは<b>汚れバリア</b>で、まわりの床を磨くほど弱くなる。まわりを磨いてから潰そう',
      tutRoom: '部屋の<b>発生源を全部潰して</b>、床を<b>90%以上</b>磨くと清掃完了。右上の%が部屋のきれいさ',
      tutChest: '清掃完了! <b>宝箱</b>と部屋ごとの特典がもらえる。宝箱を拾って開けよう',
      tutDump: '拾ったダストは左下の<b>ゴミ箱</b> (ダストボックス) にたまる。<b>満タンになると攻撃力が半分・ダストが拾えない・足が重くなる</b>。どの部屋にもある<b>緑のゴミ捨て場</b>に立って空にしよう',
      tutDanger: '★が多い部屋ほど汚れがキツく、ゴミも強い。<b>★の少ない部屋から</b>片付けよう。本番は<b>10分以内に全部屋</b>をピカピカにすればクリア。残りの部屋も片付けよう!',
      achievements: '実績',
      achClears: '清掃員ごとのクリア状況',
      settings: '設定',
      stageSelect: 'ステージを選ぶ',
      recordOf: (name) => `${name} の記録`,
      coins: 'コイン',
      hardNote: 'ハード: ゴミと発生源の HP・ダメージがノーマルの約3〜7倍 (ステージで違う)、数 ×1.2。コイン ×1.6。恒久スキルを半分ほど上げてから挑もう。最終ステージは8割ほど上げても五分五分',
      lockedPrev: 'この清掃員で前のステージをノーマルでクリアすると入れる',
      lockedHard: 'この清掃員でこのステージをノーマルでクリアすると挑戦できる',
      charSelect: '清掃員を選ぶ',
      charGo: 'この清掃員でステージを選ぶ',
      changeChar: '清掃員を変える',
      bestRooms: (r, n) => `清掃した部屋 最高 ${r}/${n}`,
      bestClear: (time) => `最速クリア ${time}`,
      roomCount: (n) => `${n}部屋`,
      badgeTreasure: '宝',
      treasure: '宝物',
      skills: '恒久スキル',
      zukan: 'ゴミ図鑑',
      toTitle: 'タイトルへ',
      unlockText: (n, stage) => `ステージ${n}「${stage}」の宝物を見つけると仲間になる`,
      trait: (name, desc) => `個性「${name}」 ${desc}`,
      charStats: (hp, gears) => `体力 ${hp}・最初のギア: ${gears}`,
      charPower: (s) => `強さ ${s}`,
      charFav: (b, n) => `得意なビルド: ${b} (得意なギアの攻撃力 +${n}%)`,
      sep: '・',
      stageTitle: (n, name) => `ステージ${n} ${name}`,
      planAlt: '間取り図',
      briefDesc: '<b>10分以内に全部屋の清掃を完了</b>すればクリア。部屋の<b>発生源</b>（赤い点）を全部潰して床をピカピカにすると、その部屋の清掃が完了し、宝箱と特典がもらえる。<b>★が多い部屋ほど汚れがキツく</b>、ゴミが多くて強い。弱いうちに入るとすぐやられるので、★の少ない部屋から片付けよう。発生源は<b>まわりが汚れているほど硬い</b>ので、まずまわりを磨こう。',
      srcCount: (n) => `発生源 ${n}`,
      treasureFoundLine: (name) => `宝物「${name}」 見つけた!`,
      treasureHint: (cond) => `宝物の条件: ${cond}`,
      joined: (name) => `${name}が仲間になった`,
      willJoin: 'この宝物を見つけると、新しい清掃員が仲間になる',
      bossNote: (mid, boss) => `5分で中ボス「${mid}」、9分でボス「${boss}」が現れる。`,
      cleared: 'クリア済み',
      pickCleaner: '出撃する清掃員',
      deploy: (mode) => `${mode}で出撃!`,
      back: '戻る',
      charsSub: '清掃員ごとの、各ステージ・各モードのクリアも達成率に入る。清掃員を選ぶと、ステージ・モードごとのクリア状況が見られる',
      treasures: (a, b) => `宝物 (${a}/${b})`,
      roomsCell: (r, n) => `${r}/${n}部屋`,
      clears: (a, b) => `クリア ${a}/${b}`,
      stage: 'ステージ',
      useCleaner: 'この清掃員にする',
      planStart: 'スタート',
      paused: '一時停止',
      pauseSub: (stage, left, d, n) => `${stage} ・ 残り ${left} ・ 清掃した部屋 ${d}/${n}`,
      resume: '再開',
      retry: 'やり直す',
      toStages: 'ステージ選択へ',
      onigiri: 'おにぎり',
      onigiriDesc: '体力を 50 回復する',
      savings: 'へそくり',
      savingsDesc: 'コイン +10',
      evoWith: (p) => `${p}で進化できる`,
      evoChest: '宝箱を開けると進化!',
      evoNeed: (p) => `${p}があれば進化できる`,
      evoFor: (w) => `${w}の進化に必要`,
      pickOne: '清掃ギアかパッシブを1つ選ぶ',
      tagGear: 'ギア',
      canUpgrade: (n) => `${n}個 強化できる`,
      shopCta: (c, n) => `コインが ${c} たまった! 恒久スキルを ${n}個 強化できる。強化は次のプレイからずっと効く`,
      recipeAria: (g, p, e) => `${g} と ${p} で ${e} に進化`,
      boxFullBanner: 'ゴミ箱が満タン! ゴミ捨て場へ',
      boxFullNag: '満タン! ダストが拾えない',
      boxNear: 'もうすぐ満タン',
      dangerWord1: '汚れレベル1 ・ やさしい',
      dangerWord2: '汚れレベル2 ・ ふつう',
      dangerWord3: '汚れレベル3 ・ キツい',
      dangerWord4: '汚れレベル4 ・ 危険!',
      dangerWord5: '汚れレベル5 ・ 超危険!!',
      tagPassive: 'パッシブ',
      inventory: 'いまの持ち物',
      emptySlot: '空き',
      slots: (g, gm, p, pm) => `ギア ${g}/${gm} ・ パッシブ ${p}/${pm}`,
      slotNote: (g, p) => `清掃ギアは${g}つ、パッシブは${p}つまでしか持てない。どれを組み合わせるかで、戦い方が変わる。`,
      reroll: (n) => `選び直す (残り ${n})`,
      treasureNew: '宝物を見つけた!',
      owned: '（もう持っている）',
      joinedBang: (name) => `${name}が仲間になった!`,
      evolved: '進化!!',
      evolvedText: (w, e, d) => `${w}が「${e}」に進化した! ${d}`,
      chest: '宝箱',
      coins30: 'コイン +30',
      noteAllRooms: '全部屋の清掃を完了した!',
      noteTreasure: (name) => `宝物「${name}」を見つけた!`,
      noteStage: (n, name) => `ステージ${n}「${name}」に入れるようになった!`,
      noteHard: 'このステージのハードに挑戦できるようになった!',
      noteAll: '屋敷じゅうをピカピカにした! おめでとう!',
      noteFirst: (c, m) => `${c}で${m}を初クリア!`,
      wornOut: '力尽きた…',
      resultSub: (stage, mode, c) => `${stage} ・ ${mode} ・ ${c}`,
      clearTime: 'クリアタイム',
      playTime: 'プレイした時間',
      roomsCleaned: '清掃した部屋',
      houseClean: '清掃度 (家全体)',
      kills: '片付けたゴミ',
      level: 'レベル',
      coinKills: 'コイン (片付け)',
      coinClean: 'コイン (清掃度)',
      coinDump: 'コイン (ゴミ捨て・宝箱)',
      coinRoom: 'コイン (部屋・発生源)',
      coinBoss: 'コイン (ボス)',
      coinClear: 'コイン (クリア)',
      coinMul: (hard) => `倍率 (${hard ? 'ハード・' : ''}恒久スキル)`,
      total: '合計',
      nextStage: '次のステージへ',
      again: 'もう一度',
      shopSub: 'その清掃員だけに、次のプレイからずっと効く。コインは全員共通',
      skillsOf: (name) => `${name}の恒久スキル`,
      max: '最大',
      cost: (c) => `${c} コイン`,
      killed: (n) => `片付けた数 ${n}`,
      se: '効果音',
      bgm: 'BGM',
      shake: '画面の揺れ・フラッシュ',
      haze: '汚れの靄',
      resetSave: 'セーブデータを消去',
      resetWarn: 'コイン・恒久スキル・クリア記録・宝物・図鑑・清掃員の開放がすべて消えて、最初からになります。元には戻せません(音量などの設定は残ります)。',
      resetYes: '消去する',
      resetNo: 'やめる',
      resetDone: 'セーブデータを消去しました',
      reviveTitle: 'もう一度がんばる?',
      reviveText: '体力が全回復して、その場で復活できる。',
      reviveBtn: '復活する',
      giveUp: 'あきらめる',
      revived: '復活! もうひとふんばり!',
      rerollPlus: 'リロール +2',
      rerollWait: (n) => `広告リロールはあと ${n} 回のレベルアップ後`,
      coinsX: (n) => `コイン 1.5倍 (+${n})`,
      coinAd: 'コイン (1.5倍ボーナス)',
      withAd: (s) => `📺 広告を見て${s}`,
      adLoading: '広告を準備中…',
      adFailed: '広告を読み込めなかった。少し待ってからもう一度試してね',
      howToPlay: '遊び方',
      perkReroll: 'リロール',
      perkRerollDesc: '毎回のプレイで、レベルアップの選び直しが1回できる',
      perkRevive: '復活',
      perkReviveDesc: '毎回のプレイで1回、力尽きても体力が全回復して立ち上がれる',
      perkHow: (n, mode) => `ステージ${n}・${mode}の宝物を見つけると開放`,
      perkOn: '開放済み (宝物で開放)',
      perkGot: (name) => `恒久スキル「${name}」を開放した!`,
      perkTeaser: (name) => `見つけると恒久スキル「${name}」を開放`,
      treasureClue: (stage, mode, cond) => `ヒント (${stage}・${mode}): ${cond}`,
      condRoom: (room) => `★の一番多い部屋「${room}」の清掃を完了する`,
      condKills: (n, enemy) => `1回のプレイで${enemy}を${n}体片付ける`,
      condRoomTime: (room, time) => `部屋「${room}」の清掃を${time}以内に完了する`,
      condSrcTime: (time) => `家じゅうの発生源を${time}以内に全部潰す`,
      condClearTime: (time) => `${time}以内に全部屋の清掃を完了する`,
      condBoss: (boss) => `「${boss}」を倒す`,
      condDumps: (n) => `1回のプレイでゴミ捨てを${n}回する`,
      condHpKeep: (pct) => `体力を${pct}%より下げずにクリアする`,
      treasureAppeared: '宝物が現れた!',
      hudTreasure: (s) => `宝物 ${s}`,
      hudDumpCount: (a, b) => `ゴミ捨て ${a}/${b}`,
      hudTimeLeft: (s) => `あと ${s}`,
      treasurePerks: '宝物で開放する恒久スキル',
      reviveFree: '宝物の力で復活する',
    },
    en: {
      pageTitle: 'Cleaning Survivors',
      pageDesc: 'A Vampire Survivors-style action game: wipe out waves of trash and grime with auto-firing cleaning gear. 10 stages in Normal and Hard. Clean every room within 10 minutes.',
      gameTitle: 'Cleaning Survivors',
      backToGames: '‹ All games',
      pause: 'Pause',
      compress: 'Compress',
      board: 'Game screen',
      language: 'Language',
      warn: (name) => `Warning! ${name} is approaching!`,
      rush: 'Swarm rush!',
      tooTough: 'Too tough! Clean around it',
      shieldDmg: (n) => `DMG ${n}%`,
      shieldNone: 'No barrier',
      bossDown: (name) => `${name} cleaned up!`,
      srcLeft: (room, n) => `Source destroyed! (${room}: ${n} left)`,
      srcAll: (room) => `All sources in the ${room} destroyed!`,
      dumped: (c) => `Trash dumped! +${c} coins`,
      roomDone: (room, bonus) => `${room} sparkling clean! ${bonus}`,
      roomTreasure: (room) => `${room} sparkling clean! A treasure appeared!`,
      timeUp: 'Time\'s up…',
      allClean: 'All rooms cleaned!',
      dumpLabel: 'TRASH',
      hudDone: (room) => `${room} done!`,
      hudRooms: (d, n) => `Rooms ${d}/${n} done`,
      hudSrc: (s, d, n) => `Sources ${s} · Rooms ${d}/${n} done`,
      hudKills: (k) => `Cleared ${k}`,
      hudHp: (a, b) => `HP ${a}/${b}`,
      hudBoxFull: 'FULL!',
      hudBox: (a, b) => `Dust box ${a}/${b}`,
      completion: 'Completion',
      completionMeta: (c, ct, tr, tt) => `Clears ${c}/${ct} · Treasures ${tr}/${tt}`,
      logoSmall: 'SCRUB · SWEEP · SURVIVE',
      logo: 'CLEANING<br>SURVIVORS',
      tagline: 'Wipe out waves of trash and grime with your cleaning gear!',
      play: 'Play',
      cleaners: 'Cleaners',
      tutorial: 'Tutorial',
      tutorialMeta: 'A tiny three-room house to learn the basics in 2–3 minutes',
      recommended: 'New players',
      toStage1: 'Go to Stage 1',
      noteTutorial: 'Tutorial complete! Next, take on Stage 1, "The Trash House: 1st Floor"',
      noteTutorialRetry: 'Give the tutorial another try',
      tutMove: 'First, try walking. Move with <b>WASD / arrow keys</b>. Your cleaning gear works <b>automatically</b>',
      tutMoveTouch: 'First, try walking. <b>Drag on the screen</b> to move. Your cleaning gear works <b>automatically</b>',
      tutKill: 'Get close to the trash. Your gear damages nearby trash <b>automatically</b>. Keep an eye on the <b>HP gauge</b> under your character',
      tutDust: 'Cleared trash drops <b>dust</b> (diamonds). Pick it up for experience and <b>level up</b>',
      tutLevelUp: (a, b) => `Level up! Pick one gear or passive. You can only carry ${a} gear and ${b} passives, so think about your combination`,
      tutSource: 'The red dotted ring is a <b>source</b>, where trash comes from. The gauge above it is its <b>grime barrier</b>, which weakens as you polish the floor around it. Scrub around it, then destroy it',
      tutRoom: '<b>Destroy every source</b> in a room and polish <b>90%+</b> of its floor to finish it. The % at the top right shows how clean the room is',
      tutChest: 'Room finished! You get a <b>chest</b> and a room bonus. Grab the chest to open it',
      tutDump: 'Dust you pick up fills the <b>trash can</b> (dust box) at the bottom left. When it\'s <b>full, your damage is halved, you can\'t pick up dust and you move slower</b>. Stand on the <b>green trash dump</b> found in every room to empty it',
      tutDanger: 'Rooms with more ★ are filthier with tougher trash, so <b>start with fewer ★</b>. In real stages you win by cleaning <b>every room within 10 minutes</b>. Clean up the remaining rooms!',
      achievements: 'Achievements',
      achClears: 'Clears by cleaner',
      settings: 'Settings',
      stageSelect: 'Select a Stage',
      recordOf: (name) => `${name}'s records`,
      coins: 'Coins',
      hardNote: 'Hard: trash and source HP and damage are about 3–7× Normal (varies by stage), count ×1.2. Coins ×1.6. Raise your permanent skills to about half first. The final stage is a coin flip even at 80%.',
      lockedPrev: 'Clear the previous stage on Normal with this cleaner to enter',
      lockedHard: 'Clear this stage on Normal with this cleaner to unlock Hard',
      charSelect: 'Choose a Cleaner',
      charGo: 'Choose a stage with this cleaner',
      changeChar: 'Change cleaner',
      bestRooms: (r, n) => `Best rooms cleaned ${r}/${n}`,
      bestClear: (time) => `Best clear ${time}`,
      roomCount: (n) => `${n} rooms`,
      badgeTreasure: 'T',
      treasure: 'Treasure',
      skills: 'Skills',
      zukan: 'Trash Guide',
      toTitle: 'Title',
      unlockText: (n, stage) => `Joins when you find the treasure of Stage ${n}, "${stage}"`,
      trait: (name, desc) => `Trait "${name}": ${desc}`,
      charStats: (hp, gears) => `HP ${hp} · Starting gear: ${gears}`,
      charPower: (s) => `Strength ${s}`,
      charFav: (b, n) => `Favorite build: ${b} (favorite gear damage +${n}%)`,
      sep: ', ',
      stageTitle: (n, name) => `Stage ${n}: ${name}`,
      planAlt: 'Floor plan',
      briefDesc: '<b>Clean every room within 10 minutes</b> to clear the stage. Destroy all the <b>sources</b> (red dots) in a room and polish its floor to finish that room and earn a chest and a bonus. <b>Rooms with more ★ are filthier</b>, with more and tougher trash. Enter them too early and you\'ll be overwhelmed, so start with the rooms with fewer ★. Sources <b>get tougher the dirtier their surroundings are</b>, so scrub around them first.',
      srcCount: (n) => `Sources ${n}`,
      treasureFoundLine: (name) => `Treasure "${name}" found!`,
      treasureHint: (cond) => `Treasure: ${cond}`,
      joined: (name) => `${name} has joined`,
      willJoin: 'Finding this treasure unlocks a new cleaner',
      bossNote: (mid, boss) => `The mid-boss "${mid}" appears at 5:00, and the boss "${boss}" at 9:00.`,
      cleared: 'Cleared',
      pickCleaner: 'Choose your cleaner',
      deploy: (mode) => `Start (${mode})`,
      back: 'Back',
      charsSub: 'Every cleaner\'s clears of each stage and mode count toward completion. Select a cleaner to see their clears for each stage and mode',
      treasures: (a, b) => `Treasures (${a}/${b})`,
      roomsCell: (r, n) => `${r}/${n} rooms`,
      clears: (a, b) => `Clears ${a}/${b}`,
      stage: 'Stage',
      useCleaner: 'Use this cleaner',
      planStart: 'START',
      paused: 'Paused',
      pauseSub: (stage, left, d, n) => `${stage} · ${left} left · Rooms cleaned ${d}/${n}`,
      resume: 'Resume',
      retry: 'Restart',
      toStages: 'Stage select',
      onigiri: 'Rice Ball',
      onigiriDesc: 'Restores 50 HP',
      savings: 'Secret Savings',
      savingsDesc: 'Coins +10',
      evoWith: (p) => `Evolves with ${p}`,
      evoChest: 'Open a chest to evolve!',
      evoNeed: (p) => `Can evolve if you have ${p}`,
      evoFor: (w) => `Needed to evolve the ${w}`,
      pickOne: 'Choose a gear or a passive',
      tagGear: 'Gear',
      canUpgrade: (n) => `${n} upgrades available`,
      shopCta: (c, n) => `You have ${c} coins! ${n} permanent skill upgrades are available, and they last for every future run`,
      recipeAria: (g, p, e) => `${g} + ${p} evolves into ${e}`,
      boxFullBanner: 'Trash can FULL! Go to a trash dump',
      boxFullNag: 'FULL! Can\'t pick up dust',
      boxNear: 'Almost full',
      dangerWord1: 'Filth 1 · Easy',
      dangerWord2: 'Filth 2 · Normal',
      dangerWord3: 'Filth 3 · Tough',
      dangerWord4: 'Filth 4 · Danger!',
      dangerWord5: 'Filth 5 · Extreme!!',
      tagPassive: 'Passive',
      inventory: 'What you have',
      emptySlot: 'Empty',
      slots: (g, gm, p, pm) => `Gear ${g}/${gm} · Passives ${p}/${pm}`,
      slotNote: (g, p) => `You can carry only ${g} pieces of gear and ${p} passives, so your combination decides how you fight.`,
      reroll: (n) => `Reroll (${n} left)`,
      treasureNew: 'Treasure found!',
      owned: ' (already owned)',
      joinedBang: (name) => `${name} has joined the team!`,
      evolved: 'EVOLVED!!',
      evolvedText: (w, e, d) => `The ${w} evolved into the "${e}"! ${d}`,
      chest: 'Chest',
      coins30: 'Coins +30',
      noteAllRooms: 'Cleaned every room!',
      noteTreasure: (name) => `Found the treasure "${name}"!`,
      noteStage: (n, name) => `Stage ${n}, "${name}", is now open!`,
      noteHard: 'Hard mode is now open for this stage!',
      noteAll: 'The whole mansion is sparkling clean! Congratulations!',
      noteFirst: (c, m) => `First ${m} clear with ${c}!`,
      wornOut: 'Worn out…',
      resultSub: (stage, mode, c) => `${stage} · ${mode} · ${c}`,
      clearTime: 'Clear time',
      playTime: 'Play time',
      roomsCleaned: 'Rooms cleaned',
      houseClean: 'Cleanliness (whole house)',
      kills: 'Trash cleared',
      level: 'Level',
      coinKills: 'Coins (trash)',
      coinClean: 'Coins (cleanliness)',
      coinDump: 'Coins (dumps & chests)',
      coinRoom: 'Coins (rooms & sources)',
      coinBoss: 'Coins (bosses)',
      coinClear: 'Coins (clear)',
      coinMul: (hard) => `Multiplier (${hard ? 'Hard, ' : ''}skills)`,
      total: 'Total',
      nextStage: 'Next stage',
      again: 'Try again',
      shopSub: 'Applies only to this cleaner, from your next run on. Coins are shared by everyone',
      skillsOf: (name) => `${name}'s skills`,
      max: 'MAX',
      cost: (c) => `${c} coins`,
      killed: (n) => `Cleared ${n}`,
      se: 'Sound effects',
      bgm: 'Music',
      shake: 'Screen shake & flash',
      haze: 'Grime haze',
      resetSave: 'Delete save data',
      resetWarn: "All coins, skills, clear records, treasures, the enemy guide and unlocked cleaners will be erased and you'll start over. This can't be undone (sound and display settings are kept).",
      resetYes: 'Delete',
      resetNo: 'Cancel',
      resetDone: 'Save data deleted',
      reviveTitle: 'Give it another go?',
      reviveText: 'Get back up right where you fell with full HP.',
      reviveBtn: 'Revive',
      giveUp: 'Give up',
      revived: 'Revived! Keep going!',
      rerollPlus: '+2 rerolls',
      rerollWait: (n) => `Ad reroll available in ${n} level-up${n === 1 ? '' : 's'}`,
      coinsX: (n) => `Coins ×1.5 (+${n})`,
      coinAd: 'Coins (×1.5 bonus)',
      withAd: (s) => `📺 Watch an ad: ${s}`,
      adLoading: 'Loading ad…',
      adFailed: 'Couldn\'t load an ad. Wait a moment and try again',
      howToPlay: 'How to Play',
      perkReroll: 'Reroll',
      perkRerollDesc: 'One level-up reroll in every run',
      perkRevive: 'Revive',
      perkReviveDesc: 'Once per run, get back up with full HP when you\'re worn out',
      perkHow: (n, mode) => `Unlocked by finding the treasure of Stage ${n} (${mode})`,
      perkOn: 'Unlocked (by a treasure)',
      perkGot: (name) => `Unlocked the permanent skill "${name}"!`,
      perkTeaser: (name) => `Unlocks the permanent skill "${name}" when found`,
      treasureClue: (stage, mode, cond) => `Hint (${stage}, ${mode}): ${cond}`,
      condRoom: (room) => `Finish cleaning the room with the most ★, "${room}"`,
      condKills: (n, enemy) => `Clear ${n} × ${enemy} in one run`,
      condRoomTime: (room, time) => `Finish cleaning "${room}" within ${time}`,
      condSrcTime: (time) => `Destroy every source in the house within ${time}`,
      condClearTime: (time) => `Clean every room within ${time}`,
      condBoss: (boss) => `Defeat "${boss}"`,
      condDumps: (n) => `Use trash dumps ${n} times in one run`,
      condHpKeep: (pct) => `Clear the stage without your HP dropping below ${pct}%`,
      treasureAppeared: 'A treasure appeared!',
      hudTreasure: (s) => `Treasure ${s}`,
      hudDumpCount: (a, b) => `Dumps ${a}/${b}`,
      hudTimeLeft: (s) => `${s} left`,
      treasurePerks: 'Permanent skills unlocked by treasures',
      reviveFree: 'Revive with the treasure\'s power',
    },
  };

  for (const code of PACK_CODES) TEXT[code] = I18N[code].text;

  // 文言を取り出す。関数の文言は引数を渡して組み立てる (その言語になければ英語、それもなければ日本語)
  const t = (key, ...args) => {
    const v = TEXT[lang][key] ?? TEXT.en[key] ?? TEXT.ja[key];
    return typeof v === 'function' ? v(...args) : v;
  };

  // 時間で起こること
  const EVENTS = [
    { t: 120, kind: 'elite' },
    { t: 240, kind: 'elite' },
    { t: 298, kind: 'warn', boss: 'yokai' },
    { t: 300, kind: 'midboss' },
    { t: 420, kind: 'elite' },
    { t: 480, kind: 'rush' },
    { t: 510, kind: 'elite' },
    { t: 538, kind: 'warn', boss: 'boss' },
    { t: 540, kind: 'boss' },
  ];

  // ===================================================================
  // 保存
  // ===================================================================
  // rec[清掃員][ステージ][n|h] = { c: クリアした, t: 最速クリア (秒), r: 清掃した部屋の最高数 }
  const defaultSave = () => ({
    v: 2,
    coins: 0,
    shopBy: {}, // 恒久スキルの段階は清掃員ごと (shopOf で取り出す)。コインは全清掃員共通
    rec: {},
    treasures: STAGES.map(() => false), // ノーマルの宝物
    treasuresH: STAGES.map(() => false), // ハードの宝物
    kills: {},
    settings: { se: 70, bgm: 50, shake: true, haze: true },
    char: 'cleaner',
    mode: 'normal',
    tutorialDone: false,
    tutorialSeen: false, // チュートリアルを始めたか (はじめての「はじめる」でチュートリアルを始めるのは1回だけ)
  });

  // raw: 保存の文字列 (省略するとこの端末の localStorage から読む)
  function loadSave(raw) {
    const s = defaultSave();
    try {
      if (raw === undefined) raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return s;
      const d = JSON.parse(raw);
      if (typeof d.coins === 'number') s.coins = d.coins;
      // 恒久スキル: 清掃員ごとの段階。清掃員ごとになる前の保存 (shop) は、ハジメの段階として引き継ぐ
      const readShop = (src) => Object.fromEntries(SHOP.map((it) => [it.id, src && typeof src[it.id] === 'number' ? Math.max(0, Math.min(it.max, Math.floor(src[it.id]))) : 0]));
      if (d.shopBy && typeof d.shopBy === 'object') for (const c of CHARS) { if (d.shopBy[c.id]) s.shopBy[c.id] = readShop(d.shopBy[c.id]); }
      else if (d.shop) s.shopBy.cleaner = readShop(d.shop);
      // 恒久スキル「リロール」はなくした (選び直しは広告で増やす)。上げていたぶんのコインは返す
      const oldReroll = d.shop && typeof d.shop.reroll === 'number' ? Math.min(6, Math.max(0, Math.floor(d.shop.reroll))) : 0;
      if (oldReroll) s.coins += (100 * oldReroll * (oldReroll + 1)) / 2;
      Object.assign(s.kills, d.kills || {});
      Object.assign(s.settings, d.settings || {});
      if (CHARS.some((c) => c.id === d.char)) s.char = d.char;
      if (MODES[d.mode]) s.mode = d.mode;
      s.tutorialDone = !!d.tutorialDone;
      s.tutorialSeen = !!d.tutorialSeen || s.tutorialDone;
      if (d.v === 2) {
        if (d.rec && typeof d.rec === 'object') s.rec = d.rec;
        if (Array.isArray(d.treasures)) d.treasures.forEach((v, i) => { if (i < s.treasures.length) s.treasures[i] = !!v; });
        if (Array.isArray(d.treasuresH)) d.treasuresH.forEach((v, i) => { if (i < s.treasuresH.length) s.treasuresH[i] = !!v; });
      } else if (Array.isArray(d.cleared)) {
        // 5ステージだったころの記録は、清掃員ハジメのノーマルの記録として引き継ぐ (旧ステージ5 は今のステージ10)
        const map = [0, 1, 2, 3, 9];
        d.cleared.forEach((v, i) => {
          const b = (d.best && d.best[i]) || {};
          if (map[i] == null || (!v && !b.rooms)) return;
          const r = recOf(s, 'cleaner', map[i], 'normal');
          r.c = v ? 1 : 0;
          if (b.clear) r.t = b.clear;
          if (b.rooms) r.r = b.rooms;
        });
      }
    } catch (e) { /* 壊れていたら初期値で遊ぶ */ }
    return s;
  }

  function recOf(sv, charId, stageIdx, mode) {
    const k = MODES[mode].key;
    const byChar = (sv.rec[charId] = sv.rec[charId] || {});
    const byStage = (byChar[stageIdx] = byChar[stageIdx] || {});
    return (byStage[k] = byStage[k] || { c: 0, t: 0, r: 0 });
  }

  function peekRec(charId, stageIdx, mode) {
    const r = save.rec[charId] && save.rec[charId][stageIdx] && save.rec[charId][stageIdx][MODES[mode].key];
    return r || { c: 0, t: 0, r: 0 };
  }

  // だれかがそのステージ・モードをクリアしたか
  // だれかがクリアしたか (宝物の一覧などで、ステージの名前を見せるかどうかに使う)
  const stageCleared = (i, mode) => CHARS.some((c) => peekRec(c.id, i, mode).c);
  const stageSeen = (i) => TEST_UNLOCK || i === 0 || stageCleared(i - 1, 'normal');
  // ステージとハードの開放は清掃員ごと。その清掃員で前のステージ (ハードは同じステージ) をノーマルでクリアすると開く
  const stageUnlocked = (i, ch = curChar()) => TEST_UNLOCK || i === 0 || !!peekRec(ch.id, i - 1, 'normal').c;
  const hardUnlocked = (i, ch = curChar()) => TEST_UNLOCK || !!peekRec(ch.id, i, 'normal').c;
  // 清掃員の恒久スキルの段階 (まだなければ 0 で作る)
  const shopOf = (id) => save.shopBy[id] || (save.shopBy[id] = Object.fromEntries(SHOP.map((it) => [it.id, 0])));
  const charUnlocked = (c) => TEST_UNLOCK || c.unlock < 0 || save.treasures[c.unlock];
  // 宝物はステージごと・モードごとに 1 つ (ハードの宝物はノーマルと同じ部屋で見つかる)
  const treasureOf = (i, mode) => (mode === 'hard' ? STAGES[i].treasureH : STAGES[i].treasure);
  const treasureList = (mode) => (mode === 'hard' ? save.treasuresH : save.treasures);
  const hasTreasure = (i, mode) => !!treasureList(mode)[i];
  const treasureCount = () => save.treasures.filter(Boolean).length + save.treasuresH.filter(Boolean).length;
  // 宝物の取得条件 (書いていなければ、★の一番多い部屋の清掃を完了する)
  //   room: 宝物の部屋の清掃を完了 / kills: そのゴミを n 体片付ける / roomTime: 部屋 room の清掃を t 秒以内に完了
  //   srcTime: 家じゅうの発生源を t 秒以内に全部潰す / clearTime: t 秒以内にクリア / boss: そのボスを倒す
  //   dumps: ゴミ捨てを n 回 / hpKeep: 体力を pct% より下げずにクリア
  const treasureCond = (i, mode) => treasureOf(i, mode).cond || { type: 'room' };
  // 取得条件の文 (宝物の一覧のヒントと、出撃前の確認画面に出す)
  function condText(i, mode) {
    const st = STAGES[i];
    const c = treasureCond(i, mode);
    const roomName = (id) => L(st.rooms.find((r) => r.id === id), 'name');
    switch (c.type) {
      case 'kills': return t('condKills', c.n, L(ENEMIES[c.enemy], 'name'));
      case 'roomTime': return t('condRoomTime', roomName(c.room), fmtTime(c.t));
      case 'srcTime': return t('condSrcTime', fmtTime(c.t));
      case 'clearTime': return t('condClearTime', fmtTime(c.t));
      case 'boss': return t('condBoss', L(ENEMIES[c.boss], 'name'));
      case 'dumps': return t('condDumps', c.n);
      case 'hpKeep': return t('condHpKeep', c.pct);
      default: return t('condRoom', roomName(st.treasure.room));
    }
  }
  // 宝物で開放する恒久スキル (リロール・復活。どちらも 1 段階だけ)
  const PERKS = ['reroll', 'revive'];
  const perkSource = (id) => {
    for (let i = 0; i < STAGES.length; i++) if (STAGES[i].treasureH.perk === id) return { i, mode: 'hard' };
    return null;
  };
  const hasPerk = (id) => {
    const src = perkSource(id);
    return !!src && hasTreasure(src.i, src.mode);
  };
  const perkName = (id) => t(id === 'reroll' ? 'perkReroll' : 'perkRevive');
  const perkDesc = (id) => t(id === 'reroll' ? 'perkRerollDesc' : 'perkReviveDesc');

  // 達成率 = (各ステージ・各モードのクリア + 宝物) ÷ その総数。クリアはどの清掃員でもよい
  // (清掃員ごとのクリア状況は、実績画面のおまけとして見せるだけで達成率には入れない)
  function completion() {
    // 実績 (達成率) = 清掃員ごとの、各ステージ・各モードのクリア (10人 × 10ステージ × 2モード = 200点)
    //   + 宝物 (20個 × 5点 = 100点)。合計 300点
    let clears = 0;
    for (const c of CHARS) for (let i = 0; i < STAGES.length; i++) for (const m of Object.keys(MODES)) if (peekRec(c.id, i, m).c) clears++;
    const clearTotal = CHARS.length * STAGES.length * Object.keys(MODES).length;
    const tre = treasureCount();
    const treTotal = STAGES.length * Object.keys(MODES).length;
    return { pct: ((clears + tre * TREASURE_PTS) / (clearTotal + treTotal * TREASURE_PTS)) * 100, clears, clearTotal, tre, treTotal };
  }
  const TREASURE_PTS = 5;


  let persisted = false; // この起動のあいだに一度でも保存したか
  function persist() {
    const json = JSON.stringify(save);
    persisted = true;
    try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* 保存できなくても遊べる */ }
    Ads.setData(SAVE_KEY, json); // CrazyGames ではデータモジュールにも保存する
  }

  const save = loadSave();

  // ===================================================================
  // サウンド (Web Audio API で合成する)
  // ===================================================================
  const Sound = (() => {
    let ac = null;
    let seGain;
    let bgmGain;
    let noiseBuf;
    const last = {};
    const GAP = { swing: 0.12, throw: 0.12, boom: 0.08, pop: 0.035, kyu: 0.06, hit: 0.045, suck: 0.09, shot: 0.08, hurt: 0.15, dump: 0.3 };

    function init() {
      if (ac) {
        if (ac.state === 'suspended') ac.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch (e) { return; }
      const master = ac.createGain();
      master.connect(ac.destination);
      seGain = ac.createGain();
      bgmGain = ac.createGain();
      seGain.connect(master);
      bgmGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      setVolume();
      // 音を出せるようになる前 (最初に画面を触る前) に決めていた曲を流す
      if (want) bgm(want);
    }

    // 広告のあいだと、CrazyGames の設定で消音にしているときは音を出さない
    let adMute = false;
    function setVolume() {
      if (!ac) return;
      const on = adMute || Ads.muted() ? 0 : 1;
      seGain.gain.value = (save.settings.se / 100) * 0.6 * on;
      bgmGain.gain.value = (save.settings.bgm / 100) * 0.35 * on;
    }
    function setAdMute(v) {
      adMute = v;
      setVolume();
    }

    function tone(freq, freq2, dur, type, vol, when = 0, dest = seGain) {
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    // のばす音 (静かな曲の和音): ふわっと立ち上がって、のばしてから消える
    function pad(freq, dur, type, vol, when = 0, dest = bgmGain) {
      const t = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + Math.min(0.25, dur * 0.2));
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function noise(dur, vol, type, f1, f2, when = 0, q = 1, dest = seGain) {
      const t = ac.currentTime + when;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(f1, t);
      if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(dest);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    }

    function play(name, arg = 0) {
      if (!ac || save.settings.se <= 0) return;
      const now = ac.currentTime;
      if (GAP[name] && last[name] && now - last[name] < GAP[name]) return;
      last[name] = now;
      switch (name) {
        case 'kyu': { // 床がピカピカになった
          const f = 900 * Math.pow(2, Math.min(arg, 14) / 12);
          tone(f, f * 1.5, 0.07, 'sine', 0.07);
          break;
        }
        case 'pop': tone(rand(700, 1000), rand(1300, 1700), 0.04, 'square', 0.025); break;
        case 'hit': noise(0.05, 0.08, 'bandpass', 1800, 900, 0, 2); break;
        case 'suck': noise(0.14, 0.12, 'bandpass', 2600, 500, 0, 3); tone(300, 900, 0.1, 'triangle', 0.04); break;
        case 'shot': noise(0.18, 0.1, 'highpass', 3000, 1500, 0, 0.7); break;
        case 'swing': noise(0.16, 0.1, 'bandpass', 700, 2400, 0, 1.5); break;
        case 'throw': noise(0.12, 0.06, 'bandpass', 1400, 3200, 0, 2); break;
        case 'boom': tone(160, 60, 0.2, 'sine', 0.1); noise(0.22, 0.1, 'lowpass', 2600, 300, 0, 1); break;
        case 'hurt': tone(220, 90, 0.18, 'sawtooth', 0.09); break;
        case 'level':
          [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.14, 'square', 0.05, i * 0.06));
          tone(1047, 0, 0.5, 'triangle', 0.06, 0.32);
          tone(1568, 0, 0.5, 'triangle', 0.04, 0.32);
          break;
        case 'chest': [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0, 0.18, 'triangle', 0.08, i * 0.08)); break;
        case 'chest-open':
        case 'chest-evo': {
          for (let i = 0; i < 5; i++) noise(0.05, 0.14, 'bandpass', 500 + i * 60, 300, i * 0.13, 3);
          noise(0.25, 0.2, 'highpass', 2000, 6000, 0.7, 0.7);
          const notes = name === 'chest-evo' ? [523, 659, 784, 1047, 1319, 1568, 2093] : [784, 988, 1175, 1568, 1976];
          notes.forEach((f, i) => tone(f, 0, 0.22, 'triangle', 0.09, 0.75 + i * 0.07));
          if (name === 'chest-evo') [1047, 1319, 1568].forEach((f) => tone(f, 0, 0.8, 'square', 0.04, 1.3));
          break;
        }
        case 'compress':
          tone(140, 35, 0.6, 'sine', 0.35);
          noise(0.5, 0.25, 'lowpass', 1200, 80, 0, 1);
          tone(900, 2400, 0.12, 'square', 0.05, 0.25);
          break;
        case 'dump': noise(0.35, 0.15, 'lowpass', 2500, 200, 0, 1); tone(400, 1200, 0.15, 'sine', 0.06, 0.2); break;
        case 'warn':
          for (let i = 0; i < 3; i++) {
            tone(660, 880, 0.3, 'square', 0.06, i * 0.6);
            tone(880, 660, 0.3, 'square', 0.06, i * 0.6 + 0.3);
          }
          break;
        case 'heal': tone(600, 1200, 0.2, 'sine', 0.08); break;
        case 'crush': tone(180, 50, 0.4, 'square', 0.12); noise(0.4, 0.22, 'lowpass', 1800, 120, 0, 1); tone(700, 1400, 0.12, 'triangle', 0.06, 0.25); break;
        case 'room-clear':
          [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0, 0.2, 'square', 0.06, i * 0.09));
          for (let i = 0; i < 6; i++) tone(2000 + i * 300, 3000 + i * 300, 0.08, 'sine', 0.04, 0.75 + i * 0.05);
          break;
        case 'boss-down': tone(200, 40, 1, 'sawtooth', 0.15); noise(1, 0.25, 'lowpass', 2000, 60, 0, 1); break;
        case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0, 0.22, 'square', 0.06, i * 0.12)); break;
        case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, 0, 0.3, 'triangle', 0.09, i * 0.22)); break;
        case 'click': tone(1200, 0, 0.03, 'square', 0.03); break;
        default: break;
      }
    }

    // ---- BGM: 16分音符のステップシーケンサー ----
    const SONGS = {
      main: { bpm: 148, chords: [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]] },
      boss: { bpm: 166, chords: [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]] },
      // タイトル・メニューの静かな曲 (ドラムなし。やわらかい音だけ)
      menu: { bpm: 84, calm: true, chords: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]] },
    };
    let song = null;
    let want = null; // 流したい曲 (音を出せるようになる前も覚えておく)
    let step = 0;
    let nextTime = 0;
    let timer = null;
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function schedule() {
      while (nextTime < ac.currentTime + 0.12) {
        const s = SONGS[song];
        const bar = Math.floor(step / 16) % 4;
        const st = step % 16;
        const chord = s.chords[bar];
        const when = nextTime - ac.currentTime;
        const sixteenth = 60 / s.bpm / 4;
        if (s.calm) {
          // 小節のあいだ和音をのばし、8分音符でゆっくり分散和音を鳴らす (スマホのスピーカーでも聞こえるように、低すぎない音域で)
          if (st === 0) chord.forEach((n, i) => pad(mf(n + 12), sixteenth * 16, 'triangle', i ? 0.028 : 0.04, when));
          if (st % 8 === 0) pad(mf(chord[0]), sixteenth * 8, 'triangle', 0.1, when);
          if (st % 2 === 0) {
            const n = chord[[0, 2, 1, 3, 2, 1, 3, 2][st / 2]] + 24;
            tone(mf(n), 0, sixteenth * 3, 'triangle', 0.09, when, bgmGain);
          }
          nextTime += sixteenth;
          step++;
          continue;
        }
        if (st % 2 === 0) {
          const n = chord[0] - 12 + (st % 4 === 2 ? 12 : 0);
          tone(mf(n), 0, sixteenth * 1.8, 'triangle', 0.22, when, bgmGain);
        }
        const arp = chord[[0, 1, 2, 1][st % 4]] + 24;
        tone(mf(arp), 0, sixteenth * 0.9, 'square', song === 'boss' ? 0.045 : 0.035, when, bgmGain);
        if (st % 4 === 0) tone(150, 45, 0.12, 'sine', 0.35, when, bgmGain);
        if (st % 4 === 2) noise(0.03, 0.06, 'highpass', 7000, 0, when, 1, bgmGain);
        if (st % 8 === 4) noise(0.1, 0.12, 'bandpass', 1800, 900, when, 1, bgmGain);
        nextTime += sixteenth;
        step++;
      }
    }

    function bgm(name) {
      want = name;
      if (!ac) return;
      if (name === song) return;
      song = name;
      if (timer) clearInterval(timer);
      timer = null;
      if (!name) return;
      step = 0;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(schedule, 25);
    }

    return { init, play, bgm, setVolume, setAdMute };
  })();

  // ---- CrazyGames の広告 (リワード広告) ----
  // 報酬は広告を見たときだけ渡す。SDK がない場所や使えない場所 (このサイトなど) では、報酬のボタンを出さない
  const Ads = (() => {
    let sdk = null;
    let busy = false;
    // 遊んでいるあいだか。SDK の準備ができる前に遊び始めても、準備ができたところで知らせる
    let playing = false;
    const live = () => !!sdk && sdk.environment !== 'disabled';
    const safe = (fn) => {
      try { Promise.resolve(fn()).catch(() => {}); } catch (e) { /* SDK が使えなくても遊べる */ }
    };
    const sendGameplay = () => { if (live()) safe(() => (playing ? sdk.game.gameplayStart() : sdk.game.gameplayStop())); };
    const ready = (async () => {
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (!cg) return;
      try {
        await cg.init();
        sdk = cg;
      } catch (e) {
        sdk = null;
        return;
      }
      if (live() && sdk.game && sdk.game.addSettingsChangeListener) safe(() => sdk.game.addSettingsChangeListener(() => Sound.setVolume()));
      Sound.setVolume();
      if (playing) sendGameplay();
      if (rerender) rerender(); // 広告が使えるとわかったら、報酬のボタンを出すために描き直す
      // 読みこみ中 (ロゴのアニメーションが終わるまで) を CrazyGames に知らせる
      if (live() && sdk.game.loadingStart) {
        safe(() => sdk.game.loadingStart());
        Promise.resolve(window.introDone).then(() => safe(() => sdk.game.loadingStop()));
      }
    })();
    // 報酬つきの広告を流す。最後まで見たら true。広告が使えない場所では false
    async function rewarded() {
      await ready;
      if (!live()) return false;
      if (busy) return false;
      busy = true;
      return new Promise((resolve) => {
        const done = (ok) => {
          busy = false;
          Sound.setAdMute(false);
          resolve(ok);
        };
        try {
          sdk.ad.requestAd('rewarded', {
            adStarted: () => Sound.setAdMute(true),
            adFinished: () => done(true),
            adError: () => done(false),
          });
        } catch (e) {
          done(false);
        }
      });
    }
    // CrazyGames のデータモジュール (ログインしている人はアカウントに、ゲストはその端末に保存される)
    const store = () => (live() && sdk.data ? sdk.data : null);
    return {
      ready,
      rewarded,
      live,
      getData: (k) => {
        const d = store();
        if (!d) return null;
        try { return d.getItem(k); } catch (e) { return null; }
      },
      setData: (k, v) => {
        const d = store();
        if (d) try { d.setItem(k, v); } catch (e) { /* 保存できなくても遊べる */ }
      },
      hasData: () => !!store(),
      // 遊んでいるあいだ (一時停止・メニュー・結果画面以外) を CrazyGames に知らせる
      // うれしい場面 (ステージクリアなど) を CrazyGames に知らせる
      happy: () => { if (live() && sdk.game.happytime) safe(() => sdk.game.happytime()); },
      gameplay: (on) => {
        playing = on;
        sendGameplay();
      },
      muted: () => !!(live() && sdk.game && sdk.game.settings && sdk.game.settings.muteAudio),
    };
  })();
  // 広告で報酬をもらうボタンの文言
  const adLabel = (s) => t('withAd', s);

  // ===================================================================
  // 絵 (ゴミ・主人公・アイコン)
  // ===================================================================
  const PUFFS = [[0, 0, 0.62], [-0.45, -0.25, 0.48], [0.45, -0.2, 0.5], [-0.35, 0.35, 0.45], [0.38, 0.38, 0.46], [0, -0.5, 0.4]];

  function eyes(c, r, sil, opt = {}) {
    if (sil) return;
    const ex = r * (opt.gap || 0.3);
    const ey = r * (opt.y || -0.1);
    const er = r * (opt.size || 0.22);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(-ex, ey, er, 0, TAU);
    c.arc(ex, ey, er, 0, TAU);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(-ex + er * 0.2, ey + er * 0.15, er * 0.5, 0, TAU);
    c.arc(ex + er * 0.2, ey + er * 0.15, er * 0.5, 0, TAU);
    c.fill();
    if (opt.angry) {
      c.strokeStyle = '#111';
      c.lineWidth = Math.max(1.2, r * 0.09);
      c.beginPath();
      c.moveTo(-ex - er, ey - er * 1.3);
      c.lineTo(-ex + er * 0.8, ey - er * 0.7);
      c.moveTo(ex + er, ey - er * 1.3);
      c.lineTo(ex - er * 0.8, ey - er * 0.7);
      c.stroke();
    }
  }

  function mouth(c, r, sil, wide = 0.25, y = 0.3) {
    if (sil) return;
    c.fillStyle = '#3a0d0d';
    c.beginPath();
    c.ellipse(0, r * y, r * wide, r * wide * 0.55, 0, 0, Math.PI);
    c.fill();
  }

  // mode: 0=ふつう 1=白く光る 2=シルエット
  function drawEnemyBody(c, type, r, t, mode, rot = 0) {
    const sil = mode === 2;
    const col = (normal) => (sil ? '#0d0f12' : mode === 1 ? '#ffffff' : normal);
    const wob = 1 + Math.sin(t * 7) * 0.05;
    switch (type) {
      case 'dust': {
        c.fillStyle = col('#a39d94');
        c.beginPath();
        for (const [x, y, s] of PUFFS) {
          c.moveTo(x * r + s * r * wob, y * r);
          c.arc(x * r, y * r, s * r * wob, 0, TAU);
        }
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.beginPath();
          c.arc(-r * 0.3, -r * 0.45, r * 0.25, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.2 });
        break;
      }
      case 'hair': {
        c.strokeStyle = col('#3b2a20');
        c.lineWidth = Math.max(1.5, r * 0.22);
        c.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          for (let i = 0; i <= 12; i++) {
            const a = (i / 12) * TAU * 1.2 + k * 2.1 + t * 2;
            const rr = r * (0.4 + 0.5 * Math.sin(i * 0.9 + k));
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          c.stroke();
        }
        eyes(c, r, sil, { size: 0.24, angry: true });
        break;
      }
      case 'paper': {
        c.save();
        c.rotate(Math.sin(t * 3) * 0.15);
        c.fillStyle = col('#f2efe6');
        c.beginPath();
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const rr = r * (i % 2 ? 0.78 : 1);
          if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          c.strokeStyle = mode === 1 ? '#fff' : '#b8b2a3';
          c.lineWidth = 1;
          c.stroke();
          c.beginPath();
          c.moveTo(-r * 0.6, r * 0.5);
          c.lineTo(-r * 0.1, r * 0.1);
          c.lineTo(r * 0.5, r * 0.6);
          c.stroke();
        }
        c.restore();
        eyes(c, r, sil, { angry: true });
        break;
      }
      case 'can':
      case 'bottle': {
        c.save();
        c.rotate(rot);
        const bottle = type === 'bottle';
        const w = r * (bottle ? 0.85 : 0.9);
        const h = r * (bottle ? 1.5 : 1.15);
        c.fillStyle = col(bottle ? 'rgba(150,210,240,0.9)' : '#d23b3b');
        c.beginPath();
        c.roundRect(-h, -w, h * 2, w * 2, w * 0.5);
        c.fill();
        if (bottle) {
          c.fillRect(h - 1, -w * 0.4, r * 0.5, w * 0.8);
          if (!sil) {
            c.fillStyle = mode === 1 ? '#fff' : '#2a7de1';
            c.fillRect(h + r * 0.4, -w * 0.45, r * 0.25, w * 0.9);
            c.fillStyle = mode === 1 ? '#fff' : '#f2f6fa';
            c.fillRect(-h * 0.3, -w, h * 0.7, w * 2);
          }
        } else if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#c9ced6';
          c.fillRect(-h, -w, r * 0.25, w * 2);
          c.fillRect(h - r * 0.25, -w, r * 0.25, w * 2);
          c.fillStyle = mode === 1 ? '#fff' : '#fff3';
          c.fillRect(-h * 0.5, -w * 0.7, h, w * 0.35);
        }
        c.restore();
        eyes(c, r, sil, { size: 0.24, angry: true });
        break;
      }
      case 'grease': {
        c.fillStyle = col('#c9a227');
        c.beginPath();
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const rr = r * (0.9 + Math.sin(a * 3 + t * 4) * 0.08) * (a > 0 && a < Math.PI ? 0.85 : 1.05);
          const x = Math.cos(a) * rr * wob;
          const y = Math.sin(a) * rr / wob;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,250,200,0.55)';
          c.beginPath();
          c.ellipse(-r * 0.35, -r * 0.45, r * 0.28, r * 0.14, -0.5, 0, TAU);
          c.fill();
          c.fillStyle = 'rgba(110,80,10,0.5)';
          c.beginPath();
          c.arc(r * 0.45, r * 0.4, r * 0.12, 0, TAU);
          c.arc(-r * 0.5, r * 0.3, r * 0.08, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.2, gap: 0.28 });
        mouth(c, r, sil, 0.2, 0.3);
        break;
      }
      case 'spore': {
        c.fillStyle = col('#5f9b48');
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + t;
          c.moveTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
          c.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.22, 0, TAU);
        }
        c.moveTo(r * 0.85, 0);
        c.arc(0, 0, r * 0.85, 0, TAU);
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#2f5e2a';
          for (const [x, y, s] of [[-0.4, 0.35, 0.15], [0.45, 0.3, 0.12], [0.1, -0.55, 0.1]]) {
            c.beginPath();
            c.arc(x * r, y * r, s * r, 0, TAU);
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.2, angry: true });
        break;
      }
      case 'bag': {
        c.fillStyle = col('#3a3f46');
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.75);
        c.quadraticCurveTo(-r * 1.15, -r * 0.4, -r * 0.95, r * 0.55);
        c.quadraticCurveTo(0, r * 1.15, r * 0.95, r * 0.55);
        c.quadraticCurveTo(r * 1.15, -r * 0.4, r * 0.2, -r * 0.75);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.75);
        c.lineTo(-r * 0.45, -r * 1.15);
        c.lineTo(0, -r * 0.9);
        c.lineTo(r * 0.45, -r * 1.15);
        c.lineTo(r * 0.2, -r * 0.75);
        c.fill();
        if (!sil && mode === 0) {
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.beginPath();
          c.ellipse(-r * 0.45, -r * 0.1, r * 0.15, r * 0.35, 0.2, 0, TAU);
          c.fill();
          c.fillStyle = '#e8d23a';
          c.beginPath();
          c.ellipse(r * 0.55, r * 0.55, r * 0.25, r * 0.1, -0.6, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.18, y: 0.05, angry: true });
        mouth(c, r, sil, 0.22, 0.45);
        break;
      }
      case 'pile': {
        // ゴミの山: 茶色い山に紙くずや缶が刺さっている
        c.fillStyle = col('#6b5640');
        c.beginPath();
        c.moveTo(-r, r * 0.55);
        c.quadraticCurveTo(-r * 0.9, -r * 0.2, -r * 0.35, -r * 0.55);
        c.quadraticCurveTo(0, -r * (0.95 + Math.sin(t * 3) * 0.05), r * 0.4, -r * 0.5);
        c.quadraticCurveTo(r * 0.95, -r * 0.15, r, r * 0.55);
        c.closePath();
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#d23b3b';
          c.save();
          c.translate(-r * 0.45, -r * 0.2);
          c.rotate(-0.5);
          c.fillRect(-r * 0.18, -r * 0.12, r * 0.36, r * 0.24);
          c.restore();
          c.fillStyle = mode === 1 ? '#fff' : '#f2efe6';
          c.beginPath();
          c.moveTo(r * 0.3, -r * 0.55);
          c.lineTo(r * 0.62, -r * 0.42);
          c.lineTo(r * 0.5, -r * 0.15);
          c.lineTo(r * 0.22, -r * 0.28);
          c.fill();
          c.fillStyle = mode === 1 ? '#fff' : 'rgba(150,210,240,0.9)';
          c.fillRect(-r * 0.1, -r * 0.75, r * 0.2, r * 0.32);
        }
        eyes(c, r, sil, { size: 0.16, y: 0.15, angry: true });
        mouth(c, r, sil, 0.2, 0.4);
        break;
      }
      case 'drain': {
        // あふれた排水口: 金属の網から黄色い油があふれる
        c.fillStyle = col('#c9a227');
        c.beginPath();
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * TAU;
          const rr = r * (1 + Math.sin(a * 4 + t * 3) * 0.08);
          if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        c.fill();
        c.fillStyle = col('#4a525c');
        c.beginPath();
        c.arc(0, 0, r * 0.68, 0, TAU);
        c.fill();
        if (!sil) {
          c.strokeStyle = mode === 1 ? '#fff' : '#20262e';
          c.lineWidth = Math.max(1.5, r * 0.08);
          c.beginPath();
          for (let k = -2; k <= 2; k++) {
            c.moveTo(k * r * 0.22, -r * 0.6);
            c.lineTo(k * r * 0.22, r * 0.6);
          }
          c.stroke();
        }
        eyes(c, r, sil, { size: 0.17, y: -0.05, angry: true });
        break;
      }
      case 'nest': {
        // カビの巣: 緑のもこもこした塊
        c.fillStyle = col('#3f6b36');
        c.beginPath();
        for (const [x, y, k] of [[0, 0.1, 0.8], [-0.5, -0.2, 0.5], [0.5, -0.25, 0.5], [-0.15, -0.6, 0.42], [0.35, 0.45, 0.45], [-0.45, 0.4, 0.45]]) {
          const rr = r * k * (1 + Math.sin(t * 2 + x * 5) * 0.05);
          c.moveTo(x * r + rr, y * r);
          c.arc(x * r, y * r, rr, 0, TAU);
        }
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : '#9bd16f';
          for (const [x, y, k] of [[-0.55, -0.3, 0.1], [0.5, -0.4, 0.12], [0.2, 0.55, 0.09], [-0.2, -0.7, 0.08]]) {
            c.beginPath();
            c.arc(x * r, y * r, k * r, 0, TAU);
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.16, y: 0.05, angry: true });
        break;
      }
      case 'boxes': {
        // 段ボールの山: 箱が3つ積み重なっている
        const box = (x, y, w, h, rot) => {
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          c.fillStyle = col('#b98a52');
          c.fillRect(-w / 2, -h / 2, w, h);
          if (!sil) {
            c.fillStyle = mode === 1 ? '#fff' : '#d9b07a';
            c.fillRect(-w * 0.08, -h / 2, w * 0.16, h);
            c.strokeStyle = mode === 1 ? '#fff' : '#8a6438';
            c.lineWidth = 1.5;
            c.strokeRect(-w / 2, -h / 2, w, h);
          }
          c.restore();
        };
        box(-r * 0.45, r * 0.35, r * 0.9, r * 0.7, -0.05);
        box(r * 0.45, r * 0.35, r * 0.9, r * 0.7, 0.06);
        box(0, -r * 0.3, r * 0.95, r * 0.72, Math.sin(t * 2) * 0.06);
        eyes(c, r, sil, { size: 0.15, y: -0.3, angry: true });
        break;
      }
      case 'yokai': {
        c.fillStyle = col('#7a5a34');
        c.beginPath();
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * TAU;
          const rr = r * (0.95 + Math.sin(a * 5 + t * 3) * 0.07);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * 0.9;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          // バナナの皮・魚の骨・卵の殻
          c.fillStyle = mode === 1 ? '#fff' : '#e8d23a';
          c.beginPath();
          c.ellipse(-r * 0.5, r * 0.45, r * 0.3, r * 0.1, 0.5, 0, TAU);
          c.fill();
          c.strokeStyle = mode === 1 ? '#fff' : '#eee';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(r * 0.2, -r * 0.65);
          c.lineTo(r * 0.75, -r * 0.45);
          for (let i = 0; i < 4; i++) {
            const x = r * (0.3 + i * 0.12);
            const y = -r * (0.62 - i * 0.045);
            c.moveTo(x, y - r * 0.1);
            c.lineTo(x, y + r * 0.1);
          }
          c.stroke();
          c.fillStyle = mode === 1 ? '#fff' : '#f4efe0';
          c.beginPath();
          c.arc(r * 0.6, r * 0.4, r * 0.13, 0, TAU);
          c.fill();
        }
        eyes(c, r, sil, { size: 0.17, y: -0.2, angry: true });
        if (!sil) {
          c.fillStyle = '#3a0d0d';
          c.beginPath();
          c.ellipse(0, r * 0.2, r * 0.35, r * (0.12 + Math.abs(Math.sin(t * 4)) * 0.1), 0, 0, TAU);
          c.fill();
        }
        break;
      }
      case 'kaiju':
      case 'master': {
        const master = type === 'master';
        c.fillStyle = col(master ? '#5b3f6b' : '#2f4a2a');
        c.beginPath();
        const n = 22;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const spike = i % 2 ? 1.12 : 0.9;
          const rr = r * spike * (1 + Math.sin(t * 2 + i) * 0.03);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.fill();
        if (!sil) {
          c.fillStyle = mode === 1 ? '#fff' : master ? '#8a6a9a' : '#6f9b48';
          for (const [x, y, s] of [[-0.5, 0.4, 0.18], [0.5, 0.45, 0.15], [-0.15, -0.6, 0.12], [0.6, -0.3, 0.1], [-0.65, -0.2, 0.1]]) {
            c.beginPath();
            c.arc(x * r, y * r, s * r, 0, TAU);
            c.fill();
          }
          if (master) {
            c.fillStyle = mode === 1 ? '#fff' : '#ffcf4a';
            c.beginPath();
            c.moveTo(-r * 0.45, -r * 0.75);
            c.lineTo(-r * 0.45, -r * 1.2);
            c.lineTo(-r * 0.22, -r * 0.95);
            c.lineTo(0, -r * 1.3);
            c.lineTo(r * 0.22, -r * 0.95);
            c.lineTo(r * 0.45, -r * 1.2);
            c.lineTo(r * 0.45, -r * 0.75);
            c.closePath();
            c.fill();
          }
        }
        eyes(c, r, sil, { size: 0.15, y: -0.15, gap: 0.32, angry: true });
        if (!sil) {
          c.fillStyle = '#1a0606';
          c.beginPath();
          c.ellipse(0, r * 0.3, r * 0.42, r * (0.14 + Math.abs(Math.sin(t * 3)) * 0.1), 0, 0, TAU);
          c.fill();
          c.fillStyle = '#fff';
          for (let i = -2; i <= 2; i++) {
            c.beginPath();
            c.moveTo(i * r * 0.14 - r * 0.05, r * 0.2);
            c.lineTo(i * r * 0.14 + r * 0.05, r * 0.2);
            c.lineTo(i * r * 0.14, r * 0.3);
            c.fill();
          }
        }
        break;
      }
      default: break;
    }
  }

  // 清掃員ハジメのスプライト (hajime.png: 160×160 のコマが横に16。下・右・左・上の順に、それぞれ立ち＋歩き3コマ)
  // foot: コマの中の足もとの高さ、tall: 絵の中での背の高さ (どちらもピクセル)
  const HAJIME = { img: new Image(), white: null, ready: false, fw: 160, fh: 160, foot: 156, tall: 140 };
  HAJIME.img.onload = () => {
    // ダメージを受けたときの白いシルエット
    const cv = document.createElement('canvas');
    cv.width = HAJIME.img.width;
    cv.height = HAJIME.img.height;
    const c = cv.getContext('2d');
    c.drawImage(HAJIME.img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.width, cv.height);
    HAJIME.white = cv;
    HAJIME.ready = true;
    // 読みこむ前に作ったサムネイルを作り直して、出ている画像も差しかえる
    for (const sil of [false, true]) {
      const key = 'char-cleaner' + (sil ? '-s' : '');
      const old = thumbCache[key];
      if (!old) continue;
      delete thumbCache[key];
      const url = charThumb('cleaner', sil);
      document.querySelectorAll('img').forEach((im) => {
        if (im.getAttribute('src') === old) im.src = url;
      });
    }
  };
  HAJIME.img.src = 'hajime.png';

  function drawHajime(c, face, t, moving, hurt) {
    const fx = Math.cos(face);
    const fy = Math.sin(face);
    let dir;
    if (Math.abs(fx) > Math.abs(fy)) dir = fx > 0 ? 1 : 2;
    else dir = fy < 0 ? 3 : 0;
    const frame = dir * 4 + (moving ? Math.floor(t * 7) % 4 : 0);
    const h = 32; // 画面での背の高さ
    const k = h / HAJIME.tall;
    const src = hurt ? HAJIME.white : HAJIME.img;
    c.drawImage(src, frame * HAJIME.fw, 0, HAJIME.fw, HAJIME.fh, (-HAJIME.fw / 2) * k, 13 - HAJIME.foot * k, HAJIME.fw * k, HAJIME.fh * k);
  }

  function drawPlayerBody(c, charId, face, t, moving, hurt) {
    const bob = moving ? Math.sin(t * 14) * 1.5 : 0;
    c.save();
    c.translate(0, bob);
    // 影
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, 12 - bob, 12, 4, 0, 0, TAU);
    c.fill();
    if (charId === 'cleaner' && HAJIME.ready) {
      drawHajime(c, face, t, moving, hurt);
      c.restore();
      return;
    }
    const fx = Math.cos(face);
    const fy = Math.sin(face);
    if (charId === 'runta') {
      c.fillStyle = hurt ? '#fff' : '#3a4350';
      c.beginPath();
      c.arc(0, 0, 13, 0, TAU);
      c.fill();
      c.strokeStyle = '#7fe8c7';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 10, 0, TAU);
      c.stroke();
      c.fillStyle = '#20262e';
      c.beginPath();
      c.arc(0, 0, 13, face - 0.9, face + 0.9);
      c.lineTo(0, 0);
      c.fill();
      c.fillStyle = '#7fe8c7';
      c.beginPath();
      c.arc(fx * 8 - fy * 4, fy * 8 + fx * 4, 2, 0, TAU);
      c.arc(fx * 8 + fy * 4, fy * 8 - fx * 4, 2, 0, TAU);
      c.fill();
      c.restore();
      return;
    }
    const look = LOOKS[charId] || LOOKS.cleaner;
    const W = (col) => (hurt ? '#fff' : col);
    // 道具 (後ろ向きのときは体の後ろに描く)
    const tool = () => {
      c.save();
      c.rotate(face);
      switch (look.tool) {
        case 'gun':
          c.fillStyle = '#f2c230';
          c.fillRect(4, -3, 16, 6);
          c.fillStyle = '#333';
          c.fillRect(18, -2, 6, 4);
          break;
        case 'roller':
          c.strokeStyle = '#59616b';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(2, 3);
          c.lineTo(16, 3);
          c.stroke();
          c.fillStyle = '#f4f1e6';
          c.beginPath();
          c.roundRect(15, -6, 7, 14, 3);
          c.fill();
          break;
        case 'spray':
          c.fillStyle = '#e8f4f8';
          c.beginPath();
          c.roundRect(6, -4, 10, 9, 2);
          c.fill();
          c.fillStyle = '#2bb59a';
          c.fillRect(6, -1, 10, 3);
          c.fillStyle = '#666';
          c.fillRect(15, -3, 5, 3);
          break;
        case 'mop':
          c.strokeStyle = '#9aa3ad';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(0, 4);
          c.lineTo(18, 2);
          c.stroke();
          c.fillStyle = '#e8eef3';
          for (let k = -6; k <= 8; k += 3.5) {
            c.beginPath();
            c.ellipse(21, k, 4, 2, 0.3, 0, TAU);
            c.fill();
          }
          break;
        case 'duster':
          c.strokeStyle = '#8a5a2a';
          c.lineWidth = 2.5;
          c.beginPath();
          c.moveTo(2, 3);
          c.lineTo(15, 2);
          c.stroke();
          c.fillStyle = '#f2c230';
          c.beginPath();
          c.ellipse(20, 1, 7, 5, 0, 0, TAU);
          c.fill();
          c.fillStyle = '#e86aa0';
          c.beginPath();
          c.ellipse(22, 2, 4, 3, 0, 0, TAU);
          c.fill();
          break;
        case 'sponge':
          c.fillStyle = '#f4f7fb';
          c.beginPath();
          c.roundRect(8, -4, 11, 8, 2);
          c.fill();
          c.fillStyle = '#7fc8ff';
          c.fillRect(8, 2, 11, 2);
          break;
        case 'purifier':
          c.fillStyle = '#eef2f5';
          c.beginPath();
          c.roundRect(6, -6, 11, 13, 3);
          c.fill();
          c.fillStyle = '#7fe8c7';
          c.fillRect(8, -3, 7, 2);
          c.fillRect(8, 1, 7, 2);
          break;
        case 'broom':
          c.strokeStyle = '#8a5a2a';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(0, 4);
          c.lineTo(17, 2);
          c.stroke();
          c.fillStyle = '#d9b44a';
          c.beginPath();
          c.moveTo(16, -4);
          c.lineTo(25, -7);
          c.lineTo(25, 10);
          c.lineTo(16, 7);
          c.closePath();
          c.fill();
          break;
        default:
          c.strokeStyle = '#59616b';
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(2, 4);
          c.lineTo(18, 2);
          c.stroke();
          c.fillStyle = '#e04f3a';
          c.fillRect(17, -5, 6, 12);
      }
      c.restore();
    };
    if (fy < 0) tool();
    // 体
    c.fillStyle = W(look.body);
    c.beginPath();
    c.roundRect(-9, -4, 18, 15, 6);
    c.fill();
    if (look.coat) {
      c.fillStyle = W('#c9d3dc');
      c.fillRect(-1, -4, 2, 15);
    }
    if (look.apron) {
      c.fillStyle = W('#f4f1e6');
      c.beginPath();
      c.roundRect(-6, 0, 12, 10, 3);
      c.fill();
    }
    // 顔
    c.fillStyle = W('#f2c79e');
    c.beginPath();
    c.arc(0, -8, 8, 0, TAU);
    c.fill();
    // 帽子・髪
    c.fillStyle = W(look.hair);
    c.beginPath();
    c.arc(0, -10, 8.2, Math.PI, TAU);
    c.fill();
    if (look.cap) c.fillRect(fx >= 0 ? 0 : -12, -11, 12, 3);
    if (look.pigtails) {
      c.beginPath();
      c.arc(-9, -6, 3.2, 0, TAU);
      c.arc(9, -6, 3.2, 0, TAU);
      c.fill();
    }
    if (look.bun) {
      c.beginPath();
      c.arc(0, -17, 4, 0, TAU);
      c.fill();
    }
    if (look.spiky) {
      c.beginPath();
      for (let k = -2; k <= 2; k++) {
        c.moveTo(k * 3.4 - 2.4, -14);
        c.lineTo(k * 3.4, -21 + Math.abs(k));
        c.lineTo(k * 3.4 + 2.4, -14);
      }
      c.fill();
    }
    if (look.band) {
      c.fillStyle = W(look.band);
      c.fillRect(-8, -13, 16, 2.6);
    }
    if (look.ribbon) {
      c.fillStyle = W(look.ribbon);
      c.beginPath();
      c.moveTo(4, -16);
      c.lineTo(10, -20);
      c.lineTo(10, -12);
      c.closePath();
      c.moveTo(4, -16);
      c.lineTo(-2, -20);
      c.lineTo(-2, -12);
      c.closePath();
      c.fill();
    }
    // 目
    if (fy > -0.7) {
      c.fillStyle = '#222';
      c.beginPath();
      c.arc(-3 + fx * 2, -7, 1.3, 0, TAU);
      c.arc(3 + fx * 2, -7, 1.3, 0, TAU);
      c.fill();
      if (look.mask) {
        c.fillStyle = W('#ffffff');
        c.beginPath();
        c.roundRect(-5 + fx * 2, -5, 10, 5, 2);
        c.fill();
      }
      if (look.glasses) {
        c.strokeStyle = '#333';
        c.lineWidth = 1;
        c.beginPath();
        c.arc(-3 + fx * 2, -7, 2.4, 0, TAU);
        c.moveTo(5.4 + fx * 2, -7);
        c.arc(3 + fx * 2, -7, 2.4, 0, TAU);
        c.stroke();
      }
    }
    if (fy >= 0) tool();
    c.restore();
  }

  // 清掃員の見た目
  const LOOKS = {
    cleaner: { body: '#2f6fb3', hair: '#f08a24', cap: true, tool: 'vacuum' },
    mizuki: { body: '#2a9d8f', hair: '#2b2b33', tool: 'gun' },
    koroko: { body: '#e86aa0', hair: '#7a3b1e', pigtails: true, tool: 'roller' },
    kiyoshi: { body: '#eef2f5', hair: '#5a5f66', coat: true, mask: true, glasses: true, tool: 'spray' },
    tome: { body: '#7a4a9a', hair: '#d9d9d9', bun: true, tool: 'broom' },
    tsugumi: { body: '#8fbf5a', hair: '#c47a3a', apron: true, tool: 'sponge' },
    hayate: { body: '#3b7dd8', hair: '#1f2a44', band: '#f2f2f2', tool: 'duster' },
    reika: { body: '#f2a6c8', hair: '#f2d16b', ribbon: '#e0457b', tool: 'purifier' },
    gou: { body: '#2b2b33', hair: '#1a1a1a', band: '#e03a3a', spiky: true, tool: 'mop' },
  };

  // アイコン (64×64 を基準に描く)
  function drawIcon(c, id) {
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const glow = (color) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    };
    switch (id) {
      case 'vacuum':
      case 'blackhole':
        if (id === 'blackhole') {
          glow('rgba(170,90,255,0.75)');
          c.fillStyle = '#1a0b2e';
          c.beginPath();
          c.arc(44, 20, 12, 0, TAU);
          c.fill();
          c.strokeStyle = '#b77bff';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(44, 20, 12, 0, 4.5);
          c.stroke();
        }
        c.fillStyle = '#e04f3a';
        c.beginPath();
        c.roundRect(10, 30, 26, 22, 8);
        c.fill();
        c.fillStyle = '#333';
        c.beginPath();
        c.arc(16, 54, 4, 0, TAU);
        c.arc(32, 54, 4, 0, TAU);
        c.fill();
        c.strokeStyle = '#59616b';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(30, 34);
        c.quadraticCurveTo(44, 26, 46, 12);
        c.stroke();
        c.fillStyle = '#9aa4ad';
        c.fillRect(38, 6, 18, 8);
        break;
      case 'washer':
      case 'steam':
        if (id === 'steam') glow('rgba(255,140,60,0.7)');
        c.fillStyle = id === 'steam' ? '#f07f2a' : '#f2c230';
        c.beginPath();
        c.roundRect(6, 28, 30, 14, 4);
        c.fill();
        c.fillRect(14, 40, 8, 14);
        c.fillStyle = '#333';
        c.fillRect(34, 31, 10, 8);
        c.strokeStyle = id === 'steam' ? '#fff3e0' : '#5ec8ff';
        c.lineWidth = id === 'steam' ? 8 : 5;
        c.beginPath();
        c.moveTo(46, 35);
        c.lineTo(62, 35);
        c.stroke();
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.arc(54, 24, 3, 0, TAU);
        c.arc(58, 46, 2.5, 0, TAU);
        c.fill();
        break;
      case 'robot':
      case 'army':
      case 'roomba': {
        if (id === 'army') glow('rgba(80,230,180,0.6)');
        const disc = (x, y, r) => {
          c.fillStyle = '#3a4350';
          c.beginPath();
          c.arc(x, y, r, 0, TAU);
          c.fill();
          c.strokeStyle = '#7fe8c7';
          c.lineWidth = 2;
          c.beginPath();
          c.arc(x, y, r * 0.7, 0, TAU);
          c.stroke();
          c.fillStyle = '#7fe8c7';
          c.beginPath();
          c.arc(x, y - r * 0.4, r * 0.15, 0, TAU);
          c.fill();
        };
        if (id === 'army') {
          disc(20, 22, 12);
          disc(44, 22, 12);
          disc(32, 44, 14);
        } else {
          disc(30, 34, 20);
        }
        if (id === 'roomba') {
          c.strokeStyle = '#ffcf4a';
          c.lineWidth = 5;
          c.beginPath();
          c.moveTo(52, 6);
          c.lineTo(52, 22);
          c.moveTo(44, 14);
          c.lineTo(60, 14);
          c.stroke();
        }
        break;
      }
      case 'spray':
      case 'acid':
        if (id === 'acid') glow('rgba(180,255,90,0.6)');
        c.fillStyle = id === 'acid' ? 'rgba(190,255,120,0.75)' : 'rgba(110,230,200,0.7)';
        c.beginPath();
        c.arc(48, 18, 8, 0, TAU);
        c.arc(54, 30, 6, 0, TAU);
        c.arc(42, 30, 5, 0, TAU);
        c.fill();
        c.fillStyle = '#e8f4f8';
        c.beginPath();
        c.roundRect(14, 26, 20, 32, 5);
        c.fill();
        c.fillStyle = id === 'acid' ? '#7bc043' : '#2bb59a';
        c.fillRect(14, 36, 20, 10);
        c.fillStyle = '#666';
        c.fillRect(18, 16, 14, 10);
        c.fillRect(30, 18, 8, 4);
        break;
      case 'roller':
      case 'giant':
      case 'tape': {
        if (id === 'giant') glow('rgba(255,207,74,0.6)');
        if (id === 'tape') {
          c.fillStyle = '#e3d9b8';
          c.beginPath();
          c.arc(32, 32, 22, 0, TAU);
          c.fill();
          c.fillStyle = '#20262e';
          c.beginPath();
          c.arc(32, 32, 10, 0, TAU);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.4)';
          c.beginPath();
          c.arc(32, 32, 18, -2.6, -1.6);
          c.lineTo(32, 32);
          c.fill();
          break;
        }
        const big = id === 'giant';
        c.strokeStyle = '#59616b';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(32, 36);
        c.lineTo(52, 58);
        c.stroke();
        c.fillStyle = big ? '#ffcf4a' : '#f4f1e6';
        c.beginPath();
        c.roundRect(big ? 4 : 10, big ? 12 : 18, big ? 56 : 44, big ? 26 : 20, 8);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.2)';
        c.lineWidth = 1.5;
        for (let x = big ? 12 : 18; x < (big ? 58 : 52); x += 8) {
          c.beginPath();
          c.moveTo(x, big ? 14 : 20);
          c.lineTo(x, big ? 36 : 36);
          c.stroke();
        }
        break;
      }
      case 'mop':
      case 'tornado':
        if (id === 'tornado') {
          glow('rgba(110,220,255,0.7)');
          c.strokeStyle = 'rgba(200,245,255,0.9)';
          c.lineWidth = 3;
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            c.ellipse(32, 44 - k * 12, 26 - k * 6, 6, 0, 0.3, TAU - 0.3);
            c.stroke();
          }
        }
        c.strokeStyle = '#8a5a2b';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(48, 6);
        c.lineTo(30, 40);
        c.stroke();
        c.fillStyle = '#f2f2ee';
        for (let k = 0; k < 7; k++) {
          c.beginPath();
          c.roundRect(14 + k * 4.5, 40, 5, 18 - Math.abs(k - 3) * 1.5, 2.5);
          c.fill();
        }
        c.fillStyle = '#3a8dde';
        c.fillRect(16, 37, 30, 6);
        break;
      case 'duster':
      case 'gale': {
        if (id === 'gale') glow('rgba(255,200,90,0.7)');
        c.strokeStyle = '#8a5a2b';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(52, 56);
        c.lineTo(32, 32);
        c.stroke();
        const cols = id === 'gale' ? ['#ffcf4a', '#ff8ad8', '#7fc8ff'] : ['#ff9ab0', '#ffe08a', '#a8e6ff'];
        for (let k = 0; k < 9; k++) {
          const a = -2.4 + (k / 8) * 2.2;
          c.fillStyle = cols[k % 3];
          c.beginPath();
          c.ellipse(28 + Math.cos(a) * 12, 28 + Math.sin(a) * 12, 13, 5, a, 0, TAU);
          c.fill();
        }
        break;
      }
      case 'bomb':
      case 'foam':
        if (id === 'foam') glow('rgba(255,150,220,0.7)');
        c.strokeStyle = id === 'foam' ? '#ffd1f0' : '#bfe9ff';
        c.lineWidth = 2;
        [[48, 16, 7], [56, 30, 5], [42, 8, 4], [14, 14, 5]].forEach(([x, y, r]) => {
          c.beginPath();
          c.arc(x, y, r, 0, TAU);
          c.stroke();
        });
        c.fillStyle = id === 'foam' ? '#ff8ad8' : '#4fb6ff';
        c.beginPath();
        c.roundRect(18, 24, 26, 34, 7);
        c.fill();
        c.fillStyle = '#f4f6f8';
        c.fillRect(25, 12, 12, 13);
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillRect(22, 36, 18, 10);
        break;
      case 'sponge':
      case 'meteor':
        if (id === 'meteor') {
          glow('rgba(255,180,80,0.7)');
          c.strokeStyle = 'rgba(255,220,140,0.8)';
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(4, 8);
          c.lineTo(22, 22);
          c.moveTo(4, 26);
          c.lineTo(18, 34);
          c.stroke();
        }
        c.save();
        c.translate(36, 36);
        c.rotate(-0.35);
        c.fillStyle = id === 'meteor' ? '#ffcf4a' : '#f6f3ea';
        c.beginPath();
        c.roundRect(-20, -14, 40, 28, 5);
        c.fill();
        c.fillStyle = id === 'meteor' ? '#ff8a5c' : '#6fd3a8';
        c.fillRect(-20, 3, 40, 11);
        c.restore();
        break;
      case 'press':
      case 'megapress':
        if (id === 'megapress') glow('rgba(255,180,80,0.75)');
        c.fillStyle = '#59616b';
        c.fillRect(14, 6, 36, 8);
        c.fillRect(29, 14, 6, 12);
        c.fillStyle = id === 'megapress' ? '#ffcf4a' : '#9fb0bf';
        c.fillRect(10, 26, 44, 9);
        c.fillStyle = '#c7b48a';
        c.beginPath();
        c.roundRect(16, 38, 32, 14, 3);
        c.fill();
        c.strokeStyle = '#8a7a58';
        c.lineWidth = 2;
        c.strokeRect(16, 38, 32, 14);
        c.strokeStyle = id === 'megapress' ? 'rgba(255,220,140,0.9)' : 'rgba(255,255,255,0.7)';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(4, 56);
        c.lineTo(12, 48);
        c.moveTo(60, 56);
        c.lineTo(52, 48);
        c.stroke();
        break;
      case 'hydraulic':
        c.fillStyle = '#9fb0bf';
        c.fillRect(22, 30, 20, 28);
        c.fillStyle = '#d9dee3';
        c.fillRect(28, 8, 8, 24);
        c.fillStyle = '#e04f3a';
        c.fillRect(18, 4, 28, 6);
        c.fillStyle = '#59616b';
        c.fillRect(22, 40, 20, 4);
        break;
      case 'purifier':
      case 'aura':
        if (id === 'aura') glow('rgba(255,214,120,0.75)');
        c.strokeStyle = id === 'aura' ? 'rgba(255,230,160,0.95)' : 'rgba(150,230,255,0.95)';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(32, 32, id === 'aura' ? 29 : 27, -2.6, -0.5);
        c.stroke();
        c.beginPath();
        c.arc(32, 32, id === 'aura' ? 29 : 27, 0.55, 2.6);
        c.stroke();
        c.fillStyle = '#f4f6f8';
        c.beginPath();
        c.roundRect(20, 12, 24, 42, 7);
        c.fill();
        c.fillStyle = '#9aa4ad';
        for (let k = 0; k < 5; k++) c.fillRect(24, 18 + k * 5, 16, 2);
        c.fillStyle = id === 'aura' ? '#ffcf4a' : '#4fc3ff';
        c.beginPath();
        c.arc(32, 46, 3.5, 0, TAU);
        c.fill();
        break;
      case 'filter':
        c.fillStyle = '#e8eef2';
        c.beginPath();
        c.roundRect(12, 14, 40, 36, 4);
        c.fill();
        c.strokeStyle = '#7d8a96';
        c.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          c.beginPath();
          c.moveTo(16 + k * 6.4, 16);
          c.lineTo(19 + k * 6.4, 32);
          c.lineTo(16 + k * 6.4, 48);
          c.stroke();
        }
        c.fillStyle = '#5fe08a';
        c.fillRect(42, 6, 6, 18);
        c.fillRect(36, 12, 18, 6);
        break;
      case 'wax':
        c.fillStyle = '#e8c35a';
        c.beginPath();
        c.roundRect(16, 16, 32, 42, 6);
        c.fill();
        c.fillStyle = '#9a7a2a';
        c.fillRect(24, 6, 16, 11);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        c.moveTo(32, 26);
        c.lineTo(35, 34);
        c.lineTo(43, 37);
        c.lineTo(35, 40);
        c.lineTo(32, 48);
        c.lineTo(29, 40);
        c.lineTo(21, 37);
        c.lineTo(29, 34);
        c.closePath();
        c.fill();
        break;
      case 'battery':
        c.fillStyle = '#2f3a46';
        c.beginPath();
        c.roundRect(12, 18, 38, 28, 4);
        c.fill();
        c.fillRect(50, 26, 6, 12);
        c.fillStyle = '#4fe0b6';
        c.fillRect(16, 22, 30, 20);
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(34, 20);
        c.lineTo(24, 34);
        c.lineTo(31, 34);
        c.lineTo(28, 44);
        c.lineTo(38, 30);
        c.lineTo(31, 30);
        c.closePath();
        c.fill();
        break;
      case 'boiler':
        c.fillStyle = '#ff7a2f';
        c.beginPath();
        c.moveTo(32, 6);
        c.quadraticCurveTo(54, 30, 46, 46);
        c.quadraticCurveTo(40, 60, 32, 58);
        c.quadraticCurveTo(14, 58, 16, 40);
        c.quadraticCurveTo(18, 26, 32, 6);
        c.fill();
        c.fillStyle = '#ffd65a';
        c.beginPath();
        c.moveTo(32, 26);
        c.quadraticCurveTo(44, 40, 38, 50);
        c.quadraticCurveTo(32, 56, 26, 50);
        c.quadraticCurveTo(22, 40, 32, 26);
        c.fill();
        break;
      case 'bleach':
        c.fillStyle = '#f4f6f8';
        c.beginPath();
        c.roundRect(16, 18, 32, 40, 6);
        c.fill();
        c.fillStyle = '#3a8dde';
        c.fillRect(22, 8, 14, 12);
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(32, 28);
        c.lineTo(42, 46);
        c.lineTo(22, 46);
        c.closePath();
        c.fill();
        c.fillStyle = '#333';
        c.fillRect(31, 33, 2, 7);
        c.fillRect(31, 42, 2, 2);
        break;
      case 'dustpack':
        c.fillStyle = '#c7b48a';
        c.beginPath();
        c.moveTo(14, 20);
        c.quadraticCurveTo(10, 56, 32, 58);
        c.quadraticCurveTo(54, 56, 50, 20);
        c.closePath();
        c.fill();
        c.fillStyle = '#8a7a58';
        c.fillRect(12, 14, 40, 8);
        c.fillStyle = '#6b5f45';
        c.beginPath();
        c.arc(26, 40, 3, 0, TAU);
        c.arc(36, 46, 2.5, 0, TAU);
        c.arc(38, 34, 2, 0, TAU);
        c.fill();
        break;
      case 'boots':
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.moveTo(18, 8);
        c.lineTo(36, 8);
        c.lineTo(36, 40);
        c.lineTo(54, 44);
        c.quadraticCurveTo(58, 56, 50, 56);
        c.lineTo(14, 56);
        c.closePath();
        c.fill();
        c.fillStyle = '#c99a1a';
        c.fillRect(14, 50, 42, 6);
        break;
      case 'gloves':
        c.fillStyle = '#f5d33c';
        c.beginPath();
        c.roundRect(18, 26, 26, 30, 6);
        c.fill();
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.roundRect(18 + i * 6.5, 8 + (i === 0 || i === 3 ? 6 : 0), 6, 24, 3);
          c.fill();
        }
        c.beginPath();
        c.roundRect(40, 30, 16, 7, 3);
        c.fill();
        c.fillStyle = '#e0b91c';
        c.fillRect(18, 52, 26, 6);
        break;
      case 'heal':
        c.fillStyle = '#fafafa';
        c.beginPath();
        c.moveTo(32, 8);
        c.quadraticCurveTo(58, 40, 52, 52);
        c.quadraticCurveTo(32, 60, 12, 52);
        c.quadraticCurveTo(6, 40, 32, 8);
        c.fill();
        c.fillStyle = '#1f2f22';
        c.fillRect(18, 38, 28, 16);
        break;
      case 'coin':
        c.fillStyle = '#ffcf4a';
        c.beginPath();
        c.arc(32, 32, 22, 0, TAU);
        c.fill();
        c.strokeStyle = '#c9971a';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(32, 32, 16, 0, TAU);
        c.stroke();
        break;
      case 'treasure':
        glow('rgba(255,220,120,0.75)');
        c.fillStyle = '#ffd34a';
        c.beginPath();
        c.moveTo(32, 8);
        c.lineTo(52, 26);
        c.lineTo(32, 58);
        c.lineTo(12, 26);
        c.closePath();
        c.fill();
        c.fillStyle = '#fff3b0';
        c.beginPath();
        c.moveTo(32, 8);
        c.lineTo(40, 26);
        c.lineTo(24, 26);
        c.closePath();
        c.fill();
        c.fillStyle = '#e0a21a';
        c.beginPath();
        c.moveTo(12, 26);
        c.lineTo(52, 26);
        c.lineTo(32, 58);
        c.closePath();
        c.globalAlpha = 0.45;
        c.fill();
        c.globalAlpha = 1;
        break;
      case 'chest':
        c.fillStyle = '#9a5b2a';
        c.beginPath();
        c.roundRect(8, 24, 48, 32, 4);
        c.fill();
        c.fillStyle = '#b8743a';
        c.beginPath();
        c.roundRect(8, 14, 48, 16, [10, 10, 2, 2]);
        c.fill();
        c.fillStyle = '#ffcf4a';
        c.fillRect(8, 28, 48, 4);
        c.fillRect(28, 24, 8, 12);
        break;
      default: break;
    }
    c.restore();
  }

  const iconCache = {};
  function iconCanvas(id) {
    if (!iconCache[id]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      drawIcon(cv.getContext('2d'), id);
      iconCache[id] = cv;
    }
    return iconCache[id];
  }
  const iconURL = (id) => iconCanvas(id).toDataURL();

  // ステージのモチーフ (64×64 を基準に描く): 家・フライパン・浴槽・段ボール・木・屋根裏の窓・ボイラー・タイヤ・おばけ・王冠
  function drawStageMotif(c, i) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const fill = (col, f) => { c.fillStyle = col; c.beginPath(); f(); c.fill(); };
    const line = (col, w, f) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); f(); c.stroke(); };
    switch (i) {
      case 0: // ゴミ屋敷の1階: 家と、玄関のゴミ袋
        fill('#c0392b', () => { c.moveTo(10, 30); c.lineTo(32, 12); c.lineTo(54, 30); c.closePath(); });
        fill('#f4ead5', () => c.rect(16, 29, 32, 22));
        fill('#7a4a2a', () => c.rect(28, 37, 9, 14));
        fill('#7fc8ff', () => c.rect(19, 33, 7, 6));
        fill('#3d3d45', () => { c.arc(46, 49, 7, 0, TAU); });
        line('#3d3d45', 2, () => { c.moveTo(46, 42); c.lineTo(44, 38); c.moveTo(46, 42); c.lineTo(49, 38); });
        break;
      case 1: // 呪われた台所: フライパンと湯気
        fill('#2c2f36', () => c.ellipse(28, 40, 16, 9, 0, 0, TAU));
        fill('#5a5f69', () => c.ellipse(28, 38, 13, 6.5, 0, 0, TAU));
        line('#7a4a2a', 5, () => { c.moveTo(42, 38); c.lineTo(56, 32); });
        fill('#f6d24a', () => c.ellipse(26, 37, 6, 3.5, 0, 0, TAU));
        line('rgba(255,255,255,0.85)', 2.5, () => { c.moveTo(20, 26); c.quadraticCurveTo(16, 20, 21, 15); c.moveTo(30, 25); c.quadraticCurveTo(26, 18, 31, 12); });
        break;
      case 2: // カビだらけの水まわり: 浴槽と泡
        fill('#f4f7fb', () => c.roundRect(10, 30, 44, 18, 8));
        fill('#7fc8ff', () => c.rect(12, 30, 40, 5));
        fill('#c9d3dc', () => { c.rect(16, 47, 4, 6); c.rect(44, 47, 4, 6); });
        for (const [x, y, rr] of [[20, 24, 5], [30, 19, 6], [41, 23, 5], [36, 12, 3.5]]) {
          fill('rgba(255,255,255,0.9)', () => c.arc(x, y, rr, 0, TAU));
          line('#7fc8ff', 1.2, () => c.arc(x, y, rr, 0, TAU));
        }
        fill('#4f8a3a', () => { c.arc(14, 51, 3, 0, TAU); c.arc(50, 53, 2.5, 0, TAU); });
        break;
      case 3: // 開かずの物置と2階: 積み上がった段ボール
        for (const [x, y, w, h] of [[10, 34, 24, 18], [32, 38, 22, 14], [18, 16, 22, 18]]) {
          fill('#c99a5b', () => c.rect(x, y, w, h));
          fill('#a87a40', () => c.rect(x, y, w, 4));
          line('#e8d0a0', 2, () => { c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); });
        }
        break;
      case 4: // 荒れ果てた庭: 木と生け垣
        fill('#6b4a2a', () => c.rect(29, 30, 6, 18));
        fill('#3f8f45', () => { c.arc(32, 24, 13, 0, TAU); c.arc(22, 30, 8, 0, TAU); c.arc(42, 30, 8, 0, TAU); });
        fill('#2f6f35', () => c.roundRect(6, 44, 52, 10, 5));
        fill('#ff8ad8', () => { c.arc(16, 44, 3, 0, TAU); c.arc(48, 45, 3, 0, TAU); });
        break;
      case 5: // ほこりの屋根裏: 三角屋根の窓とほこり
        fill('#7a5a3a', () => { c.moveTo(8, 50); c.lineTo(32, 12); c.lineTo(56, 50); c.closePath(); });
        fill('#3a2a1e', () => { c.moveTo(16, 48); c.lineTo(32, 22); c.lineTo(48, 48); c.closePath(); });
        fill('#ffe9a0', () => c.arc(32, 36, 7, 0, TAU));
        line('#7a5a3a', 2, () => { c.moveTo(25, 36); c.lineTo(39, 36); c.moveTo(32, 29); c.lineTo(32, 43); });
        fill('rgba(220,210,190,0.9)', () => { c.arc(14, 18, 4, 0, TAU); c.arc(50, 20, 3, 0, TAU); c.arc(46, 12, 2, 0, TAU); });
        break;
      case 6: // 地下のボイラー室: ボイラーと炎
        fill('#8a8f99', () => c.roundRect(14, 12, 30, 40, 8));
        fill('#5a5f69', () => c.rect(14, 22, 30, 3));
        fill('#2c2f36', () => c.roundRect(20, 34, 18, 12, 3));
        fill('#ff8a3a', () => { c.moveTo(29, 45); c.quadraticCurveTo(22, 40, 29, 33); c.quadraticCurveTo(36, 40, 29, 45); });
        line('#c9d3dc', 4, () => { c.moveTo(44, 18); c.lineTo(54, 18); c.lineTo(54, 8); });
        break;
      case 7: // ガラクタの車庫: タイヤと空き缶
        fill('#2c2f36', () => c.arc(26, 34, 17, 0, TAU));
        fill('#8a8f99', () => c.arc(26, 34, 8, 0, TAU));
        line('#4a4f59', 2, () => c.arc(26, 34, 13, 0, TAU));
        fill('#d94a3a', () => c.roundRect(44, 32, 11, 18, 3));
        fill('#c9d3dc', () => c.rect(44, 32, 11, 3));
        break;
      case 8: // 幽霊の大宴会場: おばけとろうそく
        fill('rgba(255,255,255,0.95)', () => {
          c.moveTo(14, 50); c.lineTo(14, 28); c.arc(28, 28, 14, Math.PI, 0); c.lineTo(42, 50);
          c.lineTo(37, 45); c.lineTo(32, 50); c.lineTo(28, 45); c.lineTo(23, 50); c.lineTo(19, 45); c.closePath();
        });
        fill('#2c2f36', () => { c.arc(23, 28, 2.4, 0, TAU); c.arc(33, 28, 2.4, 0, TAU); });
        fill('#f4ead5', () => c.rect(48, 30, 6, 20));
        fill('#ffcf4a', () => c.ellipse(51, 26, 3, 5, 0, 0, TAU));
        break;
      default: // 屋敷の主の間: 王冠
        fill('#ffcf4a', () => { c.moveTo(12, 46); c.lineTo(12, 22); c.lineTo(22, 32); c.lineTo(32, 16); c.lineTo(42, 32); c.lineTo(52, 22); c.lineTo(52, 46); c.closePath(); });
        fill('#d9a520', () => c.rect(12, 42, 40, 6));
        fill('#ff5a6a', () => c.arc(32, 36, 4, 0, TAU));
        fill('#7fc8ff', () => { c.arc(20, 38, 3, 0, TAU); c.arc(44, 38, 3, 0, TAU); });
    }
  }

  // ステージ選択のパネルの背景にするイラスト (400×150)。床の模様・汚れ・そのステージのゴミ・大きなモチーフ
  const stageArtCache = {};
  function stageArtURL(i) {
    if (stageArtCache[i]) return stageArtCache[i];
    const W = 400;
    const H = 150;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    const st = STAGES[i];
    const rnd = mulberry32(500 + i * 31);
    // 床: スタートの部屋の床の模様
    const floor = st.rooms.find((r) => r.id === st.start).floor;
    c.fillStyle = c.createPattern(makeFloorPattern(floor), 'repeat');
    c.fillRect(0, 0, W, H);
    // 汚れ: ステージの汚れの色のしみ
    const [r, g, b] = st.dirt;
    for (let k = 0; k < 14; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const rr = 18 + rnd() * 46;
      const grad = c.createRadialGradient(x, y, 0, x, y, rr);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.75)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.fillStyle = `rgba(${r},${g},${b},0.25)`;
    c.fillRect(0, 0, W, H);
    // モチーフ: 右側に大きく、後ろをほんのり明るく
    const glow = c.createRadialGradient(W - 86, H / 2, 10, W - 86, H / 2, 95);
    glow.addColorStop(0, 'rgba(255,248,220,0.55)');
    glow.addColorStop(1, 'rgba(255,248,220,0)');
    c.fillStyle = glow;
    c.fillRect(W - 200, 0, 200, H);
    c.save();
    c.translate(W - 150, H / 2 - 62);
    c.scale(1.95, 1.95);
    drawStageMotif(c, i);
    c.restore();
    // ゴミ: そのステージによく出るゴミを、まん中あたりに散らす
    const kinds = ['dust', 'paper', 'hair', ...Object.keys(st.weights).filter((k) => ENEMIES[k] && !ENEMIES[k].source)];
    for (let k = 0; k < 6; k++) {
      const type = kinds[Math.floor(rnd() * kinds.length)];
      const x = W * 0.56 + rnd() * W * 0.16;
      const y = 26 + rnd() * (H - 52);
      c.save();
      c.translate(x, y);
      drawEnemyBody(c, type, 9 + rnd() * 5, rnd() * 10, 0, rnd() * TAU);
      c.restore();
    }
    stageArtCache[i] = cv.toDataURL();
    return stageArtCache[i];
  }

  const thumbCache = {};
  function enemyThumb(type, sil) {
    const key = type + (sil ? '-s' : '');
    if (!thumbCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const c = cv.getContext('2d');
      const r = ENEMIES[type].boss ? 30 : 26;
      c.translate(48, 52);
      drawEnemyBody(c, type, r, 0.3, sil ? 2 : 0, type === 'can' || type === 'bottle' ? 0.4 : 0);
      thumbCache[key] = cv.toDataURL();
    }
    return thumbCache[key];
  }

  function charThumb(id, sil = false) {
    const key = 'char-' + id + (sil ? '-s' : '');
    if (!thumbCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.translate(32, 34);
      c.scale(1.7, 1.7);
      drawPlayerBody(c, id, id === 'cleaner' ? Math.PI / 2 : 0.5, 0, false, false);
      if (sil) {
        // まだ仲間になっていない清掃員はシルエット
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = '#0d0f12';
        c.fillRect(0, 0, 64, 64);
      }
      thumbCache[key] = cv.toDataURL();
    }
    return thumbCache[key];
  }

  // 床の模様
  function makeFloorPattern(kind) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    switch (kind) {
      case 'wood':
        c.fillStyle = '#d6b183';
        c.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 4; row++) {
          c.fillStyle = row % 2 ? '#cfa877' : '#dbb88c';
          c.fillRect(0, row * 16, 64, 15);
          c.fillStyle = '#a9824f';
          c.fillRect(0, row * 16 + 15, 64, 1);
          c.fillRect(((row * 37) % 64), row * 16, 1, 15);
        }
        break;
      case 'kitchen':
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 2; x++) {
            c.fillStyle = (x + y) % 2 ? '#e9e4d8' : '#c9c1ad';
            c.fillRect(x * 32, y * 32, 32, 32);
          }
        }
        break;
      case 'bath':
        c.fillStyle = '#9fc3cf';
        c.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            c.fillStyle = (x * 3 + y) % 5 ? '#d6eaf0' : '#c4e0ea';
            c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
          }
        }
        break;
      case 'concrete': {
        c.fillStyle = '#b3aea5';
        c.fillRect(0, 0, 64, 64);
        const r = mulberry32(7);
        for (let i = 0; i < 60; i++) {
          c.fillStyle = r() < 0.5 ? '#a39e95' : '#c1bcb3';
          c.fillRect(r() * 64, r() * 64, 2, 2);
        }
        c.fillStyle = '#9a958c';
        c.fillRect(0, 63, 64, 1);
        c.fillRect(63, 0, 1, 64);
        break;
      }
      case 'tatami':
        for (let k = 0; k < 2; k++) {
          c.fillStyle = k ? '#c9c58a' : '#d3cf93';
          c.fillRect(0, k * 32, 64, 32);
          c.fillStyle = 'rgba(120,120,60,0.18)';
          for (let x = 0; x < 64; x += 3) c.fillRect(x, k * 32, 1, 32);
          c.fillStyle = '#5a6b3a';
          c.fillRect(0, k * 32, 64, 3);
        }
        break;
      case 'grass':
        c.fillStyle = '#7fae5a';
        c.fillRect(0, 0, 64, 64);
        {
          const r = mulberry32(11);
          for (let i = 0; i < 90; i++) {
            c.fillStyle = r() < 0.5 ? '#6f9e4c' : '#93c26a';
            c.fillRect(r() * 64, r() * 64, 2, 4);
          }
        }
        break;
      case 'attic':
        c.fillStyle = '#8a6a48';
        c.fillRect(0, 0, 64, 64);
        for (let row = 0; row < 4; row++) {
          c.fillStyle = row % 2 ? '#836344' : '#94744f';
          c.fillRect(0, row * 16, 64, 15);
          c.fillStyle = '#5e4630';
          c.fillRect(0, row * 16 + 15, 64, 1);
          c.fillRect((row * 23) % 64, row * 16, 1, 15);
        }
        break;
      case 'stone':
        c.fillStyle = '#8f8c86';
        c.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 2; y++) {
          for (let x = 0; x < 2; x++) {
            c.fillStyle = (x + y) % 2 ? '#b5b1a9' : '#a9a59d';
            c.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
          }
        }
        break;
      case 'carpet':
        c.fillStyle = '#8a2a3a';
        c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#c99a3a';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(32, 4);
        c.lineTo(60, 32);
        c.lineTo(32, 60);
        c.lineTo(4, 32);
        c.closePath();
        c.stroke();
        c.fillStyle = '#a3384a';
        c.beginPath();
        c.arc(32, 32, 6, 0, TAU);
        c.fill();
        break;
      default: break;
    }
    return cv;
  }

  // ===================================================================
  // 画面と入力
  // ===================================================================
  const wrap = document.getElementById('board-wrap');
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const pauseBtn = document.getElementById('pause-btn');
  const langBtn = document.getElementById('lang-btn');
  const bombBtn = document.getElementById('bomb-btn');

  const view = { w: 0, h: 0, dpr: 1, zoom: 1, ww: 0, wh: 0 };
  function resize() {
    const rect = wrap.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * view.dpr);
    canvas.height = Math.round(rect.height * view.dpr);
    view.zoom = clamp(Math.min(view.w, view.h) / 560, 0.7, 1.3);
    view.ww = view.w / view.zoom;
    view.wh = view.h / view.zoom;
  }
  new ResizeObserver(() => {
    resize();
    if (screen === 'levelup') fitPanel(); // 画面の大きさが変わったら、レベルアップの画面も収め直す
  }).observe(wrap);
  resize();

  const keys = new Set();
  // 移動のキーはキーボードの配列によらず、WASD の位置のキーで動く (フランス語の AZERTY なら ZQSD)
  const MOVE_CODES = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
  const keyName = (e) => MOVE_CODES[e.code] || (e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };

  window.addEventListener('keydown', (e) => {
    Sound.init();
    const k = e.key;
    if (G && G.state === 'play' && !G.paused && overlay.hidden) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      keys.add(keyName(e));
      if (k === 'Escape' || k === 'p' || k === 'P') pauseGame();
      return;
    }
    if (screen === 'levelup' && /^[1-4]$/.test(k)) {
      const b = overlay.querySelector(`[data-key="${k}"]`);
      if (b) b.click();
      return;
    }
    if (k === 'Escape') {
      const back = overlay.querySelector('[data-back]');
      if (back) back.click();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(keyName(e));
  });
  window.addEventListener('blur', () => keys.clear());
  // ブラウザは画面を触るまで音を出せないので、どこを触っても音を出せるようにする (タイトルの曲がすぐ流れる)
  window.addEventListener('pointerdown', () => Sound.init(), { capture: true });

  canvas.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (!G || G.state !== 'play' || G.paused || !overlay.hidden) return;
    if (joy.id !== null) return;
    const rect = canvas.getBoundingClientRect();
    joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX - rect.left;
    joy.oy = joy.y = e.clientY - rect.top;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    const rect = canvas.getBoundingClientRect();
    joy.x = e.clientX - rect.left;
    joy.y = e.clientY - rect.top;
    // 指が遠くへ行ったら、スティックの中心もついていく
    const dx = joy.x - joy.ox;
    const dy = joy.y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > 70) {
      joy.ox = joy.x - (dx / d) * 70;
      joy.oy = joy.y - (dy / d) * 70;
    }
  });
  const endJoy = (e) => {
    if (e.pointerId === joy.id) joy.id = null;
  };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  pauseBtn.addEventListener('click', () => pauseGame());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  function inputVector() {
    let x = 0;
    let y = 0;
    if (keys.has('a') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) x += 1;
    if (keys.has('w') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) y += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      return [x / d, y / d];
    }
    if (joy.id !== null) {
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d < 6) return [0, 0];
      const m = Math.min(1, d / 50);
      return [(dx / d) * m, (dy / d) * m];
    }
    return [0, 0];
  }

  // ===================================================================
  // ゲームの状態
  // ===================================================================
  let G = null;
  let screen = 'title';

  function newGame(stageIdx) {
    const stage = stageOf(stageIdx);
    const ch = CHARS.find((c) => c.id === save.char && charUnlocked(c)) || CHARS[0];
    const mode = stageIdx !== TUT && save.mode === 'hard' && hardUnlocked(stageIdx) ? 'hard' : 'normal';
    G = {
      stageIdx,
      tutorial: stageIdx === TUT ? { step: 0, stepT: 0, moved: 0, doneT: 0 } : null,
      dumpCount: 0,
      chestsOpened: 0,
      stage,
      ch,
      mode,
      md: modeOf(mode, stageIdx),
      state: 'play', // play / win / dead
      paused: false,
      time: 0,
      endT: 0,
      eventIdx: 0,
      p: { x: ROOM / 2, y: ROOM / 2, vx: 0, vy: 0, r: 11, hp: 100, face: 0, inv: 0, slowT: 0, slowAmt: 0, allergyT: 0, moving: false, anim: 0, hurtT: 0 },
      stats: {},
      weapons: [],
      passives: {},
      level: 1,
      xp: 0,
      xpNext: xpFor(1),
      pendingLv: 0,
      rerolls: 0, // レベルアップの選び直し (宝物の恒久スキル「リロール」で 1 回。広告を見ると 2 回ぶん増える)
      lvShown: 0, // 出したレベルアップ画面の数
      adRerollAt: -99, // 広告でリロールを増やした画面の番号 (そのあと AD_REROLL_WAIT 回は広告を出さない)
      freeRevive: false, // 宝物の恒久スキル「復活」で、まだ使える復活
      trCond: null, // 宝物の取得条件 (startGame で決める)
      trSpawned: true,
      minHp: 1, // このプレイでいちばん減ったときの体力の割合
      adRevived: false, // 広告で復活したか (1 回のプレイで 1 回だけ)
      box: 0,
      dumpCoins: 0,
      bossCoins: 0,
      kills: 0,
      killsByType: {},
      enemies: [],
      pool: [],
      gems: [],
      items: [],
      zones: [],
      bullets: [],
      clouds: [],
      beams: [],
      swings: [],
      booms: [],
      bombs: [],
      blasts: [],
      sponges: [],
      parts: [],
      trail: [],
      dumps: [],
      dumpIdx: -1,
      spawnT: 0,
      growT: 0,
      rushT: 0,
      rushUntil: 0,
      bosses: [],
      banner: null,
      roomCoins: 0,
      bonus: { speed: 0, magnet: 0, hp: 0, regen: 0, might: 0, cd: 0, box: 0, armor: 0, area: 0 },
      curRoom: -1,
      flowT: 0,
      mapT: 0,
      shake: 0,
      flash: 0,
      hitstop: 0,
      sparkBudget: 0,
      kyuStreak: 0,
      eliteChestT: -99,
      haze: 1,
      hazeT: 0,
      kyuLast: -1,
      cam: { x: ROOM / 2, y: ROOM / 2 },
    };
    G.p.face = 0;
    buildHouse();
    for (const id of ch.weapons) addWeapon(id);
    recalcStats();
    G.p.hp = G.stats.maxHp;
  }

  // ---- 間取り ----
  // roomGrid: マスごとの部屋の番号 / blocked: 0=床 1=壁 2=段ボール
  function buildLayout(stage, stageIdx) {
    const roomGrid = new Int8Array(BN * BN).fill(-1);
    stage.rooms.forEach((r, id) => {
      const [x, y, w, h] = r.rect;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) roomGrid[(y + j) * BN + x + i] = id;
    });
    const blocked = new Uint8Array(BN * BN);
    // 右か下のマスが別の部屋なら壁にする (壁の厚さは1マス)
    for (let y = 0; y < BN; y++) {
      for (let x = 0; x < BN; x++) {
        const c = y * BN + x;
        if (roomGrid[c] >= 0 && ((x < BN - 1 && roomGrid[c + 1] !== roomGrid[c]) || (y < BN - 1 && roomGrid[c + BN] !== roomGrid[c]))) blocked[c] = 1;
      }
    }
    // 家の外 (どの部屋でもないマス): 部屋の床のとなりは壁 (1)、それ以外は通れない外 (3)
    for (let c = 0; c < BN * BN; c++) {
      if (roomGrid[c] >= 0) continue;
      const x = c % BN;
      const y = Math.floor(c / BN);
      let near = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < BN && ny < BN && roomGrid[ny * BN + nx] >= 0 && !blocked[ny * BN + nx]) near = true;
        }
      }
      blocked[c] = near ? 1 : 3;
    }
    // ドア: 2つの部屋の間の壁の、まん中3マスを開ける
    const idOf = (name) => stage.rooms.findIndex((r) => r.id === name);
    const doorCells = [];
    for (const [a, b] of stage.doors) {
      const ia = idOf(a);
      const ib = idOf(b);
      const cells = [];
      for (let c = 0; c < BN * BN; c++) {
        if (!blocked[c]) continue;
        const x = c % BN;
        const id = roomGrid[c];
        const right = x < BN - 1 ? roomGrid[c + 1] : -2;
        const down = c + BN < BN * BN ? roomGrid[c + BN] : -2;
        const other = id === ia ? ib : id === ib ? ia : -3;
        if (other !== -3 && (right === other || down === other) && !(right !== id && down !== id && right !== down)) cells.push(c);
      }
      const mid = Math.floor(cells.length / 2);
      for (let k = -1; k <= 1; k++) {
        const c = cells[mid + k];
        if (c == null) continue;
        blocked[c] = 0;
        doorCells.push(c);
      }
    }
    // 段ボール (ドアの前と部屋のまん中はあけておく)
    const rnd = mulberry32(1000 + stageIdx * 77);
    stage.rooms.forEach((r) => {
      if (!r.boxes) return;
      const [rx, ry, rw, rh] = r.rect;
      for (let k = 0, placed = 0; k < 60 && placed < r.boxes; k++) {
        const w = 1 + Math.floor(rnd() * 2);
        const h = 1 + Math.floor(rnd() * 2);
        const bx = rx + 1 + Math.floor(rnd() * (rw - w - 2));
        const by = ry + 1 + Math.floor(rnd() * (rh - h - 2));
        if (Math.abs(bx + w / 2 - (rx + rw / 2)) < 3 && Math.abs(by + h / 2 - (ry + rh / 2)) < 3) continue;
        if (doorCells.some((c) => Math.abs((c % BN) - bx - w / 2) < 3.5 && Math.abs(Math.floor(c / BN) - by - h / 2) < 3.5)) continue;
        let ok = true;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) if (blocked[y * BN + x]) ok = false;
        if (!ok) continue;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) blocked[y * BN + x] = 2;
        placed++;
      }
    });
    return { roomGrid, blocked };
  }

  // ゴミ捨て場は 1 部屋に 1 つ。stage.dumps で場所を決めた部屋はその場所、ほかは部屋のまん中
  function dumpSpots(stage) {
    return stage.rooms.map((r) => {
      const d = stage.dumps.find(([id]) => id === r.id);
      return roomPoint(r.rect, d ? d[1] : 0.5, d ? d[2] : 0.5);
    });
  }

  const roomPoint = (rect, fx, fy) => [(rect[0] + rect[2] * fx) * BLOCK, (rect[1] + rect[3] * fy) * BLOCK];

  // 家 (間取り・床の汚れマップ・発生源・ゴミ捨て場) を作る
  function buildHouse() {
    const stage = G.stage;
    const { roomGrid, blocked } = buildLayout(stage, G.stageIdx);
    G.roomGrid = roomGrid;
    G.blocked = blocked;
    G.rooms = stage.rooms.map((r, id) => ({ ...r, srcKinds: r.src, idx: id, total: 0, clean: 0, src: 0, src0: 0, done: false }));
    G.flow = new Int16Array(BN * BN);
    G.flowQ = new Int32Array(BN * BN);
    G.mapCanvas = document.createElement('canvas');
    G.mapCanvas.width = G.mapCanvas.height = BN;
    G.mapCtx = G.mapCanvas.getContext('2d');
    G.mapImg = G.mapCtx.createImageData(BN, BN);

    G.dirt = new Uint8Array(TN * TN);
    G.tileRoom = new Int8Array(TN * TN);
    G.dirtCanvas = document.createElement('canvas');
    G.dirtCanvas.width = G.dirtCanvas.height = TN * DIRT_PX;
    G.dirtCtx = G.dirtCanvas.getContext('2d');
    G.palette = [0.38, 0.68, 0.9].map((a, lvIdx) => [0, 1, 2, 3].map((v) => {
      const d = (v - 1.5) * 12 - lvIdx * 14;
      const [cr, cg, cb] = stage.dirt;
      return `rgba(${clamp(cr + d, 0, 255) | 0},${clamp(cg + d, 0, 255) | 0},${clamp(cb + d, 0, 255) | 0},${a})`;
    }));

    // なめらかなノイズで最初の汚れ方を決める
    const N = 10;
    const grid = [];
    for (let i = 0; i < (N + 1) * (N + 1); i++) grid.push(Math.random());
    const smooth = (t) => t * t * (3 - 2 * t);
    let total = 0;
    for (let ty = 0; ty < TN; ty++) {
      for (let tx = 0; tx < TN; tx++) {
        const i = ty * TN + tx;
        const b = Math.floor((ty * TILE) / BLOCK) * BN + Math.floor((tx * TILE) / BLOCK);
        G.tileRoom[i] = roomGrid[b];
        if (blocked[b]) {
          G.dirt[i] = 255;
          continue;
        }
        const gx = (tx / TN) * N;
        const gy = (ty / TN) * N;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smooth(gx - x0);
        const fy = smooth(gy - y0);
        const v00 = grid[y0 * (N + 1) + x0];
        const v10 = grid[y0 * (N + 1) + x0 + 1];
        const v01 = grid[(y0 + 1) * (N + 1) + x0];
        const v11 = grid[(y0 + 1) * (N + 1) + x0 + 1];
        const v = lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy) + (Math.random() - 0.5) * 0.12 + DANGER[stage.rooms[roomGrid[b]].danger].dirt;
        G.dirt[i] = v > 0.66 ? 3 : v > 0.3 ? 2 : 1;
        G.rooms[roomGrid[b]].total++;
        total++;
      }
    }
    G.totalTiles = total;
    G.cleanCount = 0;
    for (let i = 0; i < TN * TN; i++) paintTile(i);
    G.floorPatterns = {};
    for (const r of G.rooms) if (!G.floorPatterns[r.floor]) G.floorPatterns[r.floor] = ctx.createPattern(makeFloorPattern(r.floor), 'repeat');

    // 主人公は玄関 (start の部屋) のまん中から
    const start = G.rooms.find((r) => r.id === stage.start);
    [G.p.x, G.p.y] = roomPoint(start.rect, ...(stage.startAt || [0.5, 0.5]));
    G.cam.x = G.p.x;
    G.cam.y = G.p.y;
    G.dumps = dumpSpots(stage).map(([x, y]) => {
      const d = { x, y, t: 0 };
      pushOut(d, 30);
      return d;
    });
    buildFlow();

    // 発生源
    const SPOTS = [[0.3, 0.3], [0.7, 0.68], [0.7, 0.3], [0.3, 0.7], [0.5, 0.5]];
    G.srcTotal = 0;
    for (const r of G.rooms) {
      r.src = 0;
      r.src0 = 0;
      r.srcKinds.forEach((kind, k) => {
        for (let tries = 0; tries < 12; tries++) {
          const [fx, fy] = SPOTS[(k + tries) % SPOTS.length];
          const [x, y] = roomPoint(r.rect, clamp(fx + rand(-0.08, 0.08), 0.15, 0.85), clamp(fy + rand(-0.08, 0.08), 0.15, 0.85));
          if (isBlocked(x, y) || Math.hypot(x - G.p.x, y - G.p.y) < 180 || G.dumps.some((d) => Math.hypot(d.x - x, d.y - y) < 70)) continue;
          const e = spawnEnemy(kind, x, y, { force: true, danger: r.danger });
          e.room = r.idx;
          pendingShield.push(e);
          r.src++;
          r.src0++;
          G.srcTotal++;
          break;
        }
      });
    }
    for (const e of pendingShield) e.shield = shieldMul(dirtiness(e.x, e.y, SHIELD_R, e.room));
    pendingShield.length = 0;
  }

  // 床ができてから、発生源の汚れバリアの初めの強さを測る
  const pendingShield = [];

  // (x, y) のまわり半径 r の、部屋 room の床の汚れ具合 (0 = ピカピカ / 1 = 全部ドロドロ)
  function dirtiness(x, y, r, room) {
    let sum = 0;
    let n = 0;
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const v = G.dirt[i];
      if (v === 255 || G.tileRoom[i] !== room || (cx - x) ** 2 + (cy - y) ** 2 > r2) return;
      sum += v;
      n++;
    });
    return n ? sum / n / 3 : 0;
  }

  const blockAt = (x, y) => clamp(Math.floor(y / BLOCK), 0, BN - 1) * BN + clamp(Math.floor(x / BLOCK), 0, BN - 1);
  const roomAt = (x, y) => G.roomGrid[blockAt(x, y)];

  // 主人公までの道のり (ドアを通る) をマスごとに数えておく
  function buildFlow() {
    const f = G.flow;
    const q = G.flowQ;
    f.fill(-1);
    const pc = blockAt(G.p.x, G.p.y);
    let head = 0;
    let tail = 0;
    f[pc] = 0;
    q[tail++] = pc;
    while (head < tail) {
      const c = q[head++];
      const x = c % BN;
      const d = f[c] + 1;
      if (x > 0 && f[c - 1] < 0 && !G.blocked[c - 1]) { f[c - 1] = d; q[tail++] = c - 1; }
      if (x < BN - 1 && f[c + 1] < 0 && !G.blocked[c + 1]) { f[c + 1] = d; q[tail++] = c + 1; }
      if (c >= BN && f[c - BN] < 0 && !G.blocked[c - BN]) { f[c - BN] = d; q[tail++] = c - BN; }
      if (c + BN < BN * BN && f[c + BN] < 0 && !G.blocked[c + BN]) { f[c + BN] = d; q[tail++] = c + BN; }
    }
  }

  // ゴミが次に向かう点 (主人公が近いか、道のりがわからないときは false)
  let steerX = 0;
  let steerY = 0;
  function steer(e) {
    const bx = clamp(Math.floor(e.x / BLOCK), 0, BN - 1);
    const by = clamp(Math.floor(e.y / BLOCK), 0, BN - 1);
    const d = G.flow[by * BN + bx];
    if (d <= 1) return false;
    let best = d;
    let nx = -1;
    let ny = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || y < 0 || x >= BN || y >= BN) continue;
        const fn = G.flow[y * BN + x];
        if (fn < 0 || fn >= best) continue;
        // 壁の角はすり抜けない
        if (dx && dy && (G.blocked[by * BN + x] || G.blocked[y * BN + bx])) continue;
        best = fn;
        nx = x;
        ny = y;
      }
    }
    if (nx < 0) return false;
    steerX = (nx + 0.5) * BLOCK;
    steerY = (ny + 0.5) * BLOCK;
    return true;
  }

  function paintTile(i) {
    const tx = i % TN;
    const ty = (i / TN) | 0;
    const c = G.dirtCtx;
    const x = tx * DIRT_PX;
    const y = ty * DIRT_PX;
    c.clearRect(x, y, DIRT_PX, DIRT_PX);
    const v = G.dirt[i];
    if (v === 0 || v === 255) return;
    c.fillStyle = G.palette[v - 1][hash(i) & 3];
    c.fillRect(x, y, DIRT_PX, DIRT_PX);
  }

  function setDirt(i, v) {
    const old = G.dirt[i];
    if (old === v || old === 255) return;
    const room = G.rooms[G.tileRoom[i]];
    // 清掃が完了した部屋は、もう汚れない
    if (v > old && room.done) return;
    G.dirt[i] = v;
    if (old === 0) {
      G.cleanCount--;
      room.clean--;
    }
    if (v === 0) {
      G.cleanCount++;
      room.clean++;
      onTileCleaned(i);
    }
    paintTile(i);
  }

  function dirtAt(x, y) {
    const tx = (x / TILE) | 0;
    const ty = (y / TILE) | 0;
    if (tx < 0 || ty < 0 || tx >= TN || ty >= TN) return 3;
    const v = G.dirt[ty * TN + tx];
    return v === 255 ? 3 : v;
  }

  function onTileCleaned(i) {
    if (G.sparkBudget > 0) {
      G.sparkBudget--;
      const x = (i % TN) * TILE + 8;
      const y = ((i / TN) | 0) * TILE + 8;
      addPart(x, y, 0, 0, 0.35, 7, '#ffffff', 'flash');
      if (Math.random() < 0.5) addPart(x, y, rand(-20, 20), rand(-40, -10), 0.6, 3, '#fffbe0', 'twinkle');
    }
    if (G.time - G.kyuLast > 0.6) G.kyuStreak = 0;
    G.kyuLast = G.time;
    G.kyuPending = true;
  }

  // 床をきれいにする (power だけ汚れ度を下げる)
  function lowerTile(i, p) {
    const v = G.dirt[i];
    if (v === 0 || v === 255) return;
    setDirt(i, Math.max(0, v - p));
  }

  function forTilesInBox(x0, y0, x1, y1, fn) {
    const tx0 = Math.max(0, Math.floor(x0 / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(TN - 1, Math.floor(x1 / TILE));
    const ty1 = Math.min(TN - 1, Math.floor(y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) fn(ty * TN + tx, tx * TILE + 8, ty * TILE + 8);
    }
  }

  function cleanCircle(x, y, r, p) {
    r *= G.stats.cleanArea || 1;
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2 && reachTile(x, y, i, cx, cy)) lowerTile(i, p);
    });
  }

  function cleanCone(x, y, ang, half, range, p) {
    range *= G.stats.cleanArea || 1;
    const r2 = range * range;
    forTilesInBox(x - range, y - range, x + range, y + range, (i, cx, cy) => {
      const dx = cx - x;
      const dy = cy - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) return;
      if (d2 > 200 && Math.abs(angleDiff(Math.atan2(dy, dx), ang)) > half) return;
      if (!reachTile(x, y, i, cx, cy)) return;
      lowerTile(i, p);
    });
  }

  function cleanLine(x1, y1, x2, y2, w, p) {
    w *= G.stats.cleanArea || 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const hw2 = (w / 2 + 6) ** 2;
    forTilesInBox(Math.min(x1, x2) - w, Math.min(y1, y2) - w, Math.max(x1, x2) + w, Math.max(y1, y2) + w, (i, cx, cy) => {
      const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
      const px = x1 + dx * t - cx;
      const py = y1 + dy * t - cy;
      if (px * px + py * py <= hw2 && reachTile(x1 + dx * t, y1 + dy * t, i, cx, cy)) lowerTile(i, p);
    });
  }

  // onlyRoom を渡すと、その部屋のマスだけ汚す (壁の向こうは汚さない)
  function dirtyCircle(x, y, r, add, onlyRoom = -1) {
    const r2 = r * r;
    forTilesInBox(x - r, y - r, x + r, y + r, (i, cx, cy) => {
      const v = G.dirt[i];
      if (v >= 3 || v === 255) return;
      if (onlyRoom >= 0 && G.tileRoom[i] !== onlyRoom) return;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r2) setDirt(i, Math.min(3, v + add));
    });
  }

  // 汚れはとなりのマスへ少しずつ広がる
  function growDirt(dt) {
    G.growT -= dt;
    if (G.growT > 0) return;
    G.growT = 0.25;
    const k = Math.floor((10 + G.time * 0.08) * G.stage.growth);
    const n = TN * TN;
    for (let s = 0; s < k; s++) {
      const i = (Math.random() * n) | 0;
      const v = G.dirt[i];
      if (v >= 3) continue;
      const tx = i % TN;
      const dir = (Math.random() * 4) | 0;
      let j;
      if (dir === 0) j = tx > 0 ? i - 1 : -1;
      else if (dir === 1) j = tx < TN - 1 ? i + 1 : -1;
      else if (dir === 2) j = i - TN;
      else j = i + TN;
      if (j < 0 || j >= n) continue;
      const nv = G.dirt[j];
      if (nv !== 255 && nv >= 2 && nv > v && G.rooms[G.tileRoom[i]].src > 0) setDirt(i, v + 1);
    }
  }

  const cleanPct = () => (G.cleanCount / G.totalTiles) * 100;

  // ---- 段ボールの壁 ----
  function isBlocked(x, y) {
    const bx = Math.floor(x / BLOCK);
    const by = Math.floor(y / BLOCK);
    if (bx < 0 || by < 0 || bx >= BN || by >= BN) return true;
    return G.blocked[by * BN + bx] !== 0;
  }

  // ---- 攻撃は壁を貫通しない ----
  // (x1, y1) から (x2, y2) までの間に壁 (家の中の壁・外壁) があるか。段ボールは低いので攻撃は越える
  function wallBetween(x1, y1, x2, y2) {
    let cx = Math.floor(x1 / BLOCK);
    let cy = Math.floor(y1 / BLOCK);
    const ex = Math.floor(x2 / BLOCK);
    const ey = Math.floor(y2 / BLOCK);
    if (cx < 0 || cy < 0 || cx >= BN || cy >= BN) return true;
    const b0 = G.blocked[cy * BN + cx];
    if (b0 === 1 || b0 === 3) return true; // 壁の中からは届かない
    if (cx === ex && cy === ey) return false;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let tx = adx ? (sx > 0 ? (cx + 1) * BLOCK - x1 : x1 - cx * BLOCK) / adx : Infinity;
    let ty = ady ? (sy > 0 ? (cy + 1) * BLOCK - y1 : y1 - cy * BLOCK) / ady : Infinity;
    const stepX = adx ? BLOCK / adx : Infinity;
    const stepY = ady ? BLOCK / ady : Infinity;
    for (let n = 0; n < BN * 2; n++) {
      if (tx < ty) {
        cx += sx;
        tx += stepX;
      } else {
        cy += sy;
        ty += stepY;
      }
      if (cx < 0 || cy < 0 || cx >= BN || cy >= BN) return true;
      const b = G.blocked[cy * BN + cx];
      if (b === 1 || b === 3) return true;
      if (cx === ex && cy === ey) return false;
    }
    return false;
  }

  // 攻撃の出どころ (ox, oy) から (x, y) に届くか。同じ部屋の中なら壁はないので、すぐに届く
  function canReach(ox, oy, x, y) {
    const ro = roomAt(ox, oy);
    if (ro >= 0 && ro === roomAt(x, y)) return true;
    return !wallBetween(ox, oy, x, y);
  }

  // 床のマス i に (ox, oy) から届くか (掃除も壁の向こうへは届かない)
  function reachTile(ox, oy, i, cx, cy) {
    const ro = roomAt(ox, oy);
    if (ro >= 0 && G.tileRoom[i] === ro) return true;
    return !wallBetween(ox, oy, cx, cy);
  }

  function pushOut(o, r) {
    if (o.x < r) o.x = r;
    if (o.y < r) o.y = r;
    if (o.x > ROOM - r) o.x = ROOM - r;
    if (o.y > ROOM - r) o.y = ROOM - r;
    let hit = false;
    const bx0 = Math.max(0, Math.floor((o.x - r) / BLOCK));
    const by0 = Math.max(0, Math.floor((o.y - r) / BLOCK));
    const bx1 = Math.min(BN - 1, Math.floor((o.x + r) / BLOCK));
    const by1 = Math.min(BN - 1, Math.floor((o.y + r) / BLOCK));
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        if (!G.blocked[by * BN + bx]) continue;
        const rx = bx * BLOCK;
        const ry = by * BLOCK;
        const nx = clamp(o.x, rx, rx + BLOCK);
        const ny = clamp(o.y, ry, ry + BLOCK);
        let dx = o.x - nx;
        let dy = o.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          o.x += (dx / d) * (r - d);
          o.y += (dy / d) * (r - d);
        } else {
          // 中心が箱の中にある: いちばん近い辺から外へ出す
          const l = o.x - rx;
          const rr = rx + BLOCK - o.x;
          const t = o.y - ry;
          const b = ry + BLOCK - o.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) o.x = rx - r;
          else if (m === rr) o.x = rx + BLOCK + r;
          else if (m === t) o.y = ry - r;
          else o.y = ry + BLOCK + r;
          dx = dy = 0;
        }
      }
    }
    return hit;
  }

  // ---- 落とし物の置き場所 ----
  // 宝箱・宝物・回復アイテムを、壁や段ボールにめり込まない場所に置く。元の場所が埋まっていたら、
  // 同じ部屋の中で近い順に空いているところを探す (壁の向こうの部屋には置かない)
  const ITEM_R = 20;
  function itemSpot(x, y, room = roomAt(x, y)) {
    const r = ITEM_R;
    const free = (px, py) => {
      if (px < r || py < r || px > ROOM - r || py > ROOM - r) return false;
      if (room >= 0 && roomAt(px, py) !== room) return false;
      if (isBlocked(px, py)) return false;
      // まわり (半径 r の円の 16 か所) に壁や段ボールがないか
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        if (isBlocked(px + Math.cos(a) * r, py + Math.sin(a) * r)) return false;
      }
      return true;
    };
    if (free(x, y)) return { x, y };
    for (let dist = 8; dist <= 320; dist += 8) {
      const n = Math.max(8, Math.round(dist / 6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const px = x + Math.cos(a) * dist;
        const py = y + Math.sin(a) * dist;
        if (free(px, py)) return { x: px, y: py };
      }
    }
    const o = { x, y };
    pushOut(o, r);
    return o;
  }
  function dropItem(kind, x, y, room) {
    const spot = itemSpot(x, y, room);
    const it = { kind, x: spot.x, y: spot.y, t: 0 };
    G.items.push(it);
    return it;
  }

  // ---- 強さの計算 ----
  function recalcStats() {
    const s = G.stats;
    const sh = shopOf(G.ch.id); // その清掃員の恒久スキル
    const lv = (id) => G.passives[id] || 0;
    const oldMax = s.maxHp || 0;
    const bn = G.bonus; // 清掃が完了した部屋の特典
    const cm = G.ch.mods; // 清掃員の個性
    s.maxHp = G.ch.hp + sh.hp * 12 + lv('boots') * 20 + bn.hp;
    s.speed = 118 * G.ch.speed * (1 + sh.speed * 0.04 + bn.speed + lv('wax') * 0.06);
    s.projSpeed = 1 + lv('wax') * 0.1;
    s.might = (1 + sh.might * 0.08 + lv('boiler') * 0.1 + bn.might + (cm.might || 0)) * BAL.might;
    s.cd = 1 - lv('battery') * 0.08 - bn.cd - (cm.cd || 0);
    s.area = 1 + lv('bleach') * 0.1 + bn.area;
    s.dur = 1 + lv('tape') * 0.1;
    s.amount = lv('roomba');
    s.magnet = 48 * (1 + sh.magnet * 0.1 + lv('dustpack') * 0.2 + bn.magnet + (cm.magnet || 0));
    s.boxCap = 150 + sh.box * 20 + lv('dustpack') * 40 + lv('hydraulic') * 15 + bn.box + (cm.box || 0);
    s.knock = 1 + lv('hydraulic') * 0.25;
    s.armor = lv('gloves') + bn.armor + sh.armor + (cm.armor || 0);
    s.regen = bn.regen + sh.regen * 0.2 + lv('filter') * 0.25;
    s.scrub = 30 * (1 + sh.clean * 0.12 + (cm.scrub || 0));
    s.cleanArea = 1 + sh.clean * 0.06;
    s.xpMul = 1 + sh.xp * 0.08 + (cm.xp || 0);
    s.moldMul = 1 + (cm.mold || 0);
    s.dirtSlow = G.ch.mods.noDirtSlow ? 0 : lv('boots') > 0 ? 0.5 : 1;
    if (oldMax && s.maxHp > oldMax) G.p.hp += s.maxHp - oldMax;
    for (const w of G.weapons) w.s = weaponStats(w);
  }

  function weaponStats(w) {
    const d = WEAPONS[w.id];
    const s = { ...d.base };
    for (let i = 0; i < w.lv - 1; i++) {
      const delta = d.lv[i][0];
      for (const k in delta) s[k] += delta[k];
    }
    const st = G.stats;
    s.power = d.power;
    s.dmg *= st.might;
    if (G.ch.weapons.includes(w.id)) s.dmg *= G.ch.fav || FAV_MUL; // 得意なギア
    if (s.cd) s.cd *= st.cd;
    if (w.id !== 'roller' && s.count != null) s.count += st.amount;
    switch (w.id) {
      case 'vacuum':
        s.range *= st.area;
        if (w.evo) {
          s.dmg *= 1.5;
          s.range += 20;
          s.angle += 20;
          s.vcd = 3.5 * st.cd;
          s.vr = 100 * st.area;
          s.vdur = 2.5 * st.dur;
          s.vdmg = 8 * st.might;
        }
        break;
      case 'washer':
        s.width *= st.area;
        if (w.evo) {
          s.width = 26 * st.area;
          s.len += 200;
          s.dmg *= 1.6;
          s.cd = Math.max(0.6, s.cd - 0.3);
          s.power = 3;
        }
        break;
      case 'robot':
        s.radius *= st.area;
        s.size *= Math.sqrt(st.area);
        if (w.evo) {
          s.count += 2;
          s.dmg *= 1.6;
          s.size += 6;
          s.radius += 18;
          s.spin *= 1.3;
          s.power = 2;
        }
        break;
      case 'spray':
        s.radius *= st.area;
        s.dur *= st.dur;
        if (w.evo) {
          s.count += 6;
          s.radius += 16;
          s.cd = 2 * st.cd;
          s.dmg *= 1.5;
          s.power = 2;
        }
        break;
      case 'roller':
        s.width *= st.area;
        if (w.evo) {
          s.width = 72 * st.area;
          s.dmg *= 2;
          s.power = 3;
        }
        break;
      case 'mop':
        s.range *= st.area;
        if (w.evo) {
          s.angle = 360;
          s.range += 24;
          s.dmg *= 1.4;
          s.cd = Math.max(0.35, s.cd * 0.55);
          s.power = 3;
        }
        break;
      case 'duster':
        s.size *= st.area;
        s.speed = 430 * st.projSpeed;
        if (w.evo) {
          s.count += 2;
          s.size += 12;
          s.len += 90;
          s.dmg *= 1.5;
          s.power = 2;
        }
        break;
      case 'bomb':
        s.radius *= st.area;
        if (w.evo) {
          s.radius += 24;
          s.dmg *= 1.4;
          s.count += 1;
          s.foamR = s.radius * 0.85;
          s.foamDur = 2.5 * st.dur;
          s.foamDmg = s.dmg * 0.18;
        }
        break;
      case 'press':
        s.radius *= st.area;
        if (w.evo) {
          s.radius += 110;
          s.dmg *= 1.6;
          s.cd *= 0.7;
          s.power = 2;
        }
        break;
      case 'purifier':
        s.radius *= st.area;
        if (w.evo) {
          s.radius += 32;
          s.dmg *= 1.6;
          s.power = 2;
        }
        break;
      case 'sponge':
        s.size *= Math.sqrt(st.area);
        s.dur *= st.dur;
        s.speed *= st.projSpeed;
        if (w.evo) {
          s.count += 2;
          s.size += 8;
          s.dur += 2;
          s.dmg *= 1.6;
          s.power = 3;
        }
        break;
      default: break;
    }
    return s;
  }

  function addWeapon(id) {
    const w = { id, lv: 1, evo: false, t: 0.3, ang: G.p.face, vt: 1, bots: [], cleanT: 0, tickT: 0 };
    G.weapons.push(w);
    w.s = weaponStats(w);
    return w;
  }

  const weaponName = (w) => (w.evo ? L(EVOS[WEAPONS[w.id].evo], 'name') : L(WEAPONS[w.id], 'name'));
  const weaponIcon = (w) => (w.evo ? WEAPONS[w.id].evo : w.id);
  const boxFull = () => G.box >= G.stats.boxCap;
  // ダストボックスが満タンだと、ギアの攻撃力が半分になり、ダストも拾えず (経験値が入らない)、足も重くなる
  const dmgMul = () => (boxFull() ? 0.5 : 1);

  // ===================================================================
  // ゴミ (敵)
  // ===================================================================
  function spawnEnemy(type, x, y, opt = {}) {
    if (G.enemies.length >= MAX_ENEMIES && !opt.force) return null;
    const def = ENEMIES[type];
    const e = G.pool.pop() || {};
    const tScale = def.boss || def.source ? 1 : 1 + G.time / 400;
    const dg = DANGER[opt.danger || 1];
    const dHp = (def.boss ? 1 : def.source ? dg.src : dg.hp) * (def.source ? G.md.src : G.md.hp);
    e.type = type;
    e.def = def;
    e.x = x;
    e.y = y;
    e.r = def.r * (opt.elite ? 1.6 : 1);
    e.maxHp = e.hp = def.hp * tScale * dHp * G.stage.hpMul * (opt.elite ? 10 : 1) * (def.boss ? BAL.boss : 1) * (def.boss && G.stageIdx === STAGES.length - 1 && type !== 'master' ? 1.3 : 1);
    e.speed = def.speed * (1 + G.time / 1200) * rand(0.9, 1.1) * (opt.elite ? 0.9 : 1) * (def.boss ? 1 : DANGER[opt.danger || 1].speed);
    e.dmg = Math.round((def.boss ? def.dmg : def.dmg * (1 + G.time / 600) * dg.dmg) * G.md.dmg);
    e.danger = opt.danger || 1;
    e.home = opt.home != null ? opt.home : -1;
    e.aggro = false;
    e.src = null;
    e.brood = 0;
    e.wx = -1;
    e.wy = -1;
    e.wanderT = 0;
    e.shield = 1;
    e.shieldT = 0;
    e.elite = !!opt.elite;
    e.eventElite = !!opt.event;
    e.boss = !!def.boss;
    e.alive = true;
    e.flee = false;
    e.flash = 0;
    e.kx = 0;
    e.ky = 0;
    e.vx = 0;
    e.vy = 0;
    e.rot = 0;
    e.t = rand(0, 10);
    e.life = 0;
    e.actT = rand(1, 3);
    e.dirtyT = rand(0, 0.5);
    e.robotHit = 0;
    e.rollHit = 0;
    if (def.move === 'roll') {
      const a = Math.atan2(G.p.y - y, G.p.x - x) + rand(-0.25, 0.25);
      e.vx = Math.cos(a) * e.speed;
      e.vy = Math.sin(a) * e.speed;
    }
    G.enemies.push(e);
    e.room = roomAt(x, y);
    if (e.boss || e.elite) G.bosses.push(e);
    return e;
  }

  // maxDanger を渡すと、それより汚れレベルの高い部屋は選ばない
  function spawnPos(margin, maxDanger = 5) {
    const R = Math.hypot(view.ww, view.wh) / 2 + margin;
    let best = null;
    let bs = -1;
    for (let k = 0; k < 4; k++) {
      const a = rand(0, TAU);
      const x = G.p.x + Math.cos(a) * R;
      const y = G.p.y + Math.sin(a) * R;
      if (!spawnable(x, y) || G.rooms[roomAt(x, y)].danger > maxDanger) continue;
      const d = dirtAt(x, y);
      if (d > bs) {
        bs = d;
        best = [x, y];
      }
    }
    if (best) return best;
    // 部屋の隅にいるとき: 画面の外の、部屋の中のどこか
    for (let k = 0; k < 12; k++) {
      const x = rand(20, ROOM - 20);
      const y = rand(20, ROOM - 20);
      if (Math.abs(x - G.p.x) < view.ww / 2 + 30 && Math.abs(y - G.p.y) < view.wh / 2 + 30) continue;
      if (!spawnable(x, y) || G.rooms[roomAt(x, y)].danger > maxDanger) continue;
      return [x, y];
    }
    return null;
  }

  function spawnable(x, y) {
    if (x < 20 || y < 20 || x > ROOM - 20 || y > ROOM - 20 || isBlocked(x, y)) return false;
    const b = blockAt(x, y);
    return G.flow[b] >= 0 && !G.rooms[G.roomGrid[b]].done;
  }

  // 汚れレベル d の部屋で湧くゴミの重み (発生源の種類 kind があれば、その得意なゴミを増やす)
  function typeWeights(d, kind) {
    const mix = kind ? SOURCE_MIX[kind] : null;
    const w = {};
    for (const k of DANGER[d].types) w[k] = TYPE_WEIGHT[k];
    if (mix && w[mix.main] == null) w[mix.main] = TYPE_WEIGHT[mix.main];
    for (const k in w) {
      if (G.stage.weights[k]) w[k] *= G.stage.weights[k];
      if (mix) w[k] *= mix[k] != null ? mix[k] : 0.25;
    }
    return w;
  }

  function pickWeightedBy(arr, weightOf) {
    let sum = 0;
    const ws = arr.map((x) => {
      const v = weightOf(x);
      sum += v;
      return v;
    });
    let r = Math.random() * sum;
    for (let i = 0; i < arr.length; i++) {
      r -= ws[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  function pickWeighted(w) {
    let sum = 0;
    for (const k in w) sum += w[k];
    let r = Math.random() * sum;
    for (const k in w) {
      r -= w[k];
      if (r <= 0) return k;
    }
    return 'dust';
  }

  // ゴミを1つ (ホコリなら3つ) 湧かせる。home は住みかの部屋 (-1 は住みかなし = いつも追いかけてくる)
  function spawnGroup(x, y, danger, kind, home, src) {
    const type = pickWeighted(typeWeights(danger, kind));
    // 金色のふちのゴミは、同時に ELITE_MAX 体まで (汚れのキツい部屋で群れて出て、宝箱が出過ぎないように)
    const elite = Math.random() < DANGER[danger].elite && G.bosses.filter((b) => b.alive && b.elite && !b.eventElite).length < ELITE_MAX;
    const n = type === 'dust' && !elite ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const e = spawnEnemy(type, x + (n > 1 ? rand(-14, 14) : 0), y + (n > 1 ? rand(-14, 14) : 0), { danger, elite, home });
      if (!e) return;
      if (src) {
        e.src = src;
        src.brood++;
      }
      // 主人公が遠いときに湧いた缶やボトルは、部屋の中を好きな向きに転がる
      if (e.def.move === 'roll' && home >= 0 && Math.hypot(G.p.x - x, G.p.y - y) > 400) {
        const a = rand(0, TAU);
        e.vx = Math.cos(a) * e.speed;
        e.vy = Math.sin(a) * e.speed;
      }
    }
  }

  function updateSpawns(dt) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 0.2;
      const t = G.time;
      // 発生源: それぞれが自分の部屋に住むゴミを、汚れレベルに応じた数まで湧かせる
      for (const src of G.enemies) {
        if (!src.alive || !src.def.source) continue;
        const cap = (6 + t * 0.07) * BAL.spawn * G.stage.spawnMul * DANGER[src.danger].density * G.md.density;
        if (src.brood >= cap || Math.random() > 0.35) continue;
        const a = rand(0, TAU);
        const d = src.r + rand(10, 26);
        const x = src.x + Math.cos(a) * d;
        const y = src.y + Math.sin(a) * d;
        if (isBlocked(x, y)) continue;
        spawnGroup(x, y, src.danger, src.type, src.room, src);
        src.flash = 0.06;
      }
      // 住みかのないゴミが、画面の外から少しずつ湧く (今いる部屋の汚れレベルで量が決まる)
      const here = G.rooms[G.curRoom];
      const hereDanger = !here || here.done ? 1 : here.danger;
      let roaming = 0;
      for (const e of G.enemies) if (e.alive && e.home < 0 && !e.def.source && !e.boss) roaming++;
      const desired = Math.min(170, (10 + t * 0.3) * BAL.spawn * G.stage.spawnMul * DANGER[hereDanger].density * G.md.density);
      const n = Math.min(3, Math.ceil(desired - roaming));
      // 住みかのないゴミの強さは、今いる部屋の汚れレベルに合わせる (★の多い部屋からは湧かせない)
      for (let i = 0; i < n && G.enemies.length < MAX_ENEMIES - 20; i++) {
        const pos = spawnPos(40, hereDanger);
        if (!pos) break;
        spawnGroup(pos[0], pos[1], hereDanger, null, -1, null);
      }
    }
    // 大群ラッシュ: ホコリの大波が四方から
    if (G.time < G.rushUntil) {
      G.rushT -= dt;
      if (G.rushT <= 0) {
        G.rushT = 8;
        const R = Math.hypot(view.ww, view.wh) / 2 + 20;
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * TAU;
          const x = clamp(G.p.x + Math.cos(a) * R, 20, ROOM - 20);
          const y = clamp(G.p.y + Math.sin(a) * R, 20, ROOM - 20);
          if (spawnable(x, y)) spawnEnemy(i % 4 === 0 ? 'hair' : 'dust', x, y, { force: G.enemies.length < MAX_ENEMIES + 40 });
        }
      }
    }
  }

  function runEvents() {
    if (G.tutorial) return; // チュートリアルでは中ボスやボスは出ない
    while (G.eventIdx < EVENTS.length && G.time >= EVENTS[G.eventIdx].t) {
      const ev = EVENTS[G.eventIdx++];
      if (ev.kind === 'warn') {
        const name = L(ENEMIES[ev.boss === 'yokai' ? 'yokai' : G.stage.boss], 'name');
        showBanner(t('warn', name), '#ff6b6b', 2.5);
        Sound.play('warn');
      } else if (ev.kind === 'elite') {
        const pos = spawnPos(60);
        if (pos) spawnEnemy(pick(G.time < 200 ? ['paper', 'can'] : ['grease', 'bag', 'paper']), pos[0], pos[1], { elite: true, force: true, event: true });
      } else if (ev.kind === 'midboss') {
        const pos = spawnPos(80);
        if (pos) spawnEnemy('yokai', pos[0], pos[1], { force: true });
      } else if (ev.kind === 'boss') {
        const pos = spawnPos(100);
        if (pos) spawnEnemy(G.stage.boss, pos[0], pos[1], { force: true });
        Sound.bgm('boss');
      } else if (ev.kind === 'rush') {
        G.rushUntil = 540;
        G.rushT = 0;
        showBanner(t('rush'), '#ffcf4a', 2);
      }
    }
  }

  // ---- 空間ハッシュ ----
  const gridHead = new Int32Array(GN * GN);
  let gridNext = new Int32Array(MAX_ENEMIES + 200);
  const qbuf = [];
  let qlen = 0;

  function buildGrid() {
    gridHead.fill(-1);
    const es = G.enemies;
    if (gridNext.length < es.length) gridNext = new Int32Array(es.length * 2);
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const cx = clamp((e.x / CELL) | 0, 0, GN - 1);
      const cy = clamp((e.y / CELL) | 0, 0, GN - 1);
      const c = cy * GN + cx;
      gridNext[i] = gridHead[c];
      gridHead[c] = i;
    }
  }

  // 近くのゴミを qbuf に集める (r にはゴミ自身の大きさの余裕を足しておく)
  function query(x, y, r) {
    qlen = 0;
    const cx0 = clamp(((x - r) / CELL) | 0, 0, GN - 1);
    const cy0 = clamp(((y - r) / CELL) | 0, 0, GN - 1);
    const cx1 = clamp(((x + r) / CELL) | 0, 0, GN - 1);
    const cy1 = clamp(((y + r) / CELL) | 0, 0, GN - 1);
    const es = G.enemies;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let i = gridHead[cy * GN + cx]; i !== -1; i = gridNext[i]) {
          const e = es[i];
          if (e.alive) qbuf[qlen++] = e;
        }
      }
    }
    return qlen;
  }

  function updateEnemies(dt) {
    const p = G.p;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      e.life += dt;
      if (e.flash > 0) e.flash -= dt;
      const def = e.def;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (def.source) {
        // 発生源は動かず、周りの床を汚し続ける
        e.dirtyT -= dt;
        if (e.dirtyT <= 0 && !e.flee) {
          e.dirtyT = 1;
          dirtyCircle(e.x, e.y, 70, 1, e.room);
        }
        // まわりの汚れ具合を測って、汚れバリアの強さを決める
        e.shieldT -= dt;
        if (e.shieldT <= 0) {
          e.shieldT = 0.5;
          e.shield = shieldMul(dirtiness(e.x, e.y, SHIELD_R, e.room));
        }
        continue;
      }
      if (e.flee) {
        e.x -= (dx / d) * 220 * dt;
        e.y -= (dy / d) * 220 * dt;
        continue;
      }
      const floorMul = dirtAt(e.x, e.y) === 0 ? 0.9 : 1;
      let sp = e.speed * floorMul;
      if (G.auraEvo && d < G.auraR + e.r) sp *= 0.6; // 浄化の結界の中は遅くなる
      if (def.move === 'roll') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += (e.speed / e.r) * dt * 0.6;
        if (def.bounce) {
          if (e.x < e.r || e.x > ROOM - e.r) e.vx *= -1;
          if (e.y < e.r || e.y > ROOM - e.r) e.vy *= -1;
        }
        const hit = pushOut(e, e.r);
        if (hit && def.bounce) {
          e.vx *= -1;
          e.vy *= -1;
        }
        // 転がり去ったら消える (ダストは落とさない)
        if (e.life > 9 || (e.home >= 0 && !e.aggro && roomAt(e.x, e.y) !== e.home) || (!def.bounce && (e.x <= e.r || e.y <= e.r || e.x >= ROOM - e.r || e.y >= ROOM - e.r)) || (hit && !def.bounce)) {
          e.alive = false;
          removeBoss(e);
        }
        continue;
      }
      if (def.move === 'keep') {
        if (d < 130) sp = -sp;
        else if (d < 175) sp *= 0.15;
        e.actT -= dt;
        if (e.actT <= 0) {
          e.actT = rand(2.6, 3.6);
          G.clouds.push({ x: e.x, y: e.y, r: 46, life: 3.2, max: 3.2 });
          dirtyCircle(e.x, e.y, 26, 1);
        }
      }
      if (e.boss) bossAct(e, dt, d);
      if (e.home >= 0 && !e.boss) {
        if (!e.aggro) {
          // 壁ごしには気づかない (ドアを通る道のりで 4 マス以内か、同じ部屋に入ってきたら追いかける)
          const fd = G.flow[blockAt(e.x, e.y)];
          if ((fd >= 0 && fd <= 4) || G.curRoom === e.home) e.aggro = true;
        } else if (d > 750 && G.curRoom !== e.home) {
          e.aggro = false;
        }
      }
      let mx = dx / d;
      let my = dy / d;
      if (e.home >= 0 && !e.aggro) {
        // 部屋の中のどこかへゆっくり歩く
        e.wanderT -= dt;
        if (e.wanderT <= 0 || e.wx < 0 || Math.hypot(e.wx - e.x, e.wy - e.y) < 12) {
          e.wanderT = rand(2, 4);
          [e.wx, e.wy] = roomPoint(G.rooms[e.home].rect, rand(0.12, 0.88), rand(0.12, 0.88));
        }
        const wx = e.wx - e.x;
        const wy = e.wy - e.y;
        const wd = Math.hypot(wx, wy) || 1;
        mx = wx / wd;
        my = wy / wd;
        sp = Math.abs(sp) * 0.35;
      } else if (sp > 0 && steer(e)) {
        // 壁の向こうにいるときは、ドアを通る道のりに沿って進む
        const sx = steerX - e.x;
        const sy = steerY - e.y;
        const sd = Math.hypot(sx, sy) || 1;
        mx = sx / sd;
        my = sy / sd;
      }
      e.x += mx * sp * dt + e.kx * dt;
      e.y += my * sp * dt + e.ky * dt;
      const decay = Math.exp(-8 * dt);
      e.kx *= decay;
      e.ky *= decay;
      pushOut(e, e.r * 0.8);
      // 歩いた床を汚す
      e.dirtyT -= dt;
      if (e.dirtyT <= 0) {
        e.dirtyT = 0.35;
        if (e.type === 'grease') dirtyCircle(e.x, e.y, e.r * (e.elite ? 1.2 : 0.9), 3);
        else if (e.type === 'yokai') dirtyCircle(e.x, e.y, 30, 3);
        else if (e.type === 'kaiju' || e.type === 'master') dirtyCircle(e.x, e.y, 60, 3);
      }
    }
  }

  function bossAct(e, dt, d) {
    e.actT -= dt;
    if (e.actT > 0) return;
    if (e.type === 'yokai') {
      e.actT = 3;
      for (let i = 0; i < 3; i++) {
        const a = rand(0, TAU);
        const x = e.x + Math.cos(a) * 70;
        const y = e.y + Math.sin(a) * 70;
        if (isBlocked(x, y)) continue;
        spawnEnemy(i === 0 ? 'bag' : pick(['paper', 'dust', 'hair']), x, y, { force: true, danger: 3 });
        puff(x, y, '#8a6a44', 8);
      }
    } else {
      const master = e.type === 'master';
      e.actT = master ? 2.2 : 2.6;
      e.shot = (e.shot || 0) + 1;
      const n = master ? 16 : 12;
      const off = e.shot * 0.2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + off;
        G.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 8, life: 5, dmg: master ? 8 : 6 });
      }
      if (e.shot % 3 === 0) {
        for (let i = 0; i < (master ? 4 : 3); i++) {
          const a = rand(0, TAU);
          const x = e.x + Math.cos(a) * 90;
          const y = e.y + Math.sin(a) * 90;
          if (!isBlocked(x, y)) spawnEnemy(master ? pick(['bag', 'grease', 'spore', 'bottle']) : 'spore', x, y, { force: true, danger: 3 });
        }
      }
    }
  }

  // 重なったゴミを少し押し離す (同じマスの中だけ)
  function separate() {
    const es = G.enemies;
    for (let c = 0; c < GN * GN; c++) {
      let n = 0;
      for (let i = gridHead[c]; i !== -1 && n < 14; i = gridNext[i]) {
        const a = es[i];
        n++;
        if (!a.alive || a.def.move === 'roll') continue;
        let m = 0;
        for (let j = gridNext[i]; j !== -1 && m < 8; j = gridNext[j]) {
          m++;
          const b = es[j];
          if (!b.alive || b.def.move === 'roll') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.75;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 < 0.01) continue;
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          const wa = a.def.source ? 0 : a.boss ? 0.05 : 1;
          const wb = b.def.source ? 0 : b.boss ? 0.05 : 1;
          a.x -= (dx / d) * push * wa;
          a.y -= (dy / d) * push * wa;
          b.x += (dx / d) * push * wb;
          b.y += (dy / d) * push * wb;
        }
      }
    }
  }

  function removeBoss(e) {
    const i = G.bosses.indexOf(e);
    if (i >= 0) G.bosses.splice(i, 1);
  }

  function hurtEnemy(e, dmg, kx, ky) {
    if (!e.alive || e.flee) return;
    if (e.def.mold) dmg *= G.stats.moldMul;
    if (e.def.source) {
      dmg *= e.shield;
      // 汚れバリアが強いうちは「かたい!」と知らせる
      if (e.shield < 0.35 && G.time - (e.hardMsgT || -9) > 1.2) {
        e.hardMsgT = G.time;
        addText(e.x, e.y - e.r - 10, t('tooTough'), '#ffb37a');
      }
    }
    e.hp -= dmg;
    e.flash = 0.12;
    e.aggro = true;
    // 当たったところに衝撃のマーク (白に濃いふち。明るい床でも見える)。同じゴミには 0.1 秒に 1 回まで
    // (粒が多すぎるときは出さない。ほかの演出の粒が足りなくならないように)
    if (G.time - (e.hitFxT ?? -9) > 0.1 && G.parts.length < MAX_PARTICLES * 0.6) {
      e.hitFxT = G.time;
      const kl = Math.hypot(kx, ky);
      const off = kl > 0 ? e.r * 0.5 : 0;
      addPart(e.x - (kl ? (kx / kl) * off : 0) + rand(-3, 3), e.y - (kl ? (ky / kl) * off : 0) + rand(-3, 3), 0, 0, 0.16, Math.min(14, 7 + e.r * 0.25), '#fff', 'hit');
    }
    if (!e.boss && !e.def.source) {
      const kb = (e.elite ? 0.25 : 1) * G.stats.knock;
      e.kx += kx * kb;
      e.ky += ky * kb;
    }
    Sound.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.alive = false;
    removeBoss(e);
    G.kills++;
    G.killsByType[e.type] = (G.killsByType[e.type] || 0) + 1;
    const def = e.def;
    puff(e.x, e.y, e.type === 'grease' ? '#c9a227' : e.type === 'spore' ? '#7bc043' : '#d8d2c6', e.boss ? 40 : 6);
    Sound.play('pop');
    // ダスト
    if (e.boss) {
      for (let i = 0; i < 14; i++) dropGem(e.x + rand(-60, 60), e.y + rand(-60, 60), 2);
      const room = roomAt(e.x, e.y);
      dropItem('chest', e.x, e.y, room);
      dropItem('heal', e.x + 40, e.y, room);
      G.bossCoins += def.boss === 'boss' ? 40 : 20;
      showBanner(t('bossDown', L(def, 'name')), '#4fe0b6', 2.5);
      Sound.play('boss-down');
      G.shake = Math.max(G.shake, 14);
      if (G.bosses.every((b) => !b.boss)) Sound.bgm('main');
    } else if (def.source) {
      // 発生源を潰した
      for (let i = 0; i < 2; i++) dropGem(e.x + rand(-30, 30), e.y + rand(-30, 30), 2);
      if (Math.random() < 0.3) dropItem('heal', e.x + 20, e.y);
      puff(e.x, e.y, '#8a6a44', 30);
      G.roomCoins += 5;
      const room = G.rooms[e.room];
      if (room) {
        room.src--;
        showBanner(room.src > 0 ? t('srcLeft', L(room, 'name'), room.src) : t('srcAll', L(room, 'name')), '#ffcf4a', 2);
      }
      Sound.play('crush');
      G.shake = Math.max(G.shake, 8);
    } else if (e.elite) {
      dropGem(e.x, e.y, 2);
      // 宝箱は、決まった時間に出るものは必ず、部屋で湧いたものは前の宝箱から ELITE_CHEST_GAP 秒たっていれば落とす
      if (e.eventElite || G.time - G.eliteChestT >= ELITE_CHEST_GAP) {
        G.eliteChestT = G.time;
        dropItem('chest', e.x, e.y);
      } else {
        dropGem(e.x + 12, e.y, 2);
        dropGem(e.x - 12, e.y, 2);
        if (Math.random() < 0.3) dropItem('heal', e.x, e.y + 12);
      }
    } else {
      dropGem(e.x, e.y, Math.min(2, def.gem + (Math.random() < DANGER[e.danger].upgrade ? 1 : 0)));
      if (def.gem === 2 && Math.random() < 0.04) dropItem('heal', e.x + 10, e.y);
    }
    if (def.burst) {
      for (let i = 0; i < def.burst; i++) {
        const a = (i / def.burst) * TAU;
        const x = e.x + Math.cos(a) * 18;
        const y = e.y + Math.sin(a) * 18;
        const m = spawnEnemy(pick(['dust', 'hair', 'paper']), x, y, { force: G.enemies.length < MAX_ENEMIES + 40, danger: e.danger, home: e.home });
        if (m) {
          m.aggro = true;
          m.kx = Math.cos(a) * 160;
          m.ky = Math.sin(a) * 160;
        }
      }
    }
  }

  // ===================================================================
  // 清掃ギア
  // ===================================================================
  function updateWeapons(dt) {
    const p = G.p;
    for (const w of G.weapons) {
      const s = w.s;
      switch (w.id) {
        case 'vacuum': updateVacuum(w, s, dt, p); break;
        case 'washer': updateWasher(w, s, dt, p); break;
        case 'robot': updateRobot(w, s, dt, p); break;
        case 'spray': updateSpray(w, s, dt, p); break;
        case 'roller': updateRoller(w, s, dt, p); break;
        case 'mop': updateMop(w, s, dt, p); break;
        case 'duster': updateDuster(w, s, dt, p); break;
        case 'bomb': updateBomb(w, s, dt, p); break;
        case 'sponge': updateSponge(w, s, dt, p); break;
        case 'purifier': updatePurifier(w, s, dt, p); break;
        case 'press': updatePress(w, s, dt, p); break;
        default: break;
      }
    }
  }

  function updateVacuum(w, s, dt, p) {
    // ノズルは近くのゴミへ自動で向く (いなければ進む方向)
    let aim = p.face;
    let best = (s.range * 1.7) ** 2;
    const c = query(p.x, p.y, s.range * 1.7);
    for (let k = 0; k < c; k++) {
      const e = qbuf[k];
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 < best && canReach(p.x, p.y, e.x, e.y)) {
        best = d2;
        aim = Math.atan2(e.y - p.y, e.x - p.x);
      }
    }
    w.ang += angleDiff(aim, w.ang) * Math.min(1, dt * 10);
    const half = ((s.angle / 2) * Math.PI) / 180;
    const nx = p.x + Math.cos(w.ang) * 14;
    const ny = p.y + Math.sin(w.ang) * 14;
    const reach = s.range * 1.25;
    // ダストも吸い寄せる
    for (const g of G.gems) {
      if (g.homing) continue;
      const dx = g.x - p.x;
      const dy = g.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > reach * 1.3) continue;
      if (Math.abs(angleDiff(Math.atan2(dy, dx), w.ang)) > half) continue;
      g.homing = true;
    }
    w.t -= dt;
    if (w.t <= 0) {
      w.t = s.cd;
      const dmg = s.dmg * dmgMul();
      let hits = 0;
      const m = query(p.x, p.y, s.range + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.range + e.r) continue;
        if (d > e.r && Math.abs(angleDiff(Math.atan2(dy, dx), w.ang)) > half + e.r / d) continue;
        if (!canReach(p.x, p.y, e.x, e.y)) continue;
        hurtEnemy(e, dmg, 0, 0);
        hits++;
      }
      cleanCone(nx, ny, w.ang, half, s.range, s.power);
      if (hits) Sound.play('suck');
    }
    // 掃除機の先の流れる線
    if (Math.random() < 0.6) {
      const a = w.ang + rand(-half, half);
      const r = s.range * rand(0.6, 1);
      addPart(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, -Math.cos(a) * s.range * 3, -Math.sin(a) * s.range * 3, 0.28, 2, 'rgba(220,240,255,0.8)', 'streak');
    }
    // ブラックホール
    if (w.evo) {
      w.vt -= dt;
      if (w.vt <= 0) {
        w.vt = s.vcd;
        // 壁の手前に出す
        let dist = 130;
        while (dist > 0 && !canReach(p.x, p.y, p.x + Math.cos(w.ang) * dist, p.y + Math.sin(w.ang) * dist)) dist -= 16;
        dist = Math.max(0, dist - 16);
        const x = clamp(p.x + Math.cos(w.ang) * dist, 20, ROOM - 20);
        const y = clamp(p.y + Math.sin(w.ang) * dist, 20, ROOM - 20);
        G.zones.push({ kind: 'vortex', x, y, r: s.vr, life: s.vdur, max: s.vdur, tick: 0, dmg: s.vdmg, power: 2 });
        Sound.play('suck');
      }
    }
  }

  function updateWasher(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    // いちばん近いゴミをねらう
    let target = null;
    let best = 1e9;
    const n = query(p.x, p.y, s.len);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < best && canReach(p.x, p.y, e.x, e.y)) {
        best = d;
        target = e;
      }
    }
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.face;
    for (let i = 0; i < s.count; i++) {
      const off = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * 0.32;
      fireBeam(p, base + off, s, w.evo);
    }
    Sound.play('shot');
  }

  function fireBeam(p, a, s, steam) {
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const x1 = p.x + cos * 10;
    const y1 = p.y + sin * 10;
    // 水流は壁で止まる
    let len = s.len;
    for (let t = 12; t < s.len; t += 12) {
      if (isBlocked(x1 + cos * t, y1 + sin * t)) {
        len = t;
        break;
      }
    }
    const x2 = x1 + cos * len;
    const y2 = y1 + sin * len;
    const dmg = s.dmg * dmgMul();
    const n = query((x1 + x2) / 2, (y1 + y2) / 2, len / 2 + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const t = clamp((e.x - x1) * cos + (e.y - y1) * sin, 0, len);
      const px = x1 + cos * t - e.x;
      const py = y1 + sin * t - e.y;
      if (px * px + py * py > (s.width / 2 + e.r) ** 2) continue;
      if (!canReach(x1 + cos * t, y1 + sin * t, e.x, e.y)) continue;
      hurtEnemy(e, dmg, cos * 160, sin * 160);
    }
    cleanLine(x1, y1, x2, y2, s.width, s.power);
    G.beams.push({ x1, y1, x2, y2, w: s.width, life: 0.2, max: 0.2, steam });
    for (let i = 0; i < 4; i++) {
      addPart(x2, y2, rand(-80, 80), rand(-80, 80), 0.4, 3, steam ? '#ffe2c4' : '#9fe3ff', 'drop');
    }
  }

  function updateRobot(w, s, dt, p) {
    const n = s.count;
    while (w.bots.length < n) w.bots.push({ x: p.x, y: p.y, tx: p.x, ty: p.y, retarget: 0 });
    w.bots.length = n;
    w.ang += s.spin * dt;
    w.cleanT -= dt;
    const cleanNow = w.cleanT <= 0;
    if (cleanNow) w.cleanT = 0.15;
    const dmg = s.dmg * dmgMul();
    for (let i = 0; i < n; i++) {
      const b = w.bots[i];
      // 進化しても、主人公のまわりを回る動きは同じ (数・大きさ・攻撃力・回る速さが上がる)
      const a = w.ang + (i / n) * TAU;
      b.x = p.x + Math.cos(a) * s.radius;
      b.y = p.y + Math.sin(a) * s.radius;
      // 壁の向こう (や壁の中) を回っているロボは、攻撃も掃除もしない
      if (!canReach(p.x, p.y, b.x, b.y)) continue;
      const m = query(b.x, b.y, s.size + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (e.robotHit > G.time) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.size + e.r || !canReach(b.x, b.y, e.x, e.y)) continue;
        e.robotHit = G.time + (w.evo ? 0.3 : 0.45);
        hurtEnemy(e, dmg, (dx / d) * 90, (dy / d) * 90);
      }
      if (cleanNow) cleanCircle(b.x, b.y, s.size + (w.evo ? 14 : 8), s.power);
      // ロボが通ったダストは主人公へ送られる
      if (cleanNow) {
        const rr = (s.size + 12) ** 2;
        for (const g of G.gems) if (!g.homing && (g.x - b.x) ** 2 + (g.y - b.y) ** 2 < rr) g.homing = true;
      }
    }
  }

  function updateSpray(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    for (let i = 0; i < s.count; i++) {
      let x;
      let y;
      if (w.evo) {
        x = p.x + rand(-view.ww / 2, view.ww / 2) * 0.9;
        y = p.y + rand(-view.wh / 2, view.wh / 2) * 0.9;
      } else {
        const a = rand(0, TAU);
        const d = rand(30, 150) * G.stats.area;
        x = p.x + Math.cos(a) * d;
        y = p.y + Math.sin(a) * d;
      }
      x = clamp(x, 10, ROOM - 10);
      y = clamp(y, 10, ROOM - 10);
      // 壁の向こうには出さない (届く所まで主人公の方へ寄せる)
      for (let k = 0; k < 8 && !canReach(p.x, p.y, x, y); k++) {
        x = p.x + (x - p.x) * 0.7;
        y = p.y + (y - p.y) * 0.7;
      }
      if (!canReach(p.x, p.y, x, y)) continue;
      G.zones.push({ kind: w.evo ? 'acid' : 'spray', x, y, r: s.radius, life: s.dur, max: s.dur, tick: rand(0, 0.1), dmg: s.dmg, power: s.power, delay: w.evo ? rand(0, 0.5) : 0 });
    }
  }

  function updateRoller(w, s, dt, p) {
    w.cleanT -= dt;
    const cleanNow = w.cleanT <= 0;
    if (cleanNow) w.cleanT = 0.1;
    const dmg = s.dmg * dmgMul();
    w.rollers = w.rollers || [];
    for (let i = 0; i < s.count; i++) {
      const pos = trailPoint(30 + i * (s.width * 0.55 + 26));
      w.rollers[i] = pos;
      const hr = s.width / 2;
      const m = query(pos.x, pos.y, hr + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (e.rollHit > G.time) continue;
        const dx = e.x - pos.x;
        const dy = e.y - pos.y;
        if (dx * dx + dy * dy > (hr + e.r) ** 2 || !canReach(pos.x, pos.y, e.x, e.y)) continue;
        e.rollHit = G.time + 0.35;
        hurtEnemy(e, dmg, 0, 0);
      }
      if (cleanNow) cleanCircle(pos.x, pos.y, hr, s.power);
    }
    w.rollers.length = s.count;
  }

  // いちばん近いゴミの方向 (いなければ進む方向)
  function aimNearest(p, r) {
    let aim = p.face;
    let best = r * r;
    const n = query(p.x, p.y, r);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 < best && canReach(p.x, p.y, e.x, e.y)) {
        best = d2;
        aim = Math.atan2(e.y - p.y, e.x - p.x);
      }
    }
    return aim;
  }

  function updateMop(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    const full = s.angle >= 360;
    const aim = full ? w.ang + 2 : aimNearest(p, s.range * 1.8);
    w.ang = aim;
    const half = full ? Math.PI : ((s.angle / 2) * Math.PI) / 180;
    const dmg = s.dmg * dmgMul();
    const n = query(p.x, p.y, s.range + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > s.range + e.r) continue;
      if (!full && d > e.r && Math.abs(angleDiff(Math.atan2(dy, dx), aim)) > half + e.r / d) continue;
      if (!canReach(p.x, p.y, e.x, e.y)) continue;
      hurtEnemy(e, dmg, (dx / d) * 260, (dy / d) * 260);
    }
    cleanCone(p.x, p.y, aim, half, s.range, s.power);
    // 振るたびに左右を入れ替えて、なぎ払う向きを見せる
    w.side = -(w.side || 1);
    G.swings.push({ x: p.x, y: p.y, a: aim, half, r: s.range, side: w.side, life: 0.22, max: 0.22, evo: w.evo });
    Sound.play('swing');
  }

  function updateDuster(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    const base = aimNearest(p, s.len + 60);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i - (s.count - 1) / 2) * 0.45;
      G.booms.push({ x: p.x, y: p.y, a, d: 0, back: false, s, evo: w.evo, spin: rand(0, TAU), hits: new Set() });
    }
    Sound.play('throw');
  }

  function updateBomb(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    // ゴミがかたまっている所をねらう (候補をいくつか見て、まわりの数がいちばん多い所)
    const n = query(p.x, p.y, 320);
    for (let i = 0; i < s.count; i++) {
      let tx = p.x + Math.cos(p.face) * 120;
      let ty = p.y + Math.sin(p.face) * 120;
      if (n) {
        let best = -1;
        for (let k = 0; k < 6; k++) {
          const e = qbuf[(Math.random() * n) | 0];
          if (!canReach(p.x, p.y, e.x, e.y)) continue;
          let c = 0;
          for (let j = 0; j < n; j++) if ((qbuf[j].x - e.x) ** 2 + (qbuf[j].y - e.y) ** 2 < s.radius * s.radius) c++;
          if (c > best) {
            best = c;
            tx = e.x;
            ty = e.y;
          }
        }
      }
      tx += rand(-12, 12) * i;
      ty += rand(-12, 12) * i;
      // 壁の向こうには投げない (届く所まで手前に寄せる)
      for (let k = 0; k < 8 && !canReach(p.x, p.y, tx, ty); k++) {
        tx = p.x + (tx - p.x) * 0.7;
        ty = p.y + (ty - p.y) * 0.7;
      }
      G.bombs.push({ x0: p.x, y0: p.y, x: p.x, y: p.y, tx: clamp(tx, 10, ROOM - 10), ty: clamp(ty, 10, ROOM - 10), t: 0, dur: 0.5 + i * 0.08, s, evo: w.evo });
    }
    Sound.play('throw');
  }

  // ダストプレス: ダストボックスの中身を押し固めて衝撃波を出す (前のゴミ圧縮をギアにしたもの)
  function updatePress(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    const used = Math.min(G.box, Math.max(8, G.stats.boxCap * s.use));
    G.box -= used;
    const dmg = (s.dmg + used * 0.5) * G.stats.might * dmgMul();
    const n = query(p.x, p.y, s.radius + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > s.radius + e.r || !canReach(p.x, p.y, e.x, e.y)) continue;
      hurtEnemy(e, dmg, (dx / d) * 280, (dy / d) * 280);
    }
    cleanCircle(p.x, p.y, s.radius, s.power);
    G.blasts.push({ x: p.x, y: p.y, r: s.radius, life: 0.35, max: 0.35, press: true, evo: w.evo });
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const sp = rand(150, 380);
      addPart(p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.6), rand(3, 6), pick(['#c7b48a', '#8a7a58', '#d8d2c6']), 'cube');
    }
    G.shake = Math.max(G.shake, w.evo ? 8 : 5);
    Sound.play('compress');
  }

  // 空気清浄機 (ヴァンサバのニンニクにあたる): まわりのゴミに一定間隔でダメージを与え、少し押し返す
  function updatePurifier(w, s, dt, p) {
    G.auraR = s.radius;
    G.auraEvo = w.evo;
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    w.pulse = 0.25;
    const dmg = s.dmg * dmgMul();
    const n = query(p.x, p.y, s.radius + 70);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > s.radius + e.r || !canReach(p.x, p.y, e.x, e.y)) continue;
      hurtEnemy(e, dmg, (dx / d) * 110, (dy / d) * 110);
    }
    cleanCircle(p.x, p.y, s.radius * 0.8, s.power);
  }

  function updateSponge(w, s, dt, p) {
    w.t -= dt;
    if (w.t > 0) return;
    w.t = s.cd;
    for (let i = 0; i < s.count; i++) {
      const a = rand(0, TAU);
      G.sponges.push({ x: p.x, y: p.y, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed, life: s.dur, s, evo: w.evo, cleanT: 0, rot: 0 });
    }
  }

  // はたき・洗剤ボム・スポンジ・モップのなぎ払い
  function updateProjectiles(dt) {
    const p = G.p;
    for (let i = G.swings.length - 1; i >= 0; i--) {
      G.swings[i].life -= dt;
      if (G.swings[i].life <= 0) G.swings.splice(i, 1);
    }
    // はたき: 飛んでいって、戻ってくる
    for (let i = G.booms.length - 1; i >= 0; i--) {
      const b = G.booms[i];
      const s = b.s;
      b.spin += dt * 14;
      if (!b.back) {
        const nx = b.x + Math.cos(b.a) * s.speed * dt;
        const ny = b.y + Math.sin(b.a) * s.speed * dt;
        // 壁や段ボールに当たったら、めりこまずにその手前で引き返す
        const stop = isBlocked(nx, ny);
        if (!stop) {
          b.d += s.speed * dt;
          b.x = nx;
          b.y = ny;
        }
        if (stop || b.d >= s.len) {
          b.back = true;
          b.hits.clear(); // 帰りも当たる
        }
      } else {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 16) {
          G.booms.splice(i, 1);
          continue;
        }
        const sp = s.speed * 1.15 * dt;
        const nx = b.x + (dx / d) * Math.min(d, sp);
        const ny = b.y + (dy / d) * Math.min(d, sp);
        // 帰り道に壁があったら、そこで消える
        if (wallBetween(b.x, b.y, nx, ny)) {
          puff(b.x, b.y, '#e8e2d0', 4);
          G.booms.splice(i, 1);
          continue;
        }
        b.x = nx;
        b.y = ny;
      }
      const dmg = s.dmg * dmgMul();
      const m = query(b.x, b.y, s.size + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (b.hits.has(e)) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.size + e.r || !canReach(b.x, b.y, e.x, e.y)) continue;
        b.hits.add(e);
        hurtEnemy(e, dmg, (dx / d) * 120, (dy / d) * 120);
      }
      cleanCircle(b.x, b.y, s.size, s.power);
      // 進化すると、通り道のダストを主人公へ送る
      if (b.evo) {
        const rr = (s.size + 20) ** 2;
        for (const g of G.gems) if (!g.homing && (g.x - b.x) ** 2 + (g.y - b.y) ** 2 < rr) g.homing = true;
      }
    }
    // 洗剤ボム: 弧を描いて飛び、着地ではじける
    for (let i = G.bombs.length - 1; i >= 0; i--) {
      const b = G.bombs[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.x = b.x0 + (b.tx - b.x0) * k;
      b.y = b.y0 + (b.ty - b.y0) * k;
      b.h = Math.sin(k * Math.PI) * 50;
      if (k < 1) continue;
      G.bombs.splice(i, 1);
      const s = b.s;
      const dmg = s.dmg * dmgMul();
      const m = query(b.x, b.y, s.radius + 70);
      for (let q = 0; q < m; q++) {
        const e = qbuf[q];
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.radius + e.r || !canReach(b.x, b.y, e.x, e.y)) continue;
        hurtEnemy(e, dmg, (dx / d) * 200, (dy / d) * 200);
      }
      cleanCircle(b.x, b.y, s.radius, s.power);
      G.blasts.push({ x: b.x, y: b.y, r: s.radius, life: 0.3, max: 0.3, evo: b.evo });
      for (let q = 0; q < 10; q++) addPart(b.x, b.y, rand(-160, 160), rand(-160, 160), 0.5, rand(3, 6), b.evo ? '#ffd1f0' : '#d8f4ff', 'dot');
      if (b.evo) G.zones.push({ kind: 'foam', x: b.x, y: b.y, r: s.foamR, life: s.foamDur, max: s.foamDur, tick: 0.2, dmg: s.foamDmg, power: 2 });
      G.shake = Math.max(G.shake, 2);
      Sound.play('boom');
    }
    for (let i = G.blasts.length - 1; i >= 0; i--) {
      G.blasts[i].life -= dt;
      if (G.blasts[i].life <= 0) G.blasts.splice(i, 1);
    }
    // スポンジ: 壁で跳ね返りながら飛び回る
    for (let i = G.sponges.length - 1; i >= 0; i--) {
      const b = G.sponges[i];
      const s = b.s;
      b.life -= dt;
      if (b.life <= 0) {
        G.sponges.splice(i, 1);
        continue;
      }
      b.rot += dt * 6;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      if (nx < s.size || nx > ROOM - s.size || isBlocked(nx, b.y)) b.vx = -b.vx;
      else b.x = nx;
      if (ny < s.size || ny > ROOM - s.size || isBlocked(b.x, ny)) b.vy = -b.vy;
      else b.y = ny;
      // 主人公から離れすぎたら、主人公の方へ跳ね返る
      if (Math.hypot(b.x - p.x, b.y - p.y) > 420) {
        const a = Math.atan2(p.y - b.y, p.x - b.x) + rand(-0.5, 0.5);
        b.vx = Math.cos(a) * s.speed;
        b.vy = Math.sin(a) * s.speed;
      }
      const dmg = s.dmg * dmgMul();
      const m = query(b.x, b.y, s.size + 70);
      for (let k = 0; k < m; k++) {
        const e = qbuf[k];
        if (e.spongeHit > G.time) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.size + e.r || !canReach(b.x, b.y, e.x, e.y)) continue;
        e.spongeHit = G.time + 0.3;
        hurtEnemy(e, dmg, (dx / d) * 80, (dy / d) * 80);
      }
      b.cleanT -= dt;
      if (b.cleanT <= 0) {
        b.cleanT = 0.06;
        cleanCircle(b.x, b.y, s.size + 6, s.power);
      }
    }
  }

  // 主人公が通った道のりで、dist だけ後ろの点
  function trailPoint(dist) {
    const tr = G.trail;
    let px = G.p.x;
    let py = G.p.y;
    let acc = 0;
    for (let i = tr.length - 1; i >= 0; i--) {
      const q = tr[i];
      const d = Math.hypot(q.x - px, q.y - py);
      if (acc + d >= dist) {
        const t = (dist - acc) / (d || 1);
        const x = px + (q.x - px) * t;
        const y = py + (q.y - py) * t;
        return { x, y, a: Math.atan2(py - q.y, px - q.x) };
      }
      acc += d;
      px = q.x;
      py = q.y;
    }
    return { x: px, y: py, a: G.p.face };
  }

  function updateZones(dt) {
    for (let i = G.zones.length - 1; i >= 0; i--) {
      const z = G.zones[i];
      if (z.delay > 0) {
        z.delay -= dt;
        continue;
      }
      z.life -= dt;
      if (z.life <= 0) {
        G.zones.splice(i, 1);
        continue;
      }
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = z.kind === 'vortex' ? 0.25 : z.kind === 'foam' ? 0.3 : 0.4;
      const dmg = z.dmg * dmgMul();
      const n = query(z.x, z.y, z.r + 70);
      for (let k = 0; k < n; k++) {
        const e = qbuf[k];
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        if (dx * dx + dy * dy > (z.r + e.r) ** 2 || !canReach(z.x, z.y, e.x, e.y)) continue;
        const mul = (z.kind === 'spray' || z.kind === 'acid') && e.def.mold ? 2 : 1;
        hurtEnemy(e, dmg * mul, 0, 0);
      }
      cleanCircle(z.x, z.y, z.kind === 'vortex' ? z.r * 0.7 : z.r, z.power);
    }
  }

  // ===================================================================
  // 主人公
  // ===================================================================
  function updatePlayer(dt) {
    const p = G.p;
    const s = G.stats;
    const [ix, iy] = inputVector();
    p.moving = ix !== 0 || iy !== 0;
    if (p.moving) p.face = Math.atan2(iy, ix);
    const dl = dirtAt(p.x, p.y);
    const floorMul = dl === 0 ? 1.15 : dl === 1 ? 1 : dl === 2 ? 1 - 0.1 * s.dirtSlow : 1 - 0.25 * s.dirtSlow;
    if (p.slowT > 0) {
      p.slowT -= dt;
      if (p.slowT <= 0) p.slowAmt = 0;
    }
    const sp = s.speed * floorMul * (1 - p.slowAmt) * (boxFull() ? 0.85 : 1);
    const tx = ix * sp;
    const ty = iy * sp;
    const prevRoom = G.curRoom;
    G.curRoom = roomAt(p.x, p.y);
    const here = G.rooms[G.curRoom];
    // 別の部屋に入ったら、その部屋の汚れレベルを知らせる (ドアを行き来したときに出すぎないよう、同じ部屋は 10 秒あける)
    if (here && G.curRoom !== prevRoom && prevRoom != null && prevRoom >= 0 && !here.done && G.time - (here.enterT ?? -99) > 10) {
      here.enterT = G.time;
      G.roomBanner = { room: here, t: 2.6, max: 2.6 };
    }
    if (here && here.slippery) {
      const k = Math.min(1, dt * 3.2);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
    } else {
      p.vx = tx;
      p.vy = ty;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    pushOut(p, p.r);
    if (p.moving || Math.hypot(p.vx, p.vy) > 5) p.anim += dt;
    // 歩くだけで足元の床を少し磨く
    p.scrubT = (p.scrubT || 0) - dt;
    if (p.scrubT <= 0) {
      p.scrubT = 0.12;
      cleanCircle(p.x, p.y, s.scrub / G.stats.cleanArea, 1);
    }
    // 通った道を記録 (コロコロ用)
    const tr = G.trail;
    const lastP = tr[tr.length - 1];
    if (!lastP || Math.hypot(lastP.x - p.x, lastP.y - p.y) > 4) {
      tr.push({ x: p.x, y: p.y });
      if (tr.length > 160) tr.shift();
    }
    if (p.inv > 0) p.inv -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.allergyT > 0) {
      p.allergyT -= dt;
      if (G.ch.mods.allergyImmune) p.allergyT = 0;
      else damagePlayer(2 * dt, true);
    }
    if (s.regen > 0 && p.hp > 0) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
  }

  function damagePlayer(amount, dot) {
    const p = G.p;
    if (G.state !== 'play') return;
    if (!dot) {
      if (p.inv > 0) return;
      amount = Math.max(1, amount - G.stats.armor);
      p.inv = 0.5;
      p.hurtT = 0.15;
      Sound.play('hurt');
      G.shake = Math.max(G.shake, 4);
    }
    p.hp -= amount;
    G.minHp = Math.min(G.minHp, Math.max(0, p.hp) / G.stats.maxHp); // 宝物の条件「体力を保ってクリア」用
    if (p.hp <= 0) {
      p.hp = 0;
      G.state = 'dead';
      G.endT = 0;
      Sound.bgm(null);
      Sound.play('lose');
      puff(p.x, p.y, '#ffffff', 30);
    }
  }

  function playerContacts() {
    const p = G.p;
    const n = query(p.x, p.y, p.r + 80);
    for (let k = 0; k < n; k++) {
      const e = qbuf[k];
      if (e.flee) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const rr = e.r * 0.85 + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (e.def.source) {
        const d = Math.sqrt(d2) || 1;
        p.x -= (dx / d) * (rr - d);
        p.y -= (dy / d) * (rr - d);
        continue;
      }
      if (e.def.touch === 'tangle') {
        if (p.slowAmt <= 0.1) {
          p.slowAmt = 0.1;
          p.slowT = 2;
        }
      } else if (e.def.touch === 'stick') {
        p.slowAmt = Math.max(p.slowAmt, 0.4);
        p.slowT = 3;
      }
      damagePlayer(e.dmg, false);
    }
  }

  function updateHazards(dt) {
    const p = G.p;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ROOM || b.y > ROOM || isBlocked(b.x, b.y)) {
        G.bullets.splice(i, 1);
        continue;
      }
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + p.r) ** 2) {
        damagePlayer(b.dmg, false);
        p.allergyT = 3;
        G.bullets.splice(i, 1);
      }
    }
    for (let i = G.clouds.length - 1; i >= 0; i--) {
      const c = G.clouds[i];
      c.life -= dt;
      if (c.life <= 0) {
        G.clouds.splice(i, 1);
        continue;
      }
      if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (c.r * 0.85) ** 2) p.allergyT = 3;
    }
  }

  // ===================================================================
  // ダスト・アイテム・ゴミ捨て場
  // ===================================================================
  function dropGem(x, y, size) {
    if (G.gems.length >= MAX_GEMS) {
      // 多すぎたら、近くのダストにまとめる
      const g = G.gems[(Math.random() * G.gems.length) | 0];
      g.xp += GEM_XP[size];
      g.box += GEM_BOX[size];
      g.size = Math.max(g.size, size);
      return;
    }
    G.gems.push({ x, y, size, xp: GEM_XP[size], box: GEM_BOX[size], homing: false, sp: 0, t: rand(0, 6) });
  }

  function updateGems(dt) {
    const p = G.p;
    const mag = G.stats.magnet * (dirtAt(p.x, p.y) === 0 ? 1.2 : 1);
    const mag2 = mag * mag;
    let picked = 0;
    const full = boxFull();
    updateBoxWarning(dt, full);
    for (let i = G.gems.length - 1; i >= 0; i--) {
      const g = G.gems[i];
      g.t += dt;
      // 満タンのあいだは拾えない (床に残ったまま)
      if (full) {
        g.homing = false;
        g.sp = 0;
        continue;
      }
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d2 = dx * dx + dy * dy;
      if (!g.homing && d2 < mag2) g.homing = true;
      if (!g.homing) continue;
      const d = Math.sqrt(d2) || 1;
      g.sp = Math.min(600, g.sp + 900 * dt);
      const mv = Math.min(d, g.sp * dt);
      g.x += (dx / d) * mv;
      g.y += (dy / d) * mv;
      if (d < p.r + 6) {
        G.gems[i] = G.gems[G.gems.length - 1];
        G.gems.pop();
        gainXp(g.xp);
        G.box = Math.min(G.stats.boxCap, G.box + g.box);
        picked++;
      }
    }
    if (picked) Sound.play('pop');

    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i];
      it.t += dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      if (dx * dx + dy * dy < 26 * 26) {
        G.items.splice(i, 1);
        if (it.kind === 'heal') {
          p.hp = Math.min(G.stats.maxHp, p.hp + 30);
          Sound.play('heal');
          addText(p.x, p.y - 20, '+30', '#7dff9a');
        } else if (it.kind === 'chest') {
          openChest();
          return;
        } else if (it.kind === 'treasure') {
          foundTreasure();
          return;
        }
      }
    }
  }

  // 満タンになった瞬間と、満タンのあいだは知らせ続ける (もうすぐ満タンも一度だけ知らせる)
  function updateBoxWarning(dt, full) {
    const ratio = G.box / G.stats.boxCap;
    if (full && !G.boxWasFull) {
      showBanner(t('boxFullBanner'), '#ff6b6b', 2.4);
      Sound.play('warn');
      G.boxNagT = 0;
    }
    G.boxWasFull = full;
    if (full) {
      G.boxNagT -= dt;
      if (G.boxNagT <= 0) {
        G.boxNagT = 2.5;
        addText(G.p.x, G.p.y - 30, t('boxFullNag'), '#ff8a8a');
      }
    }
    if (ratio >= 0.8 && !full && !G.boxNearWarned) {
      G.boxNearWarned = true;
      addText(G.p.x, G.p.y - 30, t('boxNear'), '#ffcf4a');
    }
    if (ratio < 0.5) G.boxNearWarned = false;
  }

  function gainXp(v) {
    G.xp += v * G.stats.xpMul * BAL.xp;
    while (G.xp >= G.xpNext) {
      G.xp -= G.xpNext;
      G.level++;
      G.xpNext = xpFor(G.level);
      G.pendingLv++;
    }
  }

  function updateDumps(dt) {
    const p = G.p;
    let on = -1;
    G.dumps.forEach((d, i) => {
      if ((d.x - p.x) ** 2 + (d.y - p.y) ** 2 < 36 * 36) on = i;
    });
    for (let i = 0; i < G.dumps.length; i++) if (i !== on) G.dumps[i].t = 0;
    if (on < 0) return;
    const d = G.dumps[on];
    // 1 コインにもならない量 (4 未満) では捨てない (立っているだけで「ゴミ捨て完了!」が出続けないように)
    if (G.box < 4) {
      d.t = 0;
      return;
    }
    d.t += dt;
    if (d.t >= DUMP_TIME) {
      d.t = 0;
      const coins = Math.floor(G.box / 4);
      G.dumpCoins += coins;
      G.box = 0;
      G.dumpCount++;
      Sound.play('dump');
      showBanner(t('dumped', coins), '#ffcf4a', 1.6);
      puff(d.x, d.y, '#c7b48a', 14);
    }
  }

  // ===================================================================
  // 演出
  // ===================================================================
  function addPart(x, y, vx, vy, life, size, color, kind) {
    if (G.parts.length >= MAX_PARTICLES) return;
    G.parts.push({ x, y, vx, vy, life, max: life, size, color, kind, rot: rand(0, TAU) });
  }

  function puff(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(30, 140);
      addPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.5), rand(2, 4), color, 'dot');
    }
  }

  function addText(x, y, text, color) {
    if (G.parts.length >= MAX_PARTICLES) return;
    G.parts.push({ x, y, vx: 0, vy: -30, life: 0.9, max: 0.9, size: 14, color, kind: 'text', text });
  }

  function showBanner(text, color, dur) {
    G.banner = { text, color, t: dur, max: dur };
  }

  function updateFx(dt) {
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const q = G.parts[i];
      q.life -= dt;
      if (q.life <= 0) {
        G.parts[i] = G.parts[G.parts.length - 1];
        G.parts.pop();
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'dot' || q.kind === 'cube' || q.kind === 'drop') {
        q.vx *= 0.92;
        q.vy *= 0.92;
      }
    }
    for (let i = G.beams.length - 1; i >= 0; i--) {
      G.beams[i].life -= dt;
      if (G.beams[i].life <= 0) G.beams.splice(i, 1);
    }
    if (G.banner) {
      G.banner.t -= dt;
      if (G.banner.t <= 0) G.banner = null;
    }
    if (G.roomBanner) {
      G.roomBanner.t -= dt;
      if (G.roomBanner.t <= 0) G.roomBanner = null;
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
    if (G.flash > 0) G.flash -= dt;
    // ピカピカの床がときどきキラッと光る
    for (let k = 0; k < 2; k++) {
      const x = G.cam.x + rand(-view.ww / 2, view.ww / 2);
      const y = G.cam.y + rand(-view.wh / 2, view.wh / 2);
      if (dirtAt(x, y) === 0) addPart(x, y, 0, 0, 0.7, rand(2, 4), '#ffffff', 'twinkle');
    }
  }

  // ---- チュートリアルの手順 ----
  // done: 次へ進む条件 / target: 矢印で指す場所 (なければ出さない) / max: この秒数たったら先へ進める
  const nearestOf = (list) => {
    let best = null;
    let bd = Infinity;
    for (const o of list) {
      const d = (o.x - G.p.x) ** 2 + (o.y - G.p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  };
  const roomCenter = (r) => {
    const [x, y] = roomPoint(r.rect, 0.5, 0.5);
    return { x, y };
  };
  const TUT_STEPS = [
    { key: 'tutMove', done: (g) => g.tutorial.moved > 260 },
    { key: 'tutKill', done: (g) => g.kills >= 6 },
    { key: 'tutDust', done: (g) => g.level >= 2 },
    {
      key: 'tutSource',
      done: (g) => g.rooms.some((r) => r.src < r.src0),
      target: (g) => nearestOf(g.enemies.filter((e) => e.alive && e.def.source && g.rooms[e.room].danger === 1)),
    },
    {
      key: 'tutRoom',
      done: (g) => g.rooms.some((r) => r.done),
      target: (g) => {
        const here = g.rooms[roomAt(g.p.x, g.p.y)];
        const room = here && !here.done ? here : g.rooms.find((r) => !r.done && r.danger === 1);
        if (!room) return null;
        return nearestOf(g.enemies.filter((e) => e.alive && e.def.source && e.room === room.idx)) || null;
      },
    },
    {
      key: 'tutChest',
      done: (g) => g.chestsOpened > 0 || !g.items.some((it) => it.kind === 'chest'),
      target: (g) => nearestOf(g.items.filter((it) => it.kind === 'chest')),
      max: 25,
    },
    {
      key: 'tutDump',
      done: (g) => g.dumpCount > 0,
      target: (g) => (g.box > 0 ? nearestOf(g.dumps) : null),
      max: 30,
    },
    {
      key: 'tutDanger',
      done: () => false,
      target: (g) => {
        const r = g.rooms.filter((q) => !q.done).sort((a, b) => a.danger - b.danger)[0];
        if (!r) return null;
        return nearestOf(g.enemies.filter((e) => e.alive && e.def.source && e.room === r.idx)) || roomCenter(r);
      },
    },
  ];
  const tutorBox = document.getElementById('tutor');
  // 移動のヒントは、スマホ・タブレットでは指の操作だけ、パソコンではキーの操作だけを出す
  const tutKey = (step) => (step.key === 'tutMove' && matchMedia('(pointer: coarse)').matches ? 'tutMoveTouch' : step.key);

  // 1秒に読める文字数のめやす (ヒントを出しておく長さに使う)
  const READ_SPEED = { ja: 10, en: 22, zh: 9, ko: 13, fr: 20, de: 19, es: 20, it: 20, pt: 20 };

  function updateTutorial(dt) {
    const tu = G.tutorial;
    const p = G.p;
    if (tu.lastX != null) tu.moved += Math.hypot(p.x - tu.lastX, p.y - tu.lastY);
    tu.lastX = p.x;
    tu.lastY = p.y;
    tu.stepT += dt;
    const step = TUT_STEPS[tu.step];
    if (!step) return;
    // 条件を満たしたら次の手順へ。読み終わる前に消えないように、文の長さに合わせて 4〜9 秒は出しておく
    const minT = clamp(t(tutKey(step)).replace(/<[^>]+>/g, '').length / (READ_SPEED[lang] || 10), 4, 9);
    if (tu.stepT > minT && (step.done(G) || (step.max && tu.stepT > step.max))) {
      tu.step++;
      tu.stepT = 0;
      Sound.play('click');
      renderTutor();
    }
  }

  // 画面下のヒントの欄。言語を切り替えたときもこれで描き直す
  function renderTutor() {
    if (!tutorBox) return;
    const tu = G && G.tutorial;
    const step = tu && TUT_STEPS[tu.step];
    tutorBox.hidden = !step;
    if (!step) return;
    tutorBox.innerHTML = `<span class="tutor-no">${tu.step + 1}/${TUT_STEPS.length}</span><span class="tutor-text">${t(tutKey(step))}</span>`;
    tutorBox.classList.remove('pop');
    void tutorBox.offsetWidth;
    tutorBox.classList.add('pop');
  }

  // 汚れの靄: いる部屋のまわりの汚れ (6割) と、家全体の汚れ (4割) で濃さが決まる。きれいにすると晴れていく
  function updateHaze(dt) {
    G.hazeT -= dt;
    if (G.hazeT <= 0) {
      G.hazeT = 0.25;
      const p = G.p;
      const local = dirtiness(p.x, p.y, 320, roomAt(p.x, p.y));
      const house = 1 - cleanPct() / 100;
      G.hazeTarget = clamp((local * 0.6 + house * 0.4 - 0.08) / 0.6, 0, 1);
    }
    G.haze += ((G.hazeTarget ?? G.haze) - G.haze) * Math.min(1, dt * 0.9);
  }

  // ===================================================================
  // 1フレームの更新
  // ===================================================================
  function update(dt) {
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      return;
    }
    G.sparkBudget = 8;
    G.kyuPending = false;

    if (G.state === 'play') {
      G.time += dt;
      runEvents();
      updatePlayer(dt);
      G.flowT -= dt;
      if (G.flowT <= 0) {
        G.flowT = 0.25;
        buildFlow();
      }
      updateSpawns(dt);
      updateHaze(dt);
      if (G.tutorial) updateTutorial(dt);
    } else {
      G.endT += dt;
    }

    // 片付いたゴミを取りのぞく
    const es = G.enemies;
    let j = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (e.alive && !(e.flee && e.life > 0 && Math.hypot(e.x - G.p.x, e.y - G.p.y) > 900)) es[j++] = e;
      else {
        if (e.src) e.src.brood--;
        e.src = null;
        G.pool.push(e);
      }
    }
    es.length = j;

    updateEnemies(dt);
    buildGrid();
    separate();
    if (G.state === 'play') {
      updateWeapons(dt);
      updateProjectiles(dt);
      updateZones(dt);
      updateHazards(dt);
      playerContacts();
      updateGems(dt);
      updateDumps(dt);
      growDirt(dt);
    }
    updateFx(dt);

    if (G.kyuPending) {
      Sound.play('kyu', G.kyuStreak);
      G.kyuStreak++;
    }

    if (G.state === 'play') {
      for (const r of G.rooms) {
        if (!r.done && r.src === 0 && r.clean >= r.total * ROOM_DONE) completeRoom(r);
      }
      checkTreasureCond();
      if (G.rooms.every((r) => r.done)) winGame();
      else if (G.time >= GAME_TIME) timeUp();
      else if (G.pendingLv > 0 && overlay.hidden) showLevelUp();
    } else if (G.state === 'win' && G.endT > 2.6) {
      showResult(true);
    } else if (G.state === 'dead' && G.endT > 1.6) {
      // 力尽きたら復活をすすめる (時間切れは復活できない)。宝物の「復活」があればそれを、なければ広告での復活を
      // (広告は 1 回のプレイで 1 回だけ。広告が使えない場所では出さない)
      if (!G.timeUp && !G.reviveAsked && (G.freeRevive || (Ads.live() && !G.adRevived))) showRevive();
      else showResult(false);
    }
  }

  // 発生源を全部潰して、床を ROOM_DONE 以上きれいにすると部屋の清掃が完了する (残りは自動で仕上げる)
  function completeRoom(r) {
    r.done = true;
    G.sparkBudget = 80;
    const [rx, ry, rw, rh] = r.rect;
    forTilesInBox(rx * BLOCK, ry * BLOCK, (rx + rw) * BLOCK - 1, (ry + rh) * BLOCK - 1, (i) => {
      if (G.tileRoom[i] === r.idx && G.dirt[i] !== 255) setDirt(i, 0);
    });
    for (let k = 0; k < 40; k++) {
      const [x, y] = roomPoint(r.rect, rand(0.05, 0.95), rand(0.05, 0.95));
      addPart(x, y, 0, rand(-30, -10), rand(0.6, 1.2), rand(3, 6), pick(['#ffffff', '#fffbe0', '#bff7e6']), 'twinkle');
    }
    // 特典
    const b = G.bonus;
    switch (r.bonus) {
      case 'speed': b.speed += 0.1; break;
      case 'magnet': b.magnet += 0.25; break;
      case 'hp': b.hp += 20; break;
      case 'regen': b.regen += 0.5; break;
      case 'might': b.might += 0.1; break;
      case 'cd': b.cd += 0.06; break;
      case 'box': b.box += 40; break;
      case 'armor': b.armor += 1; break;
      case 'area': b.area += 0.1; break;
      default: break;
    }
    recalcStats();
    if (r.bonus === 'heal') G.p.hp = G.stats.maxHp;
    G.roomCoins += 15 * r.danger;
    dropItem('chest', G.p.x + 26, G.p.y, roomAt(G.p.x, G.p.y)); // 主人公のいる部屋に置く
    // 宝物の条件が「この部屋の清掃を完了」(時間つきもある) なら、部屋のまん中に宝物が現れる
    const c = G.trCond;
    const isTreasureRoom = !G.trSpawned && c && ((c.type === 'room' && r.id === G.stage.treasure.room) || (c.type === 'roomTime' && r.id === c.room && G.time <= c.t));
    if (isTreasureRoom) spawnTreasure(...roomPoint(r.rect, 0.5, 0.5), false, r.idx);
    showBanner(isTreasureRoom ? t('roomTreasure', L(r, 'name')) : t('roomDone', L(r, 'name'), bonusText(r.bonus)), '#4fe0b6', 3);
    Sound.play('room-clear');
    G.shake = Math.max(G.shake, 6);
  }

  // 宝物を床に出す (条件を満たしたとき)
  function spawnTreasure(x, y, banner = true, room = roomAt(x, y)) {
    G.trSpawned = true;
    const spot = dropItem('treasure', x, y, room);
    for (let k = 0; k < 30; k++) addPart(spot.x, spot.y, rand(-120, 120), rand(-160, -20), rand(0.6, 1.2), rand(3, 6), pick(['#ffd34a', '#fff3b0', '#ffffff']), 'twinkle');
    if (banner) {
      showBanner(t('treasureAppeared'), '#ffcf4a', 2.6);
      Sound.play('chest-evo');
    }
  }

  // プレイ中に満たす宝物の条件 (ゴミの数・ゴミ捨ての回数・発生源・ボス)。満たしたら主人公のそばに宝物が現れる
  function checkTreasureCond() {
    const c = G.trCond;
    if (G.trSpawned || !c) return;
    let ok = false;
    if (c.type === 'kills') ok = (G.killsByType[c.enemy] || 0) >= c.n;
    else if (c.type === 'dumps') ok = G.dumpCount >= c.n;
    else if (c.type === 'srcTime') ok = G.time <= c.t && G.rooms.every((r) => r.src === 0);
    else if (c.type === 'boss') ok = (G.killsByType[c.boss] || 0) > 0;
    if (ok) spawnTreasure(G.p.x + 40, G.p.y - 20, true, roomAt(G.p.x, G.p.y)); // 主人公のいる部屋に出す
  }

  function timeUp() {
    G.state = 'dead';
    G.timeUp = true;
    G.endT = 0;
    G.time = GAME_TIME;
    showBanner(t('timeUp'), '#ff6b6b', 2);
    Sound.bgm(null);
    Sound.play('lose');
  }

  function winGame() {
    G.state = 'win';
    G.endT = 0;
    for (const e of G.enemies) {
      e.flee = true;
      e.life = 1;
    }
    G.bullets.length = 0;
    G.clouds.length = 0;
    showBanner(t('allClean'), '#4fe0b6', 2.6);
    Sound.bgm(null);
    Sound.play('win');
    Ads.happy();
    // クリアで満たす宝物の条件 (時間内にクリア・体力を保ってクリア) と、床に出たまま拾っていない宝物は、ここで渡す
    const c = G.trCond;
    G.pendingLv = 0; // クリアしたあとはレベルアップの画面を出さない
    const winCond = !G.trSpawned && c && ((c.type === 'clearTime' && G.time <= c.t) || (c.type === 'hpKeep' && G.minHp * 100 >= c.pct));
    const left = G.items.some((it) => it.kind === 'treasure');
    if (winCond || left) {
      G.trSpawned = true;
      G.items = G.items.filter((it) => it.kind !== 'treasure');
      foundTreasure();
    }
  }

  // ===================================================================
  // 描画
  // ===================================================================
  function render(now) {
    const dpr = view.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14181d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!G) return;
    const p = G.p;
    const tm = now / 1000;
    // カメラ
    const cam = G.cam;
    cam.x = view.ww >= ROOM ? ROOM / 2 : clamp(p.x, view.ww / 2, ROOM - view.ww / 2);
    cam.y = view.wh >= ROOM ? ROOM / 2 : clamp(p.y, view.wh / 2, ROOM - view.wh / 2);
    let sx = 0;
    let sy = 0;
    if (G.shake > 0 && save.settings.shake) {
      sx = rand(-G.shake, G.shake);
      sy = rand(-G.shake, G.shake);
    }
    const z = view.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (view.w / 2 + sx) * dpr - cam.x * z, (view.h / 2 + sy) * dpr - cam.y * z);
    const x0 = cam.x - view.ww / 2;
    const y0 = cam.y - view.wh / 2;
    const x1 = cam.x + view.ww / 2;
    const y1 = cam.y + view.wh / 2;
    const inView = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    // 床 (部屋ごとの模様)
    const fx0 = Math.max(0, x0);
    const fy0 = Math.max(0, y0);
    const fx1 = Math.min(ROOM, x1);
    const fy1 = Math.min(ROOM, y1);
    for (const r of G.rooms) {
      const ax = Math.max(fx0, r.rect[0] * BLOCK);
      const ay = Math.max(fy0, r.rect[1] * BLOCK);
      const bx = Math.min(fx1, (r.rect[0] + r.rect[2]) * BLOCK);
      const by = Math.min(fy1, (r.rect[1] + r.rect[3]) * BLOCK);
      if (ax >= bx || ay >= by) continue;
      ctx.fillStyle = G.floorPatterns[r.floor];
      ctx.fillRect(ax, ay, bx - ax, by - ay);
    }
    // 汚れ
    ctx.imageSmoothingEnabled = true;
    const sc = DIRT_PX / TILE;
    ctx.drawImage(G.dirtCanvas, fx0 * sc, fy0 * sc, (fx1 - fx0) * sc, (fy1 - fy0) * sc, fx0, fy0, fx1 - fx0, fy1 - fy0);
    // 家の外壁
    ctx.strokeStyle = '#3b3128';
    ctx.lineWidth = 16;
    ctx.strokeRect(-8, -8, ROOM + 16, ROOM + 16);

    // 部屋の名前 (床に薄く書く。清掃が完了した部屋は緑)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 34px system-ui, -apple-system, "Hiragino Sans", sans-serif';
    for (const r of G.rooms) {
      const [cx, cy] = roomPoint(r.rect, 0.5, 0.5);
      if (!inView(cx, cy, 200)) continue;
      ctx.fillStyle = r.done ? 'rgba(79,224,182,0.35)' : 'rgba(0,0,0,0.16)';
      ctx.fillText(r.done ? `${L(r, 'name')} ✓` : L(r, 'name'), cx, cy);
      if (!r.done) {
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.fillStyle = r.danger >= 4 ? 'rgba(160,20,20,0.3)' : 'rgba(0,0,0,0.16)';
        ctx.fillText(stars(r.danger), cx, cy + 34);
        ctx.font = '900 34px system-ui, -apple-system, "Hiragino Sans", sans-serif';
      }
    }
    ctx.textBaseline = 'alphabetic';

    // 壁と段ボール
    {
      const bx0 = Math.max(0, Math.floor(x0 / BLOCK));
      const by0 = Math.max(0, Math.floor(y0 / BLOCK));
      const bx1 = Math.min(BN - 1, Math.floor(x1 / BLOCK));
      const by1 = Math.min(BN - 1, Math.floor(y1 / BLOCK));
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const kind = G.blocked[by * BN + bx];
          if (!kind || kind === 3) continue;
          const x = bx * BLOCK;
          const y = by * BLOCK;
          if (kind === 1) {
            // 壁: 上面は明るく、手前 (下が床) の面だけ暗く描いて、ひと続きに見せる
            const c = by * BN + bx;
            const wallUp = by > 0 && G.blocked[c - BN] === 1;
            const wallDown = by < BN - 1 && G.blocked[c + BN] === 1;
            const wallL = bx > 0 && G.blocked[c - 1] === 1;
            const wallR = bx < BN - 1 && G.blocked[c + 1] === 1;
            ctx.fillStyle = '#d9cdb8';
            ctx.fillRect(x, y, BLOCK, BLOCK);
            ctx.fillStyle = '#5c4a3c';
            if (!wallUp) ctx.fillRect(x, y, BLOCK, 3);
            if (!wallL) ctx.fillRect(x, y, 3, BLOCK);
            if (!wallR) ctx.fillRect(x + BLOCK - 3, y, 3, BLOCK);
            if (!wallDown) {
              ctx.fillStyle = '#8a705a';
              ctx.fillRect(x, y + BLOCK - 14, BLOCK, 14);
              ctx.fillStyle = '#5c4a3c';
              ctx.fillRect(x, y + BLOCK - 3, BLOCK, 3);
            }
          } else {
            ctx.fillStyle = (bx + by) % 2 ? '#b98a52' : '#c4955c';
            ctx.fillRect(x, y, BLOCK, BLOCK);
            ctx.fillStyle = '#d9b07a';
            ctx.fillRect(x + BLOCK / 2 - 4, y, 8, BLOCK);
            ctx.strokeStyle = '#8a6438';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, BLOCK - 2, BLOCK - 2);
          }
        }
      }
    }

    // ゴミ捨て場
    const fullNow = boxFull();
    for (const d of G.dumps) {
      if (!inView(d.x, d.y, 60)) continue;
      if (fullNow) {
        // 満タンのときは、ゴミ捨て場を光らせて目立たせる
        ctx.strokeStyle = `rgba(79,224,182,${0.5 + Math.sin(tm * 6) * 0.35})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 46 + Math.sin(tm * 6) * 5, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(79,224,182,0.18)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 36, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(79,224,182,0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#2e7d5b';
      ctx.beginPath();
      ctx.roundRect(d.x - 12, d.y - 14, 24, 26, 3);
      ctx.fill();
      ctx.fillStyle = '#3fa877';
      ctx.fillRect(d.x - 15, d.y - 18, 30, 6);
      ctx.fillStyle = '#fff';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('dumpLabel'), d.x, d.y + 4);
      if (d.t > 0) {
        ctx.strokeStyle = '#ffcf4a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 30, -Math.PI / 2, -Math.PI / 2 + d.t * TAU);
        ctx.stroke();
      }
    }

    // 胞子の雲
    for (const c of G.clouds) {
      if (!inView(c.x, c.y, c.r)) continue;
      const a = Math.min(1, c.life / 0.5, (c.max - c.life) / 0.3 + 0.2);
      ctx.fillStyle = `rgba(120,170,70,${0.28 * a})`;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const ang = (k / 5) * TAU + c.life;
        const cx = c.x + Math.cos(ang) * c.r * 0.35;
        const cy = c.y + Math.sin(ang) * c.r * 0.35;
        ctx.moveTo(cx + c.r * 0.6, cy);
        ctx.arc(cx, cy, c.r * 0.6, 0, TAU);
      }
      ctx.fill();
    }

    // ミストと渦
    for (const zn of G.zones) {
      if (zn.delay > 0 || !inView(zn.x, zn.y, zn.r)) continue;
      const a = Math.min(1, zn.life / 0.4, (zn.max - zn.life) / 0.15);
      if (zn.kind === 'vortex') {
        const g = ctx.createRadialGradient(zn.x, zn.y, 2, zn.x, zn.y, zn.r);
        g.addColorStop(0, `rgba(10,0,25,${0.95 * a})`);
        g.addColorStop(0.35, `rgba(70,20,130,${0.6 * a})`);
        g.addColorStop(1, 'rgba(120,60,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(zn.x, zn.y, zn.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(190,140,255,${0.7 * a})`;
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(zn.x, zn.y, zn.r * (0.3 + k * 0.22), tm * 6 + k * 2, tm * 6 + k * 2 + 2.2);
          ctx.stroke();
        }
      } else if (zn.kind === 'foam') {
        // 泡: 白とピンクの泡がふくらんだりしぼんだりする
        ctx.fillStyle = `rgba(255,225,245,${0.28 * a})`;
        ctx.beginPath();
        ctx.arc(zn.x, zn.y, zn.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(160,50,120,${0.45 * a})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,200,235,${0.75 * a})`;
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 9; k++) {
          const ang = k * 2.4;
          const rr = zn.r * (0.15 + ((k * 0.37) % 0.75));
          const br = 4 + ((k * 3) % 5) + Math.sin(tm * 4 + k) * 1.5;
          ctx.beginPath();
          ctx.arc(zn.x + Math.cos(ang) * rr, zn.y + Math.sin(ang) * rr, br, 0, TAU);
          ctx.stroke();
        }
      } else {
        const acid = zn.kind === 'acid';
        ctx.fillStyle = acid ? `rgba(150,235,60,${0.32 * a})` : `rgba(70,215,180,${0.32 * a})`;
        ctx.beginPath();
        ctx.arc(zn.x, zn.y, zn.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = acid ? `rgba(60,110,10,${0.6 * a})` : `rgba(10,100,80,${0.6 * a})`;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = acid ? `rgba(220,255,160,${0.8 * a})` : `rgba(190,255,240,${0.8 * a})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const ang = k * 1.7 + tm * 1.5;
          const rr = zn.r * (0.3 + ((k * 0.23 + tm * 0.4) % 0.6));
          ctx.beginPath();
          ctx.arc(zn.x + Math.cos(ang) * rr, zn.y + Math.sin(ang) * rr, 2.5, 0, TAU);
          ctx.stroke();
        }
        if (acid && zn.max - zn.life < 0.25) {
          ctx.strokeStyle = 'rgba(210,255,160,0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(zn.x, zn.y - 160 * (1 - (zn.max - zn.life) / 0.25));
          ctx.lineTo(zn.x, zn.y);
          ctx.stroke();
        }
      }
    }

    // コロコロ
    for (const w of G.weapons) {
      if (w.id !== 'roller' || !w.rollers) continue;
      for (const r of w.rollers) {
        if (!r) continue;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.a + Math.PI / 2);
        const hw = w.s.width / 2;
        ctx.fillStyle = w.evo ? '#ffcf4a' : '#f4f1e6';
        ctx.beginPath();
        ctx.roundRect(-hw, -8, hw * 2, 16, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,50,60,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 1;
        const off = (p.anim * 40) % 8;
        for (let x = -hw + off; x < hw; x += 8) {
          ctx.beginPath();
          ctx.moveTo(x, -7);
          ctx.lineTo(x, 7);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ダスト
    // 汚れた床の上でも見えるように、大きめにして白いふちと光をつける。満タンのあいだは拾えないので暗くする
    const gemFull = boxFull();
    const GEM_COL = ['#7fd4ff', '#6dff8e', '#ffd24a'];
    for (const g of G.gems) {
      if (!inView(g.x, g.y, 14)) continue;
      const r = g.size === 0 ? 5 : g.size === 1 ? 6.5 : 9;
      const bob = Math.sin(g.t * 5 + g.x * 0.05) * 1.5;
      const y = g.y + bob;
      const col = gemFull ? '#8a8f96' : GEM_COL[g.size];
      if (!gemFull) {
        ctx.fillStyle = g.size === 2 ? 'rgba(255,210,74,0.3)' : g.size === 1 ? 'rgba(109,255,142,0.25)' : 'rgba(127,212,255,0.22)';
        ctx.beginPath();
        ctx.arc(g.x, y, r * 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(g.x, y - r);
      ctx.lineTo(g.x + r * 0.75, y);
      ctx.lineTo(g.x, y + r);
      ctx.lineTo(g.x - r * 0.75, y);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = gemFull ? 'rgba(40,40,40,0.8)' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 左上の照り
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(g.x, y - r * 0.75);
      ctx.lineTo(g.x - r * 0.45, y - r * 0.05);
      ctx.lineTo(g.x - r * 0.1, y - r * 0.05);
      ctx.closePath();
      ctx.fill();
    }

    // アイテム
    for (const it of G.items) {
      if (!inView(it.x, it.y, 30)) continue;
      const s = 26;
      const bob = Math.sin(it.t * 4) * 3;
      const big = it.kind === 'treasure';
      if (it.kind === 'chest' || big) {
        ctx.fillStyle = `rgba(255,207,74,${0.25 + Math.sin(it.t * 6) * 0.1})`;
        ctx.beginPath();
        ctx.arc(it.x, it.y, big ? 34 : 24, 0, TAU);
        ctx.fill();
      }
      const sz = big ? 40 : s;
      ctx.drawImage(iconCanvas(it.kind), it.x - sz / 2, it.y - sz / 2 + bob, sz, sz);
    }

    // ゴミ
    for (const e of G.enemies) {
      if (!e.alive || !inView(e.x, e.y, e.r * 1.4)) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.flee) ctx.globalAlpha = Math.max(0, 1 - G.endT / 1.5);
      if (e.def.source && e.shield < 0.98) {
        // 汚れバリア: 強いほど濃く、ぶ厚く見せる
        const k = (1 - e.shield) / (1 - SHIELD_MIN);
        const g = ctx.createRadialGradient(0, 0, e.r * 0.6, 0, 0, e.r * (1.5 + k * 0.5));
        g.addColorStop(0, `rgba(70,50,30,${0.05 + k * 0.25})`);
        g.addColorStop(0.75, `rgba(90,62,34,${0.15 + k * 0.45})`);
        g.addColorStop(1, 'rgba(90,62,34,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * (1.5 + k * 0.5), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(150,110,60,${0.25 + k * 0.5})`;
        ctx.lineWidth = 1.5 + k * 3;
        ctx.beginPath();
        for (let a = 0; a <= TAU + 0.01; a += TAU / 24) {
          const rr = e.r * (1.3 + k * 0.35) + Math.sin(a * 5 + e.t * 3) * (2 + k * 3);
          if (a === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      if (e.def.source) {
        // 発生源は赤い点線の輪で目立たせる
        ctx.strokeStyle = `rgba(255,90,90,${0.55 + Math.sin(e.t * 5) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.35, e.t * 0.6, e.t * 0.6 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (e.elite || e.boss) {
        ctx.strokeStyle = e.boss ? 'rgba(255,90,90,0.7)' : 'rgba(255,207,74,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 1.15, 0, TAU);
        ctx.stroke();
      }
      // 攻撃が当たったら、少しふくらんで白く光る
      if (e.flash > 0) ctx.scale(1 + e.flash * 1.1, 1 + e.flash * 1.1);
      drawEnemyBody(ctx, e.type, e.r, e.t, 0, e.rot);
      if (e.flash > 0) {
        ctx.globalAlpha *= 0.85;
        drawEnemyBody(ctx, e.type, e.r, e.t, 1, e.rot);
      }
      ctx.restore();
      if ((e.elite || e.def.source || e.def.boss === 'mid') && e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, e.y - e.r * 1.3 - 6, e.r * 2, 4);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(e.x - e.r, e.y - e.r * 1.3 - 6, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
      }
      if (e.def.source && !e.flee) drawShieldBadge(e);
    }
    // 掃除機の吸引範囲
    for (const w of G.weapons) {
      if (w.id !== 'vacuum' || G.state !== 'play') continue;
      const s = w.s;
      const half = ((s.angle / 2) * Math.PI) / 180;
      const g = ctx.createRadialGradient(p.x, p.y, 8, p.x, p.y, s.range);
      g.addColorStop(0, w.evo ? 'rgba(160,100,255,0.45)' : 'rgba(110,190,255,0.45)');
      g.addColorStop(1, w.evo ? 'rgba(160,100,255,0.12)' : 'rgba(110,190,255,0.12)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, s.range, w.ang - half, w.ang + half);
      ctx.closePath();
      ctx.fill();
      // 範囲のふち (明るい床でも見えるように濃い色)
      ctx.strokeStyle = w.evo ? 'rgba(90,40,170,0.55)' : 'rgba(30,100,170,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 吸いこむ波 (外から主人公へ縮んでいく)
      const pulse = 1 - Math.max(0, w.t) / s.cd;
      const pr = s.range * (1 - pulse * 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr, w.ang - half, w.ang + half);
      ctx.strokeStyle = `rgba(20,70,130,${0.2 + pulse * 0.3})`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = `rgba(220,240,255,${0.35 + pulse * 0.45})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 空気清浄機のオーラ (攻撃した瞬間に少し明るくなる)
    for (const w of G.weapons) {
      if (w.id !== 'purifier' || G.state !== 'play') continue;
      const r = w.s.radius;
      const pulse = Math.max(0, w.pulse || 0) / 0.25;
      w.pulse = (w.pulse || 0) - 1 / 60;
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r);
      const col = w.evo ? '255,214,120' : '150,230,255';
      g.addColorStop(0, `rgba(${col},0)`);
      g.addColorStop(0.75, `rgba(${col},${0.14 + pulse * 0.2})`);
      g.addColorStop(1, `rgba(${col},${0.35 + pulse * 0.35})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      const dark = w.evo ? '150,95,10' : '20,90,130';
      ctx.strokeStyle = `rgba(${dark},${0.4 + pulse * 0.35})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${col},${0.6 + pulse * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, tm * 0.8, tm * 0.8 + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 主人公
    if (G.state !== 'dead' || G.timeUp || G.endT < 0.3) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.inv > 0 && Math.floor(tm * 20) % 2) ctx.globalAlpha = 0.6;
      // ハジメはスプライトなので歩く向きで描く (掃除機の向きは吸引範囲で見える)
      const vac = G.ch.id === 'cleaner' && !HAJIME.ready && G.weapons.find((w) => w.id === 'vacuum');
      drawPlayerBody(ctx, G.ch.id, vac ? vac.ang : p.face, p.anim, p.moving, p.hurtT > 0);
      if (p.allergyT > 0) {
        ctx.fillStyle = 'rgba(120,200,80,0.35)';
        ctx.beginPath();
        ctx.arc(0, -2, 16, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      // 体力のゲージ (キャラの足もと)。減るほど黄色 → 赤になり、少ないと点滅する
      const hr = clamp(p.hp / G.stats.maxHp, 0, 1);
      const gw = 40;
      const gx = p.x - gw / 2;
      const gy = p.y + 20;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(gx - 1.5, gy - 1.5, gw + 3, 8);
      ctx.fillStyle = hr < 0.3 && Math.floor(tm * 5) % 2 ? '#ffffff' : hr < 0.3 ? '#ff5a5a' : hr < 0.6 ? '#ffcf4a' : '#5fe08a';
      ctx.fillRect(gx, gy, gw * hr, 5);
      // 受けたダメージのぶん、少し遅れて減る白い部分
      p.hpShow = p.hpShow == null ? hr : Math.max(hr, p.hpShow - 0.012);
      if (p.hpShow > hr) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(gx + gw * hr, gy, gw * (p.hpShow - hr), 5);
      }
    }

    // ロボ
    for (const w of G.weapons) {
      if (w.id !== 'robot') continue;
      for (const b of w.bots) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(tm * 4);
        const r = w.s.size;
        ctx.fillStyle = '#3a4350';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = w.evo ? '#ffcf4a' : '#7fe8c7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * TAU;
          ctx.moveTo(r * 0.75 * Math.cos(a), r * 0.75 * Math.sin(a));
          ctx.lineTo(r * 1.15 * Math.cos(a + 0.4), r * 1.15 * Math.sin(a + 0.4));
        }
        ctx.stroke();
        ctx.fillStyle = w.evo ? '#ffcf4a' : '#7fe8c7';
        ctx.beginPath();
        ctx.arc(0, -r * 0.4, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // モップのなぎ払い
    for (const sw of G.swings) {
      const a = sw.life / sw.max;
      const prog = 1 - a;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (sw.half >= Math.PI) {
        ctx.arc(sw.x, sw.y, sw.r * 0.8, sw.a, sw.a + TAU * prog);
      } else {
        // 片側から反対側へ振り抜く
        const from = sw.a - sw.half * sw.side;
        const to = from + 2 * sw.half * sw.side * prog;
        ctx.arc(sw.x, sw.y, sw.r * 0.8, Math.min(from, to), Math.max(from, to));
      }
      ctx.strokeStyle = sw.evo ? `rgba(10,70,110,${0.45 * a})` : `rgba(30,45,70,${0.4 * a})`;
      ctx.lineWidth = 19;
      ctx.stroke();
      ctx.strokeStyle = sw.evo ? `rgba(120,230,255,${0.85 * a})` : `rgba(235,245,255,${0.8 * a})`;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
      ctx.stroke();
    }

    // はたき
    for (const b of G.booms) {
      if (!inView(b.x, b.y, 30)) continue;
      const sz = b.s.size;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin);
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-sz * 1.1, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      const cols = b.evo ? ['#ffcf4a', '#ff8ad8', '#7fc8ff'] : ['#ff9ab0', '#ffe08a', '#a8e6ff'];
      for (let k = 0; k < 7; k++) {
        const fa = (k / 7) * TAU;
        ctx.fillStyle = cols[k % 3];
        ctx.beginPath();
        ctx.ellipse(Math.cos(fa) * sz * 0.45, Math.sin(fa) * sz * 0.45, sz * 0.55, sz * 0.25, fa, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // 洗剤ボム (影と、弧を描くボトル)
    for (const b of G.bombs) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 4, 8, 4, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(b.x, b.y - b.h);
      ctx.rotate(b.t * 12);
      ctx.fillStyle = b.evo ? '#ff8ad8' : '#4fb6ff';
      ctx.beginPath();
      ctx.roundRect(-6, -8, 12, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -12, 6, 5);
      ctx.restore();
    }
    for (const bl of G.blasts) {
      const a = clamp(bl.life / bl.max, 0, 1);
      const r = Math.max(1, bl.r * (1.1 - a * 0.4));
      ctx.fillStyle = bl.press ? `rgba(200,150,70,${0.42 * a})` : bl.evo ? `rgba(255,170,230,${0.5 * a})` : `rgba(150,215,255,${0.5 * a})`;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = bl.press ? `rgba(90,55,15,${0.6 * a})` : bl.evo ? `rgba(140,30,100,${0.55 * a})` : `rgba(20,80,140,${0.55 * a})`;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // スポンジ
    for (const b of G.sponges) {
      if (!inView(b.x, b.y, 30)) continue;
      const sz = b.s.size;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.min(1, b.life / 0.3);
      ctx.fillStyle = b.evo ? '#ffcf4a' : '#f6f3ea';
      ctx.beginPath();
      ctx.roundRect(-sz, -sz * 0.7, sz * 2, sz * 1.4, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,50,60,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = b.evo ? '#ff8a5c' : '#6fd3a8';
      ctx.fillRect(-sz, sz * 0.15, sz * 2, sz * 0.55);
      ctx.restore();
    }

    // 水流
    for (const b of G.beams) {
      const a = b.life / b.max;
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.steam ? `rgba(255,160,90,${0.55 * a})` : `rgba(80,180,255,${0.55 * a})`;
      ctx.lineWidth = b.w * (0.8 + (1 - a) * 0.6);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.lineWidth = b.w * 0.35;
      ctx.stroke();
    }

    // 胞子弾
    for (const b of G.bullets) {
      if (!inView(b.x, b.y, 10)) continue;
      ctx.fillStyle = '#7bc043';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2f5e2a';
      ctx.beginPath();
      ctx.arc(b.x - 2, b.y - 2, b.r * 0.35, 0, TAU);
      ctx.fill();
    }

    // 粒
    for (const q of G.parts) {
      const a = q.life / q.max;
      if (q.kind === 'text') {
        ctx.globalAlpha = a;
        ctx.font = '800 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = q.color;
        ctx.fillText(q.text, q.x, q.y);
        ctx.globalAlpha = 1;
        continue;
      }
      if (!inView(q.x, q.y, 20)) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      if (q.kind === 'flash') {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
        ctx.fillRect(q.x - 8, q.y - 8, 16, 16);
      } else if (q.kind === 'hit') {
        // 衝撃のマーク: 8本のとげの星が、ぱっと広がって消える
        const sz = q.size * (0.7 + (1 - a) * 0.6);
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const rr = k % 2 ? sz * 0.38 : sz;
          const ang = q.rot + (k / 16) * TAU;
          ctx.lineTo(q.x + Math.cos(ang) * rr, q.y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(40,30,20,0.75)';
        ctx.stroke();
        ctx.fillStyle = '#fffbe6';
        ctx.fill();
      } else if (q.kind === 'twinkle') {
        const s = q.size * Math.sin(a * Math.PI);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y - s * 2);
        ctx.lineTo(q.x + s * 0.4, q.y - s * 0.4);
        ctx.lineTo(q.x + s * 2, q.y);
        ctx.lineTo(q.x + s * 0.4, q.y + s * 0.4);
        ctx.lineTo(q.x, q.y + s * 2);
        ctx.lineTo(q.x - s * 0.4, q.y + s * 0.4);
        ctx.lineTo(q.x - s * 2, q.y);
        ctx.lineTo(q.x - s * 0.4, q.y - s * 0.4);
        ctx.closePath();
        ctx.fill();
      } else if (q.kind === 'streak') {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
        ctx.stroke();
      } else if (q.kind === 'cube') {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot + (1 - a) * 6);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // チュートリアルの矢印 (画面の中なら上で跳ねる矢印、外なら画面の端の矢印)
    let tutTarget = null;
    if (G.tutorial && G.state === 'play') {
      const step = TUT_STEPS[G.tutorial.step];
      tutTarget = step && step.target ? step.target(G) : null;
      if (tutTarget && inView(tutTarget.x, tutTarget.y, -30)) {
        const bob = Math.sin(tm * 6) * 6;
        // 発生源はバリアの表示の上に出す
        const ty = tutTarget.y - (tutTarget.r ? tutTarget.r * 1.3 + 54 : 46) + bob;
        ctx.fillStyle = '#4fe0b6';
        ctx.strokeStyle = '#0d3b2e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tutTarget.x, ty + 22);
        ctx.lineTo(tutTarget.x - 14, ty + 4);
        ctx.lineTo(tutTarget.x - 6, ty + 4);
        ctx.lineTo(tutTarget.x - 6, ty - 12);
        ctx.lineTo(tutTarget.x + 6, ty - 12);
        ctx.lineTo(tutTarget.x + 6, ty + 4);
        ctx.lineTo(tutTarget.x + 14, ty + 4);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.strokeStyle = `rgba(79,224,182,${0.5 + Math.sin(tm * 6) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tutTarget.x, tutTarget.y, 40 + Math.sin(tm * 4) * 4, 0, TAU);
        ctx.stroke();
        tutTarget = null;
      }
    }

    // ここから画面の座標
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (save.settings.haze && G.haze > 0.02) drawHaze(tm, (p.x - cam.x) * view.zoom + view.w / 2, (p.y - cam.y) * view.zoom + view.h / 2);
    if (G.flash > 0 && save.settings.shake) {
      ctx.fillStyle = `rgba(255,255,255,${G.flash * 1.6})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (p.allergyT > 0) {
      ctx.fillStyle = 'rgba(90,160,60,0.12)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (tutTarget) offscreenArrow(tutTarget.x, tutTarget.y, '#4fe0b6');
    // 満タンのときは、いちばん近いゴミ捨て場を矢印で指す
    if (boxFull() && G.state === 'play') {
      const d = nearestOf(G.dumps);
      if (d && !inView(d.x, d.y, -20)) offscreenArrow(d.x, d.y, '#4fe0b6');
    }
    // 画面の外の大物を矢印で知らせる
    for (const e of G.bosses) {
      if (!e.alive || inView(e.x, e.y, 0)) continue;
      offscreenArrow(e.x, e.y, e.boss ? '#ff6b6b' : '#ffcf4a');
    }
    for (const it of G.items) {
      if ((it.kind === 'chest' || it.kind === 'treasure') && !inView(it.x, it.y, 0)) offscreenArrow(it.x, it.y, '#ffcf4a');
    }
    drawHud(tm);
  }

  // ---- 汚れの靄 ----
  // 茶色がかったもやの模様 (つなぎ目が目立たないように、はみ出した分を反対側にも描く)
  let hazeTex = null;
  function hazeTexture() {
    if (hazeTex) return hazeTex;
    const S = 256;
    hazeTex = document.createElement('canvas');
    hazeTex.width = hazeTex.height = S;
    const c = hazeTex.getContext('2d');
    for (let i = 0; i < 70; i++) {
      const x = rand(0, S);
      const y = rand(0, S);
      const r = rand(18, 70);
      const a = rand(0.08, 0.22);
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, `rgba(150,128,96,${a})`);
          g.addColorStop(1, 'rgba(150,128,96,0)');
          c.fillStyle = g;
          c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
    return hazeTex;
  }

  // 靄は小さなキャンバスに描いてから引き伸ばす (軽くするため)。主人公のまわりは少し薄くして、足元が見えるようにする
  const hazeCv = document.createElement('canvas');
  const hazeCtx = hazeCv.getContext('2d');
  function drawHaze(tm, px, py) {
    const k = 4;
    const w = Math.ceil(view.w / k);
    const h = Math.ceil(view.h / k);
    if (hazeCv.width !== w || hazeCv.height !== h) {
      hazeCv.width = w;
      hazeCv.height = h;
    }
    const c = hazeCtx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(120,102,78,0.55)';
    c.fillRect(0, 0, w, h);
    // ゆっくり流れる2枚のもや (カメラに少しついてくる)
    const pat = c.createPattern(hazeTexture(), 'repeat');
    c.fillStyle = pat;
    for (const [sp, sc, al] of [[6, 0.5, 1], [-4, 0.75, 0.8]]) {
      const ox = (tm * sp - G.cam.x * 0.15) * sc;
      const oy = (tm * sp * 0.4 - G.cam.y * 0.15) * sc;
      c.save();
      c.globalAlpha = al;
      c.scale(sc, sc);
      c.translate(ox % 256, oy % 256);
      c.fillRect(-256, -256, w / sc + 512, h / sc + 512);
      c.restore();
    }
    c.globalCompositeOperation = 'destination-out';
    const rr = Math.min(w, h) * 0.55;
    const g = c.createRadialGradient(px / k, py / k, 0, px / k, py / k, rr);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = Math.min(1, G.haze) * 0.5;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hazeCv, 0, 0, view.w, view.h);
    ctx.restore();
  }

  // 発生源の上に、汚れバリアの強さ (5段階) と、いま通るダメージの割合を出す
  const SHIELD_COLORS = ['#4fe0b6', '#a6e05a', '#ffd84a', '#ffa23a', '#ff5a4a'];
  const shieldLevel = (e) => Math.ceil(((1 - e.shield) / (1 - SHIELD_MIN)) * 5 - 0.05);
  function drawShieldBadge(e) {
    const lvl = clamp(shieldLevel(e), 0, 5);
    const col = lvl ? SHIELD_COLORS[lvl - 1] : '#4fe0b6';
    const label = lvl ? t('shieldDmg', Math.round(e.shield * 100)) : t('shieldNone');
    ctx.font = '800 10px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const segW = 7;
    const w = 18 + segW * 5 + 4 + tw + 8;
    const h = 16;
    const x = e.x - w / 2;
    const y = e.y - e.r * 1.3 - 26;
    ctx.fillStyle = 'rgba(20,16,12,0.78)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    // 盾のマーク
    const sx = x + 9;
    const sy = y + 3;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy);
    ctx.lineTo(sx + 5, sy);
    ctx.lineTo(sx + 5, sy + 5);
    ctx.quadraticCurveTo(sx + 4, sy + 9, sx, sy + 11);
    ctx.quadraticCurveTo(sx - 4, sy + 9, sx - 5, sy + 5);
    ctx.closePath();
    ctx.fill();
    // 5段階のゲージ。段階が上がるほど赤くなる
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k < lvl ? SHIELD_COLORS[k] : 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 17 + k * segW, y + 4 + (4 - k) * 1.2, segW - 2, 8 - (4 - k) * 1.2);
    }
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 18 + segW * 5 + 4, y + h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  function offscreenArrow(wx, wy, color) {
    const sx = view.w / 2 + (wx - G.cam.x) * view.zoom;
    const sy = view.h / 2 + (wy - G.cam.y) * view.zoom;
    const cx = view.w / 2;
    const cy = view.h / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const m = 26;
    const tx = (Math.cos(a) > 0 ? view.w - m - cx : m - cx) / (Math.cos(a) || 1e-6);
    const ty = (Math.sin(a) > 0 ? view.h - 70 - cy : 52 - cy) / (Math.sin(a) || 1e-6);
    const k = Math.min(Math.abs(tx), Math.abs(ty));
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function hudText(str, x, y, size, align = 'left', color = '#fff') {
    ctx.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function bar(x, y, w, h, ratio, color, bg = 'rgba(0,0,0,0.5)') {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(h, w * clamp(ratio, 0, 1)), h, h / 2);
      ctx.fill();
    }
  }

  // ミニマップ: 部屋の汚れ具合 (茶 → 緑)・発生源 (赤)・ゴミ捨て場 (緑)・宝箱 (金)・自分 (白)
  const MAP_WALL = [38, 44, 54];
  const MAP_BOX = [120, 92, 60];
  function refreshMinimap() {
    const data = G.mapImg.data;
    for (let c = 0; c < BN * BN; c++) {
      const k = G.blocked[c];
      let col;
      if (k === 1) col = MAP_WALL;
      else if (k === 2) col = MAP_BOX;
      else if (k === 3) col = [20, 24, 30];
      else {
        const r = G.rooms[G.roomGrid[c]];
        const f = r.done ? 1 : (r.clean / r.total) * 0.75;
        col = r.done ? [79, 224, 182] : [lerp(110, 150, f), lerp(88, 170, f), lerp(66, 150, f)];
      }
      data[c * 4] = col[0];
      data[c * 4 + 1] = col[1];
      data[c * 4 + 2] = col[2];
      data[c * 4 + 3] = 235;
    }
    G.mapCtx.putImageData(G.mapImg, 0, 0);
  }

  function drawMinimap(t) {
    if (G.mapT <= 0) {
      G.mapT = 0.3;
      refreshMinimap();
    }
    G.mapT -= 1 / 60;
    const size = clamp(Math.min(view.w, view.h) * 0.22, 84, 140);
    const mx = 10;
    const my = 40;
    const k = size / ROOM;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mx - 3, my - 3, size + 6, size + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(G.mapCanvas, mx, my, size, size);
    ctx.imageSmoothingEnabled = true;
    // 見えている範囲
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + (G.cam.x - view.ww / 2) * k, my + (G.cam.y - view.wh / 2) * k, view.ww * k, view.wh * k);
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * k, my + y * k, r, 0, TAU);
      ctx.fill();
    };
    for (const d of G.dumps) dot(d.x, d.y, 2.5, '#3fd39a');
    const blink = Math.sin(t * 6) > 0;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (e.def.source) dot(e.x, e.y, 3, blink ? '#ff5a5a' : '#c23a3a');
      else if (e.boss) dot(e.x, e.y, 4, '#ff3b3b');
    }
    for (const it of G.items) if (it.kind === 'chest' || it.kind === 'treasure') dot(it.x, it.y, it.kind === 'treasure' ? 4 : 2.5, '#ffcf4a');
    dot(G.p.x, G.p.y, 3, '#ffffff');
  }

  // 宝物の条件の進み具合 (HUD に出す短い文。出すものがなければ空)
  function treasureHud() {
    const c = G.trCond;
    if (!c || G.trSpawned || G.tutorial) return '';
    const left = (lim) => (G.time <= lim ? t('hudTimeLeft', fmtTime(Math.ceil(lim - G.time))) : '');
    switch (c.type) {
      case 'kills': return `${L(ENEMIES[c.enemy], 'name')} ${Math.min(c.n, G.killsByType[c.enemy] || 0)}/${c.n}`;
      case 'dumps': return t('hudDumpCount', Math.min(c.n, G.dumpCount), c.n);
      case 'roomTime': {
        const s = left(c.t);
        return s && `${L(G.stage.rooms.find((r) => r.id === c.room), 'name')} ${s}`;
      }
      case 'srcTime': {
        const s = left(c.t);
        return s && `${t('srcCount', G.rooms.reduce((n, r) => n + r.src, 0))} ${s}`;
      }
      case 'clearTime': return left(c.t);
      case 'hpKeep': return G.minHp * 100 >= c.pct ? `HP ≥ ${c.pct}%` : '';
      case 'boss': return L(ENEMIES[c.boss], 'name');
      default: return '';
    }
  }

  function drawHud(tm) {
    const w = view.w;
    const h = view.h;
    const p = G.p;
    // 経験値
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#4fc3ff';
    ctx.fillRect(0, 0, w * (G.xp / G.xpNext), 8);
    hudText(`Lv ${G.level}`, 10, 30, 16);
    if (G.mode === 'hard') hudText('HARD', 62, 30, 12, 'left', '#ff6b6b');
    const left = GAME_TIME - G.time;
    hudText(fmtTime(Math.ceil(left)), w / 2, 34, 24, 'center', left <= 60 && Math.floor(tm * 2) % 2 ? '#ff6b6b' : left <= 60 ? '#ffb3b3' : '#ffffff');
    // 今いる部屋
    const here = G.rooms[G.curRoom];
    const doneN = G.rooms.filter((r) => r.done).length;
    if (here) {
      const pct = Math.min(100, (here.clean / here.total) * 100);
      const hereName = L(here, 'name');
      hudText(here.done ? t('hudDone', hereName) : `${hereName} ${Math.floor(pct)}%`, w - 10, 28, 15, 'right', here.done ? '#4fe0b6' : '#ffffff');
      if (!here.done) {
        ctx.font = '800 15px system-ui, -apple-system, "Hiragino Sans", sans-serif';
        const nameW = ctx.measureText(`${hereName} ${Math.floor(pct)}%`).width;
        hudText('★'.repeat(here.danger), w - 16 - nameW, 28, 12, 'right', DANGER_COLOR[here.danger]);
      }
      hudText(here.done ? t('hudRooms', doneN, G.rooms.length) : t('hudSrc', here.src, doneN, G.rooms.length), w - 10, 46, 12, 'right', here.src > 0 ? '#ffb3b3' : '#d9e2ec');
    }
    hudText(t('hudKills', G.kills), w - 10, 62, 11, 'right', '#c5d0dc');
    // 宝物の条件の進み具合 (まだ満たしていないとき)
    const trHud = treasureHud();
    if (trHud) hudText(t('hudTreasure', trHud), w - 10, 77, 11, 'right', '#ffcf4a');
    drawMinimap(tm);

    // ボスの体力
    const boss = G.bosses.find((e) => e.boss && e.alive);
    if (boss) {
      // ミニマップの右、右上の部屋の表示の下に出す
      const left = 10 + clamp(Math.min(view.w, view.h) * 0.22, 84, 140) + 14;
      const bw = Math.min(360, w - left - 12);
      const cx = (left + w - 12) / 2;
      const by = trHud ? 96 : 80; // 宝物の条件を出しているときは、その下に
      hudText(L(boss.def, 'name'), cx, by, 12, 'center', '#ffb3b3');
      bar(cx - bw / 2, by + 6, bw, 8, boss.hp / boss.maxHp, '#ff6b6b');
    }

    // 体力はキャラの足もとのゲージ、ダストボックスは左下のゴミ箱 (DOM) で見せる
    // ギアとパッシブ (左下のゴミ箱の右に並べる)
    let ix = 96;
    const isz = 22;
    const iy = h - 12 - isz;
    const drawSlot = (id, lv, evo) => {
      ctx.fillStyle = evo ? 'rgba(255,207,74,0.35)' : 'rgba(0,0,0,0.45)';
      ctx.fillRect(ix, iy, isz, isz);
      ctx.drawImage(iconCanvas(id), ix, iy, isz, isz);
      hudText(evo ? '★' : String(lv), ix + isz - 1, iy + isz, 9, 'right', evo ? '#ffcf4a' : '#fff');
      ix += isz + 3;
    };
    for (const wp of G.weapons) drawSlot(weaponIcon(wp), wp.lv, wp.evo);
    ix += 6;
    for (const id of Object.keys(G.passives)) drawSlot(id, G.passives[id], false);

    // スティック
    if (joy.id !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(joy.ox, joy.oy, 50, 0, TAU);
      ctx.stroke();
      const dx = joy.x - joy.ox;
      const dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      const k = d > 50 ? 50 / d : 1;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, TAU);
      ctx.fill();
    }

    // お知らせ
    if (G.banner) {
      const b = G.banner;
      const a = Math.min(1, b.t / 0.3, (b.max - b.t) / 0.15);
      ctx.globalAlpha = a;
      // 画面の幅に収まる大きさで出す
      let size = 30;
      ctx.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
      const tw = ctx.measureText(b.text).width;
      if (tw > w - 24) size = Math.max(12, Math.floor((size * (w - 24)) / tw));
      hudText(b.text, w / 2, h * 0.3, size, 'center', b.color);
      ctx.globalAlpha = 1;
    }

    drawRoomBanner();
    updateDustbox();
  }

  // 部屋に入ったときの、汚れレベルの表示 (画面の上のほうに帯で出す)
  function drawRoomBanner() {
    const rb = G.roomBanner;
    if (!rb) return;
    const r = rb.room;
    const w = view.w;
    const a = Math.min(1, rb.t / 0.35, (rb.max - rb.t) / 0.2);
    const y = Math.max(96, view.h * 0.17);
    const col = DANGER_COLOR[r.danger];
    ctx.save();
    ctx.globalAlpha = a;
    const bw = Math.min(w - 24, 420);
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.beginPath();
    ctx.roundRect(w / 2 - bw / 2, y - 30, bw, 70, 12);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    hudText(L(r, 'name'), w / 2, y - 6, 18, 'center', '#ffffff');
    const stars = '★'.repeat(r.danger) + '☆'.repeat(5 - r.danger);
    hudText(`${stars}  ${t('dangerWord' + r.danger)}`, w / 2, y + 20, 15, 'center', col);
    ctx.restore();
  }

  // 左下のゴミ箱: 中身の量を見せる。8割でオレンジ、満タンで赤く点滅する
  const dustFill = document.getElementById('dust-fill');
  const dustLabel = document.getElementById('dust-label');
  let dustShown = '';
  function updateDustbox() {
    const ratio = clamp(G.box / G.stats.boxCap, 0, 1);
    const full = boxFull();
    const near = !full && ratio >= 0.8;
    const label = full ? t('hudBoxFull') : `${Math.floor(G.box)}/${G.stats.boxCap}`;
    const key = `${Math.round(ratio * 100)}|${near}|${full}|${label}`;
    if (key === dustShown) return;
    dustShown = key;
    dustFill.style.height = `${(ratio * 100).toFixed(0)}%`;
    bombBtn.classList.toggle('near', near);
    bombBtn.classList.toggle('full', full);
    dustLabel.textContent = label;
    bombBtn.setAttribute('aria-label', t('hudBox', Math.floor(G.box), G.stats.boxCap));
  }

  // ===================================================================
  // ループ
  // ===================================================================
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - lastTime) / 1000);
    lastTime = now;
    if (G && !G.paused && overlay.hidden) update(dt);
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ===================================================================
  // 画面 (タイトル・メニュー・レベルアップなど)
  // ===================================================================
  const actions = {};
  // 画面を描き直しても、スクロールの位置をそのままにする (focusSel のボタンにフォーカスを戻す)
  function keepScroll(render, focusSel) {
    const top = overlay.scrollTop;
    render();
    overlay.scrollTop = top;
    const b = focusSel && overlay.querySelector(focusSel);
    if (b && !b.disabled) b.focus({ preventScroll: true });
  }
  // 広告を待つあいだは、画面のボタンを押せなくして「準備中」と出す
  function adBusy() {
    overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const b = overlay.querySelector('.ad-btn, [data-act="reviveAd"]');
    if (b) b.textContent = t('adLoading');
  }
  overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || overlay.classList.contains('locked')) return;
    Sound.init();
    Sound.play('click');
    actions[b.dataset.act](b.dataset.arg);
  });
  overlay.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.setting) {
      const k = el.dataset.setting;
      save.settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
      Sound.setVolume();
      persist();
    }
  });

  // fx: { kind: 'level' | 'chest' | 'evo', lock: 押せるようになるまでの ms }
  let unlockTimer = null;
  function show(name, html, solid = true, fx = null) {
    screen = name;
    clearTimeout(unlockTimer);
    overlay.classList.remove('celebrate', 'evo', 'locked');
    overlay.innerHTML = fx ? celebrationHtml(fx.kind) + html : html;
    overlay.hidden = false;
    overlay.classList.toggle('solid', solid);
    if (fx) {
      overlay.classList.add('celebrate', 'locked');
      if (fx.kind === 'evo') overlay.classList.add('evo');
      unlockTimer = setTimeout(() => overlay.classList.remove('locked'), fx.lock);
    }
    overlay.scrollTop = 0;
    const f = overlay.querySelector('[data-focus]') || overlay.querySelector('button:not(:disabled)');
    if (f) f.focus({ preventScroll: true });
    pauseBtn.style.visibility = 'hidden';
    bombBtn.hidden = true;
    if (tutorBox && !(G && G.tutorial)) tutorBox.hidden = true;
    // 言語はメニューでだけ切り替えられる (プレイ中の一時停止やレベルアップでは隠す)。
    // 埋めこみではゲームの画面に重ねて出すので、ほかの画面の見出しと重ならないようにタイトルだけで出す
    if (langBtn) langBtn.hidden = !!G || (EMBED && name !== 'title');
    joy.id = null;
    keys.clear();
  }

  // 後ろで回る光と紙吹雪
  function celebrationHtml(kind) {
    const colors = kind === 'evo' ? ['#b77bff', '#ffcf4a', '#4fe0b6', '#ff8ad8', '#7fc8ff'] : ['#ffcf4a', '#4fe0b6', '#7fc8ff', '#ff8a5c', '#ffffff'];
    const n = kind === 'level' ? 26 : 40;
    let bits = '';
    for (let i = 0; i < n; i++) {
      const st = [
        `--x:${rand(0, 100).toFixed(1)}%`,
        `--c:${pick(colors)}`,
        `--d:${rand(1.4, 2.6).toFixed(2)}s`,
        `--delay:${(rand(0, 0.5) + (kind === 'level' ? 0 : 0.7)).toFixed(2)}s`,
        `--r:${randInt(0, 360)}deg`,
        `--s:${rand(-260, 260).toFixed(0)}px`,
      ].join(';');
      bits += `<i class="confetti" style="${st}"></i>`;
    }
    return `<div class="fx" aria-hidden="true"><div class="rays"></div>${bits}</div>`;
  }

  function hide() {
    screen = 'play';
    clearTimeout(unlockTimer);
    overlay.classList.remove('celebrate', 'evo', 'locked');
    overlay.hidden = true;
    overlay.innerHTML = '';
    pauseBtn.style.visibility = 'visible';
    bombBtn.hidden = false;
    if (langBtn) langBtn.hidden = true;
    lastTime = performance.now();
  }

  // 言語を切り替えたときに、いま開いている画面を描き直すための関数
  let rerender = null;

  function completionHtml() {
    const c = completion();
    return `<div class="completion">
      <div class="completion-head"><span>${t('completion')}</span><b>${c.pct.toFixed(1)}%</b></div>
      <div class="completion-bar"><i style="width:${c.pct.toFixed(1)}%"></i></div>
      <div class="completion-meta">${t('completionMeta', c.clears, c.clearTotal, c.tre, c.treTotal)}</div>
    </div>`;
  }

  function showTitle() {
    G = null;
    rerender = showTitle;
    Sound.bgm('menu');
    show('title', `
      <div class="panel bare">
        <p class="logo${LATIN.includes(lang) ? ' en' : ''}"><small>${t('logoSmall')}</small>${t('logo')}</p>
        <p class="tagline">${t('tagline')}</p>
        <div class="title-cast"><img src="${charThumb('cleaner')}" alt="">${['dust', 'paper', 'can', 'grease', 'spore', 'bag'].map((k) => `<img src="${enemyThumb(k)}" alt="">`).join('')}</div>
        ${completionHtml()}
        <div class="actions">
          <button type="button" class="btn primary" data-act="play" data-focus>${t('play')}</button>
          <button type="button" class="btn${save.tutorialDone ? '' : ' tut-btn'}" data-act="start" data-arg="${TUT}">${t('tutorial')}</button>
          ${shopBtn('title')}
          <button type="button" class="btn trophy" data-act="chars" data-arg="title"><span aria-hidden="true">🏆</span> ${t('achievements')}</button>
          <button type="button" class="btn" data-act="help" data-arg="title"><span aria-hidden="true">📖</span> ${t('howToPlay')}</button>
          <button type="button" class="btn" data-act="settings" data-arg="title">${t('settings')}</button>
        </div>
      </div>`);
  }

  // 画面の上の見出し。左に「‹ 戻る」(Esc でも戻る)、右は見出しを真ん中に置くための空き
  const panelHead = (title, act, arg = '', focus = false) => `<div class="panel-head">
      <button type="button" class="back-btn" data-act="${act}"${arg ? ` data-arg="${arg}"` : ''} data-back${focus ? ' data-focus' : ''}>‹ ${t('back')}</button>
      <h2>${title}</h2>
      <span class="back-btn ghost" aria-hidden="true">‹ ${t('back')}</span>
    </div>`;

  const curChar = () => CHARS.find((c) => c.id === save.char && charUnlocked(c)) || CHARS[0];
  const modeTabs = (act) => `<div class="mode-tabs" role="tablist">${Object.keys(MODES).map((m) => `<button type="button" role="tab" class="mode-tab ${m}${save.mode === m ? ' on' : ''}" aria-selected="${save.mode === m}" data-act="${act}" data-arg="${m}">${L(MODES[m], 'name')}</button>`).join('')}</div>`;

  function showRooms() {
    G = null;
    rerender = showRooms;
    Sound.bgm('menu');
    const ch = curChar();
    const hard = save.mode === 'hard';
    const rooms = STAGES.map((r, i) => {
      const ok = stageUnlocked(i) && (!hard || hardUnlocked(i));
      const rec = peekRec(ch.id, i, save.mode);
      const nOk = peekRec(ch.id, i, 'normal').c;
      const hOk = peekRec(ch.id, i, 'hard').c;
      let meta;
      if (!stageUnlocked(i)) meta = t('lockedPrev');
      else if (hard && !hardUnlocked(i)) meta = t('lockedHard');
      else if (rec.r) meta = t('bestRooms', rec.r, r.rooms.length) + (rec.t ? `${t('sep')}${t('bestClear', fmtTime(rec.t))}` : '');
      else meta = `${t('roomCount', r.rooms.length)}${t('sep')}${L(r, 'desc')}`;
      const open = stageUnlocked(i);
      // クリア (ノーマル・ハード) と、宝箱 (ノーマル・ハードの宝物を見つけたか) を並べて見せる
      const modeName = (m) => L(MODES[m], 'name');
      const clearChip = (m, on) => `<span class="st-chip ${m}${on ? ' on' : ''}" title="${esc(modeName(m))}">${m === 'normal' ? 'N' : 'H'}${on ? ' ✓' : ''}</span>`;
      const chest = (m) => {
        const got = hasTreasure(i, m);
        return `<span class="st-chest ${m}${got ? ' got' : ''}" title="${esc(`${t('treasure')} (${modeName(m)})`)}"><img src="${iconURL('chest')}" alt=""><b>${m === 'normal' ? 'N' : 'H'}</b></span>`;
      };
      const status = open ? `<span class="st-row">${clearChip('normal', nOk)}${clearChip('hard', hOk)}<span class="st-gap"></span>${chest('normal')}${chest('hard')}</span>` : '';
      return `<button type="button" class="room stage-card${rec.c ? ' cleared' : ''}${open ? '' : ' locked'}" data-act="brief" data-arg="${i}" ${ok ? '' : 'disabled'} style="--art: url(${stageArtURL(i)})">
        <span class="room-no">${open ? i + 1 : '🔒'}</span>
        <span class="room-body"><span class="room-name">${open ? esc(L(r, 'name')) : '？？？'}</span><br><span class="room-meta">${esc(meta)}</span>${status}</span>
      </button>`;
    }).join('');
    show('rooms', `
      <div class="panel">
        ${panelHead(t('stageSelect'), 'charSelect')}
        <p class="sub">${esc(t('recordOf', L(ch, 'name')))}${t('sep')}${t('coins')} <span class="coins">${save.coins}</span></p>
        ${modeTabs('mode')}
        ${hard ? `<p class="mode-note">${t('hardNote')}</p>` : ''}
        <div class="rooms">
          <button type="button" class="room tutorial${save.tutorialDone ? ' cleared' : ''}" data-act="start" data-arg="${TUT}">
            <span class="room-no">?</span>
            <span class="room-body"><span class="room-name">${t('tutorial')}</span>${save.tutorialDone ? '' : `<span class="badge rec">${t('recommended')}</span>`}<br><span class="room-meta">${esc(t('tutorialMeta'))}</span></span>
          </button>
          ${rooms}
        </div>
        <div class="menu-row">
          ${shopBtn('rooms', true)}
          <button type="button" class="btn small" data-act="chars" data-arg="rooms"><span aria-hidden="true">🏆</span> ${t('achievements')}</button>
          <button type="button" class="btn small" data-act="zukan">${t('zukan')}</button>
          <button type="button" class="btn small" data-act="settings" data-arg="rooms">${t('settings')}</button>
        </div>
      </div>`);
  }

  const unlockText = (c) => t('unlockText', c.unlock + 1, L(STAGES[c.unlock], 'name'));
  const traitText = (c) => t('trait', L(c, 'trait'), L(c, 'traitDesc'));

  // 得意なビルド: 最初のギア + 進化に使うパッシブ → 進化後
  const favBuild = (c) => c.weapons.map((w) => `${L(WEAPONS[w], 'name')} + ${L(PASSIVES[WEAPONS[w].passive], 'name')} → ${L(EVOS[WEAPONS[w].evo], 'name')}`).join(' / ');
  const charClears = (c) => {
    let n = 0;
    for (let i = 0; i < STAGES.length; i++) for (const m of Object.keys(MODES)) if (peekRec(c.id, i, m).c) n++;
    return n;
  };

  function charCard(c, act, on) {
    const ok = charUnlocked(c);
    const power = `<span class="char-power p${c.power}" title="${esc(t('charPower', ''))}">${esc(t('charPower', '★'.repeat(c.power) + '☆'.repeat(5 - c.power)))}</span>`;
    return `<button type="button" class="char${on ? ' on' : ''}" data-act="${act}" data-arg="${c.id}" ${ok || act === 'charRec' ? '' : 'disabled'}>
      <img src="${charThumb(c.id, !ok)}" alt="">
      <span class="char-name">${ok ? esc(L(c, 'name')) : '？？？'}</span> ${power}${act === 'charRec' ? ` <span class="char-clears">${esc(t('clears', charClears(c), STAGES.length * Object.keys(MODES).length))}</span>` : ''}<br>
      ${ok ? `<span class="char-trait">${esc(traitText(c))}</span><br><span class="char-fav">${esc(t('charFav', favBuild(c), Math.round(((c.fav || FAV_MUL) - 1) * 100)))}</span><br><span class="char-desc">${esc(L(c, 'desc'))} ${esc(t('charStats', c.hp, c.weapons.map((w) => L(WEAPONS[w], 'name')).join(t('sep'))))}</span>`
        : `<span class="char-desc">${esc(unlockText(c))}</span>`}
    </button>`;
  }

  let briefRoom = 0;
  function showBrief(i) {
    briefRoom = Number(i);
    rerender = () => showBrief(briefRoom);
    if (save.mode === 'hard' && !hardUnlocked(briefRoom)) save.mode = 'normal';
    const r = STAGES[briefRoom];
    const ch = curChar();
    const rec = peekRec(ch.id, briefRoom, save.mode);
    const roomList = [...r.rooms].sort((a, c) => a.danger - c.danger).map((rm) => `<li><b>${esc(L(rm, 'name'))}</b><span class="danger d${rm.danger}">${stars(rm.danger)}</span><span>${t('srcCount', rm.src.length)}</span><span class="bonus">${esc(bonusText(rm.bonus))}</span></li>`).join('');
    const found = hasTreasure(briefRoom, save.mode);
    const tr = treasureOf(briefRoom, save.mode);
    const unlocks = save.mode === 'normal' ? CHARS.find((c) => c.unlock === briefRoom) : null;
    const modeName = L(MODES[save.mode], 'name');
    show('brief', `
      <div class="panel wide">
        ${panelHead(esc(t('stageTitle', briefRoom + 1, L(r, 'name'))), 'rooms')}
        <p class="sub">${esc(L(r, 'desc'))}</p>
        ${hardUnlocked(briefRoom) ? modeTabs('briefMode') : ''}
        <div class="plan">
          <img class="plan-img" src="${planImage(briefRoom)}" alt="${t('planAlt')}">
          <div class="plan-side">
            <p class="brief-desc">${t('briefDesc')}</p>
            <ul class="room-list">${roomList}</ul>
          </div>
        </div>
        <div class="treasure-line${found ? ' found' : ''}">
          <img src="${iconURL('treasure')}" alt="">
          <span>${found ? esc(t('treasureFoundLine', L(tr, 'name'))) : esc(t('treasureHint', condText(briefRoom, save.mode)))}${unlocks ? `<br><small>${found ? esc(t('joined', L(unlocks, 'name'))) : t('willJoin')}</small>` : ''}${tr.perk ? `<br><small>${esc(found ? t('perkGot', perkName(tr.perk)) : t('perkTeaser', perkName(tr.perk)))}</small>` : ''}</span>
        </div>
        <p class="brief-note">${esc(t('slotNote', MAX_GEARS, MAX_PASSIVES))}</p>
        <p class="brief-note">${esc(t('bossNote', L(ENEMIES.yokai, 'name'), L(ENEMIES[r.boss], 'name')))}</p>
        <div class="records"><span>${esc(L(ch, 'name'))}${t('sep')}${modeName}</span><span>${t('bestRooms', `<b>${rec.r}`, `${r.rooms.length}</b>`)}</span>${rec.t ? `<span>${t('bestClear', `<b>${fmtTime(rec.t)}</b>`)}</span>` : ''}${rec.c ? `<span><b>${t('cleared')}</b></span>` : ''}</div>
        <div class="actions sticky">
          <button type="button" class="btn primary" data-act="start" data-focus>${t('deploy', modeName)}</button>
          <button type="button" class="btn" data-act="charSelect">${t('changeChar')}</button>
        </div>
      </div>`);
  }

  // ---- キャラ選択 (はじめる → キャラ選択 → ステージ選択) ----
  let selCharId = null;
  function showCharSelect() {
    G = null;
    rerender = showCharSelect;
    Sound.bgm('menu');
    if (!selCharId) selCharId = curChar().id;
    const c = CHARS.find((q) => q.id === selCharId) || CHARS[0];
    const ok = charUnlocked(c);
    const icons = CHARS.map((q) => {
      const has = charUnlocked(q);
      return `<button type="button" class="pick${q.id === c.id ? ' on' : ''}${has ? '' : ' locked'}" data-act="selChar" data-arg="${q.id}" aria-pressed="${q.id === c.id}" aria-label="${esc(has ? L(q, 'name') : '？？？')}"${q.id === c.id ? ' data-focus' : ''}>
        <img src="${charThumb(q.id, !has)}" alt=""><span class="pick-stars p${q.power}">${'★'.repeat(q.power)}</span>
      </button>`;
    }).join('');
    const total = STAGES.length * Object.keys(MODES).length;
    const detail = ok
      ? `<div class="pick-head"><img src="${charThumb(c.id)}" alt=""><div><h3>${esc(L(c, 'name'))}</h3>
          <span class="char-power p${c.power}">${esc(t('charPower', '★'.repeat(c.power) + '☆'.repeat(5 - c.power)))}</span> <span class="char-clears">${esc(t('clears', charClears(c), total))}</span></div></div>
        <p class="char-trait">${esc(traitText(c))}</p>
        <p class="char-fav">${esc(t('charFav', favBuild(c), Math.round(((c.fav || FAV_MUL) - 1) * 100)))}</p>
        <p class="char-desc">${esc(L(c, 'desc'))}</p>
        <p class="char-desc">${esc(t('charStats', c.hp, c.weapons.map((w) => L(WEAPONS[w], 'name')).join(t('sep'))))}</p>`
      : `<div class="pick-head"><img src="${charThumb(c.id, true)}" alt=""><div><h3>？？？</h3>
          <span class="char-power p${c.power}">${esc(t('charPower', '★'.repeat(c.power) + '☆'.repeat(5 - c.power)))}</span></div></div>
        <p class="char-desc">${esc(unlockText(c))}</p>`;
    show('charselect', `
      <div class="panel charsel">
        ${panelHead(t('charSelect'), 'title')}
        <div class="charsel-body"><div class="picks">${icons}</div>
        <div class="pick-detail${ok ? '' : ' locked'}">${detail}</div></div>
        <div class="actions sticky">
          <button type="button" class="btn primary" data-act="charGo" ${ok ? '' : 'disabled'}>${t('charGo')}</button>
        </div>
      </div>`);
  }

  // ---- 清掃員と記録 ----
  let charsBack = 'title';
  function showChars(from) {
    if (from) charsBack = from;
    rerender = () => showChars();
    const list = CHARS.map((c) => charCard(c, 'charRec', false)).join('');
    // 宝物は 20 個 (10 ステージ × ノーマル・ハード)。まだのものは名前を伏せて、見つけ方のヒントを出す
    const tre = STAGES.flatMap((st, i) => Object.keys(MODES).map((mode) => {
      const tr = treasureOf(i, mode);
      const got = hasTreasure(i, mode);
      const stageName = t('stageTitle', i + 1, stageSeen(i) ? L(st, 'name') : '？？？');
      const modeName = L(MODES[mode], 'name');
      const joins = mode === 'normal' ? CHARS.find((c) => c.unlock === i) : null;
      const extra = [];
      if (tr.perk) extra.push(got ? t('perkGot', perkName(tr.perk)) : t('perkTeaser', perkName(tr.perk)));
      if (joins) extra.push(got ? t('joined', L(joins, 'name')) : t('willJoin'));
      return `<li class="${got ? 'found' : ''}${tr.perk ? ' perk' : ''}"><img src="${iconURL('treasure')}" alt=""><span><b>${got ? esc(L(tr, 'name')) : '？？？'}</b> <span class="mode-chip ${mode}">${esc(modeName)}</span><br>${got ? `<small>${esc(stageName)}</small><br><small>${esc(L(tr, 'desc'))}</small>` : `<small class="clue">${esc(t('treasureClue', stageName, modeName, condText(i, mode)))}</small>`}${extra.map((x) => `<br><small class="tre-extra">${esc(x)}</small>`).join('')}</span></li>`;
    })).join('');
    show('chars', `
      <div class="panel wide">
        ${panelHead(t('achievements'), charsBack, '', true)}
        ${completionHtml()}
        <h3>${t('achClears')}</h3>
        <p class="sub left">${t('charsSub')}</p>
        <div class="chars">${list}</div>
        <h3>${t('treasures', treasureCount(), STAGES.length * Object.keys(MODES).length)}</h3>
        <ul class="treasure-list">${tre}</ul>
      </div>`);
  }

  function showCharRec(id) {
    rerender = () => showCharRec(id);
    const c = CHARS.find((q) => q.id === id);
    const ok = charUnlocked(c);
    const cell = (i, m) => {
      const r = peekRec(c.id, i, m);
      if (r.c) return `<td class="ok">✓ ${fmtTime(r.t)}</td>`;
      if (r.r) return `<td class="part">${t('roomsCell', r.r, STAGES[i].rooms.length)}</td>`;
      return '<td class="none">—</td>';
    };
    const rows = STAGES.map((st, i) => `<tr><th>${i + 1}. ${stageSeen(i) ? esc(L(st, 'name')) : '？？？'}</th>${cell(i, 'normal')}${cell(i, 'hard')}</tr>`).join('');
    let n = 0;
    for (let i = 0; i < STAGES.length; i++) for (const m of Object.keys(MODES)) if (peekRec(c.id, i, m).c) n++;
    show('charRec', `
      <div class="panel wide">
        ${panelHead(t('achievements'), 'chars', '', true)}
        <div class="rec-head"><img src="${charThumb(c.id, !ok)}" alt=""><div><h2>${ok ? esc(L(c, 'name')) : '？？？'}</h2>
        <p class="sub">${esc(ok ? traitText(c) : unlockText(c))}</p></div></div>
        <p class="sub">${t('clears', n, STAGES.length * 2)}</p>
        <div class="rec-wrap"><table class="rec-table"><thead><tr><th>${t('stage')}</th><th>${L(MODES.normal, 'name')}</th><th>${L(MODES.hard, 'name')}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="actions">
          ${ok ? `<button type="button" class="btn primary" data-act="pickChar" data-arg="${c.id}">${t('useCleaner')}</button>` : ''}
        </div>
      </div>`);
  }

  // 出撃前に見せる間取り図
  const FLOOR_COLOR = { wood: '#d6b183', tatami: '#d3cf93', stone: '#aaa69e', kitchen: '#ddd6c6', bath: '#cfe3ea', concrete: '#b3aea5', carpet: '#9a3a4a', grass: '#7fae5a', attic: '#8f6f4c' };
  const planCache = {};
  function planImage(idx) {
    const key = `${idx}-${lang}`;
    if (planCache[key]) return planCache[key];
    const stage = STAGES[idx];
    const { roomGrid, blocked } = buildLayout(stage, idx);
    const S = 7; // 1マスの大きさ (px)
    const cv = document.createElement('canvas');
    cv.width = cv.height = BN * S;
    const c = cv.getContext('2d');
    for (let i = 0; i < BN * BN; i++) {
      const k = blocked[i];
      c.fillStyle = k === 1 ? '#3a3029' : k === 2 ? '#b98a52' : FLOOR_COLOR[stage.rooms[roomGrid[i]].floor];
      c.fillRect((i % BN) * S, Math.floor(i / BN) * S, S, S);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const SPOTS = [[0.3, 0.3], [0.7, 0.68], [0.7, 0.3], [0.3, 0.7], [0.5, 0.5]];
    for (const r of stage.rooms) {
      const [x, y, w, h] = r.rect;
      r.src.forEach((_, k) => {
        c.fillStyle = '#e03b3b';
        c.beginPath();
        c.arc((x + w * SPOTS[k][0]) * S, (y + h * SPOTS[k][1]) * S, 6, 0, TAU);
        c.fill();
      });
      // 部屋の幅に収まる大きさで名前を書く
      const name = L(r, 'name');
      let size = 15;
      c.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
      const tw = c.measureText(name).width;
      if (tw > w * S - 6) size = Math.max(9, Math.floor((size * (w * S - 6)) / tw));
      c.font = `800 ${size}px system-ui, -apple-system, "Hiragino Sans", sans-serif`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.strokeText(name, (x + w / 2) * S, (y + h / 2) * S);
      c.fillStyle = '#1f2933';
      c.fillText(name, (x + w / 2) * S, (y + h / 2) * S);
      if (r.id === stage.start) {
        c.fillStyle = '#2f6fb3';
        c.font = '800 11px system-ui, sans-serif';
        c.fillText(t('planStart'), (x + w / 2) * S, (y + h / 2) * S + 16);
      }
    }
    for (const [x, y] of dumpSpots(stage)) {
      c.fillStyle = '#2e9d6b';
      c.fillRect((x / BLOCK) * S - 6, (y / BLOCK) * S - 6, 12, 12);
    }
    planCache[key] = cv.toDataURL();
    return planCache[key];
  }

  // Google アナリティクスにイベントを送る。タグのないところ (CrazyGames 版など) では何もしない
  const track = (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  };

  // ---------- アクセス解析: ステージの開始・結末・リトライ (全ゲーム共通の形で GA4 に送る) ----------
  // stage_start / stage_end (result: clear・fail・quit) / stage_retry_fail・stage_retry_clear・stage_retry_quit
  // 終わったステージをそのまま遊び直したら、直前の結末に合わせたリトライとして送る
  const stageTrack = (() => {
    const GAME = 'cleaning_survivors';
    const attempts = {};
    let playing = null; // { stage, at } 遊んでいる途中のステージ
    let ended = null; // { stage, result } 直前に終わったステージ
    const send = (name, params) => track(name, { game: GAME, ...params });
    const end = (result, extra) => {
      if (!playing) return;
      send('stage_end', { stage: playing.stage, result, play_sec: Math.round((performance.now() - playing.at) / 1000), ...extra });
      ended = { stage: playing.stage, result };
      playing = null;
    };
    window.addEventListener('pagehide', () => end('quit'));
    return {
      start(stage, extra) {
        end('quit');
        if (ended && ended.stage === stage) send(`stage_retry_${ended.result}`, { stage });
        attempts[stage] = (attempts[stage] || 0) + 1;
        playing = { stage, at: performance.now() };
        ended = null;
        send('stage_start', { stage, attempt: attempts[stage], ...extra });
      },
      clear: (extra) => end('clear', extra),
      fail: (extra) => end('fail', extra),
      quit: () => end('quit'),
    };
  })();
  // チュートリアルは stage を 'tutorial'、ほかはステージ番号 (1〜) で送る
  const trackStage = (stageIdx) => (stageIdx === TUT ? 'tutorial' : stageIdx + 1);

  function startGame(stageIdx) {
    if (stageIdx === TUT && !save.tutorialSeen) {
      save.tutorialSeen = true;
      persist();
    }
    Sound.init();
    newGame(stageIdx);
    if (hasPerk('reroll')) G.rerolls = 1;
    // 宝物の取得条件 (もう持っている宝物は出さない)
    G.trCond = stageIdx === TUT ? null : treasureCond(stageIdx, G.mode);
    G.trSpawned = !G.trCond || hasTreasure(stageIdx, G.mode);
    G.minHp = 1;
    G.freeRevive = hasPerk('revive');
    rerender = null;
    hide();
    Sound.bgm('main');
    showBanner(L(stageOf(stageIdx), 'name'), '#ffffff', 2);
    renderTutor();
    Ads.gameplay(true);
    stageTrack.start(trackStage(stageIdx), { mode: G.mode, character: G.ch.id });
  }

  function pauseGame() {
    if (!G || G.state !== 'play' || !overlay.hidden) return;
    G.paused = true;
    Sound.bgm(null);
    Ads.gameplay(false);
    renderPause();
  }

  function renderPause() {
    rerender = null;
    show('pause', `
      <div class="panel">
        <h2>${t('paused')}</h2>
        <p class="sub">${esc(t('pauseSub', L(G.stage, 'name'), fmtTime(Math.ceil(GAME_TIME - G.time)), G.rooms.filter((r) => r.done).length, G.rooms.length))}</p>
        <p class="inv-title">${t('inventory')}</p>
        ${invHtml()}
        <div class="actions">
          <button type="button" class="btn primary" data-act="resume" data-back data-focus>${t('resume')}</button>
          <button type="button" class="btn" data-act="retry">${t('retry')}</button>
          <button type="button" class="btn" data-act="quit">${t('toStages')}</button>
          <button type="button" class="btn" data-act="help" data-arg="pause">${t('howToPlay')}</button>
        </div>
        <h3>${t('settings')}</h3>
        ${settingsHtml()}
      </div>`, false);
  }

  function resume() {
    if (!G) return;
    G.paused = false;
    hide();
    Sound.bgm(G.bosses.some((b) => b.boss && b.alive) ? 'boss' : 'main');
    Ads.gameplay(true);
  }

  // ---- 復活 (広告の報酬) ----
  function showRevive() {
    G.reviveAsked = true;
    Ads.gameplay(false);
    rerender = renderRevive;
    renderRevive();
  }

  function renderRevive(msg = '') {
    show('revive', `
      <div class="panel reward">
        <h2 class="result-title lose">${t('wornOut')}</h2>
        <p class="treasure-name">${t('reviveTitle')}</p>
        <p class="sub">${t('reviveText')}</p>
        ${msg ? `<p class="result-note">${esc(msg)}</p>` : ''}
        <div class="actions">
          ${G.freeRevive
    ? `<button type="button" class="btn primary" data-act="reviveFree" data-focus>${esc(t('reviveFree'))}</button>`
    : `<button type="button" class="btn primary" data-act="reviveAd" data-focus>${esc(adLabel(t('reviveBtn')))}</button>`}
          <button type="button" class="btn" data-act="giveUp" data-back>${t('giveUp')}</button>
        </div>
      </div>`, false);
  }

  // 体力を全回復して、その場で立ち上がる。まわりのゴミは吹き飛ばし、少しのあいだ無敵にする
  function revive() {
    const p = G.p;
    G.state = 'play';
    G.reviveAsked = false;
    G.endT = 0;
    p.hp = G.stats.maxHp;
    p.inv = 3;
    p.allergyT = 0;
    p.slowAmt = 0;
    G.bullets.length = 0;
    G.clouds.length = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.def.source) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 260) continue;
      if (e.boss || e.elite) {
        e.x = p.x + (dx / d) * 260;
        e.y = p.y + (dy / d) * 260;
        pushOut(e, e.r);
      } else {
        e.alive = false;
        puff(e.x, e.y, '#ffffff', 3);
      }
    }
    puff(p.x, p.y, '#bff7e6', 30);
    G.shake = Math.max(G.shake, 8);
    showBanner(t('revived'), '#4fe0b6', 2.4);
    Sound.play('level');
    rerender = null;
    hide();
    Sound.bgm(G.bosses.some((b) => b.boss && b.alive) ? 'boss' : 'main');
    Ads.gameplay(true);
  }

  // ---- レベルアップ ----
  let choices = [];
  function makeChoices() {
    const opts = [];
    for (const w of G.weapons) if (!w.evo && w.lv < MAX_WEAPON_LV) opts.push({ kind: 'w', id: w.id });
    for (const id of Object.keys(G.passives)) if (G.passives[id] < PASSIVES[id].max) opts.push({ kind: 'p', id });
    if (G.weapons.length < MAX_GEARS) for (const id of WEAPON_IDS) if (!G.weapons.some((w) => w.id === id)) opts.push({ kind: 'w', id, isNew: true });
    if (Object.keys(G.passives).length < MAX_PASSIVES) for (const id of PASSIVE_IDS) if (!G.passives[id]) opts.push({ kind: 'p', id, isNew: true });
    const n = 3 + shopOf(G.ch.id).choices;
    if (!opts.length) return [{ kind: 'heal' }, { kind: 'coin' }];
    return shuffle(opts).slice(0, n);
  }

  function choiceInfo(o) {
    if (o.kind === 'heal') return { icon: 'heal', name: t('onigiri'), lv: '', desc: t('onigiriDesc') };
    if (o.kind === 'coin') return { icon: 'coin', name: t('savings'), lv: '', desc: t('savingsDesc') };
    if (o.kind === 'w') {
      const d = WEAPONS[o.id];
      const w = G.weapons.find((x) => x.id === o.id);
      const pName = L(PASSIVES[d.passive], 'name');
      const hint = !w && G.passives[d.passive] ? t('evoWith', pName) : '';
      const recipe = { gear: o.id, passive: d.passive };
      if (o.isNew) return { kind: 'gear', icon: o.id, name: L(d, 'name'), lv: 'NEW', isNew: true, desc: L(d, 'desc'), hint, recipe };
      const evoHint = w.lv + 1 === MAX_WEAPON_LV ? (G.passives[d.passive] ? t('evoChest') : t('evoNeed', pName)) : '';
      return { kind: 'gear', icon: o.id, name: L(d, 'name'), lv: `Lv ${w.lv} → ${w.lv + 1}`, desc: lvText(o.id, w.lv), hint: evoHint, recipe };
    }
    const d = PASSIVES[o.id];
    const cur = G.passives[o.id] || 0;
    const pair = WEAPON_IDS.find((id) => WEAPONS[id].passive === o.id);
    const hint = pair && G.weapons.some((w) => w.id === pair && !w.evo) ? t('evoFor', L(WEAPONS[pair], 'name')) : '';
    return { kind: 'passive', icon: o.id, name: L(d, 'name'), lv: o.isNew ? 'NEW' : `Lv ${cur} → ${cur + 1}`, isNew: o.isNew, desc: L(d, 'desc'), hint, recipe: pair ? { gear: pair, passive: o.id } : null };
  }

  // 進化の組み合わせ: [ギア] + [パッシブ] → [進化後]。持っているものは明るく、持っていないものは暗く
  function recipeHtml(r) {
    if (!r) return '';
    const evo = WEAPONS[r.gear].evo;
    const haveG = G.weapons.some((w) => w.id === r.gear);
    const haveP = !!G.passives[r.passive];
    const ic = (id, have, title, goal) => `<img class="rc-ic${goal ? ' rc-goal' : ''}${have ? ' have' : ''}" src="${iconURL(id)}" alt="${esc(title)}" title="${esc(title)}">`;
    return `<span class="recipe" aria-label="${esc(t('recipeAria', L(WEAPONS[r.gear], 'name'), L(PASSIVES[r.passive], 'name'), L(EVOS[evo], 'name')))}">${ic(r.gear, haveG, L(WEAPONS[r.gear], 'name'))}<b>+</b>${ic(r.passive, haveP, L(PASSIVES[r.passive], 'name'))}<b>→</b>${ic(evo, haveG && haveP, L(EVOS[evo], 'name'), true)}<span class="rc-evo">${esc(L(EVOS[evo], 'name'))}</span></span>`;
  }

  // ギアかパッシブかの札
  const kindTag = (kind) => (kind === 'gear' || kind === 'passive' ? `<span class="kind-tag k-${kind}">${t(kind === 'gear' ? 'tagGear' : 'tagPassive')}</span>` : '');

  // 持ち物 (ギア4枠・パッシブ4枠)。空いている枠は点線で見せる
  function invHtml() {
    const slot = (icon, name, lv, evo, kind) => `<div class="inv-slot k-${kind}${evo ? ' evo' : ''}" title="${esc(name)}">
        <img src="${iconURL(icon)}" alt=""><span class="inv-name">${esc(name)}</span><span class="inv-lv">${evo ? '★' : `Lv${lv}`}</span>
      </div>`;
    const empty = (kind) => `<div class="inv-slot k-${kind} empty"><span class="inv-name">${t('emptySlot')}</span></div>`;
    const gears = G.weapons.map((w) => slot(weaponIcon(w), weaponName(w), w.lv, w.evo, 'gear'));
    while (gears.length < MAX_GEARS) gears.push(empty('gear'));
    const pas = Object.keys(G.passives).map((id) => slot(id, L(PASSIVES[id], 'name'), G.passives[id], false, 'passive'));
    while (pas.length < MAX_PASSIVES) pas.push(empty('passive'));
    return `<div class="inv">
      <div class="inv-row"><span class="kind-tag k-gear">${t('tagGear')} ${G.weapons.length}/${MAX_GEARS}</span><div class="inv-slots">${gears.join('')}</div></div>
      <div class="inv-row"><span class="kind-tag k-passive">${t('tagPassive')} ${Object.keys(G.passives).length}/${MAX_PASSIVES}</span><div class="inv-slots">${pas.join('')}</div></div>
    </div>`;
  }

  let levelMsg = ''; // レベルアップ画面に出すお知らせ (広告を読み込めなかったときなど)
  // 広告のリロールは、使ったあと次の 5 回のレベルアップでは出さない (いくらでも選び直せないように)
  const AD_REROLL_WAIT = 5;
  const adRerollWait = () => Math.max(0, AD_REROLL_WAIT + 1 - (G.lvShown - G.adRerollAt));
  function showLevelUp() {
    levelMsg = '';
    G.pendingLv--;
    G.lvShown++;
    Sound.play('level');
    choices = makeChoices();
    renderLevelUp();
  }

  function renderLevelUp() {
    const cards = choices.map((o, i) => {
      const c = choiceInfo(o);
      return `<button type="button" class="card${c.kind ? ` k-${c.kind}` : ''}" style="--i:${i}" data-act="choose" data-arg="${i}" data-key="${i + 1}" ${i === 0 ? 'data-focus' : ''}>
        <img src="${iconURL(c.icon)}" alt="">
        <span class="card-body">${kindTag(c.kind)}<span class="card-name">${esc(c.name)}</span><span class="card-lv${c.isNew ? ' new' : ''}">${esc(c.lv)}</span><br>
        <span class="card-desc">${esc(c.desc)}</span>${c.hint ? `<br><span class="card-hint">${esc(c.hint)}</span>` : ''}${c.recipe ? `<br>${recipeHtml(c.recipe)}` : ''}</span>
        <span class="card-key">${i + 1}</span>
      </button>`;
    }).join('');
    show('levelup', `
      <div class="panel reward levelup">
        <div class="lv-head"><p class="reward-title">LEVEL UP!</p><p class="lv-badge">Lv ${G.level - G.pendingLv}</p></div>
        ${G.tutorial && G.level - G.pendingLv === 2 ? `<p class="tut-tip">${t('tutLevelUp', MAX_GEARS, MAX_PASSIVES)}</p>` : ''}
        <p class="sub">${t('pickOne')}</p>
        <div class="cards${choices.length > 2 ? ' many' : ''}">${cards}</div>
        ${invHtml()}
        ${G.rerolls > 0
    ? `<div class="actions"><button type="button" class="btn small" data-act="reroll">${t('reroll', G.rerolls)}</button></div>`
    : !Ads.live() ? ''
      : adRerollWait() > 0 ? `<div class="actions"><button type="button" class="btn small ad-btn" disabled>${esc(t('rerollWait', adRerollWait()))}</button></div>`
        : `<div class="actions"><button type="button" class="btn small ad-btn" data-act="adReroll">${esc(adLabel(t('rerollPlus')))}</button></div>`}
        ${levelMsg ? `<p class="result-note">${esc(levelMsg)}</p>` : ''}
      </div>`, false, { kind: 'level', lock: 450 });
    fitPanel();
  }

  // パネルが画面の高さに収まらないときは、スクロールさせずに全体を縮めて収める (レベルアップ画面)
  function fitPanel() {
    const panel = overlay.querySelector('.panel.levelup');
    if (!panel) return;
    panel.style.zoom = '';
    const cs = getComputedStyle(overlay);
    // 画面 (ウィンドウ) より盤面が高いとき (横向きのスマホなど) は、見えている高さに合わせる
    const room = Math.min(overlay.clientHeight, window.innerHeight) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const need = panel.offsetHeight;
    if (need > room && room > 0) panel.style.zoom = String(Math.max(0.6, Math.floor((room / need) * 100) / 100));
  }

  function applyChoice(o) {
    if (o.kind === 'heal') G.p.hp = Math.min(G.stats.maxHp, G.p.hp + 50);
    else if (o.kind === 'coin') G.dumpCoins += 10;
    else if (o.kind === 'w') {
      const w = G.weapons.find((x) => x.id === o.id);
      if (w) w.lv++;
      else addWeapon(o.id);
    } else {
      G.passives[o.id] = (G.passives[o.id] || 0) + 1;
    }
    recalcStats();
  }

  function afterMenu() {
    if (G.pendingLv > 0) showLevelUp();
    else hide();
  }

  // ---- 宝物 ----
  function foundTreasure() {
    const i = G.stageIdx;
    const tr = treasureOf(i, G.mode);
    const isNew = !hasTreasure(i, G.mode);
    treasureList(G.mode)[i] = true;
    persist(); // 力尽きても記録が残るように、拾ったその場で保存する
    // 清掃員はノーマルの宝物で仲間になる
    const unlock = isNew && G.mode === 'normal' ? CHARS.find((c) => c.unlock === i) : null;
    if (isNew) G.treasureNew = true;
    if (unlock) G.newChar = unlock;
    // 恒久スキルを開放する宝物なら、このプレイからすぐに使える
    const perk = isNew ? tr.perk : null;
    if (perk === 'reroll') G.rerolls += 1;
    if (perk === 'revive') G.freeRevive = true;
    Sound.play('chest-evo');
    show('treasure', `
      <div class="panel reward">
        <div class="chest-stage">
          <span class="chest-flash"></span>
          <img class="chest-box" src="${iconURL('chest')}" alt="">
          <img class="chest-reward" src="${iconURL('treasure')}" alt="">
        </div>
        <div class="chest-text">
          <p class="reward-title">${isNew ? t('treasureNew') : t('treasure')}</p>
          <p class="treasure-name">${esc(L(tr, 'name'))}</p>
          <p class="sub">${esc(L(tr, 'desc'))}${isNew ? '' : t('owned')}</p>
          ${unlock ? `<p class="result-note">${esc(t('joinedBang', L(unlock, 'name')))}</p>` : ''}
          ${perk ? `<p class="result-note">${esc(t('perkGot', perkName(perk)))}</p>` : ''}
        </div>
        <div class="actions chest-ok"><button type="button" class="btn primary" data-act="treasureOk" data-focus>OK</button></div>
      </div>`, false, { kind: 'evo', lock: 1000 });
  }

  // ---- 宝箱 ----
  function openChest() {
    G.chestsOpened++;
    let icon;
    let title;
    let text;
    let kind = '';
    const evolvable = G.weapons.find((w) => !w.evo && w.lv >= MAX_WEAPON_LV && G.passives[WEAPONS[w.id].passive]);
    if (evolvable) {
      evolvable.evo = true;
      recalcStats();
      icon = WEAPONS[evolvable.id].evo;
      title = t('evolved');
      kind = 'gear';
      text = t('evolvedText', L(WEAPONS[evolvable.id], 'name'), L(EVOS[icon], 'name'), L(EVOS[icon], 'desc'));
    } else {
      const opts = [];
      for (const w of G.weapons) if (!w.evo && w.lv < MAX_WEAPON_LV) opts.push({ kind: 'w', id: w.id });
      for (const id of Object.keys(G.passives)) if (G.passives[id] < PASSIVES[id].max) opts.push({ kind: 'p', id });
      if (opts.length) {
        const o = pick(opts);
        const info = choiceInfo(o);
        applyChoice(o);
        icon = info.icon;
        title = t('chest');
        kind = info.kind;
        text = `${info.name} ${info.lv} (${info.desc})`;
      } else {
        G.dumpCoins += 30;
        icon = 'coin';
        title = t('chest');
        text = t('coins30');
      }
    }
    Sound.play(evolvable ? 'chest-evo' : 'chest-open');
    show('chest', `
      <div class="panel reward">
        <div class="chest-stage">
          <span class="chest-flash"></span>
          <img class="chest-box" src="${iconURL('chest')}" alt="">
          <img class="chest-reward" src="${iconURL(icon)}" alt="">
        </div>
        <div class="chest-text">
          <p class="reward-title">${esc(title)}</p>
          <p class="sub">${kindTag(kind)} ${esc(text)}</p>
        </div>
        <div class="actions chest-ok"><button type="button" class="btn primary" data-act="chestOk" data-focus>OK</button></div>
        <div class="chest-ok chest-inv">${invHtml()}</div>
      </div>`, false, { kind: evolvable ? 'evo' : 'chest', lock: 1000 });
  }

  // ---- 結果 ----
  // 記録とコインをまとめてから、表示は renderResult に任せる (言語を切り替えたら描き直せるように)
  function showResult(win) {
    const g = G;
    const i = g.stageIdx;
    const pct = cleanPct();
    const doneN = g.rooms.filter((r) => r.done).length;
    const killCoins = Math.floor(g.kills / 20);
    const cleanCoins = Math.floor(pct);
    const base = killCoins + cleanCoins + (win ? 50 : 0) + g.dumpCoins + g.bossCoins + g.roomCoins;
    const mul = g.md.coin * (1 + shopOf(g.ch.id).coin * 0.1) * (1 + (g.ch.mods.coin || 0));
    const total = Math.round(base * mul);
    save.coins += total;
    const trackInfo = { mode: g.mode, character: g.ch.id, rooms_done: doneN, clean_pct: Math.round(pct), level: g.level };
    if (win) stageTrack.clear(trackInfo);
    else stageTrack.fail({ ...trackInfo, reason: g.timeUp ? 'time_up' : 'worn_out' });
    if (i === TUT) {
      // チュートリアルは記録や達成率には入れず、終えたことだけ覚えておく
      if (win) save.tutorialDone = true;
      for (const k in g.killsByType) save.kills[k] = (save.kills[k] || 0) + g.killsByType[k];
      persist();
      const res = {
        win, i, tut: true, timeUp: !!g.timeUp, mode: g.mode, ch: g.ch.id, time: g.time, doneN, rooms: g.rooms.length, pct, kills: g.kills, level: g.level,
        killCoins, cleanCoins, dumpCoins: g.dumpCoins, roomCoins: g.roomCoins, bossCoins: g.bossCoins, mul, total, notes: [[win ? 'noteTutorial' : 'noteTutorialRetry']],
      };
      G = null;
      Ads.gameplay(false);
      renderResult(res);
      return;
    }
    // 記録 (清掃員ごと・モードごと)
    const wasStageCleared = !!peekRec(g.ch.id, i, 'normal').c; // 次のステージの開放は清掃員ごと
    const rec = recOf(save, g.ch.id, i, g.mode);
    const firstForChar = win && !rec.c;
    rec.r = Math.max(rec.r, doneN);
    if (win) {
      rec.c = 1;
      rec.t = rec.t ? Math.min(rec.t, Math.round(g.time)) : Math.round(g.time);
    }
    for (const k in g.killsByType) save.kills[k] = (save.kills[k] || 0) + g.killsByType[k];
    persist();
    // お知らせは、あとで言語に合わせて文にする
    const notes = [];
    if (doneN === g.rooms.length) notes.push(['noteAllRooms']);
    if (g.treasureNew) notes.push(['noteTreasure', i, g.mode]);
    if (g.newChar) notes.push(['noteJoined', g.newChar.id]);
    if (win && g.mode === 'normal' && !wasStageCleared) {
      if (i + 1 < STAGES.length) notes.push(['noteStage', i + 1]);
      notes.push(['noteHard']);
      if (i === STAGES.length - 1) notes.push(['noteAll']);
    }
    if (firstForChar) notes.push(['noteFirst', g.ch.id, g.mode]);
    const res = {
      win, i, timeUp: !!g.timeUp, mode: g.mode, ch: g.ch.id, time: g.time, doneN, rooms: g.rooms.length, pct, kills: g.kills, level: g.level,
      killCoins, cleanCoins, dumpCoins: g.dumpCoins, roomCoins: g.roomCoins, bossCoins: g.bossCoins, mul, total, notes,
    };
    G = null;
    briefRoom = i;
    Ads.gameplay(false);
    renderResult(res);
  }

  function noteText([key, a, b]) {
    switch (key) {
      case 'noteTreasure': return t('noteTreasure', L(treasureOf(a, b), 'name'));
      case 'noteJoined': return t('joinedBang', L(CHARS.find((c) => c.id === a), 'name'));
      case 'noteStage': return t('noteStage', a + 1, L(STAGES[a], 'name'));
      case 'noteFirst': return t('noteFirst', L(CHARS.find((c) => c.id === a), 'name'), L(MODES[b], 'name'));
      default: return t(key);
    }
  }

  let lastResult = null;
  function renderResult(r) {
    lastResult = r;
    rerender = () => renderResult(r);
    // ステージをクリアしたら、広告を見てもらえるコインを 1.5 倍にできる (1回だけ)
    const adExtra = Math.round(r.total * 0.5);
    const canBoost = r.win && !r.tut && !r.adExtra && adExtra > 0 && Ads.live();
    const next = r.win && r.i + 1 < STAGES.length;
    const stageName = r.tut ? L(TUTORIAL, 'name') : t('stageTitle', r.i + 1, L(STAGES[r.i], 'name'));
    show('result', `
      <div class="panel">
        <h2 class="result-title ${r.win ? 'win' : 'lose'}">${r.win ? t('allClean') : r.timeUp ? t('timeUp') : t('wornOut')}</h2>
        <p class="sub">${esc(t('resultSub', stageName, L(MODES[r.mode], 'name'), L(CHARS.find((c) => c.id === r.ch), 'name')))}</p>
        <dl class="stat-list">
          <dt>${r.win ? t('clearTime') : t('playTime')}</dt><dd>${fmtTime(r.time)}</dd>
          <dt>${t('roomsCleaned')}</dt><dd>${r.doneN}/${r.rooms}</dd>
          <dt>${t('houseClean')}</dt><dd>${r.pct.toFixed(1)}%</dd>
          <dt>${t('kills')}</dt><dd>${r.kills}</dd>
          <dt>${t('level')}</dt><dd>${r.level}</dd>
          <dt>${t('coinKills')}</dt><dd>+${r.killCoins}</dd>
          <dt>${t('coinClean')}</dt><dd>+${r.cleanCoins}</dd>
          <dt>${t('coinDump')}</dt><dd>+${r.dumpCoins}</dd>
          <dt>${t('coinRoom')}</dt><dd>+${r.roomCoins}</dd>
          <dt>${t('coinBoss')}</dt><dd>+${r.bossCoins}</dd>
          ${r.win ? `<dt>${t('coinClear')}</dt><dd>+50</dd>` : ''}
          ${r.mul !== 1 ? `<dt>${t('coinMul', r.mode === 'hard')}</dt><dd>×${r.mul.toFixed(2)}</dd>` : ''}
          ${r.adExtra ? `<dt>${t('coinAd')}</dt><dd>+${r.adExtra}</dd>` : ''}
          <dt class="total">${t('total')}</dt><dd class="total">+${r.total + (r.adExtra || 0)}</dd>
        </dl>
        ${canBoost ? `<div class="actions"><button type="button" class="btn primary ad-btn" data-act="adCoins">${esc(adLabel(t('coinsX', adExtra)))}</button></div>` : ''}
        ${r.adMsg ? `<p class="result-note">${esc(r.adMsg)}</p>` : ''}
        ${r.notes.map((n) => `<p class="result-note">${esc(noteText(n))}</p>`).join('')}
        ${affordable() ? `<div class="shop-cta"><span>${t('shopCta', save.coins, affordable())}</span>${shopBtn('rooms')}</div>` : ''}
        <div class="actions">
          ${next ? `<button type="button" class="btn primary" data-act="brief" data-arg="${r.i + 1}" data-focus>${r.tut ? t('toStage1') : t('nextStage')}</button>` : ''}
          <button type="button" class="btn${next ? '' : ' primary'}" data-act="start" data-arg="${r.i}">${t('again')}</button>
          <button type="button" class="btn" data-act="rooms" data-back>${t('toStages')}</button>
          ${affordable() ? '' : shopBtn('result')}
        </div>
      </div>`);
  }

  // ---- 恒久スキル ----
  // いまのコインで上げられる恒久スキルの数
  // (ステージ選択やタイトルからは、選んでいる清掃員の恒久スキルを数える)
  const affordable = (id = curChar().id) => {
    const sh = shopOf(id);
    return SHOP.filter((it) => sh[it.id] < it.max && save.coins >= shopCost(it, sh[it.id])).length;
  };
  // 恒久スキルへのボタン。上げられるものがあれば目立たせて数を出す
  const shopBtn = (from, small) => {
    const n = affordable();
    return `<button type="button" class="btn${small ? ' small' : ''} shop-btn${n ? ' can' : ''}" data-act="shop" data-arg="${from}"><span aria-hidden="true">⬆</span> ${t('skills')}${n ? `<span class="cta-badge" aria-label="${esc(t('canUpgrade', n))}">${n}</span>` : ''}</button>`;
  };

  let shopBack = 'rooms';
  // 恒久スキルの画面。上のアイコンで、どの清掃員の恒久スキルを見るか (上げるか) を切り替える
  let shopCharId = null;
  function showShop(from) {
    if (from) {
      shopBack = from;
      shopCharId = curChar().id;
    }
    if (!shopCharId || !charUnlocked(CHARS.find((c) => c.id === shopCharId))) shopCharId = curChar().id;
    rerender = showShop;
    const sh = shopOf(shopCharId);
    const who = CHARS.find((c) => c.id === shopCharId);
    const tabs = CHARS.filter(charUnlocked).map((c) => {
      const n = affordable(c.id);
      return `<button type="button" class="shop-char${c.id === shopCharId ? ' on' : ''}" data-act="shopChar" data-arg="${c.id}" aria-pressed="${c.id === shopCharId}" aria-label="${esc(L(c, 'name'))}"><img src="${charThumb(c.id)}" alt="">${n ? `<span class="cta-badge">${n}</span>` : ''}</button>`;
    }).join('');
    const items = SHOP.map((it) => {
      const lv = sh[it.id];
      const maxed = lv >= it.max;
      const cost = shopCost(it, lv);
      const pips = Array.from({ length: it.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="shop-item">
        <img src="${iconURL(shopIcon(it.id))}" alt="" width="36" height="36">
        <div class="shop-body"><span class="shop-name">${esc(L(it, 'name'))}</span><span class="pips${it.max > 10 ? ' many' : ''}">${pips}</span><br><span class="shop-desc">${esc(L(it, 'desc'))}</span></div>
        <button type="button" class="btn small" data-act="buy" data-arg="${it.id}" ${maxed || save.coins < cost ? 'disabled' : ''}>${maxed ? t('max') : t('cost', cost)}</button>
      </div>`;
    }).join('');
    show('shop', `
      <div class="panel">
        ${panelHead(t('skills'), shopBack, '', true)}
        <div class="shop-chars">${tabs}</div>
        <p class="shop-who">${esc(t('skillsOf', L(who, 'name')))}</p>
        <p class="sub">${t('coins')} <span class="coins">${save.coins}</span>${t('sep')}${t('shopSub')}</p>
        <div class="shop">${items}</div>
        <h3>${t('treasurePerks')}</h3>
        <div class="shop">${PERKS.map((id) => {
    const on = hasPerk(id);
    const src = perkSource(id);
    return `<div class="shop-item perk${on ? ' on' : ''}">
          <img src="${iconURL(id === 'reroll' ? 'tape' : 'heal')}" alt="" width="36" height="36">
          <div class="shop-body"><span class="shop-name">${esc(perkName(id))}</span><span class="pips"><i class="${on ? 'on' : ''}"></i></span><br><span class="shop-desc">${esc(perkDesc(id))}</span><br><span class="shop-desc perk-how">${esc(on ? t('perkOn') : t('perkHow', src.i + 1, L(MODES[src.mode], 'name')))}</span></div>
        </div>`;
  }).join('')}</div>
      </div>`);
  }

  function shopIcon(id) {
    return { hp: 'heal', might: 'boiler', clean: 'roller', speed: 'boots', armor: 'gloves', regen: 'heal', magnet: 'dustpack', xp: 'battery', box: 'dustpack', coin: 'coin', choices: 'chest' }[id];
  }

  // ---- 図鑑 ----
  function showZukan() {
    rerender = showZukan;
    const seen = ENEMY_ORDER.filter((k) => save.kills[k] > 0).length;
    const list = ENEMY_ORDER.map((k) => {
      const n = save.kills[k] || 0;
      const d = ENEMIES[k];
      return `<div class="zukan-item">
        <img src="${enemyThumb(k, !n)}" alt="">
        <div class="zukan-name">${n ? esc(L(d, 'name')) : '？？？'}</div>
        ${n ? `<div class="zukan-count">${t('killed', n)}</div><div class="zukan-desc">${esc(L(d, 'desc'))}</div>` : ''}
      </div>`;
    }).join('');
    show('zukan', `
      <div class="panel wide">
        ${panelHead(t('zukan'), 'rooms', '', true)}
        <p class="sub">${seen} / ${ENEMY_ORDER.length}</p>
        <div class="zukan">${list}</div>
      </div>`);
  }

  // ---- 設定 ----
  function settingsHtml() {
    const st = save.settings;
    return `
      <label class="setting">${t('se')}<input type="range" min="0" max="100" step="5" value="${st.se}" data-setting="se"></label>
      <label class="setting">${t('bgm')}<input type="range" min="0" max="100" step="5" value="${st.bgm}" data-setting="bgm"></label>
      <label class="setting">${t('shake')}<input type="checkbox" ${st.shake ? 'checked' : ''} data-setting="shake"></label>
      <label class="setting">${t('haze')}<input type="checkbox" ${st.haze ? 'checked' : ''} data-setting="haze"></label>`;
  }

  let settingsBack = 'title';
  // ---- 遊び方 (専用の画面) ----
  // index.html に言語ごとに書いた遊び方 (.help) を、この画面に写して見せる
  let helpBack = 'title';
  function showHelp(from) {
    if (from) helpBack = from;
    rerender = () => showHelp();
    const src = document.querySelector(`.help[data-lang="${lang}"]`) || document.querySelector('.help[data-lang="en"]');
    const body = document.createElement('div');
    body.innerHTML = src ? src.innerHTML : '';
    const h2 = body.querySelector('h2');
    if (h2) h2.remove(); // 見出しは画面の上に出す
    body.querySelectorAll('table').forEach((tb) => {
      const w = document.createElement('div');
      w.className = 'help-wrap';
      tb.replaceWith(w);
      w.append(tb);
    });
    show('help', `
      <div class="panel wide">
        ${panelHead(t('howToPlay'), helpBack === 'pause' ? 'pauseBack' : helpBack, '', true)}
        <div class="help-body">${body.innerHTML}</div>
      </div>`, helpBack !== 'pause');
  }

  // セーブデータの消去は2段階 (押すと確認が出る)。消したあとはタイトルへ戻す
  let resetStep = '';
  function showSettings(from) {
    if (from) { settingsBack = from; resetStep = ''; }
    rerender = () => showSettings();
    const reset = resetStep === 'ask'
      ? `<div class="reset-box"><p>${t('resetWarn')}</p>
          <div class="reset-row"><button type="button" class="btn small danger" data-act="resetYes">${t('resetYes')}</button>
          <button type="button" class="btn small" data-act="resetNo">${t('resetNo')}</button></div></div>`
      : resetStep === 'done'
        ? `<p class="reset-done">${t('resetDone')}</p>`
        : `<button type="button" class="btn small danger reset-btn" data-act="resetAsk">${t('resetSave')}</button>`;
    show('settings', `
      <div class="panel">
        ${panelHead(t('settings'), settingsBack, '', true)}
        ${settingsHtml()}
        ${reset}
      </div>`);
  }

  // 音量などの設定は残して、それ以外を最初の状態に戻す
  function resetSave() {
    const settings = { ...save.settings };
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, defaultSave(), { settings });
    persist();
    selCharId = null;
    shopCharId = null;
    lastResult = null;
  }

  // CrazyGames では、データモジュールの保存を正とする (ログインしていれば別の端末でも続きから遊べる)。
  // データモジュールにまだ保存がなければ (初めて・このしくみの前から遊んでいた人)、この端末の保存を移す
  async function syncCloudSave() {
    await Ads.ready;
    if (!Ads.hasData()) return;
    const raw = Ads.getData(SAVE_KEY);
    // SDK の準備ができる前にもう遊んで保存していたら、そちらを残す
    if (!raw || persisted) {
      persist();
      return;
    }
    if (raw === JSON.stringify(save)) return;
    const loaded = loadSave(raw);
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, loaded);
    try { localStorage.setItem(SAVE_KEY, raw); } catch (e) { /* 保存できなくても遊べる */ }
    selCharId = null;
    shopCharId = null;
    Sound.setVolume();
    if (rerender && !G) rerender();
  }

  // ---- 言語の切り替え ----
  // lang/<言語>.js の遊び方を、英語の遊び方のあとに並べる
  {
    const helps = document.querySelectorAll('.help');
    let last = helps[helps.length - 1];
    for (const code of PACK_CODES) {
      if (!I18N[code].help || !last) continue;
      const sec = document.createElement('section');
      sec.className = 'help';
      sec.dataset.lang = code;
      sec.lang = code === 'zh' ? 'zh-Hans' : code;
      sec.hidden = true;
      sec.innerHTML = I18N[code].help;
      last.after(sec);
      last = sec;
    }
  }

  // HTML に書いた文言 (data-i18n) と、言語ごとの遊び方 (data-lang) を反映する
  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    document.title = t('pageTitle');
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('pageDesc'));
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
    document.querySelectorAll('[data-lang]').forEach((el) => { el.hidden = el.dataset.lang !== lang; });
    if (langBtn) {
      langBtn.value = lang;
      langBtn.setAttribute('aria-label', t('language'));
    }
  }

  // 言語の選択 (ヘッダーのセレクトボックス)。プレイ中は隠している
  if (langBtn) {
    for (const [code, label] of LANGS) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.lang = code === 'zh' ? 'zh-Hans' : code;
      opt.textContent = label;
      langBtn.append(opt);
    }
    langBtn.addEventListener('change', () => {
      if (G) return;
      lang = langBtn.value;
      try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* 保存できなくても切り替え自体は有効 */ }
      Sound.init();
      Sound.play('click');
      applyLang();
      if (rerender) rerender();
      langBtn.blur();
    });
  }

  Object.assign(actions, {
    title: showTitle,
    // はじめての人は、確認なしでチュートリアルから始める
    play: () => (save.tutorialSeen ? showCharSelect() : startGame(TUT)),
    charSelect: () => showCharSelect(),
    // キャラ選択: アイコンを押すと下に説明を出す。仲間になっていない清掃員は、なり方だけ見られる
    selChar: (id) => {
      selCharId = id;
      showCharSelect();
    },
    charGo: () => {
      const c = CHARS.find((q) => q.id === selCharId);
      if (!c || !charUnlocked(c)) return;
      save.char = c.id;
      persist();
      showRooms();
    },
    rooms: showRooms,
    brief: (i) => showBrief(i),
    char: (id) => {
      save.char = id;
      persist();
      showBrief(briefRoom);
    },
    mode: (m) => {
      save.mode = m;
      persist();
      showRooms();
    },
    briefMode: (m) => {
      save.mode = m;
      persist();
      showBrief(briefRoom);
    },
    chars: (from) => showChars(from),
    charRec: (id) => showCharRec(id),
    pickChar: (id) => {
      save.char = id;
      persist();
      Sound.play('level');
      showChars();
    },
    treasureOk: afterMenu,
    start: (i) => startGame(i != null ? Number(i) : briefRoom),
    resume,
    retry: () => {
      const i = G.stageIdx;
      startGame(i);
    },
    quit: () => {
      stageTrack.quit();
      showRooms();
    },
    choose: (i) => {
      applyChoice(choices[Number(i)]);
      afterMenu();
    },
    reroll: () => {
      G.rerolls--;
      choices = makeChoices();
      renderLevelUp();
    },
    chestOk: afterMenu,
    // ---- 広告の報酬 ----
    reviveAd: async () => {
      if (!G || screen !== 'revive') return;
      adBusy();
      const ok = await Ads.rewarded();
      if (!G || screen !== 'revive') return;
      if (ok) {
        G.adRevived = true;
        revive();
      } else renderRevive(t('adFailed'));
    },
    reviveFree: () => {
      if (!G || screen !== 'revive' || !G.freeRevive) return;
      G.freeRevive = false;
      revive();
    },
    giveUp: () => {
      if (G && screen === 'revive') showResult(false);
    },
    adReroll: async () => {
      if (!G || screen !== 'levelup' || adRerollWait() > 0) return;
      adBusy();
      const ok = await Ads.rewarded();
      if (!G || screen !== 'levelup') return;
      if (ok) {
        G.rerolls += 2;
        G.adRerollAt = G.lvShown;
        levelMsg = '';
      } else levelMsg = t('adFailed');
      renderLevelUp();
    },
    adCoins: async () => {
      const r = lastResult;
      if (!r || screen !== 'result' || r.adExtra) return;
      adBusy();
      const ok = await Ads.rewarded();
      if (lastResult !== r || screen !== 'result') return;
      if (ok) {
        r.adExtra = Math.round(r.total * 0.5);
        r.adMsg = '';
        save.coins += r.adExtra;
        persist();
      } else r.adMsg = t('adFailed');
      renderResult(r);
    },
    shop: (from) => showShop(from),
    buy: (id) => {
      const it = SHOP.find((s) => s.id === id);
      const sh = shopOf(shopCharId || curChar().id);
      const lv = sh[id];
      const cost = shopCost(it, lv);
      if (lv >= it.max || save.coins < cost) return;
      save.coins -= cost;
      sh[id]++;
      persist();
      Sound.play('level');
      // 続けて上げられるように、スクロールの位置と押したボタンはそのまま
      keepScroll(() => showShop(), `[data-act="buy"][data-arg="${id}"]`);
    },
    shopChar: (id) => {
      shopCharId = id;
      keepScroll(() => showShop(), `[data-act="shopChar"][data-arg="${id}"]`);
    },
    zukan: showZukan,
    settings: (from) => showSettings(from),
    resetAsk: () => { resetStep = 'ask'; showSettings(); },
    resetNo: () => { resetStep = ''; showSettings(); },
    resetYes: () => { resetSave(); resetStep = 'done'; settingsBack = 'title'; showSettings(); },
    help: (from) => showHelp(from),
    pauseBack: () => { if (G && G.paused) renderPause(); },
  });

  // ゲーム一覧へのリンクとコピーライトは、このサイト (tools.e-seventh.com) で遊んでいるときだけ出す (CrazyGames などでは出さない)
  if (!EMBED) {
    document.querySelector('.back').style.visibility = '';
    document.querySelector('footer').hidden = false;
  }

  applyLang();
  showTitle();
  syncCloudSave();

  // テスト用 (ブラウザのコンソールから状態を見る)
  window.__cs = {
    get G() { return G; },
    save,
    BAL,
    step: (dt) => G && !G.paused && overlay.hidden && update(dt),
    give: (id, lv = 1, evo = false) => {
      const w = G.weapons.find((x) => x.id === id) || addWeapon(id);
      w.lv = lv;
      w.evo = evo;
      recalcStats();
    },
    spawn: (type, x, y) => spawnEnemy(type, x, y),
    // 宣伝用の画像を作るときに、清掃員 (char) やゴミ (enemy) を大きく描く
    art: (kind, id, size = 256) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const c = cv.getContext('2d');
      c.translate(size / 2, size * 0.54);
      if (kind === 'char') {
        c.scale((size / 64) * 1.7, (size / 64) * 1.7);
        drawPlayerBody(c, id, id === 'cleaner' ? Math.PI / 2 : 0.5, 0, false, false);
      } else {
        c.scale(size / 96, size / 96);
        drawEnemyBody(c, id, ENEMIES[id].boss ? 30 : 26, 0.3, 0, id === 'can' || id === 'bottle' ? 0.4 : 0);
      }
      return cv.toDataURL();
    },
  };
})();
