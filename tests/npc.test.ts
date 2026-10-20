import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { ACTIONS, type ActionDef, type BrainContext, createNpcProfile, NpcLife, randomPersonality, scoreAction } from '../src/engine/npc';

const START = { year: 2026, month: 3, day: 2 };
const act = (id: string) => ACTIONS.find((a) => a.id === id) as ActionDef;
const ctx = (over: Partial<BrainContext> = {}): BrainContext => ({
  p: { conscientiousness: 0.5, extraversion: 0.5, neuroticism: 0.5, agreeableness: 0.5, impulsivity: 0.5 },
  goals: {},
  stress: 30,
  loneliness: 30,
  boredom: 30,
  drowsiness: 0,
  ...over,
});

describe('NPC 두뇌', () => {
  it('공부가 목표면 공부 점수가, 놀기가 목표면 PC방 점수가 높다', () => {
    const grade = ctx({ goals: { grades: 1 } });
    const fun = ctx({ goals: { fun: 1 } });
    expect(scoreAction(act('selfStudy'), grade)).toBeGreaterThan(scoreAction(act('pcbang'), grade));
    expect(scoreAction(act('pcbang'), fun)).toBeGreaterThan(scoreAction(act('selfStudy'), fun));
  });

  it('스트레스가 차오르면 목표보다 해소 행동이 이긴다', () => {
    const calm = ctx({ goals: { grades: 1 }, stress: 10 });
    const burned = ctx({ goals: { grades: 1 }, stress: 95, p: { ...ctx().p, neuroticism: 0.9 } });
    const gap = (c: BrainContext) => scoreAction(act('selfStudy'), c) - scoreAction(act('karaoke'), c);
    expect(gap(calm)).toBeGreaterThan(gap(burned));
  });

  it('같은 행동을 반복할수록 끌림이 준다', () => {
    expect(scoreAction(act('pcbang'), ctx({ doneToday: { pcbang: 2 } }))).toBeLessThan(scoreAction(act('pcbang'), ctx()));
  });

  it('외향적인 사람은 외로움을 사람 만나서 푼다', () => {
    const lonely = { loneliness: 90 };
    const extro = ctx({ ...lonely, p: { ...ctx().p, extraversion: 0.9 } });
    const intro = ctx({ ...lonely, p: { ...ctx().p, extraversion: 0.1 } });
    expect(scoreAction(act('hangout'), extro)).toBeGreaterThan(scoreAction(act('hangout'), intro));
  });
});

describe('NPC 생활', () => {
  const live = (seed: number, days: number) => {
    const npc = new NpcLife(createNpcProfile('t', new Random(seed)), START, new Random(seed + 1));
    for (let d = 0; d < days; d++) npc.liveDay();
    return npc;
  };

  it('같은 시드면 같은 인생', () => {
    const a = live(9, 14);
    const b = live(9, 14);
    expect(a.timeline).toEqual(b.timeline);
    expect(a.ch.body.weightKg).toBeCloseTo(b.ch.body.weightKg);
  });

  it('학교 가는 날 밤에는 통금 이후 밖에 있지 않다(아주 충동적인 PC방 예외)', () => {
    for (let s = 0; s < 30; s++) {
      const npc = live(100 + s, 7);
      for (const e of npc.timeline) {
        if (e.place === '집' || e.place === '학교' || e.action === 'PC방') continue;
        // 3/2~3/6 등교일, 밤 10시 + 30분 여유
        if (e.dayIndex <= 4 && e.dayIndex !== 5) {
          const nextIsSchool = e.dayIndex <= 3;
          if (nextIsSchool) expect(e.end).toBeLessThanOrEqual(22 * 60 + 30);
        }
      }
    }
  });

  it('행동이 겹치지 않고 시간 순서대로 이어진다', () => {
    const npc = live(5, 7);
    for (let i = 1; i < npc.timeline.length; i++) {
      const prev = npc.timeline[i - 1]!;
      const cur = npc.timeline[i]!;
      if (prev.dayIndex === cur.dayIndex) expect(cur.start).toBeGreaterThanOrEqual(prev.end);
    }
  });

  it('성격이 다양하게 나온다', () => {
    const rng = new Random(3);
    const ps = Array.from({ length: 300 }, () => randomPersonality(rng));
    const c = ps.map((p) => p.conscientiousness);
    expect(Math.min(...c)).toBeLessThan(0.2);
    expect(Math.max(...c)).toBeGreaterThan(0.8);
  });
});

import { buildLifeGoals, LIFE_STATES, randomAttitudes, splitGoals } from '../src/engine/npc';

describe('복합 목표', () => {
  const base = { conscientiousness: 0.5, extraversion: 0.8, neuroticism: 0.5, agreeableness: 0.3, impulsivity: 0.6 };
  it('부모 기대가 크면 부모가 정한 목표가 생기고, 충돌하는 꿈은 비밀이 된다', () => {
    let parents = 0, secret = 0;
    for (let s = 0; s < 300; s++) {
      const rng = new Random(s);
      const att = randomAttitudes(base, 'rich', 0.9, rng);
      const goals = buildLifeGoals(base, att, 'rich', 0.9, rng);
      if (goals.some((g) => g.source === 'parents')) parents++;
      const sec = goals.find((g) => g.secret);
      if (sec) {
        secret++;
        expect(['artist', 'proGamer', 'influencer', 'fun', 'romance', 'dominance']).toContain(sec.goal);
      }
    }
    expect(parents).toBeGreaterThan(200);
    expect(secret).toBeGreaterThan(30);
  });

  it('좋아서 하는 목표는 의지력이 필요 없는 쪽으로 분류된다', () => {
    const { disciplined, intrinsic } = splitGoals([
      { goal: 'grades', weight: 1, motive: 'fear', source: 'parents', secret: false },
      { goal: 'artist', weight: 0.8, motive: 'joy', source: 'self', secret: true },
    ]);
    expect(disciplined.grades).toBe(1);
    expect(intrinsic.artist).toBe(0.8);
    expect(disciplined.artist).toBeUndefined();
  });

  it('좋아서 하는 목표는 자제력이 낮아도 끌린다', () => {
    const lazy = { ...base, conscientiousness: 0.1, impulsivity: 0.9 };
    const viaJoy = scoreAction(act('practiceRoom'), ctx({ p: lazy, goals: {}, intrinsicGoals: { artist: 1 } }));
    const viaDuty = scoreAction(act('practiceRoom'), ctx({ p: lazy, goals: { artist: 1 } }));
    expect(viaJoy).toBeGreaterThan(viaDuty);
  });

  it('은둔 상태는 밖으로 나가는 행동을 막는다', () => {
    const w = LIFE_STATES.find((d) => d.id === 'withdrawn')!;
    expect(w.blocks?.(act('pcbang'))).toBe(true);
    expect(w.blocks?.(act('phone'))).toBe(false);
  });
});
