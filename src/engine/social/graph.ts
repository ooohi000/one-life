import type { Random } from '../core/Random';
import type { Personality } from '../npc/personality';

/**
 * 관계. 친구는 정해 주는 게 아니라 "자주 마주치고, 잘 맞으면" 생긴다.
 * 한 쌍의 관계는 방향이 있다 — 나는 걔를 절친이라 생각하는데 걔는 아닐 수 있다.
 */
export interface Rel {
  /** 친한 정도 0~100 (40 친구, 70 절친) */
  closeness: number;
  /** 믿음 0~100 (비밀을 말할 수 있나) */
  trust: number;
  /** 존중·서열 -100~100 (+면 우러러봄, −면 깔봄) */
  respect: number;
  /** 무서움 0~100 */
  fear: number;
  /** 원한 0~100 */
  grudge: number;
  /** 마지막으로 어울린 날 */
  lastSeen: number;
}

export const FRIEND = 40;
export const BEST_FRIEND = 70;

/** 관계에 쓰는 사람 정보 (NPC든 주인공이든) */
export interface SocialPerson {
  id: string;
  name: string;
  p: Personality;
  traits: string[];
  /** 자주 가는 곳 (PC방·헬스장·학원·운동장…) */
  hangouts: string[];
  /** 반 */
  cls: number;
  /** 싸움 실력 (서열에 쓰임) */
  power: number;
}

const blank = (day: number): Rel => ({ closeness: 0, trust: 10, respect: 0, fear: 0, grudge: 0, lastSeen: day });

export class SocialGraph {
  readonly people = new Map<string, SocialPerson>();
  /** out.get(a).get(b) = a가 b를 어떻게 보나 */
  private readonly out = new Map<string, Map<string, Rel>>();

  add(p: SocialPerson): void {
    this.people.set(p.id, p);
  }

  rel(a: string, b: string): Rel | undefined {
    return this.out.get(a)?.get(b);
  }

  /** 없으면 만든다 */
  ensure(a: string, b: string, day: number): Rel {
    let m = this.out.get(a);
    if (!m) this.out.set(a, (m = new Map()));
    let r = m.get(b);
    if (!r) m.set(b, (r = blank(day)));
    return r;
  }

  /** a가 아는 사람들 (관계가 있는) */
  known(a: string): Iterable<[string, Rel]> {
    return this.out.get(a) ?? [];
  }

  friends(a: string, min = FRIEND): string[] {
    const out: string[] = [];
    for (const [b, r] of this.known(a)) if (r.closeness >= min) out.push(b);
    return out;
  }

  /** 서로 친구인가 (양쪽 다) */
  mutual(a: string, b: string, min = FRIEND): boolean {
    return (this.rel(a, b)?.closeness ?? 0) >= min && (this.rel(b, a)?.closeness ?? 0) >= min;
  }

  /** 잘 맞는 정도 -1~1: 성격이 비슷하고, 같은 걸 좋아하고, 특성이 안 부딪히면 */
  compat(a: SocialPerson, b: SocialPerson): number {
    const d = (k: keyof Personality) => Math.abs(a.p[k] - b.p[k]);
    let c = 0.24 - (d('extraversion') + d('agreeableness') + d('conscientiousness') + d('impulsivity')) * 0.35;
    c += a.hangouts.filter((h) => b.hangouts.includes(h)).length * 0.1;
    c += a.traits.filter((t) => b.traits.includes(t)).length * 0.12;
    // 일진과 일진 사냥꾼, 괴롭히는 애와 평화주의자는 상극
    const clash = (x: string, y: string) => (a.traits.includes(x) && b.traits.includes(y)) || (a.traits.includes(y) && b.traits.includes(x));
    if (clash('bully', 'vigilante')) c -= 0.8;
    if (clash('bully', 'pacifist') || clash('rulesFollower', 'rebelSoul')) c -= 0.3;
    if (a.traits.includes('socialite') || b.traits.includes('socialite')) c += 0.1;
    // 끼리끼리: 노는 애들은 노는 애들끼리 알아본다
    const wild = ['bully', 'brawler', 'rebelSoul', 'firstStrike', 'stickyFingers', 'speedFreak', 'gambler'];
    if (a.traits.some((t) => wild.includes(t)) && b.traits.some((t) => wild.includes(t))) c += 0.25;
    return Math.max(-1, Math.min(1, c));
  }

  /**
   * 함께 시간을 보냈다 (같은 반 쉬는 시간, 같은 PC방, 같은 학원 차).
   * 잘 맞으면 가까워지고, 안 맞으면 거리가 생긴다. 이미 친하면 더 빨리.
   */
  hangOut(a: string, b: string, day: number, rng: Random, minutes = 30): void {
    const A = this.people.get(a)!;
    const B = this.people.get(b)!;
    const c = this.compat(A, B);
    for (const [x, y, X] of [[a, b, A], [b, a, B]] as const) {
      const r = this.ensure(x, y, day);
      const warm = 0.6 + X.p.agreeableness * 0.6 + X.p.extraversion * 0.4;
      const gain = (c * 2.5 + (rng.next() - 0.5) * 1.2) * warm * Math.sqrt(minutes / 30);
      r.closeness = clamp(0, 100, r.closeness + gain * (gain > 0 ? (1 - r.closeness / 120) : 1) - Math.max(0, r.grudge - 30) / 40);
      if (gain > 0) r.trust = clamp(0, 100, r.trust + gain * 0.4);
      r.lastSeen = day;
    }
  }

  /** 안 만나면 멀어진다 (절친은 천천히) */
  decay(day: number): void {
    for (const m of this.out.values()) for (const r of m.values()) {
      const gap = day - r.lastSeen;
      if (gap > 3) r.closeness = Math.max(0, r.closeness - (r.closeness >= BEST_FRIEND ? 0.05 : 0.15));
      r.grudge = Math.max(0, r.grudge - 0.1);
      r.fear = Math.max(0, r.fear - 0.05);
    }
  }

  /** 사건이 관계를 바꾼다 */
  event(a: string, b: string, day: number, d: Partial<Omit<Rel, 'lastSeen'>>): void {
    const r = this.ensure(a, b, day);
    r.closeness = clamp(0, 100, r.closeness + (d.closeness ?? 0));
    r.trust = clamp(0, 100, r.trust + (d.trust ?? 0));
    r.respect = clamp(-100, 100, r.respect + (d.respect ?? 0));
    r.fear = clamp(0, 100, r.fear + (d.fear ?? 0));
    r.grudge = clamp(0, 100, r.grudge + (d.grudge ?? 0));
  }

  /** 소속감 0~1 (친구 수와 절친 유무) — NpcLife.belonging()을 대신한다 */
  belonging(a: string): number {
    const f = this.friends(a).length;
    const best = this.friends(a, BEST_FRIEND).length;
    return clamp(0, 1, f * 0.15 + (best > 0 ? 0.3 : 0));
  }
}

export function clamp(lo: number, hi: number, x: number): number {
  return Math.max(lo, Math.min(hi, x));
}
