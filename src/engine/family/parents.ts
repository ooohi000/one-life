import type { Random } from '../core/Random';

/**
 * 부모의 성향. "좋은 부모 / 나쁜 부모" 두 칸이 아니라 여러 축의 조합이다.
 * - 사랑(affection)과 표현(warmth)은 다르다: 무뚝뚝하지만 속으로 끔찍이 아끼는 아빠가 있다.
 * - 사랑이 있어도 화를 못 참는 부모가 있고, 때리고 나서 후회하는 부모도 있다.
 * - 국적·성별로 성향을 정하지 않는다. 엄마도 아빠도 어느 유형이든 될 수 있다.
 */
export interface ParentTraits {
  /** 속마음의 사랑 0~1 (겉으로 안 보여도 행동에 새어 나온다) */
  affection: number;
  /** 표현 0~1: 다정한 말, 칭찬, 위로 */
  warmth: number;
  /** 기대 0~1: 성적·대학·비교 */
  expectation: number;
  /** 간섭·통제 0~1: 어디 가니, 누구랑, 휴대폰 줘 봐 */
  control: number;
  /** 자기 우선 0~1: 자기 기분·일·취미·연애가 먼저 */
  selfFocus: number;
  /** 곁에 있음 0~1: 집에 있고 아이를 신경 쓰는 정도 (낮으면 방임) */
  presence: number;
  /** 화를 못 참는 정도 0~1 (높으면 폭언·폭력 위험) */
  temper: number;
  /** 술 0~1: 마시는 날이 잦을수록 기분이 흔들리고 화가 쉽게 난다 */
  drinking: number;
}

export type ParentRole = 'mom' | 'dad' | 'grandma';

export interface ParentType {
  id: string;
  label: string;
  traits: ParentTraits;
  /**
   * 흔한 정도(가중치). 조사 근거:
   * - 2023 아동종합실태조사(보건복지부·KIHASA): 지난 1년 아동이 겪은 신체학대 14.5%, 정서학대 36.5%, 방임 26.5%
   *   → 소리 지르기·가벼운 체벌은 "평범한" 부모에게도 가끔 있다. 그래서 평범한 유형도 화(temper)가 0이 아니다.
   * - 공식 학대 판정은 연 2.4만 건(2024), 아동 인구 대비 0.3%대. 가해자 84%가 부모.
   *   → 상습 폭력·심한 방임 부모는 소수(합쳐 6% 안팎)로 둔다.
   */
  weight: number;
  /** 상습 폭력·방임 같은 거친 가정. 주인공에게는 직접 고를 때만 나온다 */
  harsh?: boolean;
}

const t = (x: Partial<ParentTraits>): ParentTraits => ({
  affection: 0.8,
  warmth: 0.6,
  expectation: 0.5,
  control: 0.3,
  selfFocus: 0.2,
  presence: 0.8,
  temper: 0.15,
  drinking: 0.1,
  ...x,
});

/** 현실에서 흔히 보는 부모들. 캐릭터 생성 시 여기서 고르고 개인차(±)를 섞는다 */
export const PARENT_TYPES: ParentType[] = [
  { id: 'warm', label: '다정한 부모', weight: 17, traits: t({ affection: 0.95, warmth: 0.9, expectation: 0.4, temper: 0.2 }) },
  { id: 'gruffLoving', label: '무뚝뚝하지만 아끼는 부모', weight: 15, traits: t({ affection: 0.9, warmth: 0.15, expectation: 0.5, presence: 0.7, temper: 0.3 }) },
  { id: 'exhausted', label: '맞벌이로 지친 부모', weight: 14, traits: t({ affection: 0.8, warmth: 0.45, expectation: 0.5, presence: 0.35, temper: 0.38, drinking: 0.15 }) },
  { id: 'pushy', label: '기대가 크고 비교하는 부모', weight: 17, traits: t({ affection: 0.7, warmth: 0.25, expectation: 0.9, control: 0.6, temper: 0.4 }) },
  { id: 'helicopter', label: '모든 걸 간섭하는 부모', weight: 10, traits: t({ affection: 0.85, warmth: 0.55, expectation: 0.7, control: 0.95, temper: 0.35 }) },
  { id: 'friendly', label: '친구 같은 부모', weight: 8, traits: t({ affection: 0.85, warmth: 0.8, expectation: 0.2, control: 0.1, temper: 0.1 }) },
  { id: 'selfFirst', label: '자기 자신이 먼저인 부모', weight: 7, traits: t({ affection: 0.4, warmth: 0.35, expectation: 0.3, selfFocus: 0.9, presence: 0.45, temper: 0.3 }) },
  { id: 'cold', label: '사랑이 부족한 부모', weight: 6, traits: t({ affection: 0.25, warmth: 0.1, expectation: 0.6, control: 0.4, presence: 0.6, temper: 0.42 }) },
  { id: 'neglectful', label: '무관심·방임하는 부모', weight: 3, harsh: true, traits: t({ affection: 0.2, warmth: 0.1, expectation: 0.1, control: 0.05, selfFocus: 0.7, presence: 0.15, temper: 0.3, drinking: 0.3 }) },
  { id: 'volatile', label: '화를 못 참는 부모 (술 마시면 폭력적)', weight: 3, harsh: true, traits: t({ affection: 0.55, warmth: 0.3, expectation: 0.6, control: 0.5, temper: 0.85, drinking: 0.6 }) },
];

export function parentType(id: string): ParentType {
  const p = PARENT_TYPES.find((x) => x.id === id);
  if (!p) throw new Error(`없는 부모 유형: ${id}`);
  return p;
}

/** 플레이어가 설정에서 고르는 콘텐츠 옵션 */
export interface ContentSettings {
  /** 가정폭력 묘사. 끄면 폭력형 부모는 "엄하고 차가운 부모"로 바뀐다 (손찌검 없음) */
  domesticViolence: boolean;
}
export const DEFAULT_CONTENT: ContentSettings = { domesticViolence: true };

export interface SampleOptions {
  /**
   * 'npc': 세계의 모든 집 — 현실 비율 그대로 (거친 가정도 소수 존재)
   * 'protagonist': 주인공 집 — 평범한 범위에서만
   * 'protagonistHard': 주인공이 "힘든 가정에서 시작하기"를 골랐을 때 — 거친 가정에서만
   */
  who?: 'npc' | 'protagonist' | 'protagonistHard';
  content?: ContentSettings;
}

/** 유형을 흔한 정도대로 뽑고, 같은 유형 안에서도 사람마다 조금씩 다르게(±0.1) */
export function sampleParent(rng: Random, opts: SampleOptions = {}): { type: ParentType; traits: ParentTraits } {
  const who = opts.who ?? 'npc';
  const pool = PARENT_TYPES.filter((p) => (who === 'npc' ? true : who === 'protagonist' ? !p.harsh : p.harsh));
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng.next() * total;
  let type = pool[0]!;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) {
      type = p;
      break;
    }
  }
  const traits = { ...type.traits };
  for (const k of Object.keys(traits) as Array<keyof ParentTraits>) {
    traits[k] = Math.max(0, Math.min(1, traits[k] + (rng.next() - 0.5) * 0.2));
  }
  return applyContent(type, traits, opts.content ?? DEFAULT_CONTENT);
}

/** 콘텐츠 옵션 적용: 폭력 묘사를 끄면 화는 남기되 손을 대는 선까지는 안 간다 */
export function applyContent(type: ParentType, traits: ParentTraits, content: ContentSettings): { type: ParentType; traits: ParentTraits } {
  if (content.domesticViolence || type.id !== 'volatile') return { type, traits };
  return {
    type: { ...type, id: 'strict', label: '엄하고 차가운 부모' },
    traits: { ...traits, temper: Math.min(traits.temper, 0.5), drinking: Math.min(traits.drinking, 0.2) },
  };
}

/** 아이가 도움을 청할 수 있는 길 — 폭력 사건 뒤 선택지로 뜬다 */
export const HELP_OPTIONS = [
  { id: 'counselor', label: '상담 선생님께 말하기' },
  { id: 'report', label: '112 / 아동보호전문기관에 신고하기' },
  { id: 'relative', label: '친척 집에 가 있기' },
  { id: 'friend', label: '친한 친구에게 털어놓기' },
] as const;
