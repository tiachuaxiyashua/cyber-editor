#!/usr/bin/env bash

# Monitors a Codex CLI session and the network path used by ChatGPT/Codex.
# It intentionally avoids decrypting HTTPS payloads. Command transcript capture
# is enabled by default because Codex errors are printed to the terminal.

set -u
set -o pipefail

SCRIPT_NAME="$(basename "$0")"
DEFAULT_INTERVAL="${CODEX_LINK_MONITOR_INTERVAL:-10}"
DEFAULT_OUTPUT_ROOT="${CODEX_LINK_MONITOR_OUTPUT:-artifacts/codex-link-monitor}"
COMPACT_URL="https://chatgpt.com/backend-api/codex/responses/compact"

OUTPUT_ROOT="$DEFAULT_OUTPUT_ROOT"
INTERVAL="$DEFAULT_INTERVAL"
TRANSCRIPT=1
PCAP=0
TAIL_CODEX_HOME=0
declare -a ENDPOINTS=()
declare -a EXTRA_PIDS=()
declare -a COMMAND=()
declare -a BG_PIDS=()
SESSION_DIR=""
EVENTS_FILE=""
PROBES_FILE=""
SAMPLES_FILE=""
SNAPSHOT_FILE=""
TRANSCRIPT_FILE=""
PCAP_LOG_FILE=""
SUMMARY_FILE=""
STOPPING=0
COMMAND_RC=0

usage() {
  cat <<'USAGE'
Usage:
  scripts/codex-link-monitor.sh [options] -- codex [args...]
  scripts/codex-link-monitor.sh [options]

Examples:
  bash scripts/codex-link-monitor.sh -- codex
  bash scripts/codex-link-monitor.sh --interval 5 --output artifacts/codex-link-monitor -- codex
  bash scripts/codex-link-monitor.sh --pid 12345 --tail-codex-home
  bash scripts/codex-link-monitor.sh --pcap -- codex

Options:
  -o, --output DIR       Root directory for logs. A timestamped session folder is created inside it.
  -i, --interval SEC     Sampling interval. Default: 10 seconds.
      --endpoint URL     Add an endpoint to probe. Can be repeated.
      --pid PID          Also monitor an existing process id. Can be repeated.
      --pcap             Try to start tcpdump and save an encrypted packet capture.
      --tail-codex-home  Tail existing Codex home logs if found. This may include sensitive text.
      --no-transcript    Do not capture wrapped command terminal output.
  -h, --help             Show this help.

What is collected:
  - Wrapped command transcript, exit code, and monitor events.
  - DNS, TLS handshake summary, curl timing/status probes for ChatGPT/OpenAI endpoints.
  - Process snapshots, TCP 443 socket state, route/resolver info, and system resource snapshots.
  - Codex config/log file metadata under CODEX_HOME or ~/.codex: path, size, mtime, sha256. File
    contents are not copied unless --tail-codex-home is explicitly used.

Limits:
  - HTTPS request/response bodies are encrypted and are not captured.
  - tcpdump usually needs elevated permissions. If it cannot run, the failure is logged.
USAGE
}

die() {
  printf '%s\n' "error: $*" >&2
  exit 2
}

utc_ts() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

json_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

event() {
  local type="$1"
  local message="${2-}"
  local ts
  ts="$(utc_ts)"
  printf '{"ts":"%s","type":"%s","message":"%s"}\n' \
    "$(json_escape "$ts")" \
    "$(json_escape "$type")" \
    "$(json_escape "$message")" >> "$EVENTS_FILE"
}

append_header() {
  local file="$1"
  local title="$2"
  {
    printf '\n==== [%s] %s ====\n' "$(utc_ts)" "$title"
  } >> "$file"
}

run_capture() {
  local file="$1"
  local title="$2"
  shift 2
  append_header "$file" "$title"
  {
    "$@"
    local rc=$?
    printf '\n---- exit=%s ----\n' "$rc"
  } >> "$file" 2>&1
}

run_shell_capture() {
  local file="$1"
  local title="$2"
  local script="$3"
  append_header "$file" "$title"
  {
    bash -lc "$script"
    local rc=$?
    printf '\n---- exit=%s ----\n' "$rc"
  } >> "$file" 2>&1
}

redacted_env() {
  env | sort | awk '
    BEGIN { IGNORECASE = 1 }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key=$0
      sub(/=.*/, "", key)
      if (key ~ /(TOKEN|SECRET|PASSWORD|PASS|KEY|AUTH|COOKIE|SESSION|CREDENTIAL|OPENAI|ANTHROPIC|GITHUB|NPM|SSH|PROXY)/) {
        print key "=[REDACTED]"
        next
      }
    }
    { print }
  '
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

quote_command() {
  local quoted=""
  local arg
  for arg in "$@"; do
    printf -v quoted '%s%q ' "$quoted" "$arg"
  done
  printf '%s' "${quoted% }"
}

endpoint_host() {
  local url="$1"
  local host="${url#*://}"
  host="${host%%/*}"
  host="${host%%:*}"
  printf '%s' "$host"
}

unique_hosts() {
  local url
  local host
  for url in "${ENDPOINTS[@]}"; do
    host="$(endpoint_host "$url")"
    [[ -n "$host" ]] && printf '%s\n' "$host"
  done | awk 'NF && !seen[$0]++'
}

collect_codex_metadata() {
  local file="$1"
  append_header "$file" "Codex config and log metadata"
  {
    local roots=()
    [[ -n "${CODEX_HOME:-}" ]] && roots+=("$CODEX_HOME")
    [[ -n "${HOME:-}" ]] && roots+=("$HOME/.codex")
    [[ -e "codex.json" ]] && roots+=("codex.json")
    [[ -d ".codex" ]] && roots+=(".codex")

    if ((${#roots[@]} == 0)); then
      printf 'No Codex config roots found.\n'
      printf '\n---- exit=0 ----\n'
      return 0
    fi

    local root
    for root in "${roots[@]}"; do
      if [[ -f "$root" ]]; then
        printf 'file: %s\n' "$root"
        stat -c '  mode=%A size=%s mtime=%y' "$root" 2>/dev/null || true
        sha256sum "$root" 2>/dev/null | sed 's/^/  sha256=/' || true
      elif [[ -d "$root" ]]; then
        printf 'dir: %s\n' "$root"
        find "$root" -maxdepth 3 -type f \
          \( -name '*.toml' -o -name '*.json' -o -name '*.log' -o -name '*.ndjson' \) \
          -print0 2>/dev/null |
          while IFS= read -r -d '' found; do
            printf 'file: %s\n' "$found"
            stat -c '  mode=%A size=%s mtime=%y' "$found" 2>/dev/null || true
            sha256sum "$found" 2>/dev/null | sed 's/^/  sha256=/' || true
          done
      fi
    done
    printf '\n---- exit=0 ----\n'
  } >> "$file" 2>&1
}

collect_static_snapshot() {
  event "snapshot_start" "collecting static snapshot"
  run_capture "$SNAPSHOT_FILE" "Monitor version" bash -lc "printf '%s\n' '$SCRIPT_NAME'; printf 'compact_url=%s\n' '$COMPACT_URL'"
  run_capture "$SNAPSHOT_FILE" "Working directory" pwd
  run_capture "$SNAPSHOT_FILE" "Date and kernel" bash -lc 'date -Is; uname -a; test -r /proc/version && cat /proc/version || true'
  run_capture "$SNAPSHOT_FILE" "OS release" bash -lc 'test -r /etc/os-release && cat /etc/os-release || true'
  run_capture "$SNAPSHOT_FILE" "Resource limits" bash -lc 'ulimit -a'
  run_capture "$SNAPSHOT_FILE" "Environment redacted" redacted_env
  run_capture "$SNAPSHOT_FILE" "Command availability" bash -lc 'for c in codex node npm git curl openssl dig nslookup getent ip ss tracepath traceroute tcpdump script powershell.exe; do printf "%-16s " "$c"; command -v "$c" || true; done'
  run_capture "$SNAPSHOT_FILE" "Tool versions" bash -lc 'codex --version 2>/dev/null || true; node --version 2>/dev/null || true; npm --version 2>/dev/null || true; git --version 2>/dev/null || true; curl --version 2>/dev/null | head -n 5 || true; openssl version 2>/dev/null || true'
  run_capture "$SNAPSHOT_FILE" "Git state" bash -lc 'git rev-parse --show-toplevel 2>/dev/null || true; git branch --show-current 2>/dev/null || true; git status --short 2>/dev/null || true'
  run_capture "$SNAPSHOT_FILE" "Resolver config" bash -lc 'test -r /etc/resolv.conf && cat /etc/resolv.conf || true; test -r /etc/hosts && sed -n "1,120p" /etc/hosts || true'
  run_capture "$SNAPSHOT_FILE" "IP addresses and routes" bash -lc 'ip addr show 2>/dev/null || true; ip route show table all 2>/dev/null || true'
  run_capture "$SNAPSHOT_FILE" "System resources" bash -lc 'uptime || true; free -h 2>/dev/null || true; df -h . 2>/dev/null || true'
  collect_codex_metadata "$SNAPSHOT_FILE"

  local host
  while IFS= read -r host; do
    [[ -z "$host" ]] && continue
    run_capture "$SNAPSHOT_FILE" "DNS getent $host" getent hosts "$host"
    if command_exists dig; then
      run_capture "$SNAPSHOT_FILE" "DNS dig $host" bash -lc "dig +time=5 +tries=1 '$host' A '$host' AAAA"
    fi
    if command_exists nslookup; then
      run_capture "$SNAPSHOT_FILE" "DNS nslookup $host" nslookup "$host"
    fi
    if command_exists openssl; then
      run_shell_capture "$SNAPSHOT_FILE" "TLS handshake $host" "timeout 20 openssl s_client -servername '$host' -connect '$host:443' </dev/null | sed -n '1,80p'"
    fi
    if command_exists tracepath; then
      run_capture "$SNAPSHOT_FILE" "tracepath $host" timeout 25 tracepath "$host"
    elif command_exists traceroute; then
      run_capture "$SNAPSHOT_FILE" "traceroute tcp 443 $host" timeout 25 traceroute -T -p 443 "$host"
    fi
  done < <(unique_hosts)
  event "snapshot_done" "static snapshot complete"
}

curl_probe() {
  local url="$1"
  local label="$2"
  append_header "$PROBES_FILE" "curl $label $url"
  {
    printf 'url=%s\n' "$url"
    curl -sS -L -o /dev/null \
      --connect-timeout 10 \
      --max-time 30 \
      --retry 0 \
      -w 'remote_ip=%{remote_ip}\nhttp_code=%{http_code}\nhttp_version=%{http_version}\nssl_verify_result=%{ssl_verify_result}\ntime_namelookup=%{time_namelookup}\ntime_connect=%{time_connect}\ntime_appconnect=%{time_appconnect}\ntime_pretransfer=%{time_pretransfer}\ntime_starttransfer=%{time_starttransfer}\ntime_total=%{time_total}\nsize_download=%{size_download}\nspeed_download=%{speed_download}\n' \
      "$url"
    local rc=$?
    printf 'curl_exit=%s\n' "$rc"
  } >> "$PROBES_FILE" 2>&1
}

probe_all_endpoints() {
  local url
  for url in "${ENDPOINTS[@]}"; do
    curl_probe "$url" "default"
    if curl --version 2>/dev/null | grep -qi 'HTTP2'; then
      append_header "$PROBES_FILE" "curl http2 $url"
      {
        curl -sS -L -o /dev/null --http2 --connect-timeout 10 --max-time 30 --retry 0 \
          -w 'remote_ip=%{remote_ip}\nhttp_code=%{http_code}\nhttp_version=%{http_version}\ntime_total=%{time_total}\n' "$url"
        local rc=$?
        printf 'curl_exit=%s\n' "$rc"
      } >> "$PROBES_FILE" 2>&1
    fi
    append_header "$PROBES_FILE" "curl http1.1 $url"
    {
      curl -sS -L -o /dev/null --http1.1 --connect-timeout 10 --max-time 30 --retry 0 \
        -w 'remote_ip=%{remote_ip}\nhttp_code=%{http_code}\nhttp_version=%{http_version}\ntime_total=%{time_total}\n' "$url"
      local rc=$?
      printf 'curl_exit=%s\n' "$rc"
    } >> "$PROBES_FILE" 2>&1
  done
}

snapshot_processes() {
  append_header "$SAMPLES_FILE" "process snapshot"
  {
    if ((${#EXTRA_PIDS[@]} > 0)); then
      local pid
      for pid in "${EXTRA_PIDS[@]}"; do
        ps -p "$pid" -o pid,ppid,pgid,sid,stat,etimes,%cpu,%mem,comm,args 2>/dev/null || true
      done
    fi
    ps -eo pid,ppid,pgid,sid,stat,etimes,%cpu,%mem,comm,args 2>/dev/null |
      awk 'NR == 1 || /(^|[ /])(codex|node|npm|electron|chatgpt)([ ]|$)/'
  } >> "$SAMPLES_FILE" 2>&1
}

snapshot_network() {
  append_header "$SAMPLES_FILE" "network snapshot"
  {
    date -Is
    ip -s link 2>/dev/null || true
    printf '\n-- route to endpoint hosts --\n'
    local host
    while IFS= read -r host; do
      [[ -z "$host" ]] && continue
      printf '\n# %s\n' "$host"
      ip route get "$host" 2>/dev/null || true
      getent hosts "$host" 2>/dev/null || true
    done < <(unique_hosts)
    printf '\n-- tcp 443 sockets --\n'
    ss -tanpi 2>/dev/null | awk 'NR == 1 || /:443|:https/'
    printf '\n-- tcp counters --\n'
    test -r /proc/net/netstat && awk '/^(TcpExt|IpExt):/ { print }' /proc/net/netstat || true
    test -r /proc/net/snmp && awk '/^(Tcp|Ip):/ { print }' /proc/net/snmp || true
  } >> "$SAMPLES_FILE" 2>&1
}

snapshot_resources() {
  append_header "$SAMPLES_FILE" "resource snapshot"
  {
    uptime || true
    free -h 2>/dev/null || true
    df -h . 2>/dev/null || true
  } >> "$SAMPLES_FILE" 2>&1
}

sampler_loop() {
  event "sampler_start" "interval=${INTERVAL}s"
  local iteration=0
  while true; do
    iteration=$((iteration + 1))
    append_header "$SAMPLES_FILE" "sample $iteration"
    snapshot_resources
    snapshot_processes
    snapshot_network
    probe_all_endpoints
    sleep "$INTERVAL" || break
  done
}

tail_codex_home_logs() {
  local tail_file="$SESSION_DIR/codex-home-tail.log"
  local roots=()
  [[ -n "${CODEX_HOME:-}" ]] && roots+=("$CODEX_HOME")
  [[ -n "${HOME:-}" ]] && roots+=("$HOME/.codex")

  {
    printf 'Tail started at %s\n' "$(utc_ts)"
    printf 'This file may include sensitive Codex log text because --tail-codex-home was enabled.\n'
  } >> "$tail_file"

  local files=()
  local root
  for root in "${roots[@]}"; do
    [[ -d "$root" ]] || continue
    while IFS= read -r -d '' found; do
      files+=("$found")
    done < <(find "$root" -maxdepth 4 -type f \( -name '*.log' -o -name '*.ndjson' \) -print0 2>/dev/null)
  done

  if ((${#files[@]} == 0)); then
    printf 'No Codex log files found to tail.\n' >> "$tail_file"
    return 0
  fi

  tail -n 0 -F "${files[@]}" >> "$tail_file" 2>&1
}

start_pcap() {
  PCAP_LOG_FILE="$SESSION_DIR/tcpdump.log"
  {
    printf 'tcpdump requested at %s\n' "$(utc_ts)"
  } >> "$PCAP_LOG_FILE"

  if ! command_exists tcpdump; then
    printf 'tcpdump is not installed.\n' >> "$PCAP_LOG_FILE"
    event "pcap_unavailable" "tcpdump is not installed"
    return 0
  fi

  local filter='tcp port 443'
  local pcap_file="$SESSION_DIR/traffic-443.pcap"
  tcpdump -i any -n -tttt -s 192 -w "$pcap_file" "$filter" >> "$PCAP_LOG_FILE" 2>&1 &
  local pid=$!
  BG_PIDS+=("$pid")
  event "pcap_start" "pid=$pid file=$pcap_file filter=$filter"
}

write_readme() {
  cat > "$SESSION_DIR/README.txt" <<EOF
Codex link monitor session
Started: $(utc_ts)

Files:
  events.ndjson       Structured monitor lifecycle events.
  snapshot.log        One-time environment, route, DNS, TLS, and Codex metadata snapshot.
  samples.log         Repeated process, TCP/socket, route, and system resource samples.
  probes.log          Repeated curl timing/status probes to configured endpoints.
  transcript.log      Wrapped command terminal transcript, if enabled.
  command-exit.txt    Wrapped command exit code and timestamps.
  traffic-443.pcap    Optional encrypted TCP/443 packet capture, if --pcap succeeded.

Start investigation after a failure by searching these strings:
  stream disconnected
  compact
  curl_exit=
  http_code=
  time_connect=
  time_appconnect=
  time_starttransfer=
  retrans
  reset
  timeout

Important privacy note:
  snapshot.log stores Codex config/log metadata only, not file contents.
  transcript.log records terminal output from the wrapped command.
  codex-home-tail.log exists only when --tail-codex-home is used and may include sensitive text.
EOF
}

write_summary() {
  {
    printf 'session_dir=%s\n' "$SESSION_DIR"
    printf 'ended_at=%s\n' "$(utc_ts)"
    printf 'command_rc=%s\n' "$COMMAND_RC"
    printf 'endpoints=\n'
    printf '  %s\n' "${ENDPOINTS[@]}"
    printf '\nrecent monitor events:\n'
    tail -n 40 "$EVENTS_FILE" 2>/dev/null || true
    printf '\nrecent probe results:\n'
    grep -E '^(====|url=|remote_ip=|http_code=|http_version=|time_|curl_exit=|curl:)' "$PROBES_FILE" 2>/dev/null | tail -n 120 || true
  } > "$SUMMARY_FILE"
}

cleanup() {
  if [[ "$STOPPING" == "1" ]]; then
    return
  fi
  STOPPING=1
  event "cleanup_start" "stopping background monitors"
  local pid
  for pid in "${BG_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${BG_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  snapshot_resources
  snapshot_processes
  snapshot_network
  event "cleanup_done" "logs finalized"
  write_summary
  printf '\nCodex link monitor logs: %s\n' "$SESSION_DIR"
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      -h|--help)
        usage
        exit 0
        ;;
      -o|--output)
        shift
        [[ $# -gt 0 ]] || die "--output requires a directory"
        OUTPUT_ROOT="$1"
        ;;
      -i|--interval)
        shift
        [[ $# -gt 0 ]] || die "--interval requires seconds"
        INTERVAL="$1"
        ;;
      --endpoint)
        shift
        [[ $# -gt 0 ]] || die "--endpoint requires a URL"
        ENDPOINTS+=("$1")
        ;;
      --pid)
        shift
        [[ $# -gt 0 ]] || die "--pid requires a process id"
        EXTRA_PIDS+=("$1")
        ;;
      --pcap)
        PCAP=1
        ;;
      --tail-codex-home)
        TAIL_CODEX_HOME=1
        ;;
      --no-transcript)
        TRANSCRIPT=0
        ;;
      --)
        shift
        COMMAND=("$@")
        break
        ;;
      -*)
        die "unknown option: $1"
        ;;
      *)
        COMMAND=("$@")
        break
        ;;
    esac
    shift
  done

  if ((${#ENDPOINTS[@]} == 0)); then
    ENDPOINTS=(
      "https://chatgpt.com/"
      "$COMPACT_URL"
      "https://api.openai.com/v1/models"
    )
  fi
}

init_session() {
  local stamp
  stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  SESSION_DIR="${OUTPUT_ROOT%/}/session-${stamp}-$$"
  mkdir -p "$SESSION_DIR" || die "failed to create $SESSION_DIR"

  EVENTS_FILE="$SESSION_DIR/events.ndjson"
  PROBES_FILE="$SESSION_DIR/probes.log"
  SAMPLES_FILE="$SESSION_DIR/samples.log"
  SNAPSHOT_FILE="$SESSION_DIR/snapshot.log"
  TRANSCRIPT_FILE="$SESSION_DIR/transcript.log"
  SUMMARY_FILE="$SESSION_DIR/summary.txt"
  : > "$EVENTS_FILE"
  : > "$PROBES_FILE"
  : > "$SAMPLES_FILE"
  : > "$SNAPSHOT_FILE"
  : > "$TRANSCRIPT_FILE"
  : > "$SUMMARY_FILE"

  ln -sfn "$(basename "$SESSION_DIR")" "${OUTPUT_ROOT%/}/latest" 2>/dev/null || true
  write_readme
  event "session_start" "dir=$SESSION_DIR interval=$INTERVAL"
  printf 'Codex link monitor logs: %s\n' "$SESSION_DIR"
}

run_wrapped_command() {
  if ((${#COMMAND[@]} == 0)); then
    event "monitor_only" "no command supplied; press Ctrl-C to stop"
    printf 'No command supplied. Monitoring existing Codex-like processes; press Ctrl-C to stop.\n'
    while true; do
      sleep 3600
    done
  fi

  local command_text
  command_text="$(quote_command "${COMMAND[@]}")"
  event "command_start" "$command_text"
  {
    printf 'started_at=%s\n' "$(utc_ts)"
    printf 'command=%s\n' "$command_text"
  } > "$SESSION_DIR/command-exit.txt"

  if [[ "$TRANSCRIPT" == "1" ]] && command_exists script; then
    if script --help 2>&1 | grep -q -- ' -e,'; then
      script -q -f -e -c "$command_text" "$TRANSCRIPT_FILE"
      COMMAND_RC=$?
    else
      script -q -f -c "$command_text" "$TRANSCRIPT_FILE"
      COMMAND_RC=$?
    fi
  elif [[ "$TRANSCRIPT" == "1" ]]; then
    "${COMMAND[@]}" > >(tee -a "$TRANSCRIPT_FILE") 2> >(tee -a "$TRANSCRIPT_FILE" >&2)
    COMMAND_RC=$?
  else
    "${COMMAND[@]}"
    COMMAND_RC=$?
  fi

  {
    printf 'ended_at=%s\n' "$(utc_ts)"
    printf 'exit_code=%s\n' "$COMMAND_RC"
  } >> "$SESSION_DIR/command-exit.txt"
  event "command_exit" "rc=$COMMAND_RC"
  return "$COMMAND_RC"
}

main() {
  parse_args "$@"
  init_session
  trap cleanup EXIT
  trap 'event "signal" "INT"; exit 130' INT
  trap 'event "signal" "TERM"; exit 143' TERM

  collect_static_snapshot

  if [[ "$TAIL_CODEX_HOME" == "1" ]]; then
    tail_codex_home_logs &
    BG_PIDS+=("$!")
    event "codex_home_tail_start" "pid=${BG_PIDS[-1]}"
  fi

  if [[ "$PCAP" == "1" ]]; then
    start_pcap
  fi

  event "preflight_probe_start" "probing endpoints before command start"
  probe_all_endpoints
  event "preflight_probe_done" "endpoint preflight probes complete"

  sampler_loop &
  BG_PIDS+=("$!")

  run_wrapped_command
  exit "$COMMAND_RC"
}

main "$@"
