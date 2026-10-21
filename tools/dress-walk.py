#!/usr/bin/env python3
"""
걷기 시트(4줄×4칸) 정리 + 옷 입히기를 한 번에.

  python3 tools/dress-walk.py 걷기_픽셀.png 출력폴더 --jacket-design 재킷디자인.png [--swap-side-col 3]

1. --swap-side-col: 왼쪽 줄과 오른쪽 줄의 그 칸을 맞바꾼다 (생성 그림이 방향을 섞었을 때)
2. 칸마다 바깥선·명암 정리(cleanup-sprite와 같은 규칙), 발바닥 줄 맞추기
3. 방향 줄마다 code-garment(바지·셔츠·재킷 자리) → fit-garment(재킷 디자인의 같은 방향 칸)
결과: 출력폴더/body.png, bottom.png, top.png, outer.png (모두 128×256)
"""
import argparse
import importlib.util
import os
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(__file__)


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(HERE, name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('walk')
    ap.add_argument('outdir')
    ap.add_argument('--jacket-design')
    ap.add_argument('--swap-side-col', type=int, action='append', default=[])
    ap.add_argument('--tones', type=int, default=5)
    a = ap.parse_args()
    cl = load('cleanup-sprite')
    im = Image.open(a.walk).convert('RGBA')
    fw, fh = im.width // 4, im.height // 4
    frames = [[im.crop((c * fw, r * fh, c * fw + fw, r * fh + fh)) for c in range(4)] for r in range(4)]
    for c in a.swap_side_col:
        frames[1][c], frames[2][c] = frames[2][c], frames[1][c]
    frames = [[cl.clean_frame(f, a.tones) for f in row] for row in frames]
    base = max((f.getbbox() or (0, 0, 0, fh))[3] for row in frames for f in row)
    body = Image.new('RGBA', im.size, (0, 0, 0, 0))
    for r in range(4):
        for c in range(4):
            f = frames[r][c]
            body.paste(f, (c * fw, r * fh + base - (f.getbbox() or (0, 0, 0, fh))[3]))
    os.makedirs(a.outdir, exist_ok=True)
    body.save(os.path.join(a.outdir, 'body.png'))
    tmp = tempfile.mkdtemp()
    layers = {'bottom': [], 'top': [], 'outer': []}
    for r in range(4):
        strip = os.path.join(tmp, f'row{r}.png')
        body.crop((0, r * fh, im.width, r * fh + fh)).save(strip)
        run = lambda *args: subprocess.run([sys.executable, *args], check=True, capture_output=True)
        run(os.path.join(HERE, 'code-garment.py'), strip, f'{tmp}/b{r}.png', '--kind', 'pants', '--color', '#3a3f52')
        run(os.path.join(HERE, 'code-garment.py'), strip, f'{tmp}/t{r}.png', '--kind', 'shirt', '--color', '#eef0f4')
        run(os.path.join(HERE, 'code-garment.py'), strip, f'{tmp}/s{r}.png', '--kind', 'jacket', '--color', '#26346b')
        if a.jacket_design:
            run(os.path.join(HERE, 'fit-garment.py'), strip, a.jacket_design, f'{tmp}/s{r}.png', f'{tmp}/o{r}.png', '--colors', '24', '--design-col', str(r))
        else:
            os.replace(f'{tmp}/s{r}.png', f'{tmp}/o{r}.png')
        layers['bottom'].append(f'{tmp}/b{r}.png')
        layers['top'].append(f'{tmp}/t{r}.png')
        layers['outer'].append(f'{tmp}/o{r}.png')
    for name, parts in layers.items():
        sheet = Image.new('RGBA', im.size, (0, 0, 0, 0))
        for r, p in enumerate(parts):
            sheet.paste(Image.open(p).convert('RGBA'), (0, r * fh))
        sheet.save(os.path.join(a.outdir, name + '.png'))
    print('→', a.outdir, 'body/bottom/top/outer.png')


if __name__ == '__main__':
    main()
