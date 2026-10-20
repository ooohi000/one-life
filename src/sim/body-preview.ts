/**
 * 코드로 그리는 몸 미리보기 → PNG.
 * 실행: npx tsx src/sim/body-preview.ts [출력.png]
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FRAME_H, FRAME_W, paint, type BodyParams, type Outfit, type View } from '../ui/game/bodygen';

const SCALE = 4;
const base: Outfit = { skin: '#f1c9a5', top: '#a9a9b0', sleeves: 'short', bottom: '#7d7d86', bottomLen: 'short', shoes: '#4a4a52', socks: '#c8c8cc' };
const school: Outfit = { skin: '#f1c9a5', top: '#22305a', sleeves: 'long', bottom: '#5b5b63', bottomLen: 'long', shoes: '#f0f0f0', collar: '#f4f4f4', frontLine: '#c9a54a' };

const rows: Array<[string, BodyParams, Outfit]> = [
  ['남 16 보통', { sex: 'm', age: 16, muscle: 0.3, fat: 0.25 }, base],
  ['남 16 마름', { sex: 'm', age: 16, muscle: 0.1, fat: 0.02 }, base],
  ['남 16 근육', { sex: 'm', age: 16, muscle: 0.95, fat: 0.15 }, base],
  ['남 16 통통', { sex: 'm', age: 16, muscle: 0.25, fat: 0.6 }, base],
  ['남 16 비만', { sex: 'm', age: 16, muscle: 0.2, fat: 1 }, base],
  ['여 16 보통', { sex: 'f', age: 16, muscle: 0.2, fat: 0.3 }, base],
  ['여 16 통통', { sex: 'f', age: 16, muscle: 0.2, fat: 0.7 }, base],
  ['남 16 교복', { sex: 'm', age: 16, muscle: 0.3, fat: 0.25 }, school],
  ['남 35 배나옴', { sex: 'm', age: 35, muscle: 0.4, fat: 0.75 }, base],
  ['여 45 보통', { sex: 'f', age: 45, muscle: 0.2, fat: 0.45 }, base],
  ['남 78 할아버지', { sex: 'm', age: 78, muscle: 0.05, fat: 0.2 }, base],
  ['남 9 아이', { sex: 'm', age: 9, muscle: 0.1, fat: 0.3 }, base],
];
const cols: Array<[View, 0 | 1 | 2 | 3]> = [['down', 0], ['down', 1], ['right', 0], ['right', 1], ['right', 3], ['up', 0], ['left', 1]];

const W = cols.length * FRAME_W * SCALE;
const Hh = rows.length * FRAME_H * SCALE;
const png = new PNG({ width: W, height: Hh });
for (let i = 0; i < png.data.length; i += 4) (png.data[i] = 236), (png.data[i + 1] = 230), (png.data[i + 2] = 218), (png.data[i + 3] = 255);
rows.forEach(([, p, o], r) => {
  cols.forEach(([v, f], c) => {
    const px = paint(p, o, v, f);
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const s = (y * FRAME_W + x) * 4;
        if (!px[s + 3]) continue;
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const X = (c * FRAME_W + x) * SCALE + dx;
            const Y = (r * FRAME_H + y) * SCALE + dy;
            const d = (Y * W + X) * 4;
            png.data[d] = px[s]!;
            png.data[d + 1] = px[s + 1]!;
            png.data[d + 2] = px[s + 2]!;
            png.data[d + 3] = 255;
          }
        }
      }
    }
  });
});
const out = process.argv[2] ?? 'body-preview.png';
writeFileSync(out, PNG.sync.write(png));
console.log(out, rows.map((r) => r[0]).join(' / '));
