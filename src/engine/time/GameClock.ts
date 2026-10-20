import { EventBus } from '../core/EventBus';
import { addDays, formatDate, type GameDate } from './calendar';
import { formatClock, MINUTES_PER_DAY, MS_PER_GAME_MINUTE, type TimeSlot, type TimeSpeed } from './constants';
import { DEFAULT_SCHOOL, isSchoolDay, slotAt } from './school';

/** 한 번의 tick이 받아들이는 최대 실제 시간(ms). 이 이상은 버린다. */
export const MAX_TICK_MS = 1000;

/** 시간이 흐른 이유. 몸 상태·NPC 시스템이 이걸 보고 다르게 반응한다. */
export type AdvanceCause = 'realtime' | 'action' | 'travel' | 'sleep' | 'auto';

export type TimeEvents = {
  'time:advanced': { from: number; to: number; minutes: number; cause: AdvanceCause };
  'time:slotChanged': { from: TimeSlot; to: TimeSlot; at: number };
  'time:dayChanged': { dayIndex: number; date: GameDate };
  'time:paused': { reasons: string[] };
  'time:resumed': Record<string, never>;
};

/** (날짜, 시각) → 시간대. 기본은 기본 학사 일정 기준. */
export type SlotResolver = (date: GameDate, minuteOfDay: number) => TimeSlot;

const defaultResolver: SlotResolver = (date, minute) => slotAt(minute, isSchoolDay(date, DEFAULT_SCHOOL), DEFAULT_SCHOOL);

export interface GameClockOptions {
  startDate: GameDate;
  startMinute: number;
  speed?: TimeSpeed;
  slotResolver?: SlotResolver;
}

export interface GameClockSnapshot {
  startDate: GameDate;
  totalMinutes: number;
  speed: TimeSpeed;
  carryMs: number;
}

/**
 * 게임 시계.
 * - 자유 시간엔 tick()으로 실제 시간에 맞춰 흐른다.
 * - 대화·메뉴·선택지 중엔 pause()로 멈춘다(여러 이유가 겹쳐도 모두 풀려야 재개).
 * - 행동·이동·수면은 advance()로 한 번에 건너뛴다(멈춤 여부와 무관).
 */
export class GameClock {
  readonly events = new EventBus<TimeEvents>();
  speed: TimeSpeed;

  private readonly startDate: GameDate;
  private totalMinutes: number; // 시작일 00:00부터 흐른 분
  private carryMs = 0;
  private readonly pauseReasons = new Set<string>();
  private readonly resolveSlot: SlotResolver;

  constructor(opts: GameClockOptions) {
    this.startDate = opts.startDate;
    this.totalMinutes = opts.startMinute;
    this.speed = opts.speed ?? 'normal';
    this.resolveSlot = opts.slotResolver ?? defaultResolver;
  }

  // ---------- 조회 ----------

  get now(): number {
    return this.totalMinutes;
  }
  get dayIndex(): number {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY);
  }
  get minuteOfDay(): number {
    return this.totalMinutes % MINUTES_PER_DAY;
  }
  get date(): GameDate {
    return addDays(this.startDate, this.dayIndex);
  }
  get slot(): TimeSlot {
    return this.resolveSlot(this.date, this.minuteOfDay);
  }
  get isPaused(): boolean {
    return this.pauseReasons.size > 0;
  }
  /** "3월 2일 (월) 07:00" */
  get label(): string {
    return `${formatDate(this.date)} ${formatClock(this.minuteOfDay)}`;
  }

  // ---------- 멈춤 ----------

  pause(reason: string): void {
    const wasPaused = this.isPaused;
    this.pauseReasons.add(reason);
    if (!wasPaused) this.events.emit('time:paused', { reasons: [...this.pauseReasons] });
  }

  resume(reason: string): void {
    if (!this.pauseReasons.delete(reason)) return;
    if (!this.isPaused) this.events.emit('time:resumed', {});
  }

  // ---------- 흐름 ----------

  /**
   * 프레임마다 호출. 멈춰 있으면 흐르지 않는다. 흐른 게임 분을 반환.
   * 창을 내렸다 돌아오면 큰 delta가 한 번에 들어오므로 MAX_TICK_MS로 자른다.
   */
  tick(realDeltaMs: number): number {
    if (this.isPaused || realDeltaMs <= 0) return 0;
    this.carryMs += Math.min(realDeltaMs, MAX_TICK_MS);
    const perMinute = MS_PER_GAME_MINUTE[this.speed];
    const minutes = Math.floor(this.carryMs / perMinute);
    if (minutes === 0) return 0;
    this.carryMs -= minutes * perMinute;
    this.advance(minutes, 'realtime');
    return minutes;
  }

  /** 행동·이동 등으로 시간을 건너뛴다. 지나가는 날짜·시간대 경계마다 이벤트를 순서대로 낸다. */
  advance(minutes: number, cause: AdvanceCause = 'action'): void {
    if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`잘못된 시간: ${minutes}`);
    if (minutes === 0) return;

    const from = this.totalMinutes;
    let prevSlot = this.slot;
    for (let i = 0; i < minutes; i++) {
      this.totalMinutes++;
      if (this.minuteOfDay === 0) {
        this.events.emit('time:dayChanged', { dayIndex: this.dayIndex, date: this.date });
      }
      const slot = this.slot;
      if (slot !== prevSlot) {
        this.events.emit('time:slotChanged', { from: prevSlot, to: slot, at: this.totalMinutes });
        prevSlot = slot;
      }
    }
    this.events.emit('time:advanced', { from, to: this.totalMinutes, minutes, cause });
  }

  /** 다음에 오는 해당 시각까지 건너뛴다. 이미 그 시각이면 0. 건너뛴 분을 반환. */
  advanceTo(targetMinuteOfDay: number, cause: AdvanceCause = 'action'): number {
    const minutes = (((targetMinuteOfDay - this.minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    this.advance(minutes, cause);
    return minutes;
  }

  /** 기상 시각까지 잔다. 잔 시간(분)을 반환 → 몸 상태 시스템의 수면 계산에 쓰인다. */
  sleepUntil(wakeMinuteOfDay: number): number {
    return this.advanceTo(wakeMinuteOfDay, 'sleep');
  }

  // ---------- 세이브 ----------

  toJSON(): GameClockSnapshot {
    return { startDate: this.startDate, totalMinutes: this.totalMinutes, speed: this.speed, carryMs: this.carryMs };
  }

  static fromJSON(snap: GameClockSnapshot, slotResolver?: SlotResolver): GameClock {
    const clock = new GameClock({ startDate: snap.startDate, startMinute: 0, speed: snap.speed, slotResolver });
    clock.totalMinutes = snap.totalMinutes;
    clock.carryMs = snap.carryMs;
    return clock;
  }
}
