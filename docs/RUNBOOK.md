# Runbook — YHEC1 911 Sign Order Portal

**Who this is for:** whoever processes incoming 911-sign orders day-to-day. No coding knowledge needed — this is a step-by-step guide for working the `Orders` tab in the department Google Sheet.

If the portal isn't set up yet, use `docs/SETUP.md` first. This document assumes setup is already done.

---

## 1. How an order moves through the system

Every order starts life on the `Orders` tab with **Status = `New`** and moves through these stages, in order, as you work it. Update the **Status** column (and the related columns noted below) each time you move an order forward.

| Status | What it means | What you do before moving to this status |
|---|---|---|
| **New** | Order just came in through the website. Nobody has looked at it yet. | Nothing yet — this is the starting point. |
| **Contacted** | You've reached out to the resident. | Call, text, or email the resident (using their **Preferred Contact** column) to: (1) **verify the house number reading** out loud with them — read it back digit by digit; (2) **confirm the exact total due, including shipping**, quoted from the actual vendor shopping cart (the website's estimate does not include shipping); (3) if it's a **shared/common driveway**, use the call to gather what you need (which mailbox is whose, layout at the road) and then **the department decides and records** the **Arrow Direction (dept)** column (left or right) before ordering — this is a department decision, not the resident's call. |
| **Ordered** | You've placed the individual order with the sign vendor. | Place the order using the **Vendor Order Helper recipe** (Section 3 below) — one order per resident, no bulk ordering. Record the **Actual Vendor Total $ (dept)** column with what you actually paid, including shipping. |
| **Installed** | The sign(s) have been physically installed. | Confirm installation happened (crew report, photo, or your own visit). |
| **Paid** | Cash or check has been collected from the resident. | Record the **Donation Received $ (dept)** column with the actual amount collected (may differ from what they pledged online). |

**Move statuses in order.** Don't skip from `New` straight to `Ordered` — the `Contacted` step is what catches wrong house numbers and missing shipping costs before money is spent.

---

## 2. Reading the Orders sheet

Each row is one order. Columns you'll touch most as you work an order:

- **Status** — set this by hand as you move the order through the stages above.
- **House Number**, **Tier Color**, **Orientation**, **Driveway Ft**, **Marker Texts**, **Arrow Sign**, **Mounting**, **Post Included**, **Shared With Numbers** — what to actually order/install. Don't edit these; they're the resident's original submission. **Marker Texts** is empty unless the resident opted into the blue relay markers (offered on the red tier only).
- **Arrow Direction (dept)** — blank until you set it during the **Contacted** step (only relevant when **Arrow Sign** is checked).
- **Full Name**, **Property Address**, **Phone**, **Email**, **Preferred Contact** — how to reach the resident.
- **Est Signs+Hardware $**, **Donation Pledged $**, **Est Total Due $** — what the *website* estimated. These are placeholders, not final — shipping isn't included.
- **Actual Vendor Total $ (dept)** — you fill this in during **Ordered**.
- **Donation Received $ (dept)** — you fill this in during **Paid**.
- **Placement Notes** — the resident's own notes about where/how to place the sign(s); the install crew needs this at the **Installed** step.
- **Internal Notes** — free text for anything unusual. The system itself writes a note here automatically when a 5-digit house number is on a vertical sign (a tight fit) — look out for `⚠ 5-character house number on vertical sign` and double check that sign will actually fit before ordering.
- **Email Status** — automatic; shows whether the confirmation emails sent successfully. You shouldn't need to touch this.

**Never rename the `Orders` or `Quarantine` tabs.** The script that runs the website looks for those tab names exactly — renaming either one will break the site silently (orders will still submit, but nothing will show up where you're looking).

---

## 3. Vendor Order Helper recipe (for the "Ordered" step)

Use this each time you place an individual vendor order (trafficsign.com). Every order is placed **one resident at a time** — no combining multiple residents into one cart.

1. Confirm what to order from the row: **Tier Color**, **Orientation**, **Mounting**, **Post Included**, **Marker Texts**, and **Arrow Sign** + **Arrow Direction (dept)**.
2. Add to the vendor cart:
   - **Vertical address sign (green/red tiers):** product **49961** ("with Border – Numbers Only") — 6×18, 4" characters, Diamond Grade, double-sided, .063", **No Holes**, no graffiti film. About $34.91. (Max 4 characters at 4" — this is why 5-digit house numbers get the warning above.)
   - **Horizontal address sign (green/red tiers):** product **49965** ("with Border – Numbers Only") — 18×6, 4" characters, Diamond Grade, double-sided, .063", No Holes, no film. About $34.91. (Max 8 characters at 4".)
   - **YELLOW address sign (tier 2 only):** the bordered products above have **no yellow** — use the non-border products instead: **8349** (vertical) or **8348** (horizontal), color **Yellow Reflective** (black characters), same size/material options, about $34.91. Yellow signs have no border — that's expected.
   - **Mounting bracket** — **always add one**: **Wing Bracket, Item Y3518** (2⅛×4¼", flag-style, ~$8.24) from the U-Channel Posts & Hardware section.
   - **Sign post** — **only if Post Included is checked** (i.e. **Mounting** = new post): **8-foot U-channel post, 1.12 lbs/ft, green enamel** (~$37.80), same catalog section.
   - **Blue relay marker(s):** product **49961** in blue, with the text from **Marker Texts** (e.g. "1000", "2000"). About $34.91 each. **Only order these if Marker Texts has values** — markers are an optional add-on that only red-tier residents are offered, and many will decline. An empty Marker Texts cell means none were ordered; it is not something to chase down.
   - **Green arrow sign** (only if **Arrow Sign** is checked): product **49977** ("with Border – Numbers and Arrow") — 18×6, 4" characters, **single-sided**, Diamond Grade, .063", No Holes, no film. About $29.98. Use the direction the department already set in **Arrow Direction (dept)** during the Contacted step.

     ⚠ This product has **two separate arrow settings** and you must set both:
     1. **Sign Color** — the color list is doubled into "LEFT ARROW – Green…" and "RIGHT ARROW – Green…". This picks which **side of the sign** the arrow sits on. Choose the green entry on the side that matches the turn.
     2. **Arrow** — a separate control for which way the arrow **points**: Left, Right, Up, Down, or one of four diagonals.

     For a normal driveway split, left-side placement with a left-pointing arrow (or right/right) is what you want. Diagonals are useful when the split is at an angle.
3. Before checking out, note the **cart's exact total including shipping** — this is the number you should have already confirmed with the resident during **Contacted**. If it doesn't match what you told them, contact them again before ordering.
4. Complete the vendor checkout (the purchaser pays online, including shipping).
5. Back in the Sheet, set **Status = Ordered** and fill in **Actual Vendor Total $ (dept)** with the real total you just paid.

---

## 4. Updating prices

Vendor prices change occasionally. When they do, you must update the price **in two places** — they don't sync automatically:

1. **`js/config.js`** — the `prices: { sign, bracket, post, marker, arrow }` object. This is what the live website shows to residents as an estimate.
2. **`Code.gs`** — the `CONFIG` block's price object near the top (`Extensions → Apps Script` from the Sheet). This is what the server actually uses to calculate order totals and emails — it's the authoritative number.

**Update both, with the same numbers, at the same time.** If they drift apart, residents will see one estimate on the site and get a different one in their confirmation email. While you're in `js/config.js`, also update the `pricesAsOf` text (e.g. change it to today's date) so it's clear at a glance when prices were last confirmed with the vendor — it's easy to forget and it goes stale silently.

After editing `Code.gs`, follow the redeploy rule below (Section 5) to make the change live. After editing `js/config.js`, commit/push it the same way you edited it during setup (GitHub web editor or your developer) — no redeploy step needed for that file, it takes effect as soon as GitHub Pages republishes (usually within a minute or two).

---

## 5. Redeploying the script — **read this before touching Deploy**

> ## ⚠️ Never click "New deployment" again after initial setup.
> ## Always use **Deploy → Manage deployments → (pencil/edit icon) → New version**.

Here's why this matters: the live `/exec` URL that's saved in `js/config.js` only keeps working if you edit the **existing** deployment. Clicking **New deployment** creates a brand-new URL, which means the website (still pointing at the old URL) stops working until someone updates `js/config.js` again — an outage that's easy to avoid.

**Correct steps whenever you've changed anything in `Code.gs`** (e.g. updated prices per Section 4, or any other script fix):

1. Open the Sheet → **Extensions → Apps Script**.
2. Make your code edit and save (floppy-disk icon or Ctrl+S / Cmd+S).
3. Click **Deploy** (top-right) → **Manage deployments**.
4. **[Screen: "Manage deployments" dialog]** — you'll see your existing Web app deployment listed with a pencil/edit icon next to it. Click that pencil icon.
5. **[Screen: "Edit deployment" dialog]** — next to "Version," change the dropdown from the current version to **New version**.
6. Add a short description of what changed (e.g. "Updated marker price to $32").
7. Click **Deploy**.
8. Click **Done**.

The `/exec` URL stays exactly the same — nothing needs to change in `js/config.js`. Confirm it worked by visiting the `/exec` URL in a browser tab; you should still see `{"ok":true,...}`.

---

## 6. Order volume note

The system can handle roughly **50 order-confirmation emails per day** before hitting Google's sending limits. In practice this volume is very unlikely to be reached for this project — a typical day sees a handful of orders at most. If order volume ever climbs anywhere close to that (e.g. a townwide push), it's worth flagging to your developer, but it's not something you need to actively watch for.

---

## 7. Turning on Venmo / PayPal later

Right now the confirmation page and emails only mention cash/check collected at installation. If the department later wants to accept Venmo or PayPal:

1. Get the department's Venmo link (e.g. `https://venmo.com/u/YourDeptHandle`) and/or PayPal.me link.
2. Open `js/config.js` (GitHub web editor, same as Step 6 of `SETUP.md`).
3. Fill in the `venmoUrl` and/or `paypalUrl` fields with those links (inside the quote marks).
4. Commit the change. Once GitHub Pages republishes, the success panel and confirmation emails will automatically start showing the link(s) — no other change needed.

Leave a field blank (`""`) to keep that option hidden.

---

## 8. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Resident sees a red error list on the form and can't submit | Usually a required field is missing or invalid (the form tells them which one). If the message instead mentions "receiving a lot of orders," the system's short-term order limit was briefly hit. | For a field error: have the resident re-read the highlighted field; if it seems wrong for a valid entry, note the exact field/message and pass it to your developer. For "receiving a lot of orders": this is temporary — wait a few minutes and have them resubmit. |
| Resident says they never got a confirmation email | Spam/junk folder (most common); or their email address was mistyped; or the department's email sending limit was temporarily hit | Ask them to check spam first. Check the row's **Email Status** column in the Sheet — if it shows a failure, resend manually by emailing them the order details yourself, and note it in **Internal Notes**. |
| No row appeared in the Sheet after a resident says they submitted | The order may have landed on the **Quarantine** tab instead (this happens if a hidden anti-spam field was filled in, which usually means an automated bot, not a real person) — or the site's endpoint URL is stale/broken | Check the **Quarantine** tab. If nothing there either, test the `/exec` URL directly in a browser (should show `{"ok":true,...}` — see Section 9 below if it doesn't). |
| You receive a "PORTAL ERROR" email | The script hit an unexpected problem while processing an order and is emailing you the raw order details as a safety net so nothing gets lost | Read the email — it contains everything the resident submitted. Manually add a row to the **Orders** tab with that information (Status: `New`), and forward the error email to your developer so the underlying bug gets fixed. |
| The saved `/exec` endpoint URL is lost / nobody knows what it is anymore | Nobody wrote it down after setup, or it's ambiguous which deployment is live | Open the Sheet → **Extensions → Apps Script** → **Deploy → Manage deployments**. The active Web app deployment's URL is listed there — copy it, confirm it in a browser tab, and update `js/config.js` if it doesn't match what's currently there. Then write it down somewhere durable this time. |

---

## Quick reference

- **Redeploy rule:** Manage deployments → edit (pencil) → New version. **Never** "New deployment."
- **Never rename** the `Orders` or `Quarantine` tabs.
- **Prices live in two places** (`js/config.js` and `Code.gs` `CONFIG`) — keep them identical.
- **Always confirm the total with the resident, including shipping,** before placing the vendor order — the website's number is an estimate only.
- **One vendor order per resident** — never combine orders in one cart.
