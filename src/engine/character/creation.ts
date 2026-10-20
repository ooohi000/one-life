import type { Random } from '../core/Random';
import {
  type Appearance,
  emptyLedger,
  type Character,
  INNATE_KEYS,
  type InnateKey,
  type InnateStats,
  type Origin,
} from './types';

export const INNATE_MIN = 1;
export const INNATE_MAX = 10;
/** 기본값(모두 1) 위에 나눠 줄 포인트. 평균 5쯤 되게. */
export const CREATION_POINTS = 24;

export interface CreationInput {
  id: string;
  name: string;
  origin: Origin;
  appearance: Appearance;
  /** 각 스탯에 추가로 준 포인트. 합이 CREATION_POINTS여야 한다. */
  allocation: Partial<Record<InnateKey, number>>;
  /** 주사위로 ±1 흔들기 (기본 켜짐) */
  dice?: boolean;
}

export type CreationError =
  | { code: 'pointsMismatch'; used: number; expected: number }
  | { code: 'outOfRange'; key: InnateKey; value: number };

export function validateAllocation(allocation: CreationInput['allocation']): CreationError | null {
  let used = 0;
  for (const key of INNATE_KEYS) {
    const add = allocation[key] ?? 0;
    const value = INNATE_MIN + add;
    if (add < 0 || value > INNATE_MAX || !Number.isInteger(add)) return { code: 'outOfRange', key, value };
    used += add;
  }
  if (used !== CREATION_POINTS) return { code: 'pointsMismatch', used, expected: CREATION_POINTS };
  return null;
}

/** 출신이 주는 출발선. 재능이 아니라 환경(학원, 운동 기회, 집안일)의 차이. */
const ORIGIN_HEAD_START: Record<Origin, Partial<Record<'study' | 'endurance' | 'streetSmart' | 'tact', number>>> = {
  rich: { study: 12, endurance: 4 },
  normal: { study: 6, streetSmart: 3 },
  poor: { streetSmart: 10, tact: 5 },
};

export function createCharacter(input: CreationInput, rng: Random): Character {
  const error = validateAllocation(input.allocation);
  if (error) throw new Error(`캐릭터 생성 실패: ${JSON.stringify(error)}`);

  const innate = {} as InnateStats;
  for (const key of INNATE_KEYS) {
    let v = INNATE_MIN + (input.allocation[key] ?? 0);
    if (input.dice !== false) {
      const roll = rng.next();
      if (roll < 0.15) v -= 1;
      else if (roll > 0.85) v += 1;
    }
    innate[key] = Math.min(INNATE_MAX, Math.max(INNATE_MIN, v));
  }

  // 고1(16세) 기준: 최종 키 일부는 아직 남아 있다(잘 자고 잘 먹어야 다 큰다)
  const finalHeight = 160 + innate.heightPotential * 2.4 + rng.int(-2, 2);
  const growthRemainingCm = rng.int(1, 6);
  const heightCm = Math.round(finalHeight - growthRemainingCm);
  const head = ORIGIN_HEAD_START[input.origin];

  // 신체 구성: 체형 체질이 좋으면 근육이, 체질이 약하면 지방이 많은 편
  const bmiTarget = 19 + innate.bodyFrame * 0.3 + (rng.next() * 2 - 1);
  const weightKg = bmiTarget * (heightCm / 100) ** 2;
  const fatKg = weightKg * ((13 + (10 - innate.constitution) * 0.6 + (rng.next() * 4 - 2)) / 100);
  const muscleKg = weightKg * (0.42 + innate.bodyFrame * 0.006);

  const stats = {
    study: 10 + innate.intelligence * 2 + (head.study ?? 0),
    fighting: 5 + innate.bodyFrame,
    endurance: 8 + innate.constitution * 2 + (head.endurance ?? 0),
    tact: 10 + (head.tact ?? 0),
    streetSmart: 8 + (head.streetSmart ?? 0),
    speech: 10,
  };

  return {
    id: input.id,
    name: input.name,
    origin: input.origin,
    ageYears: 16,
    appearance: { ...input.appearance },
    innate,
    heightCm,
    growthRemainingCm,
    stats,
    peakStats: { ...stats },
    lastUsedDay: {},
    body: {
      sleepDebtMin: 0,
      minutesAwake: 0,
      stress: 20,
      highStressDays: 0,
      weightKg,
      muscleKg,
      fatKg,
      naturalMuscleKg: muscleKg,
      daysSinceStrength: 30,
      appetite: 1,
      metabolicAdaptation: 0,
      today: emptyLedger(),
    },
  };
}

/** "현실 모드": 출신·포인트·생김새를 전부 랜덤으로 */
export function randomCreationInput(id: string, name: string, rng: Random): CreationInput {
  const allocation: Partial<Record<InnateKey, number>> = {};
  let left = CREATION_POINTS;
  while (left > 0) {
    const key = rng.pick(INNATE_KEYS);
    if ((allocation[key] ?? 0) + INNATE_MIN < INNATE_MAX) {
      allocation[key] = (allocation[key] ?? 0) + 1;
      left--;
    }
  }
  return {
    id,
    name,
    origin: rng.pick(['rich', 'normal', 'normal', 'poor', 'poor'] as const),
    appearance: {
      eyes: rng.int(0, 5),
      nose: rng.int(0, 3),
      mouth: rng.int(0, 3),
      faceShape: rng.int(0, 3),
      hairStyle: rng.int(0, 5),
      hairColor: rng.int(0, 2),
    },
    allocation,
  };
}
