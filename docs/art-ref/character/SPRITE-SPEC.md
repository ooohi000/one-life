# 《한 번뿐인 인생》 스프라이트 제작 규격 v1.0

## 해상도 (검증 전)
- **우선 검증 후보:** 프레임당 64×128px.
- **비교 후보:** 32×64px, 48×96px, 64×128px.
- 실제 게임 화면에서 읽힘성·픽셀 디테일·작업량을 비교한 후 최종 확정한다.

## 프레임
- 방향: `down`, `left`, `right`, `up`.
- 기본 정지: 각 방향 1프레임.
- 기본 걷기: 각 방향 4프레임, 총 16프레임.
- 레이어 간 동일 캔버스, 동일 프레임 인덱스, 동일 좌표 기준을 사용한다.
- 공통 앵커: 발바닥 중앙(캐릭터가 지면에 닿는 점).
- 모든 방향에서 머리와 발이 잘리지 않아야 한다. 좌측과 우측이 실제 반대 방향을 가리켜야 한다.

## 파일 형식
- PNG, RGBA 실제 알파 투명도. 배경에 그려진 체크무늬는 투명도가 아니다.
- 시트에는 텍스트·눈금·가이드라인·그림자 배경을 포함하지 않는다. 지면 그림자는 별도 레이어로 관리할 수 있다.
- 픽셀 아트 표시 시 nearest-neighbor 보간 사용.

## 폴더 예시
```
assets/characters/
  bodies/adult/average/down_idle.png
  bodies/adult/average/down_walk.png
  faces/basic/down_idle.png
  hair/short_black/down_idle.png
  clothing/tops/gray_tshirt/down_idle.png
  clothing/bottoms/gray_shorts/down_idle.png
  shoes/sneakers_black/down_idle.png
  accessories/
```
- 예시 경로이며 기존 프로젝트 폴더 구조 확인 후 조정한다.
- 파일명 규칙: `<direction>_<action>.png`.
- 프레임별 개별 PNG 또는 시트 사용 여부는 렌더러 성능·관리 방식에 맞춰 결정하되, 프레임 순서 메타데이터를 명시한다.

## QA 체크리스트
- [ ] 이미지 파일의 실제 픽셀 크기 검증
- [ ] 실제 알파 채널 검증
- [ ] 머리·손·발 잘림 없음
- [ ] 발바닥 앵커 일치
- [ ] 좌우 방향 구분 및 정렬
- [ ] 얼굴·헤어·의상 레이어 중복 또는 어긋남 없음
- [ ] 정지 및 걷기 프레임 간 떨림 최소화
- [ ] 1x, 2x, 4x 확대 화면에서 픽셀 경계 확인
- [ ] 서로 다른 체형·연령과 의상 조합 테스트
