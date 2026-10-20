/**
 * 도트 그림. 외부 이미지 없이 캔버스에 직접 찍는다 — 옷차림·날씨·든 물건이 바뀌면 그림도 바로 바뀐다.
 * (나중에 진짜 도트 시트가 생기면 이 파일만 갈아 끼우면 된다)
 */

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface Look {
  skin: string;
  hair: string;
  /** 윗옷 */
  top: string;
  /** 바지·치마 */
  bottom: string;
  shoes: string;
  /** 0 반팔 ~ 4 롱패딩 (날씨 시스템의 outfit) */
  outfit: 0 | 1 | 2 | 3 | 4;
  /** 머리 길이 0 짧음 · 1 중간 · 2 긴 머리 */
  hairLen?: 0 | 1 | 2;
  backpack?: string;
  /** 앞치마 (편의점 조끼) */
  vest?: string;
  /** 비에 젖었다 */
  wet?: boolean;
}

export const PERSON_W = 16;
export const PERSON_H = 24;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

/** 사람 한 컷 (16×24) */
export function drawPerson(look: Look, dir: Dir, frame: 0 | 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PERSON_W;
  c.height = PERSON_H;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const wetK = look.wet ? 0.78 : 1;
  const top = shade(look.top, wetK);
  const topD = shade(look.top, wetK * 0.78);
  const bottom = shade(look.bottom, wetK);
  const hair = shade(look.hair, wetK);
  const side = dir === 'left' || dir === 'right';
  const flip = dir === 'left';
  const X = (x: number, w = 1) => (flip ? PERSON_W - x - w : x);

  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(3, 22, 10, 2);

  // 다리 (걷는 프레임)
  const lUp = frame === 1 ? 1 : 0;
  const rUp = frame === 2 ? 1 : 0;
  const long = look.outfit >= 3;
  if (!side) {
    px(5, 17, 2, 5 - lUp, bottom);
    px(9, 17, 2, 5 - rUp, bottom);
    px(5, 22 - lUp, 2, 1, look.shoes);
    px(9, 22 - rUp, 2, 1, look.shoes);
  } else {
    const a = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    px(X(6 + a, 2), 17, 2, 5, shade(bottom, 0.85));
    px(X(8 - a, 2), 17, 2, 5, bottom);
    px(X(6 + a, 3), 22, 3, 1, look.shoes);
    px(X(8 - a, 3), 22, 3, 1, look.shoes);
  }

  // 몸통
  const bodyX = side ? 5 : 4;
  const bodyW = side ? 6 : 8;
  const bodyBottom = look.outfit === 4 ? 21 : long ? 20 : 17;
  const puff = look.outfit === 4 ? 1 : 0;
  px(bodyX - puff, 10, bodyW + puff * 2, bodyBottom - 10, top);
  if (look.outfit === 4) for (let y = 12; y < bodyBottom; y += 3) px(bodyX - 1, y, bodyW + 2, 1, topD);
  if (look.outfit === 3) px(side ? X(7) : 7, 11, side ? 1 : 2, bodyBottom - 11, topD); // 코트 여밈
  if (look.outfit === 2 && dir !== 'up') px(6, 10, 4, 1, topD); // 후드 끈
  if (look.vest) {
    px(bodyX + 1, 11, bodyW - 2, Math.min(7, bodyBottom - 11), look.vest);
    if (!side && dir !== 'up') px(7, 12, 2, 1, '#ffffff');
  }

  // 팔
  const sleeve = look.outfit === 0 ? look.skin : top;
  if (!side) {
    px(3 - puff, 10, 1, 6, sleeve);
    px(12 + puff, 10, 1, 6, sleeve);
    px(3 - puff, 16, 1, 1, look.skin);
    px(12 + puff, 16, 1, 1, look.skin);
    if (look.outfit === 0) {
      px(3, 10, 1, 2, top);
      px(12, 10, 1, 2, top);
    }
  } else {
    const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0;
    px(X(7 + swing), 11, 1, 5, shade(sleeve, 0.85));
    px(X(7 + swing), 16, 1, 1, look.skin);
  }

  // 가방
  if (look.backpack) {
    if (dir === 'up') px(4, 11, 8, 7, look.backpack);
    else if (side) px(X(3, 2), 11, 2, 6, look.backpack);
    else {
      px(4, 10, 1, 4, shade(look.backpack, 0.8));
      px(11, 10, 1, 4, shade(look.backpack, 0.8));
    }
  }

  // 머리
  px(side ? 5 : 4, 2, side ? 7 : 8, 8, look.skin);
  const hl = look.hairLen ?? 0;
  if (dir === 'up') {
    px(4, 1, 8, 8 + hl * 2, hair);
  } else if (side) {
    px(X(4, 8), 1, 8, 3, hair);
    px(X(4, 3), 2, 3, 5 + hl * 3, hair);
    px(X(10), 5, 1, 1, '#2a1d1a'); // 눈
  } else {
    px(4, 1, 8, 3, hair);
    px(3, 2, 1, 4 + hl * 4, hair);
    px(12, 2, 1, 4 + hl * 4, hair);
    if (hl === 2) px(4, 9, 1, 4, hair), px(11, 9, 1, 4, hair);
    px(6, 6, 1, 1, '#2a1d1a');
    px(9, 6, 1, 1, '#2a1d1a');
    px(7, 8, 2, 1, shade(look.skin, 0.82));
  }
  if (look.outfit === 4 && dir !== 'up') px(4, 9, 8, 1, topD); // 패딩 깃
  if (look.wet) {
    g.fillStyle = 'rgba(160,200,255,0.8)';
    g.fillRect(4, 4, 1, 1);
    g.fillRect(11, 7, 1, 1);
  }
  return c;
}

/** 펼친 우산 (위에서 본 지붕 모양) */
export function drawUmbrella(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 22;
  c.height = 12;
  const g = c.getContext('2d')!;
  const rows = [[8, 6], [5, 12], [3, 16], [2, 18], [1, 20], [0, 22]];
  rows.forEach(([x, w], y) => {
    g.fillStyle = y % 2 ? color : shade(color, 1.15);
    g.fillRect(x!, y, w!, 1);
  });
  g.fillStyle = shade(color, 0.7);
  for (let x = 0; x < 22; x += 5) g.fillRect(x, 5, 2, 1);
  g.fillStyle = '#3a3a3a';
  g.fillRect(10, 6, 1, 6);
  return c;
}

/** 물건 아이콘 (12×12). 상품 id 별 모양 */
export function drawProduct(id: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d')!;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const can = (body: string, band: string) => {
    r(3, 1, 6, 10, body);
    r(3, 1, 6, 1, '#c8c8c8');
    r(3, 5, 6, 2, band);
    r(4, 2, 1, 8, 'rgba(255,255,255,0.35)');
  };
  const bottle = (body: string, cap: string, label: string) => {
    r(5, 0, 2, 2, cap);
    r(4, 2, 4, 1, body);
    r(3, 3, 6, 9, body);
    r(3, 6, 6, 3, label);
  };
  switch (id) {
    case 'kimbap':
      for (let y = 0; y < 9; y++) r(6 - Math.floor(y * 0.6), 2 + y, 1 + Math.floor(y * 1.2), 1, '#f4f1e8');
      r(4, 8, 5, 3, '#1f2a1c');
      r(1, 10, 10, 1, '#c33');
      break;
    case 'dosirak':
      r(1, 3, 10, 7, '#222');
      r(2, 4, 4, 5, '#f4f1e8');
      r(6, 4, 4, 2, '#d9603b');
      r(6, 6, 4, 3, '#6aa84f');
      break;
    case 'ramen':
      r(2, 2, 8, 2, '#f2f2f2');
      r(3, 4, 6, 7, '#e64a2e');
      r(3, 6, 6, 2, '#ffd34d');
      break;
    case 'sandwich':
      r(1, 5, 10, 5, '#f0d9a0');
      r(1, 7, 10, 1, '#6aa84f');
      r(1, 8, 10, 1, '#e86b5a');
      r(0, 4, 12, 1, '#cfe3f0');
      break;
    case 'cola': can('#d62828', '#ffffff'); break;
    case 'coffee': can('#6b4226', '#e8d5b0'); break;
    case 'energy': can('#1b1b1b', '#7cff4f'); break;
    case 'beer': can('#d4a017', '#f6f0d8'); break;
    case 'water': bottle('#bfe3ff', '#2f6fd1', '#2f6fd1'); break;
    case 'soju': bottle('#3c9a5f', '#2d6e44', '#e8f5ec'); break;
    case 'chips':
      r(2, 1, 8, 10, '#f2c230');
      r(2, 1, 8, 1, '#c79a16');
      r(2, 10, 8, 1, '#c79a16');
      r(4, 4, 4, 3, '#d9472b');
      break;
    case 'icecream':
      r(4, 1, 4, 5, '#f7b6c8');
      r(5, 6, 2, 5, '#d9b07a');
      break;
    case 'gum':
      r(1, 4, 10, 4, '#3fb6a8');
      r(1, 5, 10, 1, '#ffffff');
      break;
    case 'cigarette':
      r(3, 1, 6, 10, '#ececec');
      r(3, 1, 6, 3, '#2b4c7e');
      r(4, 7, 4, 3, '#555');
      break;
    case 'umbrella': // 접힌 비닐우산 (비스듬히)
      for (let i = 0; i < 8; i++) r(2 + i, 1 + i, 2, 2, i < 6 ? '#dfe9f2' : '#9aa');
      r(1, 0, 2, 2, '#333');
      r(9, 9, 1, 3, '#333');
      r(8, 11, 2, 1, '#333');
      break;
    case 'battery':
      r(2, 2, 8, 8, '#444');
      r(4, 4, 4, 4, '#7cff4f');
      break;
    default:
      r(2, 2, 8, 8, '#999');
  }
  return c;
}

/** 캔버스를 화면 크기로 키운 data URL (React에서 <img>로) */
export function toDataUrl(src: HTMLCanvasElement, scale = 4): string {
  const c = document.createElement('canvas');
  c.width = src.width * scale;
  c.height = src.height * scale;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** 사람마다 다른 생김새 (손님용) — 숫자 하나로 정해진다 */
export function lookFor(n: number, outfit: Look['outfit'], kind: string): Look {
  const pick = <T,>(a: T[], k: number) => a[(n * 7 + k * 13) % a.length]!;
  const skins = ['#f1c9a5', '#e8b98f', '#f6d4b5', '#dba882'];
  const hairs = ['#1d1a1a', '#2e2420', '#4a3426', '#191919', '#6b6b6b'];
  const tops = ['#3b5b92', '#a33b3b', '#e6e6e6', '#3d6b4f', '#7a5c9e', '#c98a2e', '#2b2b2b', '#8a9aa8'];
  const bottoms = ['#2c3446', '#1f1f1f', '#4a5f80', '#6b5a48'];
  const isStudent = kind === 'student';
  return {
    skin: pick(skins, 1),
    hair: kind === 'elder' ? '#c9c9c9' : pick(hairs, 2),
    top: isStudent ? (outfit >= 3 ? '#1f2d4a' : '#f2f2f2') : kind === 'rider' ? '#1e5aa8' : pick(tops, 3),
    bottom: isStudent ? '#2a3550' : pick(bottoms, 4),
    shoes: '#222',
    outfit,
    hairLen: (n % 3) as 0 | 1 | 2,
    backpack: isStudent ? '#2b2b2b' : undefined,
  };
}
