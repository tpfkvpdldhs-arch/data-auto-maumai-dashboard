# 비개발자용 상세 매뉴얼 (자동 집계 + 대시보드)

이 문서는 개발 경험이 거의 없는 분도 따라 할 수 있게 작성한 실무용 가이드입니다.

## 0. 먼저 이해할 것 (아주 중요)

1. `Recharts`는 회원가입이 필요 없습니다.
Recharts는 웹 화면에 그래프를 그리는 "코드 라이브러리"입니다.

2. `Supabase`는 회원가입이 1회 필요합니다.
클라우드 Supabase를 쓰려면 프로젝트를 만들기 위해 계정이 있어야 합니다.
한 번 설정한 후에는 작업자 PC가 매번 로그인할 필요는 없습니다.

3. 작업자 PC는 매일 20:00에 자동으로 업로드만 수행합니다.
상사는 웹 대시보드만 확인하면 됩니다.

---

## 1. 전체 진행 순서 (요약)

1. Supabase 프로젝트 생성
2. DB 스키마(SQL) 적용
3. Edge Function 배포
4. 작업자별 토큰 발급/등록
5. 과거 `data.csv` 백필(이관)
6. 작업자 PC 자동 실행(cron) 설정
7. 대시보드 실행(또는 배포)
8. 매일 20:10 점검

---

## 2. 준비물

1. 관리용 PC 1대
이 PC에서 Supabase 설정, 대시보드 실행, 초기 백필을 진행합니다.

2. 작업자 Linux PC 여러 대
각 PC에서 매일 자동 업로드를 수행합니다.

3. 현재 프로젝트 폴더
이 문서 기준 폴더: `/Users/jh.kim/Documents/data-auto-maumai-dashboard`

4. GitHub 저장소
부서 팀원들이 같은 코드를 내려받아 활용하려면 GitHub 저장소가 필요합니다.

현재 저장소:
- [https://github.com/tpfkvpdldhs-arch/data-auto-maumai-dashboard](https://github.com/tpfkvpdldhs-arch/data-auto-maumai-dashboard)

5. 인터넷 연결
Supabase 클라우드 업로드를 위해 필요합니다.

---

## 3. Supabase 설정 (처음 1회)

### 3-1. Supabase 프로젝트 만들기

1. 브라우저에서 Supabase 접속
2. 회원가입/로그인
3. `New project` 클릭
4. 프로젝트 이름 입력 (예: `data-auto-maumai`)
5. 데이터베이스 비밀번호 설정 후 생성 완료

### 3-2. 프로젝트 URL/키 확인

1. Supabase 프로젝트 `Settings` -> `API`
2. 아래 값 메모
   - `Project URL` (예: `https://xxxx.supabase.co`)
   - `service_role` key (대시보드 서버에서 사용)

주의: `service_role` 키는 절대 작업자 PC에 넣지 마세요.

### 3-3. DB 스키마 적용

권장 방법은 SQL Editor에 직접 붙여넣기보다 Supabase CLI 마이그레이션 적용입니다.

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push
```

`<PROJECT_REF>`는 Supabase 프로젝트 URL 마지막 문자열입니다.

실행 후 아래 테이블/뷰가 있으면 정상입니다.
- `workers`
- `worker_tokens`
- `recording_sessions`
- `scenario_overrides`
- `worker_day_overrides`
- `legacy_daily_metrics`
- `daily_metrics`
- `all_daily_metrics`

주의:
- 초기 마이그레이션과 이후 마이그레이션이 순서대로 적용되어야 합니다.
- `scenario_overrides`는 현재 `match_pattern` 기반 contains 규칙으로 동작합니다.

---

## 4. Edge Function 배포 (처음 1회)

이 단계는 터미널 명령을 복사/붙여넣기 하면 됩니다.

### 4-1. 관리용 PC에서 실행

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"

# Supabase CLI가 없다면 설치 (macOS)
brew install supabase/tap/supabase

# 로그인
supabase login
```

브라우저가 뜨면 로그인 승인합니다.

### 4-2. 프로젝트 연결

`<PROJECT_REF>`는 Supabase 프로젝트 대시보드 URL에서 확인 가능합니다.

```bash
supabase link --project-ref <PROJECT_REF>
```

### 4-3. 함수 배포

중요: 이 함수는 우리가 만든 토큰 인증을 사용하므로 `--no-verify-jwt` 옵션이 필요합니다.

```bash
supabase functions deploy ingest-worker-daily --no-verify-jwt
```

스키마 변경 후 반영 순서는 아래가 안전합니다.

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
supabase db push
supabase functions deploy ingest-worker-daily --no-verify-jwt
```

즉, DB 마이그레이션이 먼저이고 Edge Function 배포가 그 다음입니다.

---

## 5. 작업자 토큰 발급/등록 (작업자 수만큼 반복)

작업자 1명당 고유 `worker_id`와 토큰 1개가 필요합니다.

### 5-1. 토큰 생성

관리용 PC 터미널에서 작업자별로 실행:

```bash
openssl rand -hex 32
```

출력된 문자열이 해당 작업자의 `WORKER_TOKEN`입니다.

### 5-2. Supabase에 토큰 등록

Supabase SQL Editor에 아래를 작업자마다 실행:

```sql
insert into public.workers(worker_id, display_name, is_active)
values ('worker-01', 'worker-01', true)
on conflict (worker_id) do update set
  display_name = excluded.display_name,
  is_active = true;

insert into public.worker_tokens(token_hash, worker_id)
values (public.hash_worker_token('<여기에_방금_생성한_토큰>'), 'worker-01')
on conflict (token_hash) do nothing;
```

`worker-01`은 실제 작업자 ID로 바꿔서 사용하세요.

---

## 6. 과거 데이터(`data.csv`) 이관 (처음 1회)

이 단계는 기존 수동 누적값을 대시보드에 넣는 작업입니다.

### 6-1. SQL 생성

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
python3 supabase/scripts/generate_legacy_backfill_sql.py \
  --csv data.csv \
  --out supabase/backfill_legacy.sql \
  --year 2026
```

### 6-2. Supabase에 실행

1. 생성된 파일 열기: `supabase/backfill_legacy.sql`
2. 파일 전체를 SQL Editor에 붙여넣기
3. 실행

완료 후 `legacy_daily_metrics`에 데이터가 들어갑니다.

---

## 7. 작업자 PC 자동화 설정 (PC별 1회)

이 단계는 각 Linux 작업자 PC에서 동일하게 반복합니다.

## 7-1. 필수 패키지 설치

```bash
sudo apt update
sudo apt install -y python3 jq bc curl util-linux
```

## 7-2. 스크립트 배치

작업자 PC에 아래 파일 3개가 있어야 합니다.
- `calc_recording_csv.sh`
- `collect_and_upload.py`
- `run_daily_upload.sh`

권장 경로:

```bash
sudo mkdir -p /opt/data-ops
sudo cp /path/to/calc_recording_csv.sh /opt/data-ops/calc_recording_csv.sh
sudo cp /path/to/collect_and_upload.py /opt/data-ops/collect_and_upload.py
sudo cp /path/to/run_daily_upload.sh /opt/data-ops/run_daily_upload.sh
sudo chmod +x /opt/data-ops/*.sh /opt/data-ops/*.py
```

`/path/to/...`는 실제 파일 위치로 바꿔주세요.

## 7-3. 환경파일 생성

작업자 PC에서 `~/data_uploader.env` 파일 생성:

```bash
cat > ~/data_uploader.env <<'ENV'
WORKER_ID=worker-01
SUPABASE_URL=https://<your-project>.supabase.co
WORKER_TOKEN=<해당_작업자_토큰>
TIMEZONE=Asia/Seoul
DATA_ROOT=/home/worv/sim_workstation/data
CALC_SCRIPT=/opt/data-ops/calc_recording_csv.sh
SPOOL_DIR=/home/worv/.data_uploader/spool
INGEST_ENDPOINT=https://<your-project>.supabase.co/functions/v1/ingest-worker-daily
ENV

chmod 600 ~/data_uploader.env
```

중요:
- `WORKER_ID`와 토큰은 작업자마다 달라야 합니다.
- `DATA_ROOT`는 실제 데이터 폴더 위치와 같아야 합니다.

환경파일이 제대로 저장됐는지 확인:

```bash
grep '^CALC_SCRIPT=' /home/worv/data_uploader.env
```

출력 예시:

```text
CALC_SCRIPT=/opt/data-ops/calc_recording_csv.sh
```

## 7-4. 수동 테스트 (필수)

먼저 dry-run:

```bash
/opt/data-ops/run_daily_upload.sh --env-file "$HOME/data_uploader.env" --dry-run
```

CSV가 정상 생성됐는지 확인:

```bash
head -n 5 /home/worv/sim_workstation/data/recording_duration.csv
```

확인 포인트:
- 파일이 실제로 생성되었는지
- 헤더가 정상인지
- `integrity_ok`, `integrity_reason` 컬럼이 보이는지

실제 업로드 테스트:

```bash
/opt/data-ops/run_daily_upload.sh --env-file "$HOME/data_uploader.env"
```

성공 예시 로그:
- `upload success accepted=... duplicate=... rejected=...`

## 7-5. cron 등록 (기본: 매일 20:00)

```bash
crontab -e
```

아래 2줄 추가:

```cron
CRON_TZ=Asia/Seoul
0 20 * * * flock -n /tmp/data_uploader.lock /opt/data-ops/run_daily_upload.sh --env-file /home/worv/data_uploader.env >> /home/worv/data_uploader.log 2>&1
```

이 시간은 필요에 따라 수정할 수 있습니다.

cron 시간 형식은 아래 순서입니다.

```text
분 시 일 월 요일
```

현재 설정:

```cron
0 20 * * *
```

의미:
- `0`: 0분
- `20`: 20시

예를 들어 `19시 30분`으로 바꾸려면 아래처럼 수정합니다.

```cron
CRON_TZ=Asia/Seoul
30 19 * * * flock -n /tmp/data_uploader.lock /opt/data-ops/run_daily_upload.sh --env-file /home/worv/data_uploader.env >> /home/worv/data_uploader.log 2>&1
```

즉, 시간을 바꾸려면 cron 줄의 맨 앞 두 숫자(`분 시`)만 수정하면 됩니다.

확인:

```bash
crontab -l
```

## 7-6. 작업자 PC 자동화 해제(중지)

자동 업로드를 멈추려면 아래 순서로 진행합니다.

### 1) cron 비활성화

```bash
crontab -e
```

아래 줄을 삭제하거나 맨 앞에 `#`를 붙여 주석 처리:

```cron
0 20 * * * flock -n /tmp/data_uploader.lock /opt/data-ops/run_daily_upload.sh --env-file /home/worv/data_uploader.env >> /home/worv/data_uploader.log 2>&1
```

### 2) 실행 중 프로세스 종료(필요 시)

```bash
ps -ef | grep -E "run_daily_upload.sh|collect_and_upload.py" | grep -v grep
pkill -f run_daily_upload.sh
pkill -f collect_and_upload.py
```

### 3) 중지 확인

```bash
crontab -l
```

선택(완전 제거):

```bash
sudo rm -f /opt/data-ops/run_daily_upload.sh /opt/data-ops/collect_and_upload.py /opt/data-ops/calc_recording_csv.sh
sudo rm -f /etc/data_uploader.env
```

---

## 8. 대시보드 실행 (관리용 PC)

## 8-1. Node 설치 (처음 1회)

```bash
brew install node
```

## 8-2. 환경변수 설정

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard/dashboard"
cp .env.example .env.local
```

`dashboard/.env.local` 파일 열어서 값 입력:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
ADMIN_API_TOKEN=<관리자_페이지_접근용_임의_문자열>
```

## 8-3. 실행

```bash
npm install
npm run dev
```

브라우저 접속:
- 대시보드: `http://localhost:3000`
- 관리자(작업시간/시나리오 규칙): `http://localhost:3000/admin`

---

## 8-4. 인터넷 어디서나 접속하려면 (Vercel 배포)

`localhost`는 해당 PC에서만 열립니다. 외부 접속이 필요하면 배포가 필요합니다.

### A. Vercel 웹으로 배포 (비개발자 추천)

1. Vercel 로그인
2. `Add New...` -> `Project`
3. GitHub 저장소 Import
4. 설정:
   - Framework: `Next.js`
   - Root Directory: `dashboard`
5. 환경변수 입력(Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_API_TOKEN`
6. `Deploy` 클릭

배포 후 확인:
- `https://<배포도메인>/`
- `https://<배포도메인>/admin`
- `https://<배포도메인>/api/health` (환경변수 체크용)

`/api/health` 결과가 아래처럼 나오면 정상:

```json
{
  "status": "ok",
  "checks": {
    "NEXT_PUBLIC_SUPABASE_URL": true,
    "SUPABASE_SERVICE_ROLE_KEY": true,
    "ADMIN_API_TOKEN": true
  }
}
```

### B. CLI 배포 (선택)

```bash
cd \"/Users/jh.kim/Documents/data-auto-maumai-dashboard/dashboard\"
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ADMIN_API_TOKEN production
npx vercel --prod
```

## 8-5. GitHub 연동 자동배포 (추천)

Vercel 프로젝트가 GitHub 저장소와 연결되어 있으면, `main` 브랜치 push 시 자동 배포됩니다.

### 1) 코드 push

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
git add -A
git commit -m "update dashboard and supabase rules"
git push origin main
```

### 1-1) 팀원이 새 PC에서 내려받아 쓰는 방법

```bash
git clone https://github.com/tpfkvpdldhs-arch/data-auto-maumai-dashboard.git
cd data-auto-maumai-dashboard
```

작업 시작 전:

```bash
git pull origin main
```

작업 후:

```bash
git add -A
git commit -m "..."
git push origin main
```

### 2) 배포 상태 확인

1. Vercel -> 프로젝트 -> `Deployments`
2. 방금 push한 커밋이 `Ready` 되면 완료
3. `Domains`에서 배포 도메인 확인

주의:
- Vercel Root Directory는 반드시 `dashboard`
- 환경변수 3개가 설정되어 있어야 함:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `ADMIN_API_TOKEN`

CLI 연결 중 자주 나오는 질문:
- `Link to existing project?` -> `Yes`
- `Would you like to pull environment variables now?` -> `Y`
- `File size limit exceeded (100 MB)` -> 루트가 아닌 `dashboard` 폴더에서 배포 명령 실행

## 8-6. 대시보드 코드 수정 후 재배포

대시보드 화면이나 API를 수정했다면, 운영 주소에 반영되도록 다시 배포해야 합니다.

예:
- `dashboard/components/*` 수정
- `dashboard/app/api/*` 수정
- `dashboard/app/*` 수정

### A. GitHub 자동배포를 쓰는 경우

가장 쉬운 방법은 코드 커밋 후 `main` 브랜치에 push 하는 것입니다.

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
git add -A
git commit -m "update dashboard"
git push origin main
```

그 다음 확인:
1. Vercel -> 프로젝트 -> `Deployments`
2. 방금 커밋이 `Ready` 상태인지 확인
3. 운영 주소 접속 후 새 기능이 반영됐는지 확인

### B. 수동으로 바로 재배포하는 경우

GitHub push를 기다리지 않고 바로 반영하려면:

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard/dashboard"
npx vercel --prod
```

### C. 환경변수를 바꾼 경우

대시보드 코드 수정이 아니더라도 아래 값을 바꿨다면 새 배포가 필요합니다.
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_TOKEN`

즉, Vercel에서 환경변수를 저장한 뒤에도 기존 운영 배포에는 자동 반영되지 않습니다. 새 배포가 필요합니다.

### D. 배포 후 확인

1. 운영 주소 열기
2. 브라우저 강력 새로고침
3. 변경한 화면/필터/API가 실제 반영됐는지 확인

예:
- 맵/작업자/시나리오 필터 변경 -> 대시보드 메인 화면 확인
- 관리자 기능 변경 -> `/admin` 확인
- API 변경 -> `/api/health` 또는 관련 API 직접 호출 확인

---

## 9. 매일 운영 방법 (상사/운영 담당)

1. 20:10 이후 대시보드 접속
2. 작업자 수, 총 데이터 시간, 실패 비율 확인
3. 누락 작업자가 있으면 해당 PC 로그 확인
4. 특정 작업자의 작업시간 예외가 있으면 `/admin`에서 오버라이드 입력

### 9-1. 시나리오를 수동으로 넣는 방법

현재 시나리오는 아래 우선순위로 결정됩니다.

1. 관리자 시나리오 규칙(`scenario_overrides`)
2. 작업자 업로드 데이터의 `scenario_input`
3. 기본 자동 분류 규칙

즉, 같은 데이터에 대해 관리자 규칙이 있으면 그것이 가장 우선입니다.

#### A. 작업자 업로드 데이터의 `scenario_input`

작업자 PC에서 만들어지는 업로드 데이터에 `scenario_input` 값을 직접 넣을 수 있습니다.
이 값은 개별 레코드 단위 수동 입력입니다.

예:
- `scenario_input = mowing`
- `scenario_input = fairway_outline`

주의:
- 같은 `map_segment`에 맞는 관리자 규칙이 있으면 `scenario_input`보다 관리자 규칙이 우선합니다.
- 이미 DB에 적재가 끝난 과거 데이터는 CSV를 수정해도 자동 반영되지 않습니다.

#### B. `/admin`의 시나리오 규칙 등록

관리자 페이지 `/admin`에서는 `포함 패턴`과 `scenario_code`를 등록할 수 있습니다.

예:
- 포함 패턴: `road_west`
- scenario_code: `mowing`

동작 방식:
- `map_segment`에 해당 문자열이 포함되면 규칙이 적용됩니다.
- 대소문자는 무시합니다.
- 여러 규칙이 동시에 맞으면 더 긴 패턴이 우선합니다.
- 길이가 같으면 최신 수정 규칙이 우선합니다.

중요:
- 이 방식은 미래에 수집되는 데이터에도 적용됩니다.
- 기존 DB의 과거 데이터도 집계 뷰(`daily_metrics`, `all_daily_metrics`)에서 override가 반영됩니다.
- 다만 기존 `recording_sessions` 원본 값을 직접 바꾸는 것은 아닙니다.

#### C. DB를 직접 수정하는 방법

1. `scenario_overrides` 직접 수정

```sql
insert into public.scenario_overrides (match_pattern, scenario_code, note, is_active, updated_at)
values ('road_west', 'mowing', 'manual sql insert', true, now())
on conflict (match_pattern)
do update set
  scenario_code = excluded.scenario_code,
  note = excluded.note,
  is_active = excluded.is_active,
  updated_at = now();
```

2. 이미 적재된 `recording_sessions`를 직접 수정

```sql
update public.recording_sessions
set scenario_input = 'mowing',
    scenario_code = 'mowing',
    scenario_source = 'input'
where lower(map_segment) like '%road_west%';
```

권장:
- 운영용 패턴 규칙: `scenario_overrides`
- 개별 원본 데이터 정정: `recording_sessions` 직접 수정

#### D. `scenario_source` 값 의미

- `manual`: 관리자 규칙(`scenario_overrides`)으로 결정됨
- `input`: 작업자 업로드 데이터의 `scenario_input`으로 결정됨
- `segment_rule`: 기본 자동 규칙으로 결정됨
- `unknown`: 어떤 규칙에도 맞지 않음

---

## 10. 장애 대응 체크리스트

## 10-1. 데이터가 안 올라오는 경우

작업자 PC에서 확인:

```bash
tail -n 200 /home/worv/data_uploader.log
```

자주 나오는 원인:
- `invalid_token`
토큰 오타 또는 DB에 등록 안 됨. 토큰 재등록 필요.

- `Could not resolve host`
네트워크/DNS 문제.

- `jq not installed`, `bc not installed`
패키지 설치 필요.

- `CSV file not found`
`DATA_ROOT` 또는 `CALC_SCRIPT` 경로 오류.

## 10-2. 관리자 페이지 토큰이 틀리다고 나오는 경우

확인 순서:

1. Vercel `Settings -> Environment Variables`에서 `ADMIN_API_TOKEN` 확인
2. 현재 접속 URL이 `Production`인지 `Preview`인지 확인
3. 환경변수 수정 후 반드시 재배포
4. 브라우저 localStorage에 남은 이전 토큰 삭제

브라우저 Console에서 실행:

```js
localStorage.removeItem("dashboard_admin_api_token")
```

그 후 `/admin` 새로고침 후 토큰 재입력

주의:
- Vercel 환경변수는 저장만으로 기존 배포에 반영되지 않습니다.
- 새 배포가 필요합니다.

## 10-3. 시나리오 규칙 변경 후 실제 반영 순서

```bash
cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard"
supabase db push
supabase functions deploy ingest-worker-daily --no-verify-jwt

cd "/Users/jh.kim/Documents/data-auto-maumai-dashboard/dashboard"
npx vercel --prod
```

이 순서를 지켜야 하는 이유:
- DB 컬럼(`match_pattern`)이 먼저 있어야 API와 함수가 정상 동작합니다.
- 함수는 새 ingest 규칙을 써야 하고
- 대시보드는 새 `/admin` UI와 API payload를 써야 합니다.

## 10-4. 중복 업로드가 걱정되는 경우

걱정하지 않아도 됩니다.
같은 파일을 올리면 DB 유니크 키로 중복 저장을 막습니다.
응답의 `duplicate_count`가 증가하는 것이 정상입니다.

## 10-5. 오프라인 후 복구

업로드 실패 시 payload가 spool 폴더에 저장됩니다.
다음 실행 때 자동 재전송합니다.

spool 확인:

```bash
ls -al /home/worv/.data_uploader/spool
```

---

## 11. 보안 수칙

1. `SUPABASE_SERVICE_ROLE_KEY`는 관리용 대시보드 서버에서만 사용
2. 작업자 PC에는 `WORKER_TOKEN`만 배포
3. 토큰 유출 의심 시 즉시 폐기

토큰 폐기 예시(SQL):

```sql
update public.worker_tokens
set revoked_at = now()
where worker_id = 'worker-01';
```

새 토큰을 만들어 다시 등록하면 됩니다.

---

## 12. 성공 판정 기준

1. 매일 20:10까지 활성 작업자 데이터가 Supabase에 들어옴
2. `report_charts.py`를 돌리지 않아도 대시보드에서 동일 KPI 확인 가능
3. 과거(`data.csv`) + 신규 자동수집 데이터가 한 화면에서 연속 조회됨

---

## 13. 빠른 점검 SQL (운영용)

오늘 수집 현황:

```sql
select
  work_date,
  worker_id,
  count(*) as sessions,
  round(sum(duration_sec)::numeric, 1) as data_seconds
from public.recording_sessions
where work_date = (now() at time zone 'Asia/Seoul')::date
group by work_date, worker_id
order by worker_id;
```

집계 뷰 확인:

```sql
select *
from public.all_daily_metrics
order by work_date desc, worker_id
limit 50;
```

시나리오 규칙 확인:

```sql
select match_pattern, scenario_code, is_active, updated_at
from public.scenario_overrides
order by updated_at desc;
```

어떤 과거 데이터가 규칙에 걸리는지 확인:

```sql
select
  rs.work_date,
  rs.worker_id,
  rs.map_segment,
  rs.scenario_code as stored_scenario_code,
  so.match_pattern,
  so.scenario_code as override_scenario_code
from public.recording_sessions rs
left join public.scenario_overrides so
  on so.is_active = true
 and position(lower(so.match_pattern) in lower(rs.map_segment)) > 0
order by rs.work_date desc, rs.worker_id
limit 100;
```

---

## 14. 마지막으로

이 매뉴얼대로 적용하면,
- 작업자 PC: "자동 업로드만" 담당
- 관리자/상사: "대시보드 확인만" 담당
으로 역할이 단순해집니다.

처음 구축 시 1~2일만 안정화 점검하면 이후 운영 부담이 크게 줄어듭니다.
