# 서울 동네 부품 목록 (GPT 주문서)

동네는 부품을 조립해서 만든다. 부품만 다 있으면 빌라촌·역 앞 상가·아파트 단지·재개발 구역·시장·하천을
같은 부품으로 몇 개든 만들 수 있다. 도시 변화(재개발·가게 개업/폐업)도 부품을 갈아 끼우는 것으로 보인다.

## 공통 규칙 (모든 주문에 똑같이)

- **보는 각도**: 스타듀밸리·위치브룩처럼 위에서 내려다본 정면 3/4 시점. 바닥은 납작하게, 건물은 지붕과 앞벽이 보이게. **원근 없음** (멀리 있어도 작아지지 않는다)
- **크기 기준**: 바닥 1칸 = 16도트, 사람 = 1칸 폭 × 2칸 높이, 건물 한 층 = 약 3칸 높이
- **배경**: 하얀 단색, 물건끼리 띄워서 격자로 배치
- **글씨·로고 금지**: 간판은 비워 둔다 (가게 이름은 게임이 쓴다, 실제 상표 금지)
- **기준 그림 첨부**: 첫 배치에서 고른 그림을 이후 모든 주문에 첨부하고 "Same pixel art style as the attached image"로 시작

받은 그림은 대화에 첨부만 하면 된다. 자르기·크기 맞추기·투명 배경·이름 붙이기는 코드(tools/pixelize.py)가 한다.

---

## 1. 바닥 타일 — 2장

**1-a 길** (`tiles/road.png`)
아스팔트 · 노란 중앙선 2줄 · 흰 점선 차선 · 횡단보도 · 파란 버스전용차로 · 빨간 어린이보호구역 노면 · 정지선 · 배수구 · 맨홀 · 과속방지턱

**1-b 보도·땅** (`tiles/ground.png`)
회색 보도블록 · 붉은 보도블록 · 노란 점자블록 · 연석(경계석) · 골목 콘크리트 · 오르막 계단 · 잔디 · 흙 · 화단 · 하천 물 · 산책로 우레탄(빨강) · 아파트 단지 보도 · 운동장 흙 · 인조잔디

```
Same pixel art style as the attached image. A seamless ground tileset for a Seoul city game, flat top-down view,
each tile a perfect square of the same size, arranged in a neat grid with gaps, plain white background:
[위 목록을 영어로: asphalt, double yellow center line, white dashed lane line, crosswalk stripes, blue bus lane,
red children's protection zone pavement, stop line, drain grate, manhole cover, speed bump]. No text.
```

## 2. 조립식 건물 — 층을 쌓아서 높이를 바꾼다

서울 상가·아파트는 "1층 + 같은 층 반복 + 옥상"이라 조각으로 받으면 3층짜리도 15층짜리도 만든다.

**2-a 상가 건물 조각** (`buildings/shop-parts.png`)
1층 가게 정면 빈칸(유리문·셔터) · 위층 창문 층(간판 자리 비움) · 옥상(물탱크·에어컨 실외기·초록 방수 페인트) · 건물 옆벽

**2-b 1층 가게 정면 16종** (`buildings/storefronts.png`) — 도시 변화로 가게가 바뀌면 이것만 갈아 끼운다
편의점 · 치킨집 · 분식집 · 카페 · PC방 입구 계단 · 노래방 · 미용실 · 세탁소 · 약국 · 부동산 · 마라탕집 · 탕후루 가게 · 무인 아이스크림 · 빵집 · 휴대폰 가게 · 빈 점포(임대 문의)

**2-c 아파트 조각** (`buildings/apartment-parts.png`)
1층 필로티·현관 · 반복 층(복도식/계단식) · 옥상 · 동 번호 붙일 벽 · 경비실 · 단지 정문

## 3. 통짜 건물 — 한 채씩 (`buildings/houses.png`, `buildings/public.png`)

**주거**: 빨간 벽돌 다세대(1층 필로티 주차장) · 베이지 신축 빌라 · 반지하 창문 있는 낡은 단독주택 · 옥상 장독대 주택 · 철거 직전 빈집(빨간 스프레이 X 표시만, 글씨 없이)
**공공**: 고등학교 본관 · 학교 정문 · 지하철역 출입구 · 주민센터 · 파출소 · 우체국 · 교회(빨간 십자가) · 버스정류장 쉘터 · 마을버스 정류장 표지 · 재래시장 아케이드 입구
**공사**: 공사 가림막 · 터파기 구덩이 · 골조 올라가는 건물 · 타워크레인 · 굴삭기 · 덤프트럭

```
Same pixel art style as the attached image. Isolated buildings from a 2020s Seoul neighborhood,
top-down 3/4 view like Stardew Valley buildings (roof and front wall visible, no perspective),
each building separate with space around it, plain white background, no text, no logos:
[목록].
```

## 4. 거리 소품 (`props/street.png`, `props/home.png`)

**거리**: 전봇대(엉킨 전선) · 가로등 · 신호등 · 보행자 신호등 · 볼라드 · 난간 · 방범 CCTV 기둥 · 분리수거함 · 종량제 봉투 더미 · 의류수거함 · 자판기 · 벤치 · 빨간 우체통 · 소화전 · 공공자전거 대여소 · 현수막 걸이 · 전단지 붙은 기둥
**탈것**: 경차 · SUV · 1톤 트럭 · 택시 · 경찰차 · 마을버스 · 시내버스 · 배달 오토바이 · 자전거
**생활**: 화분 · 고무 대야 텃밭 · 빨래 건조대 · 에어컨 실외기 · 물탱크 · 장독대 · 평상 · 놀이터(미끄럼틀·그네·시소) · 공원 운동기구
**빈 간판판** (`props/signs.png`): 가로 간판 · 세로 돌출 간판 · 네온 간판 틀 · 입간판 — 여러 색, 글씨 없이

## 5. 나무 (`nature/trees.png`)

은행나무(서울 가로수) · 플라타너스 · 벚나무 · 소나무 · 관목 — 각각 **봄 · 여름 · 가을 · 겨울(앙상) · 눈 덮인** 5가지

```
Same pixel art style as the attached image. Street trees of Seoul in a grid: rows = ginkgo, plane tree, cherry tree,
pine, shrub; columns = spring, summer, autumn (ginkgo bright yellow), winter bare, covered in snow.
Plain white background, each tree separate, no text.
```

## 6. 실내 (나중에 — 장소마다 한 장)

주인공 방 · 거실·부엌 · 화장실 · 교실 · 복도 · 매점 · PC방 안 · 학원 교실 · 분식집 안 · 노래방 방 · 찜질방

## 밤·눈·비

- 밤: 창문 불빛·간판 불빛·가로등 빛은 코드가 얹는다 (부품을 따로 안 받아도 됨)
- 눈 쌓인 지붕·땅은 나중에 주요 건물만 "같은 그림, 눈 덮인 버전"으로 받는다

## 순서

1. 바닥 타일 2장 → 이것만 있어도 길을 깔고 걸어 다니는 정확한 지도가 된다
2. 거리 소품·나무
3. 조립식 상가·가게 정면 → 역 앞 상가거리 완성
4. 주거·공공 건물 → 빌라촌·학교
5. 아파트·공사 → 아파트 단지·재개발 구역
6. 실내
