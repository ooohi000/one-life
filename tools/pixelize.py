#!/usr/bin/env python3
"""
GPT가 그린 그림 → 게임에 바로 쓰는 진짜 도트로.
AI 그림은 '도트처럼 보이는 큰 그림'이라 픽셀 크기가 들쭉날쭉하고, 배경이 차 있고, 색이 수천 개다.
이 스크립트가: 배경 지우기 → 정해진 도트 크기로 줄이기(칸 가운데 색을 집어 온다) → 색 수 줄이기.

  # 캐릭터 시트 (4×4칸, 칸마다 16×32) → src/ui/art/chars/player_work.png (64×128)
  python3 tools/pixelize.py gpt_player.png src/ui/art/chars/player_work.png --size 64x128

  # 매장 배경 (320×192, 배경 지우기 없음)
  python3 tools/pixelize.py gpt_store.png src/ui/art/scenes/store.png --size 320x192 --keep-bg

  # 건물 하나 (폭만 정하면 높이는 비율대로)
  python3 tools/pixelize.py gpt_villa.png src/ui/art/street/villa.png --width 124

  # 물건 아이콘 4×4 격자 → 16개 파일
  python3 tools/pixelize.py gpt_items.png src/ui/art/items --slice 4x4 --cell 16 \
      --names kimbap,dosirak,ramen,sandwich,cola,coffee,water,energy,chips,icecream,gum,cigarette,soju,beer,umbrella,battery
"""
import argparse
import os
from PIL import Image


def remove_bg(img: Image.Image, tol: int) -> Image.Image:
    """네 모서리 색과 비슷한, 바깥에서 이어진 영역을 투명하게 (흰·체크무늬 배경)"""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    if all(px[x, y][3] < 10 for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]):
        return img  # 이미 투명
    seeds = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    near = lambda c: any(sum(abs(c[i] - s[i]) for i in range(3)) <= tol for s in seeds)
    seen = bytearray(w * h)
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        if not near(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return img


def trim(img: Image.Image) -> Image.Image:
    box = img.getbbox()
    return img.crop(box) if box else img


def down(img: Image.Image, tw: int, th: int) -> Image.Image:
    """칸마다 가운데 색을 집어 온다 (가장자리 번짐 없이)"""
    w, h = img.size
    src = img.load()
    out = Image.new('RGBA', (tw, th))
    o = out.load()
    for y in range(th):
        for x in range(tw):
            sx = min(w - 1, int((x + 0.5) * w / tw))
            sy = min(h - 1, int((y + 0.5) * h / th))
            c = src[sx, sy]
            o[x, y] = c if c[3] >= 128 else (0, 0, 0, 0)
    return out


def quantize(img: Image.Image, colors: int) -> Image.Image:
    alpha = img.getchannel('A')
    q = img.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert('RGBA')
    q.putalpha(alpha.point(lambda a: 255 if a >= 128 else 0))
    return q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--size', help='WxH 최종 크기')
    ap.add_argument('--width', type=int, help='폭만 (높이는 비율대로, 배경 지우고 여백 자른 뒤)')
    ap.add_argument('--keep-bg', action='store_true')
    ap.add_argument('--tol', type=int, default=60, help='배경색 허용 오차')
    ap.add_argument('--colors', type=int, default=32)
    ap.add_argument('--slice', help='CxR 격자로 잘라 여러 파일로')
    ap.add_argument('--cell', type=int, default=16)
    ap.add_argument('--names', help='잘린 칸 이름 (쉼표)')
    a = ap.parse_args()
    img = Image.open(a.src).convert('RGBA')
    if not a.keep_bg:
        img = remove_bg(img, a.tol)

    if a.slice:
        cols, rows = map(int, a.slice.split('x'))
        names = a.names.split(',') if a.names else [f'{i:02d}' for i in range(cols * rows)]
        os.makedirs(a.dst, exist_ok=True)
        cw, ch = img.width / cols, img.height / rows
        for i, name in enumerate(names[: cols * rows]):
            cx, cy = i % cols, i // cols
            cell = trim(img.crop((int(cx * cw), int(cy * ch), int((cx + 1) * cw), int((cy + 1) * ch))))
            s = a.cell / max(cell.width, cell.height)
            small = down(cell, max(1, round(cell.width * s)), max(1, round(cell.height * s)))
            canvas = Image.new('RGBA', (a.cell, a.cell))
            canvas.paste(small, ((a.cell - small.width) // 2, a.cell - small.height))
            quantize(canvas, a.colors).save(os.path.join(a.dst, f'{name}.png'))
            print('→', os.path.join(a.dst, f'{name}.png'))
        return

    if a.size:
        tw, th = map(int, a.size.split('x'))
    elif a.width:
        if not a.keep_bg:
            img = trim(img)
        tw = a.width
        th = round(img.height * a.width / img.width)
    else:
        raise SystemExit('--size 또는 --width 가 필요하다')
    out = quantize(down(img, tw, th), a.colors)
    os.makedirs(os.path.dirname(a.dst) or '.', exist_ok=True)
    out.save(a.dst)
    print('→', a.dst, out.size)


if __name__ == '__main__':
    main()
