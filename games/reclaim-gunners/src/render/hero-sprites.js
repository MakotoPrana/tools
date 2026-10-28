// 主人公 3 人のドット絵 (スプライト)
//   1 文字 = 1 ドット。向きは 下 (正面) / 上 (背中) / 横 (右向き。左向きは反転して使う)
//   正面と背中は左半分 (8 列) だけ書いて、左右を反転してつなげる
//   上半身 (頭と胴) と脚を分けて書き、脚を動かして歩きのコマを作る:
//     止まっているとき 2 コマ (息で上半身が 1 ドット上下する) / 歩き 4 コマ (脚を交互に上げ、上半身が弾む)
//   色の文字: k 輪郭 / s 肌 S 肌の影 / e 目 w 目の光 / h 髪 H 髪の影 / c 服 C 服の影 / a 差し色
//             t 帽子 T 帽子の影 / m 金属 M 金属の影 / B ベルト / p ズボン / b 靴 / . 透明

const COMMON = { k: '#1a1220', s: '#f1d3b0', S: '#c99a76', e: '#2a1a1a', w: '#ffffff', B: '#4a3020', b: '#3a2a22' };
const PAL = {
  kai: { h: '#6a4024', H: '#45280f', c: '#4a7fd4', C: '#2f5aa0', a: '#e8c46a', p: '#2a2a3a' },
  mira: { h: '#d8d0f0', H: '#9c90c4', c: '#a35ad8', C: '#6e34a2', a: '#7fe3ff', t: '#3a2a5a', T: '#24163a', p: '#4a2470' },
  gald: { h: '#8a5a3a', H: '#5e3a22', c: '#c9623a', C: '#8e3e1c', a: '#d9d2c0', m: '#c4beb6', M: '#7a7470', p: '#3a2a22' },
};

// 上半身 (正面・背中は左半分だけ)
const UPPER = {
  kai: {
    down: [
      '.....kkk',
      '....khhh',
      '...khhhh',
      '...kaaaa',
      '...khsss',
      '...ksews',
      '...kssss',
      '....kssS',
      '.....kks',
      '..kkccca',
      '.kccccca',
      '.kcCccca',
      '.kcCccca',
      '.ksCBBBB',
      '.kkcccca',
      '..kcccck',
    ],
    up: [
      '.....kkk',
      '....khhh',
      '...khhhh',
      '...kaaaa',
      '...khhhh',
      '...khhhh',
      '...khhhH',
      '....khhh',
      '.....kks',
      '..kkcccc',
      '.kcccccc',
      '.kcCcccc',
      '.kcCcccc',
      '.ksCBBBB',
      '.kkccccc',
      '..kccccc',
    ],
    side: [
      '.....kkkkk......',
      '....khhhhhk.....',
      '...khhhhhhhk....',
      '...kaaaaaaaak...',
      '...khhhhssk.....',
      '...khhhsewk.....',
      '...khhsssSk.....',
      '....khssSk......',
      '.....kssk.......',
      '....kkccakk.....',
      '...kcccccak.....',
      '...kcCcccak.....',
      '...kcCcccak.....',
      '...kcsBBBBk.....',
      '...kcccccck.....',
      '....kccccck.....',
    ],
  },
  mira: {
    down: [
      '.......k',
      '......kt',
      '......kt',
      '.....ktt',
      '.....ktT',
      '....kttt',
      '...kkaaa',
      'kkttttTT',
      '.kkhhhhh',
      '..khhsss',
      '..khsews',
      '..khssss',
      '..khkssS',
      '..kh.kks',
      '..kkccca',
      '.kccccca',
      '.kcCccca',
      '.ksCccca',
      '.kcCaaaa',
      '.kccccca',
      'kcCcccca',
      'kkkkkkkk',
    ],
    up: [
      '.......k',
      '......kt',
      '......kt',
      '.....ktt',
      '.....ktT',
      '....kttt',
      '...kkaaa',
      'kkttttTT',
      '.kkhhhhh',
      '..khhHhh',
      '..khhHhh',
      '..khHhhH',
      '..khHhhH',
      '..khHhhH',
      '..kkHhhH',
      '.kckhHhh',
      '.kcCkkhh',
      '.ksCcckk',
      '.kcCaaaa',
      '.kcccccc',
      'kcCccccc',
      'kkkkkkkk',
    ],
    side: [
      '........k.......',
      '.......ktk......',
      '.......ktk......',
      '......kttk......',
      '......kttTk.....',
      '.....ktttTk.....',
      '....kkaaaaak....',
      '..kkttttttTTkk..',
      '...khhhhhhhk....',
      '...khhhhsssk....',
      '...khhhssewk....',
      '...khhhssssk....',
      '...khhhkssSk....',
      '...khhh.kksk....',
      '...khhkcccak....',
      '....khcccaak....',
      '....kcCccak.....',
      '....kcCsack.....',
      '....kcCaaak.....',
      '....kccccck.....',
      '...kcCcccccck...',
      '...kkkkkkkkkk...',
    ],
  },
  gald: {
    down: [
      '....kkkk',
      '...kaaaa',
      '..kaaaaa',
      '..ksssss',
      '..ksewss',
      '..kssssS',
      '..khSsss',
      '..khhhss',
      '...khhhh',
      '.kkmmkhh',
      'kmmMmkcc',
      'kmMccccc',
      'kscCcccc',
      'kscCcccc',
      'kskCBBBB',
      '.kkccccc',
      '..kccccc',
    ],
    up: [
      '....kkkk',
      '...kaaaa',
      '..kaaaaa',
      '..kaaaaa',
      '..kSssss',
      '..kSssss',
      '..kSssss',
      '...kSsss',
      '....kkss',
      '.kkmmkcc',
      'kmmMmkcc',
      'kmMccccc',
      'kscCcccc',
      'kscCcccc',
      'kskCBBBB',
      '.kkccccc',
      '..kccccc',
    ],
    side: [
      '.....kkkkk......',
      '....kaaaaak.....',
      '...kaaaaaaak....',
      '...ksSsssssk....',
      '...kSsssewsk....',
      '...kSsssssSk....',
      '...kSshhhhhk....',
      '....khhhhhhk....',
      '....kkhhhhk.....',
      '..kkmmmkccck....',
      '.kmmMmmkcccck...',
      '.kmMmmkcccCck...',
      '..kmmkccccCck...',
      '...ksccccCcck...',
      '...kscBBBBBBk...',
      '...kccccccck....',
      '....kcccccck....',
    ],
  },
};

// 脚 (1 本ぶん)。正面・背中は 2 本を並べ、横は前後にずらす
const LEG = ['kppk', 'kppk', 'kbbk', 'kbbk', 'kkkk'];
const LEG_SIDE = ['kpk.', 'kpk.', 'kbk.', 'kbbk', 'kkkk'];
const W = 20; // スプライトの横幅 (ドット)
const FOOT = 8; // 主人公の中心から足の裏までのドット数

const cache = {};

function grid(heroId, dir) {
  const g = UPPER[heroId][dir];
  if (dir === 'side') return g;
  return g.map((row) => row + row.split('').reverse().join(''));
}

function paint(g, rows, ox, oy, pal) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      g.fillStyle = pal[ch] || '#ff00ff';
      g.fillRect(ox + i, oy + j, 1, 1);
    }
  });
}

// 1 コマを作る。kind: idle (0〜1) / walk (0〜3)
function build(heroId, dir, kind, f) {
  const pal = { ...COMMON, ...PAL[heroId] };
  const up = grid(heroId, dir);
  const H = up.length + LEG.length + 1;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const legTop = H - LEG.length;
  const lift = (n) => LEG.slice(0, LEG.length - n); // 上げた脚は短く見える
  if (dir === 'side') {
    // 横: 脚を前後にずらす
    const dx = kind === 'walk' ? [-2, 0, 2, 0][f] : 0;
    const raise = kind === 'walk' ? [0, 1, 0, 1][f] : 0;
    paint(g, LEG_SIDE.slice(0, LEG_SIDE.length - raise), 7 - dx, legTop - raise, pal);
    paint(g, LEG_SIDE, 7 + dx, legTop, pal);
  } else {
    const l = kind === 'walk' && f === 1 ? 1 : 0;
    const r = kind === 'walk' && f === 3 ? 1 : 0;
    paint(g, lift(l), 6, legTop - l, pal);
    paint(g, lift(r), 10, legTop - r, pal);
  }
  // 上半身: 歩きの 1・3 コマ目と、息を吸うコマは 1 ドット下がる
  const bob = (kind === 'walk' && f % 2 === 1) || (kind === 'idle' && f === 1) ? 1 : 0;
  paint(g, up, 2, legTop - up.length + 1 + bob, pal);
  // 当たったときの白いコマ
  const white = document.createElement('canvas');
  white.width = W;
  white.height = H;
  const wg = white.getContext('2d');
  wg.drawImage(cv, 0, 0);
  wg.globalCompositeOperation = 'source-in';
  wg.fillStyle = '#ffffff';
  wg.fillRect(0, 0, W, H);
  return { cv, white, ax: W / 2, ay: H - FOOT }; // 足の裏が中心から FOOT ドット下にくる
}

// いまのコマ。aim の向きで 下 / 上 / 横 を決める
export function heroFrame(heroId, aim, moving, walk, t) {
  const sin = Math.sin(aim);
  const dir = sin > 0.55 ? 'down' : sin < -0.55 ? 'up' : 'side';
  const kind = moving ? 'walk' : 'idle';
  const f = moving ? Math.floor((walk * 2) / Math.PI) % 4 : Math.floor(t * 1.6) % 2;
  const key = `${heroId}/${dir}/${kind}/${f}`;
  if (!cache[key]) cache[key] = build(heroId, dir, kind, f);
  return { ...cache[key], flip: dir === 'side' && Math.cos(aim) < 0 };
}
