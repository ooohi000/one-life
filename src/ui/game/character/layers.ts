/**
 * 그림 파일 규칙과 겹치는 순서.
 *
 * 파일: src/ui/art/chars/layers/<층>/<부품 id>/<동작>.png
 *   예) chars/layers/body/m-teen-average/idle.png
 *       chars/layers/top/gray-tshirt/idle.png
 * 같은 동작이면 모든 층이 같은 크기·같은 칸 배치·같은 발바닥 위치여야 한다 (tools/sprite-qa.py로 검사).
 */
import type { Dir } from '../pixel';
import { DIRS, bodyId, type ActionLayout, type CharacterLook, type LayerRef } from './types';

/** 동작별 칸 배치. 새 동작은 여기 한 줄 */
export const ACTIONS: Record<string, ActionLayout> = {
  /** 정지 4방향: 1줄 × 4칸 (아래·왼·오른·위) — 해상도 확정 전 시험은 이것만 */
  idle: { cols: 4, rows: 1, frames: DIRS.map((dir) => ({ dir, step: 0 })) },
  /** 걷기: 4줄(방향) × 4칸(서기·걸음1·서기·걸음2) — 지금 player_school.png와 같은 배치 */
  walk: { cols: 4, rows: 4, frames: DIRS.flatMap((dir) => [0, 1, 2, 3].map((step) => ({ dir, step }))) },
};

export const layerKey = (root: string, l: LayerRef, action: string) => `${root}/${l.kind}/${l.id}/${action}`;

/**
 * 방향별 겹치는 순서 (아래 → 위).
 * 뒷모습이면 등에 멘 가방이 맨 위, 앞모습이면 몸 뒤로 숨는다.
 */
export function orderFor(look: CharacterLook, dir: Dir): LayerRef[] {
  const out: LayerRef[] = [];
  const back = (look.acc ?? []).filter((a) => a.slot === 'back').map((a): LayerRef => ({ kind: 'acc', id: a.id, slot: 'back' }));
  const front = (look.acc ?? []).filter((a) => a.slot === 'front').map((a): LayerRef => ({ kind: 'acc', id: a.id, slot: 'front' }));
  if (dir !== 'up') out.push(...back);
  out.push({ kind: 'body', id: bodyId(look.body) });
  for (const e of look.effects ?? []) out.push({ kind: 'effects', id: e });
  if (look.shoes) out.push({ kind: 'shoes', id: look.shoes });
  if (look.bottom) out.push({ kind: 'bottom', id: look.bottom });
  if (look.top) out.push({ kind: 'top', id: look.top });
  if (look.outer) out.push({ kind: 'outer', id: look.outer });
  if (look.face && dir !== 'up') out.push({ kind: 'face', id: look.face });
  if (look.hair) out.push({ kind: 'hair', id: look.hair });
  out.push(...front);
  if (dir === 'up') out.push(...back);
  return out;
}

/** 이 모습에 쓰이는 모든 층 (방향 무관, 중복 없음) */
export function allLayers(look: CharacterLook): LayerRef[] {
  const seen = new Map<string, LayerRef>();
  for (const d of DIRS) for (const l of orderFor(look, d)) seen.set(`${l.kind}/${l.id}`, l);
  return [...seen.values()];
}
