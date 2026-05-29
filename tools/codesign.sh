#!/usr/bin/env bash
# codesign.sh
#
# Generate PixInsight .xsgn code signatures for a list of script files by
# driving PixInsight in headless automation mode. This is the scripted
# equivalent of running Script > CodeSign on each .js by hand (the manual
# step described in tools/build-package.sh).
#
# PixInsight has no standalone "codesign" command; signing only happens
# inside the core application via the Security PJSR object. So this script
# launches PixInsight with --automation-mode and hands the work to the
# companion PJSR worker tools/codesign.js.
#
# Usage:
#   tools/codesign.sh [file ...]
#
#   With no arguments, signs every distributed EGo script:
#     source/src/scripts/EGo/*.js
#   Otherwise signs exactly the files you list.
#
# Each <file>.js gets a sibling <file>.xsgn. Re-run to refresh after edits.
#
# Configuration (env overrides):
#   EGO_SIGNING_KEYS  path to the .xssk secure signing keys file
#                     (default: $KEYS_FILE constant below)
#   PI_BIN            path to the PixInsight executable
#                     (default: macOS app bundle path below)
#
# Password source (checked in this order, never echoed, never on argv):
#   EGO_SIGNING_PW_FILE   path to a file whose raw bytes are the password
#                         (used as-is; not modified or deleted)
#   EGO_SIGNING_PASSWORD  the password as an env var (written to a 0600 temp
#                         file for the run, then shredded)
#   interactive prompt    if a TTY is attached and neither of the above is set
#
# Any temp password file we create is 0600, lives only for the run, and is
# shredded on exit, so the password is never visible in the process list.
set -euo pipefail

# --- Configuration ----------------------------------------------------------

# Location of the secure signing keys file (.xssk). Constant: set this to
# wherever you keep your EGo signing keys, or override with EGO_SIGNING_KEYS.
KEYS_FILE="${EGO_SIGNING_KEYS:-$HOME/Astro/evan.xssk}"

# PixInsight executable. macOS default app-bundle path; override with PI_BIN
# (e.g. on Linux: /opt/PixInsight/bin/PixInsight).
PI_BIN="${PI_BIN:-/Applications/PixInsight/PixInsight.app/Contents/MacOS/PixInsight}"

# Security entitlements to embed in each signature, one per array element.
# Empty by default - the EGo processing scripts need no special entitlements.
ENTITLEMENTS=()

# ----------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

WORKER="tools/codesign.js"

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

# Collect target files: explicit args, or the default EGo script set.
TARGETS=()
if [[ $# -gt 0 ]]; then
   TARGETS=("$@")
else
   shopt -s nullglob
   TARGETS=(source/src/scripts/EGo/*.js)
   shopt -u nullglob
fi
if [[ ${#TARGETS[@]} -eq 0 ]]; then
   echo "error: no target files to sign" >&2
   exit 1
fi

# Resolve to absolute paths and validate up front (PixInsight runs from its
# own working directory, so relative paths would not resolve).
ABS_TARGETS=()
for f in "${TARGETS[@]}"; do
   if [[ ! -f "$f" ]]; then
      echo "error: target file not found: $f" >&2
      exit 1
   fi
   ABS_TARGETS+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")")
done

# Temp working dir (0700) for the password, manifest, and entitlements files.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ego-codesign.XXXXXX")"
cleanup() {
   # Best-effort secure wipe of the password file before removal.
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

LIST_FILE="$WORK_DIR/targets.txt"
ENT_FILE="$WORK_DIR/entitlements.txt"

# Write the target manifest (one absolute path per line).
printf '%s\n' "${ABS_TARGETS[@]}" > "$LIST_FILE"

# Write entitlements (possibly empty).
if [[ ${#ENTITLEMENTS[@]} -gt 0 ]]; then
   printf '%s\n' "${ENTITLEMENTS[@]}" > "$ENT_FILE"
else
   : > "$ENT_FILE"
fi

# Resolve the keys-file password into a file PixInsight can read, per the
# contract documented in the header. A user-supplied EGO_SIGNING_PW_FILE
# lives outside WORK_DIR and is never modified or shredded; any temp file we
# create lives at $WORK_DIR/pw and is shredded by cleanup() on exit.
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
   # Write exact password bytes (no trailing newline) to a 0600 file.
   PW_FILE="$WORK_DIR/pw"
   ( umask 077; printf '%s' "$PW" > "$PW_FILE" )
   unset PW
else
   echo "error: no password source (set EGO_SIGNING_PW_FILE or EGO_SIGNING_PASSWORD, or run interactively)" >&2
   exit 1
fi

ABS_WORKER="$REPO_ROOT/$WORKER"
ABS_KEYS="$(cd "$(dirname "$KEYS_FILE")" && pwd)/$(basename "$KEYS_FILE")"
# PixInsight runs from its own working directory, so the password path must be
# absolute (EGO_SIGNING_PW_FILE may have been given as a relative path).
ABS_PW="$(cd "$(dirname "$PW_FILE")" && pwd)/$(basename "$PW_FILE")"

echo "Signing ${#ABS_TARGETS[@]} file(s) with $PI_BIN ..." >&2

# Record pre-run mtimes so we can verify each .xsgn was (re)written. We do
# not rely on PixInsight's process exit code, which is not a reliable signal
# for in-script failures under --force-exit.
declare -a SIG_PATHS
for t in "${ABS_TARGETS[@]}"; do
   SIG_PATHS+=("${t%.*}.xsgn")
done
declare -a PRE_MTIMES
mtime_of() { [[ -f "$1" ]] && stat -f%m "$1" 2>/dev/null || stat -c%Y "$1" 2>/dev/null || echo 0; }
for s in "${SIG_PATHS[@]}"; do
   if [[ -f "$s" ]]; then PRE_MTIMES+=("$(mtime_of "$s")"); else PRE_MTIMES+=("0"); fi
done

RUN_ARG="-r=${ABS_WORKER},keys=${ABS_KEYS},pwfile=${ABS_PW},list=${LIST_FILE},entfile=${ENT_FILE}"
set +e
"$PI_BIN" -n --automation-mode --no-attach "$RUN_ARG" --force-exit
PI_STATUS=$?
set -e

# Verify each expected signature exists and is newer than before the run.
FAILED=0
for i in "${!SIG_PATHS[@]}"; do
   s="${SIG_PATHS[$i]}"
   pre="${PRE_MTIMES[$i]}"
   if [[ ! -f "$s" ]]; then
      echo "FAIL  no signature produced: $s" >&2
      FAILED=$((FAILED+1))
   elif [[ "$(mtime_of "$s")" -le "$pre" && "$pre" -ne 0 ]]; then
      echo "FAIL  signature not updated: $s" >&2
      FAILED=$((FAILED+1))
   else
      echo "ok    $s"
   fi
done

if [[ $FAILED -ne 0 ]]; then
   echo "error: $FAILED file(s) were not signed (PixInsight exit $PI_STATUS)" >&2
   exit 1
fi

echo "Done: ${#SIG_PATHS[@]} signature(s) written."
