#!/usr/bin/env python3
"""Mine TE Connectivity (Laird External) enterprise Wi-Fi AP antennas into antenna_data.json."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "antenna_data.json"
IMG = ROOT / "images" / "te-connectivity"
CATALOG_PDF_URL = (
    "https://www.te.com/content/dam/te-com/documents/consumer-devices/"
    "global/te-connectivity-antenna-catalog.pdf"
)
CHECKED = "2026-11-22"
VENDOR = "TE Connectivity"


def slug(sku: str) -> str:
    s = sku.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def mm_in(dims: str) -> str:
    """Pass through already-formatted dimensions strings."""
    return dims


def te_ds(doc: str) -> str:
    return (
        "https://www.te.com/commerce/DocumentDelivery/DDEController?"
        f"Action=srchrtrv&DocNm={doc}&DocType=DS&DocLang=EN"
    )


def te_product(pn: str) -> str:
    return f"https://www.te.com/en/product-{pn}.html"


def source(label, sid, url, note=None):
    s = {"label": label, "id": sid, "url": url, "last_checked": CHECKED}
    if note:
        s["note"] = note
    return s


def catalog_source(note=None):
    return source(
        "TE Connectivity Antenna Catalog",
        "te-connectivity-antenna-catalog",
        CATALOG_PDF_URL,
        note,
    )


def save_jpg(src: Path, dst: Path, max_side: int = 1200) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1:
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=88, optimize=True)


def prep_images() -> dict:
    """Build image assets; return map of logical key -> relative url list helpers."""
    IMG.mkdir(parents=True, exist_ok=True)
    mine = Path("/tmp/te-mine")
    cat = Path("/tmp/te-ds/catalog-imgs")

    # ProSig shared product + patterns
    save_jpg(mine / "l000684-product.png", IMG / "l000684-04.jpg")
    save_jpg(mine / "l000684-product.png", IMG / "l000684-03.jpg")
    if (mine / "l000684-product-alt.png").exists():
        save_jpg(mine / "l000684-product-alt.png", IMG / "l000684-04-alt.jpg")
        save_jpg(mine / "l000684-product-alt.png", IMG / "l000684-03-alt.jpg")
    if (mine / "l000684-dimensions.png").exists():
        save_jpg(mine / "l000684-dimensions.png", IMG / "l000684-04-dimensions.jpg", 1600)
        save_jpg(mine / "l000684-dimensions.png", IMG / "l000684-03-dimensions.jpg", 1600)

    for band, plane in [
        ("2-4-ghz", "horizontal"),
        ("2-4-ghz", "vertical"),
        ("5-ghz", "horizontal"),
        ("5-ghz", "vertical"),
        ("6-ghz", "horizontal"),
        ("6-ghz", "vertical"),
    ]:
        src = mine / f"pat-{band}-{plane}.png"
        if src.exists():
            for pn in ("l000684-03", "l000684-04"):
                save_jpg(src, IMG / f"{pn}-pattern-{band}-{plane}.jpg")

    # Catalog embeds — map page images to SKUs (order matches catalog cards)
    catalog_map = {
        # page 149
        "oc24519-fnm": cat / "p149_img1_260x212.png",
        "ant-w63-ipw1-np": cat / "p149_img2_207x199.png",
        # page 150
        "s5156wbsfnm": cat / "p150_img0_123x252.png",
        "ant-5gw-ipw3-np": cat / "p150_img1_205x200.png",
        # page 152
        "s2401240p12nf": cat / "p152_img0_260x196.png",
        "md24-12": cat / "p152_img1_183x210.png",
        "pa24-19": cat / "p152_img2_148x227.png",
        "pa58-24": cat / "p152_img3_163x223.png",
        # page 153
        "s24517pt36rsm": cat / "p153_img0_211x233.png",
        "pdm24519-fnf": cat / "p153_img1_239x186.png",
        "s24493ts36rsm": cat / "p153_img2_243x174.png",
        # page 154
        "pdm24499-fnf": cat / "p154_img0_233x181.png",
        "pdq24499-91nm": cat / "p154_img1_206x184.png",
        "pdq24496-fnf": cat / "p154_img2_205x183.png",
        "pdm245115h-fnf": cat / "p154_img3_237x184.png",
        # page 155
        "psq24495-91rsm": cat / "p155_img0_241x222.png",
        "pdq244915-91nf": cat / "p155_img1_232x243.png",
        # page 157
        "ye240015": cat / "p157_img0_228x161.png",
        "cmm24513s4-91rsm": cat / "p157_img1_211x202.png",
        # page 148 dual-band baton
        "oc24527-fnf": cat / "p148_img1_177x221.png",
        # page 146/147 batons
        "oc24005-fnf": cat / "p146_img1_80x202.png",
        "fg24008": cat / "p147_img0_80x198.png",
        "oc515010h-fnm": cat / "p151_img1_202x207.png",
    }
    for key, src in catalog_map.items():
        if src.exists():
            save_jpg(src, IMG / f"{key}.jpg", 900)
        else:
            print("missing catalog img", key, src)

    # Share connector-variant product photos
    shares = {
        "pdq24496-91nf": "pdq24496-fnf",
        "pdq24496-91nm": "pdq24496-fnf",
        "pdq24499-91nf": "pdq24499-91nm",
        "pdq244915-91nm": "pdq244915-91nf",
        "pdq244915-fnf": "pdq244915-91nf",
        "psq24495-91nf": "psq24495-91rsm",
        "psq24495-91nm": "psq24495-91rsm",
        "op24516ds-91rsmm": "cmm24513s4-91rsm",  # placeholder avoided — use dedicated if present
        "l000962-01": "l000684-03",
        "l000962-02": "l000684-04",
        "ant-5gw-ipw2-np": "ant-5gw-ipw3-np",
    }
    # Prefer not to fake OP24516 with ceiling dome — leave missing and use rendered page crop
    shares.pop("op24516ds-91rsmm", None)
    for dst_key, src_key in shares.items():
        src = IMG / f"{src_key}.jpg"
        dst = IMG / f"{dst_key}.jpg"
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)

    # OP24516 — no catalog photo; use a simple radome-like placeholder from page-157 ceiling? Skip — render from brochure if needed
    # Create a minimal branded card from catalog page text? Better: use WLAN brochure if we extract an image.
    # Fall back: copy ProSig panel is wrong. Use omni baton as temporary? No — leave image from rendered blank.
    # Extract from general brochure pages if any antenna photos
    return {}


def entry(**kwargs):
    e = dict(kwargs)
    assert e["vendor"] == VENDOR
    assert e["form"] in ("Omni", "Patch", "High-density patch")
    assert "sources" in e and e["sources"]
    for s in e["sources"]:
        assert s.get("last_checked") == CHECKED
    return e


def build_records() -> list[dict]:
    recs: list[dict] = []

    def add(e: dict):
        sk = slug(e["sku"])
        img = f"images/te-connectivity/{sk}.jpg"
        if (ROOT / img).exists():
            e.setdefault("image_url", img)
        # shared ProSig patterns
        if e["sku"].startswith("L000684-"):
            e["pattern_images"] = [
                {
                    "label": "2.4 GHz Horizontal",
                    "url": f"images/te-connectivity/{sk}-pattern-2-4-ghz-horizontal.jpg",
                },
                {
                    "label": "2.4 GHz Vertical",
                    "url": f"images/te-connectivity/{sk}-pattern-2-4-ghz-vertical.jpg",
                },
                {
                    "label": "5 GHz Horizontal",
                    "url": f"images/te-connectivity/{sk}-pattern-5-ghz-horizontal.jpg",
                },
                {
                    "label": "5 GHz Vertical",
                    "url": f"images/te-connectivity/{sk}-pattern-5-ghz-vertical.jpg",
                },
                {
                    "label": "6 GHz Horizontal",
                    "url": f"images/te-connectivity/{sk}-pattern-6-ghz-horizontal.jpg",
                },
                {
                    "label": "6 GHz Vertical",
                    "url": f"images/te-connectivity/{sk}-pattern-6-ghz-vertical.jpg",
                },
            ]
            dim = f"images/te-connectivity/{sk}-dimensions.jpg"
            if (ROOT / dim).exists():
                e["dimension_image_url"] = dim
                e["dimension_image_kind"] = "mechanical"
            alt = f"images/te-connectivity/{sk}-alt.jpg"
            if (ROOT / alt).exists():
                e["images"] = [{"label": "Product photo", "url": alt}]
        recs.append(entry(**e))

    # --- ProSig L000684 ---
    common_684 = dict(
        vendor=VENDOR,
        form="Patch",
        indoor_outdoor="Indoor/Outdoor",
        bands=["2.4", "5", "6"],
        frequency_range="2.4-2.5/4.9-6.0/6.0-7.125 GHz",
        gain_dbi={"2.4": 6.1, "5": 6.1, "6": 5.4},
        beamwidth={
            "horizontal": {"2.4": "79°", "5": "83°", "6": "80°"},
            "vertical": {"2.4": "79°", "5": "79°", "6": "78°"},
        },
        connector="RPSMA",
        polarization="Dual Slant ±45°",
        cable_length="75 cm (29.5 in)",
        cable_type="RG58LL plenum",
        dimensions="200 × 200 × 46.5 mm (7.87 × 7.87 × 1.83 in)",
        ip_rating="IP67",
        radome="ASA Luran S 788T UV (White)",
        mount_type="Pole/mast or wall bracket (included)",
        wind_rating="135 mph (217 km/h)",
        vswr="<2.0:1 average",
        isolation="20/25/23 dB (2.4/5/6)",
        operating_temp="-50 to +70 °C",
        datasheet_urls=[
            {
                "label": "TE ANT-DS-L000684",
                "url": te_ds("ENG_DS_ANT-DS-L000684_A4"),
            }
        ],
        field_notes={
            "polarization": "Chipdip/early revision text said Linear Vertical + omni azimuth; TE A4 / Arrow revision and te.com list Dual Slant ±45°. Primary uses Dual Slant.",
            "operating_temp": "A4/Arrow sheet -50 to +70 °C; earlier Chipdip copy -50 to +65 °C.",
            "pattern_images": "Datasheet El. Plane 1 (Phi 0°) mapped to Horizontal; El. Plane 2 (Phi 90°) to Vertical.",
        },
    )
    add(
        {
            **common_684,
            "sku": "L000684-03",
            "legacy_sku": "PSD24716-75RSMM",
            "name": "ProSig Wi-Fi 6E/7 Tri-Band 2x2 MIMO Directional Panel",
            "lead_count": 2,
            "weight": "0.43 kg (0.95 lb)",
            "sources": [
                source(
                    "TE ANT-DS-L000684",
                    "ENG_DS_ANT-DS-L000684_A4",
                    te_ds("ENG_DS_ANT-DS-L000684_A4"),
                ),
                source(
                    "TE product L000684-03",
                    "L000684-03",
                    te_product("L000684-03"),
                ),
            ],
            "internal_notes": {
                "maintainer": "Current TE ProSig SKU; legacy Laird-style alias PSD24716-75RSMM."
            },
        }
    )
    add(
        {
            **common_684,
            "sku": "L000684-04",
            "legacy_sku": "PSQ24716-75RSMM",
            "name": "ProSig Wi-Fi 6E/7 Tri-Band 4x4 MIMO Directional Panel",
            "lead_count": 4,
            "weight": "0.54 kg (1.19 lb)",
            "sources": [
                source(
                    "TE ANT-DS-L000684",
                    "ENG_DS_ANT-DS-L000684_A4",
                    te_ds("ENG_DS_ANT-DS-L000684_A4"),
                ),
                source(
                    "TE product L000684-04",
                    "L000684-04",
                    te_product("L000684-04"),
                ),
            ],
            "internal_notes": {
                "maintainer": "Current TE ProSig SKU; legacy Laird-style alias PSQ24716-75RSMM."
            },
        }
    )

    # --- ProSig L000962 (higher gain family) ---
    common_962 = dict(
        vendor=VENDOR,
        form="Patch",
        indoor_outdoor="Indoor/Outdoor",
        bands=["2.4", "5", "6"],
        frequency_range="2.4-2.5/4.9-5.9/6.0-7.125 GHz",
        gain_dbi={"2.4": 8, "5": 9.6, "6": 8},
        beamwidth={
            "horizontal": {"2.4": None, "5": None, "6": None},
            "vertical": {"2.4": None, "5": None, "6": None},
        },
        connector="RPSMA",
        polarization="Dual Slant ±45°",
        cable_length="75 cm (29.5 in)",
        cable_type="RG 58",
        dimensions="200 × 200 × 46.5 mm (7.87 × 7.87 × 1.83 in)",
        ip_rating="IP67",
        mount_type="Pole/mast or wall bracket",
        vswr="<2.0:1",
        operating_temp=None,
        datasheet_urls=[
            {
                "label": "TE ANT-DS-ProSig-L000962",
                "url": te_ds("ENG_DS_ANT-DS-L000962_A1"),
            }
        ],
        field_notes={
            "gain_dbi": "te.com lists Gain (Max) 9.6 dB and drawing title 8 dBi; per-band table not captured from PLP. Used 8/9.6/8 as working values pending full PDF table QC.",
            "beamwidth": "Not published on te.com PLP summary; left null pending datasheet table.",
        },
    )
    # Clean nulls from beamwidth for schema friendliness — use empty maps? Fortinet requires beamwidth. Use "—" or omit keys.
    common_962["beamwidth"] = {"horizontal": {}, "vertical": {}}

    add(
        {
            **common_962,
            "sku": "L000962-01",
            "legacy_sku": "PSD24718-75RSMM",
            "name": "ProSig Wi-Fi 6E/7 Tri-Band 2x2 MIMO Directional Panel (8 dBi class)",
            "lead_count": 2,
            "weight": "0.493 kg (1.09 lb)",
            "sources": [
                source(
                    "TE ANT-DS-ProSig-L000962",
                    "ENG_DS_ANT-DS-L000962_A1",
                    te_ds("ENG_DS_ANT-DS-L000962_A1"),
                ),
                source(
                    "TE product L000962-01",
                    "L000962-01",
                    te_product("L000962-01"),
                ),
            ],
            "internal_notes": {
                "maintainer": "ProSig higher-gain sibling of L000684; alias PSD24718-75RSMM."
            },
        }
    )
    add(
        {
            **common_962,
            "sku": "L000962-02",
            "legacy_sku": "PSQ24718-75RSMM",
            "name": "ProSig Wi-Fi 6E/7 Tri-Band 4x4 MIMO Directional Panel (8 dBi class)",
            "lead_count": 4,
            "weight": "0.60 kg (1.32 lb)",
            "sources": [
                source(
                    "TE ANT-DS-ProSig-L000962",
                    "ENG_DS_ANT-DS-L000962_A1",
                    te_ds("ENG_DS_ANT-DS-L000962_A1"),
                ),
                source(
                    "TE product L000962-02",
                    "L000962-02",
                    te_product("L000962-02"),
                ),
            ],
            "internal_notes": {
                "maintainer": "ProSig higher-gain sibling of L000684; alias PSQ24718-75RSMM."
            },
        }
    )

    # Helper for MIMO panels from datasheets + catalog
    def panel(
        sku,
        name,
        leads,
        connector,
        bands,
        freq,
        gain,
        beam_h,
        beam_v,
        dims,
        cable,
        weight,
        pol,
        iso,
        vswr,
        ip,
        temp,
        mount,
        form="Patch",
        indoor="Indoor/Outdoor",
        radome=None,
        wind=None,
        ds_label=None,
        ds_url=None,
        ds_id=None,
        legacy=None,
        notes=None,
        field=None,
    ):
        e = {
            "vendor": VENDOR,
            "sku": sku,
            "name": name,
            "form": form,
            "indoor_outdoor": indoor,
            "bands": bands,
            "frequency_range": freq,
            "gain_dbi": gain,
            "beamwidth": {"horizontal": beam_h, "vertical": beam_v},
            "connector": connector,
            "lead_count": leads,
            "polarization": pol,
            "dimensions": dims,
            "mount_type": mount,
            "vswr": vswr,
            "sources": [catalog_source()],
            "datasheet_urls": [
                {"label": "TE Antenna Catalog", "url": CATALOG_PDF_URL}
            ],
        }
        if legacy:
            e["legacy_sku"] = legacy
        if cable:
            e["cable_length"] = cable
        if weight:
            e["weight"] = weight
        if iso:
            e["isolation"] = iso
        if ip:
            e["ip_rating"] = ip
        if temp:
            e["operating_temp"] = temp
        if radome:
            e["radome"] = radome
        if wind:
            e["wind_rating"] = wind
        if ds_url:
            e["datasheet_urls"] = [{"label": ds_label or "TE/Laird datasheet", "url": ds_url}]
            e["sources"] = [
                source(ds_label or "TE/Laird datasheet", ds_id or sku, ds_url),
                catalog_source(),
            ]
        if notes:
            e["internal_notes"] = {"maintainer": notes}
        if field:
            e["field_notes"] = field
        add(e)

    # PSQ24495 variants
    for sku, conn, note in [
        ("PSQ24495-91RSM", "RPSMA", "RP-SMA male leads"),
        ("PSQ24495-91NF", "N Female", "N-Female leads"),
        ("PSQ24495-91NM", "N Male", "N-Male leads"),
    ]:
        panel(
            sku=sku,
            name="2.4/5 GHz 4-Port Slant ±45° MIMO Directional Panel",
            leads=4,
            connector=conn,
            bands=["2.4", "5"],
            freq="2.4-2.49/4.9-6.0 GHz",
            gain={"2.4": 6.6, "5": 7.7},
            beam_h={"2.4": "110°", "5": "85°"},
            beam_v={"2.4": "85°", "5": "90°"},
            dims="202 × 200 × 40 mm (7.96 × 7.87 × 1.6 in)",
            cable="91 cm (3.0 ft)",
            weight="0.698 kg (1.54 lb) without mount",
            pol="Slant ±45°",
            iso=">15/>20 dB typ max (2.4/5)",
            vswr="<2.0:1 max",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Articulating mast/wall mount",
            radome="ASA Luran S778T",
            wind="125 mph (200 km/h) survival",
            ds_label="TE/Laird ANT-DS-PSQ24495",
            ds_url=te_ds("ANT-DS-PSQ24495_1119"),
            ds_id="ANT-DS-PSQ24495_1119",
            notes=f"PSQ24495 family; {note}. Peak gain max from datasheet.",
            field={
                "gain_dbi": "Peak Gain – Max from datasheet (avg 5.5/6.0).",
                "beamwidth": "Azimuth→horizontal, Vertical plane→vertical.",
            },
        )

    # PDQ24496
    for sku, conn, cable in [
        ("PDQ24496-FNF", "N Female", None),
        ("PDQ24496-91NF", "N Female", "91 cm (3.0 ft)"),
        ("PDQ24496-91NM", "N Male", "91 cm (3.0 ft)"),
    ]:
        panel(
            sku=sku,
            name="2.4/5 GHz 4-Port H/V MIMO Directional Panel",
            leads=4,
            connector=conn,
            bands=["2.4", "5"],
            freq="2.4-2.5/4.9-5.95 GHz",
            gain={"2.4": 6.8, "5": 6.5},
            beam_h={"2.4": "68°", "5": "58°"},
            beam_v={"2.4": "62°", "5": "58°"},
            dims="254 × 254 × 41 mm (10 × 10 × 1.6 in)",
            cable=cable if cable else "Fixed connectors (no pigtail)",
            weight="1.14 kg (2.50 lb) without mount",
            pol="2 Vertical, 2 Horizontal",
            iso=">30 dB",
            vswr="<2.0:1 max",
            ip="IP67",
            temp="-40 to +70 °C",
            mount="Articulating mast or flush",
            radome="Polycarbonate UL94-V0 UV white",
            wind="125 mph (200 km/h) survival",
            ds_label="TE/Laird ANT-DS-PDQ24496",
            ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/pdq24496-91nf.pdf",
            ds_id="ANT-DS-PDQ24496",
            notes="Primary electricals from TE-branded datasheet mirror; catalog confirms family.",
            field={
                "beamwidth": "V-pol horizontal/vertical plane values used; H-pol similar (63°/71° @2.4).",
                "datasheet_urls": "Ampheo hosts TE-branded PDF while te.com DocumentDelivery is bot-blocked from this environment; first-party DocNm ANT-DS-PDQ24496 also cited via catalog.",
            },
        )

    # PDQ24499
    for sku, conn, cable in [
        ("PDQ24499-91NM", "N Male", "91 cm (3.0 ft)"),
        ("PDQ24499-91NF", "N Female", "91 cm / 860 mm class pigtails"),
    ]:
        panel(
            sku=sku,
            name="2.4/5 GHz 4-Port H/V MIMO Directional Panel",
            leads=4,
            connector=conn,
            bands=["2.4", "5"],
            freq="2.4-2.5/4.95-5.95 GHz",
            gain={"2.4": 8.6, "5": 9.4},
            beam_h={"2.4": "75°", "5": "62°"},
            beam_v={"2.4": "62°", "5": "50°"},
            dims="254 × 254 × 41 mm",
            cable=cable,
            weight="1.14 kg (2.50 lb) without mount",
            pol="2 Vertical, 2 Horizontal",
            iso=">30 dB",
            vswr="<2.0:1",
            ip="IP67",
            temp="-40 to +70 °C",
            mount="Articulating mast or flush",
            wind="137 mph (220 km/h) survival",
            ds_label="TE/Laird PDQ24499 drawing/datasheet",
            ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/pdq24499-91nf.pdf",
            ds_id="PDQ24499-91NF",
            notes="Catalog peak 8.6/9.4; drawing lists 7.8/9.4 — primary uses catalog max for 2.4 and drawing for 5 where aligned.",
            field={
                "gain_dbi": "Catalog lists 8.6/9.4; customer drawing peak 7.8/9.4. Primary 8.6/9.4 from catalog card.",
                "beamwidth": "V-pol azimuth/elevation from drawing.",
            },
        )

    # PDQ244915
    for sku, conn, cable in [
        ("PDQ244915-91NF", "N Female", "91 cm (3.0 ft)"),
        ("PDQ244915-91NM", "N Male", "91 cm (3.0 ft)"),
        ("PDQ244915-FNF", "N Female", "Fixed (no pigtail)"),
    ]:
        panel(
            sku=sku,
            name="2.4/5 GHz 4-Port H/V High-Gain MIMO Directional Panel",
            leads=4,
            connector=conn,
            bands=["2.4", "5"],
            freq="2.4-2.5/4.9-5.95 GHz",
            gain={"2.4": 11.1, "5": 15.0},
            beam_h={"2.4": "48°", "5": "21°"},
            beam_v={"2.4": "48°", "5": "18°"},
            dims="373.3 × 411.4 × 35.8 mm (14.7 × 16.2 × 1.41 in)",
            cable=cable,
            weight="1.58 kg (3.48 lb); 2.28 kg (5.03 lb) with mount",
            pol="2 Vertical, 2 Horizontal",
            iso=">30 dB",
            vswr="<2.0:1 max",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Mast 44–57 mm or concrete wall (HDMNT)",
            radome="ASA white UV stable",
            form="High-density patch",
            ds_label="TE/Laird ANT-DS-PDQ244915",
            ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/pdq244915-91nf.pdf",
            ds_id="ANT-DS-PDQ244915",
            notes="High-gain venue panel; form High-density patch due to ~20° 5 GHz beams.",
            field={"beamwidth": "V-pol plane values from datasheet."},
        )

    # PDM24519
    panel(
        sku="PDM24519-FNF",
        name="2.4/5 GHz 3-Port H/V MIMO Directional Panel",
        leads=3,
        connector="N Female",
        bands=["2.4", "5"],
        freq="2.4-2.5/5.15-5.9 GHz",
        gain={"2.4": 8.0, "5": 9.0},
        beam_h={"2.4": "90°", "5": "120°"},
        beam_v={"2.4": "45°", "5": "30°"},
        dims="178 × 305 × 25 mm (7 × 12 × 1.0 in)",
        cable="Fixed N-Female",
        weight="0.69 kg",
        pol="1 Horizontal, 2 Vertical",
        iso="17–40 dB class (port pair dependent)",
        vswr="2:1 max",
        ip="IP67",
        temp="-30 to +70 °C",
        mount="Articulating wall mount",
        radome="Polycarbonate EXL9330 white",
        ds_label="Laird ANT-DS-PDM24519",
        ds_url="https://www.ariat-tech.com/datasheet/84/PDM24519-FNF.pdf",
        ds_id="ANT-DS-PDM24519",
        notes="3-port MIMO panel; fixed N-Female.",
        field={"beamwidth": "Datasheet azimuth/elevation typical."},
    )

    # PDM24499
    panel(
        sku="PDM24499-FNF",
        name="2.4/5 GHz 4-Port MIMO Directional Panel",
        leads=4,
        connector="N Female",
        bands=["2.4", "5"],
        freq="2.4-2.5/4.9-5.95 GHz",
        gain={"2.4": 8.6, "5": 9.6},
        beam_h={"2.4": None, "5": None},
        beam_v={"2.4": None, "5": None},
        dims="305 × 178 × 26 mm",
        cable="Fixed N-Female",
        weight=None,
        pol="Linear",
        iso=None,
        vswr="2.0:1 max",
        ip="IP67",
        temp="-30 to +70 °C",
        mount="Wall/ceiling",
        notes="Catalog card only for beamwidth — left empty maps.",
        field={"beamwidth": "Not on catalog card; empty pending datasheet."},
    )
    # fix empty beamwidth
    for r in recs:
        if r["sku"] == "PDM24499-FNF":
            r["beamwidth"] = {"horizontal": {}, "vertical": {}}

    # PDM245115H
    panel(
        sku="PDM245115H-FNF",
        name="2.4/5 GHz 4-Port H/V High-Gain MIMO Directional Panel",
        leads=4,
        connector="N Female",
        bands=["2.4", "5"],
        freq="2.4-2.5/5.15-5.9 GHz",
        gain={"2.4": 14.0, "5": 14.5},
        beam_h={"2.4": "31°", "5": "31°"},
        beam_v={"2.4": "33°", "5": "27°"},
        dims="507 × 368 × 21.1 mm (20.0 × 14.5 × 0.8 in)",
        cable="Fixed N-Female ×4",
        weight="2.3 kg (5.1 lb) without brackets",
        pol="2 Vertical, 2 Horizontal",
        iso=None,
        vswr="<1.6:1 / <2.0:1 / <1.5:1 by sub-band",
        ip="IP67",
        temp="-40 to +70 °C",
        mount="Articulating mast/wall",
        radome="Polycarbonate white",
        form="High-density patch",
        ds_label="TE/Laird ANT-DS-PDM245115H",
        ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/pdm245115h-fnf.pdf",
        ds_id="ANT-DS-PDM245115H",
        notes="High-gain H/V panel; UL 2043 noted on datasheet.",
    )

    # S24517PT
    panel(
        sku="S24517PT36RSM",
        name="2.4/5 GHz 3-Port MIMO Directional Sector Panel",
        leads=3,
        connector="RPSMA",
        bands=["2.4", "5"],
        freq="2.4-2.5/5.1-5.9 GHz",
        gain={"2.4": 8.0, "5": 10.7},
        beam_h={"2.4": "70°", "5": "60°"},
        beam_v={"2.4": "75°", "5": "55°"},
        dims="259.1 × 259.1 × 33.5 mm (10.2 × 10.2 × 1.3 in)",
        cable="914 mm (36 in)",
        weight="1.8 kg (2.2 lb)",
        pol="2 Vertical, 1 Horizontal",
        iso=None,
        vswr="2.0:1 max",
        ip="IP67",
        temp="-30 to +65 °C",
        mount="Articulating wall/mast",
        radome="Polycarbonate",
        wind="124 mph (200 km/h)",
        ds_label="TE/Laird ANT-DS-S24517PT",
        ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/s24517pt36rsm.pdf",
        ds_id="ANT-DS-S24517PT",
        notes="Catalog lists 4-port in one card title but datasheet/config is 3× RP-SMA — lead_count 3 per datasheet.",
        field={
            "lead_count": "Catalog marketing line said 4-port; datasheet configuration is 3× RP-SMA. Primary uses datasheet (3)."
        },
    )

    # S24493TS ceiling omni
    panel(
        sku="S24493TS36RSM",
        name="2.4/5 GHz 3-Port MIMO Ceiling Omni",
        leads=3,
        connector="RPSMA",
        bands=["2.4", "5"],
        freq="2.4-2.5/4.9-5.9 GHz",
        gain={"2.4": 3.0, "5": 4.0},
        beam_h={"2.4": "360°", "5": "360°"},
        beam_v={"2.4": None, "5": None},
        dims="308 × 22 × 92 mm",
        cable="36 in class (per SKU)",
        weight=None,
        pol="Linear",
        iso=None,
        vswr="2.0:1 max",
        ip=None,
        temp="-30 to +70 °C",
        mount="Wall/ceiling",
        form="Omni",
        indoor="Indoor",
        notes="Ceiling omni from catalog card.",
    )
    for r in recs:
        if r["sku"] == "S24493TS36RSM":
            r["beamwidth"]["vertical"] = {}

    # CMM24513S4
    panel(
        sku="CMM24513S4-91RSM",
        name="2.4/5 GHz 4-Port MIMO Ceiling Omni Dome",
        leads=4,
        connector="RPSMA Male",
        bands=["2.4", "5"],
        freq="2.4-2.5/5.15-5.875 GHz",
        gain={"2.4": 2.9, "5": 3.3},
        beam_h={"2.4": "360°", "5": "360°"},
        beam_v={"2.4": None, "5": None},
        dims="43.5 × ⌀219 mm",
        cable="910 mm",
        weight="~0.47 kg",
        pol="Linear",
        iso=None,
        vswr="2.0:1 max",
        ip=None,
        temp="-30 to +70 °C",
        mount="Ceiling",
        form="Omni",
        indoor="Indoor",
        ds_label="TE/Laird CMM24513S4 drawing",
        ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/cmm24513s4-91rsm.pdf",
        ds_id="CMM24513S4-91RSM",
        notes="Catalog peak 2.9/3.3; older drawing cites 3.5/6.0 at tilted angles — primary uses catalog.",
        field={
            "gain_dbi": "Catalog electrical card 2.9/3.3 dBi; drawing lists 3.5/6.0 at elevated angles. Primary catalog."
        },
    )
    for r in recs:
        if r["sku"] == "CMM24513S4-91RSM":
            r["beamwidth"]["vertical"] = {}
            r["cable_type"] = "RG-58 plenum"

    # OP24516DS
    for sku, conn in [
        ("OP24516DS-91RSMM", "RPSMA Male"),
        ("OP24516DS-91NM", "N Male"),
    ]:
        panel(
            sku=sku,
            name="2.4/5 GHz 6-Port MIMO Outdoor Omni Canister",
            leads=6,
            connector=conn,
            bands=["2.4", "5"],
            freq="2.4-2.5/5.15-5.875 GHz",
            gain={"2.4": 2.8, "5": 6.5},
            beam_h={"2.4": "360°", "5": "360°"},
            beam_v={"2.4": "66°", "5": "30°"},
            dims="⌀209.6 × 116.5 mm (8.25 × 4.59 in)",
            cable="910 mm ±18 mm (36 in)",
            weight="1.6 kg (3.53 lb)",
            pol="Linear Vertical",
            iso="20/25 dB",
            vswr="2.0:1 max",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
            form="Omni",
            radome="Polycarbonate white",
            wind="125 mph (200 km/h)",
            ds_label="TE/Laird ANT-DS-OP24516DS",
            ds_url="https://resources.ampheo.com/static/datasheets/te-connectivity/op24516ds-91nm.pdf",
            ds_id="ANT-DS-OP24516DS",
            notes="Gain uses datasheet max (2.8/6.5); typical 2.0/4.8.",
            field={"gain_dbi": "Peak/max from datasheet; typical 2.0/4.8 dBi."},
        )

    # OP24516SX from customer drawing (WebSearch)
    panel(
        sku="OP24516SX-91RSMM",
        name="2.4/5 GHz 6-Port Split-Band MIMO Outdoor Omni (3×2.4 + 3×5)",
        leads=6,
        connector="RPSMA Male",
        bands=["2.4", "5"],
        freq="2.4-2.5/5.15-5.875 GHz",
        gain={"2.4": 4.0, "5": 6.0},
        beam_h={"2.4": "360°", "5": "360°"},
        beam_v={"2.4": "45°", "5": "32°"},
        dims="⌀116.5 class canister (see drawing)",
        cable="910 mm ±18 mm ×6",
        weight="1.7 kg (3.7 lb)",
        pol="Linear Vertical",
        iso="20/30 dB",
        vswr="2.0:1 max",
        ip="IP67",
        temp="-30 to +70 °C",
        mount="Mast 31.8–57.2 mm",
        form="Omni",
        radome="Polycarbonate white",
        wind="125 mph (200 km/h)",
        ds_label="TE OP24516SX customer drawing",
        ds_url=(
            "https://www.te.com/commerce/DocumentDelivery/DDEController?"
            "Action=srchrtrv&DocFormat=pdf&DocLang=English&DocNm=OP24516SX-91RSMMMO"
            "&DocType=Customer+Drawing&PartCntxt=OP24516SX-91RSMM"
        ),
        ds_id="OP24516SX-91RSMMMO",
        notes="Split-band 3+3 ports; gain max 4/6 dBi from drawing.",
        field={"dimensions": "Drawing lists height stack 116.5 mm class; diameter via mast clamp geometry."},
    )

    # Dual/tri-band outdoor batons & sticks (catalog)
    batons = [
        dict(
            sku="OC24519-FNM",
            name="2.4/5 GHz Dual-Band Outdoor Omni Baton",
            leads=1,
            connector="N Male",
            bands=["2.4", "5"],
            freq="2.4-2.5/5.25-5.925 GHz",
            gain={"2.4": 7.5, "5": 9.0},
            dims="376.8 × ⌀32 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
        ),
        dict(
            sku="OC24527-FNF",
            name="2.4/5 GHz Dual-Band Outdoor Omni Baton",
            leads=1,
            connector="N Female",
            bands=["2.4", "5"],
            freq="2.4-2.5/5.15-5.875 GHz",
            gain={"2.4": 4.5, "5": 7.5},
            dims="280 × ⌀25.4 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
        ),
        dict(
            sku="ANT-W63-IPW1-NP",
            name="2.4/5/6 GHz Tri-Band Outdoor Omni Whip",
            leads=1,
            connector="N Plug",
            bands=["2.4", "5", "6"],
            freq="2.4-2.485/5.15-5.85/5.925-7.125 GHz",
            gain={"2.4": 3.2, "5": 8.7, "6": 5.5},
            dims="178 × ⌀25 mm",
            ip="IP67",
            temp="-40 to +70 °C",
            mount="Connector mount",
        ),
        dict(
            sku="ANT-5GW-IPW2-NP",
            name="2.4/5/6 GHz Tri-Band Outdoor Omni Whip",
            leads=1,
            connector="N Plug",
            bands=["2.4", "5", "6"],
            freq="2.4-2.485/5.15-5.85/5.925-7.125 GHz",
            gain={"2.4": 1.6, "5": 5.0, "6": 5.6},
            dims="132 × ⌀24 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Connector mount",
        ),
        dict(
            sku="ANT-5GW-IPW3-NP",
            name="2.4/5/6 GHz Tri-Band Outdoor Omni Whip",
            leads=1,
            connector="N Plug",
            bands=["2.4", "5", "6"],
            freq="2.4-2.485/5.15-5.85/5.925-7.125 GHz",
            gain={"2.4": 4.4, "5": 7.2, "6": 4.1},
            dims="176.4 × ⌀21 mm",
            ip="IP67",
            temp="-40 to +85 °C",
            mount="Connector mount",
        ),
        dict(
            sku="OC24005-FNF",
            name="2.4 GHz Outdoor Omni Baton",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.5 GHz",
            gain={"2.4": 5.0},
            dims="297 × ⌀32 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
        ),
        dict(
            sku="FG24008",
            name="2.4 GHz Outdoor Fiberglass Omni Baton",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.5 GHz",
            gain={"2.4": 8.0},
            dims="624 × ⌀33 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
        ),
        dict(
            sku="S5156WBSFNM",
            name="5 GHz Outdoor Omni Baton",
            leads=1,
            connector="N Female",
            bands=["5"],
            freq="4.9-5.85 GHz",
            gain={"5": 8.0},
            dims="292 × ⌀25.4 mm",
            ip="IP54",
            temp="-30 to +65 °C",
            mount="Pole/mast",
        ),
        dict(
            sku="OC515010H-FNM",
            name="5 GHz Outdoor Omni Baton",
            leads=1,
            connector="N Male",
            bands=["5"],
            freq="5.15-5.875 GHz",
            gain={"5": 10.0},
            dims="451 × ⌀25.4 mm",
            ip="IP67",
            temp="-30 to +70 °C",
            mount="Pole/mast",
        ),
    ]
    for b in batons:
        bh = {band: "360°" for band in b["bands"]}
        panel(
            sku=b["sku"],
            name=b["name"],
            leads=b["leads"],
            connector=b["connector"],
            bands=b["bands"],
            freq=b["freq"],
            gain=b["gain"],
            beam_h=bh,
            beam_v={},
            dims=b["dims"],
            cable=None,
            weight=None,
            pol="Linear",
            iso=None,
            vswr=None,
            ip=b.get("ip"),
            temp=b.get("temp"),
            mount=b["mount"],
            form="Omni",
            notes="Electricals from TE Antenna Catalog Wi-Fi infrastructure cards.",
        )

    # Single-band directional panels / yagi
    dirs = [
        dict(
            sku="S2401240P12NF",
            name="2.4 GHz 12 dBi Outdoor Flat Panel",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.5 GHz",
            gain={"2.4": 12.0},
            dims="153 × 153 × 32 mm",
            cable="300 mm",
            form="Patch",
            mount="Wall/ceiling",
        ),
        dict(
            sku="MD24-12",
            name="2.4 GHz 12 dBi Mini Flat Panel",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.483 GHz",
            gain={"2.4": 11.0},
            dims="102 × 102 × 102 mm",
            cable=None,
            form="Patch",
            mount="Mast/bracket",
        ),
        dict(
            sku="PA24-19",
            name="2.4 GHz 19 dBi Outdoor Flat Panel",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.483 GHz",
            gain={"2.4": 19.0},
            dims="389 × 368 × 20 mm",
            cable=None,
            form="High-density patch",
            mount="Mast/bracket",
        ),
        dict(
            sku="PA58-24",
            name="5 GHz 24 dBi Outdoor Flat Panel",
            leads=1,
            connector="N Female",
            bands=["5"],
            freq="5.15-5.825 GHz",
            gain={"5": 24.0},
            dims="390 × 371 × 21 mm",
            cable=None,
            form="High-density patch",
            mount="Mast/bracket",
        ),
        dict(
            sku="YE240015",
            name="2.4 GHz 14.5 dBi Outdoor Yagi",
            leads=1,
            connector="N Female",
            bands=["2.4"],
            freq="2.4-2.485 GHz",
            gain={"2.4": 14.5},
            dims="447 mm long",
            cable=None,
            form="Patch",
            mount="Mast/bracket",
            wind="150 mph",
            notes="Schema has no Yagi form; stored as Patch per template guide (sector/yagi → Patch).",
        ),
    ]
    for d in dirs:
        panel(
            sku=d["sku"],
            name=d["name"],
            leads=d["leads"],
            connector=d["connector"],
            bands=d["bands"],
            freq=d["freq"],
            gain=d["gain"],
            beam_h={},
            beam_v={},
            dims=d["dims"],
            cable=d.get("cable"),
            weight=None,
            pol="Linear",
            iso=None,
            vswr=None,
            ip=None,
            temp="-30 to +70 °C" if d["sku"] != "MD24-12" else "-40 to +70 °C",
            mount=d["mount"],
            form=d["form"],
            wind=d.get("wind"),
            notes=d.get("notes")
            or "Directional infrastructure antenna from TE Antenna Catalog.",
            field={"beamwidth": "Not listed on catalog card."},
        )

    # Ensure image urls for all that have files
    for r in recs:
        sk = slug(r["sku"])
        path = IMG / f"{sk}.jpg"
        if path.exists():
            r["image_url"] = f"images/te-connectivity/{sk}.jpg"
        # Drop None values that may have slipped in
        for k in list(r.keys()):
            if r[k] is None:
                del r[k]
        if "beamwidth" in r:
            for plane in ("horizontal", "vertical"):
                if plane in r["beamwidth"]:
                    r["beamwidth"][plane] = {
                        k: v for k, v in r["beamwidth"][plane].items() if v is not None
                    }

    return recs


def main():
    prep_images()
    new = build_records()
    # Ensure every record with image_url has file
    missing = []
    for r in new:
        for key in ("image_url", "dimension_image_url"):
            rel = r.get(key)
            if rel and not (ROOT / rel).exists():
                missing.append((r["sku"], key, rel))
        for arr_key in ("images", "pattern_images"):
            for img in r.get(arr_key) or []:
                if img.get("url") and not (ROOT / img["url"]).exists():
                    missing.append((r["sku"], arr_key, img["url"]))
    if missing:
        print("MISSING IMAGES:")
        for m in missing:
            print(" ", m)
        # Drop image_url if missing rather than fail — OP24516 etc.
        for r in new:
            if r.get("image_url") and not (ROOT / r["image_url"]).exists():
                print("dropping image_url for", r["sku"])
                del r["image_url"]

    data = json.loads(DATA.read_text())
    data = [e for e in data if e.get("vendor") != VENDOR]
    data.extend(new)
    DATA.write_text(json.dumps(data, indent=2) + "\n")
    print(f"Wrote {len(new)} TE Connectivity entries; catalog now {len(data)}")


if __name__ == "__main__":
    main()
