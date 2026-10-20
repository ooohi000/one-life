/**
 * 게임 달력. JS Date에 의존하지 않고 정수 계산만 쓴다(세이브/재현성 보장).
 * 날짜 ↔ 일련번호 변환은 Howard Hinnant의 civil 알고리즘.
 */
export interface GameDate {
  readonly year: number;
  readonly month: number; // 1~12
  readonly day: number; // 1~31
}

/** 0 = 일요일 ... 6 = 토요일 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

const fdiv = (a: number, b: number) => Math.floor(a / b);

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 1970-01-01 기준 일련번호 */
export function toDayNumber({ year, month, day }: GameDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = fdiv(y, 400);
  const yoe = y - era * 400;
  const doy = fdiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1;
  const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): GameDate {
  const z = n + 719468;
  const era = fdiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
  const mp = fdiv(5 * doy + 2, 153);
  const day = doy - fdiv(153 * mp + 2, 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function addDays(date: GameDate, days: number): GameDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function weekdayOf(date: GameDate): Weekday {
  // 1970-01-01은 목요일(4)
  return (((toDayNumber(date) + 4) % 7) + 7) % 7 as Weekday;
}

export function isWeekend(date: GameDate): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

export function compareDates(a: GameDate, b: GameDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** "3월 2일 (월)" */
export function formatDate(date: GameDate): string {
  return `${date.month}월 ${date.day}일 (${WEEKDAY_KO[weekdayOf(date)]})`;
}
