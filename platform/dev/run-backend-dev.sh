#!/usr/bin/env sh
set -u

cd "$(dirname "$0")/.."

export ARCHESTRA_LOGGING_LEVEL=debug
export ARCHESTRA_ANALYTICS=disabled

backend_pid=""

stop_backend() {
  if [ -n "$backend_pid" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill -TERM "$backend_pid" 2>/dev/null || true
    pkill -TERM -P "$backend_pid" 2>/dev/null || true
    wait "$backend_pid" 2>/dev/null || true
  fi
  backend_pid=""
}

start_backend() {
  pnpm dev --filter @backend &
  backend_pid=$!
}

cleanup() {
  stop_backend
}

trap cleanup EXIT INT TERM

if [ "${ARCHESTRA_CODE_RUNTIME_ENABLED:-}" = "true" ]; then
  if [ -z "${ARCHESTRA_CODE_RUNTIME_DAGGER_RUNNER_HOST:-}" ]; then
    export ARCHESTRA_CODE_RUNTIME_DAGGER_RUNNER_HOST="tcp://127.0.0.1:1234"
  fi

  if [ "$ARCHESTRA_CODE_RUNTIME_DAGGER_RUNNER_HOST" = "tcp://127.0.0.1:1234" ]; then
    while ! nc -z 127.0.0.1 1234 >/dev/null 2>&1; do
      sleep 1
    done
  fi
fi

start_backend

wait "$backend_pid"
