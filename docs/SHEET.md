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

### 1.1 Headers (row 1, columns A→AB — exact order, exact text)

`appendRow` in Code.gs writes an array in this order with no header lookup —
the column **position** is the contract. Type each header exactly as shown into row 1 of a tab named `Orders`. Header
text is copied **verbatim** from CONTRACT §9, including the `(dept)`
suffixes it uses on three columns — those parentheticals are literal header
text here, not just a role annotation; the "Script fills? / Dept fills?"
columns below are this doc's own commentary, separate from the header cell
text.

| Col | Header (type exactly) | Script fills? | Dept fills? |
|---|---|---|---|
| A | Timestamp | ✅ (script sets on append) | |
| B | Order ID | ✅ | |
| C | Status | ✅ (script writes `New` on append) | ✅ (dept advances it: Contacted → Ordered → Installed → Paid) |
| D | House Number | ✅ | |
| E | Tier Color | ✅ | |
| F | Orientation | ✅ | |
| G | Driveway Ft | ✅ | |
| H | Marker Texts | ✅ | |
| I | Arrow Sign | ✅ | |
| J | Arrow Direction (dept) | | ✅ **dept-only** — script never writes this. Must be set before the vendor order is placed for any row with an arrow sign. |
| K | Mounting | ✅ | |
| L | Post Included | ✅ | |
| M | Shared With Numbers | ✅ | |
| N | Full Name | ✅ | |
| O | Property Address | ✅ | |
| P | Phone | ✅ | |
| Q | Email | ✅ | |
| R | Preferred Contact | ✅ | |
| S | Rental/2nd Property | ✅ | |
| T | In-District Attest | ✅ | |
| U | Placement Notes | ✅ (resident's text, verbatim) | |
| V | Est Signs+Hardware $ | ✅ | |
| W | Donation Pledged $ | ✅ | |
| X | Est Total Due $ | ✅ | |
| Y | Actual Vendor Total $ (dept) | | ✅ **dept-only** — filled once the individual vendor order (incl. shipping) is actually placed. |
| Z | Donation Received $ (dept) | | ✅ **dept-only** — filled when cash/check is collected at installation. |
| AA | Email Status | ✅ (script sets `pending` → `sent` / `failed (dept)` / `failed (both)` after the email try/catch block) | |
| AB | Internal Notes | partly ✅ / partly ✅ — script may append automated flags (e.g. the 5-digit-vertical warning also lands here per CONTRACT §3, or dedupe/throttle notes); dept freely adds its own notes in the same cell, on new lines |

So: **script-owned** columns are A, B, D–I, K–X, AA (plus the initial `New`
in C). **Dept-owned** columns are J, Y, Z, and AB is shared (script may
append; dept edits/extends the same cell). C is script-initialized then
dept-advanced.

### 1.2 Freeze row 1

Select row 1 → **View → Freeze → 1 row**.

### 1.3 Status dropdown (data validation) — column C

1. Select `C2:C` (whole column below header — right-click the column C
   letter → select the column, or select `C2:C1000` if you prefer a bound
   range).
2. **Data → Data validation → Add rule.**
3. Criteria: **Dropdown** (or "List of items" on older Sheets UI).
4. Enter exactly: `New, Contacted, Ordered, Installed, Paid`
5. "Show dropdown chip in cell" — on. "Reject input" — on (keeps the enum
   closed, matching CONTRACT §9's status list).
6. Save.

### 1.4 Conditional formatting per status — column C

**Format → Conditional formatting**, apply to range `C2:C1000`, add one rule
per status ("Format cells if... Text is exactly..."), custom colors:

| Status | Fill | Text | Rationale |
|---|---|---|---|
| `New` | `#F1F3F4` (light gray) | `#5F6368` | untouched, needs first look |
| `Contacted` | `#D2E3FC` (light blue) | `#1967D2` | dept has reached out |
| `Ordered` | `#FEF7E0` (light amber) | `#B06000` | vendor order placed, awaiting delivery/install |
| `Installed` | `#E6F4EA` (light green) | `#188038` | sign is up, awaiting payment reconciliation |
| `Paid` | `#E6CFF2` (light violet) | `#5B2C87` | fully closed out — violet keeps it visually distinct from `Installed`'s green |

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

**Status values** (Orders col C)
```
New
Contacted
Ordered
Installed
Paid
```

**Tier Color** (Orders col E)
```
green   (< 150 ft driveway)
yellow  (150–1,000 ft)
red     (> 1,000 ft, up to 20,000 ft)
```

**Orientation** (Orders col F)
```
v  = vertical   (product 49961, max 4 chars at 4")
h  = horizontal (product 49965, max 8 chars at 4")
```

**Mounting** (Orders col K)
```
mailbox   = existing mailbox post
existing  = existing separate post
newpost   = needs a new post (adds Post Included = Yes + post line item)
```

**Preferred Contact Method** (Orders col R)
```
text
call
email
```

**Arrow Direction** (Orders col J — dept-filled)
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

**Donation Choice** (used to compute col W, not stored verbatim)
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
> - **H (Marker Texts):** comma-separated, e.g. `1000, 2000, 3000`, or empty
>   string when the tier is green.
> - **I (Arrow Sign):** `Yes` when `sharedDriveway` is true, else `No`
>   string.
> - **L (Post Included):** `Yes` / `No`.

### 4.1 Headers (row 1)

`Order ID | House Number | Tier Color | Orientation | Marker Texts | Arrow Sign | Arrow Direction | Post Included | Order Recipe`

Columns A–H are the FILTER view; column I is the computed recipe (§4.3).

### 4.2 FILTER formula — cell A2

One array formula spills down and across A2:H2. Paste exactly (adjust the
`2:5000` bound upward if the Sheet ever exceeds ~5,000 orders):

```
=FILTER(
  {Orders!B2:B5000, Orders!D2:D5000, Orders!E2:E5000, Orders!F2:F5000,
   Orders!H2:H5000, Orders!I2:I5000, Orders!J2:J5000, Orders!L2:L5000},
  (Orders!C2:C5000="New") + (Orders!C2:C5000="Contacted") > 0
)
```

(Single-line for pasting into the formula bar:)

```
=FILTER({Orders!B2:B5000,Orders!D2:D5000,Orders!E2:E5000,Orders!F2:F5000,Orders!H2:H5000,Orders!I2:I5000,Orders!J2:J5000,Orders!L2:L5000},(Orders!C2:C5000="New")+(Orders!C2:C5000="Contacted")>0)
```

Column mapping (Orders → Helper): B→A (Order ID), D→B (House Number), E→C
(Tier Color), F→D (Orientation), H→E (Marker Texts), I→F (Arrow Sign), J→G
(Arrow Direction), L→H (Post Included). Rows disappear from this view
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
=IF($A2="","",LET(ori,$D2,house,$B2,color,$C2,markersRaw,$E2,arrowFlag,$F2,arrowDir,$G2,postInc,$H2,prodLabel,IF(color="yellow",IF(ori="v","VERTICAL 6x18 — NO-BORDER YELLOW (product 8349)","HORIZONTAL 18x6 — NO-BORDER YELLOW (product 8348)"),IF(ori="v","VERTICAL 6x18 (product 49961)","HORIZONTAL 18x6 (product 49965)")),prodSearchUrl,IF(color="yellow",IF(ori="v","https://www.trafficsign.com/search?q=8349","https://www.trafficsign.com/search?q=8348"),IF(ori="v","https://www.trafficsign.com/search?q=49961","https://www.trafficsign.com/search?q=49965")),bracketNote,"Bracket: add matching "&IF(ori="v","vertical","horizontal")&" mounting bracket",postNote,IF(postInc="Yes",CHAR(10)&"Post: add matching sign post",""),charWarn,IF(AND(ori="v",LEN(house)>4),CHAR(10)&"⚠ "&LEN(house)&" chars on a 4-char vertical product (49961) — confirm with resident / consider horizontal 49965 BEFORE ordering",""),mainBlock,"MAIN SIGN — "&prodLabel&CHAR(10)&"URL: "&prodSearchUrl&CHAR(10)&"Color: "&color&CHAR(10)&"Characters: "&house&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: Double-sided"&CHAR(10)&"Holes: No Holes (centered text)"&CHAR(10)&"Anti-graffiti film: NO — do not add"&CHAR(10)&bracketNote&postNote&charWarn&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",markerList,IF(TRIM(markersRaw)="","",TEXTJOIN(CHAR(10)&CHAR(10),TRUE,ARRAYFORMULA("MARKER — VERTICAL 6x18 (product 49961)"&CHAR(10)&"URL: https://www.trafficsign.com/search?q=49961"&CHAR(10)&"Color: Blue"&CHAR(10)&"Characters: "&TRIM(SPLIT(markersRaw,","))&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: Double-sided"&CHAR(10)&"Holes: No Holes"&CHAR(10)&"Anti-graffiti film: NO"&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents")),arrowBlock,IF(arrowFlag="Yes","ARROW SIGN — HORIZONTAL 18x6 BORDERED (product 49977)"&CHAR(10)&"URL: https://www.trafficsign.com/search?q=49977"&CHAR(10)&"Color: pick the GREEN entry on the correct side — the color list is doubled into LEFT ARROW / RIGHT ARROW"&CHAR(10)&"Characters: "&house&CHAR(10)&"Character size: 4 in"&CHAR(10)&"Material: Diamond Grade, .063 in aluminum"&CHAR(10)&"Sides: SINGLE-SIDED"&CHAR(10)&"Holes: No Holes"&CHAR(10)&"Anti-graffiti film: NO"&CHAR(10)&"Arrow (separate control from color): "&IF(TRIM(arrowDir)="","SET DIRECTION FIRST — do not order yet",arrowDir)&CHAR(10)&"Order note: SINGLE INDIVIDUAL ORDER — do not combine with other residents",""),TEXTJOIN(CHAR(10)&CHAR(10)&"---"&CHAR(10)&CHAR(10),TRUE,mainBlock,markerList,arrowBlock)))
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

- [ ] Create `Orders` tab, headers A1:AB1 exactly per §1.1
- [ ] Freeze row 1
- [ ] Status dropdown + conditional formatting on column C
- [ ] Create `Quarantine` tab, headers A1:C1, freeze row 1
- [ ] Create `Reference` tab, DO NOT EDIT banner + enum tables
- [ ] Create `Vendor Order Helper` tab, headers A1:I1
- [ ] Paste FILTER formula into A2
- [ ] Paste Order Recipe formula into I2, fill down
- [ ] Confirm tab names are exactly `Orders` / `Quarantine` (Code.gs CONFIG
      match, case-sensitive)
