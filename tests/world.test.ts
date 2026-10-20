import { describe, expect, it } from 'vitest';
import { WorldSim } from '../src/engine/world';

const START = { year: 2026, month: 3, day: 2 };

describe('하나의 세계', () => {
  it('같은 시드면 같은 세계가 된다 (저장·재현의 바탕)', () => {
    const a = new WorldSim({ students: 30, seed: 3, start: START });
    const b = new WorldSim({ students: 30, seed: 3, start: START });
    a.run(15);
    b.run(15);
    expect(a.log.map((e) => e.text)).toEqual(b.log.map((e) => e.text));
    expect([...a.students.values()].map((s) => s.life.ch.body.weightKg)).toEqual([...b.students.values()].map((s) => s.life.ch.body.weightKg));
  }, 30000);

  it('한 달 남짓 같은 반에서 지내면 말 트는 사이가 생기고, 친구로 자라기 시작한다', () => {
    const w = new WorldSim({ students: 60, seed: 4, start: START });
    w.run(40);
    const ss = [...w.students.values()];
    expect(ss.filter((s) => w.graph.friends(s.id, 20).length > 0).length).toBeGreaterThan(40);
    expect(ss.filter((s) => w.graph.friends(s.id).length > 0).length).toBeGreaterThan(8);
  }, 60000);

  it('출석정지면 그 기간 실제로 학교에 안 가고, 끝나면 돌아온다', () => {
    const w = new WorldSim({ students: 30, seed: 5, start: START });
    const s = w.student('s0');
    s.away = { reason: '출석정지', until: 5, facility: false };
    w.run(8);
    const days = s.life.timeline.filter((e) => e.action.startsWith('결석(출석정지)'));
    expect(days.length).toBeGreaterThan(0);
    expect(s.away).toBeNull();
    expect(s.story.some((e) => e.kind === 'return')).toBe(true);
  }, 30000);

  it('소년원(시설)에 가면 하루를 밖에서 보낸다', () => {
    const w = new WorldSim({ students: 30, seed: 6, start: START });
    const s = w.student('s1');
    s.away = { reason: '소년원', until: 4, facility: true };
    w.run(3);
    expect(s.life.timeline.filter((e) => e.action === '부재(소년원)').length).toBe(3);
  }, 30000);
});

describe('입막음의 기억 → 증언', () => {
  it('누가 먼저 신고하면, 원한이 쌓인 예전 피해자들이 "나도 당했다"고 나선다', () => {
    let testified = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = new WorldSim({ students: 30, seed, start: START });
      const bully = w.student('s0');
      const victim = w.student('s1');
      for (const v of ['s2', 's3', 's4']) {
        w.graph.event(v, bully.id, 0, { grudge: 70, fear: 20 });
        bully.victims.push({ id: v, day: 0, threatened: true, evidence: v === 's2' });
      }
      bully.victims.push({ id: victim.id, day: 1, threatened: true, evidence: false });
      w.reportBullying(bully, victim);
      testified += w.log.filter((e) => e.kind === 'testimony').length;
      const m = bully.measures.at(-1)!;
      expect(m.level).toBeGreaterThanOrEqual(2); // 협박 증거 → 최소 2호
    }
    expect(testified).toBeGreaterThan(15);
  }, 60000);
});

describe('주인공', () => {
  it('주인공의 하루는 갈림길마다 멈추고, 고른 대로 산다', () => {
    const w = new WorldSim({ students: 30, seed: 9, start: START, protagonist: 0 });
    w.beginDay();
    expect(w.playerDecision?.kind).toBe('school');
    w.choose('skip');
    while (w.playerDecision) {
      const dcs = w.playerDecision;
      w.choose(dcs.kind === 'free' ? (dcs.options.find((o) => o.id === 'pcbang') ?? dcs.options[0])?.id ?? 'sleep' : 'go');
    }
    w.endDay();
    const tl = w.player!.life.timeline;
    expect(tl.some((e) => e.action === '결석(땡땡이)')).toBe(true);
    expect(tl.some((e) => e.place === 'PC방')).toBe(true);
  }, 30000);

  it('저장은 몇 KB이고, 불러오면 똑같은 세계가 된다', () => {
    const w = new WorldSim({ students: 30, seed: 10, start: START, protagonist: 0 });
    for (let i = 0; i < 6; i++) {
      w.beginDay();
      for (const q of [...w.prompts]) w.answer(q.id, q.options[0]!.id);
      while (w.playerDecision) w.choose(w.playerDecision.auto);
      if (i % 2 === 0) w.talkToParent(0, { kind: 'chat' });
      w.endDay();
    }
    const file = JSON.parse(JSON.stringify(w.save()));
    expect(JSON.stringify(file).length).toBeLessThan(20000);
    const l = WorldSim.load(file);
    expect(l.day).toBe(w.day);
    expect(l.log.map((e) => e.text)).toEqual(w.log.map((e) => e.text));
    expect(l.player!.life.money).toBe(w.player!.life.money);
  }, 60000);
});
