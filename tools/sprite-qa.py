#!/usr/bin/env python3
"""
캐릭터 시트 검사 (docs/art-ref/character/SPRITE-SPEC.md 의 QA 체크리스트를 자동으로).

  python3 tools/sprite-qa.py 시트.png --layout idle            # 1줄×4칸 (아래·왼·오른·위)
  python3 tools/sprite-qa.py 시트.png --layout walk            # 4줄×4칸
  python3 tools/sprite-qa.py 옷.png --layout idle --base 몸.png  # 층 검사: 몸 밖으로 새는지
  python3 tools/sprite-qa.py 시트.png --layout idle --frame 32x64   # 칸 크기도 확인

결과: 항목마다 OK / 경고 / 실패. 실패가 하나라도 있으면 종료 코드 1.
"""
import argparse
import sys

from PIL import Image

LAYOUTS = {
    'idle': (4, 1, [('down', 0), ('left', 0), ('right', 0), ('up', 0)]),
    'walk': (4, 4, [(d, s) for d in ('down', 'left', 'right', 'up') for s in range(4)]),
}

results = []


def report(level, item, msg):
    results.append((level, item, msg))


def frames_of(im, cols, rows):
    fw, fh = im.width // cols, im.height // rows
    out = []
    for i in range(cols * rows):
        x, y = (i % cols) * fw, (i // cols) * fh
        out.append(im.crop((x, y, x + fw, y + fh)))
    return out, fw, fh


def mask(fr, thr=16):
    a = fr.getchannel('A')
    w, h = fr.size
    px = a.load()
    return {(x, y) for y in range(h) for x in range(w) if px[x, y] > thr}


def bbox(m):
    if not m:
        return None
    xs = [p[0] for p in m]
    ys = [p[1] for p in m]
    return min(xs), min(ys), max(xs), max(ys)


def iou(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))


def flip(m, w):
    return {(w - 1 - x, y) for x, y in m}


def checker_suspect(im):
    """배경에 체크무늬가 그려졌나 (가짜 투명). 불투명한 회색/흰색이 격자로 번갈아 나오면 의심"""
    rgb = im.convert('RGBA')
    w, h = rgb.size
    px = rgb.load()
    corner = [px[x, y] for y in range(min(16, h)) for x in range(min(16, w))]
    opaque = [c for c in corner if c[3] > 250]
    if len(opaque) < len(corner) * 0.9:
        return False
    greys = {c[:3] for c in opaque if abs(c[0] - c[1]) < 6 and abs(c[1] - c[2]) < 6 and c[0] > 150}
    return 2 <= len(greys) <= 4 and len(opaque) == len(corner)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('png')
    ap.add_argument('--layout', choices=LAYOUTS, required=True)
    ap.add_argument('--frame', help='기대하는 칸 크기 예: 32x64')
    ap.add_argument('--base', help='층 검사용 몸 시트 (같은 배치)')
    ap.add_argument('--margin', type=int, default=1, help='머리 위·양옆 최소 여백 (도트)')
    args = ap.parse_args()

    im = Image.open(args.png)
    cols, rows, cells = LAYOUTS[args.layout]

    # 1. 실제 픽셀 크기
    if im.width % cols or im.height % rows:
        report('실패', '크기', f'{im.width}×{im.height} 이 {cols}×{rows} 칸으로 안 나눠짐')
        return finish()
    fw, fh = im.width // cols, im.height // rows
    if args.frame:
        ew, eh = map(int, args.frame.lower().split('x'))
        if (fw, fh) != (ew, eh):
            report('실패', '크기', f'칸 {fw}×{fh} (기대 {ew}×{eh})')
        else:
            report('OK', '크기', f'칸 {fw}×{fh}')
    else:
        report('OK', '크기', f'칸 {fw}×{fh} (그림 {im.width}×{im.height})')

    # 2. 진짜 알파
    if im.mode not in ('RGBA', 'LA') and not (im.mode == 'P' and 'transparency' in im.info):
        report('실패', '투명', f'알파 채널 없음 (모드 {im.mode})')
        return finish()
    im = im.convert('RGBA')
    abytes = im.getchannel('A').tobytes()
    alphas = set(abytes)
    if 0 not in alphas:
        report('실패', '투명', '완전히 투명한 픽셀이 하나도 없음')
    elif checker_suspect(im):
        report('실패', '투명', '배경에 체크무늬가 그려진 것 같음 (가짜 투명)')
    else:
        semi = sum(1 for a in abytes if 16 < a < 240)
        report('경고' if semi > 0 else 'OK', '투명', f'반투명 픽셀 {semi}개' + (' — 도트는 보통 0/255만' if semi else ''))

    frames, _, _ = frames_of(im, cols, rows)
    masks = [mask(f) for f in frames]

    # 3. 잘림 (머리·손·발이 칸 끝에 닿으면 잘렸을 가능성)
    for (d, s), m in zip(cells, masks):
        b = bbox(m)
        if not b:
            report('실패', '잘림', f'{d}/{s}: 빈 칸')
            continue
        x0, y0, x1, y1 = b
        bad = []
        if y0 < args.margin:
            bad.append('머리')
        if x0 < args.margin or x1 > fw - 1 - args.margin:
            bad.append('옆')
        if y1 >= fh:
            bad.append('발')
        if bad:
            report('실패', '잘림', f'{d}/{s}: {"·".join(bad)}이 칸 끝에 닿음 {b}')
    if not any(r[1] == '잘림' and r[0] == '실패' for r in results):
        report('OK', '잘림', '모든 칸 여백 있음')

    # 4. 발바닥 앵커 (맨 아래 불투명 줄이 모든 칸에서 같아야)
    feet = [bbox(m)[3] for m in masks if m]
    if args.base:
        report('OK', '발바닥', '층 검사라 몸 기준으로 확인 (아래 5번)')
    elif len(set(feet)) == 1:
        report('OK', '발바닥', f'모든 칸 y={feet[0]} (아래 여백 {fh - 1 - feet[0]})')
    else:
        spread = max(feet) - min(feet)
        report('실패' if spread > 1 else '경고', '발바닥', f'칸마다 다름 {feet} (차이 {spread}도트) — 걸음 칸은 1도트 들림 허용')

    # 5. 좌우 방향 (오른쪽을 뒤집으면 왼쪽과 비슷해야, 안 뒤집은 채로는 덜 비슷해야)
    by = {}
    for (d, s), m in zip(cells, masks):
        by.setdefault((d, s), m)
    if ('left', 0) in by and ('right', 0) in by:
        L, R = by[('left', 0)], by[('right', 0)]
        mirrored = iou(L, flip(R, fw))
        same = iou(L, R)
        if same > mirrored + 0.05:
            report('실패', '좌우', f'왼쪽·오른쪽이 같은 방향을 보는 것 같음 (그대로 {same:.2f} > 뒤집어서 {mirrored:.2f})')
        elif mirrored < 0.7:
            report('경고', '좌우', f'왼쪽과 뒤집은 오른쪽 모양 차이가 큼 ({mirrored:.2f}) — 정렬·크기 확인')
        else:
            report('OK', '좌우', f'반대 방향 맞음 (뒤집어서 {mirrored:.2f}, 그대로 {same:.2f})')

    # 6. 떨림 (같은 방향 칸끼리 몸 가운데·머리 높이 차이)
    if args.layout == 'walk':
        for d in ('down', 'left', 'right', 'up'):
            bs = [bbox(by[(d, s)]) for s in range(4) if by.get((d, s))]
            cx = [(b[0] + b[2]) / 2 for b in bs]
            top = [b[1] for b in bs]
            jx, jy = max(cx) - min(cx), max(top) - min(top)
            lvl = 'OK' if jx <= 1.5 and jy <= 1 else '경고'
            report(lvl, '떨림', f'{d}: 가운데 ±{jx:.1f}, 머리 높이 ±{jy}')
    # 정지 칸끼리 방향 간 높이 (정면·옆·뒤 키가 같아야)
    stand = [bbox(by[(d, 0)]) for d in ('down', 'left', 'right', 'up') if by.get((d, 0))]
    if stand and not args.base:
        tops = [b[1] for b in stand]
        report('OK' if max(tops) - min(tops) <= 1 else '경고', '키', f'정지 4방향 머리 꼭대기 y={tops}')

    # 7. 층 검사: 몸 밖으로 새는 도트
    if args.base:
        base = Image.open(args.base).convert('RGBA')
        if base.size != im.size:
            report('실패', '층', f'몸 시트 크기 {base.size} ≠ {im.size}')
        else:
            bframes, _, _ = frames_of(base, cols, rows)
            total = 0
            for (d, s), m, bf in zip(cells, masks, bframes):
                bm = mask(bf)
                grown = {(x + dx, y + dy) for x, y in bm for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
                out = m - grown
                total += len(out)
                if len(out) > 3:
                    report('경고', '층', f'{d}/{s}: 몸 밖으로 {len(out)}도트')
            report('OK' if total <= 3 * len(cells) else '경고', '층', f'몸 실루엣(+1도트) 밖 도트 합계 {total}')
    return finish()


def finish():
    w = max(len(r[1]) for r in results) if results else 0
    for lvl, item, msg in results:
        mark = {'OK': '✓', '경고': '!', '실패': '✗'}[lvl]
        print(f'{mark} {item.ljust(w)}  {msg}')
    fails = sum(1 for r in results if r[0] == '실패')
    warns = sum(1 for r in results if r[0] == '경고')
    print(f'\n실패 {fails} · 경고 {warns}')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
