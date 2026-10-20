/**
 * 화면 없이 시간 엔진만으로 고등학생의 하루 이틀을 돌려보는 데모.
 * 실행: npm run sim:day
 */
import { formatClock, GameClock, hm, judgeArrival, SLOT_LABEL_KO } from '../engine/time';

const clock = new GameClock({ startDate: { year: 2026, month: 3, day: 2 }, startMinute: hm(7) });
const log = (msg: string) => console.log(`[${clock.label}] ${msg}`);

clock.events.on('time:slotChanged', (e) => log(`── 시간대: ${SLOT_LABEL_KO[e.from]} → ${SLOT_LABEL_KO[e.to]}`));
clock.events.on('time:dayChanged', () => log('══ 날짜가 바뀜'));

function schoolMorning(prepMinutes: number, commuteMinutes: number) {
  log(`일어남. 준비 ${prepMinutes}분`);
  clock.advance(prepMinutes, 'action');
  log(`버스 타고 등교 (${commuteMinutes}분)`);
  clock.advance(commuteMinutes, 'travel');
  const r = judgeArrival(clock.minuteOfDay);
  log(r.status === 'late' ? `지각! ${r.minutesLate}분 늦음` : r.status === 'absent' ? '결석 처리' : '정시 도착');
  clock.advanceTo(hm(16, 30), 'auto'); // 수업은 자동 진행
  log('수업 끝');
}

// 1일차: 성실한 하루
schoolMorning(30, 40);
log('학원 (3시간)');
clock.advance(180, 'action');
log('귀가');
clock.advance(40, 'travel');
log('자유 시간 — 대화 창 열림(시간 멈춤)');
clock.pause('dialog');
clock.tick(60_000); // 1분 동안 대화해도 시간은 그대로
log('대화 끝');
clock.resume('dialog');
for (let i = 0; i < 30 * 42; i++) clock.tick(1000 / 60); // 60fps로 게임 30분(약 21초) 돌아다님
log('게임 시작');
clock.advanceTo(hm(1, 30), 'action');
const slept = clock.sleepUntil(hm(7, 20));
log(`기상 — ${Math.floor(slept / 60)}시간 ${slept % 60}분 잠`);

// 2일차: 늦잠
schoolMorning(30, 40);
console.log(`\n최종 시각: ${clock.label} (${formatClock(clock.minuteOfDay)})`);
