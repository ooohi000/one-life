import type { GameClock } from '../time/GameClock';
import { decayStats } from './stats';
import type { Character } from './types';

/** 하루가 지날 때마다 스탯이 녹스는 것을 처리한다. */
export class CharacterSystem {
  private off: (() => void) | null = null;

  constructor(private readonly ch: Character) {}

  attach(clock: GameClock): this {
    this.off = clock.events.on('time:dayChanged', (e) => decayStats(this.ch, e.dayIndex));
    return this;
  }

  detach(): void {
    this.off?.();
    this.off = null;
  }
}
