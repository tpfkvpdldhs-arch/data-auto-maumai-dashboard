# AGENTS Guide

이 문서는 이 저장소를 다루는 사람이나 코딩 에이전트가 빠르게 맥락을 잡고, 실수 없이 변경 범위를 판단할 수 있도록 만든 작업용 안내서입니다.

상세 운영 절차는 아래 문서를 먼저 참고하세요.

- `README.md`: 프로젝트 개요와 전체 데이터 흐름
- `BEGINNER_MANUAL_KO.md`: 비개발자용 설치/운영 가이드
- `automation/worker/README.md`: 작업자 PC 자동화
- `dashboard/README.md`: 대시보드 실행/배포
- `supabase/README.md`: Supabase 스키마/함수 배포

## 1. 프로젝트 구조

- `dashboard`
  - Next.js 기반 내부 대시보드, 공개용 viewer, 관리자 UI
- `automation/worker`
  - 작업자 PC에서 돌아가는 CSV 생성/업로드 자동화 스크립트
- `supabase/migrations`
  - 테이블, 뷰, alias 테이블 등 스키마 정의
- `supabase/functions/ingest-worker-daily`
  - 작업자 payload를 받아 `recording_sessions`에 적재하는 Edge Function

## 2. 시스템 핵심 흐름

1. 작업자 PC에서 `run_daily_upload.sh` 실행
2. `collect_and_upload.py`가 필요시 `calc_recording_csv.sh` 호출
3. `recording_duration.csv` 생성
4. `integrity_ok=false` 행은 업로드 전에 reject
5. 정상 행만 Supabase Edge Function으로 업로드
6. `recording_sessions` / `legacy_daily_metrics` / 뷰 집계를 통해 대시보드 표시

중요:
- 이 시스템은 "모든 데이터를 올리는" 것이 아니라, "신뢰 가능한 데이터만 올리는" 구조입니다.
- 무결성 검사 실패 데이터는 CSV에는 남지만 DB에는 올라가지 않는 것이 정상입니다.

## 3. 인증 / 접근 제어

### 내부 대시보드 `/`

- Supabase Auth 기반 Google 로그인 사용
- `@maum.ai` 계정만 허용
- 더 이상 `INTERNAL_DASHBOARD_TOKEN`을 쓰지 않음

관련 파일:
- `dashboard/lib/dashboard-access.ts`
- `dashboard/app/auth/login/page.tsx`
- `dashboard/app/auth/callback/route.ts`
- `dashboard/app/auth/logout/route.ts`
- `dashboard/middleware.ts`

### 공개용 `/viewer`

- URL query의 `token`과 `PUBLIC_VIEW_TOKEN`을 비교
- 고객사 공유용 읽기 전용 화면
- 내부 대시보드에서 생성한 공유 링크의 필터를 그대로 고정 적용

### 관리자 `/admin`

- 페이지 진입 자체는 내부 로그인 필요
- 실제 관리자 API 호출은 `ADMIN_API_TOKEN` 필요

## 4. 현재 대시보드 동작 기준

### 내부 대시보드

- 기본 시작일: `2026-02-02`
- 기본 기준 데이터(h): `24.7`
- 기본 목표일: 매년 `4월 17일`
- 맵/작업자/시나리오 필터 옵션은 `all_daily_metrics` 기준으로 동적 생성

### 공개용 viewer

- 총 데이터 시간은 `기준 데이터(h)`까지 합친 값으로 표시
- 하단에 `[대시보드 구현 이전 데이터 'n' 시간 포함]` 문구 표시
- 기간/작업자/맵/시나리오 편집 UI는 숨김
- 내부 대시보드에서 만든 고정 필터 링크를 재현하는 읽기 전용 화면으로 취급

중요:
- 공개용 링크는 `start`, `end`, `baseline`, `workers`, `maps`, `scenarios`를 모두 query string에 담습니다.
- 예전 링크는 예전 필터만 유지하므로, 필터 상태를 바꿨으면 새 링크를 다시 생성해야 합니다.

관련 파일:
- `dashboard/app/api/public-link/route.ts`
- `dashboard/app/viewer/page.tsx`
- `dashboard/components/public-viewer-client.tsx`
- `dashboard/app/api/public-summary/route.ts`
- `dashboard/app/api/public-map-detail/route.ts`

## 5. 공개용 viewer 관련 절대 지켜야 할 규칙

이 저장소에서는 공개용 API 응답 stale 문제가 실제로 있었고, 아래 방식으로 해결했습니다. 이 부분은 되돌리지 않는 것이 좋습니다.

- 공개용 API에는 강한 `no-store` 캐시 헤더 유지
- 공개용 클라이언트 요청에는 cache buster(`_ts`) 유지

관련 파일:
- `dashboard/app/api/public-summary/route.ts`
- `dashboard/app/api/public-map-detail/route.ts`
- `dashboard/components/public-viewer-client.tsx`

공개용 응답이 이상할 때는 코드 로직만 보지 말고 캐시 여부도 먼저 의심하세요.

## 6. 맵 Alias / Canonical 집계

맵 이름이 바뀌어도 같은 맵으로 묶어 보기 위해, DB 원본을 수정하지 않고 앱 레벨에서 canonical map으로 재매핑합니다.

예:
- `east12 -> east123`

핵심 규칙:
- 비교 기준은 `map_code` exact match
- active alias가 있으면 canonical map으로 치환
- 치환은 집계 시점에만 적용
- `recording_sessions.map_code`와 `all_daily_metrics.map_code` 원본은 그대로 유지

관련 파일:
- `dashboard/lib/map-code-aliases.ts`
- `dashboard/app/api/map-aliases/route.ts`
- `dashboard/components/admin-overrides-client.tsx`
- `supabase/migrations/20260402093000_map_code_aliases.sql`

중요 구현 규칙:
- 맵 필터는 DB query 단계가 아니라 canonicalization 이후 앱 레벨에서 적용해야 alias가 제대로 묶입니다.
- 내부 대시보드와 공개용 viewer는 둘 다 같은 alias 엔진을 써야 합니다.

## 7. 시나리오 규칙

현재 시나리오 오버라이드는 exact match가 아니라 contains-match입니다.

- `scenario_overrides.match_pattern`이 `map_segment`에 포함되면 적용
- 더 긴 패턴 우선
- 길이가 같으면 더 최신 `updated_at` 우선
- 우선순위: `manual override > scenario_input > 기본 규칙 > unknown`

과거 데이터도 뷰 집계에서 override가 반영됩니다.

## 8. 작업자 PC 자동화 주의점

핵심 파일:
- `automation/worker/calc_recording_csv.sh`
- `automation/worker/collect_and_upload.py`
- `automation/worker/run_daily_upload.sh`

현재 무결성 검사에서 중요 포인트:
- `integrity_ok=false`면 업로드에서 제외
- 대표 실패 사유:
  - `log_missing`
  - `json_missing`
  - `npy_missing`
  - `npy_empty`
  - `mcap_dir_missing`
  - `mcap_metadata_missing`
  - `mcap_file_missing`
  - `map_segment_missing`
  - `timestamp_missing`
  - `duration_invalid`
  - `non_positive_duration`
  - `mcap_small_without_topic_subscription`
  - `log_error_detected`

중요:
- `mcap_filename_mismatch`는 현재 무결성 실패 조건에서 제외되어 있습니다.

운영 반영 시 자주 헷갈리는 점:
- CSV 생성 스크립트만 바뀐 경우 작업자 PC에는 `calc_recording_csv.sh`만 재배포하면 되는 경우가 많음
- 업로드 로직이 바뀐 경우에만 `collect_and_upload.py`도 같이 교체
- 작업자 PC 반영 후에는 `--dry-run`으로 먼저 확인

## 9. DB / 대시보드 / 작업자 반영 순서

### DB 스키마가 바뀐 경우

1. `supabase db push`
2. Edge Function 변경이 있으면 `supabase functions deploy ingest-worker-daily --no-verify-jwt`
3. 대시보드 변경이 있으면 Vercel 재배포

### 대시보드만 바뀐 경우

- 보통 `dashboard` 재배포만 하면 됨
- DB migration이나 worker 재배포는 불필요한 경우가 많음

### worker 스크립트만 바뀐 경우

- 작업자 PC의 `/opt/data-ops/` 아래 파일만 갱신
- Supabase / Vercel 영향 없음

## 10. 로컬 검증 명령

### dashboard

```bash
cd dashboard
npm run build
npm run typecheck
```

주의:
- 이 저장소는 `.next/types`를 참조하므로, `typecheck` 전에 `build`를 먼저 돌리는 편이 안전합니다.

### worker

```bash
bash -n automation/worker/calc_recording_csv.sh
python3 -m unittest automation.worker.tests.test_collect_and_upload
```

## 11. 배포/환경변수 관련 체크리스트

### Vercel

필수 env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_TOKEN`
- `PUBLIC_VIEW_TOKEN`

### Supabase Auth

- Google provider 활성화
- `Site URL`은 운영 도메인
- `Additional Redirect URLs`에는 로컬과 운영 callback 모두 포함

예:
- `http://localhost:3000/**`
- `http://127.0.0.1:3000/**`
- `https://<prod-domain>/**`

주의:
- 로컬과 운영을 둘 다 쓰려면 `Site URL`만 바꾸는 것으로는 부족하고, `Additional Redirect URLs` 설정이 꼭 필요합니다.

## 12. 디버깅할 때 먼저 볼 것

### 내부 대시보드에서 `unauthenticated`

- Google 로그인 세션 유지 여부
- `/api/summary`가 401인지
- Supabase Auth env / redirect 설정 문제인지

### 공개용 링크에서 `invalid public_view_token`

- 링크를 생성한 호스트와 호출한 호스트가 같은지
- `PUBLIC_VIEW_TOKEN`이 Vercel에 설정돼 있는지
- query string이 일부 잘리지 않았는지

### 새 맵이 필터에 안 보임

- 먼저 `all_daily_metrics`에 데이터가 있는지 확인
- 그 다음 `/api/options` 응답 확인
- 이 프로젝트에서는 필터 옵션이 집계 데이터 기준으로 동기화됩니다.

## 13. 자주 쓰는 테이블 / 개념

- `recording_sessions`
  - 업로드된 원본 세션 row
- `legacy_daily_metrics`
  - 과거 CSV 백필용 집계 row
- `daily_metrics`, `all_daily_metrics`
  - 대시보드용 뷰
- `worker_day_overrides`
  - 작업시간 예외
- `scenario_overrides`
  - contains-match 시나리오 override
- `map_code_aliases`
  - canonical map alias 규칙

## 14. 이 저장소에서 변경할 때의 기본 원칙

- 원본 데이터보다 집계/표시 계층에서 해결 가능한 문제는 가능하면 그쪽에서 처리
- 운영자가 수동으로 관리해야 하는 규칙은 admin UI와 API로 노출
- 공개용 viewer는 읽기 전용으로 유지
- worker 업로드 품질 방어 로직은 쉽게 완화하지 말고, 완화할 때는 운영 이유를 분명히 남길 것
- 공개용 viewer 관련 변경은 캐시와 고정 필터 링크 특성을 항상 같이 고려할 것

## 15. 추천 작업 순서

새 작업을 시작할 때는 보통 아래 순서가 안전합니다.

1. 루트 `README.md`와 관련 하위 README 확인
2. 변경 범위가 `dashboard` / `worker` / `supabase` 중 어디인지 먼저 판단
3. DB migration 필요 여부 판단
4. 로컬 검증
5. 필요한 반영 순서대로 배포

이 문서는 2026-04-08 기준 저장소 상태와 누적 운영 컨텍스트를 반영합니다.
