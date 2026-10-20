import { type GameDate, isWeekend } from './calendar';
import { hm, type TimeSlot } from './constants';

/** 월/일 쌍 (연도 무관) */
export interface MonthDay {
  month: number;
  day: number;
}

export interface Vacation {
  name: string;
  from: MonthDay; // 포함
  to: MonthDay; // 포함. from보다 앞이면 해를 넘기는 방학
}

/** 학교 일과와 학사 일정. 나중에 학교마다 다르게 줄 수 있도록 데이터로 둔다. */
export interface SchoolCalendar {
  attendanceDeadline: number; // 이 시각 이후 도착하면 지각
  classStart: number;
  classEnd: number;
  absentAfter: number; // 이 시각 이후 도착하면 결석 처리
  vacations: Vacation[];
  holidays: MonthDay[]; // 양력 고정 공휴일 (음력 명절은 추후)
}

export const DEFAULT_SCHOOL: SchoolCalendar = {
  attendanceDeadline: hm(8, 20),
  classStart: hm(8, 40),
  classEnd: hm(16, 30),
  absentAfter: hm(12, 0),
  vacations: [
    { name: '여름방학', from: { month: 7, day: 21 }, to: { month: 8, day: 16 } },
    { name: '겨울방학', from: { month: 12, day: 30 }, to: { month: 3, day: 1 } },
  ],
  holidays: [
    { month: 1, day: 1 },
    { month: 3, day: 1 },
    { month: 5, day: 5 },
    { month: 6, day: 6 },
    { month: 8, day: 15 },
    { month: 10, day: 3 },
    { month: 10, day: 9 },
    { month: 12, day: 25 },
  ],
};

const key = (m: MonthDay) => m.month * 100 + m.day;

function inRange(date: GameDate, from: MonthDay, to: MonthDay): boolean {
  const k = key(date);
  const a = key(from);
  const b = key(to);
  return a <= b ? k >= a && k <= b : k >= a || k <= b; // 해를 넘기는 경우
}

export function vacationOn(date: GameDate, cal: SchoolCalendar = DEFAULT_SCHOOL): Vacation | null {
  return cal.vacations.find((v) => inRange(date, v.from, v.to)) ?? null;
}

export function isHoliday(date: GameDate, cal: SchoolCalendar = DEFAULT_SCHOOL): boolean {
  return cal.holidays.some((h) => h.month === date.month && h.day === date.day);
}

export function isSchoolDay(date: GameDate, cal: SchoolCalendar = DEFAULT_SCHOOL): boolean {
  return !isWeekend(date) && !isHoliday(date, cal) && vacationOn(date, cal) === null;
}

/** 시각 + 등교일 여부 → 시간대 */
export function slotAt(minuteOfDay: number, schoolDay: boolean, cal: SchoolCalendar = DEFAULT_SCHOOL): TimeSlot {
  if (minuteOfDay < hm(6)) return 'night';
  if (minuteOfDay < cal.classStart) return 'morning';
  if (schoolDay) {
    if (minuteOfDay < cal.classEnd) return 'class';
    if (minuteOfDay < hm(18)) return 'afterSchool';
  } else if (minuteOfDay < hm(18)) {
    return 'daytime';
  }
  if (minuteOfDay < hm(22)) return 'evening';
  return 'night';
}

export type ArrivalResult =
  | { status: 'onTime' }
  | { status: 'late'; minutesLate: number }
  | { status: 'absent' };

/** 학교 도착 시각 판정 */
export function judgeArrival(arrivalMinute: number, cal: SchoolCalendar = DEFAULT_SCHOOL): ArrivalResult {
  if (arrivalMinute <= cal.attendanceDeadline) return { status: 'onTime' };
  if (arrivalMinute >= cal.absentAfter) return { status: 'absent' };
  return { status: 'late', minutesLate: arrivalMinute - cal.attendanceDeadline };
}
