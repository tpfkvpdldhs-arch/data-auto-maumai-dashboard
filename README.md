# 데이터 수집 자동 집계 대시보드

Supabase를 중앙 저장소로 사용해 작업자 PC에서 생성되는 녹화 데이터를 자동으로 수집하고, 웹 대시보드에서 일별 수집량과 품질을 확인할 수 있게 만든 운영용 프로젝트입니다.

이 저장소는 두 가지 문제를 같이 해결하는 데 목적이 있습니다.

1. 작업자 PC마다 흩어져 있는 데이터를 중앙에서 같은 기준으로 집계한다.
2. 오류가 있는 데이터를 업로드 전에 걸러서 대시보드 통계가 오염되지 않게 한다.

이 문서는 GitHub 첫 화면에서 프로젝트 구조와 동작 방식을 빠르게 이해하기 위한 개요입니다. 설치/운영 절차는 아래 문서를 참고하세요.

- 상세 설치/운영 가이드: [BEGINNER_MANUAL_KO.md](./BEGINNER_MANUAL_KO.md)
- 작업자 PC 자동화 세부: [automation/worker/README.md](./automation/worker/README.md)
- 대시보드 실행/배포 세부: [dashboard/README.md](./dashboard/README.md)

## 무엇을 하는 시스템인가

이 시스템은 작업자 PC의 원본 녹화 파일을 바로 DB에 올리지 않습니다. 먼저 로컬에서 `recording_duration.csv`를 만들고, 그 과정에서 정합성 문제가 있는 행을 표시한 뒤, 정상 행만 Supabase로 업로드합니다. 대시보드는 이렇게 정제된 데이터를 기준으로 일별/작업자별/맵별/시나리오별 집계를 보여줍니다.

핵심 특징:

- 작업자 PC에서 매일 cron으로 자동 실행
- 업로드 실패 시 spool 파일로 보관 후 재전송
- `integrity_ok=false`인 행은 업로드 전에 제외
- 시나리오 규칙은 `match_pattern` 기반 contains-match로 관리
- 대시보드 필터 옵션은 현재 집계 데이터(`all_daily_metrics`)를 기준으로 동기화

## 저장소 구성

| 경로 | 역할 |
| --- | --- |
| `dashboard` | Next.js 기반 대시보드와 관리자 UI |
| `automation/worker` | 작업자 PC 자동화 스크립트 |
| `supabase/migrations` | 테이블/뷰/정책 정의 |
| `supabase/functions/ingest-worker-daily` | 작업자 업로드를 받는 Edge Function |
| `supabase/scripts` | 초기 백필 등 보조 스크립트 |

## 전체 데이터 흐름

```mermaid
flowchart LR
  A["작업자 PC 원본 파일<br/>bag / bag_failed"] --> B["calc_recording_csv.sh<br/>recording_duration.csv 생성"]
  B --> C["integrity 검사<br/>integrity_ok / integrity_reason 기록"]
  C --> D["collect_and_upload.py<br/>정상 행만 payload 구성"]
  D --> E["Supabase Edge Function<br/>ingest-worker-daily"]
  E --> F["recording_sessions 적재"]
  F --> G["daily_metrics / all_daily_metrics 집계"]
  G --> H["Next.js 대시보드"]
```

## 대시보드의 구현 목적

대시보드는 “얼마나 많이 모였는가”와 “얼마나 믿을 수 있는가”를 한 화면에서 확인하는 운영 도구입니다.

주요 화면/기능:

- 일별 누적 수집 시간과 목표 대비 진행률
- 작업자별 수집 시간과 효율
- 맵/시나리오 조합별 집계
- 실패 데이터 비율과 품질 지표
- 관리자 화면(`/admin`)에서 작업시간 오버라이드와 시나리오 규칙 관리

최근 반영된 운영 규칙:

- 시나리오 오버라이드는 exact match가 아니라 `match_pattern`이 `map_segment`에 포함되면 적용됩니다.
- 우선순위는 `관리자 규칙 > 작업자 입력 scenario_input > 기본 규칙 > unknown`입니다.
- 대시보드의 작업자/맵/시나리오 필터 옵션은 `all_daily_metrics` 기준으로 생성되므로, 새 맵 코드가 집계에 들어오면 필터에도 반영되도록 설계되어 있습니다.

## 작업자 PC 자동화는 어떻게 동작하는가

작업자 PC 자동화의 시작점은 `run_daily_upload.sh` 입니다.

1. `run_daily_upload.sh`
   - 환경파일을 읽고 `collect_and_upload.py`를 실행합니다.
2. `collect_and_upload.py`
   - 필요하면 `calc_recording_csv.sh`를 먼저 호출해 `recording_duration.csv`를 생성합니다.
   - CSV를 읽어 정상 행만 payload로 묶습니다.
   - 업로드 실패 시 spool 디렉터리에 JSON payload를 남겼다가 다음 실행 때 재전송합니다.
3. `calc_recording_csv.sh`
   - `bag`, `bag_failed` 폴더를 스캔합니다.
   - `.recording.log`, `.json`, `.npy`, `.mcap`를 조합해 한 세션당 한 행의 CSV를 만듭니다.
   - 이때 `integrity_ok`, `integrity_reason` 컬럼을 같이 생성합니다.

작업자 PC 입력 파일:

- `.recording.log`
- `.json`
- `.npy`
- `.mcap` 디렉터리와 내부 `.mcap` 파일

작업자 PC 출력 파일:

- `recording_duration.csv`
  - 예시 컬럼: `source_folder`, `filename`, `start_time`, `end_time`, `duration_sec`, `map_segment`, `map_name`, `scenario_input`, `integrity_ok`, `integrity_reason`

## 오류 데이터는 어디서 검출하고 어디서 막는가

이 프로젝트에서 가장 중요한 운영 포인트는 “이상한 데이터가 대시보드에 들어가기 전에 막힌다”는 점입니다.

### 1. CSV 생성 단계에서 먼저 표시

`automation/worker/calc_recording_csv.sh`는 세션별로 파일 존재 여부와 로그 상태를 검사해 `integrity_ok`를 계산합니다.

대표적인 실패 사유:

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

현재는 `mcap_filename_mismatch`를 무결성 실패 조건으로 사용하지 않습니다. 이름이 다르더라도 실제 운영에서 오탐이 많았기 때문에 제외된 상태입니다.

### 2. 업로드 단계에서 실제로 제외

`automation/worker/collect_and_upload.py`는 CSV를 읽을 때 `integrity_ok=false`인 행을 reject 합니다. 즉, 불량 행은 CSV에는 남지만 Supabase로 전송되는 payload에는 포함되지 않습니다.

정리하면:

- CSV에는 남아서 원인 분석 가능
- 업로드 payload에서는 제외
- 결과적으로 대시보드 집계에는 반영되지 않음

이 구조 덕분에 “수집은 되었지만 믿을 수 없는 데이터”를 운영 지표에서 분리할 수 있습니다.

## Supabase와 시나리오 규칙

업로드가 통과한 데이터는 Edge Function `ingest-worker-daily`를 통해 `recording_sessions`에 적재됩니다. 이후 `daily_metrics`, `all_daily_metrics` 뷰에서 집계되어 대시보드에 사용됩니다.

시나리오 규칙 관련 핵심:

- 기본 규칙
  - `r_road*` -> `mowing`
  - `f_outline*` -> `fairway_outline`
- 관리자 규칙
  - `scenario_overrides.match_pattern`이 `map_segment`에 포함되면 적용
  - 가장 긴 패턴 우선, 동률이면 더 최신 `updated_at` 우선
- 과거 데이터도 집계 뷰에서 override가 반영됨

관리자 오버라이드 관련 테이블:

- `worker_day_overrides`
- `scenario_overrides`

## 대시보드/관리자 API 개요

대시보드 쪽 주요 API:

- `GET /api/options`
  - 작업자/맵/시나리오 필터 옵션 반환
- `GET /api/summary`
  - 차트와 표에 필요한 집계 데이터 반환
- `GET /api/health`
  - 배포 환경변수 체크

관리자 API:

- `GET|POST|DELETE /api/overrides`
  - 작업시간 오버라이드 관리
- `GET|POST|DELETE /api/scenario-overrides`
  - contains-match 기반 시나리오 규칙 관리

관리자 API는 모두 `ADMIN_API_TOKEN`을 `x-admin-token` 헤더로 전달해야 합니다.

## 이 프로젝트를 이해할 때 중요한 운영 관점

이 시스템은 단순히 데이터를 “모으는” 프로젝트가 아니라, 운영자가 결과를 신뢰할 수 있게 만드는 프로젝트입니다.

따라서 핵심은 아래 세 가지입니다.

1. 작업자 PC에서 자동으로 수집/업로드가 돌아간다.
2. 오류 데이터는 업로드 전에 걸러진다.
3. 중앙 대시보드에서 수집량, 품질, 규칙 오버라이드를 함께 관리한다.

## 관련 문서

- 설치/운영 전체 절차: [BEGINNER_MANUAL_KO.md](./BEGINNER_MANUAL_KO.md)
- 작업자 자동화 상세: [automation/worker/README.md](./automation/worker/README.md)
- 대시보드 로컬 실행/배포: [dashboard/README.md](./dashboard/README.md)
- Supabase 함수 배포 메모: [IMPLEMENTATION.md](./IMPLEMENTATION.md)
