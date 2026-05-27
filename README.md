# EGo PixInsight Scripts

A PixInsight 1.9.4+ (V8 runtime) script set for narrowband nebula and
broadband galaxy processing. Installs under **Scripts → EGo** in the
PixInsight menu.

| Script | Menu entry |
|---|---|
| `OneClickLinearWorkflow.js` | One-Click Linear Workflow |
| `MaskFactory.js` | Mask Factory |
| `ChannelPreview.js` | Channel Preview (all spaces) |
| `NarrowbandBlends.js` | Narrowband Blend Icon Factory |
| `NarrowbandBlendsPreview.js` | NB Blends Live Preview |
| `GradientComparison.js` | Multi Gradient Comparison |
| `StretchComparison.js` | Stretch Comparison |

Each script ships with documentation accessible from inside PixInsight
after install (Help → Browse Documentation).

---

## Installing in PixInsight

1. Open **Resources → Updates → Manage Repositories**.
2. Click **Add** and paste the repository URL.
3. Click **OK**, then **Resources → Updates → Check for Updates**.
4. Apply the update and restart PixInsight.

### Repository URLs

Production (stable):

```
https://raw.githubusercontent.com/EGoms/EGo/main/updates.xri
```

Sandbox (testing):

```
https://raw.githubusercontent.com/EGoms/EGo/sandbox/updates.xri
```

Add both URLs if you want to test pre-release builds. Enable the
sandbox checkbox only when you're ready to pull untested changes.

> The `raw.githubusercontent.com` host serves files directly with no
> redirect, which satisfies PixInsight's "no redirects allowed" rule
> for repository URLs.

---

## Repository layout

```
.
├── README.md                          this file
├── updates.xri                        manifest PixInsight reads
├── packages/
│   ├── ego-scripts-YYYYMMDD.tar.gz    src/ archive (type="script")
│   └── ego-doc-YYYYMMDD.tar.gz        doc/ archive (type="doc")
├── source/                            inputs to the build
│   ├── src/scripts/EGo/               .js files (one per script)
│   └── doc/scripts/<feature-id>/      docs (HTML + PIDoc + images/)
├── tools/
│   ├── build-package.sh               local build script
│   └── update_xri.py                  rewrites manifest after build
├── docs/
│   └── porting-guide.md               SpiderMonkey → V8 reference
└── .github/workflows/
    └── build-package.yml              CI: rebuild on push
```

The tarball gets `src/` and `doc/` at its root. When PixInsight expands
it, those directories merge into the install tree.

The folder name **must** match each script's `#feature-id`. For example,
`GradientComparison.js` declares `#feature-id CustomGradientCorrect`,
so its doc folder is `doc/scripts/CustomGradientCorrect/`, not
`doc/scripts/GradientComparison/`.

---

## Updating the repository

### Option A — local build

After editing anything under `source/`:

```bash
tools/build-package.sh
git add packages/ updates.xri source/
git commit -m "..."
git push
```

The build script:

1. Tars `source/src/` into `packages/ego-scripts-<YYYYMMDD>.tar.gz`
   (the `type="script"` package PixInsight registers as scripts).
2. Tars `source/doc/` into `packages/ego-doc-<YYYYMMDD>.tar.gz`
   (the `type="doc"` package PixInsight registers in its documentation
   catalog — required for the in-dialog help icon and Process
   Explorer to find per-script docs).
3. Computes the SHA-1 of each archive.
4. Rewrites `updates.xri` with the new filenames, SHA-1s, and release date.

Override the date with a CLI arg, e.g. `tools/build-package.sh 20260601`.
Override the archive format with `PKG_FMT=zip tools/build-package.sh`.

### Option B — CI

The `.github/workflows/build-package.yml` workflow runs the same build
script on every push to `main` or `sandbox` that touches `source/` or
the build tools, then commits the resulting tarball + manifest back to
the branch with `[skip ci]` in the message (which prevents an infinite
loop).

This means after a `source/` edit you can just `git push` and let CI
produce the artifact. Useful if you have multiple contributors and
don't want to rely on every one of them remembering to run the build
script.

Required GitHub repo settings for CI:

- **Settings → Actions → General → Workflow permissions**:
  *Read and write permissions* must be enabled so the workflow can
  push commits back.

### Sandbox workflow

1. `git checkout sandbox` (create if missing: `git checkout -b sandbox`).
2. Make your changes under `source/`.
3. Commit and push. CI builds the package on the `sandbox` branch.
4. In PixInsight, the sandbox repository URL serves the updated manifest.
5. Test. If happy, `git checkout main && git merge sandbox && git push`.

CI rebuilds the package on each branch independently, so the two URLs
serve different artifacts even though they live in one repo.

---

## Compatibility

- Targets PixInsight **1.9.4 Lockhart** or later (V8 runtime). All
  scripts have `#engine v8` and `CoreApplication.ensureMinimumVersion( 1, 9, 4 )`.
- Soft dependencies on third-party processes
  (BlurXTerminator, NoiseXTerminator, StarXTerminator, GradientCorrection)
  are detected at runtime and skipped with a console warning rather
  than crashing.

The SpiderMonkey → V8 porting notes that drove the rewrite are in
[`docs/porting-guide.md`](docs/porting-guide.md).

---

## License

Released under the
[PCL License 2.0](https://pixinsight.com/license/PCL-License-2.0.html).
