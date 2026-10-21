#!/usr/bin/env python3
"""
의상 층 자동 추출 (GPT 방식 시험): "몸만 그린 시트"와 "같은 몸에 옷을 입힌 시트"를 비교해서
달라진 도트만 옷 층으로 뽑는다.

  python3 tools/extract-layer.py 몸.png 옷입은.png 결과.png --layout idle

두 그림이 도트 단위로 정확히 겹친다는 보장이 없어서(생성 그림끼리는 1~2도트씩 밀린다),
칸마다 먼저 몸 실루엣을 맞춰 보고 어긋난 정도를 보고한다. 어긋남이 크면 이 방식은 그 칸에서 실패.
"""
import argparse

from PIL import Image

LAYOUTS = {'idle': (4, 1), 'walk': (4, 4)}


def alpha_mask(fr):
    a = fr.getchannel('A').load()
    w, h = fr.size
    return {(x, y) for y in range(h) for x in range(w) if a[x, y] > 16}


def best_shift(a, b, r=3):
    """b를 (dx,dy)만큼 옮겼을 때 a와 가장 많이 겹치는 이동"""
    best = (0, 0, -1.0)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            moved = {(x + dx, y + dy) for x, y in b}
            score = len(a & moved) / max(1, len(a | moved))
            if score > best[2]:
                best = (dx, dy, score)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base')
    ap.add_argument('clothed')
    ap.add_argument('out')
    ap.add_argument('--layout', choices=LAYOUTS, required=True)
    ap.add_argument('--tol', type=int, default=40, help='색 차이 허용 (RGB 거리)')
    ap.add_argument('--align', action='store_true', help='어긋나면 옷 입은 칸을 옮겨서 맞춘다 (보정)')
    args = ap.parse_args()

    base = Image.open(args.base).convert('RGBA')
    clo = Image.open(args.clothed).convert('RGBA')
    if base.size != clo.size:
        raise SystemExit(f'크기 다름: 몸 {base.size} / 옷 {clo.size} — 먼저 pixelize로 같은 칸 크기로 맞출 것')
    cols, rows = LAYOUTS[args.layout]
    fw, fh = base.width // cols, base.height // rows
    out = Image.new('RGBA', base.size, (0, 0, 0, 0))
    bad = 0
    for i in range(cols * rows):
        box = ((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh)
        bf, cf = base.crop(box), clo.crop(box)
        dx, dy, score = best_shift(alpha_mask(bf), alpha_mask(cf))
        note = ''
        if (dx, dy) != (0, 0):
            if args.align:
                moved = Image.new('RGBA', cf.size, (0, 0, 0, 0))
                moved.paste(cf, (dx, dy))
                cf = moved
                note = ' → 옮겨서 맞춤'
            else:
                bad += 1
                note = ' → 어긋남 (--align 으로 보정 가능)'
        print(f'칸 {i}: 실루엣 어긋남 ({dx:+d},{dy:+d}) 겹침 {score:.2f}{note}')
        bp, cp = bf.load(), cf.load()
        layer = Image.new('RGBA', cf.size, (0, 0, 0, 0))
        lp = layer.load()
        kept = 0
        for y in range(fh):
            for x in range(fw):
                c = cp[x, y]
                if c[3] <= 16:
                    continue
                b = bp[x, y]
                diff = abs(c[0] - b[0]) + abs(c[1] - b[1]) + abs(c[2] - b[2]) if b[3] > 16 else 999
                if diff > args.tol:
                    lp[x, y] = c
                    kept += 1
        # 외톨이 도트 제거 (이웃 0개)
        for y in range(fh):
            for x in range(fw):
                if lp[x, y][3] and not any(0 <= x + ex < fw and 0 <= y + ey < fh and lp[x + ex, y + ey][3] for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    lp[x, y] = (0, 0, 0, 0)
        out.paste(layer, box[:2])
    out.save(args.out)
    print(f'\n저장 {args.out} · 어긋난 칸 {bad}/{cols * rows}')
    print('다음: python3 tools/sprite-qa.py 결과.png --layout ... --base 몸.png 으로 몸 밖으로 새는지 확인')


if __name__ == '__main__':
    main()
