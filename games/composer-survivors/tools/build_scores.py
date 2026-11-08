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


def expand_includes(path, depth=0):
    """\\include "x.ly" を、同じフォルダにあればその中身に置きかえる (LilyPond 本体の english.ly などはそのまま)"""
    text = open(path, encoding='utf-8').read()
    base = os.path.dirname(path)

    def rep(m):
        f = os.path.join(base, m.group(1))
        if depth < 5 and os.path.isfile(f):
            return expand_includes(f, depth + 1)
        return m.group(0)

    return re.sub(r'\\include\s+"([^"]+)"', rep, text)


def load(path):
    L.LANG['name'] = 'nederlands'
    src = L.strip_comments(expand_includes(path))
    lm = re.search(r'\\language\s+"(\w+)"', src)
    if lm:
        L.LANG['name'] = lm.group(1)
    if re.search(r'\\include\s+"english\.ly"', src):
        L.LANG['name'] = 'english'
    if re.search(r'\\include\s+"deutsch\.ly"', src):
        L.LANG['name'] = 'deutsch'
    return src, L.read_variables(src)


def parse(text, variables):
    L.MARKERS.clear()
    notes, end = L.parse_music(L.tokenize(text), variables)
    return notes, end, list(L.MARKERS)


def balanced(src, i):
    """src[i] が { か << のとき、対応する閉じまでの文字列"""
    if src.startswith('<<', i):
        depth = 0
        j = i
        while j < len(src):
            if src.startswith('<<', j):
                depth += 1
                j += 2
                continue
            if src.startswith('>>', j):
                depth -= 1
                j += 2
                if depth == 0:
                    return src[i:j]
                continue
            j += 1
        raise SystemExit('unbalanced <<')
    depth = 0
    for j in range(i, len(src)):
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    raise SystemExit('unbalanced {')


def staves(src, which=0):
    """which 番目の \\score の中の譜表 (Staff) ごとの音楽の文字列"""
    scores = [m.start() for m in re.finditer(r'\\score\s*\{', src)]
    i = src.index('{', scores[which])
    block = balanced(src, i)
    # 譜表が変数の中にあるとき (\\score { \\scoreAll } など) は、ファイル全体から探す
    if not re.search(r'\\(?:new|context)\s+Staff', block):
        block = src
    out = []
    for m in re.finditer(r'\\(?:new|context)\s+Staff(?:\s*=\s*"[^"]*")?(?:\s*\\with\s*)?', block):
        j = m.end()
        # \with { ... } を読み飛ばす
        if block[m.start():m.end()].rstrip().endswith('\\with'):
            w = balanced(block, block.index('{', j))
            j = block.index(w, j) + len(w)
        while j < len(block) and block[j].isspace():
            j += 1
        pre = ''
        # \\relative c' { … } / \\transpose a b { … } のように、命令のあとに音楽が続くもの
        mm = re.match(r'(\\relative(?:\s+[a-h](?:is|es|sharp|flat|s|f|x)*[\',]*)?|\\transpose\s+\S+\s+\S+|\\fixed\s+\S+)\s*', block[j:])
        if mm:
            pre = mm.group(1) + ' '
            j += mm.end()
        if block.startswith('<<', j) or block[j] == '{':
            out.append(pre + balanced(block, j))
        else:
            v = re.match(r'\\[A-Za-z]+', block[j:])
            out.append(v.group(0) if v else '')
    return out


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
        fine = [m[1] for m in mk if m[0] == 'fin']
        # A = 前半 (8 小節)、B = 後半。元の形 ‖: A :‖: B (A') :‖ に戻す
        # 6 分以内に収めるため、繰り返しは省く (A B A' を 1 回ずつ)
        if fine and fine[0] < end and any(m[0] == 'dcf' for m in mk):
            # D.C. al Fine の版: [0, Fine) が A、[Fine, 終わり) が B。A B A
            a = fine[0]
            segs = [(0, a), (a, end), (0, a)]
        else:
            a = end / 3
            segs = [(0, end)]
        tempo.append((t, bpm))
        for (s0, s1) in segs:
            up_all += window(up, s0, s1, t)
            dn_all += window(dn, s0, s1, t)
            t += s1 - s0
        print('  ', name, 'len', float(end), 'A', float(a), '->', float(t))
    write_js(
        'twinkle',
        '// きらきら星変奏曲 (モーツァルト, K. 265)。主題と 12 の変奏の全曲 (6 分以内に収めるため繰り返しは省く)\n'
        '// 元の譜面: Mutopia Project "Twelve Variations on Ah vous dirai-je, Maman" (guitar duo, Public Domain)\n'
        '//   原調・原曲の音のまま。ギターで出ない低音だけ、その版で変えてある。曲の順番は Mozart の形に戻した\n'
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


def generic(sid, path, header, meta, parts, tempo=None, use_marks=False, which=0):
    """parts: [(譜表の番号か変数名 (\\name), 楽器, 音量, 旋律か)]。tempo: [[拍, bpm]] (use_marks なら楽譜の \\tempo を使う)"""
    src, V = load(path)
    stv = staves(src, which) if any(isinstance(x[0], int) for x in parts) else []
    out = []
    marks = None
    for (sel, inst, vol, mel) in parts:
        text = stv[sel] if isinstance(sel, int) else sel
        notes, end, mk = parse(text, V)
        if marks is None:
            marks = [(float(m[1]), m[2]) for m in mk if m[0] == 'tempo']
        out.append({'inst': inst, 'vol': vol, 'melody': mel, 'notes': notes})
    if use_marks and marks:
        tm = []
        for b0, bpm in marks:
            if tm and abs(tm[-1][0] - b0) < 1e-6:
                tm[-1] = [b0, bpm]
            else:
                tm.append([b0, bpm])
        tempo = tm
    meta = dict(meta)
    meta['tempo'] = '[' + ', '.join(f'[{b0:g}, {bpm:g}]' for b0, bpm in tempo) + ']'
    write_js(sid, header, {'id': repr(sid), **meta}, out)


MUT = 'Mutopia Project (https://www.mutopiaproject.org/)'


def more(ftp):
    j = lambda *a: os.path.join(ftp, *a)
    PD = 'Public Domain'
    piano2 = lambda: [(0, 'piano', 1, True), (1, 'piano', 0.8, False)]
    generic('minuet', j('BeethovenLv/O49/LVB_Sonate_49no2_2/LVB_Sonate_49no2_2.ly'),
            f'// ピアノソナタ第 20 番 ト長調 Op. 49-2 第 2 楽章 (ベートーヴェン)。全曲\n// 元の譜面: {MUT} "Sonate Opus 49 No.2 - Part 2" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[3, 4]', 'key': '{ tonic: 7, minor: false }', 'theme': '{ part: 0, from: 0, len: 25, tempo: 134 }'}, piano2(), [[0, 134]])
    generic('pathetique3', j('BeethovenLv/O13/pathetique-3/pathetique-3.ly'),
            f'// ピアノソナタ第 8 番「悲愴」第 3 楽章 (ベートーヴェン, Op. 13)。全曲\n// 元の譜面: {MUT} "Sonata No. 8 Pathétique" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[2, 2]', 'key': '{ tonic: 0, minor: true }', 'theme': '{ part: 0, from: 0, len: 16, tempo: 200 }'}, piano2(), [[0, 216]])
    generic('fate', j('BeethovenLv/O67/beethoven_fifth_op67/beethoven_fifth_op67-lys/beethoven_fifth_op67.ly'),
            f'// 交響曲第 5 番「運命」第 1 楽章 (ベートーヴェン, Op. 67) のピアノ編曲。全曲 (提示部の繰り返しも)\n// 元の譜面: {MUT} "Symphony no. 5, Piano reduction" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[2, 4]', 'key': '{ tonic: 0, minor: true }', 'theme': '{ part: 0, from: 0, len: 42, tempo: 200 }'}, piano2(), [[0, 216]])
    generic('moonlight3', j('BeethovenLv/O27/moonlight/moonlight-lys/moonlight3-a4.ly'),
            f'// ピアノソナタ第 14 番「月光」第 3 楽章 (ベートーヴェン, Op. 27-2)。全曲\n// 元の譜面: {MUT} "Sonata No. 14 Moonlight (3rd Movement)" typeset by Chris Sawer and Stewart Holmes\n//   Licensed under Creative Commons Attribution-ShareAlike 2.5 (https://creativecommons.org/licenses/by-sa/2.5/)\n// このファイル (音符のデータ) も同じ CC BY-SA 2.5 で公開する。\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[4, 4]', 'key': '{ tonic: 1, minor: true }', 'theme': '{ part: 0, from: 0, len: 16, tempo: 176 }'}, piano2(), [[0, 176]])
    generic('turkish', j('MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca-lys/KV331_3_RondoAllaTurca.ly'),
            f'// ピアノソナタ第 11 番 第 3 楽章「トルコ行進曲」(モーツァルト, K. 331)。全曲\n// 元の譜面: {MUT} "Rondo Alla Turca" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[2, 4]', 'key': '{ tonic: 9, minor: true }', 'theme': '{ part: 0, from: 0, len: 17, tempo: 126 }'}, piano2(), [[0, 126]])
    generic('nacht', j('MozartWA/KV525/eine-kleine-nachtmusik-mvt1/eine-kleine-nachtmusik-mvt1-lys/eine-kleine-nachtmusik-mvt1.ly'),
            f'// アイネ・クライネ・ナハトムジーク 第 1 楽章 (モーツァルト, K. 525)。全曲 (提示部の繰り返しも)\n// 元の譜面: {MUT} "Eine kleine Nachtmusik (1st movement)" ({PD})。弦楽四重奏の 4 声部をピアノの音で鳴らす\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[4, 4]', 'key': '{ tonic: 7, minor: false }', 'theme': '{ part: 0, from: 0, len: 16, tempo: 144 }'},
            [('\\violinOne', 'piano', 1, True), ('\\violinTwo', 'piano', 0.7, False), ('\\viola', 'piano', 0.7, False), ('\\cello', 'piano', 0.85, False)], [[0, 144]])
    generic('fantasia', j('MozartWA/KV397/Fantasia/Fantasia.ly'),
            f'// 幻想曲 ニ短調 K. 397 (モーツァルト)。全曲\n// 元の譜面: {MUT} "Fantasy in D minor" ({PD})。速さは楽譜の \\tempo のとおりに変わる\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[4, 4]', 'key': '{ tonic: 2, minor: true }', 'theme': '{ part: 0, from: 44, len: 16, tempo: 90 }'}, piano2(), [[0, 80]], use_marks=True)
    generic('k457', j('MozartWA/KV457/sonata3/sonata3.ly'),
            f'// ピアノソナタ第 14 番 ハ短調 K. 457 第 3 楽章 (モーツァルト)。全曲\n// 元の譜面: {MUT} "Piano Sonata in C minor (KV. 457)" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[3, 4]', 'key': '{ tonic: 0, minor: true }', 'theme': '{ part: 0, from: 0, len: 25, tempo: 198 }'}, piano2(), [[0, 198]])
    generic('minute', j('ChopinFF/O64/chopin_valse_op64_no1/chopin_valse_op64_no1-lys/chopin_valse_op64_no1.ly'),
            f'// ワルツ第 6 番 変ニ長調「子犬のワルツ」(ショパン, Op. 64-1)。全曲\n// 元の譜面: {MUT} "Valse Op. 64 No. 1" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[3, 4]', 'key': '{ tonic: 1, minor: false }', 'theme': '{ part: 0, from: 0, len: 24, tempo: 230 }'}, piano2(), [[0, 230]])
    generic('fantaisie', j('ChopinFF/O66/chopin_fantaisie-impromptu/chopin_fantaisie-impromptu.ly'),
            f'// 幻想即興曲 嬰ハ短調 (ショパン, Op. 66)。全曲\n// 元の譜面: {MUT} "Fantaisie-Impromptu" ({PD})。速さは楽譜の \\tempo のとおりに変わる\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[4, 4]', 'key': '{ tonic: 1, minor: true }', 'theme': '{ part: 0, from: 16, len: 16, tempo: 168 }'}, piano2(), [[0, 168]], use_marks=True)
    generic('revolution', j('ChopinFF/O10/op-10-12-wfi/op-10-12-wfi.ly'),
            f'// 練習曲 ハ短調「革命」(ショパン, Op. 10-12)。全曲\n// 元の譜面: {MUT} "Revolutionary Etude Op. 10 No. 12" ({PD})\n// tools/build_scores.py で作ったファイル。手で直さない',
            {'timeSig': '[4, 4]', 'key': '{ tonic: 0, minor: true }', 'theme': '{ part: 0, from: 0, len: 16, tempo: 160 }'}, piano2(), [[0, 160]], use_marks=True)


if __name__ == '__main__':
    ftp = sys.argv[1]
    elise(ftp)
    nocturne(ftp)
    twinkle(ftp)
    more(ftp)
