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
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DATE="${1:-$(date -u +%Y%m%d)}"
PKG_FMT="${PKG_FMT:-tar.gz}"
PKG_BASENAME="ego-scripts-${DATE}"
PKG_NAME="${PKG_BASENAME}.${PKG_FMT}"
PKG_PATH="packages/${PKG_NAME}"

if [[ ! -d source/src/scripts ]]; then
   echo "error: source/src/scripts not found - run from repo root" >&2
   exit 1
fi

mkdir -p packages

# Drop any older same-named build before rebuilding (idempotent within a day).
rm -f "${PKG_PATH}"

case "${PKG_FMT}" in
   tar.gz)
      # -C source: archive paths are relative to source/, so src/ and
      # doc/ appear at the archive root - exactly what PixInsight wants.
      # We only ship the rendered per-script HTML (and its images);
      # everything else under doc/ is PIDoc-compiler scaffolding that
      # PI either already has (doc/pidoc/) or doesn't need (the empty
      # docs/ pjsr/ tools/ skeleton dirs, plus the .pidoc sources).
      tar -C source \
         --exclude='doc/pidoc' \
         --exclude='doc/docs' \
         --exclude='doc/pjsr' \
         --exclude='doc/tools' \
         --exclude='*.pidoc' \
         --exclude='.gitkeep' \
         --exclude='.DS_Store' \
         -czf "${PKG_PATH}" src doc
      ;;
   zip)
      ( cd source && zip -qr "../${PKG_PATH}" src doc \
         -x 'doc/pidoc/*' 'doc/docs/*' 'doc/pjsr/*' 'doc/tools/*' \
            '*.pidoc' '*/.gitkeep' '*/.DS_Store' )
      ;;
   *)
      echo "error: unsupported PKG_FMT=${PKG_FMT} (use tar.gz or zip)" >&2
      exit 2
      ;;
esac

# SHA-1, portable across macOS and Linux.
if command -v sha1sum >/dev/null 2>&1; then
   SHA1="$(sha1sum  "${PKG_PATH}" | awk '{print $1}')"
else
   SHA1="$(shasum -a 1 "${PKG_PATH}" | awk '{print $1}')"
fi

# Size, portable.
if stat -c%s . >/dev/null 2>&1; then
   SIZE="$(stat -c%s "${PKG_PATH}")"
else
   SIZE="$(stat -f%z "${PKG_PATH}")"
fi

echo "built  ${PKG_PATH}"
echo "size   ${SIZE} bytes"
echo "sha1   ${SHA1}"
echo "date   ${DATE}"

python3 tools/update_xri.py \
   --pkg "${PKG_PATH}" \
   --sha1 "${SHA1}" \
   --date "${DATE}" \
   --xri updates.xri
