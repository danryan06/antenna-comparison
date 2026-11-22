# Security Policy

## Supported versions

Security fixes are applied to the default branch (`main`), which is what GitHub Pages deploys.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports (XSS, data exposure, injection, credential leaks, or similar).

Email **Dan Ryan** via the contact address on [his GitHub profile](https://github.com/danryan06), and include:

- A short description of the issue and impact
- Steps to reproduce (or a proof-of-concept URL/payload)
- Affected page or script paths when known
- Whether the report involves the public Pages catalog (`antenna_catalog.json`) or the authoring file (`antenna_data.json`)

You should receive an acknowledgment within **7 days**. We aim to assess and ship a fix, or explain the disposition, within **30 days** for confirmed issues in the live site.

## Public vs maintainer data

- The site loads **`antenna_catalog.json`**, an allowlisted public artifact. Maintainer-only keys such as `field_notes` and `internal_notes` must not appear there.
- The authoring file **`antenna_data.json`** may contain maintainer notes. The repository is public, so treat authoring notes as visible to anyone who clones or fetches that file; do not store secrets, credentials, or private personal data in the catalog.

## Scope notes

- This project is a static GitHub Pages site (HTML/CSS/JS + JSON). There is no application backend or user accounts.
- Vendor product images and radiation plots remain vendor property; report suspected rights issues through the same contact path.
