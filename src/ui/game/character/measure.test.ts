import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { proportions } from './measure';

/** 시트에서 칸 하나의 알파만 */
function frameAlpha(path: string, col: number, cols: number) {
  const png = PNG.sync.read(readFileSync(path));
  const fw = png.width / cols;
  const a: number[] = [];
  for (let y = 0; y < png.height; y++) for (let x = 0; x < fw; x++) a.push(png.data[(y * png.width + col * fw + x) * 4 + 3]!);
  return { a, fw, fh: png.height };
}
/** 2배 확대 (64×128 후보 흉내) */
function double(a: number[], w: number, h: number) {
  const out: number[] = [];
  for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) out.push(a[Math.floor(y / 2) * w + Math.floor(x / 2)]!);
  return out;
}

describe('실루엣 비율', () => {
  const f = frameAlpha('src/ui/art/chars/lab/bodygen/body/m-teen-average/idle.png', 0, 4);
  it('정면 몸에서 머리·어깨·다리 비율을 잰다', () => {
    const p = proportions(f.a, f.fw, f.fh)!;
    expect(p.height).toBeGreaterThan(40);
    expect(p.head).toBeGreaterThan(0.15);
    expect(p.head).toBeLessThan(0.45);
    expect(p.leg!).toBeGreaterThan(0.2);
    expect(p.shoulder).toBeGreaterThan(p.headWidth * 0.8);
  });
  it('해상도만 2배면 비율은 거의 같다 (0-A·0-B 비교 기준)', () => {
    const p1 = proportions(f.a, f.fw, f.fh)!;
    const p2 = proportions(double(f.a, f.fw, f.fh), f.fw * 2, f.fh * 2)!;
    expect(p2.height).toBe(p1.height * 2);
    for (const k of ['head', 'shoulder', 'leg', 'headWidth'] as const) expect(Math.abs(p2[k]! - p1[k]!)).toBeLessThan(0.04); // 칸 경계 반올림으로 1~2도트(≈0.035) 차이는 생긴다
  });
});
