/**
 * 하나의 세계 1년. 한 학년 300명이 각자의 하루를 살고, 그게 서로 엮인다.
 * 실행: npm run sim:world   (N=150 DAYS=120 으로 짧게)
 */
import { addDays } from '../engine/time/calendar';
import { BEST_FRIEND } from '../engine/social';
import { trait } from '../engine/traits';
import { type Student, WorldSim } from '../engine/world';

const N = Number(process.env.N ?? 300);
const DAYS = Number(process.env.DAYS ?? 365);
const START = { year: 2026, month: 3, day: 2 };
const t0 = Date.now();
const w = new WorldSim({ students: N, seed: Number(process.env.SEED ?? 7), start: START });
w.run(DAYS);
const name = (id: string) => w.student(id).name;

console.log(`\n━━ 고1 ${N}명 (${Math.ceil(N / 30)}반) × ${DAYS}일 — ${((Date.now() - t0) / 1000).toFixed(0)}초 ━━`);
console.log('\n[월별 큰일]');
const byMonth = new Map<string, typeof w.log>();
for (const e of w.log.filter((x) => x.who)) {
  const dt = addDays(START, e.day);
  const k = `${dt.year}.${String(dt.month).padStart(2, '0')}`;
  byMonth.set(k, [...(byMonth.get(k) ?? []), e]);
}
for (const [m, es] of byMonth) {
  const seen = new Set<string>();
  const top = [...es].sort((a, b) => b.weight - a.weight || a.day - b.day).filter((e) => !seen.has(e.who + e.kind) && seen.add(e.who + e.kind)).slice(0, 5);
  console.log(`  ${m} (${es.length}건)`);
  for (const e of top) console.log(`    · ${name(e.who)}: ${e.text}`);
}

const ss = [...w.students.values()];
const pct = (n: number, d = ss.length) => `${((n / d) * 100).toFixed(1)}%`;
const count = (f: (s: Student) => boolean) => ss.filter(f).length;
console.log('\n[1년 뒤 이 학년]');
const fc = ss.map((s) => w.graph.friends(s.id).filter((f) => w.graph.mutual(s.id, f)).length);
console.log(`  친구 0명 ${pct(fc.filter((n) => n === 0).length)}, 3명 이상 ${pct(fc.filter((n) => n >= 3).length)}, 절친 있음 ${pct(count((s) => w.graph.friends(s.id, BEST_FRIEND).some((f) => w.graph.mutual(s.id, f, BEST_FRIEND))))}`);
console.log(`  무리 ${w.groups.length}개 — ${[...new Set(w.groups.map((g) => g.label))].map((l) => `${l} ${w.groups.filter((g) => g.label === l).length}`).join(', ')}`);
const k = (kind: string) => w.log.filter((e) => e.kind === kind).length;
console.log(`  괴롭힘·시비 ${w.log.filter((e) => e.text.includes('시비')).length}건, 입막음 증거 남음 ${k('threat')}건, 싸움 ${k('fight')}건, "나도 당했다" 증언 ${k('testimony')}건`);
console.log(`  학폭위 조치 ${ss.reduce((a, s) => a + s.measures.length, 0)}건, 출석정지 ${count((s) => s.measures.some((m) => m.level === 6))}명, 학급교체 ${count((s) => s.measures.some((m) => m.level === 7))}명, 전학 ${count((s) => s.transferred)}명, 퇴학 ${count((s) => s.expelled)}명`);
console.log(`  경찰 사건 ${ss.reduce((a, s) => a + s.cases.length, 0)}건 (${pct(count((s) => s.cases.length > 0))}), 소년원·시설 ${count((s) => s.cases.some((c) => c.dispositions.some((d) => d >= 6)))}명`);
console.log(`  가출 ${pct(count((s) => s.run.episodes > 0))}, 학대 신고 ${count((s) => s.prot.reports > 0)}명, 1년 결석 평균 ${(ss.reduce((a, s) => a + s.life.absences, 0) / ss.length).toFixed(1)}일`);

// 이야기 두 개: 가장 사건 많은 학생, 평범한 학생
const busiest = [...ss].sort((a, b) => b.story.reduce((x, e) => x + e.weight, 0) - a.story.reduce((x, e) => x + e.weight, 0))[0]!;
const ordinary = ss.find((s) => s.story.length >= 2 && s.story.length <= 8 && s.cases.length === 0 && !s.house.types.some((t) => t.harsh)) ?? ss[1]!;
for (const [title, s] of [['가장 일이 많았던 학생', busiest], ['평범한 학생', ordinary]] as const) {
  const fr = w.graph.friends(s.id).filter((f) => w.graph.mutual(s.id, f));
  console.log(`\n[${title}: ${s.name} (${s.cls + 1}반) — ${s.prof.traits.map((t) => trait(t).label).join(', ')} / 집: ${s.house.types.map((t) => t.label).join(' + ')}]`);
  console.log(`  친구: ${fr.map(name).join(', ') || '없음'}`);
  for (const e of s.story.filter((x) => x.weight >= 2).slice(0, 14)) {
    const dt = addDays(START, e.day);
    console.log(`  ${dt.month}/${dt.day}  ${e.text}`);
  }
}
