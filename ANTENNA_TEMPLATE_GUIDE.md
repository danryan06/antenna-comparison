# Antenna entry guide

Use `antenna_template.json` as the shape for new rows in `antenna_data.json`.

## Identity

- `antenna_id` — immutable `vendor-slug:sku-slug` used by AP compatibility matching; freeze after assignment even if display vendor/SKU text changes
- `sku` — primary / display catalog number (Hubbell for AccelTex/Hubbell products)
- `legacy_sku` — searchable alternate number, shown on the detail page with a vendor-specific label:
  - AccelTex / Hubbell: the former AccelTex part number (e.g. `ATS-OP-245-13-4NP-36`: 13 dBi, 4 N-style plug leads, 36 in leads)
  - Ventev: the Ventev/Tessco SKU (e.g. `611751`). Ventev's `sku` is the **manufacturer part number** (e.g. `M7060060D3D43607E`), because that is how Ventev refers to its antennas.
- Detail links built from the alternate number (`antenna.html?id=ventev-611751`) still resolve and redirect to the canonical id.
- Search must match either SKU

## RF interfaces (compatibility)

- `rf_interfaces[]` — structured connector/path/cable facts for AP matching (`connector_family`, gender, counts, bands, cable inclusion)
- Keep raw `connector` / `lead_count` / `cable_*` for display; do not invent proprietary variants
- `compatibility_claims[]` — curated public claims with `ap_id` + `source_id` only (legacy `internal_notes.compatible_aps` stays internal and is never rendered)

## Form

One of: `Omni` | `Patch` | `High-density patch`  
(No separate Sector type for Wi-Fi; treat sectors as Patch.)

## Environment and applications

- `indoor_outdoor` is the install rating only: `Indoor` | `Outdoor` | `Indoor/Outdoor`. Use `null` when the datasheet does not say; the site shows "Not specified". CI rejects any other value.
- Where an antenna is meant to be used goes in `applications` (array). Known values: `Warehouse`. Add new values to `APPLICATIONS` in `.github/scripts/validate-data.js`.
- Warehouse rule: tag `Warehouse` when the vendor's own name, datasheet or brochure says the antenna is for warehouses. AccelTex families `ATS-OP-245-13-*`, `ATS-OP-245-8-*` and tri-band `ATS-OP-2456-8-*` are warehouse antennas. If a sheet names only a warehouse application and no install environment, use `Indoor`. IP54 with no other environment wording means `Indoor/Outdoor`.
- `applications` is maintainer-curated: the edit form does not show it and edits keep the existing value.

## Default table columns

`bands`, `gain_dbi`, `beamwidth`, `connector` (plus vendor/SKU). Lead count is choosable.

## Dual PDFs (AccelTex / Hubbell)

Prefer:

- Hubbell SPEC for deep electrical/mechanical and product photo
- Legacy AccelTex sheet for radiation patterns, IP rating, weight, included mount

Record conflicts in `field_notes` (maintainer-only; never rendered in the UI). Cite both in `sources`.

## Pattern captions

Store whatever the datasheet figure says if useful for mining, but the detail page collapses mid-band frequency lists to simple band labels (`2.4 GHz Horizontal`, `5 GHz Vertical`, `6 GHz Horizontal`). Prefer those simple labels when writing new data.

## Per-port patterns

Datasheets that publish a plot per port can be stored as-is. Label them `<band> GHz Port A Horizontal`, `<band> GHz Element 1 Vertical`, `<band> GHz AUX Horizontal`, and so on. When an antenna has 7 or more plots across two or more ports, the detail page shows one port at a time with chips to switch. Plots without a port in the label always show.

`validate-data.js` warns when a pattern's band is not in the antenna's `bands`; that is usually a plot borrowed from a sibling product.

## Pattern gallery order

The detail page sorts every radiation-pattern gallery, including antennas added later. Order is band, then element, then plane:

1. Bands low to high: 2.4, then 5, then 6. A chart that covers more than one band stays a single image and sorts by the bands in its caption (`2.4` before `2.4/5` before `5` before `5/6` before `6`).
2. Elements: 1, 2, 3… then A, B, C…. Port, Cable, and Slot labels use the same order. Within one band and element, Horizontal comes before Vertical.
3. A combined Horizontal + Vertical (or Horizontal/Vertical) plot stays the one image it already is. It is not split.

`pattern_images` may stay in datasheet order. Name each element in the label (`2.4 GHz Element 2 Horizontal`) or, if the label has no element, in the filename (`…-element-2-horizontal.jpg`).

## Radiation pattern filenames

Orientation must appear in the filename (full words, not `-h`/`-v`):

```
images/{vendor-slug}/{sku-slug}-pattern[-{band}]-horizontal.jpg
images/{vendor-slug}/{sku-slug}-pattern[-{band}]-vertical.jpg
```

Examples:

- `ats-03414-pattern-vertical.jpg`
- `ats-01050-pattern-2-4-ghz-horizontal.jpg`
- `ats-01123-pattern-5-ghz-horizontal-vertical.jpg` — only when one plot overlays both orientations (do not invent a split)

Optional `{band}` tokens: `2-4-ghz`, `5-ghz`, `6-ghz` when multiple patterns share an orientation. Keep `pattern_images[].label` human-readable (`Vertical`, `2.4 GHz Horizontal`, etc.).

## Images

Every image is downloaded by visitors and kept in git history forever, so add images at web size:

- JPEG, quality around 85, metadata stripped.
- Long edge at most about 2400 px. Radiation plots stay legible at that size in the zoom view.
- Under 1 MB each. `validate-data.js` fails CI above that.
- Don't re-save existing images to shrink them. A rewritten file adds a second copy to the repository history and saves only a few percent.

## Internal only

Put vendor-listed compatible APs under `internal_notes.compatible_aps`. Never render `field_notes` or `internal_notes` in the UI. These maintainer-only keys stay in `antenna_data.json` and are excluded from the generated public Pages catalog (`antenna_catalog.json`).
