/**
 * 방과 후 싸움 하나를 장소·집안 형편을 바꿔 가며 수천 번 돌려 본다.
 * "아무도 모르면 끝"인가? 어디서, 누가, 언제 알게 되나? 늦은 신고와 변호사는 무엇을 바꾸나?
 * 실행: npm run sim:afterschool
 */
import { Random } from '../engine/core/Random';
import {
  decide, discover, type Fighter, gatherEvidence, hireCounsel, PLACES, type PlaceId, proven, resolveFight,
} from '../engine/justice';

const rng = new Random(5);
const me: Fighter = { id: 'me', name: '나', fighting: 55, power: 55, fightPower: 5, toughness: 0.2 };
const him: Fighter = { id: 'him', name: '일진', fighting: 45, power: 50, fightPower: 0, toughness: 0.2 };
const RUNS = 3000;

console.log('\n━━ 방과 후, 일진을 찾아가 때렸다 (내가 먼저) ━━');
console.log('장소                  CCTV 찍힘  현장 출동  아무도 모름  나중에 알려짐(평균 며칠 뒤)  알려졌을 때 영상 남아 있음');
for (const place of ['schoolBack', 'alley', 'apartment', 'park', 'convenience', 'pcbang', 'riverside', 'abandoned', 'downtown'] as PlaceId[]) {
  let cctv = 0, police = 0, unknown = 0, laterN = 0, laterDays = 0, kept = 0, found = 0;
  for (let i = 0; i < RUNS; i++) {
    const f = resolveFight([me], [him], { place, firstStrike: 'A', rng, day: 0 });
    if (f.trace.cctvUntil !== null) cctv++;
    const inj = Math.max(...f.injuries.filter((x) => x.id === 'him').map((x) => x.level));
    const d = discover(f.trace, { injury: inj, fear: 0.2, pride: 0.6, parentPresence: 0.6, parentInvolvement: 0.5, witnessMeddle: 0.15 }, rng);
    if (!d) { unknown++; continue; }
    found++;
    if (d.by === 'police') police++;
    else { laterN++; laterDays += d.afterDays; }
    const ev = gatherEvidence(f.trace, d.afterDays, inj >= 2);
    if (ev.cctv || ev.blackbox || ev.filmed) kept++;
  }
  const p = (n: number, d = RUNS) => `${((n / Math.max(1, d)) * 100).toFixed(0)}%`.padStart(5);
  console.log(`${PLACES[place].label.padEnd(12, '　')}  ${p(cctv)}     ${p(police)}      ${p(unknown)}         ${laterN ? (laterDays / laterN).toFixed(1) : '-'}일`.padEnd(70) + `${p(kept, found)}`);
}

console.log('\n━━ 신고가 며칠 늦으면 증거가 어떻게 되나 (주택가 골목) ━━');
for (const delay of [0, 3, 7, 15, 31, 45]) {
  let hasVideo = 0, prov = 0, provLawyer = 0;
  for (let i = 0; i < RUNS; i++) {
    const f = resolveFight([me], [him], { place: 'alley', firstStrike: 'A', rng, day: 0 });
    const ev = gatherEvidence(f.trace, delay, false);
    if (ev.cctv || ev.blackbox) hasVideo++;
    if (proven(ev, true, 0, rng)) prov++;
    if (proven(ev, true, 0.6, rng)) provLawyer++;
  }
  console.log(`  ${String(delay).padStart(2)}일 뒤 신고 → 영상 남음 ${((hasVideo / RUNS) * 100).toFixed(0).padStart(3)}%, 내가 부인하면 입증 ${((prov / RUNS) * 100).toFixed(0).padStart(3)}% (상대가 로펌 끼면 ${((provLawyer / RUNS) * 100).toFixed(0)}%)`);
}

console.log('\n━━ 똑같이 걸렸을 때, 집안 형편별 변호사와 학폭위 결과 ━━');
for (const origin of ['poor', 'normal', 'rich'] as const) {
  const kinds = new Map<string, number>();
  let level = 0, cost = 0;
  for (let i = 0; i < RUNS; i++) {
    const c = hireCounsel({ origin, expectation: 0.6, involvement: 0.6 }, 0.6, 'accused', rng);
    kinds.set(c.label, (kinds.get(c.label) ?? 0) + 1);
    cost += c.fee;
    level += decide({ id: 'me', hit: true, struckFirst: true, proportionate: false, retaliatedLater: true, defendingOther: true, priorIncidents: 0, remorse: 0.5, reconciled: 0.3 + c.settle, persuade: c.persuade }, { type: 'assault', worstInjury: 2, evidence: { cctv: true, witnesses: 1, filmed: false, medical: true } }).level;
  }
  console.log(`  ${({ poor: '서민', normal: '평범', rich: '부자' })[origin]}: ${[...kinds].map(([k, v]) => `${k} ${((v / RUNS) * 100).toFixed(0)}%`).join(', ')} → 평균 ${(level / RUNS).toFixed(1)}호, 평균 변호사비 ${Math.round(cost / RUNS / 10000)}만 원`);
}

// ───────── 입막음 ─────────
import { STYLE_LABEL, threaten, type ThreatActor, type ThreatTarget } from '../engine/justice/intimidation';

console.log('\n━━ 입막음: 때린 애가 맞은 애·본 애를 찾아간다 ━━');
const SAMPLES: Array<{ a: ThreatActor; t: ThreatTarget }> = [
  { a: { id: 'a', name: '강주원', traits: ['bully', 'brawler'], crew: 0 }, t: { id: 't', name: '이서준', traits: ['coward'], fear: 40, role: 'victim' } },
  { a: { id: 'a', name: '강주원', traits: ['bully', 'leader'], crew: 2 }, t: { id: 't', name: '박지호', traits: ['gritty', 'observant'], fear: 10, role: 'victim' } },
  { a: { id: 'a', name: '정민재', traits: ['silverTongue', 'liar'], crew: 0 }, t: { id: 't', name: '최우진', traits: ['loyal'], fear: 10, role: 'victim' } },
  { a: { id: 'a', name: '정민재', traits: ['attention', 'coward'], crew: 0 }, t: { id: 't', name: '한도윤', traits: ['rulesFollower'], fear: 5, role: 'witness' } },
  { a: { id: 'a', name: '서시우', traits: ['bluffer'], crew: 0 }, t: { id: 't', name: '김하준', traits: ['meddler'], fear: 5, role: 'witness' } },
  { a: { id: 'a', name: '강주원', traits: ['bully', 'hotHeaded'], crew: 0 }, t: { id: 't', name: '윤태윤', traits: ['vigilante', 'gritty', 'observant'], fear: 0, role: 'witness' } },
];
const tr = new Random(77);
for (const { a, t } of SAMPLES) {
  const r = threaten(a, t, tr);
  console.log(`\n  [${STYLE_LABEL[r.style]}] ${a.name} → ${t.name}(${t.role === 'victim' ? '맞은 애' : '본 애'})`);
  for (const l of r.lines) console.log(`    ${l.who === 'narration' ? '' : `${l.who === 'a' ? a.name : t.name}: `}${l.text}`);
  console.log(`    → ${r.silenced ? '입을 닫았다' : r.defiant ? '맞섰다' : '흔들렸다'}${r.evidence ? `, 증거 남음(${r.evidence === 'recording' ? '녹음' : '캡처'})` : ''}, 무서움 +${r.fearAdded}`);
}

console.log('\n━━ 입막음이 결과를 어떻게 바꾸나 (주택가 골목, 맞은 애가 겁 많은 편) ━━');
for (const withThreat of [false, true]) {
  let unknown = 0, found = 0, threatEv = 0, levelSum = 0;
  for (let i = 0; i < RUNS; i++) {
    const f = resolveFight([him], [me], { place: 'alley', firstStrike: 'A', rng, day: 0 });
    const inj = Math.max(...f.injuries.filter((x) => x.id === 'me').map((x) => x.level));
    let fear = 0.4;
    let ev: string | null = null;
    let defiant = false;
    if (withThreat) {
      const r = threaten({ id: 'him', name: '일진', traits: ['bully'], crew: rng.chance(0.5) ? 2 : 0 }, { id: 'me', name: '나', traits: rng.chance(0.3) ? ['coward'] : rng.chance(0.3) ? ['observant'] : [], fear: 40, role: 'victim' }, rng);
      fear = Math.min(1, fear + r.fearAdded / 100 + (r.silenced ? 0.3 : 0));
      ev = r.evidence;
      defiant = r.defiant;
    }
    const d = discover(f.trace, { injury: inj, fear: defiant ? 0.1 : fear, pride: 0.2, parentPresence: 0.6, parentInvolvement: 0.5, witnessMeddle: 0.15 }, rng);
    if (!d) { unknown++; continue; }
    found++;
    if (ev) threatEv++;
    levelSum += decide({ id: 'him', hit: true, struckFirst: true, proportionate: false, retaliatedLater: false, defendingOther: false, priorIncidents: 1, remorse: 0.3, reconciled: 0.2, persuade: 0, threatened: !!ev }, { type: 'assault', worstInjury: inj, evidence: { cctv: true, witnesses: 1, filmed: false, medical: inj >= 2 } }).level;
  }
  console.log(`  ${withThreat ? '협박함  ' : '협박 안 함'}: 아무도 모름 ${((unknown / RUNS) * 100).toFixed(0)}% · 들켰을 때 협박 증거 남음 ${((threatEv / Math.max(1, found)) * 100).toFixed(0)}% · 들켰을 때 평균 ${(levelSum / Math.max(1, found)).toFixed(1)}호`);
}
