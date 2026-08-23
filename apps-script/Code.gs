/**
 * YHEC1 911 Sign Portal — Apps Script backend
 * ============================================
 * Paste this whole file into the Apps Script project bound to the
 * department's Google Sheet (Extensions → Apps Script from the Sheet).
 *
 * After pasting:
 *   1. Edit the CONFIG block right below this comment.
 *   2. Run setupCheck() once from the Apps Script editor (select it in the
 *      function dropdown, click Run). The first run will pop an OAuth
 *      consent screen — approve it. This also creates the Orders and
 *      Quarantine tabs (with headers) if they don't exist yet, and sends
 *      a test email to DEPT_EMAIL so you know mail sending works.
 *   3. Deploy → New deployment → Web app. Execute as "Me", access "Anyone".
 *      Copy the /exec URL into config.js's `endpoint`.
 *
 * See docs/CONTRACT.md for the full interface this file implements
 * (sections 3, 5, 6, 8, 9, 10, 11).
 */

// ============ CONFIG — EDIT HERE ============
var CONFIG = {
  DEPT_EMAIL: 'avergo@yorktownfire.org',
  SHEET_ID: '1tid8RXsPQZ3Xw3PMeJmuONGxuhWLlO0Wjps8s5x56C0',   // this Sheet; standalone script opens it by ID
  // Live trafficsign.com prices, 2026-08-19: sign/marker $34.91, arrow (49977)
  // $29.98, Wing Bracket Y3518 $8.24, 8' 1.12lbs/ft green U-channel post $37.80.
  PRICES: { sign: 34.91, bracket: 8.24, post: 37.80, marker: 34.91, arrow: 29.98 },
  SHEET_ORDERS: 'Orders',
  SHEET_QUARANTINE: 'Quarantine',
  // Two limits. The per-email one stops a single source from flooding; the
  // global one is a backstop for the Sheet. The global figure is deliberately
  // well above any believable real-world burst, because a global limit set
  // tight enough to stop one abuser also locks out every other resident.
  THROTTLE: { windowSec: 600, max: 60, perEmailMax: 3, perEmailWindowSec: 3600 },
  MIN_ELAPSED_MS: 5000
};
// ============ END CONFIG ============

// Exact column order for the Orders tab — must match CONTRACT.md section 9.
var ORDERS_HEADERS = [
  'Timestamp', 'Order ID', 'Days Waiting', 'Assigned To', 'Status', 'Payment Status',
  'Payment Type', 'House Number', 'Tier Color', 'Orientation',
  'Driveway Ft', 'Marker Texts', 'Arrow Sign', 'Arrow Direction (dept)', 'Mounting',
  'Post Included', 'Shared With Numbers', 'Full Name', 'Property Address', 'Phone',
  'Email', 'Preferred Contact', 'In-District Attest',
  'Placement Notes', 'Est Signs+Hardware $', 'Donation Pledged $', 'Est Total Due $',
  'Actual Vendor Total $ (dept)', 'Order Payment Received $ (dept)',
  'Donation Received $ (dept)', 'Email Status', 'Internal Notes'
];

// Enum lists shared by validation, Dashboard, and migration.
var ORDER_STATUSES = ['New', 'Contacted', 'Ordered', 'Installed', 'On Hold', 'Cancelled'];
var PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid', 'Waived'];
var PAYMENT_TYPES = ['Cash', 'Check', 'Other'];

// Per-row Days Waiting formula (column C). Written by the server on append
// and backfilled by setupOrderTracker, so moving columns can't break a
// sheet-wide ARRAYFORMULA. Counts up until payment settles (or Cancelled).
function daysWaitingFormula_(row) {
  return '=IF($A' + row + '="","",IF(OR($E' + row + '="Cancelled",$F' + row + '="Paid",$F' + row + '="Waived"),"-",ROUND(NOW()-$A' + row + ')))';
}

var QUARANTINE_HEADERS = ['Timestamp', 'Reason', 'Raw Payload'];

// =====================================================================
// PURE HELPERS
// No Apps Script services (SpreadsheetApp, MailApp, CacheService, etc.)
// are called anywhere below this line down to "END PURE HELPERS" — these
// functions can be copy-pasted into a plain JS test runner / Node and
// unit-tested without a Google account.
// =====================================================================

/**
 * Trims/coerces raw request JSON into the shape every other helper expects.
 * Not one of the required five, but kept pure and separate so validateOrder
 * doesn't have to also do type coercion.
 */
function sanitizeOrder(data) {
  data = data || {};
  var order = {};
  order.uuid = typeof data.uuid === 'string' ? data.uuid.trim() : '';
  order.houseNumber = typeof data.houseNumber === 'string' ? data.houseNumber.trim().toUpperCase() : '';
  order.orientation = data.orientation === 'h' ? 'h' : (data.orientation === 'v' ? 'v' : String(data.orientation || ''));
  order.mounting = String(data.mounting || '');
  order.tier = String(data.tier || '');
  order.drivewayLengthFt = (data.drivewayLengthFt === '' || data.drivewayLengthFt === undefined || data.drivewayLengthFt === null)
    ? null : Number(data.drivewayLengthFt);
  order.wantMarkers = data.wantMarkers === true;
  order.sharedDriveway = data.sharedDriveway === true;
  order.sharedNumbers = typeof data.sharedNumbers === 'string' ? data.sharedNumbers.trim() : '';
  order.fullName = typeof data.fullName === 'string' ? data.fullName.trim() : '';
  order.address = typeof data.address === 'string' ? data.address.trim() : '';
  order.phone = typeof data.phone === 'string' ? data.phone.trim() : '';
  order.email = typeof data.email === 'string' ? data.email.trim() : '';
  order.contactMethod = String(data.contactMethod || '');
  order.inDistrictAttest = data.inDistrictAttest === true;
  order.notes = typeof data.notes === 'string' ? data.notes.trim() : '';
  // Guard against numeric 0 (a valid, falsy donationChoice value) collapsing to ''.
  order.donationChoice = (data.donationChoice === undefined || data.donationChoice === null)
    ? '' : String(data.donationChoice);
  order.donationOther = (data.donationOther === '' || data.donationOther === undefined || data.donationOther === null)
    ? null : Number(data.donationOther);
  order.elapsedMs = Number(data.elapsedMs);
  order.contact_website = typeof data.contact_website === 'string' ? data.contact_website : '';
  return order;
}

/**
 * Whitelist validation per CONTRACT.md section 5. Expects a SANITIZED order
 * (see sanitizeOrder above) — houseNumber already trimmed/uppercased, phone
 * not yet stripped of non-digits (this function does that itself), etc.
 * Returns {errors:[{field,message}]}; empty array = valid.
 *
 * Note: contact_website (honeypot) is intentionally NOT checked here — it's
 * handled earlier in doPost with a fake-success + Quarantine response, not
 * a normal field error, because a real form error would teach bots the
 * field exists.
 */
function validateOrder(order) {
  var errors = [];
  function fail(field, message) { errors.push({ field: field, message: message }); }

  if (!order.uuid || !/^[A-Za-z0-9-]{8,64}$/.test(order.uuid)) {
    fail('uuid', 'Missing or invalid request ID.');
  }

  if (!order.houseNumber || !/^[A-Za-z0-9]{1,5}$/.test(order.houseNumber)) {
    fail('houseNumber', 'Enter a house number, 1-5 letters/numbers.');
  }

  if (order.orientation !== 'v' && order.orientation !== 'h') {
    fail('orientation', 'Choose vertical or horizontal.');
  }

  if (['mailbox', 'existing', 'newpost'].indexOf(order.mounting) === -1) {
    fail('mounting', 'Choose a mounting option.');
  }

  if (['green', 'yellow', 'red', 'unsure'].indexOf(order.tier) === -1) {
    fail('tier', 'Choose a driveway length range.');
  }

  if (order.tier === 'yellow' || order.tier === 'red') {
    var len = order.drivewayLengthFt;
    if (len === null || !isFinite(len) || Math.floor(len) !== len) {
      fail('drivewayLengthFt', 'Enter your driveway length in feet.');
    } else if (order.tier === 'yellow' && (len < 150 || len > 1000)) {
      fail('drivewayLengthFt', 'Driveway length for the yellow tier must be 150–1000 ft.');
    } else if (order.tier === 'red' && (len < 1001 || len > 20000)) {
      fail('drivewayLengthFt', 'Driveway length for the red tier must be 1001–20000 ft.');
    }
  }

  if (order.sharedNumbers.length > 100) {
    fail('sharedNumbers', 'Neighbor house numbers must be 100 characters or fewer.');
  }

  if (order.fullName.length < 2 || order.fullName.length > 100) {
    fail('fullName', 'Enter your full name.');
  }

  if (order.address.length < 5 || order.address.length > 200) {
    fail('address', 'Enter your property address.');
  }

  var phoneDigits = order.phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    fail('phone', 'Enter a valid phone number.');
  }

  if (order.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) {
    fail('email', 'Enter a valid email address.');
  }

  if (['text', 'call', 'email'].indexOf(order.contactMethod) === -1) {
    fail('contactMethod', 'Choose a preferred contact method.');
  }

  if (order.inDistrictAttest !== true) {
    fail('inDistrictAttest', 'You must confirm the property is in the district.');
  }

  if (order.notes.length > 1000) {
    fail('notes', 'Placement notes must be 1000 characters or fewer.');
  }

  if (['0', '10', '25', '50', 'other'].indexOf(order.donationChoice) === -1) {
    fail('donationChoice', 'Choose a donation amount.');
  } else if (order.donationChoice === 'other') {
    var other = order.donationOther;
    if (other === null || !isFinite(other) || Math.floor(other) !== other || other < 1 || other > 10000) {
      fail('donationOther', 'Enter a custom donation amount between 1 and 10000.');
    }
  }

  // Defense in depth — doPost's timing gate normally filters low-elapsedMs
  // requests (as a silent bot signal) before this function ever runs, so
  // this branch is mostly unreachable in the live flow. Kept for unit
  // testability and in case the gate is ever refactored.
  if (!isFinite(order.elapsedMs) || order.elapsedMs < CONFIG.MIN_ELAPSED_MS) {
    fail('', 'Please try again.');
  }

  return { errors: errors };
}

/**
 * CONTRACT.md section 3. Blue relay markers are an OPTIONAL purchase, offered
 * on the red tier only: a marker sits every 1,000 ft, and a yellow-tier
 * driveway (under 1,000 ft) never reaches the first one. One marker per
 * 1,000 ft, minimum 1, capped at 20.
 */
function computeMarkers(tier, lenFt, wantMarkers) {
  if (tier !== 'red' || wantMarkers !== true) return [];
  var count = Math.max(1, Math.floor((lenFt || 0) / 1000));
  if (count > 20) count = 20;
  var markers = [];
  for (var i = 1; i <= count; i++) {
    markers.push(String(i * 1000));
  }
  return markers;
}

/**
 * CONTRACT.md section 3 — exact label text and ordering matter (the dept
 * email, resident email, and Sheet row all read from this array).
 */
function computeLineItems(order, prices) {
  var items = [];
  var orientLabel = order.orientation === 'h' ? 'horizontal' : 'vertical';
  var signLabel;
  if (order.tier === 'unsure') {
    // No colour decided yet — the department measures the driveway first.
    // Every colour costs the same, so the price is still exact.
    signLabel = 'Address sign (' + order.houseNumber + '), ' + orientLabel +
      ', two-sided — color set after we measure';
  } else {
    // The bordered product family has no yellow — tier-2 signs come from the
    // non-border products (8349/8348), so their label must not say "bordered".
    var colorLabel = order.tier.charAt(0).toUpperCase() + order.tier.slice(1);
    var borderWord = order.tier === 'yellow' ? '' : 'bordered ';
    signLabel = colorLabel + ' ' + borderWord + 'address sign (' +
      order.houseNumber + '), ' + orientLabel + ', two-sided';
  }

  items.push({ label: signLabel, amount: prices.sign });

  items.push({
    label: 'Mounting bracket (' + orientLabel + ')',
    amount: prices.bracket
  });

  if (order.mounting === 'newpost') {
    items.push({ label: 'Sign post', amount: prices.post });
  }

  var markers = computeMarkers(order.tier, order.drivewayLengthFt, order.wantMarkers);
  for (var m = 0; m < markers.length; m++) {
    items.push({
      label: 'Blue relay marker "' + markers[m] + '", vertical',
      amount: prices.marker
    });
  }

  if (order.sharedDriveway) {
    items.push({
      label: 'Green arrow sign for the split (horizontal, single-sided)',
      amount: prices.arrow
    });
  }

  return items;
}

function sumAmounts_(lineItems) {
  var total = 0;
  for (var i = 0; i < lineItems.length; i++) total += lineItems[i].amount;
  return roundMoney_(total);
}

/** Dollar prices carry cents; float addition leaks artifacts (34.91*3 =
 *  104.72999...). Every stored or displayed total goes through this. */
function roundMoney_(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** "$35" for whole dollars, "$34.91" otherwise (callers prepend the $). */
function fmtUsd_(n) {
  n = roundMoney_(n);
  return (n % 1 === 0) ? String(n) : n.toFixed(2);
}

/**
 * "YH-" + 6 uppercased alphanumeric chars. Takes a UUID STRING (the caller
 * gets that string from Utilities.getUuid() — this function itself makes
 * no Apps Script calls, so it stays unit-testable).
 */
function makeOrderId(uuidStr) {
  var alnum = String(uuidStr || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  var suffix = (alnum + '000000').slice(0, 6); // pads defensively for short/odd inputs in tests
  return 'YH-' + suffix;
}

/**
 * Builds the 32-element row for the Orders tab (columns A–AF), in the
 * exact order of ORDERS_HEADERS / CONTRACT.md section 9.
 *
 * `order` = sanitized order object (see sanitizeOrder).
 * `derived` = { orderId, lineItems, signsTotal, donation, totalDue,
 *               markers, internalNotes }.
 * `now` = a Date for the Timestamp column.
 */
function buildRow(order, derived, now, assignee) {
  return [
    now,                                                      // Timestamp
    derived.orderId,                                          // Order ID
    '',                                                        // Days Waiting — doPost overwrites with a per-row formula
    assignee || '',                                            // Assigned To — round-robin, '' when member list is empty
    'New',                                                     // Status
    'Unpaid',                                                  // Payment Status
    '',                                                        // Payment Type — set when money changes hands
    order.houseNumber,                                         // House Number
    order.tier,                                                // Tier Color
    order.orientation,                                         // Orientation
    (order.tier === 'yellow' || order.tier === 'red') ? order.drivewayLengthFt : '', // Driveway Ft
    derived.markers.join(', '),                                // Marker Texts
    order.sharedDriveway ? 'Yes' : 'No',                        // Arrow Sign
    '',                                                         // Arrow Direction (dept) — filled in manually
    order.mounting,                                             // Mounting
    order.mounting === 'newpost' ? 'Yes' : 'No',                // Post Included
    order.sharedNumbers,                                        // Shared With Numbers
    order.fullName,                                             // Full Name
    order.address,                                              // Property Address
    order.phone,                                                // Phone
    order.email,                                                // Email
    order.contactMethod,                                        // Preferred Contact
    order.inDistrictAttest ? 'Yes' : 'No',                      // In-District Attest
    order.notes,                                                // Placement Notes
    derived.signsTotal,                                         // Est Signs+Hardware $
    derived.donation,                                           // Donation Pledged $
    derived.totalDue,                                           // Est Total Due $
    '',                                                         // Actual Vendor Total $ (dept) — filled in manually
    '',                                                         // Order Payment Received $ (dept) — filled in manually
    '',                                                         // Donation Received $ (dept) — filled in manually
    'pending',                                                  // Email Status — updated after send attempts
    derived.internalNotes                                       // Internal Notes
  ];
}

// =====================================================================
// END PURE HELPERS
// =====================================================================

// ---------------- HTTP entry points ----------------

function doGet(e) {
  return jsonOut({ ok: true, service: 'yhec1-911-signs', version: '1' });
}

function doPost(e) {
  var rawPayload = '';
  var dedupeKey = null;
  var cache = null;

  try {
    rawPayload = (e && e.postData && e.postData.contents) || '';

    var data;
    try {
      data = JSON.parse(rawPayload);
    } catch (parseErr) {
      return jsonOut({ ok: false, errors: [{ field: '', message: 'Invalid request.' }] });
    }

    // --- Honeypot ---
    // A filled-in contact_website means it's very likely a bot. Give a fake
    // success (so the bot doesn't learn anything useful) and quietly log it.
    // A real person never sees or fills this field, so there's no
    // false-positive risk here — safe to answer with a fake success.
    if (data.contact_website && String(data.contact_website).trim() !== '') {
      safeQuarantine_('Honeypot field filled', rawPayload);
      // The fake success must be indistinguishable from a real one — same
      // ID format (random 6-char suffix) and same response shape — so a bot
      // operator can't fingerprint the trap. Nothing is written to Orders.
      var fakeItems = [
        { label: 'Green bordered address sign (1234), vertical, two-sided', amount: CONFIG.PRICES.sign },
        { label: 'Mounting bracket (vertical)', amount: CONFIG.PRICES.bracket }
      ];
      var fakeTotal = sumAmounts_(fakeItems);
      return jsonOut({
        ok: true,
        orderId: makeOrderId(Utilities.getUuid()),
        lineItems: fakeItems,
        signsTotal: fakeTotal,
        donation: 0,
        totalDue: fakeTotal
      });
    }

    // --- elapsedMs gate ---
    // Unlike the honeypot, this CAN false-positive on a genuine resident —
    // browser autofill, a page restored from back/forward cache with a
    // stale timer, etc. So (per CONTRACT.md section 5's validation table,
    // which lists elapsedMs as a normal whitelist rule rather than
    // annotating it like contact_website's "fake success" case) this
    // returns a real, honest error rather than a silent fake success. It's
    // still logged to Quarantine for the department's own visibility into
    // likely bot traffic, but the caller is told the truth.
    var elapsedCheck = Number(data.elapsedMs);
    if (!isFinite(elapsedCheck) || elapsedCheck < CONFIG.MIN_ELAPSED_MS) {
      safeQuarantine_('Elapsed time below minimum', rawPayload);
      return jsonOut({ ok: false, errors: [{ field: '', message: 'Please try again.' }] });
    }

    // --- Full validation ---
    var order = sanitizeOrder(data);
    var validation = validateOrder(order);
    if (validation.errors.length > 0) {
      return jsonOut({ ok: false, errors: validation.errors });
    }

    cache = CacheService.getScriptCache();

    // --- UUID replay guard (6h) ---
    // If the client retried a request we already fully processed (e.g. a
    // flaky connection made it look like the first attempt failed), just
    // hand back the exact same success response instead of double-booking.
    var uuidKey = 'u_' + order.uuid;
    var cachedSuccess = cache.get(uuidKey);
    if (cachedSuccess) {
      return ContentService.createTextOutput(cachedSuccess).setMimeType(ContentService.MimeType.JSON);
    }

    // --- Email+address dedupe (10 min) ---
    var dedupeHash = md5Hex_(order.email.toLowerCase() + '|' + order.address.toLowerCase());
    dedupeKey = 'd_' + dedupeHash;
    if (cache.get(dedupeKey)) {
      dedupeKey = null; // don't clear someone else's still-valid claim in the catch block below
      return jsonOut({
        ok: false,
        errors: [{ field: '', message: "We already received an order for this name and address in the last few minutes. If that was you, no action is needed — otherwise please try again shortly." }]
      });
    }
    // Claim the slot immediately (before the lock) to shrink the race
    // window where two near-simultaneous requests both see "no entry yet".
    cache.put(dedupeKey, '1', 600);

    // --- Throttle + append, under the script lock ---
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      cache.remove(dedupeKey);
      return jsonOut({
        ok: false,
        errors: [{ field: '', message: "We're receiving a lot of orders — please try again in a few minutes." }]
      });
    }

    var lastRow, derived;
    try {
      // Global throttle counter, bucketed by a fixed wall-clock window
      // (not a true sliding window, but a real "max per windowSec"
      // — unlike a single self-refreshing key, a quiet stretch doesn't
      // get penalized by orders from the previous window).
      // Per-email limit first: one source flooding should degrade its own
      // experience, not everyone's.
      var emailKey = 'te_' + md5Hex_(order.email.toLowerCase()) + '_' +
        Math.floor(Date.now() / 1000 / CONFIG.THROTTLE.perEmailWindowSec);
      var emailCount = Number(cache.get(emailKey) || 0);
      if (emailCount >= CONFIG.THROTTLE.perEmailMax) {
        cache.remove(dedupeKey);
        return jsonOut({
          ok: false,
          errors: [{ field: '', message: "You've placed several orders from this email address already. If you need another sign, please contact us directly so we can help." }]
        });
      }

      var countKey = 'throttle_' + Math.floor(Date.now() / 1000 / CONFIG.THROTTLE.windowSec);
      var current = Number(cache.get(countKey) || 0);
      if (current >= CONFIG.THROTTLE.max) {
        cache.remove(dedupeKey);
        return jsonOut({
          ok: false,
          errors: [{ field: '', message: "We're receiving a lot of orders — please try again in a few minutes." }]
        });
      }
      cache.put(countKey, String(current + 1), CONFIG.THROTTLE.windowSec);
      cache.put(emailKey, String(emailCount + 1), CONFIG.THROTTLE.perEmailWindowSec);

      // Compute — server is authoritative, client totals are never trusted.
      var markers = computeMarkers(order.tier, order.drivewayLengthFt, order.wantMarkers);
      var lineItems = computeLineItems(order, CONFIG.PRICES);
      var signsTotal = sumAmounts_(lineItems);
      var donation = order.donationChoice === 'other' ? order.donationOther : Number(order.donationChoice);
      var totalDue = roundMoney_(signsTotal + donation);
      var orderId = makeOrderId(Utilities.getUuid());
      var internalNotes = (order.houseNumber.length === 5 && order.orientation === 'v')
        ? '⚠ 5-character house number on vertical sign' : '';

      derived = {
        orderId: orderId,
        lineItems: lineItems,
        signsTotal: signsTotal,
        donation: donation,
        totalDue: totalDue,
        markers: markers,
        internalNotes: internalNotes
      };

      var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      var ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
      if (!ordersSheet) {
        ordersSheet = ss.insertSheet(CONFIG.SHEET_ORDERS);
        ordersSheet.appendRow(ORDERS_HEADERS);
      }
      ordersSheet.appendRow(buildRow(order, derived, new Date(), pickAssignee_(ss)));
      lastRow = ordersSheet.getLastRow();
      ordersSheet.getRange(lastRow, 3).setFormula(daysWaitingFormula_(lastRow));

      // Arm the uuid replay guard the moment the row is durable. Anything
      // that fails after this point (emails, status write-back) must NOT
      // turn into a client-facing failure that invites a duplicate retry.
      var successResponse = {
        ok: true,
        orderId: derived.orderId,
        lineItems: derived.lineItems,
        signsTotal: derived.signsTotal,
        donation: derived.donation,
        totalDue: derived.totalDue
      };
      var successJson = JSON.stringify(successResponse);
      cache.put(uuidKey, successJson, 21600); // 6h — CacheService's max TTL
    } finally {
      lock.releaseLock();
    }

    // --- Emails (outside the lock; each attempt is independent) ---
    var deptOk = true, residentOk = true;
    try {
      sendDeptEmail_(order, derived);
    } catch (deptErr) {
      deptOk = false;
    }
    try {
      sendResidentEmail_(order, derived);
    } catch (residentErr) {
      residentOk = false;
    }

    // Best-effort status write-back: the order row already exists and the
    // success response is already cached, so a Sheets hiccup here must not
    // convert a recorded order into an error. Matching on Order ID (not the
    // captured row index) also survives a human sorting/deleting rows in
    // the window since the lock was released.
    try {
      var emailStatus = (deptOk && residentOk) ? 'sent' : (deptOk || residentOk) ? 'partial' : 'failed';
      writeEmailStatus_(derived.orderId, lastRow, emailStatus);
    } catch (statusErr) {
      // swallow — Email Status stays 'pending'; RUNBOOK's troubleshooting covers it
    }

    return ContentService.createTextOutput(successJson).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Something broke after we'd parsed the request. Release any dedupe
    // claim so the resident can legitimately retry, and make sure the
    // department still gets the raw order so it can be entered by hand.
    if (dedupeKey && cache) {
      try { cache.remove(dedupeKey); } catch (ignore) {}
    }
    try {
      MailApp.sendEmail({
        to: CONFIG.DEPT_EMAIL,
        subject: 'PORTAL ERROR — order may need manual entry',
        body: 'An error occurred while processing a 911 sign order submission.\n\n' +
          'Error: ' + (err && err.message ? err.message : err) + '\n\n' +
          (typeof derived !== 'undefined' && derived && derived.orderId
            ? 'Order ID ' + derived.orderId + ' — a row for this order may ALREADY exist in the Orders tab; check before re-entering it.\n\n'
            : '') +
          'Raw payload:\n' + rawPayload
      });
    } catch (mailErr) {
      // Nothing more we can do — surface via the response below.
    }
    return jsonOut({
      ok: false,
      errors: [{ field: '', message: 'Something went wrong — the department has been notified. Please call or email us to confirm your order.' }]
    });
  }
}

// ---------------- Internal helpers (use Apps Script services) ----------------

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function md5Hex_(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, str, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i];
    if (v < 0) v += 256;
    var h = v.toString(16);
    hex += (h.length === 1 ? '0' + h : h);
  }
  return hex;
}

/**
 * Sets the Email Status cell for an order. Looks the row up by Order ID
 * (scanning from the bottom, where recent orders live) and falls back to
 * the row index captured at append time only if the ID isn't found.
 */
function writeEmailStatus_(orderId, fallbackRow, status) {
  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_ORDERS);
  var statusCol = ORDERS_HEADERS.indexOf('Email Status') + 1;
  var idCol = ORDERS_HEADERS.indexOf('Order ID') + 1;
  var last = sheet.getLastRow();
  var row = 0;
  if (last >= 2) {
    var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === orderId) { row = i + 2; break; }
    }
  }
  if (!row) row = fallbackRow;
  sheet.getRange(row, statusCol).setValue(status);
}

function appendQuarantineRow_(reason, rawPayload) {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_QUARANTINE);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_QUARANTINE);
    sheet.appendRow(QUARANTINE_HEADERS);
  }
  sheet.appendRow([new Date(), reason, rawPayload]);
}

/**
 * Quarantine logging is a nice-to-have next to the response it accompanies
 * — never let a Sheets hiccup here turn a fake-success (honeypot) into a
 * real error the bot can learn from, or an elapsedMs rejection into an
 * unhandled crash that emails the raw payload under "PORTAL ERROR".
 */
function safeQuarantine_(reason, rawPayload) {
  try {
    appendQuarantineRow_(reason, rawPayload);
  } catch (ignore) {
    // swallow — the caller's response goes out regardless
  }
}

function sendDeptEmail_(order, derived) {
  var lines = [];
  lines.push('New 911 sign order received.');
  lines.push('');
  lines.push('Order ID: ' + derived.orderId);
  lines.push('');
  lines.push('--- Sign details ---');
  lines.push('House number: ' + order.houseNumber);
  lines.push('Orientation: ' + (order.orientation === 'h' ? 'Horizontal' : 'Vertical'));
  if (order.tier === 'unsure') {
    lines.push('Tier: NOT YET KNOWN — resident asked us to measure the driveway');
  } else {
    lines.push('Tier: ' + order.tier);
    if (order.tier === 'yellow' || order.tier === 'red') {
      lines.push('Driveway length: ' + order.drivewayLengthFt + ' ft (resident estimate)');
    }
  }
  lines.push('Mounting: ' + order.mounting);
  if (order.tier === 'red') {
    lines.push('Blue relay markers: ' + (order.wantMarkers
      ? 'YES — ' + derived.markers.length + ' (' + derived.markers.join(', ') + ')'
      : 'declined by resident'));
  }
  lines.push('Shared/common driveway: ' + (order.sharedDriveway ? 'Yes' : 'No'));
  if (order.sharedDriveway) {
    lines.push('Neighbor house numbers: ' + order.sharedNumbers);
  }
  if (derived.internalNotes) {
    lines.push('NOTE: ' + derived.internalNotes);
  }
  lines.push('');
  lines.push('--- Contact ---');
  lines.push('Name: ' + order.fullName);
  lines.push('Address: ' + order.address);
  lines.push('Phone: ' + order.phone);
  lines.push('Email: ' + order.email);
  lines.push('Preferred contact method: ' + order.contactMethod);
  lines.push('In-district attest: ' + (order.inDistrictAttest ? 'Yes' : 'No'));
  if (order.notes) {
    lines.push('Placement notes: ' + order.notes);
  }
  lines.push('');
  lines.push('--- Line items ---');
  derived.lineItems.forEach(function (item) {
    lines.push('- ' + item.label + ': $' + fmtUsd_(item.amount));
  });
  lines.push('');
  lines.push('Estimated signs+hardware: $' + fmtUsd_(derived.signsTotal));
  lines.push('Donation pledged: $' + fmtUsd_(derived.donation));
  lines.push('Estimated total due: $' + fmtUsd_(derived.totalDue));
  lines.push('');
  lines.push('--- Reminders ---');
  if (order.tier === 'unsure') {
    lines.push('- MEASURE THIS DRIVEWAY FIRST. Set Tier Color in the Orders sheet before ordering — the sign has no colour yet.');
    lines.push('- If it measures over 1,000 ft, offer the optional blue relay markers before ordering.');
  }
  lines.push('- Confirm the exact total, including shipping, before placing the vendor order.');
  if (order.sharedDriveway) {
    lines.push('- Set the Arrow Direction (left/right) in the Orders sheet before ordering the arrow sign.');
  }
  lines.push('- Verify the house number is correct before ordering.');

  MailApp.sendEmail({
    to: CONFIG.DEPT_EMAIL,
    subject: 'New 911 sign order ' + derived.orderId + ' — ' + order.houseNumber + ', ' + order.address,
    body: lines.join('\n'),
    name: 'Yorktown Heights Engine Co. No. 1',
    replyTo: CONFIG.DEPT_EMAIL
  });
}

function sendResidentEmail_(order, derived) {
  var lines = [];
  lines.push('Thank you for your 911 address sign order, ' + order.fullName + '.');
  lines.push('');
  lines.push('Your sign will read: ' + order.houseNumber + " — reply to this email if that's not correct.");
  lines.push('');
  lines.push('--- Order summary ---');
  derived.lineItems.forEach(function (item) {
    lines.push('- ' + item.label + ': $' + fmtUsd_(item.amount));
  });
  lines.push('');
  lines.push('Estimated signs+hardware: $' + fmtUsd_(derived.signsTotal));
  if (derived.donation > 0) {
    lines.push('Donation pledged: $' + fmtUsd_(derived.donation));
  }
  lines.push('Estimated total due: $' + fmtUsd_(derived.totalDue));
  lines.push('');
  lines.push("This is an estimate — we'll confirm your exact total, including shipping, before we place the order.");
  lines.push('');
  lines.push('Payment (cash or check, payable to "Yorktown Heights Engine Co. 1") is collected at installation.');
  if (derived.donation > 0) {
    lines.push('');
    lines.push('Thank you for your donation to support the Yorktown Heights Engine Company #1!');
  }
  lines.push('');
  lines.push('Order ID: ' + derived.orderId);
  lines.push('Next step: we will contact you by ' + order.contactMethod + ' to confirm details.');
  lines.push('');
  lines.push('Thank you for supporting Yorktown Heights Engine Co. No. 1.');

  MailApp.sendEmail({
    to: order.email,
    subject: 'We received your 911 address sign order (' + derived.orderId + ')',
    body: lines.join('\n'),
    name: 'Yorktown Heights Engine Co. No. 1',
    replyTo: CONFIG.DEPT_EMAIL
  });
}

// ---------------- Weekly heartbeat ----------------

/**
 * Emails the department a short weekly summary. Its real job is to make
 * SILENCE detectable: if the portal breaks — bad redeploy, revoked account,
 * a JS error on the site — orders simply stop, which looks exactly like a
 * quiet week. Nobody would notice for months.
 *
 * It deliberately carries useful content (what's waiting on the department)
 * rather than a bare "still alive" ping, because a mail that people actually
 * read is a mail whose absence gets noticed.
 *
 * Set up as a weekly time-based trigger — see docs/SETUP.md.
 */
function weeklyHeartbeat() {
  try {
    var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_ORDERS);
    if (!sheet) {
      MailApp.sendEmail({
        to: CONFIG.DEPT_EMAIL,
        subject: 'YHEC1 sign portal — PROBLEM: Orders tab missing',
        body: 'The weekly check could not find a tab named "' + CONFIG.SHEET_ORDERS + '".\n' +
          'Orders cannot be recorded until that tab exists with its original name.',
        name: 'Yorktown Heights Engine Co. No. 1'
      });
      return;
    }

    var last = sheet.getLastRow();
    var total = Math.max(0, last - 1);
    var recent = 0, waiting = 0, needMeasure = 0, needArrowDir = 0;

    var unpaidInstalled = 0;
    if (last >= 2) {
      // Column positions come from ORDERS_HEADERS so a schema change can't
      // silently skew these counts again.
      var C_TS = ORDERS_HEADERS.indexOf('Timestamp'),
          C_ST = ORDERS_HEADERS.indexOf('Status'),
          C_PS = ORDERS_HEADERS.indexOf('Payment Status'),
          C_TIER = ORDERS_HEADERS.indexOf('Tier Color'),
          C_ARR = ORDERS_HEADERS.indexOf('Arrow Sign'),
          C_ARRD = ORDERS_HEADERS.indexOf('Arrow Direction (dept)');
      var rows = sheet.getRange(2, 1, last - 1, ORDERS_HEADERS.length).getValues();
      var cutoff = new Date().getTime() - 7 * 24 * 60 * 60 * 1000;
      for (var i = 0; i < rows.length; i++) {
        var ts = rows[i][C_TS], status = String(rows[i][C_ST] || ''),
            pay = String(rows[i][C_PS] || ''),
            tier = String(rows[i][C_TIER] || ''), arrow = String(rows[i][C_ARR] || ''),
            arrowDir = String(rows[i][C_ARRD] || '');
        if (ts && ts.getTime && ts.getTime() >= cutoff) recent++;
        var open = (status === 'New' || status === 'Contacted');
        if (open) {
          waiting++;
          if (tier === 'unsure') needMeasure++;
          if (arrow === 'Yes' && !arrowDir.trim()) needArrowDir++;
        }
        if (status === 'Installed' && (pay === 'Unpaid' || pay === 'Partial')) unpaidInstalled++;
      }
    }

    var lines = [];
    lines.push('The 911 sign portal is up and recording orders.');
    lines.push('');
    lines.push('New orders in the last 7 days: ' + recent);
    lines.push('Orders total: ' + total);
    lines.push('');
    lines.push('Waiting on the department: ' + waiting + ' (status New or Contacted)');
    lines.push('Installed but not fully paid: ' + unpaidInstalled);
    if (needMeasure) lines.push('  - ' + needMeasure + ' need the driveway measured (Tier Color is "unsure")');
    if (needArrowDir) lines.push('  - ' + needArrowDir + ' need an Arrow Direction set before ordering');
    lines.push('');
    lines.push('If this email ever stops arriving, assume the portal is broken and check it — ');
    lines.push('a silent portal looks exactly like a quiet week.');

    MailApp.sendEmail({
      to: CONFIG.DEPT_EMAIL,
      subject: 'YHEC1 sign portal — weekly check (' + recent + ' new, ' + waiting + ' waiting)',
      body: lines.join('\n'),
      name: 'Yorktown Heights Engine Co. No. 1',
      replyTo: CONFIG.DEPT_EMAIL
    });
  } catch (err) {
    try {
      MailApp.sendEmail({
        to: CONFIG.DEPT_EMAIL,
        subject: 'YHEC1 sign portal — weekly check FAILED',
        body: 'The weekly check itself errored: ' + (err && err.message ? err.message : err) +
          '\n\nThe portal may still be fine, but this needs a look.',
        name: 'Yorktown Heights Engine Co. No. 1'
      });
    } catch (ignore) {}
  }
}

// ---------------- Setup / OAuth-grant helper ----------------

/**
 * Run this once from the Apps Script editor before deploying. It:
 *   - creates the Orders and Quarantine tabs (with correct headers) if
 *     they don't already exist, without touching them if they do
 *   - sends a test email to DEPT_EMAIL
 *   - logs a friendly summary (View → Logs, or Ctrl/Cmd+Enter after running)
 * Also doubles as the trigger that prompts the volunteer running it to
 * grant the Sheets/Mail OAuth scopes this script needs.
 */
/**
 * Compares an existing sheet's row 1 against the expected header list.
 * A pre-existing tab that isn't touched (per setupCheck's "leave it alone
 * if it's already there" behavior) can silently have the wrong columns —
 * appendRow would then write every future order into the wrong cells
 * forever. This surfaces that mismatch as a WARNING instead of a false OK.
 */
function checkHeaderRow_(sheet, expectedHeaders, sheetName) {
  var existing = sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0];
  var matches = expectedHeaders.every(function (h, i) { return existing[i] === h; });
  if (matches) {
    return '"' + sheetName + '" tab already exists with matching headers.';
  }
  return 'WARNING: "' + sheetName + '" tab already exists but row 1 does not match the ' +
    'expected headers. New rows will land in the wrong columns until this is fixed — ' +
    'compare row 1 to the header list at the top of Code.gs and correct it by hand.';
}

function setupCheck() {
  var results = [];
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);

    var ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
    if (!ordersSheet) {
      ordersSheet = ss.insertSheet(CONFIG.SHEET_ORDERS);
      ordersSheet.appendRow(ORDERS_HEADERS);
      results.push('Created "' + CONFIG.SHEET_ORDERS + '" tab with headers.');
    } else {
      results.push(checkHeaderRow_(ordersSheet, ORDERS_HEADERS, CONFIG.SHEET_ORDERS));
    }

    var quarantineSheet = ss.getSheetByName(CONFIG.SHEET_QUARANTINE);
    if (!quarantineSheet) {
      quarantineSheet = ss.insertSheet(CONFIG.SHEET_QUARANTINE);
      quarantineSheet.appendRow(QUARANTINE_HEADERS);
      results.push('Created "' + CONFIG.SHEET_QUARANTINE + '" tab with headers.');
    } else {
      results.push(checkHeaderRow_(quarantineSheet, QUARANTINE_HEADERS, CONFIG.SHEET_QUARANTINE));
    }

    if (CONFIG.DEPT_EMAIL === 'CHANGE_ME@example.com') {
      results.push('WARNING: DEPT_EMAIL is still the placeholder — edit the CONFIG block at the top of this file before deploying.');
      Logger.log('SETUP INCOMPLETE:\n' + results.join('\n'));
      return;
    }

    MailApp.sendEmail({
      to: CONFIG.DEPT_EMAIL,
      subject: 'YHEC1 911 Sign Portal — setup test email',
      body: 'This is a test email from setupCheck(). If you got this, email sending works and DEPT_EMAIL is configured correctly.',
      name: 'Yorktown Heights Engine Co. No. 1'
    });
    results.push('Sent test email to ' + CONFIG.DEPT_EMAIL + ' — check that inbox.');

    Logger.log('SETUP OK:\n' + results.join('\n'));
  } catch (err) {
    Logger.log('SETUP FAILED: ' + (err && err.message ? err.message : err) + '\n\nCompleted so far:\n' + results.join('\n'));
  }
}


// ---------------- Order tracker: rotation + setup ----------------

// Member list lives on the Dashboard tab (G4:G50) so volunteers can edit it
// without touching code. Read fresh on every order: a name added there joins
// the dropdown AND the rotation immediately.
function getMemberList_(ss) {
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) return [];
  var vals = dash.getRange('G4:G50').getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0]).trim();
    if (v) out.push(v);
  }
  return out;
}

// Rolodex rotation. Remembers the last-assigned NAME (not an index) so
// adding/removing members never skips or double-assigns anyone; if the
// remembered name left the list, the rotation restarts at the top.
// Called from doPost while the script lock is held, so two simultaneous
// orders cannot grab the same slot.
function pickAssignee_(ss) {
  var members = getMemberList_(ss);
  if (!members.length) return '';
  var props = PropertiesService.getScriptProperties();
  var last = props.getProperty('lastAssignee') || '';
  var next = members[(members.indexOf(last) + 1) % members.length];
  props.setProperty('lastAssignee', next);
  return next;
}

// Finds a header's 1-based column, or 0 when absent.
function colOf_(sheet, header) {
  var row = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  for (var i = 0; i < row.length; i++) if (String(row[i]).trim() === header) return i + 1;
  return 0;
}

// Inserts newHeader immediately right of afterHeader unless it already exists.
function ensureColumnAfter_(sheet, afterHeader, newHeader) {
  if (colOf_(sheet, newHeader)) return;
  var at = colOf_(sheet, afterHeader);
  if (!at) throw new Error('ensureColumnAfter_: missing anchor header ' + afterHeader);
  sheet.insertColumnAfter(at);
  sheet.getRange(1, at + 1).setValue(newHeader);
}

// One-time (re-runnable) setup + migration. Header-name-driven so it follows
// the department's own column arrangement instead of fighting it:
//  - repairs the Days Waiting header (broken #REF! after a column move) and
//    switches it to per-row formulas,
//  - inserts the Payment Status / Payment Type / Order Payment Received
//    columns if absent,
//  - repairs any rows appended under the OLD column order (values landed in
//    the wrong physical columns after the manual rearrange),
//  - migrates legacy Status="Paid" rows to Installed + Payment Paid,
//  - rewrites validations, row tints (preserving any hand-added rules, e.g.
//    the Days Waiting conditional formatting), and the Dashboard.
function setupOrderTracker() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var orders = ss.getSheetByName(CONFIG.SHEET_ORDERS);

  // --- Columns ---
  if (!colOf_(orders, 'Days Waiting')) orders.getRange(1, 3).setValue('Days Waiting'); // heals the #REF! header
  ensureColumnAfter_(orders, 'Status', 'Payment Status');
  ensureColumnAfter_(orders, 'Payment Status', 'Payment Type');
  ensureColumnAfter_(orders, 'Actual Vendor Total $ (dept)', 'Order Payment Received $ (dept)');
  var cST = colOf_(orders, 'Status'), cPS = colOf_(orders, 'Payment Status'),
      cDW = colOf_(orders, 'Days Waiting');

  // Old pre-rearrange header order, for repairing misaligned rows below.
  var LEGACY_HEADERS = [
    'Timestamp', 'Order ID', 'Status', 'Assigned To', 'House Number', 'Tier Color', 'Orientation',
    'Driveway Ft', 'Marker Texts', 'Arrow Sign', 'Arrow Direction (dept)', 'Mounting',
    'Post Included', 'Shared With Numbers', 'Full Name', 'Property Address', 'Phone',
    'Email', 'Preferred Contact', 'In-District Attest',
    'Placement Notes', 'Est Signs+Hardware $', 'Donation Pledged $', 'Est Total Due $',
    'Actual Vendor Total $ (dept)', 'Donation Received $ (dept)', 'Email Status', 'Internal Notes'
  ];

  // --- Row migration/backfill ---
  var last = orders.getLastRow();
  for (var r = 2; r <= last; r++) {
    var rowVals = orders.getRange(r, 1, 1, ORDERS_HEADERS.length).getValues()[0];
    if (!String(rowVals[0]).trim() && !String(rowVals[1]).trim()) continue; // blank row
    var stVal = String(rowVals[cST - 1] || '').trim();
    var dwVal = String(rowVals[cDW - 1] || '').trim();

    // Row written by the old code into the rearranged sheet: the legacy
    // 28-value array landed positionally, so Status text sits in the Days
    // Waiting column. Rebuild the row by header name.
    if (ORDER_STATUSES.concat(['Paid']).indexOf(stVal) < 0 &&
        ORDER_STATUSES.concat(['Paid']).indexOf(dwVal) >= 0) {
      var fixed = [];
      for (var kk = 0; kk < ORDERS_HEADERS.length; kk++) fixed.push('');
      for (var li = 0; li < LEGACY_HEADERS.length; li++) {
        var target = ORDERS_HEADERS.indexOf(LEGACY_HEADERS[li]);
        if (target >= 0) fixed[target] = rowVals[li];
      }
      orders.getRange(r, 1, 1, ORDERS_HEADERS.length).setValues([fixed]);
      rowVals = fixed;
      stVal = String(rowVals[cST - 1] || '').trim();
    }

    // Legacy closed state: Status "Paid" splits into Installed + payment Paid.
    if (stVal === 'Paid') {
      orders.getRange(r, cST).setValue('Installed');
      orders.getRange(r, cPS).setValue('Paid');
    }
    // Default Payment Status for pre-split rows.
    if (!String(orders.getRange(r, cPS).getValue()).trim()) {
      orders.getRange(r, cPS).setValue('Unpaid');
    }
    // Per-row Days Waiting formula.
    orders.getRange(r, cDW).setFormula(daysWaitingFormula_(r));
  }

  // --- Tracker columns right of the contract ---
  var extras = ['Contacted On', 'Ordered On', 'Installed On', 'Paid On'];
  var base = ORDERS_HEADERS.length; // 32 contract columns
  for (var e = 0; e < extras.length; e++) {
    if (!colOf_(orders, extras[e])) orders.getRange(1, base + 1 + e).setValue(extras[e]);
  }
  var stillOwedCol = colOf_(orders, 'Paid On') + 1;
  orders.getRange(1, stillOwedCol).setFormula(
    '=ARRAYFORMULA({"Still Owed $"; IF($A$2:$A="",,IF($E$2:$E="Cancelled","-",ROUND(N($AB$2:$AB)-N($AC$2:$AC),2)))})');

  // --- Dashboard ---
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) dash = ss.insertSheet('Dashboard');
  dash.getRange('A1').setValue('YHEC1 911 Sign Portal - Dashboard').setFontWeight('bold');
  dash.getRange('A3').setValue('Pipeline').setFontWeight('bold');
  dash.getRange('A4:B10').clearContent();
  for (var st = 0; st < ORDER_STATUSES.length; st++) {
    dash.getRange(4 + st, 1).setValue(ORDER_STATUSES[st]);
    dash.getRange(4 + st, 2).setFormula('=COUNTIF(Orders!$E$2:$E,"' + ORDER_STATUSES[st] + '")');
  }
  var OPEN_CRIT = ',Orders!$E$2:$E,"<>Cancelled",Orders!$F$2:$F,"<>Paid",Orders!$F$2:$F,"<>Waived"';
  dash.getRange('A12').setValue('Unassigned open');
  dash.getRange('B12').setFormula('=COUNTIFS(Orders!$D$2:$D,"",Orders!$A$2:$A,"<>"' + OPEN_CRIT + ')');
  dash.getRange('A13').setValue('Oldest New order');
  dash.getRange('B13').setFormula('=IFERROR(INDEX(Orders!$B$2:$B,MATCH(MINIFS(Orders!$A$2:$A,Orders!$E$2:$E,"New"),Orders!$A$2:$A,0))&" - "&TEXT(MINIFS(Orders!$A$2:$A,Orders!$E$2:$E,"New"),"m/d"),"none")');

  dash.getRange('D3').setValue('Money').setFontWeight('bold');
  dash.getRange('D4:E11').clearContent();
  dash.getRange('D4').setValue('Vendor cost paid out');
  dash.getRange('E4').setFormula('=SUM(Orders!$AB$2:$AB)');
  dash.getRange('D5').setValue('Order payments collected');
  dash.getRange('E5').setFormula('=SUM(Orders!$AC$2:$AC)');
  dash.getRange('D6').setValue('Still owed to the department');
  dash.getRange('E6').setFormula('=SUMPRODUCT((Orders!$E$2:$E<>"Cancelled")*(Orders!$A$2:$A<>"")*(N(Orders!$AB$2:$AB)-N(Orders!$AC$2:$AC)))');
  dash.getRange('D7').setValue('Donations received');
  dash.getRange('E7').setFormula('=SUM(Orders!$AD$2:$AD)');
  dash.getRange('D8').setValue('Donations pledged (open orders)');
  dash.getRange('E8').setFormula('=SUMIFS(Orders!$Z$2:$Z,Orders!$A$2:$A,"<>"' + OPEN_CRIT + ')');

  dash.getRange('D10').setValue('Payments').setFontWeight('bold');
  var payRows = [
    ['Unpaid orders', '=COUNTIFS(Orders!$F$2:$F,"Unpaid",Orders!$A$2:$A,"<>",Orders!$E$2:$E,"<>Cancelled")'],
    ['Partially paid', '=COUNTIFS(Orders!$F$2:$F,"Partial",Orders!$A$2:$A,"<>")'],
    ['Installed but unpaid', '=COUNTIFS(Orders!$E$2:$E,"Installed",Orders!$F$2:$F,"Unpaid")+COUNTIFS(Orders!$E$2:$E,"Installed",Orders!$F$2:$F,"Partial")'],
    ['Cash / Check / Other', '=COUNTIF(Orders!$G$2:$G,"Cash")&" / "&COUNTIF(Orders!$G$2:$G,"Check")&" / "&COUNTIF(Orders!$G$2:$G,"Other")']
  ];
  for (var pr = 0; pr < payRows.length; pr++) {
    dash.getRange(11 + pr, 4).setValue(payRows[pr][0]);
    dash.getRange(11 + pr, 5).setFormula(payRows[pr][1]);
  }

  dash.getRange('G3').setValue('Members - rotation order (add names below)').setFontWeight('bold');
  if (!getMemberList_(ss).length) dash.getRange('G4').setValue('Alex Vergo');
  dash.getRange('H3').setValue('Open').setFontWeight('bold');
  for (var m = 0; m < 17; m++) {
    dash.getRange(4 + m, 8).setFormula(
      '=IF($G' + (4 + m) + '="","",COUNTIFS(Orders!$D$2:$D,$G' + (4 + m) + OPEN_CRIT + '))');
  }

  // --- Validations ---
  orders.getRange('E2:E1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(ORDER_STATUSES, true).setAllowInvalid(false).build());
  orders.getRange('F2:F1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(PAYMENT_STATUSES, true).setAllowInvalid(false).build());
  orders.getRange('G2:G1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(PAYMENT_TYPES, true).setAllowInvalid(true).build());
  orders.getRange('D2:D1000').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(dash.getRange('G4:G50'), true).setAllowInvalid(true).build());
  orders.getRange('C2:C1000').setDataValidation(null); // Days Waiting: formulas, no dropdown

  // --- Row tints: keep every rule this function didn't create (e.g. the
  // department's own Days Waiting formatting), replace only the status tints.
  var mineRe = /^=\$[A-Z]{1,2}2="(New|Contacted|Ordered|Installed|Paid)"$/;
  var kept = [];
  var existing = orders.getConditionalFormatRules();
  for (var x = 0; x < existing.length; x++) {
    var bc = existing[x].getBooleanCondition();
    var vals = bc ? bc.getCriteriaValues() : null;
    var isMine = vals && vals.length === 1 && mineRe.test(String(vals[0]));
    if (!isMine) kept.push(existing[x]);
  }
  var tints = [['New', '#fce8e6'], ['Contacted', '#fef7e0'], ['Ordered', '#e8f0fe'],
               ['Installed', '#e0f2f1']];
  for (var t = 0; t < tints.length; t++) {
    kept.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$E2="' + tints[t][0] + '"')
      .setBackground(tints[t][1])
      .setRanges([orders.getRange('A2:AK1000')])
      .build());
  }
  orders.setConditionalFormatRules(kept);
  orders.setFrozenRows(1);
  Logger.log('TRACKER OK: payment split, migration, Dashboard, dropdowns, tints (hand-added rules preserved).');
}


// One-time (re-runnable) visual polish: header filter + slicers on Orders,
// and a live member-by-status pivot on the Dashboard. Deletes and recreates
// its own slicers/pivot so schema changes propagate on re-run. Chip-style
// dropdowns can't be set by script — flip "Display style: Chip" on the
// Status / Payment Status / Payment Type columns in the Sheets UI once.
function setupSheetPolish() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var orders = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  var dash = ss.getSheetByName('Dashboard');

  var oldFilter = orders.getFilter();
  if (oldFilter) oldFilter.remove();
  orders.getRange('A1:AK1000').createFilter();

  var slicers = orders.getSlicers();
  for (var i = 0; i < slicers.length; i++) slicers[i].remove();
  var src = orders.getRange('A1:AK1000');
  orders.insertSlicer(src, 1, 9).setColumnFilterCriteria(5, null).setTitle('Status');
  orders.insertSlicer(src, 1, 12).setColumnFilterCriteria(4, null).setTitle('Assigned To');
  orders.insertSlicer(src, 1, 15).setColumnFilterCriteria(6, null).setTitle('Payment Status');

  dash.getRange('H3:H20').clearContent();
  var pivots = dash.getPivotTables();
  for (var p = 0; p < pivots.length; p++) pivots[p].remove();
  var pt = dash.getRange('A16').createPivotTable(orders.getRange('A1:AK1000'));
  pt.addRowGroup(4).setDisplayName('Member');
  pt.addColumnGroup(5).setDisplayName('Status');
  pt.addPivotValue(2, SpreadsheetApp.PivotTableSummarizeFunction.COUNTA).setDisplayName('Orders');
  dash.getRange('A15').setValue('Orders by member and status').setFontWeight('bold');
  Logger.log('POLISH OK: filter, slicers, pivot.');
}
