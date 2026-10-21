/**
 * 실루엣 비율 재기 — 0-A(32×64)와 0-B(64×128)가 같은 디자인인지 숫자로 비교한다.
 * 모두 키에 대한 비율이라 해상도가 달라도 바로 비교된다.
 */
export interface Proportions {
  /** 키 (도트) */
  height: number;
  /** 머리 높이 / 키 (3등신이면 약 0.33) */
  head: number;
  /** 어깨 폭 / 키 */
  shoulder: number;
  /** 가랑이~발바닥 / 키 (다리가 붙어 있어 못 재면 null) */
  leg: number | null;
  /** 머리 폭 / 키 */
  headWidth: number;
}

/** alpha: 칸 하나의 알파값 (w×h). 정면 정지 칸을 넣는다 */
export function proportions(alpha: ArrayLike<number>, w: number, h: number): Proportions | null {
  const spans: Array<Array<[number, number]>> = [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    const row: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && alpha[y * w + x]! > 16;
      if (on && start < 0) start = x;
      if (!on && start >= 0) (row.push([start, x - 1]), (start = -1));
    }
    spans.push(row);
    if (row.length) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0) return null;
  const H = bottom - top + 1;
  const width = (y: number) => {
    const r = spans[y]!;
    return r.length ? r[r.length - 1]![1] - r[0]![0] + 1 : 0;
  };
  // 머리: 위에서 내려가며, 지금까지 가장 넓었던 폭의 80% 아래로 처음 좁아지는 골짜기(목)
  const limit = top + Math.floor(H * 0.5);
  let widest = top;
  let neck = -1;
  for (let y = top + 2; y < limit; y++) {
    if (width(y - 1) > width(widest)) widest = y - 1;
    if (width(y) <= width(widest) * 0.8 && width(y) <= width(y + 1)) {
      neck = y;
      break;
    }
  }
  if (neck < 0) neck = top + Math.round(H / 3); // 목이 안 보이면 3등신 가정
  let shoulder = 0;
  for (let y = neck; y < top + Math.floor(H * 0.6); y++) shoulder = Math.max(shoulder, width(y));
  // 가랑이: 발 사이 가운데 줄에서 위로 올라가며 처음 몸이 덮는 곳. 다리가 붙어 있으면(틈이 없으면) 잴 수 없다
  const feet = spans[bottom]!;
  const mid = (feet[0]![0] + feet[feet.length - 1]![1]) / 2;
  const covered = (y: number) => spans[y]!.some(([a, b]) => a <= mid && b >= mid);
  let crotch = -1;
  if (!covered(bottom)) for (let y = bottom; y > neck; y--) if (covered(y)) {
    crotch = y;
    break;
  }
  return {
    height: H,
    head: (neck - top) / H,
    shoulder: shoulder / H,
    leg: crotch < 0 ? null : (bottom - crotch) / H,
    headWidth: width(widest) / H,
  };
}

export const fmtProportions = (p: Proportions) =>
  `키 ${p.height} · 머리 ${p.head.toFixed(2)} · 머리폭 ${p.headWidth.toFixed(2)} · 어깨 ${p.shoulder.toFixed(2)} · 다리 ${p.leg === null ? '-' : p.leg.toFixed(2)}`;
