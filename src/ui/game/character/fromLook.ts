/**
 * 기존 Look(색만 있는 옛 모델) → 새 CharacterLook.
 * 옛 코드는 그대로 두고, 새 그림이 있을 때만 이 변환을 거쳐 조립형으로 그린다.
 */
import type { Look } from '../pixel';
import { SKIN_TONES } from './skin';
import type { CharacterLook } from './types';

/** 주인공 (남자 고등학생, 보통 체형) — 날씨 옷차림에 따라 부품을 고른다 */
export function protagonistLook(look: Look, opts: { work?: boolean } = {}): CharacterLook {
  const o = look.outfit;
  return {
    // 기본 피부색 (몸 그림 피부만 바뀌고 회색 속옷은 그대로)
    body: { sex: 'm', age: 'teen', build: 'average', skin: SKIN_TONES[1] },
    face: 'basic',
    hair: 'short-black',
    top: o === 0 ? 'school-summer' : o <= 2 ? 'school-shirt' : 'school-shirt',
    bottom: o === 0 ? 'school-pants-summer' : 'school-pants',
    // 봄·가을·초겨울은 교복 재킷, 한여름은 셔츠만, 한겨울은 롱패딩
    outer: opts.work ? 'store-vest' : o === 4 ? 'long-padding' : o >= 1 ? 'school-jacket' : undefined,
    shoes: 'sneakers-white',
    acc: look.backpack && !opts.work ? [{ id: 'backpack-black', slot: 'back' }] : [],
    wet: look.wet,
  };
}
