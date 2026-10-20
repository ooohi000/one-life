/**
 * 사람에 대한 "사실"의 종류. 세계에는 진실이 있고, 각자는 그중 일부만 (때로는 틀리게) 안다.
 * 데이터로 계속 늘린다: 취업, 결혼, 이사, 사고, 전과, 연애…
 */
export type FactKey = 'university' | 'military' | 'job' | 'dating' | 'married' | 'livesIn';

export interface FactDef {
  key: FactKey;
  label: string;
  /** 인생의 큰 소식인가 (궁금해서 먼저 묻게 되는 것) */
  milestone: boolean;
}

export const FACTS: Record<FactKey, FactDef> = {
  university: { key: 'university', label: '대학', milestone: true },
  military: { key: 'military', label: '군대', milestone: true },
  job: { key: 'job', label: '직장', milestone: true },
  dating: { key: 'dating', label: '연애', milestone: false },
  married: { key: 'married', label: '결혼', milestone: true },
  livesIn: { key: 'livesIn', label: '사는 곳', milestone: false },
};

/** 가상의 대학. tier 1 = 최상위 ~ 6 = 전문대 (기획서 대학 서열 6단계) */
export const UNIVERSITIES: Record<string, { tier: number }> = {
  한울대: { tier: 1 },
  청림대: { tier: 2 },
  소망대: { tier: 3 },
  새벽대: { tier: 4 },
  늘봄대: { tier: 5 },
  한결전문대: { tier: 6 },
};

/** 비교 가능한 값이면 순위(작을수록 좋음), 아니면 null */
export function rankOf(key: FactKey, value: string): number | null {
  if (key === 'university') return UNIVERSITIES[value]?.tier ?? (value === '재수' ? 7 : null);
  return null;
}
