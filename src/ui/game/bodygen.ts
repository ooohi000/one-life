/**
 * 몸 만들기 (코드로 그리는 도트 몸). 4등신.
 *
 * 왜 코드로? 체형을 어깨·가슴·허리·엉덩이·팔·허벅지까지 세분하면 조합이 끝이 없다 — 그림으로는 못 그린다.
 * 대신 몸의 "모양"은 숫자로 정확하게 계산해서 찍고(프레임마다 팔다리 위치가 1픽셀도 안 어긋난다),
 * 머리카락·얼굴·옷 무늬처럼 손맛이 필요한 건 그림 부품(GPT)으로 얹는다.
 *
 * 엔진과 바로 이어진다: 근육량·체지방·나이가 바뀌면 몸이 바뀐다 (숨겨진 수치는 외형으로 드러난다).
 * 순수 TypeScript — 브라우저(게임)와 Node(미리보기) 둘 다에서 돈다.
 */

export type Sex = 'm' | 'f';

export interface BodyParams {
  sex: Sex;
  /** 나이 (키·비율·자세가 바뀐다) */
  age: number;
  /** 근육 0~1 */
  muscle: number;
  /** 체지방 0~1 */
  fat: number;
  /** 같은 나이 안에서의 키 -1(작음) ~ 1(큼) */
  height?: number;
  /** 타고난 골격 차이 -1~1 (사람마다 조금씩 다르다) */
  shoulder?: number;
  waist?: number;
  hip?: number;
  arm?: number;
  thigh?: number;
}

export interface Outfit {
  skin: string;
  top: string;
  sleeves: 'none' | 'short' | 'long';
  bottom: string;
  bottomLen: 'short' | 'long';
  shoes: string;
  socks?: string;
  /** 단추·지퍼 같은 가운데 선 */
  frontLine?: string;
  collar?: string;
}

export type View = 'down' | 'left' | 'right' | 'up';
export const FRAME_W = 32;
export const FRAME_H = 64;

/** 부위 번호 (옷이 어디를 덮는지 정할 때 쓴다) */
const enum R {
  None = 0,
  Head,
  Neck,
  Torso,
  ArmUpper,
  ArmLower,
  Hand,
  LegUpper,
  LegLower,
  Foot,
  FarArmUpper,
  FarArmLower,
  FarHand,
  FarLegUpper,
  FarLegLower,
  FarFoot,
}

type Buf = Uint8Array; // 부위 번호

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function capsule(buf: Buf, region: R, x1: number, y1: number, x2: number, y2: number, r1: number, r2: number) {
  const minX = Math.floor(Math.min(x1, x2) - Math.max(r1, r2) - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + Math.max(r1, r2) + 1);
  const minY = Math.floor(Math.min(y1, y2) - Math.max(r1, r2) - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + Math.max(r1, r2) + 1);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      const r = r1 + (r2 - r1) * t;
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) buf[y * FRAME_W + x] = region;
    }
  }
}

function ellipse(buf: Buf, region: R, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      if (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H) continue;
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) buf[y * FRAME_W + x] = region;
    }
  }
}

/** 높이별 [왼쪽 끝, 오른쪽 끝]을 이어 채운다 (몸통) */
function profile(buf: Buf, region: R, keys: Array<[number, number, number]>) {
  for (let y = Math.floor(keys[0]![0]); y <= Math.ceil(keys[keys.length - 1]![0]); y++) {
    const py = y + 0.5;
    let i = 0;
    while (i < keys.length - 2 && py > keys[i + 1]![0]) i++;
    const [ya, la, ra] = keys[i]!;
    const [yb, lb, rb] = keys[i + 1]!;
    const t = clamp((py - ya) / (yb - ya || 1), 0, 1);
    const l = la + (lb - la) * t;
    const r = ra + (rb - ra) * t;
    if (py < keys[0]![0] || py > keys[keys.length - 1]![0]) continue;
    for (let x = Math.floor(l); x < Math.ceil(r); x++) {
      if (x < 0 || x >= FRAME_W || y < 0 || y >= FRAME_H) continue;
      if (x + 0.5 >= l && x + 0.5 <= r) buf[y * FRAME_W + x] = region;
    }
  }
}

/** 몸 치수 (도트 단위). 나이·성별·근육·지방에서 나온다 */
export function measure(p: BodyParams) {
  const m = p.sex === 'm';
  const kid = clamp((18 - p.age) / 10, 0, 1); // 8살 1 ~ 18살 0
  const old = clamp((p.age - 60) / 25, 0, 1); // 60살 0 ~ 85살 1
  const adult = p.age >= 20 ? 1 : 0;
  const mu = clamp(p.muscle, 0, 1);
  const fa = clamp(p.fat, 0, 1);
  const H = (m ? 59 : 56) - kid * 16 - old * 2 + (p.height ?? 0) * 2;
  return {
    H,
    head: H / 4 + kid * 1.2, // 아이는 머리가 크다
    shoulder: (m ? 7.0 : 5.9) - kid * 1.4 + mu * 1.7 + fa * 0.5 + (p.shoulder ?? 0) * 0.6 - old * 0.4,
    chest: (m ? 6.0 : 5.3) - kid * 1.1 + mu * 1.1 + fa * 1.4 + (p.shoulder ?? 0) * 0.3,
    waist: (m ? 5.1 : 4.4) - kid * 0.6 + fa * 3.0 - mu * 0.2 + (p.waist ?? 0) * 0.5 + old * 0.5,
    hip: (m ? 5.3 : 6.0) - kid * 1.0 + fa * 2.2 + (p.hip ?? 0) * 0.6,
    upperArm: 1.75 - kid * 0.3 + mu * 1.0 + fa * 0.9 + (p.arm ?? 0) * 0.3,
    foreArm: 1.45 - kid * 0.25 + mu * 0.55 + fa * 0.55 + (p.arm ?? 0) * 0.2,
    thigh: (m ? 2.45 : 2.6) - kid * 0.4 + mu * 0.7 + fa * 1.5 + (p.thigh ?? 0) * 0.4,
    calf: 1.75 - kid * 0.2 + mu * 0.4 + fa * 0.6,
    neck: (m ? 1.5 : 1.25) + mu * 0.8 + fa * 0.7,
    faceFat: fa * 0.9,
    /** 앞뒤 두께 (옆모습) */
    chestDepth: (m ? 3.4 : 3.2) + mu * 1.0 + fa * 1.0 + (m ? 0 : adult * 0.6),
    belly: 2.8 + fa * 3.6 - mu * 0.3,
    backDepth: 3.2 + mu * 0.4 + fa * 0.6,
    seat: 3.3 + fa * 1.3 + (m ? 0 : adult * 0.5),
    stoop: old * 1.6,
  };
}

/** 한 프레임의 부위 지도 */
export function shape(p: BodyParams, view: View, frame: 0 | 1 | 2 | 3): Buf {
  const buf = new Uint8Array(FRAME_W * FRAME_H);
  const s = measure(p);
  const foot = FRAME_H - 1.5;
  const top = foot - s.H;
  const h = s.head;
  const cx = FRAME_W / 2;
  const ys = top + h * 1.12; // 어깨선
  const yc = ys + h * 1.32; // 가랑이
  const yKnee = yc + (foot - yc) * 0.5;
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0; // 1: 왼발 앞, -1: 오른발 앞

  if (view === 'down' || view === 'up') {
    // 다리 (뒤에서 앞으로: 다리 → 몸통 → 팔 → 머리)
    const legX = Math.max(1.7, s.hip * 0.48);
    for (const side of [-1, 1] as const) {
      const lift = (side === -1 && step === 1) || (side === 1 && step === -1) ? 1.4 : 0;
      const x = cx + side * legX;
      capsule(buf, R.LegUpper, x, yc - 1, x + side * 0.1, yKnee, s.thigh, s.calf + 0.15);
      capsule(buf, R.LegLower, x + side * 0.1, yKnee, x + side * 0.15, foot - 1.2 - lift, s.calf, 0.95);
      ellipse(buf, R.Foot, x + side * 0.3, foot - 0.6 - lift, 1.7, 1.0);
    }
    // 몸통
    profile(buf, R.Torso, [
      [ys - 0.2, cx - s.shoulder + 1.2, cx + s.shoulder - 1.2],
      [ys + 1.2, cx - s.shoulder, cx + s.shoulder],
      [ys + h * 0.4, cx - s.chest, cx + s.chest],
      [ys + h * 0.82, cx - s.waist, cx + s.waist],
      [ys + h * 1.1, cx - s.hip, cx + s.hip],
      [yc + 0.4, cx - s.hip + 0.3, cx + s.hip - 0.3],
    ]);
    // 팔 (걸을 때 반대쪽 다리와 같이 앞뒤로 — 정면에선 손이 조금 올라간다)
    for (const side of [-1, 1] as const) {
      const fwd = (side === -1 && step === -1) || (side === 1 && step === 1) ? 1 : 0;
      const sx = cx + side * (s.shoulder - s.upperArm * 0.5);
      const ex = cx + side * (Math.max(s.chest, s.waist) + s.upperArm * 0.55);
      const ey = ys + h * 0.62 - fwd * 0.6;
      const wx = cx + side * (Math.max(s.waist, s.hip) + s.foreArm * 0.6);
      const wy = ys + h * 1.18 - fwd * 1.2;
      capsule(buf, R.ArmUpper, sx, ys + 1.2, ex, ey, s.upperArm, s.upperArm * 0.85);
      capsule(buf, R.ArmLower, ex, ey, wx, wy, s.foreArm, s.foreArm * 0.85);
      ellipse(buf, R.Hand, wx, wy + 1.0, 1.15, 1.35);
    }
    // 목·머리
    capsule(buf, R.Neck, cx, top + h * 0.9, cx, ys + 0.6, s.neck, s.neck);
    ellipse(buf, R.Head, cx, top + h * 0.5, h * 0.37 + s.faceFat, h * 0.5);
  } else {
    // 옆모습 (오른쪽을 본다; 왼쪽은 좌우 뒤집기)
    const bx = cx - 0.5 + s.stoop * 0.3;
    const swing = step * 3.2;
    // 먼 쪽 팔·다리 (어둡게)
    const legs = (near: boolean) => {
      const d = (near ? 1 : -1) * swing;
      const hipX = bx + 0.3;
      const kneeX = hipX + d * 0.55 + (d < 0 ? -0.3 : 0.6);
      const ankleX = hipX + d;
      const up = near ? R.LegUpper : R.FarLegUpper;
      const lo = near ? R.LegLower : R.FarLegLower;
      const ft = near ? R.Foot : R.FarFoot;
      const lift = d < -1 ? 1.2 : 0;
      capsule(buf, up, hipX, yc - 1.2, kneeX, yKnee, s.thigh, s.calf + 0.1);
      capsule(buf, lo, kneeX, yKnee, ankleX, foot - 1.3 - lift, s.calf, 0.95);
      ellipse(buf, ft, ankleX + 1.1, foot - 0.6 - lift, 2.0, 1.0);
    };
    const arm = (near: boolean) => {
      const d = (near ? -1 : 1) * swing * 0.8;
      const sx = bx + 0.2 + s.stoop * 0.6;
      const ex = sx + d * 0.4;
      const ey = ys + h * 0.62;
      const wx = sx + d;
      const wy = ys + h * 1.15 - Math.abs(d) * 0.2;
      capsule(buf, near ? R.ArmUpper : R.FarArmUpper, sx, ys + 1, ex, ey, s.upperArm, s.upperArm * 0.85);
      capsule(buf, near ? R.ArmLower : R.FarArmLower, ex, ey, wx, wy, s.foreArm, s.foreArm * 0.85);
      ellipse(buf, near ? R.Hand : R.FarHand, wx + 0.2, wy + 1, 1.2, 1.3);
    };
    arm(false);
    legs(false);
    legs(true);
    const lean = s.stoop;
    profile(buf, R.Torso, [
      [ys - 0.2, bx - s.backDepth + 0.8 + lean, bx + s.chestDepth - 1 + lean],
      [ys + 1.2, bx - s.backDepth + lean * 0.8, bx + s.chestDepth + lean * 0.8],
      [ys + h * 0.45, bx - s.backDepth + 0.2 + lean * 0.4, bx + s.chestDepth + 0.2 + lean * 0.4],
      [ys + h * 0.85, bx - s.backDepth + 0.6, bx + s.belly],
      [ys + h * 1.12, bx - s.seat, bx + Math.max(2, s.belly * 0.75)],
      [yc + 0.3, bx - s.seat + 0.6, bx + 2],
    ]);
    arm(true);
    capsule(buf, R.Neck, bx + 0.4 + lean * 1.1, top + h * 0.85, bx + lean * 0.8, ys + 0.8, s.neck, s.neck);
    ellipse(buf, R.Head, bx + 0.8 + lean * 1.4, top + h * 0.5, h * 0.42 + s.faceFat * 0.5, h * 0.5);
  }
  return buf;
}

// ───────── 색칠 ─────────

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mul = (c: [number, number, number], k: number): [number, number, number] => [clamp(Math.round(c[0] * k), 0, 255), clamp(Math.round(c[1] * k), 0, 255), clamp(Math.round(c[2] * k), 0, 255)];

/** 부위 → 색 (옷이 덮는 곳은 옷 색) */
function regionColor(r: R, o: Outfit): string {
  switch (r) {
    case R.Head:
    case R.Neck:
    case R.Hand:
    case R.FarHand:
      return o.skin;
    case R.Torso:
      return o.top;
    case R.ArmUpper:
    case R.FarArmUpper:
      return o.sleeves === 'none' ? o.skin : o.top;
    case R.ArmLower:
    case R.FarArmLower:
      return o.sleeves === 'long' ? o.top : o.skin;
    case R.LegUpper:
    case R.FarLegUpper:
      return o.bottom;
    case R.LegLower:
    case R.FarLegLower:
      return o.bottomLen === 'long' ? o.bottom : o.socks ?? o.skin;
    case R.Foot:
    case R.FarFoot:
      return o.shoes;
    default:
      return '#000000';
  }
}

const FAR = new Set<number>([R.FarArmUpper, R.FarArmLower, R.FarHand, R.FarLegUpper, R.FarLegLower, R.FarFoot]);
/** 경계선을 그을 "덩어리" (팔과 몸통 사이엔 선이 생기고, 윗팔-아랫팔 사이엔 안 생긴다) */
const part = (r: number) => (r === R.ArmUpper || r === R.ArmLower || r === R.Hand ? 1 : r === R.FarArmUpper || r === R.FarArmLower || r === R.FarHand ? 2 : r === R.LegUpper || r === R.LegLower || r === R.Foot ? 3 : r === R.FarLegUpper || r === R.FarLegLower || r === R.FarFoot ? 4 : r === R.Head ? 5 : r === R.Neck ? 6 : 0);

/** 프레임 하나를 RGBA로 */
export function paint(p: BodyParams, o: Outfit, view: View, frame: 0 | 1 | 2 | 3, face = true): Uint8ClampedArray {
  const v = view === 'left' ? 'right' : view;
  const buf = shape(p, v, frame);
  const out = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H ? 0 : buf[y * FRAME_W + x]!);
  // 줄마다 부위별 좌우 끝 (빛은 왼쪽 위에서 — 오른쪽 1/3은 그늘)
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const r = at(x, y);
      if (!r) continue;
      let c = rgb(regionColor(r, o));
      // 그늘: 같은 덩어리 안에서 오른쪽 끝 쪽
      let right = 0;
      while (part(at(x + right + 1, y)) === part(r) && at(x + right + 1, y)) right++;
      let left = 0;
      while (part(at(x - left - 1, y)) === part(r) && at(x - left - 1, y)) left++;
      const span = left + right + 1;
      if (span >= 3 && right < span * 0.34) c = mul(c, 0.82);
      if (span >= 4 && left === 0) c = mul(c, 1.07);
      if (FAR.has(r)) c = mul(c, 0.78);
      // 바깥선: 빈칸이나 다른 덩어리와 맞닿으면 어둡게
      const edgeEmpty = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      const edgePart = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n && part(n) !== part(r) && (part(r) === 1 || part(r) === 5 || (part(r) === 0 && part(n) >= 3) || (part(r) === 3 && part(n) === 4)));
      if (edgeEmpty) c = mul(c, 0.42);
      else if (edgePart) c = mul(c, 0.62);
      const i = (y * FRAME_W + x) * 4;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }
  // 옷 디테일: 가운데 선·깃
  if ((o.frontLine || o.collar) && v === 'down') {
    const s = measure(p);
    const top = FRAME_H - 1.5 - s.H;
    const ys = Math.round(top + s.head * 1.12);
    const yc = Math.round(ys + s.head * 1.32);
    const cx = FRAME_W / 2;
    const put = (x: number, y: number, hex: string) => {
      if (at(x, y) !== R.Torso) return;
      const [a, b, c] = rgb(hex);
      const i = (y * FRAME_W + x) * 4;
      out[i] = a;
      out[i + 1] = b;
      out[i + 2] = c;
    };
    if (o.collar) for (let k = 0; k < 3; k++) (put(cx - 1 - k + 1, ys + k, o.collar), put(cx + k - 1, ys + k, o.collar));
    if (o.frontLine) for (let y = ys + 2; y < yc - 1; y++) put(cx, y, o.frontLine);
  }
  // 아주 작은 얼굴 (미리보기용 — 진짜 얼굴은 부품으로 얹는다)
  if (face && (v === 'down' || v === 'right')) {
    const s = measure(p);
    const top = FRAME_H - 1.5 - s.H;
    const ey = Math.round(top + s.head * 0.55);
    const dark: [number, number, number] = [42, 30, 30];
    const dot = (x: number, y: number) => {
      if (at(x, y) !== R.Head) return;
      const i = (y * FRAME_W + x) * 4;
      out[i] = dark[0];
      out[i + 1] = dark[1];
      out[i + 2] = dark[2];
    };
    if (v === 'down') (dot(FRAME_W / 2 - 3, ey), dot(FRAME_W / 2 + 2, ey));
    else dot(Math.round(FRAME_W / 2 + s.head * 0.3 + measure(p).stoop * 1.4), ey);
  }
  if (view === 'left') {
    // 좌우 뒤집기
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W / 2; x++) {
        const a = (y * FRAME_W + x) * 4;
        const b = (y * FRAME_W + (FRAME_W - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) {
          const t = out[a + k]!;
          out[a + k] = out[b + k]!;
          out[b + k] = t;
        }
      }
    }
  }
  return out;
}

/** 4×4 걷기 시트 (줄: 아래·왼·오른·위, 칸: 서기·걸음1·서기·걸음2) — 128×256 RGBA */
export function sheet(p: BodyParams, o: Outfit, face = true): Uint8ClampedArray {
  const W = FRAME_W * 4;
  const out = new Uint8ClampedArray(W * FRAME_H * 4 * 4);
  const views: View[] = ['down', 'left', 'right', 'up'];
  views.forEach((v, row) => {
    for (let col = 0; col < 4; col++) {
      const f = paint(p, o, v, col as 0 | 1 | 2 | 3, face && v !== 'up');
      for (let y = 0; y < FRAME_H; y++) {
        const src = y * FRAME_W * 4;
        const dst = ((row * FRAME_H + y) * W + col * FRAME_W) * 4;
        out.set(f.subarray(src, src + FRAME_W * 4), dst);
      }
    }
  });
  return out;
}

/** 엔진의 몸 상태 → 그림 매개변수 */
export function paramsFromBody(sex: Sex, age: number, musclePct: number, fatPct: number): BodyParams {
  // 근육률 30~45% → 0~1, 체지방 8~40% → 0~1 (대략)
  return { sex, age, muscle: clamp((musclePct - 30) / 15, 0, 1), fat: clamp((fatPct - 8) / 32, 0, 1) };
}
