/**
 * 같은 재능·같은 출신의 두 학생이 2주를 다르게 산다.
 * 성실이: 학원 → 공부 1시간 → 23:30 취침
 * 밤샘이: 학원 → 새벽 2시까지 게임
 * 실행: npm run sim:students
 */
import { BodySystem } from '../engine/body';
import { type Character, createCharacter, type CreationInput, trainStat } from '../engine/character';
import { Random } from '../engine/core/Random';
import { addDays, formatClock, formatDate, GameClock, hm, isSchoolDay, judgeArrival } from '../engine/time';

type Style = 'diligent' | 'nightOwl';

interface Report {
  name: string;
  late: number;
  collapses: number;
  lines: string[];
  ch: Character;
  body: BodySystem;
}

function live(style: Style, name: string, days: number): Report {
  const input: CreationInput = {
    id: style,
    name,
    origin: 'normal',
    appearance: { eyes: 1, nose: 1, mouth: 1, faceShape: 1, hairStyle: 1, hairColor: 0 },
    allocation: { intelligence: 5, constitution: 4, skin: 4, hairResistance: 4, heightPotential: 4, bodyFrame: 3 },
    dice: false,
  };
  const rng = new Random(2026);
  const ch = createCharacter(input, rng);
  const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
  const body = new BodySystem(ch).attach(clock);
  const report: Report = { name, late: 0, collapses: 0, lines: [], ch, body };
  const notes: string[] = [];
  body.events.on('body:symptomAppeared', (e) => e.announce && notes.push(`💬 "${e.symptom.monologue}"`));
  body.events.on('body:symptomGone', (e) => notes.push(`(${e.symptom.id} 사라짐)`));
  body.events.on('body:collapsed', () => {
    report.collapses++;
    notes.push('💤 버티다 쓰러짐');
  });

  for (let d = 0; d < days; d++) {
    const date = clock.date;
    const school = isSchoolDay(date);

    body.eat('집밥');
    body.eat(school ? '급식' : '집밥');
    body.eat('집밥');
    body.exercise('walk', 30);
    if (school) {
      // 부채가 크면 알람을 못 듣고 늦잠
      if (ch.body.sleepDebtMin > 240 && rng.chance(0.35)) {
        clock.advance(25, 'sleep');
        notes.push('알람 못 들음');
      }
      clock.advance(30, 'action');
      clock.advance(40, 'travel');
      const arrival = judgeArrival(clock.minuteOfDay);
      if (arrival.status !== 'onTime') {
        report.late++;
        notes.push(`지각(${formatClock(clock.minuteOfDay)})`);
      }
      trainStat(ch, 'study', 0.6, body.condition(), clock.dayIndex); // 수업
      clock.advanceTo(hm(16, 30), 'auto');

      clock.advanceTo(hm(17), 'travel');
      trainStat(ch, 'study', 1.0, body.condition(), clock.dayIndex); // 학원
      body.applyStress(5);
      clock.advance(180, 'action');
      clock.advance(40, 'travel');

      if (style === 'diligent') {
        trainStat(ch, 'study', 0.5, body.condition(), clock.dayIndex);
        body.applyStress(2);
        clock.advance(60, 'action');
        clock.advanceTo(hm(23, 30), 'action');
      } else {
        body.applyStress(-8); // 게임은 스트레스를 푼다
        const until2am = (hm(2) - clock.minuteOfDay + 1440) % 1440;
        clock.advance(Math.min(until2am, body.minutesUntilCollapse()), 'action');
      }
    } else {
      body.applyStress(-10);
      if (style === 'diligent') trainStat(ch, 'study', 0.8, body.condition(), clock.dayIndex);
      const bed = style === 'diligent' ? hm(23) : hm(3);
      const untilBed = (bed - clock.minuteOfDay + 1440) % 1440;
      clock.advance(Math.min(untilBed, body.minutesUntilCollapse()), 'action');
    }
    // 내일이 등교일이면 7시, 쉬는 날이면 10시 기상
    const wakeDate = clock.minuteOfDay < hm(6) ? clock.date : addDays(clock.date, 1); // 새벽 6시 전에 잠들면 같은 날 아침 기상
    clock.sleepUntil(isSchoolDay(wakeDate) ? hm(7) : hm(10));

    report.lines.push(
      `${formatDate(date).padEnd(10)} 컨디션 ${body.condition().toFixed(2)}  공부 ${ch.stats.study.toFixed(1)}  ` +
        `스트레스 ${ch.body.stress.toFixed(0).padStart(3)}  수면부채 ${(ch.body.sleepDebtMin / 60).toFixed(1)}h  ${notes.join(' ')}`,
    );
    notes.length = 0;
  }
  return report;
}

for (const r of [live('diligent', '성실이', 14), live('nightOwl', '밤샘이', 14)]) {
  console.log(`\n■ ${r.name}`);
  r.lines.forEach((l) => console.log('  ' + l));
  console.log(
    `  → 2주 결과: 공부 ${r.ch.stats.study.toFixed(1)}, 지각 ${r.late}회, 쓰러짐 ${r.collapses}회, ` +
      `증상 [${r.body.activeSymptoms().map((s) => s.id).join(', ') || '없음'}]`,
  );
}
