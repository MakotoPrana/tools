/*
 * 敵・ボス・素材のデータ (SPEC.md の「敵」)
 *   値は Lv1 のとき。レベル補正は script.js の lvMul を参照
 *   speed: px/秒 (遅い 38・ふつう 60・速い 85・とても速い 110)
 *   ai: chase (追いかける) / dash (ためてから突進) / shooter (離れて撃つ) / mimic (箱に化ける) / shield (正面の盾) / charge (壁まで突進)
 *   split: 倒すと小さく分かれる / poisonTrail: 通った跡に毒の沼 / ghost: 壁をすり抜ける / slowShot: 当たると遅くなる弾
 *   healer: まわりの敵を回復する / summon: ときどき呼ぶ敵
 *   まだ動きを作っていない ai の敵は chase で動く
 */
window.RG = window.RG || {};

RG.ENEMIES = [
  { id: 'imp', name: 'インプ', ai: 'chase', fly: true, hp: 8, atk: 5, speed: 85, r: 6, weak: ['holy'], resist: [], exp: 4, gold: 2, mat: 'impHorn', demon: true, color: '#d8433a' },
  { id: 'ghoul', name: 'グール', ai: 'chase', hp: 20, atk: 6, speed: 38, r: 8, weak: ['fire'], resist: ['ice'], exp: 5, gold: 3, mat: 'rotClaw', color: '#7f9a72' },
  { id: 'hound', name: 'ヘルハウンド', ai: 'dash', hp: 18, atk: 8, speed: 85, r: 8, weak: ['ice'], resist: ['fire'], exp: 7, gold: 4, mat: 'blackFang', demon: true, color: '#7a2a24' },
  { id: 'skel', name: 'スケルトン射手', ai: 'shooter', hp: 16, atk: 6, speed: 60, r: 8, weak: ['holy', 'phys'], resist: ['ice'], exp: 7, gold: 4, mat: 'oldBone', color: '#e9e3cf', shot: { cd: 1.9, speed: 150, n: 1 } },
  { id: 'slime', name: '魔スライム', ai: 'chase', split: true, hp: 24, atk: 5, speed: 38, r: 9, weak: ['thunder'], resist: ['phys'], exp: 6, gold: 3, mat: 'jelly', color: '#6fd06a' },
  { id: 'garg', name: 'ガーゴイル', ai: 'chase', fly: true, hp: 40, atk: 10, speed: 60, r: 10, weak: ['thunder'], resist: ['phys'], exp: 12, gold: 6, mat: 'stoneWing', demon: true, color: '#8d8a86' },
  { id: 'shaman', name: '呪術師', ai: 'shooter', healer: true, summon: 'imp', hp: 30, atk: 4, speed: 38, r: 9, weak: ['holy'], resist: [], exp: 14, gold: 8, mat: 'curseTag', demon: true, color: '#6b3b8f', shot: { cd: 2.2, speed: 120, n: 1 } },
  { id: 'worm', name: '爆裂ワーム', ai: 'chase', hp: 14, atk: 18, speed: 60, r: 8, weak: ['ice'], resist: ['fire'], exp: 8, gold: 5, mat: 'powder', color: '#b0753a' },
  { id: 'shadow', name: 'シャドウ', ai: 'chase', hp: 26, atk: 12, speed: 85, r: 8, weak: ['holy'], resist: ['phys'], exp: 13, gold: 7, mat: 'shade', demon: true, color: '#2c2638' },
  { id: 'orc', name: 'オーク重盾兵', ai: 'shield', hp: 60, atk: 12, speed: 38, r: 11, weak: ['thunder'], resist: ['phys'], exp: 16, gold: 10, mat: 'brokenShield', color: '#5f8a3e' },
  { id: 'moth', name: '毒蛾', ai: 'chase', fly: true, poisonTrail: true, hp: 18, atk: 3, speed: 60, r: 7, weak: ['fire'], resist: [], exp: 9, gold: 5, mat: 'scale', color: '#b9a64a' },
  { id: 'eye', name: '魔眼', ai: 'shooter', fly: true, hp: 34, atk: 16, speed: 38, r: 9, weak: ['thunder'], resist: [], exp: 15, gold: 9, mat: 'lens', demon: true, color: '#c2457a', shot: { cd: 2.4, speed: 260, n: 1 } },
  { id: 'mimic', name: 'ミミック', ai: 'mimic', hp: 50, atk: 14, speed: 85, r: 9, weak: ['ice'], resist: [], exp: 18, gold: 40, mat: 'tongue', color: '#9a6a34' },
  { id: 'knight', name: '亡霊騎士', ai: 'chase', hp: 90, atk: 20, speed: 38, r: 11, armor: 0.4, weak: ['holy', 'thunder'], resist: ['phys'], exp: 24, gold: 14, mat: 'armorShard', color: '#6f7b8e' },
  { id: 'wisp', name: '炎の精', ai: 'chase', hp: 22, atk: 8, speed: 85, r: 7, weak: ['ice'], resist: ['fire'], exp: 11, gold: 6, mat: 'fireCore', color: '#ff7a2c' },
  { id: 'wraith', name: '氷のレイス', ai: 'shooter', fly: true, ghost: true, slowShot: true, hp: 28, atk: 9, speed: 60, r: 9, weak: ['fire'], resist: ['ice'], exp: 14, gold: 8, mat: 'frostCloth', color: '#9fdcf0', shot: { cd: 2, speed: 140, n: 1 } },
  { id: 'succ', name: '幻惑の妖魔', ai: 'shooter', hp: 32, atk: 7, speed: 85, r: 8, weak: ['holy'], resist: ['thunder'], exp: 17, gold: 10, mat: 'feather', demon: true, color: '#d86fb2', shot: { cd: 2, speed: 160, n: 3 } },
  { id: 'mino', name: 'ミノタウロス', ai: 'charge', hp: 140, atk: 26, speed: 38, r: 14, weak: ['thunder'], resist: [], exp: 34, gold: 20, mat: 'bullHorn', color: '#8a5a3a' },
  { id: 'dknight', name: 'デーモンナイト', ai: 'chase', hp: 180, atk: 24, speed: 60, r: 12, weak: ['holy'], resist: ['fire', 'ice'], exp: 45, gold: 26, mat: 'crest', demon: true, color: '#3b2a4f' },
  { id: 'archd', name: 'アークデーモン', ai: 'shooter', hp: 260, atk: 22, speed: 38, r: 14, weak: ['holy'], resist: ['fire', 'thunder'], exp: 70, gold: 40, mat: 'bloodGem', demon: true, color: '#8f1f3a', shot: { cd: 1.6, speed: 130, n: 8 } },
];

RG.ENEMY = Object.fromEntries(RG.ENEMIES.map((e) => [e.id, e]));

// ボス。impl: このバージョンで戦えるボス
RG.BOSSES = {
  G1: { name: '沼の門番 ブロブキング', kind: 'gate', lv: 12, hp: 700, atk: 10, exp: 400, gold: 300, mat: 'slimeCore', impl: true },
  G2: { name: '鉄喰いゴーレム', kind: 'gate', lv: 15, hp: 900, atk: 14, exp: 500, gold: 400, mat: 'golemCore', impl: true },
  G3: { name: '霧の女王 ローレライ', kind: 'gate', lv: 28, hp: 1200, atk: 14, exp: 900, gold: 800, mat: 'tear', impl: true },
  G4: { name: '双頭の番犬 オルトロス', kind: 'gate', lv: 30, hp: 1300, atk: 16, exp: 950, gold: 850, mat: 'twinFang' },
  G5: { name: '炉心竜 ヴァルカン', kind: 'gate', lv: 34, hp: 1400, atk: 16, exp: 1000, gold: 900, mat: 'scaleV' },
  G6: { name: '千年樹の魔 ユグドラ', kind: 'gate', lv: 44, hp: 1700, atk: 18, exp: 1400, gold: 1300, mat: 'seed' },
  G7: { name: '炎獄将 バルログ', kind: 'gate', lv: 46, hp: 1800, atk: 20, exp: 1500, gold: 1400, mat: 'whip' },
  N1: { name: '骨竜 スカルドラゴン', kind: 'nushi', lv: 35, hp: 1100, atk: 14, exp: 1200, gold: 1000, mat: 'dragonSkull', impl: true },
  N2: { name: '大蝦蟇 ゲロイア', kind: 'nushi', lv: 40, hp: 1300, atk: 16, exp: 1300, gold: 1100, mat: 'toadGland', impl: true },
  N3: { name: '王蟲 キングワーム', kind: 'nushi', lv: 45, hp: 1500, atk: 18, exp: 1500, gold: 1300, mat: 'wormHeart' },
  N4: { name: '黒森の魔女 モルガナ', kind: 'nushi', lv: 52, hp: 1600, atk: 18, exp: 1700, gold: 1500, mat: 'witchEye' },
  N5: { name: '灼熱の不死鳥 フェニクス', kind: 'nushi', lv: 55, hp: 1600, atk: 20, exp: 1800, gold: 1600, mat: 'phoenixTail' },
  N6: { name: '堕天騎士 アザゼル', kind: 'nushi', lv: 59, hp: 1800, atk: 22, exp: 2000, gold: 1800, mat: 'fallenWing' },
  K: { name: '魔王 ベリアル', kind: 'king', lv: 58, hp: 2600, atk: 22, exp: 4000, gold: 5000, mat: 'kingHorn' },
  X: { name: '星喰い アポカリプス', kind: 'secret', lv: 70, hp: 4000, atk: 26, exp: 8000, gold: 9000, mat: 'starCore' },
};

RG.MATERIALS = {
  impHorn: 'インプの角', rotClaw: '腐った爪', blackFang: '黒い牙', oldBone: '古い骨', jelly: '魔性ゼリー',
  stoneWing: '石の翼', curseTag: '呪いの札', powder: '火薬袋', shade: '影の欠片', brokenShield: '割れた盾',
  scale: '毒の鱗粉', lens: '魔眼の水晶体', tongue: '擬態の舌', armorShard: '呪われた鎧片', fireCore: '炎の核',
  frostCloth: '凍てつく布', feather: '妖魔の羽根', bullHorn: '牛魔の角', crest: '魔騎士の紋章', bloodGem: '大悪魔の血晶',
  slimeCore: 'スライム王の核', golemCore: 'ゴーレムの魔核', tear: '霧の女王の涙', twinFang: '番犬の双牙', scaleV: '炉心竜の逆鱗',
  seed: '千年樹の種', whip: '炎獄の鞭', dragonSkull: '骨竜の頭骨', toadGland: '大蝦蟇の毒腺', wormHeart: '王蟲の心臓',
  witchEye: '魔女の瞳', phoenixTail: '不死鳥の尾羽', fallenWing: '堕天の羽根', kingHorn: '魔王の角', starCore: '星喰いの核',
};
