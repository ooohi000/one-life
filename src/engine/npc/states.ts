import type { Random } from '../core/Random';
import type { ActionDef } from './actions';
import type { Attitudes, Goals, Personality } from './personality';

/**
 * 삶의 상태 — 성격처럼 타고나는 게 아니라, 조건이 쌓이면 빠지고 시간이 지나면 나올 수 있다.
 * 원인은 늘 구조(압박·고립·실패)에서 오고, 상태는 다른 시스템(관계·가족·상담)으로 회복될 여지를 남긴다.
 */
export type LifeStateId = 'burnout' | 'withdrawn';

export interface StateContext {
  p: Personality;
  att: Attitudes;
  goals: Goals;
  stress: number;
  highStressDays: number;
  lonelyDays: number; // 외로운 날 누적(외로우면 +1, 괜찮으면 -1)
  calmDays: number; // 스트레스 35 미만이 이어진 일수
  daysInState: number;
  rng: Random;
}

export interface LifeStateDef {
  id: LifeStateId;
  label: string;
  monologueIn: string;
  monologueOut: string;
  /** 매일 밤 검사: 빠질지 */
  enter: (c: StateContext) => boolean;
  /** 매일 밤 검사: 나올지 */
  exit: (c: StateContext) => boolean;
  /** 행동 점수 보정 */
  scoreMod: (a: ActionDef) => number;
  /** 아예 못 하는 행동 */
  blocks?: (a: ActionDef) => boolean;
  /** 등교일에 학교를 안 갈 확률 */
  schoolRefusal?: (c: StateContext) => number;
}

const STUDY = new Set(['academy', 'selfStudy', 'homeStudy']);

export const LIFE_STATES: LifeStateDef[] = [
  {
    id: 'burnout',
    label: '번아웃',
    monologueIn: '아무것도 하기 싫다. 책을 펴도 글자가 안 읽힌다.',
    monologueOut: '요즘은 조금 숨이 쉬어진다.',
    enter: (c) => c.highStressDays >= 10 && ((c.goals.grades ?? 0) + (c.goals.approval ?? 0) + (c.goals.stable ?? 0) > 0),
    exit: (c) => c.calmDays >= 4,
    scoreMod: (a) => (STUDY.has(a.id) ? -1.0 : 0) + (a.tiring ? -0.4 : 0) + (a.id === 'homeRest' || a.id === 'phone' ? 0.4 : 0),
  },
  {
    id: 'withdrawn',
    label: '은둔',
    monologueIn: '밖에 나가는 게 무섭다. 그냥 방에 있고 싶다.',
    monologueOut: '오랜만에 현관문을 열어봤다.',
    // 오래 고립되고, 열등감이 크고, 내향적인데 스트레스까지 겹치면 드물게 빠진다
    enter: (c) =>
      c.lonelyDays >= 14 && c.att.inferiority >= 0.5 && c.p.extraversion < 0.5 && (c.stress >= 50 || c.highStressDays >= 5) && c.rng.chance(0.02),
    // 스스로 나오기는 어렵다(가족·친구·상담 같은 개입이 생기면 확률이 오른다 — 관계 시스템에서)
    exit: (c) => c.daysInState >= 7 && c.rng.chance(0.03 + c.p.agreeableness * 0.03),
    scoreMod: (a) => (a.place === '집' ? 0.3 : -2),
    blocks: (a) => a.place !== '집',
    schoolRefusal: (c) => 0.4 + c.att.inferiority * 0.3,
  },
];
