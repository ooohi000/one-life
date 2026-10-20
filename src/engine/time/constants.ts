export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** 시:분 → 하루 중 분. hm(8, 30) = 510 */
export const hm = (hour: number, minute = 0) => hour * MINUTES_PER_HOUR + minute;

/** 510 → "08:30" */
export function formatClock(minuteOfDay: number): string {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * 하루의 시간대.
 * 등교일: 아침 → 수업 → 방과 후 → 저녁 → 밤
 * 쉬는 날: 아침 → 낮 → 저녁 → 밤
 */
export type TimeSlot = 'morning' | 'class' | 'afterSchool' | 'daytime' | 'evening' | 'night';

export const SLOT_LABEL_KO: Record<TimeSlot, string> = {
  morning: '아침',
  class: '수업',
  afterSchool: '방과 후',
  daytime: '낮',
  evening: '저녁',
  night: '밤',
};

/** 옵션의 시간 속도. 값 = 게임 1분이 흐르는 데 걸리는 실제 밀리초 */
export type TimeSpeed = 'slow' | 'normal' | 'fast';
export const MS_PER_GAME_MINUTE: Record<TimeSpeed, number> = {
  slow: 1000,
  normal: 700,
  fast: 350,
};
