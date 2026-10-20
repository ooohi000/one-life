/**
 * NPC 200명 × 4주 자동 시뮬레이션 → 분포 검사.
 * "전원 PC방", "아무도 공부 안 함" 같은 쏠림을 숫자로 잡는다.
 * 실행: npm run sim:npc-stats
 */
import { Random } from '../engine/core/Random';
import { createNpcProfile, GOAL_LABEL_KO, type GoalId, MOTIVE_LABEL_KO, type MotiveId, NpcLife } from '../engine/npc';

const N = 200;
const DAYS = Number(process.env.DAYS ?? 28);
const rng = new Random(77);
const lives: NpcLife[] = [];
for (let i = 0; i < N; i++) {
  const npc = new NpcLife(createNpcProfile(`n${i}`, rng), { year: 2026, month: 3, day: 2 }, new Random(5000 + i));
  for (let d = 0; d < DAYS; d++) npc.liveDay();
  lives.push(npc);
}

const FIXED = new Set(['등교', '수업', '잠']);
const total = new Map<string, number>();
let free = 0;
for (const l of lives) for (const [a, m] of l.minutesByAction) if (!FIXED.has(a)) { total.set(a, (total.get(a) ?? 0) + m); free += m; }

console.log(`NPC ${N}명 × ${DAYS}일 — 자유 시간 사용 비율`);
for (const [a, m] of [...total].sort((x, y) => y[1] - x[1])) {
  const pct = (m / free) * 100;
  console.log(`  ${a.padEnd(10)} ${pct.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(pct / 1.5))}`);
}

const avg = (f: (l: NpcLife) => number) => lives.reduce((s, l) => s + f(l), 0) / N;
const sleepAvg = avg((l) => {
  const s = l.timeline.filter((e) => e.action === '잠');
  return s.reduce((a, e) => a + (e.end - e.start), 0) / s.length / 60;
});
console.log(`\n평균 수면 ${sleepAvg.toFixed(1)}시간 / ${DAYS}일 지각 평균 ${avg((l) => l.lateCount).toFixed(1)}회 / 학원 땡땡이 평균 ${avg((l) => l.academySkips).toFixed(1)}회 / 쓰러짐 경험 ${lives.filter((l) => l.collapses > 0).length}명`);

const pct = (n: number) => `${((n / N) * 100).toFixed(0)}%`;
console.log(`\n복합 목표: 부모가 정한 목표가 있는 학생 ${pct(lives.filter((l) => l.profile.lifeGoals.some((g) => g.source === 'parents')).length)}, ` +
  `비밀 꿈이 있는 학생 ${pct(lives.filter((l) => l.profile.lifeGoals.some((g) => g.secret)).length)}, 목표가 꺾인 학생 ${pct(lives.filter((l) => l.goalLog.length > 0).length)}`);
console.log(`상태: 번아웃 겪음 ${pct(lives.filter((l) => l.stateLog.some((s) => s.state === 'burnout' && s.entered)).length)}, ` +
  `은둔 겪음 ${pct(lives.filter((l) => l.stateLog.some((s) => s.state === 'withdrawn' && s.entered)).length)}, 등교 거부 평균 ${avg((l) => l.absences).toFixed(1)}일`);

console.log('\n동기별 평균 스트레스 (같은 목표라도 이유가 다르면)');
const byMotive = new Map<MotiveId, number[]>();
for (const l of lives) for (const g of l.profile.lifeGoals) byMotive.set(g.motive, [...(byMotive.get(g.motive) ?? []), l.avgStress]);
for (const [m, v] of [...byMotive].sort((a, b) => b[1].reduce((x, y) => x + y, 0) / b[1].length - a[1].reduce((x, y) => x + y, 0) / a[1].length)) {
  console.log(`  ${MOTIVE_LABEL_KO[m].padEnd(12)} ${String(v.length).padStart(3)}명  스트레스 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(0)}`);
}

console.log('\n진짜 꿈(스스로 원한 목표)별 평균 (공부 시간 = 학원+자습+집공부)');
const groups = new Map<GoalId, NpcLife[]>();
for (const l of lives) {
  const main = (l.profile.lifeGoals.find((g) => g.source === 'self')?.goal ?? 'fun') as GoalId;
  groups.set(main, [...(groups.get(main) ?? []), l]);
}
const studyMin = (l: NpcLife) => ['학원', '독서실 자습', '집에서 공부'].reduce((s, a) => s + (l.minutesByAction.get(a) ?? 0), 0);
const funMin = (l: NpcLife) => ['PC방', '침대에서 폰', '집에서 뒹굴', '노래방'].reduce((s, a) => s + (l.minutesByAction.get(a) ?? 0), 0);
for (const [g, ls] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const m = (f: (l: NpcLife) => number) => ls.reduce((s, l) => s + f(l), 0) / ls.length;
  console.log(`  ${GOAL_LABEL_KO[g].padEnd(9)} ${String(ls.length).padStart(3)}명  공부 ${(m(studyMin) / 60).toFixed(0).padStart(3)}h  놀기 ${(m(funMin) / 60).toFixed(0).padStart(3)}h  ` +
    `공부스탯 ${m((l) => l.ch.stats.study).toFixed(1)}  스트레스 ${m((l) => l.avgStress).toFixed(0)}  돈 ${Math.round(m((l) => l.money)).toLocaleString()}원`);
}

console.log('\n집안 형편(경제적 필요)별 — 돈이 목표가 아니어도');
const needGroups: Array<[string, (l: NpcLife) => boolean]> = [
  ['여유 (필요 0~0.2)', (l) => l.profile.need < 0.2],
  ['빠듯 (0.2~0.45)', (l) => l.profile.need >= 0.2 && l.profile.need < 0.45],
  ['어려움 (0.45~0.7)', (l) => l.profile.need >= 0.45 && l.profile.need < 0.7],
  ['아주 어려움 (0.7+)', (l) => l.profile.need >= 0.7],
];
for (const [label, f] of needGroups) {
  const ls = lives.filter(f);
  if (!ls.length) continue;
  const m = (g: (l: NpcLife) => number) => ls.reduce((s, l) => s + g(l), 0) / ls.length;
  const noMoneyGoal = ls.filter((l) => !l.profile.lifeGoals.some((g) => g.goal === 'money')).length;
  console.log(`  ${label.padEnd(16)} ${String(ls.length).padStart(3)}명 (돈이 목표 아닌 학생 ${noMoneyGoal})  알바 ${(m((l) => l.minutesByAction.get('편의점 알바') ?? 0) / 60).toFixed(0).padStart(3)}h  ` +
    `공부 ${(m(studyMin) / 60).toFixed(0).padStart(3)}h  스트레스 ${m((l) => l.avgStress).toFixed(0)}  집에 보탠 돈 ${Math.round(m((l) => l.contributed)).toLocaleString()}원`);
}
