#!/usr/bin/env python3
"""
Mutopia Project の LilyPond の譜面から、ゲームの譜面 (scores/*.js) を作る。

  python3 -I build_scores.py <MutopiaProject の ftp フォルダ>

元の譜面: https://github.com/MutopiaProject/MutopiaProject (ftp/ 以下)
  - エリーゼのために: ftp/BeethovenLv/WoO59/fur_Elise_WoO59 (Public Domain, Stelios Samelis)
  - ノクターン Op.9-2: ftp/ChopinFF/O9/chopin_nocturne_op9_n2 (CC BY-SA 3.0, Renato Biolcati Rinaldi)
  - きらきら星変奏曲 K.265: ftp/MozartWA/KV265/guitar-duo-complete (Public Domain。ギター二重奏の版。
    音は Mozart の原曲どおり (原調) で、ギターで出ない低音だけが変えてある。繰り返しは省かれているので、ここで元の形に戻す)
  - 曲集 (はじめての曲集・バッハ・ヴィヴァルディ・チャイコフスキー・ドビュッシー) の 25 曲は books() を参照
    (曲ごとの ftp/ 以下のフォルダ・浄書者・ライセンスを書いてある。CC BY-SA のものは scores/*.js も同じライセンス)
LilyPond は実行せず、ly2score.py で文字として読む。

  python3 -I build_scores.py <ftp フォルダ> <chopin_piano_score_dataset のフォルダ>

木枯らしだけは Mutopia に無いので、MusicXML から作る (xml2score.py で読む):
  - 練習曲 Op.25-11: https://github.com/mac-marg-pianist/chopin_piano_score_dataset
    scores_xml/Chopin_Etude_op_25_11.musicxml (KAIST MAC × SNU MARG, MIT License。MuseScore の譜面から集めたもの)
"""
import json
import os
import re
import sys
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ly2score as L  # noqa: E402
import xml2score as X  # noqa: E402

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
    ends = []
    lasts = []
    marks = None
    for (sel, inst, vol, mel) in parts:
        text = stv[sel] if isinstance(sel, int) else sel
        notes, end, mk = parse(text, V)
        ends.append(float(end))
        lasts.append(max((float(n['t'] + n['d']) for n in notes), default=0))
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
    # パートの長さがそろうこと (ちがうのは、最後の休符の分だけならよい)
    if max(ends) - min(ends) > 0.01 and max(lasts) > min(ends) + 0.01:
        raise SystemExit(f'{sid}: パートの長さがそろわない {ends}')
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


def winterwind(dataset):
    r = X.read(os.path.join(dataset, 'scores_xml', 'Chopin_Etude_op_25_11.musicxml'))
    up, dn = r['staves']['1'], r['staves']['2']
    # 速さ: 序奏 Lento (楽譜に数字が無いので MusicXML の 48、rit. で 42)、
    # Allegro con brio は楽譜の metronome (2 分音符 = 69) で 4 分音符 = 138。m.68 rit. / m.69 a tempo
    marks = {'Lento': 48, 'rit.': None, 'Allegro con brio.': 138, 'a tempo': 138}
    tempo = []
    for b0, bpm, bar, words in r['tempos']:
        bpm = marks.get(words) or bpm
        if words == 'rit.' and bar == '68':
            bpm = 120
        tempo.append([float(b0), bpm])
    write_js(
        'winterwind',
        '// 練習曲 イ短調「木枯らし」(ショパン, Op. 25-11)。全曲\n'
        '// 元の譜面: Chopin Piano Score Data Set (KAIST MAC × SNU MARG, MIT License)\n'
        '//   https://github.com/mac-marg-pianist/chopin_piano_score_dataset scores_xml/Chopin_Etude_op_25_11.musicxml\n'
        '// tools/build_scores.py (xml2score.py) で作ったファイル。手で直さない',
        {
            'id': "'winterwind'",
            'timeSig': '[4, 4]',
            'key': '{ tonic: 9, minor: true }',
            'theme': '{ part: 1, from: 16, len: 16, tempo: 138 }',
            'tempo': '[' + ', '.join(f'[{b:g}, {t:g}]' for b, t in tempo) + ']',
        },
        [
            {'inst': 'piano', 'vol': 0.8, 'melody': False, 'notes': up},
            {'inst': 'piano', 'vol': 1, 'melody': True, 'notes': dn},
        ],
    )


CC = {
    'BY-SA 2.5': 'https://creativecommons.org/licenses/by-sa/2.5/',
    'BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
}


def head(title, src_title, by=None, lic=None):
    """scores/*.js の頭の説明。lic が CC のときは、同じライセンスで公開すると書く"""
    lines = [f'// {title}。全曲', f'// 元の譜面: {MUT} "{src_title}"' + (f' typeset by {by}' if by else '')]
    if lic:
        lines.append(f'//   Licensed under Creative Commons Attribution-ShareAlike {lic.split()[1]} ({CC[lic]})')
        lines.append(f'// このファイル (音符のデータ) も同じ CC {lic} で公開する。')
    else:
        lines.append('//   Public Domain')
    lines.append('// tools/build_scores.py で作ったファイル。手で直さない')
    return '\n'.join(lines)


def song(sid, path, title, src_title, by, lic, key, tempo, parts, theme=None, use_marks=False, time='[4, 4]'):
    th = theme or {'part': 0, 'from': 0, 'len': 16}
    th = dict(th)
    th.setdefault('tempo', tempo[0][1] if isinstance(tempo, list) else tempo)
    meta = {'timeSig': time, 'key': key, 'theme': '{ ' + ', '.join(f'{k}: {v}' for k, v in th.items()) + ' }'}
    generic(sid, path, head(title, src_title, by, lic), meta, parts, tempo if isinstance(tempo, list) else [[0, tempo]], use_marks=use_marks)


def books(ftp):
    """曲集: 初心者 (はじめての曲集)・バッハ・ヴィヴァルディ・チャイコフスキー・ドビュッシー"""
    j = lambda *a: os.path.join(ftp, *a)
    P = lambda a, b: [(a, 'piano', 1, True), (b, 'piano', 0.8, False)]
    maj = lambda k: f'{{ tonic: {k}, minor: false }}'
    mnr = lambda k: f'{{ tonic: {k}, minor: true }}'
    # ---- はじめての曲集 ----
    song('k2', j('MozartWA/KV2/menuet_k2/menuet_k2.ly'), 'メヌエット ヘ長調 K. 2 (モーツァルト、6 歳の作品)',
         'Menuett K. 2', 'Nicolas Morant', None, maj(5), 120, P('\\AvoiceAA', '\\AvoiceBA'), time='[3, 4]')
    song('laboureur', j('SchumannR/O68/schumann-op68-10-gai-laboureur/schumann-op68-10-gai-laboureur.ly'),
         '「子供のためのアルバム」より 楽しき農夫 Op. 68-10 (シューマン)', 'Album pour la jeunesse Op. 68 No. 10', 'Philippe Hézaine', 'BY-SA 2.5',
         maj(5), 120, P('\\upper', '\\lower'), theme={'part': 1, 'from': 0, 'len': 8})
    song('petzold', j('BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.ly'),
         'メヌエット ト長調 BWV Anh. 114 (アンナ・マクダレーナ・バッハの音楽帳より。ペツォールト作とされる)', 'Menuet in G', 'Allen Garvin', None,
         maj(7), 140, P(0, 1), time='[3, 4]', theme={'part': 0, 'from': 0, 'len': 24})
    song('gymnopedie', j('SatieE/gymnopedie_1/gymnopedie_1.ly'), 'ジムノペディ第 1 番 (サティ)', 'Gymnopédie No. 1', 'Evin Robertson', None,
         maj(2), 72, P(0, 1), time='[3, 4]', theme={'part': 0, 'from': 12, 'len': 24})
    song('clementi', j('ClementiM/O36/sonatina-1/sonatina-1.ly'), 'ソナチネ ハ長調 Op. 36-1 第 1 楽章 (クレメンティ)', 'Sonatina Op. 36 No. 1', 'Brian D. Rude', None,
         maj(0), 156, P('\\upperfirst', '\\lowerfirst'), time='[2, 2]')
    # ---- バッハ ----
    song('bwv846', j('BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.ly'), '平均律クラヴィーア曲集 第 1 巻 前奏曲第 1 番 ハ長調 BWV 846 (バッハ)',
         'Das Wohltemperierte Clavier I, Prelude 1', 'Tobias Erbsland', None, maj(0), 66, P(0, 1))
    song('invention1', j('BachJS/BWV772/bach-invention-01/bach-invention-01.ly'), 'インヴェンション第 1 番 ハ長調 BWV 772 (バッハ)',
         'Invention 1', 'jeff covey', 'BY-SA 3.0', maj(0), 72, P(0, 1))
    song('invention8', j('BachJS/BWV779/bach-invention-08/bach-invention-08.ly'), 'インヴェンション第 8 番 ヘ長調 BWV 779 (バッハ)',
         'Invention 8', 'Allen Garvin', None, maj(5), 132, P(0, 1), time='[3, 4]', theme={'part': 0, 'from': 0, 'len': 12})
    song('fugue2', j('BachJS/BWV847/fuga2/fuga2.ly'), '平均律クラヴィーア曲集 第 1 巻 フーガ第 2 番 ハ短調 BWV 847 (バッハ)',
         'Fuga II', 'Urs Metzger', 'BY-SA 4.0', mnr(0), 72,
         [('\\sopran', 'piano', 1, True), ('\\alt', 'piano', 0.85, False), ('\\bass', 'piano', 0.85, False)],
         theme={'part': 1, 'from': 0, 'len': 8})
    song('italian', j('BachJS/BWV971/piano/piano-lys/piano.ly'), 'イタリア協奏曲 第 1 楽章 BWV 971 (バッハ)', 'Italian Concerto',
         'Glen Larsen', 'BY-SA 3.0', maj(5), 96, P('\\rightMvtI', '\\leftMvtI'), time='[2, 4]')
    # ---- ヴィヴァルディ「四季」(独奏ヴァイオリンと弦楽合奏の 5 声部をピアノの音で) ----
    def season(sid, sea, mv, title, key, tempo, time='[4, 4]', theme=None):
        S_ = sea.capitalize()
        names = [('ViolinoPrincipale', 1, True), ('ViolinoPrimo', 0.7, False), ('ViolinoSecondo', 0.65, False), ('AltoViola', 0.6, False), ('Violoncello', 0.8, False)]
        parts = [('\\' + n + S_ + mv, 'piano', v, m) for (n, v, m) in names]
        song(sid, j(f'VivaldiA/O8/{sea}/{sea}-lys/{sea}-score.ly'), title + ' (ヴィヴァルディ「四季」)。独奏と弦楽の 5 声部をピアノの音で',
             f'The Four Seasons: {S_}', None, 'BY-SA 3.0', key, tempo, parts, time=time, theme=theme)
    season('winter2', 'winter', 'Two', '冬 第 2 楽章 (ラルゴ)', maj(3), 50, theme={'part': 0, 'from': 0, 'len': 8})
    season('spring1', 'spring', 'One', '春 第 1 楽章', maj(4), 100, theme={'part': 0, 'from': 0, 'len': 12})
    season('autumn3', 'autumn', 'Three', '秋 第 3 楽章「狩り」', maj(5), 90, time='[3, 8]', theme={'part': 0, 'from': 0, 'len': 12})
    season('winter1', 'winter', 'One', '冬 第 1 楽章', mnr(5), 108, theme={'part': 0, 'from': 44, 'len': 16})
    season('summer3', 'summer', 'Three', '夏 第 3 楽章「嵐」', mnr(7), 200, time='[3, 4]', theme={'part': 0, 'from': 0, 'len': 24})
    # ---- チャイコフスキー ----
    song('oldfrench', j('TchaikovskyPI/O39/16OldFrenchSong/16OldFrenchSong.ly'), '「子供のアルバム」より 古いフランスの歌 Op. 39-16 (チャイコフスキー)',
         'Old French Song', 'David McNamara', None, mnr(7), 70,
         [('\\overallMelody', 'piano', 1, True), ('\\overallMiddle', 'piano', 0.75, False), ('\\overallBass', 'piano', 0.8, False)], time='[2, 4]')
    song('woodensoldiers', j('TchaikovskyPI/O39/05MarchOfTheWoodenSoldiers/05MarchOfTheWoodenSoldiers.ly'),
         '「子供のアルバム」より 木の兵隊の行進 Op. 39-5 (チャイコフスキー)', 'March of the Wooden Soldiers', None, None, maj(2), 120, P(0, 1), time='[2, 4]')
    song('january', j('TchaikovskyPI/O37/Tschaikowsky-op37.1/Tschaikowsky-op37.1.ly'), '「四季」より 1 月「炉ばたにて」Op. 37-1 (チャイコフスキー)',
         'The Seasons: January', 'Till Rettig', None, maj(9), 84, P(0, 1), time='[3, 4]', theme={'part': 0, 'from': 0, 'len': 12})
    song('february', j('TchaikovskyPI/O37/Tschaikowsky-op37.2/Tschaikowsky-op37.2.ly'), '「四季」より 2 月「謝肉祭」Op. 37-2 (チャイコフスキー)',
         'The Seasons: February', 'Till Rettig', None, maj(2), 132, P(0, 1), time='[2, 4]')
    song('august', j('TchaikovskyPI/O37/Tschaikowsky-op37.8/Tschaikowsky-op37.8.ly'), '「四季」より 8 月「収穫の歌」Op. 37-8 (チャイコフスキー)',
         'The Seasons: August', 'Till Rettig', None, mnr(11), 168, P(0, 1), time='[6, 8]', theme={'part': 0, 'from': 0, 'len': 12})
    # ---- ドビュッシー ----
    song('arabesque1', j('DebussyC/L66/debussy_Arabesque_1/debussy_Arabesque_1.ly'), 'アラベスク第 1 番 (ドビュッシー)', 'Première Arabesque',
         'Keith OHara', None, maj(4), 100, P(0, 1), theme={'part': 0, 'from': 8, 'len': 16})
    song('clairdelune', j('DebussyC/L75/debussy_Ste_Bergamesq_Clair/debussy_Ste_Bergamesq_Clair.ly'), 'ベルガマスク組曲より「月の光」(ドビュッシー)',
         'Suite Bergamasque: Clair de Lune', 'Keith OHara', None, maj(1), 66,
         [('\\rhUp', 'piano', 1, True), ('\\rhDown', 'piano', 0.8, False), ('\\lhUp', 'piano', 0.75, False), ('\\lhDown', 'piano', 0.8, False)],
         time='[9, 8]', theme={'part': 0, 'from': 0, 'len': 18})
    song('arabesque2', j('DebussyC/L66/debussy_Arabesque_2/debussy_Arabesque_2.ly'), 'アラベスク第 2 番 (ドビュッシー)', 'Deuxième Arabesque',
         'Knute Snortum', 'BY-SA 4.0', maj(7), 160, P(0, 1))
    song('parfums', j('DebussyC/L117/L117-prel-4/L117-prel-4-lys/debussy-L117-prel-4.ly'), '前奏曲集 第 1 巻より「音と香りは夕暮れの大気に漂う」(ドビュッシー)',
         'Préludes I, No. 4', 'Knute Snortum', 'BY-SA 4.0', maj(9), 52, P(0, 1), time='[3, 4]')
    song('ventplaine', j('DebussyC/L117/debussy-L117-prels/debussy-L117-prels-lys/L117-prel-3/L117-prel-3-lys/debussy-L117-prel-3.ly'),
         '前奏曲集 第 1 巻より「野を渡る風」(ドビュッシー)', 'Préludes I, No. 3', 'Glen Larsen', 'BY-SA 4.0', mnr(10), 126, P(0, 1))


def concertos(ftp, conc_dir):
    """ピアノ協奏曲集: ベートーヴェン第 3 番 第 1 楽章 (Mutopia の全楽譜)・ショパン第 1 番 第 3 楽章 (独奏ピアノへの編曲)"""
    # ベートーヴェン: 独奏ピアノは録音のピアノ、オーケストラは合成の楽器の音で
    base = os.path.join(ftp, 'BeethovenLv/O37/Concerto_No3/Concerto_No3-lys/Concerto_No3.ly')
    orch = [('\\flauti', 'flute', 0.45), ('\\oboi', 'clarinet', 0.4), ('\\clarinetti', 'clarinet', 0.4), ('\\fagotti', 'cello', 0.45),
            ('\\cornies', 'brass', 0.4), ('\\trombe', 'brass', 0.4), ('\\timpani', 'timpani', 0.6), ('\\violinoone', 'strings', 0.55),
            ('\\violinotwo', 'strings', 0.45), ('\\viola', 'strings', 0.45), ('\\bassi', 'cello', 0.6)]
    parts = [('\\pianoone', 'piano', 1, True), ('\\pianotwo', 'piano', 0.85, False)] + [(v, i, vol, False) for (v, i, vol) in orch]
    song('beethoven_pc3', base, 'ピアノ協奏曲第 3 番 ハ短調 Op. 37 第 1 楽章 (ベートーヴェン)。独奏ピアノとオーケストラの全声部',
         'Piano Concerto No. 3 in C Minor, Op. 37 (1st Movement)', 'Stelios Samelis', None, '{ tonic: 0, minor: true }', 132, parts,
         theme={'part': 7, 'from': 0, 'len': 16})
    # ショパン: 独奏ピアノへの編曲 (全 3 楽章) から第 3 楽章を切り出す。8 声部を右手 (1〜4)・左手 (5〜8) にまとめる
    path = os.path.join(conc_dir, 'chopin-piano-concerto-no-1-in-e-minor-solo-arrangement.ly')
    src, V = load(path)
    names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
    body = V['PartPOneVoiceOne']
    i = body.find('III - Vivace')
    j = body.rfind('\\tempo', 0, i)
    _, _, mk = parse(body[:j] + ' \\fine ' + body[j:], V)
    t3 = [m[1] for m in mk if m[0] == 'fine'][0]
    right, left, ends = [], [], []
    for k, nm in enumerate(names):
        notes, end, _ = parse('\\PartPOneVoice' + nm, V)
        ends.append(float(end))
        (right if k < 4 else left).extend(window(notes, t3, end + 1, 0))
    if max(ends) - min(ends) > 0.01:
        raise SystemExit(f'chopin_pc1: 声部の長さがそろわない {ends}')
    write_js(
        'chopin_pc1',
        '// ピアノ協奏曲第 1 番 ホ短調 Op. 11 第 3 楽章「ロンド」(ショパン)。独奏ピアノへの編曲 (オーケストラの部分もピアノに入っている) の全曲\n'
        '// 元の譜面: https://github.com/mocisly/chopin-piano-concerto-no-1-in-e-minor-solo-arrangement (MIT License, Copyright (c) 2026 mocisly)\n'
        '//   ライセンス文は scores/LICENSE-chopin_pc1.txt\n'
        '// tools/build_scores.py で作ったファイル。手で直さない',
        {'id': "'chopin_pc1'", 'timeSig': '[2, 4]', 'key': '{ tonic: 4, minor: false }', 'theme': '{ part: 0, from: 0, len: 16, tempo: 104 }', 'tempo': '[[0, 104]]'},
        [{'inst': 'piano', 'vol': 1, 'melody': True, 'notes': right}, {'inst': 'piano', 'vol': 0.8, 'melody': False, 'notes': left}],
    )


if __name__ == '__main__':
    ftp = sys.argv[1]
    if ftp != '-':
        elise(ftp)
        nocturne(ftp)
        twinkle(ftp)
        more(ftp)
        books(ftp)
    if len(sys.argv) > 2:
        winterwind(sys.argv[2])
    if len(sys.argv) > 3:
        concertos(ftp, sys.argv[3])
