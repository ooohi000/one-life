import { describe, expect, it } from 'vitest';
import { isSkin, recolorSkin, SKIN_TONES } from './skin';

const px = (...cs: Array<[number, number, number, number]>) => new Uint8ClampedArray(cs.flat());
const lum = (p: Uint8ClampedArray, i: number) => p[i * 4]! * 0.3 + p[i * 4 + 1]! * 0.59 + p[i * 4 + 2]! * 0.11;

describe('피부색 바꾸기', () => {
  // 피부 명암 3단계(밝음·기준×2·그늘) + 바깥선 + 회색 속옷 + 검은 신발 + 투명
  const base = () =>
    px(
      [250, 214, 186, 255],
      [239, 194, 155, 255],
      [239, 194, 155, 255],
      [200, 150, 115, 255],
      [110, 62, 45, 255],
      [167, 169, 176, 255],
      [43, 43, 49, 255],
      [0, 0, 0, 0],
    );

  it('회색 속옷·검은 신발·투명은 피부가 아니다', () => {
    expect(isSkin(167, 169, 176, 255)).toBe(false);
    expect(isSkin(43, 43, 49, 255)).toBe(false);
    expect(isSkin(239, 194, 155, 0)).toBe(false);
    expect(isSkin(239, 194, 155, 255)).toBe(true);
    expect(isSkin(110, 62, 45, 255)).toBe(true); // 피부 바깥선도 같이 바뀐다
  });

  it('피부만 바뀌고 속옷·신발은 그대로', () => {
    const p = base();
    const n = recolorSkin(p, SKIN_TONES[4]);
    expect(n).toBe(5);
    expect([...p.slice(20, 32)]).toEqual([167, 169, 176, 255, 43, 43, 49, 255, 0, 0, 0, 0]);
  });

  it('명암 순서가 유지된다 (밝은 곳은 여전히 밝고 그늘은 여전히 어둡다)', () => {
    for (const tone of SKIN_TONES) {
      const p = base();
      recolorSkin(p, tone);
      expect(lum(p, 0)).toBeGreaterThan(lum(p, 1));
      expect(lum(p, 1)).toBeGreaterThan(lum(p, 3));
      expect(lum(p, 3)).toBeGreaterThan(lum(p, 4));
    }
  });

  it('어두운 견본일수록 기준 피부가 어두워진다', () => {
    const ls = SKIN_TONES.map((t) => {
      const p = base();
      recolorSkin(p, t);
      return lum(p, 1);
    });
    for (let i = 1; i < ls.length; i++) expect(ls[i]!).toBeLessThan(ls[i - 1]!);
  });

  it('마스크가 있으면 마스크만 따른다', () => {
    const p = base();
    const mask = new Uint8ClampedArray(p.length);
    mask[1 * 4 + 3] = 255; // 두 번째 도트만 피부
    expect(recolorSkin(p, SKIN_TONES[5], mask)).toBe(1);
    expect([...p.slice(0, 4)]).toEqual([250, 214, 186, 255]);
  });

  it('회색 마네킹 몸이면 몸 전체에 피부색을 입히고 명암은 유지한다', () => {
    const p = px([220, 220, 222, 255], [180, 180, 182, 255], [140, 140, 142, 255], [40, 40, 44, 255], [0, 0, 0, 0]);
    expect(recolorSkin(p, SKIN_TONES[2])).toBe(4);
    expect(isSkin(p[0]!, p[1]!, p[2]!, p[3]!)).toBe(true);
    expect(lum(p, 0)).toBeGreaterThan(lum(p, 1));
    expect(lum(p, 1)).toBeGreaterThan(lum(p, 2));
    expect(lum(p, 2)).toBeGreaterThan(lum(p, 3));
    expect([...p.slice(16, 20)]).toEqual([0, 0, 0, 0]);
  });
});
