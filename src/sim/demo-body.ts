/**
 * 같은 몸, 다른 생활 6개월 (고1 3월 ~ 8월). 얼마나 세게 했느냐에 따라 변화 속도가 다르다.
 *  - 폭식가: 세 끼 + 간식 두 번 + 매일 야식 + 주말 패스트푸드
 *  - 대식가: 세 끼 + 간식 두 번 + 주말 패스트푸드
 *  - 유지:   세 끼 꼬박
 *  - 소식가: 아침 거름, 점심 편의점, 저녁만 집밥
 *  - 운동만: 세 끼 그대로 + 주 5회 근력 운동 (식욕이 알아서 늘어남)
 *  - 벌크업: 주 5회 근력 운동 + 간식·편의점·프로틴으로 일부러 더 먹기
 * 실행: npm run sim:body
 */
import { BODY_SHAPE_KO, BodySystem, bodyShapeOf, fatPercent, muscularity, powerOf } from '../engine/body';
import { type Character, createCharacter, type CreationInput } from '../engine/character';
import { Random } from '../engine/core/Random';
import { GameClock, hm, isSchoolDay, weekdayOf } from '../engine/time';

type Style = 'binge' | 'bigEater' | 'maintain' | 'smallEater' | 'trainOnly' | 'bulk';
const NAMES: Record<Style, string> = {
  binge: '폭식가',
  bigEater: '대식가',
  maintain: '유지',
  smallEater: '소식가',
  trainOnly: '운동만',
  bulk: '벌크업',
};

const input: CreationInput = {
  id: 'x',
  name: 'x',
  origin: 'normal',
  appearance: { eyes: 0, nose: 0, mouth: 0, faceShape: 0, hairStyle: 0, hairColor: 0 },
  allocation: { intelligence: 4, constitution: 4, skin: 4, hairResistance: 4, heightPotential: 4, bodyFrame: 4 },
  dice: false,
};

const row = (label: string, ch: Character) =>
  `  ${label.padEnd(4)} 몸무게 ${ch.body.weightKg.toFixed(1).padStart(5)}kg  근육 ${ch.body.muscleKg.toFixed(1)}kg  ` +
  `체지방 ${fatPercent(ch).toFixed(1).padStart(4)}%  근육 발달 ${(muscularity(ch) * 100).toFixed(0)}%  ` +
  `힘 ${powerOf(ch).toFixed(0).padStart(2)}  → ${BODY_SHAPE_KO[bodyShapeOf(ch)]}`;

function live(style: Style) {
  const ch = createCharacter(input, new Random(11));
  const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
  const body = new BodySystem(ch).attach(clock);
  const said: string[] = [];
  body.events.on('body:symptomAppeared', (e) => e.announce && said.push(`${clock.date.month}/${clock.date.day} "${e.symptom.monologue}"`));

  const out = [row('시작', ch)];
  let lastMonth = clock.date.month;
  const training = style === 'trainOnly' || style === 'bulk';

  while (clock.date.month < 9) {
    const school = isSchoolDay(clock.date);
    const wd = weekdayOf(clock.date);

    if (style !== 'smallEater') body.eat('집밥');
    body.eat(style === 'smallEater' ? '편의점' : school ? '급식' : '집밥');
    body.eat('집밥');
    body.exercise('walk', 30);

    if (style === 'binge' || style === 'bigEater') {
      body.eat('간식');
      body.eat('간식');
      if (wd === 6 || wd === 0) body.eat('패스트푸드');
    }
    if (style === 'binge') body.eat('야식');
    if (training && wd >= 1 && wd <= 5) body.exercise('weights', 70);
    if (style === 'bulk') {
      body.eat('간식');
      body.eat('편의점');
      body.eat('프로틴');
      body.eat('프로틴');
    }

    clock.advanceTo(hm(23), 'action');
    clock.sleepUntil(hm(7));

    if (clock.date.month !== lastMonth) {
      out.push(row(`${lastMonth}월말`, ch));
      lastMonth = clock.date.month;
    }
  }
  return { out, said };
}

for (const s of Object.keys(NAMES) as Style[]) {
  const { out, said } = live(s);
  console.log(`\n■ ${NAMES[s]}`);
  out.forEach((l) => console.log(l));
  if (said.length) console.log('  독백: ' + said.join(' / '));
}
