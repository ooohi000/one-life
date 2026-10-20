import type { Random } from '../core/Random';
import type { SocialGraph } from './graph';

/**
 * 소문. 친한 사이를 타고 퍼지고, 퍼지면서 부풀고, 듣는 사람의 시선을 바꾼다.
 * 사실이 아닌 소문도 퍼진다. 사실이어도 아무도 안 믿을 수 있다.
 */
export interface RumorDef {
  id: string;
  /** 소문의 대상 */
  about: string;
  /** 단계별 버전: 0이 처음 말, 뒤로 갈수록 부풀려진 말 */
  versions: string[];
  /** 사실인가 */
  true: boolean;
  /** 얼마나 자극적인가 0~1 (자극적일수록 잘 퍼진다) */
  juicy: number;
  /** 들은 사람이 대상을 보는 눈이 어떻게 바뀌나 */
  effect: { respect?: number; fear?: number; closeness?: number };
  day: number;
}

interface Heard {
  /** 들은 버전 */
  version: number;
  day: number;
  from: string;
}

export class RumorMill {
  readonly rumors = new Map<string, RumorDef>();
  /** 소문 id → (사람 id → 들은 것) */
  private readonly heard = new Map<string, Map<string, Heard>>();

  constructor(private readonly g: SocialGraph) {}

  /** 처음 퍼뜨린다 (본 사람·당사자) */
  start(r: RumorDef, seeds: string[]): void {
    this.rumors.set(r.id, r);
    const m = new Map<string, Heard>();
    for (const s of seeds) m.set(s, { version: 0, day: r.day, from: s });
    this.heard.set(r.id, m);
  }

  knows(rumorId: string, person: string): Heard | undefined {
    return this.heard.get(rumorId)?.get(person);
  }

  /** 직접 전해 준다 (대화 중에 꺼낸 소문) */
  tell(rumorId: string, from: string, to: string, day: number): void {
    const heard = this.heard.get(rumorId);
    const h = heard?.get(from);
    const r = this.rumors.get(rumorId);
    if (!heard || !h || !r || heard.has(to)) return;
    heard.set(to, { version: h.version, day, from });
    this.g.event(to, r.about, day, { respect: (r.effect.respect ?? 0) * (1 + h.version * 0.5), fear: (r.effect.fear ?? 0) * (1 + h.version * 0.5) });
  }

  reach(rumorId: string): number {
    return this.heard.get(rumorId)?.size ?? 0;
  }

  /** 지금 이 사람이 아는 버전의 문장 */
  versionText(rumorId: string, person: string): string | undefined {
    const h = this.knows(rumorId, person);
    const r = this.rumors.get(rumorId);
    return h && r ? r.versions[Math.min(h.version, r.versions.length - 1)] : undefined;
  }

  /**
   * 하루치 퍼짐. 아는 사람이 친한 사람에게 말한다.
   * 말 많은(외향) 사람이 더 퍼뜨리고, 소문은 며칠이 지나면 식는다. 당사자의 절친은 잘 안 퍼뜨린다.
   */
  spread(day: number, rng: Random): void {
    for (const [id, r] of this.rumors) {
      const age = day - r.day;
      if (age > 30) continue;
      const heard = this.heard.get(id)!;
      const tellers = [...heard.entries()];
      for (const [person, h] of tellers) {
        if (day - h.day > 10) continue; // 들은 지 오래되면 더 이상 말 안 한다
        const P = this.g.people.get(person)!;
        const loyalToSubject = (this.g.rel(person, r.about)?.closeness ?? 0) >= 70 && r.effect.respect !== undefined && r.effect.respect < 0;
        if (loyalToSubject) continue; // 절친 험담은 안 퍼뜨린다
        for (const [other, rel] of this.g.known(person)) {
          if (other === r.about || heard.has(other) || rel.closeness < 5) continue;
          const p = Math.min(0.9, (0.05 + rel.closeness / 100) * r.juicy * (0.3 + P.p.extraversion * 0.6) * Math.exp(-age / 10));
          if (!rng.chance(p)) continue;
          // 말이 옮겨질수록 부푼다
          const version = Math.min(r.versions.length - 1, h.version + (rng.chance(0.3 + P.p.impulsivity * 0.3) ? 1 : 0));
          heard.set(other, { version, day, from: person });
          // 들은 사람의 눈이 바뀐다 (부푼 버전일수록 더)
          const k = 1 + version * 0.5;
          this.g.event(other, r.about, day, {
            respect: (r.effect.respect ?? 0) * k,
            fear: (r.effect.fear ?? 0) * k,
            closeness: (r.effect.closeness ?? 0) * k,
          });
        }
      }
    }
  }
}
