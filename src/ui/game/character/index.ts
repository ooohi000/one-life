import type Phaser from 'phaser';
import type { Look } from '../pixel';
import { composeSheet } from './compose';
import { protagonistLook } from './fromLook';

export * from './types';
export { ACTIONS, orderFor, allLayers, layerKey } from './layers';
export { composeSheet, LAYER_ROOT, type Composed } from './compose';
export { protagonistLook } from './fromLook';
export { SKIN_TONES, recolorSkin, isSkin } from './skin';

/**
 * 주인공 시트 고르기: 조립형 몸 그림이 있으면 조립, 없으면 기존 통짜 시트 후보 중 있는 것, 그것도 없으면 null(코드 도트).
 * `?char=old`면 조립형을 끈다 (비교용).
 */
export function playerSheet(scene: Phaser.Scene, look: Look, legacy: Array<string | undefined>, opts: { work?: boolean } = {}): string | null {
  const off = typeof location !== 'undefined' && new URLSearchParams(location.search).get('char') === 'old';
  if (!off) {
    const c = composeSheet(scene, protagonistLook(look, opts));
    // 옷(윗옷·바지)이 빠진 채로는 게임에 내보내지 않는다 — 마네킹 몸만 걸어 다니면 안 되니 기존 시트로
    if (c && !c.missing.some((m) => m.startsWith('top/') || m.startsWith('bottom/'))) return c.key;
  }
  return legacy.find((k): k is string => !!k) ?? null;
}
