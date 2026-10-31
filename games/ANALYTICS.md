# ステージのアクセス解析 (全ゲーム共通)

どのゲームも、ステージの開始・結末・リトライを同じ形で Google アナリティクス (サイト共通のタグ `G-4VLZW1VMVC`) に送る。
送る仕組みは各ゲームのスクリプトの中の `stageTrack` (reclaim-gunners は `src/core/analytics.js`)。
CrazyGames 版・itch.io 版は Google タグを外すので、何も送らない。

## イベント

| イベント | いつ | パラメータ |
| --- | --- | --- |
| `stage_start` | ステージを始めたとき | `game`、`stage`、`attempt` (このページを開いてから、そのステージを始めた回数)、ゲームごとの値 |
| `stage_end` | ステージが終わったとき | `game`、`stage`、`result`、`play_sec` (始めてからの秒数)、ゲームごとの値 |
| `stage_retry_fail` | 失敗したステージを、続けてもう一度始めたとき (失敗リトライ) | `game`、`stage` |
| `stage_retry_clear` | クリアしたステージを、続けてもう一度始めたとき (成功リトライ) | `game`、`stage` |
| `stage_retry_quit` | 途中でやめたステージを、続けてもう一度始めたとき (遊んでいる途中の「やり直す」など) | `game`、`stage` |

- `result` は `clear` (クリア)・`fail` (失敗)・`quit` (途中でやめた: 途中でやり直す・ステージ選択へ戻る・ページを閉じる)
- リトライのイベントは、直前に終わったステージと同じステージを始めたときに、`stage_start` の前に送る。結果画面の「もう一度」だけでなく、ステージ選択へ戻ってから同じステージを選んだときも数える。あいだに別のステージを遊んだら数えない
- 失敗リトライの率は `stage_retry_fail` ÷ (`result` が `fail` の `stage_end`) で出せる。成功リトライも同じ

## ゲームごとの決まり

| ゲーム (`game`) | `stage` | クリア / 失敗 | ゲームごとの値 |
| --- | --- | --- | --- |
| `voxel_grenade` | ステージ番号 (1〜) | 80% 以上こわした / 手榴弾を使い切った | 終わり: `destroyed_pct`、`grenades` |
| `paper_plane` | ステージの id (`field` など) | 着地した / 建物に突っこんだ。折りはじめから着地までと、結果画面からの「もう一度投げる」1回ずつを1ステージと数える | 始め: `mode`。終わり: `distance`、`is_best` |
| `mole` | ステージ番号 (1〜) | STAGE CLEAR / TIME UP | 始め: `stage_no`。終わり: `stage_no`、`cleared`、`score`、`stars`、`legend_caught` |
| `bowling` | `ワールド-ステージ` (`3-7` など) | ストライク・スペアでピンを全部倒した / 2投で残った | 始め: `world`。終わり: `clear_type` (strike / spare)、`treasure`、`pins_left` |
| `breakout` | ステージ番号 (1〜) | ブロックを全部こわした / ライフがなくなった・リタイア | 始め: `difficulty`。終わり: `difficulty`、`clear_time`、`no_damage`、`time_attack`、`retired` |
| `cleaning_survivors` | ステージ番号 (1〜)。チュートリアルは `tutorial` | 全部屋の清掃完了 / 力尽きた・時間切れ | 始め: `mode`、`character`。終わり: `mode`、`character`、`rooms_done`、`clean_pct`、`level`、`reason` (worn_out / time_up) |
| `reclaim_gunners` | エリアの解放はエリアの id (`s1a3` など)、ボス戦は `boss_` + ボスの id (`boss_G1` など) | エリアを解放した・ボスを倒した / 力尽きた | 始め: `difficulty`、`hero`、`player_lv` (ボス戦は `boss_lv` も)。終わり: `reinvade` (エリア) |

- reclaim-gunners はステージの区切りがないので、まだ解放していないエリアに入ったときをエリアの開始とする。エリアを出入りしても同じ挑戦のまま。別の未解放エリアに入る・全体図へ戻る・別のステージへ移ると、途中でやめたことになる。力尽きたあとにまたそのエリアに入ると失敗リトライ、解放したエリアを「再侵攻」すると成功リトライ
- mole の `stage_start` / `stage_end` は以前から `stage_no` で送っていたので、続けて見られるように `stage_no` も残す
- voxel-grenade・paper-plane のゲーム専用のイベント (`voxel_grenade_start` など) もそのまま送る
- cleaning-survivors は、共通のイベントに加えて、同じ中身で頭に `cs_` をつけたイベント (`cs_stage_start`・`cs_stage_end`・`cs_stage_retry_fail`・`cs_stage_retry_clear`・`cs_stage_retry_quit`) も送る。`game` で絞りこまなくても、このゲームのイベントだけを見られる

## Google アナリティクスで見るための設定

`stage` などのパラメータは、管理 → カスタム定義 で「イベント」スコープのカスタムディメンションに登録すると、レポートや探索で使えるようになる (登録した日から集計される)。

| ディメンション名 | イベント パラメータ |
| --- | --- |
| ゲーム | `game` |
| ステージ | `stage` |
| 結末 | `result` |

`attempt`・`play_sec` は、カスタム指標 (イベント スコープ) に登録すると平均などを出せる。
