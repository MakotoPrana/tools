// 作曲家サバイバー: ゲームのデータ (作曲家・曲集・曲・楽器・練習室・難しさ・画面の文言)
(() => {
  'use strict';

  // ---------- 作曲家 (自機) ----------
  // unlock: その曲集の 1 曲目を (どの作曲家でも) ノーマルの通しでクリアすると使える。null は最初から
  const COMPOSERS = [
    {
      id: 'beethoven', name: { ja: 'ベートーヴェン', en: 'Beethoven' }, unlock: null,
      trait: { ja: '不屈: 体力が半分を切ると、攻撃力 +30%', en: 'Indomitable: +30% power while below half HP' },
      colors: { coat: '#2d4a7a', hair: '#3b3330', scarf: '#c0392b', skin: '#f2c9a0' },
    },
    {
      id: 'mozart', name: { ja: 'モーツァルト', en: 'Mozart' }, unlock: null,
      trait: { ja: '神童: もらえる金貨 +20%', en: 'Child Prodigy: +20% ducats' },
      colors: { coat: '#b8323c', hair: '#f4f1ea', scarf: '#f5e6b8', skin: '#f6d2b0' },
    },
    {
      id: 'chopin', name: { ja: 'ショパン', en: 'Chopin' }, unlock: null,
      trait: { ja: 'ピアノの詩人: 弾を撃つ間隔 −10%', en: 'Poet of the Piano: −10% fire interval' },
      colors: { coat: '#20232b', hair: '#7a5236', scarf: '#ffffff', skin: '#f3d6bd' },
    },
    {
      id: 'bach', name: { ja: 'バッハ', en: 'Bach' }, unlock: 'bach',
      trait: { ja: 'フーガ: 4 回に 1 回、同じ弾が少し遅れてもう一度出る', en: 'Fugue: every 4th volley echoes a moment later' },
      colors: { coat: '#5b3a29', hair: '#eeeae0', scarf: '#f4efe4', skin: '#e9c3a0' },
    },
    {
      id: 'vivaldi', name: { ja: 'ヴィヴァルディ', en: 'Vivaldi' }, unlock: 'vivaldi',
      trait: { ja: '四季: 20 秒ごとに季節が変わる (春 攻撃 +25%・夏 連射 +25%・秋 金貨 +40%・冬 音符が遅い)', en: 'Four Seasons: every 20s the season changes (spring power, summer fire rate, autumn ducats, winter slows notes)' },
      colors: { coat: '#7a1f2b', hair: '#c0392b', scarf: '#f4efe4', skin: '#f2cfae' },
    },
    {
      id: 'tchaikovsky', name: { ja: 'チャイコフスキー', en: 'Tchaikovsky' }, unlock: 'tchaikovsky',
      trait: { ja: '1812 年: 一振りが 30% 早くたまり、威力 +50% (大砲の音)', en: '1812: the baton sweep charges 30% faster and hits 50% harder' },
      colors: { coat: '#2e3b4e', hair: '#d0d0d0', scarf: '#f4efe4', skin: '#f1cfb4' },
    },
    {
      id: 'debussy', name: { ja: 'ドビュッシー', en: 'Debussy' }, unlock: 'debussy',
      trait: { ja: '印象派: 弾が音符を 1 つ貫く。そのかわり攻撃力 −10%', en: 'Impressionist: shots pierce one note, −10% power' },
      colors: { coat: '#3d4b3a', hair: '#2b2420', scarf: '#d8c8a8', skin: '#efcfb0' },
    },
  ];

  // ---------- 曲集 ----------
  // need: 開く条件 [曲集, 何曲目] (その曲をどれかの難しさの通しでクリア)。power: 曲集の強さ (音符の硬さ・金貨の基準)
  const BOOKS = [
    { id: 'beginner', name: { ja: 'はじめての曲集', en: 'First Pieces' }, need: null, power: 0.6, color: '#7fb77e' },
    { id: 'beethoven', name: { ja: 'ベートーヴェン代表曲集', en: 'Beethoven Favorites' }, need: [['beginner', 3]], power: 7, color: '#2d4a7a' },
    { id: 'mozart', name: { ja: 'モーツァルト代表曲集', en: 'Mozart Favorites' }, need: [['beginner', 3]], power: 7, color: '#b8323c' },
    { id: 'chopin', name: { ja: 'ショパン代表曲集', en: 'Chopin Favorites' }, need: [['beginner', 3]], power: 7, color: '#6c5b7b' },
    { id: 'bach', name: { ja: 'バッハ代表曲集', en: 'Bach Favorites' }, need: [['beethoven', 3], ['mozart', 3], ['chopin', 3]], needAny: true, power: 60, color: '#8b5a2b' },
    { id: 'vivaldi', name: { ja: 'ヴィヴァルディ代表曲集', en: 'Vivaldi Favorites' }, need: [['beethoven', 3], ['mozart', 3], ['chopin', 3]], needAny: true, power: 60, color: '#c0392b' },
    { id: 'tchaikovsky', name: { ja: 'チャイコフスキー代表曲集', en: 'Tchaikovsky Favorites' }, need: [['bach', 3], ['vivaldi', 3]], needAny: true, power: 350, color: '#2e3b4e' },
    { id: 'debussy', name: { ja: 'ドビュッシー代表曲集', en: 'Debussy Favorites' }, need: [['bach', 3], ['vivaldi', 3]], needAny: true, power: 350, color: '#58a55c' },
  ];

  // ---------- 難しさ (1 つのステージに 3 段階) ----------
  // 難しさは主に「速さ」で上げる (音符を硬くしすぎない)。spd: 落ちる速さ、hp: 音符の硬さ、dmg: 受けるダメージ、reward: 金貨・経験値・素材
  const TIERS = [
    { id: 'normal', name: { ja: 'ノーマル', en: 'Normal' }, spd: 1, hp: 1, dmg: 1, reward: 1 },
    { id: 'hard', name: { ja: 'ハード', en: 'Hard' }, spd: 1.35, hp: 1.6, dmg: 1.5, reward: 2.5 },
    { id: 'virtuoso', name: { ja: 'ヴィルトゥオーソ', en: 'Virtuoso' }, spd: 1.75, hp: 2.5, dmg: 2, reward: 5 },
  ];

  // ---------- 曲 (ステージ) ----------
  // book: 曲集。no: 曲集の中の順番。score: scores/*.js の譜面
  const SONGS = [
    // ---- はじめての曲集 ----
    {
      id: 'k2', book: 'beginner', no: 1, score: 'k2',
      title: { ja: 'メヌエット ヘ長調 K. 2 (モーツァルト)', en: 'Minuet in F, K. 2 (Mozart)' },
      boss: { id: 'musicbox', ja: 'オルゴール', en: 'The Music Box', pattern: 'aimed', color: '#e8c070', glyph: '🎁' },
      trivia: {
        ja: 'モーツァルトが 6 歳 (1762 年) のころに作った小さなメヌエット。父レオポルトが楽譜に書きとめた。',
        en: 'A little minuet Mozart made up at age six (1762); his father Leopold wrote it down.',
      },
    },
    {
      id: 'laboureur', book: 'beginner', no: 2, score: 'laboureur',
      title: { ja: '楽しき農夫 (シューマン「子供のためのアルバム」)', en: 'The Happy Farmer (Schumann, Album for the Young)' },
      boss: { id: 'scarecrow', ja: '陽気なかかし', en: 'The Jolly Scarecrow', pattern: 'spread', color: '#c9a227', glyph: '🌾' },
      trivia: {
        ja: '1848 年、シューマンが子どもたちのために書いた「子供のためのアルバム」の 1 曲。仕事帰りの農夫の歌を、左手が歌う。',
        en: 'From the Album for the Young Schumann wrote for his children in 1848. The left hand sings the farmer\'s homeward song.',
      },
    },
    {
      id: 'petzold', book: 'beginner', no: 3, score: 'petzold',
      title: { ja: 'メヌエット ト長調 (アンナ・マクダレーナ・バッハの音楽帳)', en: 'Minuet in G (Anna Magdalena Notebook)' },
      boss: { id: 'metronome', ja: '銀のメトロノーム', en: 'The Silver Metronome', pattern: 'aimed', color: '#b8c4d6', glyph: '⏱' },
      trivia: {
        ja: '「アンナ・マクダレーナ・バッハのための音楽帳」(1725 年) にある有名なメヌエット。長くバッハの作と思われていたが、今はペツォールトの作とされる。',
        en: 'The famous minuet from the 1725 notebook for Anna Magdalena Bach. Long credited to Bach, it is now attributed to Christian Petzold.',
      },
    },
    {
      id: 'gymnopedie', book: 'beginner', no: 4, score: 'gymnopedie',
      title: { ja: 'ジムノペディ第 1 番 (サティ)', en: 'Gymnopédie No. 1 (Satie)' },
      boss: { id: 'cat', ja: '月夜の黒猫', en: 'The Moonlit Black Cat', pattern: 'spread', color: '#4a3f6b', glyph: '🐈‍⬛' },
      trivia: {
        ja: '1888 年の作品。ゆっくりした 3 拍子の静かな和音の上に、旋律がぽつりぽつりと浮かぶ。',
        en: 'From 1888: a slow, quiet waltz-time accompaniment with a melody that floats above it one note at a time.',
      },
    },
    {
      id: 'clementi', book: 'beginner', no: 5, score: 'clementi',
      title: { ja: 'ソナチネ ハ長調 Op. 36-1 第 1 楽章 (クレメンティ)', en: 'Sonatina in C, Op. 36 No. 1, I (Clementi)' },
      boss: { id: 'clocktower', ja: 'ソナチネの時計塔', en: 'The Sonatina Clock Tower', pattern: 'radial', color: '#8b6f47', glyph: '🕰' },
      trivia: {
        ja: 'クレメンティのソナチネ Op. 36 は、今もピアノを習う人がよく弾く 6 曲。その第 1 番の第 1 楽章。',
        en: 'Clementi\'s six Op. 36 sonatinas are still staples for piano students; this is the first movement of No. 1.',
      },
    },
    // ---- ベートーヴェン・モーツァルト・ショパン ----    // ベートーヴェン
    {
      id: 'elise', book: 'beethoven', no: 1, score: 'elise',
      title: { ja: 'エリーゼのために', en: 'Für Elise' },
      boss: { id: 'lady', ja: '謎の令嬢エリーゼ', en: 'The Mysterious Elise', pattern: 'aimed', color: '#9b59b6' },
      trivia: {
        ja: '1810 年ごろの作曲。「エリーゼ」がだれなのかは今もわかっていない。楽譜は作曲者の死後 40 年たってから見つかった。',
        en: 'Composed around 1810. Nobody knows for sure who "Elise" was; the score was found 40 years after his death.',
      },
    },
    {
      id: 'minuet', book: 'beethoven', no: 2, score: 'minuet',
      title: { ja: 'ピアノソナタ第20番 第2楽章「ト長調のメヌエット」', en: 'Piano Sonata No. 20, II. Tempo di Menuetto' },
      boss: { id: 'dancer', ja: '宮廷の踊り子', en: 'The Court Dancer', pattern: 'spread', color: '#e67fa8' },
      trivia: {
        ja: 'ベートーヴェンが若いころに書いた、やさしいソナタ (Op. 49-2) の終楽章。このメヌエットの主題は、のちに七重奏曲でも使われた。',
        en: 'The finale of an easy early sonata (Op. 49 No. 2). Beethoven later reused this minuet theme in his Septet.',
      },
    },
    {
      id: 'pathetique3', book: 'beethoven', no: 3, score: 'pathetique3',
      title: { ja: 'ピアノソナタ第8番「悲愴」第3楽章', en: 'Pathétique Sonata, III. Rondo' },
      boss: { id: 'carriage', ja: '嵐の馬車', en: 'The Storm Carriage', pattern: 'aimed', color: '#5b6e8c' },
      trivia: {
        ja: '1798 年、27 歳ごろの作品。「悲愴」という題はベートーヴェン自身がつけた数少ない題のひとつ。ハ短調のロンドが何度も戻ってくる。',
        en: 'Written around 1798. "Pathétique" is one of the few titles Beethoven chose himself; a C-minor rondo theme keeps returning.',
      },
    },
    {
      id: 'fate', book: 'beethoven', no: 4, score: 'fate',
      title: { ja: '交響曲第5番「運命」第1楽章 (ピアノ版)', en: 'Symphony No. 5, I. (piano reduction)' },
      boss: { id: 'door', ja: '運命の扉', en: 'The Door of Fate', pattern: 'radial', color: '#7a4a2a' },
      trivia: {
        ja: '「ジャジャジャジャーン」の 4 つの音が、楽章じゅうに形を変えて現れる。「運命はこのように扉を叩く」と言ったという話が伝わる。',
        en: 'The famous four-note motif reappears in endless forms. Legend has it Beethoven said, "Thus Fate knocks at the door."',
      },
    },
    {
      id: 'moonlight3', book: 'beethoven', no: 5, score: 'moonlight3',
      title: { ja: 'ピアノソナタ第14番「月光」第3楽章', en: 'Moonlight Sonata, III. Presto agitato' },
      boss: { id: 'moon', ja: '嵐の満月', en: 'The Stormy Full Moon', pattern: 'radial', color: '#f2e4a0' },
      trivia: {
        ja: '静かな第 1 楽章とは正反対の、嵐のような終楽章。「月光」という名前は、作曲者の死後に詩人がつけたもの。',
        en: 'The stormy opposite of the calm first movement. The nickname "Moonlight" was given by a poet after Beethoven\'s death.',
      },
    },
    {
      id: 'twinkle', book: 'mozart', no: 1, score: 'twinkle',
      title: { ja: 'きらきら星変奏曲', en: 'Twelve Variations on "Ah vous dirai-je, Maman"' },
      boss: { id: 'star', ja: 'きらきら星', en: 'The Twinkling Star', pattern: 'radial', color: '#f1c40f' },
      trivia: {
        ja: 'フランスの民謡「ああ、お母さん聞いて」をもとにした 12 の変奏曲 (1781〜82 年ごろ)。このゲームでは 6 分に収めるため、繰り返しを省いている。',
        en: 'Twelve variations (c. 1781–82) on a French song, the tune of "Twinkle, Twinkle". Repeats are omitted here to fit in six minutes.',
      },
    },
    {
      id: 'turkish', book: 'mozart', no: 2, score: 'turkish',
      title: { ja: 'ピアノソナタ第11番 第3楽章「トルコ行進曲」', en: 'Piano Sonata No. 11, III. Rondo alla Turca' },
      boss: { id: 'band', ja: '軍楽隊長', en: 'The Bandmaster', pattern: 'aimed', color: '#c0392b' },
      trivia: {
        ja: '当時ウィーンで流行していた、トルコの軍楽隊 (メフテル) の響きをまねた楽章。左手の打楽器のような和音がその名残。',
        en: 'Imitates the Turkish janissary bands then fashionable in Vienna; the drum-like left-hand chords are a nod to them.',
      },
    },
    {
      id: 'nacht', book: 'mozart', no: 3, score: 'nacht',
      title: { ja: 'アイネ・クライネ・ナハトムジーク 第1楽章', en: 'Eine kleine Nachtmusik, I. Allegro' },
      boss: { id: 'quartet', ja: '真夜中の弦楽四重奏', en: 'The Midnight Quartet', pattern: 'spread', color: '#3b4a7a' },
      trivia: {
        ja: '「小さな夜の音楽」という意味。弦楽のための曲で、このゲームでは 4 つの声部をピアノの音で鳴らしている。',
        en: '"A little night music", written for strings; here its four parts are played on the piano.',
      },
    },
    {
      id: 'fantasia', book: 'mozart', no: 4, score: 'fantasia',
      title: { ja: '幻想曲 ニ短調 K. 397', en: 'Fantasia in D minor, K. 397' },
      boss: { id: 'phantom', ja: '霧の中の幻影', en: 'The Phantom in the Mist', pattern: 'spread', color: '#8fa3b8' },
      trivia: {
        ja: '暗く即興的な序奏と、突然の速いパッセージ。最後は明るいニ長調で終わる。終わりの数小節は、ほかの人が書き足したと言われる。',
        en: 'A dark, improvisatory piece with sudden rapid flourishes that ends in bright D major; the last bars are thought to be by another hand.',
      },
    },
    {
      id: 'k457', book: 'mozart', no: 5, score: 'k457',
      title: { ja: 'ピアノソナタ第14番 ハ短調 第3楽章', en: 'Piano Sonata No. 14 in C minor, III.' },
      boss: { id: 'grey', ja: '灰色の使者', en: 'The Grey Messenger', pattern: 'aimed', color: '#7d7d86' },
      trivia: {
        ja: 'モーツァルトには珍しい、激しい短調のソナタ (1784 年)。何度も止まっては走り出す、緊張した終楽章。',
        en: 'One of Mozart\'s rare stormy minor-key sonatas (1784); a tense finale that keeps stopping and bursting forward.',
      },
    },
    {
      id: 'nocturne', book: 'chopin', no: 1, score: 'nocturne',
      title: { ja: 'ノクターン第2番', en: 'Nocturne Op. 9 No. 2' },
      boss: { id: 'candle', ja: 'サロンの燭台', en: 'The Salon Candelabra', pattern: 'spread', color: '#e67e22' },
      trivia: {
        ja: '20 歳ごろ (1830〜31 年) に書かれた、ショパンのいちばん有名な夜想曲。ゆったりした 12/8 拍子の上で、歌うような旋律が飾られていく。',
        en: 'Written around age 20 (1830–31), it is Chopin\'s most famous nocturne: a singing, ornamented melody over a gentle 12/8 lilt.',
      },
    },
    {
      id: 'minute', book: 'chopin', no: 2, score: 'minute',
      title: { ja: '子犬のワルツ', en: 'Minute Waltz' },
      boss: { id: 'puppy', ja: '子犬', en: 'The Puppy', pattern: 'radial', color: '#d9a066' },
      trivia: {
        ja: '自分のしっぽを追いかけてくるくる回る子犬を見て書いたと言われる。英語の「Minute」は「1 分」ではなく「小さな」という意味。',
        en: 'Said to depict a little dog chasing its tail. "Minute" means "small", not "sixty seconds".',
      },
    },
    {
      id: 'fantaisie', book: 'chopin', no: 3, score: 'fantaisie',
      title: { ja: '幻想即興曲', en: 'Fantaisie-Impromptu' },
      boss: { id: 'phantom', ja: '幻影', en: 'The Phantom', pattern: 'spread', color: '#b38fd9' },
      trivia: {
        ja: '右手の 16 分音符と左手の 3 連符がかみ合わない、独特のうねり。ショパンは生前この曲を出版せず、死後に世に出た。',
        en: 'Sixteenths against triplets give it its restless swirl. Chopin never published it; it appeared after his death.',
      },
    },
    {
      id: 'revolution', book: 'chopin', no: 4, score: 'revolution',
      title: { ja: '練習曲「革命」', en: 'Revolutionary Étude' },
      boss: { id: 'flame', ja: '革命の炎', en: 'The Flame of Revolution', pattern: 'radial', color: '#e8542f' },
      trivia: {
        ja: '左手が休みなく駆けめぐる練習曲。ワルシャワ蜂起が失敗したという知らせを聞いたころに書かれたと言われる。',
        en: 'A study for a relentless left hand, said to date from when Chopin heard of the failed Warsaw uprising.',
      },
    },
    {
      id: 'winterwind', book: 'chopin', no: 5, score: 'winterwind',
      title: { ja: '練習曲「木枯らし」', en: '"Winter Wind" Étude' },
      boss: { id: 'wind', ja: '木枯らし', en: 'The Winter Wind', pattern: 'spread', color: '#9cc9e8' },
      trivia: {
        ja: '静かな 4 小節の序奏のあと、右手が吹きすさぶ風のように上下に駆けめぐり、左手が行進曲のような主題を力強く鳴らす。',
        en: 'After four quiet bars, the right hand whirls up and down like a gale while the left hand hammers out a march-like theme.',
      },
    },
    // ---- バッハ ----
    {
      id: 'bwv846', book: 'bach', no: 1, score: 'bwv846',
      title: { ja: '平均律クラヴィーア曲集 第 1 巻 前奏曲第 1 番 ハ長調', en: 'Well-Tempered Clavier I, Prelude No. 1 in C' },
      boss: { id: 'arpeggio', ja: '光のアルペジオ', en: 'The Shining Arpeggio', pattern: 'radial', color: '#f2d16b', glyph: '✨' },
      trivia: {
        ja: '「平均律クラヴィーア曲集」第 1 巻 (1722 年) の最初の曲。分散和音だけでできていて、のちにグノーがこの上に「アヴェ・マリア」の旋律をのせた。',
        en: 'The opening piece of the Well-Tempered Clavier, Book I (1722), built entirely of broken chords; Gounod later laid his "Ave Maria" over it.',
      },
    },
    {
      id: 'invention1', book: 'bach', no: 2, score: 'invention1',
      title: { ja: 'インヴェンション第 1 番 ハ長調', en: 'Invention No. 1 in C' },
      boss: { id: 'twins', ja: '鏡の双子', en: 'The Mirror Twins', pattern: 'aimed', color: '#7fa6c9', glyph: '🪞' },
      trivia: {
        ja: 'バッハが息子のために書いた 2 声の練習曲集 (1723 年清書) の第 1 曲。右手の短い動機を、左手がまねして追いかける。',
        en: 'The first of the two-part inventions Bach wrote for his son (fair copy 1723). The left hand imitates the right hand\'s short motif.',
      },
    },
    {
      id: 'invention8', book: 'bach', no: 3, score: 'invention8',
      title: { ja: 'インヴェンション第 8 番 ヘ長調', en: 'Invention No. 8 in F' },
      boss: { id: 'clockbird', ja: 'ぜんまい仕掛けの鳥', en: 'The Clockwork Bird', pattern: 'spread', color: '#d98c5f', glyph: '🐦' },
      trivia: {
        ja: '同じ曲集の第 8 番。右手が分散和音で駆け上がる動機を、左手が少し遅れて追いかける。',
        en: 'No. 8 of the same set: the left hand chases the right hand\'s rising broken-chord figure a little behind.',
      },
    },
    {
      id: 'fugue2', book: 'bach', no: 4, score: 'fugue2',
      title: { ja: '平均律クラヴィーア曲集 第 1 巻 フーガ第 2 番 ハ短調', en: 'Well-Tempered Clavier I, Fugue No. 2 in C minor' },
      boss: { id: 'labyrinth', ja: '迷宮のフーガ', en: 'The Fugue Labyrinth', pattern: 'radial', color: '#6b5b95', glyph: '🌀' },
      trivia: {
        ja: '平均律第 1 巻の第 2 番のフーガ。3 つの声部が、同じ主題を順に歌いつないでいく。',
        en: 'The C-minor fugue from Book I: three voices take up the same subject one after another.',
      },
    },
    {
      id: 'italian', book: 'bach', no: 5, score: 'italian',
      title: { ja: 'イタリア協奏曲 第 1 楽章', en: 'Italian Concerto, I' },
      boss: { id: 'sun', ja: 'イタリアの太陽', en: 'The Italian Sun', pattern: 'radial', color: '#f39c12', glyph: '☀' },
      trivia: {
        ja: '1735 年に出版された、チェンバロ 1 台で協奏曲の響きを表した曲。2 段鍵盤の強弱で、独奏と合奏を描き分ける。',
        en: 'Published in 1735, it recreates a concerto on a single harpsichord, contrasting soloist and orchestra on its two keyboards.',
      },
    },
    // ---- ヴィヴァルディ ----
    {
      id: 'winter2', book: 'vivaldi', no: 1, score: 'winter2',
      title: { ja: '「四季」より 冬 第 2 楽章', en: 'The Four Seasons: Winter, II' },
      boss: { id: 'hearth', ja: '暖炉の火', en: 'The Hearth Fire', pattern: 'spread', color: '#e67e22', glyph: '🔥' },
      trivia: {
        ja: '「四季」(1725 年出版) の「冬」第 2 楽章。添えられたソネットでは、外の雨をよそに暖炉のそばで静かに過ごす様子が描かれる。',
        en: 'Winter\'s slow movement from The Four Seasons (1725). Its sonnet pictures quiet days by the fire while rain falls outside.',
      },
    },
    {
      id: 'spring1', book: 'vivaldi', no: 2, score: 'spring1',
      title: { ja: '「四季」より 春 第 1 楽章', en: 'The Four Seasons: Spring, I' },
      boss: { id: 'songbird', ja: '春の小鳥', en: 'The Spring Songbird', pattern: 'spread', color: '#7dcea0', glyph: '🐤' },
      trivia: {
        ja: '「春」第 1 楽章。春の訪れ、小鳥のさえずり、泉のせせらぎ、雷鳴が、ソネットのとおりに描かれる。',
        en: 'Spring arrives with birdsong, murmuring streams and a thunderstorm, just as its sonnet describes.',
      },
    },
    {
      id: 'autumn3', book: 'vivaldi', no: 3, score: 'autumn3',
      title: { ja: '「四季」より 秋 第 3 楽章「狩り」', en: 'The Four Seasons: Autumn, III "The Hunt"' },
      boss: { id: 'horn', ja: '狩りの角笛', en: 'The Hunting Horn', pattern: 'aimed', color: '#b9770e', glyph: '📯' },
      trivia: {
        ja: '「秋」第 3 楽章。夜明けに角笛と猟犬で獲物を追う、狩りの様子を描く。',
        en: 'Autumn\'s finale: hunters set out at dawn with horns and hounds in pursuit of their quarry.',
      },
    },
    {
      id: 'winter1', book: 'vivaldi', no: 4, score: 'winter1',
      title: { ja: '「四季」より 冬 第 1 楽章', en: 'The Four Seasons: Winter, I' },
      boss: { id: 'icestorm', ja: '氷の嵐', en: 'The Ice Storm', pattern: 'radial', color: '#aed6f1', glyph: '❄' },
      trivia: {
        ja: '「冬」第 1 楽章。凍える寒さ、足踏み、歯がガチガチ鳴る様子を、弦の刻みで描く。',
        en: 'Winter\'s first movement: freezing cold, stamping feet and chattering teeth, all painted by the strings.',
      },
    },
    {
      id: 'summer3', book: 'vivaldi', no: 5, score: 'summer3',
      title: { ja: '「四季」より 夏 第 3 楽章「嵐」', en: 'The Four Seasons: Summer, III "Storm"' },
      boss: { id: 'thundercloud', ja: '夏の雷雲', en: 'The Summer Thundercloud', pattern: 'radial', color: '#5d6d7e', glyph: '⛈' },
      trivia: {
        ja: '「夏」第 3 楽章。激しい雷雨とひょうが畑を打ちすえる、嵐の楽章。',
        en: 'Summer\'s finale: a violent thunderstorm and hail batter the fields.',
      },
    },
    // ---- チャイコフスキー ----
    {
      id: 'oldfrench', book: 'tchaikovsky', no: 1, score: 'oldfrench',
      title: { ja: '古いフランスの歌 (「子供のアルバム」)', en: 'Old French Song (Album for the Young)' },
      boss: { id: 'doll', ja: 'オルゴールの人形', en: 'The Music-Box Doll', pattern: 'spread', color: '#e6a0b4', glyph: '🎎' },
      trivia: {
        ja: '1878 年の「子供のアルバム」Op. 39 の 1 曲。古いフランスの歌をもとにした、もの悲しい旋律。',
        en: 'From the Album for the Young, Op. 39 (1878): a wistful melody based on an old French tune.',
      },
    },
    {
      id: 'woodensoldiers', book: 'tchaikovsky', no: 2, score: 'woodensoldiers',
      title: { ja: '木の兵隊の行進 (「子供のアルバム」)', en: 'March of the Wooden Soldiers (Album for the Young)' },
      boss: { id: 'toysoldier', ja: 'ブリキの隊長', en: 'The Toy Captain', pattern: 'aimed', color: '#c0392b', glyph: '🥁' },
      trivia: {
        ja: '同じ「子供のアルバム」から。おもちゃの兵隊が行進するような、軽い付点のリズム。',
        en: 'Also from the Album for the Young: crisp dotted rhythms like toy soldiers on parade.',
      },
    },
    {
      id: 'january', book: 'tchaikovsky', no: 3, score: 'january',
      title: { ja: '「四季」より 1 月「炉ばたにて」', en: 'The Seasons: January "At the Fireside"' },
      boss: { id: 'armchair', ja: '炉ばたの安楽椅子', en: 'The Fireside Armchair', pattern: 'spread', color: '#a04000', glyph: '🪑' },
      trivia: {
        ja: 'ピアノ曲集「四季」(1876 年) の 1 月。月ごとに詩が添えられ、1 月は暖炉のそばのまどろみを描く。',
        en: 'January from The Seasons (1876). Each month comes with a poem; January dozes by the fire.',
      },
    },
    {
      id: 'february', book: 'tchaikovsky', no: 4, score: 'february',
      title: { ja: '「四季」より 2 月「謝肉祭」', en: 'The Seasons: February "Carnival"' },
      boss: { id: 'mask', ja: '謝肉祭の仮面', en: 'The Carnival Mask', pattern: 'radial', color: '#8e44ad', glyph: '🎭' },
      trivia: {
        ja: '「四季」の 2 月「謝肉祭」。冬の終わりの、にぎやかなお祭り騒ぎ。',
        en: 'February in The Seasons: the boisterous carnival at winter\'s end.',
      },
    },
    {
      id: 'august', book: 'tchaikovsky', no: 5, score: 'august',
      title: { ja: '「四季」より 8 月「収穫の歌」', en: 'The Seasons: August "Harvest"' },
      boss: { id: 'sheaf', ja: '黄金の麦束', en: 'The Golden Sheaf', pattern: 'radial', color: '#d4ac0d', glyph: '🌾' },
      trivia: {
        ja: '「四季」の 8 月「収穫の歌」。刈り入れの忙しさを、休みなく駆ける 6/8 拍子で描く。',
        en: 'August in The Seasons: the bustle of the harvest in restless 6/8 time.',
      },
    },
    // ---- ドビュッシー ----
    {
      id: 'arabesque1', book: 'debussy', no: 1, score: 'arabesque1',
      title: { ja: 'アラベスク第 1 番', en: 'Arabesque No. 1' },
      boss: { id: 'vine', ja: '唐草の蔓', en: 'The Arabesque Vine', pattern: 'spread', color: '#58a55c', glyph: '🌿' },
      trivia: {
        ja: '若いドビュッシーの作品 (1888〜91 年ごろ)。流れる 3 連符が、唐草模様 (アラベスク) のように曲線を描く。',
        en: 'An early work (c. 1888–91): flowing triplets trace curves like an arabesque ornament.',
      },
    },
    {
      id: 'clairdelune', book: 'debussy', no: 2, score: 'clairdelune',
      title: { ja: '月の光 (ベルガマスク組曲)', en: 'Clair de Lune (Suite bergamasque)' },
      boss: { id: 'moon', ja: '月', en: 'The Moon', pattern: 'spread', color: '#dfe6f2' },
      trivia: {
        ja: '「ベルガマスク組曲」(1905 年出版) の第 3 曲。題はヴェルレーヌの詩「月の光」からとった。',
        en: 'The third piece of the Suite bergamasque (published 1905), named after Verlaine\'s poem "Clair de lune".',
      },
    },
    {
      id: 'arabesque2', book: 'debussy', no: 3, score: 'arabesque2',
      title: { ja: 'アラベスク第 2 番', en: 'Arabesque No. 2' },
      boss: { id: 'butterfly', ja: '戯れる蝶', en: 'The Playful Butterfly', pattern: 'aimed', color: '#e59866', glyph: '🦋' },
      trivia: {
        ja: '2 つのアラベスクの 2 曲目。軽やかでいたずらっぽい、跳ねるリズムの曲。',
        en: 'The second of the two Arabesques: light, playful and full of skipping rhythms.',
      },
    },
    {
      id: 'parfums', book: 'debussy', no: 4, score: 'parfums',
      title: { ja: '音と香りは夕暮れの大気に漂う (前奏曲集 第 1 巻)', en: 'Les sons et les parfums tournent dans l\'air du soir (Préludes I)' },
      boss: { id: 'dusk', ja: 'たそがれの花', en: 'The Twilight Flower', pattern: 'spread', color: '#c39bd3', glyph: '🌸' },
      trivia: {
        ja: '「前奏曲集」第 1 巻 (1910 年) の第 4 曲。題はボードレールの詩「夕べの諧調」の一節から。',
        en: 'No. 4 of Préludes, Book I (1910); the title is a line from Baudelaire\'s "Harmonie du soir".',
      },
    },
    {
      id: 'ventplaine', book: 'debussy', no: 5, score: 'ventplaine',
      title: { ja: '野を渡る風 (前奏曲集 第 1 巻)', en: 'Le vent dans la plaine (Préludes I)' },
      boss: { id: 'wind', ja: '野の風', en: 'The Wind on the Plain', pattern: 'radial', color: '#a9cce3' },
      trivia: {
        ja: '前奏曲集第 1 巻の第 3 曲。ささやくような速い音型が、平原を渡る風を描く。',
        en: 'No. 3 of Préludes, Book I: whispering rapid figures sketch the wind sweeping over the plain.',
      },
    },
  ];

  // ---------- 楽器 (タワー) ----------
  // 金貨で買う (同じ楽器をいくつも買える)。曲の中で最大 10 体を呼び出し、楽器は自分で動いて攻撃する
  // kind: 攻撃のしかた。dmg・cd (攻撃の間隔 秒)・range・hp (耐久)。格 3 と格 5 で攻撃が強くなる (desc の ★2・★3)
  const TOWERS = {
    piano: { name: { ja: 'ピアノ', en: 'Piano' }, kind: 'shot', price: 40, dmg: 6, cd: 0.5, range: 360, hp: 80,
      desc: { ja: '近くの音符を狙って撃つ。格 3 で 2 発、格 5 で 3 発が貫く', en: 'Fires at the nearest note. Grade 3: 2 shots, Grade 5: 3 piercing shots' } },
    flute: { name: { ja: 'フルート', en: 'Flute' }, kind: 'homing', price: 80, dmg: 4, cd: 0.7, range: 520, hp: 50,
      desc: { ja: '追いかける弾を 2 発。格 3 で 3 発、格 5 で 5 発', en: '2 homing shots. Grade 3: 3, Grade 5: 5' } },
    violin: { name: { ja: 'ヴァイオリン', en: 'Violin' }, kind: 'beam', price: 250, dmg: 9, cd: 1.0, range: 1400, hp: 60,
      desc: { ja: '真上へ光線。縦一列を貫く。格 3 で太く、格 5 で光線が残る', en: 'A beam straight up, piercing a whole column. Grade 3 wider, Grade 5 lingers' } },
    cello: { name: { ja: 'チェロ', en: 'Cello' }, kind: 'aura', price: 700, dmg: 4, cd: 0.5, range: 110, hp: 260,
      desc: { ja: 'まわりの音符を遅くして削る。とても硬い。格 3 で広く、格 5 でときどき凍らせる', en: 'Slows and wears down nearby notes. Very sturdy. Grade 3 wider, Grade 5 sometimes freezes' } },
    timpani: { name: { ja: 'ティンパニ', en: 'Timpani' }, kind: 'pulse', price: 2000, dmg: 14, cd: 1.8, range: 130, hp: 140,
      desc: { ja: '衝撃波で押し上げる。格 3 で 2 重、格 5 でしびれさせる', en: 'A shockwave that pushes notes back up. Grade 3 double, Grade 5 stuns' } },
    harp: { name: { ja: 'ハープ', en: 'Harp' }, kind: 'string', price: 6000, dmg: 10, cd: 0, range: 120, hp: 100,
      desc: { ja: '横に弦を張る。弦を通りぬける音符を削る。格 3 で 2 本、格 5 で長く', en: 'Strings a horizontal line that cuts notes passing through. Grade 3 two strings, Grade 5 longer' } },
    trumpet: { name: { ja: 'トランペット', en: 'Trumpet' }, kind: 'cone', price: 20000, dmg: 16, cd: 1.4, range: 240, hp: 90,
      desc: { ja: '上へ扇形に吹き、まとめて押し戻す。格 3 で 2 回、格 5 で広く', en: 'Blasts an upward cone with knockback. Grade 3 twice, Grade 5 wider' } },
    cymbal: { name: { ja: 'シンバル', en: 'Cymbals' }, kind: 'boomerang', price: 60000, dmg: 12, cd: 1.6, range: 560, hp: 90,
      desc: { ja: 'ブーメランのように飛んで戻る。行きも帰りも貫く。格 3 で 2 枚、格 5 で爆ぜる', en: 'Flies out and back like a boomerang, piercing both ways. Grade 3 two, Grade 5 bursts' } },
    organ: { name: { ja: 'パイプオルガン', en: 'Pipe Organ' }, kind: 'pillar', price: 200000, dmg: 60, cd: 2.4, range: 1400, hp: 160,
      desc: { ja: '画面で一番硬い音符に、パイプが突き上がる重い一撃。格 3 で 2 か所、格 5 で 3 か所', en: 'A pipe erupts under the toughest note on screen. Grade 3: 2 spots, Grade 5: 3' } },
    baton: { name: { ja: '指揮棒', en: 'Baton' }, kind: 'buff', price: 600000, dmg: 0, cd: 0, range: 220, hp: 120,
      desc: { ja: '攻撃しない。自分とまわりの楽器の攻撃力と速さを上げる。格 3・格 5 で効果が大きく', en: 'No attack. Boosts the power and speed of you and nearby instruments. Stronger at Grades 3 and 5' } },
  };
  const TOWER_IDS = Object.keys(TOWERS);
  // 同じ楽器をいくつも買える。2 つ目からは少しずつ高くなる
  const unitPrice = (id, owned) => Math.round(TOWERS[id].price * (1 + 1.0 * owned));
  const SELL_RATE = 0.4;

  // 楽器の格 (5 段階)。金貨と素材で上げる。格が上がると強くなり、レベルの上限も上がる
  const GRADES = [
    { name: { ja: '見習い', en: 'Novice' }, mul: 1, cap: 10 },
    { name: { ja: '団員', en: 'Member' }, mul: 1.5, cap: 20 },
    { name: { ja: '首席', en: 'Principal' }, mul: 2.2, cap: 30 },
    { name: { ja: '独奏者', en: 'Soloist' }, mul: 3.2, cap: 40 },
    { name: { ja: '巨匠', en: 'Maestro' }, mul: 4.6, cap: 50 },
  ];
  // 素材: 音符が落とす「音のかけら」6 色 (音符の色と同じ。強い音符ほど強い色) と、ボスが落とす「ボスの結晶」
  const MATS = [
    { id: 'w', name: { ja: '白のかけら', en: 'White Shard' }, col: '#f4f1ea' },
    { id: 'b', name: { ja: '青のかけら', en: 'Blue Shard' }, col: '#4a90e2' },
    { id: 'g', name: { ja: '緑のかけら', en: 'Green Shard' }, col: '#3cc46a' },
    { id: 'r', name: { ja: '赤のかけら', en: 'Red Shard' }, col: '#e5484d' },
    { id: 'p', name: { ja: '紫のかけら', en: 'Purple Shard' }, col: '#a15be6' },
    { id: 'k', name: { ja: '黒のかけら', en: 'Black Shard' }, col: '#141414' },
    { id: 'boss', name: { ja: 'ボスの結晶', en: 'Boss Crystal' }, col: '#ffd84a' },
  ];
  // 格を上げる値段 (いまの格 g = 1〜4 → g + 1)
  function gradeCost(id, g) {
    const base = Math.max(150, TOWERS[id].price);
    const coins = Math.round(base * [0, 2, 6, 18, 50][g]);
    const mats = [
      null,
      { w: 15, b: 6 },
      { b: 25, g: 12, r: 3 },
      { g: 40, r: 18, p: 5, boss: 1 },
      { r: 45, p: 20, k: 5, boss: 3 },
    ][g];
    return { coins, mats };
  }
  // 楽器のレベル (倒した音符の経験値で自然に上がる。上限は格で決まる)
  const expNeed = (lv) => Math.round(40 * Math.pow(1.25, lv));

  // ---------- 練習室 (自機の強化。作曲家ごと。金貨は共通) ----------
  // lv は 0〜max。値段は base × 1.16^lv
  const STATS = [
    { id: 'atk', name: { ja: '攻撃力', en: 'Power' }, max: 100, base: 12, desc: { ja: '弾の威力 ×1.065 (重なる)', en: 'Shot damage ×1.065 (compounding)' } },
    { id: 'rate', name: { ja: '連射', en: 'Fire Rate' }, max: 100, base: 15, desc: { ja: '撃つ間隔 −1.5%', en: '−1.5% fire interval' } },
    { id: 'ways', name: { ja: '弾の数', en: 'Spread' }, max: 96, base: 40, desc: { ja: '12 段ごとに弾が 1 本増える', en: '+1 shot every 12 levels' } },
    { id: 'hp', name: { ja: '体力', en: 'Max HP' }, max: 100, base: 10, desc: { ja: '+5', en: '+5' } },
    { id: 'def', name: { ja: '防御', en: 'Defense' }, max: 100, base: 18, desc: { ja: '受けるダメージ −0.7%', en: '−0.7% damage taken' } },
    { id: 'speed', name: { ja: '移動の速さ', en: 'Move Speed' }, max: 100, base: 8, desc: { ja: '+1%', en: '+1%' } },
    { id: 'crit', name: { ja: '会心', en: 'Critical' }, max: 100, base: 20, desc: { ja: '会心の出やすさ +0.5% (会心は 2.5 倍)', en: '+0.5% crit chance (crits deal 2.5×)' } },
    { id: 'magnet', name: { ja: '回収', en: 'Magnet' }, max: 100, base: 6, desc: { ja: '金貨を引き寄せる範囲 +3%', en: '+3% pickup range' } },
    { id: 'greed', name: { ja: '金運', en: 'Fortune' }, max: 100, base: 25, desc: { ja: 'もらえる金貨 +3%', en: '+3% ducats' } },
    { id: 'bomb', name: { ja: '一振り', en: 'Baton Sweep' }, max: 100, base: 22, desc: { ja: 'たまる速さ +1%・威力 +5%', en: '+1% charge speed, +5% power' } },
  ];
  const statCost = (st, lv) => Math.round(st.base * Math.pow(1.16, lv));

  // ---------- 画面の文言 ----------
  const TEXT = {
    gameTitle: { ja: '作曲家サバイバー', en: 'Composer Survivors' },
    subtitle: { ja: '降ってくる曲の音符を、作曲家と楽器で撃ち落とせ。', en: 'Shoot down the notes of the music as they rain down.' },
    backToGames: { ja: '‹ ゲーム一覧', en: '‹ Games' },
    play: { ja: '▶ 曲集をえらぶ', en: '▶ Choose a Songbook' },
    practice: { ja: '🎹 練習室', en: '🎹 Practice Room' },
    shop: { ja: '🎻 楽器店', en: '🎻 Instrument Shop' },
    loadout: { ja: '🎼 編成', en: '🎼 Ensemble' },
    settings: { ja: '⚙ 設定', en: '⚙ Settings' },
    howto: { ja: '遊び方', en: 'How to Play' },
    back: { ja: '‹ 戻る', en: '‹ Back' },
    composer: { ja: '作曲家', en: 'Composer' },
    locked: { ja: '未解禁', en: 'Locked' },
    unlockBook: { ja: '「{b}」の {n} 曲目をクリアすると開く', en: 'Clear piece {n} of "{b}" to unlock' },
    unlockBookAny: { ja: '{b} のどれかで {n} 曲目をクリアすると開く', en: 'Clear piece {n} of any of: {b}' },
    unlockComposer: { ja: '「{b}」の 1 曲目をクリアすると仲間になる', en: 'Joins when you clear piece 1 of "{b}"' },
    unlockSong: { ja: '前の曲を通しでクリアすると開く', en: 'Clear the previous piece (full) to unlock' },
    unlockTier: { ja: '1 つ下の難しさをクリアすると開く', en: 'Clear the tier below to unlock' },
    full: { ja: '通し', en: 'Full' },
    part: { ja: 'パート {n}', en: 'Part {n}' },
    bars: { ja: '{a}〜{b} 小節', en: 'bars {a}–{b}' },
    bossOnlyFull: { ja: 'ボスは通しでだけ出る', en: 'The boss appears only in full runs' },
    notes: { ja: '音符', en: 'Notes' },
    length: { ja: '長さ', en: 'Length' },
    boss: { ja: 'ボス', en: 'Boss' },
    trivia: { ja: '曲のこと', en: 'About the piece' },
    start: { ja: '▶ 開演', en: '▶ Start' },
    ducats: { ja: '金貨', en: 'Ducats' },
    exp: { ja: '経験値', en: 'EXP' },
    lv: { ja: 'Lv', en: 'Lv' },
    max: { ja: '最大', en: 'MAX' },
    buy: { ja: '買う', en: 'Buy' },
    owned: { ja: '持っている', en: 'Owned' },
    upgrade: { ja: '強化', en: 'Upgrade' },
    evolve: { ja: '進化', en: 'Evolve' },
    evoNeed: { ja: '能力の合計 {n} で進化できる', en: 'Evolves at total level {n}' },
    party: { ja: '呼び出す楽器 ({n}/{m})', en: 'Ensemble ({n}/{m})' },
    inParty: { ja: '呼ぶ', en: 'In ensemble' },
    notInParty: { ja: '呼ばない', en: 'Benched' },
    partyFull: { ja: '呼び出せるのは {m} 体まで', en: 'Up to {m} instruments' },
    grade: { ja: '格', en: 'Grade' },
    gradeUp: { ja: '格を上げる', en: 'Raise grade' },
    sell: { ja: '売る', en: 'Sell' },
    sellConfirm: { ja: 'もう一度押すと売る', en: 'Tap again to sell' },
    buyTab: { ja: '買う', en: 'Buy' },
    unitsTab: { ja: '持っている楽器', en: 'Your instruments' },
    materials: { ja: '素材', en: 'Materials' },
    matsEarned: { ja: '拾った素材', en: 'Materials found' },
    levelUps: { ja: 'レベルが上がった楽器', en: 'Instruments that leveled up' },
    ownedN: { ja: '{n} 体', en: '×{n}' },
    noUnits: { ja: '楽器を持っていない。「買う」から', en: 'No instruments yet. Buy some first.' },
    summonHint: { ja: '楽器は自分で動いて攻撃する。壊れても 15 秒でまた呼び出される', en: 'Instruments move and attack on their own. Broken ones return after 15s.' },
    equip: { ja: '装備 (自機と一緒に撃つ)', en: 'Equipped (fly with you)' },
    deploy: { ja: '配置 (曲の中で置ける)', en: 'Deployable (place during play)' },
    empty: { ja: '空き', en: 'Empty' },
    choose: { ja: 'えらぶ', en: 'Choose' },
    remove: { ja: 'はずす', en: 'Remove' },
    practiceNote: { ja: '強化は作曲家ごと。金貨は全員共通', en: 'Upgrades are per composer. Ducats are shared.' },
    shopNote: { ja: '同じ楽器をいくつも買える (全員で共通)。曲の中で最大 10 体を呼び出すと、自分で動いて攻撃する。敵を倒すとレベルが上がり、金貨と素材で格 (5 段階) を上げる', en: 'Buy as many as you like (shared by all composers). Up to 10 join each piece and fight on their own. They level up from defeated notes; raise their grade (5 steps) with ducats and materials.' },
    loadoutNote: { ja: '装備は 2 つ (自機の左右について撃つ)。配置は 3 つ (曲の中で好きな場所に置く。音符に当たると壊れ、少しすると置き直せる)', en: '2 equipped (fly beside you) and 3 deployable (place them during play; they break when hit and can be redeployed later).' },
    paused: { ja: '一時停止', en: 'Paused' },
    resume: { ja: '再開', en: 'Resume' },
    quit: { ja: 'やめる', en: 'Quit' },
    retry: { ja: 'もう一度', en: 'Retry' },
    toSongs: { ja: '曲えらびへ', en: 'Piece Select' },
    toPractice: { ja: '練習室へ', en: 'Practice Room' },
    bravo: { ja: 'ブラヴォー!', en: 'Bravo!' },
    failed: { ja: '演奏中断…', en: 'Performance Interrupted…' },
    progress: { ja: '弾けたところ', en: 'Progress' },
    defeated: { ja: '倒した音符', en: 'Notes defeated' },
    leaked: { ja: '通した音符', en: 'Notes let through' },
    earned: { ja: 'もらった金貨', en: 'Ducats earned' },
    expEarned: { ja: '楽器の経験値', en: 'Instrument EXP' },
    newUnlock: { ja: '解禁!', en: 'Unlocked!' },
    bossIncoming: { ja: 'ボス登場! 倒せばクリア', en: 'The boss appears! Defeat it to clear' },
    sweep: { ja: '一振り', en: 'Sweep' },
    sweepReady: { ja: '一振りの準備ができた (Space / ボタン)', en: 'Baton sweep ready (Space / button)' },
    deployHint: { ja: '置く場所をタップ', en: 'Tap where to place it' },
    deployArea: { ja: '画面の下半分に置ける', en: 'Place it in the lower half' },
    broken: { ja: '壊れた', en: 'Broken' },
    moveHint: { ja: 'ドラッグ (矢印キー / WASD) で動く。弾は自動', en: 'Drag (arrow keys / WASD) to move. You fire automatically' },
    bgmVol: { ja: '曲の音量', en: 'Music volume' },
    seVol: { ja: '効果音の音量', en: 'Sound effects' },
    shake: { ja: '画面の揺れ', en: 'Screen shake' },
    on: { ja: 'オン', en: 'On' },
    off: { ja: 'オフ', en: 'Off' },
    erase: { ja: 'セーブデータを消去', en: 'Erase save data' },
    eraseConfirm: { ja: '本当に消去しますか? 金貨・強化・楽器・記録がすべて消えます。', en: 'Really erase? All ducats, upgrades, instruments and records will be lost.' },
    testMode: { ja: 'テスト版: 全部の曲集・曲・難しさ・作曲家を選べます', en: 'Test build: all songbooks, pieces, tiers and composers unlocked' },
    testCoins: { ja: '金貨 +100 万 (テスト)', en: '+1M ducats (test)' },
    tapToStart: { ja: 'タップ / クリックで音が鳴ります', en: 'Tap / click to enable sound' },
    cleared: { ja: 'クリア', en: 'Cleared' },
    best: { ja: '最高', en: 'Best' },
    hp: { ja: '体力', en: 'HP' },
    total: { ja: '合計', en: 'Total' },
    hintStruggle: { ja: '負けても金貨はもらえる。練習室で強くなってから、もう一度挑もう', en: 'You keep the ducats even when you fail. Train in the Practice Room and try again.' },
  };

  window.CSData = { COMPOSERS, BOOKS, TIERS, SONGS, TOWERS, TOWER_IDS, unitPrice, SELL_RATE, GRADES, MATS, gradeCost, expNeed, MAX_PARTY: 10, STATS, statCost, TEXT };
})();
