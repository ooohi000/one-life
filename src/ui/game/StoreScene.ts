/**
 * 편의점 안. 위에서 내려다본 도트 매장.
 * 손님은 엔진(ConvenienceShift)의 queue를 그대로 따라 그린다 — 들어와서 진열대를 둘러보고, 줄을 서고, 기다리다 지치면 나간다.
 * 주인공은 직접 걸어서 계산대·진열대·쏟은 자리로 가 E를 누른다. 실제 손놀림은 React 쪽 미니게임.
 */
import Phaser from 'phaser';
import type { Customer, Product, Task } from '../../engine/work';
import { session } from '../session';
import { axis, bubble, FONT, hex, makeKeys, Walker } from './common';
import { hasArt, pickArt, preloadArt } from './art';
import { lookFor, type Look } from './pixel';

const W = 320;
const H = 192;
const SPEED = 72;

type Rect = { x: number; y: number; w: number; h: number };
/** 사람이 못 지나가는 곳 */
const SOLID: Rect[] = [
  { x: 0, y: 0, w: W, h: 40 }, // 윗벽·냉장고·도시락 진열대
  { x: 0, y: 0, w: 10, h: H },
  { x: W - 10, y: 0, w: 10, h: H },
  { x: 0, y: 178, w: W, h: 14 }, // 아랫벽
  { x: 56, y: 72, w: 80, h: 22 }, // 과자 매대
  { x: 168, y: 72, w: 80, h: 22 }, // 생활용품 매대
  { x: 10, y: 132, w: 102, h: 16 }, // 계산대
];

type Shelf = Product['shelf'];
/** 일하는 자리 (여기 서서 E) */
const STATION: Record<'pos' | Shelf, { x: number; y: number; label: string }> = {
  pos: { x: 56, y: 162, label: '계산' },
  drink: { x: 88, y: 50, label: '음료 냉장고' },
  food: { x: 208, y: 50, label: '도시락·김밥' },
  snack: { x: 96, y: 106, label: '과자 매대' },
  daily: { x: 208, y: 106, label: '생활용품' },
  counter: { x: 30, y: 166, label: '담배·계산대 앞' },
};
const BROWSE: Record<Shelf, { x: number; y: number; top: boolean }> = {
  drink: { x: 88, y: 54, top: true },
  food: { x: 208, y: 54, top: true },
  snack: { x: 96, y: 108, top: false },
  daily: { x: 208, y: 108, top: false },
  counter: { x: 140, y: 120, top: false },
};
const DOOR = { x: 288, y: 190 };
const LANE = 120;
const slot = (i: number) => ({ x: 56 + i * 15, y: 124 });

interface Shopper {
  c: Customer;
  w: Walker;
  path: Array<{ x: number; y: number }>;
  state: 'enter' | 'browse' | 'queue' | 'leave';
  wait: number;
  tag: Phaser.GameObjects.Text | null;
}

export class StoreScene extends Phaser.Scene {
  private me!: Walker;
  private keys!: ReturnType<typeof makeKeys>;
  private shoppers = new Map<number, Shopper>();
  private spills = new Map<string, { x: number; y: number; g: Phaser.GameObjects.Graphics }>();
  private marks!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private windows: Phaser.GameObjects.Graphics | null = null;
  private rain: Array<{ x: number; y: number }> = [];
  private seen = 0;
  private outfit: Look['outfit'] = 1;

  constructor() {
    super('store');
  }

  preload() {
    preloadArt(this);
  }

  create() {
    const s = session.shift!;
    const w = session.w!;
    this.outfit = w.today.outfit;
    // 매장 그림이 있으면 통째로 깔고, 없으면 코드로 그린다 (부딪히는 곳·일하는 자리는 그대로)
    if (hasArt('scenes/store')) this.add.image(0, 0, 'scenes/store').setOrigin(0).setDisplaySize(W, H).setDepth(0);
    else this.drawRoom();
    const look: Look = {
      skin: '#f1c9a5', hair: '#1d1a1a', top: '#f2f2f2', bottom: '#2a3550', shoes: '#222',
      outfit: Math.min(this.outfit, 1) as Look['outfit'], vest: '#2f7d4f', hairLen: 0,
    };
    this.me = new Walker(this, look, STATION.pos.x, STATION.pos.y, 'chars/player_work');
    this.keys = makeKeys(this);
    this.marks = this.add.graphics().setDepth(9_000);
    this.hint = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', backgroundColor: '#1b1b1bcc', padding: { x: 2, y: 1 } }).setOrigin(0.5, 1).setDepth(9_500);
    this.keys.act.on('down', () => this.interact());
    this.keys.space.on('down', () => this.interact());
    for (let i = 0; i < 18; i++) this.rain.push({ x: Math.random() * 120, y: Math.random() * 16 });
    this.seen = s.report.events.length;
  }

  // ───────── 매장 그리기 ─────────
  private drawRoom() {
    const g = this.add.graphics().setDepth(0);
    // 바닥 타일
    for (let y = 24; y < 178; y += 8) for (let x = 0; x < W; x += 8) g.fillStyle(((x + y) / 8) % 2 ? 0xe9e4d8 : 0xdfd9cb, 1).fillRect(x, y, 8, 8);
    // 벽
    g.fillStyle(0x58606e, 1).fillRect(0, 0, W, 16);
    g.fillStyle(0x6c7482, 1).fillRect(0, 16, W, 8);
    g.fillStyle(0x58606e, 1).fillRect(0, 0, 10, H).fillRect(W - 10, 0, 10, H);
    g.fillStyle(0x4a515d, 1).fillRect(0, 178, W, 14);
    // 창고 문
    g.fillStyle(0x8b6b4a, 1).fillRect(264, 6, 30, 18);
    g.fillStyle(0xd9d9d9, 1).fillRect(268, 10, 22, 5);
    // 음료 냉장고 (유리문)
    const f = this.add.graphics().setDepth(40);
    f.fillStyle(0xbfc7cf, 1).fillRect(20, 14, 136, 28);
    for (let i = 0; i < 8; i++) {
      const x = 22 + i * 17;
      f.fillStyle(0x9fd3ec, 1).fillRect(x, 16, 15, 22);
      const cols = [0xd62828, 0x6b4226, 0x2f6fd1, 0x7cff4f, 0xd4a017, 0x3c9a5f];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) f.fillStyle(cols[(i + r + k) % cols.length]!, 1).fillRect(x + 1 + k * 3.5, 18 + r * 7, 2, 4);
      f.fillStyle(0xffffff, 0.35).fillRect(x + 1, 16, 1, 22);
    }
    // 도시락·김밥 오픈 냉장 진열대
    f.fillStyle(0xcfd6dc, 1).fillRect(166, 16, 84, 26);
    f.fillStyle(0x555a60, 1).fillRect(166, 16, 84, 4);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) f.fillStyle([0xf4f1e8, 0x222222, 0xe64a2e, 0xf0d9a0][(r + k) % 4]!, 1).fillRect(170 + k * 8, 22 + r * 6, 6, 4);
    // 매대 두 개
    for (const [x, colA, colB] of [[56, 0xf2c230, 0xd9472b], [168, 0x8fb3d9, 0x444444]] as const) {
      const m = this.add.graphics().setDepth(94);
      m.fillStyle(0x9a7b55, 1).fillRect(x, 72, 80, 22);
      m.fillStyle(0xb8966a, 1).fillRect(x, 72, 80, 4);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 12; k++) m.fillStyle((k + r) % 2 ? colA : colB, 1).fillRect(x + 3 + k * 6.3, 78 + r * 7, 4, 5);
    }
    // 계산대
    const c = this.add.graphics().setDepth(148);
    c.fillStyle(0x6b4f36, 1).fillRect(10, 132, 102, 16);
    c.fillStyle(0x8a6a4a, 1).fillRect(10, 132, 102, 5);
    c.fillStyle(0x2b2b2b, 1).fillRect(48, 127, 16, 8); // 포스기
    c.fillStyle(0x7fd1ff, 1).fillRect(50, 128, 12, 5);
    c.fillStyle(0x3fb6a8, 1).fillRect(86, 134, 20, 3); // 껌 진열
    // 계산대 뒤 담배 진열장
    const cig = this.add.graphics().setDepth(1);
    cig.fillStyle(0x3a3f47, 1).fillRect(12, 178, 70, 12);
    for (let k = 0; k < 16; k++) cig.fillStyle(k % 3 ? 0xececec : 0x2b4c7e, 1).fillRect(14 + k * 4.2, 180, 3, 8);
    // 문·창 (밖이 보인다)
    this.windows = this.add.graphics().setDepth(1);
    g.fillStyle(0x777f8c, 1).fillRect(272, 178, 32, 14);
    this.add.text(288, 172, '입구', { fontFamily: FONT, fontSize: '8px', color: '#555' }).setOrigin(0.5).setDepth(2);
  }

  private drawWindows(minute: number) {
    const g = this.windows;
    if (!g) return;
    g.clear();
    // 저녁 → 밤
    const t = Phaser.Math.Clamp((minute - 17.5 * 60) / 120, 0, 1);
    const dusk = session.shift?.opts.raining ? 0x7d8794 : 0xf0a46b;
    const sky = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(dusk), Phaser.Display.Color.ValueToColor(0x1d2747), 100, t * 100);
    const col = Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b);
    for (const x0 of [96, 140, 184, 228]) {
      g.fillStyle(col, 1).fillRect(x0, 181, 38, 9);
      g.fillStyle(0xffffff, 0.15).fillRect(x0, 181, 38, 2);
    }
    g.fillStyle(col, 1).fillRect(274, 180, 28, 12);
    if (session.shift?.opts.raining) {
      g.fillStyle(0xbfd9ff, 0.8);
      for (const d of this.rain) {
        d.y += 1.3;
        if (d.y > 10) d.y = 0;
        const xs = [96, 140, 184, 228, 274];
        const x = xs[Math.floor(d.x / 24) % xs.length]! + (d.x % 24);
        g.fillRect(x, 181 + d.y, 1, 2);
      }
    }
  }

  // ───────── 매 프레임 ─────────
  update(_t: number, dtMs: number) {
    const s = session.shift;
    if (!s) return;
    const dt = Math.min(dtMs, 50) / 1000;
    const busy = !!session.activity || !!s.dilemma;

    // 주인공 이동
    const a = busy ? { x: 0, y: 0 } : axis(this.keys);
    if (a.x || a.y) {
      const len = Math.hypot(a.x, a.y);
      let nx = this.me.x + (a.x / len) * SPEED * dt;
      let ny = this.me.y + (a.y / len) * SPEED * dt;
      if (this.blocked(nx, this.me.y)) nx = this.me.x;
      if (this.blocked(nx, ny)) ny = this.me.y;
      this.me.moveTo(nx, ny);
      if (!a.x && !a.y) this.me.moving = false;
    } else this.me.moving = false;
    this.me.update(dtMs);

    this.syncShoppers(dtMs, s.queue);
    this.syncSpills(s.tasks);
    this.showEvents();
    this.drawMarks(s.tasks, s.queue);
    this.drawWindows(s.minute);
  }

  private blocked(x: number, y: number): boolean {
    const r = { x: x - 4, y: y - 3, w: 8, h: 3 };
    return SOLID.some((b) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y);
  }

  // ───────── 손님 ─────────
  private syncShoppers(dtMs: number, queue: Customer[]) {
    const inQueue = new Set(queue.map((c) => c.n));
    // 새로 온 손님
    for (const c of queue) {
      if (this.shoppers.has(c.n)) continue;
      const look = lookFor(c.n, this.outfit, c.kind);
      const sheet = pickArt(c.kind === 'student' || c.visitor?.age === 16 ? 'chars/student_' : c.kind === 'elder' ? 'chars/elder_' : 'chars/adult_', c.n) ?? pickArt('chars/adult_', c.n);
      const w = new Walker(this, look, DOOR.x, DOOR.y, sheet);
      const shelf = c.items[0]?.shelf ?? 'snack';
      const b = BROWSE[shelf];
      const path = [{ x: DOOR.x, y: LANE }];
      if (b.top) path.push({ x: 152, y: LANE }, { x: 152, y: 56 }, { x: b.x, y: b.y });
      else path.push({ x: b.x, y: b.y });
      let tag: Phaser.GameObjects.Text | null = null;
      if (c.visitor) {
        tag = this.add.text(0, 0, c.visitor.name, { fontFamily: FONT, fontSize: '8px', color: c.visitor.relation === 'bully' ? '#ff8a8a' : '#ffe08a', backgroundColor: '#1b1b1baa', padding: { x: 1, y: 0 } }).setOrigin(0.5, 1).setDepth(9_100);
      }
      this.shoppers.set(c.n, { c, w, path, state: 'enter', wait: 0, tag });
      if (session.shift!.opts.raining && Math.random() < 0.7) w.look = { ...w.look, wet: Math.random() < 0.3 };
    }
    // 줄에서 빠진 손님은 나간다 (계산했거나, 지쳐서)
    for (const sh of this.shoppers.values()) {
      if (sh.state !== 'leave' && !inQueue.has(sh.c.n)) {
        sh.state = 'leave';
        sh.path = [{ x: sh.w.x, y: LANE }, { x: DOOR.x, y: LANE }, { x: DOOR.x, y: DOOR.y + 8 }];
      }
    }
    // 줄 자리
    queue.forEach((c, i) => {
      const sh = this.shoppers.get(c.n)!;
      if (sh.state === 'queue') {
        const p = slot(i);
        sh.path = [p];
      }
    });
    // 걷기
    for (const [n, sh] of this.shoppers) {
      const tgt = sh.path[0];
      if (tgt) {
        const dx = tgt.x - sh.w.x;
        const dy = tgt.y - sh.w.y;
        const d = Math.hypot(dx, dy);
        const step = (sh.state === 'leave' ? 60 : 50) * (dtMs / 1000);
        if (d <= step) {
          sh.w.moveTo(tgt.x, tgt.y);
          sh.path.shift();
        } else sh.w.moveTo(sh.w.x + (dx / d) * step, sh.w.y + (dy / d) * step);
      } else {
        sh.w.moving = false;
        if (sh.state === 'enter') {
          sh.state = 'browse';
          sh.wait = 900 + Math.random() * 900;
          sh.w.dir = 'up';
        } else if (sh.state === 'browse') {
          sh.wait -= dtMs;
          if (sh.wait <= 0) {
            sh.state = 'queue';
            const top = sh.w.y < 70;
            sh.path = top ? [{ x: 152, y: 56 }, { x: 152, y: LANE }] : [{ x: sh.w.x, y: LANE }];
            // 줄 자리는 다음 프레임에 정해진다 (경로 끝나면)
            const i = queue.findIndex((c) => c.n === n);
            if (i >= 0) sh.path.push(slot(i));
          }
        } else if (sh.state === 'queue') {
          sh.w.dir = 'left';
          const i = queue.findIndex((c) => c.n === n);
          if (i === 0) sh.w.dir = 'down';
        } else if (sh.state === 'leave') {
          sh.w.destroy();
          sh.tag?.destroy();
          this.shoppers.delete(n);
          continue;
        }
      }
      sh.w.update(dtMs);
      sh.tag?.setPosition(Math.round(sh.w.x), Math.round(sh.w.y - sh.w.height));
    }
  }

  /** 맨 앞 손님이 계산대 앞에 와 있나 */
  private frontReady(queue: Customer[]): Customer | null {
    const c = queue[0];
    if (!c) return null;
    const sh = this.shoppers.get(c.n);
    if (!sh || sh.state !== 'queue' || sh.path.length) return null;
    return c;
  }

  // ───────── 쏟은 자리 ─────────
  private syncSpills(tasks: Task[]) {
    for (const t of tasks) {
      if (t.kind !== 'clean' || this.spills.has(t.id)) continue;
      const x = 150 + Math.random() * 120;
      const y = Math.random() < 0.5 ? 60 + Math.random() * 6 : 112 + Math.random() * 40;
      const g = this.add.graphics().setDepth(2);
      g.fillStyle(0xc0712f, 0.85).fillEllipse(x, y - 2, 14, 6).fillEllipse(x + 5, y, 6, 4);
      g.fillStyle(0xe64a2e, 1).fillRect(x - 9, y - 6, 4, 5);
      this.spills.set(t.id, { x, y, g });
    }
    for (const [id, sp] of this.spills) {
      if (!tasks.some((t) => t.id === id) && session.activity?.taskId !== id) {
        sp.g.destroy();
        this.spills.delete(id);
      }
    }
  }

  // ───────── 일하는 자리 ─────────
  private placeOf(t: Task): { x: number; y: number } | null {
    if (t.kind === 'checkout') return STATION.pos;
    if (t.kind === 'clean') return this.spills.get(t.id) ?? null;
    if (t.kind === 'discard') return STATION.food;
    return t.shelf ? STATION[t.shelf] : null;
  }

  /** 지금 서 있는 곳에서 할 수 있는 일 */
  private taskHere(): Task | null {
    const s = session.shift!;
    const near = (p: { x: number; y: number }) => Math.hypot(p.x - this.me.x, p.y - this.me.y) < 15;
    if (near(STATION.pos)) {
      const c = this.frontReady(s.queue);
      const t = c && s.tasks.find((x) => x.customer === c);
      if (t) return t;
    }
    for (const t of s.tasks) {
      if (t.kind === 'checkout') continue;
      const p = this.placeOf(t);
      if (p && near(p)) return t;
    }
    return null;
  }

  private interact() {
    const s = session.shift;
    if (!s || session.activity || s.dilemma) return;
    const t = this.taskHere();
    if (!t) return;
    this.me.dir = t.kind === 'checkout' ? 'up' : this.me.dir;
    session.begin(t);
  }

  private drawMarks(tasks: Task[], queue: Customer[]) {
    const g = this.marks;
    g.clear();
    const bob = Math.sin(this.time.now / 180) * 1.5;
    const mark = (x: number, y: number, col: number) => {
      g.fillStyle(0x1b1b1b, 1).fillRect(x - 2, y - 9 + bob, 5, 9);
      g.fillStyle(col, 1).fillRect(x - 1, y - 8 + bob, 3, 5).fillRect(x - 1, y - 2 + bob, 3, 2);
    };
    for (const t of tasks) {
      if (t.kind === 'checkout') continue;
      const p = this.placeOf(t);
      if (p) mark(p.x, p.y - 26, t.kind === 'discard' ? 0xff6b6b : 0xffd34d);
    }
    if (queue.length && Math.hypot(STATION.pos.x - this.me.x, STATION.pos.y - this.me.y) > 15) mark(STATION.pos.x, 118, queue.length >= 3 ? 0xff6b6b : 0x7fd1ff);
    // 지금 여기서 할 수 있는 일
    const t = !session.activity && !session.shift?.dilemma ? this.taskHere() : null;
    if (t) {
      const label = t.kind === 'checkout' ? `[E] 계산 (${t.customer!.items.length}개)` : t.kind === 'restock' ? '[E] 채우기' : t.kind === 'discard' ? '[E] 폐기' : '[E] 닦기';
      this.hint.setText(label).setPosition(Math.round(this.me.x), Math.round(this.me.y - 26)).setVisible(true);
    } else this.hint.setVisible(false);
  }

  // ───────── 말풍선 ─────────
  private showEvents() {
    const ev = session.shift!.report.events;
    for (; this.seen < ev.length; this.seen++) {
      const e = ev[this.seen]!;
      const m = /^(.+?): "(.+)"$/.exec(e.text);
      if (!m) continue;
      const who = m[1]!;
      const line = m[2]!;
      if (who.startsWith('사장님')) {
        bubble(this, this.me.x, this.me.y - this.me.height - 2, `(전화) ${line}`, 3200);
        continue;
      }
      for (const sh of this.shoppers.values()) {
        if (who === sh.c.label || (sh.c.visitor && who.startsWith(sh.c.visitor.name))) {
          bubble(this, sh.w.x, sh.w.y - sh.w.height - 1, line);
          break;
        }
      }
    }
  }
}

export const STORE_SIZE = { w: W, h: H };
export { hex };
