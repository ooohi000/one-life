import { describe, expect, it } from 'vitest';
import { CarryState, shareUmbrella } from '../src/engine/carry';
import { Random } from '../src/engine/core/Random';
import type { Weather } from '../src/engine/env';

const w = (sky: Weather['sky'], high = 20): Weather => ({ date: { year: 2026, month: 7, day: 3 }, season: 'summer', sky, low: high - 7, high, dust: 'good', notes: [], outdoor: 0.5, outfit: 1 });

describe('몸에 지닌 것', () => {
  it('한 손엔 우산, 한 손엔 짐이면 폰을 못 꺼낸다', () => {
    const c = new CarryState('a');
    for (const i of ['phone', 'cheapUmbrella', 'tteokbokki']) c.take(i);
    c.openUmbrella();
    expect(c.pullOutPhone().ok).toBe(false);
    expect(c.can('usePhone').ok).toBe(false);
  });
  it('두 손 짐은 다른 걸 못 들게 하고 걸음이 느려진다', () => {
    const c = new CarryState('a');
    c.take('parcel');
    expect(c.freeHands()).toBe(0);
    expect(c.take('coffee').ok).toBe(false);
    expect(c.walkSpeed()).toBeLessThan(1);
  });
  it('가방을 메야 가방 칸이 생기고, 꽉 차면 안 들어간다', () => {
    const c = new CarryState('a');
    expect(c.take('textbooks', 'bag').ok).toBe(true); // 가방이 없으니 손으로
    expect(c.holding('textbooks')).toBeTruthy();
    const d = new CarryState('b');
    d.take('crossbag');
    expect(d.take('laptop', 'bag').ok).toBe(true);
    expect(d.take('textbooks', 'bag').ok && d.bag.some((x) => x.id === 'textbooks')).toBe(false);
  });
  it('우산 없이 비를 맞으면 젖고, 펴면 덜 젖는다. 태풍엔 우산도 소용없다', () => {
    const rng = new Random(1);
    const a = new CarryState('a');
    a.outside(20, w('rain'), rng);
    const b = new CarryState('b');
    b.take('umbrella');
    b.openUmbrella();
    b.outside(20, w('rain'), rng);
    const t = new CarryState('t');
    t.take('umbrella');
    t.openUmbrella();
    t.outside(20, w('typhoon'), rng);
    expect(b.bodyWet).toBeLessThan(a.bodyWet);
    expect(t.bodyWet).toBeGreaterThan(b.bodyWet);
  });
  it('손에 든 폰은 비에 고장날 수 있고, 가방 속은 덜 젖는다', () => {
    let handBroken = 0, bagBroken = 0;
    for (let i = 0; i < 200; i++) {
      const rng = new Random(i);
      const a = new CarryState('a');
      a.take('phone', 'right');
      a.outside(40, w('monsoon'), rng);
      if (a.all().some((x) => x.id === 'phone' && x.broken)) handBroken++;
      const b = new CarryState('b');
      b.take('backpack');
      b.take('phone', 'bag');
      b.outside(40, w('monsoon'), rng);
      if (b.all().some((x) => x.id === 'phone' && x.broken)) bagBroken++;
    }
    expect(handBroken).toBeGreaterThan(bagBroken);
  });
  it('지갑 없으면 계산 못 하고, 열쇠 없으면 못 들어간다', () => {
    const c = new CarryState('a');
    c.take('phone');
    expect(c.can('pay').ok).toBe(false);
    expect(c.can('enterHome').ok).toBe(false);
  });
  it('우산을 같이 쓰면 가까워진다', () => {
    const a = new CarryState('a');
    a.take('umbrella');
    a.openUmbrella();
    expect(shareUmbrella(a, new CarryState('b'), 20).closenessGain).toBeGreaterThan(0);
  });
});
