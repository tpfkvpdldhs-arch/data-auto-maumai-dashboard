#!/usr/bin/env bash
set -uo pipefail   # ✅ -e 제거(또는 아래 grep에 || true를 꼭 넣어야 함)

LOG_DIRS=("./bag" "./bag_failed")
OUT_CSV="recording_duration.csv"
TZ_REGION="Asia/Seoul"
NUMERIC_RE='^[0-9]+([.][0-9]+)?$'
MCAP_SMALL_BYTES=1048576

command -v jq >/dev/null 2>&1 || { echo "❌ jq not installed (sudo apt install -y jq)"; exit 1; }
command -v bc >/dev/null 2>&1 || { echo "❌ bc not installed (sudo apt install -y bc)"; exit 1; }

normalize_mcap_chunk_base() {
  local chunk_name stem normalized
  chunk_name="$(basename "$1")"
  stem="${chunk_name%.mcap}"
  normalized="$(printf '%s' "$stem" | sed -E 's/_[0-9]+$//')"
  printf '%s' "$normalized"
}

file_size_bytes() {
  stat -c %s "$1" 2>/dev/null || stat -f %z "$1" 2>/dev/null || echo 0
}

echo "source_folder,folder_sort_key,filename,start_time,end_time,duration_sec,duration_mmss,map_segment,map_name,scenario_input,integrity_ok,integrity_reason" > "$OUT_CSV"

shopt -s nullglob
for LOG_DIR in "${LOG_DIRS[@]}"; do
  [[ -d "$LOG_DIR" ]] || continue

  source_folder="$(basename "$LOG_DIR")"
  folder_sort_key=0
  [[ "$source_folder" == "bag_failed" ]] && folder_sort_key=1

  base_list_file="$(mktemp)"
  for log_path in "$LOG_DIR"/*.recording.log; do
    [[ -e "$log_path" ]] || continue
    fname="$(basename "$log_path")"
    stem="${fname%.log}"
    base="${stem%.recording}"
    printf "%s\n" "$base" >> "$base_list_file"
  done
  for data_path in "$LOG_DIR"/*.json "$LOG_DIR"/*.JSON "$LOG_DIR"/*.npy "$LOG_DIR"/*.NPY; do
    [[ -e "$data_path" ]] || continue
    name="$(basename "$data_path")"
    base="${name%.*}"
    printf "%s\n" "$base" >> "$base_list_file"
  done
  for mcap_dir in "$LOG_DIR"/*.mcap; do
    [[ -d "$mcap_dir" ]] || continue
    name="$(basename "$mcap_dir")"
    base="${name%.mcap}"
    printf "%s\n" "$base" >> "$base_list_file"
  done

  while IFS= read -r base; do
    [[ -n "$base" ]] || continue
    log_file="$LOG_DIR/$base.recording.log"
    fname="$base.recording.log"
    [[ -f "$log_file" ]] && fname="$(basename "$log_file")"

    # JSON 매칭
    json_file=""
    if [[ -f "$LOG_DIR/$base.json" ]]; then
      json_file="$LOG_DIR/$base.json"
    elif [[ -f "$LOG_DIR/$base.JSON" ]]; then
      json_file="$LOG_DIR/$base.JSON"
    else
      candidate=( "$LOG_DIR/$base"*.json "$LOG_DIR/$base"*.JSON )
      if [[ ${#candidate[@]} -gt 0 ]]; then
        json_file="${candidate[0]}"
      fi
    fi

    # NPY 매칭
    npy_file=""
    if [[ -f "$LOG_DIR/$base.npy" ]]; then
      npy_file="$LOG_DIR/$base.npy"
    elif [[ -f "$LOG_DIR/$base.NPY" ]]; then
      npy_file="$LOG_DIR/$base.NPY"
    else
      npy_candidate=( "$LOG_DIR/$base"*.npy "$LOG_DIR/$base"*.NPY )
      if [[ ${#npy_candidate[@]} -gt 0 ]]; then
        npy_file="${npy_candidate[0]}"
      fi
    fi

    # MCAP 매칭
    mcap_dir="$LOG_DIR/$base.mcap"
    metadata_yaml=""
    mcap_chunk=""
    mcap_total_bytes=0
    mcap_name_match="false"
    if [[ -d "$mcap_dir" ]]; then
      [[ -f "$mcap_dir/metadata.yaml" ]] && metadata_yaml="$mcap_dir/metadata.yaml"
      mcap_files=( "$mcap_dir"/*.mcap )
      if [[ ${#mcap_files[@]} -gt 0 ]]; then
        mcap_chunk="${mcap_files[0]}"
        for chunk in "${mcap_files[@]}"; do
          chunk_base="$(normalize_mcap_chunk_base "$chunk")"
          chunk_size="$(file_size_bytes "$chunk")"
          mcap_total_bytes=$((mcap_total_bytes + chunk_size))
          [[ "$chunk_base" == "$(basename "$mcap_dir")" ]] && mcap_name_match="true"
        done
      fi
    fi

    # ✅ grep가 못 찾으면 빈 문자열로 (스크립트 중단 방지)
    start=""
    end=""
    topic_subscription_count=0
    log_error_count=0
    if [[ -f "$log_file" ]]; then
      start=$(grep -m 1 "Recording..." "$log_file" 2>/dev/null | sed -E 's/.*\[([0-9]+\.[0-9]+)\].*/\1/' || true)

      # ✅ 종료 문구가 다를 수 있어 2종류 커버 (마지막 매치 사용)
      end=$(grep "Pausing recording\.\|Stopping recording\." "$log_file" 2>/dev/null | tail -n 1 | sed -E 's/.*\[([0-9]+\.[0-9]+)\].*/\1/' || true)
      topic_subscription_count=$(grep -c "Subscribed to topic" "$log_file" 2>/dev/null || true)
      log_error_count=$(grep -c "ERROR" "$log_file" 2>/dev/null || true)
    fi

    # map_segment / map_name / scenario_input
    map_name="unknown"
    scenario_input=""
    if [[ -n "$json_file" && -f "$json_file" ]]; then
      map_segment=$(jq -r '.map_segment // empty' "$json_file")
      if [[ -z "$map_segment" ]]; then
        map_segment=$(jq -r '.semantic_uuid // empty' "$json_file" | awk -F/ '{print $NF}')
      fi
      map_name=$(jq -r '.map_name // empty' "$json_file")
      scenario_input=$(jq -r '.scenario_code // .scenario // empty' "$json_file")
      [[ -z "$map_segment" ]] && map_segment="ERROR_MAP_EMPTY"
      [[ -z "$map_name" ]] && map_name="unknown"
    else
      map_segment="ERROR_JSON_NOT_FOUND"
    fi

    integrity_ok="true"
    integrity_issues=()
    [[ ! -f "$log_file" ]] && integrity_issues+=("log_missing")
    [[ -z "$json_file" ]] && integrity_issues+=("json_missing")
    if [[ -z "$npy_file" ]]; then
      integrity_issues+=("npy_missing")
    elif [[ ! -s "$npy_file" ]]; then
      integrity_issues+=("npy_empty")
    fi
    if [[ ! -d "$mcap_dir" ]]; then
      integrity_issues+=("mcap_dir_missing")
    else
      [[ -z "$metadata_yaml" ]] && integrity_issues+=("mcap_metadata_missing")
      [[ -z "$mcap_chunk" ]] && integrity_issues+=("mcap_file_missing")
      [[ -n "$mcap_chunk" && "$mcap_name_match" != "true" ]] && integrity_issues+=("mcap_filename_mismatch")
    fi
    [[ "$map_segment" == "ERROR_JSON_NOT_FOUND" || "$map_segment" == "ERROR_MAP_EMPTY" ]] && integrity_issues+=("map_segment_missing")
    if [[ -f "$log_file" && "$topic_subscription_count" -eq 0 && "$mcap_total_bytes" -lt "$MCAP_SMALL_BYTES" ]]; then
      integrity_issues+=("mcap_small_without_topic_subscription")
    fi
    [[ -f "$log_file" && "$log_error_count" -gt 0 ]] && integrity_issues+=("log_error_detected")

    # 타임스탬프 없으면 ERROR_TS로 남기고 계속
    if [[ -z "${start}" || -z "${end}" || ! "$start" =~ $NUMERIC_RE || ! "$end" =~ $NUMERIC_RE ]]; then
      integrity_issues+=("timestamp_missing")
      integrity_ok="false"
      integrity_reason=""
      if [[ ${#integrity_issues[@]} -gt 0 ]]; then
        integrity_reason="$(IFS=';'; echo "${integrity_issues[*]}")"
      fi
      echo "$source_folder,$folder_sort_key,$fname,ERROR_TS,ERROR_TS,ERROR,ERROR,$map_segment,$map_name,$scenario_input,$integrity_ok,$integrity_reason" >> "$OUT_CSV"
      continue
    fi

    s_sec="${start%%.*}"; s_ns="${start#*.}"
    e_sec="${end%%.*}";   e_ns="${end#*.}"

    s_human="$(TZ=$TZ_REGION date -d "@$s_sec" "+%Y-%m-%d %H:%M:%S").${s_ns:0:3}"
    e_human="$(TZ=$TZ_REGION date -d "@$e_sec" "+%Y-%m-%d %H:%M:%S").${e_ns:0:3}"

    duration="$(echo "$end - $start" | bc 2>/dev/null || true)"
    if [[ ! "$duration" =~ ^-?[0-9]+([.][0-9]+)?$ ]]; then
      integrity_issues+=("duration_invalid")
      integrity_ok="false"
      integrity_reason=""
      if [[ ${#integrity_issues[@]} -gt 0 ]]; then
        integrity_reason="$(IFS=';'; echo "${integrity_issues[*]}")"
      fi
      echo "$source_folder,$folder_sort_key,$fname,$s_human,$e_human,ERROR,ERROR,$map_segment,$map_name,$scenario_input,$integrity_ok,$integrity_reason" >> "$OUT_CSV"
      continue
    fi
    if (( $(echo "$duration <= 0" | bc -l) )); then
      integrity_issues+=("non_positive_duration")
    fi
    dur_int=$(printf "%.0f" "$duration")
    mm=$((dur_int / 60))
    ss=$((dur_int % 60))
    mmss=$(printf "%02d:%02d" "$mm" "$ss")

    if [[ ${#integrity_issues[@]} -gt 0 ]]; then
      integrity_ok="false"
    fi
    integrity_reason=""
    if [[ ${#integrity_issues[@]} -gt 0 ]]; then
      integrity_reason="$(IFS=';'; echo "${integrity_issues[*]}")"
    fi

    echo "$source_folder,$folder_sort_key,$fname,$s_human,$e_human,$duration,$mmss,$map_segment,$map_name,$scenario_input,$integrity_ok,$integrity_reason" >> "$OUT_CSV"
  done < <(sort -u "$base_list_file")

  rm -f "$base_list_file"
done

echo "✅ CSV saved to $OUT_CSV"
