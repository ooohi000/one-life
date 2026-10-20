import type { BodyState, Character } from '../character/types';
import { fatPercent } from './composition';

export interface SymptomContext {
  ch: Character;
  body: BodyState;
  drowsiness: number;
}

export interface SymptomDef {
  id: string;
  /** 겉으로 보이는 변화 (화면에서 스프라이트·연출로) */
  visual?: 'darkCircles' | 'slouch' | 'pale' | 'belly' | 'broadShoulders';
  /** 좋은 변화도 증상처럼 드러난다 */
  positive?: boolean;
  /** 캐릭터 독백 */
  monologue: string;
  /** 같은 독백을 다시 하기까지 최소 일수(매일 도배 방지). 기본 7 */
  cooldownDays?: number;
  active: (ctx: SymptomContext) => boolean;
}

/**
 * 증상 = 숨겨진 수치가 선을 넘었을 때 겉으로 드러나는 신호.
 * 플레이어는 수치가 아니라 이걸 보고 "요즘 몸이 이상하다"를 알아챈다.
 * 데이터로 두고 계속 늘려간다.
 */
export const SYMPTOMS: SymptomDef[] = [
  {
    id: 'drowsy',
    monologue: '눈꺼풀이 무겁다.',
    cooldownDays: 14,
    active: ({ drowsiness }) => drowsiness >= 50,
  },
  {
    id: 'darkCircles',
    visual: 'darkCircles',
    monologue: '거울을 보니 눈 밑이 거뭇하다.',
    active: ({ body }) => body.sleepDebtMin >= 180,
  },
  {
    id: 'foggy',
    monologue: '머리가 멍하다. 칠판 글씨가 눈에 안 들어온다.',
    active: ({ body }) => body.sleepDebtMin >= 360,
  },
  {
    id: 'irritable',
    monologue: '사소한 일에도 짜증이 난다.',
    active: ({ body }) => body.stress >= 70,
  },
  {
    id: 'stiffNeck',
    visual: 'slouch',
    monologue: '요즘 아침마다 뒷목이 뻐근하다.',
    active: ({ body }) => body.highStressDays >= 5,
  },
  {
    id: 'hungry',
    monologue: '요즘 돌아서면 배고프다.',
    cooldownDays: 21,
    active: ({ body }) => body.appetite >= 1.2,
  },
  {
    id: 'dizzy',
    visual: 'pale',
    monologue: '일어날 때 눈앞이 핑 돈다.',
    active: ({ ch, body }) => fatPercent(ch) < 8 || body.metabolicAdaptation >= 0.1,
  },
  {
    id: 'cold',
    monologue: '남들보다 유난히 추위를 탄다.',
    cooldownDays: 30,
    active: ({ ch }) => fatPercent(ch) < 7,
  },
  {
    id: 'tightPants',
    visual: 'belly',
    monologue: '교복 바지가 꽉 낀다.',
    active: ({ ch }) => fatPercent(ch) >= 22,
  },
  {
    id: 'outOfBreath',
    monologue: '계단 몇 층만 올라가도 숨이 찬다.',
    cooldownDays: 30,
    active: ({ ch }) => fatPercent(ch) >= 28,
  },
  {
    id: 'broaderShoulders',
    visual: 'broadShoulders',
    positive: true,
    monologue: '거울 속 어깨가 좀 넓어진 것 같다.',
    active: ({ body }) => body.muscleKg - body.naturalMuscleKg >= 1.5,
  },
];
