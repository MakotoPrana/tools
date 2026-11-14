/*
 * 指揮棒ベートーヴェン: ステージ・敵・ボスのデータ (絵の描き方は game.js)
 *
 * 敵の見た目 (look):
 *   body: 'tail' 燕尾服 / 'round' 太め / 'coat' 長い上着 / 'robe' 長衣 / 'tunic' 短い上着
 *   hat: 'top' シルクハット / 'bowler' 山高帽 / 'slick' なでつけ髪 / 'bicorne' 二角帽 / 'bearskin' 熊毛帽 /
 *        'shako' 筒形の軍帽 / 'tricorn' 三角帽 / 'jester' 道化帽 / 'halo' 天使の輪 / 'wig' 白いかつら / 'bald' / 'longhair'
 *   mask: 'bauta' 白い仮面 / 'domino' 目元の黒い仮面
 *   weapon: 'cane' ステッキ / 'tray' 銀のお盆 / 'umbrella' 傘 / 'musket' 銃剣 / 'saber' サーベル / 'halberd' 斧槍 /
 *           'quill' 羽根ペン / 'lyre' 竪琴 / 'drum' ばち / 'rapier' 細剣 / 'violin' ヴァイオリンの弓 / 'sword' 剣
 *   shield: 'umbrella' / 'tray' / 'cape' マント / 'drum' 太鼓 / 'buckler' 丸盾 / 'book' 楽譜の本 / 'violin'
 *   その他: fat 太さ、wings 羽、ghost 半透明に光る、statue 石像、stache ひげ、monocle 片めがね、sash たすき、plume 羽根飾り
 *
 * 敵の動き (base): gent ふつう / butler 速い (通常攻撃が多い) / heavy 遅くて硬い (ため攻撃と防御が多い)
 */
(() => {
  'use strict';

  const BASE = {
    gent: { hp: 55, speed: 115, reach: 105, dmgN: 9, dmgC: 20, w: { normal: 4, charge: 2.5, guard: 3, wait: 2 } },
    butler: { hp: 42, speed: 165, reach: 100, dmgN: 8, dmgC: 17, w: { normal: 6, charge: 1.5, guard: 2, wait: 1.5 } },
    heavy: { hp: 120, speed: 75, reach: 115, dmgN: 12, dmgC: 26, w: { normal: 2, charge: 4, guard: 4, wait: 2 } },
  };

  const ENEMIES = {
    // 1: 英国紳士
    gent: { base: 'gent', name: '紳士', lines: ['Jolly good!', 'Tally-ho!', '失敬!', 'お茶の時間だ'],
      look: { body: 'tail', coat: '#25304d', pants: '#3a3a44', tie: '#7a1f2b', hat: 'top', hatColor: '#0e0e12', band: '#7a1f2b', stache: '#c9b9a0', monocle: true, weapon: 'cane', shield: 'umbrella', shieldColor: '#15151a' } },
    butler: { base: 'butler', name: '執事', lines: ['お引き取りを', 'Indeed.', '銀のお盆を!'],
      look: { body: 'tail', fat: 0.9, coat: '#121216', pants: '#22222a', bow: '#111', hat: 'slick', hatColor: '#2a2018', gloves: '#f4f4f4', weapon: 'tray', shield: 'tray' } },
    heavy: { base: 'heavy', name: '伯爵', lines: ['By Jove!', 'けしからん!', 'ふん!'],
      look: { body: 'round', fat: 1.35, coat: '#6b4a2e', pants: '#4a3a2a', tie: '#3b6a3b', hat: 'bowler', hatColor: '#2a2018', stache: '#c9b9a0', watch: true, weapon: 'umbrella', weaponColor: '#1a1a1a', shield: 'umbrella', shieldColor: '#3a2a3a' } },

    // 2: ナポレオン軍
    drummer: { base: 'gent', name: '鼓手', lines: ['En avant!', '進め!', 'ドン!'],
      look: { body: 'tunic', coat: '#203a8a', pants: '#f0ece0', facing: '#c8202a', hat: 'shako', hatColor: '#111', plume: '#c8202a', weapon: 'drum', shield: 'drum', sash: '#f0ece0' } },
    hussar: { base: 'butler', name: '軽騎兵', lines: ['Vive l\'Empereur!', '突撃!', 'Allez!'],
      look: { body: 'tunic', fat: 0.9, coat: '#2c7a3a', pants: '#c8202a', facing: '#e6c35a', hat: 'shako', hatColor: '#c8202a', plume: '#fff', stache: '#3a2a1a', weapon: 'saber', shield: 'cape', shieldColor: '#2c7a3a' } },
    grenadier: { base: 'heavy', name: '擲弾兵', lines: ['Grognard!', 'ここは通さん', 'Halte!'],
      look: { body: 'coat', fat: 1.25, coat: '#203a8a', pants: '#f0ece0', facing: '#f0ece0', hat: 'bearskin', hatColor: '#151515', plume: '#c8202a', stache: '#2a1a10', weapon: 'musket', shield: 'buckler', shieldColor: '#5a4a3a', sash: '#f0ece0' } },

    // 3: ヴェネツィアの仮面舞踏会
    bauta: { base: 'gent', name: '仮面の客', lines: ['Buonasera...', '今宵は無礼講', 'ふふふ'],
      look: { body: 'robe', coat: '#1a1420', pants: '#1a1420', hat: 'tricorn', hatColor: '#111', mask: 'bauta', weapon: 'rapier', shield: 'cape', shieldColor: '#3a1030' } },
    harlequin: { base: 'butler', name: 'アルレッキーノ', lines: ['Ahi!', 'ひょいっと', 'あはは!'],
      look: { body: 'tunic', fat: 0.85, coat: 'harlequin', pants: 'harlequin', hat: 'jester', hatColor: '#c8202a', mask: 'domino', weapon: 'cane', weaponColor: '#c89a30', shield: 'cape', shieldColor: '#2c7a3a' } },
    doge: { base: 'heavy', name: '総督の衛兵', lines: ['止まれ!', 'Alt!', '総督の御前だ'],
      look: { body: 'coat', fat: 1.2, coat: '#8a1a24', pants: '#2a1a1a', facing: '#e6c35a', hat: 'tricorn', hatColor: '#111', plume: '#e6c35a', stache: '#2a1a10', weapon: 'halberd', shield: 'buckler', shieldColor: '#a07a30' } },

    // 4: パリのオペラ座
    critic: { base: 'gent', name: '批評家', lines: ['退屈だね', '酷評してやる', '凡庸!'],
      look: { body: 'tail', coat: '#3a2a4a', pants: '#2a2030', tie: '#e6e0f0', hat: 'wig', hatColor: '#e8e6f0', monocle: true, weapon: 'quill', shield: 'book', shieldColor: '#5a1a1a' } },
    dancer: { base: 'butler', name: 'バレエの踊り手', lines: ['Plié!', 'アン・ドゥ・トロワ', 'Jeté!'],
      look: { body: 'tunic', fat: 0.8, coat: '#f0b8d0', pants: '#f4eef4', hat: 'slick', hatColor: '#3a2a1a', weapon: 'none', shield: 'cape', shieldColor: '#f0b8d0', tutu: true } },
    bouncer: { base: 'heavy', name: '劇場の用心棒', lines: ['チケットは?', '帰んな', 'うおお'],
      look: { body: 'round', fat: 1.45, coat: '#2a2a2a', pants: '#1a1a1a', tie: '#8a1a24', hat: 'bald', stache: '#1a1a1a', weapon: 'cane', weaponColor: '#3a2a1a', shield: 'buckler', shieldColor: '#3a3a3a' } },

    // 5: 天上の音楽堂
    cherub: { base: 'butler', name: '智天使', lines: ['ラララ♪', 'ハレルヤ!', 'えいっ'],
      look: { body: 'robe', fat: 0.8, coat: '#e88aa8', pants: '#e88aa8', sash: '#ffd84a', hat: 'halo', hatColor: '#ffb020', wings: true, weapon: 'lyre', shield: 'cape', shieldColor: '#c86a98' } },
    phantom: { base: 'gent', name: '亡霊の楽士', lines: ['…♪', 'もう一曲…', 'まだ弾ける…'],
      look: { body: 'tail', coat: '#3a4a7a', pants: '#2a3050', tie: '#e8e6f0', hat: 'wig', hatColor: '#e8e6f0', ghost: true, weapon: 'violin', shield: 'violin' } },
    statue: { base: 'heavy', name: '騎士長の石像', lines: ['悔い改めよ…', 'ドン・ジョヴァンニ!', '……'],
      look: { body: 'coat', fat: 1.3, coat: '#9a9a96', pants: '#8a8a86', hat: 'none', statue: true, stache: '#8a8a86', weapon: 'sword', shield: 'buckler', shieldColor: '#7a7a76' } },
  };

  // ボス: move = 技の重み、shot = 投げる物の絵、summon = 後半に呼ぶ敵
  const BOSSES = {
    marie: { name: '王妃 マリー・アントワネット', hp: 1200, speed: 110, reach: 135, dmgN: 11, dmgC: 24, draw: 'marie',
      shot: 'cake', reflect: 'お菓子が顔に！', spinName: 'ドレス回転', summon: ['gent', 'butler'],
      intro: 'パンがなければ、お菓子を召し上がれ！', phase2: 'まあ！ なんて無作法な方！ 紳士の皆さま、お助けになって！', defeat: 'あら…なんて素敵な音楽…',
      hint: 'マリー・アントワネット: ケーキも拍の上で落ちる。ジャストガードで打ち返せ！' },
    napoleon: { name: '皇帝 ナポレオン', hp: 1300, speed: 120, reach: 135, dmgN: 12, dmgC: 26, draw: 'look', scale: 1.3,
      look: { body: 'coat', coat: '#4a4a52', pants: '#f0ece0', facing: '#203a8a', hat: 'bicorne', hatColor: '#111', weapon: 'saber', shield: 'cape', shieldColor: '#3a3a42', sash: '#c8202a', boots: true },
      shot: 'cannon', reflect: '砲弾が跳ね返った！', spinName: '騎兵突撃', summon: ['grenadier', 'hussar'],
      intro: '余の辞書に「不可能」の文字はない！', phase2: '近衛兵！ この楽聖を止めよ！', defeat: '…英雄は、音楽の中にいたか…',
      hint: 'ナポレオン: 砲弾は拍の上で落ちる。ジャストガードで跳ね返せ！' },
    casanova: { name: '色男 カサノヴァ', hp: 1400, speed: 150, reach: 140, dmgN: 11, dmgC: 24, draw: 'look', scale: 1.25,
      look: { body: 'coat', coat: '#a01a3a', pants: '#f0ece0', facing: '#e6c35a', hat: 'tricorn', hatColor: '#1a1a1a', plume: '#fff', mask: 'domino', weapon: 'rapier', shield: 'cape', shieldColor: '#3a0a1a' },
      shot: 'rose', reflect: '薔薇の棘が刺さった！', spinName: 'フレッシュ', summon: ['harlequin', 'bauta'], fastCombo: true,
      intro: '今宵、あなたの心も奪ってみせよう', phase2: 'おや、本気にさせたね。皆、踊ろう！', defeat: 'これほど心を奪われたのは…初めてだ',
      hint: 'カサノヴァ: 細剣の連続突きは速い。拍ごとに防御を押し直せ！' },
    paganini: { name: '悪魔のヴァイオリン弾き パガニーニ', hp: 1500, speed: 130, reach: 140, dmgN: 12, dmgC: 27, draw: 'look', scale: 1.3,
      look: { body: 'tail', fat: 0.85, coat: '#141418', pants: '#141418', tie: '#e8e6f0', hat: 'longhair', hatColor: '#141414', weapon: 'violin', shield: 'violin', pale: true },
      shot: 'note', reflect: '音符が跳ね返った！', spinName: '悪魔のトリル', summon: ['critic', 'dancer'], fastCombo: true, comboLen: 4,
      intro: '悪魔に魂を売った音、聴かせてやろう', phase2: '弦が一本切れた…だが、一本で十分だ！', defeat: '…あなたこそ、本物の悪魔だ',
      hint: 'パガニーニ: 4 連続の弓さばき。最後まで拍ごとに防げ！' },
    mozart: { name: 'モーツァルトの幻影', hp: 1700, speed: 140, reach: 140, dmgN: 13, dmgC: 28, draw: 'look', scale: 1.3,
      look: { body: 'coat', coat: '#b01a2a', pants: '#f0ece0', facing: '#e6c35a', hat: 'wig', hatColor: '#f4f2f8', weapon: 'quill', shield: 'book', shieldColor: '#3a2a1a', ghost: true },
      shot: 'note', reflect: '音符が跳ね返った！', spinName: 'レクイエム', summon: ['cherub', 'phantom'], fastCombo: true, comboLen: 4,
      intro: 'やあ、ルートヴィヒ。君の音を聴かせておくれ', phase2: 'すばらしい！ でも、まだまだ！', defeat: 'ブラヴォー…君の時代だ、ルートヴィヒ',
      hint: 'モーツァルト: すべての技を使ってくる。曲をよく聴け！' },
  };

  // ステージ。曲は window.BB_SONGS (自前の譜面) か window.CS_SCORES (作曲家サバイバーの譜面) から
  const STAGES = [
    {
      no: 1, name: 'ウィーンの夕暮れ', place: 'ウィーン',
      road: { song: 'k545', bg: 'vienna', len: 4500, hp: 1,
        waves: [
          { x: 760, list: ['gent'], hint: 'メロディに合わせて J (Z) で攻撃！ 16 分音符は連打で。合うほど派手になる' },
          { x: 1500, list: ['gent', 'gent'], hint: '敵の「!」は拍の上で来る。ぴったり K (X) で構えると PERFECT JUST → カデンツァ！' },
          { x: 2250, list: ['heavy', 'butler'], hint: '傘で防ぐ敵には、J 長押しの「ため攻撃」で防御くずし！ 離した瞬間を拍に' },
          { x: 3000, list: ['gent', 'butler', 'heavy'], hint: '赤く光る「!!」はため攻撃。出かかりを通常攻撃でつぶせ！' },
          { x: 3750, list: ['heavy', 'gent', 'butler', 'gent', 'butler'] },
        ] },
      boss: { song: 'k467', bg: 'versailles', type: 'marie', place: 'ヴェルサイユ宮殿 ― 鏡の間' },
    },
    {
      no: 2, name: 'ナポレオン軍の進駐', place: 'シェーンブルン宮殿',
      road: { song: 'cs:turkish', title: 'ピアノソナタ第11番 K.331「トルコ行進曲」', composer: 'モーツァルト', bg: 'schonbrunn', len: 4700, hp: 1.15,
        waves: [
          { x: 760, list: ['drummer', 'drummer'] },
          { x: 1500, list: ['hussar', 'drummer', 'hussar'] },
          { x: 2300, list: ['grenadier', 'drummer'] },
          { x: 3100, list: ['hussar', 'grenadier', 'hussar', 'drummer'] },
          { x: 3950, list: ['grenadier', 'grenadier', 'hussar', 'drummer', 'hussar'] },
        ] },
      boss: { song: 'cs:fate', title: '交響曲第5番「運命」第1楽章', composer: 'ベートーヴェン', bg: 'battlefield', type: 'napoleon', place: 'ヴァグラムの丘 ― 戦場' },
    },
    {
      no: 3, name: 'ヴェネツィアの仮面舞踏会', place: 'ヴェネツィア',
      road: { song: 'cs:spring1', title: '「四季」より「春」第1楽章', composer: 'ヴィヴァルディ', bg: 'venice', len: 4700, hp: 1.3,
        waves: [
          { x: 760, list: ['bauta', 'harlequin'] },
          { x: 1500, list: ['harlequin', 'harlequin', 'bauta'] },
          { x: 2300, list: ['doge', 'bauta', 'harlequin'] },
          { x: 3100, list: ['doge', 'harlequin', 'bauta', 'harlequin'] },
          { x: 3950, list: ['doge', 'doge', 'bauta', 'harlequin', 'harlequin'] },
        ] },
      boss: { song: 'cs:summer3', title: '「四季」より「夏」第3楽章「嵐」', composer: 'ヴィヴァルディ', bg: 'piazza', type: 'casanova', place: 'サン・マルコ広場 ― 嵐の夜' },
    },
    {
      no: 4, name: 'パリのオペラ座', place: 'パリ',
      road: { song: 'cs:italian', title: 'イタリア協奏曲 第1楽章 BWV 971', composer: 'バッハ', bg: 'opera', len: 4700, hp: 1.45,
        waves: [
          { x: 760, list: ['critic', 'dancer'] },
          { x: 1500, list: ['dancer', 'critic', 'dancer'] },
          { x: 2300, list: ['bouncer', 'critic', 'dancer'] },
          { x: 3100, list: ['bouncer', 'dancer', 'critic', 'dancer'] },
          { x: 3950, list: ['bouncer', 'bouncer', 'critic', 'dancer', 'critic'] },
        ] },
      boss: { song: 'cs:winter1', title: '「四季」より「冬」第1楽章', composer: 'ヴィヴァルディ', bg: 'stage', type: 'paganini', place: 'オペラ座 ― 大舞台' },
    },
    {
      no: 5, name: '天上の音楽堂', place: '雲の上',
      road: { song: 'cs:k457', title: 'ピアノソナタ第14番 K.457 第3楽章', composer: 'モーツァルト', bg: 'heaven', len: 4900, hp: 1.6,
        waves: [
          { x: 760, list: ['cherub', 'cherub', 'phantom'] },
          { x: 1500, list: ['phantom', 'cherub', 'phantom'] },
          { x: 2300, list: ['statue', 'cherub', 'cherub'] },
          { x: 3100, list: ['statue', 'phantom', 'cherub', 'phantom'] },
          { x: 3950, list: ['statue', 'statue', 'phantom', 'cherub', 'cherub', 'phantom'] },
        ] },
      boss: { song: 'cs:moonlight3', title: 'ピアノソナタ第14番「月光」第3楽章', composer: 'ベートーヴェン', bg: 'organ', type: 'mozart', place: '天上の大オルガン' },
    },
  ];

  window.BB_STAGES = { BASE, ENEMIES, BOSSES, STAGES };
})();
