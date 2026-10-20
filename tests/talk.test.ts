import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { ParentTalk, type TalkChoice } from '../src/engine/dialogue';
import { parentType } from '../src/engine/family';
import { MemoryBank, World } from '../src/engine/memory';

function setup(typeId: string, need = 0.1) {
  const world = new World();
  world.add({ id: 'me', name: '민준', cue: '', manners: 0 });
  world.add({ id: 'jiho', name: '지호', cue: '안경 쓴 애', manners: 0.4 });
  const mem = new MemoryBank('p');
  mem.meet('me', 0, '집', '가족', 1, 100);
  const child = new MemoryBank('me');
  child.meet('jiho', 0, '학교', '같은 반', 0.9);
  child.learn('jiho', 'livesIn', '목동', 'told', 0);
  const p = new ParentTalk('p', 'mom', 'me', mem, parentType(typeId).traits, need);
  return { world, mem, child, p };
}

/** 1년 동안 무작위로 말 걸기 */
function year(typeId: string, seed = 3) {
  const { world, child, p } = setup(typeId);
  const rng = new Random(seed);
  let stress = 0;
  for (let d = 1; d <= 365; d++) {
    for (let i = 0; i < 2; i++) {
      const x = rng.next();
      const c: TalkChoice = x < 0.6 ? { kind: 'chat' } : x < 0.75 ? { kind: 'worry' } : x < 0.9 ? { kind: 'care' } : { kind: 'talkBack' };
      stress += p.talk(c, { day: d, rng, world, child, observed: { darkCircles: rng.chance(0.3) } }).childStress;
    }
  }
  return { p, stress };
}

describe('부모와 대화', () => {
  it('자꾸 말 걸면 귀찮아한다', () => {
    const { world, child, p } = setup('warm');
    const rng = new Random(1);
    const rs = Array.from({ length: 10 }, () => p.talk({ kind: 'chat' }, { day: 1, rng, world, child, observed: {} }));
    expect(rs[0]!.engaged).toBe(true);
    expect(rs.at(-1)!.engaged).toBe(false);
  });

  it('아이가 해 준 친구 얘기를 부모가 기억한다 (처음 듣는 친구도)', () => {
    const { world, mem, child, p } = setup('warm');
    const r = p.talk({ kind: 'tellFriend', friendId: 'jiho', key: 'livesIn' }, { day: 2, rng: new Random(2), world, child, observed: {} });
    expect(r.lines.some((l) => l.text.includes('처음 듣는 이름'))).toBe(true);
    expect(mem.knows('jiho', 'livesIn')?.value).toBe('목동');
    expect(mem.people.get('jiho')?.seen).toBe(false);
  });

  it('같은 잔소리가 반복되면 부모도 반복인 걸 안다', () => {
    const { world, child, p } = setup('pushy');
    const rng = new Random(5);
    const texts: string[] = [];
    for (let d = 1; d <= 13; d++) {
      const r = p.talk({ kind: 'chat' }, { day: d, rng, world, child, observed: { darkCircles: true } });
      texts.push(...r.lines.map((l) => l.text));
    }
    expect(texts.some((t) => t.startsWith('몇 번을 말하니') || t.startsWith('저번에도'))).toBe(true);
  });

  it('형편이 어려운 집은 용돈을 주기 어렵다', () => {
    const got = (need: number) => {
      const { world, child, p } = setup('warm', need);
      const rng = new Random(9);
      let m = 0;
      for (let d = 0; d < 200; d += 10) m += p.talk({ kind: 'askMoney', amount: 30000 }, { day: d, rng, world, child, observed: {} }).money;
      return m;
    };
    expect(got(0.8)).toBeLessThan(got(0.1) * 0.6);
  });

  it('무뚝뚝하지만 아끼는 부모: 말로는 거절해도 다음 날 행동으로 챙긴다', () => {
    const { world, child, p } = setup('gruffLoving');
    const rng = new Random(4);
    let d = 1;
    // 집에 있는 날 부탁할 때까지
    for (; d < 20; d++) {
      const r = p.talk({ kind: 'askMoney', amount: 30000 }, { day: d, rng, world, child, observed: {} });
      if (r.lines.some((l) => l.text.includes('한테 달라 해'))) {
        expect(r.money).toBe(0);
        break;
      }
    }
    let later = 0;
    for (d++; d < 40 && later === 0; d++) later += p.talk({ kind: 'chat' }, { day: d, rng, world, child, observed: {} }).money;
    expect(later).toBeGreaterThan(0);
  });

  it('유형마다 1년 뒤 애착이 다르다: 다정함 > 비교 > 방임, 폭력은 두려움을 남긴다', () => {
    const warm = year('warm').p;
    const pushy = year('pushy').p;
    const neglect = year('neglectful').p;
    const volatile = year('volatile').p;
    expect(warm.attachment).toBeGreaterThan(pushy.attachment);
    expect(warm.attachment).toBeGreaterThan(neglect.attachment);
    expect(volatile.incidents.yelled + volatile.incidents.hit).toBeGreaterThan(0);
    expect(volatile.fear).toBeGreaterThan(30);
    expect(warm.fear).toBe(0);
    expect(warm.incidents.hit).toBe(0);
  });

  it('폭력 뒤에는 도움을 청할 선택지가 뜬다', () => {
    const { world, child, p } = setup('volatile');
    const rng = new Random(8);
    let help = false;
    for (let d = 1; d < 60 && !help; d++) {
      for (let i = 0; i < 3; i++) if (p.talk({ kind: 'talkBack' }, { day: d, rng, world, child, observed: {} }).help) help = true;
    }
    expect(help).toBe(true);
  });
});
