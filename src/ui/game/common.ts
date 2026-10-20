import Phaser from 'phaser';
import { hasArt, sheetFrames } from './art';
import { drawPerson, drawUmbrella, type Dir, type Look } from './pixel';

export const FONT = '"Pretendard Variable", Pretendard, sans-serif';
/** 게임 안 글씨 해상도 (캔버스가 2배라 글씨도 곱게) */
export const TEXT_RES = 4;

/** 캔버스를 텍스처로 (이미 있으면 그대로) */
export function ensureTexture(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
}

const lookKey = (l: Look) => [l.skin, l.hair, l.top, l.bottom, l.shoes, l.outfit, l.hairLen ?? 0, l.backpack ?? '', l.vest ?? '', l.wet ? 1 : 0].join('|');

/** 걷는 사람 하나: 방향·걸음 프레임을 알아서 바꾼다 */
export class Walker {
  readonly img: Phaser.GameObjects.Image;
  dir: Dir = 'down';
  moving = false;
  private t = 0;
  private key = '';
  umbrella: Phaser.GameObjects.Image | null = null;
  /** 그림 파일 캐릭터 시트 (4×4: 행=아래·왼·오른·위, 열=서기·걸음1·서기·걸음2). 없으면 코드 도트 */
  sheet: string | null = null;

  constructor(private readonly scene: Phaser.Scene, public look: Look, x: number, y: number, sheet?: string | null) {
    if (sheet && hasArt(sheet) && scene.textures.exists(sheet)) this.sheet = sheet;
    if (this.sheet) {
      const k = sheetFrames(scene, this.sheet);
      this.img = scene.add.image(x, y, this.sheet, '0').setOrigin(0.5, 1).setScale(k);
    } else this.img = scene.add.image(x, y, this.texture(0)).setOrigin(0.5, 1);
  }

  /** 키 (그림이 있으면 그림 높이) */
  get height() {
    return this.sheet ? 32 : 24;
  }

  get x() {
    return this.img.x;
  }
  get y() {
    return this.img.y;
  }

  setLook(look: Look) {
    this.look = look;
    this.key = '';
  }

  private texture(frame: 0 | 1 | 2): string {
    const base = `p:${lookKey(this.look)}`;
    return ensureTexture(this.scene, `${base}:${this.dir}:${frame}`, () => drawPerson(this.look, this.dir, frame));
  }

  /** 우산을 펴 든다 / 접는다 */
  holdUmbrella(color: string | null) {
    if (!color) {
      this.umbrella?.destroy();
      this.umbrella = null;
      return;
    }
    if (this.umbrella) return;
    const key = hasArt('street/umbrella') ? 'street/umbrella' : ensureTexture(this.scene, `umb:${color}`, () => drawUmbrella(color));
    this.umbrella = this.scene.add.image(this.x, this.y, key).setOrigin(0.5, 1);
  }

  /** 다음 위치로 (방향은 움직인 쪽으로) */
  moveTo(x: number, y: number) {
    const dx = x - this.img.x;
    const dy = y - this.img.y;
    this.moving = Math.abs(dx) + Math.abs(dy) > 0.01;
    if (this.moving) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    this.img.setPosition(x, y);
  }

  update(dt: number) {
    if (this.moving) this.t += dt;
    else this.t = 0;
    const step = Math.floor(this.t / 140) % 4;
    if (this.sheet) {
      const row = { down: 0, left: 1, right: 2, up: 3 }[this.dir];
      const col = this.moving ? [1, 2, 3, 0][step]! : 0;
      const k = `${row}:${col}`;
      if (k !== this.key) {
        this.img.setFrame(String(row * 4 + col));
        this.key = k;
      }
      if (this.look.wet) this.img.setTint(0xb4bed2);
      else this.img.clearTint();
    } else {
      const seq: Array<0 | 1 | 2> = [1, 0, 2, 0];
      const k = this.texture(this.moving ? seq[step]! : 0);
      if (k !== this.key) {
        this.img.setTexture(k);
        this.key = k;
      }
    }
    this.img.setDepth(this.img.y);
    if (this.umbrella) this.umbrella.setPosition(this.x, this.y - this.height + 7).setDepth(this.img.y + 0.5);
  }

  destroy() {
    this.img.destroy();
    this.umbrella?.destroy();
  }
}

/** 머리 위 말풍선 */
export function bubble(scene: Phaser.Scene, x: number, y: number, text: string, ms = 2600): Phaser.GameObjects.Container {
  const t = scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: '7px', fontStyle: '600', resolution: TEXT_RES, color: '#1b1b1b', wordWrap: { width: 120, useAdvancedWrap: true } }).setOrigin(0.5, 1);
  const w = Math.ceil(t.width) + 6;
  const h = Math.ceil(t.height) + 4;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff, 1).fillRect(-w / 2, -h - 1, w, h);
  g.lineStyle(1, 0x1b1b1b, 1).strokeRect(-w / 2 + 0.5, -h - 0.5, w - 1, h);
  g.fillStyle(0xffffff, 1).fillRect(-2, -1, 4, 2);
  t.setPosition(0, -3);
  const c = scene.add.container(Math.round(x), Math.round(y), [g, t]).setDepth(10_000);
  scene.time.delayedCall(ms, () => c.destroy());
  return c;
}

/** 키보드: 방향키 + WASD + E·스페이스 */
export function makeKeys(scene: Phaser.Scene) {
  const k = scene.input.keyboard!;
  return {
    cur: k.createCursorKeys(),
    wasd: k.addKeys('W,A,S,D', false) as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>,
    act: k.addKey('E', false),
    space: k.addKey('SPACE', false),
  };
}

export function axis(keys: ReturnType<typeof makeKeys>): { x: number; y: number } {
  const { cur, wasd } = keys;
  const x = (cur.left.isDown || wasd.A.isDown ? -1 : 0) + (cur.right.isDown || wasd.D.isDown ? 1 : 0);
  const y = (cur.up.isDown || wasd.W.isDown ? -1 : 0) + (cur.down.isDown || wasd.S.isDown ? 1 : 0);
  return { x, y };
}

export const hex = (s: string) => parseInt(s.slice(1), 16);
