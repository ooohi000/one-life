/**
 * 글자로 하는 플레이 (화면이 붙기 전 임시). 진짜 세계 안에서 주인공으로 산다.
 * 실행: npm run play            새 게임
 *       npm run play -- load    saves/slot1.json 불러오기
 * 명령: 번호 = 고르기 · t 번호 = 말 걸기 · m = 엄마(부모)한테 말 걸기 · s = 상태 · save = 저장 · q = 끝
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { addDays } from '../engine/time/calendar';
import { trait } from '../engine/traits';
import { describeWeather, type SaveFile, WorldSim } from '../engine/world';
import { OUTFIT_KO } from '../engine/env';
import { describeCarry } from '../engine/carry';
import { autoHand, type ConvenienceShift } from '../engine/work';
import { Random } from '../engine/core/Random';

const SLOT = 'saves/slot1.json';
const START = { year: 2026, month: 3, day: 2 };
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q: string) => {
  process.stdout.write(q);
  const r = await lines.next();
  if (r.done) return 'q';
  if (!process.stdin.isTTY) process.stdout.write(`${r.value}\n`);
  return r.value as string;
};
const w = process.argv.includes('load')
  ? WorldSim.load(JSON.parse(readFileSync(SLOT, 'utf8')) as SaveFile)
  : new WorldSim({ students: 120, seed: Number(process.env.SEED ?? Date.now() % 100000), start: START, protagonist: 0 });
const me = w.player!;
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

console.log(`\n${me.name} (${me.cls + 1}반, ${me.prof.ch.ageYears}살)`);
console.log(`특성: ${me.prof.traits.map((t) => `${trait(t).label}(${trait(t).desc})`).join(' / ')}`);
console.log(`집: ${me.house.types.map((t) => t.label).join(' + ')}`);
console.log('명령: 번호 고르기 · t 번호 말 걸기 · m 부모 · s 상태 · z 자기 · save 저장 · q 끝\n');

async function main() {
  for (;;) {
    if (!w.playerDecision && !w.prompts.length) {
      if (w.day > 0 || w.commands.length) w.endDay();
      w.beginDay();
      const dt = addDays(START, w.day);
      const date = new Date(dt.year, dt.month - 1, dt.day);
      console.log(`\n━━━━ ${dt.month}월 ${dt.day}일 (${WD[date.getDay()]}) ━━━━`);
      console.log(`  ${describeWeather(w.today)} · 옷: ${OUTFIT_KO[w.today.outfit]}`);
      for (const n of w.today.notes) console.log(`  🌤 ${n}`);
      for (const e of w.city.log.filter((x) => x.day === w.day && x.area === me.area)) console.log(`  🏗 ${e.text}`);
      if (w.playerCarry && ['rain', 'shower', 'monsoon', 'typhoon', 'snow', 'cloudy'].includes(w.today.sky)) {
        const a2 = await ask(`  ${w.today.sky === 'cloudy' ? '하늘이 꾸물꾸물하다.' : '비가 온다.'} 우산 챙길까? (y/n) > `);
        w.packUmbrella(a2.trim().toLowerCase().startsWith('y'));
      }
      for (const e of me.story.filter((x) => x.day === w.day - 1)) console.log(`  📌 ${e.text}`);
      if (!w.playerDecision) {
        console.log(`  (${me.away?.reason ?? (me.run.active ? '가출' : '부재')} — 하루가 지나갔다)`);
        w.endDay();
        continue;
      }
    }
    for (const q of [...w.prompts]) {
      console.log(`\n  ❓ ${q.text}`);
      q.options.forEach((o, i) => console.log(`     ${i + 1}. ${o.label}`));
      const a = await ask('  > ');
      const o = q.options[Number(a) - 1] ?? q.options[q.options.length - 1]!;
      w.answer(q.id, o.id);
      for (const e of me.story.filter((x) => x.day === w.day).slice(-3)) console.log(`  📌 ${e.text}`);
    }
    const dcs = w.playerDecision;
    if (!dcs) continue;
    const opts: Array<{ label: string; ans: string }> =
      dcs.kind === 'school' ? [{ label: '학교 간다', ans: 'attend' }, { label: '땡땡이친다', ans: 'skip' }]
      : dcs.kind === 'commitment' ? [{ label: `${dcs.action.label} 간다`, ans: 'go' }, { label: '빠진다', ans: 'skip' }]
      : [...dcs.options.map((o) => ({ label: `${o.label} (${o.place}, ${o.minutes}분${o.cost > 0 ? `, ${o.cost.toLocaleString()}원` : ''})`, ans: o.id })), { label: '잔다', ans: 'sleep' }];
    const now = dcs.kind === 'free' ? dcs.now : me.life.clock.minuteOfDay;
    const here = w.peopleHere();
    console.log(`\n  ${hhmm(now)} · ${w.playerNow().place} · 돈 ${me.life.money.toLocaleString()}원 · 스트레스 ${me.life.ch.body.stress.toFixed(0)}${here.length ? ` · 여기: ${here.slice(0, 6).map((s, i) => `${i + 1}.${s.name}`).join(' ')}` : ''}`);
    opts.forEach((o, i) => console.log(`     ${i + 1}. ${o.label}`));
    const a = (await ask('  > ')).trim();
    if (a === 'q') break;
    if (a === 'z' && dcs.kind === 'free') {
      w.choose('sleep');
      continue;
    }
    if (a === 'save') {
      mkdirSync('saves', { recursive: true });
      writeFileSync(SLOT, JSON.stringify(w.save()));
      console.log(`  💾 저장했다 (${SLOT})`);
      continue;
    }
    if (a === 's') {
      if (w.playerCarry) console.log(`  ${describeCarry(w.playerCarry)}`);
      const fr = w.graph.friends(me.id, 20);
      console.log(`  몸무게 ${me.life.ch.body.weightKg.toFixed(1)}kg · 공부 ${me.life.ch.stats.study.toFixed(1)} · 싸움 ${me.life.ch.stats.fighting.toFixed(1)}`);
      console.log(`  아는 애들: ${fr.map((f) => `${w.student(f).name}(${w.graph.rel(me.id, f)!.closeness.toFixed(0)})`).join(', ') || '아직 없음'}`);
      continue;
    }
    if (a === 'm' && w.playerNow().place !== '집') {
      console.log('  (부모님은 집에 계신다. 집에 가서 말 걸자.)');
      continue;
    }
    if (a === 'm') {
      const r = w.talkToParent(0, { kind: 'chat' });
      for (const l of r.lines) console.log(`  ${l.who === me.id ? '나' : l.who === 'narration' ? '' : me.house.parents[0]!.me + ':'} ${l.text}`);
      continue;
    }
    if (a.startsWith('t')) {
      const t = here[Number(a.slice(1).trim()) - 1];
      if (t) for (const l of w.talkTo(t.id)) console.log(`  ${t.name}: ${l.text}`);
      continue;
    }
    const pick = opts[Number(a) - 1];
    if (pick && dcs.kind === 'commitment' && dcs.action.id === 'partTime' && pick.ans === 'go') {
      const shift = w.startShift();
      if (shift) {
        await runShift(shift);
        const r = w.finishShift(shift);
        console.log(`\n  ── 근무 끝 ── 손님 ${r.customers}명 · 매출 ${r.sales.toLocaleString()}원 · 화나서 나감 ${r.leftAngry} · 거스름돈 실수 ${r.changeErrors} · 만족 ${r.satisfaction}`);
        console.log(`  번 돈 ${r.wage.toLocaleString()}원 · 사장님 평가 ${r.standingDelta >= 0 ? '+' : ''}${r.standingDelta}${r.fired ? ' · ❌ 잘렸다' : ''}`);
        continue;
      }
    }
    if (pick) w.choose(pick.ans);
  }
  rl.close();
}
void main();

/** 편의점 근무를 손으로 한다: 계산은 거스름돈을 직접 계산해서 입력 (빠르고 정확할수록 좋다) */
async function runShift(sh: ConvenienceShift) {
  console.log(`\n  ━━ ${sh.job.store} 근무 시작 ━━  (번호: 할 일 · w: 기다리기 · a: 나머지는 평소대로)`);
  let seen = 0;
  const auto = new Random(1);
  const flush = () => {
    for (const e of sh.report.events.slice(seen)) console.log(`  ${hhmm(e.minute)}  ${e.text}`);
    seen = sh.report.events.length;
  };
  let autoMode = false;
  while (!sh.done) {
    flush();
    if (sh.dilemma) {
      const d = sh.dilemma;
      d.options.forEach((o, i) => console.log(`     ${i + 1}. ${o.label}`));
      const a = autoMode ? '1' : await ask('  > ');
      sh.decide((d.options[Number(a) - 1] ?? d.options[0]!).id);
      continue;
    }
    if (autoMode) {
      const t = sh.tasks.find((x) => x.kind === 'checkout') ?? sh.tasks[0];
      if (t) sh.perform(t.id, autoHand(sh.worker, sh.job, t, auto));
      else sh.tick();
      continue;
    }
    if (!sh.tasks.length) {
      sh.tick();
      continue;
    }
    console.log(`\n  ${hhmm(sh.minute)} · 줄 선 손님 ${sh.queue.length}명`);
    sh.tasks.slice(0, 6).forEach((t, i) => console.log(`     ${i + 1}. ${t.label}`));
    const a = (await ask('  > ')).trim();
    if (a === 'a' || a === 'q') { autoMode = true; continue; } // 그만두면 나머지는 평소대로
    if (a === 'w') { sh.tick(); continue; }
    const t = sh.tasks[Number(a) - 1];
    if (!t) continue;
    const t0 = Date.now();
    if (t.kind === 'checkout' && t.customer) {
      const total = t.customer.items.reduce((x, p) => x + p.price, 0);
      const pays = t.customer.pays;
      console.log(`     삑 삑 ${t.customer.items.map((p) => `${p.name} ${p.price.toLocaleString()}`).join(' / ')}  = ${total.toLocaleString()}원`);
      if (pays > total) {
        const ans = await ask(`     손님이 ${pays.toLocaleString()}원을 냈다. 거스름돈은? > `);
        const sec = (Date.now() - t0) / 1000;
        const given = Number(ans.replace(/[^0-9]/g, '')) || 0;
        const err = given - (pays - total);
        console.log(err === 0 ? '     "감사합니다~"' : `     (${err > 0 ? '더' : '덜'} 줬다)`);
        sh.perform(t.id, { quality: Math.max(0, Math.min(1, 1.2 - sec / 10)), changeError: Math.max(-10000, Math.min(10000, err)) });
      } else {
        await ask('     카드 결제. 엔터로 결제 > ');
        sh.perform(t.id, { quality: Math.max(0, Math.min(1, 1.2 - (Date.now() - t0) / 4000)) });
      }
    } else {
      await ask(`     ${t.label} — 엔터 > `);
      sh.perform(t.id, { quality: Math.max(0.3, Math.min(1, 1.1 - (Date.now() - t0) / 5000)) });
    }
  }
  flush();
}
