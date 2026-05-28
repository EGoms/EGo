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
#
# Output:
#   packages/ego-scripts-<date>.tar.gz      (or .zip if PKG_FMT=zip)
#   updates.xri rewritten in place
#
# Code signing
# ------------
# This script does NOT sign anything. PixInsight's CodeSign tool only
# runs inside PixInsight itself (Security.generateCodeSignatureFile is
# a PJSR call), so signing can't happen in headless CI. The current
# stance: ship unsigned until our CPD is approved + published by
# Pleiades. Until then, signed .xsgn/.xri files cause hard "Unknown
# code signing identity" failures on every machine that fetches the
# repo - including the developer's own, when going through the remote-
# repository fetch path.
#
# Once the CPD is approved, the manual signed-release flow is:
#   1. Edit .js sources under source/src/scripts/EGo/
#   2. PixInsight > Script > CodeSign on each modified .js
#      (generates a sibling .xsgn sidecar)
#   3. Run this script locally (packs source/src with the .xsgn files,
#      rewrites updates.xri with the new SHA-1)
#   4. Commit and push
# Do NOT sign updates.xri while the auto-rebuild CI workflow is on -
# CI will rewrite it on the next push and strip the signature.
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
      # src/scripts/MosaicEGo is tracked in git but deliberately kept out
      # of the public update package (private port, not for distribution).
      tar -C source \
         --exclude='.gitkeep' \
         --exclude='.DS_Store' \
         --exclude='src/scripts/MosaicEGo' \
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
         -x '*/.gitkeep' '*/.DS_Store' 'src/scripts/MosaicEGo/*' )
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

