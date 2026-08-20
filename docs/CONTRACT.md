# Interface Contract — YHEC1 911 Sign Portal

Single source of truth for every file in this repo. If a piece disagrees with this document, the piece is wrong. Approved mockup: `docs/mockup-v4.html` (binding visual target).

## 1. DOM contract (index.html ⇄ app.js)

Element IDs (must exist exactly):

| ID | Element | Purpose |
|---|---|---|
| `hnum` | `<input type="text" maxlength="5">` | House number |
| `signprev` | `<div>` | Live sign preview container (app.js owns innerHTML) |
| `prevcap` | `<p>` | Caption under preview |
| `digitwarn` | `<p>` (hidden) | 5-digit-vertical warning |
| `mount` | `<select>` | Options with `value`: `mailbox`, `existing`, `newpost` |
| `lenwrap` | `<div>` (hidden) | Wrapper for driveway length input |
| `dlen` | `<input type="number" min="150" max="20000" step="50">` | Driveway length ft |
| `measurenote` | `<div>` (hidden) | Explanation shown only when `tier = "unsure"` |
| `markerwrap` | `<div>` (hidden) | Wrapper for the optional-marker block; shown only on the red tier |
| `markers` | `<input type="checkbox">` | Opt in to blue relay markers (unchecked by default) |
| `markercount` / `markerprice` / `markerdetail` | spans | Derived count, derived price, and the marker texts, all filled by app.js |
| `shared` | `<input type="checkbox">` | Shared/common driveway |
| `sharedwrap` | `<div>` (hidden) | Wrapper for neighbor numbers input |
| `sharednums` | `<input type="text" maxlength="100">` | Neighbor house numbers |
| `fullname`, `addr`, `phone`, `email` | inputs | Contact fields |
| `attest` | checkbox | Required in-district self-attest |
| `notes` | `<textarea maxlength="1000">` | Placement notes |
| `summary` | `<div>` | Itemized order summary (app.js owns innerHTML) |
| `dtiers` | `<div>` | Donation buttons, each `<button data-d="0|10|25|50|-1">` (`-1` = Other → prompt/inline input `donother`) |
| `donother` | `<input type="number" min="1" max="10000">` (hidden until Other) | Custom donation |
| `total` | `<span>` | Total-due text |
| `submitbtn` | `<button>` | Place my order |
| `formerr` | `<div>` (hidden) | Top-level validation error list |
| `successpanel` | `<div>` (hidden) | Inline success panel (shows order ID, line items, next steps, optional Venmo/PayPal link) |
| `softpanel` | `<div>` (hidden) | Soft-success panel (no-cors fallback wording) |
| `orderform` | `<form novalidate>` | The form |

Radio groups by `name`: `orient` (values `v`,`h`; default `v`), `tier` (values `green`,`yellow`,`red`,`unsure`; default `green`), `contactm` (values `text`,`call`,`email`; default `text`).

`tier = "unsure"` means the resident doesn't know their driveway length and has asked the department to measure it. The sign colour is undetermined until then. Price is unaffected — every colour costs the same — so the order still totals correctly and can be submitted.

Honeypot: `<input type="text" name="contact_website" id="contact_website" tabindex="-1" autocomplete="off" aria-hidden="true">` inside a `.hp` wrapper positioned off-screen via CSS (not `display:none` — bots skip those).

Per-field inline errors: each field's wrapper may contain `<p class="field-err" data-for="<id>">`; app.js fills/toggles them.

## 2. config.js

```js
window.PORTAL_CONFIG = {
  endpoint: "",                      // Apps Script /exec URL. "" => mock mode. ?mock=1 also forces mock.
  prices: { sign: 34.91, bracket: 8.24, post: 37.80, marker: 34.91, arrow: 29.98 },  // live vendor prices 2026-08-19 (bracket = Wing Bracket Y3518; post = 8' 1.12lbs/ft green U-channel)
  pricesAsOf: "trafficsign.com prices as of Aug 19, 2026",   // rendered into the price note under the order summary
  donationTiers: [0, 10, 25, 50],    // "Other" is always appended
  defaultDonation: 25,
  venmoUrl: "",                      // when non-empty, success panel + copy show the link
  paypalUrl: "",
  // Department name and site URL live in index.html, not here — a config key
  // nothing reads is a trap for the volunteer who edits this file.
  contactFallback: ""                // shown in soft-success/noscript, e.g. an email/phone; "" hides
};
```

## 3. Order math (identical client & server; server is authoritative)

- `computeMarkers(tier, lenFt, wantMarkers)`: `[]` unless `tier === "red"` **and** `wantMarkers === true`; then `["1000","2000",…]` with count `max(1, floor(lenFt/1000))`, capped at 20.
  - Blue relay markers are an **optional purchase**, opt-in (unchecked by default), and offered **only on the red tier**. A yellow-tier driveway is under 1,000 ft, so it never reaches a 1,000-ft mark — it gets no markers at all.
- Line items, in order:
  1. `{Color} bordered address sign ({number}), {vertical|horizontal}, two-sided` — `prices.sign`. Two exceptions: yellow (tier 2) comes from the non-border product family, so its label drops the word "bordered" (`Yellow address sign ({number}), …`); and `unsure` has no colour yet, so its label reads `Address sign ({number}), {orientation}, two-sided — colour set after we measure`.
  2. `Mounting bracket ({vertical|horizontal})` — `prices.bracket`
  3. `Sign post` — `prices.post` — only if `mounting === "newpost"`
  4. One per marker: `Blue relay marker "{text}", vertical` — `prices.marker`
  5. `Green arrow sign for the split (horizontal, single-sided)` — `prices.arrow` — only if `sharedDriveway`
- `signsTotal` = sum; `totalDue` = signsTotal + donation (donation ≥ 0).
- 5-digit + vertical: allowed but shows `digitwarn` (UI) and is flagged in the Sheet row (server appends `⚠ 5-character house number on vertical sign` to Internal Notes).

## 4. Submission payload (client → doPost, `Content-Type: text/plain;charset=utf-8`, body = JSON string)

```json
{
  "uuid": "crypto.randomUUID()",
  "houseNumber": "1234", "orientation": "v|h",
  "mounting": "mailbox|existing|newpost",
  "tier": "green|yellow|red|unsure", "drivewayLengthFt": 1400,
  "wantMarkers": false,
  "sharedDriveway": false, "sharedNumbers": "",
  "fullName": "", "address": "", "phone": "", "email": "",
  "contactMethod": "text|call|email",
  "inDistrictAttest": true, "notes": "",
  "donationChoice": "0|10|25|50|other", "donationOther": 0,
  "elapsedMs": 12345, "contact_website": ""
}
```

Never send a total. Never use `application/json` (CORS preflight breaks Apps Script).

## 5. Server validation (whitelist; everything else discarded)

| Field | Rule |
|---|---|
| uuid | required, 8–64 chars `[A-Za-z0-9-]` |
| houseNumber | required, 1–5 alphanumeric, uppercase+trim |
| orientation | enum v/h |
| mounting | enum mailbox/existing/newpost |
| tier | enum green/yellow/red/unsure |
| drivewayLengthFt | required only for tier yellow or red; integer; yellow 150–1000, red 1001–20000. Not required (and ignored) for green and unsure |
| wantMarkers | boolean; server ignores it unless tier is `red` |
| sharedDriveway | boolean |
| sharedNumbers | ≤100 chars |
| fullName | 2–100 chars |
| address | 5–200 chars |
| phone | 7–15 digits after stripping non-digits |
| email | ≤254 chars, `x@y.z` shape |
| contactMethod | enum text/call/email |
| inDistrictAttest | must be true |
| notes | ≤1000 chars |
| donationChoice | enum 0/10/25/50/other; if other → donationOther integer 1–10000 |
| elapsedMs | ≥ 5000 — handled as a pre-validation gate (see section 8): returns an honest generic `{ok:false,errors:[{field:"",message:"Please try again."}]}` plus a Quarantine row, never a field-level error |
| contact_website | must be empty, else fake success + Quarantine row (the fake success matches a real success's shape exactly, with a random order ID) |

Client mirrors these (friendlier messages) before sending.

## 6. Response (ContentService JSON, always HTTP 200 — client keys off `ok`)

Success: `{"ok":true,"orderId":"YH-8F3K2Q","lineItems":[{"label":"...","amount":30}],"signsTotal":50,"donation":25,"totalDue":75}`
Failure: `{"ok":false,"errors":[{"field":"email","message":"..."}]}`
`doGet`: `{"ok":true,"service":"yhec1-911-signs","version":"1"}`
Order ID: `"YH-" + 6 chars from Utilities.getUuid() uppercased alphanumerics`.

## 7. Submit flow (app.js)

1. Client validation → inline errors, focus first error, stop.
2. Lock `submitbtn` (spinner text "Sending…").
3. `fetch(endpoint, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body: JSON.stringify(payload), redirect:"follow"})`.
4. `ok:true` → hide form, show `successpanel` populated from **response** (server truth). `ok:false` → map errors to fields, unlock.
5. fetch throws → retry once `mode:"no-cors"` same body/uuid → show `softpanel`. Because a no-cors response is opaque, the panel must NEVER assert the order succeeded: it says the order could not be confirmed, names the confirmation email as the only proof, and gives a way to reach a human (`config.contactFallback`, falling back to the department website when unset).
6. **Unconfigured guard:** empty `endpoint` on a non-localhost origin is a broken deployment, not mock mode. The form is hidden and replaced with a notice telling the resident to phone the department. Without this, a live site with an unset endpoint silently swallows every order behind a "TEST MODE" banner a resident cannot interpret. 
7. Mock mode (`?mock=1`, or empty `endpoint` **on localhost only**): 800 ms fake round-trip computing the response locally with client math; banner "TEST MODE — order not sent".

## 8. Server flow (Code.gs doPost)

parse → honeypot (fake success + Quarantine) → elapsedMs gate → validate (errors out) → UUID cache hit? replay cached success (6 h) → email+address hash dedupe (10 min) → LockService + CacheService global counter (max 15/10 min → `{ok:false,errors:[{field:"",message:"We're receiving a lot of orders — please try again in a few minutes."}]}`) → compute items/totals from CONFIG prices → append row to `Orders` (Email Status "pending") → send dept email, resident email (each try/caught) → update Email Status → cache success by uuid → return. Outer try/catch: on crash after parse, email raw payload to dept. CONFIG block at top: `DEPT_EMAIL`, `PRICES` (mirror of config.js), `SHEET_ORDERS="Orders"`, `SHEET_QUARANTINE="Quarantine"`, `THROTTLE {windowSec:600, max:60, perEmailMax:3, perEmailWindowSec:3600}`, `MIN_ELAPSED_MS 5000`.

Throttling is two-tier: a per-email limit (3/hour) so one source flooding degrades only its own experience, and a global limit (60/10min) as a backstop for the Sheet. A global limit tight enough to stop one abuser would also lock out every other resident, which is why the global figure sits well above any believable real burst.

`weeklyHeartbeat()` runs on a weekly time-based trigger and emails the department a summary (new orders, orders awaiting action, rows needing measurement or an arrow direction). Its purpose is to make silence detectable: a broken portal produces no orders, which is indistinguishable from a quiet week.

## 9. Orders sheet columns (A→AA, 27 columns, exact order; appendRow must match)

Timestamp | Order ID | Status | House Number | Tier Color | Orientation | Driveway Ft | Marker Texts | Arrow Sign | Arrow Direction (dept) | Mounting | Post Included | Shared With Numbers | Full Name | Property Address | Phone | Email | Preferred Contact | In-District Attest | Placement Notes | Est Signs+Hardware $ | Donation Pledged $ | Est Total Due $ | Actual Vendor Total $ (dept) | Donation Received $ (dept) | Email Status | Internal Notes

Status values: `New`, `Contacted`, `Ordered`, `Installed`, `Paid`.

## 10. Emails

- Dept: subject `New 911 sign order {orderId} — {houseNumber}, {address}`; body: all fields, line items, est. total, reminders (confirm exact total incl. shipping before ordering; set Arrow Direction if arrow sign; verify house number).
- Resident: subject `We received your 911 address sign order ({orderId})`; body: "Your sign will read: {HOUSENUMBER} — reply to this email if that's not correct", line items + estimated total, "we'll confirm your exact total including shipping before we order", cash/check at installation payable to "Yorktown Heights Engine Co. 1", donation thanks ("support the Yorktown Heights Engine Company #1"), next step = contact via {contactMethod}. Sender name `Yorktown Heights Engine Co. No. 1`, replyTo DEPT_EMAIL.

## 11. Vendor products (for docs + Vendor Order Helper)

- Vertical sign: trafficsign.com product **49961** (6×18, 4" chars, DG, .063", double-sided, No Holes, no graffiti film). Max 4 chars at 4".
- Horizontal sign: product **49965** (18×6, 4" chars, DG, .063", double-sided, No Holes, no film). Max 8 chars at 4".
- Arrow sign: product **49977** "Horizontal 911 Address Sign with Border – Numbers and Arrow" (18×6, 4" chars, green, DG, .063", **single-sided**, No Holes, no film; $29.98 verified 2026-08-19, SKU X3115-18-SSDG-NH9). Two arrow settings, both printed at order time and both set by the dept pre-order: **placement side** (bundled into the color control as "LEFT ARROW – Green" / "RIGHT ARROW – Green") and **pointing direction** (separate control: left, right, up, down, 4 diagonals).
- **Yellow (tier 2) signs**: the bordered family has no yellow — order from the non-border products **8349** (vertical) / **8348** (horizontal), Yellow Reflective with black characters, same spec, same $34.91 (verified 2026-08-19, e.g. SKU X2913-18-DG-NH9 vertical 6×18).
- Hardware: bracket = **Wing Bracket, Item Y3518** (2⅛×4¼", flag-style, $8.24); post = **8' U-channel, 1.12 lbs/ft, green enamel** ($37.80), both from trafficsign.com's U-channel hardware catalog.
- Blue markers: product **49961** in blue, text "1000"/"2000"/…
- Every order is placed **individually** (no bulk); purchaser pays all online-priced items incl. shipping.
