/**
 * 학교 끝나고 알바 가는 길. 우리 동네 한 블록 — 집(빌라), 골목, PC방, 편의점, 공사장(도시가 변한다), 학교.
 * 계절·날씨·시간이 그대로 보인다: 벚꽃·단풍·앙상한 가지, 비·눈, 노을.
 * 우산을 챙겨 왔으면 한 손에 펴 들고, 안 챙겼으면 비를 맞는다.
 */
import Phaser from 'phaser';
import { session, isWet } from '../session';
import { axis, ensureTexture, FONT, makeKeys, TEXT_RES, Walker } from './common';
import { hasArt, pickArt, preloadArt, ZOOM } from './art';
import { lookFor, type Look } from './pixel';

const W = 780;
const H = 192;
const WALK_TOP = 128;
const WALK_BOTTOM = 150;
const SPEED = 62;

type Door = { x: number; y?: number; label: string; kind: 'home' | 'pc' | 'alley' | 'work' | 'school' };
type Rect = { x: number; y: number; w: number; h: number };
const DOORS: Door[] = [
  { x: 76, label: '[E] 집에 간다 (알바 빠짐)', kind: 'home' as const },
  { x: 232, label: '[E] PC방 간다 (알바 빠짐)', kind: 'pc' as const },
  { x: 362, label: '[E] 출근', kind: 'work' as const },
];

/** 길 배치. 그림(scenes/street.png, 480×270 한 화면)이 있으면 그 그림의 문 위치·인도에 맞춘다 */
interface Layout {
  w: number; h: number; top: number; bottom: number; start: { x: number; y: number }; doors: Door[]; bg: boolean;
  /** 배경 그림 키 */
  bgKey?: string;
  /** 화면에 보이는 크기 (세계 좌표) */
  view: { w: number; h: number };
  /** 걸을 수 있는 곳 (발 위치). 없으면 top~bottom 띠 */
  walk?: Rect[];
  /** 행인이 다니는 줄 (y) */
  lanes?: number[];
  follow: boolean;
}
const CODE_LAYOUT: Layout = { w: W, h: H, top: WALK_TOP, bottom: WALK_BOTTOM, start: { x: 600, y: 140 }, doors: DOORS, bg: false, view: { w: 320, h: 192 }, follow: true };
/**
 * 위에서 내려다본 동네 지도 (scenes/town.png, 836×470). 위치브룩·스타듀처럼 사방으로 걸어 다닌다.
 * 걸을 수 있는 곳은 그림을 보고 손으로 짚은 사각형들 — 인도·차도·골목·학교 앞 광장·빌라 현관.
 */
const TOWN_LAYOUT: Layout = {
  w: 836, h: 470, top: 0, bottom: 470, start: { x: 672, y: 212 }, bg: true, bgKey: 'scenes/town', view: { w: 480, h: 270 }, follow: true,
  walk: [
    { x: 0, y: 318, w: 836, h: 32 }, // 윗쪽 인도
    { x: 0, y: 350, w: 836, h: 46 }, // 차도 (차는 아직 없다)
    { x: 0, y: 396, w: 836, h: 18 }, // 아랫쪽 인도
    { x: 312, y: 412, w: 60, h: 58 }, // 아래로 내려가는 길
    { x: 326, y: 70, w: 42, h: 250 }, // 골목 (학교 뒤까지)
    { x: 612, y: 196, w: 92, h: 28 }, // 학교 정문 앞
    { x: 660, y: 220, w: 44, h: 100 }, // 정문에서 큰길로 내려오는 길
    { x: 68, y: 228, w: 34, h: 92 }, // 빌라 옆 샛길
    { x: 196, y: 286, w: 40, h: 34 }, // 빌라 현관 계단
  ],
  lanes: [324, 334, 344],
  doors: [
    { x: 214, y: 292, label: '[E] 집에 간다 (알바 빠짐)', kind: 'home' },
    { x: 447, y: 322, label: '[E] PC방 간다 (알바 빠짐)', kind: 'pc' },
    { x: 582, y: 326, label: '[E] 출근', kind: 'work' },
    { x: 656, y: 200, label: '학교는 끝났다', kind: 'school' },
  ],
};
const ART_LAYOUT: Layout = {
  w: 480, h: 270, top: 209, bottom: 225, start: { x: 462, y: 217 }, bg: true, bgKey: 'scenes/street', view: { w: 480, h: 270 }, follow: false,
  doors: [
    { x: 80, label: '[E] 집에 간다 (알바 빠짐)', kind: 'home' },
    { x: 197, label: '[E] 골목으로 샌다 (알바 빠짐)', kind: 'alley' },
    { x: 280, label: '[E] PC방 간다 (알바 빠짐)', kind: 'pc' },
    { x: 398, label: '[E] 출근', kind: 'work' },
  ],
};
export const streetLayout = (): Layout => (hasArt('scenes/town') ? TOWN_LAYOUT : hasArt('scenes/street') ? ART_LAYOUT : CODE_LAYOUT);

export class StreetScene extends Phaser.Scene {
  private me!: Walker;
  private keys!: ReturnType<typeof makeKeys>;
  private sky!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private drops: Array<{ x: number; y: number; s: number }> = [];
  private walkers: Array<{ w: Walker; vx: number }> = [];
  private cars: Array<{ g: Phaser.GameObjects.Graphics; vx: number }> = [];
  private wetTimer = 0;
  private soaked = false;
  private started = 0;
  private gone = false;
  private L: Layout = CODE_LAYOUT;
  private note: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('street');
  }

  preload() {
    preloadArt(this);
  }

  create() {
    const w = session.w!;
    const today = w.today;
    this.started = this.time.now;
    this.L = streetLayout();
    const L = this.L;
    if (import.meta.env.DEV) Object.assign(window, { street: this });
    this.cameras.main.setBounds(0, 0, L.w, L.h).setZoom(ZOOM);
    this.sky = this.add.graphics().setDepth(-10);
    if (L.bg) {
      this.add.image(0, 0, L.bgKey!).setOrigin(0).setDepth(0);
      // 그림은 맑은 저녁이다 — 흐리거나 비·눈 오면 어둡게 덮는다
      const dim = today.sky === 'clear' ? 0 : today.sky === 'cloudy' ? 0.18 : 0.32;
      if (dim) this.add.graphics().setDepth(15_000).fillStyle(0x1e2638, dim + 0.1).fillRect(0, 0, L.w, L.h);
      if (today.notes[0]) this.note = this.add.text(0, 0, today.notes[0], { fontFamily: FONT, fontSize: '7px', fontStyle: '600', resolution: TEXT_RES, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } }).setOrigin(0.5, 0).setDepth(20_002);
    } else this.drawStreet();
    const look: Look = { skin: '#f1c9a5', hair: '#1d1a1a', top: today.outfit >= 3 ? '#1f2d4a' : '#f2f2f2', bottom: '#2a3550', shoes: '#222', outfit: today.outfit, backpack: '#2b2b2b' };
    if (today.outfit === 4) look.top = '#1b1b1b';
    // 날씨에 맞는 옷 그림이 아직 없으면 교복 그림으로
    const sheet = [today.outfit === 0 ? 'chars/player_summer' : today.outfit <= 2 ? 'chars/player_school' : 'chars/player_winter', 'chars/player_school'].find(hasArt);
    this.me = new Walker(this, look, L.start.x, L.start.y, sheet);
    this.me.dir = 'left';
    if (L.follow) this.cameras.main.startFollow(this.me.img, true, 0.12, 0.12);
    else this.cameras.main.centerOn(L.w / 2, L.h / 2);
    this.keys = makeKeys(this);
    this.keys.act.on('down', () => this.interact());
    this.keys.space.on('down', () => this.interact());
    this.fx = this.add.graphics().setDepth(20_000);
    this.hint = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '7px', fontStyle: '600', resolution: TEXT_RES, color: '#ffffff', backgroundColor: '#1b1b1bcc', padding: { x: 2, y: 1 } }).setOrigin(0.5, 1).setDepth(20_001);
    const wet = isWet(today);
    const n = today.sky === 'typhoon' ? 160 : today.sky === 'monsoon' ? 120 : today.sky === 'snow' ? 70 : 80;
    if (wet) for (let i = 0; i < n; i++) this.drops.push({ x: Math.random() * L.view.w, y: Math.random() * L.view.h, s: 0.6 + Math.random() * 0.6 });
    // 지나가는 사람들 (비 오면 대부분 우산)
    for (let i = 0; i < 6; i++) {
      const kind = i % 2 ? 'student' : 'worker';
      const p = new Walker(this, lookFor(i * 31 + w.day, today.outfit, kind), Math.random() * L.w, L.lanes ? L.lanes[i % L.lanes.length]! : L.top + 2 + Math.random() * (L.bottom - L.top - 2), pickArt(kind === 'student' ? 'chars/student_' : 'chars/adult_', i));
      if (wet && today.sky !== 'snow' && Math.random() < 0.85) p.holdUmbrella(['#2f6fd1', '#d62828', '#3a3a3a', '#f2c230', '#8fb3d9'][i % 5]!);
      this.walkers.push({ w: p, vx: (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 16) });
    }
    // 우산: 챙겨 왔으면 편다
    if (wet && today.sky !== 'snow' && session.hasUmbrella()) this.me.holdUmbrella('#2f7d4f');
  }

  /** 그림 파일이 있으면 아랫변 가운데를 (cx, bottom)에 맞춰 width 폭으로 놓는다 */
  private art(key: string, cx: number, bottom: number, width: number, depth = 10): boolean {
    if (!hasArt(key)) return false;
    const img = this.add.image(cx, bottom, key).setOrigin(0.5, 1).setDepth(depth);
    img.setScale(width / img.width);
    return true;
  }

  private drawStreet() {
    const w = session.w!;
    const today = w.today;
    const m = today.date.month;
    const g = this.add.graphics().setDepth(0);
    // 먼 건물 실루엣
    g.fillStyle(0x8792a3, 0.55);
    for (let x = 0; x < W; x += 34) g.fillRect(x, 40 + ((x * 7) % 30), 30, 80);
    // 인도·차도 (바닥 타일 그림이 있으면 깐다)
    if (hasArt('street/sidewalk')) this.add.tileSprite(0, 120, W, 35, 'street/sidewalk').setOrigin(0).setDepth(1);
    if (hasArt('street/road')) this.add.tileSprite(0, 155, W, 37, 'street/road').setOrigin(0).setDepth(1);
    g.fillStyle(0xb9b3a8, 1).fillRect(0, 120, W, 34);
    for (let x = 0; x < W; x += 12) g.fillStyle(0xa9a398, 1).fillRect(x, 120, 1, 34);
    g.fillStyle(0x8a8378, 1).fillRect(0, 152, W, 3);
    g.fillStyle(0x3e4249, 1).fillRect(0, 155, W, 37);
    for (let x = 0; x < W; x += 28) g.fillStyle(0xe6e6e6, 1).fillRect(x, 172, 14, 2);
    if (isWet(today) && today.sky !== 'snow') for (let x = 20; x < W; x += 97) g.fillStyle(0x9fb4c8, 0.5).fillEllipse(x, 140 + (x % 9), 18, 4);
    if (today.sky === 'snow') g.fillStyle(0xffffff, 0.8).fillRect(0, 120, W, 2);

    const b = this.add.graphics().setDepth(10);
    const label = (x: number, y: number, t: string, col = '#ffffff', bg = '#00000000') => this.add.text(x, y, t, { fontFamily: FONT, fontSize: '7px', fontStyle: '600', resolution: TEXT_RES, color: col, backgroundColor: bg, padding: { x: 2, y: 1 } }).setOrigin(0.5).setDepth(11);
    // 집 — 빌라
    if (this.art('street/villa', 76, 122, 124)) label(76, 24, '우리 집', '#ffffff', '#00000088');
    else {
    b.fillStyle(0xc9b9a2, 1).fillRect(16, 30, 120, 90);
    for (let fl = 0; fl < 3; fl++) for (let k = 0; k < 4; k++) b.fillStyle(0x6d8aa8, 1).fillRect(24 + k * 28, 40 + fl * 24, 16, 12);
    b.fillStyle(0x7a6450, 1).fillRect(66, 98, 20, 22);
    b.fillStyle(0xd9d9d9, 1).fillRect(68, 92, 16, 5);
    label(76, 24, '우리 집 (빌라)', '#ffffff', '#00000088');
    }
    // 골목
    if (!this.art('street/alley', 158, 122, 40)) {
    b.fillStyle(0x4b4f57, 1).fillRect(140, 60, 36, 60);
    b.fillStyle(0x2f3238, 1).fillRect(146, 70, 4, 50);
    b.fillStyle(0xffe08a, 1).fillRect(144, 66, 8, 4);
    label(158, 54, '골목', '#cccccc');
    }
    // PC방
    if (!this.art('street/pcbang', 232, 122, 108)) {
    b.fillStyle(0x3b3f6b, 1).fillRect(180, 50, 104, 70);
    b.fillStyle(0x15172b, 1).fillRect(186, 70, 92, 26);
    b.fillStyle(0x7a5cff, 1).fillRect(196, 54, 72, 12);
    label(232, 60, 'PC방 24시', '#ffffff');
    b.fillStyle(0x222436, 1).fillRect(222, 100, 20, 20);
    }
    // 편의점 (간판 글씨는 가게 이름이 바뀌니 코드가 쓴다 — 그림의 간판은 비워 둔다)
    if (this.art('street/store', 362, 124, 128)) label(362, 57, session.w!.playerJob?.store ?? '편의점', '#ffffff');
    else {
    b.fillStyle(0xf2f2f2, 1).fillRect(300, 50, 124, 70);
    b.fillStyle(0x2f7d4f, 1).fillRect(300, 50, 124, 14);
    b.fillStyle(0xf2c230, 1).fillRect(300, 64, 124, 3);
    label(362, 57, session.w!.playerJob?.store ?? '편의점', '#ffffff');
    b.fillStyle(0x9fd3ec, 1).fillRect(306, 72, 40, 34).fillRect(380, 72, 38, 34);
    b.fillStyle(0xffffff, 0.4).fillRect(306, 72, 3, 34).fillRect(380, 72, 3, 34);
    b.fillStyle(0x9fd3ec, 1).fillRect(352, 84, 22, 36);
    b.fillStyle(0x555555, 1).fillRect(362, 84, 1, 36);
    b.fillStyle(0xf9e79f, 0.6).fillRect(300, 120, 124, 4); // 불빛
    }
    // 공사장/공터 — 도시의 변화
    const lot = w.city.lots.find((l) => l.area === w.player!.area && l.stage !== 'standing') ?? w.city.lots.find((l) => l.area === w.player!.area && (l.use === 'parking' || l.use === 'empty'));
    const lotArt = !lot || lot.stage === 'standing' ? 'street/lot_parking' : lot.stage === 'frame' || lot.stage === 'finishing' ? 'street/lot_frame' : lot.stage === 'excavation' || lot.stage === 'demolition' ? 'street/lot_dig' : 'street/lot_fence';
    if (this.art(lotArt, 491, 122, 112)) {
      const st = lot?.stage ?? 'standing';
      label(491, 84, st === 'standing' ? lot?.name ?? '공영주차장' : `${lot!.name} ${({ designated: '재개발 구역', relocating: '이주 중', demolition: '철거 중', fenced: '공사 예정', excavation: '터파기', frame: '골조 공사', finishing: '마감 공사' } as Record<string, string>)[st] ?? ''}`, '#ffffff', '#000000aa');
    } else if (lot && lot.stage !== 'standing') {
      const st = lot.stage;
      if (st === 'frame' || st === 'finishing') {
        b.fillStyle(0x9a9a9a, 1).fillRect(450, st === 'finishing' ? 20 : 50, 80, 100);
        for (let y = st === 'finishing' ? 24 : 54; y < 110; y += 10) b.fillStyle(0x6a6a6a, 1).fillRect(450, y, 80, 1);
        b.fillStyle(0xf2c230, 1).fillRect(530, 8, 3, 112).fillRect(470, 8, 90, 3); // 타워크레인
      } else if (st === 'excavation' || st === 'demolition') {
        b.fillStyle(0x8a6a4a, 1).fillRect(440, 100, 100, 20);
        b.fillStyle(0xf2c230, 1).fillRect(470, 88, 22, 12).fillRect(492, 80, 18, 3); // 굴삭기
      }
      b.fillStyle(0xdedede, 1).fillRect(436, 92, 110, 28);
      for (let x = 436; x < 546; x += 10) b.fillStyle(0x2f7d4f, 1).fillRect(x, 92, 5, 28);
      label(491, 84, `${lot.name} ${({ designated: '재개발 구역', relocating: '이주 중', demolition: '철거 중', fenced: '공사 예정', excavation: '터파기', frame: '골조 공사', finishing: '마감 공사' } as Record<string, string>)[st] ?? ''}`, '#ffffff', '#000000aa');
    } else {
      b.fillStyle(0x8f8f8f, 1).fillRect(440, 110, 100, 10);
      label(491, 104, lot?.name ?? '공영주차장', '#ffffff', '#000000aa');
    }
    // 학교
    if (this.art('street/school', 670, 122, 224)) label(670, 14, '○○고등학교', '#ffffff', '#00000088');
    else {
    b.fillStyle(0xd8c7a8, 1).fillRect(560, 20, 220, 92);
    for (let fl = 0; fl < 3; fl++) for (let k = 0; k < 8; k++) b.fillStyle(0x7a9cbf, 1).fillRect(568 + k * 26, 28 + fl * 26, 16, 14);
    b.fillStyle(0x4a6b3f, 1).fillRect(560, 112, 220, 8);
    b.fillStyle(0x555555, 1).fillRect(586, 92, 4, 28).fillRect(626, 92, 4, 28);
    label(670, 14, '○○고등학교', '#ffffff', '#00000088');
    }
    // 가로수 (계절)
    const d = today.date.day;
    // 3월 초는 앙상하고, 벚꽃 → 신록 → 초록 → 단풍 → 낙엽
    const leaf = (m === 3 && d >= 28) || (m === 4 && d <= 12) ? [0xf7c6d9, 0xf2a7c3]
      : m === 4 || (m === 5 && d <= 10) ? [0x9cc77a, 0x7aa85c]
      : m >= 5 && m <= 9 ? [0x4f8a3f, 0x3d6e31]
      : m === 10 || (m === 11 && d <= 20) ? [0xd9862b, 0xc0442b]
      : null;
    const treeArt = `street/tree_${(m === 3 && d >= 28) || (m === 4 && d <= 12) ? 'blossom' : m === 4 || (m === 5 && d <= 10) ? 'fresh' : m >= 5 && m <= 9 ? 'summer' : m === 10 || (m === 11 && d <= 20) ? 'autumn' : 'bare'}`;
    for (let x = 30; x < W; x += 110) {
      if (this.art(treeArt, x + 2, 127, 32, 127)) {
        if (today.sky === 'snow') this.add.graphics().setDepth(128).fillStyle(0xffffff, 1).fillRect(x - 10, 80, 8, 2).fillRect(x + 8, 78, 7, 2);
        continue;
      }
      const t = this.add.graphics().setDepth(120);
      t.fillStyle(0x5a4030, 1).fillRect(x, 96, 4, 30);
      if (leaf) {
        t.fillStyle(leaf[0]!, 1).fillCircle(x + 2, 88, 13);
        t.fillStyle(leaf[1]!, 1).fillCircle(x - 4, 92, 7).fillCircle(x + 9, 90, 7);
      } else {
        t.lineStyle(1, 0x5a4030, 1).lineBetween(x + 2, 96, x - 8, 80).lineBetween(x + 2, 96, x + 12, 78).lineBetween(x + 2, 90, x + 2, 72);
        if (today.sky === 'snow') t.fillStyle(0xffffff, 1).fillRect(x - 8, 79, 6, 2).fillRect(x + 8, 77, 5, 2);
      }
    }
    // 오늘의 한 줄 (벚꽃 만개, 첫눈 …)
    if (today.notes[0]) this.note = this.add.text(160, 8, today.notes[0], { fontFamily: FONT, fontSize: '7px', fontStyle: '600', resolution: TEXT_RES, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 } }).setOrigin(0.5, 0).setDepth(20_002);
  }

  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    const today = session.w!.today;
    const blocked = !!session.confirm || this.gone;
    const a = blocked ? { x: 0, y: 0 } : axis(this.keys);
    if (a.x || a.y) {
      const len = Math.hypot(a.x, a.y);
      const speed = SPEED * (session.w!.playerCarry?.walkSpeed() ?? 1);
      let nx = Phaser.Math.Clamp(this.me.x + (a.x / len) * speed * dt, 8, this.L.w - 8);
      let ny = Phaser.Math.Clamp(this.me.y + (a.y / len) * speed * dt, this.L.top, this.L.bottom);
      // 걸을 수 있는 곳 밖이면 한 축씩 미끄러진다 (벽을 따라 걷기)
      if (this.L.walk && !this.walkable(nx, ny)) {
        if (this.walkable(nx, this.me.y)) ny = this.me.y;
        else if (this.walkable(this.me.x, ny)) nx = this.me.x;
        else (nx = this.me.x), (ny = this.me.y);
      }
      this.me.moveTo(nx, ny);
    } else this.me.moving = false;
    this.me.update(dtMs);

    // 비 맞기: 우산 없으면 점점 젖는다
    const raining = isWet(today) && today.sky !== 'snow';
    if (raining && !this.me.umbrella && !this.soaked) {
      this.wetTimer += dtMs;
      if (this.wetTimer > 2500) {
        this.soaked = true;
        this.me.setLook({ ...this.me.look, wet: true });
      }
    }

    // 행인·차
    for (const p of this.walkers) {
      let x = p.w.x + p.vx * dt;
      if (x < -10) x = this.L.w + 10;
      if (x > this.L.w + 10) x = -10;
      p.w.moveTo(x, p.w.y);
      p.w.update(dtMs);
    }
    if (!this.L.bg && Math.random() < dt * 0.25) {
      const g = this.add.graphics().setDepth(160);
      const col = [0xd62828, 0xf2f2f2, 0x2b2b2b, 0x2f6fd1, 0x9a9a9a][Math.floor(Math.random() * 5)]!;
      const dir = Math.random() < 0.5 ? 1 : -1;
      g.fillStyle(col, 1).fillRect(0, 0, 30, 10).fillRect(6, -6, 18, 6);
      g.fillStyle(0x9fd3ec, 1).fillRect(8, -5, 6, 4).fillRect(16, -5, 6, 4);
      g.fillStyle(0x111111, 1).fillRect(4, 9, 6, 3).fillRect(20, 9, 6, 3);
      g.setPosition(dir > 0 ? -40 : W + 10, dir > 0 ? 176 : 160);
      this.cars.push({ g, vx: dir * (90 + Math.random() * 50) });
    }
    for (const c of [...this.cars]) {
      c.g.x += c.vx * dt;
      if (c.g.x < -60 || c.g.x > W + 60) {
        c.g.destroy();
        this.cars.splice(this.cars.indexOf(c), 1);
      }
    }

    // 화면에 붙어 있는 것들 (하늘·비·오늘의 한 줄)은 카메라를 따라다닌다
    const view = this.cameras.main.worldView;
    this.sky.setPosition(view.x, view.y);
    this.fx.setPosition(view.x, view.y);
    this.note?.setPosition(view.x + view.width / 2, view.y + 8);
    this.drawSky(today);
    // 문 앞 안내
    const door = this.nearDoor();
    if (door && !blocked) this.hint.setText(door.label).setPosition(Math.round(this.me.x), Math.round(this.me.y - this.me.height - 4)).setVisible(true);
    else this.hint.setVisible(false);
    session.streetMinute = 16 * 60 + 40 + Math.floor((this.time.now - this.started) / 1500);
  }

  private walkable(x: number, y: number): boolean {
    return this.L.walk!.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }

  private nearDoor(): Door | undefined {
    return this.L.doors.find((d) => Math.abs(d.x - this.me.x) < (d.y === undefined ? 16 : 14) && (d.y === undefined || Math.abs(d.y - this.me.y) < 14));
  }

  private drawSky(today: { sky: string }) {
    const s = this.sky;
    s.clear();
    if (this.L.bg) return this.drawWeather(today);
    const gray = ['rain', 'shower', 'monsoon', 'typhoon', 'snow', 'cloudy'].includes(today.sky);
    const top = gray ? 0x6f7b8a : 0x6fa8dc;
    const bottom = gray ? 0xa9b2bd : 0xf3c58f;
    for (let y = 0; y < 130; y += 4) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(top), Phaser.Display.Color.ValueToColor(bottom), 130, y);
      s.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1).fillRect(0, y, 320, 4);
    }
    this.drawWeather(today);
  }

  private drawWeather(today: { sky: string }) {
    const fx = this.fx;
    fx.clear();
    if (!this.drops.length) return;
    const snow = today.sky === 'snow';
    fx.fillStyle(snow ? 0xffffff : 0xcfe0f5, snow ? 0.95 : 0.75);
    const wind = today.sky === 'typhoon' ? 3 : 0.6;
    for (const d of this.drops) {
      d.y += (snow ? 0.6 : 4.5) * d.s;
      d.x += snow ? Math.sin(d.y / 10) * 0.3 : wind * d.s * 0.5;
      if (d.y > this.L.view.h) {
        d.y = -4;
        d.x = Math.random() * this.L.view.w;
      }
      if (snow) fx.fillRect(d.x, d.y, 1, 1);
      else fx.fillRect(d.x, d.y, 1, 3);
    }
  }

  private interact() {
    if (session.confirm || this.gone) return;
    const door = this.nearDoor();
    if (!door || door.kind === 'school') return;
    if (door.kind === 'work') {
      this.gone = true;
      this.cameras.main.fadeOut(400);
      this.time.delayedCall(420, () => session.startShift());
      return;
    }
    session.ask(
      door.kind === 'home' ? '알바 빠지고 그냥 집에 갈까? (사장님한테 연락은 안 했다)' : door.kind === 'alley' ? '골목으로 새서 놀다 갈까? 알바는… (사장님한테 연락은 안 했다)' : '알바 빠지고 PC방 갈까? (사장님한테 연락은 안 했다)',
      () => session.skipWork(),
    );
  }
}

export const STREET_VIEW = { w: 320, h: H };
export { ensureTexture };
