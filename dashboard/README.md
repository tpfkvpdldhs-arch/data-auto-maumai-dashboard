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

- Dashboard: `http://localhost:3000`
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
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_API_TOKEN`
6. Click `Deploy`.
7. After deploy, open:
   - `/` (dashboard)
   - `/admin` (override page)
   - `/api/health` (env check endpoint)

### Option B: Vercel CLI

```bash
cd dashboard
npm install
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add ADMIN_API_TOKEN production
npx vercel --prod
```

If you already installed Vercel CLI globally:

```bash
npm run deploy:vercel
```

## Env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_TOKEN`

## API endpoints

- `GET /api/options`: 필터 옵션
- `GET /api/summary`: 집계 차트 데이터
- `GET|POST|DELETE /api/overrides`: 작업시간 오버라이드 관리 (admin token 필요)
- `GET /api/health`: 배포 환경변수 체크
