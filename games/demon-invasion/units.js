/*
 * デモン・インベージョン: 兵種のデータ
 *   自軍 (team 0) と敵軍 (team 1) の兵士。数値の意味は script.js の兵士の処理を参照。
 *     hp: 体力 / r: 当たりの半径 / speed: 移動速度 (px/秒)
 *     melee: 近接攻撃なら true / range: 射程 (px) / aggro: 敵に気づいて向かっていく距離
 *     dmg: 1回のダメージ / rof: 攻撃の間隔 (秒) / spread: 弾のぶれ (ラジアン) / bulletSpeed: 弾の速さ
 *     xp: 倒したときの経験値 (魂の灯)
 *     maxPer: 1 つの兵舎から同時に出せる数の上限 / siege: 建物へのダメージの割合 (書いていなければ 15%)
 *     fly: 空を飛ぶ (建物を越える) / stealth: 姿を消して近づく / support: 自分では攻撃しない (祈祷師)
 */
(() => {
  'use strict';

  const UNITS = {
    // ---------------- 自軍 ----------------
    infantry: {
      team: 0, name: '歩兵', en: { name: 'Infantry', desc: 'The most common soldier. Fires an assault rifle at mid range.' }, desc: '一番多い兵士。アサルトライフルで中距離を撃つ。',
      hp: 100, r: 10, speed: 70, range: 300, aggro: 330, dmg: 8, rof: 0.6, spread: 0.07, bulletSpeed: 760,
      color: '#4f7fd6', dark: '#24406e',
    },
    heavy: {
      team: 0, name: '重装兵', en: { name: 'Heavy', desc: 'Blocks 60% of frontal damage with a shield. Marches in front.' }, desc: '盾で前からの攻撃を 60% 防ぐ。最前列を歩く。',
      hp: 150, r: 12, speed: 50, range: 220, aggro: 260, dmg: 6, rof: 0.9, spread: 0.06, bulletSpeed: 700,
      shield: 0.6, // 前からの攻撃を 60% 防ぐ
      color: '#3e6fb8', dark: '#1d3560',
    },
    medic: {
      team: 0, name: '衛生兵', en: { name: 'Medic', desc: 'Heals nearby allies and the player.' }, desc: '近くの味方とプレイヤーを回復する。',
      hp: 90, r: 10, speed: 66, range: 220, aggro: 240, dmg: 6, rof: 0.9, spread: 0.08, bulletSpeed: 700,
      heal: 5, healRange: 130, // 近くの一番弱っている味方を 1 秒に 5 回復する
      color: '#e9eef5', dark: '#5b6b80',
    },
    sniper: {
      team: 0, name: '狙撃兵', en: { name: 'Sniper', desc: 'Heavy long-range shots. Targets big demons and captains first.' }, desc: '長射程の重い一撃。大きな悪魔や隊長を優先する。',
      hp: 70, r: 10, speed: 62, range: 520, aggro: 540, dmg: 45, rof: 2.6, spread: 0.01, bulletSpeed: 1400,
      sniper: true, // 大きな悪魔・隊長・祈祷師・呪術師を優先して撃つ
      color: '#5a86c8', dark: '#22385e',
    },
    grenadier: {
      team: 0, name: '擲弾兵', en: { name: 'Grenadier', desc: 'Lobs explosive rounds. Strong against buildings.' }, desc: '放り投げた弾で範囲を吹き飛ばす。建物に強い。',
      hp: 110, r: 10, speed: 64, range: 320, aggro: 340, dmg: 28, rof: 2.2, spread: 0, bulletSpeed: 0,
      lob: 55, siege: 0.5, // 弾を放り投げて、着いた所で半径 55 の爆発。建物に強い
      color: '#4f7fd6', dark: '#24406e',
    },
    engineer: {
      team: 0, name: '工兵', en: { name: 'Engineer', desc: 'Repairs damaged buildings and rebuilds ruins faster.' }, desc: '傷ついた建物を修理し、兵舎跡を速く再建する。',
      hp: 100, r: 10, speed: 68, range: 160, aggro: 220, dmg: 5, rof: 1.0, spread: 0.25, bulletSpeed: 750, pellets: 4,
      repair: 15, // 近くの傷ついた自軍の建物を 1 秒に 15 修理する。兵舎跡の再建も 1.5 倍
      color: '#d9a441', dark: '#6a4a10',
    },
    apc: {
      team: 0, name: '装甲車', en: { name: 'Armored Car', desc: 'An armored car with an autocannon. Tough and immovable.' }, desc: '機関砲の装甲車。硬く、吹き飛ばされない。',
      hp: 900, r: 18, speed: 45, range: 330, aggro: 350, dmg: 7, rof: 0.15, spread: 0.09, bulletSpeed: 900,
      maxPer: 1, vehicle: true,
      color: '#3d5a86', dark: '#1a2a44',
    },

    // ---------------- 敵軍 ----------------
    imp: {
      team: 1, name: 'インプ', en: { name: 'Imp', desc: 'Small and quick. Overwhelms with numbers.' }, desc: '小さくてすばしっこい。数で押してくる。',
      hp: 80, r: 8, speed: 140, melee: true, range: 20, aggro: 280, dmg: 12, rof: 0.5, xp: 6,
      color: '#e2483d', dark: '#6e1611',
    },
    ghoul: {
      team: 1, name: 'グール', en: { name: 'Ghoul', desc: 'Stubborn. Gets back up once after falling.' }, desc: 'しぶとい。倒れても 1 回だけ起き上がる。',
      hp: 160, r: 11, speed: 60, melee: true, range: 22, aggro: 240, dmg: 18, rof: 0.8, xp: 10,
      revive: 0.3, // 倒れたあと 1 回だけ HP 30% で起き上がる
      color: '#7d9478', dark: '#2f3b2c',
    },
    soldier: {
      team: 1, name: '魔弾兵', en: { name: 'Demon Soldier', desc: 'The backbone of the demon army, firing magic bolts.' }, desc: '魔弾を撃つ、悪魔の主力。',
      hp: 100, r: 10, speed: 65, range: 300, aggro: 330, dmg: 9, rof: 0.7, spread: 0.06, bulletSpeed: 460, xp: 8,
      color: '#8a2a52', dark: '#3b0b22',
    },
    hound: {
      team: 1, name: 'ヘルハウンド', en: { name: 'Hellhound', desc: 'Fast, charging in packs.' }, desc: '足が速く、群れで突っ込んでくる。',
      hp: 90, r: 10, speed: 150, melee: true, range: 22, aggro: 320, dmg: 14, rof: 0.5, xp: 8,
      color: '#e07a2a', dark: '#5e2a06',
    },
    gargoyle: {
      team: 1, name: 'ガーゴイル', en: { name: 'Gargoyle', desc: 'Flies over buildings. Turns to stone when it stops.' }, desc: '建物を越えて飛ぶ。止まると石になって硬い。',
      hp: 120, r: 11, speed: 95, melee: true, range: 22, aggro: 300, dmg: 14, rof: 0.7, xp: 10,
      fly: true, stone: 0.2, // 建物を越えて飛ぶ。止まっているあいだは石になり、受けるダメージが 20% になる
      color: '#8a8f9a', dark: '#3a3d45',
    },
    witch: {
      team: 1, name: '呪術師', en: { name: 'Witch', desc: 'Fires curses from afar that slow their target.' }, desc: '遠くから呪いの弾。当たると足が鈍る。',
      hp: 80, r: 10, speed: 60, range: 380, aggro: 400, dmg: 7, rof: 1.4, spread: 0.04, bulletSpeed: 300, xp: 10,
      curse: 3, // 当たった相手を 3 秒鈍らせる
      color: '#7a3aa8', dark: '#2e0d45',
    },
    bomber: {
      team: 1, name: '自爆デーモン', en: { name: 'Bomber', desc: 'Explodes on arrival. Shoot it early and it takes its friends with it.' }, desc: 'たどり着くと爆発する。遠くで撃てば仲間を巻き込む。',
      hp: 70, r: 10, speed: 125, melee: true, range: 14, aggro: 300, dmg: 60, rof: 1, xp: 6,
      bomb: 80, siege: 1, // 相手にたどり着くと半径 80 で爆発する。撃たれて倒れても爆発し、まわりの悪魔を巻き込む
      color: '#ff6a2a', dark: '#6a1a04',
    },
    shaman: {
      team: 1, name: '祈祷師', en: { name: 'Shaman', desc: 'Heals and empowers nearby demons. Take it out first.' }, desc: 'まわりの悪魔を回復し、攻撃力を上げる。最優先で倒したい。',
      hp: 110, r: 10, speed: 58, range: 0, aggro: 280, dmg: 0, rof: 1, xp: 14,
      support: true, heal: 8, healRange: 170, buff: 0.2, buffRange: 180, // まわりの悪魔を回復し、攻撃力を 20% 上げる
      color: '#3a8a7a', dark: '#0e3a32',
    },
    shadow: {
      team: 1, name: '影の暗殺者', en: { name: 'Shadow', desc: 'An invisible assassin that hunts the player.' }, desc: '姿を消してプレイヤーを狙う暗殺者。',
      hp: 90, r: 10, speed: 120, melee: true, range: 20, aggro: 500, dmg: 35, rof: 1.2, xp: 12,
      stealth: true, // 攻撃の直前と、攻撃を受けたときだけ姿が見える。プレイヤーをねらう
      color: '#2a2030', dark: '#0a060e',
    },
    ogre: {
      team: 1, name: 'オーガ', en: { name: 'Ogre', desc: 'A hulking brute that smashes cover with its club.' }, desc: '棍棒でなぎ払う巨体。遮蔽物を壊して進む。',
      hp: 600, r: 16, speed: 50, melee: true, range: 26, aggro: 260, dmg: 30, rof: 1.4, xp: 40,
      maxPer: 2, smash: 60, // 棍棒で半径 60 をなぎ払い、吹き飛ばす。遮蔽物を壊しながら進む
      color: '#7a5a3a', dark: '#2e1e0e',
    },
    behemoth: {
      team: 1, name: '破城獣', en: { name: 'Behemoth', desc: 'A giant siege demon. Protect the barracks!' }, desc: '建物を壊すための大型の悪魔。兵舎を守れ。',
      hp: 2000, r: 24, speed: 40, melee: true, range: 30, aggro: 300, dmg: 40, rof: 1.5, xp: 80,
      maxPer: 1, siege: 3, wrecker: true, // 建物を優先してねらい、建物に 3 倍のダメージ
      color: '#5a2a2a', dark: '#200808',
    },
  };

  // 敵の隊長 (魔将)。レベル 1 のときの値。レベルが上がるごとに hpUp・dmgUp の割合で強くなる
  //   skills: 覚える技とそのレベル
  //     charge: 突進 / wave: 弾を扇形に撃つ (waveN 発・見た目 waveLook) / ring: まわりに爆発 / summon: 手下を呼ぶ (summonType を summonN 体)
  //     rage: 怒り (体力が半分を切ると速くなる) / blink: 相手の後ろへ瞬間移動 / clone: 分身を 2 体出す / howl: まわりの悪魔の攻撃力を上げる
  //     pillar: 光の柱を落とす / revive: 倒れた悪魔をよみがえらせる
  //   ranged: 遠くから撃つ (bulletSpeed・look・curse は兵士と同じ) / siege: 建物へのダメージの倍率 / fly: 空を飛ぶ
  //   weapon: 見た目 (sword / staff / claws / daggers / club / wings) / twin: 相方の隊長 / guardian: 本拠地を守る魔王
  const CAPTAINS = {
    varga: {
      name: '魔将ヴァルガ', title: '獄炎の戦鬼', en: { name: 'Varga', title: 'Hellfire Warlord', desc: 'A warlord who charges with a greatsword and hurls flaming slashes.' },
      desc: '大剣で突進し、炎の斬撃を飛ばす魔将。',
      hp: 900, hpUp: 0.12, dmg: 22, dmgUp: 0.06, r: 18, speed: 85, range: 30, aggro: 340, rof: 0.9, startLv: 3,
      skills: { charge: 1, wave: 5, ring: 10, summon: 15, rage: 20 },
      waveN: 3, waveLook: 'fire', summonType: 'imp', summonN: 4, weapon: 'sword',
      xp: 160, color: '#c4281d', dark: '#4a0904',
    },
    nephilis: {
      name: '魔女ネフィリス', title: '呪いの女王', en: { name: 'Nephilis', title: 'Queen of Curses', desc: 'A witch who rains curses from afar and summons gargoyles.' },
      desc: '遠くから呪いの弾幕を放ち、ガーゴイルを呼ぶ魔女。',
      hp: 700, hpUp: 0.12, dmg: 14, dmgUp: 0.06, r: 16, speed: 75, range: 380, aggro: 420, rof: 0.8, startLv: 3,
      ranged: true, bulletSpeed: 360, spread: 0.05, curse: 2,
      skills: { wave: 1, summon: 5, ring: 10, blink: 15, rage: 20 },
      waveN: 5, waveLook: 'curse', summonType: 'gargoyle', summonN: 2, weapon: 'staff',
      xp: 170, color: '#7a3aa8', dark: '#2e0d45',
    },
    grados: {
      name: '魔獣グラドス', title: '鉄牙の獣王', en: { name: 'Grados', title: 'Ironfang Beast King', desc: 'A beast king leading hellhound packs. Wrecks buildings.' },
      desc: 'ヘルハウンドの群れを率いる獣王。建物に強い。',
      hp: 1100, hpUp: 0.12, dmg: 24, dmgUp: 0.06, r: 20, speed: 115, range: 30, aggro: 360, rof: 0.8, startLv: 3,
      siege: 2,
      skills: { charge: 1, summon: 5, howl: 10, ring: 15, rage: 20 },
      summonType: 'hound', summonN: 3, weapon: 'claws',
      xp: 180, color: '#c06a20', dark: '#4a2006',
    },
    mirage: {
      name: '影将ミラージュ', title: '千の影', en: { name: 'Mirage', title: 'Thousand Shadows', desc: 'A shadow general who confuses with teleports and clones.' },
      desc: '瞬間移動と分身で惑わす影の将。',
      hp: 800, hpUp: 0.12, dmg: 30, dmgUp: 0.06, r: 16, speed: 100, range: 26, aggro: 380, rof: 0.7, startLv: 3,
      skills: { blink: 1, clone: 5, wave: 10, summon: 15, rage: 20 },
      waveN: 4, waveLook: 'dagger', summonType: 'shadow', summonN: 2, weapon: 'daggers',
      xp: 190, color: '#4a3a6a', dark: '#0e0814',
    },
    bargon: {
      name: '巨魔バルゴン', title: '城砕き', en: { name: 'Bargon', title: 'Castle Crusher', desc: 'A giant who tears huge chunks out of buildings.' },
      desc: '建物を一撃で大きく削る巨魔。',
      hp: 2000, hpUp: 0.12, dmg: 40, dmgUp: 0.06, r: 26, speed: 55, range: 34, aggro: 320, rof: 1.5, startLv: 3,
      siege: 4,
      skills: { ring: 1, summon: 5, charge: 10, howl: 15, rage: 20 },
      summonType: 'ogre', summonN: 1, weapon: 'club',
      xp: 220, color: '#6a4a3a', dark: '#2a1a10',
    },
    raki: {
      name: '双魔ラキ', title: '紅の双剣', en: { name: 'Raki', title: 'Crimson Blades', desc: 'A twin-blade demon, stronger alongside Shiki.' },
      desc: '双剣の魔将。相方のシキと一緒だと強い。',
      hp: 900, hpUp: 0.12, dmg: 20, dmgUp: 0.06, r: 15, speed: 110, range: 26, aggro: 380, rof: 0.45, startLv: 3,
      twin: 'shiki', // 相方。近くにいると互いに攻撃力 +25%、相方が倒れると怒る
      skills: { blink: 1, charge: 5, wave: 10, rage: 20 },
      waveN: 3, waveLook: 'dagger', weapon: 'daggers',
      xp: 170, color: '#d03040', dark: '#4a0810',
    },
    shiki: {
      name: '双魔シキ', title: '蒼の魔術師', en: { name: 'Shiki', title: 'Azure Sorcerer', desc: 'A sorcerer demon, stronger alongside Raki.' },
      desc: '魔術の魔将。相方のラキと一緒だと強い。',
      hp: 750, hpUp: 0.12, dmg: 16, dmgUp: 0.06, r: 15, speed: 80, range: 360, aggro: 400, rof: 0.7, startLv: 3,
      ranged: true, bulletSpeed: 420, spread: 0.05, twin: 'raki',
      skills: { wave: 1, summon: 5, ring: 10, rage: 20 },
      waveN: 5, waveLook: 'fire', summonType: 'imp', summonN: 3, weapon: 'staff',
      xp: 170, color: '#3050d0', dark: '#0a1450',
    },
    seraphiel: {
      name: '堕天使セラフィエル', title: '偽りの光', en: { name: 'Seraphiel', title: 'The False Light', desc: 'Flies, calls down pillars of light and raises fallen demons.' },
      desc: '空を飛び、光の柱を落とし、倒れた悪魔をよみがえらせる。',
      hp: 1300, hpUp: 0.12, dmg: 18, dmgUp: 0.06, r: 18, speed: 90, range: 340, aggro: 400, rof: 0.6, startLv: 3,
      ranged: true, bulletSpeed: 500, spread: 0.04, look: 'holy', fly: true,
      // pillar: 光の柱を落とす / revive: 近くで倒れた悪魔をよみがえらせる
      skills: { wave: 1, pillar: 5, revive: 10, blink: 15, rage: 20 },
      waveN: 5, waveLook: 'holy', weapon: 'wings',
      xp: 220, color: '#e8e0c0', dark: '#6a5a30',
    },
    asmodeus: {
      name: '魔王アスモデウス', title: '魔界門の主', en: { name: 'Asmodeus', title: 'Lord of the Demon Gate', desc: 'The Demon King, bound to the gate. Grows fiercer as he weakens.' },
      desc: '魔界門と一体化した魔王。体力が減るほど激しくなる。',
      hp: 4000, hpUp: 0.08, dmg: 40, dmgUp: 0.05, r: 30, speed: 70, range: 40, aggro: 420, rof: 1.0, startLv: 10,
      siege: 2,
      // guardian: 魔界門を守る。門が攻撃されるか、プレイヤーが近づくと現れる。生きているあいだ、門の被ダメージ -50%
      //   技はレベルではなく、体力で 3 段階に変わる (phaseSkills)
      guardian: true,
      phaseSkills: [['charge', 'wave'], ['charge', 'wave', 'summon', 'ring'], ['charge', 'wave', 'summon', 'ring', 'pillar', 'rage']],
      skills: {},
      waveN: 7, waveLook: 'fire', summonType: 'ogre', summonN: 2, weapon: 'sword',
      xp: 400, color: '#5a0a2a', dark: '#1a0008',
    },
  };

  // 兵舎の大きさ。cap: 兵力 (同時に出せる兵士の最大数)、w・h: 大きさ (マス)
  const BARRACKS = {
    s: { cap: 10, hp: 1200, interval: 3.0, w: 3, h: 3, name: '小', en: { name: 'S' } },
    m: { cap: 20, hp: 2000, interval: 2.5, w: 4, h: 3, name: '中', en: { name: 'M' } },
    l: { cap: 35, hp: 3000, interval: 2.0, w: 5, h: 4, name: '大', en: { name: 'L' } },
    xl: { cap: 50, hp: 4500, interval: 1.6, w: 6, h: 4, name: '特大', en: { name: 'XL' } },
  };

  // 兵舎の大きさごとに湧く兵種の割合 [兵種, 重み]
  const MIX = {
    0: {
      s: [['infantry', 100]],
      m: [['infantry', 60], ['heavy', 20], ['medic', 10], ['engineer', 10]],
      l: [['infantry', 45], ['heavy', 15], ['medic', 10], ['engineer', 10], ['sniper', 10], ['grenadier', 10]],
      xl: [['infantry', 45], ['heavy', 15], ['medic', 10], ['engineer', 10], ['sniper', 10], ['grenadier', 10], ['apc', 6]],
    },
    1: {
      s: [['imp', 45], ['ghoul', 25], ['soldier', 30]],
      m: [['imp', 25], ['ghoul', 15], ['soldier', 25], ['hound', 15], ['gargoyle', 10], ['witch', 5], ['bomber', 5]],
      l: [['imp', 20], ['ghoul', 12], ['soldier', 22], ['hound', 12], ['gargoyle', 8], ['witch', 6], ['bomber', 6], ['shaman', 5], ['shadow', 5], ['ogre', 4]],
      xl: [['imp', 20], ['ghoul', 12], ['soldier', 22], ['hound', 12], ['gargoyle', 8], ['witch', 6], ['bomber', 6], ['shaman', 5], ['shadow', 5], ['ogre', 4], ['behemoth', 3]],
    },
  };

  window.DI_UNITS = { UNITS, BARRACKS, MIX, CAPTAINS };
})();
