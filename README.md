# L-Benefit

LIG넥스원 임직원 혜택 제휴 매장을 지도 위에 표시하는 사내 전용 데스크톱 앱입니다.  
Confluence에서 데이터를 자동 동기화하며, 내부망 환경에서 동작합니다.

---

## 주요 기능

- 국내 제휴 매장을 지도 위 카테고리별 아이콘으로 표시
- 마커 클러스터링으로 밀집 지역 가독성 향상
- 기관명 검색 및 카테고리 필터링
- 국내 / 해외 제휴 리스트 팝업
- 앱 실행 시 Confluence 자동 로그인 및 데이터 동기화
- 오프라인 환경에서도 마지막 동기화 데이터로 정상 동작

---

## 디렉토리 구조

```
L-Benefit/
 ├── main.js              # Electron 메인 프로세스
 ├── preload.js           # IPC 브릿지
 ├── updater.js           # Confluence 로그인 및 데이터 동기화
 ├── package.json
 ├── package-lock.json
 ├── build-zip.js         # 빌드 + zip 패키징 스크립트
 ├── build.bat            # 빌드 실행 배치 파일
 ├── L-Benefit.ico
 ├── README.md
 ├── src/
 │    ├── index.html
 │    ├── css/
 │    │    └── style.css
 │    └── js/
 │         ├── app.js     # 지도 렌더링 및 UI 로직
 │         └── sync.js    # 동기화 상태 표시
 ├── data/
 │    └── affiliates.json # 번들 기본 데이터 (오프라인 폴백)
 ├── leaflet/
 │    ├── leaflet.js
 │    ├── leaflet.css
 │    └── markercluster/
 │         ├── leaflet.markercluster.js
 │         ├── MarkerCluster.css
 │         └── MarkerCluster.Default.css
 └── map_tiles/           # 오프라인 지도 타일
      ├── 9/
      ├── 10/
      ├── ...
      └── 13/
```

---

## 개발 환경 설정

### 요구 사항

- Node.js 18 이상
- npm

### 의존성 설치

```bash
npm install
```

### leaflet.markercluster 설치 (최초 1회)

```bash
npm install leaflet.markercluster --save-dev
```

설치 후 아래 파일을 `leaflet/markercluster/` 폴더에 복사합니다.

```
node_modules/leaflet.markercluster/dist/leaflet.markercluster.js
node_modules/leaflet.markercluster/dist/MarkerCluster.css
node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css
```

### 개발 실행

```bash
npm start
```

---

## 빌드 및 배포

### 빌드 + zip 패키징 (권장)

```bash
# 방법 1: 배치 파일 더블클릭
build.bat

# 방법 2: 터미널
npm run pack
```

실행 후 프로젝트 루트에 `L-Benefit.zip`이 생성됩니다.

### 압축 해제 후 구조

```
L-Benefit-win32-x64/
 ├── L-Benefit.exe   ← 실행 파일
 ├── resources/
 └── ...
```

### 배포 전 체크리스트

- [ ] `main.js`에서 `openDevTools()` 줄 제거 (디버깅용)
- [ ] `data/affiliates.json`을 Confluence 최신본으로 교체
- [ ] `map_tiles/` 폴더의 줌 레벨과 `app.js`의 `minZoom` / `maxZoom` 일치 여부 확인

---

## 데이터 동기화 구조

앱 실행 시 아래 순서로 동작합니다.

```
1. 창 오픈 (즉시)
2. Confluence 로그인 (백그라운드)
   POST http://slm.lignex1.com/confluence/login.action
3. affiliates.json 다운로드
   GET  http://slm.lignex1.com/confluence/download/attachments/181662037/affiliates.json
4. 로컬 데이터와 비교
   - 변경 있음 → AppData/Roaming/L-Benefit/affiliates.json 갱신
   - 변경 없음 → 기존 데이터 유지
5. 화면 동기화 상태 업데이트 (좌하단)
```

**오프라인 / 동기화 실패 시:** 마지막으로 동기화된 `AppData` 파일 사용.  
**최초 설치 후 오프라인 시:** 번들 내 `data/affiliates.json` 사용.

---

## affiliates.json 데이터 형식

```json
{
  "version": "1.0",
  "affiliates": [
    {
      "name": "판교 한정식집",
      "category": "restaurant",
      "type": "domestic",
      "lat": 37.4030,
      "lng": 127.1100,
      "address": "경기도 성남시 분당구 판교로 00",
      "benefit": "10% 할인",
      "period": "2025.01.01 ~ 2025.12.31",
      "note": "임직원증 제시 필요",
      "link": "https://example.com"
    },
    {
      "name": "도쿄 파트너 호텔",
      "category": "hotel",
      "type": "overseas",
      "lat": null,
      "lng": null,
      "address": "일본 도쿄도 신주쿠구 00-00",
      "benefit": "15% 할인 + 조식 제공",
      "period": "2025.03.01 ~ 2025.12.31",
      "note": "사전 예약 필수",
      "link": "https://example.com"
    }
  ]
}
```

### 필드 설명

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | ✅ | 업체명 |
| `category` | ✅ | `office` / `hotel` / `restaurant` / `etc` |
| `type` | ✅ | `domestic` (국내) / `overseas` (해외) |
| `lat` / `lng` | 국내만 | 위도/경도 (해외는 `null`) |
| `address` | | 주소 |
| `benefit` | | 혜택 내용 |
| `period` | | 혜택 기간 |
| `note` | | 비고 |
| `link` | | 상세 링크 URL |

---

## 동기화 상태 표시

좌하단에 현재 동기화 상태가 표시됩니다.

| 상태 | 색상 | 메시지 |
|------|------|--------|
| `same` | 🟢 초록 | 최신 상태입니다 |
| `updated` | 🔵 파랑 | Confluence와 동기화되었습니다 |
| `offline` / `parse_error` | ⚫ 회색 | Confluence 연동을 확인하세요 |
