import type { Random } from '../core/Random';
import type { FactKey } from '../memory/facts';
import { callName, josa, type MemoryBank } from '../memory/MemoryBank';
import type { World } from '../memory/World';
import { HELP_OPTIONS, type ParentRole, type ParentTraits } from '../family/parents';
import { converse } from './Conversation';
import { answer, type Line, react } from './topics';

/**
 * 플레이어가 부모에게 말을 건다.
 * - 플레이어가 꺼낸 얘기 → 부모 기억이 바뀐다 (나중에 그 얘기가 돌아온다)
 * - 그냥 말 걸면 → 부모가 아는 소식, 아니면 지금 눈에 보이는 것(다크서클·살·PC방…), 아니면 잡담
 * - 자꾸 말 걸면 → 귀찮아한다. 바쁘거나 기분 나쁘면 더 빨리.
 * 새 문장을 무한히 만들지 않는다. 재료는 기억·지금 상태·플레이어의 선택이다.
 */

/** 부모 눈에 보이는 아이의 지금 상태 (몸·생활 시스템에서 채운다) */
export interface Observed {
  darkCircles?: boolean;
  weightTrend?: 'up' | 'down';
  pcbangDaysThisWeek?: number;
  workHoursThisWeek?: number;
  cameHomeLate?: boolean;
  examSoon?: boolean;
}

export type TalkChoice =
  | { kind: 'chat' }
  | { kind: 'tellFriend'; friendId: string; key: FactKey }
  | { kind: 'tellSelf'; key: FactKey; value: string }
  | { kind: 'askMoney'; amount: number }
  | { kind: 'worry' }
  /** 아이가 부모를 챙긴다: 어깨 주물러 드리기, 과일 깎아 드리기 */
  | { kind: 'care' }
  /** 말대꾸 */
  | { kind: 'talkBack' };

export interface TalkResult {
  lines: Line[];
  /** 아이(플레이어) 스트레스 변화 */
  childStress: number;
  /** 받은 돈 */
  money: number;
  /** 부모가 받아 줬나 (false = 귀찮아하거나 거절·부재) */
  engaged: boolean;
  /** 폭언·폭력이 있었나. 장면은 그리지 않고 결과로만 보여 준다 */
  incident?: 'yelled' | 'hit';
  /** 사건 뒤 아이가 고를 수 있는 도움 */
  help?: typeof HELP_OPTIONS;
}

interface Nag {
  id: string;
  when: (o: Observed, need: number) => boolean;
  warm: string[];
  cold: string[];
  stress: number;
}

/** 눈에 보이는 걸로 하는 잔소리·걱정. 데이터로 계속 늘린다 */
const NAGS: Nag[] = [
  {
    id: 'sleep',
    when: (o) => !!o.darkCircles,
    warm: ['눈 밑이 시커멓네. 어제 몇 시에 잤어?', '좀 일찍 자. 그러다 쓰러져.'],
    cold: ['또 밤새 폰 했지?', '그렇게 안 자니까 수업 시간에 졸지.'],
    stress: 2,
  },
  {
    id: 'weightUp',
    when: (o) => o.weightTrend === 'up',
    warm: ['요즘 얼굴이 좀 동그래졌다?', '야식은 적당히 먹어, 몸 생각해서.'],
    cold: ['바지 안 꽉 끼니? 야식 좀 그만 먹어.', '너 요즘 살찐 거 알지?'],
    stress: 3,
  },
  {
    id: 'weightDown',
    when: (o) => o.weightTrend === 'down',
    warm: ['살이 너무 빠졌어. 밥 좀 제대로 먹어.', '어디 아픈 건 아니지? 얼굴이 핼쑥하네.'],
    cold: ['밥 좀 먹고 다녀. 사람들이 {me}가 밥 안 주는 줄 알겠다.'],
    stress: 1,
  },
  {
    id: 'pcbang',
    when: (o) => (o.pcbangDaysThisWeek ?? 0) >= 3,
    warm: ['PC방 너무 자주 가는 거 아니야?', '게임도 좋은데 눈 좀 쉬어.'],
    cold: ['또 PC방이지? 옷에서 냄새 나.', '게임해서 대학 가니?'],
    stress: 3,
  },
  {
    id: 'workPoor',
    when: (o, need) => (o.workHoursThisWeek ?? 0) >= 12 && need >= 0.5,
    warm: ['알바 너무 많이 하는 거 아니야… 미안하다, {me}가.', '힘들면 말해. {me}가 어떻게든 해 볼게.'],
    cold: ['알바 힘들면 좀 줄여.', '…고생한다.'],
    stress: -1,
  },
  {
    id: 'workRich',
    when: (o, need) => (o.workHoursThisWeek ?? 0) >= 12 && need < 0.5,
    warm: ['알바 재밌어? 그래도 공부가 먼저야.'],
    cold: ['알바할 시간에 공부를 하지.', '돈이 필요하면 말을 하지 왜 알바를 해.'],
    stress: 2,
  },
  {
    id: 'late',
    when: (o) => !!o.cameHomeLate,
    warm: ['어제 왜 그렇게 늦었어? 걱정했잖아.', '늦으면 문자라도 해 줘.'],
    cold: ['몇 시에 들어왔어 어제? 문자라도 하든가.', '밤늦게 돌아다니지 마.'],
    stress: 2,
  },
  {
    id: 'exam',
    when: (o) => !!o.examSoon,
    warm: ['시험 얼마 안 남았지? 무리하지 말고.', '시험 끝나면 맛있는 거 먹으러 가자.'],
    cold: ['시험 얼마 남았어? 공부는 하고 있니?', '이번엔 몇 등 할 거야?'],
    stress: 3,
  },
];

const SMALL_TALK = [
  '밥은 먹었어?',
  '오늘 학교는 어땠어?',
  '날씨 추워졌다. 옷 따뜻하게 입고 다녀.',
  '주말에 할머니 댁 가는 거 알지?',
  '냉장고에 과일 있으니까 꺼내 먹어.',
];
/** 무뚝뚝한 부모의 잡담: 짧다. 하지만 물어보긴 한다 */
const GRUFF_TALK = ['밥은 먹었냐.', '…학교는.', '일찍 자라.', '추운데 옷 좀 입고 다녀라.'];
/** 다정한 부모가 먼저 건네는 말 */
const LOVING_TALK = ['우리 아들 요즘 고생한다.', '{me}는 네가 있어서 좋아.', '힘든 거 있으면 언제든 말해.'];
/** 자기 얘기만 하는 부모 */
const SELF_TALK = [
  '{me} 오늘 모임 갔는데 다들 자식 자랑만 하더라. 피곤해.',
  '{me} 이번에 운동 새로 시작했다. 어때, 살 빠져 보이지?',
  '{me} 요즘 너무 힘들어. 너는 모를 거야.',
  '{me} 주말에 친구들이랑 여행 간다. 밥은 알아서 먹어.',
];
/** 간섭하는 부모 */
const CONTROL_TALK = ['어디 갔다 왔어? 누구랑?', '휴대폰 줘 봐.', '그 친구는 부모님이 뭐 하시니?', '오늘 학원 숙제는 다 했어? 보여 줘.'];

const BRUSH_OFF = ['응, 왜?', '{me} 지금 바빠. 이따 얘기해.', '응응.'];
const FED_UP = ['아까 했잖아.', '그만 좀 하고 들어가서 쉬어.', '너 오늘 왜 이렇게 말이 많아?'];

/** 반복 잔소리: 이 기간 안에 같은 잔소리를 또 하면 "몇 번을 말하니" */
const NAG_MEMORY_DAYS = 14;
/** 같은 문장 조각은 이 기간 동안 다시 안 쓴다 (다른 조각이 있으면) */
const LINE_COOLDOWN_DAYS = 7;
/** 용돈 다시 달라고 하면 "지난번에 줬잖아" */
const MONEY_COOLDOWN_DAYS = 7;

type Ctx = { day: number; rng: Random; world: World; child: MemoryBank; observed: Observed };

/**
 * 부모 한 명과 아이 사이. 부모의 사랑(속마음)과 아이의 애착·두려움을 따로 센다.
 * 맞고 자란 아이도 부모를 사랑할 수 있다 — 그래서 애착과 두려움은 다른 숫자다.
 */
export class ParentTalk {
  /** 오늘 기분 -1~1 */
  mood = 0;
  /** 오늘 바쁜 정도 0~1 */
  busy = 0;
  /** 오늘 집에 있나 */
  home = true;
  /** 오늘 술 마셨나 */
  drunk = false;
  /** 쌓인 화 0~100 */
  anger = 0;
  /** 아이 → 부모 애착(사랑·의지) 0~100. 받아 주면 오르고 상처받으면 내린다 */
  attachment = 60;
  /** 아이 → 부모 두려움 0~100. 높으면 집을 피하고 말을 안 건다 */
  fear = 0;
  /** 지금까지의 폭언·폭력 횟수 */
  readonly incidents = { yelled: 0, hit: 0 };
  /** 콘텐츠 옵션: false면 술 마신 날에도 손찌검까지는 가지 않는다 */
  violence = true;
  /** 임시조치(퇴거·접근금지)로 집에서 떨어져 있다 */
  removed = false;
  private day = -1;
  private talksToday = 0;
  private kindsToday = new Set<string>();
  private lineUsed = new Map<string, number>();
  private nags = new Map<string, { count: number; last: number }>();
  private lastMoneyDay = -999;
  /** 바빠서 못 들어 준 고민 — 나중에 먼저 물어본다 */
  private pendingWorry = false;
  /** 말로는 못 하고 행동으로 챙길 것 (무뚝뚝한 사랑) */
  private pendingCare = false;
  /** 어제 손을 댔다 → 오늘 후회하는가 */
  private remorseDay = -1;

  constructor(
    readonly parentId: string,
    readonly role: ParentRole,
    readonly childId: string,
    readonly memory: MemoryBank,
    readonly traits: ParentTraits,
    /** 집의 경제적 필요 0~1 (가난·부모 아픔) */
    readonly need: number,
  ) {
    this.attachment = this.baseAttachment();
  }

  /** 그동안 부모가 해 온 대로 생긴 애착의 바탕. 폭력은 바탕 자체를 깎는다 */
  baseAttachment(): number {
    const tr = this.traits;
    return 35 + tr.affection * 25 + tr.warmth * 15 + tr.presence * 10 - tr.temper * 15 - this.incidents.hit * 2;
  }

  get me(): string {
    return { mom: '엄마', dad: '아빠', grandma: '할머니' }[this.role];
  }

  /** 하루 시작: 오늘 기분·바쁨·집에 있나·술 */
  startDay(day: number, rng: Random): void {
    if (day === this.day) return;
    const gap = this.day < 0 ? 1 : day - this.day;
    this.day = day;
    this.talksToday = 0;
    this.kindsToday.clear();
    const tr = this.traits;
    this.home = !this.removed && rng.chance(0.25 + 0.75 * tr.presence);
    this.drunk = rng.chance(tr.drinking * 0.5);
    this.mood = clamp(-1, 1, (rng.next() * 2 - 1) * 0.6 - this.need * 0.3 - (this.drunk ? 0.3 : 0));
    this.busy = rng.chance(0.25 + tr.selfFocus * 0.3) ? 0.6 + rng.next() * 0.4 : rng.next() * 0.3;
    this.anger = Math.max(0, this.anger * 0.6 ** gap + (this.mood < 0 ? -this.mood * 25 : 0) + (this.drunk ? 15 : 0));
    // 두려움은 천천히 가라앉는다 (사건이 없으면)
    this.fear = Math.max(0, this.fear - 0.5 * gap);
    // 애착은 하루하루의 말보다 오래 쌓인 바탕(그동안 받은 사랑)으로 조금씩 돌아간다.
    // 비교만 하는 엄마여도 아이는 엄마를 쉽게 놓지 못한다.
    this.attachment += (this.baseAttachment() - this.attachment) * (1 - 0.985 ** gap);
  }

  /** 오늘 몇 번까지 기분 좋게 받아 주나 */
  patience(): number {
    const tr = this.traits;
    return 1.5 + tr.warmth * 2 + tr.affection + this.mood * 1.2 - this.busy * 2 - tr.selfFocus - this.anger / 40;
  }

  talk(choice: TalkChoice, ctx: Ctx): TalkResult {
    this.startDay(ctx.day, ctx.rng);
    const res: TalkResult = { lines: [], childStress: 0, money: 0, engaged: true };
    if (!this.home) {
      res.lines.push({ who: 'narration', text: ctx.rng.pick([`(${this.me}는 아직 안 들어왔다.)`, `(집에 아무도 없다. 식탁 위에 카드 한 장만 놓여 있다.)`]) });
      res.engaged = false;
      res.childStress += this.traits.presence < 0.3 ? 2 : 0;
      return res;
    }
    this.talksToday++;

    // 어제 손을 댔으면, 사랑이 있는 부모는 오늘 후회한다 (그리고 이 순환이 반복되기도 한다)
    if (this.remorseDay === ctx.day) {
      this.remorseDay = -1;
      this.say(res, this.drunk ? '…어제는 미안했다. 다시는 안 그럴게.' : `어제는… ${this.me}가 미안했다. ${this.me}가 너무 화가 나서.`);
      this.attachment = Math.min(100, this.attachment + 2);
    }

    // 같은 날 같은 얘기를 또 하거나, 인내심을 넘으면 귀찮아한다
    const kindKey = choice.kind === 'tellFriend' ? `tell:${choice.friendId}:${choice.key}` : choice.kind;
    const repeatToday = this.kindsToday.has(kindKey) && !['worry', 'chat', 'care', 'talkBack'].includes(choice.kind);
    this.kindsToday.add(kindKey);
    const over = this.talksToday - this.patience();
    if (repeatToday || over > 2) {
      this.say(res, this.fresh(ctx, 'fedUp', FED_UP));
      this.attachment = Math.max(0, this.attachment - 1);
      this.provoke(8, ctx, res);
      res.childStress += 1;
      res.engaged = false;
      return res;
    }
    // 오늘 첫 말은 웬만하면 받아 준다 (정말 바쁠 때만 빼고)
    if (over > 0 && choice.kind === 'chat' && (this.talksToday > 1 || this.busy >= 0.6)) {
      this.say(res, this.fresh(ctx, 'brushOff', BRUSH_OFF));
      this.provoke(3, ctx, res);
      res.engaged = false;
      return res;
    }

    switch (choice.kind) {
      case 'chat': this.chat(ctx, res); break;
      case 'tellFriend': this.tellFriend(choice.friendId, choice.key, ctx, res); break;
      case 'tellSelf': this.tellSelf(choice.key, choice.value, ctx, res); break;
      case 'askMoney': this.askMoney(choice.amount, ctx, res); break;
      case 'worry': this.worry(ctx, res); break;
      case 'care': this.care(ctx, res); break;
      case 'talkBack': this.talkBack(ctx, res); break;
    }
    if (res.engaged && !res.incident) this.attachment = Math.min(100, this.attachment + 0.1 + this.traits.warmth * 0.25);
    return res;
  }

  // ---------- 선택지별 ----------

  private chat(ctx: Ctx, res: TalkResult): void {
    const tr = this.traits;
    // 1) 무뚝뚝한 사랑: 말 대신 행동
    if (this.pendingCare) {
      this.pendingCare = false;
      res.lines.push({ who: 'narration', text: `(책상 위에 봉투가 놓여 있다. "밥 사 먹어라." — ${this.me} 글씨다.)` });
      res.money += 20000;
      this.lastMoneyDay = ctx.day;
      res.childStress -= 5;
      this.attachment = Math.min(100, this.attachment + 4);
      return;
    }
    // 2) 바빠서 못 들어 준 고민을 기억하고 먼저 묻는다
    if (this.pendingWorry && this.busy < 0.5) {
      this.pendingWorry = false;
      this.say(res, `아 맞다, 저번에 하려던 얘기 뭐였어? ${this.me}가 그때 바빠서 미안해.`);
      this.attachment = Math.min(100, this.attachment + 3);
      res.childStress -= 3;
      return;
    }
    // 3) 자기 얘기가 먼저인 부모
    if (ctx.rng.chance(Math.max(0, tr.selfFocus - 0.3))) {
      this.say(res, this.fresh(ctx, 'self', SELF_TALK));
      res.childStress += 1;
      return;
    }
    // 4) 간섭
    if (ctx.rng.chance(Math.max(0, tr.control - 0.2) * 0.6)) {
      this.say(res, this.fresh(ctx, 'control', CONTROL_TALK));
      res.childStress += 4;
      this.attachment = Math.max(0, this.attachment - 1.5);
      return;
    }
    // 5) 기억 속 소식 (친구 대학·군대·취업…) — 관심이 있어야 묻는다
    if (ctx.rng.chance(0.3 + tr.presence * 0.7)) {
      const news = converse({
        world: ctx.world, day: ctx.day, rng: ctx.rng,
        speakerId: this.parentId, speaker: this.memory, style: this.style(),
        listenerId: this.childId, listener: ctx.child, maxTopics: 1,
      });
      if (news.lines.length) {
        res.lines.push(...news.lines.map((l) => ({ ...l, text: l.text.replaceAll('엄마', this.me) })));
        res.childStress += news.listenerStress;
        return;
      }
    }
    // 6) 눈에 보이는 것 — 신경 쓰는 부모만 알아챈다
    const noticed = NAGS.filter((n) => n.when(ctx.observed, this.need) && !this.kindsToday.has(`nag:${n.id}`) && ctx.rng.chance(0.2 + tr.presence * 0.8));
    if (noticed.length) {
      const n = ctx.rng.pick(noticed);
      this.kindsToday.add(`nag:${n.id}`);
      const rec = this.nags.get(n.id);
      const repeat = rec && ctx.day - rec.last <= NAG_MEMORY_DAYS ? rec.count : 0;
      this.nags.set(n.id, { count: repeat + 1, last: ctx.day });
      const warm = tr.warmth >= 0.5;
      const line = this.fresh(ctx, `nag:${n.id}:${warm}`, warm ? n.warm : n.cold);
      const prefix = repeat >= 2 ? (warm ? `${this.me}가 자꾸 말해서 미안한데, ` : '몇 번을 말하니. ') : repeat === 1 && !warm ? '저번에도 말했지만 ' : '';
      this.say(res, prefix + line);
      // 따뜻하게 말하면 같은 잔소리도 덜 아프다
      res.childStress += (n.stress > 0 ? n.stress * (warm ? 0.5 : 1) + repeat * (warm ? 1 : 2) : n.stress);
      if (repeat >= 2 && !warm) {
        this.attachment = Math.max(0, this.attachment - 1);
        this.provoke(5, ctx, res);
      }
      return;
    }
    // 7) 별일 없으면 잡담 — 사랑이 많으면 먼저 다정한 말을 건넨다
    if (tr.warmth >= 0.7 && ctx.rng.chance(0.35)) {
      this.say(res, this.fresh(ctx, 'loving', LOVING_TALK));
      res.childStress -= 3;
      this.attachment = Math.min(100, this.attachment + 1);
      return;
    }
    if (tr.affection < 0.35 && tr.warmth < 0.3) {
      this.say(res, ctx.rng.pick(['어.', '왜.', '…']));
      return;
    }
    this.say(res, this.fresh(ctx, 'small', tr.warmth < 0.3 ? GRUFF_TALK : SMALL_TALK));
    res.childStress -= 1;
  }

  private tellFriend(friendId: string, key: FactKey, ctx: Ctx, res: TalkResult): void {
    const fact = ctx.child.knows(friendId, key);
    const friend = ctx.world.get(friendId);
    if (!fact) return;
    const wasKnown = this.memory.people.has(friendId);
    const acq = this.memory.hearOf(friendId, ctx.day);
    const known = this.memory.knows(friendId, key);
    res.lines.push({ who: this.childId, text: `${josa(callName(friend.name), '은는')} ${answer(key, fact.value)}` });
    // 관심 없는 부모는 듣고 흘린다 — 기억에 남는 정도가 다르다
    if (ctx.rng.chance(0.3 + this.traits.presence * 0.7 - this.traits.selfFocus * 0.3)) {
      this.memory.learn(friendId, key, fact.value, 'told', ctx.day, this.childId);
      acq.mentioned.set(`ask:${key}`, ctx.day);
    }
    if (this.traits.selfFocus > 0.6 || this.traits.presence < 0.3) {
      this.say(res, ctx.rng.pick(['응.', '그래? 근데 있잖아, ' + this.fresh(ctx, 'self', SELF_TALK)]));
      return;
    }
    if (known?.value === fact.value) {
      this.say(res, `응, ${this.me}도 들었어.`);
      return;
    }
    const intro = wasKnown ? '' : `${friend.name}? 처음 듣는 이름인데, 같은 반이야? `;
    const r = react({ ...this.topicCtx(ctx), subjectId: friendId, acq, ref: { text: friend.name, byName: true } }, key, fact.value);
    this.say(res, (intro + (r ?? '그렇구나.')).trim());
    if (r && this.traits.expectation > 0.6 && this.traits.warmth < 0.5) res.childStress += 2;
  }

  private tellSelf(key: FactKey, value: string, ctx: Ctx, res: TalkResult): void {
    this.memory.learn(this.childId, key, value, 'told', ctx.day, this.childId);
    const tr = this.traits;
    if (key !== 'dating') {
      res.lines.push({ who: this.childId, text: answer(key, value) });
      this.say(res, tr.warmth >= 0.5 ? '잘했어, 우리 아들.' : '그래.');
      return;
    }
    res.lines.push({ who: this.childId, text: '나 여자친구 생겼어.' });
    if (tr.control > 0.8) {
      this.say(res, '고등학생이 무슨 연애야. 어떤 애야? 부모님은 뭐 하셔? …당장 정리해.');
      res.childStress += 6;
      this.attachment = Math.max(0, this.attachment - 2);
    } else if (tr.expectation > 0.6 && tr.warmth < 0.5) {
      this.say(res, ctx.observed.examSoon ? '시험이 코앞인데 연애할 때니?' : '공부는 언제 하고?');
      res.childStress += 4;
      this.attachment = Math.max(0, this.attachment - 1);
    } else if (tr.selfFocus > 0.6 || tr.presence < 0.3) {
      this.say(res, '그래? 알아서 해.');
    } else if (tr.warmth >= 0.5) {
      this.say(res, `어머, 어떤 애야? ${value}? 이름 예쁘다. 언제 한번 데려와.`.replace('어머, ', this.role === 'dad' ? '오, ' : '어머, '));
      res.childStress -= 3;
      this.attachment = Math.min(100, this.attachment + 3);
    } else {
      this.say(res, '…그래. 잘해 줘라.');
    }
  }

  private askMoney(amount: number, ctx: Ctx, res: TalkResult): void {
    const tr = this.traits;
    res.lines.push({ who: this.childId, text: `${this.me}, 나 ${(amount / 10000).toFixed(0)}만 원만…` });
    const recent = ctx.day - this.lastMoneyDay < MONEY_COOLDOWN_DAYS;
    const give = (ratio: number, line: string) => {
      this.say(res, line);
      res.money += Math.round((amount * ratio) / 1000) * 1000;
      this.lastMoneyDay = ctx.day;
    };
    const refuse = (line: string, stress: number) => {
      this.say(res, line);
      res.engaged = false;
      res.childStress += stress;
    };
    if (this.need >= 0.6) {
      // 형편이 어려우면 주고 싶어도 못 준다. 아이도 그걸 안다
      if (!recent && ctx.rng.chance(0.35)) {
        give(0.5, '…여기. 아껴 써.');
        res.childStress += 2; // 받아도 마음이 무겁다
      } else refuse(tr.warmth >= 0.5 ? `미안하다, 이번 달은 ${this.me}가 좀 어려워…` : '돈 없어. 알잖아.', 4);
      return;
    }
    if (tr.presence < 0.3) return give(1, '(쳐다보지도 않고 카드를 건넨다.) 알아서 써.');
    if (tr.selfFocus > 0.7) {
      return ctx.rng.chance(0.5) ? give(1, '여기. 이제 귀찮게 하지 마.') : refuse(`${this.me}도 쓸 데가 많아. 이번 달 ${this.me} 카드값 봤니?`, 2);
    }
    if (tr.affection > 0.7 && tr.warmth < 0.3 && !recent) {
      // 무뚝뚝한 사랑: 그 자리에선 거절, 다음 날 책상 위에
      refuse(`${this.role === 'dad' ? '엄마' : '아빠'}한테 달라 해.`, 1);
      this.pendingCare = true;
      return;
    }
    if (recent) {
      if (tr.warmth >= 0.5 && this.mood > -0.2) give(0.5, '지난번에 준 건 벌써 다 썼어? 이번만이다.');
      else refuse('지난주에도 줬잖아. 뭐에 다 쓰니?', 2);
      return;
    }
    const p = 0.55 + this.mood * 0.25 + tr.warmth * 0.2 + (this.attachment - 50) / 200;
    if (ctx.rng.chance(p)) give(1, ctx.rng.pick(['어디 쓰게? …알았어.', '여기. 쓸데없는 데 쓰지 말고.', `${this.role === 'mom' ? '아빠' : '엄마'}한테는 비밀이다.`]));
    else refuse(this.mood < 0 ? `오늘은 안 돼. ${this.me} 기분 별로야.` : '용돈 받은 지 얼마나 됐다고.', 1);
  }

  private worry(ctx: Ctx, res: TalkResult): void {
    const tr = this.traits;
    res.lines.push({ who: this.childId, text: `${this.me}, 나 요즘 좀 힘들어.` });
    if (this.anger > 50) {
      this.say(res, '너만 힘들어? 지금 그런 소리 할 때야?');
      res.childStress += 5;
      this.attachment = Math.max(0, this.attachment - 2);
      this.provoke(10, ctx, res);
      return;
    }
    if (this.busy >= 0.6) {
      this.say(res, `응? ${this.me} 지금 정신이 없어서… 이따 얘기하자.`);
      this.pendingWorry = tr.affection >= 0.6 && tr.warmth >= 0.4; // 아끼는 부모는 나중에 먼저 물어본다
      res.engaged = false;
      res.childStress += 1;
      return;
    }
    if (tr.selfFocus > 0.7) {
      this.say(res, `너만 힘드니? ${this.me}가 더 힘들어. 오늘 ${this.me}가 무슨 일이 있었냐면…`);
      res.childStress += 3;
      this.attachment = Math.max(0, this.attachment - 1.5);
      return;
    }
    if (tr.control > 0.8) {
      // 걱정은 하는데, 해결을 엄마가 다 해 버리려 한다
      this.say(res, `뭔데? 누가 괴롭혀? ${this.me}가 담임 선생님한테 전화할게. 핸드폰 줘 봐.`);
      res.childStress -= 2;
      this.attachment = Math.min(100, this.attachment + 0.5);
      return;
    }
    if (tr.warmth >= 0.5) {
      this.say(res, ctx.rng.pick([`무슨 일 있어? ${this.me}한테 얘기해 봐.`, '이리 와 앉아 봐. 뭐가 힘들어?']));
      res.childStress -= 8;
      this.attachment = Math.min(100, this.attachment + 2.5);
    } else if (tr.affection > 0.7) {
      this.say(res, '…밥은 먹었냐.');
      res.childStress -= 3;
      this.pendingCare = true;
    } else if (tr.expectation > 0.6) {
      this.say(res, ctx.rng.pick(['다들 힘들어. 고민할 시간에 공부나 해.', '너만 힘든 거 아니야.']));
      res.childStress += 4;
      this.attachment = Math.max(0, this.attachment - 3);
    } else {
      this.say(res, tr.affection < 0.35 ? '그래서 어쩌라고.' : '그래? 푹 자. 자고 나면 괜찮아.');
      res.childStress += tr.affection < 0.35 ? 4 : -2;
    }
  }

  /** 아이가 부모를 챙긴다 */
  private care(ctx: Ctx, res: TalkResult): void {
    const tr = this.traits;
    res.lines.push({ who: this.childId, text: ctx.rng.pick([`${this.me}, 어깨 주물러 줄까?`, `${this.me} 이거 먹어. 사 왔어.`]) });
    if (this.anger > 60) {
      this.say(res, '귀찮게 하지 말고 들어가.');
      res.childStress += 2;
      return;
    }
    if (tr.warmth >= 0.5) {
      this.say(res, ctx.rng.pick(['어머, 우리 아들 다 컸네.', `고마워. ${this.me}는 너밖에 없다.`]).replace('어머, ', this.role === 'dad' ? '허허, ' : '어머, '));
      res.childStress -= 4;
      this.attachment = Math.min(100, this.attachment + 1.5);
    } else if (tr.affection > 0.7) {
      this.say(res, '…됐다. 들어가 자.');
      res.lines.push({ who: 'narration', text: `(${this.me} 입꼬리가 살짝 올라갔다.)` });
      res.childStress -= 2;
      this.attachment = Math.min(100, this.attachment + 2);
    } else if (tr.selfFocus > 0.6) {
      this.say(res, '응, 거기 좀 세게. …아 시원하다. 이제 가 봐.');
    } else {
      this.say(res, '됐어.');
      res.childStress += 1;
    }
  }

  /** 말대꾸 */
  private talkBack(ctx: Ctx, res: TalkResult): void {
    res.lines.push({ who: this.childId, text: ctx.rng.pick([`${this.me}가 뭘 알아!`, '아 진짜 짜증 나. 그만 좀 해.']) });
    const tr = this.traits;
    if (tr.warmth >= 0.6 && this.anger < 40) {
      this.say(res, `…${this.me}가 너무 몰아붙였나 보다. 미안해. 나중에 다시 얘기하자.`);
      res.childStress -= 1;
      return;
    }
    this.say(res, '너 말버릇이 그게 뭐야?');
    res.childStress += 3;
    this.attachment = Math.max(0, this.attachment - 1);
    this.provoke(20, ctx, res);
  }

  // ---------- 화와 폭력 ----------

  /**
   * 화가 쌓인다. 화를 못 참는 부모는 선을 넘는다.
   * 장면을 묘사하지 않는다 — 소리, 결과, 아이의 몸과 마음에 남는 것만.
   */
  private provoke(amount: number, ctx: Ctx, res: TalkResult): void {
    const tr = this.traits;
    const temper = Math.min(1, tr.temper + (this.drunk ? 0.2 : 0));
    this.anger = Math.min(100, this.anger + amount * (0.3 + temper));
    const threshold = 100 - temper * 50;
    if (temper < 0.35 || this.anger < threshold) return;
    this.anger = 20;
    // 손찌검: 화를 아주 못 참는 부모는 자주, 평범한 부모도 아주 드물게 (체벌 — 2021년부터 법으로 금지)
    const hit = this.violence && temper > 0.55 && ctx.rng.chance((temper - 0.45) * 0.5);
    if (hit) {
      res.lines.push({ who: 'narration', text: '(고함이 터졌다. 그 뒤는 기억하고 싶지 않다. 팔에 멍이 들었다.)' });
      res.incident = 'hit';
      this.incidents.hit++;
      this.fear = Math.min(100, this.fear + 25);
      this.attachment = Math.max(0, this.attachment - 6);
      res.childStress += 25;
      if (tr.affection >= 0.4) this.remorseDay = ctx.day + 1;
    } else {
      res.lines.push({ who: 'narration', text: ctx.rng.pick(['(언성이 높아졌다. 문이 쾅 닫혔다.)', '(소리를 질렀다. 집 안이 조용해졌다.)']) });
      res.incident = 'yelled';
      this.incidents.yelled++;
      this.fear = Math.min(100, this.fear + 8);
      this.attachment = Math.max(0, this.attachment - 2);
      res.childStress += 10;
    }
    res.help = HELP_OPTIONS;
    res.engaged = false;
  }

  // ---------- 도우미 ----------

  private say(res: TalkResult, text: string): void {
    res.lines.push({ who: this.parentId, text: text.replaceAll('{me}', this.me) });
  }

  private style() {
    return { warmth: this.traits.warmth, expectation: this.traits.expectation };
  }

  /** 최근에 쓴 조각은 피해서 고른다 */
  private fresh(ctx: { day: number; rng: Random }, group: string, options: string[]): string {
    const ok = options.filter((o) => {
      const d = this.lineUsed.get(`${group}|${o}`);
      return d === undefined || ctx.day - d >= LINE_COOLDOWN_DAYS;
    });
    const line = ctx.rng.pick(ok.length ? ok : options);
    this.lineUsed.set(`${group}|${line}`, ctx.day);
    return line;
  }

  private topicCtx(ctx: Ctx) {
    return {
      world: ctx.world, day: ctx.day, rng: ctx.rng,
      speakerId: this.parentId, speaker: this.memory, style: this.style(),
      listenerId: this.childId, listener: ctx.child,
    };
  }
}

function clamp(lo: number, hi: number, x: number): number {
  return Math.max(lo, Math.min(hi, x));
}
