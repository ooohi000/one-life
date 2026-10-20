import type { Random } from '../core/Random';

/**
 * 가출. NPC도 하고, 주인공도 할 수 있다.
 *
 * 조사 근거 (게임 수치의 기준):
 * - 일반 청소년 지난 1년 가출 2.5% (2020 청소년 매체이용 및 유해환경 실태조사)
 * - 위기청소년은 지난 1년 22.6% — 일반의 약 9배. 이유: 가족 갈등 69.5%, 자유롭고 싶어서 44.3%, 가정폭력 28%
 *   (2021 여성가족부 위기청소년 실태조사, 4,399명)
 * - 가출팸: SNS로 모인다. 경찰 해체 2020년 125건(674명) → 2022년 52건(274명).
 *   숙식을 미끼로 접근하는 어른이 위험의 핵심. 1388(24시간)·청소년쉼터(전국 138곳)가 출구.
 *
 * 표현 원칙: 범죄·위험은 결과로 보여 준다. 미성년자가 얽힌 성적 내용은 어떤 형태로도 넣지 않는다.
 * 위험한 어른의 접근은 "숙식 준다는 낯선 어른"까지만 — 거절·신고·구조로 이어진다.
 */

export type RunawayPlace =
  | 'friend' // 친구 집 (하루 이틀)
  | 'pcbang' // PC방 (밤새기)
  | 'jjimjil' // 찜질방
  | 'street' // 놀이터·계단·24시 패스트푸드
  | 'gachulfam' // 가출팸 (원룸·모텔에 여럿이)
  | 'shelter'; // 청소년쉼터

export const PLACE_KO: Record<RunawayPlace, string> = {
  friend: '친구 집',
  pcbang: 'PC방',
  jjimjil: '찜질방',
  street: '거리',
  gachulfam: '가출팸',
  shelter: '청소년쉼터',
};

/** 하룻밤 비용(원)과 잠의 질(0~1, 몸 시스템에 쓴다) */
export const PLACE_COST: Record<RunawayPlace, { cost: number; sleep: number }> = {
  friend: { cost: 0, sleep: 0.7 },
  pcbang: { cost: 12000, sleep: 0.2 },
  jjimjil: { cost: 13000, sleep: 0.5 },
  street: { cost: 0, sleep: 0.1 },
  gachulfam: { cost: 5000, sleep: 0.4 },
  shelter: { cost: 0, sleep: 0.8 },
};

export type RunawayEnd = 'cameHome' | 'foundByPolice' | 'shelterToHome' | 'shelterLongTerm' | 'parentsBrought';

export interface RunawayInput {
  /** 부모가 무서운 정도 0~100 */
  fear: number;
  /** 가장 의지하는 부모와의 애착 0~100 */
  attachment: number;
  /** 집이 싫은 정도 0~1 */
  aversion: number;
  /** 오늘 집에서 폭언·폭력이 있었나 */
  incidentToday: 'yelled' | 'hit' | null;
  /** 오늘 부모와 크게 부딪혔나 (말대꾸 뒤 혼남 등) */
  clashToday: boolean;
  stress: number;
  rebellion: number;
  impulsivity: number;
  /** 재워 줄 친구가 있나 0~1 */
  belonging: number;
  /** 가출해 본 친구가 있나 (또래 영향) */
  peerRanAway: boolean;
  /** 부모가 찾나 (사랑이 있으면 실종 신고를 한다) */
  parentsSearch: boolean;
  /** 1388·쉼터를 아나 (학교 교육·상담으로 알게 된다) */
  knowsHelp: boolean;
}

export interface RunawayEvent {
  day: number;
  text: string;
}

/** 한 아이의 가출 이력과 지금 상태 */
export class Runaway {
  active = false;
  place: RunawayPlace = 'friend';
  startDay = -1;
  cash = 0;
  episodes = 0;
  totalDaysOut = 0;
  everGachulfam = false;
  everShelter = false;
  crimes = 0;
  caughtByPolice = 0;
  injuries = 0;
  readonly log: RunawayEvent[] = [];
  readonly ends: RunawayEnd[] = [];
  /** 가출팸 안에서의 서열 0(막내)~1 */
  rank = 0;

  get daysOut(): number {
    return this.active ? this.lastDay - this.startDay : 0;
  }
  private lastDay = -1;

  /**
   * 오늘 집을 나갈 확률 (NPC). 대부분의 아이는 거의 0, 집이 지옥인 아이는 높다.
   * 보정 목표: 전체 연 2~3%, 폭력·심한 갈등 집은 그 몇 배.
   */
  static dailyRisk(x: RunawayInput): number {
    let r = 0.000012;
    r += x.aversion ** 2 * 0.0009;
    r += (x.fear / 100) ** 2 * 0.002;
    r += (Math.max(0, x.stress - 60) / 40) * 0.00015;
    r *= 0.6 + x.rebellion * 1.2 + x.impulsivity * 0.6;
    r *= x.peerRanAway ? 1.5 : 1;
    r *= 1.4 - x.attachment / 100; // 붙잡아 주는 사람이 있으면 덜 나간다
    // 오늘 터진 일이 방아쇠다
    if (x.incidentToday === 'hit') r += 0.006 + x.rebellion * 0.012;
    else if (x.incidentToday === 'yelled') r += 0.0006 + x.rebellion * 0.0012;
    else if (x.clashToday) r += 0.00008 + x.rebellion * 0.0002;
    return Math.min(0.5, r);
  }

  /** 집을 나간다 (NPC가 확률로, 또는 주인공이 선택해서) */
  leave(day: number, cash: number, x: RunawayInput, rng: Random, reason: string): void {
    this.active = true;
    this.startDay = day;
    this.lastDay = day;
    this.cash = cash;
    this.episodes++;
    this.place = x.belonging > 0.4 && rng.chance(0.6) ? 'friend' : cash >= 13000 ? (rng.chance(0.5) ? 'pcbang' : 'jjimjil') : 'street';
    this.say(day, `집을 나왔다. (${reason}) 첫날 밤은 ${PLACE_KO[this.place]}.`);
  }

  /**
   * 밖에서의 하루. 돌아가거나, 버티거나, 더 깊이 빠진다.
   * choice: 주인공이 고를 때 (없으면 NPC가 스스로 판단)
   */
  step(day: number, x: RunawayInput, rng: Random, choice?: 'goHome' | 'call1388' | 'joinFam' | 'stay'): { stress: number; sleepQuality: number; hunger: boolean } {
    if (!this.active) return { stress: 0, sleepQuality: 1, hunger: false };
    this.lastDay = day;
    this.totalDaysOut++;
    const d = this.daysOut;
    let stress = 0;

    // 돈
    const c = PLACE_COST[this.place];
    this.cash -= c.cost + (this.place === 'friend' || this.place === 'shelter' ? 0 : 6000);
    const hunger = this.cash < 0;
    if (this.cash < 0) this.cash = 0;

    // 돌아갈까? (첫 며칠에 대부분 돌아간다 — 친구 집에서 눈치, 돈 떨어짐, 엄마 문자)
    const homesick = x.attachment / 100 - x.fear / 120;
    let pHome = 0.12 + homesick * 0.35 + (this.cash === 0 ? 0.12 : 0) + (this.place === 'friend' && d >= 2 ? 0.2 : 0) - x.rebellion * 0.1;
    if (this.place === 'gachulfam') pHome *= 0.12; // 한번 들어가면 쉽게 못 나온다
    if (choice === 'goHome' || (!choice && rng.chance(Math.max(0.01, pHome)))) {
      this.end(day, 'cameHome', '집으로 돌아갔다.' + (x.fear > 50 ? ' 현관 앞에서 한참 서 있었다.' : ''));
      return { stress: 5, sleepQuality: 0.8, hunger };
    }
    // 부모가 실종 신고를 했으면 경찰이 찾는다
    if (x.parentsSearch && d >= 1 && rng.chance(this.place === 'street' || this.place === 'pcbang' ? 0.12 : 0.05)) {
      this.end(day, 'foundByPolice', `${PLACE_KO[this.place]}에서 경찰에게 발견됐다. 부모님이 데리러 왔다.`);
      return { stress: 8, sleepQuality: 0.8, hunger };
    }

    // 쉼터: 1388을 알면 간다 (위험이 커질수록 더)
    if (this.place !== 'shelter' && (choice === 'call1388' || (!choice && x.knowsHelp && rng.chance(0.06 + (hunger ? 0.08 : 0) + x.fear / 1000)))) {
      this.place = 'shelter';
      this.everShelter = true;
      this.say(day, '1388에 전화했다. 청소년쉼터로 갔다. 따뜻한 밥이 나왔다.');
      return { stress: -6, sleepQuality: PLACE_COST.shelter.sleep, hunger: false };
    }
    if (this.place === 'shelter') {
      // 쉼터: 상담, 가족 중재. 집이 위험하면 집 대신 중장기 쉼터
      if (d >= 3 && rng.chance(0.15)) {
        if (x.fear >= 50) this.end(day, 'shelterLongTerm', '상담 선생님이 집 대신 중장기 쉼터를 알아봐 줬다. 아동보호전문기관에도 연락이 갔다.');
        else this.end(day, 'shelterToHome', '쉼터 상담 선생님이 부모님과 셋이 얘기하는 자리를 만들었다. 집으로 돌아갔다.');
      }
      return { stress: -3, sleepQuality: PLACE_COST.shelter.sleep, hunger: false };
    }

    // 가출팸: 돈 떨어지고 갈 데 없으면 SNS로 "같이 살 사람" 글을 본다
    if (this.place !== 'gachulfam' && (choice === 'joinFam' || (!choice && d >= 2 && (hunger || this.place === 'street') && rng.chance(0.08 + x.rebellion * 0.1)))) {
      this.place = 'gachulfam';
      this.everGachulfam = true;
      this.rank = 0;
      this.say(day, 'SNS에서 "방 있음, 같이 살 사람" 글을 보고 연락했다. 원룸에 또래 다섯 명이 산다.');
      return { stress: 2, sleepQuality: PLACE_COST.gachulfam.sleep, hunger };
    }

    if (this.place === 'gachulfam') {
      // 서열: 막내는 심부름·돈 상납, 버티면 올라간다
      this.rank = Math.min(1, this.rank + 0.01);
      const ev = rng.next();
      if (ev < 0.05 + (1 - this.rank) * 0.03) {
        this.say(day, rng.pick(['"형"들이 돈을 걷었다. 못 내면 맞는다.', '막내라 밤새 심부름을 했다.', '누가 돈을 훔쳐 갔다고 다 같이 벌을 섰다.']));
        stress += 8;
        if (rng.chance(0.3)) this.injuries++;
      } else if (ev < 0.09) {
        // 생계형 범죄: 결과로만
        this.crimes++;
        this.cash += 20000 + Math.floor(rng.next() * 30000);
        this.say(day, rng.pick(['같이 편의점에서 물건을 훔쳤다.', '"쉬운 알바"라며 통장을 빌려 달라는 말을 들었다. 빌려줬다.', '중고거래로 없는 물건을 판다고 했다. 돈이 들어왔다.']));
        stress += 4;
        if (rng.chance(0.25)) {
          this.caughtByPolice++;
          this.end(day, 'foundByPolice', '경찰이 원룸에 들이닥쳤다. 가출팸이 해체됐다. 소년부 송치 통보를 받았다.');
          return { stress: 15, sleepQuality: 0.3, hunger };
        }
      } else if (ev < 0.11) {
        // 위험한 어른
        this.say(day, '"재워 주고 밥 사 준다"는 낯선 어른에게서 연락이 왔다. 무서워서 차단했다. 1388 번호를 저장했다.');
        x.knowsHelp = true;
        stress += 6;
      } else if (ev < 0.14) {
        this.say(day, '편의점 야간 알바를 구했다. 사장님이 부모 동의서를 달라고 했다. …못 했다.');
        stress += 3;
      }
      // 경찰 단속 (해체)
      if (rng.chance(0.006)) {
        this.end(day, 'foundByPolice', '경찰 단속으로 가출팸이 해체됐다. 쉼터를 거쳐 집에 연락이 갔다.');
        return { stress: 10, sleepQuality: 0.4, hunger };
      }
    } else if (this.place === 'friend' && d >= 2) {
      this.place = this.cash >= 13000 ? 'jjimjil' : 'street';
      this.say(day, `친구 부모님 눈치가 보여서 나왔다. 오늘은 ${PLACE_KO[this.place]}.`);
      stress += 3;
    } else if ((this.place === 'pcbang' || this.place === 'jjimjil') && this.cash < 13000) {
      this.place = 'street';
      this.say(day, '돈이 떨어졌다. 24시 패스트푸드점 구석에서 밤을 버텼다.');
      stress += 5;
    }
    stress += this.place === 'street' ? 6 : 2;
    if (hunger) stress += 4;
    return { stress, sleepQuality: PLACE_COST[this.place].sleep, hunger };
  }

  private end(day: number, how: RunawayEnd, text: string): void {
    this.say(day, text);
    this.active = false;
    this.ends.push(how);
  }

  private say(day: number, text: string): void {
    this.log.push({ day, text });
  }
}
