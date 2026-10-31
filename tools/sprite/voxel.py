"""正面のドット絵に疑似的な厚みを付けてボクセルにし、縦の軸のまわりに回して横向きなどの絵を作る。

スプライト作成ツールの「横向きにする」の段階は、このファイルをブラウザの中の Python (Pyodide) で
そのまま動かしている。コマンドラインからも使える (Pillow が必要):

    python voxel.py 正面.png 横向き.png --angle 90
    python voxel.py 正面.png 回転シート.png --sheet 8      # 8 方向を横に並べる

しくみ:
  1. 不透明なマスごとに、いちばん近い透明なマス (絵のふち) までの距離を測る。
  2. ふちに近いほど薄く、内側ほど厚くなるように、マスごとの厚みを決める (丸み 0 なら板のように一定)。
     厚みは前後に同じだけ付けるので、絵の真ん中の面をはさんで前後対称の立体になる。
  3. 立体を縦の軸のまわりに回し、真横から平行に見て、いちばん手前の面の色を塗る。
     マスの色はそのマスの柱全体 (前の面・後ろの面・横の面) に使う。裏側は正面と同じ色になる。
外部のライブラリは使わない (Pyodide に追加の読みこみをさせないため)。
"""
import math

# 1 マス斜めに進むときの距離 (3-4 チャンファー距離を 3 で割って px にする)
_ORTHO = 3
_DIAG = 4


def distance_to_edge(w, h, opaque):
    """不透明なマスごとに、いちばん近い透明なマス (画像の外も透明とみなす) までのおおよその距離 (px)。"""
    big = 10 ** 9
    d = [big if o else 0 for o in opaque]

    def get(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return 0
        return d[y * w + x]

    for y in range(h):
        for x in range(w):
            i = y * w + x
            if d[i]:
                d[i] = min(d[i], get(x - 1, y) + _ORTHO, get(x, y - 1) + _ORTHO,
                           get(x - 1, y - 1) + _DIAG, get(x + 1, y - 1) + _DIAG)
    for y in range(h - 1, -1, -1):
        for x in range(w - 1, -1, -1):
            i = y * w + x
            if d[i]:
                d[i] = min(d[i], get(x + 1, y) + _ORTHO, get(x, y + 1) + _ORTHO,
                           get(x + 1, y + 1) + _DIAG, get(x - 1, y + 1) + _DIAG)
    return [v / _ORTHO for v in d]


class Model:
    """厚みを付けた立体。マス (x, y) は、前後に half[i] ずつの厚みを持つ柱になる。"""

    def __init__(self, w, h, rgba, thickness, roundness):
        self.w, self.h = w, h
        self.colors = [tuple(rgba[i * 4:i * 4 + 3]) for i in range(w * h)]
        opaque = [rgba[i * 4 + 3] >= 128 for i in range(w * h)]
        dist = distance_to_edge(w, h, opaque)
        top = max(0.5, thickness / 2)  # いちばん厚いところの、前後それぞれの厚み
        self.half = []
        for i in range(w * h):
            if not opaque[i]:
                self.half.append(0.0)
                continue
            # ふちから top px 入ったところで厚みがいちばん厚くなる、断面が円の形
            s = min(1.0, max(0.0, dist[i] - 0.5) / top)
            circle = math.sqrt(max(0.0, 1 - (1 - s) ** 2))
            v = top * ((1 - roundness) + roundness * circle)
            self.half.append(max(0.5, v))
        # 輪郭線のある絵なら、線のマスの横の面には、同じ行のとなりの線でない色を使う
        # (腕と胴のあいだの線などが、横から見て太い黒い帯にならないように)
        self.outline = find_outline(w, h, self.colors, opaque)
        side = list(self.colors)
        if self.outline:
            line = [opaque[i] and _near(self.colors[i], self.outline) for i in range(w * h)]
            for y in range(h):
                for x in range(w):
                    if line[y * w + x]:
                        side[y * w + x] = _row_fill(w, y, x, opaque, line, self.colors)
        # 行ごとに、立体のある柱だけを並べておく [(x, half, 前後の面の色, 横の面の色), ...]
        self.rows = []
        for y in range(h):
            row = []
            for x in range(w):
                i = y * w + x
                if self.half[i] > 0:
                    row.append((x, self.half[i], self.colors[i], side[i]))
            self.rows.append(row)

    def outline_hex(self):
        """見つけた輪郭線の色 ("#rrggbb")。輪郭線がなければ空の文字列。"""
        return "#%02x%02x%02x" % self.outline if self.outline else ""

    def extent(self, angle):
        """その角度で見たときの、真ん中から左右への広がり (px)。"""
        r = _axes(angle)[0]
        cx = self.w / 2
        m = 0.0
        for row in self.rows:
            for x, hz, _, _ in row:
                for px in (x - cx, x + 1 - cx):
                    for pz in (-hz, hz):
                        m = max(m, abs(px * r[0] + pz * r[1]))
        return m

    def max_width(self):
        """どの角度で見ても収まる横幅 (px)。角度を動かしても絵の大きさが変わらないようにするときに使う。"""
        cx = self.w / 2
        m = 0.0
        for row in self.rows:
            for x, hz, _, _ in row:
                px = max(abs(x - cx), abs(x + 1 - cx))
                m = max(m, math.hypot(px, hz))
        return self._even(m)

    def frame_width(self, angles):
        """いくつかの角度で同じ大きさのコマにするときの横幅 (px)。"""
        return self._even(max((self.extent(a) for a in angles), default=0))

    def _even(self, m):
        width = max(1, math.ceil(m * 2 - 1e-6))
        # 正面の絵と真ん中がずれないように、横幅の偶数・奇数をもとの絵に合わせる
        if (width - self.w) % 2:
            width += 1
        return width

    def render(self, angle, width=None, shade=0.35, outline=True):
        """縦の軸のまわりに angle 度回したところを真横から見た絵 (RGBA の bytes)。

        angle が 0 で正面、90 で右向き (正面の絵の左側のふちが見える)、180 で後ろ向き。
        shade は横を向いた面をどれだけ暗くするか (0 で暗くしない)。
        outline が真で、もとの絵に輪郭線があれば、できた絵のふちにも同じ色の線を引き直す。
        """
        w, h = self.w, self.h
        if width is None:
            width = self.frame_width([angle])
        r, d = _axes(angle)
        cx = w / 2
        out = bytearray(width * h * 4)
        far = float("inf")
        for y in range(h):
            depth = [far] * width
            for x, hz, front, flank in self.rows[y]:
                x0, x1 = x - cx, x + 1 - cx
                us = [px * r[0] + pz * r[1] for px in (x0, x1) for pz in (-hz, hz)]
                i0 = max(0, math.floor(min(us) + width / 2))
                i1 = min(width - 1, math.ceil(max(us) + width / 2) - 1)
                for i in range(i0, i1 + 1):
                    u = i + 0.5 - width / 2
                    hit = _enter(u, r, d, x0, x1, hz)
                    if hit is None:
                        continue
                    t, side = hit
                    if t >= depth[i]:
                        continue
                    depth[i] = t
                    # 面の向き (見る向きに対して) で明るさを変える
                    if side:
                        facing, color = abs(d[0]), flank
                    else:
                        facing, color = abs(d[1]), front
                    k = 1 - shade * (1 - facing)
                    j = (y * width + i) * 4
                    out[j] = min(255, round(color[0] * k))
                    out[j + 1] = min(255, round(color[1] * k))
                    out[j + 2] = min(255, round(color[2] * k))
                    out[j + 3] = 255
        if outline and self.outline:
            _redraw_outline(out, width, h, self.outline)
        return bytes(out)

    def sheet(self, angles, shade=0.35, outline=True):
        """いくつかの角度のコマを、同じ大きさで左から順に並べた絵。(RGBA の bytes, 横幅, 縦幅)"""
        fw = self.frame_width(angles)
        frames = [self.render(a, fw, shade, outline) for a in angles]
        n, h = len(frames), self.h
        out = bytearray(fw * n * h * 4)
        for k, f in enumerate(frames):
            for y in range(h):
                src = f[y * fw * 4:(y + 1) * fw * 4]
                dst = (y * fw * n + k * fw) * 4
                out[dst:dst + fw * 4] = src
        return bytes(out), fw * n, h


def _neighbors4(w, h, x, y):
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        yield nx, ny, 0 <= nx < w and 0 <= ny < h


def _near(a, b, tol=60):
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) <= tol


def find_outline(w, h, colors, opaque):
    """絵のふち (透明なマスにとなり合うマス) の半分以上が同じ暗い色なら、その色を輪郭線の色とみなす。"""
    count = {}
    edge = 0
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not opaque[i]:
                continue
            if any(not ok or not opaque[ny * w + nx] for nx, ny, ok in _neighbors4(w, h, x, y)):
                edge += 1
                count[colors[i]] = count.get(colors[i], 0) + 1
    if not edge:
        return None
    c, n = max(count.items(), key=lambda kv: kv[1])
    luma = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    if n < edge * 0.5 or luma > 100:
        return None
    return c


def _row_fill(w, y, x, opaque, line, colors):
    """同じ行で、いちばん近い線でない不透明なマスの色。同じ近さなら絵の真ん中に近い側。"""
    toward = 1 if x < w / 2 else -1
    for k in range(1, w):
        for nx in (x + toward * k, x - toward * k):
            if 0 <= nx < w:
                j = y * w + nx
                if opaque[j] and not line[j]:
                    return colors[j]
    return colors[y * w + x]


def _redraw_outline(out, w, h, color):
    """不透明なマスのうち、透明なマス (または絵の外) にとなり合うものを線の色で塗る。"""
    solid = [out[i * 4 + 3] > 0 for i in range(w * h)]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if solid[i] and any(not ok or not solid[ny * w + nx] for nx, ny, ok in _neighbors4(w, h, x, y)):
                out[i * 4:i * 4 + 3] = bytes(color)


def _axes(angle):
    """画面の右向きの向き r と、見る向き d (どちらも立体の (x, z) の座標)。z は正面で手前が正。"""
    a = math.radians(angle)
    return (math.cos(a), math.sin(a)), (math.sin(a), -math.cos(a))


def _enter(u, r, d, x0, x1, hz):
    """画面の横の位置 u から見る向きに進む線が、柱 [x0, x1] × [-hz, hz] に入るところ。

    (進んだ距離, 横の面から入ったか) を返す。当たらないときは None。
    """
    ox, oz = u * r[0], u * r[1]
    t_near, t_far = -float("inf"), float("inf")
    side = False
    for o, dv, lo, hi, is_side in ((ox, d[0], x0, x1, True), (oz, d[1], -hz, hz, False)):
        if abs(dv) < 1e-9:
            if o < lo or o > hi:
                return None
            continue
        ta, tb = (lo - o) / dv, (hi - o) / dv
        if ta > tb:
            ta, tb = tb, ta
        if ta > t_near:
            t_near, side = ta, is_side
        t_far = min(t_far, tb)
        if t_near > t_far:
            return None
    return t_near, side


def build(w, h, rgba, thickness, roundness):
    """ブラウザから呼ぶ入り口。rgba は w * h * 4 の bytes (ブラウザからは Uint8Array)。"""
    if hasattr(rgba, "to_bytes"):
        rgba = rgba.to_bytes()
    return Model(w, h, bytes(rgba), float(thickness), float(roundness))


def _main():
    import argparse

    from PIL import Image

    p = argparse.ArgumentParser(description="正面のドット絵に厚みを付けて回し、横向きなどの絵を作る")
    p.add_argument("src", help="正面のドット絵 (背景が透明な PNG)")
    p.add_argument("out", help="できた絵を保存する PNG")
    p.add_argument("--angle", type=float, default=90, help="回す角度 (度)。0 で正面、90 で右向き、180 で後ろ向き")
    p.add_argument("--sheet", type=int, default=0, help="正面から一周ぶん、この数の方向を横に並べる (4 や 8)。--angle は使わない")
    p.add_argument("--thickness", type=float, default=None, help="いちばん厚いところの厚み (px)。省くと横幅の半分")
    p.add_argument("--round", type=float, default=0.7, help="丸み (0 で板、1 でいちばん丸い)")
    p.add_argument("--shade", type=float, default=0.35, help="横を向いた面を暗くする量 (0〜1)")
    p.add_argument("--no-outline", action="store_true", help="輪郭線を引き直さない")
    p.add_argument("--scale", type=int, default=1, help="保存するときの拡大の倍率")
    a = p.parse_args()

    im = Image.open(a.src).convert("RGBA")
    w, h = im.size
    thickness = a.thickness if a.thickness is not None else max(1.0, w / 2)
    model = build(w, h, im.tobytes(), thickness, a.round)
    if a.sheet:
        data, ow, oh = model.sheet([360 * k / a.sheet for k in range(a.sheet)], a.shade, not a.no_outline)
    else:
        ow, oh = model.frame_width([a.angle]), h
        data = model.render(a.angle, ow, a.shade, not a.no_outline)
    out = Image.frombytes("RGBA", (ow, oh), data)
    if a.scale > 1:
        out = out.resize((ow * a.scale, oh * a.scale), Image.NEAREST)
    out.save(a.out)
    print(f"{a.out}: {ow} x {oh} px")


if __name__ == "__main__":
    _main()
