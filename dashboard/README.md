# Dashboard (Next.js + Recharts)

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

## Env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_TOKEN`

## API endpoints

- `GET /api/options`: 필터 옵션
- `GET /api/summary`: 집계 차트 데이터
- `GET|POST|DELETE /api/overrides`: 작업시간 오버라이드 관리 (admin token 필요)
