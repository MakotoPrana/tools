/*
 * デモン・インベージョン: レベルアップで選ぶ能力のデータ (名前・説明・アイコン)
 *   動きは script.js の「能力」の章にある。各能力は最大レベル 5。
 *   kind: main (メイン武器・プレイヤーが撃つ) / sub (灯火の武器・自動で撃つ) / skill (Q・E) / ult (必殺技・R) / passive / command (指揮)
 *   EVOLUTIONS は武器の進化 (武器のレベル 5 + 対応する能力)
 *   desc は「レベル 1 で何ができるか」、up は「レベルを上げると何が強くなるか」
 */
(() => {
  'use strict';

  const A = (id, kind, icon, name, desc, up, en) => ({ id, kind, icon, name, desc, up, en });

  const ABILITIES = [
    // ---------------- メイン武器 (1 つだけ。別のメイン武器を選ぶと持ち替える。レベルは引き継ぐ) ----------------
    A('rifle', 'main', '🔫', 'アサルトライフル', '中距離を連射する、はじめの武器。', '威力と連射の速さが上がる',
      { name: 'Assault Rifle', desc: 'Your starting gun: rapid fire at mid range.', up: 'More damage and a faster fire rate' }),
    A('shotgun', 'main', '💥', 'ショットガン', '近距離に散弾を撃つ。群れや大きな敵に強い。', '弾の数と威力が上がる',
      { name: 'Shotgun', desc: 'Sprays pellets at close range. Great against crowds and big foes.', up: 'More pellets and damage' }),
    A('gatling', 'main', '🌀', 'ガトリング', '撃ち続けるほど速くなる。撃っている間は足が遅い。', '威力と最高の連射速度が上がる',
      { name: 'Gatling Gun', desc: 'Spins up the longer you fire. You move slower while firing.', up: 'More damage and a higher top speed' }),
    A('railgun', 'main', '☄️', '灯火のレールガン', '押しっぱなしで溜め、離すと並んだ敵をまとめて貫く。', '溜めた一撃の威力が上がる',
      { name: 'Ember Railgun', desc: 'Hold to charge, release to pierce everything in a line.', up: 'A stronger charged shot' }),
    A('flame', 'main', '🔥', '火炎放射器', '前方を焼き払う。燃えた敵は少しずつダメージを受ける。', '炎の威力と届く距離が上がる',
      { name: 'Flamethrower', desc: 'Burns everything in front of you. Burning foes keep taking damage.', up: 'Hotter flames that reach farther' }),

    // ---------------- 灯火の武器 (サブ。2 つまで。自動で撃つ) ----------------
    A('missile', 'sub', '🚀', '追尾ミサイル', '数秒ごとに、近くの敵を追いかけるミサイルを撃つ。', 'ミサイルの数と威力が上がる',
      { name: 'Homing Missiles', desc: 'Every few seconds, fires missiles that chase nearby foes.', up: 'More missiles and damage' }),
    A('drone', 'sub', '🛸', '浮遊ドローン', 'まわりを飛び、近くの敵を撃つドローン。', '台数と威力が上がる',
      { name: 'Drone', desc: 'A drone that circles you and shoots nearby foes.', up: 'More drones and damage' }),
    A('blades', 'sub', '🗡️', '聖なる刃', 'まわりを回る光の刃が、近づいた敵を切る。', '刃の数と威力が上がる',
      { name: 'Holy Blades', desc: 'Blades of light circle you and cut down foes that get close.', up: 'More blades and damage' }),
    A('mortar', 'sub', '🎇', '迫撃砲', '遠くの敵の集団に砲弾を落とす。建物にも強い。', '間隔が短くなり、威力が上がる',
      { name: 'Mortar', desc: 'Lobs shells onto distant groups of foes. Strong against buildings.', up: 'Fires more often with more damage' }),
    A('lightning', 'sub', '⚡', '雷の柱', '画面の中の敵に、ランダムに雷を落とす。', '雷の数と威力が上がる',
      { name: 'Lightning Pillar', desc: 'Strikes random foes on screen with lightning.', up: 'More bolts and damage' }),

    // ---------------- スキル (2 つまで。Q・E) ----------------
    A('grenade', 'skill', '💣', '手榴弾', 'ねらった方向へ投げて爆発させる。建物にも効く。', '爆発が強くなり、クールダウンが短くなる',
      { name: 'Grenade', desc: 'Throw it where you aim and it explodes. Works on buildings too.', up: 'A bigger blast and a shorter cooldown' }),
    A('wall', 'skill', '🛡️', '灯火の盾', '前方に、敵の弾を防ぐ光の壁を出す。味方も守れる。', '壁が広く、長持ちになる',
      { name: 'Ember Shield', desc: 'Raises a wall of light in front of you that blocks enemy fire. Protects allies too.', up: 'A wider, longer-lasting wall' }),
    A('charge', 'skill', '💨', '突撃', '向いている方向へ一気に突進し、ぶつかった敵を吹き飛ばす。', '威力が上がり、クールダウンが短くなる',
      { name: 'Charge', desc: 'Rush forward, knocking aside every foe you hit.', up: 'More damage and a shorter cooldown' }),
    A('heal', 'skill', '💚', '回復の灯', '自分とまわりの味方の体力を回復する。', '回復量が増え、クールダウンが短くなる',
      { name: 'Healing Ember', desc: 'Heals you and nearby allies.', up: 'More healing and a shorter cooldown' }),
    A('mine', 'skill', '⚠️', '地雷設置', '足元に地雷を置く (最大 5 個)。踏んだ敵の群れを吹き飛ばす。', '爆発が強くなり、クールダウンが短くなる',
      { name: 'Land Mine', desc: 'Drop a mine at your feet (up to 5). It blows up the foes that step on it.', up: 'A bigger blast and a shorter cooldown' }),

    A('decoy', 'skill', '🎎', '囮人形', '悪魔の注意を引く人形を置く。近くの悪魔は人形を狙う。', '人形が硬く、長持ちになる',
      { name: 'Decoy', desc: 'Places a dummy that draws attention. Nearby demons attack it instead.', up: 'A tougher, longer-lasting decoy' }),
    A('leap', 'skill', '🦘', '灯火の跳躍', '建物を飛び越えて前へ跳ぶ。着地でまわりにダメージ。', '着地の威力が上がり、クールダウンが短くなる',
      { name: 'Ember Leap', desc: 'Leap forward over buildings. Landing damages everything around you.', up: 'A stronger landing and a shorter cooldown' }),
    A('engineer', 'skill', '🔧', '工兵の心得', 'いつでも兵舎跡の再建が速くなる。使うと、近くの自軍の建物を修理する。', '再建と修理が速くなる',
      { name: 'Field Engineer', desc: 'Always rebuild ruined barracks faster. Use it to repair nearby allied buildings.', up: 'Faster rebuilding and repairs' }),

    // ---------------- 必殺技 (1 つだけ。R。敵を倒すとたまるゲージを使う) ----------------
    A('airstrike', 'ult', '✈️', '空爆要請', '向いている方向に一直線の爆撃を落とす。兵舎にも大ダメージ。', '爆撃の威力が上がる',
      { name: 'Air Strike', desc: 'Calls a line of bombs in the direction you face. Heavy damage to barracks.', up: 'More powerful bombs' }),
    A('unleash', 'ult', '🔆', '灯火解放', '10 秒間、攻撃力・速さ・回復が大きく上がり、ほとんどダメージを受けない。', '効果が長く、強くなる',
      { name: 'Ember Unleashed', desc: 'For 10 seconds your attack, speed and healing soar and you barely take damage.', up: 'Lasts longer and hits harder' }),
    A('reinforce', 'ult', '📯', '援軍要請', 'まわりに自軍の精鋭兵を 8 人呼ぶ。', '精鋭兵が増えて強くなる',
      { name: 'Call Reinforcements', desc: 'Summons 8 elite soldiers around you.', up: 'More and stronger elites' }),
    A('purify', 'ult', '✨', '浄化の光', '画面の中のすべての悪魔に大ダメージを与える。', '威力が上がる',
      { name: 'Purifying Light', desc: 'Deals heavy damage to every demon on screen.', up: 'More damage' }),

    // ---------------- パッシブ (6 つまで) ----------------
    A('vital', 'passive', '❤️', '鍛えた体', 'HP 上限が 12% 上がる。', 'さらに 12% ずつ上がる',
      { name: 'Toughness', desc: 'Max HP +12%.', up: '+12% more per level' }),
    A('ammo', 'passive', '📦', '弾薬の加護', '弾数が 15% 増え、リロードが 10% 速くなる。', 'さらに増える',
      { name: 'Blessed Ammo', desc: 'Magazine +15% and reload 10% faster.', up: 'Even more per level' }),
    A('power', 'passive', '💪', '灯火の力', '攻撃力が 10% 上がる。', 'さらに 10% ずつ上がる',
      { name: 'Ember Power', desc: 'Attack +10%.', up: '+10% more per level' }),
    A('swift', 'passive', '👟', '軽い足取り', '移動速度が 6% 上がり、回避のクールダウンが短くなる。', 'さらに速くなる',
      { name: 'Light Feet', desc: 'Move speed +6% and a shorter dodge cooldown.', up: 'Even faster per level' }),
    A('regen', 'passive', '♻️', '再生', '3 秒ダメージを受けないと、体力が回復していく。', '回復が速くなる',
      { name: 'Regeneration', desc: 'Recover HP after 3 seconds without taking damage.', up: 'Faster recovery' }),
    A('soul', 'passive', '🔮', '魂の器', '魂の灯を拾える範囲と、もらえる経験値が増える。', 'さらに増える',
      { name: 'Soul Vessel', desc: 'Larger pickup range for soul embers and more experience.', up: 'Even more per level' }),
    A('armor', 'passive', '🦺', '装甲', '受けるダメージが 7% 減る。', 'さらに減る',
      { name: 'Armor', desc: 'Damage taken -7%.', up: 'Even less per level' }),
    A('focus', 'passive', '🎯', '集中', 'スキルのクールダウンが短くなり、必殺技のゲージが早くたまる。', 'さらに早くなる',
      { name: 'Focus', desc: 'Shorter skill cooldowns and a faster ultimate gauge.', up: 'Even faster per level' }),

    // ---------------- 指揮 (3 つまで。自軍の兵士・兵舎を強くする) ----------------
    A('aura', 'command', '🚩', '指揮官の威光', 'まわりの味方の兵士の攻撃力と速さが上がる。', '効果が強くなる',
      { name: "Commander's Presence", desc: 'Nearby allied soldiers gain attack and speed.', up: 'A stronger effect' }),
    A('inspire', 'command', '📣', '鼓舞', '敵を倒すたびに、まわりの味方の体力が少し回復する。', '回復量が増える',
      { name: 'Inspire', desc: 'Each foe you defeat heals nearby allies a little.', up: 'More healing' }),
    A('logistics', 'command', '🚚', '兵站の改善', '自軍の全兵舎から兵士が湧く間隔が 8% 短くなる。', 'さらに短くなる',
      { name: 'Better Logistics', desc: 'All allied barracks spawn soldiers 8% faster.', up: 'Even faster per level' }),
    A('elite', 'command', '🎖️', '精鋭化', '自軍の兵士が、ときどき強化版 (金の縁取り) で湧く。', '強化版の出る割合が増える',
      { name: 'Elite Training', desc: 'Allied soldiers sometimes spawn as elites (gold rims).', up: 'Elites appear more often' }),
    A('defense', 'command', '🧱', '防衛線', '自軍の兵舎と本拠地の HP が上がり、ゆっくり回復するようになる。', '効果が強くなる',
      { name: 'Defense Line', desc: 'Allied barracks and HQ gain HP and slowly repair themselves.', up: 'A stronger effect' }),
    A('reserves', 'command', '👥', '増員', '自軍の全兵舎の兵力が 10% 増える。', 'さらに 10% ずつ増える',
      { name: 'Reserves', desc: 'All allied barracks hold 10% more soldiers.', up: '+10% more per level' }),
  ];

  // 武器の進化: 武器をレベル 5 にして、need の能力を持っていると、次のレベルアップで進化を選べる
  const E = (id, need, icon, name, desc, en) => ({ id, need, kind: 'evo', icon, name, desc, en });
  const EVOLUTIONS = {
    rifle: E('rifle', 'ammo', '🔫', '灯火の制圧銃', '威力 1.5 倍・連射が速くなり、弾が敵を 1 体貫く。',
      { name: 'Ember Suppressor', desc: '1.5x damage, faster fire, and bullets pierce one foe.' }),
    shotgun: E('shotgun', 'power', '🐉', '竜の咆哮', '散弾が 3 粒増え、当たった敵を燃やす。',
      { name: "Dragon's Roar", desc: '3 more pellets, and every pellet sets foes ablaze.' }),
    gatling: E('gatling', 'armor', '🌪️', '鋼鉄の嵐', '撃っていても足が遅くならず、最高の連射がさらに速くなる。',
      { name: 'Steel Storm', desc: 'No slowdown while firing, and an even higher top speed.' }),
    railgun: E('railgun', 'focus', '🌠', '天穿ち', '溜めが半分の時間で済み、光線が太く、終点で爆発する。',
      { name: 'Sky Piercer', desc: 'Charges twice as fast, fires a wider beam, and explodes where it lands.' }),
    flame: E('flame', 'regen', '🐦‍🔥', '不死鳥の炎', '炎が遠くまで広く届き、燃える力が 2 倍。撃っている間は体力が回復する。',
      { name: 'Phoenix Flame', desc: 'Longer, wider flames with double burn, and you heal while firing.' }),
    missile: E('missile', 'soul', '👻', '魂の群れ', 'ミサイルが 2 倍に増え、爆発が大きくなる。',
      { name: 'Soul Swarm', desc: 'Twice as many missiles with bigger explosions.' }),
    drone: E('drone', 'aura', '🛰️', 'ドローン中隊', 'ドローンが 2 台増え、撃つのが速くなる。',
      { name: 'Drone Squadron', desc: 'Two more drones that fire faster.' }),
    blades: E('blades', 'vital', '⭕', '光輪の守護', '刃が 2 本増えて大きく回り、触れた敵の弾を消す。',
      { name: 'Halo Guardian', desc: 'Two more blades on a wider orbit that also destroy enemy shots.' }),
    mortar: E('mortar', 'swift', '🎆', '絨毯砲撃', '一度に 3 発ずつ撃ち込む。',
      { name: 'Carpet Barrage', desc: 'Fires three shells per volley.' }),
    lightning: E('lightning', 'inspire', '🌩️', '雷神の裁き', '雷が近くの敵 2 体に飛び移る。',
      { name: 'Thunder God', desc: 'Each bolt jumps to two more nearby foes.' }),
  };

  // 選択肢がないときに出すもの
  const FALLBACK = A('ration', 'fallback', '🍙', '応急手当', '体力を 50% 回復する。', '',
    { name: 'First Aid', desc: 'Restore 50% HP.', up: '' });

  const BY_ID = {};
  for (const a of ABILITIES) BY_ID[a.id] = a;

  window.DI_ABILITIES = { ABILITIES, BY_ID, EVOLUTIONS, FALLBACK, MAX_LV: 5 };
})();
