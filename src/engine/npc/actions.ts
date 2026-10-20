import type { ExerciseKind, MealKind } from '../body/composition';
import type { GrowStatKey } from '../character/types';
import type { GoalId } from './personality';

/** 2026년 최저시급(원). 알바 수입 계산에 쓴다. */
export const MIN_WAGE = 10320;

export type Place = '집' | '학교' | '학원가' | '독서실' | 'PC방' | '노래방' | '카페' | '헬스장' | '운동장' | '편의점' | '연습실';

/**
 * 방과 후·저녁·주말에 고를 수 있는 행동. 데이터라서 계속 늘릴 수 있다.
 * 점수 계산은 brain.ts가 한다.
 */
export interface ActionDef {
  id: string;
  label: string;
  place: Place;
  minutes: number;
  /** 비용(원). 음수면 수입 */
  cost: number;
  /** 언제 할 수 있나 (하루 중 분). [시작 가능, 끝나야 하는 시각] */
  open: [number, number];
  /** 욕구 해소량 (양수 = 해소). stress는 음수면 스트레스를 줌 */
  relieves: { stress?: number; loneliness?: number; boredom?: number };
  /** 인생 목표와 얼마나 맞나 */
  goals: Partial<Record<GoalId, number>>;
  /** 성격이 끌리는 정도 */
  lure?: Partial<Record<'conscientiousness' | 'extraversion' | 'impulsivity', number>>;
  train?: Array<[GrowStatKey, number]>;
  exercise?: [ExerciseKind, number];
  meal?: MealKind;
  /** 피곤할 땐 하기 싫은 행동 */
  tiring?: boolean;
  /** 친구랑 하는 행동 — 부를 친구가 있어야 할 수 있다 (관계 시스템이 붙으면 실제 친구 목록으로) */
  withFriends?: boolean;
  /** 조건: 학원 등록자만, 알바 하는 사람만 */
  requires?: 'academy' | 'job';
}

const H = (h: number, m = 0) => h * 60 + m;

export const ACTIONS: ActionDef[] = [
  {
    id: 'academy', label: '학원', place: '학원가', minutes: 180, cost: 0, open: [H(16, 30), H(22, 30)],
    relieves: { stress: -7 }, goals: { grades: 1, approval: 0.8, stable: 0.5 }, lure: { conscientiousness: 0.2 },
    train: [['study', 1.0]], tiring: true, requires: 'academy', meal: '편의점',
  },
  {
    id: 'selfStudy', label: '독서실 자습', place: '독서실', minutes: 120, cost: 2000, open: [H(9), H(24)],
    relieves: { stress: -5 }, goals: { grades: 0.8, stable: 0.9, approval: 0.5, escape: 0.3 }, lure: { conscientiousness: 0.3 },
    train: [['study', 0.7]], tiring: true,
  },
  {
    id: 'gym', label: '헬스', place: '헬스장', minutes: 90, cost: 3000, open: [H(6), H(23)],
    relieves: { stress: 5, boredom: 10 }, goals: { fitness: 1, dominance: 0.4, romance: 0.2 },
    exercise: ['weights', 70], train: [['endurance', 0.3]], tiring: true,
  },
  {
    id: 'soccer', label: '운동장 축구', place: '운동장', minutes: 90, cost: 0, open: [H(9), H(20)],
    withFriends: true,
    relieves: { stress: 6, loneliness: 25, boredom: 25 }, goals: { fitness: 0.7, social: 0.5 },
    lure: { extraversion: 0.2 }, exercise: ['sports', 90], train: [['endurance', 1.0], ['fighting', 0.1]], tiring: true,
  },
  {
    id: 'pcbang', label: 'PC방', place: 'PC방', minutes: 120, cost: 3000, open: [H(9), H(26)],
    relieves: { stress: 5, boredom: 40, loneliness: 10 }, goals: { fun: 1, social: 0.2 },
    lure: { impulsivity: 0.25 }, meal: '간식',
  },
  {
    id: 'karaoke', label: '노래방', place: '노래방', minutes: 90, cost: 5000, open: [H(12), H(24)],
    withFriends: true,
    relieves: { stress: 7, boredom: 30, loneliness: 30 }, goals: { social: 0.8, fun: 0.6, romance: 0.3 },
    lure: { extraversion: 0.6 }, train: [['speech', 0.2]],
  },
  {
    id: 'hangout', label: '카페에서 수다', place: '카페', minutes: 90, cost: 6000, open: [H(10), H(22)],
    withFriends: true,
    relieves: { stress: 5, loneliness: 40, boredom: 15 }, goals: { social: 1, romance: 0.5 },
    lure: { extraversion: 0.35 }, train: [['speech', 0.4], ['tact', 0.3]], meal: '간식',
  },
  {
    id: 'partTime', label: '편의점 알바', place: '편의점', minutes: 240, cost: -4 * MIN_WAGE, open: [H(17), H(23, 30)],
    relieves: { stress: -7, boredom: 5 }, goals: { money: 1, escape: 1 }, lure: { conscientiousness: 0.1 },
    train: [['streetSmart', 0.6], ['tact', 0.2]], tiring: true, requires: 'job', meal: '편의점',
  },
  {
    id: 'rankGame', label: 'PC방 랭크 연습', place: 'PC방', minutes: 180, cost: 4500, open: [H(9), H(26)],
    relieves: { stress: -2, boredom: 30 }, goals: { proGamer: 1, fun: 0.3 }, lure: { impulsivity: 0.1 },
    tiring: true, meal: '간식',
  },
  {
    id: 'practiceRoom', label: '연습실 노래·춤', place: '연습실', minutes: 120, cost: 5000, open: [H(10), H(23)],
    relieves: { stress: 2, boredom: 20 }, goals: { artist: 1, fitness: 0.2 }, lure: { extraversion: 0.2 },
    exercise: ['cardio', 60], train: [['speech', 0.2], ['endurance', 0.4]], tiring: true,
  },
  {
    id: 'filmVideo', label: '유튜브 촬영·편집', place: '집', minutes: 120, cost: 0, open: [H(9), H(26)],
    relieves: { stress: 1, boredom: 25 }, goals: { influencer: 1, fun: 0.2 }, lure: { extraversion: 0.15 },
    train: [['speech', 0.4]], tiring: true,
  },
  {
    id: 'homeRest', label: '집에서 뒹굴', place: '집', minutes: 120, cost: 0, open: [H(0), H(26)],
    relieves: { stress: 4, boredom: 10 }, goals: { fun: 0.5 },
  },
  {
    id: 'phone', label: '침대에서 폰', place: '집', minutes: 60, cost: 0, open: [H(20), H(27)],
    relieves: { stress: 2, boredom: 20, loneliness: 8 }, goals: { fun: 0.6, social: 0.2 },
    lure: { impulsivity: 0.35 },
  },
  {
    id: 'homeStudy', label: '집에서 공부', place: '집', minutes: 90, cost: 0, open: [H(0), H(26)],
    relieves: { stress: -5 }, goals: { grades: 0.6, stable: 0.6, approval: 0.6 }, lure: { conscientiousness: 0.25 },
    train: [['study', 0.5]], tiring: true,
  },
];
