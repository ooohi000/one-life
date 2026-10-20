# 그림 넣는 법 (GPT 작가용 주문서)

이 폴더에 **정해진 이름의 png**를 넣으면 게임이 그 그림을 쓴다. 없는 건 코드로 찍은 임시 도트가 대신 나온다.
그래서 한 장씩 바꿔 끼워도 된다 — 다 모일 때까지 기다릴 필요 없다.

```
GPT 그림 (1024px 언저리, 배경 있음)
   ↓  python3 tools/pixelize.py  (배경 지우기 · 진짜 도트 크기로 · 색 32개로)
src/ui/art/…png  (아래 표의 크기)
   ↓  npm run dev
게임에 바로 나온다
```

## 0. 스타일 기준 그림 — 제일 먼저, 딱 한 장

이후 **모든 요청에 이 그림을 첨부**하고 "같은 스타일로"라고 한다. 이게 없으면 장마다 그림체가 달라진다.

```
Top-down 3/4 view pixel art in the style of Stardew Valley. A modern Seoul neighborhood street at dusk:
a 4-story beige brick villa (Korean 빌라), a narrow alley, a PC bang with a purple sign,
a small Korean convenience store with a green sign and big glass windows, a high school behind a fence.
A Korean high school boy in a navy school uniform with a black backpack stands on the sidewalk.
Crisp pixel art on a strict 16x16 tile grid, no anti-aliasing, no blur, limited warm palette (~32 colors),
soft dark outlines, cozy lighting. No text on signs.
```

간판 글씨는 **그림에 넣지 않는다** (가게 이름은 게임 속에서 바뀌고, AI는 한글을 틀리게 쓴다). 글씨는 게임이 쓴다.

## 1. 캐릭터 (`chars/`)

모두 같은 형식: **4줄 × 4칸 시트**, 칸 하나 = 16×32 도트 → 최종 64×128.
- 줄: ① 아래(정면) ② 왼쪽 ③ 오른쪽 ④ 위(뒷모습)
- 칸: ① 서 있기 ② 왼발 ③ 서 있기 ④ 오른발

| 파일 | 누구 |
|---|---|
| `player_school.png` | 주인공 — 교복(봄·가을) + 검은 백팩 |
| `player_summer.png` | 주인공 — 하복(반팔 흰 셔츠) |
| `player_winter.png` | 주인공 — 검은 롱패딩 |
| `player_work.png` | 주인공 — 편의점 초록 조끼 (가방 없음) |
| `student_01.png` ~ `student_06.png` | 손님·행인 학생 (얼굴·머리 다르게) |
| `adult_01.png` ~ `adult_06.png` | 직장인·배달 기사·아주머니 등 |
| `elder_01.png` ~ `elder_02.png` | 어르신 |

```
Same pixel art style as the attached image. A character sprite sheet on a plain white background:
4 rows × 4 columns, every frame the same size, the character centered in each frame.
Row 1 facing down, row 2 facing left, row 3 facing right, row 4 facing up (back view).
Columns: standing, left foot forward, standing, right foot forward.
Character: [주인공: a Korean high school boy, short black hair, navy school blazer, gray trousers, black backpack].
Keep the face, hair and colors exactly identical in all 16 frames.
```

정리: `python3 tools/pixelize.py 받은그림.png src/ui/art/chars/player_school.png --size 64x128`

> 걷는 프레임이 프레임마다 얼굴이 바뀌면 → 정면 한 장만 잘 뽑아서 보내 줘. 나머지는 코드에서 맞춘다.

## 2. 편의점 안 (`scenes/store.png`, 320×192)

위에서 내려다본 매장 전체 한 장 (사람 없이). **배치는 `docs/art-ref/store-layout.png`와 같아야** 손님이 진열대를 뚫고 다니지 않는다 — 그 스크린샷을 같이 첨부한다.

```
Same pixel art style as the first attached image. Top-down 3/4 view of the empty interior of a small Korean
convenience store, wide 5:3 image. Follow the layout of the second attached image exactly:
glass-door drink fridges along the top-left wall, an open chilled shelf with triangle kimbap and lunch boxes
along the top-right wall, a staff-only door top-right, two long snack aisles in the middle,
the checkout counter with a POS and gum rack at the bottom-left, a cigarette rack on the wall behind the counter,
glass windows and an automatic glass door at the bottom-right. Light checkered floor. No people, no text.
```

정리: `python3 tools/pixelize.py 받은그림.png src/ui/art/scenes/store.png --size 320x192 --keep-bg`

## 3. 동네 길 (`street/`)

건물은 **한 채씩 따로**, 정면에서 본 모습, 배경 없이. (게임이 계절·날씨·하늘을 따로 깔고 그 위에 세운다)

| 파일 | 내용 | 정리 폭 |
|---|---|---|
| `villa.png` | 4층 베이지 벽돌 빌라, 1층 현관 | `--width 124` |
| `alley.png` | 좁은 골목 입구, 가로등 하나 | `--width 40` |
| `pcbang.png` | PC방 (보라 간판 — 글씨 없이), 어두운 창 | `--width 108` |
| `store.png` | 편의점 정면 (초록 간판 — 글씨 없이), 큰 유리창, 유리문 | `--width 128` |
| `school.png` | 3층 고등학교 건물 + 교문 + 담장 | `--width 224` |
| `lot_parking.png` | 공영주차장 (차 몇 대) | `--width 112` |
| `lot_fence.png` | 공사 가림막 펜스 | `--width 112` |
| `lot_dig.png` | 터파기 — 흙구덩이, 굴삭기 | `--width 112` |
| `lot_frame.png` | 골조 올라가는 건물 + 타워크레인 | `--width 112` |
| `tree_bare.png` `tree_blossom.png` `tree_fresh.png` `tree_summer.png` `tree_autumn.png` | 가로수 한 그루 — 앙상/벚꽃/연두/초록/단풍 | `--width 32` |
| `umbrella.png` | 위에서 본 펼친 우산 | `--width 22` |
| `sidewalk.png` `road.png` | 이어 붙일 수 있는 바닥 타일 (보도블록 / 아스팔트+차선) | `--size 32x32 --keep-bg` |

```
Same pixel art style as the attached image. A single [4-story beige brick Korean villa building], front view,
isolated on a plain white background, nothing else in the image. Blank sign, no text.
```

정리: `python3 tools/pixelize.py 받은그림.png src/ui/art/street/villa.png --width 124`

## 4. 물건 아이콘 (`items/`, 각 16×16)

한 장에 4×4로 받아서 잘라 쓴다. **순서가 중요**하다.

```
Same pixel art style as the attached image. 16 item icons in a 4x4 grid on a plain white background, evenly spaced,
in this exact order, left to right, top to bottom:
triangle kimbap, lunch box, cup ramen, sandwich,
cola can, canned coffee, water bottle, energy drink can,
bag of chips, ice cream bar, pack of gum, cigarette pack (plain, no brand),
green soju bottle (no label text), beer can, clear vinyl umbrella, power bank.
```

정리:
```
python3 tools/pixelize.py 받은그림.png src/ui/art/items --slice 4x4 --cell 16 \
  --names kimbap,dosirak,ramen,sandwich,cola,coffee,water,energy,chips,icecream,gum,cigarette,soju,beer,umbrella,battery
```

## 지킬 것

- 상표·로고·실제 브랜드 넣지 않기 (편의점·담배·소주 모두 가상)
- 글씨 넣지 않기 (게임이 쓴다)
- 사람은 국적·성별로 과장된 모습 없이, 평범한 동네 사람들
