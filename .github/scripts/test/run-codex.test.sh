#!/usr/bin/env bash
# Tests for run-codex.sh using a stubbed `codex` on PATH.
# Run: bash .github/scripts/test/run-codex.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAP="$HERE/../run-codex.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Build a fake `codex` whose `exec` prints $STUB_OUT and exits $STUB_CODE.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/codex" <<'EOF'
#!/usr/bin/env bash
[ "$1" = "exec" ] || { echo "unexpected subcommand: $1" >&2; exit 99; }
printf '%s\n' "$STUB_OUT"
exit "${STUB_CODE:-0}"
EOF
chmod +x "$TMP/bin/codex"

pass=0 fail=0
# run <want-exit> <want-quota> <name>   (STUB_OUT/STUB_CODE from env)
run() {
  local want_exit="$1" want_quota="$2" name="$3"
  local out="$TMP/gh_out.txt"; : > "$out"
  local got_exit quota
  PATH="$TMP/bin:$PATH" GITHUB_OUTPUT="$out" bash "$WRAP" exec --model x "the prompt" >/dev/null 2>&1
  got_exit=$?
  quota="$(grep -oE 'quota_blocked=(true|false)' "$out" | tail -1 | cut -d= -f2)"
  if [ "$got_exit" -eq "$want_exit" ] && [ "$quota" = "$want_quota" ]; then
    pass=$((pass+1)); echo "ok   - $name"
  else
    fail=$((fail+1)); echo "FAIL - $name (exit want=$want_exit got=$got_exit; quota want=$want_quota got=$quota)"
  fi
}

STUB_CODE=0 STUB_OUT="done: opened PR #5"                          run 0 false "success → exit 0, quota=false"
STUB_CODE=1 STUB_OUT="stream error: usage_limit_reached"           run 0 true  "quota block → exit 0, quota=true"
STUB_CODE=1 STUB_OUT="You've hit your usage limit. try again at X" run 0 true  "usage-limit text → exit 0, quota=true"
STUB_CODE=2 STUB_OUT="go build failed: undefined: Foo"             run 2 false "genuine failure → passthrough exit 2, quota=false"

echo "----"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
