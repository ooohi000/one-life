/**
 * 기존 Look(색만 있는 옛 모델) → 새 CharacterLook.
 * 옛 코드는 그대로 두고, 새 그림이 있을 때만 이 변환을 거쳐 조립형으로 그린다.
 */
import type { Look } from '../pixel';
import type { CharacterLook } from './types';

/** 주인공 (남자 고등학생, 보통 체형) — 날씨 옷차림에 따라 부품을 고른다 */
export function protagonistLook(look: Look, opts: { work?: boolean } = {}): CharacterLook {
  const o = look.outfit;
  return {
    body: { sex: 'm', age: 'teen', build: 'average' },
    face: 'basic',
    hair: 'short-black',
    top: o === 0 ? 'school-summer' : o <= 2 ? 'school-shirt' : 'school-shirt',
    bottom: o === 0 ? 'school-pants-summer' : 'school-pants',
    outer: opts.work ? 'store-vest' : o === 4 ? 'long-padding' : o === 3 ? 'school-jacket' : undefined,
    shoes: 'sneakers-white',
    acc: look.backpack && !opts.work ? [{ id: 'backpack-black', slot: 'back' }] : [],
    wet: look.wet,
  };
}
