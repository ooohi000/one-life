import { powerOf } from '../body/composition';
import { Random } from '../core/Random';
import { Household, type ParentRole, ProtectionCase, Runaway, type RunawayInput, sampleParent } from '../family';
import {
  appeal, type CaseResult, COUNSEL, type Counsel, CRIMES, crime, crimeDay, decide, discover, type Fighter, gatherEvidence, hireCounsel,
  type Incident, type Measure, PLACES, type PlaceId, processCase, proven, resolveFight, settlementAmount, type StudentRole, threaten,
} from '../justice';
import { josa, MemoryBank, World } from '../memory';
import { createNpcProfile, type DayAnswer, type DayDecision, type DayReport, NpcLife, type NpcProfile } from '../npc';
import type { TalkChoice } from '../dialogue';
import type { Line } from '../dialogue/topics';
import { BEST_FRIEND, findGroups, type Group, groupOf, RumorMill, SocialGraph } from '../social';
import { addDays, type GameDate, weekdayOf } from '../time/calendar';
import { isSchoolDay } from '../time/school';
import { traitEffects } from '../traits';
import { ConvenienceShift, type Job, type KnownVisitor, newJob, payday, resolvePayday, type ShiftReport } from '../work';
import { MIN_WAGE } from '../npc/actions';
import { City, describeWeather, type Weather, WeatherSystem } from '../env';
import { CarryState } from '../carry';

/**
 * 하나의 세계. 매일 이 순서로 돈다:
 *   아침 집(부모와 대화·폭언·폭력) → 각자의 하루(NpcLife: 등교·학원·PC방·알바…) →
 *   같은 시간 같은 곳에 있던 사람끼리 관계가 변함 → 학교 안 괴롭힘·싸움·입막음 →
 *   미뤄진 일 처리(신고·학폭위·경찰) → 범죄 → 소문 → 밤
 * 출석정지·소년원·가출이면 실제로 학교에서 빠지고, 그 공백이 친구 관계에 남는다.
 */
export type EventKind = 'city' | 'weather' | 'home' | 'school' | 'fight' | 'threat' | 'committee' | 'police' | 'protection' | 'runaway' | 'rumor' | 'group' | 'return' | 'testimony';

export interface WorldEvent {
  day: number;
  who: string;
  kind: EventKind;
  text: string;
  /** 1 사소 ~ 5 큰일 (요약에 쓰임) */
  weight: number;
}

export interface Student {
  id: string;
  name: string;
  prof: NpcProfile;
  fx: ReturnType<typeof traitEffects>;
  life: NpcLife;
  house: Household;
  prot: ProtectionCase;
  mem: MemoryBank;
  run: Runaway;
  cls: number;
  area: number;
  seat: string[];
  /** 학교·집을 떠나 있는 이유와 복귀일 */
  away: { reason: string; until: number; facility: boolean } | null;
  expelled: boolean;
  transferred: boolean;
  cases: CaseResult[];
  measures: Measure[];
  bruiseDays: number;
  /** 이 애가 괴롭히고 입막음한 기록 (나중에 증언으로 돌아온다) */
  victims: Array<{ id: string; day: number; threatened: boolean; evidence: boolean }>;
  story: WorldEvent[];
}

interface Pending {
  day: number;
  run: () => void;
}

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const AREAS = 6;
/** 동네가 없는(한 곳에 모이는) 장소 */
const SHARED_PLACES = new Set(['학원가', '번화가']);
/** 같이 있으면 말을 섞을 확률: [모르는 사이, 아는 사이] */
const MINGLE: Record<string, [number, number]> = {
  PC방: [0.04, 0.5], 운동장: [0.25, 0.7], 헬스장: [0.06, 0.5], 노래방: [0.005, 0.7], 카페: [0.03, 0.6],
  편의점: [0.03, 0.3], 독서실: [0.02, 0.3], 연습실: [0.15, 0.6], 학원가: [0.02, 0.5],
};

export interface WorldOptions {
  students: number;
  seed: number;
  start: GameDate;
  /** 주인공이 될 학생 번호 (s0이면 0) */
  protagonist?: number;
}

export interface PromptOption {
  id: string;
  label: string;
}
export interface Prompt {
  id: string;
  day: number;
  text: string;
  options: PromptOption[];
  resolve: (optionId: string) => void;
}

/** 저장에 남는 주인공의 선택 하나 */
export type Command =
  | { t: 'choose'; day: number; answer: DayAnswer }
  | { t: 'prompt'; day: number; id: string; option: string }
  | { t: 'talk'; day: number; npc: string }
  | { t: 'parent'; day: number; idx: number; choice: TalkChoice }
  /** 직접 한 근무는 결과만 남긴다 (근무 안의 손놀림까지 저장할 필요는 없다) */
  | { t: 'shift'; day: number; report: ShiftReport }
  | { t: 'umbrella'; day: number; take: boolean };

export interface SaveFile {
  version: 1;
  opts: WorldOptions;
  day: number;
  commands: Command[];
}

export class WorldSim {
  readonly world = new World();
  readonly graph = new SocialGraph();
  readonly rumors: RumorMill;
  readonly students = new Map<string, Student>();
  readonly log: WorldEvent[] = [];
  groups: Group[] = [];
  day = 0;
  private readonly rng: Random;
  private pending: Pending[] = [];
  private academyCrew = new Map<string, Set<string>>();
  private visits = new Map<string, Map<string, number>>();

  // ───────── 주인공 ─────────
  /** 플레이어가 조종하는 학생 (없으면 전원 NPC) */
  readonly player: Student | null = null;
  /** 지금 주인공이 답해야 하는 하루의 갈림길 */
  playerDecision: DayDecision | null = null;
  /** 주인공에게 온 질문 (괴롭힘을 봤다, 시비가 걸렸다…) */
  prompts: Prompt[] = [];
  /** 주인공이 한 모든 선택 — 저장 파일의 본체 (같은 시드 + 같은 선택 = 같은 세계) */
  readonly commands: Command[] = [];
  private flow: Generator<DayDecision, DayReport, DayAnswer> | null = null;
  private replaying = false;
  private talkedToday = new Set<string>();
  /** 주인공의 알바 */
  playerJob: Job | null = null;
  /** 날씨·계절 */
  readonly weather: WeatherSystem;
  /** 시간 따라 변하는 동네 */
  readonly city: City;
  /** 오늘 날씨 */
  today!: Weather;
  /** 주인공이 몸에 지닌 것 (아침에 챙긴 것) */
  playerCarry: CarryState | null = null;

  constructor(readonly opts: WorldOptions) {
    this.rng = new Random(opts.seed);
    this.rumors = new RumorMill(this.graph);
    this.weather = new WeatherSystem(opts.seed);
    this.city = new City(new Random(opts.seed * 101 + 3), AREAS);
    const rng = this.rng;
    for (let i = 0; i < opts.students; i++) {
      const id = `s${i}`;
      const prof = createNpcProfile(id, rng);
      // 같은 학년에 같은 이름은 없게 (헷갈리니까 — 현실엔 있지만)
      let full = rng.pick(SURNAMES) + prof.ch.name;
      for (let k = 0; [...this.students.values()].some((x) => x.name === full) && k < 30; k++) full = rng.pick(SURNAMES) + prof.ch.name;
      prof.ch.name = full;
      const fx = traitEffects(prof.traits);
      this.world.add({ id, name: prof.ch.name, cue: '', manners: 0 });
      const slots: ParentRole[] = prof.family.parents === 'both' ? ['mom', 'dad'] : prof.family.parents === 'single' ? [rng.chance(0.75) ? 'mom' : 'dad'] : ['grandma'];
      const house = new Household(id, slots.map((role, j) => {
        const s = sampleParent(rng);
        const m = new MemoryBank(`${id}p${j}`);
        m.meet(id, 0, '집', '가족', 1, 100);
        return { id: `${id}p${j}`, role, type: s.type, traits: s.traits, memory: m };
      }), prof.need);
      const life = new NpcLife(prof, opts.start, new Random(opts.seed * 1000 + i));
      const st: Student = {
        id, name: prof.ch.name, prof, fx, life, house, prot: new ProtectionCase(house), mem: new MemoryBank(id), run: new Runaway(),
        cls: Math.floor(i / 30), area: Math.floor(rng.next() * AREAS), seat: [], away: null, expelled: false, transferred: false,
        cases: [], measures: [], bruiseDays: 0, victims: [], story: [],
      };
      this.students.set(id, st);
      life.socialBelonging = () => this.graph.belonging(id);
      this.graph.add({ id, name: st.name, p: prof.personality, traits: prof.traits, hangouts: [], cls: st.cls, power: Math.min(100, prof.ch.stats.fighting * 0.6 + powerOf(prof.ch) * 0.4 + fx.fightPower) });
    }
    if (opts.protagonist !== undefined) (this as { player: Student | null }).player = this.students.get(`s${opts.protagonist}`) ?? null;
    if (this.player?.prof.jobDays.length) this.playerJob = newJob(new Random(opts.seed * 13 + 1));
    if (this.player) {
      this.playerCarry = new CarryState(this.player.id, 2);
      for (const i of ['backpack', 'phone', 'wallet', 'transitCard', 'keys', 'textbooks']) this.playerCarry.take(i);
    }
    this.assignSeats();
    // 같은 학원 같은 반 (12명 안팎, 반이 섞인다)
    const goers = [...this.students.values()].filter((s) => s.prof.academyDays.length).map((s) => s.id);
    for (let i = 0; i < goers.length; i += 12) {
      const crew = new Set(goers.slice(i, i + 12));
      for (const x of crew) this.academyCrew.set(x, crew);
    }
  }

  get date(): GameDate {
    return addDays(this.opts.start, this.day);
  }

  student(id: string): Student {
    return this.students.get(id)!;
  }

  /** 하루 (주인공도 AI가 대신 산다) */
  step(): void {
    this.beginDay();
    while (this.playerDecision) this.choose(this.playerDecision.auto);
    this.endDay();
  }

  /**
   * 하루의 앞부분: 미뤄진 일 → 아침 집 → 학교 사건(주인공이 끼면 질문) → NPC들의 하루 → 주인공의 하루 시작.
   * 이후 주인공은 playerDecision에 choose()로 답하고, 하루가 끝나면 endDay().
   */
  beginDay(): void {
    const d = this.day;
    const school = isSchoolDay(this.date);
    const rng = this.rng;

    // 날씨와 동네
    this.today = this.weather.today(this.date);
    const cityBefore = this.city.log.length;
    this.city.step(d);
    for (const e of this.city.log.slice(cityBefore)) this.log.push({ day: d, who: '', kind: 'city', text: e.text, weight: e.text.includes('입주') || e.text.includes('재개발') ? 3 : 1 });
    for (const n of this.today.notes) this.log.push({ day: d, who: '', kind: 'weather', text: n, weight: 1 });
    const harsh = this.today.high >= 33 || this.today.low <= -10;

    // 0) 미뤄진 일 (신고가 들어간 날, 복귀일)
    const due = this.pending.filter((p) => p.day <= d);
    this.pending = this.pending.filter((p) => p.day > d);
    for (const p of due) p.run();
    for (const s of this.students.values()) {
      if (s.away && s.away.until <= d) {
        this.emit(s, 'return', `${s.away.reason}이 끝나고 돌아왔다. 반 분위기가 어색했다.`, 2);
        s.away = null;
      }
    }

    // 1) 아침: 집 (주인공의 집은 주인공이 직접 말을 건다)
    for (const s of this.students.values()) {
      if (s.transferred) continue;
      if (s.run.active) {
        s.run.step(d, this.runInput(s, null), rng);
        if (!s.run.active) this.emit(s, 'return', s.run.log.at(-1)!.text, 3);
        continue;
      }
      if (s.away?.facility || s.house.childAway || s === this.player) continue;
      const out = s.house.simulateDay(
        { rebellion: s.prof.attitudes.rebellion, neuroticism: s.prof.personality.neuroticism, agreeableness: s.prof.personality.agreeableness, stress: s.life.ch.body.stress },
        { day: d, rng, world: this.world, child: s.mem, observed: { darkCircles: s.life.ch.body.sleepDebtMin > 180 } },
      );
      s.life.body.applyStress(out.childStress * s.fx.stress * 0.5);
      const hit = out.incidents.includes('hit');
      if (hit) {
        s.bruiseDays = 7 + Math.floor(rng.next() * 4);
        s.prot.afterIncident(d, true, rng);
        this.emit(s, 'home', '집에서 일이 있었다. 팔에 멍이 들었다.', 2);
      } else if (out.parentsFought && rng.chance(0.1)) this.emit(s, 'home', '밤새 부모님이 싸웠다.', 1);
      const x = this.runInput(s, hit ? 'hit' : out.incidents.length ? 'yelled' : null);
      if (rng.chance(Runaway.dailyRisk(x) * 0.6)) {
        s.run.leave(d, s.life.money, x, rng, hit ? '맞고 나서' : '숨이 막혀서');
        this.emit(s, 'runaway', '가출. ' + s.run.log.at(-1)!.text, 3);
      }
      if (s.bruiseDays > 0) s.bruiseDays--;
    }

    // 2) 학교 안: 학대 징후, 괴롭힘 (주인공이 피해자·목격자면 질문으로)
    if (school) {
      for (const s of this.students.values()) if (this.atSchool(s)) this.noticeAbuse(s, d);
      this.bullying(d);
    }

    // 3) 각자의 하루
    for (const s of this.students.values()) {
      if (s.transferred || s === this.player) continue;
      if (s.run.active) { s.life.awayDay('가출'); continue; }
      if (s.away?.facility) { s.life.awayDay(s.away.reason); continue; }
      s.life.homeAversion = s.house.aversion();
      s.life.externalAbsence = s.expelled ? '퇴학' : s.away ? s.away.reason : null;
      s.life.outdoor = this.today.outdoor;
      if (harsh) s.life.body.applyStress(2);
      s.life.liveDay();
    }
    // 주인공
    const pl = this.player;
    if (pl && !pl.transferred) {
      if (pl.run.active) pl.life.awayDay('가출');
      else if (pl.away?.facility) pl.life.awayDay(pl.away.reason);
      else {
        pl.life.homeAversion = pl.house.aversion();
        pl.life.outdoor = this.today.outdoor;
        pl.life.externalAbsence = pl.expelled ? '퇴학' : pl.away ? pl.away.reason : null;
        this.flow = pl.life.dayFlow(true);
        this.advanceFlow(undefined);
      }
    }
  }

  /** 하루의 뒷부분: 만남 → 범죄 → 소문 → 다음 날 */
  endDay(): void {
    const d = this.day;
    // 답 안 한 질문은 기본값(참는다·모른 척)으로
    for (const q of [...this.prompts]) this.answer(q.id, q.options[q.options.length - 1]!.id);
    this.playerWeatherDay(d);
    this.encounters(d, isSchoolDay(this.date));
    this.graph.decay(d);
    this.crimes(d);
    this.rumors.spread(d, this.rng);
    if (d % 30 === 29) this.regroup(d);
    this.day++;
  }

  run(days: number): void {
    for (let i = 0; i < days; i++) this.step();
  }

  // ───────── 주인공 조작 ─────────

  /** 하루의 갈림길에 답한다 ('attend'·'skip'·'go'·'sleep'·행동 id) */
  choose(answer: DayAnswer): void {
    if (!this.flow || !this.playerDecision) throw new Error('지금은 고를 게 없다');
    this.record({ t: 'choose', day: this.day, answer });
    // 학교를 안 가면 학교에서 생길 일은 주인공 없이 흘러간다
    if (this.playerDecision.kind === 'school' && answer === 'skip') for (const q of [...this.prompts]) this.answer(q.id, q.options[q.options.length - 1]!.id);
    // 알바 무단결근: 사장님 평가가 떨어지고 경고가 쌓인다
    const dcs = this.playerDecision;
    if (dcs.kind === 'commitment' && dcs.action.id === 'partTime' && answer === 'skip' && this.playerJob && !this.playerJob.fired) {
      const job = this.playerJob;
      job.standing -= 20;
      job.warnings++;
      if (job.warnings >= 3) job.fired = true;
      this.emit(this.player!, 'school', job.fired ? '알바를 또 빠졌다. 사장님: "내일부터 나오지 마."' : '알바를 말없이 빠졌다. 사장님한테 부재중 전화가 세 통 와 있다.', job.fired ? 4 : 2);
    }
    this.advanceFlow(answer);
  }

  private advanceFlow(answer: DayAnswer | undefined) {
    const r = answer === undefined ? this.flow!.next() : this.flow!.next(answer);
    if (r.done) {
      this.flow = null;
      this.playerDecision = null;
    } else this.playerDecision = r.value;
  }

  /** 질문에 답한다 */
  answer(promptId: string, optionId: string): void {
    const q = this.prompts.find((x) => x.id === promptId);
    if (!q) return;
    this.prompts = this.prompts.filter((x) => x !== q);
    this.record({ t: 'prompt', day: this.day, id: promptId, option: optionId });
    q.resolve(optionId);
  }

  /** 주인공의 지금 시각(그날 0시 기준 분)과 장소 */
  playerNow(): { minute: number; place: string } {
    const pl = this.player!;
    const last = pl.life.timeline.at(-1);
    const minute = pl.life.clock.minuteOfDay + (last && last.dayIndex < pl.life.clock.dayIndex ? 0 : 0);
    return { minute, place: last && last.dayIndex === pl.life.clock.dayIndex ? last.place : '집' };
  }

  /** 지금 주인공과 같은 곳에 있는 사람들 (NPC들의 오늘 하루는 이미 정해져 있다) */
  peopleHere(): Student[] {
    const pl = this.player;
    if (!pl) return [];
    const { minute, place } = this.playerNow();
    if (place === '집') return [];
    const out: Student[] = [];
    for (const s of this.students.values()) {
      if (s === pl || s.transferred) continue;
      const today = s.life.timeline.filter((e) => e.dayIndex === s.life.clock.dayIndex - 1 || e.dayIndex === s.life.clock.dayIndex);
      const here = today.some((e) => e.place === place && e.start <= minute && minute <= e.end + 10 && (SHARED_PLACES.has(place) || place === '학교' || s.area === pl.area));
      if (here) out.push(s);
    }
    return out;
  }

  /**
   * 같은 곳에 있는 애한테 말을 건다. 친한 정도에 따라 반응이 다르고, 친하면 들은 소문을 전해 준다.
   * 주인공도 소문을 "듣는" 사람이 된다.
   */
  talkTo(npcId: string): Line[] {
    const pl = this.player!;
    const s = this.student(npcId);
    this.record({ t: 'talk', day: this.day, npc: npcId });
    const g = this.graph;
    const rng = this.rng;
    const close = g.rel(npcId, pl.id)?.closeness ?? 0;
    const fear = g.rel(npcId, pl.id)?.fear ?? 0;
    const grudge = g.rel(npcId, pl.id)?.grudge ?? 0;
    const lines: Line[] = [];
    const say = (text: string) => lines.push({ who: npcId, text });
    const key = `${this.day}:${npcId}`;
    if (this.talkedToday.has(key)) {
      say(rng.pick(['아까 얘기했잖아 ㅋㅋ', '(폰을 보고 있다.)', '응?']));
      return lines;
    }
    this.talkedToday.add(key);
    if (grudge > 40) say(rng.pick(['…뭐.', '말 걸지 마.', '(못 들은 척한다.)']));
    else if (fear > 40) say(rng.pick(['어, 어… 왜?', '(눈을 피한다.)']));
    else if (close >= BEST_FRIEND) say(rng.pick(['야 왔냐 ㅋㅋ', '어디 갔다 왔냐, 연락도 안 되고.', '오늘 뭐 함?']));
    else if (close >= 40) say(rng.pick(['어 안녕.', '오, 너도 여기 오냐?', '뭐 해?']));
    else if (close >= 15) say(rng.pick(['어… 안녕.', '아, 같은 반…이지?']));
    else say(rng.pick(['(누구지? 하는 표정이다.)', '…네?', '어, 어. 안녕.']));
    // 친하면 아는 소문을 하나 꺼낸다
    if (close >= 30 && grudge <= 40) {
      for (const [rid, r] of this.rumors.rumors) {
        if (r.about === pl.id || this.rumors.knows(rid, pl.id) || !this.rumors.knows(rid, npcId)) continue;
        if (!rng.chance(0.6)) continue;
        say(`근데 그거 들었냐? ${this.rumors.versionText(rid, npcId)}`);
        this.rumors.tell(rid, npcId, pl.id, this.day);
        break;
      }
    }
    if (grudge <= 40) g.hangOut(pl.id, npcId, this.day, rng, 20);
    return lines;
  }

  /** 집에서 부모에게 말을 건다 (ParentTalk 그대로) */
  talkToParent(idx: number, choice: TalkChoice) {
    const pl = this.player!;
    this.record({ t: 'parent', day: this.day, idx, choice });
    return pl.house.talk(idx, choice, { day: this.day, rng: this.rng, world: this.world, child: pl.mem, observed: { darkCircles: pl.life.ch.body.sleepDebtMin > 180, cameHomeLate: false } });
  }

  /**
   * 알바 가는 갈림길에서 "간다"를 고르면 근무가 시작된다. 화면은 이 shift를 직접 조작하고, 끝나면 finishShift().
   * 손님으로는 이 동네 사는 같은 반·친구·일진, 친구 엄마가 섞여 온다.
   */
  startShift(screen?: { pace: number; patience: number }): ConvenienceShift | null {
    const pl = this.player;
    const dcs = this.playerDecision;
    if (!pl || !this.playerJob || this.playerJob.fired || dcs?.kind !== 'commitment' || dcs.action.id !== 'partTime') return null;
    const r = new Random(this.opts.seed * 7919 + this.day);
    const g = this.graph;
    const neighbors = [...this.students.values()].filter((s) => s !== pl && !s.transferred && (s.area === pl.area || g.mutual(pl.id, s.id)));
    const visitors: KnownVisitor[] = [];
    for (const s of neighbors.sort(() => r.next() - 0.5).slice(0, 4)) {
      const rel = g.rel(pl.id, s.id);
      const relation: KnownVisitor['relation'] = (g.rel(s.id, pl.id)?.grudge ?? 0) > 30 || s.prof.traits.includes('bully') ? 'bully' : (rel?.closeness ?? 0) >= 40 ? 'friend' : s.cls === pl.cls ? 'classmate' : 'acquaintance';
      visitors.push({ id: s.id, name: s.name, age: 16, relation });
    }
    const mom = neighbors.find((s) => s.house.parents[0]?.role === 'mom');
    if (mom && r.chance(0.5)) visitors.push({ id: `${mom.id}p0`, name: `${mom.name}네 엄마`, age: 46, relation: 'parentFriend' });
    const condition = Math.max(0.1, 1 - pl.life.body.drowsiness * 0.6 - pl.life.ch.body.stress / 250);
    const raining = ['rain', 'shower', 'monsoon', 'typhoon'].includes(this.today.sky);
    return new ConvenienceShift(this.playerJob, { id: pl.id, name: pl.name, age: 16, tact: pl.life.ch.stats.tact, streetSmart: pl.life.ch.stats.streetSmart, speech: pl.life.ch.stats.speech, condition }, r, visitors, { start: 17 * 60 + 30, end: 21 * 60 + 30, raining, ...screen });
  }

  /** 근무가 끝났다: 하루 흐름을 진행하고, 결과를 세계에 남긴다 */
  finishShift(shift: ConvenienceShift): ShiftReport {
    const report = shift.finish();
    this.record({ t: 'shift', day: this.day, report });
    this.applyShift(report);
    return report;
  }

  private applyShift(report: ShiftReport) {
    const pl = this.player!;
    const before = pl.life.money;
    this.advanceFlow('go'); // 하루 흐름: 알바 4시간 (기본급이 들어온다)
    const base = pl.life.money - before;
    pl.life.money += report.wage - base;
    pl.life.body.applyStress(report.stress - 7);
    const g = this.graph;
    for (const m of report.met) {
      if (m.visitor.relation === 'parentFriend') {
        // 친구 엄마가 봤다 → 우리 엄마 귀에 들어간다
        for (const p of pl.house.parents) p.memory.learn(pl.id, 'job', '편의점 알바', 'rumor', this.day, m.visitor.id);
        this.emit(pl, 'rumor', `${m.visitor.name}가 우리 엄마한테 말할 것 같다.`, 2);
        continue;
      }
      if (!this.students.has(m.visitor.id)) continue;
      g.event(m.visitor.id, pl.id, this.day, { closeness: m.closeness, grudge: m.grudge });
      g.hangOut(pl.id, m.visitor.id, this.day, this.rng, 5);
      if (m.rumor) {
        this.rumors.start({ id: `shift${this.day}${m.visitor.id}`, about: m.rumor.includes(pl.name) ? pl.id : m.visitor.id, true: true, juicy: 0.6, day: this.day, effect: { respect: m.grudge > 30 ? -2 : 1 }, versions: [m.rumor, m.rumor.replace('대', '대. 진짜래')] }, [m.visitor.id]);
      }
      this.emit(pl, 'school', `알바하다 ${m.visitor.name}를 만났다 — ${m.note}.`, m.grudge > 30 ? 3 : 1);
    }
    if (report.fired) this.emit(pl, 'school', '편의점에서 잘렸다.', 4);
    // 일요일 밤: 주급 정산
    if (weekdayOf(this.date) === 0 || this.playerJob!.weekMinutes >= 60 * 12) this.queuePayday();
  }

  private queuePayday() {
    const pl = this.player!;
    const job = this.playerJob!;
    const r = new Random(this.opts.seed * 31 + this.day);
    const pd = payday(job, r);
    pl.life.money += pd.weeklyPaid;
    this.ask(`pay${this.day}`, pd.text, pd.options, (o) => {
      const res = resolvePayday(job, pd, o as 'accept' | 'ask' | 'report', r);
      if (res.extra) pl.life.money += res.extra;
      if (res.text) this.emit(pl, 'school', res.text, o === 'report' ? 4 : 2);
    });
  }

  /** 아침에 우산을 챙긴다 / 놓고 간다 */
  packUmbrella(take: boolean): void {
    const c = this.playerCarry;
    if (!c) return;
    this.record({ t: 'umbrella', day: this.day, take });
    const has = c.all().find((x) => x.id === 'umbrella' || x.id === 'foldingUmbrella' || x.id === 'cheapUmbrella');
    if (take && !has) c.take('foldingUmbrella', 'bag');
    if (!take && has) c.drop(has.uid);
  }

  /** 주인공의 하루 바깥 시간: 장소를 옮길 때마다 20분씩 밖. 비 오면 우산을 펴고, 없으면 맞는다 */
  private playerWeatherDay(d: number) {
    const pl = this.player;
    const c = this.playerCarry;
    if (!pl || !c) return;
    const today = pl.life.timeline.filter((e) => e.dayIndex === pl.life.clock.dayIndex - 1 || e.dayIndex === pl.life.clock.dayIndex);
    const moves = today.filter((e, i) => i > 0 && e.place !== today[i - 1]!.place).length;
    const raining = ['rain', 'shower', 'monsoon', 'typhoon', 'snow'].includes(this.today.sky);
    if (raining && !c.openUmbrella()) {
      this.emit(pl, 'weather', '우산이 없다. 비를 맞으며 다녔다.', 2);
    }
    const r = new Random(this.opts.seed * 17 + d);
    for (const l of c.outside(moves * 20, this.today, r)) this.emit(pl, 'weather', l.text, 2);
    c.closeUmbrella();
    c.indoors(240);
    if (c.catchesCold(r, pl.life.ch.innate.constitution)) {
      pl.life.body.applyStress(10);
      this.emit(pl, 'weather', '목이 칼칼하고 몸살 기운이 있다. 감기에 걸렸다.', 3);
      c.chill = 0;
    }
  }

  /** 저장: 시드와 주인공의 선택만 남긴다 (몇 KB) */
  save(): SaveFile {
    return { version: 1, opts: this.opts, day: this.day, commands: [...this.commands] };
  }

  /** 불러오기: 같은 시드로 세계를 만들고, 주인공의 선택을 그대로 다시 넣는다 */
  static load(file: SaveFile): WorldSim {
    const w = new WorldSim(file.opts);
    w.replaying = true;
    const queue = [...file.commands];
    while (w.day < file.day || (w.day === file.day && queue.length)) {
      w.beginDay();
      while (queue.length && queue[0]!.day === w.day) {
        const c = queue.shift()!;
        if (c.t === 'choose') w.choose(c.answer);
        else if (c.t === 'prompt') w.answer(c.id, c.option);
        else if (c.t === 'talk') w.talkTo(c.npc);
        else if (c.t === 'shift') { w.record(c); w.applyShift(c.report); }
        else if (c.t === 'umbrella') w.packUmbrella(c.take);
        else w.talkToParent(c.idx, c.choice);
      }
      if (w.day === file.day) break; // 저장한 날 중간이면 여기서 멈춘다
      while (w.playerDecision) w.choose(w.playerDecision.auto);
      w.endDay();
    }
    w.replaying = false;
    return w;
  }

  private record(c: Command) {
    this.commands.push(c);
    void this.replaying;
  }

  // ───────── 만남 ─────────

  private atSchool(s: Student): boolean {
    return !s.transferred && !s.expelled && !s.away && !s.run.active && !s.house.childAway;
  }

  private encounters(d: number, school: boolean) {
    const g = this.graph;
    const rng = this.rng;
    if (school) {
      for (const s of this.students.values()) {
        if (!this.atSchool(s)) continue;
        for (const x of s.seat) if (this.atSchool(this.student(x)) && rng.chance(0.4 + s.prof.personality.extraversion * 0.4)) g.hangOut(s.id, x, d, rng, 40); // 수업·쉬는 시간·급식 내내 옆자리
        for (let t = 0; t < 2; t++) {
          const o = this.classmates(s)[Math.floor(rng.next() * 30)];
          if (!o || o === s.id || !this.atSchool(this.student(o))) continue;
          // 내성적이거나 아싸 기질이면 먼저 다가가지 않는다
          const shy = (0.3 + s.prof.personality.extraversion) * (s.prof.traits.includes('loner') ? 0.4 : 1);
          const pull = (0.3 + (g.rel(s.id, o)?.closeness ?? 0) / 100 + Math.max(0, g.compat(g.people.get(s.id)!, g.people.get(o)!))) * shy;
          if (rng.chance(Math.min(1, pull))) g.hangOut(s.id, o, d, rng, 25);
        }
      }
    }
    // 방과 후: 오늘 타임라인에서 같은 장소(동네)·겹치는 시간
    const buckets = new Map<string, Array<{ id: string; start: number; end: number; place: string }>>();
    for (const s of this.students.values()) {
      for (let i = s.life.timeline.length - 1; i >= 0; i--) {
        const e = s.life.timeline[i]!;
        if (e.dayIndex !== s.life.timeline.at(-1)!.dayIndex) break;
        if (e.place === '집' || e.place === '학교') continue;
        const key = SHARED_PLACES.has(e.place) ? e.place : `${e.place}@${s.area}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push({ id: s.id, start: e.start, end: e.end, place: e.place });
        // 단골: 가장 자주 가는 곳 3개만 "내 곳"이 된다 (편의점처럼 다들 들르는 곳은 빼고)
        if (e.place !== '편의점') {
          const vc = this.visits.get(s.id) ?? new Map<string, number>();
          vc.set(e.place, (vc.get(e.place) ?? 0) + 1);
          this.visits.set(s.id, vc);
          g.people.get(s.id)!.hangouts = [...vc].sort((x, y) => y[1] - x[1]).slice(0, 3).filter(([, n]) => n >= 4).map(([pl]) => pl);
        }
      }
    }
    // 한 사람이 하루에 방과 후 새로 말 섞는 건 몇 명뿐이다
    const met = new Map<string, number>();
    const budget = (id: string) => (met.get(id) ?? 0) < 3;
    for (const list of buckets.values()) {
      list.sort(() => rng.next() - 0.5);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!, b = list[j]!;
          if (a.id === b.id) continue;
          const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start);
          if (overlap < 20) continue;
          const [stranger, known] = MINGLE[a.place] ?? [0.05, 0.6];
          const sameCrew = a.place === '학원가' && this.academyCrew.get(a.id)?.has(b.id);
          const acquainted = (g.rel(a.id, b.id)?.closeness ?? 0) >= 20;
          const p = sameCrew ? 0.6 : acquainted ? known : stranger;
          if (!budget(a.id) || !budget(b.id) || !rng.chance(p)) continue;
          g.hangOut(a.id, b.id, d, rng, Math.min(90, overlap));
          met.set(a.id, (met.get(a.id) ?? 0) + 1);
          met.set(b.id, (met.get(b.id) ?? 0) + 1);
        }
      }
    }
  }

  private classmates(s: Student): string[] {
    return [...this.students.values()].filter((x) => x.cls === s.cls && !x.transferred).map((x) => x.id);
  }

  private assignSeats() {
    const byCls = new Map<number, Student[]>();
    for (const s of this.students.values()) if (!s.transferred) byCls.set(s.cls, [...(byCls.get(s.cls) ?? []), s]);
    for (const list of byCls.values()) {
      list.forEach((s, j) => {
        s.seat = [j - 1, j + 1, j - 6, j + 6].filter((x) => x >= 0 && x < list.length).map((x) => list[x]!.id);
      });
    }
  }

  // ───────── 학교 ─────────

  private noticeAbuse(s: Student, d: number) {
    if (s.bruiseDays <= 0 && s.house.maxFear() <= 50) return;
    const rng = this.rng;
    const signs = { bruiseDays: s.bruiseDays, absences: 0, withdrawn: s.house.maxFear() > 40 };
    const before = s.prot.log.length;
    s.prot.observe('teacher', signs, { notice: 0.3 + rng.next() * 0.3, closeness: 0.3, meddle: 0.3 }, d, rng);
    // 실제 친구들이 본다 — 친할수록, 눈치 빠를수록
    for (const f of this.graph.friends(s.id)) {
      const F = this.student(f);
      if (!this.atSchool(F)) continue;
      const closeness = this.graph.rel(f, s.id)!.closeness / 100;
      if (s.prot.observe('friend', signs, { notice: F.fx.notice, closeness, meddle: F.fx.meddle }, d, rng)) break;
    }
    if (s.house.maxFear() > 60 && rng.chance(0.002)) s.prot.selfReport(d, rng);
    for (const e of s.prot.log.slice(before)) this.emit(s, 'protection', e.text, e.text.includes('판정') ? 4 : 2);
  }

  private bullying(d: number) {
    const rng = this.rng;
    const g = this.graph;
    for (const bully of this.students.values()) {
      if (bully === this.player) continue; // 주인공은 스스로 시비를 고른다 (나중에)
      if (!this.atSchool(bully) || !bully.prof.traits.includes('bully') || !rng.chance(0.02)) continue;
      // 표적: 친구 없고 약한 애
      const pool = this.classmates(bully).map((x) => this.student(x)).filter((v) => v !== bully && this.atSchool(v));
      if (!pool.length) continue;
      pool.sort((a, b) => g.friends(a.id).length + g.people.get(a.id)!.power / 30 - (g.friends(b.id).length + g.people.get(b.id)!.power / 30));
      const victim = pool[Math.floor(rng.next() * Math.min(4, pool.length))]!;
      g.event(victim.id, bully.id, d, { fear: 10, grudge: 15, closeness: -10 });
      victim.life.body.applyStress(8 * victim.fx.stress);
      this.emit(victim, 'school', `${josa(bully.name, '이가')} 또 시비를 걸었다.`, 1);

      const pl = this.player;
      if (pl && victim === pl) {
        // 주인공이 당했다
        this.ask(`bully${d}${bully.id}`, `${josa(bully.name, '이가')} 시비를 건다. "야, 너 뭘 봐?"`, [
          { id: 'fight', label: '맞선다' },
          { id: 'report', label: '선생님께 말한다' },
          { id: 'endure', label: '참는다' },
        ], (o) => {
          if (o === 'fight') this.fight(this.day, pl, bully, pl, true);
          else if (o === 'report') this.reportBullying(bully, pl);
          else this.afterBullying(this.day, bully, pl, pool);
        });
        continue;
      }
      if (pl && pl !== bully && pl.cls === bully.cls && this.atSchool(pl)) {
        // 주인공이 봤다
        this.ask(`saw${d}${bully.id}`, `쉬는 시간, ${josa(bully.name, '이가')} ${victim.name}에게 시비를 걸고 있다. 반 애들은 다 못 본 척한다.`, [
          { id: 'block', label: '막아선다' },
          { id: 'tell', label: '선생님께 말한다' },
          { id: 'ignore', label: '모른 척한다' },
        ], (o) => {
          if (o === 'block') this.fight(this.day, pl, bully, victim, true);
          else if (o === 'tell') {
            this.emit(pl, 'school', `${josa(bully.name, '이가')} ${josa(victim.name, '을를')} 괴롭히는 걸 담임 선생님께 말했다.`, 2);
            g.event(bully.id, pl.id, this.day, { grudge: 25 });
            g.event(victim.id, pl.id, this.day, { closeness: 10, trust: 15 });
            this.reportBullying(bully, victim);
          } else this.afterBullying(this.day, bully, victim, pool);
        });
        continue;
      }
      this.afterBullying(d, bully, victim, pool);
    }
  }

  /** 시비 뒤: 친구가 막아 주거나, 입막음 → 참다 참다 신고 */
  private afterBullying(d: number, bully: Student, victim: Student, pool: Student[]) {
    const rng = this.rng;
    const g = this.graph;
    const pl = this.player;
    // 막아 줄 친구 (실제 친구 중 의리·정의감) — 아니면 같은 반 일진 사냥꾼
    if (victim !== pl) {
      const defender = [...g.friends(victim.id), ...pool.filter((x) => x.fx.justice > 0).map((x) => x.id)]
        .map((x) => this.student(x))
        .find((f) => f !== bully && f !== pl && f.cls === bully.cls && this.atSchool(f) && rng.chance(0.1 + f.fx.loyalty * 0.3 + f.fx.justice * 0.35 + ((g.rel(f.id, victim.id)?.closeness ?? 0) >= BEST_FRIEND ? 0.2 : 0)));
      if (defender) {
        this.fight(d, defender, bully, victim);
        return;
      }
    }
    // 입막음
    const crew = this.groupMates(bully).filter((x) => x.prof.traits.some((t) => ['bully', 'brawler'].includes(t)) && this.atSchool(x)).length;
    const th = threaten({ id: bully.id, name: bully.name, traits: bully.prof.traits, crew }, { id: victim.id, name: victim.name, traits: victim.prof.traits, fear: g.rel(victim.id, bully.id)?.fear ?? 0, role: 'victim' }, rng);
    g.event(victim.id, bully.id, d, { fear: th.fearAdded, grudge: th.defiant ? 10 : 5 });
    const text = th.lines.filter((l) => l.who !== victim.id || victim !== pl).map((l) => (l.who === 'narration' ? l.text : `${this.student(l.who).name}: ${l.text}`)).join(' / ');
    if (victim === pl) {
      // 주인공은 입막음에 어떻게 반응할지 고른다
      this.emit(pl, 'threat', text.split(' / ').slice(0, 2).join(' / '), 3);
      this.ask(`threat${d}${bully.id}`, `방과 후, ${josa(bully.name, '이가')} 따라왔다. "${th.lines.filter((l) => l.who === bully.id).at(-1)?.text ?? '말하면 알지?'}"`, [
        { id: 'record', label: '수긍하는 척하며 몰래 녹음한다' },
        { id: 'defy', label: '"말할 거야."' },
        { id: 'silent', label: '입을 다문다' },
      ], (o) => {
        bully.victims.push({ id: pl.id, day: this.day, threatened: true, evidence: o === 'record' });
        if (o === 'record') this.emit(pl, 'threat', '주머니 속 휴대폰은 녹음 중이었다.', 3);
        if (o === 'defy') {
          g.event(bully.id, pl.id, this.day, { grudge: 20 });
          this.later(this.day, () => this.reportBullying(bully, pl));
        }
        if (o === 'silent') g.event(pl.id, bully.id, this.day, { fear: 10 });
      });
      return;
    }
    bully.victims.push({ id: victim.id, day: d, threatened: true, evidence: !!th.evidence });
    if (th.evidence || th.defiant) this.emit(victim, 'threat', text, 2);
    // 참다 참다 말한다: 같은 애한테 당한 횟수가 쌓일수록 (학폭 피해 학생 대부분은 결국 누군가에게 알린다)
    const times = bully.victims.filter((v) => v.id === victim.id).length;
    const report = rng.chance(Math.min(0.9, (th.silenced ? 0.06 : th.defiant ? 0.5 : 0.15) + (times - 1) * 0.08));
    if (report) this.later(d + (th.defiant ? 0 : 1 + Math.floor(rng.next() * 7)), () => this.reportBullying(bully, victim));
  }

  private ask(id: string, text: string, options: PromptOption[], resolve: (o: string) => void) {
    this.prompts.push({ id, day: this.day, text, options, resolve });
  }

  /** 괴롭힘이 학교에 알려졌다 → 예전 피해자들이 "나도 당했다" → 학폭위 */
  reportBullying(bully: Student, victim: Student) {
    const d = this.day;
    const rng = this.rng;
    const g = this.graph;
    if (bully.transferred) return;
    this.emit(victim, 'committee', `${josa(bully.name, '을를')} 학교에 신고했다.`, 3);
    // 증언: 원한이 무서움을 이기면 나선다
    let testimonies = 0;
    for (const v of bully.victims) {
      if (v.id === victim.id) continue;
      const r = g.rel(v.id, bully.id);
      if (!r) continue;
      // 다른 애가 먼저 신고했다는 게 용기를 준다
      if (rng.chance(Math.max(0, 0.15 + r.grudge / 150 - r.fear / 250 + (v.evidence ? 0.1 : 0)))) {
        testimonies++;
        this.emit(this.student(v.id), 'testimony', `${josa(victim.name, '이가')} 신고했다는 얘기를 듣고 상담실을 찾아갔다. "저도 당했어요."`, 4);
      }
    }
    const threatened = bully.victims.some((v) => v.evidence);
    const counsel = hireCounsel(this.means(bully), 0.5, 'accused', rng);
    const role: StudentRole = {
      id: bully.id, hit: true, struckFirst: true, proportionate: false, retaliatedLater: false, defendingOther: false,
      priorIncidents: Math.min(4, bully.victims.length - 1 + testimonies), remorse: rng.next() * 0.6, reconciled: rng.next() * 0.4,
      persuade: bully.fx.persuade + counsel.persuade, threatened,
    };
    const ev = { cctv: false, witnesses: 2 + testimonies * 2, filmed: false, medical: false };
    this.committee(bully, role, { type: 'bullying', worstInjury: 1, evidence: ev }, counsel, testimonies ? `증언 ${testimonies}명` : '');
    // 소문: 신고당한 애
    this.rumors.start({
      id: `report${d}${bully.id}`, about: bully.id, true: true, juicy: 0.7, day: d, effect: { respect: -3 },
      versions: [`${josa(bully.name, '이가')} 학폭으로 신고당했대.`, `${bully.name} 학폭위 열린대. 피해자가 여러 명이래.`, `${bully.name} 이번에 강전(강제전학) 간대.`],
    }, [victim.id]);
  }

  private fight(d: number, defender: Student, bully: Student, victim: Student, now = false) {
    const rng = this.rng;
    const g = this.graph;
    const later = !now && rng.chance(0.3);
    const place: PlaceId = later ? rng.pick(['schoolBack', 'alley', 'park', 'convenience', 'pcbang', 'riverside'] as PlaceId[]) : rng.chance(0.5) ? 'classroom' : 'schoolHall';
    const f = resolveFight([this.fighter(defender)], [this.fighter(bully)], { place, firstStrike: later || rng.chance(0.4) ? 'A' : 'B', rng, day: d });
    const winner = f.winner === 'A' ? defender : bully;
    const loser = winner === defender ? bully : defender;
    g.event(victim.id, defender.id, d, { closeness: 15, trust: 20 });
    g.event(loser.id, winner.id, d, { grudge: 30, fear: 10 });
    const self = defender === victim;
    const where = later ? `방과 후 ${PLACES[place].label}에서` : PLACES[place].label + '에서';
    this.emit(defender, 'fight', self ? `${where} ${bully.name}에게 맞섰다. ${f.summary} ${josa(winner.name, '이가')} 이겼다.` : `${josa(victim.name, '을를')} 괴롭히던 ${josa(bully.name, '을를')} ${where} 막아섰다. ${f.summary} ${josa(winner.name, '이가')} 이겼다.`, 3);
    this.rumors.start({
      id: `fight${d}${defender.id}`, about: winner.id, true: true, juicy: 0.85, day: d, effect: { respect: 4, fear: 3 },
      versions: [
        `${josa(winner.name, '이가')} ${josa(loser.name, '을를')} 한 대 때렸대.`,
        `${josa(winner.name, '이가')} ${josa(loser.name, '을를')} 눕혀 버렸대.`,
        `${josa(winner.name, '이가')} ${loser.name} 코뼈를 부러뜨렸대.`,
        `${winner.name} 원래 다른 학교 짱이었대.`,
      ],
    }, [victim.id, defender.id]);
    const hurt = Math.max(...f.injuries.filter((x) => x.id === bully.id).map((x) => x.level));
    const found = later
      ? discover(f.trace, { injury: hurt, fear: 0.2, pride: bully.prof.attitudes.pride * 0.8 + 0.3, parentPresence: Math.max(...bully.house.parents.map((p) => p.traits.presence)), parentInvolvement: this.means(bully).involvement, witnessMeddle: 0.15 }, rng)
      : { by: 'witness' as const, afterDays: 0, police: f.trace.policeOnScene || hurt >= 3, text: '반 애들이 다 봤다. 선생님이 바로 왔다.' };
    if (!found) {
      this.emit(defender, 'fight', '아무도 말하지 않았다. 없던 일이 됐다. 소문만 돌았다.', 1);
      return;
    }
    this.later(d + found.afterDays, () => {
      this.emit(defender, 'committee', found.text, 2);
      const hc = hireCounsel(this.means(defender), 0.5 + hurt * 0.15, 'accused', rng);
      const bc = hireCounsel(this.means(bully), 0.5 + hurt * 0.15, 'victim', rng);
      const ev = gatherEvidence(f.trace, this.day, hurt >= 2, hc.preserves || bc.preserves ? this.day + 2 : null);
      const denies = later && (hc.kind !== 'none' || rng.chance(0.4));
      const ok = proven(ev, denies, hc.contest, rng);
      const settle = rng.chance(0.2 + hc.settle - bc.settle * 0.5);
      if (settle) this.emit(defender, 'committee', `합의금 ${(settlementAmount(hurt, bc, rng) / 10000).toLocaleString()}만 원에 합의했다.`, 2);
      const inc: Incident = { type: 'assault', worstInjury: hurt, evidence: ev };
      this.committee(defender, { id: defender.id, hit: true, struckFirst: f.firstStrike === 'A', proportionate: hurt <= 1, retaliatedLater: later, defendingOther: !self, priorIncidents: defender.measures.length, remorse: 0.3 + rng.next() * 0.6, reconciled: settle ? 0.9 : 0.2, persuade: defender.fx.persuade + hc.persuade, proven: ok }, inc, hc);
      this.committee(bully, { id: bully.id, hit: true, struckFirst: f.firstStrike === 'B', proportionate: false, retaliatedLater: false, defendingOther: false, priorIncidents: Math.min(4, bully.victims.length), remorse: rng.next() * 0.5, reconciled: 0.2, persuade: bully.fx.persuade + bc.persuade, threatened: bully.victims.some((v) => v.evidence) }, inc, bc);
      if (found.police && ok && hurt >= 1) this.arrest(defender, hurt >= 3 ? 'injury' : 'assault', hc, settle);
    });
  }

  private committee(s: Student, role: StudentRole, inc: Incident, counsel: Counsel, note = '') {
    const rng = this.rng;
    let m = decide(role, inc);
    if (m.level >= 4 && (counsel.kind === 'private' || counsel.kind === 'top')) {
      const a = appeal(counsel, rng);
      if (a.reduced) m = decide({ ...role, remorse: 1, reconciled: 1 }, inc);
    }
    s.measures.push(m);
    this.emit(s, 'committee', `학폭위${note ? ` (${note})` : ''}: ${m.level === 0 ? m.label : `${m.level}호 ${m.label}`}${counsel.kind !== 'none' ? ` — ${counsel.label}` : ''}.`, m.level >= 6 ? 4 : 3);
    if (m.level === 6) this.goAway(s, '출석정지', m.daysOut, false);
    if (m.level === 7) {
      s.cls = (s.cls + 1) % Math.ceil(this.opts.students / 30);
      this.graph.people.get(s.id)!.cls = s.cls;
      this.assignSeats();
      this.emit(s, 'school', `${s.cls + 1}반으로 옮겼다.`, 3);
    }
    if (m.level === 8) {
      s.transferred = true;
      this.emit(s, 'school', '다른 학교로 전학 갔다. 단톡방에서 조용히 나갔다.', 5);
    }
    if (m.level === 9) {
      s.expelled = true;
      this.emit(s, 'school', '퇴학. 검정고시 학원을 알아봤다.', 5);
    }
  }

  // ───────── 범죄·경찰 ─────────

  private crimes(d: number) {
    const rng = this.rng;
    const date = this.date;
    for (const s of this.students.values()) {
      if (s.transferred || s.away?.facility || s === this.player) continue; // 주인공의 범죄는 주인공이 고른다
      const gr = groupOf(this.groups, s.id);
      const fr = this.graph.friends(s.id).filter((f) => this.graph.mutual(s.id, f));
      const wild = fr.length ? fr.reduce((a, f) => a + Math.max(0, this.student(f).prof.attitudes.rebellion - 0.35), 0) / fr.length : 0;
      const peer = ((gr?.delinquency ?? 0) * 0.5 + wild * 4) * (0.5 + s.fx.peerPressure);
      for (const c of CRIMES) {
        if (!crimeDay(c, date.month, date.day)) continue;
        if (c.id === 'intimidation' || c.id === 'bullying') continue; // 학교에서 따로 돈다
        const days = c.onlyOn ? c.onlyOn.length : 365;
        const mult = 0.45 * Math.exp(1.3 * s.fx.crime[c.lure]) * (0.3 + s.prof.attitudes.rebellion * 1.3) * (1 + peer * 2) * (1 + s.house.aversion()) * (s.run.active ? 3 : 1);
        if (!rng.chance((c.yearly / days) * mult)) continue;
        if (rng.chance(c.detect)) this.arrest(s, c.id, hireCounsel(this.means(s), c.severity / 10, 'accused', rng));
      }
    }
  }

  private arrest(s: Student, crimeId: string, counsel: Counsel = COUNSEL.none, settledAlready = false) {
    const rng = this.rng;
    const c = crime(crimeId);
    const settled = settledAlready || (c.hasVictim && rng.chance(0.25 + counsel.settle + (s.prof.ch.origin === 'rich' ? 0.3 : 0) - c.severity * 0.03));
    const r = processCase(c, {
      age: 16 + Math.floor(this.day / 365), priorCases: s.cases.length, worstPrior: Math.max(0, ...s.cases.flatMap((x) => x.dispositions)),
      guardian: Math.max(0, Math.min(1, s.house.bestAttachment() / 100 - s.prof.need * 0.3)), remorse: rng.next() * 0.8, persuade: s.fx.persuade + counsel.persuade,
    }, settled, rng);
    s.cases.push(r);
    this.emit(s, 'police', `${c.label} — ${c.outcome} → ${r.final}`, r.dispositions.some((x) => x >= 8) || r.prison ? 5 : r.final === '범칙금' ? 1 : 3);
    if (r.prison) this.goAway(s, '소년교도소', r.prison.servedDays, true);
    else if (r.dispositions.some((x) => x >= 6)) this.goAway(s, r.dispositions.some((x) => x >= 8) ? '소년원' : '시설 위탁', r.daysAway, true);
    else if (r.daysAway) this.goAway(s, '소년분류심사원', r.daysAway, true);
    if (r.final !== '범칙금') {
      this.rumors.start({ id: `police${this.day}${s.id}`, about: s.id, true: true, juicy: 0.75, day: this.day, effect: { respect: -2, fear: 2 },
        versions: [`${josa(s.name, '이가')} 경찰서 갔다 왔대.`, `${s.name} 전과자래.`, `${s.name} 소년원 간대.`] }, [s.id]);
    }
  }

  private goAway(s: Student, reason: string, days: number, facility: boolean) {
    s.away = { reason, until: this.day + Math.max(1, days), facility };
    this.emit(s, 'school', `${reason} — ${days}일 동안 학교에 나오지 못한다.`, facility ? 5 : 3);
  }

  // ───────── 도우미 ─────────

  private regroup(d: number) {
    this.groups = findGroups(this.graph, this.rng);
    // 친구에게 물든다
    for (const s of this.students.values()) {
      const fr = this.graph.friends(s.id).filter((f) => this.graph.mutual(s.id, f));
      if (!fr.length) continue;
      const avg = fr.reduce((a, f) => a + this.student(f).prof.attitudes.rebellion, 0) / fr.length;
      s.prof.attitudes.rebellion += (avg - s.prof.attitudes.rebellion) * (0.08 + s.fx.peerPressure * 0.1);
    }
    void d;
  }

  private groupMates(s: Student): Student[] {
    return (groupOf(this.groups, s.id)?.members ?? []).filter((m) => m !== s.id).map((m) => this.student(m));
  }

  private fighter(s: Student): Fighter {
    return { id: s.id, name: s.name, fighting: s.life.ch.stats.fighting, power: powerOf(s.life.ch), fightPower: s.fx.fightPower, toughness: Math.min(1, s.fx.toughness) };
  }

  private means(s: Student) {
    return { origin: s.prof.ch.origin, expectation: s.prof.parentExpectation, involvement: Math.max(...s.house.parents.map((p) => p.traits.control * 0.6 + p.traits.presence * 0.4)) };
  }

  private runInput(s: Student, incident: 'yelled' | 'hit' | null): RunawayInput {
    return {
      fear: s.house.maxFear(), attachment: s.house.bestAttachment(), aversion: s.house.aversion(), incidentToday: incident, clashToday: false,
      stress: s.life.ch.body.stress * 0.5, rebellion: s.prof.attitudes.rebellion, impulsivity: s.prof.personality.impulsivity,
      belonging: this.graph.belonging(s.id), peerRanAway: false, parentsSearch: s.house.parents.some((p) => p.traits.affection >= 0.4), knowsHelp: true,
    };
  }

  private later(day: number, run: () => void) {
    this.pending.push({ day, run });
  }

  private emit(s: Student, kind: EventKind, text: string, weight: number) {
    const e = { day: this.day, who: s.id, kind, text, weight };
    this.log.push(e);
    s.story.push(e);
  }
}

export { weekdayOf };

export { describeWeather };
