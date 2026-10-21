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
import json
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


def down_mode(img: Image.Image, tw: int, th: int, colors: int = 32) -> Image.Image:
    """칸마다 가장 많이 나온 색 (AI 그림의 번진 가장자리·잡티에 강하다). 먼저 색을 줄여 두고 센다"""
    alpha = img.getchannel('A')
    q = img.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert('RGB')
    w, h = img.size
    qp, ap = q.load(), alpha.load()
    out = Image.new('RGBA', (tw, th))
    o = out.load()
    for y in range(th):
        for x in range(tw):
            x0, x1 = int(x * w / tw), max(int(x * w / tw) + 1, int((x + 1) * w / tw))
            y0, y1 = int(y * h / th), max(int(y * h / th) + 1, int((y + 1) * h / th))
            count, solid, total = {}, 0, 0
            for yy in range(y0, min(y1, h)):
                for xx in range(x0, min(x1, w)):
                    total += 1
                    if ap[xx, yy] >= 128:
                        solid += 1
                        c = qp[xx, yy]
                        count[c] = count.get(c, 0) + 1
            if total and solid / total >= 0.45 and count:
                o[x, y] = (*max(count, key=count.get), 255)
    return out


def strip_halo(img: Image.Image) -> Image.Image:
    """배경과 맞닿은 밝은 테두리 잡티 지우기.
    AI 도트 캐릭터는 바깥선이 어둡다 — 투명한 곳과 맞닿았는데 밝은 점은 흰 배경이 번진 것"""
    px = img.load()
    w, h = img.size
    kill = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or (0.299 * r + 0.587 * g + 0.114 * b) < 120:
                continue
            if any(not (0 <= x + dx < w and 0 <= y + dy < h) or px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                kill.append((x, y))
    for x, y in kill:
        px[x, y] = (0, 0, 0, 0)
    return img


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
    ap.add_argument('--sheet', help='CxR 캐릭터 시트 → 한 장 (칸마다 발을 바닥에, 머리를 가운데에 맞춤)')
    ap.add_argument('--frame', default='16x32', help='시트 한 칸 크기')
    ap.add_argument('--height', type=int, help='캐릭터 키(도트). 없으면 칸 높이-1에 꽉 채움 — 체형·나이 키 차이를 살리려면 꼭 지정')
    ap.add_argument('--foot-pad', type=int, default=0, help='발바닥 아래 여백(도트). 모든 층이 같아야 한다')
    ap.add_argument('--save-transform', help='이 시트에 쓴 배율·칸 위치를 json으로 저장 (몸 그림 처리할 때)')
    ap.add_argument('--use-transform', help='저장한 배율·칸 위치를 그대로 쓴다 (같은 몸의 옷 입은 그림 처리할 때 — 층이 안 어긋나게)')
    a = ap.parse_args()
    img = Image.open(a.src).convert('RGBA')
    # 원본이 이미 진짜 투명 배경이면 흰 테두리 지우기(strip_halo)는 건너뛴다 — 안 그러면 몸 가장자리 피부까지 지워져 구멍이 난다
    w0, h0 = img.size
    real_alpha = all(img.getpixel(p)[3] < 10 for p in [(0, 0), (w0 - 1, 0), (0, h0 - 1), (w0 - 1, h0 - 1)])
    halo = (lambda im: im) if real_alpha else strip_halo
    if not a.keep_bg:
        img = remove_bg(img, a.tol)

    if a.sheet:
        cols, rows = map(int, a.sheet.split('x'))
        fw, fh = map(int, a.frame.split('x'))
        cw, ch = img.width / cols, img.height / rows
        cells = []
        for r in range(rows):
            for c in range(cols):
                cell = img.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
                box = cell.getbbox()
                cells.append((cell, box))
        # 모든 칸에 같은 배율 (키가 프레임마다 달라지지 않게)
        body_h = a.height or (fh - 1 - a.foot_pad)
        if a.use_transform:
            t = json.load(open(a.use_transform))
            k, anchors = t['k'], t['anchors']
            a.foot_pad = t.get('foot_pad', a.foot_pad)  # 몸과 같은 발 위치 (빠뜨려도 안 어긋나게)
        else:
            tallest = max(b[3] - b[1] for _, b in cells if b)
            k = body_h / tallest
            anchors = []
            for cell, box in cells:
                if not box:
                    anchors.append(None)
                    continue
                # 머리(위쪽 30%)의 가로 가운데를 기준으로 — 걸음에 다리가 벌어져도 몸이 흔들리지 않게
                head = cell.crop((box[0], box[1], box[2], box[1] + int((box[3] - box[1]) * 0.3))).getbbox()
                hx = box[0] + (head[0] + head[2]) / 2 if head else (box[0] + box[2]) / 2
                anchors.append([hx, box[3]])
        if a.save_transform:
            json.dump({'k': k, 'anchors': anchors, 'frame': [fw, fh], 'foot_pad': a.foot_pad}, open(a.save_transform, 'w'))
        sheet = Image.new('RGBA', (fw * cols, fh * rows))
        avail = fh - a.foot_pad
        for i, (cell, box) in enumerate(cells):
            if not box or not anchors[i]:
                continue
            hx, bottom = anchors[i]
            sw = int(fw / k)
            src = cell.crop((int(hx - sw / 2), bottom - int(avail / k), int(hx - sw / 2) + sw, bottom))
            small = halo(down_mode(src, fw, avail, a.colors))
            sheet.paste(small, ((i % cols) * fw, (i // cols) * fh))
        out = quantize(sheet, a.colors)
        os.makedirs(os.path.dirname(a.dst) or '.', exist_ok=True)
        out.save(a.dst)
        print('→', a.dst, out.size)
        return

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
