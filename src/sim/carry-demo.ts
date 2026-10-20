/**
 * 몸에 지닌 것들로 보내는 하루들. 아이템 창은 없다 — 손에 든 게 보이고, 손이 묶이면 못 한다.
 * 실행: npm run sim:carry
 */
import { CarryState, describeCarry, shareUmbrella } from '../engine/carry';
import { Random } from '../engine/core/Random';
import type { Weather } from '../engine/env';

const rng = new Random(3);
const day = (sky: Weather['sky'], high: number): Weather => ({ date: { year: 2026, month: 7, day: 3 }, season: 'summer', sky, low: high - 7, high, dust: 'good', notes: [], outdoor: 0.3, outfit: 1 });
const say = (s: string) => console.log(`  ${s}`);
const tryDo = (c: CarryState, verb: string, label: string) => {
  const r = c.can(verb);
  say(r.ok ? `✔ ${label}` : `✘ ${label} — ${r.why}`);
};
const scene = (t: string) => console.log(`\n━━ ${t} ━━`);

scene('1. 평범한 등굣길');
const me = new CarryState('me', 2);
for (const i of ['backpack', 'phone', 'wallet', 'keys', 'textbooks', 'report']) me.take(i);
say(describeCarry(me));
tryDo(me, 'usePhone', '걸으면서 폰 보기');
say(me.pullOutPhone().ok ? '폰을 꺼내 들었다.' : '');
tryDo(me, 'usePhone', '걸으면서 폰 보기');
tryDo(me, 'rideKickboard', '공유 킥보드 타기');

scene('2. 장마철 하굣길, 우산 없이 나왔다');
const rain = day('monsoon', 27);
say(`밖은 장맛비. 우산은 아침에 두고 나왔다. ${describeCarry(me)}`);
tryDo(me, 'pay', '편의점에서 비닐우산 사기 (6,000원)');
say('…돈이 아까워서 그냥 뛰기로 했다. 폰은 손에 든 채로.');
for (const l of me.outside(25, rain, rng)) say(`☔ ${l.text}`);
say(`몸 젖음 ${(me.bodyWet * 100).toFixed(0)}% · ${describeCarry(me)}`);

scene('3. 우산 + 떡볶이 포장, 그런데 엄마한테 전화가 온다');
const b = new CarryState('b', 2);
for (const i of ['phone', 'wallet', 'cheapUmbrella', 'tteokbokki']) b.take(i);
b.openUmbrella();
say(describeCarry(b));
const p = b.pullOutPhone();
say(p.ok ? '전화를 받았다.' : `📵 ${p.why} (부재중 전화 1)`);
tryDo(b, 'rideBike', '따릉이 타기');

scene('4. 택배 상자를 들고 집 앞');
const c = new CarryState('c', 2);
for (const i of ['phone', 'keys']) c.take(i);
const box = c.take('parcel');
say(box.ok ? '택배 상자를 두 손으로 들었다. (6kg)' : '');
tryDo(c, 'enterHome', '현관문 열기');
say(`걸음 속도 ${(c.walkSpeed() * 100).toFixed(0)}% · ${describeCarry(c)}`);
const r2 = c.take('coffee');
say(r2.ok ? '' : `커피는 못 든다 — ${r2.why}`);

scene('5. 지갑을 두고 나왔다');
const d = new CarryState('d', 2);
d.take('phone');
tryDo(d, 'pay', '편의점 계산');
tryDo(d, 'buyCigarettesOrAlcohol', '(성인이라면) 맥주 사기');

scene('6. 소나기, 우산은 하나');
const mine = new CarryState('me', 2);
for (const i of ['phone', 'foldingUmbrella']) mine.take(i);
mine.openUmbrella();
const crush = new CarryState('crush', 2);
crush.take('phone');
for (const [cl, who] of [[10, '같은 반 별로 안 친한 애'], [45, '친구'], [75, '절친']] as const) {
  const s = shareUmbrella(mine, crush, cl);
  say(`${who}: ${s.text} (친밀도 +${s.closenessGain})`);
}
for (const l of mine.outside(15, day('shower', 26), rng, true)) say(l.text);
say(`같이 써도 몸 젖음 ${(mine.bodyWet * 100).toFixed(0)}%`);

scene('7. 비가 그친 뒤 카페를 나설 때');
let lost = 0;
for (let i = 0; i < 100; i++) {
  const x = new CarryState('x', 2);
  x.take('umbrella');
  lost += x.leaveCheck(day('cloudy', 24), 0.3, rng).length;
}
say(`덜렁대는 애(성실 0.3)는 비 그친 날 우산을 ${lost}% 확률로 두고 나온다.`);

scene('8. 기타를 메고 다니는 애');
const g = new CarryState('g', 2);
for (const i of ['guitar', 'phone']) g.take(i);
say(`${describeCarry(g)} → 보는 사람 인상: "${g.impressions().join(', ')}"`);

scene('9. 늦가을, 비 맞고 한 시간');
const cold = new CarryState('cold', 2);
cold.take('phone');
cold.outside(60, { ...day('rain', 9), season: 'autumn' }, rng);
let n = 0;
for (let i = 0; i < 1000; i++) if (cold.catchesCold(new Random(i), 5)) n++;
say(`한기 ${(cold.chill * 100).toFixed(0)}% → 그날 밤 감기 걸릴 확률 ${(n / 10).toFixed(0)}%`);
