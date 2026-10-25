"""CrazyGames にアップロードする zip を作る。

CrazyGames にはゲームのフォルダ (games/<ゲーム>/) だけを上げるので、フォルダの外にある
共通のロゴアニメーション (games/origami-intro.js) と画像 (assets/) が見つからない。
このスクリプトはそれらをフォルダの中にコピーし、index.html の参照を書き換えて zip にする。

使い方 (リポジトリのどこからでも):
    python scripts/package_crazygames.py cleaning-survivors
できるもの: dist/<ゲーム>-crazygames.zip (この中身をそのまま CrazyGames に上げる)
"""
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# アップロードに入れないファイル
SKIP = {'SPEC.md'}
# assets/ からコピーする画像 (ロゴアニメーションとアイコン)
ASSETS = ['origami-crane.png', 'origami-works-wordmark.png', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png']


def main():
    if len(sys.argv) != 2:
        sys.exit('使い方: python scripts/package_crazygames.py <ゲームのフォルダ名>')
    game = sys.argv[1]
    src = ROOT / 'games' / game
    if not (src / 'index.html').is_file():
        sys.exit(f'見つかりません: {src / "index.html"}')

    out = ROOT / 'dist' / f'{game}-crazygames'
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(src, out, ignore=lambda d, names: [n for n in names if n in SKIP])

    shutil.copy2(ROOT / 'games' / 'origami-intro.js', out / 'origami-intro.js')
    (out / 'assets').mkdir()
    for name in ASSETS:
        shutil.copy2(ROOT / 'assets' / name, out / 'assets' / name)

    index = out / 'index.html'
    html = index.read_text(encoding='utf-8')
    replaces = [
        ('<script src="../origami-intro.js"></script>', '<script src="origami-intro.js" data-assets="assets/"></script>'),
        ('href="../../assets/', 'href="assets/'),
    ]
    for old, new in replaces:
        if old not in html:
            sys.exit(f'index.html に見つかりません: {old}')
        html = html.replace(old, new)
    # 書き換えもれ (フォルダの外を指す参照) があれば止める。ゲーム一覧へのリンク (href="../") は CrazyGames では出さないので残す
    leftover = [line.strip() for line in html.splitlines() if ('src="../' in line or 'href="../' in line) and 'href="../"' not in line]
    if leftover:
        sys.exit('フォルダの外を指す参照が残っています:\n' + '\n'.join(leftover))
    index.write_text(html, encoding='utf-8', newline='')

    zip_path = out.with_suffix('.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(out).as_posix())
    print(f'作成しました: {zip_path}')


if __name__ == '__main__':
    main()
