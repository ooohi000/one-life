/**
 * bodygen 방식 층 시험: 코드로 만든 몸 + 회색 티셔츠·반바지·신발을 층별 PNG로 뽑는다.
 *   npm run sim:layers
 * → src/ui/art/chars/lab/bodygen/<층>/<id>/{idle,walk}.png
 * (lab 폴더는 해상도·합성 비교 화면 ?view=sprite-test 에서만 쓴다. 게임 주인공에는 안 쓴다)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { FRAME_H, FRAME_W, paintLayer, type GenLayer, type Outfit, type View } from '../src/ui/game/bodygen';

const ROOT = 'src/ui/art/chars/lab/bodygen';
const p = { sex: 'm' as const, age: 16, muscle: 0.3, fat: 0.25 };
const o: Outfit = { skin: '#efc29b', top: '#a7a9b0', sleeves: 'short', bottom: '#6d717c', bottomLen: 'short', shoes: '#2b2b31' };
const VIEWS: View[] = ['down', 'left', 'right', 'up'];
const LAYERS: Array<[GenLayer, string]> = [
  ['body', 'm-teen-average'],
  ['top', 'gray-tshirt'],
  ['bottom', 'gray-shorts'],
  ['shoes', 'sneakers-black'],
];

function write(path: string, cols: number, rows: number, frame: (col: number, row: number) => Uint8ClampedArray) {
  const png = new PNG({ width: FRAME_W * cols, height: FRAME_H * rows });
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const f = frame(c, r);
      for (let y = 0; y < FRAME_H; y++) {
        const dst = ((r * FRAME_H + y) * FRAME_W * cols + c * FRAME_W) * 4;
        png.data.set(f.subarray(y * FRAME_W * 4, (y + 1) * FRAME_W * 4), dst);
      }
    }
  writeFileSync(path, PNG.sync.write(png));
}

for (const [layer, id] of LAYERS) {
  const dir = `${ROOT}/${layer}/${id}`;
  mkdirSync(dir, { recursive: true });
  write(`${dir}/idle.png`, 4, 1, (c) => paintLayer(p, o, layer, VIEWS[c]!, 0));
  write(`${dir}/walk.png`, 4, 4, (c, r) => paintLayer(p, o, layer, VIEWS[r]!, c as 0 | 1 | 2 | 3));
  console.log(dir);
}
