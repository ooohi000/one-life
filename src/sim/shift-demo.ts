/**
 * 편의점 근무를 자동 손으로 돌려 본다 (화면이 붙으면 이 자리에 플레이어의 손이 들어간다).
 * 실행: npm run sim:shift
 */
import { Random } from '../engine/core/Random';
import { autoHand, ConvenienceShift, type Dilemma, type KnownVisitor, newJob, type Worker } from '../engine/work';

const rng = new Random(4);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const job = newJob(rng);
job.boss = 'strict';
job.hourly = 10320;
const me: Worker = { id: 'me', name: '민준', age: 17, tact: 35, streetSmart: 30, speech: 40, condition: 0.85 };
const visitors: KnownVisitor[] = [
  { id: 'a', name: '서준', age: 17, relation: 'friend' },
  { id: 'b', name: '강주원', age: 17, relation: 'bully' },
  { id: 'c', name: '지호 엄마', age: 46, relation: 'parentFriend' },
  { id: 'd', name: '박지호', age: 17, relation: 'classmate' },
];

/** 이 데모의 "플레이어 성향": 착하게 일한다, 대신 배는 고프다 */
const policy = (d: Dilemma) => ({ idCheck: 'refuse', expiredFood: 'eat', freebie: 'no', overpaid: 'return', unpaidOvertime: 'ask', shoplifter: 'confront', drunk: 'polite' })[d.kind];

function work(title: string, w: Worker, vis: KnownVisitor[], seed: number) {
  const s = new ConvenienceShift(job, w, new Random(seed), vis, { start: 17 * 60 + 30, end: 21 * 60 + 30, raining: seed % 2 === 0 });
  while (!s.done) {
    if (s.dilemma) {
      const o = policy(s.dilemma);
      s.report.events.push({ minute: s.minute, kind: 'dilemma', text: `   → [${s.dilemma.options.find((x) => x.id === o)!.label}]` });
      s.decide(o);
      continue;
    }
    // 계산 먼저 (줄 선 순서), 그다음 진열·폐기·청소
    const t = s.tasks.find((x) => x.kind === 'checkout') ?? s.tasks[0];
    if (t) s.perform(t.id, autoHand(w, job, t, rng));
    else s.tick();
  }
  const r = s.finish();
  console.log(`\n━━ ${title} — ${job.store} (사장님: ${({ kind: '착함', strict: '깐깐함', stingy: '짠돌이' })[job.boss]}, 시급 ${job.hourly.toLocaleString()}원) ━━`);
  for (const e of r.events.filter((x) => x.kind !== 'customer' || x.text.includes('"'))) console.log(`  ${hhmm(e.minute)}  ${e.text}`);
  console.log(`\n  정산: 손님 ${r.customers}명 · 매출 ${r.sales.toLocaleString()}원 · 빨리 처리 ${r.servedFast} · 화나서 나감 ${r.leftAngry} · 거스름돈 실수 ${r.changeErrors} · 만족 ${r.satisfaction}`);
  console.log(`  번 돈 ${r.wage.toLocaleString()}원 · 사장 평가 ${r.standingDelta >= 0 ? '+' : ''}${r.standingDelta} (누적 ${job.standing}) · 스트레스 +${Math.round(r.stress)}${r.ateExpired ? ' · 폐기로 저녁 해결' : ''}${r.fired ? ' · ❌ 잘림' : ''}`);
  if (r.met.length) console.log(`  만난 사람: ${r.met.map((m) => `${m.visitor.name}(${m.note}${m.rumor ? `, 소문: "${m.rumor}"` : ''})`).join(' / ')}`);
  if (r.violations.length) console.log(`  ⚠ ${r.violations.join(', ')}`);
}

work('첫 근무 (손이 서툴다)', me, visitors, 1);
job.shifts = 25;
work('25번째 근무 (손에 익었다)', me, [visitors[1]!, visitors[3]!], 2);
work('밤새 게임하고 온 날 (몸 상태 0.3)', { ...me, condition: 0.3 }, [visitors[0]!], 3);
job.boss = 'stingy';
job.hourly = 9000;
job.contract = false;
work('사장님이 바뀌었다 (짠돌이, 시급 9,000원, 계약서 없음)', me, [visitors[0]!], 6);
