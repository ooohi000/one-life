import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FRAME_H, FRAME_W, sheet, type BodyParams, type Outfit } from '../src/ui/game/bodygen';
const S = 6;
const gray: Outfit = { skin: '#b8b8be', top: '#9a9aa2', sleeves: 'short', bottom: '#7d7d86', bottomLen: 'short', shoes: '#5a5a62', socks: '#a8a8b0' };
const bodies: Array<[string, BodyParams]> = [
  ['m-thin', { sex: 'm', age: 16, muscle: 0.1, fat: 0.02 }],
  ['m-avg', { sex: 'm', age: 16, muscle: 0.3, fat: 0.25 }],
  ['m-muscle', { sex: 'm', age: 16, muscle: 0.95, fat: 0.15 }],
  ['m-chubby', { sex: 'm', age: 16, muscle: 0.25, fat: 0.6 }],
  ['m-obese', { sex: 'm', age: 16, muscle: 0.2, fat: 1 }],
];
for (const [name, p] of bodies) {
  const px = sheet(p, gray, false);
  const W = FRAME_W * 4, H = FRAME_H * 4;
  const png = new PNG({ width: W * S, height: H * S });
  for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
    const s = (Math.floor(y / S) * W + Math.floor(x / S)) * 4;
    const d = (y * W * S + x) * 4;
    const a = px[s + 3]!;
    png.data[d] = a ? px[s]! : 255; png.data[d + 1] = a ? px[s + 1]! : 255; png.data[d + 2] = a ? px[s + 2]! : 255; png.data[d + 3] = 255;
  }
  writeFileSync(`/tmp/claude-0/guide-${name}.png`, PNG.sync.write(png));
}
console.log('ok');
