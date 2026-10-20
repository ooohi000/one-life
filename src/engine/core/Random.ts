/**
 * 시드 고정 난수(mulberry32). 같은 시드면 같은 인생이 나온다.
 * 버그 재현과 자동 시뮬레이션 비교에 필수라 Math.random()은 엔진에서 쓰지 않는다.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 0 이상 1 미만 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('빈 배열');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** 세이브용 */
  get seedState(): number {
    return this.state;
  }
}
