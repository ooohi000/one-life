import type { Random } from '../core/Random';
import { type Observed, ParentTalk, type TalkChoice, type TalkResult } from '../dialogue/Talk';
import type { Line } from '../dialogue/topics';
import type { MemoryBank } from '../memory/MemoryBank';
import type { World } from '../memory/World';
import { type ContentSettings, DEFAULT_CONTENT, type ParentRole, type ParentTraits, type ParentType } from './parents';

/** 집에서 아이가 어떤 아이인가 (NPC 자동 대화용) */
export interface ChildTemper {
  rebellion: number; // 0~1
  neuroticism: number;
  agreeableness: number;
  stress: number; // 0~100
}

export interface HouseholdDay {
  lines: Line[];
  childStress: number;
  money: number;
  incidents: Array<'yelled' | 'hit'>;
  /** 부부싸움이 있었나 */
  parentsFought: boolean;
  /** 다른 부모가 막아섰나 / 모른 척했나 */
  intervention?: 'protected' | 'looked away';
}

/**
 * 한 집. 부모 한 명 또는 두 명 + 아이.
 * - 엄마·아빠는 각자 다른 유형일 수 있다 (다정한 엄마 + 술 마시는 아빠).
 * - 한 부모가 선을 넘으면 다른 부모가 막아서거나, 모른 척한다.
 * - 부부싸움은 아이에게 직접 안 해도 아이에게 남는다.
 */
export class Household {
  readonly parents: ParentTalk[];
  /** 부부 갈등 0~100 (높으면 별거·이혼 압력) */
  conflict = 20;
  readonly fights = { count: 0 };
  separated = false;
  /** 아이가 집이 아닌 곳(친척·쉼터·위탁가정)에서 지낸다 */
  childAway: string | null = null;

  constructor(
    readonly childId: string,
    parents: Array<{ id: string; role: ParentRole; type: ParentType; traits: ParentTraits; memory: MemoryBank }>,
    readonly need: number,
    content: ContentSettings = DEFAULT_CONTENT,
  ) {
    this.parents = parents.map((p) => new ParentTalk(p.id, p.role, childId, p.memory, p.traits, need));
    for (const p of this.parents) p.violence = content.domesticViolence;
    this.types = parents.map((p) => p.type);
  }
  readonly types: ParentType[];

  /** 집이 싫은 정도 0~1: 두려움·낮은 애착·부부싸움. 높으면 밖에서 늦게까지 버틴다 */
  aversion(): number {
    const fear = Math.max(0, ...this.parents.map((p) => p.fear));
    const attach = Math.max(...this.parents.map((p) => p.attachment));
    return clamp01(fear / 70 + Math.max(0, 50 - attach) / 80 + this.conflict / 250);
  }

  /** 아이가 가장 의지하는 부모 애착 */
  bestAttachment(): number {
    return Math.max(...this.parents.map((p) => p.attachment));
  }

  maxFear(): number {
    return Math.max(...this.parents.map((p) => p.fear));
  }

  /** 아이(플레이어)가 특정 부모에게 말을 건다. 다른 부모의 반응까지 처리 */
  talk(parentIdx: number, choice: TalkChoice, ctx: { day: number; rng: Random; world: World; child: MemoryBank; observed: Observed }): TalkResult & { intervention?: HouseholdDay['intervention'] } {
    const p = this.parents[parentIdx]!;
    const r: TalkResult & { intervention?: HouseholdDay['intervention'] } = p.talk(choice, ctx);
    if (r.incident) this.react(p, r, ctx.rng, ctx.day);
    return r;
  }

  /**
   * NPC 아이의 하루치 집 생활 (화면 밖에서 돌아가는 모든 집).
   * 아이 성향대로 말을 걸고, 말대꾸하고, 고민을 털어놓는다.
   */
  simulateDay(child: ChildTemper, ctx: { day: number; rng: Random; world: World; child: MemoryBank; observed: Observed }): HouseholdDay {
    const { rng } = ctx;
    const out: HouseholdDay = { lines: [], childStress: 0, money: 0, incidents: [], parentsFought: false };
    if (this.childAway) return out;
    for (const p of this.parents) p.startDay(ctx.day, rng);

    // 부부싸움
    if (this.parents.length === 2 && !this.separated) this.maybeFight(rng, out);

    // 무서우면 말을 덜 건다
    const fear = this.maxFear();
    const n = Math.max(0, Math.round(1 + this.bestAttachment() / 50 - fear / 40 + rng.next() - 0.5));
    for (let i = 0; i < n; i++) {
      const idx = this.pickParent(rng);
      const p = this.parents[idx]!;
      const x = rng.next();
      const talkBack = 0.03 + child.rebellion * 0.1 + (child.stress / 100) * 0.06 - fear / 1000;
      const worry = child.neuroticism * 0.07 * (p.attachment / 100);
      const care = child.agreeableness * 0.05 * (p.attachment / 100);
      const choice: TalkChoice =
        x < talkBack ? { kind: 'talkBack' } : x < talkBack + worry ? { kind: 'worry' } : x < talkBack + worry + care ? { kind: 'care' } : x < talkBack + worry + care + 0.06 ? { kind: 'askMoney', amount: 20000 } : { kind: 'chat' };
      const r = this.talk(idx, choice, ctx);
      out.lines.push(...r.lines);
      out.childStress += r.childStress;
      out.money += r.money;
      if (r.incident) out.incidents.push(r.incident);
      if (r.intervention) out.intervention = r.intervention;
      if (r.incident) break; // 그런 일이 있고 나면 그날은 방에 들어가 나오지 않는다
    }
    return out;
  }

  // ---------- 내부 ----------

  private pickParent(rng: Random): number {
    if (this.parents.length === 1 || this.separated) return 0;
    // 애착이 큰 쪽, 집에 있는 쪽에게 더 자주 말을 건다
    const w = this.parents.map((p) => (p.home ? 1 : 0.1) * (10 + p.attachment));
    return rng.next() * (w[0]! + w[1]!) < w[0]! ? 0 : 1;
  }

  /** 한 부모가 선을 넘었을 때, 다른 부모는? */
  private react(actor: ParentTalk, r: TalkResult & { intervention?: HouseholdDay['intervention'] }, rng: Random, _day: number): void {
    const other = this.parents.find((p) => p !== actor);
    if (!other || this.separated || !other.home) return;
    const tr = other.traits;
    const brave = tr.affection * 0.7 + (1 - tr.temper) * 0.2 + tr.presence * 0.3 - tr.selfFocus * 0.4;
    if (rng.chance(clamp01(brave - 0.2))) {
      r.lines.push({ who: 'narration', text: `(${other.me}가 막아섰다. "애한테 무슨 짓이야!")` });
      r.intervention = 'protected';
      // 막아 준 사람이 있으면 아이가 덜 무너진다. 대신 부부 사이가 크게 흔들린다
      actor.fear = Math.max(0, actor.fear - (r.incident === 'hit' ? 12 : 4));
      other.attachment = Math.min(100, other.attachment + 5);
      this.conflict = Math.min(100, this.conflict + (r.incident === 'hit' ? 20 : 8));
    } else {
      r.lines.push({ who: 'narration', text: `(${other.me}는 방문을 닫았다.)` });
      r.intervention = 'looked away';
      other.attachment = Math.max(0, other.attachment - 3);
      this.conflict = Math.min(100, this.conflict + 3);
    }
    this.maybeSeparate(rng);
  }

  private maybeFight(rng: Random, out: HouseholdDay): void {
    const [a, b] = this.parents as [ParentTalk, ParentTalk];
    if (!a.home || !b.home) return;
    const t = (p: ParentTalk) => p.traits.temper + (p.drunk ? 0.3 : 0) + p.traits.selfFocus * 0.3 - p.traits.warmth * 0.3;
    const p = 0.01 + Math.max(0, t(a) + t(b)) * 0.03 + this.need * 0.03 + this.conflict / 2500;
    if (!rng.chance(p)) {
      this.conflict = Math.max(0, this.conflict - 0.15);
      return;
    }
    out.parentsFought = true;
    this.fights.count++;
    this.conflict = Math.min(100, this.conflict + 4);
    out.childStress += 5;
    out.lines.push({ who: 'narration', text: rng.pick(['(안방에서 큰 소리가 났다. 이어폰을 꼈다.)', '(또 돈 얘기로 싸운다.)', '(문 닫히는 소리. 집이 조용해졌다.)']) });
    // 술 마신 날 부부싸움은 아이도 무섭다
    if (a.drunk || b.drunk) for (const x of this.parents) x.fear = Math.min(100, x.fear + (x.drunk ? 3 : 0));
    this.maybeSeparate(rng);
  }

  private maybeSeparate(rng: Random): void {
    if (this.conflict >= 85 && rng.chance(0.05)) this.separated = true;
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
