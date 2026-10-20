/**
 * 화면과 엔진 사이. 엔진(WorldSim·ConvenienceShift)은 그대로 두고,
 * 화면이 지금 무엇을 보여 줘야 하는지(screen)와 근무 중 손이 하고 있는 일(activity)만 여기서 관리한다.
 * React는 subscribe/getVersion으로, Phaser 장면은 매 프레임 직접 읽는다.
 */
import { useSyncExternalStore } from 'react';
import { WorldSim, type Prompt } from '../engine/world';
import { autoHand, type ConvenienceShift, type HandResult, type ShiftReport, type Task } from '../engine/work';
import { Random } from '../engine/core/Random';
import { addDays, weekdayOf } from '../engine/time/calendar';
import type { Weather } from '../engine/env';

export type Screen = 'title' | 'loading' | 'morning' | 'street' | 'shift' | 'report' | 'end';

/** 근무 중 지금 손이 붙잡고 있는 일 (이게 열려 있으면 캐릭터는 못 움직인다) */
export type Activity =
  | { kind: 'checkout'; taskId: string; startedAt: number }
  | { kind: 'timing'; taskId: string; taskKind: 'restock' | 'discard' | 'clean'; startedAt: number };

/** 게임 1분 = 실제 몇 ms (4시간 근무 ≈ 2분 남짓) */
export const MS_PER_MIN = 550;
/** 빨리 감기 */
export const MS_PER_MIN_FAST = 60;
/** 직접 할 때 손님 빈도·인내심 (사람 손 속도에 맞춘 값) */
export const SCREEN_PACE = { pace: 0.2, patience: 10 };
export const START = { year: 2026, month: 3, day: 2 };
const STUDENTS = 120;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export const isWet = (w: Weather) => ['rain', 'shower', 'monsoon', 'typhoon', 'snow'].includes(w.sky);

export class Session {
  screen: Screen = 'title';
  w: WorldSim | null = null;
  shift: ConvenienceShift | null = null;
  report: ShiftReport | null = null;
  activity: Activity | null = null;
  fast = false;
  /** 오늘 아침 우산 챙겼나 */
  umbrellaPacked = false;
  /** 지난 근무 이후 있었던 일 (아침 화면에 보여 줌) */
  since: string[] = [];
  endReason = '';
  /** 오늘 몇 번째 근무 날인가 */
  workday = 0;
  seed = 0;
  /** 엔진 이벤트 몇 개까지 화면이 봤나 */
  seenEvents = 0;
  /** 예/아니오 묻기 (길에서 "알바 빠질까?") */
  confirm: { text: string; yes: () => void } | null = null;
  /** 길 위의 시각 (분) */
  streetMinute = 16 * 60 + 40;

  private version = 0;
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private dayOpen = false;
  private lastStoryDay = -1;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const l of this.listeners) l();
  }
  go(screen: Screen) {
    this.screen = screen;
    this.emit();
  }

  ask(text: string, yes: () => void) {
    this.confirm = { text, yes };
    this.emit();
  }
  answerConfirm(ok: boolean) {
    const c = this.confirm;
    this.confirm = null;
    if (ok && c) c.yes();
    this.emit();
  }

  get me() {
    return this.w?.player ?? null;
  }

  // ───────── 새 인생 ─────────

  newLife(seed = Math.floor(Math.random() * 1e6)) {
    this.seed = seed;
    this.go('loading');
    // 세계를 만드는 동안 로딩 화면이 그려지게 한 박자 쉰다
    setTimeout(() => {
      // 알바하는 학생 중 한 명이 주인공 (첫 화면이 편의점 근무라서)
      const probe = new WorldSim({ students: STUDENTS, seed, start: START });
      const idx = [...probe.students.values()].findIndex((s) => s.prof.jobDays.length > 0);
      this.w = new WorldSim({ students: STUDENTS, seed, start: START, protagonist: Math.max(0, idx) });
      this.dayOpen = false;
      this.workday = 0;
      this.lastStoryDay = -1;
      this.toNextWorkday();
    }, 30);
  }

  /** 다음 알바 날 오후까지 하루하루를 흘려보낸다 (그 사이 주인공은 평소의 자기처럼 산다) */
  toNextWorkday() {
    const w = this.w!;
    for (let guard = 0; guard < 120; guard++) {
      if (!this.dayOpen) {
        w.beginDay();
        this.dayOpen = true;
        this.umbrellaPacked = false;
      }
      while (w.playerDecision) {
        const d = w.playerDecision;
        if (d.kind === 'commitment' && d.action.id === 'partTime' && w.playerJob && !w.playerJob.fired) {
          this.collectStory();
          this.workday++;
          this.go('morning');
          return;
        }
        w.choose(d.auto);
      }
      // 알바 없는 날: 평소대로 (비 오면 우산은 챙긴다)
      if (isWet(w.today)) w.packUmbrella(true);
      w.endDay();
      this.dayOpen = false;
      if (w.playerJob?.fired) {
        this.collectStory();
        this.endReason = '편의점에서 잘렸다.';
        this.go('end');
        return;
      }
    }
    this.collectStory();
    this.endReason = '한동안 알바에 나갈 수 없었다.';
    this.go('end');
  }

  private collectStory() {
    const me = this.me!;
    this.since = me.story.filter((e) => e.day > this.lastStoryDay && e.day < this.w!.day + 1).slice(-8).map((e) => e.text);
    this.lastStoryDay = this.w!.day - 1;
  }

  dateLabel(): string {
    const w = this.w!;
    const d = addDays(START, w.day);
    return `${d.month}월 ${d.day}일 (${WD[weekdayOf(d)]})`;
  }

  /** 아침에 우산 챙기기 */
  packUmbrella(take: boolean) {
    this.w!.packUmbrella(take);
    this.umbrellaPacked = take;
    this.emit();
  }

  hasUmbrella(): boolean {
    return !!this.w?.playerCarry?.has('umbrella');
  }

  answerPrompt(p: Prompt, optionId: string) {
    this.w!.answer(p.id, optionId);
    this.emit();
  }

  /** 알바 안 가고 다른 데로 샌다 */
  skipWork() {
    const w = this.w!;
    w.choose('skip');
    while (w.playerDecision) w.choose(w.playerDecision.auto);
    this.toNextWorkdayAfterDay();
  }

  private toNextWorkdayAfterDay() {
    const w = this.w!;
    w.endDay();
    this.dayOpen = false;
    if (w.playerJob?.fired) {
      this.collectStory();
      this.endReason = '편의점에서 잘렸다.';
      this.go('end');
      return;
    }
    this.toNextWorkday();
  }

  // ───────── 근무 ─────────

  startShift() {
    const w = this.w!;
    this.shift = w.startShift(SCREEN_PACE);
    if (!this.shift) return;
    this.activity = null;
    this.report = null;
    this.fast = false;
    this.seenEvents = 0;
    this.screen = 'shift';
    this.runClock();
    this.emit();
  }

  private runClock() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), this.fast ? MS_PER_MIN_FAST : MS_PER_MIN);
  }

  setFast(on: boolean) {
    this.fast = on;
    if (on) this.activity = null;
    this.runClock();
    this.emit();
  }

  private tick() {
    const s = this.shift;
    if (!s) return;
    s.tick();
    // 빨리 감기: 손이 알아서 한다 (양심 선택은 여전히 내가)
    if (this.fast && !s.dilemma) {
      const r = new Random(this.seed + s.minute);
      const front = s.queue[0];
      const t = s.tasks.find((x) => x.customer === front) ?? s.tasks.find((x) => x.kind !== 'checkout');
      if (t) s.perform(t.id, autoHand(s.worker, s.job, t, r), true);
    }
    if (s.done) this.endShift();
    this.emit();
  }

  /** 계산대·진열대 앞에서 E: 그 일을 붙잡는다 */
  begin(task: Task) {
    if (!this.shift || this.activity || this.shift.dilemma || this.fast) return;
    this.activity = task.kind === 'checkout'
      ? { kind: 'checkout', taskId: task.id, startedAt: performance.now() }
      : { kind: 'timing', taskId: task.id, taskKind: task.kind, startedAt: performance.now() };
    this.emit();
  }

  /** 미니게임 결과를 낸다. 그새 손님이 나가 버렸으면 false */
  complete(result: HandResult): boolean {
    const s = this.shift;
    const a = this.activity;
    this.activity = null;
    if (!s || !a) return false;
    const ok = s.tasks.some((t) => t.id === a.taskId);
    if (ok) s.perform(a.taskId, result, true);
    if (s.done) this.endShift();
    this.emit();
    return ok;
  }

  cancelActivity() {
    this.activity = null;
    this.emit();
  }

  decide(optionId: string) {
    this.shift?.decide(optionId);
    if (this.shift?.done) this.endShift();
    this.emit();
  }

  private endShift() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const s = this.shift!;
    this.report = this.w!.finishShift(s);
    this.activity = null;
    this.screen = 'report';
  }

  /** 정산 화면에서 "퇴근": 남은 하루는 평소처럼, 다음 알바 날로 */
  afterReport() {
    const w = this.w!;
    for (const p of [...w.prompts]) w.answer(p.id, p.options[p.options.length - 1]!.id);
    while (w.playerDecision) w.choose(w.playerDecision.auto);
    this.shift = null;
    this.toNextWorkdayAfterDay();
  }
}

export const session = new Session();

/** React: 세션이 바뀌면 다시 그린다 */
export function useSession(): Session {
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session;
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
