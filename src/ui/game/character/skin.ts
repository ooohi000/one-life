/**
 * 피부색 바꾸기 (팔레트 교체). 몸 그림은 피부색 하나로만 그리고, 다른 피부색은 코드가 만든다.
 * → 체형 × 나이 × 동작이 늘어도 피부색 때문에 그림 장수가 곱해지지 않는다.
 *
 * 피부 도트 고르기:
 *   1) 마스크 그림이 있으면 그걸 쓴다 (`<동작>-skin.png`, 불투명한 곳 = 피부)
 *   2) 없으면 색으로 고른다: 살구~갈색 계열(색상 0~50°)이면서 채도가 있는 도트.
 *      회색 속옷·바지, 검은 신발은 채도가 낮아서 안 바뀐다.
 * 명암은 그대로 둔다: 원래 그림의 기준 피부보다 어두웠던 도트는 새 피부색에서도 그만큼 어둡게.
 * 순수 함수 (브라우저·Node 둘 다) — skin.test.ts
 */

/** 피부색 견본 (밝음 → 어두움). 이름 대신 번호 — 사람 집단에 성격을 붙이지 않는다 */
export const SKIN_TONES = ['#f6d9c2', '#efc29b', '#dda57c', '#bf845a', '#94603f', '#633f29'] as const;

type HSL = [number, number, number];

function toHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function toRgb([h, s, l]: HSL): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as [number, number, number];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 360) + 360) % 360 / 360;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 120), f(h), f(h - 120)].map((v) => Math.round(v * 255)) as [number, number, number];
}

const hexHsl = (hex: string): HSL => {
  const n = parseInt(hex.slice(1), 16);
  return toHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/** 이 도트가 피부인가 (마스크가 없을 때) */
export function isSkin(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return false;
  const [h, s, l] = toHsl(r, g, b);
  return (h <= 50 || h >= 345) && s >= 0.2 && l > 0.08 && l < 0.97;
}

/**
 * RGBA 버퍼에서 피부만 새 피부색으로 (제자리 수정). 바뀐 도트 수를 돌려준다.
 * mask: 같은 크기 RGBA, 알파가 있는 곳만 피부.
 */
export function recolorSkin(px: Uint8ClampedArray, target: string, mask?: Uint8ClampedArray): number {
  const pick = (i: number) => (mask ? mask[i + 3]! > 16 && px[i + 3]! > 16 : isSkin(px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!));
  // 기준 피부 = 피부 도트 중 가장 흔한 색 (명암 단계의 가운데쯤이 가장 넓게 칠해진다)
  const count = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) if (pick(i)) {
    const k = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  if (!count.size) return 0;
  const ref = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const [, sRef, lRef] = toHsl((ref >> 16) & 255, (ref >> 8) & 255, ref & 255);
  const [hT, sT, lT] = hexHsl(target);
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!pick(i)) continue;
    const [h, s, l] = toHsl(px[i]!, px[i + 1]!, px[i + 2]!);
    // 기준보다 어두우면 비율대로, 밝으면 남은 밝기 안에서 비율대로
    const nl = l <= lRef ? lT * (l / (lRef || 1)) : lT + (1 - lT) * ((l - lRef) / (1 - lRef || 1));
    const ns = Math.min(1, sT * (s / (sRef || 1)));
    // 그늘 쪽 색상 기울기(붉은 그림자 등)는 살린다
    const nh = hT + (h > 180 ? h - 360 : h) - (hexHueOf(ref));
    const [r, g, b] = toRgb([nh, ns, Math.max(0, Math.min(1, nl))]);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    n++;
  }
  return n;
}

function hexHueOf(rgb: number): number {
  const h = toHsl((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255)[0];
  return h > 180 ? h - 360 : h;
}
