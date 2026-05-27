#!/usr/bin/env bash
# build-package.sh
#
# Build the PixInsight update package from source/, compute its SHA-1,
# and rewrite updates.xri to reference the new artifact.
#
# Run from anywhere; resolves repo root relative to this script. Works
# on macOS (BSD tools) and Linux (GNU tools).
#
# Usage:
#   tools/build-package.sh                  # date stamp = today (UTC)
#   tools/build-package.sh 20260131         # override date stamp
#   SKIP_SIGN_CHECK=1 tools/build-package.sh   # bypass .xsgn freshness check
#
# Output:
#   packages/ego-scripts-<date>.tar.gz      (or .zip if PKG_FMT=zip)
#   updates.xri rewritten in place
#
# Signed-release workflow (do these in order):
#   1. Edit .js sources under source/src/scripts/EGo/
#   2. In PixInsight: Script > CodeSign on each modified .js
#      (regenerates the .xsgn sidecar next to it)
#   3. Run this script (packs source/src with the fresh .xsgn files,
#      rewrites updates.xri with the new SHA-1)
#   4. (optional) In PixInsight: Script > CodeSign on updates.xri.
#      Only do this once your CPD has been APPROVED and published by
#      Pleiades - signing the .xri before approval makes the repo
#      unloadable ("Unknown code signing identity"). If unsigned,
#      the package and per-script .xsgn sidecars are still verified
#      at install/run time; only the repo-level signature is missing.
#      When signing, this MUST be the last step - any rebuild rewrites
#      the file and discards the signature.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DATE="${1:-$(date -u +%Y%m%d)}"
PKG_FMT="${PKG_FMT:-tar.gz}"
SRC_BASENAME="ego-scripts-${DATE}"
DOC_BASENAME="ego-doc-${DATE}"
SRC_NAME="${SRC_BASENAME}.${PKG_FMT}"
DOC_NAME="${DOC_BASENAME}.${PKG_FMT}"
SRC_PATH="packages/${SRC_NAME}"
DOC_PATH="packages/${DOC_NAME}"

if [[ ! -d source/src/scripts ]]; then
   echo "error: source/src/scripts not found - run from repo root" >&2
   exit 1
fi
if [[ ! -d source/doc/scripts ]]; then
   echo "error: source/doc/scripts not found - run from repo root" >&2
   exit 1
fi

mkdir -p packages

# Refuse to package stale or missing .xsgn sidecars. Every .js under
# source/src/scripts/EGo/ must have a sibling .xsgn that is no older
# than the .js itself - otherwise the script will fail verification
# in PixInsight on install. Set SKIP_SIGN_CHECK=1 to bypass (e.g. for
# an unsigned dry-run build).
if [[ "${SKIP_SIGN_CHECK:-0}" != "1" ]]; then
   missing=()
   stale=()
   while IFS= read -r -d '' js; do
      xsgn="${js%.js}.xsgn"
      if [[ ! -f "${xsgn}" ]]; then
         missing+=("${js}")
      elif [[ "${js}" -nt "${xsgn}" ]]; then
         stale+=("${js}")
      fi
   done < <(find source/src/scripts/EGo -type f -name '*.js' -print0)

   if (( ${#missing[@]} + ${#stale[@]} > 0 )); then
      echo "error: refusing to package - signatures need regenerating" >&2
      for f in "${missing[@]}"; do echo "  missing .xsgn for: ${f}" >&2; done
      for f in "${stale[@]}";   do echo "  stale  .xsgn for: ${f}" >&2; done
      echo "" >&2
      echo "Run PixInsight > Script > CodeSign on the listed .js files," >&2
      echo "then re-run this script. To bypass: SKIP_SIGN_CHECK=1 ..." >&2
      exit 3
   fi
fi

# Drop any older same-named build before rebuilding (idempotent within a day).
rm -f "${SRC_PATH}" "${DOC_PATH}"

# PixInsight installs packages by type. type="script" packages are
# registered as scripts; type="doc" packages are registered in the
# documentation catalog so Dialog.browseScriptDocumentation() and
# Process Explorer can find them. Bundling docs into a type="script"
# package puts the files on disk but leaves them invisible to PI's
# doc lookup. So we ship two archives.
case "${PKG_FMT}" in
   tar.gz)
      # -C source: archive paths are relative to source/, so src/ and
      # doc/ appear at the archive root - exactly what PixInsight wants.
      tar -C source \
         --exclude='.gitkeep' \
         --exclude='.DS_Store' \
         -czf "${SRC_PATH}" src

      # Ship only the rendered per-script HTML (and its images);
      # everything else under doc/ is PIDoc-compiler scaffolding that
      # PI either already has (doc/pidoc/) or doesn't need (the empty
      # docs/ pjsr/ tools/ skeleton dirs, plus the .pidoc sources).
      tar -C source \
         --exclude='doc/pidoc' \
         --exclude='doc/docs' \
         --exclude='doc/pjsr' \
         --exclude='doc/tools' \
         --exclude='*.pidoc' \
         --exclude='*.md' \
         --exclude='.gitkeep' \
         --exclude='.DS_Store' \
         -czf "${DOC_PATH}" doc
      ;;
   zip)
      ( cd source && zip -qr "../${SRC_PATH}" src \
         -x '*/.gitkeep' '*/.DS_Store' )
      ( cd source && zip -qr "../${DOC_PATH}" doc \
         -x 'doc/pidoc/*' 'doc/docs/*' 'doc/pjsr/*' 'doc/tools/*' \
            '*.pidoc' '*.md' '*/.gitkeep' '*/.DS_Store' )
      ;;
   *)
      echo "error: unsupported PKG_FMT=${PKG_FMT} (use tar.gz or zip)" >&2
      exit 2
      ;;
esac

# SHA-1 + size, portable across macOS and Linux.
hash_file() {
   if command -v sha1sum >/dev/null 2>&1; then
      sha1sum  "$1" | awk '{print $1}'
   else
      shasum -a 1 "$1" | awk '{print $1}'
   fi
}
size_file() {
   if stat -c%s . >/dev/null 2>&1; then
      stat -c%s "$1"
   else
      stat -f%z "$1"
   fi
}

SRC_SHA1="$(hash_file "${SRC_PATH}")"
DOC_SHA1="$(hash_file "${DOC_PATH}")"
SRC_SIZE="$(size_file "${SRC_PATH}")"
DOC_SIZE="$(size_file "${DOC_PATH}")"

echo "built  ${SRC_PATH}  (${SRC_SIZE} bytes, sha1 ${SRC_SHA1})"
echo "built  ${DOC_PATH}  (${DOC_SIZE} bytes, sha1 ${DOC_SHA1})"
echo "date   ${DATE}"

python3 tools/update_xri.py \
   --src-pkg  "${SRC_PATH}" \
   --src-sha1 "${SRC_SHA1}" \
   --doc-pkg  "${DOC_PATH}" \
   --doc-sha1 "${DOC_SHA1}" \
   --date     "${DATE}" \
   --xri      updates.xri

cat >&2 <<'NEXT'

next: commit updates.xri and the rebuilt package.
   Repo-level .xri signing is OPTIONAL and only safe once your CPD has
   been approved + published by Pleiades. Until then, ship updates.xri
   unsigned - the per-script .xsgn sidecars inside the package are
   still verified on install.
NEXT
