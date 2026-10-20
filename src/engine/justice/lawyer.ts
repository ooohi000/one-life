import type { Random } from '../core/Random';

/**
 * 변호사. 돈 있는 집은 산다. 그게 현실이다.
 *
 * 근거 (2026년 보도):
 * - 학폭위 의견서 약 200만 원, 상담·동행 약 500만 원. 행정심판·소송으로 가면 수천만 원
 * - 학부모들은 "입시 보험료"라고 부른다. 신고를 받으면 맞신고·소송부터 검토하는 경우가 늘었다
 * - 서울교육청(2023.3~2024.2) 가해 측 조치 취소 소송 148건 중 24건(약 16%)이 일부 인용
 * - 돈이 없으면: 소년부 국선보조인, 대한법률구조공단 무료 상담
 */
export type CounselKind = 'none' | 'public' | 'private' | 'top';

export interface Counsel {
  kind: CounselKind;
  label: string;
  /** 비용(원) */
  fee: number;
  /** 말·서류의 힘 0~1 (선처·감경) */
  persuade: number;
  /** 증거 다투기 0~1 (부인할 때 입증을 어렵게) */
  contest: number;
  /** 합의 끌어내기 0~1 */
  settle: number;
  /** 증거보전 신청 (영상이 지워지기 전에) */
  preserves: boolean;
}

export const COUNSEL: Record<CounselKind, Counsel> = {
  none: { kind: 'none', label: '변호사 없음', fee: 0, persuade: 0, contest: 0, settle: 0, preserves: false },
  public: { kind: 'public', label: '국선보조인·법률구조공단', fee: 0, persuade: 0.15, contest: 0.1, settle: 0.1, preserves: false },
  private: { kind: 'private', label: '학폭·소년사건 변호사', fee: 5_000_000, persuade: 0.4, contest: 0.4, settle: 0.3, preserves: true },
  top: { kind: 'top', label: '대형 로펌 전담팀', fee: 20_000_000, persuade: 0.6, contest: 0.6, settle: 0.45, preserves: true },
};

export interface FamilyMeans {
  origin: 'rich' | 'normal' | 'poor';
  /** 부모가 기록·입시에 거는 정도 0~1 */
  expectation: number;
  /** 부모가 일에 뛰어드는 정도 0~1 (간섭·관심) */
  involvement: number;
}

/**
 * 변호사를 살까?
 * stakes: 걸린 것의 무게 0~1 (예상 조치·형사 여부·입시)
 * side: 'accused' 가해 쪽 / 'victim' 피해 쪽
 */
export function hireCounsel(f: FamilyMeans, stakes: number, side: 'accused' | 'victim', rng: Random): Counsel {
  const money = { rich: 1, normal: 0.45, poor: 0.08 }[f.origin];
  const want = stakes * (0.4 + f.expectation * 0.4 + f.involvement * 0.3) * (side === 'victim' ? 0.8 : 1);
  if (f.origin === 'rich' && rng.chance(want * 0.6)) return COUNSEL.top;
  if (rng.chance(want * money * 1.1)) return COUNSEL.private;
  if (stakes >= 0.5 && rng.chance(0.6)) return COUNSEL.public;
  return COUNSEL.none;
}

/** 학폭위 결과에 불복 (행정심판·소송): 약 16%가 일부 인용 */
export function appeal(c: Counsel, rng: Random): { cost: number; reduced: boolean } {
  if (c.kind === 'none' || c.kind === 'public') return { cost: 0, reduced: rng.chance(0.05) };
  return { cost: c.kind === 'top' ? 30_000_000 : 12_000_000, reduced: rng.chance(0.1 + c.persuade * 0.15) };
}

/** 합의금 (원): 다친 정도와 피해 쪽 변호사가 키운다 */
export function settlementAmount(worstInjury: number, victimCounsel: Counsel, rng: Random): number {
  const base = [300_000, 1_000_000, 3_000_000, 10_000_000][Math.max(0, Math.min(3, worstInjury))]!;
  return Math.round((base * (0.7 + rng.next() * 0.8) * (1 + victimCounsel.settle)) / 100_000) * 100_000;
}
