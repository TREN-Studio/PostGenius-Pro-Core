#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/.cron_token"
AUTOPUBLISH_URL="https://postgeniuspro.com/api/automation/hourly-autopublish"
CURL_BIN="/usr/bin/curl"

if [[ ! -x "$CURL_BIN" ]]; then
  echo "curl binary not found at $CURL_BIN" >&2
  exit 1
fi

if [[ ! -s "$TOKEN_FILE" ]]; then
  echo "Cron token file is missing or empty: $TOKEN_FILE" >&2
  exit 1
fi

TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"

if [[ -z "$TOKEN" ]]; then
  echo "Cron token is empty." >&2
  exit 1
fi

"$CURL_BIN" -fsS "${AUTOPUBLISH_URL}?token=${TOKEN}" >/dev/null
