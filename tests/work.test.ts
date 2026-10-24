import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { autoHand, ConvenienceShift, newJob, payday, resolvePayday, type Worker } from '../src/engine/work';
import { MIN_WAGE } from '../src/engine/npc/actions';

const me: Worker = { id: 'me', name: '민준', age: 17, tact: 40, streetSmart: 40, speech: 40, condition: 0.9 };

function run(job = newJob(new Random(1)), w = me, seed = 1, pick = (_: string) => 0) {
  const rng = new Random(seed);
  const s = new ConvenienceShift(job, w, rng, [{ id: 'b', name: '강주원', age: 17, relation: 'bully' }]);
  while (!s.done) {
    if (s.dilemma) { s.decide(s.dilemma.options[pick(s.dilemma.kind)]?.id ?? s.dilemma.options[0]!.id); continue; }
    const t = s.tasks.find((x) => x.kind === 'checkout') ?? s.tasks[0];
    if (t) s.perform(t.id, autoHand(w, job, t, rng)); else s.tick();
  }
  return s.finish();
}

describe('편의점 근무', () => {
  it('청소년 근무는 밤 10시 전에 끝나고, 시급만큼 번다', () => {
    const job = newJob(new Random(2));
    job.hourly = MIN_WAGE;
    const r = run(job);
    expect(r.minutes).toBe(240);
    expect(r.wage).toBeGreaterThanOrEqual(4 * MIN_WAGE);
    expect(r.customers).toBeGreaterThan(40);
  });
  it('손이 익고 몸 상태가 좋을수록 손님이 덜 화낸다', () => {
    const fresh = newJob(new Random(3));
    const vet = { ...newJob(new Random(3)), shifts: 30 };
    let a = 0, b = 0;
    for (let i = 0; i < 5; i++) {
      a += run({ ...fresh, shifts: 0 }, { ...me, condition: 0.3 }, 10 + i).leftAngry;
      b += run({ ...vet }, me, 10 + i).leftAngry;
    }
    expect(b).toBeLessThan(a);
  });
  it('미성년자에게 담배·술을 팔면 위반으로 남는다', () => {
    let violations = 0;
    for (let i = 0; i < 20; i++) violations += run(newJob(new Random(4)), me, 100 + i, (k) => (k === 'idCheck' ? 1 : 0)).violations.filter((v) => v.includes('청소년')).length;
    expect(violations).toBeGreaterThan(0);
  });
  it('주 15시간 넘게 일하면 주휴수당, 짠돌이 사장은 떼먹기도 한다 → 신고하면 받아 내지만 잘린다', () => {
    const job = { ...newJob(new Random(5)), boss: 'stingy' as const, hourly: 9000, weekMinutes: 16 * 60 };
    const pd = payday(job, new Random(6));
    expect(pd.owed).toBeGreaterThan(pd.paid);
    const res = resolvePayday(job, pd, 'report', new Random(7));
    expect(res.extra).toBe(pd.owed - pd.paid);
    expect(job.fired).toBe(true);
  });
});

describe('화면 근무: 손님 기다림', () => {
  const start = () => new ConvenienceShift(newJob(new Random(5)), me, new Random(5), [], { start: 18 * 60, end: 21 * 60, pace: 1, patience: 1, walkIn: true });

  it('물건 고르는 동안은 기다림을 안 센다 — 줄에 서야 센다', () => {
    const s = start();
    while (!s.queue.length) s.tick();
    const c = s.queue[0]!;
    for (let i = 0; i < 10; i++) s.tick();
    expect(s.queue).toContain(c); // 인내심(최대 8분)보다 오래 둘러봐도 안 나간다
    s.reachedLine(c.n);
    for (let i = 0; i < 12 && s.queue.includes(c); i++) s.tick();
    expect(s.queue).not.toContain(c);
    expect(s.report.leftAngry).toBeGreaterThan(0);
  });

  it('나가기 전에 재촉하고, 한 말에는 누가 했는지 붙는다', () => {
    const s = start();
    while (!s.queue.length) s.tick();
    const c = s.queue[0]!;
    s.reachedLine(c.n);
    for (let i = 0; i < 12 && s.queue.includes(c); i++) s.tick();
    const said = s.report.events.filter((e) => e.who === c.n);
    expect(said.length).toBeGreaterThanOrEqual(2); // 재촉 한 번 + 나가며 한마디
  });
});
