import { describe, expect, it } from 'vitest';
import { BodySystem, bodyShapeOf, fatPercent, maxMuscleKg, powerOf, settleDay } from '../src/engine/body';
import { createCharacter, type CreationInput, decayStats, RELEARN_MULTIPLIER, trainStat } from '../src/engine/character';
import { Random } from '../src/engine/core/Random';
import { GameClock, hm } from '../src/engine/time';

const input: CreationInput = {
  id: 'p',
  name: '민준',
  origin: 'normal',
  appearance: { eyes: 0, nose: 0, mouth: 0, faceShape: 0, hairStyle: 0, hairColor: 0 },
  allocation: { intelligence: 4, constitution: 4, skin: 4, hairResistance: 4, heightPotential: 4, bodyFrame: 4 },
  dice: false,
};
const make = () => createCharacter(input, new Random(3));

describe('신체 구성', () => {
  it('생성된 몸은 현실 범위 안', () => {
    const ch = make();
    expect(fatPercent(ch)).toBeGreaterThan(8);
    expect(fatPercent(ch)).toBeLessThan(25);
    expect(ch.body.muscleKg).toBeLessThan(maxMuscleKg(ch));
    expect(bodyShapeOf(ch)).toBe('normal');
  });

  it('많이 먹고 안 움직이면 지방이 는다', () => {
    const ch = make();
    const fat0 = ch.body.fatKg;
    for (let d = 0; d < 30; d++) {
      ch.body.today = { kcalIn: 3500, proteinG: 60, kcalExercise: 0, strengthMinutes: 0 };
      settleDay(ch, 1);
    }
    expect(ch.body.fatKg - fat0).toBeGreaterThan(1);
  });

  it('근력 운동 + 단백질 + 잠 = 근육 증가, 쉬면 다시 빠진다', () => {
    const ch = make();
    const m0 = ch.body.muscleKg;
    const day = (strength: number) => {
      ch.body.today = { kcalIn: 2900, proteinG: 110, kcalExercise: 300, strengthMinutes: strength };
      settleDay(ch, 1);
    };
    for (let d = 0; d < 60; d++) day(60);
    const trained = ch.body.muscleKg;
    expect(trained - m0).toBeGreaterThan(1.2);
    expect(powerOf(ch)).toBeGreaterThan(0);
    for (let d = 0; d < 60; d++) day(0);
    expect(ch.body.muscleKg).toBeLessThan(trained);
    expect(ch.body.muscleKg).toBeGreaterThanOrEqual(ch.body.naturalMuscleKg - 0.01);
  });

  it('성장기에 못 자고 못 먹으면 키를 다 못 채운다', () => {
    const good = make();
    const bad = make();
    good.growthRemainingCm = bad.growthRemainingCm = 6;
    const start = good.heightCm + good.growthRemainingCm;
    for (let d = 0; d < 520; d++) {
      good.body.today = { kcalIn: 2800, proteinG: 90, kcalExercise: 0, strengthMinutes: 0 };
      bad.body.today = { kcalIn: 1600, proteinG: 30, kcalExercise: 0, strengthMinutes: 0 };
      settleDay(good, 1);
      settleDay(bad, 0.6);
    }
    expect(good.growthRemainingCm).toBe(0);
    expect(good.heightCm).toBeCloseTo(start, 1);
    expect(bad.heightCm).toBeLessThan(good.heightCm - 1);
  });

  it('BodySystem: 먹고 운동하면 잠들 때 정산된다', () => {
    const ch = make();
    const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
    const body = new BodySystem(ch).attach(clock);
    let settled = 0;
    body.events.on('body:settled', () => settled++);
    body.eat('급식');
    body.exercise('weights', 60);
    expect(ch.body.today.strengthMinutes).toBe(60);
    clock.advanceTo(hm(23));
    clock.sleepUntil(hm(7));
    expect(settled).toBe(1);
    expect(ch.body.today.kcalIn).toBe(0);
  });
});

describe('스탯이 녹스는 규칙', () => {
  it('유예 기간엔 그대로, 지나면 빠지고, 최고치의 일정 비율 아래로는 안 떨어진다', () => {
    const ch = make();
    ch.stats.study = ch.peakStats.study = 60;
    ch.lastUsedDay.study = 0;
    decayStats(ch, 10);
    expect(ch.stats.study).toBe(60);
    for (let d = 15; d < 2000; d++) decayStats(ch, d);
    expect(ch.stats.study).toBeCloseTo(36); // 60 × 0.6
  });

  it('생활력은 거의 안 빠지고 지구력은 빨리 빠진다', () => {
    const ch = make();
    ch.stats.endurance = ch.peakStats.endurance = 50;
    ch.stats.streetSmart = ch.peakStats.streetSmart = 50;
    for (let d = 1; d <= 60; d++) decayStats(ch, d);
    expect(50 - ch.stats.endurance).toBeGreaterThan(10);
    expect(ch.stats.streetSmart).toBe(50);
  });

  it('예전 최고치 아래에선 다시 빨리 오른다', () => {
    const fresh = make();
    const rusty = make();
    fresh.stats.study = fresh.peakStats.study = 40;
    rusty.stats.study = 40;
    rusty.peakStats.study = 60;
    const a = trainStat(fresh, 'study', 1, 1, 0);
    const b = trainStat(rusty, 'study', 1, 1, 0);
    expect(b / a).toBeCloseTo(RELEARN_MULTIPLIER);
  });
});
