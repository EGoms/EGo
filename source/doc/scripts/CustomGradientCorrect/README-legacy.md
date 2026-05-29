# Gradient Comparison – PixInsight 1.9.4 script

A feature script that runs three gradient-removal processes side by side on a
single target image, leaving the original untouched and producing six output
windows you can compare:

| Process                              | Corrected window | Residual window |
| ------------------------------------ | ---------------- | --------------- |
| GradientCorrection                   | `<id>_GC`        | `<id>_GC_bg`    |
| MultiscaleGradientCorrection         | `<id>_MGC`       | `<id>_MGC_bg`   |
| AutomaticBackgroundExtraction        | `<id>_ABE`       | `<id>_ABE_bg`   |

SpectrophotometricFluxCalibration (SPFC) is run first on a clone of the
target so that MGC has the photometric flux scales it needs. SPFC is
configured using the chosen telescope setup’s sensor QE curve and filter
parameters (broadband brand for LRGB / RGB, or narrowband wavelength +
bandwidth for SHO, HOO, etc.).

For mono images SPFC is run in single-channel mode using the filter
detected from the FITS `FILTER` keyword — narrowband bands (Ha / OIII /
SII) use the setup’s narrowband bandwidth, broadband (L / R / G / B) uses
the corresponding broadband filter curve.

Nothing is written to disk — all outputs are open windows.

## Install

1. Copy `GradientComparison.js` into your PixInsight scripts folder, e.g.
   `…/PixInsight/src/scripts/Utilities/` (any folder works; PI just needs to
   be able to find it).
2. In PixInsight: `Script > Feature Scripts… > Add` and point it at the
   folder you copied the script to. Click `Done`.
3. The script will appear under `Script > Utilities > Gradient Comparison`.

You can also run it ad-hoc from `Script > Execute Script File…` without
registering it.

## Use

1. Open the image you want to evaluate (mono channel, or a combined RGB /
   SHO / HOO / … master). The image must be plate-solved for SPFC and MGC
   to work (`Image > ImageSolver…` or via WBPP).
2. Run `Script > Utilities > Gradient Comparison`.
3. Pick the target image, the telescope setup, and the palette (or leave the
   palette on `Auto detect` and the script will parse it from the image
   name). Mono filter selection is auto-detected from the FITS `FILTER`
   keyword — no UI override.
4. Click `Run`. The script will:
   - clone the target into `<id>_master`,
   - run SPFC on the clone (single-channel mode for mono),
   - clone the SPFC-calibrated master three more times,
   - run GC, MGC, and ABE on those three clones,
   - rename the corrected images and gradient/background windows using the
     suffix scheme above,
   - close the intermediate `_master` window,
   - leave the original image untouched.

## Filter auto-detection (mono)

The script reads the `FILTER` FITS keyword and recognises (case-insensitive
substring match):

- `L`, `Lum`, `Luminance` → `L`
- `R`, `Red` → `R`
- `G`, `Green` → `G`
- `B`, `Blue` → `B`
- `Ha`, `H-Alpha`, `H_Alpha`, `H` → `Ha`
- `OIII`, `O-III`, `O3`, `O` → `OIII`
- `SII`, `S-II`, `S2`, `S` → `SII`

If your FITS header uses something else, add the keyword or extend the
`detectFilterFromHeader` function near the top of the script.

## Palette auto-detection (RGB)

The script looks at the image id (window name) for one of the following
tokens, surrounded by non-alphanumeric characters:

`LRGB`, `RGB`, `SHO`, `HOO`, `HSO`, `OHS`, `HOS`

So `M27_SHO_combined` and `RosetteSHO-master` both resolve to `SHO`. If the
script can’t find a token, pick a palette from the dropdown explicitly.

## Telescope setups (built-in)

| Setup                 | Camera        | Sensor chip (SPFC) | Filter brand (LRGB / NB) | NB bandwidth |
| --------------------- | ------------- | ------------------ | ------------------------ | ------------ |
| Chile PW17            | QHY 600 CMOS  | IMX 455            | Chroma / Chroma          | 8 nm         |
| New Mexico PW17       | QHY 600 CMOS  | IMX 455            | Chroma / Chroma          | 8 nm         |
| Astro-Physics RH-305  | FLI ML16200   | KAF 16200          | Astrodon / Astrodon      | 5 nm         |
| Astro-Physics AP-175  | FLI ML16803   | KAF 16803          | Astrodon / Astrodon      | 5 nm         |
| Takahashi TOA-150     | FLI ML16200   | KAF 16200          | Chroma / Chroma          | 8 nm         |
| Home                  | ASI 2600MM    | IMX 571            | Optolong / Antlia        | 4.5 nm       |

Filter curve names used in SPFC:

- **Chroma**: `Chroma L`, `Chroma R`, `Chroma G`, `Chroma B`
- **Astrodon**: `Astrodon E-series L`, `Astrodon E-series R`, `Astrodon E-series G`, `Astrodon E-series B`
- **Optolong**: `Optolong L`, `Optolong R`, `Optolong G`, `Optolong B`

## Tweaking SPFC database names

SPFC (and SPCC, which shares its filter database) looks up filter and
sensor QE curves by name. The exact strings vary between PixInsight
versions and depending on which filter packages you have installed. If
SPFC errors with something like *“unknown filter / unknown device”*, edit
the strings near the top of the script:

- `SETUPS[<name>].sensorQE` – the QE curve name for the sensor chip. The
  defaults are `"IMX 455"`, `"IMX 571"`, `"KAF 16200"`, `"KAF 16803"`,
  matching how PI groups SPFC sensors by chip rather than camera brand.
  Open `Process > ImageCalibration > SpectrophotometricFluxCalibration`
  once in PixInsight and copy the exact string from the *Device QE Curve*
  dropdown.
- `FILTER_CURVES[<brand>]` – the broadband LRGB filter curve names for
  Chroma / Astrodon / Optolong. Same trick: copy the strings PI shows in
  the SPFC filter dropdowns.

Narrowband doesn’t use curve names – it uses wavelength + bandwidth, both
of which the script already sets from the palette and the setup’s `narrowbandBandwidth`.

## What the script doesn’t do

- It doesn’t save anything to disk. The window list is the deliverable.
- It doesn’t override process defaults beyond what’s necessary (sensor /
  filter for SPFC, mono filter for MGC, keep-the-model toggles).
- For mono LRGB filters the “bandwidth” fed to MGC is a generic 100 nm
  placeholder; LRGB broadband filters don’t have a single bandwidth in the
  narrowband sense. SPFC uses the named broadband filter curve instead.

## Files

- `GradientComparison.js` – the script.
- `GradientComparison_README.md` – this file.
