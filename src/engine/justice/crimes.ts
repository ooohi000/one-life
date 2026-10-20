import type { CrimeLure } from '../traits/traits';

/**
 * 요즘 고등학생이 휘말리는 범죄 (2020년대 중반 기준).
 * - 줄어든 것: 오토바이 떼 폭주는 국경일(3·1절·광복절) 중심으로 남았고, 공유 킥보드·자전거 "폭주"가 새로 생김
 * - 늘어난 것: 무인점포 절도, 중고거래·게임 아이템 사기(컴퓨터등사용사기 2021→2025 +35%), 불법 사이버도박,
 *   대리입금(불법 고리), "고액 알바"로 꾀인 보이스피싱 수거책·통장 대여, SNS로 약속 잡는 패싸움과 촬영 유포
 * 표현 원칙: 수법은 그리지 않는다. 했다 → 들켰다 → 무슨 일이 벌어졌다.
 */
export interface CrimeDef {
  id: string;
  label: string;
  /** 적용 법 (게임 안 서류에 찍히는 말) */
  law: string;
  /** 무게 1~10 */
  severity: number;
  /** 어떤 결의 아이가 끌리나 */
  lure: CrimeLure;
  /** 한 번 했을 때 걸릴 확률 */
  detect: number;
  /** 피해자가 원치 않으면 처벌 못 함 (합의가 곧 끝) */
  victimCanDrop?: boolean;
  /** 합의가 가능한가 (피해자 있음) */
  hasVictim: boolean;
  /** 범칙금·과태료로 끝나는 위반 (범죄 기록 없음) */
  fineOnly?: number;
  /** 피해자가 같은 학교 학생이면 학폭위도 열린다 */
  schoolCase?: boolean;
  /** 결과 한 줄 */
  outcome: string;
  /** 평범한 고등학생이 1년에 한 번이라도 저지를 확률 (특성·반항심·친구·가출이 곱해진다) */
  yearly: number;
  /** 특정 날에만 — [월, 일] (3·1절·광복절 밤 폭주) */
  onlyOn?: Array<[number, number]>;
}

export const CRIMES: CrimeDef[] = [
  { id: 'assault', label: '폭행', law: '형법 제260조', severity: 3, yearly: 0.02, lure: 'violence', detect: 0.35, victimCanDrop: true, hasVictim: true, schoolCase: true,
    outcome: '말싸움이 주먹질이 됐다.' },
  { id: 'groupFight', label: '패싸움 (공동폭행)', law: '폭력행위처벌법 제2조', severity: 5, yearly: 0.003, lure: 'violence', detect: 0.55, victimCanDrop: true, hasVictim: true, schoolCase: true,
    outcome: 'SNS로 시간과 장소를 잡고 모였다. 누가 영상을 찍어 올렸다.' },
  { id: 'injury', label: '상해', law: '형법 제257조', severity: 6, yearly: 0.002, lure: 'violence', detect: 0.7, hasVictim: true, schoolCase: true,
    outcome: '상대가 병원에서 전치 4주를 받았다.' },
  { id: 'extortion', label: '공갈 (삥 뜯기)', law: '형법 제350조', severity: 5, yearly: 0.003, lure: 'violence', detect: 0.4, hasVictim: true, schoolCase: true,
    outcome: '후배에게 돈을 "빌렸다". 갚을 생각은 없었다.' },
  { id: 'bullying', label: '지속적 괴롭힘', law: '학교폭력예방법', severity: 4, yearly: 0.01, lure: 'violence', detect: 0.45, hasVictim: true, schoolCase: true,
    outcome: '단톡방에서 한 명을 몇 달째 놀렸다.' },
  { id: 'intimidation', label: '협박 (입막음)', law: '형법 제283조', severity: 3, yearly: 0.004, lure: 'violence', detect: 0.35, victimCanDrop: true, hasVictim: true, schoolCase: true,
    outcome: '"선생님한테 말하면 끝이다." — 그 말이 녹음돼 있었다.' },
  { id: 'unmannedTheft', label: '무인점포 절도', law: '형법 제329조', severity: 3, yearly: 0.01, lure: 'theft', detect: 0.6, hasVictim: true,
    outcome: '무인 아이스크림 가게에서 계산 안 하고 나왔다. 가게엔 CCTV가 네 대 있었다.' },
  { id: 'bikeTheft', label: '오토바이 절도·무면허 운전', law: '형법 제329조·도로교통법', severity: 4, yearly: 0.002, lure: 'speed', detect: 0.5, hasVictim: true,
    outcome: '키가 꽂힌 배달 오토바이를 몰고 갔다.' },
  { id: 'recklessGroup', label: '폭주 (공동위험행위)', law: '도로교통법 제46조', severity: 4, yearly: 0.004, onlyOn: [[3, 1], [8, 15]], lure: 'speed', detect: 0.3, hasVictim: false,
    outcome: '국경일 밤, 태극기를 단 오토바이 수십 대가 도로를 막고 달렸다. 생중계를 켰다.' },
  { id: 'kickboard', label: '전동킥보드 무면허·2인 탑승', law: '도로교통법 (범칙금)', severity: 1, yearly: 0.08, lure: 'rules', detect: 0.15, hasVictim: false, fineOnly: 100000,
    outcome: '공유 킥보드에 친구랑 둘이 타고 인도를 달렸다.' },
  { id: 'usedFraud', label: '중고거래 사기', law: '형법 제347조', severity: 4, yearly: 0.003, lure: 'easyMoney', detect: 0.55, hasVictim: true,
    outcome: '없는 게임기를 판다고 올렸다. 돈이 들어왔다.' },
  { id: 'itemFraud', label: '게임 아이템 사기', law: '형법 제347조의2', severity: 3, yearly: 0.005, lure: 'easyMoney', detect: 0.4, hasVictim: true,
    outcome: '아이템을 준다고 하고 돈만 받았다.' },
  { id: 'loanShark', label: '대리입금 (불법 고리)', law: '대부업법', severity: 3, yearly: 0.002, lure: 'easyMoney', detect: 0.3, hasVictim: true,
    outcome: '"10만 원 빌려주면 일주일 뒤 15만 원" — 갚지 못한 애한테 수고비를 더 붙였다.' },
  { id: 'gambling', label: '불법 사이버도박', law: '형법 제246조·국민체육진흥법', severity: 2, yearly: 0.02, lure: 'gambling', detect: 0.2, hasVictim: false,
    outcome: '스포츠 토토 사이트에서 용돈을 다 잃고, 빚을 내서 또 걸었다.' },
  { id: 'accountRental', label: '통장·휴대폰 명의 대여', law: '전자금융거래법', severity: 4, yearly: 0.003, lure: 'easyMoney', detect: 0.5, hasVictim: false,
    outcome: '"통장 빌려주면 30만 원" — 그 통장으로 남의 돈이 오갔다.' },
  { id: 'phishingMule', label: '보이스피싱 수거책', law: '형법 제347조 (사기 공범)', severity: 7, yearly: 0.001, lure: 'easyMoney', detect: 0.65, hasVictim: true,
    outcome: '"서류 전달 고액 알바"인 줄 알았다. 받아 온 봉투엔 할머니의 노후 자금이 들어 있었다.' },
  { id: 'drugs', label: '마약 투약', law: '마약류관리법', severity: 8, yearly: 0.0003, lure: 'rules', detect: 0.35, hasVictim: false,
    outcome: '텔레그램으로 구했다. 몸이 먼저 무너졌다.' },
];

const BY_ID = new Map(CRIMES.map((c) => [c.id, c]));
export function crime(id: string): CrimeDef {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`없는 범죄: ${id}`);
  return c;
}

/** 오늘이 그 범죄가 일어나는 날인가 */
export function crimeDay(c: CrimeDef, month: number, day: number): boolean {
  return !c.onlyOn || c.onlyOn.some(([m, d]) => m === month && d === day);
}
