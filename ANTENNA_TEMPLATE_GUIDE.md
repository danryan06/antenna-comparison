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

## Internal only

Put vendor-listed compatible APs under `internal_notes.compatible_aps`. Never render `field_notes` or `internal_notes` in the UI.
