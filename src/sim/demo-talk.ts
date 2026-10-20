/**
 * 플레이어가 부모에게 말을 건다. 같은 행동을 여러 유형의 부모에게 해 본다.
 * 실행: npm run sim:talk                      (요약표 + 세 유형 대화 전체)
 *       SHOW=warm,pushy npm run sim:talk     (보고 싶은 유형만 대화 전체)
 */
import { Random } from '../engine/core/Random';
import { type Observed, ParentTalk, type TalkChoice } from '../engine/dialogue';
import { PARENT_TYPES, type ParentRole } from '../engine/family';
import { MemoryBank, World } from '../engine/memory';

const SHOW = (process.env.SHOW ?? 'gruffLoving,selfFirst,volatile').split(',');

function setup(typeId: string, role: ParentRole, need: number) {
  const world = new World();
  world.add({ id: 'me', name: '민준', cue: '', manners: 0 });
  world.add({ id: 'seojun', name: '서준', cue: '키 큰 애', manners: 0.7 });
  world.add({ id: 'jiho', name: '지호', cue: '안경 쓴 애', manners: 0.4 });
  const mem = new MemoryBank('parent');
  const me = new MemoryBank('me');
  mem.meet('me', 0, '집', '가족', 1, 100);
  mem.meet('seojun', 0, '집', '집에 놀러 왔던', 0.8, 20);
  me.meet('seojun', 0, '학교', '같은 반', 0.9);
  me.meet('jiho', 0, '학교', '같은 반', 0.9);
  me.learn('seojun', 'dating', '예린', 'told', 1);
  me.learn('jiho', 'livesIn', '목동', 'told', 1);
  const type = PARENT_TYPES.find((p) => p.id === typeId)!;
  return { world, me, parent: new ParentTalk('parent', role, 'me', mem, type.traits, need) };
}

// ---------- 1) 같은 2주를 유형마다 ----------
const SCRIPT: Array<{ d: number; title: string; obs: Observed; choices: Array<[string, TalkChoice]> }> = [
  { d: 1, title: '밤새 게임해서 다크서클, 계속 말 걸어 봄', obs: { darkCircles: true }, choices: Array(5).fill(['말 걸기', { kind: 'chat' }]) },
  { d: 2, title: '친구 얘기', obs: {}, choices: [['서준이 연애 얘기', { kind: 'tellFriend', friendId: 'seojun', key: 'dating' }], ['지호 얘기 (처음)', { kind: 'tellFriend', friendId: 'jiho', key: 'livesIn' }]] },
  { d: 3, title: '용돈 부탁', obs: {}, choices: [['3만 원만', { kind: 'askMoney', amount: 30000 }]] },
  { d: 4, title: '다음 날', obs: { pcbangDaysThisWeek: 4 }, choices: [['말 걸기', { kind: 'chat' }]] },
  { d: 5, title: '고민 털어놓기', obs: {}, choices: [['힘들어', { kind: 'worry' }]] },
  { d: 6, title: '다음 날', obs: {}, choices: [['말 걸기', { kind: 'chat' }]] },
  { d: 8, title: '부모 챙기기', obs: {}, choices: [['어깨 주물러 드리기', { kind: 'care' }]] },
  { d: 10, title: '잔소리 듣다가 말대꾸', obs: { pcbangDaysThisWeek: 5, cameHomeLate: true }, choices: [['말 걸기', { kind: 'chat' }], ['말대꾸', { kind: 'talkBack' }], ['또 말대꾸', { kind: 'talkBack' }]] },
  { d: 11, title: '다음 날', obs: {}, choices: [['말 걸기', { kind: 'chat' }]] },
  { d: 14, title: '시험 2주 전, 여자친구 생김', obs: { examSoon: true }, choices: [['여자친구 생겼어', { kind: 'tellSelf', key: 'dating', value: '수아' }]] },
];

for (const t of PARENT_TYPES) {
  if (!SHOW.includes(t.id)) continue;
  const role: ParentRole = t.id === 'gruffLoving' || t.id === 'volatile' ? 'dad' : 'mom';
  const { world, me, parent } = setup(t.id, role, 0.1);
  const rng = new Random(11);
  console.log(`\n━━━━━━━━ ${t.label} (${parent.me}) ━━━━━━━━  처음 애착 ${parent.attachment.toFixed(0)}`);
  for (const s of SCRIPT) {
    console.log(`\n  ◆ ${s.d}일째 — ${s.title}`);
    for (const [label, c] of s.choices) {
      const r = parent.talk(c, { day: s.d, rng, world, child: me, observed: s.obs });
      console.log(`    ▸ [${label}]`);
      for (const l of r.lines) console.log(l.who === 'narration' ? `      ${l.text}` : `      ${l.who === 'me' ? '나' : parent.me}: ${l.text}`);
      if (r.help) console.log(`      ⤷ 선택지: ${r.help.map((h) => h.label).join(' / ')}`);
    }
  }
  console.log(`\n  → 애착 ${parent.attachment.toFixed(0)}, 두려움 ${parent.fear.toFixed(0)}`);
}

// ---------- 2) 요약: 유형마다 1년 동안 평범하게 지내 보기 (무작위 행동) ----------
console.log('\n\n━━━━━━━━ 1년 요약 (같은 아이, 매일 1~3번 말 걸기, 가끔 용돈·고민·챙기기·말대꾸) ━━━━━━━━');
console.log('  유형                               애착(처음→1년)  두려움  소리침  손찌검  받은 용돈   스트레스/일');
for (const t of PARENT_TYPES) {
  const { world, me, parent } = setup(t.id, 'mom', 0.1);
  const rng = new Random(3);
  const a0 = parent.attachment;
  let money = 0;
  let stress = 0;
  for (let d = 1; d <= 365; d++) {
    const obs: Observed = { darkCircles: rng.chance(0.3), pcbangDaysThisWeek: rng.chance(0.3) ? 4 : 0, cameHomeLate: rng.chance(0.1), examSoon: d % 90 > 75 };
    const n = 1 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      const c: TalkChoice =
        x < 0.6 ? { kind: 'chat' } : x < 0.7 ? { kind: 'askMoney', amount: 20000 } : x < 0.8 ? { kind: 'worry' } : x < 0.9 ? { kind: 'care' } : { kind: 'talkBack' };
      const r = parent.talk(c, { day: d, rng, world, child: me, observed: obs });
      money += r.money;
      stress += r.childStress;
    }
  }
  console.log(
    `  ${t.label.padEnd(24, '　').slice(0, 24)} ${a0.toFixed(0).padStart(4)} → ${parent.attachment.toFixed(0).padStart(3)}     ${parent.fear.toFixed(0).padStart(4)}   ${String(parent.incidents.yelled).padStart(4)}   ${String(parent.incidents.hit).padStart(4)}   ${money.toLocaleString().padStart(9)}원   ${(stress / 365 >= 0 ? '+' : '') + (stress / 365).toFixed(1)}`,
  );
}
