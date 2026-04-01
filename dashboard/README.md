# Dashboard (Next.js + Recharts)

GitHub 저장소 전체 개요와 데이터 흐름 설명은 루트 [README.md](../README.md)를 먼저 참고하세요.

## Run

```bash
cd dashboard
npm install
cp .env.example .env.local
npm run dev
```

Open:

- Dashboard: `http://localhost:3000` (`@maum.ai` Google login required)
- Public viewer: `http://localhost:3000/viewer?token=...`
- Admin overrides: `http://localhost:3000/admin`

## Deploy on Vercel (public access)

### Option A: Vercel Web UI (recommended for non-developers)

1. Push this repository to GitHub.
2. Go to Vercel and click `Add New...` -> `Project`.
3. Import your GitHub repository.
4. In project settings:
   - `Framework Preset`: `Next.js`
   - `Root Directory`: `dashboard`
5. Set Environment Variables (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_API_TOKEN`
   - `PUBLIC_VIEW_TOKEN`
6. In Supabase Auth, enable Google login and add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://<your-domain>/auth/callback`
7. Click `Deploy`.
8. After deploy, open:
   - `/` (dashboard)
   - `/auth/login` (internal login page)
   - `/viewer?token=...` (public viewer)
   - `/admin` (override page)
   - `/api/health` (env check endpoint)

### Option B: Vercel CLI

```bash
cd dashboard
npm install
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ADMIN_API_TOKEN production
npx vercel env add PUBLIC_VIEW_TOKEN production
npx vercel --prod
```

If you already installed Vercel CLI globally:

```bash
npm run deploy:vercel
```

## Env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_TOKEN`
- `PUBLIC_VIEW_TOKEN`

## API endpoints

- `GET /api/options`: 필터 옵션 (로그인 세션 필요)
- `GET /api/summary`: 내부 집계 차트 데이터 (로그인 세션 필요)
- `GET /api/public-summary`: 공개용 일자/맵 요약 (`token` query 필요)
- `GET /api/public-map-detail`: 공개용 맵별 시나리오 상세 (`token` query 필요)
- `POST /api/public-link`: 현재 내부 필터 기준 공개용 링크 생성 (로그인 세션 필요)
- `GET|POST|DELETE /api/overrides`: 작업시간 오버라이드 관리 (admin token 필요)
- `GET /api/health`: 배포 환경변수 체크
