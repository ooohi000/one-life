#!/usr/bin/env python3
"""
축소한 캐릭터 시트 코드 정리 (pixelize 다음 단계).

  python3 tools/cleanup-sprite.py 입력.png 출력.png --layout idle [--right-from-left] [--sym front,back] [--tones 4]

1. 알파를 0/255로 (반투명 없앰)
2. 바깥선 다시 긋기: 실루엣 가장자리 1도트를 어두운 선으로 통일 (축소로 점선처럼 끊긴 선 복구),
   안쪽에 남은 옛 선 찌꺼기(어두운 점)는 가까운 몸 색으로
3. 몸 색을 명암 N단계로 묶기 (밝은 쪽부터 같은 색 계열)
4. --sym: 정면·뒷모습 좌우 대칭 (왼쪽 반을 오른쪽에 거울로 — 빛은 왼쪽 위라 왼쪽 반이 기준)
5. --right-from-left / --left-from-right: 옆모습 한쪽을 다른 쪽 뒤집기로 (생성 그림의 두 옆모습이 안 맞을 때)
6. 발바닥 줄을 모든 칸에서 같게
코드가 하는 건 "규칙으로 정리"까지다. 비율(머리 크기)·자세 같은 디자인 문제는 못 고친다.
"""
import argparse
import colorsys

from PIL import Image

LAYOUTS = {'idle': (4, 1, ['down', 'left', 'right', 'up'])}


def is_skin(c):
    """src/ui/game/character/skin.ts isSkin 과 같은 기준"""
    h, l, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
    h *= 360
    return (h <= 50 or h >= 345) and s >= 0.2 and 0.08 < l < 0.97


def make_ramp(cols, tones):
    cols = sorted(cols, key=lum)
    ramp = []
    for i in range(tones):
        seg = cols[i * len(cols) // tones:(i + 1) * len(cols) // tones] or cols
        ramp.append(tuple(sum(c[k] for c in seg) // len(seg) for k in range(3)))
    return ramp


def lum(c):
    return c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11


def clean_frame(fr, tones):
    w, h = fr.size
    px = fr.load()
    solid = [[px[x, y][3] > 127 for x in range(w)] for y in range(h)]
    on = lambda x, y: 0 <= x < w and 0 <= y < h and solid[y][x]
    edge = [[solid[y][x] and not all(on(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))) for x in range(w)] for y in range(h)]
    inner = [px[x, y][:3] for y in range(h) for x in range(w) if solid[y][x] and not edge[y][x]]
    if not inner:
        return fr
    # 옛 바깥선 찌꺼기 = 안쪽인데 아주 어두운 도트 → 몸 색 후보에서 뺀다
    ls = sorted(lum(c) for c in inner)
    dark_cut = ls[len(ls) // 10] * 0.6
    body = [c for c in inner if lum(c) > dark_cut]
    # 피부와 그 밖(속옷 등)은 따로 명암 단계를 만든다 — 섞으면 속옷이 피부색 단계로 바뀌어 나중에 피부색 바꿀 때 같이 변한다
    skin = [c for c in body if is_skin(c)]
    other = [c for c in body if not is_skin(c)]
    skin_ramp = make_ramp(skin or body, tones)
    other_ramp = make_ramp(other, 3) if len(other) >= 3 else []
    ramp = skin_ramp
    outline = tuple(max(0, int(v * 0.32)) for v in ramp[0])
    near = lambda c: min(skin_ramp if (is_skin(c) or not other_ramp) else other_ramp, key=lambda r: sum((r[k] - c[k]) ** 2 for k in range(3)))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not solid[y][x]:
                continue
            if edge[y][x]:
                op[x, y] = outline + (255,)
            else:
                c = px[x, y][:3]
                if lum(c) <= dark_cut:  # 찌꺼기: 이웃 몸 색 중 가장 흔한 것
                    ns = [px[x + dx, y + dy][:3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if on(x + dx, y + dy) and not edge[y + dy][x + dx] and lum(px[x + dx, y + dy]) > dark_cut]
                    c = max(set(ns), key=ns.count) if ns else ramp[len(ramp) // 2]
                op[x, y] = near(c) + (255,)
    return out


def mirror_left_half(fr):
    w, h = fr.size
    out = fr.copy()
    src = fr.load()
    op = out.load()
    for y in range(h):
        for x in range(w // 2):
            op[w - 1 - x, y] = src[x, y]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--layout', choices=LAYOUTS, default='idle')
    ap.add_argument('--tones', type=int, default=4)
    ap.add_argument('--sym', default='', help='좌우 대칭으로 만들 방향 (쉼표): down,up')
    ap.add_argument('--right-from-left', action='store_true')
    ap.add_argument('--left-from-right', action='store_true', help='왼쪽 칸 = 오른쪽 칸 뒤집기 (오른쪽이 더 잘 그려졌을 때)')
    a = ap.parse_args()
    im = Image.open(a.src).convert('RGBA')
    cols, rows, dirs = LAYOUTS[a.layout]
    fw, fh = im.width // cols, im.height // rows
    frames = {d: im.crop((i * fw, 0, i * fw + fw, fh)) for i, d in enumerate(dirs)}
    for d in a.sym.split(','):
        if d in frames:
            frames[d] = mirror_left_half(frames[d])
    if a.right_from_left:
        frames['right'] = frames['left'].transpose(Image.FLIP_LEFT_RIGHT)
    if a.left_from_right:
        frames['left'] = frames['right'].transpose(Image.FLIP_LEFT_RIGHT)
    cleaned = {d: clean_frame(frames[d], a.tones) for d in dirs}
    # 발바닥 맞추기: 칸마다 맨 아래 불투명 줄을 가장 낮은 칸에 맞춘다
    feet = {d: (f.getbbox() or (0, 0, 0, fh))[3] for d, f in cleaned.items()}
    base = max(feet.values())
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for i, d in enumerate(dirs):
        out.paste(cleaned[d], (i * fw, base - feet[d]))
    out.save(a.dst)
    n = len({c for c in out.getchannel('A').tobytes()})
    print('→', a.dst, out.size, f'알파 단계 {n}')


if __name__ == '__main__':
    main()
