/**
 * 같은 몸으로 태어난 세 학생의 고1 첫 학기 + 여름방학 (3월~8월).
 *  - 헬스맨: 주 4회 근력 운동 60분, 프로틴, 23시 취침
 *  - 야식왕: 매일 야식, 운동 안 함, 1시 취침
 *  - 축구부: 방과 후 축구 90분, 23시 취침
 * 모두 학기 중엔 공부하다가 여름방학엔 공부를 놓는다 → 녹슬기 확인
 * 실행: npm run sim:half-year
 */
import { BodySystem, bodyShapeOf, fatPercent, powerOf } from '../engine/body';
import { type Character, CharacterSystem, createCharacter, type CreationInput, trainStat } from '../engine/character';
import { Random } from '../engine/core/Random';
import { addDays, GameClock, hm, isSchoolDay, vacationOn, weekdayOf } from '../engine/time';

type Style = 'gym' | 'lateSnack' | 'soccer';
const NAMES: Record<Style, string> = { gym: '헬스맨', lateSnack: '야식왕', soccer: '축구부' };

const input: CreationInput = {
  id: 'x',
  name: 'x',
  origin: 'normal',
  appearance: { eyes: 0, nose: 0, mouth: 0, faceShape: 0, hairStyle: 0, hairColor: 0 },
  allocation: { intelligence: 4, constitution: 4, skin: 4, hairResistance: 4, heightPotential: 4, bodyFrame: 4 },
  dice: false,
};

const row = (label: string, ch: Character, body: BodySystem) =>
  `  ${label.padEnd(6)} 키 ${ch.heightCm.toFixed(1)}  몸무게 ${ch.body.weightKg.toFixed(1)}  근육 ${ch.body.muscleKg.toFixed(1)}  ` +
  `체지방 ${fatPercent(ch).toFixed(1)}%  체형 ${bodyShapeOf(ch).padEnd(8)} 힘 ${powerOf(ch).toFixed(0).padStart(2)}  ` +
  `지구력 ${ch.stats.endurance.toFixed(0).padStart(2)}  공부 ${ch.stats.study.toFixed(1)}  ` +
  `증상 [${body.activeSymptoms().map((s) => s.id).join(', ')}]`;

function live(style: Style) {
  const ch = createCharacter(input, new Random(11));
  const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
  const body = new BodySystem(ch).attach(clock);
  new CharacterSystem(ch).attach(clock);
  const said: string[] = [];
  body.events.on('body:symptomAppeared', (e) => e.announce && said.push(`${clock.date.month}/${clock.date.day} "${e.symptom.monologue}"`));

  const out: string[] = [row('시작', ch, body)];
  let month = clock.date.month;

  while (clock.date.month < 9) {
    const date = clock.date;
    const school = isSchoolDay(date);
    const vacation = vacationOn(date) !== null;
    const weekday = weekdayOf(date);

    body.eat('집밥'); // 아침
    if (school) {
      clock.advanceTo(hm(8, 10), 'travel');
      trainStat(ch, 'study', 0.6, body.condition(), clock.dayIndex);
      clock.advanceTo(hm(12), 'auto');
      body.eat('급식');
      clock.advanceTo(hm(16, 30), 'auto');
    } else {
      clock.advanceTo(hm(12), 'action');
      body.eat('집밥');
    }

    // 방과 후 / 낮
    if (style === 'gym' && [1, 2, 4, 5].includes(weekday)) { // 월화목금
      body.exercise('weights', 60);
      body.eat('프로틴');
      clock.advance(60, 'action');
    }
    if (style === 'soccer' && !vacation) {
      body.exercise('sports', 90);
      trainStat(ch, 'endurance', 1.2, body.condition(), clock.dayIndex);
      trainStat(ch, 'fighting', 0.1, body.condition(), clock.dayIndex);
      clock.advance(90, 'action');
    }
    if (!vacation) trainStat(ch, 'study', 1.0, body.condition(), clock.dayIndex); // 학원
    body.exercise('walk', 30); // 통학·이동

    clock.advanceTo(hm(19), 'action');
    body.eat('집밥');
    if (style === 'lateSnack') {
      body.eat('간식');
      clock.advanceTo(hm(23), 'action');
      body.eat('야식');
      clock.advanceTo(hm(1), 'action');
    } else {
      clock.advanceTo(hm(23), 'action');
    }

    const wakeDate = clock.minuteOfDay < hm(6) ? clock.date : addDays(clock.date, 1);
    clock.sleepUntil(isSchoolDay(wakeDate) ? hm(7) : hm(9));

    if (clock.date.month !== month) {
      out.push(row(`${month}월말`, ch, body));
      month = clock.date.month;
    }
  }
  return { out, said };
}

for (const s of ['gym', 'lateSnack', 'soccer'] as Style[]) {
  const { out, said } = live(s);
  console.log(`\n■ ${NAMES[s]}`);
  out.forEach((l) => console.log(l));
  if (said.length) console.log('  독백: ' + said.join(' / '));
}
