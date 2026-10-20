/** 출신 */
export type Origin = 'rich' | 'normal' | 'poor';
export const ORIGIN_LABEL_KO: Record<Origin, string> = { rich: '부자', normal: '평범', poor: '서민' };

/**
 * 타고난 스탯 (1~10). 생성 때 포인트로 정하고, 이후엔 거의 안 변한다.
 * 외모는 이목구비가 아니라 피부·탈모·키·체형으로 반영한다(기획서 "외모의 구조").
 */
export const INNATE_KEYS = ['intelligence', 'constitution', 'skin', 'hairResistance', 'heightPotential', 'bodyFrame'] as const;
export type InnateKey = (typeof INNATE_KEYS)[number];
export type InnateStats = Record<InnateKey, number>;

export const INNATE_LABEL_KO: Record<InnateKey, string> = {
  intelligence: '머리',
  constitution: '체질',
  skin: '피부 바탕',
  hairResistance: '탈모 저항',
  heightPotential: '키 체질',
  bodyFrame: '체형 체질',
};

/**
 * 노력으로 얻는 스탯 (0~100). 시간을 투자해야 오르고, 방치하면 녹슨다.
 * 힘은 여기 없다 — 근육량에서 계산된다(body/composition.ts의 powerOf).
 */
export const EFFORT_KEYS = ['study', 'fighting', 'endurance'] as const;
export type EffortKey = (typeof EFFORT_KEYS)[number];

/** 생활하며 느는 스탯 (0~100). 일상 경험으로 쌓이고 거의 안 빠진다. */
export const LIFE_KEYS = ['tact', 'streetSmart', 'speech'] as const;
export type LifeKey = (typeof LIFE_KEYS)[number];

export type GrowStatKey = EffortKey | LifeKey;
export const GROW_STAT_KEYS: readonly GrowStatKey[] = [...EFFORT_KEYS, ...LIFE_KEYS];
export const GROW_LABEL_KO: Record<GrowStatKey, string> = {
  study: '공부',
  fighting: '싸움 기술',
  endurance: '지구력',
  tact: '눈치',
  streetSmart: '생활력',
  speech: '말빨',
};

/** 이목구비와 머리 — 직접 고르는 생김새(우열 없음). 화면에서 부위 스프라이트 번호로 쓰인다. */
export interface Appearance {
  eyes: number;
  nose: number;
  mouth: number;
  faceShape: number;
  hairStyle: number;
  hairColor: number;
}

/** 오늘 하루 동안 쌓이는 값. 잠들 때 정산하고 비운다. */
export interface DayLedger {
  kcalIn: number;
  proteinG: number;
  kcalExercise: number;
  strengthMinutes: number; // 근력 운동 시간
}

/** 몸 내부 상태 (숨겨진 수치) */
export interface BodyState {
  sleepDebtMin: number; // 누적 수면 부채(분)
  minutesAwake: number; // 마지막 기상 이후 깨어 있던 시간
  stress: number; // 0~100
  highStressDays: number; // 스트레스 높은 날이 이어진 일수

  // 신체 구성 (인바디·건강검진에서만 정확히 보인다)
  weightKg: number;
  muscleKg: number; // 골격근량
  fatKg: number; // 체지방량
  naturalMuscleKg: number; // 운동 안 해도 유지되는 근육량
  daysSinceStrength: number; // 마지막 근력 운동 이후 일수
  appetite: number; // 식욕 배율 0.8~1.5. 적자가 이어지면 오르고(더 먹게 됨), 흑자면 내려간다
  metabolicAdaptation: number; // 절전 모드 0~0.15. 굶으면 몸이 소모량을 줄인다(다이어트 정체기)

  today: DayLedger;
}

export interface Character {
  id: string;
  name: string;
  origin: Origin;
  ageYears: number;
  appearance: Appearance;
  innate: InnateStats;
  heightCm: number; // 소수 — 화면엔 반올림
  growthRemainingCm: number; // 성장기에 더 클 수 있는 최대치. 잘 자고 잘 먹어야 다 채운다
  stats: Record<GrowStatKey, number>;
  /** 스탯별 역대 최고치 — 녹슬어도 이 근처까진 빨리 회복되고, 일정 비율 아래로는 안 떨어진다 */
  peakStats: Record<GrowStatKey, number>;
  lastUsedDay: Partial<Record<GrowStatKey, number>>;
  body: BodyState;
}

export const emptyLedger = (): DayLedger => ({ kcalIn: 0, proteinG: 0, kcalExercise: 0, strengthMinutes: 0 });
