# Workflow

- **All changes go through GitHub PRs.** Never commit or push directly to `main`. Branch from `main`, commit, `gh pr create`, and hand Alex the PR link.
- Repo: `Vergo402/YHFD-911-Address-Signs` (origin). `gh` is authenticated as Vergo402.
- Known conflict: `docs/SETUP.md` (Step 6, Option 2, item 7) tells a volunteer to commit directly to `main`. That predates the PR rule. Do not follow that step when editing; the PR rule wins.

# Project

- Yorktown Heights Engine Co. No. 1 (YHEC1) free ordering portal for 911 address signs. Static site on GitHub Pages plus a Google Apps Script backend (`apps-script/Code.gs`).
- Binding spec: `docs/CONTRACT.md`. Read it first before changing any file. It also holds the Orders sheet schema (section 9, A to AF, 32 columns). Setup, runbook, and sheet docs are in `docs/`.
- Binding visual target: `docs/mockup-v4.html`, plus two deltas: the real department banner (`assets/dept-banner.jpg`), and the UI face Libre Franklin.

# Sign rules (department SOP)

- Tier colour by driveway length: green under 150 ft; yellow 150 to 1,000 ft; red over 1,000 ft. Verified: `index.html` tier labels and `docs/CONTRACT.md` section 5.
- Blue relay markers (every 1,000 ft) are an optional opt-in purchase, offered on the red tier only. A yellow-tier driveway never reaches a 1,000 ft mark. Verified: `js/app.js` `computeMarkers`.
- Yellow signs come from the non-border products 8349 / 8348, so their label drops the word "bordered". Verified: `js/app.js` label logic, `docs/CONTRACT.md` sections 3 and 11.
- "Not sure, we'll measure it" (`tier: unsure`) has no colour yet and no marker offer. Price is unchanged.

# Money and ordering rules

- No bulk orders. Every resident order is placed individually at the vendor. Verified: `README.md` pricing section, `docs/CONTRACT.md` section 11.
- Pass-through pricing: every line item (sign, bracket, post, markers, arrow, shipping) is paid by the purchaser at the trafficsign.com rate. Verified: `README.md` "Resident cost".
- Residents pay cash or check at installation only. Nothing is paid online through this site, and the portal never asks for card or bank details.
- Installation is free. The optional donation is $0, $10, $25, $50, or a custom amount, also collected at installation.
- Edit prices in both places, marked "EDIT HERE": `js/config.js` and `apps-script/Code.gs` (`CONFIG`). Keep them in sync.

# Design rules

- Implementation: colour tokens in `css/styles.css`.
- Light theme only. Never propose a dark UI. The navy/gold dark theme (`mockup-v5`) was built and reverted on 2026-08-20 because it was hard to read for this audience. Verified: `docs/CONTRACT.md` line 3, `README.md` line 41.
