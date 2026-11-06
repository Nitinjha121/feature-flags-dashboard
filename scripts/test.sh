#!/usr/bin/env bash
# Single-command verification: lint + typecheck, API integration tests, full-stack E2E.
# Runs entirely in Docker on an isolated, throwaway stack; exits non-zero on the first failure.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -p ff-test -f docker-compose.test.yml)
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    step "FAILED — recent service logs"
    "${COMPOSE[@]}" logs --tail 40 api worker webhook-receiver migrate 2>/dev/null || true
  fi
  "${COMPOSE[@]}" --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

step "Building images"
"${COMPOSE[@]}" --profile tools build

step "1/3 Lint + typecheck"
"${COMPOSE[@]}" run --rm checks

step "2/3 API integration tests (real Postgres)"
"${COMPOSE[@]}" run --rm api-tests

step "3/3 End-to-end (Playwright → web → api → Postgres → worker → webhook receiver)"
"${COMPOSE[@]}" run --rm e2e

step "All checks passed"
