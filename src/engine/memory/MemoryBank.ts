import type { FactKey } from './facts';
import type { World } from './World';

/** 어떻게 알게 됐나 — 대화에서 말투가 달라진다 ("~했대" vs "~했다며?" vs "진짜야?") */
export type Source = 'saw' | 'told' | 'rumor';

export interface Belief {
  value: string;
  learnedDay: number;
  source: Source;
  /** 누구한테 들었나 */
  from?: string;
}

export interface Encounter {
  day: number;
  place: string;
  context: string; // "집에 놀러 옴", "운동회"
}

export interface Acquaintance {
  personId: string;
  firstMet: Encounter;
  lastSeen: number;
  timesMet: number;
  /** 기억의 진하기 0~1 (만날 때마다 올라가고, 시간이 지나면 흐려진다) */
  strength: number;
  /** 인상 -100~100 */
  impression: number;
  /** 이 사람에 대해 아는 것 */
  known: Map<FactKey, Belief>;
  /** 마지막으로 이 얘기를 꺼낸 날 (같은 얘기 반복 방지) */
  mentioned: Map<string, number>;
  /** 직접 본 적 있나 (false = 얘기로만 들어 본 사람) */
  seen: boolean;
}

/** 이름이 기억나려면 이 이상 진해야 한다 */
export const NAME_RECALL = 0.45;
/** 이 아래로 흐려지면 그 사람을 떠올리지 못한다 */
export const FORGOTTEN = 0.12;

/**
 * 한 사람의 기억. 만난 사람, 그 사람에 대해 아는 것, 그리고 흐려짐.
 * 반감기: 진하게 만난 사람일수록 오래 간다 (집에 놀러 온 친구 vs 운동회에서 스친 애).
 */
export class MemoryBank {
  readonly people = new Map<string, Acquaintance>();

  constructor(readonly ownerId: string) {}

  /** 만남. intensity 0~1: 스침 0.2, 대화 0.4, 집에 초대 0.8 */
  meet(personId: string, day: number, place: string, context: string, intensity: number, impression = 0): Acquaintance {
    let a = this.people.get(personId);
    if (!a) {
      a = {
        personId,
        firstMet: { day, place, context },
        lastSeen: day,
        timesMet: 0,
        strength: 0,
        impression: 0,
        known: new Map(),
        mentioned: new Map(),
        seen: true,
      };
      this.people.set(personId, a);
    }
    a.seen = true;
    const cur = this.strengthAt(personId, day);
    a.strength = Math.min(1, cur + intensity * (1 - cur));
    a.lastSeen = day;
    a.timesMet++;
    a.impression = Math.max(-100, Math.min(100, a.impression + impression));
    return a;
  }

  /** 지금 시점의 기억 진하기 (흐려짐 반영) */
  strengthAt(personId: string, day: number): number {
    const a = this.people.get(personId);
    if (!a) return 0;
    if (day <= a.lastSeen) return a.strength;
    const halfLife = 200 + 1500 * a.strength; // 일
    return a.strength * 0.5 ** ((day - a.lastSeen) / halfLife);
  }

  /**
   * 그 사람 얘기를 듣는다 (자식이 친구 얘기를 함, 누가 이름을 꺼냄).
   * 만나지 않아도 기억이 되살아난다 — 기억은 떠올릴수록 오래 간다.
   */
  hear(personId: string, day: number, intensity = 0.12): void {
    const a = this.people.get(personId);
    if (!a) return;
    const cur = this.strengthAt(personId, day);
    a.strength = Math.min(1, cur + intensity * (1 - cur));
    a.lastSeen = day;
  }

  /** 얘기로만 들어 알게 된 사람 ("네가 말하던 그 친구"). 이미 알면 기억만 되살린다 */
  hearOf(personId: string, day: number): Acquaintance {
    const known = this.people.get(personId);
    if (known) {
      this.hear(personId, day);
      return known;
    }
    const a: Acquaintance = {
      personId,
      firstMet: { day, place: '', context: '얘기로 들은' },
      lastSeen: day,
      timesMet: 0,
      strength: 0.35,
      impression: 0,
      known: new Map(),
      mentioned: new Map(),
      seen: false,
    };
    this.people.set(personId, a);
    return a;
  }

  /** 알게 된다. 직접 본 게 들은 것보다, 들은 게 소문보다 우선한다 */
  learn(personId: string, key: FactKey, value: string, source: Source, day: number, from?: string): void {
    const a = this.people.get(personId);
    if (!a) return; // 모르는 사람 소식은 기억에 남지 않는다
    this.hear(personId, day, 0.15); // 소식을 들으면 그 사람이 다시 떠오른다
    const prev = a.known.get(key);
    const rank: Record<Source, number> = { saw: 3, told: 2, rumor: 1 };
    if (prev && prev.value === value && rank[prev.source] >= rank[source]) return;
    a.known.set(key, { value, learnedDay: day, source, from });
  }

  knows(personId: string, key: FactKey): Belief | undefined {
    return this.people.get(personId)?.known.get(key);
  }

  /** 대화에서 그 사람을 어떻게 부르나: 이름이 기억나면 이름, 아니면 겉모습 단서 */
  referTo(personId: string, day: number, world: World): { text: string; byName: boolean } | null {
    const s = this.strengthAt(personId, day);
    if (s < FORGOTTEN) return null;
    const p = world.get(personId);
    if (s >= NAME_RECALL) return { text: callName(p.name), byName: true };
    const a = this.people.get(personId)!;
    if (!a.seen) return { text: '네가 말하던 그 친구', byName: false };
    const where = a.firstMet.context.includes('집') ? '그때 우리 집 왔던 ' : `${a.firstMet.context} 때 봤던 `;
    return { text: `${where}${p.cue}`, byName: false };
  }
}

/** 소문 전파: 말하는 사람이 아는 걸 듣는 사람에게 넘긴다 (듣는 사람이 그 인물을 알아야 기억에 남음) */
export function tell(from: MemoryBank, to: MemoryBank, personId: string, key: FactKey, day: number, asRumor = false): boolean {
  const b = from.knows(personId, key);
  if (!b) return false;
  if (!to.people.has(personId)) return false;
  to.learn(personId, key, b.value, asRumor ? 'rumor' : 'told', day, from.ownerId);
  return true;
}

// ---------- 한국어 조사 ----------

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 엄마가 부르는 이름: 받침 있으면 "서준이", 없으면 "하나" */
export function callName(name: string): string {
  return hasBatchim(name) ? `${name}이` : name;
}

/** 조사 붙이기: josa('서준이', '은는') → '서준이는' */
export function josa(word: string, pair: '은는' | '이가' | '을를' | '과와' | '으로로' | '이랑랑'): string {
  const b = hasBatchim(word);
  const [withB, withoutB] = { 은는: ['은', '는'], 이가: ['이', '가'], 을를: ['을', '를'], 과와: ['과', '와'], 으로로: ['으로', '로'], 이랑랑: ['이랑', '랑'] }[pair];
  return word + (b ? withB : withoutB);
}
