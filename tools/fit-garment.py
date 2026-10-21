#!/usr/bin/env python3
"""
옷 디자인 그림(GPT, 옷만 4방향) → 확정된 몸 좌표에 맞춘 옷 층.

  python3 tools/fit-garment.py 몸.png 옷디자인.png 자리.png 결과.png

- 자리.png: 옷이 덮을 자리 (code-garment.py 결과 — 확정 몸 실루엣에서 나온다)
- 옷디자인.png: GPT가 그린 옷만 있는 큰 그림 (1줄×4칸, 흰 배경 또는 투명)
칸마다: 디자인을 자리의 크기로 줄여 얹고 → 자리 밖은 잘라내고 → 빈 곳은 자리(코드 옷) 색으로 메우고 → 바깥선을 다시 긋는다.
몸 그림은 절대 건드리지 않는다. 디자인이 몸과 안 맞아도 결과는 항상 몸 좌표 안에만 있다.
"""
import argparse
import importlib.util
import os

from PIL import Image

_spec = importlib.util.spec_from_file_location('pixelize', os.path.join(os.path.dirname(__file__), 'pixelize.py'))
px_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(px_mod)


def lum(c):
    return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('body')
    ap.add_argument('design')
    ap.add_argument('slot')
    ap.add_argument('out')
    ap.add_argument('--colors', type=int, default=16)
    a = ap.parse_args()
    body = Image.open(a.body).convert('RGBA')
    slot = Image.open(a.slot).convert('RGBA')
    design = px_mod.remove_bg(Image.open(a.design).convert('RGBA'), 60)
    fw, fh = body.width // 4, body.height
    dw = design.width / 4
    out = Image.new('RGBA', body.size, (0, 0, 0, 0))
    for i in range(4):
        s = slot.crop((i * fw, 0, i * fw + fw, fh))
        box = s.getbbox()
        if not box:
            continue
        cell = design.crop((int(i * dw), 0, int((i + 1) * dw), design.height))
        cbox = cell.getbbox()
        if not cbox:
            continue
        tw, th = box[2] - box[0], box[3] - box[1]
        small = px_mod.down_mode(cell.crop(cbox), tw, th, a.colors)
        sp, mp = s.load(), small.load()
        layer = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        lp = layer.load()
        dark = None
        for y in range(fh):
            for x in range(fw):
                if sp[x, y][3] < 128:
                    continue  # 자리 밖은 버린다
                gx, gy = x - box[0], y - box[1]
                c = mp[gx, gy] if 0 <= gx < tw and 0 <= gy < th else (0, 0, 0, 0)
                lp[x, y] = c if c[3] >= 128 else sp[x, y]  # 디자인이 비면 코드 옷으로
                if dark is None or lum(lp[x, y]) < lum(dark):
                    dark = lp[x, y]
        # 바깥선: 자리 가장자리는 가장 어두운 색으로
        for y in range(fh):
            for x in range(fw):
                if lp[x, y][3] and any(not (0 <= x + dx < fw and 0 <= y + dy < fh) or sp[x + dx, y + dy][3] < 128 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    lp[x, y] = dark
        out.paste(layer, (i * fw, 0))
    out.save(a.out)
    print('→', a.out)


if __name__ == '__main__':
    main()
