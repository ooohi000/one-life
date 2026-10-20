import type { Character } from '../character/types';

/**
 * 신체 구성: 몸무게 = 근육 + 지방 + 나머지(뼈·수분·장기).
 * 하루 정산(잠들 때)에 먹은 것과 움직인 것으로 근육·지방이 조금씩 변한다.
 * 숫자는 현실 경향을 단순화한 것. 밸런스는 시뮬레이션으로 조정.
 */

export type MealKind = '급식' | '집밥' | '편의점' | '패스트푸드' | '야식' | '간식' | '프로틴';
export const MEALS: Record<MealKind, { kcal: number; proteinG: number }> = {
  급식: { kcal: 850, proteinG: 32 },
  집밥: { kcal: 750, proteinG: 30 },
  편의점: { kcal: 550, proteinG: 15 },
  패스트푸드: { kcal: 1100, proteinG: 30 },
  야식: { kcal: 800, proteinG: 30 },
  간식: { kcal: 250, proteinG: 4 },
  프로틴: { kcal: 120, proteinG: 25 },
};

export type ExerciseKind = 'weights' | 'cardio' | 'sports' | 'walk';
/** MET 값 (운동 강도). 소모 kcal = MET × 체중 × 시간 */
export const EXERCISE_MET: Record<ExerciseKind, number> = {
  weights: 5,
  cardio: 8,
  sports: 7,
  walk: 3.3,
};
export const EXERCISE_LABEL_KO: Record<ExerciseKind, string> = {
  weights: '근력 운동',
  cardio: '유산소',
  sports: '구기 운동',
  walk: '걷기',
};

const KCAL_PER_KG_FAT = 7700;
const KCAL_PER_KG_MUSCLE = 1800; // 근육 1kg 만드는 데 드는 잉여 에너지(대략)
/** 남는 열량이 전부 지방이 되진 않는다(몸이 더 움직이고 열을 내서 일부 태운다) */
const SURPLUS_STORED_RATIO = 0.7;

export function exerciseKcal(kind: ExerciseKind, minutes: number, weightKg: number): number {
  return EXERCISE_MET[kind] * weightKg * (minutes / 60);
}

/** 기초대사량 (Mifflin-St Jeor, 남성) */
export function bmr(ch: Character): number {
  return 10 * ch.body.weightKg + 6.25 * ch.heightCm - 5 * ch.ageYears + 5;
}

/** 운동 제외 하루 소모량. 성장기에는 더 필요하다. */
export function baseExpenditure(ch: Character): number {
  const growth = ch.growthRemainingCm > 0 ? 200 : 0;
  return (bmr(ch) * 1.35 + growth) * (1 - ch.body.metabolicAdaptation);
}

/** 키와 체형 체질로 정해지는 근육 한계치(약물 없이 도달 가능한 최대치) */
export function maxMuscleKg(ch: Character): number {
  return (ch.heightCm - 100) * 0.55 * (0.85 + ch.innate.bodyFrame * 0.03);
}

/** 근육 한계치 대비 현재 근육 비율 0~1 */
export const muscularity = (ch: Character) => ch.body.muscleKg / maxMuscleKg(ch);

export const fatPercent = (ch: Character) => (ch.body.fatKg / ch.body.weightKg) * 100;
export const bmi = (ch: Character) => ch.body.weightKg / (ch.heightCm / 100) ** 2;

/** 힘 0~100 — 근육량에서 나온다 */
export function powerOf(ch: Character): number {
  return Math.max(0, Math.min(100, (ch.body.muscleKg - 18) * 4));
}

/** 체형 단계 — 도트 실루엣 선택에 쓰인다 */
export type BodyShape = 'skinny' | 'slim' | 'normal' | 'fit' | 'muscular' | 'bulky' | 'chubby' | 'obese';
export const BODY_SHAPE_KO: Record<BodyShape, string> = {
  skinny: '앙상함',
  slim: '마름',
  normal: '보통',
  fit: '탄탄함',
  muscular: '근육질',
  bulky: '덩치',
  chubby: '통통',
  obese: '비만',
};
export function bodyShapeOf(ch: Character): BodyShape {
  const fat = fatPercent(ch);
  const strong = muscularity(ch) >= 0.8; // 굶어서 마른 게 아니라 근육이 실제로 많아야 한다
  if (strong && fat < 20) return 'muscular';
  if (strong && fat < 28) return 'bulky';
  if (fat >= 28) return 'obese';
  if (fat >= 22) return 'chubby';
  if (muscularity(ch) >= 0.75 && fat < 18) return 'fit';
  if (bmi(ch) < 17.5) return 'skinny';
  if (bmi(ch) < 19.5) return 'slim';
  return 'normal';
}

export interface DaySettlement {
  balanceKcal: number;
  muscleDelta: number;
  fatDelta: number;
  heightDelta: number;
}

/**
 * 하루 정산. 잠들 때 한 번 호출.
 * @param sleepQuality 0~1 (잔 시간 / 필요 수면)
 */
export function settleDay(ch: Character, sleepQuality: number): DaySettlement {
  const b = ch.body;
  const t = b.today;
  const balance = t.kcalIn - baseExpenditure(ch) - t.kcalExercise;

  // --- 근육 ---
  let muscleDelta = 0;
  if (t.strengthMinutes > 0) {
    b.daysSinceStrength = 0;
    const stimulus = Math.min(1, t.strengthMinutes / 60);
    // 초보일수록 빨리 붙고 한계에 가까울수록 느려진다(일반인 수준 70% 아래에선 최대 속도)
    const room = Math.max(0, Math.min(1, (1 - muscularity(ch)) / 0.3));
    const proteinFactor = Math.min(1, t.proteinG / (1.6 * b.weightKg));
    // 열량이 남으면 최대 속도, 조금 모자라면 조금 느리게, 많이 모자라면 크게 느려진다
    const energyFactor = balance >= 0 ? 1 : balance > -400 ? 0.8 : 0.4;
    // 초보는 한 달에 약 1kg, 한계에 가까울수록 느려진다
    muscleDelta = 0.07 * stimulus * room * proteinFactor * Math.max(0.3, sleepQuality) * energyFactor;
  } else {
    b.daysSinceStrength++;
    // 2주 넘게 쉬면 운동으로 얻은 근육이 빠지기 시작
    if (b.daysSinceStrength > 14 && b.muscleKg > b.naturalMuscleKg) {
      muscleDelta -= Math.min(0.012, b.muscleKg - b.naturalMuscleKg);
    }
  }

  // --- 지방 (근육 만드는 데 쓴 에너지는 빼고) ---
  let fatDelta: number;
  if (balance >= 0) {
    const usedForMuscle = Math.max(0, muscleDelta) * KCAL_PER_KG_MUSCLE;
    fatDelta = (Math.max(0, balance - usedForMuscle) * SURPLUS_STORED_RATIO) / KCAL_PER_KG_FAT;
  } else {
    // 굶으면 지방만이 아니라 근육도 빠진다(운동하면 덜 빠짐)
    const muscleShare = t.strengthMinutes > 0 ? 0.05 : 0.2;
    fatDelta = (balance * (1 - muscleShare)) / KCAL_PER_KG_FAT;
    muscleDelta += (balance * muscleShare) / KCAL_PER_KG_FAT;
  }
  fatDelta = Math.max(fatDelta, -(b.fatKg - b.weightKg * 0.04)); // 필수 지방은 남는다

  // --- 키 (성장기) ---
  let heightDelta = 0;
  if (ch.growthRemainingCm > 0) {
    const window = Math.min(ch.growthRemainingCm, 0.012); // 하루에 열리는 성장 몫
    const nutrition = t.kcalIn >= baseExpenditure(ch) * 0.9 && t.proteinG >= b.weightKg ? 1 : 0.6;
    heightDelta = window * Math.min(1, sleepQuality) * nutrition;
    ch.heightCm += heightDelta;
    ch.growthRemainingCm -= window; // 못 채운 몫은 사라진다 — 성장기는 다시 오지 않는다
    if (ch.growthRemainingCm < 1e-9) ch.growthRemainingCm = 0;
  }

  // 아무리 굶어도 근육은 타고난 양의 70% 아래로는 안 빠진다(그 전에 몸이 버티지 못함 — 추후 건강 위험)
  muscleDelta = Math.max(muscleDelta, b.naturalMuscleKg * 0.7 - b.muscleKg);

  // 식욕: 적자면 오르고 흑자면 내려가며, 하루 2%씩 원래(1)로 돌아온다
  b.appetite += -balance / 20000;
  b.appetite += (1 - b.appetite) * 0.02;

  // 절전 모드: 적자가 크면 서서히 들어가고(최대 15%), 잘 먹으면 풀린다
  if (balance < -300) b.metabolicAdaptation = Math.min(0.15, b.metabolicAdaptation + 0.002);
  else if (balance >= 0) b.metabolicAdaptation = Math.max(0, b.metabolicAdaptation - 0.004);
  b.appetite = Math.max(0.8, Math.min(1.5, b.appetite));

  b.muscleKg += muscleDelta;
  b.fatKg += fatDelta;
  b.weightKg += muscleDelta + fatDelta;
  return { balanceKcal: balance, muscleDelta, fatDelta, heightDelta };
}
