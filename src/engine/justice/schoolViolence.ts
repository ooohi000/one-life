/**
 * 학교폭력대책심의위원회(학폭위). 교육청에서 열린다.
 *
 * 근거 (요약, 게임용 근사):
 * - 조치 1~9호: 1 서면사과, 2 접촉·협박·보복 금지, 3 교내봉사, 4 사회봉사, 5 특별교육·심리치료,
 *   6 출석정지, 7 학급교체, 8 전학, 9 퇴학(고교만)
 * - 판단 요소: 심각성·지속성·고의성(각 0~4) + 반성·화해(0~4, 높을수록 감경) → 판정 점수
 * - 생기부 보존: 1~3호 졸업과 함께 삭제, 4~5호 졸업 후 2년, 6~7호 4년(심의로 졸업 때 삭제 가능), 8호 4년, 9호 영구
 * - 2026학년도 대입부터 수시·정시 모든 전형에 반영
 * - 정당방위는 쉽게 인정되지 않는다: 상대가 먼저 쳤고, 그 순간 계속되는 폭력을 막는 정도였고, 나중에 보복하지 않았고,
 *   그걸 증명할 수 있어야(CCTV·목격자·진단서) 한다. 아니면 쌍방.
 */

export interface StudentRole {
  id: string;
  /** 때린 쪽인가 */
  hit: boolean;
  /** 이 사람이 먼저 쳤나 */
  struckFirst: boolean;
  /** 그 자리에서 계속되는 폭력을 막는 정도였나 (지나치면 false) */
  proportionate: boolean;
  /** 나중에 찾아가서 갚았나 */
  retaliatedLater: boolean;
  /** 남을 지키려다 낀 건가 (일진 사냥꾼) */
  defendingOther: boolean;
  /** 이번이 몇 번째인가 (지속성) */
  priorIncidents: number;
  /** 반성 0~1 */
  remorse: number;
  /** 피해자와 화해했나 0~1 */
  reconciled: number;
  /** 말빨·태도 보정 (특성 persuade + 변호사) */
  persuade: number;
  /** 부인했는데 증거로 입증이 안 됐다 (false면 조치 없음) */
  proven?: boolean;
  /** 말하지 못하게 협박·회유한 게 드러났다 (고의성↑, 2호 접촉·협박·보복 금지) */
  threatened?: boolean;
}

export interface Incident {
  type: 'assault' | 'groupAssault' | 'bullying' | 'cyber' | 'extortion';
  /** 피해자 최대 부상 단계 0~3 */
  worstInjury: number;
  evidence: { cctv: boolean; witnesses: number; filmed: boolean; medical: boolean };
}

export interface Measure {
  id: string;
  /** 0 = 조치 없음 (정당방위 인정 포함) */
  level: number;
  label: string;
  selfDefenseAccepted: boolean;
  score: number;
  /** 생기부 보존 */
  record: string;
  /** 대입 불이익 0~1 */
  admissionPenalty: number;
  /** 학교를 못 나가는 날 */
  daysOut: number;
}

export const MEASURE_LABEL = ['조치 없음', '서면사과', '접촉·보복 금지', '교내봉사', '사회봉사', '특별교육·심리치료', '출석정지', '학급교체', '전학', '퇴학'];
const RECORD = ['', '졸업과 함께 삭제', '졸업과 함께 삭제', '졸업과 함께 삭제', '졸업 후 2년 보존', '졸업 후 2년 보존', '졸업 후 4년 (심의 시 졸업 때 삭제 가능)', '졸업 후 4년 (심의 시 졸업 때 삭제 가능)', '졸업 후 4년', '영구 보존'];

const TYPE_SEVERITY: Record<Incident['type'], number> = { assault: 1, groupAssault: 2, bullying: 1.5, cyber: 1.2, extortion: 2 };

/** 정당방위 인정 여부 */
export function selfDefense(r: StudentRole, inc: Incident): boolean {
  if (!r.hit) return true;
  const startedByOther = !r.struckFirst;
  const proof = inc.evidence.cctv || inc.evidence.filmed || inc.evidence.witnesses >= 3;
  if (r.retaliatedLater || !r.proportionate || !proof) return false;
  // 내가 맞은 게 아니라 남을 지키려 낀 경우도 같은 기준 (그 순간, 그 정도로)
  return startedByOther || r.defendingOther;
}

export function decide(r: StudentRole, inc: Incident): Measure {
  if (r.proven === false) {
    return { id: r.id, level: 0, label: '조치 없음 (사실 확인 불가)', selfDefenseAccepted: false, score: 0, record: '', admissionPenalty: 0, daysOut: 0 };
  }
  if (selfDefense(r, inc)) {
    return { id: r.id, level: 0, label: MEASURE_LABEL[0]!, selfDefenseAccepted: r.hit, score: 0, record: '', admissionPenalty: 0, daysOut: 0 };
  }
  const severity = Math.min(4, inc.worstInjury + TYPE_SEVERITY[inc.type] * (inc.worstInjury > 0 ? 0.5 : 1));
  const persistence = Math.min(4, r.priorIncidents * 1.3);
  const intent = Math.min(4, (r.struckFirst ? 2 : 1) + (r.retaliatedLater ? 1.5 : 0) + (r.threatened ? 1.5 : 0) + (inc.type === 'groupAssault' || inc.type === 'extortion' ? 1 : 0) - (r.defendingOther ? 1 : 0));
  const remorse = Math.min(4, r.remorse * 3 + r.persuade * 2);
  const reconcile = Math.min(4, r.reconciled * 4);
  // 감경 요소는 높을수록 점수에서 빠진다
  const score = Math.max(1, Math.round(severity + persistence + intent + (4 - remorse) + (4 - reconcile) - 4));
  const level = score <= 3 ? 1 : score <= 5 ? 3 : score <= 7 ? 4 : score <= 9 ? 5 : score <= 11 ? 6 : score <= 13 ? 7 : score <= 16 ? 8 : 9;
  // 협박이 드러나면 최소 2호(접촉·협박·보복 금지)
  const lv = r.threatened ? Math.max(level, 2) : level;
  const penalty = [0, 0.05, 0.05, 0.1, 0.25, 0.3, 0.5, 0.6, 0.8, 1][lv]!;
  const daysOut = lv === 6 ? 5 + Math.min(25, score) : lv === 9 ? 999 : 0;
  return { id: r.id, level: lv, label: MEASURE_LABEL[lv]! + (r.threatened && lv > 2 ? ' + 2호 접촉·협박·보복 금지' : ''), selfDefenseAccepted: false, score, record: RECORD[lv]!, admissionPenalty: penalty, daysOut };
}
