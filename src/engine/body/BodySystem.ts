import { EventBus } from '../core/EventBus';
import { type Character, emptyLedger } from '../character/types';
import { type DaySettlement, EXERCISE_MET, type ExerciseKind, exerciseKcal, MEALS, type MealKind, settleDay } from './composition';
import type { GameClock } from '../time/GameClock';
import { SYMPTOMS, type SymptomDef } from './symptoms';

export type BodyEvents = {
  /** announce=false면 상태만 바뀐 것(독백은 쿨다운 중) */
  'body:symptomAppeared': { symptom: SymptomDef; announce: boolean };
  'body:symptomGone': { symptom: SymptomDef };
  /** 졸음이 한계에 닿음 → 게임 쪽에서 장소에 맞게 처리(집이면 잠, 밖이면 위험 이벤트) */
  'body:collapsed': { minutesAwake: number; sleepDebtMin: number };
  'body:slept': { minutes: number; deficit: number; sleepDebtMin: number };
  /** 하루 정산 결과(근육·지방·키 변화) */
  'body:settled': DaySettlement;
};

export const MAX_SLEEP_DEBT = 20 * 60;
/**
 * 졸음 = 깨어 있는 시간 몫 + 수면 부채 몫
 * - 깨어 있는 시간 몫: 기상 후 16시간부터 시간당 20씩 오른다. 부채가 있으면 시작이 최대 6시간 당겨진다.
 * - 수면 부채 몫: 하루 종일 깔려 있는 졸음. 최대 40이라 이것만으로는 절대 안 쓰러진다.
 * 결과: 부채 0이면 기상 후 21시간(7시 기상 → 새벽 4시), 부채 10시간 이상이면 13시간(→ 저녁 8시)에 쓰러짐.
 */
const DROWSY_ONSET_HOURS = 16;
const DROWSY_PER_HOUR = 20;
const ONSET_SHIFT_PER_DEBT_HOUR = 0.6;
const MAX_ONSET_SHIFT_DEBT_HOURS = 10;
const DEBT_DROWSY_PER_HOUR = 4;
const MAX_DEBT_DROWSY = 40;

/**
 * 몸 상태 시스템.
 * 시계 이벤트를 구독해서 깨어 있는 시간·수면을 자동으로 계산한다.
 * 수치는 숨겨져 있고, 선을 넘으면 증상 이벤트로 드러난다.
 */
export class BodySystem {
  readonly events = new EventBus<BodyEvents>();
  private readonly active = new Set<string>();
  private collapsedNotified = false;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly lastAnnounced = new Map<string, number>();
  private clock: GameClock | null = null;

  /**
   * 압박 바닥선: 놀거나 쉬어서 스트레스를 풀 수 있는 하한.
   * 부모 기대·학원·알바·집안 형편 같은 생활 구조가 정한다(삶의 시스템이 매일 갱신).
   */
  pressureFloor = 0;

  constructor(private readonly ch: Character) {}

  /** 시계에 연결 */
  attach(clock: GameClock): this {
    this.clock = clock;
    this.unsubscribers.push(
      clock.events.on('time:advanced', (e) => {
        if (e.cause === 'sleep') this.sleep(e.minutes);
        else this.stayAwake(e.minutes);
      }),
    );
    return this;
  }

  detach(): void {
    this.unsubscribers.splice(0).forEach((off) => off());
  }

  // ---------- 계산 ----------

  /** 체질에 따른 하루 필요 수면(분). 체질 5 = 8시간 */
  get sleepNeed(): number {
    return 480 - (this.ch.innate.constitution - 5) * 6;
  }

  /** 졸음 0~100. 100이면 쓰러진다. */
  get drowsiness(): number {
    const awake = Math.max(0, this.ch.body.minutesAwake / 60 - this.onsetHours()) * DROWSY_PER_HOUR;
    return Math.min(100, awake + this.debtDrowsiness());
  }

  private debtHours(): number {
    return this.ch.body.sleepDebtMin / 60;
  }
  private onsetHours(): number {
    return DROWSY_ONSET_HOURS - Math.min(this.debtHours(), MAX_ONSET_SHIFT_DEBT_HOURS) * ONSET_SHIFT_PER_DEBT_HOUR;
  }
  private debtDrowsiness(): number {
    return Math.min(MAX_DEBT_DROWSY, this.debtHours() * DEBT_DROWSY_PER_HOUR);
  }

  /** 컨디션 0.3~1.0. 스탯 상승량과 시험 점수에 곱해진다. */
  condition(): number {
    const b = this.ch.body;
    const c =
      1 -
      (this.drowsiness / 100) * 0.4 -
      (Math.max(0, b.stress - 50) / 50) * 0.3 -
      (Math.min(b.sleepDebtMin, 600) / 600) * 0.2;
    return Math.max(0.3, Math.min(1, c));
  }

  /** 지금부터 몇 분 더 버티면 쓰러지나. 긴 행동(밤샘 게임 등)을 이 값으로 끊는다. */
  minutesUntilCollapse(): number {
    const collapseAwakeMin = (this.onsetHours() + (100 - this.debtDrowsiness()) / DROWSY_PER_HOUR) * 60;
    return Math.max(0, Math.ceil(collapseAwakeMin - this.ch.body.minutesAwake));
  }

  activeSymptoms(): SymptomDef[] {
    return SYMPTOMS.filter((s) => this.active.has(s.id));
  }

  // ---------- 변화 ----------

  /** 스트레스 증감. 체질이 좋으면 덜 받는다. */
  applyStress(delta: number): void {
    const b = this.ch.body;
    const resist = 1 - (this.ch.innate.constitution - 5) * 0.04;
    const applied = delta > 0 ? delta * resist : delta;
    const floor = delta < 0 ? Math.min(b.stress, this.pressureFloor) : 0;
    b.stress = Math.max(floor, Math.min(100, b.stress + applied));
    this.evaluate();
  }

  /**
   * 먹기. 오늘 장부에 쌓였다가 잠들 때 정산된다.
   * 식사는 식욕만큼 양이 달라진다(배고프면 한 그릇 더). 간식·야식·프로틴처럼 양이 정해진 건 그대로.
   */
  eat(meal: MealKind): void {
    const m = MEALS[meal];
    const portion = meal === '급식' || meal === '집밥' ? this.ch.body.appetite : 1;
    this.ch.body.today.kcalIn += m.kcal * portion;
    this.ch.body.today.proteinG += m.proteinG * portion;
  }

  /**
   * 운동하기. 소모 칼로리와 근력 자극이 장부에 쌓이고, 스트레스가 조금 풀린다.
   * 시간 흐름은 호출하는 쪽에서 clock.advance로 처리한다.
   */
  exercise(kind: ExerciseKind, minutes: number): number {
    const kcal = exerciseKcal(kind, minutes, this.ch.body.weightKg);
    this.ch.body.today.kcalExercise += kcal;
    if (kind === 'weights') this.ch.body.today.strengthMinutes += minutes;
    if (EXERCISE_MET[kind] >= 5) this.applyStress(-(minutes / 30) * 2);
    return kcal;
  }

  private stayAwake(minutes: number): void {
    this.ch.body.minutesAwake += minutes;
    this.evaluate();
    if (this.drowsiness >= 100 && !this.collapsedNotified) {
      this.collapsedNotified = true;
      this.events.emit('body:collapsed', {
        minutesAwake: this.ch.body.minutesAwake,
        sleepDebtMin: this.ch.body.sleepDebtMin,
      });
    }
  }

  /** 3시간 미만은 낮잠·늦잠 연장 — 하루 정산 없이 졸음만 조금 푼다 */
  static readonly NAP_MAX_MIN = 180;

  private nap(minutes: number): void {
    const b = this.ch.body;
    b.minutesAwake = Math.max(0, b.minutesAwake - minutes * 2);
    b.sleepDebtMin = Math.max(0, b.sleepDebtMin - minutes * 0.5);
    this.collapsedNotified = false;
    this.evaluate();
  }

  /** 한 번의 잠 = 하루 정산 */
  private sleep(minutes: number): void {
    if (minutes < BodySystem.NAP_MAX_MIN) return this.nap(minutes);
    const b = this.ch.body;
    const deficit = this.sleepNeed - minutes;
    if (deficit > 0) {
      b.sleepDebtMin = Math.min(MAX_SLEEP_DEBT, b.sleepDebtMin + deficit);
      this.applyStressSilently((deficit / 60) * 3);
    } else {
      // 더 자도 부채는 절반 속도로만 갚힌다
      b.sleepDebtMin = Math.max(0, b.sleepDebtMin + deficit * 0.5);
      this.applyStressSilently(-3);
    }
    b.minutesAwake = 0;
    this.collapsedNotified = false;
    b.highStressDays = b.stress >= 60 ? b.highStressDays + 1 : Math.max(0, b.highStressDays - 1);

    this.events.emit('body:slept', { minutes, deficit, sleepDebtMin: b.sleepDebtMin });

    const settlement = settleDay(this.ch, Math.min(1, minutes / this.sleepNeed));
    b.today = emptyLedger();
    this.events.emit('body:settled', settlement);
    this.evaluate();
  }

  private applyStressSilently(delta: number): void {
    const b = this.ch.body;
    const resist = 1 - (this.ch.innate.constitution - 5) * 0.04;
    const floor = delta < 0 ? Math.min(b.stress, this.pressureFloor) : 0;
    b.stress = Math.max(floor, Math.min(100, b.stress + (delta > 0 ? delta * resist : delta)));
  }

  private evaluate(): void {
    const ctx = { ch: this.ch, body: this.ch.body, drowsiness: this.drowsiness };
    for (const s of SYMPTOMS) {
      const on = s.active(ctx);
      if (on && !this.active.has(s.id)) {
        this.active.add(s.id);
        const day = this.clock?.dayIndex ?? 0;
        const last = this.lastAnnounced.get(s.id);
        const announce = last === undefined || day - last >= (s.cooldownDays ?? 7);
        if (announce) this.lastAnnounced.set(s.id, day);
        this.events.emit('body:symptomAppeared', { symptom: s, announce });
      } else if (!on && this.active.has(s.id)) {
        this.active.delete(s.id);
        this.events.emit('body:symptomGone', { symptom: s });
      }
    }
  }
}
