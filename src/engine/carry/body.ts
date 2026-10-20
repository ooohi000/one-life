import type { Random } from '../core/Random';
import type { Weather } from '../env/weather';
import { item, type ItemDef, type ItemTag, VERBS } from './items';

/**
 * 몸에 지닌 것. 양손·주머니·멘 가방·가방 속·입은 것.
 * 화면에선 이게 그대로 도트 캐릭터에 그려진다 (손에 우산, 등에 기타).
 */
export interface Carried {
  uid: number;
  id: string;
  /** 젖은 정도 0~1 */
  wet: number;
  /** 고장·망가짐 */
  broken: boolean;
  /** 우산이면 펴져 있나 */
  open?: boolean;
}

export type Slot = 'left' | 'right' | 'pocket' | 'worn' | 'bag';

export interface CarryLog {
  text: string;
}

export class CarryState {
  left: Carried | null = null;
  right: Carried | null = null;
  /** 두 손으로 드는 물건 (택배 상자) — 있으면 양손 다 찬다 */
  both: Carried | null = null;
  readonly pockets: Carried[] = [];
  /** 멘 것 (백팩·크로스백·기타 케이스) */
  readonly worn: Carried[] = [];
  /** 멘 가방 속 */
  readonly bag: Carried[] = [];
  /** 몸이 젖은 정도 0~1 */
  bodyWet = 0;
  /** 비 맞고 추위 탄 것이 쌓인 정도 — 몸 시스템이 감기로 바꾼다 */
  chill = 0;
  private uid = 0;

  constructor(readonly owner: string, /** 주머니 수 (옷에 따라: 반팔 2, 코트 4) */ public pocketSlots = 2) {}

  // ───────── 상태 ─────────

  freeHands(): number {
    if (this.both) return 0;
    return (this.left ? 0 : 1) + (this.right ? 0 : 1);
  }

  inHands(): Carried[] {
    return [this.left, this.right, this.both].filter((x): x is Carried => !!x);
  }

  all(): Carried[] {
    return [...this.inHands(), ...this.pockets, ...this.worn, ...this.bag];
  }

  has(idOrTag: string): boolean {
    return this.all().some((c) => !c.broken && (c.id === idOrTag || item(c.id).tags.includes(idOrTag as ItemTag)));
  }

  holding(idOrTag: string): Carried | undefined {
    return this.inHands().find((c) => c.id === idOrTag || item(c.id).tags.includes(idOrTag as ItemTag));
  }

  bagCapacity(): number {
    return this.worn.reduce((s, c) => s + (item(c.id).capacity ?? 0), 0);
  }

  bagUsed(): number {
    return this.bag.reduce((s, c) => s + item(c.id).volume, 0);
  }

  /** 지고 있는 무게 (kg) */
  load(): number {
    return this.all().reduce((s, c) => s + item(c.id).weight, 0);
  }

  /** 무게 때문에 걸음이 느려지는 배율 (1 = 보통) */
  walkSpeed(power = 50): number {
    const over = Math.max(0, this.load() - (4 + power / 20));
    return Math.max(0.5, 1 - over * 0.06 - (this.both ? 0.15 : 0));
  }

  /** 눈에 띄는 물건 → 보는 사람이 받는 인상 */
  impressions(): string[] {
    return this.all().map((c) => item(c.id).impression).filter((x): x is string => !!x);
  }

  // ───────── 들기·넣기 ─────────

  /** 물건을 몸에 지닌다. 들 수 있는 첫 방법으로 (안 되면 실패 이유) */
  take(id: string, prefer?: Slot): { ok: true; slot: Slot } | { ok: false; why: string } {
    const def = item(id);
    const c: Carried = { uid: this.uid++, id, wet: 0, broken: false };
    const ways = prefer ? [...def.ways].sort((a) => (wayToSlot(a) === prefer ? -1 : 1)) : def.ways;
    for (const w of ways) {
      if (w === 'pocket' && this.pockets.length < this.pocketSlots && def.volume <= 0.3) {
        this.pockets.push(c);
        return { ok: true, slot: 'pocket' };
      }
      if (w === 'wear' && !this.worn.some((x) => item(x.id).ways.includes('wear') && item(x.id).capacity && def.capacity)) {
        this.worn.push(c);
        return { ok: true, slot: 'worn' };
      }
      if (w === 'bag' && this.bagCapacity() - this.bagUsed() >= def.volume) {
        this.bag.push(c);
        return { ok: true, slot: 'bag' };
      }
      if (w === 'hand' && this.freeHands() > 0) {
        if (!this.right) this.right = c;
        else this.left = c;
        return { ok: true, slot: this.left === c ? 'left' : 'right' };
      }
      if (w === 'twoHands' && this.freeHands() === 2) {
        this.both = c;
        return { ok: true, slot: 'left' };
      }
    }
    return { ok: false, why: def.ways.includes('twoHands') ? '두 손이 다 비어야 들 수 있다.' : this.freeHands() ? '넣을 데가 없다. 가방이 꽉 찼다.' : '손이 꽉 찼다.' };
  }

  /** 내려놓는다 (어디에 뒀는지는 부른 쪽이 기억한다) */
  drop(uid: number): Carried | null {
    if (this.left?.uid === uid) { const c = this.left; this.left = null; return c; }
    if (this.right?.uid === uid) { const c = this.right; this.right = null; return c; }
    if (this.both?.uid === uid) { const c = this.both; this.both = null; return c; }
    for (const list of [this.pockets, this.worn, this.bag]) {
      const i = list.findIndex((c) => c.uid === uid);
      if (i >= 0) {
        const [c] = list.splice(i, 1);
        if (list === this.worn && item(c!.id).capacity) {
          // 가방을 내려놓으면 속에 든 것도 같이
          while (this.bag.length) this.bag.pop();
        }
        return c!;
      }
    }
    return null;
  }

  /** 폰을 꺼내 든다 (손이 비어야) */
  pullOutPhone(): { ok: boolean; why?: string; minutes: number } {
    if (this.holding('phone')) return { ok: true, minutes: 0 };
    if (this.freeHands() === 0) return { ok: false, why: this.holding('umbrella') ? '한 손엔 우산, 한 손엔 짐. 폰을 꺼낼 손이 없다.' : '손이 꽉 찼다.', minutes: 0 };
    const where = [...this.pockets, ...this.bag].find((c) => c.id === 'phone');
    if (!where) return { ok: false, why: this.has('phone') ? '' : '폰을 두고 나왔다.', minutes: 0 };
    const fromBag = this.bag.includes(where);
    this.drop(where.uid);
    if (!this.right) this.right = where;
    else this.left = where;
    return { ok: true, minutes: fromBag ? 1 : 0 };
  }

  /** 이 행동을 할 수 있나 (안 되면 이유) */
  can(verb: string): { ok: boolean; why?: string } {
    const r = VERBS[verb];
    if (!r) return { ok: true };
    if (r.holding && !this.holding(r.holding)) {
      if (r.holding === 'phone') return { ok: false, why: this.has('phone') ? '폰은 주머니에 있다. 먼저 꺼내야 한다.' : '폰을 두고 나왔다.' };
      return { ok: false, why: `${r.holding}을(를) 들고 있지 않다.` };
    }
    // 들고 있는 물건(폰 등)을 쓰는 데 필요한 손은 이미 그걸 든 손
    const need = r.freeHands - (r.holding && this.holding(r.holding) ? 0 : 0);
    if (this.freeHands() < need) {
      const hands = this.inHands().map((c) => item(c.id).name).join(', ');
      return { ok: false, why: `손이 모자라다 (${hands}).` };
    }
    for (const t of r.forbidHolding ?? []) if (this.holding(t)) return { ok: false, why: `${item(this.holding(t)!.id).name}을(를) 들고는 못 한다.` };
    for (const t of r.having ?? []) if (!this.has(t)) return { ok: false, why: ({ money: '지갑도 카드도 없다.', key: '열쇠를 두고 나왔다.', id: '신분증이 없다.' } as Record<string, string>)[t] ?? `${t}이(가) 없다.` };
    return { ok: true };
  }

  // ───────── 비 ─────────

  openUmbrella(): boolean {
    const u = this.holding('umbrella') ?? this.bag.find((c) => item(c.id).tags.includes('umbrella'));
    if (!u) return false;
    if (!this.inHands().includes(u)) {
      if (this.freeHands() === 0) return false;
      this.drop(u.uid);
      if (!this.right) this.right = u;
      else this.left = u;
    }
    u.open = true;
    return true;
  }

  closeUmbrella(): void {
    for (const c of this.inHands()) c.open = false;
  }

  umbrellaOpen(): boolean {
    return this.inHands().some((c) => c.open);
  }

  /**
   * 밖에서 minutes분. 비가 오면 젖는다 — 우산을 펴면 덜, 태풍이면 우산도 소용없다.
   * 손에 든 전자기기는 젖으면 고장날 수 있고, 종이는 못 쓰게 된다. 추운 날 젖으면 한기가 쌓인다(감기).
   */
  outside(minutes: number, w: Weather, rng: Random, shared = false): CarryLog[] {
    const logs: CarryLog[] = [];
    const raining = ['rain', 'shower', 'monsoon', 'typhoon', 'snow'].includes(w.sky);
    if (!raining) {
      // 마르는 중
      this.bodyWet = Math.max(0, this.bodyWet - minutes / 60);
      for (const c of this.all()) c.wet = Math.max(0, c.wet - minutes / 90);
      return logs;
    }
    const heavy = w.sky === 'monsoon' || w.sky === 'typhoon' ? 1.6 : w.sky === 'shower' ? 1.3 : w.sky === 'snow' ? 0.5 : 1;
    const cover = this.umbrellaOpen() ? (w.sky === 'typhoon' ? 0.4 : shared ? 0.65 : 0.88) : 0;
    const rate = (minutes / 20) * heavy * (1 - cover);
    const before = this.bodyWet;
    this.bodyWet = Math.min(1, this.bodyWet + rate);
    if (before < 0.6 && this.bodyWet >= 0.6) logs.push({ text: cover ? '우산을 써도 바지가 다 젖었다.' : '홀딱 젖었다.' });
    // 물건이 젖는다: 손 > 주머니 > 가방 속
    const exposure = (c: Carried) => (this.inHands().includes(c) ? 1 : this.pockets.includes(c) ? 0.35 : this.bag.includes(c) ? 0.12 : 0.6);
    for (const c of this.all()) {
      const def = item(c.id);
      if (def.tags.includes('umbrella')) continue;
      c.wet = Math.min(1, c.wet + rate * exposure(c));
      if (!c.broken && def.tags.includes('electronic') && c.wet > 0.5 && rng.chance((c.wet - 0.5) * 0.25 * minutes / 10)) {
        c.broken = true;
        logs.push({ text: `${def.name}이(가) 물에 젖어 먹통이 됐다.` });
      }
      if (!c.broken && def.tags.includes('paper') && c.wet > 0.6) {
        c.broken = true;
        logs.push({ text: `${def.name}이(가) 젖어서 다 번졌다.` });
      }
    }
    // 추위: 젖은 채로 추우면 한기가 쌓인다
    const cold = Math.max(0, 15 - w.high) / 15;
    this.chill = Math.min(1, this.chill + this.bodyWet * cold * (minutes / 60));
    return logs;
  }

  /** 실내에 있으면 한기가 풀리고 마른다 */
  indoors(minutes: number): void {
    this.bodyWet = Math.max(0, this.bodyWet - minutes / 45);
    this.chill = Math.max(0, this.chill - minutes / 240);
    for (const c of this.all()) c.wet = Math.max(0, c.wet - minutes / 120);
  }

  /** 한기가 감기가 되나 (하루 끝에) — 몸 시스템이 부른다 */
  catchesCold(rng: Random, constitution = 5): boolean {
    return rng.chance(Math.max(0, this.chill - 0.25) * (1.2 - constitution / 10));
  }

  /**
   * 그곳을 떠날 때: 비가 그쳤으면 접어 둔 우산을 깜빡하고 두고 온다. 덜렁댈수록.
   * 돌려주는 건 부른 쪽 (그 자리의 분실물로 남긴다).
   */
  leaveCheck(w: Weather, conscientiousness: number, rng: Random): Carried[] {
    const left: Carried[] = [];
    const raining = ['rain', 'shower', 'monsoon', 'typhoon', 'snow'].includes(w.sky);
    for (const c of this.inHands()) {
      const def = item(c.id);
      const forgettable = def.tags.includes('umbrella') && !raining && !c.open;
      if (forgettable && rng.chance(0.35 * (1.1 - conscientiousness))) left.push(c);
    }
    for (const c of left) this.drop(c.uid);
    return left;
  }
}

function wayToSlot(w: string): Slot {
  return w === 'pocket' ? 'pocket' : w === 'bag' ? 'bag' : w === 'wear' ? 'worn' : 'right';
}

/** 우산 같이 쓰기: 둘 다 덜 젖고(대신 반쯤은 젖는다), 사이가 가까워진다 — 거리가 가까울수록 더 */
export function shareUmbrella(owner: CarryState, guest: CarryState, closeness: number): { ok: boolean; text: string; closenessGain: number } {
  if (!owner.umbrellaOpen()) return { ok: false, text: '우산이 없다.', closenessGain: 0 };
  const gain = closeness >= 60 ? 3 : closeness >= 30 ? 6 : 8;
  const text = closeness >= 60 ? '"야 들어와." 어깨가 반쯤 젖었지만 웃으면서 걸었다.'
    : closeness >= 30 ? '"같이 쓸래?" 우산 아래가 좁아서 어깨가 닿았다.'
    : '"…우산 없어요? 같이 써요." 어색하게 반 뼘 떨어져서 걸었다.';
  return { ok: true, text, closenessGain: gain };
}

export function describeCarry(c: CarryState): string {
  const n = (x: Carried | null) => (x ? `${item(x.id).name}${x.open ? '(펼침)' : ''}${x.broken ? '(고장)' : ''}` : '빈손');
  const hands = c.both ? `양손: ${n(c.both)}` : `오른손: ${n(c.right)} · 왼손: ${n(c.left)}`;
  return `${hands} · 주머니: ${c.pockets.map((x) => item(x.id).name).join(', ') || '없음'} · 멘 것: ${c.worn.map((x) => item(x.id).name).join(', ') || '없음'}${c.bag.length ? ` (속: ${c.bag.map((x) => item(x.id).name).join(', ')}, ${c.bagUsed().toFixed(0)}/${c.bagCapacity()}L)` : ''} · ${c.load().toFixed(1)}kg`;
}

export type { ItemDef };
