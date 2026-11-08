// 作曲家サバイバー: ゲームのデータ (作曲家・曲・楽器・パッシブ・練習室・画面の文言)
(() => {
  'use strict';

  // ---------- 作曲家 ----------
  const COMPOSERS = [
    {
      id: 'beethoven',
      name: { ja: 'ベートーヴェン', en: 'Beethoven' },
      weapon: 'timpani',
      hp: 120,
      speed: 0.95,
      trait: { ja: '不屈: 体力が半分を切ると攻撃力 +30%', en: 'Indomitable: +30% power while below half HP' },
      bio: {
        ja: '耳が聞こえなくなっても作曲をやめなかった、ドイツの大作曲家。ティンパニの響きで音符を押し返す。',
        en: 'The German master who kept composing even after losing his hearing. Pushes notes back with the boom of the timpani.',
      },
      colors: { coat: '#2d4a7a', hair: '#3b3330', scarf: '#c0392b', skin: '#f2c9a0' },
    },
    {
      id: 'mozart',
      name: { ja: 'モーツァルト', en: 'Mozart' },
      weapon: 'violin',
      hp: 80,
      speed: 1.1,
      trait: { ja: '神童: もらえる経験値 +20%', en: 'Child Prodigy: +20% experience' },
      bio: {
        ja: '5 歳で作曲を始めた天才。35 年の生涯で 600 を超える曲を残した。ヴァイオリンの光線で音符を貫く。',
        en: 'A genius who began composing at five and wrote over 600 works in 35 years. Pierces notes with violin beams.',
      },
      colors: { coat: '#b8323c', hair: '#f4f1ea', scarf: '#f5e6b8', skin: '#f6d2b0' },
    },
    {
      id: 'chopin',
      name: { ja: 'ショパン', en: 'Chopin' },
      weapon: 'piano',
      hp: 70,
      speed: 1,
      trait: { ja: 'ピアノの詩人: 攻撃間隔 −10%、ピアノの弾が 1 つ多い', en: 'Poet of the Piano: −10% cooldown, +1 piano shot' },
      bio: {
        ja: 'ポーランド生まれ、パリで活躍した「ピアノの詩人」。作品のほとんどがピアノ曲。体は弱いが手数で勝負。',
        en: 'The Polish-born "Poet of the Piano" who shone in Paris. Frail, but fights with sheer number of shots.',
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
      id: 'twinkle', composer: 'mozart', no: 1, stars: 1, score: 'twinkle',
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
      id: 'nocturne', composer: 'chopin', no: 1, stars: 1, score: 'nocturne',
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

  // ---------- 楽器 (武器) ----------
  // reg: 得意な音域 (lo / mid / hi / all)。lv(L) はレベル L の値 (1〜8)
  const WEAPONS = {
    piano: {
      name: { ja: 'ピアノ', en: 'Piano' }, reg: 'all', evo: 'hammer', passive: 'pedal',
      desc: { ja: '一番近い音符へ鍵盤の弾を撃つ', en: 'Fires key-shaped shots at the nearest note' },
      lv: (L) => ({ dmg: 9 + L * 2, cd: 0.95 - L * 0.03, count: 1 + (L >= 3) + (L >= 5) + (L >= 8), pierce: 1 + (L >= 6), speed: 430 }),
    },
    baton: {
      name: { ja: '指揮棒', en: 'Baton' }, reg: 'mid', evo: 'maestro', passive: 'metronome',
      desc: { ja: '左右を交互になぎ払う', en: 'Slashes left and right in turn' },
      lv: (L) => ({ dmg: 13 + L * 3, cd: 1.15 - L * 0.03, range: 100 + L * 6, both: L >= 4 }),
    },
    timpani: {
      name: { ja: 'ティンパニ', en: 'Timpani' }, reg: 'lo', evo: 'thunder', passive: 'tailcoat',
      desc: { ja: 'まわりに衝撃波の輪を出して押し返す', en: 'Sends out a shockwave ring that pushes notes back' },
      lv: (L) => ({ dmg: 8 + L * 2.5, cd: 1.5 - L * 0.04, radius: 90 + L * 8, kb: 160 + L * 10 }),
    },
    violin: {
      name: { ja: 'ヴァイオリン', en: 'Violin' }, reg: 'hi', evo: 'strad', passive: 'rosin',
      desc: { ja: '一番近い音符へ貫通する光線を放つ', en: 'Fires a piercing beam at the nearest note' },
      lv: (L) => ({ dmg: 14 + L * 3, cd: 1.5 - L * 0.04, len: 300 + L * 15, width: 8 + L, count: 1 + (L >= 4) + (L >= 7) }),
    },
    cello: {
      name: { ja: 'チェロ', en: 'Cello' }, reg: 'lo', evo: 'contrabass', passive: 'soundproof',
      desc: { ja: '足元に低い音の波を広げ、音符を遅くする', en: 'Spreads a low wave underfoot that slows notes' },
      lv: (L) => ({ dmg: 4 + L * 1.5, cd: 2.4 - L * 0.06, radius: 70 + L * 7, life: 2 + L * 0.15, slow: 0.3 }),
    },
    flute: {
      name: { ja: 'フルート', en: 'Flute' }, reg: 'hi', evo: 'magicflute', passive: 'quill',
      desc: { ja: '追いかける風の弾を撃つ', en: 'Fires homing wind notes' },
      lv: (L) => ({ dmg: 6 + L * 1.8, cd: 1.25 - L * 0.03, count: 2 + (L >= 3) + (L >= 5) + (L >= 7), speed: 300 }),
    },
    trumpet: {
      name: { ja: 'トランペット', en: 'Trumpet' }, reg: 'mid', evo: 'fanfare', passive: 'lungs',
      desc: { ja: '進む方向に扇形の音を吹き、強く押し返す', en: 'Blasts a cone of sound ahead with strong knockback' },
      lv: (L) => ({ dmg: 11 + L * 3, cd: 1.6 - L * 0.04, range: 130 + L * 8, arc: 0.9 + L * 0.03, kb: 240 }),
    },
    harp: {
      name: { ja: 'ハープ', en: 'Harp' }, reg: 'all', evo: 'celestial', passive: 'stand',
      desc: { ja: 'まわりを弦が回る', en: 'Strings orbit around you' },
      lv: (L) => ({ dmg: 6 + L * 2, count: 2 + (L >= 3) + (L >= 5) + (L >= 7), radius: 78 + L * 3, spin: 2.6 + L * 0.1 }),
    },
    cymbal: {
      name: { ja: 'シンバル', en: 'Cymbals' }, reg: 'mid', evo: 'janissary', passive: 'pageturner', locked: 'turkish',
      desc: { ja: 'ブーメランのように投げる', en: 'Thrown like a boomerang' },
      lv: (L) => ({ dmg: 11 + L * 3, cd: 1.8 - L * 0.05, dist: 200 + L * 12, count: 1 + (L >= 4) + (L >= 7) }),
    },
    organ: {
      name: { ja: 'パイプオルガン', en: 'Pipe Organ' }, reg: 'lo', evo: 'cathedral', passive: 'coffee', locked: 'diesirae',
      desc: { ja: '音符の足元からパイプが突き上がる', en: 'Pipes burst up beneath random notes' },
      lv: (L) => ({ dmg: 16 + L * 4, cd: 1.5 - L * 0.04, count: 1 + (L >= 3) + (L >= 5) + (L >= 7), radius: 26 + L * 1.5 }),
    },
  };
  // トランペットは「運命」で解禁
  WEAPONS.trumpet.locked = 'fate';

  const EVOS = {
    hammer: { name: { ja: 'ハンマークラヴィーア', en: 'Hammerklavier' }, desc: { ja: '3 発の和音が貫通し、当たると爆ぜる', en: 'Triple chord shots that pierce and burst' } },
    maestro: { name: { ja: 'マエストロのタクト', en: "Maestro's Baton" }, desc: { ja: '360° をなぎ払い、音符を遅くする', en: 'Sweeps all around and slows notes' } },
    thunder: { name: { ja: '雷鳴のティンパニ', en: 'Thunder Timpani' }, desc: { ja: '輪が 2 重になり、音符をしびれさせる', en: 'Double rings that stun' } },
    strad: { name: { ja: 'ストラディヴァリウス', en: 'Stradivarius' }, desc: { ja: '太く長い光線を出し続ける', en: 'A thick, long, lingering beam' } },
    contrabass: { name: { ja: '大地のコントラバス', en: 'Earthshaking Contrabass' }, desc: { ja: '大波で音符を大きく遅くする', en: 'A huge wave that greatly slows notes' } },
    magicflute: { name: { ja: '魔笛', en: 'The Magic Flute' }, desc: { ja: '当てた音符をときどき味方にする', en: 'Sometimes charms notes to fight for you' } },
    fanfare: { name: { ja: '凱旋のファンファーレ', en: 'Triumphal Fanfare' }, desc: { ja: '前後に吹き、もう一度ダメージ', en: 'Blasts front and back, then hits again' } },
    celestial: { name: { ja: '天上のハープ', en: 'Celestial Harp' }, desc: { ja: '弦が倍になり、輪が広がる', en: 'Twice the strings in a wider ring' } },
    janissary: { name: { ja: '軍楽隊の大シンバル', en: 'Janissary Cymbals' }, desc: { ja: '2 枚を投げ、戻って打ち合わせると爆発', en: 'Throws two that crash together in an explosion' } },
    cathedral: { name: { ja: '大聖堂のオルガン', en: 'Cathedral Organ' }, desc: { ja: '何本ものパイプが広く突き上がる', en: 'Many wide pipes at once' } },
  };

  // ---------- パッシブ ----------
  const PASSIVES = {
    pedal: { name: { ja: 'ペダル', en: 'Sustain Pedal' }, icon: '🦶', desc: { ja: '効果時間 +10%', en: '+10% duration' }, max: 5 },
    metronome: { name: { ja: 'メトロノーム', en: 'Metronome' }, icon: '⏱️', desc: { ja: '攻撃間隔 −8%', en: '−8% cooldown' }, max: 5 },
    tailcoat: { name: { ja: '燕尾服', en: 'Tailcoat' }, icon: '🤵', desc: { ja: '最大体力 +20', en: '+20 max HP' }, max: 5 },
    rosin: { name: { ja: '松脂', en: 'Rosin' }, icon: '🟧', desc: { ja: '攻撃力 +10%', en: '+10% power' }, max: 5 },
    soundproof: { name: { ja: '防音材', en: 'Soundproofing' }, icon: '🧱', desc: { ja: '受けるダメージ −1', en: '−1 damage taken' }, max: 5 },
    quill: { name: { ja: '羽ペン', en: 'Quill Pen' }, icon: '🪶', desc: { ja: '経験値 +8%', en: '+8% experience' }, max: 5 },
    lungs: { name: { ja: '肺活量', en: 'Lung Power' }, icon: '💨', desc: { ja: '弾の速さ・射程 +10%', en: '+10% projectile speed and reach' }, max: 5 },
    stand: { name: { ja: '譜面台', en: 'Music Stand' }, icon: '🎼', desc: { ja: '攻撃範囲 +10%', en: '+10% area' }, max: 5 },
    pageturner: { name: { ja: '楽譜めくり係', en: 'Page Turner' }, icon: '📖', desc: { ja: '弾の数 +1', en: '+1 projectile' }, max: 2 },
    coffee: { name: { ja: 'コーヒー豆', en: 'Coffee Beans' }, icon: '☕', desc: { ja: '毎秒 0.25 回復', en: 'Recover 0.25 HP/s' }, max: 5 },
    applause: { name: { ja: '拍手喝采', en: 'Applause' }, icon: '👏', desc: { ja: 'インクの回収範囲 +20%', en: '+20% pickup range' }, max: 5 },
    bouquet: { name: { ja: '花束', en: 'Bouquet' }, icon: '💐', desc: { ja: '運 +10%', en: '+10% luck' }, max: 5 },
  };

  // ---------- 練習室 (恒久アップグレード。作曲家ごと) ----------
  const UPGRADES = [
    { id: 'hp', name: { ja: '体力', en: 'Health' }, desc: { ja: '最大体力 +10', en: '+10 max HP' }, max: 10, base: 40 },
    { id: 'might', name: { ja: '攻撃力', en: 'Power' }, desc: { ja: '+5%', en: '+5%' }, max: 10, base: 60 },
    { id: 'armor', name: { ja: '防御', en: 'Defense' }, desc: { ja: '受けるダメージ −1', en: '−1 damage taken' }, max: 3, base: 300 },
    { id: 'speed', name: { ja: '移動速度', en: 'Move Speed' }, desc: { ja: '+3%', en: '+3%' }, max: 5, base: 80 },
    { id: 'cd', name: { ja: '攻撃間隔', en: 'Cooldown' }, desc: { ja: '−3%', en: '−3%' }, max: 5, base: 100 },
    { id: 'area', name: { ja: '攻撃範囲', en: 'Area' }, desc: { ja: '+5%', en: '+5%' }, max: 5, base: 80 },
    { id: 'dur', name: { ja: '効果時間', en: 'Duration' }, desc: { ja: '+5%', en: '+5%' }, max: 5, base: 80 },
    { id: 'magnet', name: { ja: '回収範囲', en: 'Pickup Range' }, desc: { ja: '+10%', en: '+10%' }, max: 5, base: 40 },
    { id: 'growth', name: { ja: '経験値', en: 'Experience' }, desc: { ja: '+5%', en: '+5%' }, max: 10, base: 80 },
    { id: 'regen', name: { ja: '自然回復', en: 'Regeneration' }, desc: { ja: '毎秒 0.1 回復', en: '+0.1 HP/s' }, max: 5, base: 150 },
    { id: 'luck', name: { ja: '運', en: 'Luck' }, desc: { ja: '+10%', en: '+10%' }, max: 5, base: 100 },
    { id: 'greed', name: { ja: '金貨', en: 'Ducats' }, desc: { ja: 'もらえる金貨 +10%', en: '+10% ducats' }, max: 5, base: 100 },
    { id: 'reroll', name: { ja: 'リロール', en: 'Reroll' }, desc: { ja: 'レベルアップの選び直し +1 回', en: '+1 level-up reroll' }, max: 3, base: 300 },
    { id: 'choices', name: { ja: '選択肢の数', en: 'Choices' }, desc: { ja: '候補 3 → 4', en: '3 → 4 choices' }, max: 1, base: 1000 },
    { id: 'revive', name: { ja: 'カーテンコール', en: 'Curtain Call' }, desc: { ja: '1 回だけ、力尽きても体力半分で復活', en: 'Revive once with half HP' }, max: 1, base: 2000 },
  ];

  // ---------- 画面の文言 ----------
  const TEXT = {
    gameTitle: { ja: '作曲家サバイバー', en: 'Composer Survivors' },
    backToGames: { ja: '‹ ゲーム一覧', en: '‹ Games' },
    subtitle: { ja: '曲の音符が、すべて敵になる。', en: 'Every note of the music is an enemy.' },
    start: { ja: 'はじめる', en: 'Start' },
    practice: { ja: '🎹 練習室', en: '🎹 Practice Room' },
    settings: { ja: '⚙ 設定', en: '⚙ Settings' },
    howto: { ja: '遊び方', en: 'How to Play' },
    back: { ja: '‹ 戻る', en: '‹ Back' },
    completion: { ja: '達成率', en: 'Completion' },
    chooseComposer: { ja: '作曲家をえらぶ', en: 'Choose a Composer' },
    chooseSong: { ja: '曲をえらぶ', en: 'Choose a Piece' },
    withThis: { ja: 'この作曲家で曲をえらぶ', en: 'Choose a piece with this composer' },
    startWeapon: { ja: '最初の楽器', en: 'Starting instrument' },
    trait: { ja: '個性', en: 'Trait' },
    hp: { ja: '体力', en: 'HP' },
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
    unlockedWeapon: { ja: '新しい楽器「{w}」がレベルアップの候補に出るようになりました', en: 'New instrument "{w}" can now appear at level-up' },
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

  window.CSData = { COMPOSERS, FUTURE_COMPOSERS, SONGS, WEAPONS, EVOS, PASSIVES, UPGRADES, TEXT };
})();
