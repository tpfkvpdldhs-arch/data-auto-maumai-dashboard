# ingest-worker-daily

Supabase Edge Function for worker PC ingestion.

## Deploy

```bash
supabase functions deploy ingest-worker-daily --project-ref <PROJECT_REF>
```

## Runtime env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Request

- `POST /functions/v1/ingest-worker-daily`
- Header: `Authorization: Bearer <worker_token>`
- Body:

```json
{
  "worker_id": "worker-01",
  "generated_at": "2026-02-25T10:00:00Z",
  "timezone": "Asia/Seoul",
  "records": [
    {
      "source_folder": "bag",
      "filename": "a.recording.log",
      "start_time": "2026-02-25T09:00:00+09:00",
      "end_time": "2026-02-25T09:05:00+09:00",
      "duration_sec": 300.0,
      "map_segment": "r_road_west256_1",
      "map_name": "sim_anseong_golf_course_west256",
      "map_code": "west256",
      "scenario_input": "mowing"
    }
  ]
}
```

`map_name`, `map_code`, `scenario_input` are optional for backward compatibility.

## Token registration

Token hash is checked against `worker_tokens.token_hash`.

```sql
insert into public.worker_tokens (token_hash, worker_id)
values (public.hash_worker_token('<plain token>'), 'worker-01');
```
