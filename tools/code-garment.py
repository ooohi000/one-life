#!/usr/bin/env python3
"""
옷 층을 코드로 칠하기 (bodygen 방식을 그림 몸에 적용): 확정된 몸 그림의 실루엣을 따라 옷을 칠한다.
몸과 같은 도트 위에만 칠하니 1도트도 안 어긋나고, 몸이 바뀌면 다시 돌리면 된다.

  python3 tools/code-garment.py 몸.png 결과.png --kind tee --color '#25315c' [--sleeve 0.35]

- tee: 목선 아래 ~ 속옷 윗줄까지 몸통 + 팔 위쪽(소매 길이 = 어깨~허리 거리 × sleeve)
명암: 몸 피부의 밝기 순서를 옷 색 4단계로 옮긴다 (몸 그림의 빛 방향을 그대로 따른다). 바깥선은 옷 색의 가장 어두운 단계.
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


def ramp_of(hex_, n=4):
    r, g, b = int(hex_[1:3], 16) / 255, int(hex_[3:5], 16) / 255, int(hex_[5:7], 16) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    for k in (0.45, 0.75, 1.0, 1.25)[:n]:
        rr, gg, bb = colorsys.hls_to_rgb(h, max(0, min(1, l * k)), s)
        out.append((round(rr * 255), round(gg * 255), round(bb * 255)))
    return out  # 어두움 → 밝음


def tee_frame(fr, color, sleeve):
    w, h = fr.size
    px = fr.load()
    solid = lambda x, y: 0 <= x < w and 0 <= y < h and px[x, y][3] > 127
    rows = [[x for x in range(w) if solid(x, y)] for y in range(h)]
    ys = [y for y in range(h) if rows[y]]
    if not ys:
        return Image.new('RGBA', fr.size)
    top, bottom = ys[0], ys[-1]
    width = lambda y: (rows[y][-1] - rows[y][0] + 1) if rows[y] else 0
    # 목: 머리 아래 처음 좁아지는 골짜기
    widest = top
    neck = top + (bottom - top) // 3
    for y in range(top + 2, top + (bottom - top) // 2):
        if width(y - 1) > width(widest):
            widest = y - 1
        if width(y) <= width(widest) * 0.8 and width(y) <= width(y + 1):
            neck = y
            break
    # 속옷 윗줄: 목 아래에서 처음으로 피부 아닌 어두운 회색 도트가 나오는 줄
    waist = None
    for y in range(neck + 2, bottom):
        if any(not is_skin(px[x, y]) and 40 < lum(px[x, y]) < 150 and px[x, y][3] > 127 for x in rows[y][1:-1] if rows[y]):
            waist = y
            break
    if waist is None:
        waist = neck + (bottom - neck) * 4 // 9
    shoulder_w = max(width(y) for y in range(neck, waist))
    sleeve_end = neck + 2 + int((waist - neck) * sleeve)
    # 몸통 범위: 목 아래 줄의 몸통 가운데 폭 (팔은 몸통 바깥 덩어리)
    out = Image.new('RGBA', fr.size, (0, 0, 0, 0))
    op = out.load()
    ramp = ramp_of(color)
    skin_l = sorted({lum(px[x, y]) for y in range(neck, waist + 1) for x in rows[y] if is_skin(px[x, y])})
    def shade(c):
        if not skin_l:
            return ramp[2]
        i = sum(1 for v in skin_l if v < lum(c)) / len(skin_l)
        return ramp[min(3, 1 + int(i * 3))]
    for y in range(neck + 1, waist + 1):
        for x in rows[y]:
            c = px[x, y]
            if not is_skin(c) and lum(c) > 60:
                continue  # 속옷은 그대로
            # 소매 아래 팔: 몸통 덩어리와 떨어진 바깥 줄기는 칠하지 않는다
            if y > sleeve_end:
                runs = []
                for xx in rows[y]:
                    if runs and xx == runs[-1][1] + 1:
                        runs[-1][1] = xx
                    else:
                        runs.append([xx, xx])
                if len(runs) >= 3:
                    mid = max(runs, key=lambda r: r[1] - r[0])
                    if not (mid[0] <= x <= mid[1]):
                        continue
            op[x, y] = shade(c) + (255,)
    # 바깥선: 칠한 영역 가장자리 중 몸 바깥선(어두운 도트)이었던 곳 + 칠한 영역 아래·위 끝
    for y in range(h):
        for x in range(w):
            if op[x, y][3] and lum(px[x, y]) < 60:
                op[x, y] = ramp[0] + (255,)
    for y in range(h):
        for x in range(w):
            if op[x, y][3] and (y == neck + 1 or not op[x, min(h - 1, y + 1)][3] and solid(x, y + 1) and y >= sleeve_end - 1):
                op[x, y] = ramp[0] + (255,)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base')
    ap.add_argument('out')
    ap.add_argument('--kind', default='tee', choices=['tee'])
    ap.add_argument('--color', default='#25315c')
    ap.add_argument('--sleeve', type=float, default=0.35)
    a = ap.parse_args()
    im = Image.open(a.base).convert('RGBA')
    fw = im.width // 4
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for i in range(4):
        out.paste(tee_frame(im.crop((i * fw, 0, i * fw + fw, im.height)), a.color, a.sleeve), (i * fw, 0))
    out.save(a.out)
    print('→', a.out)


if __name__ == '__main__':
    main()
