/**
 * 고등학교 3년 × 1000명. 특성·가정·범죄·싸움·학폭위·소년 사법·아동 보호가 한데 돌아간다.
 * 실행: npm run sim:justice   (N=2000 으로 인원 조절)
 */
import { powerOf } from '../engine/body/composition';
import { Random } from '../engine/core/Random';
import { addDays } from '../engine/time/calendar';
import { Household, type ParentRole, ProtectionCase, Runaway, sampleParent } from '../engine/family';
import {
  appeal, type CaseResult, COUNSEL, type Counsel, CRIMES, crime, decide, type Discovery, discover, type Fighter, gatherEvidence, hireCounsel,
  crimeDay, type Measure, PLACES, processCase, proven, resolveFight, settlementAmount, STYLE_LABEL, threaten,
} from '../engine/justice';
import { josa, MemoryBank, World } from '../engine/memory';
import { createNpcProfile, type NpcProfile } from '../engine/npc';
import { trait, traitEffects } from '../engine/traits';

const N = Number(process.env.N ?? 1000);
const DAYS = 365 * 3;
const rng = new Random(77);
const world = new World();
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];

interface Kid {
  i: number;
  name: string;
  prof: NpcProfile;
  fx: ReturnType<typeof traitEffects>;
  house: Household;
  prot: ProtectionCase;
  mem: MemoryBank;
  run: Runaway;
  cls: number;
  bruiseDays: number;
  stress: number;
  cases: CaseResult[];
  measures: Measure[];
  awayUntil: number;
  expelled: boolean;
  bullied: number;
  story: string[];
  fightsWon: number;
  fightsLost: number;
  gamblingDebt: number;
}

const kids: Kid[] = [];
for (let i = 0; i < N; i++) {
  const prof = createNpcProfile(`k${i}`, rng);
  prof.ch.name = rng.pick(SURNAMES) + prof.ch.name;
  world.add({ id: `k${i}`, name: prof.ch.name, cue: '', manners: 0 });
  const slots: ParentRole[] = prof.family.parents === 'both' ? ['mom', 'dad'] : prof.family.parents === 'single' ? [rng.chance(0.75) ? 'mom' : 'dad'] : ['grandma'];
  const house = new Household(
    `k${i}`,
    slots.map((role, j) => {
      const s = sampleParent(rng);
      const m = new MemoryBank(`k${i}p${j}`);
      m.meet(`k${i}`, 0, '집', '가족', 1, 100);
      return { id: `k${i}p${j}`, role, type: s.type, traits: s.traits, memory: m };
    }),
    prof.need,
  );
  kids.push({
    i, name: prof.ch.name, prof, fx: traitEffects(prof.traits), house, prot: new ProtectionCase(house), mem: new MemoryBank(`k${i}`),
    run: new Runaway(), cls: Math.floor(i / 30), bruiseDays: 0, stress: 30, cases: [], measures: [], awayUntil: -1, expelled: false,
    bullied: 0, story: [], fightsWon: 0, fightsLost: 0, gamblingDebt: 0,
  });
}
const byClass = new Map<number, Kid[]>();
for (const k of kids) byClass.set(k.cls, [...(byClass.get(k.cls) ?? []), k]);

const AFTER_SCHOOL = ['schoolBack', 'alley', 'apartment', 'park', 'convenience', 'pcbang', 'riverside', 'abandoned'] as const;
const stat = { fights: 0, afterSchool: 0, unknown: 0, by: new Map<string, number>(), lostCctv: 0, lawyer: new Map<string, number>(), notProven: 0, appeals: 0, appealWon: 0, settlementPaid: 0 };
const counselLevels = new Map<string, number[]>();
const means = (k: Kid) => ({ origin: k.prof.ch.origin, expectation: k.prof.parentExpectation, involvement: Math.max(...k.house.parents.map((p) => p.traits.control * 0.6 + p.traits.presence * 0.4)) });

const has = (k: Kid, t: string) => k.prof.traits.includes(t);
const fighter = (k: Kid): Fighter => ({ id: `k${k.i}`, name: k.name, fighting: k.prof.ch.stats.fighting + (has(k, 'brawler') ? 20 : 0), power: powerOf(k.prof.ch), fightPower: k.fx.fightPower, toughness: Math.min(1, k.fx.toughness) });
const guardian = (k: Kid) => Math.max(0, Math.min(1, k.house.bestAttachment() / 100 - k.prof.need * 0.3 - (k.house.childAway ? 0.3 : 0)));
const atSchool = (k: Kid, d: number) => !k.expelled && d >= k.awayUntil && !k.run.active;
const log = (k: Kid, d: number, text: string) => k.story.push(`  ${yearLabel(d)}  ${text}`);
function yearLabel(d: number) {
  const months = ['3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '1월', '2월'];
  return `고${Math.floor(d / 365) + 1} ${months[Math.floor((d % 365) / 30.5)] ?? '2월'}`.padEnd(7);
}

/** 학폭위를 열고 결과를 기록 */
function committee(d: number, roles: Array<{ k: Kid; role: Parameters<typeof decide>[0] }>, inc: Parameters<typeof decide>[1], counsel?: Counsel) {
  for (const [idx, { k, role }] of roles.entries()) {
    let m = decide(role, inc);
    if (idx === 0 && counsel) {
      const key = counsel.kind === 'none' || counsel.kind === 'public' ? '변호사 없음·국선' : '사선 변호사';
      counselLevels.set(key, [...(counselLevels.get(key) ?? []), m.level]);
      // 무거운 조치면 돈 있는 집은 불복한다 (행정심판·소송)
      if (m.level >= 4 && (counsel.kind === 'private' || counsel.kind === 'top')) {
        const a = appeal(counsel, rng);
        stat.appeals++;
        if (a.reduced) {
          stat.appealWon++;
          m = decide({ ...role, remorse: 1, reconciled: 1, persuade: role.persuade + 0.5 }, inc);
          log(k, d, `행정소송까지 갔다(${(a.cost / 10000).toLocaleString()}만 원). 조치가 ${m.level}호로 낮아졌다.`);
        } else log(k, d, `행정소송을 했지만(${(a.cost / 10000).toLocaleString()}만 원) 기각됐다.`);
      }
    }
    k.measures.push(m);
    if (m.level === 9) k.expelled = true;
    if (m.daysOut && m.level !== 9) k.awayUntil = Math.max(k.awayUntil, d + m.daysOut);
    log(k, d, m.level === 0 ? (m.selfDefenseAccepted ? '학폭위: 정당방위 인정. 조치 없음.' : '학폭위: 조치 없음.') : `학폭위: ${m.level}호 ${m.label}. 생기부 ${m.record}.`);
  }
}

/** 경찰 사건 */
function arrest(k: Kid, d: number, crimeId: string, counsel: Counsel = COUNSEL.none, alreadySettled = false) {
  const c = crime(crimeId);
  const settled = alreadySettled || (c.hasVictim && rng.chance(counsel.settle + 0.25 + (k.prof.ch.origin === 'rich' ? 0.35 : k.prof.ch.origin === 'normal' ? 0.2 : 0) + k.fx.persuade * 0.2 - c.severity * 0.03));
  const priors = k.cases.length;
  const r = processCase(c, { age: 16 + Math.floor(d / 365), priorCases: priors, worstPrior: Math.max(0, ...k.cases.flatMap((x) => x.dispositions)), guardian: guardian(k), remorse: rng.next() * (has(k, 'filial') ? 1 : 0.7), persuade: k.fx.persuade + counsel.persuade }, settled, rng);
  k.cases.push(r);
  if (r.daysAway) k.awayUntil = Math.max(k.awayUntil, d + r.daysAway);
  log(k, d, `${c.label} — ${c.outcome} → ${r.final}`);
}

for (let d = 0; d < DAYS; d++) {
  const doy = d % 365;
  for (const k of kids) {
    // ── 집 ──
    if (k.run.active) {
      k.run.step(d, runInput(k, null), rng);
      if (!k.run.active) log(k, d, k.run.log.at(-1)!.text);
    } else if (!k.house.childAway) {
      const out = k.house.simulateDay({ rebellion: k.prof.attitudes.rebellion, neuroticism: k.prof.personality.neuroticism, agreeableness: k.prof.personality.agreeableness, stress: k.stress }, { day: d, rng, world, child: k.mem, observed: { darkCircles: rng.chance(0.25) } });
      k.stress = Math.max(0, Math.min(100, k.stress * 0.85 + out.childStress * k.fx.stress + 5));
      const hit = out.incidents.includes('hit');
      if (hit) {
        k.bruiseDays = 7 + Math.floor(rng.next() * 4);
        k.prot.afterIncident(d, true, rng);
      }
      const x = runInput(k, hit ? 'hit' : out.incidents.length ? 'yelled' : null);
      if (rng.chance(Runaway.dailyRisk(x))) {
        k.run.leave(d, 30000, x, rng, hit ? '맞고 나서' : '숨이 막혀서');
        log(k, d, '가출. ' + k.run.log.at(-1)!.text);
      }
    }
    if (k.bruiseDays > 0) k.bruiseDays--;

    // ── 학교: 담임·친구가 알아챔, 스스로 신고 ──
    if (atSchool(k, d) && k.prot.stage !== 'reported' && (k.bruiseDays > 0 || k.house.maxFear() > 50)) {
      const signs = { bruiseDays: k.bruiseDays, absences: 0, withdrawn: k.house.maxFear() > 40 };
      const before = k.prot.log.length;
      k.prot.observe('teacher', signs, { notice: 0.3 + rng.next() * 0.3, closeness: 0.3, meddle: 0.3 }, d, rng);
      const friend = rng.pick(byClass.get(k.cls)!);
      if (friend !== k) k.prot.observe('friend', signs, { notice: friend.fx.notice, closeness: 0.5, meddle: friend.fx.meddle }, d, rng);
      if (k.house.maxFear() > 60 && rng.chance(0.002)) k.prot.selfReport(d, rng);
      for (const e of k.prot.log.slice(before)) log(k, d, e.text);
    }

    // ── 범죄 ──
    if (!atSchool(k, d) && !k.run.active) continue;
    for (const c of CRIMES) {
      const dt = addDays({ year: 2026, month: 3, day: 2 }, d);
      if (!crimeDay(c, dt.month, dt.day)) continue;
      const days = c.onlyOn ? c.onlyOn.length : 365;
      const lure = k.fx.crime[c.lure] + (c.id === 'gambling' && k.gamblingDebt > 0 ? 0.5 : 0) + (c.lure === 'easyMoney' && k.gamblingDebt > 0 ? 0.8 : 0);
      const mult = Math.exp(1.3 * lure) * (0.3 + k.prof.attitudes.rebellion * 1.3) * (1 + k.fx.peerPressure * 0.4) * (1 + k.house.aversion()) * (k.run.active ? 3 : 1) * (c.lure === 'easyMoney' ? 1 + k.prof.need : 1);
      if (!rng.chance((c.yearly / days) * mult)) continue;
      if (c.id === 'gambling') k.gamblingDebt += 100000 + Math.floor(rng.next() * 400000);
      if (rng.chance(c.detect)) arrest(k, d, c.id);
    }
  }

  // ── 반마다: 괴롭힘과 일진 사냥꾼 ──
  for (const [, cls] of byClass) {
    const present = cls.filter((k) => atSchool(k, d));
    for (const bully of present.filter((k) => has(k, 'bully'))) {
      if (!rng.chance(0.004)) continue;
      const victims = present.filter((v) => v !== bully && (has(v, 'coward') || has(v, 'loner') || v.fx.fightPower < 0 || rng.chance(0.15)));
      if (!victims.length) continue;
      const victim = rng.pick(victims);
      victim.bullied++;
      victim.stress = Math.min(100, victim.stress + 8);
      const hunter = present.find((h) => h !== bully && h !== victim && h.fx.justice > 0 && rng.chance(0.35));
      let bullyThreat = false;
      if (hunter) afterBullying(d, hunter, bully, victim, present);
      else {
        // 괴롭힌 애가 입막음을 한다
        const th = threaten({ id: bully.name, name: bully.name, traits: bully.prof.traits, crew: present.filter((x) => x !== bully && has(x, 'bully')).length }, { id: victim.name, name: victim.name, traits: victim.prof.traits, fear: 30, role: 'victim' }, rng);
        if (th.evidence || th.defiant) log(bully, d, `${josa(victim.name, '을를')} 협박했다(${STYLE_LABEL[th.style]}). ${th.defiant ? '맞서 왔다.' : ''}${th.evidence ? (th.evidence === 'recording' ? ' 녹음돼 있었다.' : ' 캡처가 남았다.') : ''}`);
        if (!rng.chance(th.silenced ? 0.03 : th.defiant ? 0.5 : 0.12)) continue;
        bullyThreat = !!th.evidence;
      }
      if (!hunter) {
        // 피해 학생이 학교에 말함
        committee(d, [{ k: bully, role: { id: 'b', hit: true, struckFirst: true, proportionate: false, retaliatedLater: false, defendingOther: false, priorIncidents: Math.min(4, victim.bullied - 1), remorse: rng.next() * 0.7, reconciled: rng.next() * 0.6, persuade: bully.fx.persuade, threatened: bullyThreat } }], { type: 'bullying', worstInjury: 1, evidence: { cctv: false, witnesses: 3, filmed: false, medical: false } });
      }
    }
  }
}


/** 일진 사냥꾼이 끼어든다 — 그 자리에서, 또는 방과 후 찾아가서. 누가 알게 되나 → 증거 → 변호사 → 학폭위·경찰 */
function afterBullying(d: number, hunter: Kid, bully: Kid, victim: Kid, present: Kid[]) {
  stat.fights++;
  const later = rng.chance(0.3);
  if (later) stat.afterSchool++;
  const place = later ? rng.pick(AFTER_SCHOOL) : rng.chance(0.5) ? 'classroom' : 'schoolHall';
  const crew = present.filter((x) => x !== bully && has(x, 'bully') && rng.chance(0.5)).slice(0, 2);
  const f = resolveFight([fighter(hunter)], [fighter(bully), ...crew.map(fighter)], { place, firstStrike: later || rng.chance(0.4) ? 'A' : 'B', rng, day: d });
  f.winner === 'A' ? hunter.fightsWon++ : hunter.fightsLost++;
  log(hunter, d, `${josa(victim.name, '을를')} 괴롭히던 ${crew.length ? `${bully.name} 패거리(${crew.length + 1}명)를` : josa(bully.name, '을를')} ${later ? `방과 후 ${PLACES[place].label}에서` : `${PLACES[place].label}에서 그 자리에서`} 막아섰다. ${f.summary} ${f.winner === 'A' ? '이겼다.' : '졌다.'}`);
  const bullyWorst = Math.max(...f.injuries.filter((x) => x.id !== `k${hunter.i}`).map((x) => x.level));
  // 교실·복도에서 터지면 선생님이 바로 안다. 방과 후는 누가 말해야 안다
  let found: Discovery | null = later
    ? discover(f.trace, {
        injury: bullyWorst, fear: 0.2, pride: bully.prof.attitudes.pride * 0.8 + (has(bully, 'bully') ? 0.3 : 0), // 일진은 맞았다고 일러바치기 싫다
        parentPresence: Math.max(...bully.house.parents.map((p) => p.traits.presence)), parentInvolvement: means(bully).involvement,
        witnessMeddle: 0.15,
      }, rng)
    : { by: 'witness', afterDays: 0, police: f.trace.policeOnScene || bullyWorst >= 3, text: '반 애들이 다 봤다. 담임 선생님이 바로 왔다.' };
  if (!found) {
    stat.unknown++;
    log(hunter, d, '아무도 말하지 않았다. 없던 일이 됐다. 대신 학교에 소문이 돌았다.');
    return;
  }
  stat.by.set(found.by, (stat.by.get(found.by) ?? 0) + 1);
  const reportDay = d + found.afterDays;
  log(hunter, reportDay, found.text);
  // 양쪽 집이 변호사를 산다 (걸린 게 클수록, 돈 있을수록)
  const stakes = Math.min(1, 0.25 + bullyWorst * 0.2 + (found.police ? 0.3 : 0));
  const hc = hireCounsel(means(hunter), stakes, 'accused', rng);
  const bc = hireCounsel(means(bully), stakes, 'victim', rng);
  stat.lawyer.set(`${hunter.prof.ch.origin}:${hc.kind}`, (stat.lawyer.get(`${hunter.prof.ch.origin}:${hc.kind}`) ?? 0) + 1);
  if (hc.kind !== 'none') log(hunter, reportDay, `부모님이 ${hc.label}을 선임했다.${hc.fee ? ` (${(hc.fee / 10000).toLocaleString()}만 원)` : ''}`);
  if (bc.kind === 'private' || bc.kind === 'top') log(hunter, reportDay, `상대 쪽도 ${bc.label}을 붙였다. 맞신고가 들어왔다.`);
  // 증거: 늦을수록 사라진다. 변호사는 증거보전을 신청한다 (선임까지 2~3일)
  const preserve = hc.preserves || bc.preserves ? reportDay + 2 : null;
  const ev = gatherEvidence(f.trace, reportDay, bullyWorst >= 2, preserve);
  if (ev.lost.length) {
    stat.lostCctv++;
    log(hunter, reportDay, `조사해 보니 ${ev.lost.join(', ')}.`);
  }
  // 방과 후에 찾아간 쪽은 대개 부인한다 — 증거가 약하면 입증이 안 된다
  const denies = later && (has(hunter, 'liar') || hc.kind !== 'none' || rng.chance(0.4));
  const ok = proven(ev, denies, hc.contest, rng);
  if (!ok) stat.notProven++;
  const settle = rng.chance(0.2 + hc.settle - bc.settle * 0.5 + (hunter.prof.ch.origin === 'rich' ? 0.2 : 0));
  if (settle) {
    const amount = settlementAmount(bullyWorst, bc, rng);
    stat.settlementPaid += amount;
    log(hunter, reportDay, `합의했다. 합의금 ${(amount / 10000).toLocaleString()}만 원.`);
  }
  const inc = { type: crew.length ? ('groupAssault' as const) : ('assault' as const), worstInjury: bullyWorst, evidence: ev };
  committee(reportDay, [
    { k: hunter, role: { id: 'h', hit: true, struckFirst: f.firstStrike === 'A', proportionate: bullyWorst <= 1, retaliatedLater: later, defendingOther: true, priorIncidents: hunter.measures.length, remorse: 0.3 + rng.next() * 0.6, reconciled: settle ? 0.9 : 0.1 + rng.next() * 0.4, persuade: hunter.fx.persuade + hc.persuade, proven: ok } },
    { k: bully, role: { id: 'b', hit: true, struckFirst: f.firstStrike === 'B', proportionate: false, retaliatedLater: false, defendingOther: false, priorIncidents: bully.measures.length + Math.min(3, victim.bullied - 1), remorse: rng.next() * 0.6, reconciled: rng.next() * 0.5, persuade: bully.fx.persuade + bc.persuade } },
  ], inc, hc);
  if (found.police && ok && bullyWorst >= 1) arrest(hunter, reportDay, bullyWorst >= 3 ? 'injury' : 'assault', hc, settle);
}

function runInput(k: Kid, incident: 'yelled' | 'hit' | null) {
  return {
    fear: k.house.maxFear(), attachment: k.house.bestAttachment(), aversion: k.house.aversion(), incidentToday: incident, clashToday: false, stress: k.stress,
    rebellion: k.prof.attitudes.rebellion, impulsivity: k.prof.personality.impulsivity, belonging: 0.5, peerRanAway: false,
    parentsSearch: k.house.parents.some((p) => p.traits.affection >= 0.4), knowsHelp: rng.chance(0.5),
  };
}

// ───────── 결과 ─────────
const pct = (n: number, d = N) => `${((n / Math.max(1, d)) * 100).toFixed(1)}%`;
const count = (f: (k: Kid) => boolean) => kids.filter(f).length;
const allCases = kids.flatMap((k) => k.cases);
console.log(`\n━━ 고등학생 ${N}명 × 3년 ━━`);
console.log('\n[범죄와 처리]  현실 참고: 범죄소년(14~18세) 연 약 6만 명 → 1년에 약 2~3%가 입건');
console.log(`  3년 동안 한 번이라도 경찰 입건/단속      ${pct(count((k) => k.cases.length > 0))}  (1년 평균 ${pct(allCases.filter((c) => c.final !== '범칙금').length / 3)})`);
const finals = new Map<string, number>();
for (const c of allCases) {
  const key = c.prison ? '소년교도소' : c.dispositions.some((d) => d >= 8) ? '소년원(8~10호)' : c.dispositions.length ? '보호처분(1~7호)' : c.final;
  finals.set(key, (finals.get(key) ?? 0) + 1);
}
console.log(`  사건 ${allCases.length}건의 결말: ${[...finals].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  소년원 다녀온 학생       ${count((k) => k.cases.some((c) => c.dispositions.some((d) => d >= 8)))}명`);
console.log(`  소년교도소 간 학생       ${count((k) => k.cases.some((c) => c.prison))}명`);
console.log(`  전과가 생긴 학생         ${count((k) => k.cases.some((c) => c.record.criminal))}명 (보호처분은 전과 아님)`);
const crimeCount = new Map<string, number>();
for (const c of allCases) crimeCount.set(c.crimeId, (crimeCount.get(c.crimeId) ?? 0) + 1);
console.log(`  많이 걸린 순: ${[...crimeCount].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${crime(k).label} ${v}`).join(', ')}`);

console.log('\n[학폭위]');
const ms = kids.flatMap((k) => k.measures);
console.log(`  열린 조치 ${ms.length}건 — 정당방위 인정 ${ms.filter((m) => m.selfDefenseAccepted).length}, ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => `${l}호 ${ms.filter((m) => m.level === l).length}`).join(' ')}`);
console.log(`  퇴학 ${count((k) => k.expelled)}명, 괴롭힘을 당해 본 학생 ${pct(count((k) => k.bullied > 0))}`);
const hunters = kids.filter((k) => has(k, 'vigilante'));
console.log(`  일진 사냥꾼 ${hunters.length}명 — 싸움 ${hunters.reduce((s, k) => s + k.fightsWon + k.fightsLost, 0)}번 (승 ${hunters.reduce((s, k) => s + k.fightsWon, 0)}), 학폭위 조치 받은 사람 ${hunters.filter((k) => k.measures.some((m) => m.level > 0)).length}명, 정당방위 인정 ${hunters.reduce((s, k) => s + k.measures.filter((m) => m.selfDefenseAccepted).length, 0)}번`);

console.log('\n[방과 후 싸움과 증거]  (서울 공공 CCTV 약 20만 대, 지능형 33%, 관제요원 1명당 477대)');
console.log(`  일진 사냥꾼 싸움 ${stat.fights}번 중 방과 후 ${stat.afterSchool}번 — 그중 아무도 모르고 끝남 ${stat.unknown}번`);
console.log(`  알게 된 경로: ${[...stat.by].map(([k, v]) => `${({ police: '현장 출동', victim: '맞은 애', parents: '부모', witness: '목격자', video: '영상 유포' } as Record<string, string>)[k]} ${v}`).join(', ')}`);
console.log(`  신고가 늦어 영상이 사라진 사건 ${stat.lostCctv}건, 부인해서 입증 안 된 사건 ${stat.notProven}건`);
console.log(`  변호사 선임 (출신:종류): ${[...stat.lawyer].sort().map(([k, v]) => `${k.replace('rich', '부자').replace('normal', '평범').replace('poor', '서민').replace(':none', ' 없음').replace(':public', ' 국선').replace(':private', ' 사선').replace(':top', ' 로펌')} ${v}`).join(', ')}`);
for (const [k, v] of counselLevels) console.log(`  ${k}: 평균 학폭위 조치 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}호 (${v.length}건)`);
console.log(`  행정소송 ${stat.appeals}건 중 감경 ${stat.appealWon}건, 오간 합의금 ${(stat.settlementPaid / 10000).toLocaleString()}만 원`);

console.log('\n[아동 보호]  현실 참고: 판정 뒤 분리 9.4%, 재학대 15.9%, 아동 본인 신고 28%');
const prot = kids.filter((k) => k.prot.reports > 0);
const hitKids = count((k) => k.house.parents.some((p) => p.incidents.hit > 0));
console.log(`  3년 동안 맞은 적 있는 학생 ${pct(hitKids)}, 그중 신고까지 간 학생 ${pct(prot.length, hitKids)}`);
const outc = new Map<string, number>();
for (const k of prot) outc.set(k.prot.outcome ?? '-', (outc.get(k.prot.outcome ?? '-') ?? 0) + 1);
const KO: Record<string, string> = { notAbuse: '증거 부족', homeWithSupport: '원가정+사례관리', abuserRemoved: '가해 부모 퇴거', childSeparated: '아이 분리 보호' };
console.log(`  결과: ${[...outc].map(([k, v]) => `${KO[k] ?? k} ${v}`).join(', ')}`);
const decidedAbuse = prot.filter((k) => k.prot.outcome && k.prot.outcome !== 'notAbuse');
console.log(`  학대 판정 ${decidedAbuse.length}건 중 재학대 ${pct(decidedAbuse.filter((k) => k.prot.reabused).length, decidedAbuse.length)}`);

console.log('\n[특성 분포 (상위)]');
const tc = new Map<string, number>();
for (const k of kids) for (const t of k.prof.traits) tc.set(t, (tc.get(t) ?? 0) + 1);
console.log('  ' + [...tc].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t, v]) => `${trait(t).label} ${pct(v)}`).join(' · '));

// ───────── 이야기 ─────────
const show = (title: string, k: Kid | undefined) => {
  if (!k) return;
  console.log(`\n[${title}: ${k.name} — 특성 ${k.prof.traits.map((t) => trait(t).label).join(', ')} / 집: ${k.house.types.map((t) => t.label).join(' + ')}]`);
  for (const l of k.story.slice(0, 12)) console.log(l);
};
show('일진 사냥꾼', [...hunters].sort((a, b) => b.story.length - a.story.length)[0]);
show('소년원까지', kids.find((k) => k.cases.some((c) => c.dispositions.some((d) => d >= 8))));
show('신고로 이어진 아이', prot.find((k) => k.prot.outcome && k.prot.outcome !== 'notAbuse'));
const lifer = kids.find((k) => k.cases.some((c) => c.prison));
if (lifer) {
  show('소년교도소', lifer);
  console.log('  ' + lifer.cases.find((c) => c.prison)!.steps.join('\n  '));
}
