#!/usr/bin/env bash
# Tests for recover-dispatch.sh with a stubbed gh covering the full flow:
# find labeled item -> read marker -> dispatch workflow -> drop label -> unfreeze.
# Run: bash .github/scripts/test/recover-dispatch.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../recover-dispatch.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v jq >/dev/null || { echo "SKIP - jq not installed"; exit 0; }

mkdir -p "$TMP/bin"
# Stub gh: one labeled issue (#42, dev-implement marker), and emulate the
# comments API returning a marker. Record dispatch/label/variable calls.
cat > "$TMP/bin/gh" <<EOF
#!/usr/bin/env bash
echo "gh \$*" >> "$TMP/calls.log"
args="\$*"
case "\$args" in
  "issue list "*) echo 42 ;;                      # one labeled issue
  "pr list "*)    : ;;                             # no labeled PRs
  *"issues/42/comments"*"--jq"*)                   # reading marker (has --jq)
    echo 'pre-amble'
    echo '<!-- agents:resume v1 {"stage":"dev-implement","issue":42} -->' ;;
  "workflow run "*) : ;;                           # dispatch (exit 0)
  *) : ;;
esac
exit 0
EOF
chmod +x "$TMP/bin/gh"

: > "$TMP/calls.log"
PATH="$TMP/bin:$PATH" REPO=acme/x GH_TOKEN=t FREEZE_TOKEN=pat \
  bash "$SCRIPT" > "$TMP/out.txt" 2>&1
rc=$?

pass=0 fail=0
check() { if eval "$2"; then pass=$((pass+1)); echo "ok   - $1"; else fail=$((fail+1)); echo "FAIL - $1"; fi; }

check "exits 0"                       "[ $rc -eq 0 ]"
check "dispatches dev-implement.yml"  "grep -q 'workflow run dev-implement.yml' '$TMP/calls.log'"
check "passes issue=42 input"         "grep -q 'issue=42' '$TMP/calls.log'"
check "removes quota-blocked label"   "grep -qE 'api -X DELETE repos/acme/x/issues/42/labels/agents:quota-blocked' '$TMP/calls.log'"
check "clears AGENTS_QUOTA_FREEZE=false" "grep -q 'variable set AGENTS_QUOTA_FREEZE --repo acme/x --body false' '$TMP/calls.log'"
check "does NOT touch manual AGENTS_FREEZE" "! grep -qE 'variable set AGENTS_FREEZE ' '$TMP/calls.log'"
check "reports dispatched=1"          "grep -q 'dispatched=1' '$TMP/out.txt'"

echo "----"
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
