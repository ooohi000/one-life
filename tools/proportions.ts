// 시트(1줄×4칸) 실루엣 비율: npx tsx tools/proportions.ts 시트.png ...
import { readFileSync } from 'node:fs'; import { PNG } from 'pngjs'; import { proportions, fmtProportions } from '../src/ui/game/character/measure';
for (const p of process.argv.slice(2)) { const png = PNG.sync.read(readFileSync(p)); const fw = png.width / 4; const names=['정면','왼','오른','뒤'];
  for (let c = 0; c < 4; c++) { const a: number[] = []; for (let y = 0; y < png.height; y++) for (let x = 0; x < fw; x++) a.push(png.data[(y * png.width + c * fw + x) * 4 + 3]!);
    const r = proportions(a, fw, png.height); console.log(p.split('/').pop(), names[c], r ? fmtProportions(r) : '-'); } }
