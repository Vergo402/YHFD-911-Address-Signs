# Setup Guide — YHEC1 911 Sign Order Portal

**Who this is for:** a volunteer with no coding background who has been asked to get the online 911-sign order form working for Yorktown Heights Engine Co. No. 1.

**Time needed:** about 30–45 minutes, done once. You will not need to touch this again unless something breaks (see `RUNBOOK.md` for day-to-day use).

**Before you start**, make sure you have:

- [ ] A Google account for the department (Gmail/Google Workspace). If the department doesn't have one yet, ask an officer — you need to be able to log into it.
- [ ] A few minutes where you can sit at a computer (not a phone) with a web browser.
- [ ] The web address of this project's code (ask whoever gave you this document — usually a GitHub link).

You'll click through some scary-looking Google warning screens in Step 4. That's expected and explained below — don't panic, and don't stop.

---

## Step 1 — Log into the department Google account

1. Open a web browser (Chrome, Safari, Edge — any is fine).
2. Go to `google.com` and sign in with the **department's** Google account (not your personal one). Everything from here on happens inside that account, because the order sheet and the emails it sends will belong to the department, not to you personally.

**[Screen: Google sign-in]** — the familiar "Sign in" box asking for an email address, then a password. Enter the department's email and password.

---

## Step 2 — Get the Order Sheet into the department's Google Drive

There are two ways to do this. Try **Path A** first — it's faster. Only use **Path B** if you were not given a template link.

### Path A (preferred): Copy the template Sheet

1. Open the template Google Sheet link you were given.
2. **[Screen: Google Sheets, view-only]** — a spreadsheet opens. Across the very top you'll see the file name, and below the menu bar you may see a yellow or gray strip saying you're viewing a shared file.
3. Click **File** (top-left menu) → **Make a copy**.
4. **[Screen: "Copy document" dialog]** — a small box appears asking for a name and where to save it. Rename it something like `YHEC1 911 Sign Orders`, make sure "Folder" is a location in the department's own Drive, and click **Make a copy**.
5. A new tab opens with your own copy of the Sheet. **This copy already has the script attached — you do not need to add any code.** Skip ahead to Step 3.

### Path B (fallback): Build the Sheet from scratch

Only do this if you weren't given a template to copy.

1. Follow `docs/SHEET.md` in this project to create a blank Google Sheet with the correct tab names and column headers. Do this step carefully — the column order matters.
2. With that new Sheet open, click **Extensions** (top menu) → **Apps Script**.
3. **[Screen: Apps Script editor]** — a new tab opens, mostly gray, with a code-editing panel in the middle showing a file named `Code.gs` (probably empty or with placeholder text like `function myFunction() {}`).
4. Select all the existing text in that editor (click inside it, then press Ctrl+A on Windows or Cmd+A on Mac) and delete it.
5. Open the file `apps-script/Code.gs` from this project (ask the developer for it, or find it in the GitHub repository), select all its contents, and copy them.
6. Paste the copied code into the empty Apps Script editor.
7. Click the **save icon** (looks like a floppy disk) near the top-left of the Apps Script editor, or press Ctrl+S / Cmd+S.

---

## Step 3 — Edit the settings at the top of the script

1. If you're not already there, open the Sheet and go to **Extensions → Apps Script**.
2. **[Screen: Apps Script editor, `Code.gs` open]** — near the very top of the code you'll see a block clearly labeled with something like `CONFIG` and comments such as `// EDIT HERE`. Everything else below it you can leave alone.
3. Find the line for the department's email address (something like `DEPT_EMAIL: "..."`) and replace the placeholder with the real department email — this is where new-order notifications will go. Use quotes exactly as shown, just change the text inside them.
4. Find the price list (something like `PRICES: { sign: 34.91, bracket: 8.24, post: 37.80, marker: 34.91, arrow: 29.98 }`) and confirm each number matches what the department is currently charging for each item. If a vendor price has changed, update the number here — **note:** you must also update the matching numbers in `js/config.js` later (see `RUNBOOK.md` for how to keep both in sync going forward).
5. Save again (floppy-disk icon or Ctrl+S / Cmd+S).

---

## Step 4 — Run the one-time setup check and approve the script

This step connects the script to the department's Gmail and Sheet so it's allowed to send emails and write rows. Google shows a security warning for any script you haven't approved before — this is normal for a script you wrote/pasted yourself, even though it looks alarming.

1. In the Apps Script editor, look at the toolbar just above the code — there's a **dropdown** (it may say "Select function") and a **Run** button (▷).
2. Click the function dropdown and choose **`setupCheck`**.
3. Click **Run** (▷).
4. **[Screen: "Authorization required" dialog]** — a popup titled "Authorization required" appears, explaining the script needs your permission. Click **Review permissions**.
5. **[Screen: Choose an account]** — pick the same department Google account you're already logged into.
6. **[Screen: "Google hasn't verified this app"]** — a warning page appears with a triangle/exclamation icon and the heading **"Google hasn't verified this app."** This is expected: it's your own script, on your own department's account, and Google shows this for any personal/custom script that hasn't gone through Google's app-store review. It is **not** a sign anything is wrong.
   - Click **Advanced** (small gray link, usually bottom-left).
   - Click **Go to [project name] (unsafe)** — the word "unsafe" here just means "unreviewed by Google," not "dangerous." You wrote this script yourself.
7. **[Screen: Permission list]** — a list appears showing what the script can do (e.g., "See, edit, create, and delete your Google Sheets spreadsheets," "Send email as you"). Click **Allow**.
8. You're returned to the Apps Script editor. At the bottom, an **Execution log** panel opens showing the result of `setupCheck()`. Look for a success message (no red error text). If you see red error text, re-check Step 3 (make sure `DEPT_EMAIL` is a real address in quotes) and run `setupCheck` again.

---

## Step 5 — Publish the script as a Web App

This creates the web address the order form will send orders to.

1. In the Apps Script editor, click the blue **Deploy** button (top-right) → **New deployment**.
2. **[Screen: "New deployment" dialog]** — click the gear icon ⚙ next to "Select type" and choose **Web app**.
3. Fill in the fields:
   - **Description:** something like `v1 initial deploy` (helps you tell versions apart later).
   - **Execute as:** **Me** (your department account).
   - **Who has access:** **Anyone**.
4. Click **Deploy**.
5. **[Screen: Authorize access, if it reappears]** — if you're asked to authorize again, repeat the "Advanced → Go to ... (unsafe) → Allow" steps from Step 4.
6. **[Screen: "Deployment created"]** — a box appears with a **Web app URL** ending in `/exec`. Click the **copy icon** next to it, or select and copy the whole URL manually. **Save this URL somewhere safe** (a notes app, an email to yourself) — you'll need it in Step 6 and it does not change as long as you follow the redeploy rule in `RUNBOOK.md`.
7. Click **Done**.

### Confirm the URL works

1. Open a **new browser tab** and paste the `/exec` URL you just copied, then press Enter.
2. **[Screen: plain text/JSON in browser]** — you should see a short line of text like:
   `{"ok":true,"service":"yhec1-911-signs","version":"1"}`
   That confirms the script is live and reachable. If you instead see a Google error page, go back to Step 5 and re-check "Who has access" is set to **Anyone**.

---

## Step 6 — Point the website at your Web App URL

The order form (the actual public web page) needs to know the address from Step 5. There are two ways to do this — pick whichever is easier for you.

### Option 1: Tell the developer

Send the `/exec` URL from Step 5 to whoever set up the GitHub Pages site for you, and ask them to put it into `js/config.js`. They'll paste it into a line that currently looks like:

```js
endpoint: "",
```

turning it into:

```js
endpoint: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

### Option 2: Edit it yourself in GitHub's web editor

1. Go to the project's GitHub repository page in your browser (ask for the link if you don't have it).
2. Navigate into the `js` folder and click on `config.js`.
3. **[Screen: GitHub file view]** — you'll see the file's code with a **pencil icon** (Edit) near the top-right.
4. Click the pencil icon.
5. **[Screen: GitHub text editor]** — find the line that says:
   ```js
   endpoint: "",
   ```
   Click right between the two quote marks and paste your `/exec` URL from Step 5, so it reads:
   ```js
   endpoint: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
   Be careful not to delete the quote marks or the comma at the end of the line.
6. Also double check the price numbers on the `prices:` line match what's in the script's `CONFIG` (Step 3.4).
7. Scroll to the bottom. **[Screen: "Commit changes" panel]** — add a short message like `Set live order endpoint`, make sure **"Commit directly to the main branch"** is selected, and click **Commit changes**.
8. Give it a minute or two — GitHub Pages needs a short time to republish the site after any change.

---

## Step 7 — Submit one real test order

1. Open the live site (the GitHub Pages web address for the order form) in a browser.
2. Fill out the form as if you were a resident: house number, sign style, mounting, contact info, etc. Use your own name/email/phone so you can check the results below.
3. Check the box confirming you're in-district, and click **Place my order**.
4. **[Screen: success panel on the order form]** — after a short "Sending…" moment, the form should be replaced by a confirmation panel showing an order ID (like `YH-8F3K2Q`), the items and prices, and next-step info. If instead you see a red error list, note what it says — it will point to which field needs fixing. If you instead see a banner saying **"TEST MODE — order not sent"**, the site is still running in mock mode — that means `js/config.js`'s `endpoint` field is still blank (or you appended `?mock=1` to the URL); go back to Step 6 and confirm the endpoint URL was actually saved and published.
5. Go back to the department's Google Sheet (the one from Step 2) and confirm:
   - [ ] A new row appeared on the `Orders` tab with your test order's details.
   - [ ] The **Status** column says `New`.
6. Check the department email inbox:
   - [ ] A "New 911 sign order..." email arrived with your test order's details.
7. Check the email address you used on the test order:
   - [ ] A "We received your 911 address sign order..." confirmation email arrived.
8. If all three of those happened, everything is working. If any are missing, see the troubleshooting table in `RUNBOOK.md`.
9. Optional cleanup: on the `Orders` tab, you can delete your test row once you've confirmed everything worked, so it doesn't get mistaken for a real order.

---

## Setup acceptance checklist

Copy this list somewhere (email, notebook) and check it off before telling the department the portal is live:

- [ ] Order Sheet exists in the department's Google Drive (Path A copy, or Path B build + pasted `Code.gs`).
- [ ] `CONFIG` block in `Code.gs` has the real `DEPT_EMAIL` and confirmed prices.
- [ ] `setupCheck()` ran successfully with no red error text.
- [ ] Web app deployed with **Execute as: Me**, **Who has access: Anyone**.
- [ ] Visiting the `/exec` URL directly in a browser shows `{"ok":true,...}`.
- [ ] `js/config.js` `endpoint` field is set to that `/exec` URL (confirmed via developer or GitHub web editor).
- [ ] **`js/config.js` `contactFallback` is set to a real phone number or email.** This is the number a resident is shown when a submission fails. Left empty, they are told to "contact us" with no way to do it — at the one moment it matters most.
- [ ] `js/config.js` prices match `Code.gs` prices.
- [ ] **Weekly check email set up** (see "Weekly check email" below) and a first run sent successfully.
- [ ] Confirmed the live site does **not** show a yellow "TEST MODE" banner. If it does, `endpoint` is still empty and no order will reach you.
- [ ] One full test order was submitted on the **live site** (not test mode) and produced: a new Sheet row, a department email, and a resident confirmation email.
- [ ] Test row removed from the `Orders` tab (optional but tidy).
- [ ] The saved `/exec` URL is stored somewhere safe in case it's needed again (see `RUNBOOK.md` for what to do if it's lost).

---

## Weekly check email

Set this up once. It emails the department a short summary every week: how many
orders came in, and what is waiting on you.

Its real purpose is not the summary. It is to make **silence** noticeable. If the
portal ever breaks — a bad redeploy, a revoked account, a fault on the website —
orders simply stop arriving, which looks exactly like a quiet week. Nobody
notices for months. If this email stops arriving, something is wrong.

1. In the Sheet, go to **Extensions → Apps Script**.
2. In the left sidebar, click the **clock icon** (Triggers).
3. Click **+ Add Trigger** (bottom right).
4. Set the four dropdowns:
   - Choose which function to run: **weeklyHeartbeat**
   - Which runs at deployment: **Head**
   - Select event source: **Time-driven**
   - Select type of time based trigger: **Week timer** → pick a day and an hour
     (Monday morning works well)
5. **Save.** You may be asked to approve permissions again — approve them.
6. Test it now rather than waiting a week: back in the editor, choose
   **weeklyHeartbeat** from the function dropdown and click **Run**. Check the
   department inbox for a mail titled "YHEC1 sign portal — weekly check".

If that email arrives, you are done. Tell whoever watches the department inbox
what it is, and that its absence is the alarm.

You're done. Hand off `RUNBOOK.md` to whoever will process orders day-to-day.


---

## Appendix — Sheet tracker setup (developer, one time)

The Orders tracker is built by two functions in `apps-script/Code.gs`; both are safe to re-run:

1. `setupOrderTracker()` — adds the **Assigned To** column, the follow-through date columns, **Days Waiting**, the dropdowns, the row-tint rules, and builds the **Dashboard** tab.
2. `setupSheetPolish()` — adds the header filter, the **Status** / **Assigned To** slicer buttons, and the member-by-status pivot table on the Dashboard.

Two finishing touches cannot be scripted (Google exposes them only in the Sheets UI) and are done by hand once:

- **Chip dropdowns + colours** — Data → Data validation → open each rule → set *Display style* to **Chip**, and give each status its colour (New pink, Contacted yellow, Ordered blue, Installed teal, Paid green; On Hold / Cancelled stay grey).
- **Slicer columns** — after `setupSheetPolish()` inserts the two slicers, double-click each one and pick its column (Status, Assigned To).
