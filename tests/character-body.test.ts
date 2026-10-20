import { describe, expect, it } from 'vitest';
import { BodySystem } from '../src/engine/body';
import {
  CREATION_POINTS,
  createCharacter,
  type CreationInput,
  randomCreationInput,
  trainStat,
  validateAllocation,
} from '../src/engine/character';
import { Random } from '../src/engine/core/Random';
import { GameClock, hm } from '../src/engine/time';

const base: CreationInput = {
  id: 'p1',
  name: '민준',
  origin: 'normal',
  appearance: { eyes: 0, nose: 0, mouth: 0, faceShape: 0, hairStyle: 0, hairColor: 0 },
  allocation: { intelligence: 4, constitution: 4, skin: 4, hairResistance: 4, heightPotential: 4, bodyFrame: 4 },
  dice: false,
};

describe('캐릭터 생성', () => {
  it('포인트 합이 안 맞으면 거부', () => {
    expect(validateAllocation({ intelligence: 3 })).toMatchObject({ code: 'pointsMismatch', expected: CREATION_POINTS });
    expect(validateAllocation({ intelligence: 10, constitution: 14 })).toMatchObject({ code: 'outOfRange' });
    expect(() => createCharacter({ ...base, allocation: {} }, new Random(1))).toThrow();
  });

  it('같은 시드면 같은 캐릭터 (주사위 포함)', () => {
    const a = createCharacter({ ...base, dice: true }, new Random(42));
    const b = createCharacter({ ...base, dice: true }, new Random(42));
    expect(a).toEqual(b);
  });

  it('출신은 재능이 아니라 출발선만 바꾼다', () => {
    const rich = createCharacter({ ...base, origin: 'rich' }, new Random(1));
    const poor = createCharacter({ ...base, origin: 'poor' }, new Random(1));
    expect(rich.innate).toEqual(poor.innate);
    expect(rich.stats.study).toBeGreaterThan(poor.stats.study);
    expect(poor.stats.streetSmart).toBeGreaterThan(rich.stats.streetSmart);
  });

  it('현실 모드 랜덤 입력은 항상 유효', () => {
    const rng = new Random(7);
    for (let i = 0; i < 200; i++) {
      expect(validateAllocation(randomCreationInput(`n${i}`, 'npc', rng).allocation)).toBeNull();
    }
  });
});

describe('스탯 성장', () => {
  it('높을수록 덜 오르고, 컨디션이 나쁘면 덜 오른다', () => {
    const ch = createCharacter(base, new Random(1));
    ch.stats.study = 20;
    const low = trainStat(ch, 'study', 1, 1, 0);
    ch.stats.study = 90;
    const high = trainStat(ch, 'study', 1, 1, 0);
    ch.stats.study = 20;
    const tired = trainStat(ch, 'study', 1, 0.5, 0);
    expect(low).toBeGreaterThan(high);
    expect(tired).toBeCloseTo(low / 2);
  });
});

describe('몸 상태', () => {
  const setup = () => {
    const ch = createCharacter(base, new Random(1));
    const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
    const body = new BodySystem(ch).attach(clock);
    return { ch, clock, body };
  };

  it('덜 자면 수면 부채가 쌓이고 다크서클이 생긴다', () => {
    const { ch, clock, body } = setup();
    const appeared: string[] = [];
    body.events.on('body:symptomAppeared', (e) => appeared.push(e.symptom.id));
    for (let d = 0; d < 3; d++) {
      clock.advanceTo(hm(2)); // 새벽 2시까지 깨어 있음
      clock.sleepUntil(hm(7)); // 5시간 수면
    }
    expect(ch.body.sleepDebtMin).toBeGreaterThanOrEqual(180);
    expect(appeared).toContain('darkCircles');
    expect(body.condition()).toBeLessThan(1);
  });

  it('충분히 자면 부채가 줄어든다(절반 속도)', () => {
    const { ch, clock } = setup();
    ch.body.sleepDebtMin = 300;
    clock.advanceTo(hm(22));
    clock.sleepUntil(hm(10)); // 12시간
    expect(ch.body.sleepDebtMin).toBeLessThan(300);
    expect(ch.body.sleepDebtMin).toBeGreaterThan(0);
  });

  it('밤을 새우면 쓰러지고, 부채가 많으면 더 일찍 쓰러진다', () => {
    const fresh = setup();
    const tired = setup();
    tired.ch.body.sleepDebtMin = 300;
    expect(tired.body.minutesUntilCollapse()).toBeLessThan(fresh.body.minutesUntilCollapse());

    let collapsed = 0;
    fresh.body.events.on('body:collapsed', () => collapsed++);
    fresh.clock.advance(fresh.body.minutesUntilCollapse());
    expect(collapsed).toBe(1);
    expect(fresh.body.drowsiness).toBeGreaterThanOrEqual(100);
  });

  it('부채가 아무리 커도 일어나자마자 쓰러지지는 않는다', () => {
    const { ch, body } = setup();
    ch.body.sleepDebtMin = 20 * 60;
    ch.body.minutesAwake = 0;
    expect(body.drowsiness).toBeLessThan(100);
    expect(body.minutesUntilCollapse()).toBeGreaterThanOrEqual(12 * 60);
  });
});
