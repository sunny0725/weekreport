# 주간보고 일괄 요약 웹 개발 플랜

> 최대 5개 HWPX 문서를 업로드 → AI가 정해진 형식으로 요약 → 결과 다운로드

---

## 1. 핵심 아키텍처

```
Browser
  └─ /batch (Next.js Page)
       │  drag-and-drop 업로드 (최대 5개 .hwpx)
       ▼
  POST /api/batch-summarize
       │
       ├─ [Step 1] hwpx-extractor.ts
       │    HWPX(ZIP) → section*.xml → <hp:t> 노드 파싱
       │    구형 HWP(OLE) 감지 시 변환 안내 메시지 반환
       │
       └─ [Step 2] batch-summarizer.ts
            p-limit(4) 동시성 제어
            Claude Sonnet + 프롬프트 캐싱(cache_control)
            → JSON 필드별 요약 반환
```

---

## 2. 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|-----------|
| 프레임워크 | Next.js 16 (App Router) | API Route + 클라이언트 UI 통합 |
| HWPX 파싱 | JSZip + 정규식 | 외부 의존성 없이 ZIP 열기 |
| AI 요약 | Claude Sonnet (`claude-sonnet-4-6`) | 한국어 문서 이해, 프롬프트 캐싱 |
| 동시성 제어 | p-limit | API rate limit 보호 |
| 스타일 | Tailwind CSS v4 | 빠른 UI 구성 |
| 언어 | TypeScript | 타입 안전성 |

---

## 3. 파일 구조

```
app/
├── src/
│   ├── lib/
│   │   ├── hwpx.ts               # HWPX ZIP 조작 (플레이스홀더 치환)
│   │   ├── hwpx-extractor.ts     # HWPX 텍스트 추출 (OWPML hp:t 파싱)
│   │   ├── batch-summarizer.ts   # Claude AI 일괄 요약 엔진
│   │   └── report-generator.ts   # 단일 보고서 HWPX 생성
│   └── app/
│       ├── page.tsx              # F-01: 주간보고 입력 폼
│       ├── batch/page.tsx        # 일괄 요약 UI (5개 제한)
│       ├── inspect/page.tsx      # HWPX 텍스트 노드 탐색
│       └── api/
│           ├── report/route.ts           # HWPX 보고서 생성
│           ├── batch-summarize/route.ts  # 일괄 요약 API
│           └── inspect/route.ts          # 노드 검사 API
├── templates/
│   └── weekly_report_template.hwpx  # 기본 서식 (한글에서 변환)
└── docs/
    └── batch-summary-plan.md
```

---

## 4. 단계별 개발 플랜

### Phase 1 — 기반 인프라 (완료)

- [x] Next.js 16 프로젝트 초기화
- [x] `hwpx.ts` — ZIP 열기 / 플레이스홀더 치환 / 재패킹
- [x] `hwpx-extractor.ts` — `<hp:t>` 파싱, OLE 감지
- [x] `batch-summarizer.ts` — Claude API + p-limit + 캐싱
- [x] `/api/batch-summarize` — multipart 수신, 추출+요약 파이프라인
- [x] `/batch` — 드래그앤드롭 업로드 UI, 결과 카드, CSV 다운로드

### Phase 2 — HWP 원본 서식 연동

- [ ] **템플릿 HWPX 준비**
  - `240115_1월 3주_경영현안회의_AI미래전략센터_신.hwp` 를 한글 오피스에서 `.hwpx`로 저장
  - 치환할 셀/단락에 `{{TEAM_NAME}}`, `{{WEEK_LABEL}}`, `{{THIS_WEEK_DETAIL}}` 등 플레이스홀더 삽입
  - `templates/weekly_report_template.hwpx`로 저장
- [ ] `/inspect` 페이지로 텍스트 노드 인덱스 확인 후 플레이스홀더 위치 결정
- [ ] `/api/report` + `report-generator.ts`로 단일 보고서 생성 검증

### Phase 3 — 요약 형식 커스터마이징

- [ ] 사용자 정의 `SummaryFormat` JSON 업로드 UI (배치 페이지 내)
- [ ] 필드 추가/삭제 인터페이스 (드래그 정렬)
- [ ] 요약 결과 → HWPX 통합 출력 (요약본을 템플릿에 채워 .hwpx 다운로드)

### Phase 4 — 결과 포맷 다양화

- [ ] **Markdown** 출력: 팀별 요약을 Markdown 테이블로 변환
- [ ] **통합 HWPX** 출력: 5개 요약을 하나의 보고서로 병합
- [ ] **엑셀(XLSX)** 출력: 팀명 / 실적 / 계획 / 이슈 컬럼

### Phase 5 — 품질·운영

- [ ] 요약 결과 수동 편집 (인라인 textarea)
- [ ] 재요약 버튼 (개별 파일 단위)
- [ ] 처리 이력 저장 (localStorage 또는 PostgreSQL)
- [ ] API 키 관리 UI (서버 환경변수 연동)

---

## 5. HWPX 파싱 전략 (OWPML 기반)

```
한컴 OWPML 스펙 (hwpx-owpml-model 참조):

HWPX ZIP
├── mimetype          ← "application/hwp+zip"
├── Contents/
│   ├── content.hpf   ← 목차 (섹션 목록)
│   └── section0.xml  ← 본문 XML
│       ├── hp:sec    ← 섹션
│       │   ├── hp:p  ← 단락
│       │   │   └── hp:t  ← [텍스트 노드] ★ 추출 대상
│       │   └── hp:tbl ← 표
│       │       └── hp:tc → hp:p → hp:t
└── version.xml
```

**추출 우선순위**:
1. `hp:t` 텍스트 노드 직접 파싱 (가장 안정적)
2. 표 셀(`hp:tc`) 내부 텍스트는 `isTable=true` 마킹
3. 섹션 순서 보존 (`section0` → `section1` → …)

**구형 HWP(OLE) 처리**:
- 파일 첫 4바이트 `D0 CF 11 E0`로 감지
- 서버에서 변환 불가 → 클라이언트에 안내 메시지 반환
- 옵션: Python FastAPI 사이드카 + `hwp5` 라이브러리로 텍스트 추출

---

## 6. AI 요약 프롬프트 설계

### 시스템 프롬프트 (캐싱 대상)

```
정부기관 주간업무보고 분석 전문가로서
지정된 필드를 JSON으로 추출합니다.
```

→ 5개 파일 처리 시 1회만 과금, 나머지 4회는 캐시 적중

### 사용자 프롬프트 (파일별 동적)

```
파일명: {fileName}
=== 문서 텍스트 (최대 8000자) ===
{plainText}

=== 추출 지시 ===
{ "team": "팀명", "thisWeek": "금주 실적 3~5개", ... }
```

### 비용 추정 (claude-sonnet-4-6 기준, 5개 파일)

| 항목 | 토큰 수 | 비용 |
|------|---------|------|
| 시스템 프롬프트 (캐시 쓰기 1회) | ~200 | $0.003 |
| 시스템 프롬프트 (캐시 읽기 4회) | ~800 | $0.001 |
| 문서 텍스트 5개 × 2,000 토큰 | ~10,000 | $0.030 |
| 출력 5개 × 500 토큰 | ~2,500 | $0.015 |
| **합계** | | **≈ $0.05** |

---

## 7. 환경 변수

```bash
ANTHROPIC_API_KEY=sk-ant-...   # 필수
REPORT_OUTPUT_DIR=./output      # 선택 (기본값 사용)
```

---

## 8. 실행 방법

```bash
# 1. 의존성 설치
cd weekplan/app
npm install

# 2. 환경 변수 설정
cp .env.local.example .env.local
# .env.local에 ANTHROPIC_API_KEY 입력

# 3. 개발 서버 시작
npm run dev
# → http://localhost:3000

# 페이지
# /          ← 단일 보고서 작성 (F-01, F-02)
# /batch     ← 5개 파일 일괄 요약
# /inspect   ← HWPX 텍스트 노드 탐색
```

---

## 9. 다음 단계 우선순위

1. **[즉시]** 기존 .hwp → .hwpx 변환 + 플레이스홀더 삽입
2. **[단기]** Phase 3: 요약 결과를 HWPX 템플릿에 자동 채우기
3. **[중기]** Phase 4: 통합 보고서 HWPX 단일 파일 출력
4. **[장기]** Phase 5: 편집·이력 관리·다국어 지원
