// 公開用リポジトリ (tools-pub) に置くゲームを、ゲームごとに Vite でビルドして難読化する。
//
// 使い方:
//   node scripts/build-pub.mjs                      … games/ の全ゲームを dist/pub/ に作る
//   node scripts/build-pub.mjs mole bowling         … 指定したゲームだけ作る
//   node scripts/build-pub.mjs --out ../tools-pub mole
//                                                   … 出力先を変える (GitHub Actions は tools-pub のチェックアウト先を指定する)
//
// 出力は元と同じ並び (<出力先>/games/<ゲーム>/) にするので、index.html の ../origami-intro.js や
// ../../assets/ への参照はそのまま動く。指定したゲームのフォルダは作り直し、元のフォルダが
// もう無いゲームは出力先からも消す。共通のロゴアニメーション (games/origami-intro.js) と
// assets/ は毎回一緒に出す。
//
// やっていること (ゲームごと):
// - Vite で index.html をビルドする (type="module" のスクリプトと CSS はまとめて圧縮される)
// - type="module" でない <script src> は Vite がまとめないので、そのままの場所にコピーする
// - JS から文字列で参照している画像など (assets/worldmap.jpg など) のため、コード以外のファイルもコピーする
// - 出力した .js をすべて javascript-obfuscator で難読化する
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { build, createLogger } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = path.join(ROOT, 'games');

// 公開しないファイルとフォルダ
const SKIP_DIRS = new Set(['promo', 'dist', 'node_modules']);
const SKIP_EXTS = new Set(['.md', '.py']);
// Vite が扱うので、そのままコピーしないもの
const CODE_EXTS = new Set(['.js', '.mjs', '.css', '.html']);

// ゲームは毎フレーム動くので、重くなる変換 (制御フローの平坦化・ダミーコードの挿入) は使わない。
// type="module" でないスクリプト同士はグローバル変数を共有しているので、グローバルの名前は変えない
// type="module" でないスクリプトは自分でコピーするので、Vite のその警告は出さない
const logger = createLogger('warn');
const warn = logger.warn;
logger.warn = (msg, opts) => {
  if (!msg.includes('can\'t be bundled without type="module"')) warn(msg, opts);
};

const OBFUSCATOR_OPTIONS = {
  compact: true,
  target: 'browser',
  renameGlobals: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  identifierNamesGenerator: 'hexadecimal',
};

function parseArgs(argv) {
  let out = path.join(ROOT, 'dist', 'pub');
  const games = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = path.resolve(argv[++i]);
    else games.push(argv[i]);
  }
  return { out, games };
}

async function listGames() {
  const entries = await readdir(GAMES, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && existsSync(path.join(GAMES, e.name, 'index.html')))
    .map((e) => e.name)
    .sort();
}

async function walk(dir) {
  const files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) files.push(...(await walk(p)));
    } else {
      files.push(p);
    }
  }
  return files;
}

// index.html の type="module" でない <script src="..."> のうち、ゲームのフォルダの中のもの
function classicScripts(html) {
  const srcs = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1];
    if (/\btype\s*=\s*["']?module/i.test(attrs)) continue;
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || /^([a-z]+:)?\/\//i.test(src) || src.startsWith('/') || src.startsWith('..')) continue;
    srcs.push(src.split(/[?#]/)[0]);
  }
  return srcs;
}

async function obfuscateFile(file, sourceType) {
  const code = await readFile(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, { ...OBFUSCATOR_OPTIONS, sourceType });
  await writeFile(file, result.getObfuscatedCode());
}

async function buildGame(game, outGames) {
  const src = path.join(GAMES, game);
  const out = path.join(outGames, game);
  await rm(out, { recursive: true, force: true });
  if (!existsSync(path.join(src, 'index.html'))) {
    console.log(`- ${game}: 元のフォルダが無いので出力先から消しました`);
    return;
  }

  await build({
    root: src,
    base: './',
    configFile: false,
    logLevel: 'warn',
    customLogger: logger,
    build: {
      outDir: out,
      emptyOutDir: true,
      // ゲームのフォルダに assets/ があっても混ざらないよう、Vite の出力は別の名前のフォルダに置く
      assetsDir: '_build',
      modulePreload: { polyfill: false },
    },
  });

  // Vite が生成した JS は ES モジュール、それ以外は普通のスクリプト
  const moduleFiles = new Set(
    (await walk(path.join(out, '_build')).catch(() => [])).filter((f) => f.endsWith('.js')),
  );

  const html = await readFile(path.join(src, 'index.html'), 'utf8');
  const classic = classicScripts(html);
  for (const rel of classic) {
    await mkdir(path.dirname(path.join(out, rel)), { recursive: true });
    await cp(path.join(src, rel), path.join(out, rel));
  }

  for (const file of await walk(src)) {
    const ext = path.extname(file);
    if (CODE_EXTS.has(ext) || SKIP_EXTS.has(ext)) continue;
    const dest = path.join(out, path.relative(src, file));
    await mkdir(path.dirname(dest), { recursive: true });
    await cp(file, dest);
  }

  for (const file of moduleFiles) await obfuscateFile(file, 'module');
  for (const rel of classic) await obfuscateFile(path.join(out, rel), 'script');
  console.log(`- ${game}: ビルドしました (モジュール ${moduleFiles.size} 個, スクリプト ${classic.length} 個)`);
}

async function buildShared(out) {
  const intro = path.join(out, 'games', 'origami-intro.js');
  await mkdir(path.dirname(intro), { recursive: true });
  await cp(path.join(GAMES, 'origami-intro.js'), intro);
  await obfuscateFile(intro, 'script');
  await rm(path.join(out, 'assets'), { recursive: true, force: true });
  await cp(path.join(ROOT, 'assets'), path.join(out, 'assets'), { recursive: true });
}

async function main() {
  const { out, games: requested } = parseArgs(process.argv.slice(2));
  const games = requested.length ? requested : await listGames();
  console.log(`出力先: ${out}`);
  for (const game of games) await buildGame(game, path.join(out, 'games'));
  await buildShared(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
