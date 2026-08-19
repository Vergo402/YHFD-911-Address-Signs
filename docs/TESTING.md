# Testing Matrix — YHEC1 911 Sign Portal

Two-phase test plan: local UI validation with mock mode, then backend curl matrix against deployed endpoint.

## Phase 1: Local UI Testing

**Setup:** Run `python3 -m http.server` in the repo root. Open `http://localhost:8000/?mock=1` in a browser (desktop and mobile).

**Mock mode behavior:** `?mock=1` forces client-side validation and 800 ms simulated round-trip; server is bypassed. No "TEST MODE" banner means the live endpoint is in use — check the URL.

### Test Cases

#### Tier & Marker Math

| Case | Inputs | Expected Preview | Summary Items | Notes |
|---|---|---|---|---|
| Green tier, short driveway | House: 123, Orient: V, Mount: mailbox, Tier: green | Green sign, small size | Sign + Bracket (no post, no markers) | Length input hidden |
| Yellow tier, 600 ft | House: 1234, Orient: H, Mount: mailbox, Tier: yellow, Length: 600 | Yellow sign, wide | Sign + Bracket + One marker "1000" | `floor(600/1000)=0` → yellow tier exception, one marker always |
| Red tier, 2500 ft | House: 12345, Orient: V, Mount: newpost, Tier: red, Length: 2500 | Red sign, vertical | Sign + Bracket + Post + Two markers "1000" "2000" | `floor(2500/1000)=2` markers; post line present |
| Red tier, 5200 ft | House: 1234, Orient: H, Mount: existing, Tier: red, Length: 5200 | Red sign, wide | Sign + Bracket + Five markers "1000"–"5000" | `floor(5200/1000)=5` markers; post not included |

#### Orientation & Warnings

| Case | Inputs | Expected Behavior | Notes |
|---|---|---|---|
| Vertical, 4 chars | House: 1234, Orient: V, Tier: green | No warning; sign preview shows 4-char vertical | Max 4 chars at 4" on 6×18 |
| Vertical, 5 chars | House: 12345, Orient: V, Tier: green | Warning: "5 digits on vertical reduces readability at distance; consider horizontal." | UI shows `#digitwarn`; server appends "⚠ 5 digits on vertical" to Internal Notes |
| Horizontal, 8 chars | House: 12345678, Orient: H, Tier: yellow, Length: 200 | No warning; sign shows 8 chars | Max 8 chars at 4" on 18×6; no vertical limit on horizontal |
| Flip V→H | House: 12345, Orient: V, then H | Warning disappears on flip to H; reappears on flip back | Real-time preview update |

#### Mounting & Line Items

| Case | Inputs | Expected Summary | Notes |
|---|---|---|---|
| Mailbox | Orient: V, Mount: mailbox, Tier: green | Sign + Bracket (no post) | Standard case |
| Existing post | Orient: H, Mount: existing, Tier: yellow, Length: 300 | Sign + Bracket (no post) | Assumes resident has usable post already |
| Need post | Orient: V, Mount: newpost, Tier: red, Length: 1500 | Sign + Bracket + **Post** + markers | Post line item appears only for this option |

#### Shared Driveway

| Case | Inputs | Expected Behavior | Summary Items | Notes |
|---|---|---|---|---|
| Shared off | Checkbox unchecked, all tiers | Neighbor field hidden; no arrow line item | Baseline for each tier |
| Shared on | Checkbox checked, House: 123, Neighbor #: "456 789", Tier: green | Neighbor field visible; **Green arrow sign** added to summary | Arrow is always green regardless of main sign tier; single-sided |
| Shared on + no neighbors | Checkbox checked, Neighbor #: empty, Tier: yellow, Length: 400 | Arrow sign in summary; validation allows empty (soft requirement) | Summary still shows arrow line |

#### Donation Tiers

| Case | Input | Form State | Summary Total |
|---|---|---|---|
| $0 donation | Click "$0" button | Button highlighted | Total = signs only, no donation line |
| $10 donation | Click "$10" button | Button highlighted | Total = signs + $10 |
| $25 donation (default) | No click; form loaded | "$25" button highlighted on load | Total = signs + $25 |
| $50 donation | Click "$50" button | Button highlighted | Total = signs + $50 |
| Custom donation | Click "Other"; enter 37 in field | "Other" button highlighted, field visible | Total = signs + $37 |
| Custom out of range | Enter 0, then 10001 in Other field | Field rejects (type=number min/max) | Validation on blur/submit |

#### Validation Error Messages (Client-Side)

Test each by entering invalid data and attempting submit (or on field blur).

| Field | Invalid Input | Expected Error | Notes |
|---|---|---|---|
| House Number | Empty | "House number is required" | Focus first |
| House Number | "123456" (6 chars) | "House number must be 1–5 characters" | maxlength=5 on input |
| Orientation | N/A | N/A | Radio group; always has value |
| Mounting | N/A | N/A | Select; always has value |
| Tier | N/A | N/A | Radio group; always has value |
| Driveway Length | Tier=yellow, length empty | "Driveway length required for yellow/red tiers" | Hidden input when tier=green; validated when visible |
| Driveway Length | Tier=yellow, length 100 | "Yellow tier requires 150–1000 feet" | min=150 for yellow |
| Driveway Length | Tier=yellow, length 1100 | "Yellow tier requires 150–1000 feet" | max=1000 for yellow |
| Driveway Length | Tier=red, length 1000 | "Red tier requires 1001–20000 feet" | min=1001 for red |
| Driveway Length | Tier=red, length 25000 | "Red tier requires 1001–20000 feet" | max=20000 for red |
| Full Name | "J" | "Full name must be at least 2 characters" | minlength=2 |
| Full Name | (101 chars) | "Full name must be 100 characters or fewer" | maxlength=100 |
| Address | "123 St" (5 chars) | Pass; "123 St" is valid | Minimum is 5 |
| Address | "123 S" (4 chars) | "Address must be at least 5 characters" | minlength=5 |
| Address | (201 chars) | "Address must be 200 characters or fewer" | maxlength=200 |
| Phone | "555" | "Phone must be 7–15 digits" | After stripping non-digits |
| Phone | "555-1234" (7 digits after strip) | Pass | Valid |
| Phone | "555-12345-67890-1" (16 digits) | "Phone must be 7–15 digits" | After stripping non-digits |
| Email | "user" | "Please enter a valid email (e.g., name@example.com)" | Must match x@y.z shape |
| Email | "user@" | "Please enter a valid email (e.g., name@example.com)" | Incomplete |
| Email | "user@example.com" | Pass | Valid |
| Notes | (1001 chars) | "Notes must be 1000 characters or fewer" | maxlength=1000 |
| In-District Attest | Unchecked | "You must confirm you live in Yorktown Heights" | Required; focus this field |
| Contact Method | N/A | N/A | Radio group; always has value |
| Donation Choice | Click button → N/A | N/A | Buttons determine choice; always set |

#### Mobile Responsiveness

| Viewport | Test |
|---|---|
| 375px (mobile) | Resize browser to 375×812 (mobile preset). Verify: form stack vertically, input fields span full width, buttons remain clickable, preview sign scales proportionally, no horizontal scroll, donation buttons reflow to single column if needed. |
| 768px (tablet) | Verify: form elements side-by-side where space allows, preview maintains aspect ratio, no overflow. |
| 1280px (desktop) | Verify: full layout as designed in mockup v4. |

---

## Phase 2: Backend Curl Testing

**Setup:** Deploy the Apps Script to Google Workspace (see [docs/SETUP.md](SETUP.md)). The `/exec` endpoint URL will be provided in SETUP.

**Endpoint:** Replace `$EXEC` in all commands below with the actual Apps Script `/exec` URL (e.g., `https://script.google.com/macros/d/.../usercontent`).

**Content-Type note:** All requests use `-H "Content-Type: text/plain;charset=utf-8"`. Never use `application/json`; that breaks CORS handshake with Apps Script.

**Base valid payload (reused across tests; modify specific fields per case):**

```json
{
  "uuid": "test-uuid-001",
  "houseNumber": "1234",
  "orientation": "v",
  "mounting": "mailbox",
  "tier": "green",
  "drivewayLengthFt": 0,
  "sharedDriveway": false,
  "sharedNumbers": "",
  "fullName": "Jane Doe",
  "address": "123 Example Road, Yorktown Heights, NY 10598",
  "phone": "9145551234",
  "email": "jane@example.com",
  "contactMethod": "text",
  "rentalProperty": false,
  "inDistrictAttest": true,
  "notes": "",
  "donationChoice": "0",
  "donationOther": 0,
  "elapsedMs": 12345,
  "contact_website": ""
}
```

### Test Cases

#### Happy Path (Happy, by Tier)

| Case | Curl | Expected Response | Sheet Effect |
|---|---|---|---|
| **Green tier** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"happy-green-001","houseNumber":"1234","orientation":"v","mounting":"mailbox","tier":"green","drivewayLengthFt":0,"sharedDriveway":false,"sharedNumbers":"","fullName":"Jane Doe","address":"123 Example Rd, Yorktown Heights, NY 10598","phone":"9145551234","email":"jane@example.com","contactMethod":"text","rentalProperty":false,"inDistrictAttest":true,"notes":"","donationChoice":"0","donationOther":0,"elapsedMs":12345,"contact_website":""}'` | `{"ok":true,"orderId":"YH-xxxxxx","lineItems":[{"label":"Green bordered address sign (1234), vertical, two-sided","amount":34.91},{"label":"Mounting bracket (vertical)","amount":8.24}],"signsTotal":43.15,"donation":0,"totalDue":43.15}` | New row in Orders sheet with Status=New, Email Status=pending |
| **Yellow tier** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"happy-yellow-001","houseNumber":"1234","orientation":"v","mounting":"mailbox","tier":"yellow","drivewayLengthFt":600,"sharedDriveway":false,"sharedNumbers":"","fullName":"Jane Doe","address":"123 Example Rd, Yorktown Heights, NY 10598","phone":"9145551234","email":"jane@example.com","contactMethod":"text","rentalProperty":false,"inDistrictAttest":true,"notes":"","donationChoice":"10","donationOther":0,"elapsedMs":12345,"contact_website":""}'` | `{"ok":true,"orderId":"YH-xxxxxx","lineItems":[{"label":"Yellow address sign (1234), vertical, two-sided","amount":34.91},{"label":"Mounting bracket (vertical)","amount":8.24},{"label":"Blue relay marker \"1000\", vertical","amount":34.91}],"signsTotal":78.06,"donation":10,"totalDue":88.06}` (note: yellow labels say "address sign", not "bordered address sign" — tier-2 signs come from the non-border product) | New row with Tier Color=Yellow, Marker Texts="1000", Donation Pledged=10 |
| **Red tier** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"happy-red-001","houseNumber":"12345","orientation":"h","mounting":"newpost","tier":"red","drivewayLengthFt":2500,"sharedDriveway":false,"sharedNumbers":"","fullName":"Jane Doe","address":"123 Example Rd, Yorktown Heights, NY 10598","phone":"9145551234","email":"jane@example.com","contactMethod":"text","rentalProperty":false,"inDistrictAttest":true,"notes":"","donationChoice":"25","donationOther":0,"elapsedMs":12345,"contact_website":""}'` | `{"ok":true,"orderId":"YH-xxxxxx","lineItems":[{"label":"Red bordered address sign (12345), horizontal, two-sided","amount":34.91},{"label":"Mounting bracket (horizontal)","amount":8.24},{"label":"Sign post","amount":37.8},{"label":"Blue relay marker \"1000\", vertical","amount":34.91},{"label":"Blue relay marker \"2000\", vertical","amount":34.91}],"signsTotal":150.77,"donation":25,"totalDue":175.77}` | New row with Tier Color=Red, Driveway Ft=2500, Marker Texts="1000,2000", Post Included=Y, Donation Pledged=25 |

#### Shared Driveway (Happy Path)

| Case | Curl | Expected Response | Sheet Effect |
|---|---|---|---|
| **Green + shared** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"happy-shared-001","houseNumber":"123","orientation":"v","mounting":"mailbox","tier":"green","drivewayLengthFt":0,"sharedDriveway":true,"sharedNumbers":"456, 789","fullName":"Jane Doe","address":"123 Example Rd, Yorktown Heights, NY 10598","phone":"9145551234","email":"jane@example.com","contactMethod":"text","rentalProperty":false,"inDistrictAttest":true,"notes":"order together w neighbors","donationChoice":"50","donationOther":0,"elapsedMs":12345,"contact_website":""}'` | `{"ok":true,"orderId":"YH-xxxxxx","lineItems":[{"label":"Green bordered address sign (123), vertical, two-sided","amount":34.91},{"label":"Mounting bracket (vertical)","amount":8.24},{"label":"Green arrow sign for the split (horizontal, single-sided)","amount":29.98}],"signsTotal":73.13,"donation":50,"totalDue":123.13}` | New row with Shared With Numbers="456, 789", Arrow Sign=Y, Donation Pledged=50, Internal Notes includes neighbor recommendation |

#### Custom Donation

| Case | Curl | Expected Response | Sheet Effect |
|---|---|---|---|
| **Custom donation** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"happy-custom-don-001","houseNumber":"1234","orientation":"v","mounting":"mailbox","tier":"green","drivewayLengthFt":0,"sharedDriveway":false,"sharedNumbers":"","fullName":"Jane Doe","address":"123 Example Rd, Yorktown Heights, NY 10598","phone":"9145551234","email":"jane@example.com","contactMethod":"text","rentalProperty":false,"inDistrictAttest":true,"notes":"","donationChoice":"other","donationOther":73,"elapsedMs":12345,"contact_website":""}'` | `{"ok":true,"orderId":"YH-xxxxxx","lineItems":[{"label":"Green bordered address sign (1234), vertical, two-sided","amount":34.91},{"label":"Mounting bracket (vertical)","amount":8.24}],"signsTotal":43.15,"donation":73,"totalDue":116.15}` | New row, Donation Pledged=73 |

#### Validation Failures

All return `{"ok":false,"errors":[...]}` with no Sheet row appended.

| Case | Curl | Expected Error | Notes |
|---|---|---|---|
| **UUID missing** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"houseNumber":"1234",...(all other fields)}'` | `{"ok":false,"errors":[{"field":"uuid","message":"UUID is required"}]}` | Omit uuid field entirely |
| **UUID invalid format** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"too_short","houseNumber":"1234",...}'` | `{"ok":false,"errors":[{"field":"uuid","message":"UUID must be 8–64 alphanumeric characters and hyphens"}]}` | 1–7 chars or invalid chars (e.g., space) |
| **House number empty** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-hnum-empty","houseNumber":"","orientation":"v",...}'` | `{"ok":false,"errors":[{"field":"houseNumber","message":"House number is required"}]}` | Empty string |
| **House number >5 chars** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-hnum-long","houseNumber":"123456","orientation":"v",...}'` | `{"ok":false,"errors":[{"field":"houseNumber","message":"House number must be 1–5 characters"}]}` | 6+ chars |
| **Orientation bad enum** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-orient-bad","houseNumber":"1234","orientation":"x",...}'` | `{"ok":false,"errors":[{"field":"orientation","message":"Orientation must be 'v' (vertical) or 'h' (horizontal)"}]}` | Not v or h |
| **Mounting bad enum** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-mount-bad","houseNumber":"1234","mounting":"pole",...}'` | `{"ok":false,"errors":[{"field":"mounting","message":"Mounting must be 'mailbox', 'existing', or 'newpost'"}]}` | Bad value |
| **Tier bad enum** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-tier-bad","houseNumber":"1234","tier":"blue",...}'` | `{"ok":false,"errors":[{"field":"tier","message":"Tier must be 'green', 'yellow', or 'red'"}]}` | Bad value |
| **Driveway length missing (yellow)** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-dlen-miss","houseNumber":"1234","tier":"yellow","drivewayLengthFt":0,...}'` | `{"ok":false,"errors":[{"field":"drivewayLengthFt","message":"Driveway length is required for yellow and red tiers"}]}` | Omit or zero when tier!=green |
| **Yellow length too short** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-dlen-short","houseNumber":"1234","tier":"yellow","drivewayLengthFt":100,...}'` | `{"ok":false,"errors":[{"field":"drivewayLengthFt","message":"Yellow tier requires 150–1000 feet"}]}` | <150 |
| **Yellow length too long** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-dlen-long","houseNumber":"1234","tier":"yellow","drivewayLengthFt":1100,...}'` | `{"ok":false,"errors":[{"field":"drivewayLengthFt","message":"Yellow tier requires 150–1000 feet"}]}` | >1000 |
| **Red length too short** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-dlen-red-short","houseNumber":"1234","tier":"red","drivewayLengthFt":1000,...}'` | `{"ok":false,"errors":[{"field":"drivewayLengthFt","message":"Red tier requires 1001–20000 feet"}]}` | ≤1000 |
| **Red length too long** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-dlen-red-long","houseNumber":"1234","tier":"red","drivewayLengthFt":25000,...}'` | `{"ok":false,"errors":[{"field":"drivewayLengthFt","message":"Red tier requires 1001–20000 feet"}]}` | >20000 |
| **Full name too short** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-name-short","fullName":"J",...}'` | `{"ok":false,"errors":[{"field":"fullName","message":"Full name must be 2–100 characters"}]}` | 1 char |
| **Address too short** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-addr-short","address":"123 S",...}'` | `{"ok":false,"errors":[{"field":"address","message":"Address must be 5–200 characters"}]}` | <5 chars |
| **Phone digit count** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-phone-short","phone":"555",...}'` | `{"ok":false,"errors":[{"field":"phone","message":"Phone must be 7–15 digits (after removing non-digits)"}]}` | <7 digits after stripping |
| **Email invalid** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-email-bad","email":"notanemail",...}'` | `{"ok":false,"errors":[{"field":"email","message":"Email must be valid (x@y.z format)"}]}` | No @ or . |
| **Notes too long** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-notes-long","notes":"(1001 chars)...",...}'` | `{"ok":false,"errors":[{"field":"notes","message":"Notes must be 1000 characters or fewer"}]}` | >1000 chars |
| **Contact method bad enum** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-contact-bad","contactMethod":"twitter",...}'` | `{"ok":false,"errors":[{"field":"contactMethod","message":"Contact method must be 'text', 'call', or 'email'"}]}` | Invalid enum |
| **In-district attest false** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-attest-false","inDistrictAttest":false,...}'` | `{"ok":false,"errors":[{"field":"inDistrictAttest","message":"You must confirm you live in Yorktown Heights"}]}` | Must be true |
| **Donation choice bad enum** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-don-bad","donationChoice":"99",...}'` | `{"ok":false,"errors":[{"field":"donationChoice","message":"Donation choice must be '0', '10', '25', '50', or 'other'"}]}` | Invalid value |
| **Donation other out of range (low)** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-don-other-low","donationChoice":"other","donationOther":0,...}'` | `{"ok":false,"errors":[{"field":"donationOther","message":"Custom donation must be 1–10000"}]}` | <1 or 0 when choice="other" |
| **Donation other out of range (high)** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"test-don-other-high","donationChoice":"other","donationOther":10001,...}'` | `{"ok":false,"errors":[{"field":"donationOther","message":"Custom donation must be 1–10000"}]}` | >10000 |

#### Special Cases

| Case | Curl | Expected Response | Sheet Effect | Notes |
|---|---|---|---|
| **Honeypot filled** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"honeypot-test","houseNumber":"1234",...,"contact_website":"https://spam.com",...}'` | `{"ok":true,"orderId":"YH-XXXXXX","lineItems":[...2 dummy items...],"signsTotal":54.91,"donation":0,"totalDue":54.91}` — a fake success whose order ID is random and whose shape matches a real success exactly | No row in Orders; one row appended to **Quarantine** sheet (Timestamp, Reason "Honeypot field filled", raw payload). | Indistinguishable from success to a bot; only the department sees the Quarantine row |
| **elapsedMs gate (too fast)** | `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"fast-submit","houseNumber":"1234",...,"elapsedMs":1000,...}'` | `{"ok":false,"errors":[{"field":"","message":"Please try again."}]}` | No row in Orders; one row appended to **Quarantine** ("Elapsed time below minimum"). | Submission in <5 sec; the gate returns an honest generic error (unlike the honeypot's fake success) because autofill/back-forward-cache can trigger this for real people. |
| **UUID idempotency (replay)** | Submit same UUID twice with 5–10 sec gap: 1) `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"idempotent-001",...}'` 2) Repeat same command | First: `{"ok":true,"orderId":"YH-xxxxxx",...}`. Second: Same response. | One row in Orders with same Order ID from cache; no duplicate. | Cache TTL 6 hours; server replays cached success; client sees consistent order ID. |
| **Email+address dedupe (10 min window)** | Submit with same email+address but different uuid within 10 min: 1) `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"dedupe-001","fullName":"Jane Doe","email":"jane@example.com","address":"123 Example Rd, Yorktown Heights, NY 10598",...}'` 2) `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"dedupe-002","fullName":"Jane Doe","email":"jane@example.com","address":"123 Example Rd, Yorktown Heights, NY 10598",...}'` | First: `{"ok":true,"orderId":"YH-xxxxxx",...}`. Second: `{"ok":false,"errors":[{"field":"","message":"We already received an order for this name and address in the last few minutes. If that was you, no action is needed — otherwise please try again shortly."}]}` | First row appended; second submission rejected; no second row. | Prevents double-orders from auto-submit or accidental resubmit. |
| **Throttle (16 requests in 10 min)** | Submit 16 unique UUIDs + distinct emails in rapid sequence (~1 per sec). After 15th: passes. 16th: `curl -X POST "$EXEC" -H "Content-Type: text/plain;charset=utf-8" --data '{"uuid":"throttle-016",...}'` | First 15: `{"ok":true,...}`. 16th: `{"ok":false,"errors":[{"field":"","message":"We're receiving a lot of orders — please try again in a few minutes."}]}` | First 15 rows in Orders; 16th rejected. | Global throttle ~15/10 min via LockService+CacheService; no Quarantine entry. |

#### Health Check (GET)

| Case | Curl | Expected Response | Notes |
|---|---|---|---|
| **GET health** | `curl "$EXEC"` | `{"ok":true,"service":"yhec1-911-signs","version":"1"}` | Confirms Apps Script is deployed and responding. Run before integration tests. |

---

## Phase 3: Post-Deploy Acceptance

See [docs/SETUP.md](SETUP.md) for the final checklist:
1. Deploy Apps Script to Google Workspace account; note the `/exec` endpoint.
2. Paste endpoint into `js/config.js` (remove `?mock=1` from live URL).
3. Enable GitHub Pages on this repo (set source to main branch or /docs).
4. Run Phase 1 (local UI) against the live origin (not localhost).
5. Run Phase 2 (curl matrix) against the deployed `/exec` endpoint.
6. Send test order through portal and verify email delivery to department and resident.
7. Confirm order row in Orders sheet with Status=New, Email Status=pending.
8. Run `setupCheck()` in Apps Script to confirm all config fields are set.

Once all checks pass, the portal is live for residents.
