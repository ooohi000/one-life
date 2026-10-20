import { assignTraits, traitEffects } from '../traits/traits';
import { BodySystem } from '../body/BodySystem';
import type { MealKind } from '../body/composition';
import { CharacterSystem } from '../character/CharacterSystem';
import { createCharacter, randomCreationInput } from '../character/creation';
import { trainStat } from '../character/stats';
import type { Character } from '../character/types';
import type { Random } from '../core/Random';
import { addDays, type GameDate, weekdayOf } from '../time/calendar';
import { GameClock } from '../time/GameClock';
import { isSchoolDay, judgeArrival } from '../time/school';
import { type ActionDef, ACTIONS, type Place } from './actions';
import { chooseAction } from './brain';
import { type Attitudes, buildLifeGoals, type GoalEntry, type Goals, type Personality, randomAttitudes, randomPersonality, selfControl, splitGoals } from './personality';
import { LIFE_STATES, type LifeStateDef, type LifeStateId } from './states';

const H = (h: number, m = 0) => h * 60 + m;



/** 가족 상황. 돈이 목표가 아니어도 형편이 일을 하게 만든다 */
export interface FamilySituation {
  parents: 'both' | 'single' | 'grandparents';
  parentSick: boolean;
}
export const PARENTS_LABEL_KO = { both: '양부모', single: '한부모', grandparents: '조부모와 삶' } as const;

/** 경제적 필요 0~1: 형편 + 가족 상황 */
export function financialNeed(origin: Character['origin'], fam: FamilySituation): number {
  let n = { rich: 0, normal: 0.12, poor: 0.45 }[origin];
  if (fam.parents === 'single') n += 0.2;
  if (fam.parents === 'grandparents') n += 0.3;
  if (fam.parentSick) n += 0.3;
  return Math.max(0, Math.min(1, n));
}

export interface NpcProfile {
  family: FamilySituation;
  /** 경제적 필요 0~1 */
  need: number;
  ch: Character;
  personality: Personality;
  attitudes: Attitudes;
  /** 복합 목표: 무엇을, 왜, 누가 정했나, 숨기나 */
  lifeGoals: GoalEntry[];
  /** 두뇌용 요약 */
  goals: Goals;
  intrinsicGoals: Goals;
  parentExpectation: number; // 0~1
  academyDays: number[]; // 요일(0=일). 부모가 등록한 학원 가는 날
  jobDays: number[]; // 알바 근무 요일
  allowanceWeekly: number; // 주간 용돈(원)
  /** 특성 (traits/traits.ts) */
  traits: string[];
}

export interface TimelineEntry {
  dayIndex: number;
  start: number; // 그날 0시 기준 분 (자정 넘으면 1440 이상)
  end: number;
  action: string;
  place: Place;
  note?: string;
}

/** 하루 흐름의 갈림길 (auto = AI가 골랐을 답) */
export type DayDecision =
  | { kind: 'school'; auto: DayAnswer; refusal: number }
  | { kind: 'commitment'; action: ActionDef; auto: DayAnswer }
  | { kind: 'free'; now: number; bed: number; options: ActionDef[]; auto: DayAnswer };
/** 'attend' | 'skip' | 'go' | 'sleep' | 행동 id */
export type DayAnswer = string;

export interface DayReport {
  date: GameDate;
  entries: TimelineEntry[];
  late: boolean;
  sleptMin: number;
  skippedAcademy: boolean;
}

const NAMES = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '주원', '지후', '준우', '서진', '건우', '현우', '우진', '선우', '연우', '유준', '정우', '승우', '승현', '민재', '지환', '은우', '준서', '이준', '지훈', '태윤', '한결', '재윤', '시윤'];

/** 출신·성격으로 NPC 한 명을 만든다 */
export function createNpcProfile(id: string, rng: Random, name?: string): NpcProfile {
  const ch = createCharacter(randomCreationInput(id, name ?? rng.pick(NAMES), rng), rng);
  const personality = randomPersonality(rng);
  const baseExpect = { rich: 0.75, normal: 0.5, poor: 0.3 }[ch.origin];
  const parentExpectation = Math.max(0, Math.min(1, baseExpect + (rng.next() - 0.5) * 0.4));
  const attitudes = randomAttitudes(personality, ch.origin, parentExpectation, rng);
  const lifeGoals = buildLifeGoals(personality, attitudes, ch.origin, parentExpectation, rng);
  const { disciplined: goals, intrinsic: intrinsicGoals } = splitGoals(lifeGoals);
  const enrolled = ch.origin === 'rich' ? true : ch.origin === 'normal' ? rng.chance(0.7) : rng.chance(0.15);
  const academyDays = enrolled ? (parentExpectation > 0.6 ? [1, 2, 3, 4, 5] : [1, 3, 5]) : [];
  const odds = { rich: [0.03, 0.03, 0.01], normal: [0.1, 0.05, 0.02], poor: [0.3, 0.15, 0.08] }[ch.origin] as [number, number, number];
  const r = rng.next();
  const family: FamilySituation = {
    parents: r < odds[2] ? 'grandparents' : r < odds[2] + odds[0] ? 'single' : 'both',
    parentSick: rng.chance(odds[1]),
  };
  const need = financialNeed(ch.origin, family);
  // 원해서 하는 알바 vs 해야 해서 하는 알바
  const wantsJob = lifeGoals.some((g) => g.goal === 'money' || g.goal === 'escape') || rng.chance(need);
  const jobDays = need >= 0.7 ? [0, 2, 4, 5, 6] : need >= 0.45 ? [0, 2, 4, 6] : wantsJob ? [2, 4, 6] : [];
  // 형편이 어려울수록 용돈이 줄어든다
  const allowanceWeekly = Math.round(({ rich: 70000, normal: 40000, poor: 15000 }[ch.origin] * (1 - need * 0.8)) / 1000) * 1000;
  const traits = assignTraits({ p: personality, att: attitudes, origin: ch.origin }, rng);
  return { family, need, ch, personality, attitudes, lifeGoals, goals, intrinsicGoals, parentExpectation, academyDays, jobDays, allowanceWeekly, traits };
}

/**
 * NPC 한 명의 삶. 자기 시계와 몸을 가지고 하루씩 산다.
 * 플레이어와 같은 엔진(시간·몸·스탯)을 쓴다 — NPC도 똑같이 지각하고 살찌고 녹슨다.
 */
export class NpcLife {
  readonly clock: GameClock;
  readonly body: BodySystem;
  readonly needs = { loneliness: 30, boredom: 30 };
  money: number;
  readonly timeline: TimelineEntry[] = [];
  readonly minutesByAction = new Map<string, number>();
  lateCount = 0;
  academySkips = 0;
  collapses = 0;
  absences = 0;
  /** 지금 빠져 있는 삶의 상태와 시작한 날 */
  readonly states = new Map<LifeStateId, number>();
  readonly stateLog: Array<{ dayIndex: number; state: LifeStateId; entered: boolean; monologue: string }> = [];
  private lonelyDays = 0;
  private weekEarned = 0;
  /** 집에 보탠 돈 누적 */
  contributed = 0;
  /**
   * 집이 싫은 정도 0~1 (family/Household.aversion()이 채운다).
   * 높으면 저녁에 밖에서 버티고, 통금을 어기고, 집에 늦게 들어간다.
   */
  homeAversion = 0;
  /** 오늘 밖에서 놀기 좋은 정도 0~1 (날씨). 비·폭염·미세먼지면 운동장 대신 실내로 */
  outdoor = 1;
  /** 바깥 사정으로 학교에 못 가는 이유 (출석정지 등). null이면 평소대로 */
  externalAbsence: string | null = null;
  /** 관계 시스템 연결: 실제 친구 관계로 계산한 소속감 (없으면 성격으로 추정) */
  socialBelonging?: () => number;
  /** 특성 효과 합 (생성 때 한 번 계산) */
  readonly traitFx: ReturnType<typeof traitEffects>;
  private pursuedToday = new Set<string>();
  /** 목표의 변화 기록 (포기, 전환) */
  readonly goalLog: Array<{ dayIndex: number; text: string }> = [];
  private calmDays = 0;
  private stressSum = 0;
  private stressDays = 0;
  /** 하루 끝(잠들기 직전) 스트레스의 평균 */
  get avgStress() {
    return this.stressDays ? this.stressSum / this.stressDays : this.ch.body.stress;
  }
  private curDay = 0;

  constructor(
    readonly profile: NpcProfile,
    startDate: GameDate,
    private readonly rng: Random,
  ) {
    this.traitFx = traitEffects(profile.traits);
    this.clock = new GameClock({ startDate, startMinute: H(7) });
    this.body = new BodySystem(profile.ch).attach(this.clock);
    new CharacterSystem(profile.ch).attach(this.clock);
    this.money = profile.allowanceWeekly;
    this.body.events.on('body:collapsed', () => this.collapses++);
  }

  get ch() {
    return this.profile.ch;
  }
  get p() {
    return this.profile.personality;
  }
  get att() {
    return this.profile.attitudes;
  }
  private activeStates(): LifeStateDef[] {
    return LIFE_STATES.filter((d) => this.states.has(d.id));
  }

  /** 오늘 0시(절대 분) */
  private dayStart(): number {
    return this.clock.now - this.clock.minuteOfDay;
  }

  /** 오늘 0시 기준 현재 시각 — 자정을 넘겨도 계속 증가 */
  private tod(base: number): number {
    return this.clock.now - base;
  }

  private record(base: number, start: number, action: string, place: Place, note?: string) {
    const entry = { dayIndex: this.curDay, start, end: this.tod(base), action, place, note };
    this.timeline.push(entry);
    this.minutesByAction.set(action, (this.minutesByAction.get(action) ?? 0) + (entry.end - entry.start));
    return entry;
  }

  private eat(meal: MealKind) {
    this.body.eat(meal);
  }

  /** 소속감 0~1 — 관계 시스템이 붙으면 실제 친구 수와 관계의 깊이로 바뀐다 */
  belonging(): number {
    // 관계 시스템이 붙어 있으면 실제 친구 수로 (social/SocialGraph.belonging)
    if (this.socialBelonging) return Math.max(0.05, this.socialBelonging());
    return Math.max(0.05, Math.min(1, 0.15 + this.p.extraversion * 0.45 + this.p.agreeableness * 0.3 - this.att.inferiority * 0.25));
  }

  /** 외로움 바닥선: 어울릴 사람이 없으면 혼자 하는 걸로는 이 아래로 안 내려간다 */
  lonelinessFloor(): number {
    return (1 - this.belonging()) * 75;
  }

  /** 생활 구조가 만드는 압박 바닥선 */
  pressureFloor(schoolDay: boolean): number {
    const pr = this.profile;
    let f = 10 + pr.parentExpectation * 25 + pr.academyDays.length * 3 + pr.jobDays.length * 2 + (this.p.neuroticism - 0.5) * 20;
    if (this.ch.origin === 'poor') f += 8;
    f += pr.need * 15; // 생활비 걱정
    for (const g of pr.lifeGoals) {
      if (g.motive === 'fear') f += 9 * g.weight; // 무서워서 하는 목표는 늘 짓누른다
      else if (g.motive === 'recognition' || g.motive === 'protect') f += 4 * g.weight;
    }
    if (this.money < 5000) f += 6; // 돈 걱정
    f += this.att.inferiority * 8; // 남과 비교하는 마음
    return Math.max(0, Math.min(70, schoolDay ? f : f * 0.6));
  }

  private bedtimeTarget(schoolTomorrow: boolean): number {
    const shift = (this.p.impulsivity - this.p.conscientiousness) * 150;
    // 한국 고등학생 평균 취침은 자정 넘어서. 성실하면 이르고 충동적이면 늦다
    return H(24, 10) + shift + (schoolTomorrow ? 0 : 75);
  }

  /** 마지막으로 있던 장소 — 장소가 바뀌면 이동 시간이 든다 */
  private place: Place = '집';
  static readonly TRAVEL_MIN = 20;

  private moveTo(place: Place) {
    if (place === this.place) return;
    this.clock.advance(NpcLife.TRAVEL_MIN, 'travel');
    this.place = place;
  }

  private doAction(a: ActionDef, base: number, note?: string) {
    this.moveTo(a.place);
    const start = this.tod(base);
    this.money -= a.cost;
    if (a.cost < 0) this.weekEarned -= a.cost;
    const cond = this.body.condition();
    this.clock.advance(a.minutes, 'action');
    if (a.relieves.stress) this.body.applyStress(-a.relieves.stress);
    // 진짜 사람을 만나는 행동만 외로움 바닥선 아래로 풀어준다. 폰·게임은 잠깐 버티게 해줄 뿐
    // 어울릴 친구가 적으면 사람 만나는 행동도 덜 채워진다
    const relief = (a.relieves.loneliness ?? 0) * (a.withFriends ? 0.3 + this.belonging() : 1);
    const lonelyFloor = a.withFriends ? 0 : Math.min(this.needs.loneliness, this.lonelinessFloor());
    this.needs.loneliness = Math.max(lonelyFloor, clamp(this.needs.loneliness - relief));
    this.needs.boredom = clamp(this.needs.boredom - (a.relieves.boredom ?? 0));
    for (const [k, g] of a.train ?? []) trainStat(this.ch, k, g, cond, this.clock.dayIndex);
    if (a.exercise) this.body.exercise(a.exercise[0], a.exercise[1]);
    for (const g of this.profile.lifeGoals) {
      if (!(a.goals[g.goal] ?? 0)) continue;
      this.pursuedToday.add(g.goal);
      if (g.motive === 'joy') this.body.applyStress(-2 * g.weight); // 좋아하는 걸 하면 풀린다
      if (g.secret) this.body.applyStress(1.5); // 몰래 하는 죄책감
    }
    this.record(base, start, a.label, a.place, note);
  }

  /** 집·학교 밖에서 보낸 하루 (가출·소년원·시설). 시계만 하루 넘긴다 */
  awayDay(reason: string): void {
    const base = this.dayStart();
    this.curDay = this.clock.dayIndex;
    const s0 = this.tod(base);
    this.clock.advanceTo(H(23), 'action');
    this.record(base, s0, `부재(${reason})`, '집');
    this.clock.sleepUntil(H(7));
  }

  /** NPC의 하루: 하루 흐름의 모든 갈림길에서 AI가 고른다 */
  liveDay(): DayReport {
    const flow = this.dayFlow(false);
    let r = flow.next();
    while (!r.done) r = flow.next(r.value.auto);
    return r.value;
  }

  /**
   * 하루의 흐름. 갈림길마다 멈춰서(yield) 고르기를 기다린다.
   * NPC는 liveDay()가 AI 답(auto)을 넣고, 주인공은 화면이 플레이어의 답을 넣는다 — 규칙은 똑같다.
   */
  *dayFlow(player: boolean): Generator<DayDecision, DayReport, DayAnswer> {
    const base = this.dayStart();
    this.curDay = this.clock.dayIndex;
    const date = this.clock.date;
    const wd = weekdayOf(date);
    const school = isSchoolDay(date);
    const before = this.timeline.length;
    let late = false;
    let skippedAcademy = false;

    if (wd === 1) this.money += this.profile.allowanceWeekly;
    if (wd === 0 && this.weekEarned > 0) {
      // 일요일: 번 돈의 일부를 생활비로 보탠다
      const give = Math.round(this.weekEarned * this.profile.need * 0.7);
      this.money -= give;
      this.contributed += give;
      this.weekEarned = 0;
    }
    this.pursuedToday = new Set();
    this.body.pressureFloor = this.pressureFloor(school);
    this.needs.loneliness = clamp(this.needs.loneliness + 6 + 8 * this.p.extraversion + 8 * (1 - this.belonging()));
    this.needs.boredom = clamp(this.needs.boredom + 12 * (0.4 + this.p.impulsivity));

    let hadDinner = false;
    const stateCtx = () => this.stateContext();
    const refusal = this.activeStates().reduce((m, d) => Math.max(m, d.schoolRefusal?.(stateCtx()) ?? 0), 0);
    let absent = false;
    const schoolAnswer: DayAnswer = school && !this.externalAbsence
      ? yield { kind: 'school', auto: refusal > 0 && this.rng.chance(refusal) ? 'skip' : 'attend', refusal }
      : 'attend';
    if (school && this.externalAbsence) {
      // 출석정지·아픔 등 바깥 사정으로 학교에 못 간다
      absent = true;
      this.absences++;
      const s0 = this.tod(base);
      this.clock.advanceTo(H(16, 30), 'action');
      this.record(base, s0, `결석(${this.externalAbsence})`, '집');
      this.eat('집밥');
    } else if (school && schoolAnswer === 'skip' && player) {
      // 주인공의 땡땡이: 학교 대신 하루가 통째로 비는 대신, 결석이 기록된다
      absent = true;
      this.absences++;
      this.record(this.dayStart(), this.tod(base), '결석(땡땡이)', '집');
    } else if (school && schoolAnswer === 'skip') {
      absent = true;
      this.absences++;
      const s0 = this.tod(base);
      this.clock.advanceTo(H(16, 30), 'action');
      this.record(base, s0, '결석(등교 거부)', '집');
      this.eat('집밥');
    } else if (school) {
      if (this.rng.chance(0.85 - (1 - this.p.conscientiousness) * 0.4)) this.eat('집밥');
      this.clock.advance(30, 'action');
      const s0 = this.tod(base);
      this.clock.advance(35, 'travel');
      this.record(base, s0, '등교', '학교');
      this.place = '학교';
      const arrival = judgeArrival(this.clock.minuteOfDay);
      if (arrival.status !== 'onTime') {
        late = true;
        this.lateCount++;
      }
      const s1 = this.tod(base);
      trainStat(this.ch, 'study', 0.6 * (0.5 + this.p.conscientiousness * 0.7), this.body.condition(), this.clock.dayIndex);
      this.clock.advanceTo(H(12, 30), 'auto');
      this.eat('급식');
      this.clock.advanceTo(H(16, 30), 'auto');
      this.record(base, s1, '수업', '학교', late ? '지각' : undefined);
      // 학교에 가도 어울릴 친구가 없으면 덜 풀린다 (관계 시스템이 붙으면 실제 친구 수로 바뀐다)
      this.needs.loneliness = Math.max(this.lonelinessFloor(), clamp(this.needs.loneliness - 30 * this.belonging()));
      // 학교 자체의 압박 + 부모 기대의 압박
      this.body.applyStress(6 * (0.5 + this.p.neuroticism) + this.profile.parentExpectation * 5);
      this.needs.boredom = clamp(this.needs.boredom + 8);
      this.body.exercise('walk', 30);
    } else {
      this.eat('집밥');
    }

    const nextDate = addDays(date, 1);
    const schoolTomorrow = isSchoolDay(nextDate);
    const bed = this.bedtimeTarget(schoolTomorrow);
    let lunchDone = school;
    const doneToday: Record<string, number> = {};

    for (let guard = 0; guard < 20; guard++) {
      const now = this.tod(base);
      if (!lunchDone && now >= H(12, 30)) {
        this.eat('집밥');
        lunchDone = true;
      }
      const homeTrip = this.place === '집' ? 0 : NpcLife.TRAVEL_MIN;
      if (!player && (now >= bed || this.body.minutesUntilCollapse() < 45 + homeTrip)) break;
      if (player && (now >= H(26) || this.body.minutesUntilCollapse() < 15 + homeTrip)) break; // 새벽 2시·쓰러지기 직전이면 잠든다

      // 정해진 일정: 학원·알바. 충동적이고 자제력 낮으면 학원을 땡땡이친다
      const commitment = this.commitmentAt(now, wd, school);
      if (commitment) {
        const blocked = this.activeStates().some((d) => d.blocks?.(commitment));
        const autoSkip = blocked || (commitment.id === 'academy' && this.rng.chance(this.p.impulsivity * 0.3 * (1 - selfControl(this.p)) + this.att.rebellion * 0.12));
        const ans: DayAnswer = blocked ? 'skip' : yield { kind: 'commitment', action: commitment, auto: autoSkip ? 'skip' : 'go' };
        if (ans === 'skip') {
          skippedAcademy = true;
          this.academySkips++;
        } else {
          this.doAction(commitment, base);
          if (!hadDinner && commitment.meal) {
            this.eat(commitment.meal);
            hadDinner = true;
          }
          continue;
        }
      }

      const options = ACTIONS.filter((a) => {
        if (a.requires) return false; // 학원·알바는 일정으로만
        if (this.activeStates().some((d) => d.blocks?.(a))) return false;
        if (a.withFriends && (player ? this.belonging() < 0.15 : !this.rng.chance(0.15 + this.belonging() * 0.85))) return false; // 부를 친구가 없음
        if (a.cost > this.money) return false;
        if (now < a.open[0] || now + a.minutes > a.open[1]) return false;
        const travel = a.place === this.place ? 0 : NpcLife.TRAVEL_MIN;
        if (!player && now + travel + a.minutes > bed + 60) return false;
        // 버티지 못할 행동은 안 고른다 (가는 길 + 하는 시간 + 집에 오는 길까지)
        const backHome = a.place === '집' ? 0 : NpcLife.TRAVEL_MIN;
        if (travel + a.minutes + backHome > this.body.minutesUntilCollapse() - 20) return false;
        // 통금: 학교 가는 날 밤 10시, 쉬는 날 11시 반 이후엔 대부분 집. 아주 충동적인 애만 PC방에 남는다
        const curfew = schoolTomorrow ? H(22) : H(23, 30);
        const rebel = this.att.rebellion > 0.7 || (a.id === 'pcbang' && this.p.impulsivity > 0.6) || this.homeAversion > 0.6;
        if (!player && a.place !== '집' && now + travel + a.minutes > curfew + 30 && !rebel) return false; // 주인공은 통금을 어길 수 있다
        if (a.id === 'phone' && now < H(21)) return false;
        return true;
      });
      if (!options.length) break; // 할 게 없으면 잔다
      const auto = chooseAction(options, {
            p: this.p,
            goals: this.profile.goals,
            stress: this.ch.body.stress,
            loneliness: this.needs.loneliness,
            boredom: this.needs.boredom,
            drowsiness: this.body.drowsiness,
            doneToday,
            intrinsicGoals: this.profile.intrinsicGoals,
            mods: (a) =>
              this.activeStates().reduce((sum, d) => sum + d.scoreMod(a), 0) +
              (this.traitFx.actions[a.id] ?? 0) +
              (a.place === '운동장' ? -(1 - this.outdoor) * 0.9 : a.place === 'PC방' || a.place === '노래방' || a.place === '카페' ? (1 - this.outdoor) * 0.12 : 0) +
              // 필요: 형편이 어려우면 목표가 아니어도 돈 쓰는 행동을 꺼리고 공짜 행동을 고른다
              (a.cost > 0 ? -this.profile.need * (a.cost / 5000) * 0.6 : 0) +
              // 집이 무서우면 저녁에 집에 있는 행동을 피한다
              (now >= H(17) ? (a.place === '집' ? -this.homeAversion * 0.5 : this.homeAversion * 0.3) : 0),
          }, this.rng).action;
      const ans: DayAnswer = yield { kind: 'free', now, bed, options, auto: auto.id };
      if (ans === 'sleep') break;
      const pick = options.find((o) => o.id === ans) ?? auto;
      this.doAction(pick, base);
      doneToday[pick.id] = (doneToday[pick.id] ?? 0) + 1;

      if (!hadDinner && this.tod(base) >= H(18, 30)) {
        this.eat(pick.meal ?? '집밥');
        hadDinner = true;
      }
      if (this.tod(base) >= H(22) && this.rng.chance(this.p.impulsivity * 0.15)) this.eat('야식');
    }
    if (!hadDinner) this.eat('집밥');
    this.moveTo('집');
    this.stressSum += this.ch.body.stress;
    this.stressDays++;
    // 안 하면 불안한 목표: 오늘 손도 못 댔으면 밤에 불안이 쌓인다
    for (const g of this.profile.lifeGoals) {
      if (this.pursuedToday.has(g.goal)) continue;
      if (g.motive === 'fear') this.body.applyStress(4 * g.weight);
      else if (g.motive === 'proveSelf') this.body.applyStress(2 * g.weight);
    }
    this.updateStates();

    // 잠
    let wake = schoolTomorrow ? H(7) : H(9) + Math.round(this.p.impulsivity * 120);
    if (schoolTomorrow && this.ch.body.sleepDebtMin > 240 && this.rng.chance(0.35 * (1.2 - this.p.conscientiousness))) {
      wake += 25; // 알람을 못 들음
    }
    const sleptMin = this.clock.sleepUntil(wake);
    const sleepStart = this.tod(base) - sleptMin;
    this.timeline.push({ dayIndex: this.curDay, start: sleepStart, end: sleepStart + sleptMin, action: '잠', place: '집' });

    return { date, entries: this.timeline.slice(before), late, sleptMin, skippedAcademy };
  }

  private stateContext() {
    return {
      p: this.p,
      att: this.att,
      goals: this.profile.goals,
      stress: this.ch.body.stress,
      highStressDays: this.ch.body.highStressDays,
      lonelyDays: this.lonelyDays,
      calmDays: this.calmDays,
      daysInState: 0,
      rng: this.rng,
    };
  }

  /** 하루 끝: 외로움·평온이 이어진 일수를 세고, 상태에 빠지거나 나온다 */
  private updateStates() {
    // 하루 괜찮다고 고립이 끝나진 않는다: 외로운 날은 +1, 괜찮은 날은 -1
    this.lonelyDays = this.needs.loneliness >= 50 ? this.lonelyDays + 1 : Math.max(0, this.lonelyDays - 1);
    this.calmDays = this.ch.body.stress < 35 ? this.calmDays + 1 : 0;
    for (const def of LIFE_STATES) {
      const since = this.states.get(def.id);
      const ctx = { ...this.stateContext(), daysInState: since === undefined ? 0 : this.curDay - since };
      if (since === undefined && def.enter(ctx)) {
        this.states.set(def.id, this.curDay);
        this.stateLog.push({ dayIndex: this.curDay, state: def.id, entered: true, monologue: def.monologueIn });
        if (def.id === 'burnout') this.onBurnout();
      } else if (since !== undefined && def.exit(ctx)) {
        this.states.delete(def.id);
        this.stateLog.push({ dayIndex: this.curDay, state: def.id, entered: false, monologue: def.monologueOut });
      }
    }
  }

  /** 번아웃: 부모가 정해준 목표가 꺾이고, 숨겨둔 꿈이 고개를 든다 */
  private onBurnout() {
    const imposed = this.profile.lifeGoals.find((g) => g.source === 'parents');
    const dream = this.profile.lifeGoals.find((g) => g.secret);
    if (imposed && this.rng.chance(0.5)) {
      imposed.weight = Math.max(0.2, imposed.weight - 0.3);
      this.goalLog.push({ dayIndex: this.curDay, text: '부모님이 정해준 목표에 지쳐서 손을 놓기 시작했다' });
      if (dream) {
        dream.weight = Math.min(1, dream.weight + 0.2);
        this.goalLog.push({ dayIndex: this.curDay, text: '숨겨둔 꿈이 더 크게 느껴진다' });
      }
      const split = splitGoals(this.profile.lifeGoals);
      this.profile.goals = split.disciplined;
      this.profile.intrinsicGoals = split.intrinsic;
    }
  }

  private commitmentAt(now: number, wd: number, school: boolean): ActionDef | null {
    if (school && this.profile.academyDays.includes(wd) && now >= H(16, 30) && now < H(17, 30) && !this.didToday('학원')) {
      return ACTIONS.find((a) => a.id === 'academy') ?? null;
    }
    if (this.profile.jobDays.includes(wd) && now >= H(16, 30) && now < H(19) && !this.didToday('편의점 알바')) {
      return ACTIONS.find((a) => a.id === 'partTime') ?? null;
    }
    return null;
  }

  private didToday(label: string): boolean {
    const d = this.curDay;
    return this.timeline.some((e) => e.dayIndex === d && e.action === label);
  }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

