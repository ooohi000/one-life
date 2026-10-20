import type { Character, GrowStatKey } from './types';
import { GROW_STAT_KEYS } from './types';

export const STAT_MAX = 100;

/** 스탯마다 어떤 타고난 재능이 성장 속도를 받쳐주나 */
const TALENT_OF: Record<GrowStatKey, keyof Character['innate'] | null> = {
  study: 'intelligence',
  fighting: 'bodyFrame',
  endurance: 'constitution',
  tact: null,
  streetSmart: null,
  speech: null,
};

/**
 * 녹스는 규칙. 스탯마다 다르다.
 * - graceDays: 이만큼은 쉬어도 그대로
 * - perDay: 그 뒤 하루에 빠지는 양
 * - floorRatio: 역대 최고치의 이 비율 아래로는 안 떨어진다(한 번 배운 건 완전히 사라지지 않음)
 */
export const DECAY_RULES: Record<GrowStatKey, { graceDays: number; perDay: number; floorRatio: number }> = {
  endurance: { graceDays: 5, perDay: 0.4, floorRatio: 0.4 }, // 체력은 빨리 빠진다
  study: { graceDays: 14, perDay: 0.12, floorRatio: 0.6 },
  fighting: { graceDays: 21, perDay: 0.08, floorRatio: 0.7 },
  speech: { graceDays: 30, perDay: 0.04, floorRatio: 0.8 },
  tact: { graceDays: 60, perDay: 0.02, floorRatio: 0.85 },
  streetSmart: { graceDays: 90, perDay: 0.01, floorRatio: 0.9 }, // 생활력은 거의 안 빠진다
};

/** 전체 성장 속도 배율. 밸런스 조정용 손잡이 */
export const GAIN_SCALE = 0.3;

/** 예전 최고치 아래에서 다시 올릴 때의 가속 */
export const RELEARN_MULTIPLIER = 1.8;

/**
 * 스탯 올리기.
 * 실제 상승량 = 기본량 × GAIN_SCALE × 재능 배율 × 컨디션 × 수확 체감 × (다시 배우는 중이면 가속)
 * - 수확 체감: (1 - 현재/100)². 하위권에서 중위권은 빠르고, 상위권에서 1점 올리기는 매우 어렵다
 * - 재능 배율: 타고난 스탯 1 → 0.6배, 10 → 1.5배
 * - 컨디션: 몸 상태 시스템의 condition() (0.3~1.0)
 */
export function trainStat(ch: Character, key: GrowStatKey, baseGain: number, condition: number, dayIndex: number): number {
  const talentKey = TALENT_OF[key];
  const talent = talentKey ? 0.5 + ch.innate[talentKey] * 0.1 : 1;
  const current = ch.stats[key];
  const diminishing = Math.max(0, 1 - current / STAT_MAX) ** 2;
  const relearn = current < ch.peakStats[key] - 0.5 ? RELEARN_MULTIPLIER : 1;
  const gain = Math.min(STAT_MAX - current, baseGain * GAIN_SCALE * talent * condition * diminishing * relearn);
  ch.stats[key] = current + gain;
  ch.peakStats[key] = Math.max(ch.peakStats[key], ch.stats[key]);
  ch.lastUsedDay[key] = dayIndex;
  return gain;
}

/** 하루가 지날 때 호출. 오래 안 쓴 스탯은 녹슨다(바닥까지만). */
export function decayStats(ch: Character, dayIndex: number): void {
  for (const key of GROW_STAT_KEYS) {
    const rule = DECAY_RULES[key];
    const idle = dayIndex - (ch.lastUsedDay[key] ?? 0);
    if (idle <= rule.graceDays) continue;
    const floor = ch.peakStats[key] * rule.floorRatio;
    if (ch.stats[key] <= floor) continue;
    ch.stats[key] = Math.max(floor, ch.stats[key] - rule.perDay);
  }
}
