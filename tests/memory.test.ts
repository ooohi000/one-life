import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { converse } from '../src/engine/dialogue';
import { FORGOTTEN, josa, MemoryBank, NAME_RECALL, tell, World } from '../src/engine/memory';

function setup() {
  const world = new World();
  world.add({ id: 'me', name: '민준', cue: '', manners: 0 });
  world.add({ id: 'seojun', name: '서준', cue: '키 큰 애', manners: 0.7 });
  const mom = new MemoryBank('mom');
  const boy = new MemoryBank('me');
  mom.meet('me', 0, '집', '가족', 1, 100);
  boy.meet('seojun', 0, '학교', '같은 반', 0.9);
  return { world, mom, boy };
}

describe('기억', () => {
  it('진하게 만난 사람이 스친 사람보다 오래 기억된다', () => {
    const m = new MemoryBank('a');
    m.meet('x', 0, '집', '집에 놀러 왔던', 0.8);
    m.meet('y', 0, '학교', '운동회', 0.25);
    expect(m.strengthAt('x', 365)).toBeGreaterThan(m.strengthAt('y', 365) * 2);
    expect(m.strengthAt('y', 1500)).toBeLessThan(FORGOTTEN);
  });

  it('이름을 잊으면 겉모습 단서로 부르고, 완전히 잊으면 언급하지 않는다', () => {
    const { world, mom } = setup();
    mom.meet('seojun', 0, '집', '집에 놀러 왔던', 0.5);
    expect(mom.referTo('seojun', 1, world)).toEqual({ text: '서준이', byName: true });
    let d = 1;
    while (mom.strengthAt('seojun', d) >= NAME_RECALL) d += 10;
    expect(mom.referTo('seojun', d, world)?.text).toBe('그때 우리 집 왔던 키 큰 애');
    while (mom.strengthAt('seojun', d) >= FORGOTTEN) d += 30;
    expect(mom.referTo('seojun', d, world)).toBeNull();
  });

  it('얘기를 들으면 기억이 되살아난다', () => {
    const m = new MemoryBank('a');
    m.meet('x', 0, '집', '집에 놀러 왔던', 0.6);
    const before = m.strengthAt('x', 700);
    m.hear('x', 700);
    expect(m.strengthAt('x', 700)).toBeGreaterThan(before);
  });

  it('모르는 사람의 소문은 남지 않고, 직접 본 게 소문보다 우선한다', () => {
    const { mom, boy } = setup();
    boy.learn('seojun', 'university', '한울대', 'told', 10);
    expect(tell(boy, mom, 'seojun', 'university', 11, true)).toBe(false);
    mom.meet('seojun', 12, '집', '집에 놀러 왔던', 0.8);
    mom.learn('seojun', 'university', '한울대', 'saw', 13);
    mom.learn('seojun', 'university', '한울대', 'rumor', 14);
    expect(mom.knows('seojun', 'university')?.source).toBe('saw');
  });

  it('조사', () => {
    expect(josa('서준이', '은는')).toBe('서준이는');
    expect(josa('청림대', '이가')).toBe('청림대가');
    expect(josa('지훈', '이가')).toBe('지훈이');
  });
});

describe('대화', () => {
  it('모르는 소식은 묻고, 들은 건 기억해서 다음에 전한다 / 같은 비교를 되풀이하지 않는다', () => {
    const { world, mom, boy } = setup();
    mom.meet('seojun', 60, '집', '집에 놀러 왔던', 0.8, 20);
    world.setFact('seojun', 'university', '한울대', 1000);
    world.setFact('me', 'university', '늘봄대', 1000);
    mom.learn('me', 'university', '늘봄대', 'saw', 1000);
    boy.learn('seojun', 'university', '한울대', 'told', 1000);
    const rng = new Random(1);
    const style = { warmth: 0.2, expectation: 0.9 };
    const base = { world, rng, speakerId: 'mom', speaker: mom, style, listenerId: 'me', listener: boy };

    const r1 = converse({ ...base, day: 1010 });
    expect(r1.topics).toContain('askMilestone:seojun');
    expect(mom.knows('seojun', 'university')?.value).toBe('한울대');

    const r2 = converse({ ...base, day: 1017 });
    expect(r2.topics).toContain('compare:seojun');
    expect(r2.listenerStress).toBeGreaterThan(5);

    const r3 = converse({ ...base, day: 1400 });
    expect(r3.topics).not.toContain('compare:seojun');
  });

  it('아직 일어나지 않은 일은 묻지 않는다', () => {
    const { world, mom, boy } = setup();
    mom.meet('seojun', 60, '집', '집에 놀러 왔던', 0.8);
    world.setFact('seojun', 'job', '청림그룹', 3000);
    const r = converse({ world, day: 1000, rng: new Random(2), speakerId: 'mom', speaker: mom, style: { warmth: 0.5, expectation: 0.5 }, listenerId: 'me', listener: boy });
    expect(r.topics.some((t) => t.startsWith('askMilestone'))).toBe(false);
  });

  it('따뜻한 엄마는 비교해도 덜 아프게 말한다', () => {
    const stressFor = (warmth: number) => {
      const { world, mom, boy } = setup();
      mom.meet('seojun', 60, '집', '집에 놀러 왔던', 0.8);
      mom.learn('seojun', 'university', '한울대', 'told', 1000);
      mom.learn('me', 'university', '늘봄대', 'saw', 1000);
      return converse({ world, day: 1001, rng: new Random(3), speakerId: 'mom', speaker: mom, style: { warmth, expectation: 0.8 }, listenerId: 'me', listener: boy }).listenerStress;
    };
    expect(stressFor(0.9)).toBeLessThan(stressFor(0.2));
  });
});
