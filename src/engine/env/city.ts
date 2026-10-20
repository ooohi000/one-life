import type { Random } from '../core/Random';
import { josa } from '../memory/MemoryBank';

/**
 * 도시는 시간을 따라 변한다. 우리는 개인이라 직접 짓지 못하고, 세상이 짓는 걸 본다.
 * - 빈 부지에 펜스가 쳐지고 → 터파기 → 골조 → 완공. 아파트는 2~3년, 상가는 1년, 가게 인테리어는 몇 주
 * - 작은 가게는 생기고 사라진다 (자영업은 몇 년 안에 절반 가까이 문을 닫는다)
 * - 재개발: 구역 지정 → 이주(오래 살던 집들이 떠난다) → 철거 → 공사 → 입주. 10년이 걸리기도 한다
 * 고1 때 공사 펜스였던 곳에, 서른의 내가 청약으로 들어가 살 수도 있다.
 */
export type LotUse =
  | 'empty' // 빈터·공터
  | 'parking' // 주차장
  | 'oldHouses' // 낡은 주택가
  | 'villa' // 빌라
  | 'apartment' // 아파트 단지
  | 'officetel' // 오피스텔
  | 'shops' // 상가
  | 'park'; // 공원

export const USE_KO: Record<LotUse, string> = {
  empty: '공터', parking: '주차장', oldHouses: '낡은 주택가', villa: '빌라촌', apartment: '아파트 단지', officetel: '오피스텔', shops: '상가 건물', park: '공원',
};

export type Stage = 'standing' | 'designated' | 'relocating' | 'demolition' | 'fenced' | 'excavation' | 'frame' | 'finishing';
export const STAGE_KO: Record<Stage, string> = {
  standing: '', designated: '재개발 구역 지정', relocating: '이주 중', demolition: '철거 중', fenced: '공사 펜스', excavation: '터파기', frame: '골조 공사', finishing: '마감 공사',
};

export interface Lot {
  id: string;
  area: number;
  use: LotUse;
  /** 지금 무슨 일이 진행 중인가 */
  stage: Stage;
  /** 공사가 끝나면 무엇이 되나 */
  becomes?: LotUse;
  /** 다음 단계로 넘어가는 날 */
  nextDay: number;
  /** 이름 (○○ 래미안 같은 건 가상 이름) */
  name: string;
}

export type ShopKind = '분식집' | '치킨집' | '카페' | '편의점' | 'PC방' | '노래방' | '미용실' | '세탁소' | '마라탕집' | '탕후루 가게' | '무인 아이스크림' | '코인노래방' | '네일숍' | '인형뽑기방' | '부동산' | '약국' | '빵집' | '헬스장';

export interface Shop {
  id: string;
  area: number;
  kind: ShopKind;
  name: string;
  opened: number;
  closed?: number;
}

export interface CityEvent {
  day: number;
  area: number;
  text: string;
}

/** 유행 타는 가게는 빨리 생기고 빨리 사라진다 */
const SHOP_LIFE: Record<ShopKind, { years: number; trend?: boolean }> = {
  분식집: { years: 6 }, 치킨집: { years: 3 }, 카페: { years: 3 }, 편의점: { years: 7 }, PC방: { years: 5 }, 노래방: { years: 6 }, 미용실: { years: 6 },
  세탁소: { years: 12 }, 마라탕집: { years: 2, trend: true }, '탕후루 가게': { years: 1, trend: true }, '무인 아이스크림': { years: 2, trend: true },
  코인노래방: { years: 3, trend: true }, 네일숍: { years: 3 }, 인형뽑기방: { years: 1.5, trend: true }, 부동산: { years: 10 }, 약국: { years: 15 }, 빵집: { years: 4 }, 헬스장: { years: 4 },
};
const BRAND = ['한빛', '새봄', '푸른', '늘해', '다온', '청솔', '하늘채', '숲속', '미래', '정다운'];

export class City {
  readonly lots: Lot[] = [];
  readonly shops: Shop[] = [];
  readonly log: CityEvent[] = [];
  private n = 0;

  constructor(private readonly rng: Random, readonly areas: number, start = 0) {
    for (let a = 0; a < areas; a++) {
      const uses: LotUse[] = ['oldHouses', 'oldHouses', 'villa', 'villa', 'apartment', 'shops', 'parking', 'empty', 'park'];
      for (const use of uses) this.lots.push({ id: `L${this.n++}`, area: a, use, stage: 'standing', nextDay: Infinity, name: this.lotName(use) });
      for (let i = 0; i < 8; i++) this.openShop(a, start - Math.floor(rng.next() * 1500), true);
    }
    // 처음부터 공사 중인 곳 몇 군데
    for (const l of this.lots.filter((x) => x.use === 'empty' || x.use === 'parking')) if (rng.chance(0.5)) this.startBuild(l, start, rng.chance(0.6) ? 'apartment' : rng.chance(0.5) ? 'officetel' : 'shops', true);
  }

  /** 하루 */
  step(day: number): void {
    const rng = this.rng;
    // 공사·재개발 단계 진행
    for (const l of this.lots) {
      if (day < l.nextDay) continue;
      this.advance(l, day);
    }
    // 가게: 문을 닫고, 새로 연다
    for (const s of this.shops) {
      if (s.closed !== undefined) continue;
      const life = SHOP_LIFE[s.kind];
      const age = (day - s.opened) / 365;
      const p = (1 / (life.years * 365)) * (age > life.years ? 2 : 1) * (life.trend ? 1.2 : 1);
      if (rng.chance(p)) {
        s.closed = day;
        this.emit(day, s.area, `${josa(s.name, '이가')} 문을 닫았다. "그동안 감사했습니다" 종이가 붙어 있다.`);
        // 빈 가게엔 얼마 뒤 다른 가게가 들어온다
        if (rng.chance(0.85)) this.later(s.area, day + 20 + Math.floor(rng.next() * 90));
      }
    }
    for (const q of [...this.queued]) {
      if (q.day <= day) {
        this.queued.splice(this.queued.indexOf(q), 1);
        this.openShop(q.area, day);
      }
    }
    // 아주 가끔: 새 개발 계획
    if (rng.chance(1 / 400)) {
      const cand = this.lots.filter((l) => l.stage === 'standing' && (l.use === 'parking' || l.use === 'empty'));
      if (cand.length) this.startBuild(rng.pick(cand), day, rng.pick(['apartment', 'officetel', 'shops', 'park'] as LotUse[]));
    }
    if (rng.chance(1 / 1500)) {
      const old = this.lots.filter((l) => l.stage === 'standing' && (l.use === 'oldHouses' || l.use === 'villa'));
      if (old.length) {
        const l = rng.pick(old);
        l.stage = 'designated';
        l.becomes = 'apartment';
        l.nextDay = day + 365 * (2 + Math.floor(rng.next() * 3));
        this.emit(day, l.area, `${l.name} 일대가 재개발 구역으로 지정됐다. 동네 어른들이 모이면 그 얘기뿐이다.`);
      }
    }
  }

  /** 그 동네 지금 모습 한 줄씩 */
  describe(area: number): string[] {
    return this.lots.filter((l) => l.area === area).map((l) => `${l.name}: ${USE_KO[l.use]}${l.stage !== 'standing' ? ` → ${STAGE_KO[l.stage]}${l.becomes ? ` (${USE_KO[l.becomes]} 예정)` : ''}` : ''}`);
  }

  openShops(area: number): Shop[] {
    return this.shops.filter((s) => s.area === area && s.closed === undefined);
  }

  // ───────── 내부 ─────────
  private queued: Array<{ area: number; day: number }> = [];
  private later(area: number, day: number) {
    this.queued.push({ area, day });
  }

  private openShop(area: number, day: number, silent = false) {
    const rng = this.rng;
    const kinds = Object.keys(SHOP_LIFE) as ShopKind[];
    // 유행 가게는 반만큼 덜 생긴다
    let kind = rng.pick(kinds);
    if (SHOP_LIFE[kind].trend && rng.chance(0.5)) kind = rng.pick(kinds.filter((k) => !SHOP_LIFE[k].trend));
    const s: Shop = { id: `S${this.n++}`, area, kind, name: `${rng.pick(BRAND)} ${kind}`, opened: day };
    this.shops.push(s);
    if (!silent) this.emit(day, area, `새 가게가 생겼다: ${s.name}. ${SHOP_LIFE[kind].trend ? '요즘 유행이라 줄이 길다.' : '개업 떡을 돌렸다.'}`);
  }

  private startBuild(l: Lot, day: number, becomes: LotUse, silent = false) {
    l.becomes = becomes;
    l.stage = 'fenced';
    l.nextDay = day + 30 + Math.floor(this.rng.next() * 60);
    if (!silent) this.emit(day, l.area, `${l.name}에 공사 펜스가 쳐졌다. "${this.lotName(becomes)} 신축 공사" 현수막이 걸렸다.`);
  }

  private advance(l: Lot, day: number) {
    const r = this.rng;
    const dur = (base: number) => day + Math.floor(base * (0.8 + r.next() * 0.5));
    switch (l.stage) {
      case 'designated':
        l.stage = 'relocating';
        l.nextDay = dur(365);
        this.emit(day, l.area, `${l.name} 이주가 시작됐다. 오래 살던 집들에 하나둘 "이주 완료" 빨간 글씨가 칠해진다.`);
        break;
      case 'relocating':
        l.stage = 'demolition';
        l.nextDay = dur(120);
        this.emit(day, l.area, `${l.name} 철거가 시작됐다. 굴삭기 소리가 아침마다 울린다.`);
        break;
      case 'demolition':
        l.use = 'empty';
        l.stage = 'fenced';
        l.nextDay = dur(60);
        break;
      case 'fenced':
        l.stage = 'excavation';
        l.nextDay = dur(l.becomes === 'apartment' ? 200 : 90);
        if (l.becomes === 'apartment') this.emit(day, l.area, `${l.name} 터파기 공사가 한창이다. 덤프트럭이 줄지어 다닌다.`);
        break;
      case 'excavation':
        l.stage = 'frame';
        l.nextDay = dur(l.becomes === 'apartment' ? 450 : l.becomes === 'park' ? 60 : 180);
        if (l.becomes === 'apartment') this.emit(day, l.area, `${l.name} 타워크레인이 섰다. 한 층씩 올라간다.`);
        break;
      case 'frame':
        l.stage = 'finishing';
        l.nextDay = dur(l.becomes === 'apartment' ? 240 : 90);
        break;
      case 'finishing': {
        const was = l.use;
        l.use = l.becomes ?? l.use;
        l.becomes = undefined;
        l.stage = 'standing';
        l.nextDay = Infinity;
        l.name = this.lotName(l.use);
        this.emit(day, l.area, l.use === 'apartment' ? `${l.name} 입주가 시작됐다. 이삿짐 차가 줄을 섰다. (예전엔 ${USE_KO[was]}였다)` : `${josa(l.name, '이가')} 문을 열었다.`);
        if (l.use === 'shops' || l.use === 'apartment') for (let i = 0; i < (l.use === 'shops' ? 4 : 2); i++) this.later(l.area, day + 10 + Math.floor(r.next() * 60));
        break;
      }
    }
  }

  private lotName(use: LotUse): string {
    const b = this.rng.pick(BRAND);
    return use === 'apartment' ? `${b} 아파트` : use === 'officetel' ? `${b} 오피스텔` : use === 'shops' ? `${b} 프라자` : use === 'park' ? `${b} 근린공원` : use === 'villa' ? `${b} 빌라` : use === 'oldHouses' ? `${b}동 골목` : use === 'parking' ? '공영주차장' : '공터';
  }

  private emit(day: number, area: number, text: string) {
    this.log.push({ day, area, text });
  }
}
