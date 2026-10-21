#!/usr/bin/env python3
"""
옷 층을 코드로 칠하기: 확정된 몸 그림의 실루엣을 따라 옷을 칠한다.
몸과 같은 도트 위에만 칠하니 1도트도 안 어긋나고, 몸이 바뀌면 다시 돌리면 된다.

  python3 tools/code-garment.py 몸.png 결과.png --kind tee   --color '#25315c'
  python3 tools/code-garment.py 몸.png 결과.png --kind shirt --color '#f1f1f4'   # 긴팔
  python3 tools/code-garment.py 몸.png 결과.png --kind pants --color '#2b3045'
  python3 tools/code-garment.py 몸.png 결과.png --kind jacket                    # 재킷 자리 (fit-garment용)

몸의 기준선(칸마다 자동으로 찾는다): 목 · 속옷 윗줄 · 속옷 아랫줄 · 발목
- tee: 목~속옷 윗줄 몸통 + 팔 위쪽 / shirt: 목~속옷 윗줄 몸통 + 팔 전체(손 빼고)
- jacket: 목~속옷 가운데 몸통 + 팔 전체 / pants: 속옷 윗줄~발목, 바깥 줄기(팔·손)는 뺀다
명암: 몸 피부의 밝기 순서를 옷 색 4단계로 옮긴다 (빛 방향이 몸과 같다). 바깥선은 옷 색의 가장 어두운 단계.
"""
import argparse
import colorsys

from PIL import Image


def is_skin(c):
    h, l, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
    h *= 360
    return (h <= 50 or h >= 345) and s >= 0.2 and 0.08 < l < 0.97


def lum(c):
    return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11


def ramp_of(hex_):
    r, g, b = int(hex_[1:3], 16) / 255, int(hex_[3:5], 16) / 255, int(hex_[5:7], 16) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    for k in (0.45, 0.78, 1.0, 1.18):
        rr, gg, bb = colorsys.hls_to_rgb(h, max(0, min(1, l * k)), s)
        out.append((round(rr * 255), round(gg * 255), round(bb * 255)))
    return out  # 어두움 → 밝음


def runs_of(xs):
    runs = []
    for x in xs:
        if runs and x == runs[-1][1] + 1:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    return runs


def is_underwear(c):
    return c[3] > 127 and not is_skin(c) and 40 < lum(c) < 150


def landmarks(fr):
    w, h = fr.size
    px = fr.load()
    rows = [[x for x in range(w) if px[x, y][3] > 127] for y in range(h)]
    ys = [y for y in range(h) if rows[y]]
    top, bottom = ys[0], ys[-1]
    width = lambda y: (rows[y][-1] - rows[y][0] + 1) if rows[y] else 0
    widest, neck = top, top + (bottom - top) // 3
    for y in range(top + 2, top + (bottom - top) // 2):
        if width(y - 1) > width(widest):
            widest = y - 1
        if width(y) <= width(widest) * 0.8 and width(y) <= width(y + 1):
            neck = y
            break
    uw = [y for y in range(neck + 2, bottom) if any(is_underwear(px[x, y]) for x in rows[y])]
    uw_top = uw[0] if uw else neck + (bottom - neck) * 4 // 9
    uw_bot = uw[-1] if uw else uw_top + 5
    return px, rows, top, bottom, neck, uw_top, uw_bot


def garment_frame(fr, kind, color, sleeve):
    w, h = fr.size
    px, rows, top, bottom, neck, uw_top, uw_bot = landmarks(fr)
    ramp = ramp_of(color)
    out = Image.new('RGBA', fr.size, (0, 0, 0, 0))
    op = out.load()
    if kind == 'pants':
        y0, y1 = uw_top, bottom - 2
    else:
        y0 = neck + 1
        y1 = uw_top if kind in ('tee', 'shirt') else (uw_top + uw_bot) // 2
    sleeve_end = neck + 2 + int((uw_top - neck) * sleeve) if kind == 'tee' else uw_top + 1
    skin_l = sorted({lum(px[x, y]) for y in range(y0, y1 + 1) for x in rows[y] if is_skin(px[x, y])})

    def shade(c):
        if not skin_l:
            return ramp[2]
        i = sum(1 for v in skin_l if v < lum(c)) / len(skin_l)
        return ramp[min(3, 1 + int(i * 3))]

    for y in range(y0, y1 + 1):
        runs = runs_of(rows[y])
        for x in rows[y]:
            c = px[x, y]
            run = next(r for r in runs if r[0] <= x <= r[1])
            outer = len(runs) >= 3 and (run is runs[0] or run is runs[-1])
            if kind == 'pants':
                if outer:
                    continue  # 손·팔
                if y <= uw_bot and is_skin(c) and len(runs) <= 2:
                    continue  # 옆모습: 속옷 위에 겹친 손은 그대로
            else:
                if is_underwear(c) and kind in ('tee', 'shirt'):
                    continue
                if outer and y > sleeve_end:
                    continue  # 소매 아래 팔
            op[x, y] = (ramp[0] if lum(c) < 60 else shade(c)) + (255,)
    # 끝선: 옷 아래 끝·소매 끝·목둘레에 바깥선
    for y in range(h):
        for x in range(w):
            if not op[x, y][3]:
                continue
            below = op[x, y + 1][3] if y + 1 < h else 0
            above = op[x, y - 1][3] if y > 0 else 0
            if (not below and y + 1 < h and px[x, y + 1][3] > 127) or (not above and y == y0):
                op[x, y] = ramp[0] + (255,)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base')
    ap.add_argument('out')
    ap.add_argument('--kind', default='tee', choices=['tee', 'shirt', 'pants', 'jacket'])
    ap.add_argument('--color', default='#25315c')
    ap.add_argument('--sleeve', type=float, default=0.35, help='tee 소매 길이 (목~속옷 거리 비율)')
    a = ap.parse_args()
    im = Image.open(a.base).convert('RGBA')
    fw = im.width // 4
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for i in range(4):
        out.paste(garment_frame(im.crop((i * fw, 0, i * fw + fw, im.height)), a.kind, a.color, a.sleeve), (i * fw, 0))
    out.save(a.out)
    print('→', a.out)


if __name__ == '__main__':
    main()
