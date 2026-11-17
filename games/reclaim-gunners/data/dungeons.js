/*
 * ダンジョンのデータ (SPEC.md の「ダンジョン」)
 *   各ステージの 3 つのエリアに、別マップのダンジョンへの入口がある (そのエリアを解放すると入れる)
 *   ダンジョンは 3 つのエリア (入口・広間・最深部) の小さなマップ。最深部のボスを倒すと、特別な素材が手に入る
 *   特別な素材は、武器の超必殺技の解放条件になる (data/specials.js の RG.ULTRA_MAT)
 *   ボスの動きは、ステージのボス (BOSSES の base) と同じ。名前・Lv・体力・素材だけ変えてある
 */
window.RG = window.RG || {};

(() => {
  // [id, ステージ, 入口のエリア, 名前, 見た目 (theme), 出る敵, ボスの base, ボスの名前, ボスの Lv, 特別な素材の名前, ひな形]
  const TABLE = [
    ['d11', 1, 's1a6', '根腐れの洞窟', 'roots', ['imp', 'ghoul', 'skel'], 'G1', '洞窟の主 ジェリーマザー', 12, 'ジェリーマザーの結晶', 0],
    ['d12', 1, 's1a3', '風車地下の坑道', 'mine', ['ghoul', 'hound', 'skel'], 'G2', '地下の番人 ストーンガード', 16, '石の番人の心石', 1],
    ['d13', 1, 's1a4', '古井戸の底', 'underlake', ['skel', 'hound', 'ghoul'], 'N1', '井戸の底の竜 ボーンワイバーン', 22, '井戸竜の牙', 2],
    ['d21', 2, 's2a3', '沼底の洞', 'toad', ['slime', 'moth', 'ghoul'], 'N2', '洞の大蝦蟇 ゲロッパ', 30, '洞蝦蟇の宝玉', 1],
    ['d22', 2, 's2a5', '聖堂の納骨堂', 'altar', ['skel', 'knight', 'shaman'], 'G3', '納骨堂の歌姫 セイレーン', 32, '歌姫の銀の涙', 2],
    ['d23', 2, 's2a7', '霧の洞窟', 'underlake', ['wraith', 'knight', 'shaman'], 'G4', '双牙の番犬 ケルベロス', 34, '番犬の古い首輪', 0],
    ['d31', 3, 's3a2', '第零坑道', 'mine', ['worm', 'skel', 'garg'], 'G2', '零坑の鉄巨人 アイアンゴーレム', 30, '零坑ゴーレムの核', 2],
    ['d32', 3, 's3a3', '谷底の裂け目', 'canyon', ['garg', 'worm', 'orc'], 'G5', '裂け目の炎竜 ドレイク', 34, '裂け目竜の鱗', 0],
    ['d33', 3, 's3a4', '地底湖の水路', 'underlake', ['wraith', 'slime', 'eye'], 'G3', '水路の女王 ウンディーネ', 36, '水路の女王の真珠', 1],
    ['d41', 4, 's4a2', '迷いの洞', 'path', ['shadow', 'moth', 'hound'], 'N4', '迷い道の魔女 ヘカテ', 46, '迷い道の魔女の瞳', 2],
    ['d42', 4, 's4a3', '毒沼の地下', 'poisonVillage', ['moth', 'slime', 'shaman'], 'N3', '毒沼の王蟲 ヴェノムワーム', 48, '毒沼王蟲の卵', 1],
    ['d43', 4, 's4a6', '大樹の洞', 'roots', ['shadow', 'succ', 'dknight'], 'G6', '大樹の魔 ドライアド', 50, '大樹の魔核', 0],
    ['d51', 5, 's5a2', '溶岩の底', 'lavaCave', ['wisp', 'mino', 'hound'], 'G7', '溶岩の獄将 イフリート', 48, '獄将の炎の鞭', 1],
    ['d52', 5, 's5a3', '火口の穴', 'bridge', ['wisp', 'garg', 'dknight'], 'N5', '火口の不死鳥 アッシュフェニクス', 54, '火口鳥の黄金羽', 2],
    ['d53', 5, 's5a4', '灰の地下墓所', 'ashGrave', ['dknight', 'wisp', 'mino'], 'G5', '灰の墓守 グレイヴドラゴン', 52, '墓守竜の灰骨', 0],
    ['d61', 6, 's6a2', '城下の地下水路', 'ruinsCity', ['garg', 'dknight', 'shadow'], 'N6', '水路の堕天騎士 ルシード', 58, '堕天騎士の羽片', 1],
    ['d62', 6, 's6a3', '血の地下聖堂', 'bloodCath', ['archd', 'dknight', 'succ'], 'G7', '血の聖堂の主 ブラッドロード', 60, '血聖堂の魔晶', 2],
    ['d63', 6, 's6a6', '堕天の地下牢', 'fallenTower', ['archd', 'dknight', 'succ'], 'G6', '堕天牢の番人 カストディア', 62, '堕天牢の鎖', 0],
  ];

  // ひな形 (文字 1 つ = 3 × 3 タイル): 0 横一列 / 1 縦一列 / 2 左に 2 部屋・右にボスの部屋
  const SHAPES = [
    { cols: 21, rows: 13, at: (r, c) => (c < 7 ? 'A' : c < 14 ? 'B' : 'C') },
    { cols: 13, rows: 21, at: (r) => (r < 7 ? 'A' : r < 14 ? 'B' : 'C') },
    { cols: 21, rows: 13, at: (r, c) => (c >= 14 ? 'C' : r < 6 ? 'A' : 'B') },
  ];

  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  RG.DUNGEONS = [];
  RG.DUNGEON = {};
  TABLE.forEach(([id, stage, parentArea, name, theme, enemies, base, bossName, bossLv, matName, shapeNo], n) => {
    const st = RG.STAGES.find((s) => s.id === stage);
    const pa = st.areas.find((a) => a.id === parentArea);
    const sh = SHAPES[shapeNo];
    const rows = Array.from({ length: sh.rows }, (_, r) => Array.from({ length: sh.cols }, (__, c) => sh.at(r, c)).join(''));
    const R = rng(n * 7919 + 13);
    const cells = { A: [], B: [], C: [] };
    rows.forEach((row, r) => [...row].forEach((ch, c) => cells[ch].push([c, r])));
    const at = (k) => {
      const [c, r] = cells[k][Math.floor(R() * cells[k].length)];
      return [Math.round((c + R()) * 3), Math.round((r + R()) * 3)];
    };
    const ctr = (k) => {
      const sx = cells[k].reduce((s, q) => s + q[0], 0) / cells[k].length;
      const sy = cells[k].reduce((s, q) => s + q[1], 0) / cells[k].length;
      return [Math.round((sx + 0.5) * 3), Math.round((sy + 0.5) * 3)];
    };
    const [lo, hi] = pa.lv;
    const nest = (k, types) => ({ x: at(k)[0], y: at(k)[1], type: types[Math.floor(R() * types.length)] });
    const mat = `dm${id.slice(1)}`;
    const def = {
      id,
      dungeon: true,
      parent: stage,
      name,
      desc: 'ダンジョン',
      lv: [lo, hi + 3],
      w: sh.cols * 3,
      h: sh.rows * 3,
      seed: 300 + n,
      layout: { scale: 3, warp: 1.8, key: { A: `${id}A`, B: `${id}B`, C: `${id}C` }, rows },
      links: [[`${id}A`, `${id}B`], [`${id}B`, `${id}C`]],
      walls: [],
      features: [],
      gates: [],
      entries: [],
      areas: [
        { id: `${id}A`, name: `${name}・入口`, lv: [lo, lo + 3], theme, enemies, start: true, stone: ctr('A'), nests: [nest('A', ['small', 'normal']), nest('A', ['small', 'normal']), nest('A', ['normal'])] },
        { id: `${id}B`, name: `${name}・広間`, lv: [lo + 2, hi + 2], theme, enemies, stone: ctr('B'), nests: [nest('B', ['normal', 'brood']), nest('B', ['normal', 'eye']), nest('B', ['normal', 'bone', 'brood']), nest('B', ['normal']), nest('B', ['eye', 'normal'])] },
        { id: `${id}C`, name: `${name}・最深部`, lv: [hi + 2, hi + 3], theme, enemies, stone: at('C'), nests: [] },
      ],
      scatter: [
        { area: `${id}A`, tile: 'rock', n: 5 },
        { area: `${id}B`, tile: 'rock', n: 8 },
        { area: `${id}B`, tile: 'bone', n: 6 },
        { area: `${id}C`, tile: 'rock', n: 3 },
      ],
      // ボス: 動きは base と同じ。名前・Lv・体力・素材だけ変える
      lairs: [{
        boss: base, area: `${id}C`, x: ctr('C')[0], y: ctr('C')[1], r: 6, dun: id,
        def: { ...RG.BOSSES[base], name: bossName, lv: bossLv, hp: Math.round(RG.BOSSES[base].hp * 0.8), exp: Math.round(RG.BOSSES[base].exp * 0.5), gold: Math.round(RG.BOSSES[base].gold * 0.5), kind: 'dungeon', mat, impl: true },
      }],
    };
    RG.DUNGEONS.push(def);
    RG.DUNGEON[id] = def;
    RG.MATERIALS[mat] = matName;
    RG.DUNGEON_MATS = RG.DUNGEON_MATS || [];
    RG.DUNGEON_MATS.push(mat);
    // ステージの入口: 入口のエリアの、はじめの転移碑から離れた所 (位置は mapgen で、エリアの中の置ける所へ寄せる)
    st.dungeons = st.dungeons || [];
    const pcells = [];
    st.layout.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (st.layout.key[ch] === parentArea) pcells.push([c, r]); }));
    const sc = st.layout.scale;
    let best = null;
    let bd = -1;
    for (let k = 0; k < 14; k++) {
      const [c, r] = pcells[Math.floor(R() * pcells.length)];
      const x = Math.round((c + R()) * sc);
      const y = Math.round((r + R()) * sc);
      const d = Math.hypot(x - pa.stone[0], y - pa.stone[1]);
      if (d > bd) {
        bd = d;
        best = [x, y];
      }
    }
    st.dungeons.push({ id, area: parentArea, name, x: best[0], y: best[1] });
  });
})();

// 言葉の入れ替え (lang.js) の対象にする
RG.i18nExtra.push(RG.DUNGEONS);
