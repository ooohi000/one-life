import type { Random } from '../core/Random';

/**
 * 장소와 증거. "방과 후에 때리면 아무도 모른다"는 반쯤 맞고 반쯤 틀리다.
 *
 * 근거:
 * - 지자체·공공기관 CCTV 176만 대(2023), 2024년 약 190만 대 추정. 서울만 약 20만 대, 그중 33%가 지능형(이상행동 자동 감지)
 * - 하지만 관제요원 1명이 평균 477대를 본다(2024) → 실시간으로 잡히는 일은 드물다. CCTV는 "나중에 돌려 보는" 증거다
 * - 가게·업소 CCTV는 보통 1~4주 뒤 자동 삭제. 늦게 신고하면 영상이 없다 → 증거보전 신청(변호사)이 중요
 * - 주차된 차 블랙박스도 찍는다. 대신 며칠이면 덮어쓴다
 */
export type PlaceId =
  | 'classroom' | 'schoolHall' | 'schoolBack' | 'alley' | 'apartment' | 'park' | 'convenience'
  | 'pcbang' | 'karaoke' | 'downtown' | 'subway' | 'riverside' | 'abandoned';

export interface PlaceDef {
  id: PlaceId;
  label: string;
  /** 그 장면이 어떤 카메라에든 찍힐 확률 */
  cctv: number;
  /** 그 영상이 남아 있는 날 */
  retention: number;
  /** 지능형 CCTV가 이상행동을 잡아 출동할 확률 (서울 기준) */
  smartAlert: number;
  /** 주차 차량 블랙박스에 찍힐 확률 */
  blackbox: number;
  /** 지나가는 사람 (평균) */
  crowd: number;
}

export const PLACES: Record<PlaceId, PlaceDef> = {
  classroom: { id: 'classroom', label: '교실', cctv: 0, retention: 0, smartAlert: 0, blackbox: 0, crowd: 15 }, // 교실엔 CCTV가 없다
  schoolHall: { id: 'schoolHall', label: '학교 복도·운동장', cctv: 0.8, retention: 30, smartAlert: 0, blackbox: 0, crowd: 10 },
  schoolBack: { id: 'schoolBack', label: '학교 뒤 골목', cctv: 0.35, retention: 30, smartAlert: 0.02, blackbox: 0.3, crowd: 1 },
  alley: { id: 'alley', label: '주택가 골목', cctv: 0.6, retention: 30, smartAlert: 0.05, blackbox: 0.55, crowd: 1 },
  apartment: { id: 'apartment', label: '아파트 단지', cctv: 0.9, retention: 30, smartAlert: 0.02, blackbox: 0.7, crowd: 3 },
  park: { id: 'park', label: '공원·놀이터', cctv: 0.75, retention: 30, smartAlert: 0.08, blackbox: 0.1, crowd: 4 },
  convenience: { id: 'convenience', label: '편의점 앞', cctv: 0.95, retention: 14, smartAlert: 0.02, blackbox: 0.4, crowd: 5 },
  pcbang: { id: 'pcbang', label: 'PC방', cctv: 0.95, retention: 10, smartAlert: 0, blackbox: 0, crowd: 8 },
  karaoke: { id: 'karaoke', label: '노래방', cctv: 0.5, retention: 10, smartAlert: 0, blackbox: 0, crowd: 1 }, // 복도만 찍힌다
  downtown: { id: 'downtown', label: '번화가', cctv: 0.97, retention: 30, smartAlert: 0.12, blackbox: 0.5, crowd: 20 },
  subway: { id: 'subway', label: '지하철역', cctv: 0.99, retention: 30, smartAlert: 0.15, blackbox: 0, crowd: 25 },
  riverside: { id: 'riverside', label: '하천 산책로·다리 밑', cctv: 0.3, retention: 30, smartAlert: 0.03, blackbox: 0, crowd: 2 },
  abandoned: { id: 'abandoned', label: '공사장·빈 건물', cctv: 0.05, retention: 30, smartAlert: 0, blackbox: 0.05, crowd: 0 },
};

/** 그 자리에 실제로 남은 것 (싸움 직후) */
export interface Trace {
  day: number;
  place: PlaceId;
  /** 찍힌 카메라 영상 (언제까지 남나) */
  cctvUntil: number | null;
  blackboxUntil: number | null;
  witnesses: number;
  /** 누가 휴대폰으로 찍었나 — 올리면 영원히 남고, 안 올리면 그 사람 폰에만 */
  filmed: boolean;
  uploaded: boolean;
  /** 그 자리에서 경찰이 왔나 */
  policeOnScene: boolean;
}

export function leaveTrace(place: PlaceId, day: number, fighters: number, injuredBadly: boolean, rng: Random): Trace {
  const p = PLACES[place];
  const witnesses = Math.round(p.crowd * (0.5 + rng.next()) * (1 + fighters / 6));
  const filmed = witnesses > 0 && rng.chance(Math.min(0.85, witnesses * 0.06));
  // 지나가던 사람의 112 신고 + 지능형 CCTV 감지
  // 학교 안에서는 112보다 선생님이 먼저 온다
  const inSchool = place === 'classroom' || place === 'schoolHall';
  const call = (1 - (1 - Math.min(0.6, witnesses * 0.02 * (injuredBadly ? 2 : 1))) * (1 - p.smartAlert * (fighters >= 4 ? 2 : 1))) * (inSchool ? 0.08 : 1);
  return {
    day,
    place,
    cctvUntil: rng.chance(p.cctv) ? day + p.retention : null,
    blackboxUntil: rng.chance(p.blackbox) ? day + 3 + Math.floor(rng.next() * 5) : null,
    witnesses,
    filmed,
    uploaded: filmed && rng.chance(0.35),
    policeOnScene: rng.chance(call),
  };
}

/** 조사가 시작된 날 손에 쥘 수 있는 증거 */
export interface Evidence {
  cctv: boolean;
  blackbox: boolean;
  witnesses: number;
  filmed: boolean;
  medical: boolean;
  /** 영상이 이미 지워져서 놓친 것 */
  lost: string[];
}

/**
 * 신고가 늦을수록 증거가 사라진다.
 * preservedOn: 변호사가 증거보전 신청을 한 날 (그날까지 남아 있던 영상은 지켜진다)
 */
export function gatherEvidence(t: Trace, reportDay: number, medical: boolean, preservedOn: number | null = null): Evidence {
  const keep = (until: number | null) => until !== null && (reportDay <= until || (preservedOn !== null && preservedOn <= until));
  const lost: string[] = [];
  if (t.cctvUntil !== null && !keep(t.cctvUntil)) lost.push('CCTV 영상 (보존 기간이 지나 삭제됨)');
  if (t.blackboxUntil !== null && !keep(t.blackboxUntil)) lost.push('블랙박스 영상 (덮어씌워짐)');
  const days = reportDay - t.day;
  return {
    cctv: keep(t.cctvUntil),
    blackbox: keep(t.blackboxUntil),
    // 목격자는 시간이 지나면 흐려지고, 나서기 싫어한다
    witnesses: Math.round(t.witnesses * Math.max(0.2, 1 - days / 60) * 0.5),
    filmed: t.uploaded || (t.filmed && days < 14),
    medical,
    lost,
  };
}

/** 부인할 때 사실이 입증되나 */
export function proven(e: Evidence, denies: boolean, defenseLawyer: number, rng: Random): boolean {
  if (!denies) return true;
  const strength = (e.cctv ? 0.6 : 0) + (e.blackbox ? 0.4 : 0) + (e.filmed ? 0.5 : 0) + Math.min(0.4, e.witnesses * 0.1) + (e.medical ? 0.25 : 0) + 0.1; // 피해자 진술
  return rng.chance(Math.max(0.05, Math.min(0.97, strength - defenseLawyer * 0.25)));
}
