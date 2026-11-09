/*
 * 試作 1: 横スクロールの陣取り
 *   右のボスから音符が左へ進んでくる。左の指揮台から楽団員を送り出す。楽団員は右へ進み、
 *   出会った音符と戦う。ダメージを受けきると消える。音符が指揮台に届くと体力が減る。
 *   インクは時間でたまる (インク壺を強化すると早くたまる)。指揮者の一振りは、ためて撃つ大技
 *   高い音 (高音域) は宙を飛ぶ: 前線に止められず、遠くを撃てる楽器 (ヴァイオリン・フルート・トランペット) しか当てられない
 */
(() => {
  'use strict';
  const P = window.Proto;
  const { clamp, rand, Synth } = P;

  const FW = 1280;
  const FH = 720;
  const CASTLE_X = 92;
  const BOSS_X = 1200;
  const BAND_TOP = 170; // 音符と楽団員がいる帯 (高い音ほど上)
  const BAND_BOT = 600;
  const GROUND = 640;
  const NOTE_SPD = 62; // 中音の速さ (px/秒)
  const NOTE_ATK = 0.6;
  const NOTE_HP = 3.6; // この遊び方では音符を硬く (楽団員がまとめて戦うので)
  const MAX_UNITS = 12; // 音符の攻撃の強さ (1 秒あたり、noteStats の atk にかける)

  const UNITS = [
    { id: 'piano', name: 'ピアノ', cost: 40, wait: 1.6, hp: 70, dmg: 9, rate: 0.6, range: 34, spd: 58, reg: 'all', kind: 'melee', area: 18, desc: '安い壁役 (飛ぶ高音には届かない)' },
    { id: 'violin', name: 'ヴァイオリン', cost: 70, wait: 2.6, hp: 42, dmg: 12, rate: 0.5, range: 190, spd: 52, reg: 'hi', kind: 'beam', area: 0, desc: '遠くから高音を射抜く (飛ぶ音符にも当たる)', air: true },
    { id: 'cello', name: 'チェロ', cost: 110, wait: 6, hp: 380, dmg: 6, rate: 0.7, range: 36, spd: 30, reg: 'lo', kind: 'melee', area: 30, desc: '硬い盾。低音に強い' },
    { id: 'flute', name: 'フルート', cost: 90, wait: 3.5, hp: 36, dmg: 6, rate: 0.6, range: 250, spd: 62, reg: 'hi', kind: 'homing', area: 0, shots: 2, desc: '速い高音を追う弾 2 発 (飛ぶ音符にも当たる)', air: true },
    { id: 'trumpet', name: 'トランペット', cost: 130, wait: 6, hp: 90, dmg: 13, rate: 1.3, range: 150, spd: 46, reg: 'mid', kind: 'cone', area: 120, kb: 45, desc: '前方をまとめて吹き飛ばす (飛ぶ音符にも当たる)', air: true },
    { id: 'timpani', name: 'ティンパニ', cost: 160, wait: 8, hp: 160, dmg: 20, rate: 1.7, range: 70, spd: 34, reg: 'lo', kind: 'pulse', area: 80, kb: 30, desc: '衝撃波で押し戻す' },
    { id: 'organ', name: 'オルガン', cost: 320, wait: 18, hp: 260, dmg: 75, rate: 2.8, range: 340, spd: 16, reg: 'lo', kind: 'pillar', area: 64, desc: '遠くへ重い一撃' },
  ];
  const WALLET_MAX = 8;

  let E = null;
  const bar = {};

  function pitchY(p) {
    return BAND_BOT - ((clamp(p, 28, 100) - 28) / 72) * (BAND_BOT - BAND_TOP);
  }

  function start(e) {
    E = e;
    e.ink = 220;
    e.notes = [];
    e.units = [];
    e.shots = [];
    e.wallet = 1;
    e.cool = {};
    e.skill = 0.3; // 指揮者の一振り (0〜1 でたまる)
    e.boss.maxHp = e.boss.hp = 1800 * [1.5, 1.8, 2.4, 3.1, 4][e.song.stars - 1] * e.S.diff.hp;
    e.boss.x = BOSS_X;
    e.boss.y = (BAND_TOP + BAND_BOT) / 2;
    e.alive = () => e.notes.length;
    e.spawned = 0;
    buildBar(e);
    document.getElementById('hint').textContent = '下のボタンで楽団員を送り出す。羽の生えた高い音は前線を飛びこえる → ヴァイオリン・フルート・トランペットで。インク壺でインクが早くたまる';
    P.beginSong(e);
    P.banner('開演', 1.2);
  }

  function walletRate(e) {
    return 10 + (e.wallet - 1) * 6;
  }
  function walletCap(e) {
    return 300 + (e.wallet - 1) * 160;
  }
  function walletCost(e) {
    return 60 + e.wallet * 50;
  }

  function buildBar(e) {
    const el = document.getElementById('bar');
    el.innerHTML = '';
    const w = document.createElement('button');
    w.className = 'unit-btn big';
    w.innerHTML = '<span class="g">🫙</span><span>インク壺</span><span class="c"></span>';
    w.onclick = () => upgradeWallet(e);
    el.appendChild(w);
    bar.wallet = w;
    bar.units = UNITS.map((u, i) => {
      const b = document.createElement('button');
      b.className = 'unit-btn';
      b.innerHTML = `<span class="g">${P.INST[u.id].glyph}</span><span>${u.name}</span><span class="c">🖋${u.cost}</span><span class="r">${P.REG_NAME[u.reg]}・${i + 1}</span><span class="cool"></span>`;
      b.title = u.desc;
      b.onclick = () => summon(e, u);
      el.appendChild(b);
      return b;
    });
    const s = document.createElement('button');
    s.className = 'unit-btn big';
    s.innerHTML = '<span class="g">🪄</span><span>一振り</span><span class="r">Space</span><span class="cool"></span>';
    s.onclick = () => skill(e);
    el.appendChild(s);
    bar.skill = s;
  }

  function hud(e) {
    if (!bar.units) return;
    UNITS.forEach((u, i) => {
      const b = bar.units[i];
      const cd = e.cool[u.id] || 0;
      b.disabled = e.ink < u.cost || cd > 0 || e.units.length >= MAX_UNITS;
      b.querySelector('.cool').style.height = (clamp(cd / u.wait, 0, 1) * 100).toFixed(0) + '%';
    });
    const wc = walletCost(e);
    bar.wallet.querySelector('.c').textContent = e.wallet >= WALLET_MAX ? '最大' : `Lv${e.wallet}→ 🖋${wc}`;
    bar.wallet.disabled = e.wallet >= WALLET_MAX || e.ink < wc;
    bar.skill.querySelector('.cool').style.height = ((1 - e.skill) * 100).toFixed(0) + '%';
    bar.skill.classList.toggle('ready', e.skill >= 1);
    document.getElementById('hud-extra').textContent = `楽団 ${e.units.length}/${MAX_UNITS}人　インク +${walletRate(e)}/秒 (上限 ${walletCap(e)})`;
  }

  function upgradeWallet(e) {
    const c = walletCost(e);
    if (e.wallet >= WALLET_MAX || e.ink < c) return;
    e.ink -= c;
    e.wallet++;
    Synth.sfx('level', { p: 72 });
    P.text(CASTLE_X, GROUND - 120, 'インク壺 Lv' + e.wallet, '#9ff3d0', 18);
  }

  function summon(e, u) {
    if (e.over || e.ink < u.cost || (e.cool[u.id] || 0) > 0 || e.units.length >= MAX_UNITS) return;
    e.ink -= u.cost;
    e.cool[u.id] = u.wait;
    const y = rand(BAND_TOP + 30, BAND_BOT - 10);
    e.units.push({ def: u, x: CASTLE_X + 24, y, hp: u.hp, maxHp: u.hp, cd: 0.3, act: 0, hurt: 0, t: rand(0, 6), kbRes: 0 });
    Synth.sfx('pick', { p: 67 });
  }

  function skill(e) {
    if (e.over || e.skill < 1) return;
    e.skill = 0;
    const comp = e.comp;
    const reach = 720;
    let hit = 0;
    for (const n of e.notes) {
      if (n.x - CASTLE_X > reach) continue;
      damage(e, n, 40 + 0.35 * n.maxHp, 'all');
      knock(n, 120);
      hit++;
    }
    if (e.phase === 'boss' && e.boss.x - CASTLE_X < 1300) hitBoss(e, e.boss.maxHp * 0.04);
    P.ring(CASTLE_X + 40, (BAND_TOP + BAND_BOT) / 2, reach, '#ffd84a', 0.6, 10);
    P.shake(10);
    Synth.sfx('boom');
    Synth.sfx('cymbal');
    P.banner(`${comp.name.ja} の一振り！`, 1);
  }

  function knock(n, v) {
    n.x += v / (1 + n.kbRes);
    n.kbRes += 1;
  }

  function spawn(e, src, minion) {
    const n = P.noteStats(e.S, src, (minion ? 0.8 : 1) * NOTE_HP);
    n.x = BOSS_X - 40;
    n.y = pitchY(src.p) + rand(-4, 4);
    n.kbRes = 0;
    n.fly = n.reg === 'hi' && !n.fermata;
    n.atkCd = rand(0, 0.5);
    n.ink = 1.2 + n.maxHp * 0.02;
    e.notes.push(n);
    e.boss.pulse = 1;
  }

  function damage(e, n, d, reg) {
    if (n.dead) return;
    if (reg !== 'all' && reg === n.reg) d *= 1.5;
    n.hp -= d;
    n.flash = 0.08;
    if (n.hp <= 0) {
      n.dead = true;
      P.onKill(e, n, n.x, n.y, n.ink);
    }
  }
  function hitBoss(e, d) {
    if (e.boss.shield || e.over) return;
    e.boss.hp -= d;
    e.boss.hurt = 0.08;
    if (e.boss.hp <= 0) {
      P.burst(e.boss.x, e.boss.y, '#ffd84a', 60, 400, 1.2, 6);
      P.finish(true);
    }
  }

  function update(e, dt) {
    // インク・待ち時間・大技
    e.ink = Math.min(walletCap(e), e.ink + walletRate(e) * dt);
    for (const k in e.cool) e.cool[k] = Math.max(0, e.cool[k] - dt);
    e.skill = Math.min(1, e.skill + dt / 32);
    e.boss.pulse = Math.max(0, e.boss.pulse - dt * 4);
    e.boss.hurt = Math.max(0, e.boss.hurt - dt);
    P.songStep(e, (src, minion) => spawn(e, src, minion));

    // 楽団員を前 (右) から並べる
    e.units.sort((a, b) => b.x - a.x);
    const front = e.units[0];
    // 一番前 (左) の音符
    let lead = null;
    for (const n of e.notes) if (!lead || n.x < lead.x) lead = n;

    // 音符: 左へ進む。前に楽団員がいたら止まって攻撃
    for (const n of e.notes) {
      n.t += dt;
      n.flash = Math.max(0, n.flash - dt);
      n.kbRes = Math.max(0, n.kbRes - dt * 0.6);
      let blocked = false;
      if (!n.fly && front && n.x - n.r <= front.x + 16 && n.x > front.x - 40) {
        blocked = true;
        n.atkCd -= dt;
        if (n.atkCd <= 0) {
          n.atkCd = 0.5;
          // 一番前の楽団員のうち、近いものを叩く
          let tgt = null;
          for (const u of e.units) {
            if (Math.abs(u.x - n.x) < n.r + 26) {
              tgt = u;
              break;
            }
          }
          if (tgt) {
            tgt.hp -= n.atk * NOTE_ATK * 0.5 * 2;
            tgt.hurt = 0.08;
          }
        }
      }
      if (!blocked) n.x -= NOTE_SPD * n.spd * dt;
      if (n.x < CASTLE_X + 10) {
        n.dead = true;
        e.leaked++;
        P.hurt(e, (2 + n.v) * (n.elite ? 3 : 1) * (n.fermata ? 2 : 1) * e.S.diff.dmg * (n.grace ? 0.2 : 1) * e.S.densLeak * (n.fly ? 0.5 : 1));
        P.burst(CASTLE_X + 10, n.y, '#ff6b6b', 6, 120, 0.4, 3);
      }
    }

    // 楽団員: 右へ進み、射程に音符がいたら止まって攻撃
    for (const u of e.units) {
      const D = u.def;
      u.t += dt;
      u.cd -= dt;
      u.act = Math.max(0, u.act - dt);
      u.hurt = Math.max(0, u.hurt - dt);
      // 射程の中で一番左の音符
      let tgt = null;
      for (const n of e.notes) {
        if (n.dead || (n.fly && !D.air)) continue;
        const dx = n.x - u.x;
        if (dx > -20 && dx <= D.range + n.r && (!tgt || n.x < tgt.x)) tgt = n;
      }
      const atBoss = e.phase === 'boss' && e.boss.x - u.x <= D.range + 60;
      if (!tgt && !atBoss) {
        if (u.x < BOSS_X - 70) u.x += D.spd * dt;
      } else if (u.cd <= 0) {
        u.cd = D.rate;
        u.act = 0.25;
        attack(e, u, tgt, atBoss && !tgt);
      }
      if (u.hp <= 0) {
        u.dead = true;
        P.burst(u.x, u.y, P.INST[D.id].col, 14, 200, 0.6, 4);
        P.text(u.x, u.y - 20, '退場', '#ff8aa8', 14);
        Synth.sfx('clang');
      }
    }
    e.units = e.units.filter((u) => !u.dead);
    e.notes = e.notes.filter((n) => !n.dead && n.x < BOSS_X + 60);

    // 弾 (見た目だけ)
    for (const s of e.shots) s.life -= dt;
    e.shots = e.shots.filter((s) => s.life > 0);
    void lead;
  }

  function attack(e, u, tgt, boss) {
    const D = u.def;
    const tx = boss ? e.boss.x : tgt.x;
    const ty = boss ? e.boss.y : tgt.y;
    const hitArea = (cx, w, d, kb) => {
      for (const n of e.notes) {
        if (n.fly && !D.air) continue;
        if (Math.abs(n.x - cx) <= w + n.r) {
          damage(e, n, d, D.reg);
          if (kb) knock(n, kb);
        }
      }
    };
    switch (D.kind) {
      case 'melee':
        if (boss) hitBoss(e, D.dmg);
        else hitArea(tgt.x, D.area, D.dmg, 6);
        e.shots.push({ kind: 'swing', x: u.x + 18, y: u.y, col: P.INST[D.id].col, life: 0.18, max: 0.18 });
        break;
      case 'beam':
        if (boss) hitBoss(e, D.dmg);
        else damage(e, tgt, D.dmg, D.reg);
        e.shots.push({ kind: 'beam', x: u.x, y: u.y, tx, ty, col: '#ffe9a8', life: 0.12, max: 0.12 });
        Synth.sfx('shot', { p: 84 });
        break;
      case 'homing': {
        const near = e.notes.filter((n) => !n.dead && n.x - u.x <= D.range && n.x > u.x - 20).sort((a, b) => (b.fly - a.fly) || a.x - b.x);
        for (let k = 0; k < D.shots; k++) {
          const n = near[k % Math.max(1, near.length)];
          if (boss || !n) hitBoss(e, D.dmg);
          else damage(e, n, D.dmg, D.reg);
          e.shots.push({ kind: 'spark', x: u.x, y: u.y, tx: n && !boss ? n.x : e.boss.x, ty: n && !boss ? n.y : e.boss.y, col: '#bfe8ff', life: 0.28, max: 0.28, arc: k ? 40 : -40 });
        }
        break;
      }
      case 'cone':
        if (boss) hitBoss(e, D.dmg);
        else hitArea(u.x + D.range / 2, D.range / 2, D.dmg, D.kb);
        e.shots.push({ kind: 'cone', x: u.x, y: u.y, r: D.range, col: '#ffd166', life: 0.3, max: 0.3 });
        Synth.sfx('shot', { p: 67 });
        break;
      case 'pulse':
        if (boss) hitBoss(e, D.dmg);
        else hitArea(u.x + D.range / 2, D.area, D.dmg, D.kb);
        P.ring(u.x + 20, u.y, D.area * 1.6, '#ffd84a', 0.4, 6);
        P.shake(3);
        Synth.sfx('boom');
        break;
      case 'pillar':
        if (boss) hitBoss(e, D.dmg);
        else hitArea(tgt.x, D.area, D.dmg, 0);
        e.shots.push({ kind: 'pillar', x: tx, y: ty, col: '#c7b8ff', life: 0.45, max: 0.45 });
        P.shake(5);
        Synth.sfx('boom');
        break;
      default:
        break;
    }
  }

  function render(e, c) {
    // 空と地面
    const g = c.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, '#1b1530');
    g.addColorStop(0.7, '#2a2140');
    g.addColorStop(1, '#3a2b20');
    c.fillStyle = g;
    c.fillRect(0, 0, FW, FH);
    // 五線 (帯の中に薄く)
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = BAND_TOP + ((BAND_BOT - BAND_TOP) * (i + 0.5)) / 10;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(FW, y);
      c.stroke();
    }
    c.fillStyle = '#4a3726';
    c.fillRect(0, GROUND, FW, FH - GROUND);
    c.fillStyle = '#5c4430';
    for (let x = 0; x < FW; x += 48) c.fillRect(x, GROUND, 40, 6);

    // 指揮台
    c.fillStyle = '#6b4a2b';
    c.fillRect(CASTLE_X - 50, GROUND - 70, 100, 70);
    c.fillStyle = '#8b5a2b';
    c.fillRect(CASTLE_X - 56, GROUND - 76, 112, 10);
    P.drawComposer(c, e.comp, CASTLE_X, GROUND - 112, 1.3, e.time, e.skill >= 1 ? 1 : 0);
    P.hpBar(c, CASTLE_X, GROUND - 170, 90, e.hp / e.maxHp, '#ff8aa8');
    // 結界の線
    c.strokeStyle = 'rgba(255,138,168,0.35)';
    c.setLineDash([6, 8]);
    c.beginPath();
    c.moveTo(CASTLE_X + 10, BAND_TOP - 20);
    c.lineTo(CASTLE_X + 10, GROUND);
    c.stroke();
    c.setLineDash([]);

    // ボス
    const B = e.boss;
    P.drawBoss(c, B.def, B.x, B.y, 54, e.time, { shield: B.shield, hurt: B.hurt > 0, pulse: B.pulse, name: true });
    if (!B.shield) P.hpBar(c, B.x, B.y - 80, 110, B.hp / B.maxHp, '#ffd84a');

    // 音符
    for (const n of e.notes) {
      if (n.fly) {
        const fy = n.y + Math.sin(n.t * 6 + n.phase) * 4;
        const fl = Math.sin(n.t * 18 + n.phase) * 0.5;
        c.fillStyle = 'rgba(220,235,255,0.75)';
        for (const sgn of [-1, 1]) {
          c.beginPath();
          c.ellipse(n.x + 4, fy - n.r * 0.4, n.r * 1.1, n.r * 0.45, sgn * (0.6 + fl), 0, Math.PI * 2);
          c.fill();
        }
        P.drawNote(c, n, n.x, fy);
      } else P.drawNote(c, n, n.x, n.y);
    }

    // 楽団員
    for (const u of e.units) {
      const lunge = u.act > 0 ? Math.sin((u.act / 0.25) * Math.PI) * 8 : 0;
      // 影
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(u.x, u.y + 20, 16, 5, 0, 0, Math.PI * 2);
      c.fill();
      P.drawInst(c, u.def.id, u.x + lunge, u.y, u.def.id === 'cello' || u.def.id === 'organ' ? 20 : 16, { bob: u.t * 8, hurt: u.hurt > 0 });
      P.hpBar(c, u.x, u.y - 30, 30, u.hp / u.maxHp);
    }

    // 弾
    for (const s of e.shots) {
      const k = 1 - s.life / s.max;
      c.globalAlpha = 1 - k * 0.7;
      c.strokeStyle = s.col;
      c.fillStyle = s.col;
      if (s.kind === 'beam') {
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(s.tx, s.ty);
        c.stroke();
      } else if (s.kind === 'spark') {
        const x = s.x + (s.tx - s.x) * k;
        const y = s.y + (s.ty - s.y) * k + Math.sin(k * Math.PI) * s.arc;
        c.beginPath();
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fill();
      } else if (s.kind === 'swing') {
        c.lineWidth = 4;
        c.beginPath();
        c.arc(s.x, s.y, 22, -1.2 + k * 1.6, -0.2 + k * 1.6);
        c.stroke();
      } else if (s.kind === 'cone') {
        c.globalAlpha = 0.35 * (1 - k);
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.arc(s.x, s.y, s.r * (0.4 + 0.6 * k), -0.45, 0.45);
        c.closePath();
        c.fill();
      } else if (s.kind === 'pillar') {
        c.globalAlpha = 0.7 * (1 - k);
        c.fillRect(s.x - 26, 0, 52, s.y + 30);
      }
      c.globalAlpha = 1;
    }
  }

  function key(e, ev, down) {
    if (!down) return;
    const i = '1234567'.indexOf(ev.key);
    if (i >= 0) summon(e, UNITS[i]);
    if (ev.key === ' ') {
      ev.preventDefault();
      skill(e);
    }
    if (ev.key === 'w' || ev.key === 'W') upgradeWallet(e);
  }

  // 自動プレイ (難しさの確認用)
  function bot(e, dt) {
    e.botT = (e.botT || 0) - dt;
    if (e.botT > 0) return;
    e.botT = 0.25;
    if (e.skill >= 1 && e.notes.filter((n) => n.x < 520).length >= 6) skill(e);
    if (e.wallet < 5 && e.ink >= walletCost(e) && e.units.length >= 3) return upgradeWallet(e);
    const fly = e.notes.filter((n) => n.fly).length;
    const air = e.units.filter((u) => u.def.air).length;
    const wantAir = fly > (e.notes.length - fly) * 0.6 && air < e.units.length * 0.6;
    const order = e.units.length < 3 ? ['piano', 'violin'] : wantAir ? ['trumpet', 'flute', 'violin'] : ['organ', 'timpani', 'trumpet', 'cello', 'violin', 'flute', 'piano'];
    for (const id of order) {
      const u = UNITS.find((x) => x.id === id);
      if (id === 'piano' && e.units.length > 8) continue;
      if (e.ink >= u.cost && !(e.cool[id] > 0)) return summon(e, u);
    }
  }

  P.modes.lane = {
    no: '試作 1',
    title: '横スクロールの陣取り',
    desc: '楽団員を送り出し、右から来る音符とぶつける。楽団員はダメージを受けきると消える。高い音は宙を飛ぶので遠くを撃てる楽器で。インク壺の強化と大技「一振り」',
    size: [FW, FH],
    start,
    update,
    render,
    hud,
    key,
    bot,
    simExtra: (e) => `wallet ${e.wallet} units ${e.units.length}`,
    resultExtra: (e) => `<div>インク壺 Lv${e.wallet}</div>`,
  };
})();
