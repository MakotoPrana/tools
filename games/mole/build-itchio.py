#!/usr/bin/env python3
"""itch.io に載せる体験版 (第1章 STAGE 1〜10 まで) の zip を作る。

使い方 (リポジトリのどこからでも):
    python3 games/mole/build-itchio.py

games/mole/dist/mole-itchio.zip ができるので、itch.io のプロジェクトに
「HTML」の種類でアップロードし、「This file will be played in the browser」にチェックを入れる。

やっていること:
- index.html の <meta name="mole-edition"> を demo にする (STAGE 11〜30 は鍵つきで表示される)
- ゲーム一覧へ戻るリンクを外す (itch.io では行き先がないため)
- index.html・style.css・script.js を zip の一番上に入れる
- 共通のロゴアニメーション (games/origami-intro.js) と、それが使う画像 (assets/ の2つ) も入れる
"""

import re
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAMES = HERE.parent
ASSETS = GAMES.parent / 'assets'
INTRO_IMAGES = ('origami-crane.png', 'origami-works-wordmark.png')
OUT_DIR = HERE / 'dist'
OUT_ZIP = OUT_DIR / 'mole-itchio.zip'


def build_index() -> str:
    html = (HERE / 'index.html').read_text(encoding='utf-8')

    html, n = re.subn(r'<meta name="mole-edition" content="full" />', '<meta name="mole-edition" content="demo" />', html)
    if n != 1:
        raise SystemExit('index.html に <meta name="mole-edition" content="full" /> が見つかりません')

    html, n = re.subn(r'\s*<a class="back"[^>]*>.*?</a>', '', html)
    if n != 1:
        raise SystemExit('index.html にゲーム一覧へ戻るリンクが見つかりません')

    # zip の中ではロゴアニメーションを同じ階層に、画像を assets/ に置く
    html, n = re.subn(r'<script src="\.\./origami-intro\.js"></script>', '<script src="origami-intro.js" data-assets="assets/"></script>', html)
    if n != 1:
        raise SystemExit('index.html に ../origami-intro.js の読み込みが見つかりません')

    return html


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('index.html', build_index())
        for name in ('style.css', 'script.js'):
            z.write(HERE / name, name)
        z.write(GAMES / 'origami-intro.js', 'origami-intro.js')
        for name in INTRO_IMAGES:
            z.write(ASSETS / name, f'assets/{name}')
    print(f'作成しました: {OUT_ZIP}')


if __name__ == '__main__':
    main()
