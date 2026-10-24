/*
 * デモン・インベージョン: 仲間のヒーローのデータ
 *   AI で戦う自軍のヒーロー。レベル 1 のときの値で、レベルが上がるごとに HP +6%・攻撃力 +4%。
 *   兵士と同じ書き方 (units.js) に加えて:
 *     unlock: このステージをクリアすると仲間になる (0 は最初から)
 *     skills: [技 1 (最初から), 技 2 (Lv5 から)]。動きは script.js の「仲間のヒーロー」の章
 *     cannon: 砲弾を撃つ (着いた所で半径 cannon の爆発) / claw: 後ろの悪魔 (祈祷師・呪術師など) を優先してねらう
 *     ward: まわりの姿を消した暗殺者を見破る
 */
(() => {
  'use strict';

  const H = (o) => o;

  const HEROES = {
    onizuka: H({
      unlock: 0, icon: '🛡️', name: '鬼塚 剛', title: '防衛隊長', role: '前衛',
      en: { name: 'Go Onizuka', title: 'Defense Captain', role: 'Vanguard' },
      desc: '大盾とショットガンで前に立ち、弾を受け止めて兵士を守る。', descEn: 'Holds the front line with a tower shield and shotgun, soaking fire to protect the troops.',
      hp: 650, r: 15, speed: 72, range: 200, aggro: 320, dmg: 5, pellets: 5, rof: 0.9, spread: 0.25, bulletSpeed: 800,
      shield: 0.5, color: '#6f9ae8', dark: '#1d3560',
      skills: ['rush', 'bulwark'],
    }),
    kasumi: H({
      unlock: 1, icon: '🎯', name: '霧島 カスミ', title: '狙撃手', role: '後衛',
      en: { name: 'Kasumi Kirishima', title: 'Sharpshooter', role: 'Marksman' },
      desc: '長射程のライフルで、祈祷師・呪術師・隊長を優先して撃ち抜く。', descEn: 'Picks off shamans, witches and captains from long range.',
      hp: 520, r: 13, speed: 70, range: 560, aggro: 580, dmg: 60, rof: 1.8, spread: 0.01, bulletSpeed: 1500,
      sniper: true, color: '#7ab8a8', dark: '#1e4a42',
      skills: ['pierce', 'vanish'],
    }),
    minato: H({
      unlock: 2, icon: '💉', name: '早瀬 ミナト', title: '衛生兵長', role: '支援',
      en: { name: 'Minato Hayase', title: 'Chief Medic', role: 'Support' },
      desc: 'まわりの兵士とプレイヤーを回復しながら戦う。', descEn: 'Keeps soldiers and the player alive while fighting.',
      hp: 620, r: 13, speed: 74, range: 260, aggro: 300, dmg: 10, rof: 0.8, spread: 0.05, bulletSpeed: 800,
      heal: 22, healRange: 220, color: '#f0f4fa', dark: '#5b6b80',
      skills: ['mend', 'rescue'],
    }),
    gen: H({
      unlock: 3, icon: '🔧', name: '岩城 ゲン', title: '工兵長', role: '拠点',
      en: { name: 'Gen Iwaki', title: 'Chief Engineer', role: 'Fortifier' },
      desc: '自軍の建物の修理と兵舎跡の再建が速い。機銃タレットを置く。', descEn: 'Repairs buildings and rebuilds ruins fast. Deploys machine-gun turrets.',
      hp: 800, r: 14, speed: 70, range: 280, aggro: 300, dmg: 7, rof: 0.2, spread: 0.08, bulletSpeed: 850,
      repair: 45, color: '#e0b04a', dark: '#6a4a10',
      skills: ['turret', 'overhaul'],
    }),
    shizuku: H({
      unlock: 4, icon: '⛩️', name: '白峰 シズク', title: '魔祓いの巫女', role: '対魔',
      en: { name: 'Shizuku Shiramine', title: 'Exorcist Shrine Maiden', role: 'Purifier' },
      desc: 'お札で悪魔を祓い、姿を消した暗殺者を見破る。', descEn: 'Exorcises demons with talismans and exposes hidden assassins.',
      hp: 640, r: 13, speed: 76, range: 340, aggro: 360, dmg: 18, rof: 0.7, spread: 0.04, bulletSpeed: 650,
      ward: 320, color: '#f2f2f8', dark: '#b03040',
      skills: ['barrier', 'arrow'],
    }),
    ren: H({
      unlock: 5, icon: '🚜', name: '鷹野 レン', title: '戦車長', role: '攻城',
      en: { name: 'Ren Takano', title: 'Tank Commander', role: 'Siege' },
      desc: '小型戦車に乗る。遅いが硬く、主砲は建物に強い。', descEn: 'Rides a light tank: slow but tough, with a main gun that wrecks buildings.',
      hp: 2000, r: 20, speed: 46, range: 400, aggro: 420, dmg: 50, rof: 2.0, cannon: 60, siege: 1,
      vehicle: true, color: '#5a7a4a', dark: '#22301a',
      skills: ['salvo', 'smoke'],
    }),
    lucia: H({
      unlock: 6, icon: '🦇', name: 'ルシア', title: '裏切りの悪魔', role: '遊撃',
      en: { name: 'Lucia', title: 'Turncoat Demon', role: 'Raider' },
      desc: '元魔将。敵の後ろへ回り込み、祈祷師や呪術師を狩る。', descEn: 'A former warlord who slips behind enemy lines to hunt shamans and witches.',
      hp: 760, r: 13, speed: 128, melee: true, range: 24, aggro: 420, dmg: 26, rof: 0.5,
      claw: true, color: '#8a3ac8', dark: '#2a0a45',
      skills: ['blink', 'hellfire'],
    }),
  };

  // 技の名前 (ヒーローの頭の上やお知らせに出す)
  const SKILLS = {
    rush: { name: '盾の突進', en: { name: 'Shield Rush' } },
    bulwark: { name: '鉄壁', en: { name: 'Bulwark' } },
    pierce: { name: '貫通弾', en: { name: 'Piercing Shot' } },
    vanish: { name: '隠れ身', en: { name: 'Vanish' } },
    mend: { name: '広域回復', en: { name: 'Mass Mend' } },
    rescue: { name: '救命処置', en: { name: 'Lifesaver' } },
    turret: { name: '機銃タレット', en: { name: 'MG Turret' } },
    overhaul: { name: '総点検', en: { name: 'Overhaul' } },
    barrier: { name: '結界', en: { name: 'Sacred Barrier' } },
    arrow: { name: '破魔の矢', en: { name: 'Demonbane Arrow' } },
    salvo: { name: '主砲の一斉射', en: { name: 'Full Salvo' } },
    smoke: { name: '煙幕', en: { name: 'Smoke Screen' } },
    blink: { name: '影渡り', en: { name: 'Shadow Step' } },
    hellfire: { name: '魔炎', en: { name: 'Hellfire' } },
  };

  window.DI_HEROES = { HEROES, SKILLS };
})();
