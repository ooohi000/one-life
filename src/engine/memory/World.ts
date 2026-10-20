import type { FactKey } from './facts';

/** 세계에 존재하는 사람 한 명 (플레이어·NPC·가족 공통) */
export interface Person {
  id: string;
  name: string;
  /** 처음 본 사람이 기억하는 겉모습 단서 — 이름을 잊어도 이걸로 떠올린다 */
  cue: string;
  /** 처음 만났을 때 받는 인상의 기본값(-1~1). 예의 바르면 +, 무례하면 − */
  manners: number;
}

export interface TrueFact {
  value: string;
  since: number; // dayIndex
}

/**
 * 세계의 진실. 누가 어느 대학에 갔는지 같은 '실제' 정보.
 * 아무도 이걸 직접 보지 못한다 — 각자는 MemoryBank에 아는 만큼만 가진다.
 */
export class World {
  readonly people = new Map<string, Person>();
  private readonly truth = new Map<string, Map<FactKey, TrueFact>>();

  add(p: Person): Person {
    this.people.set(p.id, p);
    return p;
  }

  get(id: string): Person {
    const p = this.people.get(id);
    if (!p) throw new Error(`없는 사람: ${id}`);
    return p;
  }

  setFact(personId: string, key: FactKey, value: string, day: number): void {
    let m = this.truth.get(personId);
    if (!m) this.truth.set(personId, (m = new Map()));
    m.set(key, { value, since: day });
  }

  /** 그날 기준의 진실. 아직 일어나지 않은 일은 보이지 않는다 */
  fact(personId: string, key: FactKey, day = Number.POSITIVE_INFINITY): TrueFact | undefined {
    const f = this.truth.get(personId)?.get(key);
    return f && f.since <= day ? f : undefined;
  }
}
