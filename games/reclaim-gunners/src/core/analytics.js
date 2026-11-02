// アクセス解析: ステージの開始・結末・リトライ (全ゲーム共通の形で GA4 に送る)
// stage_start / stage_end (result: clear・fail・quit) / stage_retry_fail・stage_retry_clear・stage_retry_quit
// 終わったステージをそのまま遊び直したら、直前の結末に合わせたリトライとして送る
// このゲームのステージは2種類: エリアの解放 (stage: 's1a3' など) とボス戦 (stage: 'boss_G1' など)。
// どちらも1回の挑戦を1ステージとして数える。力尽きたら失敗、エリアの解放・ボスの撃破でクリア
const GAME = 'reclaim_gunners';

function send(name, params) {
  if (typeof window.gtag === 'function') window.gtag('event', name, { game: GAME, ...params });
}

function makeStageTrack() {
  const attempts = {};
  let playing = null; // { stage, at } 遊んでいる途中のステージ
  let ended = null; // { stage, result } 直前に終わったステージ
  const end = (result, extra) => {
    if (!playing) return;
    send('stage_end', { stage: playing.stage, result, play_sec: Math.round((performance.now() - playing.at) / 1000), ...extra });
    ended = { stage: playing.stage, result };
    playing = null;
  };
  window.addEventListener('pagehide', () => end('quit'));
  return {
    // 遊んでいる途中のステージ (なければ null)
    get stage() {
      return playing ? playing.stage : null;
    },
    start(stage, extra) {
      end('quit');
      if (ended && ended.stage === stage) send(`stage_retry_${ended.result}`, { stage });
      attempts[stage] = (attempts[stage] || 0) + 1;
      playing = { stage, at: performance.now() };
      ended = null;
      send('stage_start', { stage, attempt: attempts[stage], ...extra });
    },
    clear: (extra) => end('clear', extra),
    fail: (extra) => end('fail', extra),
    quit: () => end('quit'),
  };
}

export const areaTrack = makeStageTrack();
export const bossTrack = makeStageTrack();
