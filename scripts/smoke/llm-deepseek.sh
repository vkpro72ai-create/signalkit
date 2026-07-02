#!/usr/bin/env bash
set -euo pipefail

API="${API:-https://api.signalkit.sys.bachopus.com}"
EMAIL="${SIGNALKIT_TEST_EMAIL:-vkdevproai@gmail.com}"
PASSWORD="${SIGNALKIT_TEST_PASSWORD:?Set SIGNALKIT_TEST_PASSWORD}"
WORKSPACE_ID="${SIGNALKIT_WORKSPACE_ID:-}"

echo "Logging in..."
TOKEN="$(
  curl -sS -X POST "$API/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d || '{}');process.stdout.write(j.accessToken || j.token || '')})"
)"

if [ -z "$TOKEN" ]; then
  echo "FAIL: no token"
  exit 1
fi

if [ -z "$WORKSPACE_ID" ]; then
  WORKSPACE_ID="$(
    curl -sS "$API/me" -H "authorization: Bearer $TOKEN" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d || '{}');process.stdout.write(j.memberships?.[0]?.workspace?.id || '')})"
  )"
fi

if [ -z "$WORKSPACE_ID" ]; then
  echo "FAIL: no workspace id"
  exit 1
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "Running LLM smoke with workspace $WORKSPACE_ID..."
curl -sS -X POST "$API/llm/smoke" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"workspaceId\":\"$WORKSPACE_ID\",\"provider\":\"deepseek\",\"modelId\":\"deepseek-chat\",\"prompt\":\"Return exactly: SIGNALKIT_LLM_SMOKE_OK\"}" \
  | tee "$TMP_FILE"

grep -q "SIGNALKIT_LLM_SMOKE_OK" "$TMP_FILE"
echo "OK: DeepSeek smoke call succeeded"
