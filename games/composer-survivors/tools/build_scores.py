#!/usr/bin/env python3
"""
Mutopia Project の LilyPond の譜面から、ゲームの譜面 (scores/*.js) を作る。

  python3 -I build_scores.py <MutopiaProject の ftp フォルダ>

元の譜面: https://github.com/MutopiaProject/MutopiaProject (ftp/ 以下)
  - エリーゼのために: ftp/BeethovenLv/WoO59/fur_Elise_WoO59 (Public Domain, Stelios Samelis)
  - ノクターン Op.9-2: ftp/ChopinFF/O9/chopin_nocturne_op9_n2 (CC BY-SA 3.0, Renato Biolcati Rinaldi)
  - きらきら星変奏曲 K.265: ftp/MozartWA/KV265/guitar-duo-complete (Public Domain。ギター二重奏の版。
    音は Mozart の原曲どおり (原調) で、ギターで出ない低音だけが変えてある。繰り返しは省かれているので、ここで元の形に戻す)
LilyPond は実行せず、ly2score.py で文字として読む。
"""
import json
import os
import re
import sys
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ly2score as L  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'scores')


def load(path):
    L.LANG['name'] = 'nederlands'
    src = L.strip_comments(open(path, encoding='utf-8').read())
    lm = re.search(r'\\language\s+"(\w+)"', src)
    if lm:
        L.LANG['name'] = lm.group(1)
    if re.search(r'\\include\s+"english\.ly"', src):
        L.LANG['name'] = 'english'
    return src, L.read_variables(src)


def parse(text, variables):
    L.MARKERS.clear()
    notes, end = L.parse_music(L.tokenize(text), variables)
    return notes, end, list(L.MARKERS)


def window(notes, a, b, shift):
    """[a, b) の拍の音符を、shift だけずらして返す"""
    out = []
    for n in notes:
        if a <= n['t'] < b:
            m = dict(n)
            m['t'] = n['t'] - a + shift
            out.append(m)
    return out


def write_js(sid, header, meta, parts):
    lines = [header.rstrip(), '(() => {', f'  window.CS_SCORES.{sid} = {{']
    for k, v in meta.items():
        lines.append(f'    {k}: {v},')
    lines.append('    ppq: 96,')
    lines.append('    parts: [')
    for p in parts:
        data = L.encode(p['notes'], 96)
        lines.append(f"      {{ inst: '{p['inst']}', vol: {p['vol']}, melody: {str(p['melody']).lower()}, data: {json.dumps(data)} }},")
    lines.append('    ],')
    lines.append('  };')
    lines.append('})();')
    path = os.path.join(OUT, sid + '.js')
    open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    total = sum(len(p['notes']) for p in parts)
    print(sid, 'notes', [len(p['notes']) for p in parts], 'total', total)


def elise(ftp):
    src, V = load(os.path.join(ftp, 'BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly'))
    up, e1, _ = parse(L.extract_block(src, r'\\new Staff = "up"\s*\{'), V)
    dn, e2, _ = parse(L.extract_block(src, r'\\new Staff = "down"\s*\{'), V)
    assert e1 == e2, (e1, e2)
    write_js(
        'elise',
        '// エリーゼのために (ベートーヴェン, WoO 59)。全曲 (繰り返しも楽譜どおり)\n'
        '// 元の譜面: Mutopia Project "Für Elise" (typeset by Stelios Samelis, Public Domain)\n'
        '// tools/build_scores.py で作ったファイル。手で直さない',
        {
            'id': "'elise'",
            'tempo': '[[0, 72]]',
            'timeSig': '[3, 8]',
            'key': '{ tonic: 9, minor: true }',
            'theme': '{ part: 0, from: 0.5, len: 12, tempo: 84 }',
        },
        [
            {'inst': 'piano', 'vol': 1, 'melody': True, 'notes': up},
            {'inst': 'piano', 'vol': 0.8, 'melody': False, 'notes': dn},
        ],
    )


def nocturne(ftp):
    src, V = load(os.path.join(ftp, 'ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.ly'))
    up, e1, _ = parse('\\upper', V)
    dn, e2, _ = parse('\\lower', V)
    assert e1 == e2, (e1, e2)
    write_js(
        'nocturne',
        '// ノクターン第 2 番 変ホ長調 (ショパン, Op. 9-2)。全曲\n'
        '// 元の譜面: Mutopia Project "Nocturne Op. 9 No. 2" typeset by Renato Biolcati Rinaldi (2014)\n'
        '//   Licensed under Creative Commons Attribution-ShareAlike 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)\n'
        '// このファイル (音符のデータ) も同じ CC BY-SA 3.0 で公開する。\n'
        '// tools/build_scores.py で作ったファイル。手で直さない',
        {
            'id': "'nocturne'",
            'tempo': '[[0, 66]]',
            'timeSig': '[12, 8]',
            'key': '{ tonic: 3, minor: false }',
            'theme': '{ part: 0, from: 0.5, len: 24, tempo: 80 }',
        },
        [
            {'inst': 'piano', 'vol': 1, 'melody': True, 'notes': up},
            {'inst': 'piano', 'vol': 0.6, 'melody': False, 'notes': dn},
        ],
    )


# Mozart の順番と、各変奏の速さ (4 分音符)。X・XI はギターの版で音価が 2 倍に書かれているので、速さも 2 倍にして元に戻す
TWINKLE = [
    ('thema', 104), ('varI', 104), ('varII', 104), ('varIII', 104), ('varIV', 104), ('varV', 104),
    ('varVI', 104), ('varVII', 104), ('varVIII', 88), ('varIX', 100), ('varX', 200), ('varXI', 84), ('varXII', 160),
]


def twinkle(ftp):
    src, V = load(os.path.join(ftp, 'MozartWA/KV265/guitar-duo-complete/guitar-duo-complete-lys/guitar-duo-complete.ly'))
    up_all, dn_all = [], []
    tempo = []
    t = F(0)
    for name, bpm in TWINKLE:
        expr = re.search(r'^' + name + r' = \\StffGrp (.*)$', src, re.M).group(1)
        args = re.findall(r'<<.*?>>|\\\w+', expr)
        up, eu, mk = parse(args[0], V)
        dn, ed, _ = parse(args[1], V)
        end = max(eu, ed)
        fine = [b for (k, b) in mk if k == 'fin']
        # A = 前半 (8 小節)、B = 後半。元の形 ‖: A :‖: B (A') :‖ に戻す
        if fine and fine[0] < end and any(k == 'dcf' for k, _ in mk):
            # D.C. al Fine の版: [0, Fine) が A、[Fine, 終わり) が B。A A B A B A
            a = fine[0]
            segs = [(0, a), (0, a), (a, end), (0, a), (a, end), (0, a)]
        else:
            # 全部書いてある版 (A B A'): A は最初の 1/3
            a = end / 3
            segs = [(0, a), (0, a), (a, end), (a, end)]
        tempo.append((t, bpm))
        for (s0, s1) in segs:
            up_all += window(up, s0, s1, t)
            dn_all += window(dn, s0, s1, t)
            t += s1 - s0
        print('  ', name, 'len', float(end), 'A', float(a), '->', float(t))
    write_js(
        'twinkle',
        '// きらきら星変奏曲 (モーツァルト, K. 265)。主題と 12 の変奏の全曲 (繰り返しも元の形)\n'
        '// 元の譜面: Mutopia Project "Twelve Variations on Ah vous dirai-je, Maman" (guitar duo, Public Domain)\n'
        '//   原調・原曲の音のまま。ギターで出ない低音だけ、その版で変えてある。曲の順番と繰り返しは Mozart の形に戻した\n'
        '// tools/build_scores.py で作ったファイル。手で直さない',
        {
            'id': "'twinkle'",
            'tempo': '[' + ', '.join(f'[{float(b):g}, {bpm}]' for b, bpm in tempo) + ']',
            'timeSig': '[2, 4]',
            'key': '{ tonic: 0, minor: false }',
            'theme': '{ part: 0, from: 0, len: 16, tempo: 120 }',
        },
        [
            {'inst': 'piano', 'vol': 1, 'melody': True, 'notes': up_all},
            {'inst': 'piano', 'vol': 0.75, 'melody': False, 'notes': dn_all},
        ],
    )


if __name__ == '__main__':
    ftp = sys.argv[1]
    elise(ftp)
    nocturne(ftp)
    twinkle(ftp)
