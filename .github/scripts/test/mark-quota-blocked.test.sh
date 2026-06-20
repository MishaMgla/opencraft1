#!/usr/bin/env bash
# Tests for mark-quota-blocked.sh using a stubbed `gh` that records its args.
# Run: bash .github/scripts/test/mark-quota-blocked.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../mark-quota-blocked.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Fake gh: append each invocation to calls.log; for the comments API capture the
# -f body=... value to body.txt so we can validate the marker.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/gh" <<EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$TMP/calls.log"
if printf '%s ' "\$@" | grep -q 'comments'; then
  while [ "\$#" -gt 0 ]; do
    case "\$1" in body=*) printf '%s' "\${1#body=}" > "$TMP/body.txt";; esac
    shift
  done
fi
exit 0
EOF
chmod +x "$TMP/bin/gh"
command -v jq >/dev/null || { echo "SKIP - jq not installed"; exit 0; }

pass=0 fail=0
check() { if eval "$2"; then pass=$((pass+1)); echo "ok   - $1"; else fail=$((fail+1)); echo "FAIL - $1"; fi; }

: > "$TMP/calls.log"
PATH="$TMP/bin:$PATH" \
  STAGE=dev-revise PR=51 COMMENT_BODY="please fix the lint --> now" \
  REPO=acme/x GH_TOKEN=t FREEZE_TOKEN=pat \
  bash "$SCRIPT" >/dev/null 2>&1
rc=$?

check "exits 0" "[ $rc -eq 0 ]"
check "comment targets PR 51"        "grep -q 'api repos/acme/x/issues/51/comments' '$TMP/calls.log'"
check "adds quota-blocked label"     "grep -q 'issues/51/labels' '$TMP/calls.log'"
check "sets AGENTS_QUOTA_FREEZE=true" "grep -q 'variable set AGENTS_QUOTA_FREEZE' '$TMP/calls.log'"
check "does NOT touch manual AGENTS_FREEZE" "! grep -qE 'variable set AGENTS_FREEZE ' '$TMP/calls.log'"
check "marker present"               "grep -q 'agents:resume v1' '$TMP/body.txt'"
# Extract the marker JSON once, then validate it parses with the right fields.
MJSON="$(sed -nE 's/.*agents:resume v1 (\{.*\}) -->.*/\1/p' "$TMP/body.txt")"
printf '%s' "$MJSON" > "$TMP/marker.json"
check "marker JSON valid"            "jq -e . '$TMP/marker.json' >/dev/null"
check "stage=dev-revise in JSON"     "jq -e '.stage==\"dev-revise\"' '$TMP/marker.json' >/dev/null"
check "pr=51 in JSON"                "jq -e '.pr==51' '$TMP/marker.json' >/dev/null"
check "comment_body sanitized (no -->)" "! grep -q 'lint --> now' '$TMP/body.txt'"

echo "----"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
