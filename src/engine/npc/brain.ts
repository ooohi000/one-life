import type { Random } from '../core/Random';
import type { ActionDef } from './actions';
import { type Goals, type Personality, selfControl } from './personality';

export interface BrainContext {
  p: Personality;
  /** 의지력이 필요한 목표(부모 기대·두려움·인정·복수…) */
  goals: Goals;
  /** 좋아서 끌리는 목표 — 자제력과 무관하게 당긴다 */
  intrinsicGoals?: Goals;
  stress: number; // 0~100
  loneliness: number; // 0~100
  boredom: number; // 0~100
  drowsiness: number; // 0~100
  /** 오늘 이미 한 횟수 — 같은 걸 반복할수록 끌림이 줄어든다 */
  doneToday?: Record<string, number>;
  /** 상태(번아웃·은둔 등)가 주는 점수 보정 */
  mods?: (a: ActionDef) => number;
}

/**
 * 행동 점수 = 지금의 욕구 해소 + 인생 목표 × 자제력 + 성격의 끌림 − 피곤함
 * - 욕구가 낮을 땐 목표 행동이 이기고, 욕구가 차오르면 해소 행동이 이긴다.
 * - 예민한 사람은 스트레스를 주는 행동(공부, 알바)을 더 싫어한다.
 */
export function scoreAction(a: ActionDef, c: BrainContext): number {
  const p = c.p;
  let u = 0;

  const stressEffect = a.relieves.stress ?? 0;
  const st = c.stress / 100;
  u += stressEffect > 0
    ? (stressEffect / 10) * st * (0.6 + p.neuroticism * 0.8)
    : (stressEffect / 10) * (0.2 + st) * (0.4 + p.neuroticism * 0.8);
  u += ((a.relieves.loneliness ?? 0) / 40) * (c.loneliness / 100) * (0.4 + p.extraversion);
  u += ((a.relieves.boredom ?? 0) / 40) * (c.boredom / 100) * (0.4 + p.impulsivity);

  let goal = 0;
  for (const [g, w] of Object.entries(a.goals)) goal += (w ?? 0) * (c.goals[g as keyof Goals] ?? 0);
  u += goal * (0.5 + selfControl(p) * 0.9);
  let love = 0;
  for (const [g, w] of Object.entries(a.goals)) love += (w ?? 0) * (c.intrinsicGoals?.[g as keyof Goals] ?? 0);
  u += love * 0.95;

  for (const [trait, w] of Object.entries(a.lure ?? {})) u += (p[trait as keyof Personality] - 0.5) * (w ?? 0) * 2;

  if (a.tiring && c.drowsiness > 40) u -= ((c.drowsiness - 40) / 60) * 0.8;
  u -= (c.doneToday?.[a.id] ?? 0) * 0.45;
  if (c.mods) u += c.mods(a);
  return u;
}

/** 1등만 고르지 않고 점수에 비례한 확률로 고른다(소프트맥스). 모두가 같은 행동을 하는 '로봇 군단' 방지 */
export const CHOICE_TEMPERATURE = 0.15;

export function chooseAction(options: ActionDef[], c: BrainContext, rng: Random): { action: ActionDef; scores: number[] } {
  const scores = options.map((a) => scoreAction(a, c));
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) / CHOICE_TEMPERATURE));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.next() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return { action: options[i] as ActionDef, scores };
  }
  return { action: options[options.length - 1] as ActionDef, scores };
}
