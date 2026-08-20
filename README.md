# Yorktown Heights Engine Co. No. 1 — 911 Address Sign Ordering Portal

A free, standardized online ordering portal for residents to request professional 911 address signs. Residents submit orders through the portal; the department tracks each order in a private Google Sheet, places individual vendor orders with trafficsign.com, and volunteers install the signs at no charge.

## How It Works

The portal is a **static HTML/CSS/JavaScript site deployed to GitHub Pages** that collects resident orders and submits them via **Google Apps Script** to a **private Google Sheet**. The system requires zero hosting cost: GitHub Pages is free, Google Apps Script is free within quota limits (approx. 50 orders/day), and the Sheet is part of the department's existing Google Workspace. When a resident submits an order, the department receives an email notification and the order appears in the Sheet as "New" status. A volunteer then confirms the exact total (including vendor shipping), places an individual order with trafficsign.com using the dept's account, and logs the order details back into the Sheet for tracking through installation and payment.

## Driveway-Length Tier System

The sign color depends on the driveway length from the road:

| Driveway Length | Sign Color | Blue relay markers |
|---|---|---|
| Under 150 feet | **Green** | Not offered |
| 150 feet – 1,000 feet | **Yellow** | Not offered — the driveway never reaches a 1,000-foot mark |
| Over 1,000 feet | **Red** | **Offered as an optional add-on**, one per 1,000 feet ("1000", "2000", …) |
| Not sure | **Set after the department measures** | Discussed after measuring, if it turns out to be over 1,000 feet |

Residents who don't know their driveway length can pick **"Not sure — we'll measure it"**. The order goes through normally (every colour costs the same, so the total is still exact) and the sign colour is filled in by the crew. Such rows land in the Sheet with `Tier Color = unsure`, the department email says the driveway needs measuring, and the Vendor Order Helper refuses to produce an order recipe until a real colour is set.

**Blue relay markers are an optional purchase, not automatic.** They exist for relay pumping: one engine can't push water the length of a long driveway, so crews stage a second engine partway in, and the markers show arriving crews where. Only red-tier orders see the offer, the checkbox starts unchecked, and the count and price are derived from the driveway length the resident entered.

**Shared driveways** (multiple house numbers on one driveway) include an additional **green arrow sign** with the house number and arrow direction. The department sets the arrow direction before ordering — it is printed at the factory, not aimed on site.

### Vendor products (trafficsign.com)

| Item | Product | Spec |
|---|---|---|
| Address sign, green or red | 49961 vertical (6×18) / 49965 horizontal (18×6) | "with Border – Numbers Only", 4″ characters, Diamond Grade, .063″, double-sided, **No Holes** (bracket mount), no anti-graffiti film |
| Address sign, **yellow** | 8349 vertical / 8348 horizontal | The bordered family has **no yellow**, so tier-2 signs come from the non-border products. Same size, material, and price — they simply have no border. |
| Blue relay marker | 49961 in blue | Same spec as the address sign; characters are the distance ("1000", "2000", …) |
| Arrow sign | 49977 | "with Border – Numbers and Arrow", 18×6, green, **single-sided**, Diamond Grade, No Holes |
| Mounting bracket | Wing Bracket Y3518 | 2⅛×4¼″ flag-style; one per sign |
| Post (only when requested) | 8′ U-channel, 1.12 lbs/ft, green enamel | Only added when the resident selects "I need a post" |

Vertical signs fit **4 characters** at 4″; horizontal fits 8. The portal warns residents with 5-digit numbers to choose horizontal.

## Design

The portal deliberately mirrors the look of [yorktownfire.org](https://yorktownfire.org) — navy/gold/red palette, Montserrat for UI, a serif italic tagline — so residents arriving from the department's own site recognize it as belonging to the department, not a third-party form. The department's real banner, patch, and divider images live in `assets/`, with re-fetch URLs and provenance documented in `assets/README.md`.

## Ownership & Access

| Component | Owned By | Access |
|---|---|---|
| This repository (`index.html`, `app.js`, `styles.css`, docs) | Yorktown Heights Engine Co. No. 1 (via Alex's GitHub account initially) | Public (deployment URL shared with residents) |
| Google Sheet (`Orders`, `Quarantine`, reference tabs) | YHEC1 Google Workspace account (dept email) | Private; department volunteers only |
| Google Apps Script (backend validation, email, Sheet append) | YHEC1 Google Workspace account; container-bound to Sheet | Private; deployed to `/exec` endpoint |

To move the repository to a department GitHub account, GitHub can redirect the Pages URL so residents' bookmarks continue to work.

## Documentation

- **[docs/CONTRACT.md](docs/CONTRACT.md)** — Binding interface specification (DOM IDs, payment math, validation rules, server contract, Sheet schema). **Read this first if you're modifying the portal.**
- **[docs/SETUP.md](docs/SETUP.md)** — One-time volunteer setup (~30–45 min): Google Workspace copy of the template Sheet, Apps Script deployment, config URL paste. Includes screenshots of the "unverified app" flow.
- **[docs/RUNBOOK.md](docs/RUNBOOK.md)** — Day-to-day operations: how to advance an order's Status, placing a single vendor order from a Sheet row, confirming exact totals with the resident, updating prices.
- **[docs/SHEET.md](docs/SHEET.md)** — Schema and formulas: detailed column descriptions, Vendor Order Helper FILTER view, Quarantine tab use, reference data.
- **[docs/TESTING.md](docs/TESTING.md)** — Test matrices: UI testing with `?mock=1`, backend curl commands, post-deploy acceptance checklist.

## Pricing

**Infrastructure cost: $0.** GitHub Pages and Google Apps Script are free within normal load. Hosting is GitHub Pages with relative asset paths.

**Resident cost: pass-through vendor pricing.** Every line item (main sign, bracket, markers, post, arrow) is priced at the trafficsign.com rate, and the resident covers everything the vendor charges — including shipping. The department places the order and fronts the cost, then collects from the resident in **cash or check at installation**. Nothing is ever paid online through this site, and the portal never asks for card or bank details.

**Price table.** Current prices (verified on trafficsign.com, 2026-08-19): sign `$34.91`, mounting bracket `$8.24` (Wing Bracket Y3518), post `$37.80` (8′ green U-channel, 1.12 lbs/ft), blue relay marker `$34.91`, arrow sign `$29.98`. Shipping is quoted at checkout and confirmed with the resident before the order is placed. The price table exists in two places — **both marked "EDIT HERE"**:
- `js/config.js` (what residents see)
- `apps-script/Code.gs` under `CONFIG` (server truth)

Keep them in sync. Orders are **always placed individually** (no bulk orders).

**Voluntary donation.** Residents may add a $0, $10, $25, $50, or custom donation to support the department. Cash or check is collected at installation; nothing is charged online for donations.

**Installation is free.** Volunteers from YHEC1 install all signs at no charge.

---

For questions about this repo or the deployment process, see [docs/RUNBOOK.md](docs/RUNBOOK.md).
