// おそうじサバイバーの CrazyGames 用カバー画像 (横 1920x1080・縦 800x1200・正方形 800x800) を作る。
// ゲームを実際に動かした画面を背景に、ロゴと清掃員・ゴミを大きく描く。
// 使い方 (Playwright が必要): node scripts/crazygames_covers.js [背景にするステージの番号 (0〜9)]
// できるもの: games/cleaning-survivors/promo/cover-*.png
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'games/cleaning-survivors/promo');
const STAGE = process.argv[2] || '2';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== 't.local') return r.abort(); const f = path.join(ROOT, u.pathname); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f); if (f.endsWith('index.html')) body = body.toString().replace('<head>', '<head><meta name="cs-test-unlock" content="1">');
    r.fulfill({ body, contentType: f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html' }); });
  await p.addInitScript(() => { localStorage.setItem('cleaning-survivors-lang', 'en'); localStorage.setItem('cleaning-survivors-save', JSON.stringify({ v: 2, coins: 0, tutorialSeen: true, tutorialDone: true, settings: { se: 0, bgm: 0, shake: false, haze: false } })); });
  await p.goto('http://t.local/games/cleaning-survivors/index.html'); await p.waitForTimeout(4500);
  const ev = (f, a) => p.evaluate(f, a);
  const click = (s) => ev((s) => { const o = document.getElementById('overlay'); o.classList.remove('locked'); const e = o.querySelector(s); if (e) e.click(); }, s);
  await click('[data-act="play"]'); await click('[data-act="charGo"]'); await p.waitForTimeout(100);
  await click('[data-act="brief"][data-arg="' + STAGE + '"]'); await click('[data-act="start"]:not([data-arg])'); await p.waitForTimeout(300);
  await ev(() => { const cs = window.__cs; cs.G.p.hp = cs.G.p.maxHp = 99999; cs.give('vacuum', 8, true); cs.give('washer', 8, false); cs.give('robot', 8, true); cs.give('spray', 6); cs.give('bomb', 6); });
  // 動きながら 40 秒ぶん進める (レベルアップの画面は自動で1枚目を選ぶ)
  for (let k = 0; k < 40; k++) {
    await ev(() => { const cs = window.__cs, G = cs.G; G.p.hp = G.p.maxHp; for (let i = 0; i < 30; i++) cs.step(1 / 30); });
    await click('[data-act="choose"]'); await click('[data-act="treasureOk"]'); await click('[data-act="chestOk"]');
  }
  await p.waitForTimeout(100);
  const shot = (await p.screenshot({ type: 'jpeg', quality: 90 })).toString('base64');
  const art = await ev(() => ({ hero: window.__cs.art('char', 'cleaner', 900), mizuki: window.__cs.art('char', 'mizuki', 500), tsugumi: window.__cs.art('char', 'tsugumi', 500),
    en: ['paper', 'can', 'grease', 'spore', 'bag', 'dust', 'yokai'].map((k) => window.__cs.art('enemy', k, 400)) }));
  const SIZES = [['landscape', 1920, 1080], ['portrait', 800, 1200], ['square', 800, 800]];
  for (const [name, w, h] of SIZES) {
    const q = await b.newPage({ viewport: { width: w, height: h } });
    const land = w > h, u = Math.min(w, h) / 100; // 短い辺の 1%
    const en = (i, x, y, s, r) => `<img src="${art.en[i]}" style="position:absolute;left:${x}%;top:${y}%;width:${s * u}px;transform:translate(-50%,-50%) rotate(${r}deg);filter:drop-shadow(0 ${u * 0.6}px ${u}px rgba(0,0,0,.5))">`;
    const port = h > w;
    // hero: [x%, y%, 大きさ], side: [x%, y%, 大きさ, 左右反転]
    const layout = land
      ? { title: 'left:4%;top:12%;width:52%;text-align:left', kicker: 3.2, logo: 15, hero: [70, 57, 60], side: [[93, 84, 30, true]], ens: [[0, 52, 30, 14, -12], [1, 92, 18, 12, 20], [2, 55, 88, 16, 0], [3, 96, 52, 13, 0], [4, 80, 95, 15, 8], [5, 50, 56, 9, 0], [6, 28, 80, 28, -6]] }
      : port
        ? { title: 'left:4%;top:6%;width:92%;text-align:center', kicker: 3.6, logo: 13.5, hero: [47, 66, 76], side: [[18, 88, 34, false]], ens: [[0, 12, 44, 16, -12], [1, 88, 42, 14, 20], [2, 86, 66, 16, 0], [3, 14, 64, 15, 0], [4, 84, 93, 17, 8], [5, 30, 50, 10, 0], [6, 74, 50, 18, -6]] }
        : { title: 'left:4%;top:5%;width:92%;text-align:center', kicker: 3.4, logo: 12, hero: [56, 70, 58], side: [[19, 82, 32, false]], ens: [[0, 10, 50, 15, -12], [1, 90, 46, 13, 20], [2, 90, 70, 15, 0], [3, 30, 52, 12, 0], [4, 86, 93, 15, 8], [5, 76, 50, 9, 0], [6, 46, 95, 15, -6]] };
    const html = `<!doctype html><html><head><style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');
      body{margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;font-family:Inter,system-ui,sans-serif;background:#121820}
      .bg{position:absolute;inset:-4%;background:url(data:image/jpeg;base64,${shot}) center/cover;filter:blur(${u * 0.5}px) brightness(.72) saturate(1.15)}
      .shade{position:absolute;inset:0;background:${land ? 'linear-gradient(90deg,rgba(10,14,20,.88) 0%,rgba(10,14,20,.55) 45%,rgba(10,14,20,0) 70%)' : 'linear-gradient(180deg,rgba(10,14,20,.9) 0%,rgba(10,14,20,.5) 30%,rgba(10,14,20,0) 55%)'},radial-gradient(circle at ${layout.hero[0]}% ${layout.hero[1]}%,rgba(79,224,182,.35),transparent ${land ? 30 : 42}%)}
      .t{position:absolute;${layout.title};color:#fff}
      .k{font-size:${layout.kicker * u}px;letter-spacing:.3em;white-space:nowrap;color:#4fe0b6;font-weight:900;margin:0 0 ${u}px}
      .l{font-size:${layout.logo * u}px;line-height:.98;font-weight:900;margin:0;text-shadow:0 ${u * 0.9}px 0 #1d8e6f,0 0 ${u * 4}px rgba(79,224,182,.6);letter-spacing:.01em}
      img{position:absolute}
    </style></head><body><div class="bg"></div><div class="shade"></div>
      ${layout.ens.map(([i, x, y, s, r]) => en(i, x, y, s, r)).join('')}
      ${layout.side.map(([x, y, s, flip]) => `<img src="${art.mizuki}" style="left:${x}%;top:${y}%;width:${s * u}px;transform:translate(-50%,-50%)${flip ? ' scaleX(-1)' : ''};filter:drop-shadow(0 ${u}px ${u * 1.5}px rgba(0,0,0,.6))">`).join('')}
      <img src="${art.hero}" style="left:${layout.hero[0]}%;top:${layout.hero[1]}%;width:${layout.hero[2] * u}px;transform:translate(-50%,-50%);filter:drop-shadow(0 ${u * 1.5}px ${u * 2}px rgba(0,0,0,.6))">
      <div class="t"><p class="k">SCRUB · SWEEP · SURVIVE</p><p class="l">CLEANING<br>SURVIVORS</p></div>
    </body></html>`;
    await q.setContent(html); await q.waitForTimeout(1500);
    await q.screenshot({ path: path.join(OUT, `cover-${name}-${w}x${h}.png` ) });
    await q.close();
  }
  await b.close(); console.log('ok');
})();
