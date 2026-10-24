/*
 * デモン・インベージョン: ステージの外での成長 (恒久成長) のデータ
 *   戦功ポイントで強化する。値段 = base × (今の段階 + 1)
 *   desc の {v} は「今の段階での効果の合計」に置きかえる (per × 段階)
 */
(() => {
  'use strict';

  // 訓練所 (出撃する武将全員の強化)
  const TRAINING = [
    { id: 'hp', icon: '❤️', max: 10, base: 40, per: 5, name: '体力', desc: 'HP 上限 +{v}%', en: { name: 'Stamina', desc: 'Max HP +{v}%' } },
    { id: 'atk', icon: '🎯', max: 10, base: 50, per: 4, name: '射撃訓練', desc: '攻撃力 +{v}%', en: { name: 'Marksmanship', desc: 'Attack +{v}%' } },
    { id: 'move', icon: '👟', max: 5, base: 60, per: 3, name: '機動訓練', desc: '移動速度 +{v}%・回避が速く回復', en: { name: 'Mobility', desc: 'Move speed +{v}%, faster dodge cooldown' } },
    { id: 'xp', icon: '🔥', max: 5, base: 60, per: 5, name: '灯火の素質', desc: 'もらえる経験値 +{v}%', en: { name: 'Ember Talent', desc: 'Experience +{v}%' } },
    { id: 'res', icon: '⏱️', max: 5, base: 40, per: 8, name: '不屈', desc: '復帰までの時間 -{v}%', en: { name: 'Tenacity', desc: 'Respawn time -{v}%' } },
    { id: 'reroll', icon: '🔄', max: 3, base: 120, per: 1, name: '選び直し', desc: 'レベルアップの選び直し {v} 回', en: { name: 'Reroll', desc: '{v} level-up rerolls per battle' } },
    { id: 'choice', icon: '🃏', max: 1, base: 400, per: 1, name: '選択肢の数', desc: 'レベルアップの選択肢 +{v}', en: { name: 'More Choices', desc: '+{v} level-up choice' } },
    { id: 'head', icon: '⏩', max: 3, base: 150, per: 1, name: '先手', desc: 'レベル {v} つ上から始める', en: { name: 'Head Start', desc: 'Start {v} level(s) higher' } },
  ];

  // 防衛隊本部 (自軍の強化)
  const ARMY = [
    { id: 'cap', icon: '🏠', max: 5, base: 50, per: 5, name: '兵舎の拡張', desc: '自軍の兵舎の兵力 +{v}%', en: { name: 'Bigger Barracks', desc: 'Allied barracks capacity +{v}%' } },
    { id: 'logi', icon: '🚚', max: 5, base: 60, per: 4, name: '兵站', desc: '兵士が湧く間隔 -{v}%', en: { name: 'Supply Lines', desc: 'Soldier spawn interval -{v}%' } },
    { id: 'hq', icon: '🏢', max: 5, base: 60, per: 8, name: '本拠地の強化', desc: '本拠地の HP +{v}%・砲台の攻撃力も上がる', en: { name: 'Fortified HQ', desc: 'HQ HP +{v}%, stronger turret' } },
    { id: 'bar', icon: '🧱', max: 5, base: 50, per: 6, name: '兵舎の補強', desc: '兵舎の HP +{v}%', en: { name: 'Reinforced Barracks', desc: 'Barracks HP +{v}%' } },
    { id: 'rebuild', icon: '🚧', max: 3, base: 60, per: 10, name: '再建の手順', desc: '兵舎跡の再建にかかる時間 -{v}%', en: { name: 'Rebuild Drills', desc: 'Ruin rebuild time -{v}%' } },
    { id: 'room', icon: '🗺️', max: 1, base: 500, per: 1, name: '作戦司令室', desc: '出撃できる武将 +{v} 人', en: { name: 'War Room', desc: '+{v} hero slot' } },
  ];

  // 兵種の訓練 (各 5 段階・HP と攻撃力 +5%) と改良 (各 1 段階・特徴が 1 つ増える)
  const UNIT_TRAIN = { max: 5, base: 40, per: 5 };
  const UNIT_IMPROVE = {
    base: 200,
    infantry: { desc: '手榴弾を投げるようになる', en: 'Throws grenades' },
    heavy: { desc: '盾が広くなり、後ろの味方も守れる', en: 'A wider shield that covers allies behind' },
    medic: { desc: '回復の範囲が広がり、武将の回復量が 2 倍', en: 'Wider healing, double healing for heroes' },
    sniper: { desc: '弾が 1 体だけ貫通する', en: 'Bullets pierce one foe' },
    grenadier: { desc: '爆発した場所の敵を燃やす', en: 'Explosions set foes on fire' },
    engineer: { desc: '修理中の建物の被ダメージ -30%', en: 'Buildings under repair take 30% less damage' },
    apc: { desc: '大の兵舎からも出るようになる', en: 'Also deploys from Large barracks' },
  };

  // ヒーローの強化 (各 5 段階・HP と攻撃力 +6%、ステージ開始時のレベル +1 (+3 まで)、3・5 段階目で技が強くなる)
  const HERO_UP = { max: 5, base: 80, per: 6 };

  // 初期装備: ステージのクリア (stars: 0) と ★3 で選べるようになる
  const LOADOUTS = [
    { id: 'none', icon: '🔫', name: 'いつもの装備', desc: 'アサルトライフルだけで出撃する', en: { name: 'Standard Issue', desc: 'Deploy with just the assault rifle' } },
    { id: 'shotgun', kind: 'main', ab: 'shotgun', stage: 1, stars: 0 },
    { id: 'grenade', kind: 'skill', ab: 'grenade', stage: 1, stars: 3 },
    { id: 'flame', kind: 'main', ab: 'flame', stage: 2, stars: 0 },
    { id: 'heal', kind: 'skill', ab: 'heal', stage: 2, stars: 3 },
    { id: 'drone', kind: 'sub', ab: 'drone', stage: 3, stars: 0 },
    { id: 'mine', kind: 'skill', ab: 'mine', stage: 3, stars: 3 },
    { id: 'railgun', kind: 'main', ab: 'railgun', stage: 4, stars: 0 },
    { id: 'wall', kind: 'skill', ab: 'wall', stage: 4, stars: 3 },
    { id: 'gatling', kind: 'main', ab: 'gatling', stage: 5, stars: 0 },
    { id: 'airstrike', kind: 'ult', ab: 'airstrike', stage: 5, stars: 3 },
    { id: 'missile', kind: 'sub', ab: 'missile', stage: 6, stars: 0 },
    { id: 'charge', kind: 'skill', ab: 'charge', stage: 6, stars: 3 },
    { id: 'blades', kind: 'sub', ab: 'blades', stage: 7, stars: 0 },
    { id: 'purify', kind: 'ult', ab: 'purify', stage: 7, stars: 3 },
  ];

  window.DI_PROGRESS = { TRAINING, ARMY, UNIT_TRAIN, UNIT_IMPROVE, HERO_UP, LOADOUTS };
})();
