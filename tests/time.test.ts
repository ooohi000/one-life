import { describe, expect, it } from 'vitest';
import {
  addDays,
  DEFAULT_SCHOOL,
  formatDate,
  GameClock,
  hm,
  isSchoolDay,
  judgeArrival,
  slotAt,
  type TimeSlot,
  weekdayOf,
} from '../src/engine/time';

const START = { year: 2026, month: 3, day: 2 }; // 월요일, 개학일

describe('달력', () => {
  it('요일 계산', () => {
    expect(weekdayOf(START)).toBe(1);
    expect(formatDate(START)).toBe('3월 2일 (월)');
  });
  it('월·연도·윤년 넘기기', () => {
    expect(addDays({ year: 2026, month: 3, day: 31 }, 1)).toEqual({ year: 2026, month: 4, day: 1 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addDays({ year: 2027, month: 2, day: 28 }, 1)).toEqual({ year: 2027, month: 3, day: 1 });
  });
});

describe('학사 일정', () => {
  it('주말·공휴일·방학엔 등교하지 않는다', () => {
    expect(isSchoolDay(START)).toBe(true);
    expect(isSchoolDay({ year: 2026, month: 3, day: 7 })).toBe(false); // 토
    expect(isSchoolDay({ year: 2026, month: 5, day: 5 })).toBe(false); // 어린이날(화)
    expect(isSchoolDay({ year: 2026, month: 8, day: 3 })).toBe(false); // 여름방학(월)
    expect(isSchoolDay({ year: 2027, month: 1, day: 11 })).toBe(false); // 해를 넘긴 겨울방학
  });
  it('시간대 경계', () => {
    expect(slotAt(hm(5, 59), true)).toBe('night');
    expect(slotAt(hm(6), true)).toBe('morning');
    expect(slotAt(hm(8, 40), true)).toBe('class');
    expect(slotAt(hm(16, 30), true)).toBe('afterSchool');
    expect(slotAt(hm(13), false)).toBe('daytime');
    expect(slotAt(hm(18), true)).toBe('evening');
    expect(slotAt(hm(22), true)).toBe('night');
  });
  it('지각 판정', () => {
    expect(judgeArrival(hm(8, 20))).toEqual({ status: 'onTime' });
    expect(judgeArrival(hm(8, 35))).toEqual({ status: 'late', minutesLate: 15 });
    expect(judgeArrival(DEFAULT_SCHOOL.absentAfter)).toEqual({ status: 'absent' });
  });
});

describe('게임 시계', () => {
  const make = () => new GameClock({ startDate: START, startMinute: hm(7) });

  it('실제 시간에 맞춰 흐르고, 남는 밀리초는 이월한다', () => {
    const c = make(); // normal = 700ms/분
    expect(c.tick(1000)).toBe(1);
    expect(c.tick(400)).toBe(1); // 300 + 400 = 700
    expect(c.minuteOfDay).toBe(hm(7, 2));
  });

  it('창을 내렸다 돌아와도 시간이 한꺼번에 흐르지 않는다', () => {
    const c = make();
    expect(c.tick(5 * 60_000)).toBe(1); // 5분 공백 → 최대 1000ms만 반영
  });

  it('멈춤 이유가 하나라도 남아 있으면 흐르지 않는다', () => {
    const c = make();
    c.pause('dialog');
    c.pause('menu');
    expect(c.tick(10_000)).toBe(0);
    c.resume('dialog');
    expect(c.tick(10_000)).toBe(0);
    c.resume('menu');
    expect(c.tick(700)).toBe(1);
  });

  it('행동으로 건너뛰면 시간대 변화를 순서대로 알린다', () => {
    const c = make();
    const seen: TimeSlot[] = [];
    c.events.on('time:slotChanged', (e) => seen.push(e.to));
    c.advanceTo(hm(19));
    expect(seen).toEqual(['class', 'afterSchool', 'evening']);
  });

  it('자정을 넘기면 날짜가 바뀌고, 잔 시간을 돌려준다', () => {
    const c = make();
    c.advanceTo(hm(23, 30));
    let changed = 0;
    c.events.on('time:dayChanged', () => changed++);
    expect(c.sleepUntil(hm(7))).toBe(450);
    expect(changed).toBe(1);
    expect(c.label).toBe('3월 3일 (화) 07:00');
  });

  it('세이브 후 불러오면 같은 상태', () => {
    const c = make();
    c.advance(1234);
    c.tick(300);
    const loaded = GameClock.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(loaded.now).toBe(c.now);
    expect(loaded.tick(400)).toBe(1);
  });

  it('음수나 소수 시간은 거부한다', () => {
    expect(() => make().advance(-1)).toThrow();
    expect(() => make().advance(1.5)).toThrow();
  });
});
