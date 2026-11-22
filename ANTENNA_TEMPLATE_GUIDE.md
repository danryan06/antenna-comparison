# Antenna entry guide

Use `antenna_template.json` as the shape for new rows in `antenna_data.json`.

## Identity

- `sku` — primary / display catalog number (Hubbell for AccelTex/Hubbell products)
- `legacy_sku` — searchable AccelTex (or prior) alias; show on the detail page
- Search must match either SKU

## Form

One of: `Omni` | `Patch` | `High-density patch`  
(No separate Sector type for Wi-Fi; treat sectors as Patch.)

## Default table columns

`bands`, `gain_dbi`, `beamwidth`, `connector` (plus vendor/SKU). Lead count is choosable.

## Dual PDFs (AccelTex / Hubbell)

Prefer:

- Hubbell SPEC for deep electrical/mechanical and product photo
- Legacy AccelTex sheet for radiation patterns, IP rating, weight, included mount

Record conflicts in `field_notes` (maintainer-only; never rendered in the UI). Cite both in `sources`.

## Pattern captions

Store whatever the datasheet figure says if useful for mining, but the detail page collapses mid-band frequency lists to simple band labels (`2.4 GHz Horizontal`, `5 GHz Vertical`, `6 GHz Horizontal`). Prefer those simple labels when writing new data.

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

## Internal only

Put vendor-listed compatible APs under `internal_notes.compatible_aps`. Never render `field_notes` or `internal_notes` in the UI. These maintainer-only keys stay in `antenna_data.json` and are excluded from the generated public Pages catalog (`antenna_catalog.json`).
