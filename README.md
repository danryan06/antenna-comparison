# AntennaComparison

An open-source database for comparing Wi-Fi antennas (indoor and outdoor). Explore, filter, and compare antennas across vendors — AccelTex / Hubbell, Ventev, OEM lines, and major third-party manufacturers.

Sibling of [AP Comparison](https://apcomparison.com) and [Switch Comparison](https://switchcomparison.com).

🌐 **Live Site:** [https://antennacomparison.com](https://antennacomparison.com) (GitHub Pages + custom domain)

## Features

- **Comparison table** — sortable, filterable catalog of antennas
- **Filters** — vendor, form (Omni / Patch / High-density patch), indoor/outdoor
- **AP compatibility (Finder)** — pick a canonical AP id (`?ap=`) from the pinned AP Comparison RF export; see best-effort statuses, reasons, and manufacturer verification links (not a certification)
- **Search** — matches primary Hubbell SKU and legacy AccelTex SKU
- **Choose columns** — show/hide fields; default columns are bands, gain, beamwidth, connector
- **Side-by-side compare** — select multiple antennas and compare
- **Detail pages** — product photos, radiation patterns, dimensions, included parts, dual datasheet sources
- **Edit / submit** — correct an antenna from its detail page, or submit a new one from the catalog. Both open a prefilled GitHub issue
- **Responsive** — desktop and mobile

## Data fields

Each antenna entry includes:

- **Identity**: vendor, primary SKU (Hubbell catalog number), legacy AccelTex SKU (searchable alias)
- **RF**: bands, frequency range, gain, beamwidth (H/V), connector, lead count, polarization, VSWR, isolation
- **Cable / mechanical**: cable length & type, dimensions, weight, radome, mount/install type, included parts
- **Environment**: indoor/outdoor, IP rating, wind rating, operating temperature
- **Media**: product photos, radiation pattern plots, dimension drawings
- **Sources**: dual PDF citations where AccelTex/Hubbell publish both a Hubbell SPEC and a legacy AccelTex sheet

`field_notes` (merge/conflict notes) and `internal_notes` (including vendor-listed compatible APs) are maintainer-only. They stay in the authoring file `antenna_data.json` for contributors and automation, are **never** shown in the UI, and are **not** included in the public Pages catalog (`antenna_catalog.json`). Because this repository is public, anyone who clones it can still read authoring notes — do not store secrets there. See [SECURITY.md](./SECURITY.md).

## How to use

1. **Search** for a SKU (Hubbell or legacy AccelTex), vendor, or connector
2. **Filter** by form type or indoor/outdoor
3. **Choose Columns** to focus the table
4. Open a row for the full detail page (photos, patterns, dimensions, sources)
5. Tick two or more rows and click **Compare**

## Local development

```bash
# From the repo root — serve over HTTP (file:// cannot fetch the catalog)
python3 -m http.server 8000 --bind 127.0.0.1
# then open http://127.0.0.1:8000/

# Run every validator and test at once (same checks CI runs):
npm test

# Or individually:
node .github/scripts/validate-data.js
node .github/scripts/validate-compatibility.js
node .github/scripts/build-public-catalog.js --check
node .github/scripts/test-antenna-submit.js
node .github/scripts/test-compatibility-matcher.js
node .github/scripts/test-datasheet-label-xss.js
node .github/scripts/test-url-sanitizer.js
node .github/scripts/test-detail-back.js
node .github/scripts/test-pattern-ports.js
node .github/scripts/test-html-sinks.js
```

Supported browsers: current Chrome, Firefox, and Safari/iOS Safari (desktop + ~375px mobile).

## Contributing

From the catalog, use **Submit antenna** to propose a new entry. From an antenna’s detail page, use **Edit this antenna** to propose a correction. Both forms cover the public specs in `antenna_data.json` (SKU, legacy SKU, vendor, form factor, bands, gain, beamwidth, connector, lead count, and the rest). They generate a JSON snippet and open a prefilled GitHub issue:

`https://github.com/danryan06/antenna-comparison/issues/new`

Review the issue and submit it. A maintainer adds the `antenna-submission` label. That label runs automation which opens a pull request updating `antenna_data.json`. New issues are titled `New Antenna: …`. Edits are titled `Edit Antenna: …`.

Prefer to edit the data yourself? Open a pull request that changes `antenna_data.json` and add images under `images/<vendor>/`. Follow `antenna_template.json` for field shape.

Always cite vendor datasheets. When AccelTex/Hubbell publish dual PDFs, merge fields and record conflicts in `field_notes`. `field_notes` and `internal_notes` (including compatible-AP lists) are maintainer-only and are not part of the public form.

## Technical details

- **Frontend**: pure HTML, CSS, and JavaScript (no frameworks) — same family as AP Comparison
- **Authoring data**: `antenna_data.json` (full catalog, including maintainer-only notes)
- **Public Pages catalog**: `antenna_catalog.json` (allowlisted public fields only; this is what the site loads)
- **Hosting**: GitHub Pages (`main` / root) with custom domain `antennacomparison.com` (tracked `CNAME` at repo root so deploys keep the domain)
- **robots.txt**: crawler hints only (e.g. `Disallow: /antenna_data.json`). It does **not** hide maintainer notes — `antenna_data.json` remains public in the GitHub repo and is still fetchable; the site loads `antenna_catalog.json`
- **Security**: see [SECURITY.md](./SECURITY.md)
- **License**: MIT (code). Vendor media remains vendor property — see License below

Regenerate the public catalog after authoring changes:

```bash
node .github/scripts/build-public-catalog.js
node .github/scripts/build-public-catalog.js --check
```

Compatibility artifacts (pinned AP Comparison export + generated index):

```bash
node .github/scripts/validate-compatibility.js
node .github/scripts/build-compatibility-index.js
node .github/scripts/build-compatibility-index.js --check
node .github/scripts/test-compatibility-matcher.js
```

CI fails if `antenna_catalog.json` is missing, stale, or contains maintainer-only keys, or if the compatibility index drifts from the matcher.

### Project structure

```
├── index.html              # Browse / filter table
├── antenna.html            # Detail page
├── edit.html               # Edit an existing antenna
├── submit.html             # Submit a new antenna
├── compare.html            # Side-by-side compare
├── finder.html             # Feature Finder (+ AP compatibility lookup)
├── 404.html                # Branded not-found recovery (root base href for custom domain)
├── CNAME                   # Custom domain for GitHub Pages (antennacomparison.com)
├── robots.txt              # Crawler hints only; does not hide public repo files
├── sitemap.xml             # Public page list for crawlers
├── style.css               # Shared styling
├── antenna-format.js       # Display helpers + shared URL sanitizer
├── compatibility-matcher.js
├── connector-normalize.js
├── data/compatibility/     # Pinned AP RF export + generated index
├── antenna-submit.js       # Edit / submit form helpers
├── antenna_data.json       # Authoring catalog (may include maintainer notes)
├── antenna_catalog.json    # Public Pages catalog (allowlisted fields only)
├── antenna_catalog.meta.json
├── antenna_template.json   # Entry template
├── images/                 # Product photos & patterns
├── SECURITY.md             # Vulnerability reporting
├── LICENSE                 # MIT
└── README.md
```

## License

Code is released under the MIT License (see LICENSE). Product images and radiation plots are the property of their respective vendors and are used for identification only. Specifications come from vendor documentation; always verify with the vendor before purchasing. Part numbers use JetBrains Mono, licensed under the SIL Open Font License (`fonts/OFL.txt`).

## Maintainer

Maintained by [Dan Ryan](https://github.com/danryan06).
