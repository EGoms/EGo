#!/usr/bin/env python3
"""
Rewrite the single <package> entry in updates.xri with a fresh
fileName / sha1 / releaseDate, and refresh the title's date stamp.

Used by tools/build-package.sh and by the GitHub Actions workflow. The
xri file is short and we authored it ourselves, so simple regex
substitution is safe and avoids an XML library dependency.
"""

import argparse
import re
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkg",  required=True, help="package path relative to repo root")
    ap.add_argument("--sha1", required=True, help="hex SHA-1 of the package archive")
    ap.add_argument("--date", required=True, help="release date as YYYYMMDD")
    ap.add_argument("--xri",  required=True, help="path to updates.xri")
    a = ap.parse_args()

    if not re.fullmatch(r"[0-9a-f]{40}", a.sha1):
        sys.exit(f"bad sha1: {a.sha1!r}")
    if not re.fullmatch(r"\d{8}", a.date):
        sys.exit(f"bad date: {a.date!r}")

    p = Path(a.xri)
    s = p.read_text()

    s = re.sub(r'fileName="[^"]*"',    f'fileName="{a.pkg}"',     s, count=1)
    s = re.sub(r'sha1="[^"]*"',        f'sha1="{a.sha1}"',        s, count=1)
    s = re.sub(r'releaseDate="[^"]*"', f'releaseDate="{a.date}"', s, count=1)

    date_fmt = f"{a.date[:4]}-{a.date[4:6]}-{a.date[6:8]}"
    s = re.sub(r"(EGo PJSR Scripts - )\S+", rf"\g<1>{date_fmt}", s)

    p.write_text(s)
    print(f"updated {a.xri}: pkg={a.pkg}  sha1={a.sha1}  date={a.date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
