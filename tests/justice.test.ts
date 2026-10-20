import { describe, expect, it } from 'vitest';
import { Random } from '../src/engine/core/Random';
import { Household, parentType, ProtectionCase } from '../src/engine/family';
import { crime, decide, type Fighter, type Incident, processCase, resolveFight, selfDefense, type StudentRole } from '../src/engine/justice';
import { MemoryBank } from '../src/engine/memory';
import { randomAttitudes, randomPersonality } from '../src/engine/npc';
import { assignTraits, trait, TRAITS, traitEffects } from '../src/engine/traits';

describe('특성', () => {
  it('2~4개, 서로 안 맞는 특성은 같이 안 붙는다', () => {
    const rng = new Random(1);
    for (let i = 0; i < 500; i++) {
      const p = randomPersonality(rng);
      const ts = assignTraits({ p, att: randomAttitudes(p, 'normal', 0.5, rng), origin: 'normal' }, rng);
      expect(ts.length).toBeGreaterThanOrEqual(2);
      expect(ts.length).toBeLessThanOrEqual(4);
      for (const a of ts) for (const b of ts) expect(trait(a).conflicts ?? []).not.toContain(b);
    }
  });
  it('특성이 30개 넘고, 효과가 합쳐진다', () => {
    expect(TRAITS.length).toBeGreaterThanOrEqual(30);
    const fx = traitEffects(['vigilante', 'brawler']);
    expect(fx.justice).toBe(1);
    expect(fx.fightPower).toBe(15);
  });
});

const f = (id: string, fighting: number): Fighter => ({ id, name: id, fighting, power: 50, fightPower: 0, toughness: 0 });

describe('싸움', () => {
  it('머릿수와 실력이 많을수록 이긴다', () => {
    const rng = new Random(2);
    let wins = 0;
    for (let i = 0; i < 300; i++) if (resolveFight([f('a', 40), f('b', 40), f('c', 40)], [f('x', 40)], { place: 'alley', firstStrike: 'B', rng }).winner === 'A') wins++;
    expect(wins).toBeGreaterThan(240);
  });
});

const role = (o: Partial<StudentRole>): StudentRole => ({ id: 'a', hit: true, struckFirst: false, proportionate: true, retaliatedLater: false, defendingOther: false, priorIncidents: 0, remorse: 0.5, reconciled: 0.5, persuade: 0, ...o });
const inc = (o: Partial<Incident> = {}): Incident => ({ type: 'assault', worstInjury: 1, evidence: { cctv: true, witnesses: 5, filmed: false, medical: false }, ...o });

describe('학폭위', () => {
  it('정당방위: 먼저 맞았고, 그 정도였고, 증거가 있으면 인정', () => {
    expect(selfDefense(role({}), inc())).toBe(true);
  });
  it('나중에 찾아가서 갚았거나, 지나쳤거나, 증거가 없으면 쌍방', () => {
    expect(selfDefense(role({ retaliatedLater: true }), inc())).toBe(false);
    expect(selfDefense(role({ proportionate: false }), inc())).toBe(false);
    expect(selfDefense(role({}), inc({ evidence: { cctv: false, witnesses: 0, filmed: false, medical: false } }))).toBe(false);
  });
  it('반복·고의·반성 없음은 조치를 무겁게 한다', () => {
    const light = decide(role({ struckFirst: true, proportionate: false, remorse: 0.9, reconciled: 0.9 }), inc());
    const heavy = decide(role({ struckFirst: true, proportionate: false, priorIncidents: 3, remorse: 0, reconciled: 0, retaliatedLater: true }), inc({ type: 'groupAssault', worstInjury: 3 }));
    expect(heavy.level).toBeGreaterThan(light.level);
    expect(heavy.admissionPenalty).toBeGreaterThan(light.admissionPenalty);
  });
});

const off = (o = {}) => ({ age: 17, priorCases: 0, worstPrior: 0, guardian: 0.7, remorse: 0.6, persuade: 0, ...o });

describe('소년 사법', () => {
  it('킥보드는 범칙금, 단순 폭행 합의는 거기서 끝', () => {
    const rng = new Random(3);
    expect(processCase(crime('kickboard'), off(), false, rng).final).toBe('범칙금');
    expect(processCase(crime('assault'), off(), true, rng).final).toContain('합의');
  });
  it('촉법소년(13세)은 형사처벌·수사경력 없이 소년부로', () => {
    const r = processCase(crime('injury'), off({ age: 13 }), false, new Random(4));
    expect(r.record.criminal).toBe(false);
    expect(r.record.investigation).toBe(false);
    expect(r.record.juvenile).toBe(true);
  });
  it('보호처분은 전과가 아니다. 재범·보호자 부재는 처분을 무겁게 한다', () => {
    const first = processCase(crime('extortion'), off(), false, new Random(5));
    const again = processCase(crime('extortion'), off({ priorCases: 3, worstPrior: 5, guardian: 0.1, remorse: 0 }), false, new Random(5));
    expect(first.record.criminal).toBe(false);
    const weight = (r: typeof first) => (r.prison ? 12 : r.record.criminal ? 11 : Math.max(0, ...r.dispositions));
    expect(weight(again)).toBeGreaterThan(weight(first));
  });
  it('무거운 재범은 형사재판까지 갈 수 있다 (소년교도소·전과)', () => {
    let prison = 0;
    for (let i = 0; i < 200; i++) {
      const r = processCase(crime('phishingMule'), off({ priorCases: 3, worstPrior: 9, guardian: 0.1, remorse: 0 }), false, new Random(100 + i));
      if (r.prison) {
        prison++;
        expect(r.record.criminal).toBe(true);
        expect(r.prison.longYears).toBeLessThanOrEqual(10);
        expect(r.prison.shortYears).toBeLessThanOrEqual(5);
      }
    }
    expect(prison).toBeGreaterThan(0);
  });
  it('마약은 의료재활 위탁(7호)', () => {
    const r = processCase(crime('drugs'), off({ priorCases: 1 }), false, new Random(6));
    if (r.dispositions.length) expect(r.dispositions).toContain(7);
  });
});

describe('아동 보호', () => {
  it('신고 → 판정 → 조치가 이어지고, 같은 일로 매일 신고되지 않는다', () => {
    const m = new MemoryBank('p');
    const h = new Household('kid', [{ id: 'p', role: 'dad', type: parentType('volatile'), traits: { ...parentType('volatile').traits }, memory: m }], 0.1);
    h.parents[0]!.incidents.hit = 3;
    const c = new ProtectionCase(h);
    const rng = new Random(9);
    c.report(1, 'teacher', true, rng);
    expect(c.stage).toBe('decided');
    expect(c.reports).toBe(1);
    expect(c.observe('teacher', { bruiseDays: 5, absences: 0, withdrawn: true }, { notice: 1, closeness: 1, meddle: 1 }, 2, rng)).toBe(false);
  });
});

import { COUNSEL, discover, gatherEvidence, hireCounsel, leaveTrace, proven } from '../src/engine/justice';

describe('방과 후 싸움의 증거', () => {
  it('늦게 신고하면 CCTV는 지워지고, 변호사가 증거보전을 걸면 남는다', () => {
    const t = { day: 0, place: 'alley' as const, cctvUntil: 30, blackboxUntil: 5, witnesses: 1, filmed: false, uploaded: false, policeOnScene: false };
    expect(gatherEvidence(t, 10, false).cctv).toBe(true);
    expect(gatherEvidence(t, 10, false).blackbox).toBe(false);
    expect(gatherEvidence(t, 40, false).cctv).toBe(false);
    expect(gatherEvidence(t, 40, false, 20).cctv).toBe(true);
  });
  it('공사장보다 번화가가 훨씬 많이 들킨다', () => {
    const rng = new Random(11);
    const found = (place: 'abandoned' | 'downtown') => {
      let n = 0;
      for (let i = 0; i < 1000; i++) {
        const t = leaveTrace(place, 0, 2, false, rng);
        if (discover(t, { injury: 1, fear: 0.3, pride: 0.6, parentPresence: 0.5, parentInvolvement: 0.5, witnessMeddle: 0.1 }, rng)) n++;
      }
      return n;
    };
    expect(found('downtown')).toBeGreaterThan(found('abandoned'));
  });
  it('증거가 약하면 부인이 먹히고, 변호사는 그걸 더 어렵게 만든다', () => {
    const rng = new Random(12);
    const weak = { cctv: false, blackbox: false, witnesses: 0, filmed: false, medical: false, lost: [] };
    let a = 0, b = 0;
    for (let i = 0; i < 1000; i++) {
      if (proven(weak, true, 0, rng)) a++;
      if (proven(weak, true, COUNSEL.top.contest, rng)) b++;
    }
    expect(a).toBeLessThan(400);
    expect(b).toBeLessThanOrEqual(a);
  });
  it('부잣집이 변호사를 더 많이 산다', () => {
    const rng = new Random(13);
    const paid = (origin: 'poor' | 'rich') => {
      let n = 0;
      for (let i = 0; i < 1000; i++) if (['private', 'top'].includes(hireCounsel({ origin, expectation: 0.6, involvement: 0.6 }, 0.6, 'accused', rng).kind)) n++;
      return n;
    };
    expect(paid('rich')).toBeGreaterThan(paid('poor') * 3);
  });
});

import { threaten } from '../src/engine/justice';

describe('입막음', () => {
  it('겁 많은 애는 입을 닫고, 깡 있는 애는 더 자주 맞선다', () => {
    const rng = new Random(21);
    let cowardSilent = 0, grittyDefiant = 0;
    for (let i = 0; i < 500; i++) {
      if (threaten({ id: 'a', name: '가', traits: ['bully'], crew: 0 }, { id: 't', name: '나', traits: ['coward'], fear: 40, role: 'victim' }, rng).silenced) cowardSilent++;
      if (threaten({ id: 'a', name: '가', traits: ['bully'], crew: 0 }, { id: 't', name: '나', traits: ['gritty', 'vigilante'], fear: 0, role: 'victim' }, rng).defiant) grittyDefiant++;
    }
    expect(cowardSilent).toBeGreaterThan(350);
    expect(grittyDefiant).toBeGreaterThan(150);
  });
  it('협박이 드러나면 학폭위 조치가 무거워지고 최소 2호', () => {
    const base = { id: 'a', hit: true, struckFirst: true, proportionate: false, retaliatedLater: false, defendingOther: false, priorIncidents: 0, remorse: 1, reconciled: 1, persuade: 0.5 };
    const inc = { type: 'assault' as const, worstInjury: 0, evidence: { cctv: true, witnesses: 2, filmed: false, medical: false } };
    const plain = decide(base, inc);
    const threat = decide({ ...base, threatened: true }, inc);
    expect(threat.level).toBeGreaterThanOrEqual(Math.max(2, plain.level));
  });
});
