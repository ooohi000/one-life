/**
 * 층을 한 장으로 미리 합친다 (모습마다 한 번, 그다음엔 캐시).
 * 결과는 지금 Walker가 쓰는 4×4 걷기 시트와 똑같은 배치라서 Walker는 그대로 쓴다.
 * 걷기 그림이 아직 없고 정지(idle)만 있으면 정지 칸을 걸음 칸에 복사한다 (해상도 시험용).
 */
import type Phaser from 'phaser';
import { hasArt } from '../art';
import { ACTIONS, allLayers, layerKey, orderFor } from './layers';
import { DIRS, type CharacterLook, type LayerRef } from './types';

export const LAYER_ROOT = 'chars/layers';

export interface Composed {
  /** Phaser 텍스처 키 (칸 '0'~'15') */
  key: string;
  /** 실제로 쓴 동작 그림 */
  action: string;
  frameW: number;
  frameH: number;
  /** 그림이 없거나 크기가 안 맞아서 빠진 층 */
  missing: string[];
}

const warned = new Set<string>();
function warn(msg: string) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[character] ${msg}`);
}

/** 몸 그림이 없으면 null — 그러면 부르는 쪽이 원래 방식(통짜 시트·코드 도트)으로 그린다 */
export function composeSheet(scene: Phaser.Scene, look: CharacterLook, opts: { root?: string; actions?: string[] } = {}): Composed | null {
  const root = opts.root ?? LAYER_ROOT;
  const prefs = opts.actions ?? ['walk', 'idle'];
  const layers = allLayers(look);
  const body = layers.find((l) => l.kind === 'body')!;
  const action = prefs.find((a) => ACTIONS[a] && hasArt(layerKey(root, body, a)) && scene.textures.exists(layerKey(root, body, a)));
  if (!action) return null;
  const lay = ACTIONS[action]!;

  const { wet: _wet, ...shape } = look;
  const key = `char:${root}:${action}:${JSON.stringify(shape)}`;
  const bodySrc = scene.textures.get(layerKey(root, body, action)).getSourceImage() as HTMLImageElement;
  const fw = bodySrc.width / lay.cols;
  const fh = bodySrc.height / lay.rows;
  const missing: string[] = [];
  if (scene.textures.exists(key)) return { key, action, frameW: fw, frameH: fh, missing };

  // 쓸 수 있는 층 (그림 있고 크기 같은 것만)
  const usable = new Map<string, HTMLImageElement>();
  for (const l of layers) {
    const k = layerKey(root, l, action);
    if (!hasArt(k) || !scene.textures.exists(k)) {
      missing.push(`${l.kind}/${l.id}`);
      if (l.kind !== 'body') warn(`그림 없음: ${k}.png — 이 층은 빼고 그린다`);
      continue;
    }
    const img = scene.textures.get(k).getSourceImage() as HTMLImageElement;
    if (img.width !== bodySrc.width || img.height !== bodySrc.height) {
      missing.push(`${l.kind}/${l.id}`);
      warn(`크기 안 맞음: ${k}.png ${img.width}×${img.height} (몸은 ${bodySrc.width}×${bodySrc.height}) — 빼고 그린다`);
      continue;
    }
    usable.set(`${l.kind}/${l.id}`, img);
  }

  const canvas = document.createElement('canvas');
  canvas.width = fw * 4;
  canvas.height = fh * 4;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  DIRS.forEach((dir, row) => {
    const order: LayerRef[] = orderFor(look, dir);
    for (let col = 0; col < 4; col++) {
      // 이 칸에 해당하는 원본 칸
      const step = action === 'walk' ? col : 0;
      const src = lay.frames.findIndex((f) => f.dir === dir && f.step === step);
      if (src < 0) continue;
      const sx = (src % lay.cols) * fw;
      const sy = Math.floor(src / lay.cols) * fh;
      for (const l of order) {
        const img = usable.get(`${l.kind}/${l.id}`);
        if (img) g.drawImage(img, sx, sy, fw, fh, col * fw, row * fh, fw, fh);
      }
    }
  });
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < 16; i++) tex.add(String(i), 0, (i % 4) * fw, Math.floor(i / 4) * fh, fw, fh);
  return { key, action, frameW: fw, frameH: fh, missing };
}
