/**
 * NPC 10명이 같은 반에서 고1 첫 주(3/2~3/8)를 각자 산다.
 * 실행: npm run sim:npc
 */
import { ORIGIN_LABEL_KO } from '../engine/character';
import { Random } from '../engine/core/Random';
import { ATTITUDE_LABEL_KO, createNpcProfile, GOAL_LABEL_KO, MOTIVE_LABEL_KO, NpcLife, TRAIT_LABEL_KO } from '../engine/npc';
import { formatClock, formatDate } from '../engine/time';

const rng = new Random(20260302);
const names = ['민준', '서준', '도윤', '하준', '지호', '건우', '현우', '우진', '시우', '태윤'];
const npcs = names.map((n, i) => new NpcLife(createNpcProfile(`npc${i}`, rng, n), { year: 2026, month: 3, day: 2 }, new Random(1000 + i)));

const SKIP = new Set(['등교', '수업', '잠']);
for (const npc of npcs) {
  const { ch, personality: p, attitudes: at, lifeGoals, academyDays, jobDays } = npc.profile;
  const traits = (Object.keys(p) as Array<keyof typeof p>)
    .map((k) => `${TRAIT_LABEL_KO[k]}${Math.round(p[k] * 10)}`)
    .join(' ');
  const SRC = { self: '', parents: '부모가 정함·', situation: '처지·' } as const;
  const goalText = lifeGoals
    .map((g) => `${GOAL_LABEL_KO[g.goal]}[${SRC[g.source]}${MOTIVE_LABEL_KO[g.motive]}${g.secret ? '·비밀' : ''}]`)
    .join(' + ');
  const attText = (Object.keys(at) as Array<keyof typeof at>).map((k) => `${ATTITUDE_LABEL_KO[k]}${Math.round(at[k] * 10)}`).join(' ');
  console.log(`\n■ ${ch.name} — ${ORIGIN_LABEL_KO[ch.origin]} / ${traits} / ${attText}\n  목표: ${goalText}` +
    `${academyDays.length ? ` / 학원 주${academyDays.length}회` : ''}${jobDays.length ? ' / 알바' : ''}`);
  for (let d = 0; d < 7; d++) {
    const r = npc.liveDay();
    const acts = r.entries
      .filter((e) => !SKIP.has(e.action))
      .map((e) => `${formatClock(e.start)} ${e.action}`)
      .join(' → ');
    const flags = [r.late ? '지각' : '', r.skippedAcademy ? '학원 땡땡이' : ''].filter(Boolean).join(', ');
    const sleep = `${Math.floor(r.sleptMin / 60)}h${String(r.sleptMin % 60).padStart(2, '0')}`;
    console.log(`  ${formatDate(r.date).padEnd(10)} ${acts || '(집에서 쉼)'}  | 잠 ${sleep}${flags ? `  [${flags}]` : ''}`);
  }
  console.log(`  → 공부 ${ch.stats.study.toFixed(1)}, 스트레스 ${ch.body.stress.toFixed(0)}, 남은 돈 ${npc.money.toLocaleString()}원`);
}
