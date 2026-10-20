import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { City, WeatherSystem } from '../src/engine/env';
import { addDays } from '../src/engine/time/calendar';
import { createNpcProfile, NpcLife } from '../src/engine/npc';

describe('날씨', () => {
  it('어느 날을 먼저 불러도 같은 날씨 (저장·재현)', () => {
    const a = new WeatherSystem(3);
    const b = new WeatherSystem(3);
    const d = { year: 2026, month: 8, day: 10 };
    const x = a.today(d);
    for (let i = 0; i < 40; i++) b.today(addDays(d, -i));
    expect(b.today(d).high).toBe(x.high);
    expect(b.today(d).sky).toBe(x.sky);
  });
  it('여름은 덥고 겨울은 춥고, 장마철엔 비가 많다', () => {
    const w = new WeatherSystem(5);
    const month = (m: number) => Array.from({ length: 28 }, (_, i) => w.today({ year: 2026, month: m, day: i + 1 }));
    const avg = (xs: ReturnType<typeof month>) => xs.reduce((s, x) => s + x.high, 0) / xs.length;
    expect(avg(month(8))).toBeGreaterThan(26);
    expect(avg(month(1))).toBeLessThan(5);
    const wet = (xs: ReturnType<typeof month>) => xs.filter((x) => x.sky !== 'clear' && x.sky !== 'cloudy').length;
    expect(wet(month(7))).toBeGreaterThan(wet(month(10)));
  });
  it('비 오는 날 NPC는 운동장보다 실내로 간다', () => {
    const soccer = (outdoor: number) => {
      let n = 0;
      for (let s = 0; s < 15; s++) {
        const npc = new NpcLife(createNpcProfile(`t${s}`, new Random(s)), { year: 2026, month: 3, day: 7 }, new Random(s + 1));
        npc.outdoor = outdoor;
        for (let d = 0; d < 8; d++) npc.liveDay();
        n += npc.timeline.filter((e) => e.place === '운동장').length;
      }
      return n;
    };
    expect(soccer(0.1)).toBeLessThan(soccer(1));
  }, 30000);
});

describe('도시', () => {
  it('10년이면 공사가 끝나 입주하고, 가게는 바뀐다', () => {
    const c = new City(new Random(1), 2);
    const before = c.openShops(0).map((s) => s.id);
    for (let d = 0; d < 3650; d++) c.step(d);
    expect(c.log.some((e) => e.text.includes('문을 열었다') || e.text.includes('입주'))).toBe(true);
    const after = c.openShops(0).map((s) => s.id);
    expect(after.filter((x) => before.includes(x)).length).toBeLessThan(before.length);
  });
});
