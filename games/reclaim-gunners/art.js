/*
 * 武器の絵 (22 種類)。Canvas にコードで描く
 *   RG.drawWeapon(g, id): 銃口が右 (+x)、にぎる所が原点 (0, 0) になるように描く。長い銃でおよそ 30 の長さ
 *   RG.weaponIcon(id): 装備画面・お店で使う絵 (画像の URL)。一度作ったら使い回す
 */
window.RG = window.RG || {};

(() => {
  'use strict';
  const TAU = Math.PI * 2;

  // 金属などの、上が明るく下が暗い塗り
  const lin = (g, y0, y1, c0, c1, c2) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c0);
    gr.addColorStop(c2 ? 0.5 : 1, c1);
    if (c2) gr.addColorStop(1, c2);
    return gr;
  };
  const rect = (g, x, y, w, h, fill, r = 0) => {
    g.fillStyle = fill;
    if (!r) {
      g.fillRect(x, y, w, h);
      return;
    }
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  };
  const poly = (g, pts, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  };
  const dot = (g, x, y, r, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  const glow = (g, x, y, r, color) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  const STEEL = (g, y0, y1) => lin(g, y0, y1, '#b8bcc4', '#5a5e68', '#2a2c32');
  const DARK = (g, y0, y1) => lin(g, y0, y1, '#5a5a62', '#2a2a30', '#141418');
  const WOOD = (g, y0, y1) => lin(g, y0, y1, '#a8743e', '#6a4220', '#3e2410');
  const GOLD = (g, y0, y1) => lin(g, y0, y1, '#fff0a8', '#d8a040', '#7a4a10');
  const SILVER = (g, y0, y1) => lin(g, y0, y1, '#ffffff', '#c8ccd8', '#7a7e8c');

  // にぎり (木か黒い樹脂)
  const grip = (g, fill, x = -3, y = 0, w = 5, h = 8, lean = 2.5) => poly(g, [[x, y], [x + w, y], [x + w - lean, y + h], [x - lean, y + h]], fill);

  const DRAW = {
    // リボルバー ルーキー: 回転弾倉と木のにぎり
    A1(g) {
      rect(g, 2, -3.2, 15, 2.6, STEEL(g, -3.2, -0.6), 0.8);
      rect(g, -2, -3.4, 7, 4.6, DARK(g, -3.4, 1.2), 1.2);
      dot(g, 3.4, -1.1, 2.6, STEEL(g, -3.6, 1.4));
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (const a of [0, 1.2, 2.4, 3.6, 4.8]) g.fillRect(3.4 + Math.cos(a) * 1.4 - 0.4, -1.1 + Math.sin(a) * 1.4 - 0.4, 0.8, 0.8);
      grip(g, WOOD(g, 0, 8), -3, 1, 4.6, 7.5, 3);
      rect(g, 15.5, -4.4, 1.2, 1.4, '#2a2a30');
    },
    // サブマシンガン ホーネット: 箱型の本体と長い弾倉
    A2(g) {
      rect(g, -4, -3.6, 18, 4.6, DARK(g, -3.6, 1), 1);
      rect(g, 13, -2.6, 6, 2, STEEL(g, -2.6, -0.6));
      rect(g, 4, 1, 3, 9, lin(g, 1, 10, '#3a3a42', '#1a1a20'), 0.6);
      grip(g, '#22222a', -2, 1, 4, 6, 1.5);
      rect(g, -10, -2.6, 6, 2.2, '#2a2a30', 0.6);
      rect(g, 0, -5, 8, 1.4, '#ffc840');
    },
    // 二丁拳銃 ツインファング: 銀と黒の 2 丁が重なる
    A3(g) {
      g.save();
      g.translate(1.5, 2.5);
      rect(g, -2, -3, 15, 3.6, DARK(g, -3, 0.6), 0.8);
      grip(g, '#1a1a20', -2, 0.6, 4.2, 6.5, 2);
      g.restore();
      rect(g, -2, -4, 16, 3.6, SILVER(g, -4, -0.4), 0.8);
      rect(g, 3, -4.8, 9, 1, '#e8eaf2');
      grip(g, lin(g, 0, 7, '#c8a070', '#6a4220'), -2, -0.4, 4.2, 6.5, 2);
      dot(g, 12.5, -2.2, 0.8, '#ff4040');
    },
    // 聖銀銃 エクソシスト: 銀の本体に金の十字
    A4(g) {
      glow(g, 6, -2, 10, 'rgba(255,240,160,0.45)');
      rect(g, -2, -4, 19, 4, SILVER(g, -4, 0), 1);
      rect(g, 17, -3.2, 2.5, 2.4, GOLD(g, -3.2, -0.8));
      rect(g, 5.2, -6, 1.6, 6.5, GOLD(g, -6, 0.5));
      rect(g, 3.6, -4.6, 4.8, 1.4, GOLD(g, -4.6, -3.2));
      grip(g, lin(g, 0, 8, '#f4f0e8', '#a8a090'), -2, 0, 4.8, 7.5, 2.5);
      dot(g, -0.5, 4, 0.9, '#d8a040');
    },
    // 狩猟用ポンプ: 長い銃身・下の筒・木のポンプと台尻
    B1(g) {
      rect(g, -12, -2.4, 10, 4.2, WOOD(g, -2.4, 1.8), 1.4);
      rect(g, -3, -3.2, 9, 4.4, DARK(g, -3.2, 1.2), 0.8);
      rect(g, 6, -3, 20, 2, STEEL(g, -3, -1));
      rect(g, 6, -0.9, 16, 1.6, '#3a3a42');
      rect(g, 10, -1.6, 7, 3, WOOD(g, -1.6, 1.4), 1);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 0.4;
      for (let x = 11; x < 17; x += 1.4) {
        g.beginPath();
        g.moveTo(x, -1.4);
        g.lineTo(x, 1.2);
        g.stroke();
      }
    },
    // ソードオフ ブルドッグ: 短い二連の銃身
    B2(g) {
      grip(g, WOOD(g, 0, 7), -4, -0.5, 6, 7, 3);
      rect(g, -2, -3.6, 6, 4, DARK(g, -3.6, 0.4), 1);
      rect(g, 4, -3.8, 11, 2, STEEL(g, -3.8, -1.8));
      rect(g, 4, -1.7, 11, 2, STEEL(g, -1.7, 0.3));
      rect(g, 4, -2.2, 6, 3, WOOD(g, -2.2, 0.8), 0.8);
      dot(g, 15, -2.8, 0.8, '#111');
      dot(g, 15, -0.7, 0.8, '#111');
    },
    // フレシェット ヤマアラシ: 角ばった本体と円い弾倉
    B3(g) {
      rect(g, -10, -2.4, 8, 3.6, '#2a2a32', 1);
      poly(g, [[-3, -4], [10, -4], [12, -1], [10, 1.5], [-3, 1.5]], DARK(g, -4, 1.5));
      rect(g, 10, -3, 15, 2.2, STEEL(g, -3, -0.8));
      dot(g, 4, 3, 3.4, lin(g, 0, 6, '#6a6a76', '#2a2a32'));
      dot(g, 4, 3, 1.2, '#c8ccd8');
      g.strokeStyle = '#a8e0ff';
      g.lineWidth = 0.6;
      for (const x of [14, 17, 20, 23]) {
        g.beginPath();
        g.moveTo(x, -3.4);
        g.lineTo(x + 1, -4.4);
        g.stroke();
      }
    },
    // 竜息砲 ドラゴンブレス: 銃口が竜の頭
    B4(g) {
      rect(g, -11, -2.4, 9, 4, lin(g, -2.4, 1.6, '#7a2a1a', '#3a0e08'), 1.4);
      rect(g, -3, -3.4, 12, 4.6, lin(g, -3.4, 1.2, '#5a1a12', '#2a0806'), 1);
      rect(g, 8, -2.8, 12, 2.6, GOLD(g, -2.8, -0.2));
      poly(g, [[19, -4.6], [26, -3.4], [28, -1.6], [26, 0.6], [19, 1.6], [21, -1.4]], lin(g, -4.6, 1.6, '#e8b050', '#8a3a10'));
      poly(g, [[20, -4.4], [18, -7], [22, -4.6]], '#d8a040');
      dot(g, 23.5, -2.4, 0.9, '#ff3a1a');
      glow(g, 28, -1.4, 5, 'rgba(255,140,40,0.7)');
    },
    // 手回しガトリング: 束ねた銃身と、横の取っ手
    C1(g) {
      rect(g, -8, -4, 12, 7, DARK(g, -4, 3), 1.6);
      for (const y of [-3.6, -1.6, 0.4]) rect(g, 4, y, 18, 1.6, STEEL(g, y, y + 1.6));
      rect(g, 20, -4.2, 2, 6.2, '#2a2a30');
      rect(g, 6, -4.4, 2, 6.6, '#3a3a42');
      rect(g, -6, 3, 2, 5, '#4a3020');
      rect(g, -9, 7, 6, 1.6, '#6a4220', 0.6);
      grip(g, WOOD(g, 0, 7), -11, -1, 4, 6, 2);
    },
    // グレネード ポムポム: 太い筒と回転弾倉
    C2(g) {
      grip(g, '#2a2a30', -4, 0, 5, 7, 2);
      rect(g, -10, -2, 7, 3.4, '#3a3a42', 1);
      dot(g, 3, -1, 5, lin(g, -6, 4, '#7a7e6a', '#3a3e2e'));
      g.fillStyle = '#1a1c14';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.beginPath();
        g.arc(3 + Math.cos(a) * 2.8, -1 + Math.sin(a) * 2.8, 1, 0, TAU);
        g.fill();
      }
      rect(g, 7, -4.2, 13, 6.4, lin(g, -4.2, 2.2, '#8a8e76', '#4a4e3a', '#2a2c20'), 1.6);
      rect(g, 19, -4.6, 2, 7.2, '#2a2c20');
    },
    // 火炎放射器 サラマンダー: 背中のタンクと、細いノズル
    C3(g) {
      rect(g, -12, -6, 7, 12, lin(g, -6, 6, '#ff8a3a', '#c04010', '#6a1a08'), 3);
      rect(g, -11, -4, 5, 1.4, 'rgba(255,230,180,0.5)');
      g.strokeStyle = '#2a2a30';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-6, 3);
      g.quadraticCurveTo(-2, 8, 2, 1);
      g.stroke();
      rect(g, -1, -3, 14, 3.6, DARK(g, -3, 0.6), 1);
      rect(g, 13, -2.2, 10, 2, STEEL(g, -2.2, -0.2));
      rect(g, 22, -2.8, 2.4, 3.2, '#3a3a42');
      glow(g, 25, -1.2, 4, 'rgba(120,180,255,0.8)');
    },
    // 魔導ロケット 流星: ルーンの光る筒と、先の弾頭
    C4(g) {
      rect(g, -10, -4.4, 30, 6.6, lin(g, -4.4, 2.2, '#4a3a6a', '#2a1e42', '#140c22'), 2);
      g.fillStyle = '#c88aff';
      for (const x of [-6, 0, 6, 12]) g.fillRect(x, -2, 2.4, 1);
      poly(g, [[20, -3.6], [26, -1.1], [20, 1.4]], lin(g, -3.6, 1.4, '#ffd070', '#c06020'));
      rect(g, -2, 2, 3, 5, '#2a2a30');
      glow(g, 4, -1, 9, 'rgba(180,120,255,0.35)');
    },
    // 狩猟弓: 木の弓と弦 (上下に長い)
    D1(g) {
      g.strokeStyle = WOOD(g, -13, 13);
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-1, -13);
      g.quadraticCurveTo(9, 0, -1, 13);
      g.stroke();
      g.strokeStyle = '#e8e0c8';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(-1, -13);
      g.lineTo(-1, 13);
      g.stroke();
      rect(g, 2.4, -1.5, 3, 3, '#4a2e14');
      rect(g, -1, -0.5, 16, 1, '#c8a070');
      poly(g, [[15, -1.6], [19, 0], [15, 1.6]], STEEL(g, -1.6, 1.6));
    },
    // マークスマン ホークアイ: 長い銃身・スコープ・台尻
    D2(g) {
      poly(g, [[-14, -2], [-4, -3], [-4, 2], [-12, 3]], WOOD(g, -3, 3));
      rect(g, -4, -3, 12, 4, DARK(g, -3, 1), 1);
      rect(g, 8, -2.4, 22, 1.6, STEEL(g, -2.4, -0.8));
      rect(g, -1, -6.4, 11, 2.6, lin(g, -6.4, -3.8, '#4a4a52', '#141418'), 1.2);
      dot(g, 9.8, -5.1, 1.2, 'rgba(140,200,255,0.9)');
      rect(g, 2, 1, 2.4, 4, '#2a2a30');
      rect(g, 28, -3, 2, 2.6, '#2a2a30');
    },
    // クロスボウ ヴァンパイアキラー: 横の弓と、赤い矢
    D3(g) {
      poly(g, [[-12, -1.6], [6, -2.4], [6, 1.6], [-10, 2.6]], lin(g, -2.4, 2.6, '#5a1a1a', '#2a0808'));
      g.strokeStyle = lin(g, -12, 12, '#2a2a30', '#6a6a76');
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(9, -12);
      g.quadraticCurveTo(13, 0, 9, 12);
      g.stroke();
      g.strokeStyle = '#d8d0c0';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(9, -12);
      g.lineTo(2, 0);
      g.lineTo(9, 12);
      g.stroke();
      rect(g, 2, -0.6, 18, 1.2, '#a82a2a');
      poly(g, [[20, -1.8], [24, 0], [20, 1.8]], SILVER(g, -1.8, 1.8));
      rect(g, -3, 1.6, 3, 4, '#2a1010');
    },
    // 対魔ライフル ロンギヌス: とても長い銃身と金の飾り
    D4(g) {
      glow(g, 14, -2, 14, 'rgba(255,240,170,0.3)');
      poly(g, [[-16, -2.4], [-5, -3.4], [-5, 2.4], [-14, 3.6]], lin(g, -3.4, 3.6, '#f4f0e4', '#a89c80'));
      rect(g, -5, -3.6, 14, 5, SILVER(g, -3.6, 1.4), 1.2);
      rect(g, 9, -2.6, 26, 2, SILVER(g, -2.6, -0.6));
      rect(g, 33, -3.6, 3, 4, GOLD(g, -3.6, 0.4));
      rect(g, -2, -7.2, 13, 3, GOLD(g, -7.2, -4.2), 1.4);
      dot(g, 11, -5.7, 1.4, 'rgba(255,250,200,0.95)');
      rect(g, 0, -1.6, 7, 1, '#d8a040');
      rect(g, 2, 1.4, 2.6, 4.4, '#7a7e8c');
    },
    // 見習いの火杖: 木の杖の先に燃える赤い玉
    E1(g) {
      g.strokeStyle = WOOD(g, -2, 2);
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-10, 1);
      g.lineTo(18, -1);
      g.stroke();
      g.strokeStyle = '#6a4220';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(18, -1);
      g.quadraticCurveTo(22, -6, 24, -1);
      g.quadraticCurveTo(22, 4, 18, -1);
      g.stroke();
      glow(g, 21.5, -1, 8, 'rgba(255,120,40,0.8)');
      dot(g, 21.5, -1, 2.6, lin(g, -3.6, 1.6, '#fff0a0', '#ff5a1a'));
    },
    // 氷の魔導書 ニヴル: 青い本と氷の結晶
    E2(g) {
      g.save();
      g.rotate(-0.25);
      rect(g, -2, -7, 14, 11, lin(g, -7, 4, '#4a8ac0', '#1a3a6a'), 1.4);
      rect(g, -2, -7, 2.4, 11, '#0e2240');
      rect(g, 11, -6.4, 1.6, 10, '#e8f0f8');
      g.strokeStyle = '#d8f4ff';
      g.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        g.beginPath();
        g.moveTo(5.5 - Math.cos(a) * 3.4, -1.5 - Math.sin(a) * 3.4);
        g.lineTo(5.5 + Math.cos(a) * 3.4, -1.5 + Math.sin(a) * 3.4);
        g.stroke();
      }
      g.restore();
      glow(g, 6, -2, 9, 'rgba(160,220,255,0.45)');
    },
    // 雷杖 トール: 鉄の杖の先に、二股の雷の飾り
    E3(g) {
      rect(g, -10, -1.2, 26, 2.4, STEEL(g, -1.2, 1.2), 1);
      rect(g, -4, -1.8, 3, 3.6, '#7a5a2a');
      g.strokeStyle = '#ffe45c';
      g.lineWidth = 1.6;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(16, 0);
      g.lineTo(19, -4);
      g.lineTo(18, -1);
      g.lineTo(23, -6);
      g.moveTo(16, 0);
      g.lineTo(19, 4);
      g.lineTo(18, 1);
      g.lineTo(23, 6);
      g.stroke();
      glow(g, 20, 0, 9, 'rgba(255,230,90,0.55)');
    },
    // 聖光杖 サンクタム: 白と金の杖と、光の輪
    E4(g) {
      rect(g, -10, -1.1, 26, 2.2, lin(g, -1.1, 1.1, '#ffffff', '#c8c0a8'), 1);
      rect(g, -2, -1.6, 2.4, 3.2, GOLD(g, -1.6, 1.6));
      glow(g, 20, 0, 11, 'rgba(255,245,190,0.6)');
      g.strokeStyle = GOLD(g, -5, 5);
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(20, 0, 4.4, 0, TAU);
      g.stroke();
      dot(g, 20, 0, 1.8, '#fffbe0');
      rect(g, 15.5, -0.6, 1, 1.2, '#d8a040');
    },
    // 魔銃 ベルゼバブ: 紫黒の本体に、目と角
    S1(g) {
      glow(g, 6, -1, 12, 'rgba(160,40,200,0.45)');
      poly(g, [[-3, -4.4], [16, -4], [19, -2], [16, 0.6], [-3, 1]], lin(g, -4.4, 1, '#5a2a6a', '#24102e', '#0e0614'));
      rect(g, 16, -3.2, 5, 2.4, '#3a1a46');
      poly(g, [[2, -4.4], [4, -8], [6, -4.4]], '#c8a0d8');
      poly(g, [[9, -4.2], [11, -7.4], [13, -4.2]], '#c8a0d8');
      dot(g, 8, -1.8, 1.8, '#ffe45c');
      dot(g, 8, -1.8, 0.8, '#1a0a10');
      grip(g, lin(g, 0, 8, '#3a1a46', '#140818'), -3, 1, 5, 7.5, 2.5);
    },
    // 星喰いの魔典: 夜空のような本と、まわりの星
    S2(g) {
      glow(g, 5, -1, 13, 'rgba(120,140,255,0.4)');
      g.save();
      g.rotate(-0.25);
      rect(g, -2, -7, 14, 11, lin(g, -7, 4, '#2a1e5a', '#0e0a24'), 1.4);
      rect(g, -2, -7, 2.4, 11, '#d8a040');
      g.fillStyle = '#fff6c0';
      for (const [x, y] of [[4, -4], [8, -2], [6, 1], [9.5, -5]]) g.fillRect(x, y, 1.1, 1.1);
      g.restore();
      for (const [x, y] of [[16, -6], [18, 3], [-6, -6]]) dot(g, x, y, 1.1, '#e8f0ff');
    },
  };

  RG.drawWeapon = (g, id) => {
    const fn = DRAW[id] || DRAW.A1;
    g.save();
    fn(g);
    g.restore();
  };

  // 武器の大きさ (アイコンを作るときに、絵が枠に収まるように)
  const BOUNDS = { D1: [-4, -14, 24, 28], D3: [-13, -13, 38, 26], E2: [-4, -10, 20, 18], S2: [-8, -10, 28, 18] };
  const icons = {};
  RG.weaponIcon = (id) => {
    if (icons[id]) return icons[id];
    const W = 120;
    const H = 60;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const [bx, by, bw, bh] = BOUNDS[id] || [-16, -9, 54, 20];
    const s = Math.min((W - 10) / bw, (H - 10) / bh);
    g.translate(W / 2 - (bx + bw / 2) * s, H / 2 - (by + bh / 2) * s);
    g.scale(s, s);
    // 下に落ちるやわらかい影
    g.shadowColor = 'rgba(0,0,0,0.65)';
    g.shadowBlur = 3;
    g.shadowOffsetY = 2;
    RG.drawWeapon(g, id);
    icons[id] = c.toDataURL();
    return icons[id];
  };
})();
