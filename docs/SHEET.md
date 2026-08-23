# SHEET.md — Google Sheet Construction Guide

Binding reference: `docs/CONTRACT.md`. This document tells a volunteer (or Alex)
exactly how to build the Google Sheet that `apps-script/Code.gs` reads and
writes. Build it in this order: **Orders → Quarantine → Reference → Vendor
Order Helper**.

Sheet file name suggestion: `YHEC1 911 Sign Orders`. Tab names must be
**exactly** `Orders` and `Quarantine` (Code.gs CONFIG references
`SHEET_ORDERS="Orders"`, `SHEET_QUARANTINE="Quarantine"` — renaming either tab
breaks the script; RUNBOOK.md carries the warning).

---

## 1. Orders tab

### 1.1 Headers (row 1, columns A→AF — 32 columns, exact order, exact text)

`appendRow` in Code.gs writes an array in this order with no header lookup —
the column **position** is the contract. Type each header exactly as shown into row 1 of a tab named `Orders`. Header
text is copied **verbatim** from CONTRACT §9, including the `(dept)`
suffixes it uses on the applicable columns — those parentheticals are literal
header text here, not just a role annotation; the "Script fills? / Dept
fills?" columns below are this doc's own commentary, separate from the
header cell text. Columns AG–AK are tracker columns to the right of the
contract — appendRow never touches them.

| Col | Header (type exactly) | Script fills? | Dept fills? |
|---|---|---|---|
| A | Timestamp | ✅ (script sets on append) | |
| B | Order ID | ✅ | |
| C | Days Waiting | ✅ (per-row formula the script writes after append; counts days since Timestamp, shows `-` once Status is `Cancelled` or Payment Status is Paid/Waived) | (never — formula only) |
| D | Assigned To | ✅ (script round-robins over the Dashboard member list on append) | ✅ (dept can reassign) |
| E | Status | ✅ (script writes `New` on append) | ✅ (dept advances it: New → Contacted → Ordered → Installed, or diverts to On Hold / Cancelled) |
| F | Payment Status | ✅ (script writes `Unpaid` on append) | ✅ (dept advances it: Unpaid → Partial → Paid, or Waived) |
| G | Payment Type | | ✅ **dept-only** — set when payment is actually collected (Cash/Check/Other); blank until then. |
| H | House Number | ✅ | |
| I | Tier Color | ✅ | ✅ (dept overwrites `unsure` with the measured color) |
| J | Orientation | ✅ | |
| K | Driveway Ft | ✅ | |
| L | Marker Texts | ✅ | |
| M | Arrow Sign | ✅ | |
| N | Arrow Direction (dept) | | ✅ **dept-only** — script never writes this. Must be set before the vendor order is placed for any row with an arrow sign. |
| O | Mounting | ✅ | |
| P | Post Included | ✅ | |
| Q | Shared With Numbers | ✅ | |
| R | Full Name | ✅ | |
| S | Property Address | ✅ | |
| T | Phone | ✅ | |
| U | Email | ✅ | |
| V | Preferred Contact | ✅ | |
| W | In-District Attest | ✅ | |
| X | Placement Notes | ✅ (resident's text, verbatim) | |
| Y | Est Signs+Hardware $ | ✅ | |
| Z | Donation Pledged $ | ✅ | |
| AA | Est Total Due $ | ✅ | |
| AB | Actual Vendor Total $ (dept) | | ✅ **dept-only** — what the dept paid the vendor, incl. shipping; filled during **Ordered**. |
| AC | Order Payment Received $ (dept) | | ✅ **dept-only** — what the resident has paid the dept for the order; filled as it's collected (supports partial). |
| AD | Donation Received $ (dept) | | ✅ **dept-only** — donation actually collected; kept separate from the order payment. |
| AE | Email Status | ✅ (script sets `pending` → `sent` / `failed (dept)` / `failed (both)` after the email try/catch block) | |
| AF | Internal Notes | partly ✅ / partly ✅ — script may append automated flags (e.g. the 5-digit-vertical warning also lands here per CONTRACT §3, or dedupe/throttle notes); dept freely adds its own notes in the same cell, on new lines |
| AG | Contacted On | | ✅ dept date-stamp (tracker column, not in appendRow) |
| AH | Ordered On | | ✅ dept date-stamp (tracker column, not in appendRow) |
| AI | Installed On | | ✅ dept date-stamp (tracker column, not in appendRow) |
| AJ | Paid On | | ✅ dept date-stamp (tracker column, not in appendRow) |
| AK | Still Owed $ | ✅ (formula: Vendor Total − Order Payment Received; shows `-` when Cancelled) | (never — formula only) |

So: **script-owned** columns are A–C (C as a formula), D–G (as defaults; D
assignee, E `New`, F `Unpaid`, G blank), H–AA from the submission, AE
`pending`, and AF gets an automated note where applicable. **Dept-owned**
columns are E, F, G, I (overwriting `unsure`), N, AB, AC, AD, AF (own notes),
and the tracker columns AG–AJ. AK is a formula, never hand-edited. Columns
AG–AK sit outside the appendRow contract entirely — they're maintained by
hand or by formula on the tracker side of the sheet.

### 1.2 Freeze row 1

Select row 1 → **View → Freeze → 1 row**.

### 1.3 Status / Payment Status / Payment Type dropdowns (data validation) — columns E, F, G

1. Select `E2:E` (whole column below header — right-click the column E
   letter → select the column, or select `E2:E1000` if you prefer a bound
   range).
2. **Data → Data validation → Add rule.**
3. Criteria: **Dropdown** (or "List of items" on older Sheets UI).
4. Enter exactly: `New, Contacted, Ordered, Installed, On Hold, Cancelled`
5. "Show dropdown chip in cell" — on. "Reject input" — on (keeps the enum
   closed, matching CONTRACT §9's status list).
6. Save.
7. Repeat for `F2:F` (**Payment Status**) with values `Unpaid, Partial, Paid, Waived`.
8. Repeat for `G2:G` (**Payment Type**) with values `Cash, Check, Other`.

### 1.4 Conditional formatting per status — column E

**Format → Conditional formatting**, apply to range `E2:E1000`, add one rule
per status ("Format cells if... Text is exactly..."), custom colors:

| Status | Fill | Text | Rationale |
|---|---|---|---|
| `New` | `#fce8e6` (pink) | `#c5221f` | untouched, needs first look |
| `Contacted` | `#fef7e0` (yellow) | `#b06000` | dept has reached out |
| `Ordered` | `#e8f0fe` (blue) | `#1967d2` | vendor order placed, awaiting delivery/install |
| `Installed` | `#e0f2f1` (teal) | `#00695c` | sign is up |
| `On Hold` / `Cancelled` | (no tint — leave default) | | paused or won't be fulfilled; row doesn't need a status color to stand out |

Payment is no longer part of this column or its color mapping — see §1.3
for the separate **Payment Status** chip column (F), which carries its own
conditional formatting: `Unpaid` grey, `Partial` yellow, `Paid` green,
`Waived` blue.

(Exact hex values are a starting palette, not contractual — the dept can
retint; the mapping status→distinct-color is what matters for at-a-glance
triage.)

---

## 2. Quarantine tab

New tab named `Quarantine`. Row 1 headers, columns A–C only:

`Timestamp | Reason | Raw Payload`

Freeze row 1 (**View → Freeze → 1 row**). No dropdowns/validation needed —
this tab is script-write-only (honeypot hits, outer try/catch crash-capture
of the raw payload). Leave it plain; the dept reviews it occasionally to
confirm nothing legitimate landed here as a false positive.

---

## 3. Reference tab

New tab named `Reference`. Documentation only — the script never reads or
writes this tab; it exists so anyone auditing the Sheet can see the closed
enums without re-reading CONTRACT.md. Put a banner in `A1` merged across a
few columns:

> **DO NOT EDIT — documentation only. This tab is not read by the script.**

Then lay out the enum tables below it, one block per enum, e.g. starting at
row 3:

**Status values** (Orders col E)
```
New
Contacted
Ordered
Installed
On Hold
Cancelled
```
(`Paid` was removed from this list — payment is now tracked separately, in
Payment Status.)

**Payment Status values** (Orders col F)
```
Unpaid   (script default on every new order)
Partial
Paid
Waived
```

**Payment Type values** (Orders col G)
```
Cash
Check
Other
(blank until money changes hands)
```

**Tier Color** (Orders col I)
```
green   (< 150 ft driveway)
yellow  (150–1,000 ft)
red     (> 1,000 ft, up to 20,000 ft)
unsure  (resident doesn't know — the department measures and then
         replaces this value with green, yellow, or red)

Blue relay markers are an OPTIONAL purchase offered only on the red tier,
and the resident must opt in. Marker Texts (col L) is therefore empty on
most rows — including red-tier rows where the resident declined. Empty
simply means "no markers ordered"; it is not a missing value to chase.
```

**Orientation** (Orders col J)
```
v  = vertical   (product 49961, max 4 chars at 4")
h  = horizontal (product 49965, max 8 chars at 4")
```

**Mounting** (Orders col O)
```
mailbox   = existing mailbox post
existing  = existing separate post
newpost   = needs a new post (adds Post Included = Yes + post line item)
```

**Preferred Contact Method** (Orders col V)
```
text
call
email
```

**Arrow Direction** (Orders col N — dept-filled)
```
Left
Right
Up
Down
Diagonal Top Left
Diagonal Top Right
Diagonal Bottom Left
Diagonal Bottom Right
(blank = not yet decided — do not place the vendor order for an
 arrow-sign row until this is set)

Note: product 49977 has TWO arrow settings. This column records which way
the arrow POINTS. The arrow's PLACEMENT (which side of the sign it sits on)
is chosen on the vendor page via the color list, which is doubled into
"LEFT ARROW - Green" and "RIGHT ARROW - Green". See RUNBOOK.md.
```

**Donation Choice** (used to compute col AA, not stored verbatim)
```
0, 10, 25, 50, other (custom amount, $1–$10,000)
```

---

## 4. Vendor Order Helper tab

New tab named `Vendor Order Helper`. Purpose: every 911 sign order is placed
**individually** at trafficsign.com (CONTRACT §11 — no bulk ordering), so
this tab turns each un-ordered row into a copy-paste configurator checklist.

> **Storage-format note (cross-file assumption — flagged in notes below):**
> this tab assumes Code.gs stores three Orders columns as plain strings in
> these shapes. If Code.gs ends up using different literals, only the
> `Vendor Order Helper` formulas need updating (the FILTER columns are
> unaffected either way):
> - **L (Marker Texts):** comma-separated, e.g. `1000, 2000, 3000`, or empty
>   string whenever no markers were ordered — which covers green and yellow
>   tiers (never offered) and red-tier orders where the resident declined the
>   optional add-on.
> - **M (Arrow Sign):** `Yes` when `sharedDriveway` is true, else `No`
>   string.
> - **P (Post Included):** `Yes` / `No`.

### 4.1 Headers (row 1)

`Order ID | House Number | Tier Color | Orientation | Marker Texts | Arrow Sign | Arrow Direction | Post Included | Order Recipe`

Columns A–H are the FILTER view; column I is the computed recipe (§4.3).

### 4.2 FILTER formula — cell A2

One array formula spills down and across A2:H2. Paste exactly (adjust the
`2:5000` bound upward if the Sheet ever exceeds ~5,000 orders):

```
=FILTER(
  {Orders!B2:B5000, Orders!H2:H5000, Orders!I2:I5000, Orders!J2:J5000,
   Orders!L2:L5000, Orders!M2:M5000, Orders!N2:N5000, Orders!P2:P5000},
  (Orders!E2:E5000="New") + (Orders!E2:E5000="Contacted") > 0
)
```

(Single-line for pasting into the formula bar:)

```
=FILTER({Orders!B2:B5000,Orders!H2:H5000,Orders!I2:I5000,Orders!J2:J5000,Orders!L2:L5000,Orders!M2:M5000,Orders!N2:N5000,Orders!P2:P5000},(Orders!E2:E5000="New")+(Orders!E2:E5000="Contacted")>0)
```

Column mapping (Orders → Helper): B→A (Order ID), H→B (House Number), I→C
(Tier Color), J→D (Orientation), L→E (Marker Texts), M→F (Arrow Sign), N→G
(Arrow Direction), P→H (Post Included). Rows disappear from this view
automatically once the dept sets Status to `Ordered` or beyond — that's the
"un-ordered work queue."

### 4.3 Order Recipe formula — cell I2, fill down

One formula per row, using `LET` to keep it a single cell while staying
readable. It builds: the main sign block (product/URL by orientation — bordered
49961/49965 for green and red, non-border 8349/8348 for yellow since the
bordered family has no yellow — color from tier, house number as characters,
4" DG .063" double-sided No Holes, NO anti-graffiti film, bracket note, post
note if applicable) → one block per
blue marker (product 49961, blue, single order note) → the arrow-sign block
(49977 bordered arrow, green, single-sided, direction from column G, or a
`SET DIRECTION FIRST` placeholder when blank) — joined with a `---`
separator, blank/absent blocks dropped.

Readable (multi-line) version — enter via the formula bar, which supports
`Alt+Enter`/`Ctrl+Enter` line breaks in current Sheets, or collapse to the
single-line version below if your Sheets version rejects multi-line formula
entry:

```
=IF($A2="","",
LET(
  ori, $D2,
  house, $B2,
  color, $C2,
  markersRaw, $E2,
  arrowFlag, $F2,
  arrowDir, $G2,
  postInc, $H2,
  prodLabel, IF(ori="v","VERTICAL 6x18 (product 49961)","HORIZONTAL 18x6 (product 49965)"),
  prodSearchUrl, IF(ori="v","https://www.trafficsign.com/search?q=49961","https://www.trafficsign.com/search?q=49965"),
  bracketNote, "Bracket: add matching "&IF(ori="v","vertical","horizontal")&" mounting bracket",
  postNote, IF(postInc="Yes", CHAR(10)&"Post: add matching sign post", ""),
  charWarn, IF(AND(ori="v", LEN(house)>4), CHAR(10)&"⚠ "&LEN(house)&" chars on a 4-char vertical product (49961) — confirm with resident / consider horizontal 49965 BEFORE ordering", ""),
  mainBlock, "MAIN SIGN — "&prodLabel&CHAR(10)&
    "URL: "&prodSearchUrl&CHAR(10)&
    "Color: "&color&CHAR(10)&
    "Characters: "&house&CHAR(10)&
    "Character size: 4 in"&CHAR(10)&
    "Material: Diamond Grade, .063 in aluminum"&CHAR(10)&
    "Sides: Double-sided"&CHAR(10)&
    "Holes: No Holes (centered text)"&CHAR(10)&
    "Anti-graffiti film: NO — do not add"&CHAR(10)&
    bracketNote & postNote & charWarn & CHAR(10)&
    "Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",
  markerList, IF(TRIM(markersRaw)="", "",
    TEXTJOIN(CHAR(10)&CHAR(10), TRUE,
      ARRAYFORMULA(
        "MARKER — VERTICAL 6x18 (product 49961)"&CHAR(10)&
        "URL: https://www.trafficsign.com/search?q=49961"&CHAR(10)&
        "Color: Blue"&CHAR(10)&
        "Characters: "&TRIM(SPLIT(markersRaw,","))&CHAR(10)&
        "Character size: 4 in"&CHAR(10)&
        "Material: Diamond Grade, .063 in aluminum"&CHAR(10)&
        "Sides: Double-sided"&CHAR(10)&
        "Holes: No Holes"&CHAR(10)&
        "Anti-graffiti film: NO"&CHAR(10)&
        "Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents"
      )
    )
  ),
  arrowBlock, IF(arrowFlag="Yes",
    "ARROW SIGN — HORIZONTAL 18x6 BORDERED (product 49977)"&CHAR(10)&
    "URL: https://www.trafficsign.com/search?q=49977"&CHAR(10)&
    "Color: pick the GREEN entry on the correct side — the color list is doubled into LEFT ARROW / RIGHT ARROW"&CHAR(10)&
    "Characters: "&house&CHAR(10)&
    "Character size: 4 in"&CHAR(10)&
    "Material: Diamond Grade, .063 in aluminum"&CHAR(10)&
    "Sides: SINGLE-SIDED"&CHAR(10)&
    "Holes: No Holes"&CHAR(10)&
    "Anti-graffiti film: NO"&CHAR(10)&
    "Arrow (separate control from color): "&IF(TRIM(arrowDir)="","SET DIRECTION FIRST — do not order yet",arrowDir)&CHAR(10)&
    "Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",
    ""
  ),
  TEXTJOIN(CHAR(10)&CHAR(10)&"---"&CHAR(10)&CHAR(10), TRUE, mainBlock, markerList, arrowBlock)
))
```

Single-line version (paste this directly into the formula bar if multi-line
entry isn't available in your Sheets version):

```
=IF($A2="","",LET(ori,$D2,house,$B2,color,$C2,markersRaw,$E2,arrowFlag,$F2,arrowDir,$G2,postInc,$H2,prodLabel,IF(color="yellow",IF(ori="v","VERTICAL 6x18 — NO-BORDER YELLOW (product 8349)","HORIZONTAL 18x6 — NO-BORDER YELLOW (product 8348)"),IF(ori="v","VERTICAL 6x18 (product 49961)","HORIZONTAL 18x6 (product 49965)")),prodSearchUrl,IF(color="yellow",IF(ori="v","https://www.trafficsign.com/search?q=8349","https://www.trafficsign.com/search?q=8348"),IF(ori="v","https://www.trafficsign.com/search?q=49961","https://www.trafficsign.com/search?q=49965")),bracketNote,"Bracket: add matching "&IF(ori="v","vertical","horizontal")&" mounting bracket",postNote,IF(postInc="Yes",CHAR(10)&"Post: add matching sign post",""),charWarn,IF(AND(ori="v",LEN(house)>4),CHAR(10)&"⚠ "&LEN(house)&" chars on a 4-char vertical product (49961) — confirm with resident / consider horizontal 49965 BEFORE ordering",""),mainBlock,"MAIN SIGN — "&prodLabel&CHAR(10)&"URL: "&prodSearchUrl&CHAR(10)&"Color: "&color&CHAR(10)&"Characters: "&house&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: Double-sided"&CHAR(10)&"Holes: No Holes (centered text)"&CHAR(10)&"Anti-graffiti film: NO — do not add"&CHAR(10)&bracketNote&postNote&charWarn&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",markerList,IF(TRIM(markersRaw)="","",TEXTJOIN(CHAR(10)&CHAR(10),TRUE,ARRAYFORMULA("MARKER — VERTICAL 6x18 (product 49961)"&CHAR(10)&"URL: https://www.trafficsign.com/search?q=49961"&CHAR(10)&"Color: Blue"&CHAR(10)&"Characters: "&TRIM(SPLIT(markersRaw,","))&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: Double-sided"&CHAR(10)&"Holes: No Holes"&CHAR(10)&"Anti-graffiti film: NO"&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents")),arrowBlock,IF(arrowFlag="Yes","ARROW SIGN — HORIZONTAL 18x6 BORDERED (product 49977)"&CHAR(10)&"URL: https://www.trafficsign.com/search?q=49977"&CHAR(10)&"Color: pick the GREEN entry on the correct side — the color list is doubled into LEFT ARROW / RIGHT ARROW"&CHAR(10)&"Characters: "&house&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: SINGLE-SIDED"&CHAR(10)&"Holes: No Holes"&CHAR(10)&"Anti-graffiti film: NO"&CHAR(10)&"Arrow (separate control from color): "&IF(TRIM(arrowDir)="","SET DIRECTION FIRST — do not order yet",arrowDir)&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",""),IF(color="unsure","⚠ DRIVEWAY NOT YET MEASURED — the resident asked us to measure it. Measure the driveway, set Tier Color (green/yellow/red) in the Orders tab, and offer the blue relay markers if it runs over 1,000 ft. Do NOT order anything for this row until then.",TEXTJOIN(CHAR(10)&CHAR(10)&"---"&CHAR(10)&CHAR(10),TRUE,mainBlock,markerList,arrowBlock))))
```

Fill I2 down through **I5000 once** (matching the FILTER bound in §4.2) —
the `IF($A2="","",...)` guard at the front makes this self-maintaining:
rows with no FILTER spill yet stay blank, and rows that gain data as the
FILTER view grows pick up a recipe automatically with no re-fill step.

**No extra helper columns are required** — `LET` keeps every intermediate
value scoped inside the single cell/formula.

### 4.4 Using the tab

For each row: open the product page by product number on trafficsign.com
(the `?q=` search links above are a starting point, not guaranteed exact
product URLs — CONTRACT.md documents product **numbers**, not vendor page
slugs, so confirm the live URL once and note it in RUNBOOK.md), copy column
I's text into the site's own notes/reference if useful, and configure the
listed options exactly. Never batch multiple residents into one cart order.
When `Order Recipe` shows `SET DIRECTION FIRST`, stop and fill in Orders
column J (Arrow Direction) before placing that arrow-sign line.

---

## Build checklist

- [ ] Create `Orders` tab, headers A1:AF1 exactly per §1.1
- [ ] Freeze row 1
- [ ] Status / Payment Status / Payment Type dropdowns + conditional formatting on columns E, F, G
- [ ] Create `Quarantine` tab, headers A1:C1, freeze row 1
- [ ] Create `Reference` tab, DO NOT EDIT banner + enum tables
- [ ] Create `Vendor Order Helper` tab, headers A1:I1
- [ ] Paste FILTER formula into A2
- [ ] Paste Order Recipe formula into I2, fill down
- [ ] Confirm tab names are exactly `Orders` / `Quarantine` (Code.gs CONFIG
      match, case-sensitive)
