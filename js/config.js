/* ============================================================
   EDIT HERE — Portal settings for volunteers (no coding needed)
   ============================================================
   This file controls prices, the order-submission address, and a
   couple of links. To change something:

   1. Open this file in any text editor (even Notepad/TextEdit).
   2. Find the line you want to change below.
   3. Change ONLY the text between the quotes " " (or the number),
      and don't delete any commas, colons, or curly braces { }.
   4. Save the file. That's it — the live site picks it up on the
      next page load. No other file needs to change.

   WHAT EACH SETTING DOES:

   - endpoint: the web address the order form sends orders to.
     This is the "Web app URL" you get after deploying the Apps
     Script (Code.gs) as a Web App. Paste it between the quotes,
     e.g. "https://script.google.com/macros/s/AKfycb.../exec".
     Leave it as "" (empty quotes) to run the site in TEST MODE,
     where orders are never actually sent anywhere — useful for
     trying the form out safely.

   - prices: what we charge per item, in dollars (cents allowed, e.g.
     34.91). These must stay in sync with the PRICES block at the top
     of apps-script/Code.gs — when you change one, change the other.
     sign/marker/arrow are real trafficsign.com configurator prices;
     bracket and post are placeholders until the department picks its
     mounting hardware.

   - pricesAsOf: a plain-English note about where the prices came
     from / how current they are. Shown to reassure residents the
     numbers are real. Update the text whenever you update prices.

   - donationTiers: the quick-pick donation amounts. NOTE: these
     amounts (0/10/25/50 plus "Other") are also fixed in the page and
     in the server code — editing this list alone will NOT change the
     buttons. Ask the developer if the department wants different
     amounts; the one thing you can safely change here is which
     amount starts selected (defaultDonation below).

   - defaultDonation: which donation amount is pre-selected when the
     form first loads. Must be one of: 0, 10, 25, 50.

   - venmoUrl / paypalUrl: if you have a Venmo or PayPal link for
     donations, paste it between the quotes and it will show on the
     confirmation screen. Leave as "" to hide it.

   - contactFallback: a phone number or email shown as a backup way
     to reach us if an order can't be confirmed automatically (for
     example "info@yorktownfire.org" or "(914) 555-0100"). Leave as
     "" to hide this line.
   ============================================================ */

window.PORTAL_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbxHQeA3_Zvi1_UzIE-OWr3WDy93xHnHmmYJvREMof9YPKSlh_HLmMg0Y6uNvd0SlX8D/exec",                      // Apps Script /exec URL. "" => mock mode. ?mock=1 also forces mock.
  prices: { sign: 34.91, bracket: 8.24, post: 37.80, marker: 34.91, arrow: 29.98 },  // EDIT HERE — keep in sync with Code.gs PRICES
  pricesAsOf: "trafficsign.com prices as of Aug 19, 2026",
  donationTiers: [0, 10, 25, 50],    // "Other" is always appended
  defaultDonation: 25,
  venmoUrl: "",                      // when non-empty, success panel shows the link
  paypalUrl: "",
  contactFallback: ""                // shown on the "couldn't confirm" panel, e.g. an email/phone; "" hides
  // Department name and website are written directly into index.html —
  // they are not settings here.
};
