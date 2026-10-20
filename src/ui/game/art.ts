/**
 * 그림 파일 (src/ui/art/**.png). 있으면 그걸 쓰고, 없으면 코드로 찍은 임시 도트(pixel.ts)를 쓴다.
 * 그래서 그림은 한 장씩 갈아 끼울 수 있다 — 파일만 정해진 이름으로 넣으면 끝. 규격은 src/ui/art/README.md
 */
import type Phaser from 'phaser';

const files = import.meta.glob('../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** 'chars/player_work' → url */
export const ART = new Map(Object.entries(files).map(([p, url]) => [p.replace('../art/', '').replace(/\.png$/, ''), url]));

export const hasArt = (key: string) => ART.has(key);

/**
 * 화면 배율. 세계 좌표(편의점 320×192, 길 480×270)는 그대로 두고 캔버스만 2배로 그린다.
 * 그래서 캐릭터 그림은 두 배 고운 시트(칸 32×64)를 써도 된다 — 세계에선 16×32 크기로 선다.
 */
export const ZOOM = 2;

export function preloadArt(scene: Phaser.Scene) {
  for (const [key, url] of ART) scene.load.image(key, url);
}

/** 캐릭터 시트(4×4)를 칸으로 나눈다. 칸 크기는 그림 크기 ÷ 4 (16×32든 32×64든). 세계에서의 배율을 돌려준다 */
export function sheetFrames(scene: Phaser.Scene, key: string): number {
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage() as HTMLImageElement;
  const fw = src.width / 4;
  const fh = src.height / 4;
  if (!tex.has('0')) for (let i = 0; i < 16; i++) tex.add(String(i), 0, (i % 4) * fw, Math.floor(i / 4) * fh, fw, fh);
  return 32 / fh;
}

/** 같은 종류 그림 중 하나 (손님 얼굴 돌려쓰기) */
export function pickArt(prefix: string, n: number): string | null {
  const keys = [...ART.keys()].filter((k) => k.startsWith(prefix)).sort();
  return keys.length ? keys[n % keys.length]! : null;
}
