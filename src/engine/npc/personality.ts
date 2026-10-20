import type { Random } from '../core/Random';
import type { Origin } from '../character/types';

/**
 * 성격 (0~1). 같은 상황에서도 사람마다 다르게 움직이게 만드는 원천.
 * - conscientiousness 성실성: 계획대로 하는 힘, 공부·일에 끌림
 * - extraversion 외향성: 사람을 만나야 충전됨, 혼자 있으면 외로움이 빨리 참
 * - neuroticism 예민함: 스트레스를 더 크게 느낌
 * - agreeableness 친화성: 남과 잘 어울림 (관계 시스템에서 쓰임)
 * - impulsivity 충동성: 당장 재밌는 걸 고름, 늦게 잠
 */
export interface Personality {
  conscientiousness: number;
  extraversion: number;
  neuroticism: number;
  agreeableness: number;
  impulsivity: number;
}

export const TRAIT_LABEL_KO: Record<keyof Personality, string> = {
  conscientiousness: '성실',
  extraversion: '외향',
  neuroticism: '예민',
  agreeableness: '친화',
  impulsivity: '충동',
};

/** 자제력 0~1: 목표를 위해 지금의 욕구를 참는 힘 */
export const selfControl = (p: Personality) => Math.max(0, Math.min(1, 0.5 + (p.conscientiousness - p.impulsivity) * 0.7));

/** 대부분은 보통이고 극단은 드문 분포(삼각 분포에 가까움) */
function trait(rng: Random): number {
  return (rng.next() + rng.next() + rng.next()) / 3;
}

export function randomPersonality(rng: Random): Personality {
  const conscientiousness = trait(rng);
  return {
    conscientiousness,
    extraversion: trait(rng),
    neuroticism: trait(rng),
    agreeableness: trait(rng),
    // 성실한 사람은 대체로 덜 충동적 (완전히 반대는 아님)
    impulsivity: Math.max(0, Math.min(1, trait(rng) * 0.7 + (1 - conscientiousness) * 0.3)),
  };
}

/** 고등학생의 인생 목표(원하는 것). 1~2개를 가진다. 데이터 한 줄로 늘릴 수 있다. */
export type GoalId =
  | 'grades' | 'fitness' | 'social' | 'romance' | 'money' | 'fun' | 'dominance'
  | 'proGamer' | 'artist' | 'influencer' | 'stable' | 'approval' | 'escape';
export const GOAL_LABEL_KO: Record<GoalId, string> = {
  grades: '명문대',
  fitness: '몸 만들기·운동부',
  social: '인싸',
  romance: '연애',
  money: '돈 벌기',
  fun: '그냥 편하게',
  dominance: '짱',
  proGamer: '프로게이머',
  artist: '가수·아이돌',
  influencer: '유튜버',
  stable: '공무원·안정',
  approval: '부모님 인정',
  escape: '빨리 독립',
};

/**
 * 태도(사람을 대하는 방식, 0~1). 목표와 별개로 행동과 관계를 비튼다.
 * - pride 우월감·자존심: 남보다 위에 서고 싶음, 거절을 못 견딤
 * - inferiority 열등감: 비교에 약함, 스트레스와 은둔 위험
 * - rebellion 반항심: 정해진 일정(학원·통금)을 어김
 */
export interface Attitudes {
  pride: number;
  inferiority: number;
  rebellion: number;
}
export const ATTITUDE_LABEL_KO: Record<keyof Attitudes, string> = { pride: '우월감', inferiority: '열등감', rebellion: '반항심' };

export function randomAttitudes(p: Personality, origin: Origin, parentExpectation: number, rng: Random): Attitudes {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return {
    pride: c(trait(rng) * 0.7 + (origin === 'rich' ? 0.2 : 0) + (1 - p.agreeableness) * 0.15),
    inferiority: c(trait(rng) * 0.6 + p.neuroticism * 0.3 + (origin === 'poor' ? 0.1 : 0) + parentExpectation * 0.1),
    rebellion: c(trait(rng) * 0.6 + p.impulsivity * 0.3 + parentExpectation * 0.15 - p.agreeableness * 0.1),
  };
}
export type Goals = Partial<Record<GoalId, number>>; // 목표별 비중 0~1

/** 성격·출신·부모 기대에서 확률로 목표를 뽑는다 */
export function pickGoals(p: Personality, origin: Origin, parentExpectation: number, rng: Random, att?: Attitudes): Goals {
  const weights: Record<GoalId, number> = {
    grades: 0.6 + p.conscientiousness * 1.2 + parentExpectation * 1.0 + (origin === 'rich' ? 0.4 : 0),
    fitness: 0.5 + (1 - p.neuroticism) * 0.4,
    social: 0.3 + p.extraversion * 1.2,
    romance: 0.3 + p.extraversion * 0.6 + p.impulsivity * 0.3,
    money: 0.2 + (origin === 'poor' ? 1.4 : origin === 'normal' ? 0.3 : 0),
    fun: 0.3 + p.impulsivity * 1.0 + (1 - p.conscientiousness) * 0.6,
    dominance: 0.05 + p.impulsivity * 0.4 * (1 - p.agreeableness) + (att?.pride ?? 0) * 0.4,
    proGamer: 0.1 + p.impulsivity * 0.3 + (1 - p.extraversion) * 0.2,
    artist: 0.08 + p.extraversion * 0.35,
    influencer: 0.1 + p.extraversion * 0.25 + p.impulsivity * 0.15,
    stable: 0.15 + p.conscientiousness * 0.3 + (1 - p.impulsivity) * 0.2 + (origin === 'poor' ? 0.2 : 0),
    approval: 0.1 + parentExpectation * 0.5 + p.agreeableness * 0.2,
    escape: 0.05 + (origin === 'poor' ? 0.25 : 0) + (1 - p.agreeableness) * 0.1,
  };
  const ids = Object.keys(weights) as GoalId[];
  const pick = (exclude?: GoalId): GoalId => {
    const pool = ids.filter((g) => g !== exclude);
    const total = pool.reduce((s, g) => s + weights[g], 0);
    let r = rng.next() * total;
    for (const g of pool) {
      r -= weights[g];
      if (r <= 0) return g;
    }
    return pool[pool.length - 1] as GoalId;
  };
  const main = pick();
  const goals: Goals = { [main]: 1 };
  if (rng.chance(0.6)) goals[pick(main)] = 0.5;
  return goals;
}

/** 목표의 이유. 같은 목표라도 동기가 다르면 행동·스트레스·무너지는 방식이 다르다 */
export type MotiveId = 'joy' | 'belonging' | 'recognition' | 'fear' | 'proveSelf' | 'protect' | 'freedom';
export const MOTIVE_LABEL_KO: Record<MotiveId, string> = {
  joy: '좋아서',
  belonging: '어울리고 싶어서',
  recognition: '인정받고 싶어서',
  fear: '뒤처질까 무서워서',
  proveSelf: '무시당한 걸 갚으려고',
  protect: '가족을 위해',
  freedom: '벗어나고 싶어서',
};

export interface GoalEntry {
  goal: GoalId;
  weight: number; // 0~1
  motive: MotiveId;
  /** 누가 정한 목표인가 */
  source: 'self' | 'parents' | 'situation';
  /** 부모 기대와 충돌해서 숨기는 목표 */
  secret: boolean;
}

/** 좋아서 하는 목표는 의지력 없이도 끌린다. 나머지는 자제력이 있어야 지킨다 */
export const INTRINSIC_MOTIVES: ReadonlySet<MotiveId> = new Set(['joy', 'belonging']);

/** 부모가 보기에 "공부 말고 딴짓"인 꿈 */
const PARENT_DISAPPROVED: ReadonlySet<GoalId> = new Set(['artist', 'proGamer', 'influencer', 'fun', 'romance', 'dominance']);

function ownMotive(goal: GoalId, p: Personality, att: Attitudes, rng: Random): MotiveId {
  if (goal === 'dominance') return att.inferiority > 0.5 ? 'proveSelf' : 'recognition';
  if (goal === 'social' || goal === 'romance') return rng.chance(0.6) ? 'belonging' : 'recognition';
  if (goal === 'grades' || goal === 'stable') return att.inferiority > 0.6 ? 'proveSelf' : p.neuroticism > 0.6 ? 'fear' : 'recognition';
  if (goal === 'escape') return 'freedom';
  if (goal === 'fun') return 'joy';
  if (goal === 'fitness') return rng.chance(0.6) ? 'joy' : att.inferiority > 0.5 ? 'proveSelf' : 'recognition';
  if (goal === 'money') return 'freedom';
  return rng.chance(0.75) ? 'joy' : 'recognition';
}

/**
 * 한 사람의 복합적인 목표를 만든다.
 * 1) 내가 원하는 것 (성격에서)  2) 부모가 정해준 것 (기대가 크면)  3) 처지가 만든 것 (형편·열등감)
 * 부모 목표와 충돌하는 내 꿈은 비밀이 된다.
 */
export function buildLifeGoals(p: Personality, att: Attitudes, origin: Origin, parentExpectation: number, rng: Random): GoalEntry[] {
  const out: GoalEntry[] = [];
  const own = Object.keys(pickGoals(p, origin, parentExpectation * 0.3, rng, att)) as GoalId[];
  const dream = own[0] as GoalId;

  if (parentExpectation > 0.55 && dream !== 'grades') {
    out.push({
      goal: rng.chance(0.75) ? 'grades' : 'stable',
      weight: 0.5 + parentExpectation * 0.5,
      motive: p.agreeableness > 0.5 ? 'recognition' : 'fear',
      source: 'parents',
      secret: false,
    });
  }
  out.push({
    goal: dream,
    weight: 0.6 + rng.next() * 0.4,
    motive: ownMotive(dream, p, att, rng),
    source: 'self',
    secret: out.length > 0 && PARENT_DISAPPROVED.has(dream),
  });
  if (origin === 'poor' && rng.chance(0.45) && !out.some((g) => g.goal === 'money')) {
    out.push({ goal: 'money', weight: 0.6, motive: 'protect', source: 'situation', secret: false });
  } else if (att.inferiority > 0.65 && rng.chance(0.5) && !out.some((g) => g.goal === 'dominance' || g.goal === 'grades')) {
    out.push({ goal: rng.chance(0.5) ? 'dominance' : 'grades', weight: 0.5, motive: 'proveSelf', source: 'situation', secret: false });
  } else if (own[1] && !out.some((g) => g.goal === own[1])) {
    const g = own[1] as GoalId;
    out.push({ goal: g, weight: 0.4, motive: ownMotive(g, p, att, rng), source: 'self', secret: out[0]?.source === 'parents' && PARENT_DISAPPROVED.has(g) });
  }
  return out;
}

/** 두뇌가 쓰는 형태로 나눈다: 의지력이 필요한 목표 / 좋아서 끌리는 목표 */
export function splitGoals(entries: GoalEntry[]): { disciplined: Goals; intrinsic: Goals } {
  const disciplined: Goals = {};
  const intrinsic: Goals = {};
  for (const e of entries) {
    const bucket = INTRINSIC_MOTIVES.has(e.motive) ? intrinsic : disciplined;
    bucket[e.goal] = Math.max(bucket[e.goal] ?? 0, e.weight);
  }
  return { disciplined, intrinsic };
}
