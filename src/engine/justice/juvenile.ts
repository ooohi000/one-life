import type { Random } from '../core/Random';
import type { CrimeDef } from './crimes';

/**
 * 소년 사법 절차 (게임용 근사 — 실제 사건은 사안마다 다르다).
 *
 * - 만 10~13세 촉법소년: 형사처벌 없음, 소년부 보호처분만
 * - 만 14세 이상(고등학생 전부): 범죄소년 — 경찰 → 검찰 → 소년부 송치 또는 형사재판
 * - 보호처분 1~10호: 1 보호자 감호위탁(6개월), 2 수강명령(100시간), 3 사회봉사(200시간, 14세+),
 *   4 단기 보호관찰(1년), 5 장기 보호관찰(2년), 6 아동복지시설 위탁(6개월), 7 의료재활기관 위탁(6개월),
 *   8 1개월 소년원, 9 단기 소년원(6개월), 10 장기 소년원(2년). 여러 호를 함께 받기도 한다(예: 1·2·4호).
 * - 보호처분은 전과가 아니다. 수사경력자료에는 남는다(14세 이상). 3년 안에 같은 범죄를 또 하면 무거워지고,
 *   3년 안에는 사관생도·부사관·군무원 임용 때 조회될 수 있다. 시설 처분(6~10호)은 그 기간 학교를 못 다닌다.
 * - 무거운 사건은 형사재판: 집행유예 또는 소년교도소. 19세 미만은 부정기형(예: 장기 3년 단기 2년),
 *   상한 장기 10년·단기 5년. 형사처벌은 전과로 남는다.
 * - 심리 전 소년분류심사원에 3~4주 위탁되기도 한다(무거운 사건, 재범).
 */
export type Disposition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  1: '1호 보호자 감호위탁',
  2: '2호 수강명령',
  3: '3호 사회봉사',
  4: '4호 단기 보호관찰(1년)',
  5: '5호 장기 보호관찰(2년)',
  6: '6호 아동복지시설 위탁(6개월)',
  7: '7호 의료재활기관 위탁(6개월)',
  8: '8호 1개월 소년원',
  9: '9호 단기 소년원(6개월)',
  10: '10호 장기 소년원(2년)',
};
/** 그 처분으로 학교를 못 나가는 날 */
const DAYS_AWAY: Record<Disposition, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 180, 7: 180, 8: 30, 9: 180, 10: 730 };

export interface Offender {
  age: number;
  /** 지난 경찰 입건 횟수 */
  priorCases: number;
  /** 지난 보호처분 중 가장 무거운 호 (없으면 0) */
  worstPrior: number;
  /** 보호자가 아이를 지킬 힘 0~1 (부모 애착·곁에 있음·형편) */
  guardian: number;
  /** 반성 0~1 */
  remorse: number;
  /** 말빨·태도 (특성 persuade) */
  persuade: number;
}

export type Stage = 'police' | 'prosecutor' | 'classification' | 'juvenileCourt' | 'criminalCourt';

export interface CaseResult {
  crimeId: string;
  steps: string[];
  final: string;
  /** 보호처분 (받았으면) */
  dispositions: Disposition[];
  /** 소년교도소 (부정기형) */
  prison?: { shortYears: number; longYears: number; servedDays: number };
  /** 남는 기록 */
  record: { investigation: boolean; juvenile: boolean; criminal: boolean };
  /** 학교를 못 나가는 날 (분류심사원 + 시설 처분 + 수감) */
  daysAway: number;
  /** 범칙금 */
  fine: number;
  settled: boolean;
}

/**
 * 걸린 사건 하나를 끝까지 처리한다.
 * settled: 피해자와 합의했나 (부모 형편·태도·피해 크기로 정해 넘긴다)
 */
export function processCase(c: CrimeDef, o: Offender, settled: boolean, rng: Random): CaseResult {
  const res: CaseResult = { crimeId: c.id, steps: [], final: '', dispositions: [], record: { investigation: false, juvenile: false, criminal: false }, daysAway: 0, fine: 0, settled };
  const step = (s: string) => res.steps.push(s);

  // 범칙금으로 끝나는 위반
  if (c.fineOnly) {
    res.fine = c.fineOnly;
    step(`경찰에게 단속됐다. 범칙금 ${(c.fineOnly / 10000).toFixed(0)}만 원. 부모님께 연락이 갔다.`);
    res.final = '범칙금';
    return res;
  }

  // 피해자가 처벌을 원치 않으면 (반의사불벌) 여기서 끝
  if (c.victimCanDrop && settled && o.priorCases === 0) {
    step('경찰서에서 진술을 했다. 부모님이 피해자 측과 합의했다. 피해자가 처벌을 원치 않는다고 했다.');
    res.record.investigation = o.age >= 14;
    res.final = '공소권 없음 (합의)';
    return res;
  }

  const weight = c.severity + o.priorCases * 1.5 + o.worstPrior * 0.4 + (settled ? -1.5 : 0) - o.remorse * 1.5 - o.persuade * 2 + (1 - o.guardian) * 2;
  step(`경찰 조사를 받았다. 혐의: ${c.label} (${c.law}).`);
  if (o.age < 14) {
    step('촉법소년이라 형사처벌 대상이 아니다. 소년부로 넘어갔다.');
  } else {
    res.record.investigation = true;
    // 경미한 초범: 경찰 단계에서 선도
    if (weight <= 2.5 && o.priorCases === 0) {
      step('초범이고 반성하는 태도를 보여 경찰 선도 프로그램을 받고 끝났다.');
      res.final = '훈방 (선도 프로그램)';
      return res;
    }
    step('검찰로 넘어갔다.');
    if (weight <= 4.5 && o.priorCases <= 1) {
      step('선도조건부 기소유예. 상담과 교육을 다 받으면 재판에 넘기지 않는다.');
      res.final = '선도조건부 기소유예';
      return res;
    }
    // 무거우면 형사재판
    if (weight >= 9 && o.age >= 16 && rng.chance(Math.min(0.8, (weight - 8) * 0.25))) {
      return criminalCourt(c, o, weight, settled, rng, res);
    }
    step('소년부로 송치됐다.');
  }
  return juvenileCourt(o, weight, c, rng, res);
}

function juvenileCourt(o: Offender, weight: number, c: CrimeDef, rng: Random, res: CaseResult): CaseResult {
  const step = (s: string) => res.steps.push(s);
  res.record.juvenile = true;
  if (weight >= 7 || o.priorCases >= 2) {
    const d = 21 + Math.floor(rng.next() * 10);
    res.daysAway += d;
    step(`심리 전에 소년분류심사원에 ${d}일 위탁됐다. 휴대폰을 반납했다.`);
  }
  step('소년부 판사 앞에 섰다. 옆에 부모님이 앉았다.');
  const w = weight + (rng.next() - 0.5) * 1.5;
  let ds: Disposition[];
  if (c.id === 'drugs') ds = [7, 5];
  else if (w <= 3.5) ds = [1];
  else if (w <= 5) ds = [1, 2];
  else if (w <= 6.5) ds = [1, 2, 4];
  else if (w <= 8) ds = [1, 3, 5];
  else if (w <= 9) ds = o.guardian < 0.4 ? [6, 5] : [8, 5];
  else if (w <= 11) ds = [9];
  else ds = [10];
  // 보호자가 아이를 못 지키면 집 대신 시설로
  if (o.guardian < 0.25 && ds.length === 1 && ds[0] === 1) ds = [6];
  res.dispositions = ds;
  for (const d of ds) res.daysAway += DAYS_AWAY[d];
  res.final = ds.map((d) => DISPOSITION_LABEL[d]).join(' + ');
  step(`결정: ${res.final}.`);
  if (ds.some((d) => d >= 8)) step('소년원 안에서도 학교 수업은 이어진다. 검정고시를 준비하는 애들이 많았다.');
  step('전과는 아니다. 하지만 수사경력은 남는다. 3년 안에 또 하면 훨씬 무거워진다.');
  return res;
}

function criminalCourt(c: CrimeDef, o: Offender, weight: number, settled: boolean, rng: Random, res: CaseResult): CaseResult {
  const step = (s: string) => res.steps.push(s);
  step('검찰이 형사재판에 넘겼다. 국선변호인을 만났다.');
  // 법원이 다시 소년부로 보내기도 한다
  if (rng.chance(0.3 + o.remorse * 0.2 + (settled ? 0.15 : 0))) {
    step('판사가 "보호처분이 맞다"며 사건을 소년부로 돌려보냈다.');
    return juvenileCourt(o, weight - 1, c, rng, res);
  }
  res.record.criminal = true;
  if (settled || (o.priorCases === 0 && rng.chance(0.5))) {
    res.final = '징역형 집행유예';
    step('징역형에 집행유예가 나왔다. 감옥엔 안 가지만, 전과가 생겼다.');
    return res;
  }
  const longYears = Math.min(10, Math.max(1, Math.round((weight - 7) * 0.9 + rng.next())));
  const shortYears = Math.max(1, Math.min(5, Math.round(longYears * 0.6)));
  const servedDays = Math.round((shortYears + (longYears - shortYears) * rng.next() * 0.5) * 365);
  res.prison = { shortYears, longYears, servedDays };
  res.daysAway += servedDays;
  res.final = `소년교도소 (장기 ${longYears}년 단기 ${shortYears}년)`;
  step(`실형. 부정기형 장기 ${longYears}년, 단기 ${shortYears}년. 소년교도소로 갔다. 전과가 생겼다.`);
  return res;
}
