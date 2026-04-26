# 주간 업무보고 자동화 시스템 (Weekly Report Automation)

## 프로젝트 개요

주간 업무보고 작성·관리·배포를 자동화하는 웹 애플리케이션.  
팀원이 UI에서 업무 내용을 입력하면 AI가 보고서를 생성하고, Git으로 버전을 관리하며, 승인 워크플로우를 통해 배포까지 처리한다.

---

## 기능 명세

### F-01: 업무 데이터 입력 및 수집

- 웹 UI 기반 주간 업무 입력 폼
  - 금주 실적 (What I Did)
  - 차주 계획 (What I Plan)
  - 이슈 / 리스크 (Issues & Risks)
- Jira / GitHub Issues 연동 — 완료 티켓 자동 집계
  - Jira REST API (`/rest/api/3/search`) JQL 쿼리로 해당 주 완료 이슈 수집
  - GitHub Issues API (`/repos/:owner/:repo/issues`) 로 closed 이슈 수집
  - 중복 제거 후 실적 항목에 자동 매핑

### F-02: 보고서 자동 생성

- 기관/팀별 맞춤 양식 자동 생성
  - 출력 포맷: DOCX / PDF / Markdown
  - 팀별 템플릿 관리 (templates/ 디렉토리)
- AI 기반 업무 내용 자동 요약 및 문장 정제
  - Claude API (claude-sonnet-4-6) 사용
  - 프롬프트 캐싱 적용으로 비용 절감
- KPI 달성률 자동 계산 및 시각화 차트 삽입
  - 목표 대비 실적 비율 계산
  - Chart.js / Matplotlib 차트를 보고서에 임베드
- 다국어 지원: 한국어(기본), 영어

### F-03: Git 기반 버전 관리

- 생성된 보고서 자동 Git 커밋
  - 커밋 메시지 형식: `feat(report): YYYY-WW 주간보고 - {작성자} [{팀명}]`
  - 날짜·작성자·팀 메타데이터를 커밋 본문에 포함
- 주차별 브랜치 자동 생성 및 병합 관리
  - 브랜치 네이밍: `report/YYYY-WW/{team-slug}`
  - 승인 완료 시 `main` 브랜치로 자동 병합
- 보고서 버전 diff 뷰어 — 변경 내역 시각화
  - 이전 버전 대비 추가/삭제 라인 하이라이트
- 지원 플랫폼: GitHub / GitLab / Gitea

### F-04: 승인 및 배포 워크플로우

- 파이프라인: 팀원 제출 → 팀장 검토 → 승인 → 자동 배포
- 승인 거부 시: 의견 첨부 및 재작성 요청 알림 발송
- 상태 enum: `DRAFT` → `SUBMITTED` → `IN_REVIEW` → `APPROVED` | `REJECTED` → `DEPLOYED`

---

## 기술 스택 (권장)

| 레이어 | 기술 |
|--------|------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) 또는 Next.js API Routes |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| 문서 생성 | python-docx (DOCX), WeasyPrint (PDF) |
| DB | PostgreSQL + Prisma ORM |
| 버전 관리 | GitPython / libgit2 |
| 인증 | NextAuth.js (OAuth — GitHub / Google) |

---

## 디렉토리 구조

```
weekplan/
├── CLAUDE.md
├── apps/
│   ├── web/               # Next.js 프론트엔드
│   └── api/               # FastAPI 백엔드
├── packages/
│   ├── report-generator/  # 보고서 생성 로직
│   ├── git-manager/       # Git 자동화
│   └── ai-summarizer/     # Claude API 연동
├── templates/             # 팀별 보고서 템플릿 (DOCX/MD)
├── docs/                  # 설계 문서
└── samples/               # 샘플 보고서 (기존 .hwp 참고용)
```

---

## 파일 네이밍 컨벤션

기존 샘플 파일 패턴을 기준으로 한다:

```
YYMMDD_M월 N주_회의명_팀명[_버전].hwp
→ YYYY-WW_{팀슬러그}_주간보고[_vN].{ext}
예) 2024-03_ai-data_weekly-report_v1.docx
```

---

## 개발 규칙

- Claude API 호출 시 **프롬프트 캐싱** 필수 적용 (`cache_control` 헤더)
- 보고서 생성 프롬프트는 `packages/ai-summarizer/prompts/` 에 별도 관리
- 모든 Git 조작은 `packages/git-manager/` 를 통해서만 수행 (직접 shell 호출 금지)
- 승인 워크플로우 상태 변경은 트랜잭션 내에서 처리 (부분 실패 방지)
- 다국어 문자열은 `i18n/` 디렉토리의 JSON 파일로 관리
- API 키 / 시크릿은 `.env.local` 에만 저장, 절대 커밋 금지

---

## 환경 변수

```
ANTHROPIC_API_KEY=          # Claude API 키
JIRA_BASE_URL=              # Jira 인스턴스 URL
JIRA_API_TOKEN=             # Jira API 토큰
GITHUB_TOKEN=               # GitHub Personal Access Token
GITLAB_TOKEN=               # GitLab 토큰 (선택)
DATABASE_URL=               # PostgreSQL 연결 문자열
NEXTAUTH_SECRET=            # NextAuth 시크릿
REPORT_OUTPUT_DIR=          # 생성된 보고서 저장 경로
```

---

## 참고 샘플

`samples/` (또는 프로젝트 루트의 .hwp 파일) 에 실제 주간보고 예시가 포함되어 있다.  
보고서 템플릿 설계 및 AI 요약 품질 검증 시 참고할 것.
