# 동작 프롬프트 모음 (GPT에 그대로 붙여 넣기)

## 쓰는 법 (2026-10-21 바뀜 — 조립형 캐릭터)
1. **0번은 정지 4방향만** 받는다. 해상도(32×64 / 64×128)를 정하기 전엔 걷기·동작을 받지 않는다.
2. 0-A(32×64 후보)·0-B(64×128 후보)를 받아 `?view=sprite-test`에서 배경 옆에 세워 보고 해상도를 정한다.
3. 정한 해상도의 몸이 확정되면 0-C(티셔츠 1벌)로 **옷 층 맞추기 시험**부터 한다. 옷 100벌 전에 1벌로.
4. 그다음에 걷기(0-D) → 1단계 동작. 매번 확정된 몸 그림을 첨부한다.
5. 받은 그림은 대화에 첨부하면서 번호만 말해 주면 된다 ("0-A").

몸 기준 (docs/art-ref/character/CHARACTER-SYSTEM.md):
- 머리카락·눈·코·입·눈썹 **없음** (머리·얼굴은 따로 얹는다)
- **피부색 전신 바디슈트를 입은 마네킹**: 봉제선·목둘레·소매·허리밴드 없이 매끈한 인형. 실제 피부·해부학 묘사 없음 — 옷은 전부 층으로 덮는다
  (기준 그림: `docs/art-ref/character/BASE-BODY-REFERENCE.png`, `docs/art-ref/character/body-suit-sheet.png`)
- 게임 화면엔 윗옷·바지가 갖춰져야만 나온다 (빠지면 기존 그림으로 — 코드가 막는다)
- 4방향 모두 키·발 위치가 같아야 한다. 왼쪽·오른쪽은 진짜 반대 방향
- GPT 그림은 원본 시안일 뿐 — `pixelize.py`로 규격 맞추고 `sprite-qa.py` 통과 + `?view=sprite-test` 확인 뒤 확정

---

## 0-A. 기준 몸 — 정지 4방향, 32×64 후보 (첨부 없음 — 기준 시트는 머리가 커서 2.2등신으로 따라 나온다. v2 검증 결과)
> GPT 이미지 거부 피해서 고친 문구 (2026-10-21): "맨몸·속옷 없음" 대신 "피부색 불투명 바디슈트를 입은 인형"으로 쓴다.
```
High-quality handcrafted pixel art for a Korean life simulation RPG, with crisp pixel edges, a cohesive warm palette,
clean one-pixel outlines at native sprite resolution, and carefully controlled stepped shading.

Create a four-direction sprite sheet of ONE stylized, faceless humanoid character-customization mannequin,
in the visual language of Witchbrook and Stardew Valley.

The character is an approximately three-head-tall game mannequin with an average male build, wearing an opaque peach-colored
full-body bodysuit, including integrated hands and feet. Its surface is smooth and seamless, with no visible garment seams,
zippers, cuffs, neckline, waistband, or separate clothing pieces. It is a fully covered stylized doll, not an anatomical human figure.
Use one peach color family with stepped shading and a dark outline.

The head is bald and completely blank, without eyes, eyebrows, nose, mouth, or hair. The silhouette is compact and balanced,
with rounded hands and feet.

Sprite sheet layout:
- One row, four columns.
- Column 1: front / facing down.
- Column 2: left profile / facing left.
- Column 3: right profile / facing right.
- Column 4: back / facing up.
- Identical character proportions, height, ground baseline, and consistent shading in all four directions.
- Relaxed standing pose, arms at the sides.
- Each target frame is 32 x 64 pixels. Target final sprite sheet dimensions: 128 x 64 pixels.
- Pure white (#FFFFFF) flat background if genuine alpha transparency cannot be produced.
- No checkerboard background.
- No labels, captions, grid lines, guides, shadows, or additional characters.

IMPORTANT proportions: the head (top of head to chin) must be exactly one third of the total height; the body from neck to feet is two thirds.
This is a teenager, not a baby or toddler: a narrower head, longer legs and torso than a chibi doll.
Column 3 must face RIGHT and be the exact mirror image of column 2, which faces LEFT.
```

## 0-B. 같은 몸 — 정지 4방향, 64×128 후보 (0-A 그림 첨부)
```
Using the approved 0-A character as the sole design reference, recreate the same four-direction mannequin at a target native
resolution of 64 x 128 pixels per frame.

Maintain exactly the same silhouette, proportions, direction order, pose, color palette, and baseline. Add carefully controlled
pixel-level shading detail appropriate for the higher resolution, rather than simply enlarging the 32 x 64 version.

One row, four columns. Target full sheet: 256 x 128 pixels.

Pure white background or genuine alpha transparency. No checkerboard, labels, guides, or additional characters.
```

## 0-C. 옷 층 시험 — 티셔츠 1벌 (확정된 몸 첨부)
```
Same mannequin, same pose, same frame size and exactly the same position in every frame as the attached sprite sheet.
Change only one thing: it now wears a plain gray crew-neck short-sleeve t-shirt over the peach bodysuit.
Do not move, resize or redraw the body, head, arms or legs — every pixel outside the t-shirt must stay identical.
One row, four columns: front, left, right, back. Pure white (#FFFFFF) flat background, no checkerboard. No labels, no grid lines.
```
→ 코드가 몸 그림과 비교해서 티셔츠 도트만 뽑는다 (`tools/extract-layer.py`). 같은 시험을 코드로 그린 옷(bodygen)으로도 해서 둘을 비교한다.
→ **옷 색은 피부(살구) 계열을 피한다** — 몸과 구분이 안 돼서 추출이 안 되고, 섞여 들어간 살구색 도트는 피부색을 바꿔도 안 바뀌어 얼룩이 된다.

## 0-D. 걷기 — 해상도 확정 뒤에만 (확정된 몸 첨부)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: WALKING. 4 rows x 4 columns, every frame the same size, character centered in each frame.
Rows: facing down, facing left, facing right, facing up (back view). Columns: standing, left foot forward, standing, right foot forward.
Keep the body identical to the attached sheet; feet on the same baseline in every frame. Plain flat pure white background, NOT a checkerboard. No text, no grid lines.
```

## 정리 명령 (코드가 한다)
```
# 몸 (키를 정해서 — 안 정하면 칸에 꽉 차서 아이·어른 키가 같아진다. 배율은 저장해 둔다)
python3 tools/pixelize.py 0-A.png src/ui/art/chars/lab/res32/body/m-teen-average/idle.png --sheet 4x1 --frame 32x64 --height 56 --foot-pad 1 --tol 90 --colors 40 --save-transform docs/art-src/t-res32-idle.json
python3 tools/pixelize.py 0-B.png src/ui/art/chars/lab/res64/body/m-teen-average/idle.png --sheet 4x1 --frame 64x128 --height 112 --foot-pad 2 --tol 90 --colors 48 --save-transform docs/art-src/t-res64-idle.json
python3 tools/sprite-qa.py <몸>.png --layout idle --frame 32x64          # 크기·투명·잘림·발바닥·좌우·키 검사

# 옷 층 시험 (0-C): 몸과 같은 배율로 줄이고 → 달라진 도트만 뽑고 → 몸 밖으로 새는지 검사
python3 tools/pixelize.py 0-C.png /tmp/clothed.png --sheet 4x1 --frame 32x64 --foot-pad 1 --tol 90 --colors 40 --use-transform docs/art-src/t-res32-idle.json
python3 tools/extract-layer.py <몸>.png /tmp/clothed.png src/ui/art/chars/lab/res32/top/gray-tshirt/idle.png --layout idle [--align]
python3 tools/sprite-qa.py src/ui/art/chars/lab/res32/top/gray-tshirt/idle.png --layout idle --base <몸>.png
```
코드로 그린 비교 대상(bodygen 방식)은 `npm run sim:layers` → `chars/lab/bodygen/`.
확정되면 게임용 위치 `src/ui/art/chars/layers/<층>/<id>/<동작>.png` 로 옮긴다 (윗옷·바지까지 있어야 주인공이 조립형으로 바뀐다).

---

> 아래 1~19번은 **해상도와 몸이 확정된 뒤**에 쓴다. "attached sprite sheet" = 확정된 걷기 시트.

---

## 1단계 — 지금 게임에 쓰는 동작 (모두 0번 그림 첨부)

### 1. 뛰기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: RUNNING. 4 rows x 4 columns. Rows: facing down, facing left, facing right, facing up (back).
Columns: 4 frames of a running cycle (arms swinging strongly, body leaning forward slightly, one foot off the ground).
Feet on the same baseline in every frame, character centered in each frame. Plain white background, no text, no grid lines.
```

### 2. 점프
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: JUMPING, facing right (side view). 1 row x 4 columns:
1) crouching down to jump, 2) pushing off the ground, 3) in the air with knees bent, 4) landing with knees bent.
Keep the ground line at the same height in every frame. Plain white background, no text, no grid lines.
```

### 3. 서 있기 (숨쉬기)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: IDLE BREATHING. 4 rows x 2 columns. Rows: facing down, facing left, facing right, facing up (back).
Column 1: standing relaxed. Column 2: the same pose with shoulders and chest raised by one pixel (breathing in).
Plain white background, no text, no grid lines.
```

### 4. 계산하기 (바코드 찍기)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SCANNING ITEMS AT A STORE COUNTER, facing down (front view). 1 row x 3 columns:
1) holding a handheld barcode scanner in the right hand and a small item in the left hand,
2) pointing the scanner at the item, 3) putting the item aside to the right.
Draw only the character, the scanner and the item, no counter. Plain white background, no text, no grid lines.
```

### 5. 진열하기 (선반에 손 뻗기)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: STOCKING A SHELF. 2 rows x 3 columns.
Row 1 facing up (back view), row 2 facing right (side view).
Columns: 1) holding a small box at chest height, 2) reaching forward and up to place it, 3) pushing it into place with both hands.
Draw only the character and the small box, no shelf. Plain white background, no text, no grid lines.
```

### 6. 쪼그려 앉기 (아래 칸 진열·물건 줍기)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SQUATTING DOWN. 2 rows x 2 columns.
Row 1 facing up (back view), row 2 facing right (side view).
Column 1: squatting with knees bent, hands reaching low in front. Column 2: same squat, hands picking something up.
Feet on the same baseline. Plain white background, no text, no grid lines.
```

### 7. 대걸레질
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: MOPPING THE FLOOR with a long mop, facing right (side view). 1 row x 4 columns:
the mop head swinging from left to center to right and back, body twisting slightly with each swing.
Plain white background, no text, no grid lines.
```

### 8. 상자 들고 걷기 (두 손)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: WALKING WHILE CARRYING A CARDBOARD BOX WITH BOTH HANDS in front of the chest.
4 rows x 4 columns. Rows: facing down, facing left, facing right, facing up (back). Columns: walk cycle like the attached sheet.
The box stays at the same height relative to the body. Plain white background, no text, no grid lines.
```

### 9. 한 손 들고 걷기 (우산)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: WALKING WHILE HOLDING AN UMBRELLA HANDLE UP with the right hand at shoulder height (as if holding an open umbrella above the head).
Draw only the hand gripping a short umbrella handle stick, NOT the umbrella canopy (it is added separately).
4 rows x 4 columns. Rows: facing down, facing left, facing right, facing up (back). Columns: walk cycle like the attached sheet.
Plain white background, no text, no grid lines.
```

### 10. 폰 보기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: STANDING AND LOOKING AT A SMARTPHONE held in both hands at chest height, head tilted down.
2 rows x 2 columns. Row 1 facing down (front), row 2 facing right (side).
Column 1: looking at the phone. Column 2: thumb tapping the screen. Plain white background, no text, no grid lines.
```

### 11. 때리기 (주먹)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: THROWING A PUNCH, facing right (side view). 1 row x 3 columns:
1) fighting stance with fists up, 2) right arm fully extended in a straight punch, 3) pulling the arm back to stance.
Feet on the same baseline. No blood, no other person. Plain white background, no text, no grid lines.
```

### 12. 막기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: BLOCKING, facing right (side view). 1 row x 2 columns:
1) both forearms raised in front of the face to block, 2) flinching back slightly behind the raised arms.
Plain white background, no text, no grid lines.
```

### 13. 맞고 비틀
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: GETTING HIT AND STAGGERING BACK, facing right (side view). 1 row x 2 columns:
1) head and upper body snapping back, 2) stumbling backward one step, arms flailing.
No blood, no injuries shown. Plain white background, no text, no grid lines.
```

### 14. 넘어지기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: FALLING DOWN, facing right (side view). 1 row x 3 columns:
1) losing balance and tipping backward, 2) hitting the ground sitting, 3) lying flat on the back on the ground.
Keep the ground line at the same height. No blood. Plain white background, no text, no grid lines.
```

### 15. 의자에 앉아 있기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SITTING ON A SIMPLE SCHOOL CHAIR (wooden seat, metal legs). 1 row x 4 columns:
facing down, facing left, facing right, facing up (back). Hands resting on the knees.
Plain white background, no text, no grid lines.
```

### 16. 바닥에 양반다리
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SITTING CROSS-LEGGED ON THE FLOOR (Korean style, legs folded), hands on the knees.
1 row x 3 columns: facing down, facing right, facing up (back). Plain white background, no text, no grid lines.
```

### 17. 앉아서 공부 (쓰기)
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SITTING AT A SCHOOL DESK AND WRITING in a notebook with a pen. Include the small desk and chair.
2 rows x 2 columns. Row 1 facing up (back view, seen from behind), row 2 facing right (side view).
Column 1: writing, head down. Column 2: pen moved to the next line. Plain white background, no text, no grid lines.
```

### 18. 책상에 엎드려 졸기
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: SLEEPING WITH THE HEAD DOWN ON A SCHOOL DESK, arms folded under the head. Include the small desk and chair.
2 rows x 2 columns. Row 1 facing right (side view), row 2 facing up (back view).
Column 1: breathing out. Column 2: back raised by one pixel (breathing in). Plain white background, no text, no grid lines.
```

### 19. 눕기·자기
```
Same character, same pixel art style, same proportions as the attached sprite sheet.
New sprite sheet: LYING ON THE BACK, SLEEPING, seen from directly above (top-down), arms at the sides, on no bed (the bed is separate).
1 row x 2 columns. Column 1: breathing out. Column 2: chest raised by one pixel. Plain white background, no text, no grid lines.
```

---

## 2·3단계 — 나중에 (형식은 같고 동작 줄만 바뀐다)

아래 틀의 `[동작 설명]`만 바꿔서 쓴다. 1단계가 게임에 들어간 뒤에 진행.
```
Same character, same pixel art style, same proportions and same frame size as the attached sprite sheet.
New sprite sheet: [동작 설명 — 방향, 줄·칸 수, 칸마다 자세]. Plain white background, no text, no grid lines.
```

- 이동: 계단 오르기 · 비틀거리기 · 절뚝이기 · 비 맞으며 머리 가리고 뛰기 · 지하철 손잡이 잡고 서 있기
- 집: 숟가락·젓가락 먹기 · 마시기 · 요리 · 설거지 · 빨래 널기 · 양치 · 거울 보기 · 뒤척이기 · 일어나기
- 학교: 손 들기 · 칠판 쓰기 · 빗자루 청소 · 공 차기 · 농구 슛 · 줄 서기
- 사람 사이: 손 흔들기 · 꾸벅 인사 · 악수 · 하이파이브 · 어깨동무 · 말하기 몸짓 · 웃기 · 울기 · 화내기 · 놀라기 · 한숨
- 가족·친구: 포옹 · 업어 주기 · 부축하기 · 어린아이 안아 들기 · 머리 쓰다듬기
- 싸움: 발차기 · 밀치기 · 멱살 · 쓰러지기 · 일어나기
- 몸 상태: 기침 · 하품 · 추워서 떨기 · 부채질 · 배 아파 웅크리기
- 놀이·운동: PC 게임 · 노래방 마이크 · 팔굽혀펴기 · 윗몸일으키기 · 덤벨 · 러닝머신 · 줄넘기
- 밖에서 지내기: 쭈그려 앉아 있기 · 벤치에 눕기
- 3단계: 자전거 · 킥보드 · 배달 오토바이 · 운전 · 쟁반 서빙 · 주방 요리 · 사무실 타자 · 군대 경례·행군 · 성인 단계 동작
