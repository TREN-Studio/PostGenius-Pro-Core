#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$SCRIPT_DIR/.cron_token"
AGENT_URL="https://postgeniuspro.com/api/automation/agent-tick"

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Cron token file not found at $TOKEN_FILE" >&2
  exit 1
fi

TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
if [[ -z "$TOKEN" ]]; then
  echo "Cron token file is empty." >&2
  exit 1
fi

curl -fsS --max-time 600 "$AGENT_URL?token=$TOKEN"
