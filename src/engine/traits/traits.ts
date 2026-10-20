import type { Random } from '../core/Random';
import type { GrowStatKey, Origin } from '../character/types';
import type { Attitudes, Personality } from '../npc/personality';

/**
 * 특성. 성격(5축)이 "얼마나"라면, 특성은 "어떤 사람"이다 — 눈에 띄는 버릇·기질·재주.
 * 한 사람에 2~4개. 성격·태도·출신에서 자연스럽게 생기고, 서로 안 맞는 건 같이 안 붙는다.
 * 숫자 효과는 전부 데이터. 새 특성은 한 줄 추가로 끝난다.
 */
export type TraitCategory = '기질' | '싸움' | '사회' | '습관' | '재능' | '가족';

export interface TraitEffects {
  /** NPC 행동 점수 보정 (actions.ts의 id) */
  actions?: Partial<Record<string, number>>;
  /** 스탯이 느는 속도 배율 */
  learn?: Partial<Record<GrowStatKey, number>>;
  /** 스트레스를 느끼는 배율 */
  stress?: number;
  /** 싸움을 거나/피하나 (+면 시비가 붙으면 싸운다) */
  fight?: number;
  /** 싸움 실력 보정 (판정에 더해짐) */
  fightPower?: number;
  /** 다쳐도 버팀 */
  toughness?: number;
  /** 일진·가해자를 그냥 못 넘김 */
  justice?: number;
  /** 친구 싸움에 같이 낌 */
  loyalty?: number;
  /** 친구가 하자면 따라 함 (범죄 권유에 약함) */
  peerPressure?: number;
  /** 남의 이상한 낌새(멍, 결석, 표정)를 알아챔 */
  notice?: number;
  /** 알아채면 그냥 안 넘어가고 끼어듦 (어른에게 말함, 신고) */
  meddle?: number;
  /** 범죄 유형별 끌림 */
  crime?: Partial<Record<CrimeLure, number>>;
  /** 수사·학폭위·재판에서 말로 버티기 (선처·합의) */
  persuade?: number;
}

/** 범죄로 끌리는 결 */
export type CrimeLure = 'violence' | 'speed' | 'theft' | 'easyMoney' | 'gambling' | 'rules';

export interface TraitCtx {
  p: Personality;
  att: Attitudes;
  origin: Origin;
}

export interface TraitDef {
  id: string;
  label: string;
  category: TraitCategory;
  desc: string;
  /** 이 사람에게 붙을 가능성 (0~1) */
  chance: (c: TraitCtx) => number;
  /** 같이 붙을 수 없는 특성 */
  conflicts?: string[];
  effects: TraitEffects;
}

const hi = (x: number, from = 0.6) => Math.max(0, (x - from) / (1 - from));
const lo = (x: number, to = 0.4) => Math.max(0, (to - x) / to);

export const TRAITS: TraitDef[] = [
  // ── 기질 ──
  { id: 'hotHeaded', label: '다혈질', category: '기질', desc: '욱하면 앞뒤 안 가린다.', conflicts: ['calm'],
    chance: (c) => 0.05 + hi(c.p.impulsivity) * 0.4 + hi(c.p.neuroticism) * 0.2, effects: { fight: 0.5, stress: 1.1, crime: { violence: 0.4 } } },
  { id: 'calm', label: '침착함', category: '기질', desc: '흥분해도 한 박자 쉰다.', conflicts: ['hotHeaded'],
    chance: (c) => 0.05 + lo(c.p.neuroticism) * 0.3 + hi(c.p.conscientiousness) * 0.15, effects: { fight: -0.3, stress: 0.9, persuade: 0.1 } },
  { id: 'coward', label: '겁쟁이', category: '기질', desc: '싸움 냄새만 나도 자리를 피한다.', conflicts: ['gritty', 'brawler', 'vigilante'],
    chance: (c) => 0.04 + hi(c.p.neuroticism) * 0.3 + lo(c.p.extraversion) * 0.1, effects: { fight: -0.8, fightPower: -10, crime: { violence: -0.5 } } },
  { id: 'gritty', label: '깡다구', category: '기질', desc: '질 걸 알아도 안 물러선다.', conflicts: ['coward'],
    chance: (c) => 0.05 + hi(c.att.pride) * 0.25 + lo(c.p.neuroticism) * 0.1, effects: { fight: 0.3, toughness: 0.3, fightPower: 5 } },
  { id: 'fragile', label: '유리멘탈', category: '기질', desc: '작은 말에도 오래 아프다.', conflicts: ['ironMind'],
    chance: (c) => 0.04 + hi(c.p.neuroticism) * 0.35, effects: { stress: 1.3 } },
  { id: 'ironMind', label: '강철멘탈', category: '기질', desc: '욕을 먹어도 밥은 잘 먹는다.', conflicts: ['fragile'],
    chance: (c) => 0.04 + lo(c.p.neuroticism, 0.3) * 0.35, effects: { stress: 0.7 } },
  { id: 'optimist', label: '낙천가', category: '기질', desc: '어떻게든 되겠지.',
    chance: (c) => 0.06 + lo(c.p.neuroticism) * 0.1 + hi(c.p.extraversion) * 0.1, effects: { stress: 0.85, learn: { study: 0.95 } } },

  // ── 싸움 ──
  { id: 'vigilante', label: '일진 사냥꾼', category: '싸움', desc: '약한 애 괴롭히는 꼴을 못 본다. 일진만 골라 팬다.', conflicts: ['coward', 'bully', 'follower'],
    chance: (c) => 0.01 + hi(c.p.agreeableness, 0.55) * 0.08 + hi(c.att.pride) * 0.05 + hi(c.att.rebellion, 0.5) * 0.04, effects: { justice: 1, fight: 0.2, fightPower: 5, meddle: 0.5 } },
  { id: 'bully', label: '괴롭히는 버릇', category: '싸움', desc: '약한 애를 건드리며 자기가 센 줄 안다.', conflicts: ['vigilante', 'pacifist'],
    chance: (c) => 0.01 + lo(c.p.agreeableness, 0.35) * 0.15 + hi(c.att.rebellion) * 0.06 + hi(c.att.inferiority) * 0.04, effects: { fight: 0.4, justice: -1, crime: { violence: 0.5 } } },
  { id: 'brawler', label: '싸움꾼', category: '싸움', desc: '주먹이 먼저 나간다. 실제로 잘 싸운다.', conflicts: ['coward', 'pacifist'],
    chance: (c) => 0.03 + hi(c.p.impulsivity) * 0.15 + hi(c.att.pride) * 0.1, effects: { fight: 0.4, fightPower: 10, learn: { fighting: 1.3 }, crime: { violence: 0.3 } } },
  { id: 'tough', label: '맷집', category: '싸움', desc: '맞아도 잘 안 쓰러진다.',
    chance: () => 0.07, effects: { toughness: 0.5 } },
  { id: 'firstStrike', label: '선빵필승', category: '싸움', desc: '먼저 치면 이긴다고 믿는다. 학폭위에서는 늘 가해자.', conflicts: ['pacifist', 'calm'],
    chance: (c) => 0.02 + hi(c.p.impulsivity) * 0.12, effects: { fightPower: 8, fight: 0.2 } },
  { id: 'pacifist', label: '평화주의자', category: '싸움', desc: '맞아도 안 때린다.', conflicts: ['brawler', 'firstStrike', 'bully', 'hotHeaded'],
    chance: (c) => 0.03 + hi(c.p.agreeableness) * 0.15, effects: { fight: -1, crime: { violence: -0.8 } } },

  // ── 사회 ──
  { id: 'loyal', label: '의리파', category: '사회', desc: '친구 일이면 앞뒤 안 본다. 패싸움에도 낀다.',
    chance: (c) => 0.06 + hi(c.p.agreeableness, 0.5) * 0.15, effects: { loyalty: 0.8, peerPressure: 0.2 } },
  { id: 'meddler', label: '오지랖', category: '사회', desc: '남의 일에 꼭 한마디 한다. 이상한 걸 보면 어른에게 말한다.',
    chance: (c) => 0.05 + hi(c.p.extraversion) * 0.1 + hi(c.p.agreeableness) * 0.1, effects: { meddle: 0.8 } },
  { id: 'observant', label: '눈치백단', category: '사회', desc: '친구 팔의 멍, 달라진 표정을 먼저 본다.',
    chance: (c) => 0.06 + hi(c.p.neuroticism, 0.5) * 0.1 + hi(c.p.agreeableness) * 0.08, effects: { notice: 0.8, learn: { tact: 1.3 } } },
  { id: 'socialite', label: '인싸 기질', category: '사회', desc: '처음 본 사람과도 금방 친해진다.', conflicts: ['loner'],
    chance: (c) => 0.04 + hi(c.p.extraversion) * 0.4, effects: { actions: { karaoke: 0.2, hangout: 0.2 }, learn: { speech: 1.2 } } },
  { id: 'loner', label: '아싸 기질', category: '사회', desc: '혼자가 편하다.', conflicts: ['socialite'],
    chance: (c) => 0.04 + lo(c.p.extraversion, 0.35) * 0.4, effects: { actions: { hangout: -0.2, karaoke: -0.2, homeRest: 0.1 } } },
  { id: 'attention', label: '관종', category: '사회', desc: '보는 사람이 있으면 뭐든 한다. 영상 각이면 더.',
    chance: (c) => 0.03 + hi(c.p.extraversion) * 0.15 + hi(c.p.impulsivity) * 0.1, effects: { actions: { filmVideo: 0.3 }, crime: { speed: 0.3, rules: 0.2 } } },
  { id: 'bluffer', label: '허세', category: '사회', desc: '센 척을 한다. 그래서 싸움이 커진다.',
    chance: (c) => 0.04 + hi(c.att.inferiority) * 0.15 + hi(c.att.pride) * 0.1, effects: { fight: 0.2, fightPower: -3 } },
  { id: 'leader', label: '리더 기질', category: '사회', desc: '애들이 이 사람 말을 듣는다.', conflicts: ['follower'],
    chance: (c) => 0.03 + hi(c.p.extraversion) * 0.12 + hi(c.p.conscientiousness) * 0.06 + hi(c.att.pride) * 0.06, effects: { persuade: 0.2 } },
  { id: 'follower', label: '따라쟁이', category: '사회', desc: '친구가 하자면 한다. 그게 나쁜 일이어도.', conflicts: ['leader', 'vigilante'],
    chance: (c) => 0.05 + lo(c.p.conscientiousness) * 0.1 + hi(c.att.inferiority) * 0.12, effects: { peerPressure: 0.8 } },
  { id: 'liar', label: '거짓말쟁이', category: '사회', desc: '술술 둘러댄다. 들키면 더 크게 터진다.',
    chance: (c) => 0.03 + lo(c.p.agreeableness) * 0.1 + hi(c.p.impulsivity) * 0.06, effects: { persuade: 0.15 } },

  // ── 습관 ──
  { id: 'speedFreak', label: '스피드광', category: '습관', desc: '바이크·킥보드로 달릴 때 살아 있는 느낌.',
    chance: (c) => 0.03 + hi(c.p.impulsivity) * 0.12 + hi(c.att.rebellion) * 0.06, effects: { crime: { speed: 0.9 } } },
  { id: 'stickyFingers', label: '손버릇', category: '습관', desc: '아무도 안 보면 집어 온다.', conflicts: ['rulesFollower'],
    chance: (c) => 0.01 + lo(c.p.conscientiousness, 0.3) * 0.06 + hi(c.p.impulsivity, 0.7) * 0.05, effects: { crime: { theft: 1 } } },
  { id: 'getRichQuick', label: '한탕주의', category: '습관', desc: '"쉬운 고액 알바" 글에 손이 간다.',
    chance: (c) => 0.02 + hi(c.p.impulsivity) * 0.08 + (c.origin === 'poor' ? 0.04 : 0), effects: { crime: { easyMoney: 0.9, gambling: 0.4 } } },
  { id: 'gambler', label: '도박 기질', category: '습관', desc: '"한 판만 더."',
    chance: (c) => 0.01 + hi(c.p.impulsivity) * 0.08, effects: { crime: { gambling: 1 } } },
  { id: 'gamer', label: '겜창', category: '습관', desc: '눈 뜨면 게임, 감으면 게임 생각.',
    chance: (c) => 0.06 + hi(c.p.impulsivity, 0.5) * 0.1 + lo(c.p.extraversion) * 0.05, effects: { actions: { pcbang: 0.3, rankGame: 0.3, phone: 0.1 } } },
  { id: 'nightOwl', label: '야행성', category: '습관', desc: '새벽 2시가 제일 머리가 맑다.',
    chance: (c) => 0.08 + hi(c.p.impulsivity, 0.5) * 0.1, effects: { actions: { phone: 0.2 } } },
  { id: 'bigEater', label: '대식가', category: '습관', desc: '먹는 게 남는 거다.', conflicts: ['smallEater'],
    chance: () => 0.08, effects: {} },
  { id: 'smallEater', label: '소식좌', category: '습관', desc: '세 숟갈이면 배부르다.', conflicts: ['bigEater'],
    chance: () => 0.05, effects: {} },
  { id: 'frugal', label: '짠돌이', category: '습관', desc: '천 원도 아깝다.',
    chance: (c) => 0.05 + (c.origin === 'poor' ? 0.08 : 0) + hi(c.p.conscientiousness) * 0.05, effects: { actions: { karaoke: -0.15, pcbang: -0.1 } } },
  { id: 'quitter', label: '작심삼일', category: '습관', desc: '시작은 창대하다.', conflicts: ['grinder'],
    chance: (c) => 0.05 + lo(c.p.conscientiousness) * 0.2, effects: { learn: { study: 0.9, endurance: 0.9 } } },
  { id: 'grinder', label: '독종', category: '습관', desc: '한번 하기로 하면 끝까지 한다.', conflicts: ['quitter'],
    chance: (c) => 0.03 + hi(c.p.conscientiousness) * 0.25, effects: { actions: { selfStudy: 0.15, gym: 0.15 }, learn: { study: 1.1, endurance: 1.1 } } },
  { id: 'rulesFollower', label: '모범생 기질', category: '습관', desc: '빨간불엔 차가 없어도 선다.', conflicts: ['rebelSoul', 'stickyFingers'],
    chance: (c) => 0.04 + hi(c.p.conscientiousness) * 0.2 + lo(c.att.rebellion) * 0.08, effects: { crime: { violence: -0.5, speed: -0.6, theft: -0.8, easyMoney: -0.5, gambling: -0.5, rules: -0.8 } } },
  { id: 'rebelSoul', label: '반골', category: '습관', desc: '하지 말라면 더 하고 싶다.', conflicts: ['rulesFollower'],
    chance: (c) => 0.03 + hi(c.att.rebellion) * 0.3, effects: { crime: { rules: 0.6, speed: 0.2 } } },

  // ── 재능 ──
  { id: 'athletic', label: '운동신경', category: '재능', desc: '처음 하는 운동도 금방 는다.',
    chance: () => 0.08, effects: { learn: { fighting: 1.2, endurance: 1.25 }, fightPower: 3 } },
  { id: 'bookSmart', label: '공부머리', category: '재능', desc: '한 번 보면 머리에 남는다.',
    chance: () => 0.08, effects: { learn: { study: 1.25 } } },
  { id: 'silverTongue', label: '말빨', category: '재능', desc: '혼날 상황도 웃으며 넘긴다.',
    chance: (c) => 0.04 + hi(c.p.extraversion) * 0.1, effects: { learn: { speech: 1.3 }, persuade: 0.3 } },
  { id: 'streetwise', label: '생활력', category: '재능', desc: '어디 떨어져도 굶지는 않는다.',
    chance: (c) => 0.05 + (c.origin === 'poor' ? 0.08 : 0), effects: { learn: { streetSmart: 1.3 } } },
  { id: 'artsy', label: '예술혼', category: '재능', desc: '그리고 부르고 만들 때 시간이 사라진다.',
    chance: () => 0.06, effects: { actions: { practiceRoom: 0.3 } } },

  // ── 가족 ──
  { id: 'filial', label: '효자', category: '가족', desc: '엄마 아빠 얼굴이 먼저 떠오른다.',
    chance: (c) => 0.05 + hi(c.p.agreeableness) * 0.12 + (c.origin === 'poor' ? 0.04 : 0), effects: { crime: { violence: -0.3, theft: -0.4, easyMoney: -0.3 } } },
];

const BY_ID = new Map(TRAITS.map((t) => [t.id, t]));
export function trait(id: string): TraitDef {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`없는 특성: ${id}`);
  return t;
}

/** 성격·태도·출신으로 특성 2~4개 (상충하는 건 빼고) */
export function assignTraits(c: TraitCtx, rng: Random): string[] {
  const rolled = TRAITS.map((t) => ({ t, score: rng.next() / Math.max(0.001, t.chance(c)) })).sort((a, b) => a.score - b.score);
  const out: string[] = [];
  const want = 2 + Math.floor(rng.next() * 3);
  for (const { t, score } of rolled) {
    if (out.length >= want) break;
    if (score > 8 && out.length >= 2) break; // 억지로 채우지 않는다
    if (out.some((o) => t.conflicts?.includes(o) || trait(o).conflicts?.includes(t.id))) continue;
    out.push(t.id);
  }
  return out;
}

/** 특성들의 효과 합산 (배율은 곱하고 나머지는 더한다) */
export function traitEffects(ids: readonly string[]): Required<Pick<TraitEffects, 'fight' | 'fightPower' | 'toughness' | 'justice' | 'loyalty' | 'peerPressure' | 'notice' | 'meddle' | 'persuade' | 'stress'>> & {
  actions: Record<string, number>;
  learn: Partial<Record<GrowStatKey, number>>;
  crime: Record<CrimeLure, number>;
} {
  const sum = {
    fight: 0, fightPower: 0, toughness: 0, justice: 0, loyalty: 0, peerPressure: 0, notice: 0, meddle: 0, persuade: 0, stress: 1,
    actions: {} as Record<string, number>,
    learn: {} as Partial<Record<GrowStatKey, number>>,
    crime: { violence: 0, speed: 0, theft: 0, easyMoney: 0, gambling: 0, rules: 0 } as Record<CrimeLure, number>,
  };
  for (const id of ids) {
    const e = trait(id).effects;
    for (const k of ['fight', 'fightPower', 'toughness', 'justice', 'loyalty', 'peerPressure', 'notice', 'meddle', 'persuade'] as const) sum[k] += e[k] ?? 0;
    sum.stress *= e.stress ?? 1;
    for (const [a, v] of Object.entries(e.actions ?? {})) sum.actions[a] = (sum.actions[a] ?? 0) + (v ?? 0);
    for (const [s, v] of Object.entries(e.learn ?? {}) as Array<[GrowStatKey, number]>) sum.learn[s] = (sum.learn[s] ?? 1) * v;
    for (const [l, v] of Object.entries(e.crime ?? {}) as Array<[CrimeLure, number]>) sum.crime[l] += v;
  }
  return sum;
}
