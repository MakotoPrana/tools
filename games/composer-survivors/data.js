// 作曲家サバイバー: ゲームのデータ (作曲家・曲・楽器・パッシブ・練習室・画面の文言)
(() => {
  'use strict';

  // ---------- 作曲家 ----------
  const COMPOSERS = [
    {
      id: 'beethoven',
      name: { ja: 'ベートーヴェン', en: 'Beethoven' },
      weapon: 'timpani',
      hp: 150,
      speed: 0.95,
      trait: { ja: '不屈: 指揮台の体力が半分を切ると、全タワーの攻撃力 +30%', en: 'Indomitable: all towers +30% power while the podium is below half HP' },
      bio: {
        ja: '耳が聞こえなくなっても作曲をやめなかった、ドイツの大作曲家。得意なタワーはティンパニ。',
        en: 'The German master who kept composing even after losing his hearing. Favorite tower: Timpani.',
      },
      colors: { coat: '#2d4a7a', hair: '#3b3330', scarf: '#c0392b', skin: '#f2c9a0' },
    },
    {
      id: 'mozart',
      name: { ja: 'モーツァルト', en: 'Mozart' },
      weapon: 'violin',
      hp: 120,
      speed: 1.1,
      trait: { ja: '神童: 倒した音符のインク +20%', en: 'Child Prodigy: +20% ink from notes' },
      bio: {
        ja: '5 歳で作曲を始めた天才。35 年の生涯で 600 を超える曲を残した。得意なタワーはヴァイオリン。',
        en: 'A genius who began composing at five and wrote over 600 works in 35 years. Favorite tower: Violin.',
      },
      colors: { coat: '#b8323c', hair: '#f4f1ea', scarf: '#f5e6b8', skin: '#f6d2b0' },
    },
    {
      id: 'chopin',
      name: { ja: 'ショパン', en: 'Chopin' },
      weapon: 'piano',
      hp: 110,
      speed: 1,
      trait: { ja: 'ピアノの詩人: 全タワーの攻撃間隔 −10%、ピアノは弾が 1 つ多い', en: 'Poet of the Piano: all towers −10% cooldown, pianos fire +1 shot' },
      bio: {
        ja: 'ポーランド生まれ、パリで活躍した「ピアノの詩人」。作品のほとんどがピアノ曲。得意なタワーはピアノ。',
        en: 'The Polish-born "Poet of the Piano" who shone in Paris. Favorite tower: Piano.',
      },
      colors: { coat: '#20232b', hair: '#7a5236', scarf: '#ffffff', skin: '#f3d6bd' },
    },
  ];
  // あとの版で足す作曲家 (選択画面にシルエットで出す)
  const FUTURE_COMPOSERS = [
    { id: 'bach', name: { ja: 'バッハ', en: 'Bach' } },
    { id: 'vivaldi', name: { ja: 'ヴィヴァルディ', en: 'Vivaldi' } },
    { id: 'tchaikovsky', name: { ja: 'チャイコフスキー', en: 'Tchaikovsky' } },
    { id: 'debussy', name: { ja: 'ドビュッシー', en: 'Debussy' } },
  ];

  // ---------- 曲 (ステージ) ----------
  // score: scores/*.js にある譜面の id (ないものは「準備中」)
  // openToAll: 最初からどの作曲家でも遊べる (作曲家本人がクリアしなくても)
  const SONGS = [
    // ベートーヴェン
    {
      id: 'elise', composer: 'beethoven', no: 1, stars: 1, score: 'elise',
      title: { ja: 'エリーゼのために', en: 'Für Elise' },
      boss: { id: 'lady', ja: '謎の令嬢エリーゼ', en: 'The Mysterious Elise', pattern: 'aimed', color: '#9b59b6' },
      room: { id: 'lodging', ja: 'ウィーンの下宿の一室', en: 'A Rented Room in Vienna', floor: 'wood', tint: '#c49a6c' },
      shows: [{ bar: 18, type: 'dash' }, { bar: 40, type: 'dash' }, { bar: 70, type: 'dash' }],
      trivia: {
        ja: '1810 年ごろの作曲。「エリーゼ」がだれなのかは今もわかっていない。楽譜は作曲者の死後 40 年たってから見つかった。',
        en: 'Composed around 1810. Nobody knows for sure who "Elise" was; the score was found 40 years after his death.',
      },
    },
    {
      id: 'storm', composer: 'beethoven', no: 2, stars: 2,
      title: { ja: '交響曲第6番「田園」第4楽章「雷雨」', en: 'Symphony No. 6 "Pastoral" IV. The Storm' },
      boss: { id: 'cloud', ja: '雷雲', en: 'Thundercloud' },
      room: { id: 'farm', ja: '嵐の農家', en: 'A Farmhouse in the Storm' },
    },
    {
      id: 'moonlight', composer: 'beethoven', no: 3, stars: 3,
      title: { ja: 'ピアノソナタ第14番「月光」第3楽章', en: 'Moonlight Sonata III' },
      boss: { id: 'moon', ja: '満月', en: 'The Full Moon' },
      room: { id: 'study', ja: '月明かりの書斎', en: 'A Moonlit Study' },
    },
    {
      id: 'fate', composer: 'beethoven', no: 4, stars: 4,
      title: { ja: '交響曲第5番「運命」第1楽章', en: 'Symphony No. 5 I' },
      boss: { id: 'door', ja: '運命の扉', en: 'The Door of Fate' },
      room: { id: 'hall', ja: '嵐の夜の大広間', en: 'A Great Hall on a Stormy Night' },
    },
    {
      id: 'joy', composer: 'beethoven', no: 5, stars: 5,
      title: { ja: '交響曲第9番 第4楽章「歓喜の歌」', en: 'Symphony No. 9 IV "Ode to Joy"' },
      boss: { id: 'choir', ja: '歓喜の合唱団', en: 'The Choir of Joy' },
      room: { id: 'theater', ja: '初演の劇場', en: 'The Premiere Theater' },
    },
    // モーツァルト
    {
      id: 'twinkle', composer: 'mozart', no: 1, stars: 1, score: 'twinkle', openToAll: true,
      title: { ja: 'きらきら星変奏曲', en: 'Twelve Variations on "Ah vous dirai-je, Maman"' },
      boss: { id: 'star', ja: 'きらきら星', en: 'The Twinkling Star', pattern: 'radial', color: '#f1c40f' },
      room: { id: 'salon', ja: 'パリのサロン', en: 'A Paris Salon', floor: 'marble', tint: '#d8cfc0' },
      shows: [{ bar: 30, type: 'rain' }, { bar: 78, type: 'rain' }, { bar: 126, type: 'dash' }, { bar: 150, type: 'rain' }],
      trivia: {
        ja: 'フランスの民謡「ああ、お母さん聞いて」をもとにした 12 の変奏曲 (1781〜82 年ごろ)。日本では「きらきら星」の歌で知られる。',
        en: 'Twelve variations (c. 1781–82) on the French song "Ah vous dirai-je, Maman", the tune of "Twinkle, Twinkle, Little Star".',
      },
    },
    {
      id: 'turkish', composer: 'mozart', no: 2, stars: 2,
      title: { ja: 'ピアノソナタ第11番「トルコ行進曲」', en: 'Piano Sonata No. 11 "Turkish March"' },
      boss: { id: 'band', ja: '軍楽隊長', en: 'The Bandmaster' },
      room: { id: 'court', ja: '宮廷の広間', en: 'A Court Hall' },
    },
    {
      id: 'nacht', composer: 'mozart', no: 3, stars: 3,
      title: { ja: 'アイネ・クライネ・ナハトムジーク 第1楽章', en: 'Eine kleine Nachtmusik I' },
      boss: { id: 'quartet', ja: '真夜中の弦楽四重奏', en: 'The Midnight Quartet' },
      room: { id: 'soiree', ja: '夜会のホール', en: 'A Soirée Hall' },
    },
    {
      id: 'queen', composer: 'mozart', no: 4, stars: 4,
      title: { ja: '「魔笛」より 夜の女王のアリア', en: 'The Magic Flute: Queen of the Night Aria' },
      boss: { id: 'queen', ja: '夜の女王', en: 'The Queen of the Night' },
      room: { id: 'temple', ja: '星空の神殿', en: 'The Starry Temple' },
    },
    {
      id: 'diesirae', composer: 'mozart', no: 5, stars: 5,
      title: { ja: 'レクイエム より「怒りの日」', en: 'Requiem: Dies irae' },
      boss: { id: 'grey', ja: '灰色の使者', en: 'The Grey Messenger' },
      room: { id: 'cathedral', ja: '大聖堂', en: 'The Cathedral' },
    },
    // ショパン
    {
      id: 'nocturne', composer: 'chopin', no: 1, stars: 1, score: 'nocturne', openToAll: true,
      title: { ja: 'ノクターン第2番', en: 'Nocturne Op. 9 No. 2' },
      boss: { id: 'candle', ja: 'サロンの燭台', en: 'The Salon Candelabra', pattern: 'spread', color: '#e67e22' },
      room: { id: 'salonP', ja: 'パリのサロン', en: 'A Paris Salon', floor: 'carpet', tint: '#6b2737' },
      shows: [{ bar: 9, type: 'dash' }, { bar: 16, type: 'dark' }, { bar: 24, type: 'dash' }],
      trivia: {
        ja: '20 歳ごろ (1830〜31 年) に書かれた、ショパンのいちばん有名な夜想曲。ゆったりした 12/8 拍子の上で、歌うような旋律が飾られていく。',
        en: 'Written around age 20 (1830–31), it is Chopin\'s most famous nocturne: a singing, ornamented melody over a gentle 12/8 lilt.',
      },
    },
    {
      id: 'minute', composer: 'chopin', no: 2, stars: 2,
      title: { ja: '子犬のワルツ', en: 'Minute Waltz' },
      boss: { id: 'puppy', ja: '子犬', en: 'The Puppy' },
      room: { id: 'parlor', ja: '屋敷の居間', en: 'A Parlor' },
    },
    {
      id: 'raindrop', composer: 'chopin', no: 3, stars: 3,
      title: { ja: '前奏曲第15番「雨だれ」', en: 'Prelude No. 15 "Raindrop"' },
      boss: { id: 'raincloud', ja: '雨雲', en: 'The Raincloud' },
      room: { id: 'cell', ja: '修道院の僧房', en: 'A Monastery Cell' },
    },
    {
      id: 'fantaisie', composer: 'chopin', no: 4, stars: 4,
      title: { ja: '幻想即興曲', en: 'Fantaisie-Impromptu' },
      boss: { id: 'phantom', ja: '幻影', en: 'The Phantom' },
      room: { id: 'mirror', ja: '鏡の間', en: 'The Hall of Mirrors' },
    },
    {
      id: 'heroic', composer: 'chopin', no: 5, stars: 5,
      title: { ja: '英雄ポロネーズ', en: 'Heroic Polonaise' },
      boss: { id: 'cavalry', ja: '騎兵の幻影', en: 'The Phantom Cavalry' },
      room: { id: 'ballroom', ja: '舞踏会の大広間', en: 'The Grand Ballroom' },
    },
  ];

  // ---------- タワー (楽器) ----------
  // 譜面の上に置く。reg: 得意な音域 (lo / mid / hi / all。得意な音域の音符には 1.5 倍)。
  // cost: 建てる値段 (インク)。lv(L): レベル 1〜5 の値。evo: レベル 5 から進化 (値段は cost × 3)
  // kind: 攻撃のしかた。shot (弾) / beam (右へ水平の光線) / aura (まわりを遅く) / pulse (衝撃波で右へ押し戻す) /
  //       homing (追いかける弾) / string (縦の弦を通った音符に) / cone (右へ扇) / buff (まわりのタワーを強化) /
  //       splash (投げて範囲) / pillar (遠くに重い一撃)
  const TOWERS = {
    piano: {
      name: { ja: 'ピアノ', en: 'Piano' }, reg: 'all', kind: 'shot', cost: 60, evo: 'hammer',
      desc: { ja: '一番先頭の音符を撃つ。どの音域にも効く基本のタワー', en: 'Shoots the leading note. A solid all-rounder' },
      lv: (L) => ({ dmg: 9 + L * 4, cd: 0.9 - L * 0.06, range: 150 + L * 15 }),
    },
    violin: {
      name: { ja: 'ヴァイオリン', en: 'Violin' }, reg: 'hi', kind: 'beam', cost: 80, evo: 'strad',
      desc: { ja: '右へまっすぐ光線。同じ高さを流れる旋律をまとめて貫く', en: 'Fires a beam straight right, piercing a whole melodic line at its pitch' },
      lv: (L) => ({ dmg: 10 + L * 5, cd: 1.5 - L * 0.1, len: 300 + L * 40, width: 26 + L * 3 }),
    },
    cello: {
      name: { ja: 'チェロ', en: 'Cello' }, reg: 'lo', kind: 'aura', cost: 70, evo: 'contrabass',
      desc: { ja: 'まわりの音符を遅くし、少しずつ削る', en: 'Slows and wears down notes around it' },
      lv: (L) => ({ dmg: 3 + L * 2, cd: 0.5, range: 90 + L * 10, slow: 0.25 + L * 0.03 }),
    },
    timpani: {
      name: { ja: 'ティンパニ', en: 'Timpani' }, reg: 'lo', kind: 'pulse', cost: 90, evo: 'thunder',
      desc: { ja: '衝撃波で、まわりの音符を右へ押し戻す', en: 'A shockwave that knocks nearby notes back to the right' },
      lv: (L) => ({ dmg: 9 + L * 5, cd: 2.0 - L * 0.12, range: 90 + L * 10, kb: 40 + L * 8 }),
    },
    flute: {
      name: { ja: 'フルート', en: 'Flute' }, reg: 'hi', kind: 'homing', cost: 70, evo: 'magicflute',
      desc: { ja: '射程が長く、追いかける弾を何発も撃つ。速い高音に強い', en: 'Long range, several homing shots. Great against fast high notes' },
      lv: (L) => ({ dmg: 4 + L * 2.5, cd: 1.0 - L * 0.06, range: 230 + L * 15, count: 2 + (L >= 3) + (L >= 5) }),
    },
    harp: {
      name: { ja: 'ハープ', en: 'Harp' }, reg: 'all', kind: 'string', cost: 100, evo: 'celestial',
      desc: { ja: '縦に弦を張る。弦を通りぬける音符すべてにダメージ', en: 'Strings a vertical line; every note passing through takes damage' },
      lv: (L) => ({ dmg: 10 + L * 5, range: 70 + L * 12 }),
    },
    baton: {
      name: { ja: '指揮棒', en: 'Baton' }, reg: 'mid', kind: 'buff', cost: 120, evo: 'maestro',
      desc: { ja: '攻撃しない。まわりのタワーの攻撃力と攻撃の速さを上げる', en: 'No attack. Boosts the power and speed of nearby towers' },
      lv: (L) => ({ range: 110 + L * 10, might: 0.12 + L * 0.04, haste: 0.08 + L * 0.03 }),
    },
    trumpet: {
      name: { ja: 'トランペット', en: 'Trumpet' }, reg: 'mid', kind: 'cone', cost: 110, evo: 'fanfare', locked: 'fate',
      desc: { ja: '右へ扇形に吹き、音符を強く押し戻す', en: 'Blasts a cone to the right with strong knockback' },
      lv: (L) => ({ dmg: 12 + L * 5, cd: 1.6 - L * 0.1, range: 160 + L * 15, kb: 70 + L * 10 }),
    },
    cymbal: {
      name: { ja: 'シンバル', en: 'Cymbals' }, reg: 'mid', kind: 'splash', cost: 100, evo: 'janissary', locked: 'turkish',
      desc: { ja: '先頭の音符へ投げ、まわりにも当たる', en: 'Thrown at the leading note, hitting those around it' },
      lv: (L) => ({ dmg: 10 + L * 5, cd: 1.5 - L * 0.08, range: 180 + L * 12, splash: 50 + L * 5 }),
    },
    organ: {
      name: { ja: 'パイプオルガン', en: 'Pipe Organ' }, reg: 'lo', kind: 'pillar', cost: 140, evo: 'cathedral', locked: 'diesirae',
      desc: { ja: '遠くの硬い音符に、重い一撃', en: 'A heavy blow on tough notes far away' },
      lv: (L) => ({ dmg: 30 + L * 14, cd: 2.4 - L * 0.12, range: 300 + L * 20, splash: 36 }),
    },
  };
  // 旧い名前で参照しているところのため
  const WEAPONS = TOWERS;

  const EVOS = {
    hammer: { name: { ja: 'ハンマークラヴィーア', en: 'Hammerklavier' }, desc: { ja: '3 発の和音が貫通し、当たると爆ぜる', en: 'Triple chord shots that pierce and burst' } },
    strad: { name: { ja: 'ストラディヴァリウス', en: 'Stradivarius' }, desc: { ja: '太い光線を出し続ける', en: 'A thick, lingering beam' } },
    contrabass: { name: { ja: '大地のコントラバス', en: 'Earthshaking Contrabass' }, desc: { ja: '広い範囲を大きく遅くする', en: 'Greatly slows a wide area' } },
    thunder: { name: { ja: '雷鳴のティンパニ', en: 'Thunder Timpani' }, desc: { ja: '2 重の衝撃波で、音符をしびれさせる', en: 'Double shockwaves that stun' } },
    magicflute: { name: { ja: '魔笛', en: 'The Magic Flute' }, desc: { ja: '当てた音符をときどき魅了し、逆向きに流して仲間を攻撃させる', en: 'Sometimes charms notes to flow backward and strike their friends' } },
    celestial: { name: { ja: '天上のハープ', en: 'Celestial Harp' }, desc: { ja: '弦が 2 本になり、高く張る', en: 'Two taller strings' } },
    maestro: { name: { ja: 'マエストロのタクト', en: "Maestro's Baton" }, desc: { ja: '強化が大きくなり、まわりの音符も遅くする', en: 'Bigger boosts, and slows nearby notes' } },
    fanfare: { name: { ja: '凱旋のファンファーレ', en: 'Triumphal Fanfare' }, desc: { ja: '2 回吹いて、大きく押し戻す', en: 'Blasts twice with huge knockback' } },
    janissary: { name: { ja: '軍楽隊の大シンバル', en: 'Janissary Cymbals' }, desc: { ja: '2 枚を投げ、大きく爆ぜる', en: 'Throws two with a big crash' } },
    cathedral: { name: { ja: '大聖堂のオルガン', en: 'Cathedral Organ' }, desc: { ja: '一度に 3 か所へ重い一撃', en: 'Three heavy blows at once' } },
  };

  // ---------- 練習室 (恒久アップグレード。作曲家ごと) ----------
  const UPGRADES = [
    { id: 'hp', name: { ja: '指揮台の体力', en: 'Podium HP' }, desc: { ja: '+10', en: '+10' }, max: 10, base: 40 },
    { id: 'might', name: { ja: '攻撃力', en: 'Power' }, desc: { ja: 'タワーの攻撃力 +5%', en: 'Tower power +5%' }, max: 10, base: 60 },
    { id: 'cd', name: { ja: '攻撃の速さ', en: 'Attack Speed' }, desc: { ja: '攻撃間隔 −3%', en: '−3% cooldown' }, max: 5, base: 100 },
    { id: 'area', name: { ja: '射程', en: 'Range' }, desc: { ja: '+5%', en: '+5%' }, max: 5, base: 80 },
    { id: 'ink', name: { ja: '最初のインク', en: 'Starting Ink' }, desc: { ja: '+25', en: '+25' }, max: 8, base: 50 },
    { id: 'income', name: { ja: 'インクの量', en: 'Ink Income' }, desc: { ja: '倒した音符のインク +5%', en: '+5% ink from notes' }, max: 10, base: 80 },
    { id: 'discount', name: { ja: '値引き', en: 'Discount' }, desc: { ja: '建てる・強化する値段 −3%', en: '−3% build and upgrade cost' }, max: 5, base: 120 },
    { id: 'greed', name: { ja: '金貨', en: 'Ducats' }, desc: { ja: 'もらえる金貨 +10%', en: '+10% ducats' }, max: 5, base: 100 },
    { id: 'revive', name: { ja: 'カーテンコール', en: 'Curtain Call' }, desc: { ja: '1 回だけ、体力が 0 になっても半分で立ち直る', en: 'Once, recover to half HP instead of falling' }, max: 1, base: 2000 },
  ];

  // ---------- 画面の文言 ----------
  const TEXT = {
    gameTitle: { ja: '作曲家サバイバー', en: 'Composer Survivors' },
    ink: { ja: 'インク', en: 'Ink' },
    build: { ja: '建てる', en: 'Build' },
    upgrade: { ja: '強化', en: 'Upgrade' },
    evolve: { ja: '進化', en: 'Evolve' },
    sell: { ja: '売る', en: 'Sell' },
    close: { ja: '閉じる', en: 'Close' },
    maxLv: { ja: '最大', en: 'Max' },
    prepHint: { ja: '譜面にタワーを置いてから「開演」。音符は右から左へ流れてくる', en: 'Place towers on the score, then start. Notes flow from right to left' },
    startShow: { ja: '▶ 開演', en: '▶ Start' },
    leaked: { ja: '通した音符', en: 'Notes let through' },
    bossIncoming: { ja: 'ボスが流れてくる! 指揮台に届く前に倒せ', en: 'The boss is coming! Stop it before it reaches the podium' },
    landscape: { ja: '横向きにすると遊びやすくなります', en: 'Turn your device sideways for a better view' },
    lockedTower: { ja: '「{s}」をクリアすると使える', en: 'Clear "{s}" to unlock' },
    favorite: { ja: '得意', en: 'Favorite' },
    towerUnlocked: { ja: '新しいタワー「{w}」を使えるようになりました', en: 'New tower unlocked: {w}' },
    backToGames: { ja: '‹ ゲーム一覧', en: '‹ Games' },
    subtitle: { ja: '楽譜を流れてくる音符を、楽器のタワーで止めろ。', en: 'Stop the notes flowing across the score with instrument towers.' },
    start: { ja: 'はじめる', en: 'Start' },
    practice: { ja: '🎹 練習室', en: '🎹 Practice Room' },
    settings: { ja: '⚙ 設定', en: '⚙ Settings' },
    howto: { ja: '遊び方', en: 'How to Play' },
    back: { ja: '‹ 戻る', en: '‹ Back' },
    completion: { ja: '達成率', en: 'Completion' },
    chooseComposer: { ja: '作曲家をえらぶ', en: 'Choose a Composer' },
    chooseSong: { ja: '曲をえらぶ', en: 'Choose a Piece' },
    withThis: { ja: 'この作曲家で曲をえらぶ', en: 'Choose a piece with this composer' },
    startWeapon: { ja: '得意なタワー (攻撃力 +25%・2 割引き)', en: 'Favorite tower (+25% power, 20% off)' },
    trait: { ja: '個性', en: 'Trait' },
    hp: { ja: '指揮台の体力', en: 'Podium HP' },
    comingSoon: { ja: '準備中', en: 'Coming soon' },
    futureComposer: { ja: 'あとの版で登場', en: 'Coming in a later update' },
    cleared: { ja: 'クリアした曲', en: 'Pieces cleared' },
    normal: { ja: 'ノーマル', en: 'Normal' },
    hard: { ja: 'ハード「プレスト」', en: 'Hard "Presto"' },
    hardShort: { ja: 'ハード', en: 'Hard' },
    hardLocked: { ja: 'ハードはノーマルをクリアすると開く', en: 'Clear Normal to unlock Hard' },
    lockedPrev: { ja: '前の曲をクリアすると開く', en: 'Clear the previous piece to unlock' },
    lockedOwn: { ja: '{c} でクリアすると解禁', en: 'Clear it with {c} to unlock' },
    ownPiece: { ja: '自作自演: 攻撃力 +10%', en: 'Own piece: +10% power' },
    coStar: { ja: '共演: 金貨 ×1.2', en: 'Guest performance: ducats ×1.2' },
    boss: { ja: 'ボス', en: 'Boss' },
    room: { ja: '部屋', en: 'Room' },
    notes: { ja: '音符', en: 'Notes' },
    length: { ja: '長さ', en: 'Length' },
    curtainUp: { ja: '開演', en: 'Curtain Up' },
    range: { ja: '音域', en: 'Range' },
    low: { ja: '低い音', en: 'Low' },
    mid: { ja: '中くらい', en: 'Mid' },
    high: { ja: '高い音', en: 'High' },
    short: { ja: '短い音', en: 'Short' },
    long: { ja: '長い音', en: 'Long' },
    levelUp: { ja: 'LEVEL UP!', en: 'LEVEL UP!' },
    reroll: { ja: '選び直す ({n})', en: 'Reroll ({n})' },
    moreLevels: { ja: 'あと {n} 回', en: '+{n} more' },
    weaponTag: { ja: '楽器', en: 'Instrument' },
    passiveTag: { ja: 'パッシブ', en: 'Passive' },
    newTag: { ja: 'NEW', en: 'NEW' },
    healOpt: { ja: '体力を 30 回復', en: 'Recover 30 HP' },
    goldOpt: { ja: '金貨 +10', en: '+10 ducats' },
    paused: { ja: '一時停止', en: 'Paused' },
    resume: { ja: '再開', en: 'Resume' },
    retry: { ja: 'やり直す', en: 'Retry' },
    toSongs: { ja: '曲選択へ', en: 'Piece Select' },
    again: { ja: 'もう一度', en: 'Play Again' },
    nextSong: { ja: '次の曲へ', en: 'Next Piece' },
    bravo: { ja: 'ブラヴォー!', en: 'Bravo!' },
    failed: { ja: '演奏中断…', en: 'Performance Interrupted…' },
    cleared2: { ja: 'スタンディングオベーション!', en: 'Standing Ovation!' },
    progress: { ja: '弾けたところ', en: 'Progress' },
    defeated: { ja: '倒した音符', en: 'Notes defeated' },
    encores: { ja: 'アンコール', en: 'Encores' },
    damage: { ja: '受けたダメージ', en: 'Damage taken' },
    time: { ja: 'タイム', en: 'Time' },
    rank: { ja: '評価', en: 'Rank' },
    ducats: { ja: 'ダカット金貨', en: 'Ducats' },
    unlockedFor: { ja: '解禁! 「{s}」をほかの作曲家でも遊べるようになりました', en: 'Unlocked! "{s}" can now be played by other composers' },
    unlockedWeapon: { ja: '新しいタワー「{w}」を使えるようになりました', en: 'New tower unlocked: {w}' },
    canBuy: { ja: '練習室で {n} 個強化できる', en: '{n} upgrades available in the Practice Room' },
    practiceTitle: { ja: '練習室', en: 'Practice Room' },
    practiceNote: { ja: '強化は作曲家ごと。金貨は全員共通', en: 'Upgrades are per composer. Ducats are shared.' },
    buy: { ja: '強化', en: 'Upgrade' },
    maxed: { ja: '最大', en: 'MAX' },
    bgmVol: { ja: '曲の音量', en: 'Music volume' },
    seVol: { ja: '効果音の音量', en: 'Sound effects' },
    preview: { ja: '譜面プレビュー', en: 'Score preview' },
    shake: { ja: '画面の揺れ', en: 'Screen shake' },
    on: { ja: 'オン', en: 'On' },
    off: { ja: 'オフ', en: 'Off' },
    erase: { ja: 'セーブデータを消去', en: 'Erase save data' },
    eraseConfirm: { ja: '本当に消去しますか? 金貨・強化・記録がすべて消えます。', en: 'Really erase? All ducats, upgrades and records will be lost.' },
    eraseYes: { ja: '消去する', en: 'Erase' },
    eraseNo: { ja: 'やめる', en: 'Cancel' },
    remainNotes: { ja: '残りの音符をすべて倒せ!', en: 'Defeat all remaining notes!' },
    encoreIn: { ja: 'アンコールまで {s} 秒', en: 'Encore in {s}s' },
    encore: { ja: 'アンコール!', en: 'Encore!' },
    shieldBreak: { ja: '結界が割れた! ボスを倒せ!', en: 'The barrier shatters! Defeat the boss!' },
    resonance: { ja: '共鳴!', en: 'Resonance!' },
    evolved: { ja: '進化! {w}', en: 'Evolved! {w}' },
    chest: { ja: '楽譜ケース', en: 'Score Case' },
    revived: { ja: 'カーテンコール! 復活', en: 'Curtain call! Revived' },
    toPractice: { ja: '練習室へ', en: 'Practice Room' },
    unseen: { ja: 'まだ出ていない', en: 'Unplayed' },
    onField: { ja: '場にいる', en: 'On stage' },
    bar: { ja: '小節', en: 'Bar' },
    lv: { ja: 'Lv', en: 'Lv' },
    owned: { ja: 'いまの持ち物', en: 'Your kit' },
    empty: { ja: '空き', en: 'Empty' },
    trivia: { ja: '曲のこと', en: 'About the piece' },
    tapToStart: { ja: 'タップ / クリックで音が鳴ります', en: 'Tap / click to enable sound' },
  };

  window.CSData = { COMPOSERS, FUTURE_COMPOSERS, SONGS, TOWERS, WEAPONS, EVOS, UPGRADES, TEXT };
})();
