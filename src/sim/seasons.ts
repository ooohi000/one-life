/**
 * 사계절 1년 + 한 동네의 10년.
 * 실행: npm run sim:seasons
 */
import { Random } from '../engine/core/Random';
import { City, DUST_KO, OUTFIT_KO, SKY_KO, type Weather, WeatherSystem } from '../engine/env';
import { addDays, toDayNumber } from '../engine/time/calendar';

const START = { year: 2026, month: 3, day: 2 };
const ws = new WeatherSystem(7);
console.log('\n━━ 1년의 날씨 (2026.3 ~ 2027.2) ━━');
console.log('  월   평균 최저/최고   비·눈 온 날   미세먼지 나쁨↑   대표 옷차림');
const notes: string[] = [];
for (let mo = 0; mo < 12; mo++) {
  const days: Weather[] = [];
  for (let d = 0; d < 366; d++) {
    const dt = addDays(START, d);
    if (dt.month === ((START.month - 1 + mo) % 12) + 1 && dt.year === START.year + (START.month + mo > 12 ? 1 : 0)) days.push(ws.today(dt));
  }
  const avg = (f: (x: (typeof days)[number]) => number) => days.reduce((s, x) => s + f(x), 0) / days.length;
  const wet = days.filter((x) => ['rain', 'shower', 'monsoon', 'snow', 'typhoon'].includes(x.sky)).length;
  const dusty = days.filter((x) => x.dust === 'bad' || x.dust === 'veryBad').length;
  const outfits = days.map((x) => x.outfit).sort((a, b) => a - b);
  console.log(`  ${String(days[0]!.date.month).padStart(2)}월   ${avg((x) => x.low).toFixed(1).padStart(5)}° / ${avg((x) => x.high).toFixed(1).padStart(4)}°     ${String(wet).padStart(2)}일          ${String(dusty).padStart(2)}일          ${OUTFIT_KO[outfits[Math.floor(outfits.length / 2)]!]}`);
  for (const x of days) for (const n of x.notes) if (!n.startsWith('폭염')) notes.push(`  ${x.date.month}/${x.date.day}  ${n} (${SKY_KO[x.sky]} ${x.low.toFixed(0)}°/${x.high.toFixed(0)}°, 미세먼지 ${DUST_KO[x.dust]})`);
}
const heat = [...Array(366).keys()].map((d) => ws.today(addDays(START, d))).filter((x) => x.high >= 33).length;
console.log(`\n  폭염(33° 이상) ${heat}일`);
console.log('\n  그해의 날들:');
for (const n of notes.slice(0, 18)) console.log(n);

console.log('\n━━ 우리 동네 10년 (고1 → 스물여섯) ━━');
const city = new City(new Random(42), 3);
console.log('  처음 모습:');
for (const l of city.describe(0)) console.log(`   · ${l}`);
const base = toDayNumber(START);
for (let d = 0; d < 3650; d++) city.step(d);
const ev = city.log.filter((e) => e.area === 0);
for (const e of ev.slice(0, 40)) {
  const dt = addDays(START, e.day);
  console.log(`  ${dt.year}.${String(dt.month).padStart(2, '0')}  ${e.text}`);
}
console.log('  10년 뒤 모습:');
for (const l of city.describe(0)) console.log(`   · ${l}`);
console.log(`  지금 문 연 가게: ${city.openShops(0).map((s) => s.name).join(', ')}`);
void base;
