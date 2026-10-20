/**
 * 기억이 대화가 되는 과정. 같은 일을 겪은 세 엄마(비교형·다정형·무심형)가 몇 년 뒤 각자 다르게 말한다.
 * 대사는 미리 쓴 게 아니라: 누구를 언제 어디서 만났나 + 그 사람에 대해 뭘 아나(직접/들음/소문) + 엄마의 성향
 * 으로 조립된다.
 * 실행: npm run sim:memory
 */
import { Random } from '../engine/core/Random';
import { converse, type SpeakerStyle } from '../engine/dialogue';
import { MemoryBank, tell, World } from '../engine/memory';

const world = new World();
const me = world.add({ id: 'me', name: '민준', cue: '', manners: 0 });
const seojun = world.add({ id: 'seojun', name: '서준', cue: '키 큰 애', manners: 0.7 });
const hajun = world.add({ id: 'hajun', name: '하준', cue: '머리 노랗던 애', manners: -0.6 });
const jiho = world.add({ id: 'jiho', name: '지호', cue: '안경 쓴 애', manners: 0.4 });

const MOMS: Array<{ label: string; style: SpeakerStyle }> = [
  { label: '비교하는 엄마 (기대 높음·무뚝뚝)', style: { warmth: 0.25, expectation: 0.85 } },
  { label: '다정한 엄마 (기대 높음·따뜻함)', style: { warmth: 0.85, expectation: 0.7 } },
  { label: '무심한 엄마 (기대 낮음)', style: { warmth: 0.3, expectation: 0.2 } },
];

const NAMES: Record<string, string> = { me: '민준', mom: '엄마' };
const show = (lines: Array<{ who: string; text: string }>) =>
  lines.forEach((l) => console.log(`    ${(NAMES[l.who] ?? l.who).padEnd(3)}: ${l.text}`));

for (const m of MOMS) {
  console.log(`\n━━━━━━━━ ${m.label} ━━━━━━━━`);
  const mom = new MemoryBank('mom');
  const boy = new MemoryBank('me');
  const seojunMom = new MemoryBank('seojunMom');
  const rng = new Random(42);

  // 고1 시작: 민준은 반 친구들을 사귄다
  mom.meet(me.id, 0, '집', '가족', 1, 100);
  for (const f of [seojun, hajun, jiho]) boy.meet(f.id, 2, '학교', '같은 반', 0.9, 20);
  seojunMom.meet(seojun.id, 0, '집', '가족', 1, 100);

  console.log('  [고1 5월] 서준이 집에 놀러 옴 → 엄마가 처음 봄 (예의 바름)');
  mom.meet(seojun.id, 60, '집', '집에 놀러 왔던', 0.8, seojun.manners * 30);
  console.log('  [고1 7월] 운동회에서 하준을 잠깐 봄 → 인사도 안 함');
  mom.meet(hajun.id, 130, '학교', '운동회', 0.25, hajun.manners * 30);
  console.log('  [고2 4월] 민준 생일에 지호가 옴');
  mom.meet(jiho.id, 420, '집', '생일 파티', 0.6, jiho.manners * 30);

  // 고1~고3: 민준이 저녁마다 가끔 친구 얘기를 한다 (서준 얘기가 제일 많다) → 엄마 기억이 계속 새로워진다
  for (let d = 30; d < 1080; d += 21) {
    const r = rng.next();
    mom.hear(r < 0.55 ? 'seojun' : r < 0.8 ? 'jiho' : 'hajun', d);
  }
  /** 대학 이후엔 연락하는 서준 얘기만 가끔 나온다 */
  const chatter = (from: number, to: number) => {
    for (let d = from; d < to; d += 120) if (rng.chance(0.6)) mom.hear('seojun', d);
  };

  // 고3 겨울: 입시 결과 (세계의 진실)
  const RESULT = 1080;
  world.setFact('seojun', 'university', '한울대', RESULT);
  world.setFact('me', 'university', '늘봄대', RESULT);
  world.setFact('hajun', 'university', '재수', RESULT);
  world.setFact('jiho', 'university', '청림대', RESULT);
  mom.learn('me', 'university', '늘봄대', 'saw', RESULT);
  for (const f of ['seojun', 'hajun', 'jiho']) boy.learn(f, 'university', world.fact(f, 'university')!.value, 'told', RESULT);
  seojunMom.learn('seojun', 'university', '한울대', 'saw', RESULT);

  console.log('  [고3 2월] 입시 결과 — 서준 한울대(최상위), 지호 청림대(상위), 민준 늘봄대(하위), 하준 재수');
  console.log('  [며칠 뒤] 아파트 단지에서 서준이 엄마가 자랑함 → 엄마는 "소문"으로 앎');
  tell(seojunMom, mom, 'seojun', 'university', RESULT + 5, true);

  console.log('\n  ◆ 저녁 식탁 (결과 발표 열흘 뒤)');
  let r = converse({ world, day: RESULT + 10, rng, speakerId: 'mom', speaker: mom, style: m.style, listenerId: 'me', listener: boy });
  show(r.lines);
  console.log(`    (민준 스트레스 ${r.listenerStress >= 0 ? '+' : ''}${r.listenerStress})`);

  console.log('\n  ◆ 일주일 뒤 저녁 (방금 들은 걸 엄마가 기억함)');
  r = converse({ world, day: RESULT + 17, rng, speakerId: 'mom', speaker: mom, style: m.style, listenerId: 'me', listener: boy });
  show(r.lines);

  chatter(RESULT + 20, RESULT + 370);
  // 1년 뒤: 하준은 군대
  world.setFact('hajun', 'military', '육군', RESULT + 330);
  boy.learn('hajun', 'military', '육군', 'told', RESULT + 335);
  console.log('\n  ◆ 1년 뒤 (하준 입대 — 작년에 이름을 다시 들어서 이제 이름으로 부름)');
  r = converse({ world, day: RESULT + 380, rng, speakerId: 'mom', speaker: mom, style: m.style, listenerId: 'me', listener: boy });
  show(r.lines);

  chatter(RESULT + 390, RESULT + 2190);
  // 6년 뒤: 서준 취업
  world.setFact('seojun', 'job', '청림그룹', RESULT + 2150);
  boy.learn('seojun', 'job', '청림그룹', 'told', RESULT + 2160);
  console.log('\n  ◆ 6년 뒤 (서준 대기업 입사 — 민준이 가끔 서준 얘기를 해서 엄마도 계속 기억함)');
  r = converse({ world, day: RESULT + 2200, rng, speakerId: 'mom', speaker: mom, style: m.style, listenerId: 'me', listener: boy });
  show(r.lines);
}
