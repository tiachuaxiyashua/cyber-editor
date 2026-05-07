#!/usr/bin/env bash

# Builds pressure in one persistent Codex exec session so remote compaction can
# be exercised. It does not edit the repository; prompts tell the agent not to
# run tools.

set -u
set -o pipefail

ROOT_DIR="${ROOT_DIR:-/mnt/e/chuan_project/cyber editor}"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/artifacts/context-pressure-test/run-$(date -u '+%Y%m%dT%H%M%SZ')-$$}"
START_KIB="${START_KIB:-64}"
STEP_MULTIPLIER="${STEP_MULTIPLIER:-1}"
MAX_KIB="${MAX_KIB:-64}"
MAX_ITERATIONS="${MAX_ITERATIONS:-8}"
TIMEOUT_SEC="${TIMEOUT_SEC:-360}"
SLEEP_SEC="${SLEEP_SEC:-1}"
MODEL_ARG="${MODEL_ARG:-}"
CODEX_DRIVER="${CODEX_DRIVER:-exec}"
CODEX_DISABLE_REQUEST_COMPRESSION="${CODEX_DISABLE_REQUEST_COMPRESSION:-0}"
CAPTURE_FAILURE_HTTP="${CAPTURE_FAILURE_HTTP:-1}"
CAPTURE_ROLLOUT="${CAPTURE_ROLLOUT:-1}"
CAPTURE_SSL_KEYLOG="${CAPTURE_SSL_KEYLOG:-1}"
CAPTURE_CODEX_LOG_LINES="${CAPTURE_CODEX_LOG_LINES:-800}"
CODEX_HOME_DIR="${CODEX_HOME:-${HOME:-}/.codex}"
INITIAL_THREAD_ID="${THREAD_ID:-}"
RESUME_SESSION="${RESUME_SESSION:-1}"

mkdir -p "$RUN_DIR"

SUMMARY="$RUN_DIR/summary.ndjson"
FAILURE="$RUN_DIR/failure.txt"
THREAD_FILE="$RUN_DIR/thread-id.txt"
: > "$SUMMARY"
: > "$FAILURE"

json_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

quote_command() {
  local quoted=""
  local arg
  for arg in "$@"; do
    printf -v quoted '%s%q ' "$quoted" "$arg"
  done
  printf '%s' "${quoted% }"
}

log_json() {
  local ts
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '{"ts":"%s","iteration":%s,"size_kib":%s,"bytes":%s,"rc":%s,"status":"%s","driver":"%s","request_compression":"%s","thread_id":"%s","log":"%s","prompt":"%s","ssl_keylog":"%s","usage":"%s","evidence":"%s"}\n' \
    "$ts" "$1" "$2" "$3" "$4" "$(json_escape "$5")" "$(json_escape "$CODEX_DRIVER")" \
    "$(json_escape "$(request_compression_state)")" "$(json_escape "${6-}")" "$(json_escape "$7")" \
    "$(json_escape "${8-}")" "$(json_escape "${9-}")" "$(json_escape "${10-}")" "$(json_escape "${11-}")" >> "$SUMMARY"
}

make_prompt() {
  local iteration="$1"
  local kib="$2"
  local bytes=$((kib * 1024))
  {
    printf 'Controlled Codex remote context pressure test.\n'
    printf 'Iteration: %s.\n' "$iteration"
    printf 'Payload target: %s KiB.\n' "$kib"
    printf 'Do not run tools, do not edit files, and do not inspect the repository.\n'
    printf 'Treat the synthetic payload only as context pressure, then reply exactly: OK iteration %s %s KiB\n' "$iteration" "$kib"
    printf '\nBEGIN_SYNTHETIC_CONTEXT\n'
    awk -v target="$bytes" -v iteration="$iteration" '
      BEGIN {
        line = "CTX-STRESS iteration=" iteration " 0123456789 abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ repeated context filler for remote compact pressure.";
        written = 0;
        while (written < target) {
          print line;
          written += length(line) + 1;
        }
      }
    '
    printf 'END_SYNTHETIC_CONTEXT\n'
  }
}

contains_remote_context_failure() {
  local file="$1"
  grep -Eiq \
    'Error running remote compact task|remote compaction failed|compact_error=|stream disconnected before completion|error sending request for url \(https://chatgpt\.com/backend-api/codex/responses/compact\)|context_length_exceeded|maximum context|context window|input too large|request too large|payload too large|too many tokens|token limit|http_code=(413|429|500|502|503|504)|(^|[^0-9])(413|429|500|502|503|504)([^0-9]|$)|timeout|timed out|overloaded|rate.?limit' \
    "$file"
}

extract_thread_id() {
  local file="$1"
  grep -m 1 '"type":"thread.started"' "$file" |
    sed -n 's/.*"thread_id":"\([^"]*\)".*/\1/p'
}

extract_usage() {
  local file="$1"
  grep '"type":"turn.completed"' "$file" | tail -1 | sed -n 's/.*"usage":{\([^}]*\)}.*/{\1}/p'
}

request_compression_state() {
  if [[ "$CODEX_DISABLE_REQUEST_COMPRESSION" == "1" ]]; then
    printf 'disabled'
  else
    printf 'enabled'
  fi
}

append_codex_feature_flags() {
  local -n target_ref="$1"
  if [[ "$CODEX_DISABLE_REQUEST_COMPRESSION" == "1" ]]; then
    target_ref+=(--disable enable_request_compression)
  fi
}

append_model_arg() {
  local -n target_ref="$1"
  if [[ -n "$MODEL_ARG" ]]; then
    target_ref+=(-m "$MODEL_ARG")
  fi
}

find_rollout_file() {
  local thread_id="$1"
  [[ -n "$thread_id" && -d "$CODEX_HOME_DIR/sessions" ]] || return 1
  find "$CODEX_HOME_DIR/sessions" -type f -name "*$thread_id*.jsonl" -print -quit 2>/dev/null
}

capture_failure_evidence() {
  local failure_kind="$1"
  local iteration="$2"
  local size_kib="$3"
  local bytes="$4"
  local rc="$5"
  local thread_id="$6"
  local log_file="$7"
  local last_file="$8"
  local prompt_file="$9"
  local ssl_keylog_file="${10-}"
  local evidence_dir="$RUN_DIR/failure-http-capture-iteration-${iteration}-${size_kib}KiB"

  [[ "$CAPTURE_FAILURE_HTTP" == "1" ]] || return 0

  mkdir -p "$evidence_dir"
  cp "$prompt_file" "$evidence_dir/request-source-prompt.txt" 2>/dev/null || true
  cp "$log_file" "$evidence_dir/codex-command.log" 2>/dev/null || true
  [[ -f "$last_file" ]] && cp "$last_file" "$evidence_dir/last-message.txt" 2>/dev/null || true
  [[ -n "$ssl_keylog_file" && -f "$ssl_keylog_file" ]] && cp "$ssl_keylog_file" "$evidence_dir/tls-keylog.log" 2>/dev/null || true

  {
    printf 'failure_kind=%s\n' "$failure_kind"
    printf 'iteration=%s\n' "$iteration"
    printf 'size_kib=%s\n' "$size_kib"
    printf 'bytes=%s\n' "$bytes"
    printf 'rc=%s\n' "$rc"
    printf 'driver=%s\n' "$CODEX_DRIVER"
    printf 'request_compression=%s\n' "$(request_compression_state)"
    printf 'thread_id=%s\n' "$thread_id"
    printf 'compact_url=%s\n' 'https://chatgpt.com/backend-api/codex/responses/compact'
    printf 'captured_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'prompt_file=%s\n' "$evidence_dir/request-source-prompt.txt"
    [[ -f "$evidence_dir/tls-keylog.log" ]] && printf 'tls_keylog=%s\n' "$evidence_dir/tls-keylog.log"
  } > "$evidence_dir/manifest.txt"

  {
    printf 'request_source_prompt_bytes='
    wc -c < "$prompt_file" 2>/dev/null || printf '0\n'
    printf 'request_source_prompt_sha256='
    sha256sum "$prompt_file" 2>/dev/null | awk '{print $1}' || printf '\n'
    if [[ -n "$ssl_keylog_file" && -f "$ssl_keylog_file" ]]; then
      printf 'tls_keylog_bytes='
      wc -c < "$ssl_keylog_file" 2>/dev/null || printf '0\n'
      printf 'tls_keylog_sha256='
      sha256sum "$ssl_keylog_file" 2>/dev/null | awk '{print $1}' || printf '\n'
    fi
  } > "$evidence_dir/file-stats.txt"

  local codex_log="$CODEX_HOME_DIR/log/codex-tui.log"
  if [[ -f "$codex_log" ]]; then
    tail -n "$CAPTURE_CODEX_LOG_LINES" "$codex_log" > "$evidence_dir/codex-log-tail.log" 2>/dev/null || true
    if [[ -n "$thread_id" ]]; then
      grep -nE "remote compaction failed|compact_remote|responses/compact|stream disconnected before completion|error sending request|$thread_id" "$codex_log" > "$evidence_dir/codex-compact-matches.log" 2>/dev/null || true
    else
      grep -nE "remote compaction failed|compact_remote|responses/compact|stream disconnected before completion|error sending request" "$codex_log" > "$evidence_dir/codex-compact-matches.log" 2>/dev/null || true
    fi
  fi

  if [[ "$CAPTURE_ROLLOUT" == "1" ]]; then
    local rollout_file
    rollout_file="$(find_rollout_file "$thread_id" || true)"
    if [[ -n "$rollout_file" && -f "$rollout_file" ]]; then
      cp "$rollout_file" "$evidence_dir/rollout-source.jsonl" 2>/dev/null || true
      {
        printf 'rollout_source=%s\n' "$rollout_file"
        printf 'rollout_bytes='
        wc -c < "$rollout_file" 2>/dev/null || printf '0\n'
        printf 'rollout_sha256='
        sha256sum "$rollout_file" 2>/dev/null | awk '{print $1}' || printf '\n'
      } > "$evidence_dir/rollout-source.txt"
    else
      printf 'No rollout file found for thread_id=%s under %s/sessions\n' "$thread_id" "$CODEX_HOME_DIR" > "$evidence_dir/rollout-source.txt"
    fi
  fi

  cat > "$evidence_dir/http-request-capture-notes.txt" <<'EOF'
This directory is a best-effort failure-time HTTP request evidence pack.

The compact request is sent over HTTPS, so full wire-level HTTP headers/body are not available from
ordinary terminal logs. The files here capture the unencrypted request sources that are available:

- request-source-prompt.txt: exact prompt sent by this pressure-test iteration.
- rollout-source.jsonl: persisted Codex thread rollout used to construct model-visible history.
- codex-log-tail.log and codex-compact-matches.log: Codex internal failure metrics.
- tls-keylog.log: TLS session secrets for decrypting a matching packet capture if tcpdump/pcap is enabled.

To recover full wire headers/body, run the monitor with --pcap and this script with TLS key logging,
then decrypt the pcap with tls-keylog.log in Wireshark/tshark. Without a matching pcap, this evidence
pack can reconstruct the compact request source and size, but not the exact encrypted wire bytes.
EOF

  printf '%s\n' "$evidence_dir" > "$RUN_DIR/latest-failure-evidence.txt"
}

run_turn() {
  local iteration="$1"
  local size_kib="$2"
  local log_file="$3"
  local last_file="$4"
  local prompt_file="$5"
  local ssl_keylog_file="$6"
  local thread_id="${7-}"
  local -a flags=()
  append_codex_feature_flags flags
  append_model_arg flags

  if [[ "$CAPTURE_SSL_KEYLOG" == "1" ]]; then
    export SSLKEYLOGFILE="$ssl_keylog_file"
  else
    unset SSLKEYLOGFILE
  fi

  if [[ "$CODEX_DRIVER" == "exec" ]]; then
    if [[ -z "$thread_id" || "$RESUME_SESSION" != "1" ]]; then
      timeout "$TIMEOUT_SEC" codex exec "${flags[@]}" --json -C "$ROOT_DIR" -s read-only -o "$last_file" - < "$prompt_file" > "$log_file" 2>&1
    else
      timeout "$TIMEOUT_SEC" codex exec resume "${flags[@]}" --json -o "$last_file" "$thread_id" - < "$prompt_file" > "$log_file" 2>&1
    fi
  elif [[ "$CODEX_DRIVER" == "tui" ]]; then
    local prompt_text
    local command_text
    local -a tui_cmd=()
    prompt_text="$(cat "$prompt_file")"
    if [[ -z "$thread_id" || "$RESUME_SESSION" != "1" ]]; then
      tui_cmd=(timeout "$TIMEOUT_SEC" codex "${flags[@]}" -C "$ROOT_DIR" -s read-only -a never --no-alt-screen "$prompt_text")
    else
      tui_cmd=(timeout "$TIMEOUT_SEC" codex resume "${flags[@]}" --include-non-interactive -C "$ROOT_DIR" -s read-only -a never --no-alt-screen "$thread_id" "$prompt_text")
    fi
    command_text="$(quote_command "${tui_cmd[@]}")"
    if command -v script >/dev/null 2>&1; then
      if script --help 2>&1 | grep -q -- ' -e,'; then
        script -q -f -e -c "$command_text" "$log_file"
      else
        script -q -f -c "$command_text" "$log_file"
      fi
    else
      printf 'CODEX_DRIVER=tui requires the script command to provide a pseudo-terminal.\n' > "$log_file"
      return 2
    fi
  else
    printf 'Unknown CODEX_DRIVER=%s; expected exec or tui.\n' "$CODEX_DRIVER" > "$log_file"
    return 2
  fi
}

printf 'run_dir=%s\n' "$RUN_DIR"
printf 'root_dir=%s\n' "$ROOT_DIR"
printf 'start_kib=%s\n' "$START_KIB"
printf 'step_multiplier=%s\n' "$STEP_MULTIPLIER"
printf 'max_kib=%s\n' "$MAX_KIB"
printf 'max_iterations=%s\n' "$MAX_ITERATIONS"
printf 'timeout_sec=%s\n' "$TIMEOUT_SEC"
printf 'resume_session=%s\n' "$RESUME_SESSION"
printf 'codex_driver=%s\n' "$CODEX_DRIVER"
printf 'request_compression=%s\n' "$(request_compression_state)"
printf 'capture_failure_http=%s\n' "$CAPTURE_FAILURE_HTTP"
printf 'capture_ssl_keylog=%s\n' "$CAPTURE_SSL_KEYLOG"
[[ -n "$INITIAL_THREAD_ID" ]] && printf 'initial_thread_id=%s\n' "$INITIAL_THREAD_ID"

iteration=0
size_kib="$START_KIB"
thread_id="$INITIAL_THREAD_ID"

while true; do
  iteration=$((iteration + 1))
  bytes=$((size_kib * 1024))
  log_file="$RUN_DIR/iteration-${iteration}-${size_kib}KiB.log"
  last_file="$RUN_DIR/iteration-${iteration}-${size_kib}KiB.last.txt"
  prompt_file="$RUN_DIR/iteration-${iteration}-${size_kib}KiB.prompt.txt"
  ssl_keylog_file="$RUN_DIR/iteration-${iteration}-${size_kib}KiB.sslkeys.log"
  make_prompt "$iteration" "$size_kib" > "$prompt_file"
  : > "$ssl_keylog_file"

  printf '\n[%s] iteration=%s size_kib=%s bytes=%s thread_id=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$iteration" "$size_kib" "$bytes" "${thread_id:-new}" | tee -a "$RUN_DIR/progress.log"

  run_turn "$iteration" "$size_kib" "$log_file" "$last_file" "$prompt_file" "$ssl_keylog_file" "$thread_id"
  rc=$?
  usage="$(extract_usage "$log_file")"

  if [[ -z "$thread_id" || "$RESUME_SESSION" != "1" ]]; then
    extracted_thread_id="$(extract_thread_id "$log_file")"
    if [[ -n "$extracted_thread_id" ]]; then
      thread_id="$extracted_thread_id"
      printf '%s\n' "$thread_id" > "$THREAD_FILE"
    fi
  fi

  if [[ "$rc" -ne 0 ]]; then
    capture_failure_evidence "codex_nonzero_or_timeout" "$iteration" "$size_kib" "$bytes" "$rc" "$thread_id" "$log_file" "$last_file" "$prompt_file" "$ssl_keylog_file"
    evidence_dir="$(cat "$RUN_DIR/latest-failure-evidence.txt" 2>/dev/null || true)"
    {
      printf 'failure_kind=codex_nonzero_or_timeout\n'
      printf 'iteration=%s\n' "$iteration"
      printf 'size_kib=%s\n' "$size_kib"
      printf 'bytes=%s\n' "$bytes"
      printf 'rc=%s\n' "$rc"
      printf 'driver=%s\n' "$CODEX_DRIVER"
      printf 'request_compression=%s\n' "$(request_compression_state)"
      printf 'thread_id=%s\n' "$thread_id"
      printf 'log=%s\n' "$log_file"
      printf 'last_message=%s\n' "$last_file"
      printf 'prompt=%s\n' "$prompt_file"
      printf 'ssl_keylog=%s\n' "$ssl_keylog_file"
      [[ -n "$evidence_dir" ]] && printf 'evidence=%s\n' "$evidence_dir"
      printf 'failed_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } | tee "$FAILURE"
    log_json "$iteration" "$size_kib" "$bytes" "$rc" "failed" "$thread_id" "$log_file" "$prompt_file" "$ssl_keylog_file" "$usage" "$evidence_dir"
    exit "$rc"
  fi

  if contains_remote_context_failure "$log_file"; then
    capture_failure_evidence "remote_context_error_pattern" "$iteration" "$size_kib" "$bytes" "$rc" "$thread_id" "$log_file" "$last_file" "$prompt_file" "$ssl_keylog_file"
    evidence_dir="$(cat "$RUN_DIR/latest-failure-evidence.txt" 2>/dev/null || true)"
    {
      printf 'failure_kind=remote_context_error_pattern\n'
      printf 'iteration=%s\n' "$iteration"
      printf 'size_kib=%s\n' "$size_kib"
      printf 'bytes=%s\n' "$bytes"
      printf 'rc=%s\n' "$rc"
      printf 'driver=%s\n' "$CODEX_DRIVER"
      printf 'request_compression=%s\n' "$(request_compression_state)"
      printf 'thread_id=%s\n' "$thread_id"
      printf 'log=%s\n' "$log_file"
      printf 'last_message=%s\n' "$last_file"
      printf 'prompt=%s\n' "$prompt_file"
      printf 'ssl_keylog=%s\n' "$ssl_keylog_file"
      [[ -n "$evidence_dir" ]] && printf 'evidence=%s\n' "$evidence_dir"
      printf 'failed_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } | tee "$FAILURE"
    log_json "$iteration" "$size_kib" "$bytes" "$rc" "failure_pattern" "$thread_id" "$log_file" "$prompt_file" "$ssl_keylog_file" "$usage" "$evidence_dir"
    exit 90
  fi

  log_json "$iteration" "$size_kib" "$bytes" "$rc" "passed" "$thread_id" "$log_file" "$prompt_file" "$ssl_keylog_file" "$usage" ""
  printf '[%s] passed iteration=%s size_kib=%s usage=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$iteration" "$size_kib" "$usage" | tee -a "$RUN_DIR/progress.log"

  if [[ "$iteration" -ge "$MAX_ITERATIONS" ]]; then
    {
      printf 'failure_kind=max_iterations_reached_without_remote_failure\n'
      printf 'iteration=%s\n' "$iteration"
      printf 'max_iterations=%s\n' "$MAX_ITERATIONS"
      printf 'driver=%s\n' "$CODEX_DRIVER"
      printf 'request_compression=%s\n' "$(request_compression_state)"
      printf 'thread_id=%s\n' "$thread_id"
      printf 'ended_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    } | tee "$FAILURE"
    exit 91
  fi

  if [[ "$MAX_KIB" != "0" && "$size_kib" -ge "$MAX_KIB" ]]; then
    next_size="$size_kib"
  else
    next_size=$((size_kib * STEP_MULTIPLIER))
    if [[ "$MAX_KIB" != "0" && "$next_size" -gt "$MAX_KIB" ]]; then
      next_size="$MAX_KIB"
    fi
  fi

  size_kib="$next_size"
  sleep "$SLEEP_SEC"
done
