/**
 * 조립형 캐릭터 — 데이터 모델.
 * 몸은 완성형 한 장, 그 위에 부상·얼굴·머리·옷·신발·소품을 같은 칸·같은 발바닥 기준으로 겹친다.
 * (docs/art-ref/character/CHARACTER-SYSTEM.md)
 */
import type { Dir } from '../pixel';

export type Sex = 'm' | 'f';
/** 나이대 (그림 단위) */
export type AgeBand = 'child' | 'teen' | 'adult' | 'middle' | 'elder';
/** 체형 — 데이터로 늘린다. 몸 그림 id가 `${sex}-${age}-${build}` */
export type Build = 'slim' | 'average' | 'muscle' | 'chubby' | 'curvy' | (string & {});

/** 겹치는 층 종류 */
export type LayerKind = 'body' | 'effects' | 'face' | 'hair' | 'shoes' | 'bottom' | 'top' | 'outer' | 'acc';

/** 그림 한 겹 = 어떤 층의 어떤 부품 */
export interface LayerRef {
  kind: LayerKind;
  /** 부품 id (폴더 이름) — 예: 'gray-tshirt' */
  id: string;
  /** 소품이 몸 앞/뒤 어디에 붙는지 (가방은 뒤, 안경은 앞) */
  slot?: 'front' | 'back';
}

export interface CharacterLook {
  body: { sex: Sex; age: AgeBand; build: Build };
  effects?: string[];
  face?: string;
  hair?: string;
  top?: string;
  bottom?: string;
  outer?: string;
  shoes?: string;
  acc?: Array<{ id: string; slot: 'front' | 'back' }>;
  /** 비에 젖음 (합성 뒤 색조만 바꾼다) */
  wet?: boolean;
}

/** 동작 = 시트 한 장의 칸 배치 */
export interface ActionLayout {
  cols: number;
  rows: number;
  /** 칸 → (방향, 걸음 번호). 줄 우선 순서 */
  frames: Array<{ dir: Dir; step: number }>;
}

export const DIRS: Dir[] = ['down', 'left', 'right', 'up'];

export const bodyId = (b: CharacterLook['body']) => `${b.sex}-${b.age}-${b.build}`;
