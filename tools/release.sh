#!/usr/bin/env bash
# release.sh
#
# Build a complete, SIGNED EGo release locally, in the one correct order:
#
#   1. tools/codesign.sh        sign every .js  -> .xsgn sidecar
#   2. tools/build-package.sh   tar source/ (incl. .xsgn), compute SHA-1,
#                               rewrite updates.xri with the new hashes
#   3. tools/sign-xri.sh        embed the repository signature in updates.xri
#
# Order matters: the .xsgn files are bundled INSIDE the tarball, so they
# must be regenerated before tarring; and the updates.xri signature covers
# the package SHA-1 values, so it must be applied LAST. Re-running this
# whole script after any source edit keeps all three in sync.
#
# This is the manual / fallback path. The normal release path is the
# self-hosted GitHub Actions workflow (.github/workflows/release.yml),
# which runs these same three tools and commits the artifacts for you.
# Both paths share this exact ordering, so they never disagree.
#
# This script does NOT run git - it prints the files to commit and leaves
# the commit + push to you.
#
# Usage:
#   tools/release.sh                 # date stamp = today (UTC)
#   tools/release.sh 20260131        # override the package date stamp
#
# Configuration (env overrides): see tools/codesign.sh and tools/sign-xri.sh
#   EGO_SIGNING_KEYS, PI_BIN, and the password sources. You are prompted
#   once here; the password is shared across both signing steps via a 0600
#   temp file that is shredded on exit (never echoed, never on argv).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DATE="${1:-}"
KEYS_FILE="${EGO_SIGNING_KEYS:-$HOME/Astro/evan.xssk}"

for t in tools/codesign.sh tools/build-package.sh tools/sign-xri.sh; do
   if [[ ! -x "$t" && ! -f "$t" ]]; then
      echo "error: missing tool: $t" >&2
      exit 1
   fi
done

# Acquire the password once and share it with both signing steps. If the
# caller already provided a non-interactive source, just pass it through.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ego-release.XXXXXX")"
cleanup() {
   if [[ -f "$WORK_DIR/pw" ]]; then
      if command -v shred >/dev/null 2>&1; then
         shred -u "$WORK_DIR/pw" 2>/dev/null || rm -f "$WORK_DIR/pw"
      else
         rm -f "$WORK_DIR/pw"
      fi
   fi
   rm -rf "$WORK_DIR"
}
trap cleanup EXIT
chmod 700 "$WORK_DIR"

if [[ -z "${EGO_SIGNING_PW_FILE:-}" && -z "${EGO_SIGNING_PASSWORD:-}" ]]; then
   if [[ ! -t 0 ]]; then
      echo "error: no password source and no TTY (set EGO_SIGNING_PW_FILE or EGO_SIGNING_PASSWORD)" >&2
      exit 1
   fi
   printf 'Password for %s: ' "$KEYS_FILE" >&2
   read -r -s PW
   printf '\n' >&2
   if [[ -z "$PW" ]]; then
      echo "error: empty password" >&2
      exit 1
   fi
   ( umask 077; printf '%s' "$PW" > "$WORK_DIR/pw" )
   unset PW
   export EGO_SIGNING_PW_FILE="$WORK_DIR/pw"
fi

echo "==> [1/3] Signing scripts (.js -> .xsgn)"
bash tools/codesign.sh

echo "==> [2/3] Building package + rewriting updates.xri"
if [[ -n "$DATE" ]]; then
   bash tools/build-package.sh "$DATE"
else
   bash tools/build-package.sh
fi

echo "==> [3/3] Signing updates.xri"
bash tools/sign-xri.sh updates.xri

echo
echo "Release built and signed. Files to commit:"
echo "  source/src/scripts/EGo/*.xsgn"
echo "  packages/ego-scripts-*.tar.gz"
echo "  packages/ego-doc-*.tar.gz"
echo "  updates.xri"
echo
echo "Review, then commit + push yourself."
