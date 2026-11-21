// ぜんぶ削る: ゲームの計算 (画面に依存しない部分。Node でも動くのでバランスの試算にも使う)
(function (root) {
  'use strict';
  const D = root.KZ_DATA;

  function newState() {
    return {
      v: 1,
      money: 0,          // 削りカス (m³)
      stage: 0,          // 今削っている対象の番号 (0〜)。STAGES.length なら全部壊した
      removed: 0,        // 今の対象から削った体積
      tools: D.TOOLS.map(() => 0),
      upg: { tap: 0, tech: 0, link: 0 },
      runTotal: 0,       // この周で削った総量
      runTime: 0,        // この周の経過秒数
      boughtTool: false, // この周で道具を買ったか
      // ここから下は転生しても残る
      lifetime: 0,
      taps: 0,
      bestTap: 0,
      bestStage: 1,      // 到達した一番先のステージ (1〜)
      memories: 0,       // 破壊の記憶 (これまでに得た総数)
      spent: 0,          // スキルに使った記憶
      skills: { offline: 0, idle: 0, start: 0, auto: 0 },
      autoOn: true,
      rebirths: 0,
      ach: {},
      flags: {},
      stageStart: 0,     // 今の対象を削り始めたときの runTime
      settings: { notation: 'ja' },
      lastSave: Date.now(),
    };
  }

  const achCount = (s) => Object.keys(s.ach).length;

  // 転生と実績による倍率 (道具にもタップにも効く)
  function soulMult(s) {
    return Math.pow(1 + D.MEMORY_BONUS, s.memories) * (1 + D.ACH_BONUS * achCount(s));
  }
  function stageMult(s) {
    return Math.pow(D.CLEAR_BONUS, Math.min(s.stage, D.STAGES.length));
  }
  function milestoneMult(count) {
    let m = 1;
    for (const n of D.MILESTONES) if (count >= n) m *= 2;
    return m;
  }
  function nextMilestone(count) {
    return D.MILESTONES.find((n) => n > count) || null;
  }
  // 道具1種類ぶんの秒間破壊量 (全体倍率をかける前)
  function toolRaw(s, i, count = s.tools[i]) {
    const t = D.TOOLS[i];
    return (t.cost / t.payback) * count * milestoneMult(count);
  }
  function globalMult(s) {
    return stageMult(s) * Math.pow(2, s.upg.tech) * soulMult(s);
  }
  function dps(s) {
    let sum = 0;
    for (let i = 0; i < D.TOOLS.length; i++) sum += toolRaw(s, i);
    return sum * globalMult(s);
  }
  function tapPower(s) {
    return D.TAP_BASE * Math.pow(3, s.upg.tap) * stageMult(s) * soulMult(s) + dps(s) * 0.02 * s.upg.link;
  }

  // 道具を n 台まとめて買う値段
  function toolCost(s, i, n = 1) {
    const t = D.TOOLS[i];
    const g = D.TOOL_GROWTH;
    const first = t.cost * Math.pow(g, s.tools[i]);
    return n === 1 ? first : first * (Math.pow(g, n) - 1) / (g - 1);
  }
  // 今のお金で買える最大台数
  function maxAffordable(s, i) {
    const t = D.TOOLS[i];
    const g = D.TOOL_GROWTH;
    const first = t.cost * Math.pow(g, s.tools[i]);
    if (s.money < first) return 0;
    return Math.max(1, Math.floor(Math.log(s.money * (g - 1) / first + 1) / Math.log(g)));
  }
  const toolUnlocked = (s, i) => s.stage + 1 >= D.TOOLS[i].unlock || s.tools[i] > 0;

  function buyTool(s, i, n = 1) {
    if (!toolUnlocked(s, i) || n < 1) return false;
    const c = toolCost(s, i, n);
    if (s.money < c) return false;
    s.money -= c;
    s.tools[i] += n;
    s.boughtTool = true;
    return true;
  }

  function upgCost(s, id) {
    const u = D.UPGRADES.find((x) => x.id === id);
    return u.base * Math.pow(u.growth, s.upg[id]);
  }
  function upgMaxed(s, id) {
    return s.upg[id] >= D.UPGRADES.find((x) => x.id === id).max;
  }
  function buyUpg(s, id) {
    if (upgMaxed(s, id)) return false;
    const c = upgCost(s, id);
    if (s.money < c) return false;
    s.money -= c;
    s.upg[id]++;
    return true;
  }

  // 削る。壊した対象の番号 (0〜) の配列を返す
  function advance(s, amount, opts = {}) {
    const cleared = [];
    if (!(amount > 0)) return cleared;
    s.money += amount;
    s.runTotal += amount;
    s.lifetime += amount;
    while (amount > 0 && s.stage < D.STAGES.length) {
      const rest = D.STAGES[s.stage].vol - s.removed;
      if (amount >= rest) {
        amount -= rest;
        if (s.stage === 0 && !s.boughtTool) s.flags.handPencil = true;
        cleared.push(s.stage);
        s.stage++;
        s.removed = 0;
        s.stageStart = s.runTime;
        s.bestStage = Math.max(s.bestStage, s.stage + 1);
        if (s.stage >= D.STAGES.length) s.flags.sunDone = true;
        if (opts.offline) {
          s.flags.offlineClear = true;
          if (D.STAGES[s.stage - 1].id === 'earth') s.flags.offlineEarth = true;
        }
      } else {
        s.removed += amount;
        amount = 0;
      }
    }
    return cleared;
  }

  function tap(s) {
    const p = tapPower(s);
    s.taps++;
    s.bestTap = Math.max(s.bestTap, p);
    return { power: p, cleared: advance(s, p) };
  }

  // 秒数 dt だけ進める
  function tick(s, dt) {
    s.runTime += dt;
    if (s.skills.auto && s.autoOn) autoBuy(s);
    return advance(s, dps(s) * dt);
  }

  function autoBuy(s) {
    for (let k = 0; k < 50; k++) {
      let best = -1, bestCost = Infinity;
      for (let i = 0; i < D.TOOLS.length; i++) {
        if (!toolUnlocked(s, i)) continue;
        const c = toolCost(s, i);
        if (c < bestCost) { bestCost = c; best = i; }
      }
      if (best < 0 || !buyTool(s, best)) break;
    }
  }

  // 転生
  function canRebirth(s) {
    return s.stage + 1 >= D.REBIRTH_STAGE;
  }
  // この周の総量で届く記憶の数。今持っている数より増えたぶんだけもらえる
  function memoryTarget(v) {
    return v > 0 ? Math.max(0, Math.floor(10 * (Math.log10(v) - 11))) : 0;
  }
  function rebirthGain(s) {
    if (!canRebirth(s)) return 0;
    return Math.max(0, memoryTarget(s.runTotal) - s.memories);
  }
  function rebirth(s) {
    const gain = rebirthGain(s);
    if (gain <= 0) return 0;
    s.memories += gain;
    s.rebirths++;
    s.money = 0;
    s.stage = 0;
    s.removed = 0;
    s.tools = D.TOOLS.map((_, i) => (i < s.skills.start * 2 ? 5 : 0));
    s.upg = { tap: 0, tech: 0, link: 0 };
    s.runTotal = 0;
    s.runTime = 0;
    s.stageStart = 0;
    s.boughtTool = false;
    return gain;
  }
  const memoriesLeft = (s) => s.memories - s.spent;
  function skillCost(s, id) {
    const k = D.SKILLS.find((x) => x.id === id);
    return Math.round(k.cost * Math.pow(k.growth, s.skills[id]));
  }
  function buySkill(s, id) {
    const k = D.SKILLS.find((x) => x.id === id);
    if (s.skills[id] >= k.max) return false;
    const c = skillCost(s, id);
    if (memoriesLeft(s) < c) return false;
    s.spent += c;
    s.skills[id]++;
    if (id === 'start') {
      for (let i = 0; i < s.skills.start * 2 && i < D.TOOLS.length; i++) s.tools[i] = Math.max(s.tools[i], 5);
    }
    return true;
  }

  // オフライン (閉じていた秒数 sec)
  function offlineLimitSec(s) {
    return (D.OFFLINE_HOURS + 4 * s.skills.offline) * 3600;
  }
  function offlineRate(s) {
    return D.OFFLINE_RATE + 0.1 * s.skills.idle;
  }
  function applyOffline(s, sec) {
    const used = Math.min(Math.max(0, sec), offlineLimitSec(s));
    if (used < 10) return null;
    const before = s.stage;
    // 壊すたびに倍率が上がるので、少しずつ進める
    const steps = 200;
    let total = 0;
    const cleared = [];
    for (let k = 0; k < steps; k++) {
      const dt = used / steps;
      s.runTime += dt;
      if (s.skills.auto && s.autoOn) autoBuy(s);
      const a = dps(s) * offlineRate(s) * dt;
      total += a;
      cleared.push(...advance(s, a, { offline: true }));
    }
    return { sec: used, rawSec: sec, amount: total, cleared, from: before };
  }

  // 実績の判定。新しく達成したものを返す
  function checkAch(s) {
    const info = {
      taps: s.taps, flags: s.flags, lifetime: s.lifetime, bestTap: s.bestTap, bestStage: s.bestStage, rebirths: s.rebirths,
      toolTotal: s.tools.reduce((a, b) => a + b, 0), toolKinds: s.tools.filter((n) => n > 0).length,
    };
    const got = [];
    for (const a of D.ACHIEVEMENTS) {
      if (!s.ach[a.id] && a.check(info)) { s.ach[a.id] = Date.now(); got.push(a); }
    }
    return got;
  }

  // 完了までの秒数 (今の秒間破壊量のまま)
  function eta(s) {
    if (s.stage >= D.STAGES.length) return 0;
    const d = dps(s);
    if (d <= 0) return Infinity;
    return (D.STAGES[s.stage].vol - s.removed) / d;
  }

  // セーブデータを読み込むとき、足りない項目を補う
  function migrate(saved) {
    const s = newState();
    if (!saved || typeof saved !== 'object') return s;
    for (const k of Object.keys(s)) if (k in saved) s[k] = saved[k];
    s.tools = D.TOOLS.map((_, i) => Number(saved.tools && saved.tools[i]) || 0);
    s.upg = { ...newState().upg, ...(saved.upg || {}) };
    s.skills = { ...newState().skills, ...(saved.skills || {}) };
    s.settings = { ...newState().settings, ...(saved.settings || {}) };
    s.flags = saved.flags || {};
    s.ach = saved.ach || {};
    return s;
  }

  root.KZ = {
    newState, migrate, dps, tapPower, toolRaw, globalMult, milestoneMult, nextMilestone,
    toolCost, maxAffordable, toolUnlocked, buyTool, upgCost, upgMaxed, buyUpg,
    advance, tap, tick, autoBuy, canRebirth, memoryTarget, rebirthGain, rebirth, memoriesLeft, skillCost, buySkill,
    offlineLimitSec, offlineRate, applyOffline, checkAch, eta, achCount,
  };
})(typeof window !== 'undefined' ? window : globalThis);
