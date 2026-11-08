#!/usr/bin/env python3
"""
LilyPond の譜面 (の一部の書き方) を、作曲家サバイバーの譜面データに直す。

LilyPond は実行せず、文字として読むだけ (ダウンロードした .ly に Scheme のコードが入っていても動かさない)。
対応している書き方: 音符・休符・和音 <...>・長さと付点・タイ ~・\\relative・\\repeat volta / unfold と \\alternative・
\\tuplet / \\times・\\grace / \\appoggiatura / \\acciaccatura・強弱 (\\pp 〜 \\ff, \\sf, \\fz)・
アクセント (-> \\accent)・スタッカート (-. \\staccato)・\\fermata・\\trill・\\partial。
ほかの命令 (\\clef \\key \\time \\override \\set \\bar \\ottava など) は読み飛ばす。

使い方:
  python3 ly2score.py 入力.ly 出力.js --id elise --var 'up=0,down=1' ...  (ui の説明は main() を参照)
"""
import argparse
import json
import re
import sys
from fractions import Fraction as F

NOTE = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11, 'h': 11}
DYN = {'ppp': 0, 'pp': 0, 'p': 1, 'mp': 2, 'mf': 3, 'f': 4, 'ff': 5, 'fff': 5}


def strip_comments(s):
    out = []
    i = 0
    while i < len(s):
        if s.startswith('%{', i):
            j = s.find('%}', i + 2)
            i = len(s) if j < 0 else j + 2
            continue
        if s[i] == '%':
            j = s.find('\n', i)
            i = len(s) if j < 0 else j
            continue
        if s[i] == '"':
            # 文字列はそのまま残す (中の % を消さないように)
            j = i + 1
            while j < len(s) and s[j] != '"':
                j += 2 if s[j] == '\\' else 1
            out.append(s[i:j + 1])
            i = j + 1
            continue
        out.append(s[i])
        i += 1
    return ''.join(out)


TOKEN_RE = re.compile(
    r'''\s*(
      "(?:\\.|[^"\\])*"            |  # 文字列
      \#\#?[tf]                    |
      \#'?\([^()]*(?:\([^()]*\)[^()]*)*\) |  # #'(...) / #(...) (入れ子 1 段まで)
      \#[^\s{}<>]*                 |  # #値
      \\[A-Za-z]+(?:\.[A-Za-z-]+)* |  # \命令
      \\[<>!()\[\]~]              |  # \< \> \! \( \) (松葉・フレーズ記号)
      <<|>>|\\\\                   |
      [{}<>\[\]()~|]               |
      [-_^][.>!+^_-]               |  # 記号 -. -> など
      [-_^](?=\\)                  |
      [a-zA-Z]+[',]*!?\??(?:\d+\.*)?(?:\*\d+(?:/\d+)?)? |  # 音符・休符
      \d+(?:/\d+)?\.*              |
      =                            |
      \S
    )''', re.X)


def tokenize(s):
    toks = []
    pos = 0
    while pos < len(s):
        m = TOKEN_RE.match(s, pos)
        if not m:
            break
        toks.append(m.group(1))
        pos = m.end()
    return toks


LANG = {'name': 'nederlands'}
IFEMIDI = {'use': 'print'}  # \\ifemidi { 演奏用 } { 印刷用 } のどちらを読むか
BARCHECK = {'on': False}  # 小節線 | の位置を記録する (調べるとき用)
MARKERS = []  # (\\fin などの名前, 拍)


def pitch_of(name, octs):
    """ly の音名と ' , から MIDI の番号 (c' = 60)。
    オランダ式 (既定): cis = C#, bes = Bb, es = Eb, as = Ab。英語式 (\\language "english"): cs = C#, bf = Bb"""
    base = name[0]
    acc = 0
    rest = name[1:]
    if LANG['name'] == 'deutsch':
        # ドイツ式: h = B、b = B♭ (heses = B𝄫)。ほかはオランダ式と同じ (cis, es, as …)
        if name == 'b':
            return 48 + 10 + 12 * (octs.count("'") - octs.count(','))
        if base == 'h':
            base = 'b'
    if LANG['name'] == 'english':
        while rest:
            if rest.startswith('sharp'):
                acc += 1
                rest = rest[5:]
            elif rest.startswith('flat'):
                acc -= 1
                rest = rest[4:]
            elif rest[0] in 'sx':
                acc += 2 if rest[0] == 'x' else 1
                rest = rest[1:]
            elif rest[0] == 'f':
                acc -= 1
                rest = rest[1:]
            else:
                return None
        return 48 + NOTE[base] + acc + 12 * (octs.count("'") - octs.count(','))
    while rest:
        if rest.startswith('is'):
            acc += 1
            rest = rest[2:]
        elif rest.startswith('es'):
            acc -= 1
            rest = rest[2:]
        elif rest.startswith('s') and base in 'ae':  # as, es
            acc -= 1
            rest = rest[1:]
        else:
            return None
    oct_shift = octs.count("'") - octs.count(',')
    return 48 + NOTE[base] + acc + 12 * oct_shift


NOTE_RE = re.compile(r"^([a-h](?:is|es|sharp|flat|s|f|x)*)([',]*)!?\??(\d+\.*)?(?:\*(\d+)(?:/(\d+))?)?$")
REST_RE = re.compile(r"^([rRs])(\d+\.*)?(?:\*(\d+)(?:/(\d+))?)?$")


def dur_of(s, prev):
    if not s:
        return prev
    m = re.match(r'(\d+)(\.*)', s)
    base = F(4, int(m.group(1)))  # 4 分音符 = 1 拍
    d = base
    add = base
    for _ in m.group(2):
        add /= 2
        d += add
    return d


class Parser:
    def __init__(self, toks, variables):
        self.t = toks
        self.i = 0
        self.vars = variables

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else None

    def next(self):
        tok = self.peek()
        self.i += 1
        return tok

    def skip_arg(self):
        """命令の引数を 1 つ読み飛ばす ({...} / 文字列 / #値 / 音符)"""
        tok = self.peek()
        if tok == '{':
            self.block_raw()
        elif tok is not None:
            self.next()

    def block_raw(self):
        depth = 0
        while True:
            tok = self.next()
            if tok is None:
                return
            if tok == '{':
                depth += 1
            elif tok == '}':
                depth -= 1
                if depth == 0:
                    return


def parse_music(toks, variables, rel_start=None):
    """音楽を読んで、[{t, d, p, v, mk}] (拍) と長さを返す"""
    st = {
        'dur': F(1),
        'dyn': 3,
        'rel': rel_start,  # \relative の基準 (MIDI の番号)。None なら絶対
    }
    p = Parser(toks, variables)
    notes = []

    def seq(t0, scale=F(1), grace=False, end='}'):
        """end が来るまで並べて読む。返り値は終わりの時刻"""
        t = t0
        last_note = None  # 記号をつける相手
        while True:
            tok = p.peek()
            if tok is None:
                return t
            if tok == end:
                p.next()
                return t
            if tok == '{':
                p.next()
                t = seq(t, scale, grace)
                continue
            if tok == '<<':
                p.next()
                # 同時に鳴る声部: { } のかたまりを同じ時刻から
                ends = [t]
                while p.peek() not in (None, '>>'):
                    if p.peek() == '{':
                        p.next()
                        ends.append(seq(t, scale, grace))
                    elif p.peek() == '\\\\':
                        p.next()
                    elif p.peek().startswith('\\') and p.peek() not in ('\\new', '\\context'):
                        r = handle_command(p.next(), t, scale, grace)
                        if r is not None:
                            ends.append(r)
                    else:
                        p.next()
                p.next()
                t = max(ends)
                continue
            p.next()
            if tok.startswith('\\'):
                r = handle_command(tok, t, scale, grace)
                if r is not None:
                    t = r
                continue
            if tok == '<':
                # 和音
                pitches = []
                marks = ''
                while p.peek() not in (None, '>'):
                    x = p.next()
                    m = NOTE_RE.match(x)
                    if m:
                        pitches.append(resolve(m.group(1), m.group(2)))
                    elif x in ('->', '^>', '_>'):
                        marks += '>'
                    elif x in ('-.', '^.', '_.'):
                        marks += "'"
                p.next()
                d = st['dur']
                after = p.peek()
                if after and re.match(r'^\d+\.*$', after):
                    p.next()
                    d = dur_of(after, st['dur'])
                    st['dur'] = d
                if pitches and st['rel'] is not None:
                    st['rel'] = pitches[0]
                real = d * scale
                made = []
                for q in pitches:
                    n = add_note(t, real, q, grace, len(pitches))
                    if n:
                        n['mk'] += marks
                        made.append(n)
                last_note = made
                if not grace:
                    t += real
                continue
            m = NOTE_RE.match(tok)
            if m and tok not in ('s',) and not REST_RE.match(tok):
                q = resolve(m.group(1), m.group(2))
                dtok = m.group(3)
                if not dtok and p.peek() and re.match(r'^\d+\.*$', p.peek()):
                    dtok = p.next()  # 「ef 4.」のように、音名と長さの間に空白がある
                d = dur_of(dtok, st['dur'])
                if dtok:
                    st['dur'] = d
                if m.group(4):
                    d = d * int(m.group(4)) / int(m.group(5) or 1)
                real = d * scale
                n = add_note(t, real, q, grace, 1)
                last_note = [n] if n else None
                if not grace:
                    t += real
                continue
            m = REST_RE.match(tok)
            if m:
                d = dur_of(m.group(2), st['dur'])
                if m.group(2):
                    st['dur'] = d
                if m.group(3):
                    d = d * int(m.group(3)) / int(m.group(4) or 1)
                if not grace:
                    t += d * scale
                last_note = None
                continue
            if tok == '|':
                if BARCHECK['on']:
                    MARKERS.append(('|', t))
                continue
            if tok == '~':
                if last_note:
                    for n in last_note:
                        n['tie'] = True
                continue
            if tok in ('->', '^>', '_>'):
                if last_note:
                    for n in last_note:
                        n['mk'] += '>'
                continue
            if tok in ('-.', '^.', '_.', '-!', '^!', '_!'):
                if last_note:
                    for n in last_note:
                        n['mk'] += "'"
                continue
            # そのほか ( ) [ ] | = など は読み飛ばす

    # 強弱・記号など、音符のあとにつく命令
    def handle_command(cmd, t, scale, grace):
        name = cmd[1:]
        if name == 'ifemidi' and IFEMIDI['use'] == 'midi':
            # \\ifemidi { 演奏用 } { 印刷用 }: 演奏用のほうだけ読む
            r = t
            if p.peek() == '{':
                p.next()
                r = seq(t, scale, grace)
            if p.peek() == '{':
                p.block_raw()
            return r
        if name == 'ifemidi':
            # 印刷用のほうを読む
            if p.peek() == '{':
                p.block_raw()
            if p.peek() == '{':
                p.next()
                return seq(t, scale, grace)
            return t
        if name == 'fermataMarkup' and BARCHECK['on']:
            MARKERS.append(('gp', t))
            return None
        if name in ('fin', 'dcf', 'fine'):
            MARKERS.append((name, t))
            return None
        if name in DYN:
            st['dyn'] = DYN[name]
            return None
        if name in ('sf', 'sfz', 'fz', 'sff', 'rfz', 'sfp', 'fp', 'accent', 'marcato'):
            if notes and notes[-1]['t'] == t - notes[-1]['d'] or notes:
                for n in notes[-3:]:
                    if n['t'] + n['d'] >= t - F(1, 1000) and n['t'] < t:
                        n['mk'] += '>'
            if name in ('sfp', 'fp'):
                st['dyn'] = DYN['p']
            return None
        if name in ('staccato', 'staccatissimo'):
            for n in notes[-3:]:
                if n['t'] < t <= n['t'] + n['d'] + F(1, 1000):
                    n['mk'] += "'"
            return None
        if name == 'fermata':
            for n in notes[-4:]:
                if n['t'] < t <= n['t'] + n['d'] + F(1, 1000):
                    n['mk'] += '^'
            return None
        if name in ('trill', 'prall', 'mordent', 'turn', 'prallprall'):
            for n in notes[-3:]:
                if n['t'] < t <= n['t'] + n['d'] + F(1, 1000):
                    n['mk'] += '~'
            return None
        if name in ('repeat',):
            kind = p.next()
            count = int(p.next())
            if p.peek() == '{':
                p.next()
                body_start = p.i
                return do_repeat(kind, count, body_start, t, scale, grace)
            # { } のない形 (\\repeat tremolo 8 d16 / \\repeat unfold 4 <c e>8 など): 次の音符か和音 1 つをくり返す
            body = []
            if p.peek() == '<':
                while p.peek() not in (None, '>'):
                    body.append(p.next())
                body.append(p.next())
                if p.peek() and re.match(r'^\d+\.*$', p.peek()):
                    body.append(p.next())
            elif p.peek() is not None:
                body.append(p.next())
            # 1 回だけ読み、写して並べる
            save_t, save_i = p.t, p.i
            p.t, p.i = list(body), 0
            before = len(notes)
            te = seq(t, scale, grace, end=None)
            p.t, p.i = save_t, save_i
            seg = notes[before:]
            del notes[before:]
            step = te - t
            for k in range(count):
                for n in seg:
                    notes.append(dict(n, t=n['t'] + step * k))
            return t + step * count
        if name == 'afterGrace':
            # \\afterGrace 主音 { 装飾音 }: 装飾音は主音の終わりぎわに、時間をとらずに
            before = len(notes)
            tok = p.next()
            r = t
            m = NOTE_RE.match(tok or '')
            if m:
                q = resolve(m.group(1), m.group(2))
                d = dur_of(m.group(3), st['dur'])
                if m.group(3):
                    st['dur'] = d
                add_note(t, d * scale, q, grace, 1)
                r = t + d * scale
            if p.peek() == '{':
                p.next()
                gb = len(notes)
                seq(r, F(1), True)
                gs = notes[gb:]
                for j, n in enumerate(gs):
                    n['t'] = r - F(1, 8) + F(1, 8) * j / max(1, len(gs))
                    n['d'] = F(1, 8) / max(1, len(gs))
                    n['mk'] += 'g'
            return r
        if name == 'scaleDurations':
            # \\scaleDurations #'(2 . 3) { … }
            arg = p.next() or ''
            m = re.search(r'(\d+)\s*\.\s*(\d+)', arg)
            ratio = F(int(m.group(1)), int(m.group(2))) if m else F(1)
            if p.peek() == '{':
                p.next()
                return seq(t, scale * ratio, grace)
            return None
        if name in ('tuplet', 'times'):
            frac = p.next()
            a, b = (int(x) for x in frac.split('/'))
            ratio = F(b, a) if name == 'tuplet' else F(a, b)
            if p.peek() and re.match(r'^\d+\.*$', p.peek()):
                p.next()  # \tuplet 3/2 8 { } の区切りの長さ
            if p.peek() == '{':
                p.next()
                return seq(t, scale * ratio, grace)
            return None
        if name in ('grace', 'acciaccatura', 'appoggiatura', 'slashedGrace'):
            # 装飾音: 時間をとらない短い音として、次の音の直前に置く
            before = len(notes)
            if p.peek() == '{':
                p.next()
                seq(t, F(1), True)
            elif p.peek() == '<':
                # 和音の装飾音: < … >8
                sub = []
                while p.peek() not in (None, '>'):
                    sub.append(p.next())
                sub.append(p.next())
                if p.peek() and re.match(r'^\d+\.*$', p.peek()):
                    sub.append(p.next())
                save_t, save_i = p.t, p.i
                p.t, p.i = sub, 0
                seq(t, F(1), True, end=None)
                p.t, p.i = save_t, save_i
            else:
                tok = p.next()
                m = NOTE_RE.match(tok)
                if m:
                    add_note(t, F(1, 8), resolve(m.group(1), m.group(2)), True, 1)
            gs = notes[before:]
            k = len(gs)
            for j, n in enumerate(gs):
                n['t'] = t - F(1, 8) * (k - j) / max(1, k) * F(1, 1)
                n['d'] = F(1, 8) / max(1, k)
                n['mk'] += 'g'
            return None
        if name == 'relative':
            # \relative c' { ... }
            ref = 60
            if p.peek() and NOTE_RE.match(p.peek()):
                m = NOTE_RE.match(p.next())
                save = st['rel']
                st['rel'] = None
                ref = resolve(m.group(1), m.group(2))
                st['rel'] = save
            old = st['rel']
            st['rel'] = ref
            if p.peek() == '{':
                p.next()
                r = seq(t, scale, grace)
            else:
                r = t
            st['rel'] = old
            return r
        if name == 'absolute':
            old = st['rel']
            st['rel'] = None
            if p.peek() == '{':
                p.next()
                r = seq(t, scale, grace)
            else:
                r = t
            st['rel'] = old
            return r
        if name in ('transpose',):
            p.next()
            p.next()
            return None
        if name in ('partial',):
            p.next()
            return None
        if name in ('alternative',):
            # do_repeat の中で読む。ここに来るのは対応していない形
            p.skip_arg()
            return None
        if name in ('override', 'revert', 'set', 'unset', 'once', 'tweak'):
            # \override A.b.c = #値 / \set x = #値 / \revert A.b / \tweak a #b
            if name == 'once':
                return None
            if name == 'tweak':
                p.next()
                p.next()
                return None
            # 名前 (A.b.c) を読み、= があれば値も読む
            p.next()
            while p.peek() == '.':
                p.next()
                p.next()
            if p.peek() == '=':
                p.next()
                p.skip_arg()
            return None
        if name in ('clef', 'time', 'bar', 'ottava', 'tupletSpan', 'mark', 'tempo', 'key', 'markup', 'barNumberCheck', 'change'):
            if name == 'key':
                p.next()
                p.next()
            elif name == 'tempo':
                # \tempo "文字" 4 = 72 / \tempo 4 = 72。速さは 4 分音符の bpm に直して記録する
                if p.peek() and p.peek().startswith('"'):
                    p.next()
                if p.peek() and re.match(r'^\d+\.*$', p.peek()):
                    unit = dur_of(p.next(), F(1))
                    if p.peek() == '=':
                        p.next()
                        v = p.next()
                        m = re.match(r'^(\d+)', v or '')
                        if m:
                            MARKERS.append(('tempo', t, float(unit * int(m.group(1)))))
            elif name == 'markup':
                p.skip_arg()
            elif name == 'mark' and p.peek() == '\\markup':
                p.next()
                p.skip_arg()
            elif name == 'time':
                p.next()
            elif name == 'change':
                p.next()
                p.next()
                p.next()
            else:
                p.skip_arg()
            return None
        if name in ('new', 'context'):
            p.next()
            if p.peek() == '=':
                p.next()
                p.next()
            if p.peek() == '\\with':
                p.next()
                p.skip_arg()
            return None
        if name in self_vars():
            # 変数の音楽をその場で読む
            sub = tokenize(variables[name])
            save_t, save_i = p.t, p.i
            p.t = sub
            p.i = 0
            r = seq(t, scale, grace, end=None)
            p.t, p.i = save_t, save_i
            return r
        # 知らない命令は、引数をとらないものとして読み飛ばす
        return None

    def self_vars():
        return variables

    def do_repeat(kind, count, body_start, t, scale, grace):
        """くり返し。本体と \\alternative は書かれた順に 1 回だけ読み (相対音高と省いた長さは
        LilyPond と同じく書かれた順で決まる)、できた音符を写して並べる"""
        before = len(notes)
        t_after = seq(t, scale, grace)
        body = notes[before:]
        del notes[before:]
        blen = t_after - t
        alts = []
        if p.peek() == '\\alternative':
            p.next()
            p.next()  # {
            while p.peek() == '{':
                p.next()
                b2 = len(notes)
                te = seq(F(0), scale, grace)
                alts.append((notes[b2:], te))
                del notes[b2:]
            p.next()  # }
        cur = t
        n_alt = len(alts)
        for k in range(count):
            for n in body:
                notes.append(dict(n, t=n['t'] - t + cur))
            cur += blen
            if n_alt:
                # 回数より選択肢が少ないときは、最初の選択肢を繰り返す
                idx = max(0, min(n_alt - 1, k - (count - n_alt)))
                an, al = alts[idx]
                for n in an:
                    notes.append(dict(n, t=n['t'] + cur))
                cur += al
        return cur

    def resolve(name, octs):
        if st['rel'] is None:
            return pitch_of(name, octs)
        # 相対: 前の音から 4 度以内で一番近い音
        prev = st['rel']
        base = NOTE[name[0]]
        cand_pc = pitch_of(name, '') - 48  # 0〜11 (+ 変化記号)
        prev_step = step_of(prev)
        steps = [0, 1, 2, 3, 4, 5, 6]
        letter = 'cdefgab'.index('b' if name[0] == 'h' else name[0])
        # 前の音の音名の段 (オクターブ込み)
        diff = letter - prev_step % 7
        if diff > 3:
            diff -= 7
        elif diff < -3:
            diff += 7
        new_step = prev_step + diff + 7 * (octs.count("'") - octs.count(','))
        octave = new_step // 7
        q = 12 * octave + cand_pc
        st['rel'] = q
        st['rel_step'][q] = new_step
        return q

    st['rel_step'] = {}

    def step_of(q):
        if q in st['rel_step']:
            return st['rel_step'][q]
        # 音の番号から「ドレミの段 (C0 = 0)」を推し量る
        pc = q % 12
        letter = {0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6}[pc]
        return (q // 12) * 7 + letter

    def add_note(t, d, q, grace, chord):
        if q is None:
            return None
        n = {'t': t, 'd': d, 'p': q, 'v': st['dyn'], 'mk': '', 'chord': chord}
        # タイ: 前の同じ高さの音が tie で、ちょうど今で終わるなら延ばす
        for m in reversed(notes[-12:]):
            if m.get('tie') and m['p'] == q and m['t'] + m['d'] == t:
                m['d'] += d
                m['tie'] = False
                return m
        notes.append(n)
        return n

    end = seq(F(0), F(1), False, end=None)
    for n in notes:
        n.pop('tie', None)
    return notes, end


def extract_block(src, start_pat):
    """start_pat のあとの { ... } を取り出す"""
    m = re.search(start_pat, src)
    if not m:
        raise SystemExit('not found: ' + start_pat)
    i = src.index('{', m.end() - 1)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == '{':
            depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    raise SystemExit('unbalanced')


def read_variables(src):
    """name = { ... } / name = \\relative c' { ... } の形の変数"""
    out = {}
    # name = { … } のほか、name = \\new Voice = "x" \\relative c' { … } のように命令が前につくもの
    pre_re = r'(?:\\(?:relative(?:\s+[a-h](?:is|es|sharp|flat|s|f|x)*[\',]*)?|new\s+\w+(?:\s*=\s*"[^"]*")?|context\s+\w+(?:\s*=\s*"[^"]*")?|transpose\s+\S+\s+\S+|fixed\s+\S+)\s*)*'
    for m in re.finditer(r'^[ \t]*([A-Za-z]+)\s*=\s*(' + pre_re + r')\{', src, re.M):
        i = src.index('{', m.end() - 1)
        depth = 0
        for j in range(i, len(src)):
            if src[j] == '{':
                depth += 1
            elif src[j] == '}':
                depth -= 1
                if depth == 0:
                    body = src[i:j + 1]
                    out[m.group(1)] = (m.group(2) or '') + body
                    break
    return out


def encode(notes, ppq):
    # [拍 × ppq の整数, 長さ, 高さ, 強弱, 記号] を「t,d,p,v[,mk];」の文字に
    parts = []
    prev = 0
    for n in sorted(notes, key=lambda n: (n['t'], n['p'])):
        t = int(round(n['t'] * ppq))
        d = max(1, int(round(n['d'] * ppq)))
        s = f"{t - prev},{d},{n['p']},{n['v']}"
        mk = ''.join(sorted(set(n['mk'])))
        if mk:
            s += ',' + mk
        parts.append(s)
        prev = t
    return ';'.join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--music', action='append', required=True, help='音楽の文字列 (変数名なら \\name)。パートごとに 1 つ')
    ap.add_argument('--offset', type=float, default=0, help='全体を何拍ずらすか (弱起)')
    args = ap.parse_args()
    src = strip_comments(open(args.src, encoding='utf-8').read())
    lm = re.search(r'\\language\s+"(\w+)"', src)
    if lm:
        LANG['name'] = lm.group(1)
    if re.search(r'\\include\s+"english\.ly"', src):
        LANG['name'] = 'english'
    variables = read_variables(src)
    res = []
    for mus in args.music:
        if mus.startswith('block:'):
            text = extract_block(src, mus[6:])
        else:
            text = mus
        notes, end = parse_music(tokenize(text), variables)
        res.append({'notes': notes, 'end': end})
    json.dump([{'n': len(r['notes']), 'end': float(r['end']), 'data': encode(r['notes'], 96)} for r in res], sys.stdout)


if __name__ == '__main__':
    main()
