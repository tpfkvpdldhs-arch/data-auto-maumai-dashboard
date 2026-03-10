# Worker PC Automation

## Files

- `collect_and_upload.py`: 로컬 CSV 파싱 + Supabase 업로드 + spool 재전송
- `run_daily_upload.sh`: cron에서 실행할 래퍼
- `data_uploader.env.example`: 환경변수 템플릿
- `cron.example`: crontab 예시

## Quick start

1. 환경 파일 배치

```bash
sudo cp automation/worker/data_uploader.env.example /etc/data_uploader.env
sudo chmod 600 /etc/data_uploader.env
```

2. 실행 스크립트 배치

```bash
sudo install -m 755 automation/worker/collect_and_upload.py /opt/data-ops/collect_and_upload.py
sudo install -m 755 automation/worker/run_daily_upload.sh /opt/data-ops/run_daily_upload.sh
```

3. cron 등록

```bash
crontab -e
# automation/worker/cron.example 내용 반영
```

## Manual test

```bash
ENV_FILE=/etc/data_uploader.env /opt/data-ops/run_daily_upload.sh --dry-run
```

## CSV input compatibility

`collect_and_upload.py` accepts both CSV formats:

- legacy: `... ,map_segment`
- extended: `... ,map_segment,map_name,scenario_input[,map_code]`
