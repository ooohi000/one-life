/**
 * 해상도·합성 비교 화면:  http://localhost:5173/?view=sprite-test
 *
 * src/ui/art/chars/**\/body/<몸 id>/idle.png 가 있는 폴더마다 한 묶음씩 세운다.
 *   - 윗줄 "게임 크기": 지금 게임처럼 키 32(세계)로 맞춤 → 배경과 도트 밀도가 같은지/다른지
 *   - 아랫줄 "원본 도트": 그림 1도트 = 화면 1도트 → 그 해상도로 갈 때의 디테일 (대신 배경보다 큼)
 *   - 몸만 / 옷 합성 둘 다
 * 시험 그림 넣는 곳: chars/lab/res32/, chars/lab/res64/, chars/lab/res48/ … (폴더 안 구조는 chars/layers와 같다)
 * 조작: 1·2·3 = 화면 배율 1×·2×·4×, 방향키 = 이동
 */
import Phaser from 'phaser';
import { ART, hasArt, preloadArt, ZOOM } from './art';
import { composeSheet, SKIN_TONES, type CharacterLook } from './character';
import { fmtProportions, proportions } from './character/measure';
import { FONT, TEXT_RES, Walker } from './common';
import type { Look } from './pixel';

export const SPRITE_TEST_VIEW = { w: 480, h: 270 };

interface Group {
  root: string;
  look: CharacterLook;
  bodyOnly: CharacterLook;
  hasWalk: boolean;
}

/** 시험 묶음 찾기: ".../body/<id>/idle" 가 있는 폴더 */
function groups(): Group[] {
  const out: Group[] = [];
  for (const k of [...ART.keys()].sort()) {
    const m = k.match(/^(chars\/.+)\/body\/([^/]+)\/idle$/);
    if (!m) continue;
    const root = m[1]!;
    const [sex, age, ...rest] = m[2]!.split('-');
    const first = (kind: string) => [...ART.keys()].sort().map((x) => x.match(new RegExp(`^${root}/${kind}/([^/]+)/idle$`))?.[1]).find(Boolean);
    const body = { sex: sex as 'm' | 'f', age: age as CharacterLook['body']['age'], build: rest.join('-') };
    const look: CharacterLook = {
      body, top: first('top'), bottom: first('bottom'), shoes: first('shoes'), outer: first('outer'), hair: first('hair'), face: first('face'),
    };
    out.push({ root, look, bodyOnly: { body }, hasWalk: hasArt(`${root}/body/${m[2]}/walk`) });
  }
  return out;
}

export class SpriteTestScene extends Phaser.Scene {
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private walkers: Array<{ w: Walker; x0: number; x1: number; v: number }> = [];

  constructor() {
    super('sprite-test');
  }

  preload() {
    preloadArt(this);
  }

  create() {
    const gs = groups();
    const colW = 150;
    const W = Math.max(SPRITE_TEST_VIEW.w, 20 + colW * (gs.length + 1) + 170);
    const H = SPRITE_TEST_VIEW.h;
    this.cameras.main.setBounds(0, 0, W, H).setZoom(ZOOM).centerOn(SPRITE_TEST_VIEW.w / 2, SPRITE_TEST_VIEW.h / 2);
    this.cameras.main.setBackgroundColor('#2a2f36');

    // 바닥: 실제 게임 타일 (도트 밀도 비교 기준)
    const tiles = ['tiles/sidewalk', 'tiles/brick', 'tiles/asphalt'];
    for (let y = 0; y < H; y += 24) for (let x = 0; x < W; x += 24) {
      const t = tiles[Math.floor(y / 96) % tiles.length]!;
      if (hasArt(t)) this.add.image(x + 12, y + 12, t).setDisplaySize(24, 24).setDepth(0);
    }
    if (hasArt('buildings/villa')) this.add.image(W - 10, 214, 'buildings/villa').setOrigin(1, 1).setScale(150 / 480).setDepth(214);

    const label = (x: number, y: number, s: string, size = 6) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', resolution: TEXT_RES, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 2, y: 1 } }).setDepth(10_000);

    label(6, 4, '게임 크기 (키 32) — 배경과 도트 밀도 비교', 7);
    label(6, 136, '원본 도트 (그림 1도트 = 화면 1도트)', 7);
    label(330, 4, '1·2·3: 배율 1×·2×·4×   방향키: 이동', 6);
    label(6, 224, '피부색 6단계 (팔레트 교체 — 속옷·신발은 그대로여야 한다)', 6);

    // 기존 통짜 시트 (비교 기준)
    let x = 20;
    if (hasArt('chars/player_school')) {
      label(x, 16, '기존 player_school (32×64)');
      const src = this.textures.get('chars/player_school').getSourceImage() as HTMLImageElement;
      const fh = src.height / 4;
      const fw = src.width / 4;
      const tex = this.textures.get('chars/player_school');
      if (!tex.has('0')) for (let i = 0; i < 16; i++) tex.add(String(i), 0, (i % 4) * fw, Math.floor(i / 4) * fh, fw, fh);
      [0, 4, 8, 12].forEach((f, i) => {
        this.add.image(x + 8 + i * 20, 80, 'chars/player_school', String(f)).setOrigin(0.5, 1).setScale(32 / fh).setDepth(80);
        this.add.image(x + 2 + 8 + i * 20, 214, 'chars/player_school', String(f)).setOrigin(0.5, 1).setScale(1 / ZOOM).setDepth(214);
      });
      x += colW;
    }

    for (const g of gs) {
      const full = composeSheet(this, g.look, { root: g.root, actions: ['idle'] });
      const bare = composeSheet(this, g.bodyOnly, { root: g.root, actions: ['idle'] });
      if (!full || !bare) continue;
      const k = 32 / full.frameH;
      label(x, 16, `${g.root.replace('chars/', '')} (${full.frameW}×${full.frameH})${full.missing.length ? ' 빠진 층 ' + full.missing.join(',') : ''}`);
      [0, 4, 8, 12].forEach((f, i) => {
        // 위: 몸만 / 합성, 게임 크기
        this.add.image(x + 8 + i * 20, 80, bare.key, String(f)).setOrigin(0.5, 1).setScale(k).setDepth(80);
        this.add.image(x + 8 + i * 20, 126, full.key, String(f)).setOrigin(0.5, 1).setScale(k).setDepth(126);
        // 아래: 원본 도트
        const nat = 1 / ZOOM;
        this.add.image(x + full.frameW * nat / 2 + 2 + i * (full.frameW * nat + 4), 214, full.key, String(f)).setOrigin(0.5, 1).setScale(nat).setDepth(214);
      });
      label(x, 84, '↑ 몸만   ↓ 옷 합성', 5);
      // 비율 (정면 정지 칸) — 0-A·0-B가 같은 디자인인지
      const src = this.textures.get(`${g.root}/body/${g.look.body.sex}-${g.look.body.age}-${g.look.body.build}/idle`).getSourceImage() as HTMLImageElement;
      const cv = document.createElement('canvas');
      cv.width = full.frameW;
      cv.height = full.frameH;
      const cg = cv.getContext('2d')!;
      cg.drawImage(src, 0, 0, full.frameW, full.frameH, 0, 0, full.frameW, full.frameH);
      const al = cg.getImageData(0, 0, full.frameW, full.frameH).data.filter((_, i) => i % 4 === 3);
      const pr = proportions(al, full.frameW, full.frameH);
      if (pr) {
        label(x, 26, fmtProportions(pr), 4);
        console.info(`[sprite-test] ${g.root} ${fmtProportions(pr)}`);
      }
      // 피부색 (몸 + 옷, 정면)
      SKIN_TONES.forEach((tone, i) => {
        const t = composeSheet(this, { ...g.look, body: { ...g.look.body, skin: tone } }, { root: g.root, actions: ['idle'] });
        if (t) this.add.image(x + 8 + i * 20, 266, t.key, '0').setOrigin(0.5, 1).setScale(k).setDepth(266);
      });
      // 걷기 그림이 있으면 걸려 본다
      if (g.hasWalk) {
        const walk = composeSheet(this, g.look, { root: g.root, actions: ['walk'] });
        if (walk) {
          const dummy: Look = { skin: '#000', hair: '#000', top: '#000', bottom: '#000', shoes: '#000', outfit: 1 };
          const w = new Walker(this, dummy, x + 10, 146, walk.key);
          this.walkers.push({ w, x0: x + 10, x1: x + colW - 30, v: 0.03 });
          label(x + 90, 128, '걷기', 5);
        }
      }
      x += colW;
    }
    if (!gs.length) label(20, 60, 'chars/…/body/<id>/idle.png 시험 그림이 아직 없다', 7);

    this.keys = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    kb.on('keydown-ONE', () => this.cameras.main.setZoom(1));
    kb.on('keydown-TWO', () => this.cameras.main.setZoom(2));
    kb.on('keydown-THREE', () => this.cameras.main.setZoom(4));
    if (import.meta.env.DEV) Object.assign(window, { spriteTest: this });
  }

  update(_t: number, dt: number) {
    const cam = this.cameras.main;
    const sp = (0.25 * dt) / cam.zoom;
    if (this.keys.left.isDown) cam.scrollX -= sp;
    if (this.keys.right.isDown) cam.scrollX += sp;
    if (this.keys.up.isDown) cam.scrollY -= sp;
    if (this.keys.down.isDown) cam.scrollY += sp;
    for (const a of this.walkers) {
      let nx = a.w.x + a.v * dt;
      if (nx > a.x1 || nx < a.x0) (a.v = -a.v, (nx = a.w.x + a.v * dt));
      a.w.moveTo(nx, a.w.y);
      a.w.update(dt);
    }
  }
}

