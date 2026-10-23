/*
 * STRIKE LANE のワールドとステージ
 *   script.js が寸法 (K) を渡して呼ぶ。返すのは 10 ワールド × 10 ステージ
 *
 * 座標: x は右が +、z はファウルラインが 0 で奥が - (1番ピンは z = -18.29、床は z = -19.16 で終わる)
 * ステージに置けるもの (どれも省略できる):
 *   pins:      ピン { x, z, y? } (y を省くと、その場所の台の高さ)
 *   floors:    台 { x, z, w, d, top, th?, rotY? }。床のないワールドでは、ボールはこの上だけを転がる
 *   platforms: ピンを乗せる台 (古い書き方。floors と同じ)
 *   ramps:     坂・ジャンプ台 { x, z (手前の端), w, len, angle (度), y0? (手前の端の高さ) }
 *   holes:     落とし穴 { x, z, r } または谷 { x, z, w, d }
 *   blocks:    壁 { x, z, w, d, h, rotY?, bouncy?, y0? }。bouncy なら反射板
 *   movers:    左右に動く壁 { x, z, w, d, h, range, period, phase? }
 *   walls:     2点を結ぶ壁 { x1, z1, x2, z2, h?, y0?, tire?, bouncy? }
 *   track:     サーキットのコース { w, pts: [[x, z], …] } (両側にタイヤの壁を作る)
 *   rails:     ガターをふさぐバンパー { side: -1 | 1, z1, z2 }
 *   bumpers:   はじき返す丸い柱 { x, z, r?, kick? }
 *   spinners:  回るバー { x, z, len, speed (rad/s), phase? }
 *   portals:   ワープゲート { a: [x, z], b: [x, z], r?, dir? (出る向き、度。0 が奥、+ が右) }
 *   conveyors: ベルトコンベア { x, z, w, d, fx, fz } (上を転がるボールを押す力 N)
 *   treasure:  宝物 { kind, x, y, z } (kind は script.js の TREASURE_KINDS)
 */
window.STRIKE_LANE_WORLDS = function (K) {
  const { HEAD_Z: H, DECK_END: END, LANE_W, WALL_X, PIN_SPACING: SP, ROW_DZ: RD, rack } = K;
  const T = (ja, en, zh, ko) => ({ ja, en, zh, ko });
  const TR = (kind, x, y, z) => ({ kind, x, y, z });

  // 三角形に並べたピン。先頭のピンが (x, z)、rows = 4 で10本
  const tri = (x, z, rows, y, sp = SP) => {
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i <= r; i++) out.push({ x: x + (i - r / 2) * sp, z: z - r * sp * (RD / SP), y });
    }
    return out;
  };
  // 間をつめた三角形 (24cm 間隔)。まっすぐ当てても倒れやすい。細い道の先などに使う
  const tight = (x, z, rows, y) => tri(x, z, rows, y, 0.24);
  // 奥へ一列に並べたピン
  const line = (x, z, n, dz = 0.36, y) => Array.from({ length: n }, (_, i) => ({ x, z: z - i * dz, y }));
  // 横に一列に並べたピン
  const across = (x, z, n, dx = 0.22, y) => Array.from({ length: n }, (_, i) => ({ x: x + (i - (n - 1) / 2) * dx, z, y }));
  // ひし形の4本
  const diamond = (x, z, s = 0.3, y) => [{ x, z, y }, { x: x - s / 2, z: z - s * 0.85, y }, { x: x + s / 2, z: z - s * 0.85, y }, { x, z: z - s * 1.7, y }];

  // 2点を結ぶ斜めの反射板 (ボールが浅い角度で当たり、向きを少し変える)
  const slant = (x1, z1, x2, z2, h = 0.3) => ({
    x: (x1 + x2) / 2, z: (z1 + z2) / 2, w: Math.hypot(x2 - x1, z2 - z1), d: 0.05, h, rotY: Math.atan2(-(z2 - z1), x2 - x1), bouncy: true,
  });
  // 2点を結ぶ細長い台 (平均台など)
  const beam = (x1, z1, x2, z2, w, top = 0, th) => ({
    x: (x1 + x2) / 2, z: (z1 + z2) / 2, w, d: Math.hypot(x2 - x1, z2 - z1), top, th, rotY: Math.atan2(x2 - x1, z2 - z1),
  });
  // 点列をつないだ平均台 (継ぎ目が切れないよう、少し長めにする)
  const beamPath = (pts, w, top = 0) => pts.slice(1).map((q, i) => {
    const p = pts[i];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0]) / l;
    const uz = (q[1] - p[1]) / l;
    const ext = w / 2;
    return beam(p[0] - ux * (i ? ext : 0), p[1] - uz * (i ? ext : 0), q[0] + ux * ext, q[1] + uz * ext, w, top);
  });
  const pad = (x, z, w, d, top = 0, th) => ({ x, z, w, d, top, th });
  // 階段: z1 から奥へ、段の長さ stepLen で n 段。最初の段の高さ top0、1段ごとに rise (下りは -)
  const stairs = (x, z1, stepLen, n, top0, rise, w) => Array.from({ length: n }, (_, i) => ({
    x, z: z1 - stepLen * (i + 0.5), w, d: stepLen + 0.002, top: top0 + rise * i, th: 0.25 + Math.abs(rise) * (n - i),
  }));
  // 上り階段の段の縁に置く小さな坂 (角に当たって大きく跳ねないように)
  const risers = (x, z1, stepLen, n, top0, rise, w, angle = 6) => {
    const len = rise / Math.sin((angle * Math.PI) / 180);
    return Array.from({ length: n }, (_, i) => ({
      x, z: z1 - stepLen * i + len * Math.cos((angle * Math.PI) / 180), w, len, angle, y0: top0 + rise * (i - 1),
    }));
  };
  // コースの両側の壁 (落ちないように)
  const sideWalls = (x, w, z1, z2, y0 = -0.4, h = 0.75) => [-1, 1].map((s) => ({ x1: x + s * (w / 2 + 0.04), z1, x2: x + s * (w / 2 + 0.04), z2, y0, h }));

  return [
    // =================================================================
    // WORLD 1 クラシック
    // =================================================================
    {
      theme: 'classic',
      name: T('クラシックレーン', 'Classic Lanes', '经典球道', '클래식 레인'),
      stages: [
        {
          name: T('はじめの一投', 'First Roll', '第一球', '첫 투구'),
          goal: T('3本のピンを倒そう。宝物はレーンの左に浮かんでいる', 'Knock down three pins. The treasure floats on the left.', '击倒 3 个球瓶。宝物浮在球道左侧', '핀 3개를 쓰러뜨리자. 보물은 레인 왼쪽에 떠 있다'),
          startX: 0,
          pins: rack(1, 2, 3),
          treasure: TR('coinB', -0.3, 0.16, -7),
        },
        {
          name: T('たて一列', 'Single File', '一字长蛇', '일렬 종대'),
          goal: T('一列に並んだピン。宝物を取るなら右から投げて、カーブで真ん中へ', 'Pins in a line. For the treasure, start right and hook back to the middle.', '球瓶排成一列。想拿宝物就从右边出手，再用弧线拉回中间', '일렬로 선 핀. 보물을 노린다면 오른쪽에서 던져 커브로 가운데로'),
          startX: 0.3,
          pins: [{ x: 0, z: H + 0.4 }, { x: 0, z: H }, { x: 0, z: H - 0.39 }, { x: 0, z: H - 0.78 }],
          treasure: TR('coinS', 0.35, 0.16, -9.5),
        },
        {
          name: T('ジャンプ台', 'The Ramp', '跳台', '점프대'),
          goal: T('壁はジャンプで飛び越えよう。速い球ほど高く飛ぶ', 'Jump over the wall. Faster balls fly higher.', '用跳台飞过墙。球越快飞得越高', '벽은 점프로 넘자. 빠른 공일수록 높이 난다'),
          startX: 0,
          pins: rack(1, 2, 3, 4, 5, 6),
          ramps: [{ x: 0, z: -11.5, w: LANE_W, len: 1.2, angle: 12 }],
          blocks: [{ x: 0, z: -13.7, w: WALL_X * 2, d: 0.12, h: 0.16 }],
          treasure: TR('coinG', 0, 0.6, -14.6),
        },
        {
          name: T('落とし穴', 'Pitfalls', '陷阱', '함정'),
          goal: T('穴をよけてカーブで抜けよう。落ちたらその投球はおしまい', 'Hook around the holes. Falling in ends the roll.', '用弧线绕开洞。掉进去这一球就结束', '구멍을 피해 커브로 빠져나가자. 떨어지면 그 투구는 끝'),
          startX: 0.28,
          pins: rack(1, 2, 3, 5),
          holes: [{ x: 0, z: -9, r: 0.24 }, { x: 0.4, z: -13.5, r: 0.17 }, { x: -0.4, z: -13.5, r: 0.17 }],
          treasure: TR('emerald', 0.3, 0.16, -11.5),
        },
        {
          name: T('スラローム', 'Slalom', '回转', '슬라롬'),
          goal: T('左カーブで2つの壁をよけよう。ピンはレーンの途中に立っている', 'Hook left past two walls. The pins stand mid-lane.', '用左弧线绕过两面墙。球瓶立在球道中段', '왼쪽 커브로 벽 두 개를 피하자. 핀은 레인 중간에 서 있다'),
          startX: 0.4,
          pins: [{ x: -0.3, z: -15.7 }, { x: -0.45, z: -16 }, { x: -0.15, z: -16 }, { x: -0.3, z: -16.3 }],
          blocks: [{ x: -0.2, z: -8, w: 0.66, d: 0.15, h: 0.25 }, { x: 0.36, z: -13, w: 0.34, d: 0.15, h: 0.25 }],
          treasure: TR('sapphire', 0.42, 0.16, -10.5),
        },
        {
          name: T('動く壁', 'Moving Wall', '移动墙', '움직이는 벽'),
          goal: T('左右に動く壁のすきまを通して、10本のストライクを狙え', 'Slip past the sliding wall and go for a 10-pin strike.', '穿过左右移动的墙，挑战 10 瓶全中', '좌우로 움직이는 벽 틈으로 10핀 스트라이크를 노려라'),
          startX: 0.15,
          pins: rack(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
          movers: [{ x: 0, z: -13, w: 0.42, d: 0.15, h: 0.3, range: 0.34, period: 2.4 }],
          treasure: TR('ruby', 0, 0.16, -15.6),
        },
        {
          name: T('ピンの島', 'Pin Island', '球瓶之岛', '핀의 섬'),
          goal: T('ピンは高い台の上。真ん中の坂を登らないと届かない', 'The pins sit on a high deck. Climb the narrow ramp in the middle.', '球瓶在高台上。必须爬上中间的坡道', '핀은 높은 단 위. 가운데 경사로를 올라야 닿는다'),
          startX: 0,
          pins: tri(0, H, 3, 0.12),
          platforms: [{ x: 0, z: H + 0.015, w: LANE_W, d: 1.77, h: 0.12 }],
          ramps: [{ x: 0, z: H + 0.9 + 0.9 * Math.cos(Math.asin(0.12 / 0.9)), w: 0.42, len: 0.9, angle: Math.asin(0.12 / 0.9) * 180 / Math.PI }],
          treasure: TR('amethyst', 0.36, 0.16, -9),
        },
        {
          name: T('谷越え', 'Canyon Jump', '飞越峡谷', '협곡 넘기'),
          goal: T('左のジャンプ台で谷を飛び越えろ', 'Clear the canyon with the left ramp.', '用左边的跳台飞越峡谷', '왼쪽 점프대로 협곡을 뛰어넘어라'),
          startX: -0.25,
          pins: rack(2, 4, 7, 8),
          ramps: [{ x: -0.25, z: -11, w: 0.36, len: 1.0, angle: 13 }],
          holes: [{ x: 0, z: -13.5, w: LANE_W + 0.02, d: 1.6 }],
          treasure: TR('diamond', -0.25, 0.5, -13.2),
        },
        {
          name: T('ピンボール', 'Pinball', '弹珠台', '핀볼'),
          goal: T('ピンは壁の裏。右はしをまっすぐ投げて、反射板で横から倒せ', 'The pins hide behind a wall. Roll straight down the right edge and bank off the deflector.', '球瓶藏在墙后。沿右边直线投球，用反射板从侧面击倒', '핀은 벽 뒤. 오른쪽 끝으로 곧게 굴려 반사판으로 옆에서 쓰러뜨려라'),
          startX: 0.4,
          pins: [{ x: 0.17, z: H + 0.6 }, { x: -0.05, z: H + 0.6 }, { x: -0.27, z: H + 0.6 }],
          blocks: [
            { x: -0.14, z: H + 1.1, w: 0.78, d: 0.1, h: 0.32 },
            { x: 0.43, z: H + 0.45, w: 0.36, d: 0.05, h: 0.3, rotY: -Math.PI / 4, bouncy: true },
          ],
          treasure: TR('goldPin', -0.47, 0.15, H + 0.6),
        },
        {
          name: T('グランドフィナーレ', 'Grand Finale', '终极挑战', '그랜드 피날레'),
          goal: T('ジャンプ台、落とし穴、動く壁。全部こえて7本を倒せ', 'Ramp, pitfalls and a moving wall. Clear them all and topple seven pins.', '跳台、陷阱、移动墙。全部越过击倒 7 个球瓶', '점프대, 함정, 움직이는 벽. 모두 넘어 핀 7개를 쓰러뜨려라'),
          startX: 0,
          pins: [{ x: 0, z: H + 0.6 }, ...rack(1, 2, 3, 4, 5, 6)],
          ramps: [{ x: 0, z: -7.5, w: 0.5, len: 1.0, angle: 12 }],
          holes: [{ x: -0.3, z: -10.5, r: 0.17 }, { x: 0.3, z: -10.5, r: 0.17 }],
          movers: [{ x: 0, z: -15, w: 0.34, d: 0.12, h: 0.28, range: 0.32, period: 2.2 }],
          treasure: TR('star', 0, 0.55, -9.4),
        },
      ],
    },

    // =================================================================
    // WORLD 2 サーキット: タイヤの壁で囲まれた、曲がったコース
    // =================================================================
    {
      theme: 'circuit',
      name: T('グランプリサーキット', 'Grand Prix Circuit', '大奖赛赛道', '그랑프리 서킷'),
      stages: [
        {
          name: T('ホームストレート', 'Home Straight', '主直道', '홈 스트레이트'),
          goal: T('まずはまっすぐなコース。タイヤの壁は少し跳ね返る', 'A straight track first. The tire walls bounce a little.', '先来一条直道。轮胎墙会稍微反弹', '먼저 곧은 코스. 타이어 벽은 조금 튕겨낸다'),
          pins: tri(0, H, 3),
          track: { w: 1.3, pts: [[0, 0.4], [0, END]] },
          treasure: TR('flag', -0.45, 0.16, -10),
        },
        {
          name: T('シケイン', 'Chicane', '减速弯', '시케인'),
          goal: T('コースが右にずれて、また戻る。壁に当てながら抜けよう', 'The track jogs right and back. Use the walls to get through.', '赛道向右偏移再回来。借助墙壁通过', '코스가 오른쪽으로 비켰다 돌아온다. 벽을 이용해 빠져나가자'),
          pins: tri(0, H, 3),
          track: { w: 1.1, pts: [[0, 0.4], [0, -6], [0.5, -9], [0.5, -12], [0, -15], [0, END]] },
          treasure: TR('bronzeCup', 0.6, 0.16, -10.5),
        },
        {
          name: T('右コーナー', 'Right-hander', '右弯', '오른쪽 코너'),
          goal: T('コースは右へ大きく曲がる。右カーブで内側をつこう', 'The track sweeps right. Hook right to take the inside line.', '赛道大幅右转。用右弧线切内线', '코스가 오른쪽으로 크게 굽는다. 오른쪽 커브로 안쪽을 노리자'),
          pins: tri(1.6, H + 0.4, 3),
          track: { w: 1.2, pts: [[0, 0.4], [0, -5], [0.3, -9], [0.8, -12.5], [1.4, -15.5], [1.6, END]] },
          treasure: TR('medal', 0.2, 0.16, -8),
        },
        {
          name: T('左コーナー', 'Left-hander', '左弯', '왼쪽 코너'),
          goal: T('今度は左へ。外側の壁に沿わせても曲がれる', 'Now it bends left. You can also ride the outer wall.', '这次向左。也可以贴着外侧墙壁转弯', '이번엔 왼쪽. 바깥 벽을 따라 돌아도 된다'),
          pins: diamond(-1.6, H + 0.6),
          track: { w: 1.2, pts: [[0, 0.4], [0, -5], [-0.3, -9], [-0.8, -12.5], [-1.4, -15.5], [-1.6, END]] },
          treasure: TR('silverCup', -1.2, 0.16, -14.4),
        },
        {
          name: T('S字カーブ', 'S-Bends', 'S 弯', 'S자 커브'),
          goal: T('左へ、そして右へ。壁を2回うまく使おう', 'Left, then right. Make two good wall bounces.', '先左后右。巧妙地利用两次墙壁', '왼쪽으로, 그리고 오른쪽으로. 벽을 두 번 잘 이용하자'),
          pins: tri(0.7, H + 0.4, 3),
          track: { w: 1.2, pts: [[0, 0.4], [0, -4], [-0.6, -8], [-0.6, -10], [0.5, -14], [0.7, END]] },
          treasure: TR('coinG', -0.6, 0.16, -9),
        },
        {
          name: T('ジャンプ区間', 'Jump Section', '飞跃区', '점프 구간'),
          goal: T('コースの途中に谷。ジャンプ台で飛び越えろ', 'A gap cuts the track. Leap it with the ramp.', '赛道中间有沟。用跳台飞过去', '코스 중간에 골짜기. 점프대로 뛰어넘어라'),
          pins: tri(0, H, 3),
          track: { w: 1.2, pts: [[0, 0.4], [0, END]] },
          ramps: [{ x: 0, z: -9.8, w: 1.2, len: 1.0, angle: 12 }],
          holes: [{ x: 0, z: -11.9, w: 1.2, d: 1.2 }],
          treasure: TR('flag', 0, 0.5, -11.4),
        },
        {
          name: T('分かれ道', 'Split Road', '岔路', '갈림길'),
          goal: T('コースの真ん中に島。どちら側を通ってもいい', 'An island splits the track. Either side works.', '赛道中间有个岛。走哪边都可以', '코스 한가운데 섬. 어느 쪽으로 지나가도 된다'),
          pins: tight(0, H, 4),
          track: { w: 1.6, pts: [[0, 0.4], [0, END]] },
          blocks: [{ x: 0, z: -10.5, w: 0.5, d: 5, h: 0.3 }],
          treasure: TR('trophy', -0.62, 0.16, -10.5),
        },
        {
          name: T('タイヤの林', 'Tire Forest', '轮胎林', '타이어 숲'),
          goal: T('コースのあちこちにタイヤの山。すき間を抜けよう', 'Tire stacks litter the track. Thread the gaps.', '赛道上到处是轮胎堆。从缝隙中穿过', '코스 곳곳에 타이어 더미. 틈새를 빠져나가자'),
          pins: tight(0, H, 3),
          track: { w: 1.6, pts: [[0, 0.4], [0, END]] },
          bumpers: [
            { x: -0.4, z: -7, r: 0.16, kick: 0.6 }, { x: 0.35, z: -9.5, r: 0.16, kick: 0.6 },
            { x: -0.35, z: -12, r: 0.16, kick: 0.6 }, { x: 0.45, z: -14.5, r: 0.16, kick: 0.6 },
          ],
          treasure: TR('medal', 0.1, 0.16, -11),
        },
        {
          name: T('ロングカーブ', 'Long Sweeper', '长弯', '롱 커브'),
          goal: T('長い左カーブ。最後は大きく左に寄ったピンへ', 'A long left sweeper ending far to the left.', '长长的左弯，终点在最左边', '긴 왼쪽 커브. 마지막엔 크게 왼쪽으로 치우친 핀으로'),
          pins: tight(-1.8, H + 0.3, 3),
          track: { w: 1.2, pts: [[0, 0.4], [0, -3], [-0.2, -7], [-0.7, -11], [-1.3, -14], [-1.8, -16], [-1.8, END]] },
          treasure: TR('silverCup', -0.5, 0.16, -10.5),
        },
        {
          name: T('グランプリ', 'Grand Prix', '大奖赛', '그랑프리'),
          goal: T('S字とジャンプのあとに10本。サーキットの総仕上げ', 'S-bends, a jump, then ten pins. The full circuit.', 'S 弯加飞跃，最后是 10 个球瓶。赛道总决赛', 'S자와 점프 뒤에 핀 10개. 서킷의 마무리'),
          pins: tri(0, H, 4),
          track: { w: 1.2, pts: [[0, 0.4], [0, -3], [0.6, -6], [0.6, -8], [0, -11], [0, END]] },
          ramps: [{ x: 0, z: -12.4, w: 1.2, len: 1.0, angle: 12 }],
          holes: [{ x: 0, z: -14.4, w: 1.2, d: 1.0 }],
          treasure: TR('trophy', 0, 0.5, -14),
        },
      ],
    },

    // =================================================================
    // WORLD 3 平均台: 床がなく、細い台の上だけを転がる
    // =================================================================
    {
      theme: 'gym',
      name: T('平均台アリーナ', 'Balance Beam Arena', '平衡木竞技场', '평균대 아레나'),
      stages: [
        {
          name: T('平均台デビュー', 'Beam Debut', '平衡木初登场', '평균대 데뷔'),
          goal: T('幅50cmの台の上をまっすぐ。落ちたらおしまい', 'Roll straight down a 50 cm beam. Fall off and it is over.', '在 50 厘米宽的平衡木上直线前进。掉下去就结束', '폭 50cm 평균대 위를 똑바로. 떨어지면 끝'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -17.4, 0.5), pad(0, -18.3, 1.0, 1.9)],
          treasure: TR('medal', 0.15, 0.16, -9),
        },
        {
          name: T('細い平均台', 'Narrow Beam', '窄平衡木', '좁은 평균대'),
          goal: T('今度は幅32cm。ぶれずに投げよう', 'Only 32 cm wide now. Keep it steady.', '这次只有 32 厘米宽。稳住', '이번엔 폭 32cm. 흔들리지 말고 던지자'),
          pins: tight(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -17.4, 0.32), pad(0, -18.3, 1.0, 1.9)],
          treasure: TR('coinS', -0.14, 0.16, -11.76),
        },
        {
          name: T('ずれた平均台', 'Offset Beams', '错位平衡木', '어긋난 평균대'),
          goal: T('途中で台が右にずれる。少し右向きに投げよう', 'The beam shifts right halfway. Aim a touch right.', '平衡木中途向右错开。稍微向右投', '중간에 평균대가 오른쪽으로 비켜 있다. 조금 오른쪽으로 던지자'),
          pins: tight(0.35, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -9, 0.42), beam(0.35, -8.4, 0.35, -17.4, 0.42), pad(0.35, -18.3, 1.0, 1.9)],
          treasure: TR('bronzeCup', 0.2, 0.16, -8.7),
        },
        {
          name: T('とびうつり', 'Leap Across', '跳跃', '건너뛰기'),
          goal: T('台と台のあいだにすき間。ジャンプ台で飛び移れ', 'A gap between beams. Jump it with the ramp.', '平衡木之间有空隙。用跳台跳过去', '평균대 사이에 틈. 점프대로 건너뛰어라'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -9, 0.5), beam(0, -10.8, 0, -17.4, 0.6), pad(0, -18.3, 1.0, 1.9)],
          ramps: [{ x: 0, z: -8.0, w: 0.5, len: 0.9, angle: 11 }],
          treasure: TR('coinG', 0, 0.45, -10.2),
        },
        {
          name: T('ななめの平均台', 'Diagonal Beam', '斜向平衡木', '비스듬한 평균대'),
          goal: T('台は斜めに伸びている。向きを合わせて投げよう', 'The beam runs at an angle. Match its direction.', '平衡木斜着延伸。对准方向投', '평균대가 비스듬히 뻗어 있다. 방향을 맞춰 던지자'),
          pins: tight(0.85, H + 0.4, 3),
          floors: [beam(0, -0.6, 0.85, -17.4, 0.45), pad(0.85, -18.3, 1.0, 1.9)],
          treasure: TR('emerald', 0.45, 0.16, -9),
        },
        {
          name: T('曲がる平均台', 'Curving Beam', '弯曲平衡木', '굽은 평균대'),
          goal: T('台はゆるく右へ曲がる。右カーブで台に沿わせよう', 'The beam bends gently right. Hook right to follow it.', '平衡木缓缓右弯。用右弧线贴着走', '평균대가 완만하게 오른쪽으로 굽는다. 오른쪽 커브로 따라가자'),
          pins: tight(1.2, H + 0.4, 3),
          floors: [...beamPath([[0, -0.6], [0, -6], [0.2, -10], [0.6, -13.5], [1.2, -17.4]], 0.5), pad(1.2, -18.3, 1.0, 1.9)],
          treasure: TR('sapphire', 0.1, 0.16, -8),
        },
        {
          name: T('段違い平均台', 'Uneven Bars', '高低平衡木', '높낮이 평균대'),
          goal: T('坂を登って、一段高い台へ', 'Climb the slope to the higher beam.', '爬上坡道，到更高的平衡木', '경사를 올라 한 단 높은 평균대로'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -8, 0.5), beam(0, -9.15, 0, -17.4, 0.5, 0.2), pad(0, -18.3, 1.0, 1.9, 0.2)],
          ramps: [{ x: 0, z: -8, w: 0.5, len: 1.17, angle: 9.85 }],
          treasure: TR('topaz', 0, 0.4, -12),
        },
        {
          name: T('飛び石', 'Stepping Stones', '踏脚石', '징검다리'),
          goal: T('小さな台が並ぶ。すき間に落ちないよう、まっすぐ', 'Small pads in a row. Roll straight so you do not drop through.', '一排小台子。笔直前进，别掉进缝隙', '작은 받침이 늘어서 있다. 틈에 빠지지 않게 똑바로'),
          pins: tight(0, H + 0.4, 3),
          floors: [
            ...Array.from({ length: 13 }, (_, i) => pad(i % 2 ? 0.12 : -0.12, -1.25 - i * 1.3, 0.5, 1.18)),
            pad(0, -18.3, 1.0, 1.9),
          ],
          treasure: TR('pearl', 0.22, 0.16, -10.4),
        },
        {
          name: T('Y字の平均台', 'Forked Beam', 'Y 形平衡木', 'Y자 평균대'),
          goal: T('台が左右に分かれる。ピンは右の先', 'The beam forks. The pins are down the right branch.', '平衡木分成左右两条。球瓶在右边尽头', '평균대가 좌우로 갈린다. 핀은 오른쪽 끝'),
          pins: tight(0.75, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -7.5, 0.5), beam(0, -7.2, -0.75, -17.4, 0.4), beam(0, -7.2, 0.75, -17.4, 0.4), pad(0.75, -18.3, 1.0, 1.9), pad(-0.75, -17.9, 0.6, 1.0)],
          treasure: TR('ruby', 0.02, 0.16, -9.69),
        },
        {
          name: T('床運動のフィナーレ', 'Floor Routine', '自由体操终曲', '마루 운동 피날레'),
          goal: T('細い台、ジャンプ、ななめの台。最後は10本', 'Narrow beam, a jump, a diagonal. Ten pins to finish.', '窄平衡木、飞跃、斜向平衡木。最后是 10 个球瓶', '좁은 평균대, 점프, 비스듬한 평균대. 마지막은 핀 10개'),
          pins: tight(0.5, H + 0.4, 4),
          floors: [beam(0, -0.6, 0, -7, 0.4), beam(0, -9.0, 0.5, -17.3, 0.5), pad(0.5, -18.4, 1.2, 1.8)],
          ramps: [{ x: 0, z: -6.1, w: 0.4, len: 0.9, angle: 11 }],
          treasure: TR('trophy', 0, 0.45, -8.2),
        },
      ],
    },

    // =================================================================
    // WORLD 4 階段の神殿: 下り・上りの階段と段差
    // =================================================================
    {
      theme: 'temple',
      name: T('階段の神殿', 'Temple of Stairs', '阶梯神殿', '계단 신전'),
      stages: [
        {
          name: T('下り階段', 'Down the Steps', '下楼梯', '내리막 계단'),
          goal: T('階段をころころ降りて、下のピンへ', 'Bump down the stairs to the pins below.', '咕噜咕噜滚下楼梯，击倒下面的球瓶', '계단을 데굴데굴 내려가 아래의 핀으로'),
          pins: tri(0, H + 0.4, 3),
          floors: [pad(0, -2.8, 1.1, 4.4), ...stairs(0, -5, 1.5, 6, -0.1, -0.1, 1.1), pad(0, -16.6, 1.1, 5.2, -0.7)],
          walls: sideWalls(0, 1.1, -0.6, END, -1.2, 1.5),
          treasure: TR('jade', -0.35, 0.0, -8.5),
        },
        {
          name: T('上り階段', 'Up the Steps', '上楼梯', '오르막 계단'),
          goal: T('低い段を登っていく。遅い球だと登りきれない', 'Climb low steps. A slow ball will not make it.', '爬上低矮的台阶。球太慢就爬不上去', '낮은 계단을 오른다. 느린 공은 끝까지 못 오른다'),
          pins: tri(0, H + 0.4, 3),
          floors: [pad(0, -2.8, 1.1, 4.4), ...stairs(0, -5, 1.4, 8, 0.035, 0.035, 1.1), pad(0, -17.68, 1.1, 2.96, 0.315)],
          ramps: [...risers(0, -5, 1.4, 9, 0.035, 0.035, 1.1)],
          walls: sideWalls(0, 1.1, -0.6, END, -0.4, 1.2),
          treasure: TR('topaz', 0.3, 0.32, -11),
        },
        {
          name: T('大きな段差', 'The Big Drop', '大落差', '큰 낭떠러지'),
          goal: T('途中で50cmの段差を落ちる。着地のあとを読もう', 'A 50 cm drop halfway. Read where you land.', '中途有 50 厘米的落差。预判落地之后的走向', '중간에 50cm 낭떠러지. 착지 후를 읽자'),
          pins: tight(0, H + 0.4, 4, -0.5),
          floors: [pad(0, -4.8, 1.1, 8.4), pad(0, -14.2, 1.1, 10.2, -0.5)],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.4),
          treasure: TR('amethyst', 0, 0.2, -9.5),
        },
        {
          name: T('踊り場', 'Landing', '平台', '층계참'),
          goal: T('降りて、平らなところを越えて、また登る', 'Down, across the landing, and up again.', '先下楼梯，穿过平台，再上楼梯', '내려가서, 평평한 곳을 지나, 다시 오른다'),
          pins: tri(0, H + 0.4, 3, -0.1),
          floors: [
            pad(0, -2.3, 1.1, 3.4), ...stairs(0, -4, 1.2, 4, -0.08, -0.08, 1.1), pad(0, -10.4, 1.1, 3.2, -0.4),
            ...stairs(0, -12, 1.2, 4, -0.36, 0.06, 1.1), pad(0, -17.98, 1.1, 2.36, -0.1),
          ],
          ramps: [...risers(0, -12, 1.2, 5, -0.36, 0.06, 1.1)],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.3),
          treasure: TR('coinG', -0.3, -0.24, -10.8),
        },
        {
          name: T('崩れた階段', 'Broken Stairs', '残破楼梯', '무너진 계단'),
          goal: T('階段の途中が崩れている。ジャンプ台で飛び越えろ', 'The stairs are broken. Jump the gap with the ramp.', '楼梯中间塌了。用跳台飞过去', '계단 중간이 무너졌다. 점프대로 뛰어넘어라'),
          pins: tri(0, H + 0.4, 3, -0.4),
          floors: [pad(0, -3.3, 1.1, 5.4), ...stairs(0, -6, 1.3, 2, -0.1, -0.1, 1.1), ...stairs(0, -10.4, 1.3, 2, -0.3, -0.1, 1.1), pad(0, -16.1, 1.1, 6.2, -0.4)],
          ramps: [{ x: 0, z: -7.4, w: 1.1, len: 1.0, angle: 10, y0: -0.2 }],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.4),
          treasure: TR('ruby', 0, 0.25, -9.6),
        },
        {
          name: T('祭壇', 'The Altar', '祭坛', '제단'),
          goal: T('階段を降りたら、坂を登って祭壇の上のピンへ', 'Down the stairs, then up the slope to the altar.', '下楼梯后，爬坡到祭坛上的球瓶', '계단을 내려간 뒤, 경사를 올라 제단 위의 핀으로'),
          pins: tri(0, H + 0.2, 3, 0.05),
          floors: [pad(0, -2.8, 1.1, 4.4), ...stairs(0, -5, 1.5, 3, -0.1, -0.1, 1.1), pad(0, -12.75, 1.1, 6.5, -0.3), pad(0, -17.6, 1.1, 3.2, 0.05)],
          ramps: [{ x: 0, z: -14.03, w: 0.5, len: 2.0, angle: 10.1, y0: -0.3 }],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.4),
          treasure: TR('crown', -0.38, -0.14, -12.5),
        },
        {
          name: T('狭い参道', 'Narrow Path', '窄参道', '좁은 참배길'),
          goal: T('壁のない細い道と階段。はみ出したら落ちる', 'A narrow path and stairs with no walls. Stray and you fall.', '没有墙的窄路和楼梯。偏出去就会掉下', '벽 없는 좁은 길과 계단. 벗어나면 떨어진다'),
          pins: tri(0, H + 0.4, 3, -0.3),
          floors: [pad(0, -4.3, 0.5, 7.4), ...stairs(0, -8, 1.4, 3, -0.1, -0.1, 0.5), pad(0, -15.4, 0.6, 7.6, -0.3)],
          treasure: TR('jade', 0.17, -0.14, -12.79),
        },
        {
          name: T('穴あき回廊', 'Holey Corridor', '破洞回廊', '구멍 난 회랑'),
          goal: T('床の左右が交互に抜けている。カーブで残った床をたどれ', 'The floor is missing on alternating sides. Hook along what is left.', '地板左右交替缺失。用弧线沿着剩下的地板走', '바닥 좌우가 번갈아 빠져 있다. 커브로 남은 바닥을 따라가라'),
          pins: tri(-0.2, H + 0.4, 3),
          floors: [pad(0, -3.8, 1.1, 6.4), pad(0.27, -8.5, 0.56, 3.0), pad(0, -11.0, 1.1, 2.0), pad(-0.27, -13.5, 0.56, 3.0), pad(0, -17.0, 1.1, 4.4)],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.3),
          treasure: TR('onyx', 0.3, 0.16, -9),
        },
        {
          name: T('柱の間', 'Hall of Pillars', '柱廊', '기둥의 방'),
          goal: T('階段の先に柱が並ぶ。すき間を通してピンへ', 'Pillars stand past the stairs. Thread them to the pins.', '楼梯尽头立着柱子。从缝隙穿过击倒球瓶', '계단 너머에 기둥이 늘어서 있다. 틈으로 핀까지'),
          pins: tight(0, H + 0.4, 3, -0.3),
          floors: [pad(0, -3.8, 1.1, 6.4), ...stairs(0, -7, 1.2, 3, -0.1, -0.1, 1.1), pad(0, -14.9, 1.1, 8.6, -0.3)],
          blocks: [
            { x: -0.38, z: -12.5, w: 0.2, d: 0.2, h: 0.5, y0: -0.3 }, { x: 0.38, z: -12.5, w: 0.2, d: 0.2, h: 0.5, y0: -0.3 },
            { x: -0.42, z: -15.2, w: 0.2, d: 0.2, h: 0.5, y0: -0.3 }, { x: 0.42, z: -15.2, w: 0.2, d: 0.2, h: 0.5, y0: -0.3 },
          ],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.4),
          treasure: TR('amethyst', 0.2, -0.14, -13.5),
        },
        {
          name: T('神殿の奥', 'Inner Sanctum', '神殿深处', '신전 깊은 곳'),
          goal: T('崩れた階段、細い道、祭壇。神殿の総仕上げ', 'Broken stairs, a narrow path and the altar. The whole temple.', '残破楼梯、窄道、祭坛。神殿的终章', '무너진 계단, 좁은 길, 제단. 신전의 마무리'),
          pins: tight(0, H + 0.2, 4, 0),
          floors: [pad(0, -2.8, 1.1, 4.4), ...stairs(0, -5, 1.2, 2, -0.1, -0.1, 1.1), pad(0, -11.15, 0.5, 3.7, -0.4), pad(0, -14.86, 1.1, 3.72, -0.4), pad(0, -17.95, 1.1, 2.45, 0)],
          ramps: [{ x: 0, z: -6.9, w: 1.1, len: 0.9, angle: 10, y0: -0.2 }, { x: 0, z: -14.32, w: 0.5, len: 2.43, angle: 9.47, y0: -0.4 }],
          walls: sideWalls(0, 1.1, -0.6, END, -1.0, 1.4),
          treasure: TR('crown', 0, 0.25, -8.4),
        },
      ],
    },

    // =================================================================
    // WORLD 5 アイスリンク: よく滑り、カーブは効きにくく、ピンも滑る
    // =================================================================
    {
      theme: 'ice',
      name: T('アイスリンク', 'Ice Rink', '冰场', '아이스 링크'),
      stages: [
        {
          name: T('リンクデビュー', 'Rink Debut', '冰场初登场', '링크 데뷔'),
          goal: T('氷の上ではカーブが効きにくい。倒れたピンも滑っていく', 'Hooks barely bite on ice, and fallen pins slide away.', '冰面上弧线不太灵，倒下的球瓶也会滑走', '얼음 위에선 커브가 잘 안 걸린다. 쓰러진 핀도 미끄러진다'),
          pins: rack(1, 2, 3, 4, 5, 6),
          treasure: TR('snowflake', -0.3, 0.16, -8),
        },
        {
          name: T('雪の壁', 'Snow Wall', '雪墙', '눈 벽'),
          goal: T('真ん中に雪の壁。角度をつけて回りこもう', 'A snow wall in the middle. Angle around it.', '中间有一道雪墙。斜着绕过去', '가운데에 눈 벽. 각도를 줘서 돌아가자'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -12, w: 0.4, d: 0.3, h: 0.3 }],
          treasure: TR('pearl', 0.35, 0.16, -12),
        },
        {
          name: T('ひび割れた氷', 'Cracked Ice', '碎冰', '갈라진 얼음'),
          goal: T('氷に穴があいている。まっすぐの角度で抜けよう', 'Holes in the ice. Thread them with a straight angle.', '冰面有洞。以直线角度穿过', '얼음에 구멍이 났다. 곧은 각도로 빠져나가자'),
          pins: rack(1, 2, 3, 5),
          holes: [{ x: -0.1, z: -8, r: 0.2 }, { x: 0.35, z: -12, r: 0.18 }, { x: -0.3, z: -14.5, r: 0.18 }],
          treasure: TR('moonstone', 0.15, 0.16, -10),
        },
        {
          name: T('アイスバンク', 'Ice Bank', '冰面反弹', '아이스 뱅크'),
          goal: T('両側にバンパー。真ん中の壁は、横の壁で跳ね返してよけよう', 'Bumpers line both sides. Bank off them around the center wall.', '两侧有护栏。借侧面反弹绕过中间的墙', '양쪽에 범퍼. 가운데 벽은 옆 벽에 튕겨서 피하자'),
          pins: tight(0, H, 3),
          rails: [{ side: -1, z1: -5, z2: -18 }, { side: 1, z1: -5, z2: -18 }],
          blocks: [{ x: 0, z: -14, w: 0.4, d: 0.2, h: 0.3 }],
          treasure: TR('snowflake', 0.42, 0.16, -10),
        },
        {
          name: T('つららの門', 'Icicle Gate', '冰锥之门', '고드름 문'),
          goal: T('氷の門はせまい。右寄りのすき間を通せ', 'A narrow ice gate. Pass through the gap on the right.', '冰门很窄。从偏右的缝隙穿过', '얼음 문은 좁다. 오른쪽 틈으로 통과하라'),
          pins: tight(0, H, 3),
          blocks: [{ x: -0.24, z: -10, w: 0.58, d: 0.2, h: 0.3 }, { x: 0.49, z: -10, w: 0.08, d: 0.2, h: 0.3 }],
          treasure: TR('diamond', 0.25, 0.3, -10.6),
        },
        {
          name: T('アイスジャンプ', 'Ice Jump', '冰上飞跃', '아이스 점프'),
          goal: T('割れた氷の上をジャンプで越えろ', 'Jump over the broken ice.', '跳过碎裂的冰面', '깨진 얼음 위를 점프로 넘어라'),
          pins: rack(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
          ramps: [{ x: 0, z: -10, w: LANE_W, len: 1.0, angle: 11 }],
          holes: [{ x: 0, z: -12.2, w: LANE_W + 0.02, d: 1.3 }],
          treasure: TR('snowflake', 0, 0.5, -12),
        },
        {
          name: T('すべるピン', 'Sliding Pins', '滑行球瓶', '미끄러지는 핀'),
          goal: T('ピンが広く散らばっている。滑るピンでほかのピンを倒せ', 'Pins are spread wide. Use sliding pins to take out the rest.', '球瓶分散得很开。用滑行的球瓶撞倒其他球瓶', '핀이 넓게 흩어져 있다. 미끄러지는 핀으로 나머지를 쓰러뜨려라'),
          pins: [...rack(1, 4, 6), { x: -0.25, z: H - 0.3 }, { x: 0.25, z: H - 0.3 }],
          treasure: TR('pearl', -0.2, 0.16, -14),
        },
        {
          name: T('雪玉ころがし', 'Rolling Snowball', '滚雪球', '눈덩이 굴리기'),
          goal: T('雪のかたまりが左右に動く。タイミングを見て', 'A block of snow slides back and forth. Time your roll.', '雪块左右移动。看准时机', '눈덩이가 좌우로 움직인다. 타이밍을 보자'),
          pins: rack(1, 2, 3, 4, 5, 6),
          movers: [{ x: 0, z: -11, w: 0.4, d: 0.3, h: 0.3, range: 0.3, period: 2.6 }],
          treasure: TR('moonstone', -0.3, 0.16, -13),
        },
        {
          name: T('氷の迷路', 'Ice Maze', '冰迷宫', '얼음 미로'),
          goal: T('雪の壁がじぐざぐに並ぶ。抜け道を見つけよう', 'Snow walls zigzag down the lane. Find the way through.', '雪墙呈之字形排列。找到通路', '눈 벽이 지그재그로 늘어서 있다. 빠져나갈 길을 찾자'),
          pins: tight(0.15, H, 3),
          blocks: [{ x: 0.25, z: -8, w: 0.56, d: 0.2, h: 0.3 }, { x: -0.35, z: -13, w: 0.36, d: 0.2, h: 0.3 }],
          treasure: TR('diamond', -0.18, 0.16, -8.57),
        },
        {
          name: T('氷の女王', 'Ice Queen', '冰雪女王', '얼음 여왕'),
          goal: T('バンパー、穴、動く雪玉。氷のリンクの総仕上げ', 'Bumpers, holes and a sliding snowball. The whole rink.', '护栏、冰洞、移动的雪块。冰场终章', '범퍼, 구멍, 움직이는 눈덩이. 아이스 링크의 마무리'),
          pins: tight(0, H, 4),
          rails: [{ side: -1, z1: -4, z2: -17 }, { side: 1, z1: -4, z2: -17 }],
          holes: [{ x: 0, z: -8, r: 0.2 }],
          movers: [{ x: 0, z: -13, w: 0.36, d: 0.3, h: 0.3, range: 0.3, period: 2.2 }],
          treasure: TR('crown', 0.38, 0.16, -8),
        },
      ],
    },

    // =================================================================
    // WORLD 6 月面: 重力が地球の 1/6。ジャンプが長く、ピンはゆっくり倒れる
    // =================================================================
    {
      theme: 'moon',
      name: T('月面ベース', 'Moon Base', '月球基地', '달 기지'),
      stages: [
        {
          name: T('月に着陸', 'Touchdown', '登月', '달 착륙'),
          goal: T('重力は地球の6分の1。ピンはゆっくり倒れる', 'Gravity is one sixth of Earth. Pins topple slowly.', '重力只有地球的六分之一。球瓶倒得很慢', '중력은 지구의 6분의 1. 핀은 천천히 쓰러진다'),
          pins: tri(0, H, 3),
          holes: [{ x: -1.3, z: -9, r: 0.5 }, { x: 1.4, z: -13, r: 0.6 }],
          treasure: TR('moonstone', 0.3, 0.2, -9),
        },
        {
          name: T('大クレーター', 'Big Crater', '大陨石坑', '큰 크레이터'),
          goal: T('正面に大きなクレーター。角度とカーブで回りこもう', 'A huge crater dead ahead. Go around with angle and hook.', '正前方有个大坑。用角度和弧线绕过去', '정면에 큰 크레이터. 각도와 커브로 돌아가자'),
          pins: tri(0, H, 3),
          holes: [{ x: -0.1, z: -10, r: 0.45 }],
          treasure: TR('comet', -0.53, 0.16, -9.92),
        },
        {
          name: T('月面ジャンプ', 'Lunar Leap', '月面飞跃', '달 점프'),
          goal: T('ジャンプ台から遠くまで飛ぶ。クレーター地帯を越えろ', 'The ramp sends you far. Clear the crater field.', '跳台能飞很远。越过陨石坑地带', '점프대에서 멀리 날아간다. 크레이터 지대를 넘어라'),
          pins: tight(0, H, 4),
          ramps: [{ x: 0, z: -5, w: 1.2, len: 1.0, angle: 10 }],
          holes: [{ x: 0, z: -9, r: 0.55 }, { x: -0.5, z: -12, r: 0.5 }, { x: 0.5, z: -13, r: 0.5 }],
          treasure: TR('star', 0, 0.75, -10),
        },
        {
          name: T('岩の台地', 'Mesa', '岩石台地', '바위 고원'),
          goal: T('ピンは高い台地の上。ジャンプで乗り移れ', 'The pins sit on a high mesa. Jump onto it.', '球瓶在高高的台地上。跳上去', '핀은 높은 고원 위. 점프로 올라타라'),
          pins: tri(0, H + 0.4, 3, 0.35),
          floors: [{ x: 0, z: -16.8, w: 1.6, d: 4.7, top: 0.35, th: 0.35 }],
          ramps: [{ x: 0, z: -10.5, w: 0.8, len: 1.0, angle: 7 }],
          treasure: TR('moonstone', 0, 0.55, -13),
        },
        {
          name: T('クレーター街道', 'Crater Road', '陨石坑大道', '크레이터 가도'),
          goal: T('クレーターが左右交互に並ぶ。すり抜けろ', 'Craters alternate left and right. Slip between them.', '陨石坑左右交替排列。从中穿过', '크레이터가 좌우로 번갈아 있다. 빠져나가라'),
          pins: tri(0.3, H, 3),
          holes: [{ x: -0.6, z: -6, r: 0.5 }, { x: 0.65, z: -9, r: 0.5 }, { x: -0.5, z: -12, r: 0.5 }, { x: 0.9, z: -15, r: 0.5 }],
          treasure: TR('comet', 0.05, 0.16, -10.5),
        },
        {
          name: T('2段ジャンプ', 'Double Jump', '两段跳', '2단 점프'),
          goal: T('ジャンプ台が2つ。2回目でさらに高く', 'Two ramps. The second sends you even higher.', '两个跳台。第二次跳得更高', '점프대가 두 개. 두 번째에서 더 높이'),
          pins: tight(0, H, 4),
          ramps: [{ x: 0, z: -4, w: 1.2, len: 0.8, angle: 8 }, { x: 0, z: -11, w: 1.2, len: 1.0, angle: 12 }],
          holes: [{ x: 0, z: -7.2, w: 1.6, d: 2.0 }, { x: 0, z: -14.5, w: 1.6, d: 2.0 }],
          treasure: TR('star', 0.03, 0.78, -13.44),
        },
        {
          name: T('探査車', 'Moon Rovers', '月球车', '탐사차'),
          goal: T('2台の探査車が横切る。すき間をねらえ', 'Two rovers cross the path. Aim for the gap.', '两辆月球车横穿而过。瞄准空隙', '탐사차 두 대가 가로지른다. 틈을 노려라'),
          pins: tight(0, H, 4),
          movers: [
            { x: 0, z: -9, w: 0.5, d: 0.4, h: 0.3, range: 0.8, period: 3 },
            { x: 0, z: -14, w: 0.5, d: 0.4, h: 0.3, range: 0.8, period: 2.4, phase: 1.5 },
          ],
          treasure: TR('moonstone', 0, 0.16, -11.39),
        },
        {
          name: T('月面基地', 'Lunar Station', '月面基地', '월면 기지'),
          goal: T('基地の通路は右へ折れる。壁で跳ね返して進め', 'The station corridor turns right. Bounce off the walls.', '基地通道向右拐。借墙反弹前进', '기지 통로는 오른쪽으로 꺾인다. 벽에 튕기며 나아가라'),
          pins: tri(1.3, H + 0.3, 3),
          walls: [
            { x1: -0.6, z1: -0.5, x2: -0.6, z2: -10 }, { x1: -0.6, z1: -10, x2: 0.7, z2: -15 }, { x1: 0.7, z1: -15, x2: 0.7, z2: END },
            { x1: 0.6, z1: -0.5, x2: 0.6, z2: -8 }, { x1: 0.6, z1: -8, x2: 1.9, z2: -13 }, { x1: 1.9, z1: -13, x2: 1.9, z2: END },
          ],
          treasure: TR('comet', 0.3, 0.16, -6),
        },
        {
          name: T('ムーンウォーク', 'Moonwalk', '月球漫步', '문워크'),
          goal: T('クレーターだらけ。細い道を見つけて進め', 'Craters everywhere. Find the narrow path.', '到处都是陨石坑。找出细窄的路', '온통 크레이터. 좁은 길을 찾아 나아가라'),
          pins: tri(0, H, 3),
          holes: [
            { x: -0.55, z: -5, r: 0.45 }, { x: 0.55, z: -5.5, r: 0.4 }, { x: 0.35, z: -8.5, r: 0.3 }, { x: -0.7, z: -9.5, r: 0.45 },
            { x: 0.65, z: -12, r: 0.45 }, { x: -0.3, z: -13.5, r: 0.3 }, { x: 0.4, z: -15.3, r: 0.3 },
          ],
          treasure: TR('pearl', -0.15, 0.16, -11),
        },
        {
          name: T('静かの海', 'Sea of Tranquility', '静海', '고요의 바다'),
          goal: T('ジャンプでクレーター原を越え、台地の10本へ', 'Leap the crater plain to the ten pins on the mesa.', '飞越陨石坑原野，击倒台地上的 10 个球瓶', '점프로 크레이터 평원을 넘어 고원 위의 핀 10개로'),
          pins: tight(0, H + 0.4, 3, 0.3),
          floors: [{ x: 0, z: -16.9, w: 1.8, d: 4.5, top: 0.3, th: 0.3 }],
          ramps: [{ x: 0, z: -5.5, w: 0.7, len: 1.0, angle: 13 }],
          holes: [{ x: 0, z: -9.5, r: 0.7 }, { x: -0.9, z: -12, r: 0.5 }, { x: 0.9, z: -12.5, r: 0.5 }],
          treasure: TR('crown', 0, 0.9, -10),
        },
      ],
    },

    // =================================================================
    // WORLD 7 ネオンピンボール: はじくバンパー、回るバー、反射板
    // =================================================================
    {
      theme: 'pinball',
      name: T('ネオンピンボール', 'Neon Pinball', '霓虹弹珠台', '네온 핀볼'),
      stages: [
        {
          name: T('バンパー入門', 'Bumper 101', '弹板入门', '범퍼 입문'),
          goal: T('光る柱はボールをはじき返す。当てずに抜けるか、利用するか', 'Glowing posts kick the ball away. Avoid them or use them.', '发光的柱子会把球弹开。避开它还是利用它', '빛나는 기둥은 공을 튕겨낸다. 피할까, 이용할까'),
          pins: rack(1, 2, 3, 4, 5, 6),
          bumpers: [{ x: 0, z: -12 }],
          treasure: TR('neonStar', 0.3, 0.16, -12),
        },
        {
          name: T('トリプルバンパー', 'Triple Bumper', '三连弹板', '트리플 범퍼'),
          goal: T('3つのバンパーが三角に並ぶ', 'Three bumpers in a triangle.', '三个弹板排成三角形', '범퍼 세 개가 삼각형으로 서 있다'),
          pins: tight(0, H, 3),
          bumpers: [{ x: -0.32, z: -9 }, { x: 0.32, z: -11 }, { x: -0.32, z: -13 }],
          treasure: TR('quartz', 0, 0.16, -10),
        },
        {
          name: T('スピナー', 'Spinner', '旋转杆', '스피너'),
          goal: T('回るバーにはじかれないよう、タイミングを見て', 'Time it so the spinning bar does not swat you.', '看准时机，别被旋转杆打飞', '도는 막대에 맞지 않게 타이밍을 보자'),
          pins: tight(0, H, 4),
          spinners: [{ x: 0, z: -11, len: 0.6, speed: 2.4 }],
          treasure: TR('neonStar', -0.35, 0.16, -13),
        },
        {
          name: T('反射板', 'Deflector', '反射板', '반사판'),
          goal: T('右の反射板に当てると、ボールは左へ向きを変える', 'Hit the right deflector and the ball turns left.', '打到右边的反射板，球会转向左边', '오른쪽 반사판에 맞히면 공이 왼쪽으로 꺾인다'),
          pins: tight(-0.2, -13.15, 2),
          blocks: [slant(0.5, -11.8, 0.25, -12.78), { x: -0.25, z: -12.2, w: 0.55, d: 0.1, h: 0.3 }],
          treasure: TR('quartz', 0.4, 0.16, -9),
        },
        {
          name: T('レールバンク', 'Rail Bank', '护栏反弹', '레일 뱅크'),
          goal: T('両側のレールで跳ね返して、真ん中の壁の裏へ', 'Bank off the rails to get behind the center wall.', '借两侧护栏反弹，绕到中间墙的后面', '양쪽 레일에 튕겨 가운데 벽 뒤로'),
          pins: tight(0, H, 3),
          rails: [{ side: -1, z1: -4, z2: -18 }, { side: 1, z1: -4, z2: -18 }],
          blocks: [{ x: 0, z: -15, w: 0.56, d: 0.12, h: 0.3 }],
          treasure: TR('neonStar', -0.42, 0.16, -14),
        },
        {
          name: T('バンパーの森', 'Bumper Forest', '弹板森林', '범퍼 숲'),
          goal: T('バンパーがたくさん。はじかれながら進め', 'Bumpers everywhere. Ricochet your way through.', '到处都是弹板。一路弹着前进', '범퍼가 가득. 튕기면서 나아가라'),
          pins: tight(0, H, 3),
          bumpers: [
            { x: -0.35, z: -7, kick: 1.6 }, { x: 0.35, z: -8.5, kick: 1.6 }, { x: -0.35, z: -10.5, kick: 1.6 },
            { x: 0.35, z: -12.5, kick: 1.6 }, { x: -0.35, z: -14, kick: 1.6 },
          ],
          treasure: TR('quartz', 0.1, 0.16, -12.5),
        },
        {
          name: T('ダブルスピナー', 'Double Spinner', '双旋转杆', '더블 스피너'),
          goal: T('逆回りの2本のバー。どちらにも当たらずに', 'Two bars spinning opposite ways. Miss them both.', '两根反向旋转的杆。两根都别碰', '반대로 도는 막대 두 개. 둘 다 피하자'),
          pins: tight(0, H, 3),
          spinners: [{ x: -0.2, z: -9, len: 0.5, speed: 2.2 }, { x: 0.2, z: -13, len: 0.5, speed: -2.2 }],
          treasure: TR('neonStar', 0.3, 0.16, -10),
        },
        {
          name: T('ピンボール台', 'Pinball Table', '弹珠台', '핀볼대'),
          goal: T('レール、バンパー、反射板。ピンボールそのもの', 'Rails, bumpers and a deflector. A real pinball table.', '护栏、弹板、反射板。就是一台弹珠机', '레일, 범퍼, 반사판. 핀볼 그 자체'),
          pins: rack(1, 2, 3, 4, 5, 6),
          rails: [{ side: -1, z1: -4, z2: -18 }, { side: 1, z1: -4, z2: -18 }],
          bumpers: [{ x: -0.25, z: -9 }, { x: 0.25, z: -11 }],
          blocks: [{ x: -0.3, z: -14, w: 0.35, d: 0.05, h: 0.3, rotY: 0.6, bouncy: true }],
          treasure: TR('quartz', -0.27, 0.16, -11.83),
        },
        {
          name: T('バンパー通り', 'Bumper Alley', '弹板大道', '범퍼 거리'),
          goal: T('左右に互い違いのバンパー。真ん中の細い道を通せ', 'Bumpers stagger left and right. Thread the narrow middle line.', '弹板左右交错排列。从中间的窄道穿过', '범퍼가 좌우로 엇갈려 있다. 가운데 좁은 길로 통과하라'),
          pins: tight(0, H, 3),
          rails: [{ side: -1, z1: -4, z2: -17 }, { side: 1, z1: -4, z2: -17 }],
          bumpers: [{ x: 0.3, z: -8, kick: 1.2 }, { x: -0.3, z: -11, kick: 1.2 }, { x: 0.3, z: -14, kick: 1.2 }],
          treasure: TR('neonStar', -0.2, 0.16, -10.5),
        },
        {
          name: T('ハイスコア', 'High Score', '最高分', '하이스코어'),
          goal: T('レール、バンパー、スピナー。10本でフィニッシュ', 'Rails, bumpers and a spinner. Finish with ten pins.', '护栏、弹板、旋转杆。以 10 个球瓶收尾', '레일, 범퍼, 스피너. 핀 10개로 피니시'),
          pins: tight(0, H, 4),
          rails: [{ side: -1, z1: -3, z2: -17 }, { side: 1, z1: -3, z2: -17 }],
          bumpers: [{ x: -0.33, z: -8 }, { x: 0.33, z: -8 }],
          spinners: [{ x: 0, z: -13, len: 0.5, speed: 2.6 }],
          treasure: TR('crown', 0, 0.16, -8),
        },
      ],
    },

    // =================================================================
    // WORLD 8 ワープ研究所: ワープゲートで別の場所へ飛ぶ
    // =================================================================
    {
      theme: 'warp',
      name: T('ワープ研究所', 'Warp Lab', '传送实验室', '워프 연구소'),
      stages: [
        {
          name: T('ワープ入門', 'Warp 101', '传送入门', '워프 입문'),
          goal: T('レーンは壁でふさがれている。青いゲートに入ると、オレンジのゲートから出る', 'A wall blocks the lane. Enter the blue gate to exit from the orange one.', '墙挡住了球道。进入蓝色传送门，会从橙色传送门出来', '벽이 레인을 막고 있다. 파란 게이트에 들어가면 주황 게이트로 나온다'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0, -8], b: [0, -12], r: 0.22 }],
          treasure: TR('onyx', 0, 0.16, -14),
        },
        {
          name: T('横にワープ', 'Side Warp', '侧向传送', '옆으로 워프'),
          goal: T('ゲートは左にある。出口は右', 'The gate is on the left. The exit is on the right.', '传送门在左边，出口在右边', '게이트는 왼쪽에 있다. 출구는 오른쪽'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [-0.3, -8], b: [0.3, -12], r: 0.2 }],
          treasure: TR('sapphire', 0.3, 0.16, -14),
        },
        {
          name: T('向きを変えるワープ', 'Turning Warp', '转向传送', '방향 바꾸는 워프'),
          goal: T('出口から、決まった向きで飛び出す', 'The exit launches you in a fixed direction.', '从出口以固定方向飞出', '출구에서 정해진 방향으로 튀어나온다'),
          pins: tri(-0.15, H, 3),
          blocks: [{ x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0.25, -8], b: [0.35, -11.5], r: 0.2, dir: -3 }],
          treasure: TR('quartz', 0.1, 0.16, -14),
        },
        {
          name: T('2連ワープ', 'Double Warp', '两连传送', '2연속 워프'),
          goal: T('壁が2枚。ワープを2回くぐれ', 'Two walls. Warp twice.', '两道墙。穿过两次传送门', '벽이 두 장. 워프를 두 번 지나라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -8, w: WALL_X * 2, d: 0.15, h: 0.4 }, { x: 0, z: -13, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0, -6.5], b: [-0.25, -9.5], r: 0.22 }, { a: [-0.25, -11.5], b: [0.15, -14.5], r: 0.22 }],
          treasure: TR('onyx', -0.25, 0.16, -10.6),
        },
        {
          name: T('出口の先は穴', 'Hole at the Exit', '出口前方有洞', '출구 앞은 구멍'),
          goal: T('出口のまわりは穴だらけ。入る位置で出る向きを決めよう', 'Holes surround the exit. Your entry decides your path.', '出口周围都是洞。入口位置决定前进方向', '출구 주변은 구멍투성이. 들어가는 위치로 방향을 정하자'),
          pins: tight(0, H, 3),
          blocks: [{ x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0, -8], b: [0, -11.5], r: 0.22 }],
          holes: [{ x: -0.35, z: -13, r: 0.2 }, { x: 0.35, z: -13, r: 0.2 }, { x: 0.05, z: -15.5, r: 0.13 }],
          treasure: TR('ruby', 0.12, 0.16, -14),
        },
        {
          name: T('えらぶゲート', 'Pick a Gate', '选择传送门', '게이트 고르기'),
          goal: T('ゲートは2つ。行き先がちがう', 'Two gates with different destinations.', '两个传送门，目的地不同', '게이트는 두 개. 도착지가 다르다'),
          pins: tri(-0.2, H, 3),
          blocks: [{ x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [-0.3, -8], b: [0.3, -12], r: 0.18 }, { a: [0.3, -8], b: [-0.2, -12], r: 0.18 }],
          treasure: TR('sapphire', 0.3, 0.16, -13.5),
        },
        {
          name: T('うしろ向きワープ', 'Reverse Warp', '反向传送', '뒤로 워프'),
          goal: T('ピンはレーンの途中で手前を向いている。奥から戻ってきて倒せ', 'The pins stand mid-lane. Warp to the far end and come back at them.', '球瓶立在球道中间。从最里面绕回来击倒它们', '핀은 레인 중간에 서 있다. 안쪽에서 되돌아와서 쓰러뜨려라'),
          pins: tri(0, -9.5, 3).map((p) => ({ x: p.x, z: -19 - p.z })),
          blocks: [{ x: 0, z: -7, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0, -5.5], b: [0, -17], r: 0.22, dir: 180 }],
          treasure: TR('onyx', 0.22, 0.16, -3.72),
        },
        {
          name: T('ワープジャンプ', 'Warp Jump', '传送飞跃', '워프 점프'),
          goal: T('出口の先にジャンプ台。谷を飛び越えろ', 'A ramp waits past the exit. Leap the canyon.', '出口前方有跳台。飞越峡谷', '출구 앞에 점프대. 협곡을 뛰어넘어라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -7, w: WALL_X * 2, d: 0.15, h: 0.4 }],
          portals: [{ a: [0, -5.5], b: [0, -8.5], r: 0.22 }],
          ramps: [{ x: 0, z: -10.5, w: LANE_W, len: 1.0, angle: 12 }],
          holes: [{ x: 0, z: -12.8, w: LANE_W + 0.02, d: 1.4 }],
          treasure: TR('diamond', 0, 0.5, -12.5),
        },
        {
          name: T('ワープ迷路', 'Warp Maze', '传送迷宫', '워프 미로'),
          goal: T('壁と穴とゲート。正しいゲートで抜けろ', 'Walls, holes and gates. Choose the right gate.', '墙、洞和传送门。选对传送门', '벽과 구멍과 게이트. 올바른 게이트로 빠져나가라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0, z: -9, w: WALL_X * 2, d: 0.15, h: 0.4 }, { x: -0.3, z: -14, w: 0.5, d: 0.15, h: 0.4 }],
          holes: [{ x: 0.3, z: -7, r: 0.18 }],
          portals: [{ a: [-0.3, -7], b: [0.3, -11], r: 0.18 }],
          treasure: TR('quartz', 0.3, 0.16, -15),
        },
        {
          name: T('次元のかなた', 'Beyond Dimensions', '次元彼岸', '차원 너머'),
          goal: T('3つのワープで研究所を抜け、10本へ', 'Three warps through the lab to ten pins.', '穿过三道传送门走出实验室，击倒 10 个球瓶', '워프 세 번으로 연구소를 빠져나가 핀 10개로'),
          pins: rack(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
          blocks: [
            { x: 0, z: -6, w: WALL_X * 2, d: 0.15, h: 0.4 }, { x: 0, z: -10, w: WALL_X * 2, d: 0.15, h: 0.4 },
            { x: 0, z: -14, w: WALL_X * 2, d: 0.15, h: 0.4 },
          ],
          portals: [
            { a: [0.25, -4.5], b: [-0.25, -7.5], r: 0.2 }, { a: [-0.25, -8.8], b: [0.25, -11.5], r: 0.2 },
            { a: [0.25, -12.8], b: [0, -15.5], r: 0.2, dir: 0 },
          ],
          treasure: TR('star', -0.25, 0.16, -8.2),
        },
      ],
    },

    // =================================================================
    // WORLD 9 工場: ベルトコンベア、プレス機、回転アーム
    // =================================================================
    {
      theme: 'factory',
      name: T('ピン工場', 'Pin Factory', '球瓶工厂', '핀 공장'),
      stages: [
        {
          name: T('ベルトコンベア', 'Conveyor Belt', '传送带', '컨베이어 벨트'),
          goal: T('コンベアがボールを右へ流す。左寄りに投げよう', 'The belt pushes the ball right. Aim a little left.', '传送带会把球推向右边。稍微偏左投', '컨베이어가 공을 오른쪽으로 민다. 조금 왼쪽으로 던지자'),
          pins: rack(1, 2, 3, 4, 5, 6),
          conveyors: [{ x: 0, z: -10, w: LANE_W, d: 2.5, fx: 22, fz: 0 }],
          treasure: TR('gear', -0.38, 0.16, -8),
        },
        {
          name: T('逆走コンベア', 'Reverse Belt', '逆向传送带', '역주행 컨베이어'),
          goal: T('手前へ押し戻すコンベア。速い球で押し切れ', 'A belt pushes you back. Power through with speed.', '传送带往回推。用快球冲过去', '앞으로 밀어내는 컨베이어. 빠른 공으로 밀어붙여라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          conveyors: [{ x: 0, z: -10, w: LANE_W, d: 4, fx: 0, fz: 40 }],
          treasure: TR('ring', 0.25, 0.16, -10),
        },
        {
          name: T('交互コンベア', 'Alternating Belts', '交替传送带', '번갈아 컨베이어'),
          goal: T('右へ、左へ。2本のコンベアで揺さぶられる', 'Right, then left. Two belts shove you around.', '先右后左。两条传送带来回推', '오른쪽으로, 왼쪽으로. 컨베이어 두 개에 흔들린다'),
          pins: rack(1, 2, 3, 4, 5, 6),
          conveyors: [{ x: 0, z: -8, w: LANE_W, d: 2, fx: 25, fz: 0 }, { x: 0, z: -12.5, w: LANE_W, d: 2, fx: -25, fz: 0 }],
          treasure: TR('gear', 0.35, 0.16, -10),
        },
        {
          name: T('プレス機', 'Press Line', '冲压线', '프레스 라인'),
          goal: T('2台のプレス機が動いている。すき間を通せ', 'Two presses are moving. Slip through the gaps.', '两台冲压机在移动。从空隙穿过', '프레스 두 대가 움직인다. 틈으로 통과하라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          movers: [
            { x: 0, z: -9, w: 0.45, d: 0.3, h: 0.35, range: 0.3, period: 2.2 },
            { x: 0, z: -13, w: 0.45, d: 0.3, h: 0.35, range: 0.3, period: 1.8, phase: 2 },
          ],
          treasure: TR('ring', -0.3, 0.16, -11),
        },
        {
          name: T('回転アーム', 'Robot Arm', '旋转机械臂', '회전 암'),
          goal: T('ロボットアームがぐるぐる回る', 'A robot arm sweeps round and round.', '机械臂转个不停', '로봇 팔이 빙글빙글 돈다'),
          pins: rack(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
          spinners: [{ x: -0.25, z: -11, len: 0.7, speed: 1.8 }],
          treasure: TR('gear', 0.3, 0.16, -11),
        },
        {
          name: T('加速レーン', 'Booster', '加速带', '가속 레인'),
          goal: T('前へ押すコンベアで加速して、谷を飛び越えろ', 'A forward belt speeds you up. Leap the canyon.', '向前推的传送带帮你加速，飞越峡谷', '앞으로 미는 컨베이어로 가속해서 협곡을 넘어라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          conveyors: [{ x: 0, z: -7, w: LANE_W, d: 4, fx: 0, fz: -45 }],
          ramps: [{ x: 0, z: -10, w: LANE_W, len: 1.0, angle: 10 }],
          holes: [{ x: 0, z: -12.8, w: LANE_W + 0.02, d: 2.2 }],
          treasure: TR('coinG', 0, 0.5, -12.6),
        },
        {
          name: T('仕分けライン', 'Sorting Line', '分拣线', '분류 라인'),
          goal: T('壁と横向きのコンベア。押される向きを読め', 'Walls and sideways belts. Read the push.', '墙壁和横向传送带。读懂推力方向', '벽과 옆으로 미는 컨베이어. 미는 방향을 읽어라'),
          pins: rack(1, 2, 3, 4, 5, 6),
          blocks: [{ x: 0.3, z: -8, w: 0.46, d: 0.2, h: 0.3 }],
          conveyors: [{ x: -0.1, z: -10.5, w: 0.84, d: 2, fx: 28, fz: 0 }],
          treasure: TR('ring', -0.35, 0.16, -8),
        },
        {
          name: T('交差点', 'Crossroads', '十字路口', '교차로'),
          goal: T('横切るプレス機と、押し返すコンベア', 'A crossing press and a pushback belt.', '横穿的冲压机和往回推的传送带', '가로지르는 프레스와 되미는 컨베이어'),
          pins: rack(1, 2, 3, 4, 5, 6),
          movers: [{ x: 0, z: -9, w: 0.45, d: 0.3, h: 0.35, range: 0.3, period: 2 }],
          conveyors: [{ x: 0, z: -13, w: LANE_W, d: 2, fx: 0, fz: 30 }],
          treasure: TR('gear', 0, 0.16, -11),
        },
        {
          name: T('組み立てライン', 'Assembly Line', '装配线', '조립 라인'),
          goal: T('レール、コンベア、回転アーム。工場のフル稼働', 'Rails, belts and a robot arm. Full production.', '护栏、传送带、机械臂。工厂全速运转', '레일, 컨베이어, 회전 암. 공장 풀가동'),
          pins: rack(1, 2, 3, 4, 5, 6),
          rails: [{ side: -1, z1: -4, z2: -17 }, { side: 1, z1: -4, z2: -17 }],
          conveyors: [{ x: 0, z: -8, w: LANE_W, d: 2, fx: -24, fz: 0 }],
          spinners: [{ x: 0.2, z: -12.5, len: 0.5, speed: -2 }],
          treasure: TR('ring', -0.42, 0.16, -10),
        },
        {
          name: T('工場長の挑戦', "Foreman's Challenge", '厂长的挑战', '공장장의 도전'),
          goal: T('コンベア、プレス機、加速ジャンプ。10本でしめくくれ', 'Belts, presses and a boosted jump. Finish with ten pins.', '传送带、冲压机、加速飞跃。以 10 个球瓶收尾', '컨베이어, 프레스, 가속 점프. 핀 10개로 마무리하라'),
          pins: tight(0, H, 4),
          conveyors: [{ x: 0, z: -6, w: LANE_W, d: 2, fx: 20, fz: -20 }],
          movers: [{ x: 0, z: -9, w: 0.42, d: 0.3, h: 0.35, range: 0.3, period: 2.2 }],
          ramps: [{ x: 0, z: -11.5, w: LANE_W, len: 1.0, angle: 11 }],
          holes: [{ x: 0, z: -13.7, w: LANE_W + 0.02, d: 1.3 }],
          treasure: TR('trophy', 0, 0.5, -13.5),
        },
      ],
    },

    // =================================================================
    // WORLD 10 天空の城: 雲の上で、すべての仕掛けを組み合わせる
    // =================================================================
    {
      theme: 'sky',
      name: T('天空の城', 'Castle in the Sky', '天空之城', '천공의 성'),
      stages: [
        {
          name: T('雲の上の道', 'Road in the Clouds', '云上之路', '구름 위의 길'),
          goal: T('雲の上の白い道。外れたら真っ逆さま', 'A white road above the clouds. Stray and you plunge.', '云上的白色道路。偏出去就会坠落', '구름 위 하얀 길. 벗어나면 곧장 추락'),
          pins: tight(0, H + 0.4, 4),
          floors: [beam(0, -0.6, 0, -17.2, 0.7), pad(0, -18.3, 1.2, 1.9)],
          treasure: TR('pearl', 0.3, 0.16, -9.97),
        },
        {
          name: T('城門のワープ', 'Gate Warp', '城门传送', '성문 워프'),
          goal: T('道が途切れている。ゲートで向こう岸へ', 'The road ends. Warp to the far side.', '道路断了。用传送门到对岸', '길이 끊겼다. 게이트로 건너편으로'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -8, 0.7), beam(0, -11, 0, -17.2, 0.7), pad(0, -18.3, 1.2, 1.9)],
          portals: [{ a: [0, -7.4], b: [0, -11.6], r: 0.22, dir: 0 }],
          treasure: TR('sapphire', 0.2, 0.16, -14),
        },
        {
          name: T('風の橋', 'Wind Bridge', '风之桥', '바람의 다리'),
          goal: T('橋の上で横風 (コンベア) が吹く', 'A crosswind blows across the bridge.', '桥上刮着横风', '다리 위에 옆바람이 분다'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -17.2, 0.8), pad(0, -18.3, 1.2, 1.9)],
          conveyors: [{ x: 0, z: -10, w: 0.8, d: 3, fx: -16, fz: 0 }],
          treasure: TR('quartz', 0.3, 0.16, -8),
        },
        {
          name: T('塔へのジャンプ', 'Tower Leap', '飞向高塔', '탑으로 점프'),
          goal: T('ジャンプ台から高い塔の上へ飛び移れ', 'Leap from the ramp onto the high tower.', '从跳台飞到高塔顶上', '점프대에서 높은 탑 위로 뛰어올라라'),
          pins: tri(0, H + 0.4, 3, 0.2),
          floors: [beam(0, -0.6, 0, -9, 0.7), pad(0, -15.4, 1.2, 7.6, 0.2)],
          ramps: [{ x: 0, z: -8.0, w: 0.7, len: 1.0, angle: 14 }],
          treasure: TR('topaz', 0, 0.55, -10.5),
        },
        {
          name: T('天空のバンパー', 'Sky Bumpers', '天空弹板', '하늘의 범퍼'),
          goal: T('細い道にバンパー。はじかれて落ちないように', 'Bumpers on a narrow road. Do not get knocked off.', '窄路上有弹板。别被弹下去', '좁은 길에 범퍼. 튕겨 떨어지지 않게'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -17.2, 0.9), pad(0, -18.3, 1.2, 1.9)],
          bumpers: [{ x: -0.25, z: -9, kick: 1.2 }, { x: 0.25, z: -12, kick: 1.2 }],
          treasure: TR('neonStar', 0.01, 0.16, -9.2),
        },
        {
          name: T('回る風車', 'Windmill', '风车', '풍차'),
          goal: T('風車の羽根が道をなぎ払う', 'Windmill blades sweep the road.', '风车叶片扫过道路', '풍차 날개가 길을 휩쓴다'),
          pins: tight(0, H + 0.4, 4),
          floors: [beam(0, -0.6, 0, -17.2, 0.8), pad(0, -18.3, 1.2, 1.9)],
          spinners: [{ x: 0, z: -10, len: 0.7, speed: 1.6 }],
          treasure: TR('pearl', -0.25, 0.16, -12),
        },
        {
          name: T('浮き島めぐり', 'Floating Isles', '浮岛之旅', '떠다니는 섬'),
          goal: T('浮き島を2回のジャンプで渡れ', 'Cross the floating isles with two jumps.', '两次飞跃跨过浮岛', '두 번의 점프로 떠다니는 섬을 건너라'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -5.5, 0.7), pad(0, -9.0, 1.0, 3.0), pad(0, -15.5, 1.2, 7.2)],
          ramps: [{ x: 0, z: -4.6, w: 0.7, len: 0.9, angle: 10 }, { x: 0, z: -9.6, w: 1.0, len: 0.9, angle: 10 }],
          treasure: TR('crown', 0, 0.4, -11),
        },
        {
          name: T('螺旋の回廊', 'Spiral Walk', '螺旋回廊', '나선 회랑'),
          goal: T('道は左へ、また右へ曲がる。カーブで乗りこなせ', 'The road bends left, then right. Ride it with your hook.', '道路先左弯再右弯。用弧线驾驭', '길은 왼쪽으로, 또 오른쪽으로 굽는다. 커브로 따라가라'),
          pins: tri(0.2, H + 0.4, 3),
          floors: [...beamPath([[0, -0.6], [0, -5], [-0.3, -9], [-0.3, -11], [0.1, -14.5], [0.2, -17.4]], 0.55), pad(0.2, -18.3, 1.2, 1.9)],
          treasure: TR('ruby', -0.3, 0.16, -10),
        },
        {
          name: T('雲の迷宮', 'Cloud Labyrinth', '云之迷宫', '구름 미궁'),
          goal: T('ゲートと風と細い道。天空の城の最後の守り', 'Gates, wind and narrow paths. The last defense.', '传送门、风与窄道。天空之城最后的防线', '게이트와 바람과 좁은 길. 천공의 성 마지막 수비'),
          pins: tri(0, H + 0.4, 3),
          floors: [beam(0, -0.6, 0, -6, 0.6), beam(0.3, -9, 0.3, -12.5, 0.5), pad(0, -16.6, 1.2, 5.2)],
          portals: [{ a: [0, -5.4], b: [0.3, -9.6], r: 0.22, dir: 0 }],
          conveyors: [{ x: 0, z: -15.5, w: 1.2, d: 1.5, fx: 14, fz: 0 }],
          ramps: [{ x: 0.3, z: -11.7, w: 0.5, len: 0.8, angle: 12 }],
          treasure: TR('diamond', 0.01, 0.16, -16.09),
        },
        {
          name: T('王座の間', 'Throne Room', '王座之间', '왕좌의 방'),
          goal: T('ワープ、ジャンプ、バンパー。最後の10本を倒して頂点へ', 'Warp, jump, bumpers. Topple the final ten pins.', '传送、飞跃、弹板。击倒最后的 10 个球瓶登上顶峰', '워프, 점프, 범퍼. 마지막 핀 10개를 쓰러뜨려 정상으로'),
          pins: tight(0, H + 0.4, 4, 0.2),
          floors: [beam(0, -0.6, 0, -5.5, 0.6), beam(0, -8.5, 0, -11, 0.6), pad(0, -16.2, 1.2, 6, 0.2)],
          portals: [{ a: [0, -4.9], b: [0, -9.0], r: 0.22, dir: 0 }],
          ramps: [{ x: 0, z: -10.3, w: 0.6, len: 1.0, angle: 13 }],
          bumpers: [{ x: -0.48, z: -15.2, kick: 1, y0: 0.2 }, { x: 0.48, z: -15.2, kick: 1, y0: 0.2 }],
          treasure: TR('star', 0, 0.6, -12.5),
        },
      ],
    },
  ];
};
