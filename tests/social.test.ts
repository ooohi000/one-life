import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { createNpcProfile, NpcLife } from '../src/engine/npc';
import { findGroups, FRIEND, RumorMill, SocialGraph, type SocialPerson } from '../src/engine/social';

const person = (id: string, o: Partial<SocialPerson> = {}): SocialPerson => ({
  id, name: id, cls: 0, power: 50, hangouts: ['pcbang'], traits: [],
  p: { conscientiousness: 0.5, extraversion: 0.6, neuroticism: 0.4, agreeableness: 0.6, impulsivity: 0.5 }, ...o,
});

describe('관계', () => {
  it('자주 어울리고 잘 맞으면 친구가 된다', () => {
    const g = new SocialGraph();
    g.add(person('a', { traits: ['gamer'] }));
    g.add(person('b', { traits: ['gamer'] }));
    const rng = new Random(1);
    for (let d = 0; d < 60; d++) g.hangOut('a', 'b', d, rng, 60);
    expect(g.mutual('a', 'b', FRIEND)).toBe(true);
  });
  it('상극(괴롭히는 애와 일진 사냥꾼)은 같이 있어도 안 친해진다', () => {
    const g = new SocialGraph();
    g.add(person('a', { traits: ['bully'], hangouts: ['karaoke'] }));
    g.add(person('b', { traits: ['vigilante'], hangouts: ['library'] }));
    const rng = new Random(2);
    for (let d = 0; d < 60; d++) g.hangOut('a', 'b', d, rng, 60);
    expect(g.rel('a', 'b')!.closeness).toBeLessThan(FRIEND);
  });
  it('안 만나면 멀어진다', () => {
    const g = new SocialGraph();
    g.add(person('a'));
    g.add(person('b'));
    g.event('a', 'b', 0, { closeness: 50 });
    for (let d = 1; d < 200; d++) g.decay(d);
    expect(g.rel('a', 'b')!.closeness).toBeLessThan(40);
  });
  it('친구끼리 뭉친 무리를 찾고, 특성으로 이름을 붙인다', () => {
    const g = new SocialGraph();
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) g.add(person(id, { traits: ['gamer'] }));
    for (const x of ids) for (const y of ids) if (x !== y) g.event(x, y, 0, { closeness: 60 });
    const gs = findGroups(g, new Random(3));
    expect(gs.length).toBe(1);
    expect(gs[0]!.label).toBe('겜돌이 무리');
  });
  it('소문은 친한 사이를 타고 퍼지고, 부풀고, 시선을 바꾼다', () => {
    const g = new SocialGraph();
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
    for (const id of ids) g.add(person(id));
    const rng = new Random(4);
    for (const x of ids) for (let k = 0; k < 4; k++) {
      const y = rng.pick(ids);
      if (y !== x) { g.event(x, y, 0, { closeness: 45 }); g.event(y, x, 0, { closeness: 45 }); }
    }
    const mill = new RumorMill(g);
    mill.start({ id: 'r', about: 'p0', true: false, juicy: 0.9, day: 0, effect: { respect: -5 }, versions: ['한 버전', '두 버전', '세 버전'] }, ['p1']);
    for (let d = 1; d < 20; d++) mill.spread(d, rng);
    expect(mill.reach('r')).toBeGreaterThan(10);
    const versions = ids.map((x) => mill.knows('r', x)?.version ?? -1);
    expect(Math.max(...versions)).toBeGreaterThan(0);
    expect(ids.some((x) => (g.rel(x, 'p0')?.respect ?? 0) < 0)).toBe(true);
  });
  it('NPC 하루에 실제 친구 관계로 계산한 소속감을 꽂을 수 있다', () => {
    const npc = new NpcLife(createNpcProfile('t', new Random(5)), { year: 2026, month: 3, day: 2 }, new Random(6));
    npc.socialBelonging = () => 0.9;
    expect(npc.belonging()).toBe(0.9);
    npc.socialBelonging = () => 0;
    expect(npc.lonelinessFloor()).toBeGreaterThan(70);
  });
});
