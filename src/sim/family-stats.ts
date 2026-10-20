/**
 * 집 1000곳 × 1년. 부모 유형 분포, 폭언·폭력, 부부싸움, 가출, 가출팸이 현실 통계와 비슷한지 본다.
 * 실행: npm run sim:family
 */
import { Random } from '../engine/core/Random';
import { Household, type ParentRole, Runaway, type RunawayInput, sampleParent } from '../engine/family';
import { MemoryBank, World } from '../engine/memory';
import { createNpcProfile } from '../engine/npc';

const N = Number(process.env.N ?? 1000);
const rng = new Random(2026);
const world = new World();

interface Kid {
  id: string;
  name: string;
  house: Household;
  mem: MemoryBank;
  run: Runaway;
  stress: number;
  rebellion: number;
  neuroticism: number;
  agreeableness: number;
  impulsivity: number;
  belonging: number;
  knowsHelp: boolean;
  yelled: number;
  hit: number;
  cls: number;
  worst: string;
  family: string;
}

const kids: Kid[] = [];
for (let i = 0; i < N; i++) {
  const prof = createNpcProfile(`k${i}`, rng);
  world.add({ id: `k${i}`, name: prof.ch.name, cue: '', manners: 0 });
  const mem = new MemoryBank(`k${i}`);
  const slots: ParentRole[] = prof.family.parents === 'both' ? ['mom', 'dad'] : prof.family.parents === 'single' ? [rng.chance(0.75) ? 'mom' : 'dad'] : ['grandma'];
  const parents = slots.map((role, j) => {
    const s = sampleParent(rng);
    const pm = new MemoryBank(`k${i}p${j}`);
    pm.meet(`k${i}`, 0, '집', '가족', 1, 100);
    return { id: `k${i}p${j}`, role, type: s.type, traits: s.traits, memory: pm };
  });
  const house = new Household(`k${i}`, parents, prof.need);
  const order = ['volatile', 'neglectful', 'cold', 'selfFirst', 'pushy', 'helicopter', 'exhausted', 'gruffLoving', 'friendly', 'warm'];
  const worst = [...house.types].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0]!;
  kids.push({
    id: `k${i}`, name: prof.ch.name, house, mem, run: new Runaway(), stress: 30,
    rebellion: prof.attitudes.rebellion, neuroticism: prof.personality.neuroticism, agreeableness: prof.personality.agreeableness,
    impulsivity: prof.personality.impulsivity, belonging: 0.3 + rng.next() * 0.6, knowsHelp: rng.chance(0.5),
    yelled: 0, hit: 0, cls: Math.floor(i / 30), worst: worst.label, family: prof.family.parents,
  });
}

const classRan = new Map<number, number>();
for (let day = 1; day <= 365; day++) {
  for (const k of kids) {
    const observed = { darkCircles: rng.chance(0.25), pcbangDaysThisWeek: rng.chance(k.impulsivity * 0.5) ? 4 : 0, cameHomeLate: rng.chance(0.08), examSoon: day % 120 > 100 };
    const input = (incident: 'yelled' | 'hit' | null, clash: boolean): RunawayInput => ({
      fear: k.house.maxFear(), attachment: k.house.bestAttachment(), aversion: k.house.aversion(), incidentToday: incident, clashToday: clash,
      stress: k.stress, rebellion: k.rebellion, impulsivity: k.impulsivity, belonging: k.belonging,
      peerRanAway: (classRan.get(k.cls) ?? 0) > 0, parentsSearch: k.house.parents.some((p) => p.traits.affection >= 0.4), knowsHelp: k.knowsHelp,
    });
    if (k.run.active) {
      const r = k.run.step(day, input(null, false), rng);
      k.stress = Math.max(0, Math.min(100, k.stress * 0.9 + r.stress + 3));
      if (k.run.log.some((l) => l.text.includes('1388'))) k.knowsHelp = true;
      continue;
    }
    const out = k.house.simulateDay({ rebellion: k.rebellion, neuroticism: k.neuroticism, agreeableness: k.agreeableness, stress: k.stress }, { day, rng, world, child: k.mem, observed });
    for (const inc of out.incidents) inc === 'hit' ? k.hit++ : k.yelled++;
    k.stress = Math.max(0, Math.min(100, k.stress * 0.85 + out.childStress + 5));
    const incident = out.incidents.includes('hit') ? 'hit' : out.incidents.length ? 'yelled' : null;
    const x = input(incident, out.childStress >= 12);
    if (rng.chance(Runaway.dailyRisk(x))) {
      k.run.leave(day, 20000 + Math.floor(rng.next() * 40000), x, rng, incident === 'hit' ? '맞고 나서' : incident ? '크게 혼나고' : '그냥 숨이 막혀서');
      classRan.set(k.cls, (classRan.get(k.cls) ?? 0) + 1);
    }
  }
}

// ---------- 결과 ----------
const pct = (n: number, d = N) => `${((n / d) * 100).toFixed(1)}%`;
const ran = kids.filter((k) => k.run.episodes > 0);
console.log(`\n━━ 집 ${N}곳 × 1년 ━━`);
console.log(`가족 형태: 양부모 ${pct(kids.filter((k) => k.family === 'both').length)}, 한부모 ${pct(kids.filter((k) => k.family === 'single').length)}, 조부모 ${pct(kids.filter((k) => k.family === 'grandparents').length)}`);
console.log(`\n[폭언·폭력]  현실 기준: 지난 1년 정서학대 36.5%, 신체학대 14.5% (2023 아동종합실태조사)`);
console.log(`  1년에 한 번이라도 소리 지르며 혼남   ${pct(kids.filter((k) => k.yelled > 0).length)}`);
console.log(`  1년에 한 번이라도 맞음               ${pct(kids.filter((k) => k.hit > 0).length)}`);
console.log(`  5번 이상 맞음 (상습)                 ${pct(kids.filter((k) => k.hit >= 5).length)}`);
const both = kids.filter((k) => k.house.parents.length === 2);
console.log(`\n[부부]  부부싸움 평균 ${(both.reduce((s, k) => s + k.house.fights.count, 0) / both.length).toFixed(1)}번/년, 1년 안에 별거 ${pct(both.filter((k) => k.house.separated).length, both.length)}`);
const prot = kids.filter((k) => k.hit > 0 && k.house.parents.length === 2);
console.log(`\n[가출]  현실 기준: 일반 청소년 지난 1년 2.5%, 위기청소년 22.6%`);
console.log(`  1년 안에 가출                        ${pct(ran.length)}  (평균 ${(ran.reduce((s, k) => s + k.run.episodes, 0) / Math.max(1, ran.length)).toFixed(1)}번, 밖에서 평균 ${(ran.reduce((s, k) => s + k.run.totalDaysOut, 0) / Math.max(1, ran.length)).toFixed(1)}일)`);
console.log(`  상습적으로 맞는 아이 중 가출          ${pct(kids.filter((k) => k.hit >= 5 && k.run.episodes).length, Math.max(1, kids.filter((k) => k.hit >= 5).length))}`);
console.log(`  안 맞는 아이 중 가출                  ${pct(kids.filter((k) => k.hit === 0 && k.run.episodes).length, kids.filter((k) => k.hit === 0).length)}`);
console.log(`  가출한 아이 중 가출팸                 ${pct(ran.filter((k) => k.run.everGachulfam).length, Math.max(1, ran.length))}`);
console.log(`  가출한 아이 중 쉼터                   ${pct(ran.filter((k) => k.run.everShelter).length, Math.max(1, ran.length))}`);
console.log(`  가출한 아이 중 범죄 연루              ${pct(ran.filter((k) => k.run.crimes > 0).length, Math.max(1, ran.length))}`);
const ends = new Map<string, number>();
for (const k of ran) for (const e of k.run.ends) ends.set(e, (ends.get(e) ?? 0) + 1);
const KO: Record<string, string> = { cameHome: '스스로 귀가', foundByPolice: '경찰 발견', shelterToHome: '쉼터→귀가', shelterLongTerm: '쉼터→중장기 보호', parentsBrought: '부모가 데려감' };
console.log(`  끝난 방식: ${[...ends].map(([k, v]) => `${KO[k]} ${v}`).join(', ')}`);
console.log(`  아직 밖에 있음: ${kids.filter((k) => k.run.active).length}명`);

console.log(`\n[집에서 가장 힘든 부모 유형별]`);
const groups = new Map<string, Kid[]>();
for (const k of kids) groups.set(k.worst, [...(groups.get(k.worst) ?? []), k]);
for (const [label, ks] of groups) {
  console.log(`  ${label.padEnd(22, '　')}  ${String(ks.length).padStart(4)}집  맞음 ${pct(ks.filter((k) => k.hit > 0).length, ks.length).padStart(6)}  가출 ${pct(ks.filter((k) => k.run.episodes).length, ks.length).padStart(6)}  평균 애착 ${(ks.reduce((s, k) => s + k.house.bestAttachment(), 0) / ks.length).toFixed(0)}`);
}

// 이야기 하나: 가출팸까지 간 아이
const story = ran.find((k) => k.run.everGachulfam) ?? ran.sort((a, b) => b.run.totalDaysOut - a.run.totalDaysOut)[0];
if (story) {
  console.log(`\n[${story.name}의 1년 — ${story.house.types.map((t) => t.label).join(' + ')}]`);
  for (const l of story.run.log.slice(0, 25)) console.log(`  ${String(l.day).padStart(3)}일째  ${l.text}`);
}
