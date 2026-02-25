#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/etc/data_uploader.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

export PYTHONUNBUFFERED=1

python3 "$SCRIPT_DIR/collect_and_upload.py" --env-file "$ENV_FILE" "$@"
