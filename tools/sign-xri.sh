#!/usr/bin/env bash
# sign-xri.sh
#
# Embed an Ed25519 repository signature in updates.xri by driving
# PixInsight in headless automation mode. This is the scripted equivalent
# of running the CodeSign tool against an .xri by hand, and the companion
# to tools/codesign.sh (which signs the .js sources into .xsgn sidecars).
#
# The signature covers the package SHA-1 hashes inside updates.xri, so
# this MUST be the LAST step of a release:
#   1. tools/codesign.sh          sign .js  -> .xsgn   (before tarring)
#   2. tools/build-package.sh     tar + sha1 + rewrite updates.xri
#   3. tools/sign-xri.sh          sign updates.xri     (this script)
# Any edit to updates.xri after this step strips the signature.
#
# Usage:
#   tools/sign-xri.sh [updates.xri]      # default: updates.xri at repo root
#
# Configuration (env overrides):
#   EGO_SIGNING_KEYS      path to the .xssk secure signing keys file
#                         (default: $KEYS_FILE constant below)
#   PI_BIN                path to the PixInsight executable
#                         (default: macOS app-bundle path below)
#
# Password source (checked in this order, never echoed, never on argv):
#   EGO_SIGNING_PW_FILE   path to a file whose raw bytes are the password
#                         (used as-is; not modified or deleted - for CI on a
#                          self-hosted runner, point this at a 0600 file you
#                          keep on the runner so the password never leaves it)
#   EGO_SIGNING_PASSWORD  the password as an env var (written to a 0600 temp
#                         file for the run, then shredded)
#   interactive prompt    if a TTY is attached and neither of the above is set
set -euo pipefail

# --- Configuration ----------------------------------------------------------

KEYS_FILE="${EGO_SIGNING_KEYS:-$HOME/Astro/evan.xssk}"
PI_BIN="${PI_BIN:-/Applications/PixInsight/PixInsight.app/Contents/MacOS/PixInsight}"

# ----------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

WORKER="tools/sign-xri.js"
XRI="${1:-updates.xri}"

if [[ ! -f "$WORKER" ]]; then
   echo "error: worker script not found: $WORKER" >&2
   exit 1
fi
if [[ ! -x "$PI_BIN" ]]; then
   echo "error: PixInsight executable not found or not executable: $PI_BIN" >&2
   echo "       set PI_BIN to your PixInsight binary." >&2
   exit 1
fi
if [[ ! -f "$KEYS_FILE" ]]; then
   echo "error: signing keys file not found: $KEYS_FILE" >&2
   echo "       set EGO_SIGNING_KEYS or edit KEYS_FILE in this script." >&2
   exit 1
fi
if [[ ! -f "$XRI" ]]; then
   echo "error: xri file not found: $XRI" >&2
   exit 1
fi

# Temp working dir (0700) for the (optional) password temp file.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ego-signxri.XXXXXX")"
cleanup() {
   # Best-effort secure wipe of any password file WE created before removal.
   # A user-supplied EGO_SIGNING_PW_FILE lives outside WORK_DIR and is never
   # touched here.
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

# Resolve the password into a file PixInsight can read, per the contract above.
PW_FILE=""
if [[ -n "${EGO_SIGNING_PW_FILE:-}" ]]; then
   if [[ ! -f "$EGO_SIGNING_PW_FILE" ]]; then
      echo "error: EGO_SIGNING_PW_FILE not found: $EGO_SIGNING_PW_FILE" >&2
      exit 1
   fi
   PW_FILE="$EGO_SIGNING_PW_FILE"
elif [[ -n "${EGO_SIGNING_PASSWORD:-}" ]]; then
   PW_FILE="$WORK_DIR/pw"
   ( umask 077; printf '%s' "$EGO_SIGNING_PASSWORD" > "$PW_FILE" )
elif [[ -t 0 ]]; then
   printf 'Password for %s: ' "$KEYS_FILE" >&2
   read -r -s PW
   printf '\n' >&2
   if [[ -z "$PW" ]]; then
      echo "error: empty password" >&2
      exit 1
   fi
   PW_FILE="$WORK_DIR/pw"
   ( umask 077; printf '%s' "$PW" > "$PW_FILE" )
   unset PW
else
   echo "error: no password source (set EGO_SIGNING_PW_FILE or EGO_SIGNING_PASSWORD, or run interactively)" >&2
   exit 1
fi

ABS_WORKER="$REPO_ROOT/$WORKER"
ABS_KEYS="$(cd "$(dirname "$KEYS_FILE")" && pwd)/$(basename "$KEYS_FILE")"
ABS_XRI="$(cd "$(dirname "$XRI")" && pwd)/$(basename "$XRI")"
ABS_PW="$(cd "$(dirname "$PW_FILE")" && pwd)/$(basename "$PW_FILE")"
# The worker writes its failure reason here; PixInsight console output does
# not reach our stdout under -r/--force-exit.
STATUS_FILE="$WORK_DIR/status.txt"

echo "Signing $XRI with $PI_BIN ..." >&2

RUN_ARG="-r=${ABS_WORKER},keys=${ABS_KEYS},pwfile=${ABS_PW},xri=${ABS_XRI},status=${STATUS_FILE}"
set +e
"$PI_BIN" -n --automation-mode "$RUN_ARG" --force-exit
PI_STATUS=$?
set -e

# The worker writes a status line: "OK ..." on success, "ERROR: ..." on
# failure. PixInsight's exit code under --force-exit is not a reliable
# signal, and a stale <Signature> from a previous run could otherwise mask a
# failure - so require the explicit OK marker from THIS run.
STATUS="$( [[ -s "$STATUS_FILE" ]] && cat "$STATUS_FILE" || true )"
if [[ "$STATUS" != OK* ]]; then
   echo "error: updates.xri was not signed (PixInsight exit $PI_STATUS)" >&2
   [[ -n "$STATUS" ]] && echo "worker: $STATUS" >&2
   exit 1
fi

echo "Done: $XRI signed. ${STATUS#OK }"
