#!/usr/bin/env python3
"""
Mutopia Project の MIDI から、道中の曲 (scores/k545.js) を作る。

  python3 -I tools/build_k545.py K545-1.mid

元の譜面: Mutopia Project "Sonata in C Major, K. 545, 1st movement" (Alejandro Sierra, CC BY-SA 3.0)
  https://www.mutopiaproject.org/ftp/MozartWA/KV545/K545-1/
提示部の繰り返し (1〜28 小節) を元の形に戻す。scores/k545.js も CC BY-SA 3.0。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import midi2json as M  # noqa: E402


def main(mid):
    div, tempos, tracks = M.parse(mid)
    rh, lh = tracks[1], tracks[2]
    expo = 28 * 4 * div  # 提示部の終わり

    def expand(notes):
        a = [n for n in notes if n[0] < expo]
        b = [n for n in notes if n[0] >= expo]
        return a + [(s + expo, d, p, v) for (s, d, p, v) in a] + [(s + expo, d, p, v) for (s, d, p, v) in b]

    def enc(notes):
        # 拍の 1/96 で数える: 始まり,長さ,高さ,強さ(0-9)
        out = []
        for s, d, p, v in sorted(expand(notes)):
            out.append('%d,%d,%d,%d' % (round(s * 96 / div), round(d * 96 / div), p, min(9, v * 10 // 128)))
        return ';'.join(out)

    bpm = round(60e6 / tempos[0][1])
    js = """// ピアノソナタ第 16 番 ハ長調 K. 545 第 1 楽章 (モーツァルト)。提示部の繰り返しつき
// 元の譜面: Mutopia Project (Alejandro Sierra), Creative Commons Attribution-ShareAlike 3.0
//   https://www.mutopiaproject.org/ftp/MozartWA/KV545/K545-1/
// このファイルも CC BY-SA 3.0。tools/build_k545.py で作ったもの。手で直さない
window.BB_SONGS = window.BB_SONGS || {};
window.BB_SONGS.k545 = {
  title: 'ピアノソナタ第16番 K.545 第1楽章',
  bpm: %d,
  beatsPerBar: 4,
  lengthBeats: %d,
  ppq: 96,
  parts: [
    { name: 'rh', melody: true, data: "%s" },
    { name: 'lh', data: "%s" },
  ],
};
""" % (bpm, (28 + 28 + 45) * 4, enc(rh), enc(lh))
    open(os.path.join(HERE, '..', 'scores', 'k545.js'), 'w').write(js)


if __name__ == '__main__':
    main(sys.argv[1])
