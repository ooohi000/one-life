/**
 * 물건. 아이템 창은 없다 — 들고 있는 건 몸에 보이고, 들고 있으면 손이 묶인다.
 * 물건은 데이터 한 줄이다. 크기·무게·들 수 있는 방법·성질만 적으면 모든 규칙이 알아서 적용된다.
 */
export type CarryWay = 'pocket' | 'hand' | 'twoHands' | 'bag' | 'wear';

export type ItemTag =
  | 'electronic' // 젖으면 고장날 수 있다
  | 'paper' // 젖으면 못 쓴다
  | 'fragile' // 떨어뜨리면 깨진다
  | 'valuable' // 잃어버리면 크다, 도둑맞을 수 있다
  | 'food' | 'drink' // 걸으면서 먹고 마실 수 있다 (손 하나)
  | 'umbrella' // 펴면 비를 막는다
  | 'container' // 메면 가방 칸이 생긴다
  | 'money' | 'key' | 'id' // 지갑·열쇠·신분증
  | 'conspicuous'; // 남들 눈에 띈다 (기타, 명품 가방) — 인상·소문 재료

export interface ItemDef {
  id: string;
  name: string;
  /** 들 수 있는 방법 (앞에 있을수록 기본) */
  ways: CarryWay[];
  /** 부피(L) — 가방에 넣을 때 */
  volume: number;
  /** 무게(kg) */
  weight: number;
  tags: ItemTag[];
  /** 가방이면 용량(L) */
  capacity?: number;
  /** 대략 값(원) */
  price: number;
  /** 남에게 주는 인상 (눈에 띄는 물건) */
  impression?: string;
}

export const ITEMS: ItemDef[] = [
  // 주머니
  { id: 'phone', name: '휴대폰', ways: ['pocket', 'hand', 'bag'], volume: 0.2, weight: 0.2, tags: ['electronic', 'valuable'], price: 1_000_000 },
  { id: 'wallet', name: '지갑', ways: ['pocket', 'bag'], volume: 0.2, weight: 0.15, tags: ['money', 'id', 'valuable'], price: 30_000 },
  { id: 'keys', name: '집 열쇠', ways: ['pocket', 'bag'], volume: 0.05, weight: 0.05, tags: ['key'], price: 5_000 },
  { id: 'earbuds', name: '무선 이어폰', ways: ['pocket', 'bag'], volume: 0.05, weight: 0.05, tags: ['electronic', 'valuable'], price: 200_000 },
  { id: 'transitCard', name: '교통카드', ways: ['pocket', 'bag'], volume: 0.01, weight: 0.01, tags: ['money'], price: 3_000 },
  { id: 'lipBalm', name: '립밤', ways: ['pocket', 'bag'], volume: 0.01, weight: 0.01, tags: [], price: 4_000 },
  // 우산
  { id: 'umbrella', name: '장우산', ways: ['hand'], volume: 2, weight: 0.5, tags: ['umbrella'], price: 15_000 },
  { id: 'foldingUmbrella', name: '접이식 우산', ways: ['hand', 'bag'], volume: 0.5, weight: 0.3, tags: ['umbrella'], price: 12_000 },
  { id: 'cheapUmbrella', name: '편의점 비닐우산', ways: ['hand'], volume: 1.5, weight: 0.4, tags: ['umbrella'], price: 6_000 },
  // 가방
  { id: 'backpack', name: '백팩', ways: ['wear', 'hand'], volume: 20, weight: 0.8, tags: ['container'], capacity: 20, price: 50_000 },
  { id: 'crossbag', name: '크로스백', ways: ['wear'], volume: 5, weight: 0.4, tags: ['container'], capacity: 4, price: 40_000 },
  { id: 'luxuryBag', name: '명품 가방', ways: ['hand', 'wear'], volume: 8, weight: 0.9, tags: ['container', 'valuable', 'conspicuous'], capacity: 6, price: 2_500_000, impression: '돈이 많아 보인다' },
  { id: 'gymBag', name: '운동가방', ways: ['hand', 'wear'], volume: 25, weight: 1.2, tags: ['container', 'conspicuous'], capacity: 22, price: 40_000, impression: '운동하는 애' },
  { id: 'shoppingBag', name: '쇼핑백', ways: ['hand'], volume: 10, weight: 0.3, tags: ['container'], capacity: 10, price: 0 },
  // 공부·학교
  { id: 'textbooks', name: '교과서·문제집', ways: ['bag', 'hand'], volume: 4, weight: 2.5, tags: ['paper'], price: 60_000 },
  { id: 'laptop', name: '노트북', ways: ['bag', 'hand'], volume: 3, weight: 1.6, tags: ['electronic', 'valuable', 'fragile'], price: 1_500_000 },
  { id: 'report', name: '수행평가 보고서', ways: ['bag', 'hand'], volume: 0.3, weight: 0.1, tags: ['paper'], price: 0 },
  // 취미·운동
  { id: 'guitar', name: '기타', ways: ['wear', 'twoHands'], volume: 40, weight: 3, tags: ['fragile', 'conspicuous'], price: 300_000, impression: '밴드 하는 애' },
  { id: 'basketball', name: '농구공', ways: ['hand', 'bag'], volume: 7, weight: 0.6, tags: ['conspicuous'], price: 30_000, impression: '농구하는 애' },
  { id: 'skateboard', name: '보드', ways: ['hand'], volume: 15, weight: 2.5, tags: ['conspicuous'], price: 150_000, impression: '노는 애' },
  // 먹을 것
  { id: 'coffee', name: '테이크아웃 커피', ways: ['hand'], volume: 0.5, weight: 0.4, tags: ['drink'], price: 4_500 },
  { id: 'tteokbokki', name: '떡볶이 포장', ways: ['hand', 'bag'], volume: 1.5, weight: 0.8, tags: ['food'], price: 6_000 },
  { id: 'cakeBox', name: '케이크 상자', ways: ['twoHands', 'hand'], volume: 6, weight: 1.2, tags: ['food', 'fragile'], price: 35_000 },
  { id: 'kimbap', name: '삼각김밥', ways: ['hand', 'pocket', 'bag'], volume: 0.2, weight: 0.12, tags: ['food'], price: 1_500 },
  // 큰 짐
  { id: 'parcel', name: '택배 상자', ways: ['twoHands'], volume: 30, weight: 6, tags: [], price: 0 },
  { id: 'groceries', name: '장 본 봉투', ways: ['hand'], volume: 12, weight: 4, tags: ['food'], price: 30_000 },
  { id: 'flowers', name: '꽃다발', ways: ['hand'], volume: 4, weight: 0.5, tags: ['fragile', 'conspicuous'], price: 30_000, impression: '누구 만나러 가나 보다' },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export function item(id: string): ItemDef {
  const i = BY_ID.get(id);
  if (!i) throw new Error(`없는 물건: ${id}`);
  return i;
}

/**
 * 행동마다 필요한 것. 손이 몇 개 비어 있어야 하나, 무슨 물건이 손에 있어야 하나.
 * 새 행동은 여기 한 줄.
 */
export interface VerbRule {
  label: string;
  /** 비어 있어야 하는 손 수 */
  freeHands: number;
  /** 이 성질의 물건을 손에 들고 있어야 (폰을 하려면 폰을 꺼내 들어야) */
  holding?: ItemTag | string;
  /** 이걸 들고 있으면 못 한다 */
  forbidHolding?: ItemTag[];
  /** 이게 몸 어딘가 있어야 (계산하려면 지갑·카드) */
  having?: ItemTag[];
}

export const VERBS: Record<string, VerbRule> = {
  usePhone: { label: '폰 하기', freeHands: 0, holding: 'phone' },
  takeOutPhone: { label: '폰 꺼내기', freeHands: 1 },
  playGame: { label: '폰 게임 (두 손)', freeHands: 1, holding: 'phone' },
  openDoor: { label: '문 열기', freeHands: 1 },
  pay: { label: '계산하기', freeHands: 1, having: ['money'] },
  enterHome: { label: '집 들어가기 (도어락 아니면 열쇠)', freeHands: 1, having: ['key'] },
  buyCigarettesOrAlcohol: { label: '담배·술 사기', freeHands: 1, having: ['id', 'money'] },
  rideKickboard: { label: '킥보드 타기', freeHands: 2, forbidHolding: ['umbrella'] },
  rideBike: { label: '자전거 타기', freeHands: 2, forbidHolding: ['umbrella'] },
  highFive: { label: '하이파이브', freeHands: 1 },
  holdHands: { label: '손잡기', freeHands: 1 },
  eatWalking: { label: '걸으면서 먹기', freeHands: 0, holding: 'food' },
  fight: { label: '싸우기', freeHands: 2 },
  catchSomething: { label: '날아온 걸 받기', freeHands: 1 },
};
