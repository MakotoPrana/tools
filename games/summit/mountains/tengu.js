/*
 * 天狗山のデータ
 *   角度 a は度 (東 0、北 90、反時計回り)。標高 y はメートル
 *   区間 (edges) の t は、区間の角度の割合 (0 = from、1 = to)
 *
 * 難所 (edges[].obstacles)
 *   谷を越えるもの (len は谷の幅 m): log 丸太橋 / bridge 吊り橋 / rope ターザンロープ (count 本) /
 *                                     hook 鉤縄 / ridge やせ尾根
 *     bridge: holes 抜けた板・rotten 腐った板 (橋の上の位置 0〜1 の配列)、gust 突風
 *   岩壁 (h は高さ m): wall。kind は rock 岩 / ladder はしご / chain 鎖場 / smooth つるつる (ロープ) /
 *                      ice 氷 (ピッケル) / thorn イバラ (革手袋)。ledges 休める出っぱりの高さ、overhang
 *   道の上に置くもの (len は長さ m): rocks 落石 / snow 雪渓 / ice 氷の道 (アイゼン) /
 *                                    flowers 毒の花畑 / bramble イバラのやぶ (鉈)
 */
(function (root) {
  'use strict';
  const MOUNTAINS = root.SUMMIT_MOUNTAINS = root.SUMMIT_MOUNTAINS || {};

  MOUNTAINS.tengu = {
    id: 'tengu',
    name: { ja: '天狗山', en: 'Mt. Tengu', zh: '天狗山', ko: '텐구산' },
    terrain: {
      seed: 20261023,
      // [標高, 半径]。標高の低い順
      profile: [[0, 640], [125, 332], [275, 192], [425, 75], [492, 28], [500, 0]],
      worldR: 1500,
      coastR: 1100,
      plainY: 1.5,
      seaFloorY: -16,
      seaY: -3,
      cloudY: 275,
      plainNoise: 2,
      footNoise: 3.5,
      topNoise: 1.5,
      spurs: { k: 7, amp: 8, phase: 0.7 },
      // 断崖の帯 (標高 h m ごとに崖)
      cliffs: { h: 16, tread: 0.25, w: 0.1, wobble: 7, y0: 15, y1: 470 },
    },
    bands: [
      { id: 'foot', y1: 125 },
      { id: 'mid', y1: 275 },
      { id: 'high', y1: 425 },
      { id: 'top', y1: 1e9 },
    ],
    weather: { sunny: 0.5, cloudy: 0.25, rain: 0.15, fog: 0.1 },

    checkpoints: [
      { id: 'S0', kind: 'hut', a: 270, y: 10, name: { ja: '南の里', en: 'South Village', zh: '南之里', ko: '남쪽 마을' } },
      { id: 'E0', kind: 'hut', a: 0, y: 40, name: { ja: '東の沢', en: 'East Stream', zh: '东溪', ko: '동쪽 계곡' } },
      { id: 'W0', kind: 'hut', a: 180, y: 75, name: { ja: '西の岩場', en: 'West Crags', zh: '西岩场', ko: '서쪽 바위터' } },
      { id: 'N0', kind: 'hut', a: 55, y: 150, name: { ja: '北の氷河口', en: 'North Glacier Gate', zh: '北冰河口', ko: '북쪽 빙하 입구' } },
      { id: 'sato', kind: 'shrine', a: 300, y: 85, name: { ja: '里山の祠', en: 'Satoyama Shrine', zh: '里山神祠', ko: '마을산 사당' } },
      { id: 'sawa', kind: 'shrine', a: 340, y: 115, name: { ja: '沢の出合', en: 'Stream Fork', zh: '溪流汇合处', ko: '계곡 합류점' } },
      { id: 'takimi', kind: 'hut', a: 330, y: 160, spring: true, name: { ja: '滝見台', en: 'Falls Lookout', zh: '观瀑台', ko: '폭포 전망대' } },
      { id: 'iwaba', kind: 'shrine', a: 205, y: 130, name: { ja: '岩場の祠', en: 'Crag Shrine', zh: '岩场神祠', ko: '바위터 사당' } },
      { id: 'chufuku', kind: 'hut', a: 240, y: 215, spring: true, name: { ja: '中腹の小屋', en: 'Midslope Hut', zh: '半山小屋', ko: '중턱 산장' } },
      { id: 'higashi', kind: 'hut', a: 30, y: 230, spring: true, name: { ja: '東の岩小屋', en: 'East Rock Hut', zh: '东岩小屋', ko: '동쪽 바위 산장' } },
      { id: 'tengu', kind: 'shrine', a: 280, y: 290, name: { ja: '天狗岩', en: 'Tengu Rock', zh: '天狗岩', ko: '텐구 바위' } },
      { id: 'mihari', kind: 'hut', a: 105, y: 260, name: { ja: '氷河の見張り小屋', en: 'Glacier Watch Hut', zh: '冰河瞭望小屋', ko: '빙하 감시 산장' } },
      { id: 'futago', kind: 'hut', a: 335, y: 350, spring: true, ponds: true, name: { ja: '双子池', en: 'Twin Ponds', zh: '双子池', ko: '쌍둥이 연못' } },
      { id: 'kitatent', kind: 'tent', a: 150, y: 340, spring: true, name: { ja: '北のテント場', en: 'North Campsite', zh: '北营地', ko: '북쪽 야영지' } },
      { id: 'anbu', kind: 'tent', a: 200, y: 395, name: { ja: '風の鞍部', en: 'Wind Saddle', zh: '风之鞍部', ko: '바람의 안부' } },
      { id: 'kata', kind: 'tent', a: 60, y: 440, name: { ja: '東の肩', en: 'East Shoulder', zh: '东肩', ko: '동쪽 어깨' } },
      { id: 'chokka', kind: 'tent', a: 290, y: 460, name: { ja: '山頂直下のテント場', en: 'Summit Camp', zh: '峰下营地', ko: '정상 아래 야영지' } },
      { id: 'summit', kind: 'shrine', a: 0, y: 500, R: 9, name: { ja: '山頂', en: 'Summit', zh: '山顶', ko: '정상' } },
    ],

    // 登山口。unlock のチェックポイントのどれかに着くと選べる (null は最初から)
    starts: [
      { cp: 'S0', unlock: null },
      { cp: 'E0', unlock: ['sawa', 'E0'] },
      { cp: 'W0', unlock: ['iwaba', 'W0'] },
      { cp: 'N0', unlock: ['mihari', 'N0'] },
    ],
    goals: ['takimi', 'tengu', 'futago', 'kata', 'summit'],

    edges: [
      // ---- 麓 ----
      { id: 'e1', from: 'S0', to: 'sato', dir: 1, obstacles: [
        { type: 'wall', t: 0.17, h: 10 },
        { type: 'log', t: 0.33, len: 8 },
        { type: 'wall', t: 0.5, h: 16 },
        { type: 'bridge', t: 0.75, len: 12 },
        { type: 'wall', t: 0.89, h: 10 },
      ] },
      { id: 'e3', from: 'S0', to: 'iwaba', dir: -1, obstacles: [
        { type: 'wall', t: 0.18, h: 14 },
        { type: 'log', t: 0.35, len: 12 },
        { type: 'wall', t: 0.44, h: 16 },
        { type: 'wall', t: 0.53, h: 14, kind: 'ladder' },
        { type: 'wall', t: 0.62, h: 12 },
        { type: 'bridge', t: 0.72, len: 16 },
        { type: 'log', t: 0.88, len: 8 },
      ] },
      { id: 'e5', from: 'sato', to: 'sawa', dir: 1, obstacles: [
        { type: 'log', t: 0.3, len: 9 },
        { type: 'wall', t: 0.47, h: 12 },
        { type: 'bridge', t: 0.65, len: 14 },
        { type: 'wall', t: 0.84, h: 8 },
      ] },
      { id: 'e2', from: 'sato', to: 'takimi', dir: 1, scenic: 1, obstacles: [
        { type: 'wall', t: 0.14, h: 10 },
        { type: 'bridge', t: 0.3, len: 14 },
        { type: 'wall', t: 0.55, h: 16 },
        { type: 'wall', t: 0.8, h: 14, kind: 'ladder' },
      ] },
      { id: 'e4', from: 'E0', to: 'sawa', dir: -1, obstacles: [
        { type: 'wall', t: 0.12, h: 12 },
        { type: 'bridge', t: 0.3, len: 20 },
        { type: 'wall', t: 0.47, h: 14 },
        { type: 'log', t: 0.58, len: 8 },
        { type: 'wall', t: 0.68, h: 10 },
        { type: 'rope', t: 0.82, len: 11 },
      ] },
      { id: 'e6', from: 'W0', to: 'iwaba', dir: 1, obstacles: [
        { type: 'wall', t: 0.12, h: 8 },
        { type: 'log', t: 0.27, len: 8 },
        { type: 'wall', t: 0.5, h: 16 },
        { type: 'wall', t: 0.78, h: 12, kind: 'ladder' },
      ] },
      { id: 'e15', from: 'E0', to: 'N0', dir: 1, obstacles: [
        { type: 'wall', t: 0.12, h: 12 },
        { type: 'bridge', t: 0.25, len: 20 },
        { type: 'wall', t: 0.36, h: 14 },
        { type: 'log', t: 0.46, len: 10 },
        { type: 'wall', t: 0.56, h: 10 },
        { type: 'wall', t: 0.68, h: 16 },
        { type: 'rocks', t: 0.85, len: 24 },
      ] },
      // ---- 中腹 ----
      { id: 'e7', from: 'iwaba', to: 'chufuku', dir: 1, obstacles: [
        { type: 'wall', t: 0.25, h: 18 },
        { type: 'bridge', t: 0.48, len: 16 },
        { type: 'wall', t: 0.63, h: 12 },
        { type: 'wall', t: 0.8, h: 18, kind: 'chain' },
      ] },
      { id: 'e8', from: 'takimi', to: 'chufuku', dir: -1, scenic: 1, obstacles: [
        { type: 'log', t: 0.15, len: 10 },
        { type: 'wall', t: 0.25, h: 10 },
        { type: 'rope', t: 0.35, len: 11 },
        { type: 'wall', t: 0.45, h: 10 },
        { type: 'bridge', t: 0.57, len: 24 },
        { type: 'wall', t: 0.72, h: 14, kind: 'chain' },
        { type: 'rocks', t: 0.88, len: 24 },
      ] },
      { id: 'e9', from: 'sawa', to: 'higashi', dir: 1, obstacles: [
        { type: 'bridge', t: 0.18, len: 14 },
        { type: 'wall', t: 0.3, h: 12 },
        { type: 'wall', t: 0.43, h: 22 },
        { type: 'log', t: 0.58, len: 10 },
        { type: 'wall', t: 0.7, h: 12 },
        { type: 'wall', t: 0.84, h: 16, kind: 'ladder' },
      ] },
      { id: 'e10', from: 'takimi', to: 'higashi', dir: 1, obstacles: [
        { type: 'bramble', t: 0.18 },
        { type: 'wall', t: 0.29, h: 10 },
        { type: 'log', t: 0.4, len: 10 },
        { type: 'wall', t: 0.55, h: 20, kind: 'smooth' },
        { type: 'wall', t: 0.69, h: 10 },
        { type: 'ridge', t: 0.84, len: 16 },
      ] },
      { id: 'e11', from: 'chufuku', to: 'tengu', dir: 1, obstacles: [
        { type: 'rocks', t: 0.2, len: 30 },
        { type: 'bridge', t: 0.4, len: 14 },
        { type: 'wall', t: 0.62, h: 30 },
        { type: 'wall', t: 0.84, h: 12 },
      ] },
      { id: 'e12', from: 'higashi', to: 'mihari', dir: 1, obstacles: [
        { type: 'rocks', t: 0.2, len: 30 },
        { type: 'wall', t: 0.4, h: 12 },
        { type: 'bridge', t: 0.65, len: 40, gust: true },
        { type: 'flowers', t: 0.86, len: 14 },
      ] },
      { id: 'e13', from: 'N0', to: 'mihari', dir: 1, obstacles: [
        { type: 'wall', t: 0.22, h: 24, kind: 'ice' },
        { type: 'wall', t: 0.36, h: 10 },
        { type: 'snow', t: 0.5, len: 30 },
        { type: 'bridge', t: 0.68, len: 14 },
        { type: 'wall', t: 0.85, h: 18, kind: 'ladder' },
      ] },
      // ---- 高所 ----
      { id: 'e16', from: 'tengu', to: 'futago', dir: 1, scenic: 2, obstacles: [
        { type: 'ridge', t: 0.22, len: 30 },
        { type: 'wall', t: 0.42, h: 18 },
        { type: 'wall', t: 0.58, h: 10 },
        { type: 'rope', t: 0.68, len: 18, count: 2 },
        { type: 'flowers', t: 0.87, len: 14 },
      ] },
      { id: 'e17', from: 'tengu', to: 'anbu', dir: -1, obstacles: [
        { type: 'wall', t: 0.18, h: 26 },
        { type: 'wall', t: 0.3, h: 12 },
        { type: 'log', t: 0.39, len: 10 },
        { type: 'bridge', t: 0.55, len: 30, rotten: [0.3, 0.55, 0.7], gust: true },
        { type: 'rocks', t: 0.72, len: 24 },
        { type: 'wall', t: 0.88, h: 16, kind: 'thorn' },
      ] },
      { id: 'e22', from: 'futago', to: 'anbu', dir: -1, scenic: 1, obstacles: [
        { type: 'flowers', t: 0.15, len: 20 },
        { type: 'wall', t: 0.3, h: 14 },
        { type: 'bridge', t: 0.5, len: 40, holes: [0.4, 0.62], gust: true },
        { type: 'log', t: 0.63, len: 10 },
        { type: 'wall', t: 0.73, h: 10 },
        { type: 'rocks', t: 0.84, len: 20 },
      ] },
      { id: 'e19', from: 'mihari', to: 'kitatent', dir: 1, obstacles: [
        { type: 'snow', t: 0.2, len: 24 },
        { type: 'wall', t: 0.42, h: 26 },
        { type: 'bridge', t: 0.62, len: 14 },
        { type: 'rocks', t: 0.82, len: 20 },
      ] },
      { id: 'e21', from: 'futago', to: 'kata', dir: 1, scenic: 1, obstacles: [
        { type: 'wall', t: 0.15, h: 20 },
        { type: 'hook', t: 0.38, len: 18 },
        { type: 'ridge', t: 0.58, len: 18 },
        { type: 'wall', t: 0.8, h: 34 },
      ] },
      // ---- 山頂域 ----
      { id: 'e20', from: 'kitatent', to: 'kata', dir: -1, obstacles: [
        { type: 'wall', t: 0.2, h: 28 },
        { type: 'snow', t: 0.4, len: 24 },
        { type: 'bridge', t: 0.58, len: 16, gust: true },
        { type: 'wall', t: 0.8, h: 26, kind: 'chain' },
      ] },
      { id: 'e23', from: 'anbu', to: 'chokka', dir: 1, obstacles: [
        { type: 'ridge', t: 0.42, len: 24 },
        { type: 'log', t: 0.58, len: 8 },
        { type: 'wall', t: 0.67, h: 12 },
        { type: 'wall', t: 0.8, h: 30, overhang: true },
      ] },
      { id: 'e24', from: 'chokka', to: 'summit', dir: 1, spin: 200, obstacles: [
        { type: 'bridge', t: 0.25, len: 18, holes: [0.5], rotten: [0.3, 0.7], gust: true },
        { type: 'wall', t: 0.5, h: 16 },
        { type: 'rocks', t: 0.76, len: 14 },
      ] },
      { id: 'e25', from: 'kata', to: 'summit', dir: 1, spin: 150, obstacles: [
        { type: 'wall', t: 0.2, h: 20 },
        { type: 'ice', t: 0.52, len: 30 },
        { type: 'rocks', t: 0.82, len: 12 },
      ] },
      { id: 'e26', from: 'chokka', to: 'summit', dir: -1, spin: -90, obstacles: [
        { type: 'wall', t: 0.45, h: 32, kind: 'ice' },
      ] },
    ],

    // 置いてある物。at は { edge, t, side (外向き +m) } か { cp, off: [外向き, 横] }
    items: [
      { kind: 'tool', id: 'machete', at: { cp: 'S0', off: [4, -5] } },
      { kind: 'tool', id: 'gloves', at: { edge: 'e4', t: 0.32, side: -30 }, deep: true },
      { kind: 'tool', id: 'rope', at: { cp: 'takimi', off: [3, 5] } },
      { kind: 'tool', id: 'hook', at: { edge: 'e16', t: 0.55 } },
      { kind: 'tool', id: 'pickaxe', at: { cp: 'futago', off: [2, -5] } },
      { kind: 'tool', id: 'crampons', at: { edge: 'e20', t: 0.65 } },
      // お守り (20)
      { kind: 'charm', at: { cp: 'sato', off: [-3, 0] } },
      { kind: 'charm', at: { cp: 'sawa', off: [-3, 0] } },
      { kind: 'charm', at: { cp: 'iwaba', off: [-3, 0] } },
      { kind: 'charm', at: { cp: 'tengu', off: [-3, 0] } },
      { kind: 'charm', at: { cp: 'summit', off: [0, 3] } },
      { kind: 'charm', at: { edge: 'e1', t: 0.55, side: -20 } },
      { kind: 'charm', at: { edge: 'e3', t: 0.36 } },
      { kind: 'charm', at: { edge: 'e6', t: 0.52 } },
      { kind: 'charm', at: { edge: 'e15', t: 0.77 } },
      { kind: 'charm', at: { edge: 'e7', t: 0.87 } },
      { kind: 'charm', at: { edge: 'e8', t: 0.33 } },
      { kind: 'charm', at: { edge: 'e10', t: 0.62 } },
      { kind: 'charm', at: { edge: 'e11', t: 0.56 } },
      { kind: 'charm', at: { edge: 'e12', t: 0.66 } },
      { kind: 'charm', at: { edge: 'e13', t: 0.32 } },
      { kind: 'charm', at: { edge: 'e16', t: 0.36 } },
      { kind: 'charm', at: { edge: 'e17', t: 0.88 } },
      { kind: 'charm', at: { edge: 'e21', t: 0.47 } },
      { kind: 'charm', at: { edge: 'e23', t: 0.72 } },
      { kind: 'charm', at: { edge: 'e25', t: 0.45 } },
      // 薬草
      { kind: 'herb', at: { edge: 'e1', t: 0.3, side: 1.5 } },
      { kind: 'herb', at: { edge: 'e3', t: 0.55, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e2', t: 0.6, side: 1.5 } },
      { kind: 'herb', at: { edge: 'e4', t: 0.63, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e7', t: 0.56, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e8', t: 0.5, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e9', t: 0.26, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e11', t: 0.45, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e12', t: 0.45, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e16', t: 0.6, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e17', t: 0.45, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e19', t: 0.7, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e22', t: 0.68, side: -1.5 } },
      { kind: 'herb', at: { edge: 'e23', t: 0.55, side: -1.0 } },
      // 道ばたの清水
      { kind: 'spring', at: { edge: 'e3', t: 0.2, side: -2.5 } },
      { kind: 'spring', at: { edge: 'e9', t: 0.62, side: -2.5 } },
      { kind: 'spring', at: { edge: 'e17', t: 0.15, side: -2.5 } },
    ],

    // 危険な植物。edge の t0〜t1 に n 本
    plants: [
      { kind: 'nettle', edge: 'e1', t0: 0.15, t1: 0.45, n: 8 },
      { kind: 'nettle', edge: 'e3', t0: 0.1, t1: 0.3, n: 8 },
      { kind: 'nettle', edge: 'e5', t0: 0.2, t1: 0.5, n: 7 },
      { kind: 'nettle', edge: 'e4', t0: 0.5, t1: 0.7, n: 7 },
      { kind: 'nettle', edge: 'e6', t0: 0.1, t1: 0.4, n: 6 },
      { kind: 'urushi', edge: 'e2', t0: 0.6, t1: 0.75, n: 5 },
      { kind: 'urushi', edge: 'e8', t0: 0.45, t1: 0.6, n: 6 },
      { kind: 'urushi', edge: 'e7', t0: 0.4, t1: 0.55, n: 5 },
      { kind: 'urushi', edge: 'e15', t0: 0.5, t1: 0.65, n: 5 },
      { kind: 'thorn', edge: 'e9', t0: 0.15, t1: 0.35, n: 6 },
      { kind: 'thorn', edge: 'e11', t0: 0.4, t1: 0.52, n: 5 },
      { kind: 'thorn', edge: 'e12', t0: 0.4, t1: 0.52, n: 5 },
      { kind: 'thorn', edge: 'e19', t0: 0.65, t1: 0.75, n: 4 },
    ],

    // 展望スポット (20)。look は見る向き (度)。省くと山の外向き
    views: [
      { id: 'v_takimi', at: { cp: 'takimi', off: [7, 0] }, look: 322, name: { ja: '滝見台からの大滝', en: 'The Great Falls from the Lookout', zh: '观瀑台远眺大瀑布', ko: '폭포 전망대에서 본 큰 폭포' } },
      { id: 'v_tengu', at: { cp: 'tengu', off: [6, 0] }, name: { ja: '天狗岩からの雲海', en: 'Sea of Clouds from Tengu Rock', zh: '天狗岩上的云海', ko: '텐구 바위에서 본 운해' } },
      { id: 'v_futago', at: { cp: 'futago', off: [6, 2] }, name: { ja: '双子池のほとり', en: 'By the Twin Ponds', zh: '双子池畔', ko: '쌍둥이 연못가' } },
      { id: 'v_kata', at: { cp: 'kata', off: [5, 0] }, name: { ja: '東の肩から見る山頂', en: 'The Summit from the East Shoulder', zh: '从东肩望山顶', ko: '동쪽 어깨에서 본 정상' }, look: 200 },
      { id: 'v_summit', at: { cp: 'summit', off: [0, -4] }, look: 270, name: { ja: '山頂からの大パノラマ', en: 'Summit Panorama', zh: '山顶全景', ko: '정상 파노라마' } },
      { id: 'v_sato', at: { cp: 'sato', off: [6, 0] }, name: { ja: '里山から見る南の里', en: 'South Village from Satoyama', zh: '从里山望南之里', ko: '마을산에서 본 남쪽 마을' } },
      { id: 'v_sawa', at: { cp: 'sawa', off: [6, 0] }, name: { ja: '沢の出合の流れ', en: 'Where the Streams Meet', zh: '溪流交汇', ko: '계곡이 만나는 곳' } },
      { id: 'v_iwaba', at: { cp: 'iwaba', off: [6, 0] }, name: { ja: '岩場の祠から西の平野', en: 'Western Plains from the Crag Shrine', zh: '岩场神祠眺望西方平原', ko: '바위터 사당에서 본 서쪽 평야' } },
      { id: 'v_chufuku', at: { cp: 'chufuku', off: [7, 0] }, name: { ja: '中腹の小屋のテラス', en: 'Midslope Hut Terrace', zh: '半山小屋的露台', ko: '중턱 산장 테라스' } },
      { id: 'v_higashi', at: { cp: 'higashi', off: [7, 0] }, name: { ja: '東の海', en: 'The Eastern Sea', zh: '东方的大海', ko: '동쪽 바다' } },
      { id: 'v_mihari', at: { cp: 'mihari', off: [7, 0] }, name: { ja: '氷河を見張る', en: 'Watching the Glacier', zh: '守望冰河', ko: '빙하를 바라보며' } },
      { id: 'v_kitatent', at: { cp: 'kitatent', off: [6, 0] }, name: { ja: '北の山並み', en: 'Northern Ranges', zh: '北方群山', ko: '북쪽 산줄기' } },
      { id: 'v_anbu', at: { cp: 'anbu', off: [6, 0] }, name: { ja: '風の鞍部の夕雲', en: 'Clouds over the Wind Saddle', zh: '风之鞍部的云', ko: '바람의 안부의 구름' } },
      { id: 'v_chokka', at: { cp: 'chokka', off: [6, 0] }, name: { ja: '山頂直下の絶壁', en: 'Cliffs below the Summit', zh: '峰下绝壁', ko: '정상 아래 절벽' } },
      { id: 'v_e16', at: { edge: 'e16', t: 0.2, side: 1 }, name: { ja: 'やせ尾根の入口', en: 'Start of the Knife Ridge', zh: '刀脊入口', ko: '칼날 능선 입구' } },
      { id: 'v_e12', at: { edge: 'e12', t: 0.5, side: 1 }, name: { ja: '大吊り橋の手前', en: 'Before the Great Bridge', zh: '大吊桥前', ko: '큰 출렁다리 앞' } },
      { id: 'v_e22', at: { edge: 'e22', t: 0.4, side: 1 }, name: { ja: '天空の吊り橋', en: 'Sky Bridge', zh: '天空吊桥', ko: '하늘 출렁다리' } },
      { id: 'v_e21', at: { edge: 'e21', t: 0.55, side: 1 }, name: { ja: '鉤縄の岩棚', en: 'Grapple Ledge', zh: '钩绳岩台', ko: '갈고리 바위턱' } },
      { id: 'v_e20', at: { edge: 'e20', t: 0.45, side: 1 }, name: { ja: '雪渓の上', en: 'Above the Snowfield', zh: '雪坡之上', ko: '눈골짜기 위' } },
      { id: 'v_e25', at: { edge: 'e25', t: 0.75, side: 1 }, name: { ja: '氷の稜線', en: 'Icy Crest', zh: '冰之山脊', ko: '얼음 능선' } },
    ],

    // 景色の飾り
    scenery: {
      waterfall: { a: 322, y0: 125, y1: 190 },
      village: { cp: 'S0' },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
