/**
 * 그림 파일 (src/ui/art/**.png). 있으면 그걸 쓰고, 없으면 코드로 찍은 임시 도트(pixel.ts)를 쓴다.
 * 그래서 그림은 한 장씩 갈아 끼울 수 있다 — 파일만 정해진 이름으로 넣으면 끝. 규격은 src/ui/art/README.md
 */
import type Phaser from 'phaser';

const files = import.meta.glob('../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 'chars/player_work' → url */
export const ART = new Map(Object.entries(files).map(([p, url]) => [p.replace('../art/', '').replace(/\.png$/, ''), url]));

export const hasArt = (key: string) => ART.has(key);

/** 캐릭터 시트 한 칸 */
export const CHAR_FRAME = { w: 16, h: 32 };

export function preloadArt(scene: Phaser.Scene) {
  for (const [key, url] of ART) {
    if (key.startsWith('chars/')) scene.load.spritesheet(key, url, { frameWidth: CHAR_FRAME.w, frameHeight: CHAR_FRAME.h });
    else scene.load.image(key, url);
  }
}

/** 같은 종류 그림 중 하나 (손님 얼굴 돌려쓰기) */
export function pickArt(prefix: string, n: number): string | null {
  const keys = [...ART.keys()].filter((k) => k.startsWith(prefix)).sort();
  return keys.length ? keys[n % keys.length]! : null;
}
