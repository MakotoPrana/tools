/*
 * 言葉 (多言語対応)
 *   日本語の文をそのまま鍵にして、ほかの言葉の文を引く。
 *   RG.t('日本語の文 {n}', { n: 3 }) → 選んでいる言葉の文 ({n} などに値を差しこむ)
 *   データ (武器・敵・ステージなど) の name / desc なども RG.setLang で入れ替える
 *   行は [日本語, English, 简体中文, 한국어]
 */
window.RG = window.RG || {};

(() => {
  RG.LANGS = { ja: '日本語', en: 'English', zh: '简体中文', ko: '한국어' };
  const COL = { en: 1, zh: 2, ko: 3 };

  // 文字の形 (見出し / ふだんの文字)。日本語以外は、その言葉の字がそろった書体にする
  const FONTS = {
    ja: { display: '"Zen Antique", "Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif', ui: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif' },
    en: { display: '"Cinzel", "EB Garamond", "Shippori Mincho B1", serif', ui: '"EB Garamond", "Shippori Mincho B1", Georgia, serif' },
    zh: { display: '"ZCOOL XiaoWei", "Noto Serif SC", "Songti SC", serif', ui: '"Noto Serif SC", "Songti SC", "SimSun", serif' },
    ko: { display: '"Song Myung", "Nanum Myeongjo", serif', ui: '"Nanum Myeongjo", "AppleMyungjo", "Batang", serif' },
  };

  const ROWS = [
    // ---- 画面の文 ----
    [`推奨 Lv{a}〜{b}`, `Rec. Lv{a}–{b}`, `推荐 Lv{a}～{b}`, `권장 Lv{a}~{b}`],
    [`解放済み`, `Liberated`, `已解放`, `해방됨`],
    [`危険!`, `DANGER!`, `危险!`, `위험!`],
    [`魔巣を破壊した!  のこり {n}`, `Nest destroyed!  {n} left`, `摧毁了魔巢!  剩余 {n}`, `마둥지를 파괴했다!  남은 수 {n}`],
    [`解放のごほうび  +{exp} EXP  ・  +{gold} G`, `Liberation reward  +{exp} EXP  ·  +{gold} G`, `解放奖励  +{exp} EXP  ・  +{gold} G`, `해방 보상  +{exp} EXP  ・  +{gold} G`],
    [`町に人が戻り、武器屋が開いた!  黄色い矢印の先へ`, `The townsfolk are back and the gunsmith is open!  Follow the yellow arrow`, `居民回来了，武器店开张了!  前往黄色箭头所指之处`, `사람들이 돌아오고 무기점이 열렸다!  노란 화살표를 따라가자`],
    [`残党を一掃した`, `Remnants wiped out`, `残党已被肃清`, `잔당을 소탕했다`],
    [`{name} 解放!`, `{name} liberated!`, `{name} 已解放!`, `{name} 해방!`],
    [`この先は {name}（Lv{lv}）の決闘場\n入ると、倒すか力尽きるまでこのエリアから出られない`, `Ahead lies the arena of {name} (Lv{lv})\nOnce inside, you can't leave this area until you win or fall`, `前方是 {name}（Lv{lv}）的决斗场\n进入后，在击败对手或倒下之前无法离开此区域`, `이 앞은 {name}(Lv{lv})의 결투장\n들어가면 쓰러뜨리거나 힘이 다할 때까지 이 지역에서 나갈 수 없다`],
    [`エリアの出口に結界が張られた!`, `The area's exits are sealed by a barrier!`, `区域出口被结界封锁了!`, `지역 출구에 결계가 쳐졌다!`],
    [`{name} が怒り狂っている!`, `{name} is enraged!`, `{name} 狂怒了!`, `{name}이(가) 격노했다!`],
    [`分身`, `Clone`, `分身`, `분신`],
    [`{name}への門が開いた`, `The gate to {name} has opened`, `通往{name}的大门打开了`, `{name}(으)로 가는 문이 열렸다`],
    [`{name} 撃破!`, `{name} defeated!`, `击败 {name}!`, `{name} 격파!`],
    [`{name} を手に入れた`, `Got {name}`, `获得了 {name}`, `{name}을(를) 손에 넣었다`],
    [`ステージ{id} {name}`, `Stage {id}  {name}`, `第{id}关 {name}`, `스테이지{id} {name}`],
    [`転移碑を調べる`, `Examine waystone`, `调查传送碑`, `전이비 조사`],
    [`転移碑（未起動）`, `Waystone (inactive)`, `传送碑（未启动）`, `전이비(미가동)`],
    [`武器屋に入る`, `Enter gunsmith`, `进入武器店`, `무기점에 들어간다`],
    [`この先は ステージ{id} {name}\n（このバージョンでは準備中です）`, `Ahead: Stage {id} {name}\n(Not available in this version yet)`, `前方是 第{id}关 {name}\n（此版本尚在准备中）`, `이 앞은 스테이지{id} {name}\n(이 버전에서는 준비 중입니다)`],
    [`守護者を倒すと起動する`, `Activates when the guardian is defeated`, `击败守护者后启动`, `수호자를 쓰러뜨리면 가동한다`],
    [`このエリアを解放すると起動する`, `Activates when this area is liberated`, `解放此区域后启动`, `이 지역을 해방하면 가동한다`],
    [`{name} に魔巣が戻ってきた…`, `Nests have returned to {name}…`, `魔巢回到了 {name}…`, `{name}에 마둥지가 돌아왔다…`],
    [`力尽きた…\n所持金 −{g} G`, `You have fallen…\nGold −{g} G`, `力竭倒下…\n持有金钱 −{g} G`, `쓰러졌다…\n소지금 −{g} G`],
    [`力尽きた…`, `You have fallen…`, `力竭倒下…`, `쓰러졌다…`],
    [`武器屋`, `Gunsmith`, `武器店`, `무기점`],
    [`戦力 Lv{n}`, `Power Lv{n}`, `战力 Lv{n}`, `전력 Lv{n}`],
    [`回復薬 {n}`, `Potions {n}`, `回复药 {n}`, `회복약 {n}`],
    [`解放済み ✓`, `Liberated ✓`, `已解放 ✓`, `해방됨 ✓`],
    [`魔巣 {a}/{b}`, `Nests {a}/{b}`, `魔巢 {a}/{b}`, `마둥지 {a}/{b}`],
    [`自動でねらって撃つ`, `Auto-aim & fire`, `自动瞄准射击`, `자동 조준 사격`],
    [`ねらって撃つ`, `Manual aim`, `手动瞄准射击`, `수동 조준 사격`],
    [`‹ 戻る`, `‹ Back`, `‹ 返回`, `‹ 뒤로`],
    [`魔境奪還<br>ガンナーズ`, `Reclaim<br>Gunners`, `魔境夺还<br>枪手`, `마경 탈환<br>거너즈`],
    [`悪魔に侵略されたヴェルデ地方を取り戻せ`, `Take back the Verde Region from the demon horde`, `从恶魔手中夺回被侵略的维尔德地区`, `악마에게 침략당한 베르데 지방을 되찾아라`],
    [`はじめる`, `Start`, `开始`, `시작`],
    [`設定`, `Settings`, `设置`, `설정`],
    [`{name} 解放 {n} エリア`, `{name}: {n} areas`, `{name} 已解放 {n} 个区域`, `{name} 해방 {n}개 지역`],
    [`この環境ではセーブできません`, `Saving is not available in this environment`, `此环境无法存档`, `이 환경에서는 저장할 수 없습니다`],
    [`開発中のバージョンです（ステージ2 まで遊べます）`, `Development version (playable through Stage 2)`, `开发中的版本（可游玩至第2关）`, `개발 중인 버전입니다(스테이지2까지 플레이 가능)`],
    [`主人公を選ぶ`, `Choose a hero`, `选择主角`, `주인공 선택`],
    [`体力 {hp} ・ 移動速度 {spd} ・ 回避: {dn}（{dd}）`, `HP {hp} · Speed {spd} · Dodge: {dn} ({dd})`, `体力 {hp} ・ 移动速度 {spd} ・ 闪避: {dn}（{dd}）`, `체력 {hp} ・ 이동 속도 {spd} ・ 회피: {dn}({dd})`],
    [`特性: {v}`, `Trait: {v}`, `特性: {v}`, `특성: {v}`],
    [`解放したエリア {a} ・ 所持金 {g} G ・ EXP {e}`, `Areas liberated {a} · Gold {g} G · EXP {e}`, `已解放区域 {a} ・ 持有金钱 {g} G ・ EXP {e}`, `해방한 지역 {a} ・ 소지금 {g} G ・ EXP {e}`],
    [`{name} で始める`, `Start as {name}`, `以 {name} 开始`, `{name}(으)로 시작`],
    [`難易度（{name}）`, `Difficulty ({name})`, `难度（{name}）`, `난이도({name})`],
    [`ノーマルで魔王を倒すと開く`, `Unlocked by defeating the Demon King on Normal`, `在普通难度击败魔王后解锁`, `노멀에서 마왕을 쓰러뜨리면 열린다`],
    [`ハードで魔王を倒すと開く`, `Unlocked by defeating the Demon King on Hard`, `在困难难度击败魔王后解锁`, `하드에서 마왕을 쓰러뜨리면 열린다`],
    [`敵 Lv +{lv} ・ 湧く量 ×{cap}`, `Enemy Lv +{lv} · Spawns ×{cap}`, `敌人 Lv +{lv} ・ 涌出量 ×{cap}`, `적 Lv +{lv} ・ 출현량 ×{cap}`],
    [`解放 {n}`, `Liberated {n}`, `已解放 {n}`, `해방 {n}`],
    [`準備中`, `Coming soon`, `准备中`, `준비 중`],
    [`🔒 守護者を倒すと開く`, `🔒 Defeat the guardian to unlock`, `🔒 击败守护者后开放`, `🔒 수호자를 쓰러뜨리면 열린다`],
    [`解放 {n}%`, `{n}% liberated`, `已解放 {n}%`, `해방 {n}%`],
    [`‹ タイトル`, `‹ Title`, `‹ 标题`, `‹ 타이틀`],
    [`ヴェルデ地方`, `Verde Region`, `维尔德地区`, `베르데 지방`],
    [`全体図`, `World map`, `全图`, `전체 지도`],
    [`魔境奪還ガンナーズ`, `Reclaim Gunners`, `魔境夺还枪手`, `마경 탈환 거너즈`],
    [`目標`, `Objective`, `目标`, `목표`],
    [`魔王ベリアルを倒し`, `Defeat Belial the Demon King`, `击败魔王彼列`, `마왕 벨리알을 쓰러뜨리고`],
    [`ヴェルデ地方を取り戻す`, `and reclaim the Verde Region`, `夺回维尔德地区`, `베르데 지방을 되찾는다`],
    [`解放 {a}/{b} エリア`, `{a}/{b} areas liberated`, `已解放 {a}/{b} 个区域`, `해방 {a}/{b} 지역`],
    [`能力ボード`, `Skill Board`, `能力盘`, `능력 보드`],
    [`装備`, `Equipment`, `装备`, `장비`],
    [`このステージへ`, `Go to this stage`, `前往此关卡`, `이 스테이지로`],
    [`守護者を倒すと開く`, `Defeat the guardian to unlock`, `击败守护者后开放`, `수호자를 쓰러뜨리면 열린다`],
    [`タイトルに戻りますか？\n最後のセーブ以降の進み具合は失われます。`, `Return to the title?\nProgress since your last save will be lost.`, `要返回标题吗？\n上次存档之后的进度将会丢失。`, `타이틀로 돌아갈까요?\n마지막 저장 이후의 진행 상황은 사라집니다.`],
    [`{name}（守護者の決闘場）`, `{name} (guardian's arena)`, `{name}（守护者的决斗场）`, `{name}(수호자의 결투장)`],
    [`{name}（{from}から）`, `{name} (from {from})`, `{name}（来自{from}）`, `{name}({from}에서)`],
    [`エリアを押すと、くわしく出ます`, `Tap an area for details`, `点击区域查看详情`, `지역을 누르면 자세히 나옵니다`],
    [`（撃破）`, ` (defeated)`, `（已击败）`, `(격파)`],
    [`ここへ転移`, `Warp here`, `传送到这里`, `여기로 전이`],
    [`ここから始める`, `Start here`, `从这里开始`, `여기서 시작`],
    [`未解放（歩いて向かう）`, `Not liberated (go on foot)`, `未解放（需步行前往）`, `미해방(걸어서 가야 함)`],
    [`転移碑が未起動`, `Waystone inactive`, `传送碑未启动`, `전이비 미가동`],
    [`★強いエリア`, `★Dangerous area`, `★强敌区域`, `★강한 지역`],
    [`町`, `Town`, `城镇`, `마을`],
    [`魔巣 {n}`, `Nests {n}`, `魔巢 {n}`, `마둥지 {n}`],
    [`未解放`, `Not liberated`, `未解放`, `미해방`],
    [`ボス: {v}`, `Boss: {v}`, `首领: {v}`, `보스: {v}`],
    [`、`, `, `, `、`, `, `],
    [`{name}へ`, `To {name}`, `前往{name}`, `{name}(으)로`],
    [`転移先を選ぶ`, `Choose a destination`, `选择传送目的地`, `전이할 곳 선택`],
    [`マップ`, `Map`, `地图`, `지도`],
    [`エリアを選ぶ`, `Choose an area`, `选择区域`, `지역 선택`],
    [`全体図へ戻る`, `Back to world map`, `返回全图`, `전체 지도로`],
    [`メニュー`, `Menu`, `菜单`, `메뉴`],
    [`再開`, `Resume`, `继续`, `재개`],
    [`素材`, `Materials`, `素材`, `소재`],
    [`全体図へ戻れるのは、解放済みのエリアか、転移碑のそばにいるときだけ`, `You can return to the world map only in a liberated area or near a waystone`, `只有在已解放区域或传送碑附近才能返回全图`, `전체 지도로는 해방된 지역이나 전이비 근처에서만 돌아갈 수 있다`],
    [`セーブはエリアの解放・ボスの撃破・力尽きたときに自動で行われます`, `The game saves automatically when you liberate an area, defeat a boss, or fall`, `解放区域、击败首领或倒下时会自动存档`, `지역 해방・보스 격파・쓰러졌을 때 자동으로 저장됩니다`],
    [`全体図へ戻りますか？\n（最後のセーブ以降の進み具合は保存されていません。ページを閉じると失われます）`, `Return to the world map?\n(Progress since your last save isn't saved yet. Closing the page will lose it)`, `要返回全图吗？\n（上次存档之后的进度尚未保存，关闭页面将会丢失）`, `전체 지도로 돌아갈까요?\n(마지막 저장 이후의 진행 상황은 저장되지 않았습니다. 페이지를 닫으면 사라집니다)`],
    [`やめる`, `Cancel`, `取消`, `취소`],
    [`はい`, `Yes`, `是`, `예`],
    [`転移碑`, `Waystone`, `传送碑`, `전이비`],
    [`体力と回復薬が全回復した`, `HP and potions fully restored`, `体力与回复药已完全恢复`, `체력과 회복약이 모두 회복되었다`],
    [`転移する`, `Warp`, `传送`, `전이한다`],
    [`再侵攻（残党狩り）`, `Reinvade (hunt remnants)`, `再侵攻（清剿残党）`, `재침공(잔당 사냥)`],
    [`浄化する（残党狩りをやめる）`, `Purify (stop the hunt)`, `净化（停止清剿残党）`, `정화한다(잔당 사냥 중지)`],
    [`閉じる`, `Close`, `关闭`, `닫기`],
    [`再侵攻: このエリアの魔巣を元に戻して戦い直す（解放のごほうびはない）`, `Reinvade: restore this area's nests and fight again (no liberation reward)`, `再侵攻: 恢复此区域的魔巢并重新战斗（没有解放奖励）`, `재침공: 이 지역의 마둥지를 되살려 다시 싸운다(해방 보상 없음)`],
    [`最大`, `MAX`, `最大`, `최대`],
    [`武器スロット`, `Weapon slots`, `武器槽`, `무기 슬롯`],
    [`最大の 6 つまで開いた`, `All 6 slots unlocked`, `已开放至最多 6 个`, `최대 6개까지 열었다`],
    [`条件: {v}`, `Requires: {v}`, `条件: {v}`, `조건: {v}`],
    [`武器を持てる数が増える`, `Carry one more weapon`, `可携带的武器数量增加`, `들 수 있는 무기 수가 늘어난다`],
    [`経験値を使って能力を 1 ランクずつ解放する。使った経験値は戻らない。`, `Spend EXP to raise skills one rank at a time. Spent EXP is not refunded.`, `消耗经验值逐级解锁能力。消耗的经验值无法返还。`, `경험치를 사용해 능력을 1랭크씩 해방한다. 사용한 경험치는 돌아오지 않는다.`],
    [`空き`, `Empty`, `空`, `비어 있음`],
    [`スロット{n}`, `Slot {n}`, `槽位{n}`, `슬롯{n}`],
    [`スロット{n}へ`, `To slot {n}`, `装入槽位{n}`, `슬롯{n}에`],
    [`使えない`, `Can't use`, `无法使用`, `사용 불가`],
    [`武器スロット {a}/6`, `Weapon slots {a}/6`, `武器槽 {a}/6`, `무기 슬롯 {a}/6`],
    [`スロット{n}を外す`, `Unequip slot {n}`, `卸下槽位{n}`, `슬롯{n} 해제`],
    [`武器庫`, `Armory`, `武器库`, `무기고`],
    [`威力 {v}`, `DMG {v}`, `威力 {v}`, `위력 {v}`],
    [`連射 {v}/秒`, `Rate {v}/s`, `射速 {v}/秒`, `연사 {v}/초`],
    [`装弾 {v}`, `Mag {v}`, `弹容 {v}`, `장탄 {v}`],
    [`魔力 {v}`, `Mana {v}`, `魔力 {v}`, `마력 {v}`],
    [`全属性`, `All elements`, `全属性`, `전 속성`],
    [`所持`, `Owned`, `已持有`, `보유`],
    [`この主人公は使えない`, `This hero can't use it`, `该主角无法使用`, `이 주인공은 사용 불가`],
    [`ステージのエリアを半分解放すると、品ぞろえが増える`, `Liberate half the stage's areas to expand the stock`, `解放关卡一半的区域后，商品会增加`, `스테이지 지역을 절반 해방하면 품목이 늘어난다`],
    [`ステージを全部解放してヌシを倒すと、目玉の品が並ぶ`, `Liberate the whole stage and defeat its Lord to unlock the prize stock`, `解放整个关卡并击败霸主后，会上架招牌商品`, `스테이지를 모두 해방하고 군주를 쓰러뜨리면 특별 상품이 진열된다`],
    [`品ぞろえは最大`, `Fully stocked`, `商品已齐全`, `품목 최대`],
    [`品ぞろえ 第{n}段階 ・ {hint}`, `Stock tier {n} · {hint}`, `商品 第{n}阶段 ・ {hint}`, `품목 {n}단계 ・ {hint}`],
    [`装弾 +{v}`, `Mag +{v}`, `弹容 +{v}`, `장탄 +{v}`],
    [`この店では +{n} まで`, `Up to +{n} here`, `本店最多 +{n}`, `이 상점은 +{n}까지`],
    [`強化できる武器がない`, `No weapons to upgrade`, `没有可强化的武器`, `강화할 수 있는 무기가 없다`],
    [`この店で強化できるのは +{n} まで（お店の格による）`, `This shop can upgrade up to +{n} (depends on the shop's grade)`, `本店最多可强化至 +{n}（取决于店铺等级）`, `이 상점에서는 +{n}까지 강화할 수 있다(상점 등급에 따름)`],
    [`{desc}（転移碑を使うと全回復する）`, `{desc} (fully restocked at waystones)`, `{desc}（使用传送碑会完全恢复）`, `{desc}(전이비를 사용하면 모두 회복)`],
    [`満タン`, `Full`, `已满`, `가득`],
    [`武器を買う`, `Buy`, `购买武器`, `무기 구매`],
    [`強化`, `Upgrade`, `强化`, `강화`],
    [`道具`, `Items`, `道具`, `도구`],
    [`（スロット{n}に装備）`, ` (equipped in slot {n})`, `（已装入槽位{n}）`, `(슬롯{n}에 장착)`],
    [`（装備から入れ替えられます）`, ` (swap it in from Equipment)`, `（可在装备中替换）`, `(장비에서 교체할 수 있습니다)`],
    [`素材は、魔法屋で必殺技を買うときに使う（魔法屋はステージ2 の町から）`, `Materials are used to buy special moves at the magic shop (from the Stage 2 town on)`, `素材用于在魔法店购买必杀技（魔法店从第2关的城镇开始出现）`, `소재는 마법 상점에서 필살기를 살 때 쓴다(마법 상점은 스테이지2 마을부터)`],
    [`まだ持っていない`, `None yet`, `还没有`, `아직 없다`],
    [`効果音`, `Sound effects`, `音效`, `효과음`],
    [`近くの敵へ武器が自動でねらいを向けて撃つ。OFF のときは、マウスを押している間（スマホは右側をなぞっている間）だけ撃つ`, `Guns automatically aim at and fire on nearby enemies. When OFF, they fire only while the mouse is held (on phones, while you drag on the right side)`, `武器自动瞄准附近的敌人并射击。关闭时，只在按住鼠标期间（手机为在右侧滑动期间）射击`, `무기가 근처의 적을 자동으로 조준해 쏜다. OFF일 때는 마우스를 누르고 있는 동안(스마트폰은 오른쪽을 문지르는 동안)만 쏜다`],
    [`ダメージの数字`, `Damage numbers`, `伤害数字`, `대미지 숫자`],
    [`縦持ちのとき横向きに回す（スマホ）`, `Rotate to landscape when held upright (phone)`, `竖屏时旋转为横屏（手机）`, `세로로 들 때 가로로 회전(스마트폰)`],
    [`画面が自動で回らないときに、ゲームを 90° 回して横向きで遊ぶ`, `If the screen doesn't auto-rotate, turn the game 90° to play in landscape`, `屏幕不自动旋转时，将游戏旋转 90° 以横屏游玩`, `화면이 자동으로 회전하지 않을 때 게임을 90° 돌려 가로로 플레이`],
    [`体力は満タンです`, `HP is already full`, `体力已满`, `체력이 가득합니다`],
    [`武器屋は悪魔に占拠されている\n（町を解放すると開く）`, `The gunsmith is occupied by demons\n(liberate the town to open it)`, `武器店被恶魔占据了\n（解放城镇后开放）`, `무기점은 악마에게 점거되어 있다\n(마을을 해방하면 열린다)`],
    [`入口`, `Entrance`, `入口`, `입구`],
    [`店`, `Shop`, `店`, `상점`],
    // ---- ページの文 (index.html) ----
    [`‹ ゲーム一覧`, `‹ Games`, `‹ 游戏列表`, `‹ 게임 목록`],
    [`ゲーム画面`, `Game screen`, `游戏画面`, `게임 화면`],
    [`調べる`, `Examine`, `调查`, `조사`],
    [`回復`, `Heal`, `回复`, `회복`],
    [`回避`, `Dodge`, `闪避`, `회피`],
    [`セーブしました`, `Saved`, `已存档`, `저장했습니다`],
    [`武器は近くの敵を自動でねらって撃ち、持っている武器は全部同時に攻撃します。`, `Your guns automatically aim at nearby enemies, and every equipped gun fires at once.`, `武器会自动瞄准附近的敌人射击，所有装备的武器同时攻击。`, `무기는 근처의 적을 자동으로 조준해 쏘고, 장착한 무기는 모두 동시에 공격합니다.`],
    [`パソコン: WASD で移動。マウスを押している間は、その向きに撃つ。Space / Shift 回避 / R リロード / E 調べる / F 回復薬 / M マップ / Esc メニュー。`, `PC: WASD to move. Hold the mouse to fire in that direction. Space / Shift dodge / R reload / E examine / F potion / M map / Esc menu.`, `电脑: WASD 移动。按住鼠标时朝该方向射击。Space / Shift 闪避 / R 装填 / E 调查 / F 回复药 / M 地图 / Esc 菜单。`, `PC: WASD로 이동. 마우스를 누르는 동안 그 방향으로 쏜다. Space / Shift 회피 / R 재장전 / E 조사 / F 회복약 / M 지도 / Esc 메뉴.`],
    [`スマホ: 横持ちで、画面の左半分で移動。右半分をなぞると、その向きに撃つ。回避と回復は右下の大きなボタン。`, `Phone: hold it sideways. Drag on the left half to move; drag on the right half to fire that way. Dodge and Heal are the big buttons at the bottom right.`, `手机: 横屏游玩。在左半边拖动来移动，在右半边滑动朝该方向射击。闪避和回复是右下角的大按钮。`, `스마트폰: 가로로 들고, 화면 왼쪽 절반으로 이동. 오른쪽 절반을 문지르면 그 방향으로 쏜다. 회피와 회복은 오른쪽 아래의 큰 버튼.`],

    // ---- 難易度 ----
    [`ノーマル`, `Normal`, `普通`, `노멀`],
    [`ハード`, `Hard`, `困难`, `하드`],
    [`エクストリーム`, `Extreme`, `极限`, `익스트림`],

    // ---- 武器カテゴリ ----
    [`ハンドガン`, `Handgun`, `手枪`, `핸드건`],
    [`軽い・リロードが速い・移動しながら撃ちやすい`, `Light, quick to reload, easy to fire on the move`, `轻便・装填快・便于边移动边射击`, `가볍고 재장전이 빠르며 이동하며 쏘기 쉽다`],
    [`ショットガン`, `Shotgun`, `霰弹枪`, `샷건`],
    [`近距離で強い。散弾・ノックバック`, `Strong up close. Spread shot, knockback`, `近距离强力。散弹・击退`, `근거리에서 강하다. 산탄・넉백`],
    [`重火器`, `Heavy`, `重火器`, `중화기`],
    [`撃っている間は移動速度 −25%。高火力・範囲攻撃`, `Move speed −25% while firing. High damage, area attacks`, `射击时移动速度 −25%。高火力・范围攻击`, `사격 중 이동 속도 −25%. 고화력・범위 공격`],
    [`精密射撃`, `Precision`, `精确射击`, `정밀 사격`],
    [`遠距離・貫通・会心が出やすい。連射は遅い`, `Long range, piercing, frequent crits. Slow fire rate`, `远距离・穿透・易暴击。射速慢`, `원거리・관통・치명타가 잘 터진다. 연사는 느리다`],
    [`魔導`, `Arcane`, `魔导`, `마도`],
    [`属性攻撃・特殊効果。弾のかわりに魔力（自然に回復）`, `Elemental attacks and special effects. Uses mana instead of ammo (regenerates)`, `属性攻击・特殊效果。用魔力代替弹药（自动恢复）`, `속성 공격・특수 효과. 탄 대신 마력 사용(자연 회복)`],
    [`特殊`, `Special`, `特殊`, `특수`],
    [`誰でも装備できる`, `Anyone can equip`, `任何人都能装备`, `누구나 장착할 수 있다`],

    // ---- 主人公 ----
    [`カイ`, `Kai`, `凯`, `카이`],
    [`元騎士の銃士`, `Knight-turned-Gunner`, `前骑士枪手`, `전직 기사 총사`],
    [`滅んだ騎士団の生き残り。銃を手にした元騎士。まっすぐな性格。`, `Last survivor of a fallen order: a former knight who took up the gun. Honest to a fault.`, `覆灭骑士团的幸存者。拿起枪的前骑士。性格正直。`, `멸망한 기사단의 생존자. 총을 든 전직 기사. 곧은 성격.`],
    [`ローリング`, `Roll`, `翻滚`, `구르기`],
    [`無敵 0.3 秒・クールダウン 1.2 秒`, `0.3s invincible · 1.2s cooldown`, `无敌 0.3 秒・冷却 1.2 秒`, `무적 0.3초・쿨다운 1.2초`],
    [`会心率 +5%。会心が出ると、次のリロードが一瞬で終わる`, `Crit rate +5%. Landing a crit makes the next reload instant`, `暴击率 +5%。暴击后下次装填瞬间完成`, `치명타율 +5%. 치명타가 나오면 다음 재장전이 순식간에 끝난다`],
    [`ミラ`, `Mira`, `米拉`, `미라`],
    [`魔導銃の天才`, `Arcane Gun Prodigy`, `魔导枪天才`, `마도총의 천재`],
    [`魔導学院の落ちこぼれ。杖を銃に改造した天才肌。`, `A magic academy dropout, and a genius who rebuilt a staff into a gun.`, `魔导学院的吊车尾。把法杖改造成枪的天才。`, `마도 학원의 낙오자. 지팡이를 총으로 개조한 천재.`],
    [`ブリンク`, `Blink`, `闪现`, `블링크`],
    [`前方 120px へ瞬間移動・クールダウン 2 秒`, `Teleport 120px forward · 2s cooldown`, `向前瞬移 120px・冷却 2 秒`, `전방 120px 순간이동・쿨다운 2초`],
    [`属性ダメージ +15%。素材のドロップ率 +20%`, `Elemental damage +15%. Material drop rate +20%`, `属性伤害 +15%。素材掉落率 +20%`, `속성 대미지 +15%. 소재 드롭률 +20%`],
    [`ガルド`, `Gald`, `加尔德`, `갈드`],
    [`大男の傭兵`, `Giant Mercenary`, `巨汉佣兵`, `거한 용병`],
    [`各地を渡り歩く大男の傭兵。悪魔に故郷を焼かれた。`, `A towering sellsword who roams the land, hometown burned by demons.`, `浪迹各地的巨汉佣兵。故乡被恶魔焚毁。`, `각지를 떠도는 거한 용병. 악마에게 고향을 잃었다.`],
    [`タックル`, `Tackle`, `冲撞`, `태클`],
    [`突進して敵を押しのける。被ダメージ −70%・クールダウン 1.5 秒`, `Charge and shove enemies aside. Damage taken −70% · 1.5s cooldown`, `冲刺撞开敌人。受到伤害 −70%・冷却 1.5 秒`, `돌진해 적을 밀쳐낸다. 받는 대미지 −70%・쿨다운 1.5초`],
    [`受けるダメージ −10%。体力が 30% 以下のとき攻撃力 +25%`, `Damage taken −10%. Attack +25% while HP is at 30% or less`, `受到伤害 −10%。体力在 30% 以下时攻击力 +25%`, `받는 대미지 −10%. 체력 30% 이하일 때 공격력 +25%`],

    // ---- 能力ボード ----
    [`最大体力`, `Max HP`, `最大体力`, `최대 체력`],
    [`攻撃力`, `Attack`, `攻击力`, `공격력`],
    [`防御`, `Defense`, `防御`, `방어`],
    [`移動速度`, `Move speed`, `移动速度`, `이동 속도`],
    [`リロード速度`, `Reload speed`, `装填速度`, `재장전 속도`],
    [`会心率`, `Crit rate`, `暴击率`, `치명타율`],
    [`会心ダメージ`, `Crit damage`, `暴击伤害`, `치명타 대미지`],
    [`回避クールダウン`, `Dodge cooldown`, `闪避冷却`, `회피 쿨다운`],
    [`金運`, `Fortune`, `财运`, `금전운`],
    [`素材運`, `Scavenger`, `素材运`, `소재운`],
    [`回復薬の所持数`, `Potion capacity`, `回复药携带数`, `회복약 소지 수`],
    [`与えるダメージ +{v}%`, `Damage dealt +{v}%`, `造成伤害 +{v}%`, `주는 대미지 +{v}%`],
    [`受けるダメージ −{v}%`, `Damage taken −{v}%`, `受到伤害 −{v}%`, `받는 대미지 −{v}%`],
    [`リロード時間 −{v}%`, `Reload time −{v}%`, `装填时间 −{v}%`, `재장전 시간 −{v}%`],
    [`獲得するお金 +{v}%`, `Gold earned +{v}%`, `获得金钱 +{v}%`, `획득 골드 +{v}%`],
    [`素材のドロップ率 +{v}%`, `Material drop rate +{v}%`, `素材掉落率 +{v}%`, `소재 드롭률 +{v}%`],
    [`{v} 個`, `{v}`, `{v} 个`, `{v}개`],
    [`境界の守護者を 2 体倒す`, `Defeat 2 Border Guardians`, `击败 2 名边境守护者`, `경계의 수호자 2체 처치`],
    [`境界の守護者を 5 体倒す`, `Defeat 5 Border Guardians`, `击败 5 名边境守护者`, `경계의 수호자 5체 처치`],
    [`ヌシを 3 体倒す`, `Defeat 3 Lords`, `击败 3 只霸主`, `군주 3체 처치`],

    // ---- 武器 ----
    [`リボルバー ルーキー`, `Revolver Rookie`, `左轮「新手」`, `리볼버 루키`],
    [`初期装備。クセがない`, `Starting weapon. No quirks`, `初始装备。中规中矩`, `초기 장비. 무난하다`],
    [`サブマシンガン ホーネット`, `SMG Hornet`, `冲锋枪「黄蜂」`, `기관단총 호넷`],
    [`連射が速い。弾が少しばらける`, `Rapid fire. Bullets spread a little`, `射速快。子弹略有散布`, `연사가 빠르다. 탄이 조금 퍼진다`],
    [`二丁拳銃 ツインファング`, `Twin Fang Pistols`, `双枪「双牙」`, `쌍권총 트윈팽`],
    [`左右から交互に撃つ。回避の直後 1 秒は連射 ×1.5`, `Fires left and right in turn. Fire rate ×1.5 for 1s after a dodge`, `左右交替射击。闪避后 1 秒内射速 ×1.5`, `좌우 번갈아 쏜다. 회피 직후 1초간 연사 ×1.5`],
    [`聖銀銃 エクソシスト`, `Holy Silver Exorcist`, `圣银枪「驱魔师」`, `성은총 엑소시스트`],
    [`悪魔系に 1.5 倍。倒した悪魔から体力を 1 回復`, `×1.5 vs. demons. Heals 1 HP per demon slain`, `对恶魔系 1.5 倍。每击杀一只恶魔回复 1 体力`, `악마 계열에 1.5배. 악마를 쓰러뜨리면 체력 1 회복`],
    [`狩猟用ポンプ`, `Hunting Pump`, `狩猎泵动枪`, `수렵용 펌프`],
    [`近距離の基本。ノックバック小`, `The close-range basic. Light knockback`, `近距离基础款。小幅击退`, `근거리의 기본. 넉백 소`],
    [`ソードオフ ブルドッグ`, `Sawed-off Bulldog`, `短管「斗牛犬」`, `소드오프 불독`],
    [`2 連射してすぐリロード。射程が短いぶん粒が多い`, `Two quick blasts, then reload. Short range, more pellets`, `两连发后立刻装填。射程短但弹丸多`, `2연사 후 바로 재장전. 사거리가 짧은 대신 탄알이 많다`],
    [`フレシェット ヤマアラシ`, `Flechette Porcupine`, `箭形弹「豪猪」`, `플레셰트 고슴도치`],
    [`針が敵を 2 体まで貫通する`, `Needles pierce up to 2 enemies`, `钢针最多穿透 2 个敌人`, `바늘이 적을 2체까지 관통한다`],
    [`竜息砲 ドラゴンブレス`, `Dragon's Breath`, `龙息炮「龙之吐息」`, `용식포 드래곤 브레스`],
    [`当たった敵を 3 秒燃やす（毎秒 威力の 20%）`, `Burns targets for 3s (20% of damage per second)`, `使命中的敌人燃烧 3 秒（每秒造成威力的 20%）`, `맞은 적을 3초간 불태운다(초당 위력의 20%)`],
    [`手回しガトリング`, `Hand-crank Gatling`, `手摇加特林`, `수동 개틀링`],
    [`回し始めに時間がかかる`, `Takes time to spin up`, `转起来需要时间`, `회전 시작에 시간이 걸린다`],
    [`グレネード ポムポム`, `Pom-Pom Grenade Launcher`, `榴弹「砰砰」`, `유탄 폼폼`],
    [`放物線で飛び、着弾で爆発。自分は爆発でダメージを受けない`, `Lobbed in an arc, explodes on impact. No self-damage`, `抛物线飞行，着弹爆炸。自己不受爆炸伤害`, `포물선으로 날아가 착탄 시 폭발. 자신은 폭발 대미지를 받지 않는다`],
    [`火炎放射器 サラマンダー`, `Salamander Flamethrower`, `火焰喷射器「火蜥蜴」`, `화염방사기 샐러맨더`],
    [`射程 160px の炎。敵を貫通`, `160px flames that pierce enemies`, `射程 160px 的火焰。穿透敌人`, `사거리 160px의 불꽃. 적을 관통`],
    [`魔導ロケット 流星`, `Meteor Arcane Rocket`, `魔导火箭「流星」`, `마도 로켓 유성`],
    [`ねらいの近くの敵へ曲がって飛ぶ`, `Curves toward enemies near your aim`, `会拐向瞄准点附近的敌人`, `조준 근처의 적에게 휘어져 날아간다`],
    [`狩猟弓`, `Hunting Bow`, `狩猎弓`, `수렵용 활`],
    [`長押しで引き絞り、最大で威力 ×2`, `Hold to draw, up to ×2 damage`, `长按拉弓，最大威力 ×2`, `길게 눌러 당기면 최대 위력 ×2`],
    [`マークスマン ホークアイ`, `Hawkeye Marksman`, `精确步枪「鹰眼」`, `마크스맨 호크아이`],
    [`会心率 +15%。2 体まで貫通`, `Crit rate +15%. Pierces 2 enemies`, `暴击率 +15%。最多穿透 2 个`, `치명타율 +15%. 2체까지 관통`],
    [`クロスボウ ヴァンパイアキラー`, `Vampire Killer Crossbow`, `十字弩「吸血鬼杀手」`, `석궁 뱀파이어 킬러`],
    [`与えたダメージの 3% だけ体力を回復`, `Heals 3% of damage dealt`, `回复造成伤害 3% 的体力`, `준 대미지의 3%만큼 체력 회복`],
    [`対魔ライフル ロンギヌス`, `Longinus Anti-demon Rifle`, `对魔步枪「朗基努斯」`, `대마 라이플 롱기누스`],
    [`全貫通。長押しでチャージして威力 ×2.5`, `Pierces everything. Hold to charge for ×2.5 damage`, `全穿透。长按蓄力威力 ×2.5`, `전부 관통. 길게 눌러 차지하면 위력 ×2.5`],
    [`見習いの火杖`, `Apprentice's Fire Staff`, `见习火杖`, `견습생의 화염 지팡이`],
    [`火の玉。当たると小さく爆発する`, `Fireballs that burst on hit`, `火球。命中时小范围爆炸`, `불덩이. 맞으면 작게 폭발한다`],
    [`氷の魔導書 ニヴル`, `Nivl, Grimoire of Ice`, `冰之魔导书「尼弗尔」`, `얼음 마도서 니블`],
    [`当たった敵を 2 秒遅くする。5 回当てると凍結`, `Slows targets for 2s. 5 hits freeze them`, `使命中的敌人减速 2 秒。命中 5 次冻结`, `맞은 적을 2초간 느리게 한다. 5회 맞히면 빙결`],
    [`雷杖 トール`, `Thor, Staff of Thunder`, `雷杖「托尔」`, `뇌장 토르`],
    [`近くの敵へ 3 回まで連鎖する`, `Chains to nearby enemies up to 3 times`, `对附近敌人最多连锁 3 次`, `근처의 적에게 3회까지 연쇄`],
    [`聖光杖 サンクタム`, `Sanctum, Staff of Holy Light`, `圣光杖「圣所」`, `성광장 생텀`],
    [`押している間ずっと出る光線。貫通`, `A continuous, piercing beam`, `持续发射的光线。穿透`, `누르는 동안 계속 나가는 광선. 관통`],
    [`魔銃 ベルゼバブ`, `Beelzebub, the Demon Gun`, `魔枪「别西卜」`, `마총 벨제붑`],
    [`撃つたびに属性が炎 → 氷 → 雷と変わる`, `Element cycles fire → ice → thunder with each shot`, `每次射击属性按 火 → 冰 → 雷 变化`, `쏠 때마다 속성이 화염 → 얼음 → 번개로 바뀐다`],
    [`星喰いの魔典`, `Star-Eater's Codex`, `噬星魔典`, `별을 먹는 마전`],
    [`3 つの使い魔が自動でねらって撃つ`, `Three familiars aim and fire on their own`, `3 个使魔自动瞄准射击`, `3마리의 사역마가 자동으로 조준해 쏜다`],
    [`物理`, `Physical`, `物理`, `물리`],
    [`炎`, `Fire`, `火`, `화염`],
    [`氷`, `Ice`, `冰`, `얼음`],
    [`雷`, `Thunder`, `雷`, `번개`],
    [`聖`, `Holy`, `圣`, `신성`],

    // ---- 敵 ----
    [`インプ`, `Imp`, `小恶魔`, `임프`],
    [`グール`, `Ghoul`, `食尸鬼`, `구울`],
    [`ヘルハウンド`, `Hellhound`, `地狱犬`, `헬하운드`],
    [`スケルトン射手`, `Skeleton Archer`, `骷髅射手`, `스켈레톤 궁수`],
    [`魔スライム`, `Demon Slime`, `魔史莱姆`, `마슬라임`],
    [`ガーゴイル`, `Gargoyle`, `石像鬼`, `가고일`],
    [`呪術師`, `Hexer`, `咒术师`, `주술사`],
    [`爆裂ワーム`, `Blast Worm`, `爆裂蠕虫`, `폭렬 웜`],
    [`シャドウ`, `Shadow`, `暗影`, `섀도`],
    [`オーク重盾兵`, `Orc Shieldbearer`, `兽人重盾兵`, `오크 중방패병`],
    [`毒蛾`, `Venom Moth`, `毒蛾`, `독나방`],
    [`魔眼`, `Evil Eye`, `魔眼`, `마안`],
    [`ミミック`, `Mimic`, `宝箱怪`, `미믹`],
    [`亡霊騎士`, `Phantom Knight`, `亡灵骑士`, `망령 기사`],
    [`炎の精`, `Fire Wisp`, `火精`, `불의 정령`],
    [`氷のレイス`, `Frost Wraith`, `冰之怨灵`, `얼음 레이스`],
    [`幻惑の妖魔`, `Beguiling Fiend`, `魅惑妖魔`, `현혹의 요마`],
    [`ミノタウロス`, `Minotaur`, `弥诺陶洛斯`, `미노타우로스`],
    [`デーモンナイト`, `Demon Knight`, `恶魔骑士`, `데몬 나이트`],
    [`アークデーモン`, `Archdemon`, `大恶魔`, `아크데몬`],

    // ---- ボス ----
    [`沼の門番 ブロブキング`, `Blob King, Swamp Warden`, `沼泽守门者 史莱姆王`, `늪의 문지기 블롭킹`],
    [`鉄喰いゴーレム`, `Iron-Eater Golem`, `噬铁魔像`, `철을 먹는 골렘`],
    [`霧の女王 ローレライ`, `Lorelei, Queen of Mist`, `雾之女王 罗蕾莱`, `안개의 여왕 로렐라이`],
    [`双頭の番犬 オルトロス`, `Orthrus, the Two-Headed Hound`, `双头看门犬 欧特鲁斯`, `쌍두 파수견 오르트로스`],
    [`炉心竜 ヴァルカン`, `Vulcan, the Forge Dragon`, `炉心龙 瓦尔肯`, `노심룡 벌칸`],
    [`千年樹の魔 ユグドラ`, `Yggdra, Fiend of the Ancient Tree`, `千年树之魔 尤格德拉`, `천년수의 마 위그드라`],
    [`炎獄将 バルログ`, `Balrog, General of the Inferno`, `炎狱将 巴洛格`, `염옥장 발록`],
    [`骨竜 スカルドラゴン`, `Skull Dragon`, `骨龙 骷髅龙`, `골룡 스컬 드래곤`],
    [`大蝦蟇 ゲロイア`, `Geroia, the Great Toad`, `大蛤蟆 盖洛伊亚`, `대두꺼비 게로이아`],
    [`王蟲 キングワーム`, `King Worm`, `王虫 蠕虫之王`, `왕충 킹웜`],
    [`黒森の魔女 モルガナ`, `Morgana, Witch of the Black Forest`, `黑森魔女 莫尔加娜`, `검은 숲의 마녀 모르가나`],
    [`灼熱の不死鳥 フェニクス`, `Phoenix of Searing Flame`, `灼热不死鸟 菲尼克斯`, `작열의 불사조 피닉스`],
    [`堕天騎士 アザゼル`, `Azazel, the Fallen Knight`, `堕天骑士 阿撒兹勒`, `타천 기사 아자젤`],
    [`魔王 ベリアル`, `Belial, the Demon King`, `魔王 彼列`, `마왕 벨리알`],
    [`星喰い アポカリプス`, `Apocalypse, the Star-Eater`, `噬星者 天启`, `별을 먹는 자 아포칼립스`],

    // ---- 素材 ----
    [`インプの角`, `Imp Horn`, `小恶魔之角`, `임프의 뿔`],
    [`腐った爪`, `Rotten Claw`, `腐烂的爪`, `썩은 발톱`],
    [`黒い牙`, `Black Fang`, `黑色獠牙`, `검은 송곳니`],
    [`古い骨`, `Old Bone`, `古老的骨头`, `오래된 뼈`],
    [`魔性ゼリー`, `Demonic Jelly`, `魔性果冻`, `마성 젤리`],
    [`石の翼`, `Stone Wing`, `石之翼`, `돌 날개`],
    [`呪いの札`, `Curse Talisman`, `诅咒符`, `저주의 부적`],
    [`火薬袋`, `Powder Sack`, `火药袋`, `화약 주머니`],
    [`影の欠片`, `Shadow Shard`, `暗影碎片`, `그림자 조각`],
    [`割れた盾`, `Broken Shield`, `破碎的盾`, `깨진 방패`],
    [`毒の鱗粉`, `Toxic Scales`, `毒鳞粉`, `독 인분`],
    [`魔眼の水晶体`, `Evil Eye Lens`, `魔眼晶状体`, `마안의 수정체`],
    [`擬態の舌`, `Mimic Tongue`, `拟态之舌`, `의태의 혀`],
    [`呪われた鎧片`, `Cursed Armor Shard`, `被诅咒的铠甲碎片`, `저주받은 갑옷 조각`],
    [`炎の核`, `Fire Core`, `火焰之核`, `불꽃의 핵`],
    [`凍てつく布`, `Frozen Cloth`, `冰冻之布`, `얼어붙은 천`],
    [`妖魔の羽根`, `Fiend Feather`, `妖魔之羽`, `요마의 깃털`],
    [`牛魔の角`, `Bull Demon Horn`, `牛魔之角`, `우마의 뿔`],
    [`魔騎士の紋章`, `Demon Knight Crest`, `魔骑士纹章`, `마기사의 문장`],
    [`大悪魔の血晶`, `Archdemon Bloodgem`, `大恶魔血晶`, `대악마의 혈정`],
    [`スライム王の核`, `Slime King Core`, `史莱姆王之核`, `슬라임 왕의 핵`],
    [`ゴーレムの魔核`, `Golem Heart`, `魔像魔核`, `골렘의 마핵`],
    [`霧の女王の涙`, `Mist Queen's Tear`, `雾之女王之泪`, `안개 여왕의 눈물`],
    [`番犬の双牙`, `Twin Fangs`, `看门犬双牙`, `파수견의 쌍아`],
    [`炉心竜の逆鱗`, `Forge Dragon Scale`, `炉心龙逆鳞`, `노심룡의 역린`],
    [`千年樹の種`, `Ancient Tree Seed`, `千年树之种`, `천년수의 씨앗`],
    [`炎獄の鞭`, `Inferno Whip`, `炎狱之鞭`, `염옥의 채찍`],
    [`骨竜の頭骨`, `Dragon Skull`, `骨龙头骨`, `골룡의 두개골`],
    [`大蝦蟇の毒腺`, `Great Toad Gland`, `大蛤蟆毒腺`, `대두꺼비의 독샘`],
    [`王蟲の心臓`, `King Worm Heart`, `王虫之心`, `왕충의 심장`],
    [`魔女の瞳`, `Witch's Eye`, `魔女之瞳`, `마녀의 눈동자`],
    [`不死鳥の尾羽`, `Phoenix Tail Feather`, `不死鸟尾羽`, `불사조의 꼬리깃`],
    [`堕天の羽根`, `Fallen Feather`, `堕天之羽`, `타천의 깃털`],
    [`魔王の角`, `Demon King's Horn`, `魔王之角`, `마왕의 뿔`],
    [`星喰いの核`, `Star-Eater Core`, `噬星之核`, `별을 먹는 자의 핵`],

    // ---- 魔巣 ----
    [`小魔巣`, `Small Nest`, `小魔巢`, `작은 마둥지`],
    [`魔巣`, `Demon Nest`, `魔巢`, `마둥지`],
    [`大魔巣`, `Great Nest`, `大魔巢`, `큰 마둥지`],
    [`苗床の魔巣`, `Brood Nest`, `苗床魔巢`, `번식 마둥지`],
    [`弱い敵を次々に湧かせる`, `Spawns weak enemies one after another`, `接连涌出弱小敌人`, `약한 적을 연달아 불러낸다`],
    [`骨塚の魔巣`, `Bone Mound Nest`, `骨冢魔巢`, `뼈무덤 마둥지`],
    [`スケルトンが多い。ときどき骨をまき散らす`, `Mostly skeletons. Scatters bones now and then`, `多为骷髅。不时散射骨头`, `스켈레톤이 많다. 가끔 뼈를 흩뿌린다`],
    [`魔眼の魔巣`, `Eye Nest`, `魔眼魔巢`, `마안 마둥지`],
    [`近づくと、主人公をねらって撃ってくる`, `Fires at you when you get close`, `靠近时会瞄准主角射击`, `다가가면 주인공을 노리고 쏜다`],
    [`胞子の魔巣`, `Spore Nest`, `孢子魔巢`, `포자 마둥지`],
    [`まわりに毒の沼をまく`, `Spreads poison pools around it`, `在周围散布毒沼`, `주변에 독늪을 뿌린다`],
    [`泥沼の魔巣`, `Mire Nest`, `泥沼魔巢`, `진흙늪 마둥지`],
    [`当たると足が遅くなる泥をまく`, `Flings mud that slows you down`, `喷出使人减速的泥`, `맞으면 발이 느려지는 진흙을 뿌린다`],

    // ---- ステージ ----
    [`ハルト平原`, `Halt Plains`, `哈尔特平原`, `할트 평원`],
    [`麦畑と風車の、のどかな平原。最初のステージ`, `Peaceful plains of wheat and windmills. The first stage`, `麦田与风车的宁静平原。第一个关卡`, `밀밭과 풍차의 한가로운 평원. 첫 스테이지`],
    [`始まりの村`, `First Village`, `起始之村`, `시작의 마을`],
    [`麦畑`, `Wheat Fields`, `麦田`, `밀밭`],
    [`果樹園`, `Orchard`, `果园`, `과수원`],
    [`風車の丘`, `Windmill Hill`, `风车之丘`, `풍차 언덕`],
    [`川辺の水車小屋`, `Riverside Mill`, `河边水车小屋`, `강가의 물레방앗간`],
    [`古井戸の森`, `Old Well Woods`, `古井之森`, `옛 우물의 숲`],
    [`古戦場の砦跡`, `Old Battlefield Fort`, `古战场要塞遗迹`, `옛 전장의 요새 터`],
    [`竜骨の窪地`, `Dragonbone Hollow`, `龙骨洼地`, `용골의 분지`],
    [`東の門`, `East Gate`, `东门`, `동쪽 문`],
    [`北の門`, `North Gate`, `北门`, `북쪽 문`],
    [`西の門`, `West Gate`, `西门`, `서쪽 문`],
    [`ミスト湖沼`, `Mist Marshes`, `迷雾湖沼`, `미스트 호수늪`],
    [`霧に包まれた湖と湿地。沼では足が遅くなる`, `Fog-shrouded lakes and wetlands. Swamps slow you down`, `雾气笼罩的湖泊与湿地。在沼泽中会减速`, `안개에 싸인 호수와 습지. 늪에서는 발이 느려진다`],
    [`西の入り江`, `West Cove`, `西湾`, `서쪽 만`],
    [`湖畔の町ルーメ`, `Lakeside Lume`, `湖畔小镇卢梅`, `호숫가 마을 루메`],
    [`葦の湿原`, `Reed Marsh`, `芦苇湿原`, `갈대 습원`],
    [`蛍の沼`, `Firefly Bog`, `萤火沼泽`, `반딧불 늪`],
    [`沈んだ聖堂`, `Sunken Cathedral`, `沉没的圣堂`, `가라앉은 성당`],
    [`漁村跡`, `Abandoned Fishing Village`, `渔村遗址`, `어촌 터`],
    [`霧の渡し`, `Misty Ferry`, `雾之渡口`, `안개 나루`],
    [`大蝦蟇の淵`, `Great Toad's Pool`, `大蛤蟆之渊`, `대두꺼비의 소`],
    [`アイゼン鉱山`, `Eisen Mines`, `艾森矿山`, `아이젠 광산`],
    [`掘りかけの鉱山と崖`, `Half-dug mines and cliffs`, `开采中的矿山与悬崖`, `파다 만 광산과 절벽`],
    [`黒森シュヴァルツ`, `Schwarz Forest`, `黑森施瓦茨`, `검은 숲 슈바르츠`],
    [`呪われた深い森`, `A deep, cursed forest`, `被诅咒的幽深森林`, `저주받은 깊은 숲`],
    [`灰燼火山`, `Ashen Volcano`, `灰烬火山`, `잿더미 화산`],
    [`溶岩と灰の火山`, `A volcano of lava and ash`, `熔岩与灰烬的火山`, `용암과 재의 화산`],
    [`魔都ゲヘナ`, `Gehenna, the Demon Capital`, `魔都戈赫那`, `마도 게헨나`],
    [`悪魔に呑まれた旧王都`, `The old royal capital, swallowed by demons`, `被恶魔吞噬的旧王都`, `악마에게 삼켜진 옛 왕도`],
    [`始まりの村の武器屋`, `First Village Gunsmith`, `起始之村的武器店`, `시작의 마을 무기점`],
    [`湖畔の町ルーメの武器屋`, `Lume Gunsmith`, `湖畔小镇卢梅的武器店`, `루메 무기점`],
    [`回復薬`, `Potion`, `回复药`, `회복약`],
    [`体力を 40% 回復`, `Restores 40% HP`, `回复 40% 体力`, `체력 40% 회복`],
  ];

  const DICT = { en: {}, zh: {}, ko: {} };
  for (const r of ROWS) for (const l in COL) DICT[l][r[0]] = r[COL[l]];

  const pick = (l) => (RG.LANGS[l] ? l : null);
  const guess = () => {
    try {
      const s = JSON.parse(localStorage.getItem('reclaimGunners.settings'));
      if (s && pick(s.lang)) return s.lang;
    } catch (e) { /* 読めなければ、ブラウザの言葉にする */ }
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ja';
    const k = nav.toLowerCase().slice(0, 2);
    return pick(k) || 'en';
  };
  RG.lang = guess();
  RG.FONTS = FONTS[RG.lang];

  RG.t = (s, v) => {
    let r = (RG.lang !== 'ja' && DICT[RG.lang][s]) || s;
    if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] === undefined ? m : v[k]));
    return r;
  };

  // データの name / desc などを、いまの言葉に入れ替える (日本語は _ja に残しておく)
  const FIELDS = ['name', 'title', 'desc', 'dodgeName', 'dodgeDesc', 'trait', 'condText'];
  RG.i18nExtra = [];
  const localize = (root) => {
    const seen = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object' || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) {
        for (const x of o) walk(x);
        return;
      }
      for (const f of FIELDS) {
        if (typeof o[f] !== 'string') continue;
        const key = '_ja_' + f;
        if (!(key in o)) Object.defineProperty(o, key, { value: o[f], enumerable: false });
        o[f] = RG.t(o[key]);
      }
      for (const k in o) walk(o[k]);
    };
    walk(root);
  };
  const localizeMap = (m) => {
    if (!m) return;
    if (!m._ja) Object.defineProperty(m, '_ja', { value: { ...m }, enumerable: false });
    for (const k in m._ja) m[k] = RG.t(m._ja[k]);
  };

  // ページの文 (data-i18n の付いた要素と、aria-label)
  const localizePage = () => {
    document.documentElement.lang = RG.lang === 'zh' ? 'zh-Hans' : RG.lang;
    document.title = RG.t('魔境奪還ガンナーズ');
    for (const el of document.querySelectorAll('[data-i18n]')) {
      if (!el.dataset.ja) el.dataset.ja = el.textContent.trim();
      el.textContent = RG.t(el.dataset.ja);
    }
    for (const el of document.querySelectorAll('[data-i18n-aria]')) {
      if (!el.dataset.jaAria) el.dataset.jaAria = el.getAttribute('aria-label');
      el.setAttribute('aria-label', RG.t(el.dataset.jaAria));
    }
  };

  RG.setLang = (l) => {
    RG.lang = pick(l) || 'ja';
    RG.FONTS = FONTS[RG.lang];
    for (const d of [RG.CATS, RG.HEROES, RG.BOARD, RG.SLOTS, RG.WEAPONS, RG.ELEMS, RG.ENEMIES, RG.BOSSES, RG.NESTS, RG.STAGES, RG.SHOPS, RG.ITEMS, ...RG.i18nExtra]) localize(d);
    localizeMap(RG.MATERIALS);
    localizePage();
  };
})();
