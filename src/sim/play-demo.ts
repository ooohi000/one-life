/**
 * 주인공으로 2주 살아 보기 (대본 없이, 정해 둔 성향대로 고르는 "가상 플레이어").
 * 중간에 저장 → 불러오기 → 세계가 똑같은지 확인한다.
 * 실행: npm run sim:play
 */
import { ACTIONS } from '../engine/npc';
import { addDays } from '../engine/time/calendar';
import { trait } from '../engine/traits';
import { WorldSim } from '../engine/world';

const START = { year: 2026, month: 3, day: 2 };
const w = new WorldSim({ students: 120, seed: 11, start: START, protagonist: 0 });
const me = w.player!;
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
console.log(`\n주인공: ${me.name} (${me.cls + 1}반) — 특성 ${me.prof.traits.map((t) => trait(t).label).join(', ')} / 집: ${me.house.types.map((t) => t.label).join(' + ')}`);

/** 가상 플레이어: 학교는 가고, 저녁엔 PC방이나 운동, 괴롭힘을 보면 막아선다 */
function playDay() {
  const dt = addDays(START, w.day);
  console.log(`\n━━ ${dt.month}/${dt.day} ━━`);
  w.beginDay();
  for (const q of [...w.prompts]) {
    const pick = q.options.find((o) => ['block', 'fight', 'record'].includes(o.id)) ?? q.options[0]!;
    console.log(`  ❓ ${q.text}\n     → [${pick.label}]`);
    w.answer(q.id, pick.id);
  }
  let talkedHere = false;
  while (w.playerDecision) {
    const dcs = w.playerDecision;
    if (dcs.kind === 'school') {
      console.log(`  07:30 학교 갈까? → 간다`);
      w.choose('attend');
    } else if (dcs.kind === 'commitment') {
      console.log(`  ${hhmm(me.life.clock.minuteOfDay)} ${dcs.action.label} 갈 시간 → 간다`);
      w.choose('go');
    } else {
      const ids = dcs.options.map((o) => o.id);
      const want = ['pcbang', 'gym', 'soccer', 'hangout', 'homeStudy', 'homeRest'].find((x) => ids.includes(x));
      if (dcs.now >= 22 * 60 || !want) {
        console.log(`  ${hhmm(dcs.now)} 잔다`);
        w.choose('sleep');
        break;
      }
      const a = ACTIONS.find((x) => x.id === want)!;
      console.log(`  ${hhmm(dcs.now)} 선택지 ${dcs.options.length}개 (${dcs.options.slice(0, 5).map((o) => o.label).join('·')}…) → ${a.label}`);
      w.choose(want);
      // 그 자리에 누가 있나
      const here = w.peopleHere();
      if (here.length && !talkedHere) {
        console.log(`     ${a.place}에 ${here.slice(0, 4).map((s) => s.name).join(', ')}${here.length > 4 ? ` 외 ${here.length - 4}명` : ''}`);
        const t = here[0]!;
        for (const l of w.talkTo(t.id)) console.log(`     ${t.name}: ${l.text}`);
        talkedHere = true;
      }
    }
  }
  while (w.playerDecision) w.choose(w.playerDecision.auto);
  if (w.day % 3 === 0) {
    const r = w.talkToParent(0, { kind: 'chat' });
    for (const l of r.lines) console.log(`  [집] ${l.who === me.id ? '나' : l.who === 'narration' ? '' : me.house.parents[0]!.me}: ${l.text}`);
  }
  w.endDay();
  for (const e of me.story.filter((x) => x.day === w.day - 1 && x.weight >= 2)) console.log(`  📌 ${e.text}`);
}

for (let i = 0; i < 10; i++) playDay();
const save = w.save();
const json = JSON.stringify(save);
console.log(`\n💾 저장: ${w.day}일째, 선택 ${save.commands.length}개, 파일 ${(json.length / 1024).toFixed(1)}KB`);
const t0 = Date.now();
const loaded = WorldSim.load(JSON.parse(json));
const sig = (x: WorldSim) => JSON.stringify([x.day, x.log.length, x.player!.life.ch.body.weightKg.toFixed(3), x.player!.life.money, [...x.students.values()].map((s) => s.life.ch.body.stress.toFixed(2)).join(','), x.graph.friends(x.player!.id)]);
console.log(`📂 불러오기 ${((Date.now() - t0) / 1000).toFixed(1)}초 — 같은 세계인가? ${sig(loaded) === sig(w) ? '✅ 똑같다' : '❌ 다르다'}`);
console.log(`\n친구: ${w.graph.friends(me.id, 20).map((f) => `${w.student(f).name}(${w.graph.rel(me.id, f)!.closeness.toFixed(0)})`).join(', ') || '아직 없음'}`);
