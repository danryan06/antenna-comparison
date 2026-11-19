# AntennaComparison

An open-source database for comparing Wi-Fi antennas (indoor and outdoor). Explore, filter, and compare antennas across vendors — starting with AccelTex / Hubbell, with Ventev and OEM antennas planned next.

Sibling of [AP Comparison](https://apcomparison.com) and [Switch Comparison](https://switchcomparison.com).

🌐 **Live Site:** [antennacomparison.com](https://antennacomparison.com) *(DNS pending)* | [GitHub Pages](https://danryan06.github.io/antenna-comparison)

## Features

- **Comparison table** — sortable, filterable catalog of antennas
- **Filters** — vendor, form (Omni / Patch / High-density patch), indoor/outdoor
- **Search** — matches primary Hubbell SKU and legacy AccelTex SKU
- **Choose columns** — show/hide fields; default columns are bands, gain, beamwidth, connector
- **Side-by-side compare** — select multiple antennas and compare
- **Detail pages** — product photos, radiation patterns, dimensions, included parts, dual datasheet sources
- **Responsive** — desktop and mobile

## Data fields

Each antenna entry includes:

- **Identity**: vendor, primary SKU (Hubbell catalog number), legacy AccelTex SKU (searchable alias)
- **RF**: bands, frequency range, gain, beamwidth (H/V), connector, lead count, polarization, VSWR, isolation
- **Cable / mechanical**: cable length & type, dimensions, weight, radome, mount/install type, included parts
- **Environment**: indoor/outdoor, IP rating, wind rating, operating temperature
- **Media**: product photos, radiation pattern plots, dimension drawings
- **Sources**: dual PDF citations where AccelTex/Hubbell publish both a Hubbell SPEC and a legacy AccelTex sheet

Vendor-listed compatible APs are stored in `internal_notes` for maintainers only and are **never** shown in the UI.

## How to use

1. **Search** for a SKU (Hubbell or legacy AccelTex), vendor, or connector
2. **Filter** by form type or indoor/outdoor
3. **Choose Columns** to focus the table
4. Open a row for the full detail page (photos, patterns, dimensions, sources)
5. Tick two or more rows and click **Compare**

## Contributing

This is an early scaffold. The first seeded entry is AccelTex / Hubbell **ATS-03414** (legacy **ATS-OHDP-2456-14-8RPSP-36**). Prefer pull requests that edit `antenna_data.json` and add images under `images/<vendor>/`. Follow `antenna_template.json` for field shape.

Always cite vendor datasheets. When AccelTex/Hubbell publish dual PDFs, merge fields and record conflicts in `field_notes`.

## Technical details

- **Frontend**: pure HTML, CSS, and JavaScript (no frameworks) — same family as AP Comparison
- **Data**: `antenna_data.json`
- **Hosting**: GitHub Pages (`main` / root), with `CNAME` for `antennacomparison.com`
- **License**: MIT

### Project structure

```
├── index.html              # Browse / filter table
├── antenna.html            # Detail page
├── compare.html            # Side-by-side compare
├── style.css               # Shared styling
├── antenna-format.js       # Display helpers
├── antenna_data.json       # Antenna catalog
├── antenna_template.json   # Entry template
├── images/                 # Product photos & patterns
├── CNAME                   # antennacomparison.com
├── LICENSE                 # MIT
└── README.md
```

## License

Code is released under the MIT License (see LICENSE). Product images and radiation plots are the property of their respective vendors and are used for identification only. Specifications come from vendor documentation; always verify with the vendor before purchasing. Part numbers use JetBrains Mono, licensed under the SIL Open Font License (`fonts/OFL.txt`).

## Maintainer

Maintained by [Dan Ryan](https://github.com/danryan06).
