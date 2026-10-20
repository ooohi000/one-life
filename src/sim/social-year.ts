/**
 * 한 학년 300명(10반) × 1년. 친구는 정해 주지 않는다 — 같은 반, 같은 PC방, 같은 학원에서 마주치고 맞으면 생긴다.
 * 무리가 생기고, 소문이 돌고, 무리가 범죄와 싸움을 바꾼다.
 * 실행: npm run sim:social
 */
import { powerOf } from '../engine/body/composition';
import { Random } from '../engine/core/Random';
import { CRIMES, type Fighter, resolveFight } from '../engine/justice';
import { josa } from '../engine/memory';
import { createNpcProfile, type NpcProfile } from '../engine/npc';
import { BEST_FRIEND, findGroups, FRIEND, type Group, groupOf, rallyForFight, RumorMill, SocialGraph } from '../engine/social';
import { trait, traitEffects } from '../engine/traits';

const N = Number(process.env.N ?? 600);
const DAYS = 300;
const rng = new Random(31);
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const g = new SocialGraph();
const mill = new RumorMill(g);

interface Kid { id: string; prof: NpcProfile; fx: ReturnType<typeof traitEffects>; seat: string[]; crimes: number; bulliedBy: number }
const kids = new Map<string, Kid>();

function hangoutsOf(prof: NpcProfile): string[] {
  const t = prof.traits;
  const h = new Set<string>();
  if (t.includes('gamer') || prof.goals.fun || prof.goals.proGamer) h.add('pcbang');
  if (t.includes('athletic') || prof.goals.fitness) h.add(rng.chance(0.5) ? 'gym' : 'soccer');
  if (prof.academyDays.length) h.add('academy');
  if (prof.goals.grades && rng.chance(0.5)) h.add('library');
  if (t.includes('artsy') || prof.goals.artist) h.add('practiceRoom');
  if (t.includes('socialite') || prof.goals.social) h.add('karaoke');
  if (t.includes('speedFreak')) h.add('ride');
  if (!h.size) h.add(rng.pick(['pcbang', 'karaoke', 'soccer', 'library']));
  return [...h];
}

for (let i = 0; i < N; i++) {
  const prof = createNpcProfile(`s${i}`, rng);
  prof.ch.name = rng.pick(SURNAMES) + prof.ch.name;
  const id = `s${i}`;
  const fx = traitEffects(prof.traits);
  g.add({ id, name: prof.ch.name, p: prof.personality, traits: prof.traits, hangouts: hangoutsOf(prof), cls: Math.floor(i / 30), power: Math.min(100, prof.ch.stats.fighting * 0.6 + powerOf(prof.ch) * 0.4 + fx.fightPower) });
  kids.set(id, { id, prof, fx, seat: [], crimes: 0, bulliedBy: 0 });
}
// 짝·앞뒤 자리 (학기마다 바뀌는 건 나중에)
for (let c = 0; c < N / 30; c++) {
  for (let j = 0; j < 30; j++) {
    const me = kids.get(`s${c * 30 + j}`)!;
    me.seat = [j - 1, j + 1, j - 6, j + 6].filter((x) => x >= 0 && x < 30).map((x) => `s${c * 30 + x}`);
  }
}
// 같은 곳의 "단골": 학원 같은 반, PC방 단골, 같은 운동장 팀 (10명 안팎, 반이 섞인다)
const regulars = new Map<string, Map<string, string[]>>();
for (const place of ['pcbang', 'gym', 'soccer', 'academy', 'library', 'practiceRoom', 'karaoke', 'ride']) {
  const goers = [...kids.keys()].filter((x) => g.people.get(x)!.hangouts.includes(place)).sort(() => rng.next() - 0.5);
  for (let i = 0; i < goers.length; i += 10) {
    const crew = goers.slice(i, i + 10);
    for (const x of crew) {
      if (!regulars.has(x)) regulars.set(x, new Map());
      regulars.get(x)!.set(place, crew.filter((y) => y !== x));
    }
  }
}
const P = (id: string) => g.people.get(id)!;
const K = (id: string) => kids.get(id)!;
const name = (id: string) => P(id).name;
const fighter = (id: string): Fighter => ({ id, name: name(id), fighting: K(id).prof.ch.stats.fighting, power: powerOf(K(id).prof.ch), fightPower: K(id).fx.fightPower, toughness: Math.min(1, K(id).fx.toughness) });
const story: string[] = [];
const say = (d: number, s: string) => story.push(`  ${String(d).padStart(3)}일째  ${s}`);
let groups: Group[] = [];
let watchRumor: string | null = null;
const rumorTrail: string[] = [];

for (let d = 0; d < DAYS; d++) {
  const weekday = d % 7 < 5;
  for (const [id, k] of kids) {
    const me = P(id);
    if (weekday) {
      // 교실: 짝·앞뒤 자리와 자주, 같은 반 다른 애들과 가끔
      for (const s of k.seat) if (rng.chance(0.5)) g.hangOut(id, s, d, rng, 20);
      // 쉬는 시간엔 반에서 이미 아는 애·잘 맞는 애 쪽으로 간다
      for (let t = 0; t < 2; t++) {
        const classmate = `s${me.cls * 30 + Math.floor(rng.next() * 30)}`;
        if (classmate === id) continue;
        const pull = 0.3 + (g.rel(id, classmate)?.closeness ?? 0) / 100 + Math.max(0, g.compat(me, P(classmate)));
        if (rng.chance(Math.min(1, pull))) g.hangOut(id, classmate, d, rng, 15);
      }
    }
    // 방과 후·주말: 자주 가는 곳에서 다른 반 애들과 마주침
    if (rng.chance(weekday ? 0.5 : 0.7)) {
      const place = rng.pick(me.hangouts);
      const crew = regulars.get(id)?.get(place) ?? [];
      for (let t = 0; t < 2 && crew.length; t++) g.hangOut(id, rng.pick(crew), d, rng, 60);
    }
    // 친구랑 일부러 논다
    const fr = g.friends(id);
    if (fr.length && rng.chance(0.4 + me.p.extraversion * 0.3)) g.hangOut(id, rng.pick(fr), d, rng, 60);
  }
  g.decay(d);
  mill.spread(d, rng);
  if (d % 30 === 29) {
    groups = findGroups(g, rng);
    // 친구에게 물든다: 한 달마다 반항심이 친한 친구들 쪽으로 조금씩 옮겨 간다
    for (const [id, k] of kids) {
      const fr = g.friends(id).filter((f) => g.mutual(id, f));
      if (!fr.length) continue;
      const avg = fr.reduce((s, f) => s + K(f).prof.attitudes.rebellion, 0) / fr.length;
      k.prof.attitudes.rebellion += (avg - k.prof.attitudes.rebellion) * (0.08 + k.fx.peerPressure * 0.1);
    }
  }

  // ── 괴롭힘: 친구 없는 애가 표적이 된다. 친구가 막아 준다 ──
  for (const [id, k] of kids) {
    if (!weekday || !k.prof.traits.includes('bully') || !rng.chance(0.03)) continue;
    const cls = [...kids.keys()].filter((x) => P(x).cls === P(id).cls && x !== id);
    const victim = cls.sort((a, b) => (g.friends(a).length + P(a).power / 30) - (g.friends(b).length + P(b).power / 30))[Math.floor(rng.next() * 4)]!;
    K(victim).bulliedBy++;
    g.event(victim, id, d, { fear: 10, grudge: 15, closeness: -10 });
    // 막아 줄 친구 (절친·의리·정의감)
    const defender = g.friends(victim).find((f) => f !== id && P(f).cls === P(id).cls && rng.chance(0.15 + K(f).fx.loyalty * 0.4 + K(f).fx.justice * 0.4 + (g.rel(f, victim)!.closeness >= BEST_FRIEND ? 0.2 : 0)));
    if (!defender) continue;
    const f = resolveFight([fighter(defender)], [fighter(id)], { place: 'classroom', firstStrike: rng.chance(0.5) ? 'A' : 'B', rng, day: d });
    const winner = f.winner === 'A' ? defender : id;
    const loser = winner === defender ? id : defender;
    for (const w of g.friends(victim)) g.event(w, defender, d, { respect: 10 });
    g.event(victim, defender, d, { closeness: 15, trust: 20 });
    if (!watchRumor && winner === defender) {
      watchRumor = `fight${d}`;
      mill.start({
        id: watchRumor, about: defender, true: true, juicy: 0.9, day: d, effect: { respect: 4, fear: 3 },
        versions: [
          `${josa(name(defender), '이가')} ${josa(name(victim), '을를')} 괴롭히던 ${josa(name(id), '을를')} 한 대 때렸대.`,
          `${josa(name(defender), '이가')} ${josa(name(id), '을를')} 교실에서 눕혀 버렸대.`,
          `${josa(name(defender), '이가')} ${name(id)} 코뼈를 부러뜨렸대. 걔 진짜 미쳤대.`,
          `${name(defender)} 원래 다른 학교에서 짱이었대. 전학 온 이유도 그거래.`,
        ],
      }, [victim, defender, ...cls.slice(0, 3)]);
      say(d, `${josa(name(defender), '이가')} ${josa(name(victim), '을를')} 괴롭히던 ${josa(name(id), '을를')} 막아섰다. ${f.summary} ${josa(name(winner), '이가')} 이겼다.`);
    }
    g.event(loser, winner, d, { grudge: 30, fear: 10 });
  }

  // 소문 추적
  if (watchRumor && (d - mill.rumors.get(watchRumor)!.day) % 3 === 0 && d - mill.rumors.get(watchRumor)!.day <= 21) {
    const r = mill.rumors.get(watchRumor)!;
    const sample = [...kids.keys()].find((x) => mill.knows(r.id, x) && mill.knows(r.id, x)!.version >= Math.min(3, Math.floor((d - r.day) / 5)));
    rumorTrail.push(`  +${String(d - r.day).padStart(2)}일: 아는 사람 ${String(mill.reach(r.id)).padStart(3)}명${sample ? ` — ${name(sample)}(${P(sample).cls + 1}반)가 들은 말: "${mill.versionText(r.id, sample)}"` : ''}`);
  }

  // ── 범죄: 무리가 끈다 (또래 압력) ──
  for (const [id, k] of kids) {
    const gr = groupOf(groups, id);
    // 또래 압력: 같이 노는 애들이 하면 나도 한다 (청소년 비행의 가장 강한 예측 변수)
    const fr = g.friends(id).filter((f) => g.mutual(id, f));
    const friendsWild = fr.length ? fr.reduce((s, f) => s + Math.max(0, K(f).prof.attitudes.rebellion - 0.35), 0) / fr.length : 0;
    const peer = ((gr?.delinquency ?? 0) * 0.5 + friendsWild * 4) * (0.5 + k.fx.peerPressure);
    for (const c of CRIMES) {
      if (c.onlyOn || c.id === 'kickboard') continue;
      const m = Math.exp(1.3 * k.fx.crime[c.lure]) * (0.3 + k.prof.attitudes.rebellion * 1.3) * (1 + peer * 3);
      if (rng.chance((c.yearly / 365) * m)) k.crimes++;
    }
  }

  // ── 무리끼리 패싸움 (일진 무리 둘이 부딪침) ──
  if (d % 30 === 15) {
    const gangs = groups.filter((x) => x.label === '일진 무리');
    if (gangs.length >= 2 && rng.chance(0.5)) {
      const [ga, gb] = [gangs[0]!, gangs[1]!];
      const traitsOf = (x: string) => ({ loyalty: K(x).fx.loyalty, fight: K(x).fx.fight });
      const A = rallyForFight(g, groups, ga.leader, rng, traitsOf);
      const B = rallyForFight(g, groups, gb.leader, rng, traitsOf);
      const f = resolveFight(A.map(fighter), B.map(fighter), { place: 'park', firstStrike: 'A', rng, day: d });
      say(d, `SNS로 약속을 잡았다. ${name(ga.leader)} 무리 ${A.length}명 vs ${name(gb.leader)} 무리 ${B.length}명. ${f.summary}`);
      const won = f.winner === 'A' ? A : B;
      const lost = f.winner === 'A' ? B : A;
      for (const w of won) for (const l of lost) g.event(l, w, d, { grudge: 20, fear: 8 });
      for (const x of [...kids.keys()]) if (rng.chance(0.3)) for (const w of won) g.event(x, w, d, { respect: 3, fear: 2 });
    }
  }
}

// ───────── 결과 ─────────
const ids = [...kids.keys()];
const pct = (n: number, d = N) => `${((n / d) * 100).toFixed(0)}%`;
const fc = ids.map((x) => g.friends(x).filter((f) => g.mutual(x, f)).length);
console.log(`\n━━ 한 학년 ${N}명 (${N / 30}반) × ${DAYS}일 ━━`);
console.log('\n[친구]');
console.log(`  서로 친구인 수: 0명 ${pct(fc.filter((n) => n === 0).length)}, 1~2명 ${pct(fc.filter((n) => n >= 1 && n <= 2).length)}, 3~5명 ${pct(fc.filter((n) => n >= 3 && n <= 5).length)}, 6명 이상 ${pct(fc.filter((n) => n >= 6).length)}`);
console.log(`  절친이 있는 학생 ${pct(ids.filter((x) => g.friends(x, BEST_FRIEND).some((f) => g.mutual(x, f, BEST_FRIEND))).length)}`);
const cross = ids.flatMap((x) => g.friends(x).filter((f) => g.mutual(x, f)).map((f) => P(f).cls !== P(x).cls));
console.log(`  친구 중 다른 반 친구 비율 ${pct(cross.filter(Boolean).length, cross.length)} (같은 PC방·학원·운동장에서)`);
const oneSided = ids.reduce((s, x) => s + g.friends(x).filter((f) => !g.mutual(x, f)).length, 0);
console.log(`  "나만 친구라고 생각하는" 짝사랑 우정 ${oneSided}건`);
const byTrait = (t: string) => {
  const xs = ids.filter((x) => P(x).traits.includes(t));
  return xs.length ? (xs.reduce((s, x) => s + g.friends(x).filter((f) => g.mutual(x, f)).length, 0) / xs.length).toFixed(1) : '-';
};
console.log(`  평균 친구 수 — 인싸 기질 ${byTrait('socialite')}, 아싸 기질 ${byTrait('loner')}, 괴롭히는 버릇 ${byTrait('bully')}, 의리파 ${byTrait('loyal')}`);

console.log('\n[무리]');
groups = findGroups(g, rng);
const labelCount = new Map<string, number>();
for (const gr of groups) labelCount.set(gr.label, (labelCount.get(gr.label) ?? 0) + 1);
console.log(`  무리 ${groups.length}개 — ${[...labelCount].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`  어떤 무리에도 안 속한 학생 ${pct(ids.filter((x) => !groupOf(groups, x)).length)}`);
for (const gr of [...groups].sort((a, b) => b.members.length - a.members.length).slice(0, 5)) {
  const common = new Map<string, number>();
  for (const m of gr.members) for (const t of P(m).traits) common.set(t, (common.get(t) ?? 0) + 1);
  const top = [...common].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => `${trait(t).label} ${n}`).join(', ');
  const classes = new Set(gr.members.map((m) => P(m).cls + 1));
  console.log(`  · ${gr.label} ${gr.members.length}명 (대장 ${name(gr.leader)}, ${[...classes].sort((a, b) => a - b).join('·')}반) — 많은 특성: ${top}`);
}

console.log('\n[또래 압력: 무리별 1년 범죄 (킥보드 제외)]');
const crimeBy = new Map<string, number[]>();
for (const x of ids) {
  const l = groupOf(groups, x)?.label ?? '무리 없음';
  crimeBy.set(l, [...(crimeBy.get(l) ?? []), K(x).crimes]);
}
for (const [l, v] of [...crimeBy].sort((a, b) => b[1].reduce((s, n) => s + n, 0) / b[1].length - a[1].reduce((s, n) => s + n, 0) / a[1].length)) {
  console.log(`  ${l.padEnd(8, '　')} ${String(v.length).padStart(3)}명 — 1년에 한 번이라도 ${pct(v.filter((n) => n > 0).length, v.length)}, 1인당 ${(v.reduce((s, n) => s + n, 0) / v.length).toFixed(2)}건`);
}

const quart = ids.map((x) => {
  const fr = g.friends(x).filter((f) => g.mutual(x, f));
  return { x, peer: fr.length ? fr.reduce((s, f) => s + K(f).prof.attitudes.rebellion, 0) / fr.length : -1 };
}).filter((q) => q.peer >= 0).sort((a, b) => a.peer - b.peer);
const q = Math.floor(quart.length / 4);
const rate = (xs: typeof quart) => pct(xs.filter((v) => K(v.x).crimes > 0).length, xs.length);
console.log(`  친구들이 반항적인 상위 25% — 1년에 한 번이라도 ${rate(quart.slice(-q))} / 하위 25% — ${rate(quart.slice(0, q))}`);

console.log('\n[괴롭힘]');
const bullied = ids.filter((x) => K(x).bulliedBy > 0);
console.log(`  괴롭힘 당한 학생 ${pct(bullied.length)} — 그중 친구 0명이던 학생 ${pct(bullied.filter((x) => g.friends(x).filter((f) => g.mutual(x, f)).length === 0).length, bullied.length)}`);

console.log('\n[소문 하나가 퍼지는 과정]');
console.log(rumorTrail.join('\n'));
console.log('\n[사건]');
console.log(story.slice(0, 8).join('\n'));
