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
  DEPT_EMAIL: 'CHANGE_ME@example.com',
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
  'Timestamp', 'Order ID', 'Status', 'House Number', 'Tier Color', 'Orientation',
  'Driveway Ft', 'Marker Texts', 'Arrow Sign', 'Arrow Direction (dept)', 'Mounting',
  'Post Included', 'Shared With Numbers', 'Full Name', 'Property Address', 'Phone',
  'Email', 'Preferred Contact', 'In-District Attest',
  'Placement Notes', 'Est Signs+Hardware $', 'Donation Pledged $', 'Est Total Due $',
  'Actual Vendor Total $ (dept)', 'Donation Received $ (dept)', 'Email Status', 'Internal Notes'
];

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
 * Builds the 27-element row for the Orders tab (columns A–AA), in the
 * exact order of ORDERS_HEADERS / CONTRACT.md section 9.
 *
 * `order` = sanitized order object (see sanitizeOrder).
 * `derived` = { orderId, lineItems, signsTotal, donation, totalDue,
 *               markers, internalNotes }.
 * `now` = a Date for the Timestamp column.
 */
function buildRow(order, derived, now) {
  return [
    now,                                                      // Timestamp
    derived.orderId,                                          // Order ID
    'New',                                                     // Status
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

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
      if (!ordersSheet) {
        ordersSheet = ss.insertSheet(CONFIG.SHEET_ORDERS);
        ordersSheet.appendRow(ORDERS_HEADERS);
      }
      ordersSheet.appendRow(buildRow(order, derived, new Date()));
      lastRow = ordersSheet.getLastRow();

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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_ORDERS);
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_ORDERS);
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

    if (last >= 2) {
      // A..J covers Timestamp, Order ID, Status, House Number, Tier Color,
      // Orientation, Driveway Ft, Marker Texts, Arrow Sign, Arrow Direction.
      var rows = sheet.getRange(2, 1, last - 1, 10).getValues();
      var cutoff = new Date().getTime() - 7 * 24 * 60 * 60 * 1000;
      for (var i = 0; i < rows.length; i++) {
        var ts = rows[i][0], status = String(rows[i][2] || ''),
            tier = String(rows[i][4] || ''), arrow = String(rows[i][8] || ''),
            arrowDir = String(rows[i][9] || '');
        if (ts && ts.getTime && ts.getTime() >= cutoff) recent++;
        var open = (status === 'New' || status === 'Contacted');
        if (open) {
          waiting++;
          if (tier === 'unsure') needMeasure++;
          if (arrow === 'Yes' && !arrowDir.trim()) needArrowDir++;
        }
      }
    }

    var lines = [];
    lines.push('The 911 sign portal is up and recording orders.');
    lines.push('');
    lines.push('New orders in the last 7 days: ' + recent);
    lines.push('Orders total: ' + total);
    lines.push('');
    lines.push('Waiting on the department: ' + waiting + ' (status New or Contacted)');
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();

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
