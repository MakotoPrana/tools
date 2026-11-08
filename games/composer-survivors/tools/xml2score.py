#!/usr/bin/env python3
"""
MusicXML (score-partwise) の譜面を、ly2score.py と同じ形の音符の並びにする。

  notes: [{'t': 拍, 'd': 長さ (拍), 'p': MIDI の高さ, 'v': 強弱 0..5, 'mk': 記号}]

拍は 4 分音符で数える。譜表 (staff) ごとに分けて返す。
- 和音 (<chord/>)、声部の戻り (<backup>/<forward>)、タイ、小さい音符 (cue) も音として数える
- 前打音 (<grace>) は直後の音の少し前に置き、記号 'g' を付ける
- 繰り返し記号は扱わない (使う譜面に無いことを確かめてから使う。あれば止まる)
- 記号: アクセント '>', スタッカート "'", フェルマータ '^', トリル '~', 前打音 'g'
外部のプログラムは実行せず、XML を文字として読むだけ。
"""
import xml.etree.ElementTree as ET
from fractions import Fraction as F

STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
DYN = {'ppp': 0, 'pp': 0, 'p': 1, 'mp': 2, 'mf': 3, 'f': 4, 'ff': 5, 'fff': 5, 'sf': 5, 'sfz': 5, 'fz': 5}
GRACE_LEN = F(1, 8)


def midi(pitch):
    step = pitch.findtext('step')
    alter = int(round(float(pitch.findtext('alter') or 0)))
    octave = int(pitch.findtext('octave'))
    return (octave + 1) * 12 + STEP[step] + alter


def read(path, start_dyn=3):
    root = ET.parse(path).getroot()
    if root.tag != 'score-partwise':
        raise ValueError('score-partwise だけ読める: ' + root.tag)
    if root.find('.//repeat') is not None or root.find('.//ending') is not None:
        raise ValueError('繰り返し記号のある譜面はまだ読めない')
    parts = root.findall('part')
    if len(parts) != 1:
        raise ValueError('パートが 1 つの譜面だけ読める')
    staves = {}
    tempos = []          # [(拍, 4 分音符の bpm, 小節番号, 文字)]
    measures = []        # [(小節番号, 始まり, 長さ)]
    dyn = {}
    open_ties = {}       # (譜表, 声部, 高さ) -> 音
    div = 1
    beats_per_bar = F(4)
    m_start = F(0)
    for m in parts[0].findall('measure'):
        cur = F(0)
        far = F(0)
        last_start = F(0)
        pending_grace = []
        for el in m:
            if el.tag == 'attributes':
                if el.findtext('divisions'):
                    div = int(el.findtext('divisions'))
                tm = el.find('time')
                if tm is not None:
                    beats_per_bar = F(int(tm.findtext('beats')) * 4, int(tm.findtext('beat-type')))
            elif el.tag == 'backup':
                cur -= F(int(el.findtext('duration')), div)
            elif el.tag == 'forward':
                cur += F(int(el.findtext('duration')), div)
                far = max(far, cur)
            elif el.tag == 'direction':
                st = el.findtext('staff')
                for dy in el.iter('dynamics'):
                    for c in dy:
                        if c.tag in DYN:
                            for s in ([st] if st else list(staves) or ['1', '2']):
                                dyn[s] = DYN[c.tag]
                snd = el.find('sound')
                if snd is not None and snd.get('tempo'):
                    w = ' '.join((x.text or '').strip() for x in el.iter('words'))
                    tempos.append((m_start + cur, float(snd.get('tempo')), m.get('number'), w))
            elif el.tag == 'sound' and el.get('tempo'):
                tempos.append((m_start + cur, float(el.get('tempo')), m.get('number'), ''))
            elif el.tag == 'note':
                staff = el.findtext('staff') or '1'
                voice = el.findtext('voice') or '1'
                is_chord = el.find('chord') is not None
                grace = el.find('grace') is not None
                dur = F(int(el.findtext('duration') or 0), div)
                t = last_start if is_chord else cur
                pitch = el.find('pitch')
                if not is_chord and not grace:
                    last_start = cur
                    cur += dur
                    far = max(far, cur)
                if pitch is None:
                    continue
                if grace:
                    # 前打音: 後で直後の音の前に置く
                    pending_grace.append((staff, voice, midi(pitch)))
                    continue
                p = midi(pitch)
                ties = {x.get('type') for x in el.findall('tie')}
                key = (staff, voice, p)
                if 'stop' in ties and key in open_ties:
                    n = open_ties.pop(key)
                    n['d'] += dur
                    if 'start' in ties:
                        open_ties[key] = n
                    continue
                mk = ''
                for a in el.iter():
                    if a.tag in ('accent', 'strong-accent'):
                        mk += '>'
                    elif a.tag in ('staccato', 'staccatissimo'):
                        mk += "'"
                    elif a.tag == 'fermata':
                        mk += '^'
                    elif a.tag in ('trill-mark', 'tremolo'):
                        mk += '~'
                n = {'t': m_start + t, 'd': dur, 'p': p, 'v': dyn.get(staff, start_dyn), 'mk': mk, 'chord': 1}
                staves.setdefault(staff, []).append(n)
                if 'start' in ties:
                    open_ties[key] = n
                if pending_grace:
                    k = len(pending_grace)
                    for i, (gs, gv, gp) in enumerate(pending_grace):
                        gt = n['t'] - GRACE_LEN * (k - i)
                        staves.setdefault(gs, []).append(
                            {'t': gt, 'd': GRACE_LEN, 'p': gp, 'v': n['v'], 'mk': 'g', 'chord': 1})
                    pending_grace = []
        length = far
        if m.get('implicit') != 'yes' and length != beats_per_bar:
            print(f'  小節 {m.get("number")}: 長さ {length} 拍 (拍子は {beats_per_bar} 拍)')
        measures.append((m.get('number'), m_start, length))
        m_start += length
    if open_ties:
        print('  閉じていないタイ', len(open_ties))
    for s in staves.values():
        s.sort(key=lambda n: (n['t'], n['p']))
        for n in s:
            n['t'] = float(n['t'])
            n['d'] = float(n['d'])
    return {'staves': staves, 'tempos': tempos, 'measures': measures, 'end': float(m_start)}
