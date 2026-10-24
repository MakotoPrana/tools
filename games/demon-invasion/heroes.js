/*
 * デモン・インベージョン: 武将 (操作するヒーロー) のデータ
 *   出撃する武将を 2〜3 人選び、戦いの中で操作する武将を切り替える。操作していない武将は自動で戦う。
 *   レベル 1 のときの値で、レベルが上がるごとに HP +8%・攻撃力 +3% (プレイヤーの計算と同じ)。
 *     unlock: このステージをクリアすると仲間になる (0 は最初から)
 *     hp: HP、r: 当たりの大きさ、speed: 足の速さ (灯火の新兵を 1 とした倍率)
 *     weapon: 固有のメイン武器 (abilities.js の main の能力)。レベルアップで強くなるが、持ち替えはしない
 *     skills: [Q の技, E の技]。動きは script.js の「武将の技」
 *     free: 灯火の新兵だけ。メイン武器を持ち替え、スキルを覚え、初期装備を選べる (固有の技はない)
 *     shield: 前からの攻撃を減らす / heal: まわりの味方を回復 (毎秒) / repair: 近くの自軍の建物を修理 (毎秒)
 *     ward: まわりの姿を消した暗殺者を見破る / vehicle: 戦車 (絵の代わりに車体を描く)
 */
(() => {
  'use strict';

  const H = (o) => o;

  const HEROES = {
    recruit: H({
      unlock: 0, icon: '🔥', name: '灯火の新兵', title: '防衛隊の新兵', role: '万能',
      en: { name: 'Ember Recruit', title: 'Defense Force Rookie', role: 'All-rounder' },
      desc: 'レベルアップでメイン武器を持ち替え、スキルを自由に覚えて育つ。初期装備を選べる。', descEn: 'Grows freely: swaps main weapons and learns skills as it levels up. Can pick a starting loadout.',
      hp: 120, r: 11, speed: 1, weapon: 'rifle', skills: [], free: true,
      color: '#ffab3d', dark: '#2c3a58', sprite: 'player',
    }),
    onizuka: H({
      unlock: 0, icon: '🛡️', name: '鬼塚 剛', title: '防衛隊長', role: '前衛',
      en: { name: 'Go Onizuka', title: 'Defense Captain', role: 'Vanguard' },
      desc: '大盾とショットガンで前に立つ。前からの攻撃を半分にする。', descEn: 'Holds the front line with a tower shield and shotgun. Halves damage from the front.',
      hp: 260, r: 14, speed: 0.9, weapon: 'shotgun', skills: ['rush', 'bulwark'], shield: 0.5,
      color: '#6f9ae8', dark: '#1d3560',
    }),
    kasumi: H({
      unlock: 1, icon: '🎯', name: '霧島 カスミ', title: '狙撃手', role: '後衛',
      en: { name: 'Kasumi Kirishima', title: 'Sharpshooter', role: 'Marksman' },
      desc: '長射程の狙撃銃で、祈祷師・呪術師・隊長を撃ち抜く。弾は 1 体貫通する。', descEn: 'A long-range rifle that picks off shamans, witches and captains. Shots pierce one foe.',
      hp: 140, r: 12, speed: 0.95, weapon: 'sniper', skills: ['pierce', 'vanish'], sniper: true,
      color: '#7ab8a8', dark: '#1e4a42',
    }),
    minato: H({
      unlock: 2, icon: '💉', name: '早瀬 ミナト', title: '衛生兵長', role: '支援',
      en: { name: 'Minato Hayase', title: 'Chief Medic', role: 'Support' },
      desc: 'まわりで一番弱っている味方 (兵士・武将) を回復し続けながら戦う。', descEn: 'Keeps healing the most wounded ally nearby (soldiers and heroes) while fighting.',
      hp: 170, r: 12, speed: 1, weapon: 'smg', skills: ['mend', 'rescue'], heal: 18, healRange: 220,
      color: '#f0f4fa', dark: '#5b6b80',
    }),
    gen: H({
      unlock: 3, icon: '🔧', name: '岩城 ゲン', title: '工兵長', role: '拠点',
      en: { name: 'Gen Iwaki', title: 'Chief Engineer', role: 'Fortifier' },
      desc: '近くの自軍の建物を修理し、兵舎跡の再建が速い。機銃タレットを置く。', descEn: 'Repairs nearby buildings and rebuilds ruins fast. Deploys machine-gun turrets.',
      hp: 210, r: 13, speed: 0.9, weapon: 'mg', skills: ['turret', 'overhaul'], repair: 45,
      color: '#e0b04a', dark: '#6a4a10',
    }),
    shizuku: H({
      unlock: 4, icon: '⛩️', name: '白峰 シズク', title: '魔祓いの巫女', role: '対魔',
      en: { name: 'Shizuku Shiramine', title: 'Exorcist Shrine Maiden', role: 'Purifier' },
      desc: 'お札は悪魔を貫いて足を鈍らせる。まわりの姿を消した暗殺者を見破る。', descEn: 'Talismans pierce demons and slow them. Exposes hidden assassins nearby.',
      hp: 160, r: 12, speed: 1, weapon: 'talisman', skills: ['barrier', 'arrow'], ward: 320,
      color: '#f2f2f8', dark: '#b03040',
    }),
    ren: H({
      unlock: 5, icon: '🚜', name: '鷹野 レン', title: '戦車長', role: '攻城',
      en: { name: 'Ren Takano', title: 'Tank Commander', role: 'Siege' },
      desc: '小型戦車に乗る。遅いが硬く、主砲の砲弾は建物に強い。', descEn: 'Rides a light tank: slow but tough, with shells that wreck buildings.',
      hp: 480, r: 18, speed: 0.72, weapon: 'cannon', skills: ['salvo', 'smoke'], vehicle: true,
      color: '#5a7a4a', dark: '#22301a',
    }),
    lucia: H({
      unlock: 6, icon: '🦇', name: 'ルシア', title: '裏切りの悪魔', role: '遊撃',
      en: { name: 'Lucia', title: 'Turncoat Demon', role: 'Raider' },
      desc: '元魔将。足が速く、爪で前の敵をまとめて切り裂く。', descEn: 'A former warlord. Fast on her feet, her claws rend every foe in front of her.',
      hp: 200, r: 12, speed: 1.2, weapon: 'claw', skills: ['blink', 'hellfire'], claw: true,
      color: '#8a3ac8', dark: '#2a0a45',
    }),
  };

  // 武将の技: cd はクールダウン (秒)。desc は図鑑と出撃前の画面に出す
  const S = (icon, cd, name, desc, en) => ({ icon, cd, name, desc, en });
  const SKILLS = {
    rush: S('💨', 8, '盾の突進', '向いている方向へ突進し、ぶつかった敵を吹き飛ばす。', { name: 'Shield Rush', desc: 'Charge forward, knocking aside every foe you hit.' }),
    bulwark: S('🧱', 15, '鉄壁', 'まわりに 6 秒間の守りの円を張る。中の味方は受けるダメージ -30%。', { name: 'Bulwark', desc: 'Raise a 6-second guard circle. Allies inside take 30% less damage.' }),
    pierce: S('☄️', 8, '貫通弾', 'ねらった方向の敵をまとめて撃ち抜く。', { name: 'Piercing Shot', desc: 'A shot that tears through every foe in a line.' }),
    vanish: S('🌫️', 15, '隠れ身', '4 秒間姿を消し (悪魔にねらわれにくい)、体力を少し回復する。', { name: 'Vanish', desc: 'Turn nearly invisible for 4 seconds and recover a little HP.' }),
    mend: S('💚', 12, '広域回復', 'まわりの味方 (兵士・武将) の体力を大きく回復する。', { name: 'Mass Mend', desc: 'Heals every ally nearby, soldiers and heroes alike.' }),
    rescue: S('🚑', 20, '救命処置', 'どこにいても、一番弱っている武将を回復して 2 秒間無敵にする。', { name: 'Lifesaver', desc: 'Heals the most wounded hero anywhere and makes them invincible for 2 seconds.' }),
    turret: S('🔫', 18, '機銃タレット', '15 秒間、近くの悪魔を撃つ機銃を置く。', { name: 'MG Turret', desc: 'Deploys a machine gun that shoots nearby demons for 15 seconds.' }),
    overhaul: S('🛠️', 20, '総点検', '近くの自軍の建物をまとめて修理する。', { name: 'Overhaul', desc: 'Repairs every allied building nearby.' }),
    barrier: S('⛩️', 14, '結界', '6 秒間の結界を張る。中の悪魔は足が遅くなり、受けるダメージが増える。', { name: 'Sacred Barrier', desc: 'A 6-second barrier: demons inside are slowed and take more damage.' }),
    arrow: S('🏹', 9, '破魔の矢', 'ねらった方向へ、悪魔を貫く強力な光の矢を放つ。', { name: 'Demonbane Arrow', desc: 'Looses a mighty arrow of light that pierces every demon in a line.' }),
    salvo: S('🎇', 10, '主砲の一斉射', 'ねらった場所へ砲弾を 3 発撃ち込む。', { name: 'Full Salvo', desc: 'Fires three shells at the target area.' }),
    smoke: S('💨', 18, '煙幕', '4 秒間、受けるダメージが大きく減り、体力を少し回復する。', { name: 'Smoke Screen', desc: 'For 4 seconds you take far less damage, and you recover a little HP.' }),
    blink: S('🌑', 7, '影渡り', 'ねらった方向へ瞬間移動し、着いた所を切り裂く。', { name: 'Shadow Step', desc: 'Teleport in the aimed direction and slash everything where you land.' }),
    hellfire: S('🔥', 10, '魔炎', 'まわりを魔界の炎で焼き払う。', { name: 'Hellfire', desc: 'Engulfs everything around you in hellfire.' }),
  };

  window.DI_HEROES = { HEROES, SKILLS };
})();
