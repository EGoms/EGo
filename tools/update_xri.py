#!/usr/bin/env python3
"""
Rewrite the two <package> entries in updates.xri (one type="script",
one type="doc") with fresh fileName / sha1 / releaseDate values, and
refresh each title's date stamp.

Used by tools/build-package.sh and by the GitHub Actions workflow. The
xri file is short and we authored it ourselves, so simple regex
substitution is safe and avoids an XML library dependency.
"""

import argparse
import re
import sys
from pathlib import Path


def replace_package(text: str, pkg_type: str, pkg: str, sha1: str, date: str) -> str:
    """Find the <package ... type="<pkg_type>" ...> ... </package> block and
    rewrite its fileName, sha1, and releaseDate. Fail loudly if the block
    isn't found exactly once."""
    block_re = re.compile(
        r'(<package\b[^>]*?type="' + re.escape(pkg_type) + r'"[^>]*?>)',
        re.DOTALL,
    )
    matches = block_re.findall(text)
    if len(matches) != 1:
        sys.exit(f"refusing to edit xri: expected exactly one <package type=\"{pkg_type}\"> "
                 f"open tag, found {len(matches)}.")

    def rewrite(m: re.Match) -> str:
        tag = m.group(1)
        tag = re.sub(r'fileName="[^"]*"',    f'fileName="{pkg}"',     tag, count=1)
        tag = re.sub(r'sha1="[^"]*"',        f'sha1="{sha1}"',        tag, count=1)
        tag = re.sub(r'releaseDate="[^"]*"', f'releaseDate="{date}"', tag, count=1)
        return tag

    return block_re.sub(rewrite, text, count=1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-pkg",  required=True, help="script package path relative to repo root")
    ap.add_argument("--src-sha1", required=True, help="hex SHA-1 of the script archive")
    ap.add_argument("--doc-pkg",  required=True, help="doc package path relative to repo root")
    ap.add_argument("--doc-sha1", required=True, help="hex SHA-1 of the doc archive")
    ap.add_argument("--date",     required=True, help="release date as YYYYMMDD")
    ap.add_argument("--xri",      required=True, help="path to updates.xri")
    a = ap.parse_args()

    for label, sha in (("src", a.src_sha1), ("doc", a.doc_sha1)):
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            sys.exit(f"bad {label} sha1: {sha!r}")
    if not re.fullmatch(r"\d{8}", a.date):
        sys.exit(f"bad date: {a.date!r}")

    p = Path(a.xri)
    s = p.read_text()

    for marker in ("<<<<<<<", "=======", ">>>>>>>"):
        if marker in s:
            sys.exit(f"refusing to edit {a.xri}: contains merge conflict marker "
                     f"{marker!r}. Resolve the conflict by hand first.")

    s = replace_package(s, "script", a.src_pkg, a.src_sha1, a.date)
    s = replace_package(s, "doc",    a.doc_pkg, a.doc_sha1, a.date)

    date_fmt = f"{a.date[:4]}-{a.date[4:6]}-{a.date[6:8]}"
    s = re.sub(r"(EGo PJSR Scripts - )\S+",       rf"\g<1>{date_fmt}", s)
    s = re.sub(r"(EGo PJSR Documentation - )\S+", rf"\g<1>{date_fmt}", s)

    p.write_text(s)
    print(f"updated {a.xri}: src={a.src_pkg} ({a.src_sha1})")
    print(f"                doc={a.doc_pkg} ({a.doc_sha1})")
    print(f"                date={a.date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
