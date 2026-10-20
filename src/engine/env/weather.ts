import { Random } from '../core/Random';
import { type GameDate, toDayNumber } from '../time/calendar';

/**
 * 사계절과 날씨. 서울 기후(평년값 근사)를 바탕으로 날마다 뽑는다. 같은 시드면 같은 날씨.
 * - 월평균 기온: 1월 -2° … 8월 26°
 * - 봄: 벚꽃(4월 초), 황사·미세먼지 / 여름: 장마(6월 말~7월 말), 폭염, 태풍(8~9월)
 * - 가을: 단풍(10월 말), 맑은 날 / 겨울: 한파, 첫눈(11월 말~12월), 미세먼지
 * 날씨는 몸(추위·더위·감기), NPC의 하루(비 오면 운동장 대신 PC방), 장사(우산·아이스크림)에 스민다.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_KO: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

export type Sky = 'clear' | 'cloudy' | 'rain' | 'shower' | 'monsoon' | 'snow' | 'typhoon';
export const SKY_KO: Record<Sky, string> = { clear: '맑음', cloudy: '흐림', rain: '비', shower: '소나기', monsoon: '장맛비', snow: '눈', typhoon: '태풍' };

export type Dust = 'good' | 'normal' | 'bad' | 'veryBad';
export const DUST_KO: Record<Dust, string> = { good: '좋음', normal: '보통', bad: '나쁨', veryBad: '매우 나쁨' };

export interface Weather {
  date: GameDate;
  season: Season;
  sky: Sky;
  /** 최저·최고 기온 (°C) */
  low: number;
  high: number;
  dust: Dust;
  /** 그날의 특별한 것 (벚꽃 만개, 첫눈, 장마 시작, 폭염특보…) */
  notes: string[];
  /** 밖에서 놀기 좋은 정도 0~1 */
  outdoor: number;
  /** 옷차림 단계: 0 반팔 ~ 4 롱패딩 (도트 옷 스프라이트 번호) */
  outfit: 0 | 1 | 2 | 3 | 4;
}

/** 월별 평균 최고·최저 기온과 비 오는 날 비율 (서울 평년 근사) */
const HIGH = [1.6, 4.6, 10.7, 17.7, 23.0, 27.1, 28.6, 29.6, 25.9, 20.0, 11.7, 3.6];
const LOW = [-5.8, -3.4, 1.7, 7.6, 13.2, 18.2, 22.1, 22.7, 17.6, 10.6, 3.5, -3.4];
const WET = [0.22, 0.2, 0.22, 0.25, 0.27, 0.33, 0.5, 0.45, 0.3, 0.2, 0.27, 0.25];
/** 미세먼지 나쁨 이상 확률 */
const DUSTY = [0.3, 0.32, 0.38, 0.3, 0.18, 0.1, 0.04, 0.04, 0.06, 0.12, 0.22, 0.3];

export function seasonOf(d: GameDate): Season {
  if (d.month >= 3 && d.month <= 5) return 'spring';
  if (d.month >= 6 && d.month <= 8) return 'summer';
  if (d.month >= 9 && d.month <= 11) return 'autumn';
  return 'winter';
}

/**
 * 해마다 조금씩 다른 날씨. 기온은 며칠씩 이어지는 흐름(따뜻한 주, 추운 주)이 있다.
 */
export class WeatherSystem {
  private readonly cache = new Map<number, Weather>();
  /** 그해 장마 시작·끝, 벚꽃·단풍 날 (해마다 며칠씩 다르다) */
  private readonly yearly = new Map<number, { monsoon: [number, number]; blossom: number; foliage: number }>();

  constructor(private readonly seed: number) {}

  private yearInfo(year: number) {
    let y = this.yearly.get(year);
    if (!y) {
      const r = new Random(this.seed * 977 + year);
      const jan1 = toDayNumber({ year, month: 1, day: 1 });
      const at = (m: number, d: number) => toDayNumber({ year, month: m, day: d }) - jan1;
      const ms = at(6, 19) + Math.floor(r.next() * 10);
      y = { monsoon: [ms, ms + 28 + Math.floor(r.next() * 10)], blossom: at(3, 31) + Math.floor(r.next() * 10), foliage: at(10, 20) + Math.floor(r.next() * 10) };
      this.yearly.set(year, y);
    }
    return y;
  }

  /** 이번 겨울(11월~)에 이미 눈이 왔나 */
  private snowedBefore(date: GameDate): boolean {
    const dn = toDayNumber(date);
    const start = toDayNumber({ year: date.month <= 2 ? date.year - 1 : date.year, month: 11, day: 1 });
    for (let d = start; d < dn; d++) {
      // 세계는 날짜 순서대로 날씨를 부르므로, 지나간 날은 캐시에 있다
      if (this.cache.get(d)?.sky === 'snow') return true;
    }
    return false;
  }

  /** 그날의 날씨 (아무 날이나 불러도 같은 값) */
  today(date: GameDate): Weather {
    const dn = toDayNumber(date);
    const hit = this.cache.get(dn);
    if (hit) return hit;
    const r = new Random(this.seed * 7907 + dn);
    // 기온 흐름: 지난 며칠의 흔들림이 이어진다 (따뜻한 주, 추운 주). 어느 날을 먼저 불러도 같은 값
    let anomaly = 0;
    for (let k = 0; k < 8; k++) anomaly += 0.8 ** k * (new Random(this.seed * 104729 + dn - k).next() - 0.5) * 3;
    // 한여름 폭염, 한겨울 한파는 흔들림이 더 크다
    if (date.month === 7 || date.month === 8 || date.month === 1 || date.month === 12) anomaly *= 1.7;
    const m = date.month - 1;
    const doy = dn - toDayNumber({ year: date.year, month: 1, day: 1 });
    const yi = this.yearInfo(date.year);
    // 월 사이를 부드럽게 (15일 기준 보간)
    const t = (date.day - 15) / 30;
    const next = t >= 0 ? (m + 1) % 12 : (m + 11) % 12;
    const lerp = (a: number[]) => a[m]! + (a[next]! - a[m]!) * Math.abs(t);
    // 장마 끝나고 한 달은 무더위 절정, 장마 중엔 덜 덥다
    const yiHot = doy > this.yearInfo(date.year).monsoon[1] && doy <= this.yearInfo(date.year).monsoon[1] + 30 ? 2.5 : 0;
    const yiWet = doy >= this.yearInfo(date.year).monsoon[0] && doy <= this.yearInfo(date.year).monsoon[1] ? -1 : 0;
    const high = Math.round((lerp(HIGH) + anomaly + yiHot + yiWet + (r.next() - 0.5) * 2) * 10) / 10;
    const low = Math.round((lerp(LOW) + anomaly * 0.8 + yiHot * 0.6 + (r.next() - 0.5) * 2) * 10) / 10;
    const notes: string[] = [];

    const inMonsoon = doy >= yi.monsoon[0] && doy <= yi.monsoon[1];
    let sky: Sky = 'clear';
    const wet = inMonsoon ? 0.65 : WET[m]!;
    if (r.chance(wet)) {
      if (inMonsoon) sky = 'monsoon';
      else if (high <= 3) sky = 'snow';
      else if (m >= 5 && m <= 8 && r.chance(0.4)) sky = 'shower';
      else sky = 'rain';
    } else if (r.chance(0.35)) sky = 'cloudy';
    if ((m === 7 || m === 8) && r.chance(0.012)) {
      sky = 'typhoon';
      notes.push('태풍이 북상 중이다. 바람이 거세다.');
    }
    if (doy === yi.monsoon[0]) notes.push('장마가 시작됐다.');
    if (doy === yi.monsoon[1]) notes.push('장마가 끝났다. 이제 진짜 여름이다.');
    if (doy === yi.blossom) notes.push('벚꽃이 피기 시작했다.');
    if (doy === yi.blossom + 4) notes.push('벚꽃이 만개했다. 바람이 불면 꽃잎이 날린다.');
    if (doy === yi.foliage) notes.push('단풍이 절정이다.');
    if (sky === 'snow' && (m >= 10 || m <= 1) && !this.snowedBefore(date)) notes.push('첫눈이 온다.');
    if (high >= 33) notes.push('폭염특보. 밖에 오래 있으면 위험하다.');
    if (low <= -12) notes.push('한파특보. 수도관이 얼었다는 뉴스가 나온다.');

    let dust: Dust = 'good';
    const dr = r.next();
    if (sky === 'rain' || sky === 'monsoon' || sky === 'snow') dust = 'good';
    else if (dr < DUSTY[m]! * 0.3) dust = 'veryBad';
    else if (dr < DUSTY[m]!) dust = 'bad';
    else if (dr < DUSTY[m]! + 0.4) dust = 'normal';
    if ((m === 2 || m === 3) && dust === 'veryBad' && r.chance(0.5)) notes.push('황사. 하늘이 누렇다.');

    const outdoor = Math.max(0, Math.min(1,
      1 - (sky === 'clear' ? 0 : sky === 'cloudy' ? 0.1 : sky === 'shower' ? 0.5 : sky === 'snow' ? 0.4 : 0.8)
        - Math.max(0, high - 30) * 0.08 - Math.max(0, 3 - high) * 0.04 - (dust === 'veryBad' ? 0.4 : dust === 'bad' ? 0.2 : 0)));
    const outfit = (high >= 25 ? 0 : high >= 17 ? 1 : high >= 9 ? 2 : high >= 2 ? 3 : 4) as Weather['outfit'];
    const w: Weather = { date, season: seasonOf(date), sky, low, high, dust, notes, outdoor, outfit };
    this.cache.set(dn, w);
    return w;
  }
}

export function describeWeather(w: Weather): string {
  return `${SKY_KO[w.sky]} ${w.low.toFixed(0)}°/${w.high.toFixed(0)}° · 미세먼지 ${DUST_KO[w.dust]}`;
}

/** 옷차림 이름 */
export const OUTFIT_KO = ['반팔', '긴팔·셔츠', '맨투맨·후드', '코트·야상', '롱패딩'] as const;
