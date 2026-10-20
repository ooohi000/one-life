import type { Random } from '../core/Random';
import { leaveTrace, type PlaceId, type Trace } from './evidence';

/**
 * 싸움 판정. 1:1이든 패싸움이든 같은 규칙.
 * 장면은 짧게, 남는 건 길게: 누가 다쳤나(전치 몇 주), 누가 봤나, CCTV, 누가 찍어서 올렸나.
 * 이 "남는 것"이 학폭위·경찰·소문의 재료가 된다.
 */
export interface Fighter {
  id: string;
  name: string;
  /** 싸움 기술 0~100 */
  fighting: number;
  /** 힘 0~100 (근육량에서) */
  power: number;
  /** 특성 보정 */
  fightPower: number;
  /** 맷집 0~1 */
  toughness: number;
}

export type { PlaceId as FightPlace } from './evidence';

export interface Injury {
  id: string;
  /** 0 없음, 1 멍·코피, 2 전치 2주 안팎, 3 전치 4주 이상(골절 등) */
  level: 0 | 1 | 2 | 3;
  weeks: number;
}

export interface FightResult {
  winner: 'A' | 'B';
  /** 먼저 친 쪽 */
  firstStrike: 'A' | 'B';
  injuries: Injury[];
  /** 남은 흔적: CCTV(언제까지), 블랙박스, 목격자, 촬영·업로드, 현장 출동 */
  trace: Trace;
  /** 몇 대 몇 */
  sizes: [number, number];
  summary: string;
}

/** 한 편의 싸움 실력: 제일 센 애가 중심, 머릿수는 갈수록 덜 보탬 */
function sideStrength(side: Fighter[], rng: Random): number {
  const each = side.map((f) => f.fighting * 0.6 + f.power * 0.4 + f.fightPower + (rng.next() - 0.5) * 30).sort((a, b) => b - a);
  return each.reduce((s, v, i) => s + v * 0.6 ** i, 0);
}

export function resolveFight(
  A: Fighter[],
  B: Fighter[],
  opts: { place: PlaceId; firstStrike: 'A' | 'B'; rng: Random; day?: number },
): FightResult {
  const { rng } = opts;
  const first = opts.firstStrike === 'A' ? 1.12 : 0.9; // 선빵은 실제로 유리하다
  const sa = sideStrength(A, rng) * first;
  const sb = sideStrength(B, rng);
  const winner: 'A' | 'B' = sa >= sb ? 'A' : 'B';
  const gap = Math.abs(sa - sb) / Math.max(1, Math.max(sa, sb));
  const injuries: Injury[] = [];
  const hurt = (f: Fighter, losing: boolean) => {
    const roll = rng.next() * (losing ? 1 + gap * 2 : 0.6) * (1 - f.toughness * 0.4) * (1 + (A.length + B.length - 2) * 0.05);
    const level: Injury['level'] = roll > 1.75 ? 3 : roll > 1.05 ? 2 : roll > 0.35 ? 1 : 0;
    injuries.push({ id: f.id, level, weeks: level === 3 ? 4 + Math.floor(rng.next() * 4) : level === 2 ? 2 : 0 });
  };
  for (const f of A) hurt(f, winner === 'B');
  for (const f of B) hurt(f, winner === 'A');

  const serious = injuries.some((i) => i.level >= 2);
  const trace = leaveTrace(opts.place, opts.day ?? 0, A.length + B.length, serious, rng);
  const worst = Math.max(...injuries.map((i) => i.level));
  const size = `${A.length}대${B.length}`;
  const summary =
    (A.length + B.length > 2 ? `${size} 패싸움. ` : '') +
    (worst >= 3 ? '누군가 일어나지 못했다. 구급차가 왔다.' : worst === 2 ? '코피가 터지고 얼굴이 부었다. 병원에서 전치 2주가 나왔다.' : worst === 1 ? '멍이 들었다.' : '몇 대 오가고 끝났다.') +
    (trace.filmed ? ' 누가 휴대폰으로 찍고 있었다.' : '') +
    (trace.policeOnScene ? ' 누가 112에 신고했다. 순찰차가 왔다.' : '');
  return { winner, firstStrike: opts.firstStrike, injuries, trace, sizes: [A.length, B.length], summary };
}
