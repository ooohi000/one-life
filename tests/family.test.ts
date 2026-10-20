import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { Household, PARENT_TYPES, parentType, Runaway, type RunawayInput, sampleParent } from '../src/engine/family';
import { MemoryBank, World } from '../src/engine/memory';
import { createNpcProfile, NpcLife } from '../src/engine/npc';

const world = new World();
world.add({ id: 'kid', name: '민준', cue: '', manners: 0 });

function house(ids: string[]) {
  return new Household(
    'kid',
    ids.map((id, i) => {
      const m = new MemoryBank(`p${i}`);
      m.meet('kid', 0, '집', '가족', 1, 100);
      return { id: `p${i}`, role: i === 0 ? 'mom' : 'dad', type: parentType(id), traits: parentType(id).traits, memory: m };
    }),
    0.1,
  );
}

function year(h: Household, seed = 1) {
  const rng = new Random(seed);
  const child = new MemoryBank('kid');
  let hits = 0;
  let protectedCount = 0;
  for (let d = 1; d <= 365; d++) {
    const out = h.simulateDay({ rebellion: 0.6, neuroticism: 0.5, agreeableness: 0.5, stress: 50 }, { day: d, rng, world, child, observed: {} });
    hits += out.incidents.filter((x) => x === 'hit').length;
    if (out.intervention === 'protected') protectedCount++;
  }
  return { hits, protectedCount };
}

const base: RunawayInput = {
  fear: 0, attachment: 80, aversion: 0.05, incidentToday: null, clashToday: false, stress: 30,
  rebellion: 0.3, impulsivity: 0.4, belonging: 0.6, peerRanAway: false, parentsSearch: true, knowsHelp: true,
};

describe('부모 분포', () => {
  it('흔한 정도대로 뽑힌다: 상습 폭력형은 소수', () => {
    const rng = new Random(1);
    const n = 5000;
    let volatile = 0;
    for (let i = 0; i < n; i++) if (sampleParent(rng).type.id === 'volatile') volatile++;
    const w = PARENT_TYPES.find((p) => p.id === 'volatile')!.weight / PARENT_TYPES.reduce((s, p) => s + p.weight, 0);
    expect(volatile / n).toBeGreaterThan(w * 0.6);
    expect(volatile / n).toBeLessThan(w * 1.4);
  });
});

describe('집', () => {
  it('다정한 부모 둘인 집에서는 맞지 않는다', () => {
    expect(year(house(['warm', 'gruffLoving'])).hits).toBe(0);
  });

  it('폭력적인 부모와 사는 아이는 집이 싫어지고, 다른 부모가 막아서기도 한다', () => {
    const h = house(['warm', 'volatile']);
    const r = year(h);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.protectedCount).toBeGreaterThan(0);
    expect(h.aversion()).toBeGreaterThan(house(['warm', 'gruffLoving']).aversion());
  });
});

describe('가출', () => {
  it('맞은 날은 집을 나갈 위험이 크게 오른다', () => {
    expect(Runaway.dailyRisk({ ...base, incidentToday: 'hit', fear: 60, aversion: 0.7 })).toBeGreaterThan(Runaway.dailyRisk(base) * 50);
  });

  it('붙잡아 주는 사람이 있으면 덜 나간다', () => {
    const x = { ...base, aversion: 0.6, fear: 40 };
    expect(Runaway.dailyRisk({ ...x, attachment: 90 })).toBeLessThan(Runaway.dailyRisk({ ...x, attachment: 20 }));
  });

  it('밖에서의 날들은 언젠가 끝난다 (귀가·발견·쉼터)', () => {
    const rng = new Random(3);
    let ended = 0;
    for (let i = 0; i < 50; i++) {
      const r = new Runaway();
      r.leave(0, 30000, base, rng, '테스트');
      for (let d = 1; d < 120 && r.active; d++) r.step(d, base, rng);
      if (!r.active) ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(48);
  });

  it('주인공은 직접 고른다: 1388에 전화하면 쉼터로 간다', () => {
    const rng = new Random(4);
    const r = new Runaway();
    r.leave(0, 0, base, rng, '테스트');
    r.step(1, base, rng, 'call1388');
    expect(r.place).toBe('shelter');
    expect(r.everShelter).toBe(true);
  });
});

describe('집이 무서운 NPC', () => {
  it('저녁에 밖에서 더 오래 버틴다', () => {
    const outside = (aversion: number) => {
      const npc = new NpcLife(createNpcProfile('t', new Random(5)), { year: 2026, month: 3, day: 2 }, new Random(6));
      npc.homeAversion = aversion;
      for (let d = 0; d < 28; d++) npc.liveDay();
      return npc.timeline.filter((e) => e.place !== '집' && e.start >= 18 * 60).reduce((s, e) => s + (e.end - e.start), 0);
    };
    expect(outside(0.9)).toBeGreaterThan(outside(0));
  });
});

describe('주인공 가정과 콘텐츠 옵션', () => {
  it('주인공 집은 기본적으로 거친 가정이 나오지 않고, 직접 고르면 거친 가정에서만 나온다', () => {
    const rng = new Random(7);
    for (let i = 0; i < 2000; i++) expect(sampleParent(rng, { who: 'protagonist' }).type.harsh).toBeFalsy();
    for (let i = 0; i < 200; i++) expect(sampleParent(rng, { who: 'protagonistHard' }).type.harsh).toBe(true);
  });

  it('가정폭력 묘사를 끄면 폭력형 부모는 엄하고 차가운 부모가 되고, 손찌검이 사라진다', () => {
    const rng = new Random(8);
    for (let i = 0; i < 3000; i++) {
      const s = sampleParent(rng, { content: { domesticViolence: false } });
      expect(s.type.id).not.toBe('volatile');
      expect(s.traits.temper).toBeLessThanOrEqual(0.55);
    }
    // 술 마신 날에도 손은 안 댄다
    const h = new Household('kid', [{ id: 'p0', role: 'dad', type: parentType('volatile'), traits: parentType('volatile').traits, memory: new MemoryBank('p0') }], 0.1, { domesticViolence: false });
    expect(year(h).hits).toBe(0);
  });
});
