/* YHEC1 911 Sign Portal — app.js
 * Vanilla ES2019+, no modules, no build step. Safe on file:// and GitHub Pages.
 * Pure order-math + validation live on window.PORTAL_TEST so they can be
 * exercised from a console or from Node with a `window = {}` stub, and the
 * UI code below calls those SAME functions — no duplicated math.
 * Binding spec: docs/CONTRACT.md. Binding visuals: docs/mockup-v4.html.
 */
(function () {
  'use strict';

  var PAGE_LOAD_TS = Date.now();

  // ---------------------------------------------------------------------
  // 1. PURE FUNCTIONS (contract section 3 + 5) — no DOM access in here.
  // ---------------------------------------------------------------------

  var TIER_NAMES = { green: 'Green', yellow: 'Yellow', red: 'Red' };

  /**
   * computeMarkers(tier, lenFt, wantMarkers) — contract section 3.
   * Blue relay markers are an optional purchase and only make sense on the
   * red tier: a marker sits every 1,000 ft, and a yellow-tier driveway (under
   * 1,000 ft) never reaches the first one.
   */
  function computeMarkers(tier, lenFt, wantMarkers) {
    if (tier !== 'red' || wantMarkers !== true) return [];
    var n = Math.max(1, Math.floor((Number(lenFt) || 0) / 1000));
    if (n > 20) n = 20;
    var out = [];
    for (var i = 1; i <= n; i++) out.push(String(i * 1000));
    return out;
  }

  /**
   * What the resident would get if they opted in — used to label the offer
   * ("2 markers, $69.82") without adding anything to the order.
   */
  function offeredMarkers(tier, lenFt) {
    return computeMarkers(tier, lenFt, true);
  }

  /**
   * computeLineItems(state, prices) — contract section 3, items 1-5, in order.
   * state: { tier, orientation ('v'|'h'), houseNumber, mounting, drivewayLengthFt, sharedDriveway }
   */
  function computeLineItems(state, prices) {
    state = state || {};
    prices = prices || {};
    var vert = state.orientation === 'v';
    var vertLabel = vert ? 'vertical' : 'horizontal';
    var num = state.houseNumber != null ? state.houseNumber : '';
    var signLabel;
    if (state.tier === 'unsure') {
      // No colour has been decided yet — the department measures the driveway
      // first. Every colour costs the same, so the price is still exact.
      signLabel = 'Address sign (' + num + '), ' + vertLabel +
        ', two-sided — color set after we measure';
    } else {
      // The bordered product family has no yellow — tier-2 signs come from the
      // non-border products, so their label must not say "bordered".
      var borderWord = state.tier === 'yellow' ? '' : 'bordered ';
      signLabel = (TIER_NAMES[state.tier] || 'Green') + ' ' + borderWord +
        'address sign (' + num + '), ' + vertLabel + ', two-sided';
    }
    var items = [];

    items.push({ label: signLabel, amount: prices.sign });
    items.push({ label: 'Mounting bracket (' + vertLabel + ')', amount: prices.bracket });
    if (state.mounting === 'newpost') {
      items.push({ label: 'Sign post', amount: prices.post });
    }
    computeMarkers(state.tier, state.drivewayLengthFt, state.wantMarkers).forEach(function (t) {
      items.push({ label: 'Blue relay marker "' + t + '", vertical', amount: prices.marker });
    });
    if (state.sharedDriveway) {
      items.push({
        label: 'Green arrow sign for the split (horizontal, single-sided)',
        amount: prices.arrow
      });
    }
    return items;
  }

  /** computeTotals(items, donation) — contract section 3: signsTotal + donation (>=0) = totalDue. */
  function computeTotals(items, donation) {
    var signsTotal = (items || []).reduce(function (acc, it) {
      return acc + (Number(it.amount) || 0);
    }, 0);
    var d = Math.max(0, Number(donation) || 0);
    // Prices carry cents; float addition leaks artifacts (34.91*3 = 104.72999...),
    // so both totals are rounded to whole cents before anyone displays them.
    signsTotal = Math.round(signsTotal * 100) / 100;
    return { signsTotal: signsTotal, donation: d, totalDue: Math.round((signsTotal + d) * 100) / 100 };
  }

  /** "35" for whole dollars, "34.91" otherwise (callers prepend the $). */
  function fmtUSD(n) {
    n = Math.round(Number(n) * 100) / 100;
    return (n % 1 === 0) ? String(n) : n.toFixed(2);
  }

  function isPosInt(n) {
    return typeof n === 'number' && isFinite(n) && Number.isInteger(n);
  }

  /**
   * validate(payload) — mirrors contract section 5 (the server whitelist),
   * with friendlier messages, so client and server never disagree about
   * what "valid" means. Returns [] when the payload is valid, else an array
   * of { field, message } — `field` matches the payload key (and the key
   * the server returns in its own `errors[]`), so the same display logic
   * handles both client-side and server-side errors. A `field` of "" means
   * there's no single input to blame (e.g. bot-timing checks) — those
   * messages surface only in the top-level error list.
   */
  function validate(payload) {
    payload = payload || {};
    var errors = [];
    function fail(field, message) {
      errors.push({ field: field, message: message });
    }

    if (!/^[A-Za-z0-9-]{8,64}$/.test(payload.uuid || '')) {
      fail('uuid', "We couldn't create an order ID — please reload the page and try again.");
    }

    var hn = String(payload.houseNumber || '').trim();
    if (!/^[A-Za-z0-9]{1,5}$/.test(hn)) {
      fail('houseNumber', 'Enter your house number (up to 5 letters/numbers).');
    }

    if (['v', 'h'].indexOf(payload.orientation) === -1) {
      fail('orientation', 'Choose a sign orientation.');
    }

    if (['mailbox', 'existing', 'newpost'].indexOf(payload.mounting) === -1) {
      fail('mounting', 'Choose where to mount your sign.');
    }

    if (['green', 'yellow', 'red', 'unsure'].indexOf(payload.tier) === -1) {
      fail('tier', 'Choose your driveway length range.');
    }

    if (payload.tier === 'yellow') {
      var lenY = payload.drivewayLengthFt;
      if (!isPosInt(lenY) || lenY < 150 || lenY > 1000) {
        fail('drivewayLengthFt', 'Enter your driveway length in feet (150–1,000 for a yellow sign).');
      }
    } else if (payload.tier === 'red') {
      var lenR = payload.drivewayLengthFt;
      if (!isPosInt(lenR) || lenR < 1001 || lenR > 20000) {
        fail('drivewayLengthFt', 'Enter your driveway length in feet (1,001–20,000 for a red sign).');
      }
    }

    if (typeof payload.wantMarkers !== 'boolean') {
      fail('wantMarkers', 'Please reload the page and try again.');
    }

    if (typeof payload.sharedDriveway !== 'boolean') {
      fail('sharedDriveway', 'Please reload the page and try again.');
    }
    if (String(payload.sharedNumbers || '').length > 100) {
      fail('sharedNumbers', 'Keep neighbor house numbers under 100 characters.');
    }

    var fullName = String(payload.fullName || '').trim();
    if (fullName.length < 2 || fullName.length > 100) {
      fail('fullName', 'Enter your full name.');
    }

    var address = String(payload.address || '').trim();
    if (address.length < 5 || address.length > 200) {
      fail('address', 'Enter your property address.');
    }

    var phoneDigits = String(payload.phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      fail('phone', 'Enter a valid phone number.');
    }

    var email = String(payload.email || '').trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail('email', 'Enter a valid email address.');
    }

    if (['text', 'call', 'email'].indexOf(payload.contactMethod) === -1) {
      fail('contactMethod', 'Choose how we should contact you.');
    }

    if (payload.inDistrictAttest !== true) {
      fail('inDistrictAttest', 'Please confirm this address is within the Yorktown Heights fire district.');
    }

    if (String(payload.notes || '').length > 1000) {
      fail('notes', 'Keep placement notes under 1,000 characters.');
    }

    var donationChoices = ['0', '10', '25', '50', 'other'];
    if (donationChoices.indexOf(payload.donationChoice) === -1) {
      fail('donationChoice', 'Choose a donation amount.');
    } else if (payload.donationChoice === 'other') {
      var other = payload.donationOther;
      if (!isPosInt(other) || other < 1 || other > 10000) {
        fail('donationOther', 'Enter a donation amount between $1 and $10,000.');
      }
    }

    if (typeof payload.elapsedMs !== 'number' || !isFinite(payload.elapsedMs) || payload.elapsedMs < 5000) {
      fail('elapsedMs', 'That was fast — please take a moment and try submitting again.');
    }

    if (payload.contact_website) {
      // Honeypot tripped. Real visitors never see or fill this off-screen,
      // aria-hidden field — it's only reachable by something that fills every
      // input blindly. Flagged here so validate() stays a complete mirror of
      // contract section 5, but the UI layer (onSubmit) deliberately never
      // shows this specific message to a human — see the comment there.
      fail('contact_website', 'Something went wrong. Please try again.');
    }

    return errors;
  }

  window.PORTAL_TEST = {
    computeMarkers: computeMarkers,
    offeredMarkers: offeredMarkers,
    computeLineItems: computeLineItems,
    computeTotals: computeTotals,
    validate: validate
  };

  // ---------------------------------------------------------------------
  // 2. UI CODE — everything below only runs in a browser with a DOM.
  //    It calls the pure functions above; it never re-implements the math.
  // ---------------------------------------------------------------------

  if (typeof document === 'undefined') return;

  function initUI() {
    var CFG = window.PORTAL_CONFIG;
    if (!CFG) {
      console.warn('[YHEC1 portal] window.PORTAL_CONFIG is missing — did config.js load before app.js? Using fallback defaults.');
      CFG = {
        endpoint: '', prices: { sign: 34.91, bracket: 8.24, post: 37.80, marker: 34.91, arrow: 29.98 },
        donationTiers: [0, 10, 25, 50], defaultDonation: 25,
        venmoUrl: '', paypalUrl: '', pricesAsOf: '', contactFallback: ''
      };
    }
    var PRICES = CFG.prices || {};

    var COLORS = {
      green: { bg: '#156B34', fg: '#fff', name: 'Green' },
      yellow: { bg: '#E8B60A', fg: '#111', name: 'Yellow' },
      red: { bg: '#A32D2D', fg: '#fff', name: 'Red' },
      // Neutral grey stands in until the department measures the driveway —
      // deliberately not one of the three real sign colours.
      unsure: { bg: '#B4B2A9', fg: '#2C2C2A', name: '' }
    };

    // -- Defensive element lookup: warn once per missing id, never throw. --
    function byId(id) {
      var el = document.getElementById(id);
      if (!el) console.warn('[YHEC1 portal] expected element #' + id + ' (see docs/CONTRACT.md section 1) was not found.');
      return el;
    }
    function radios(name) {
      var list = document.querySelectorAll('input[name="' + name + '"]');
      if (!list.length) console.warn('[YHEC1 portal] expected radio group [name="' + name + '"] was not found.');
      return list;
    }

    var els = {
      hnum: byId('hnum'),
      signprev: byId('signprev'),
      prevcap: byId('prevcap'),
      digitwarn: byId('digitwarn'),
      mount: byId('mount'),
      mounthint: byId('mounthint'),
      lenwrap: byId('lenwrap'),
      measurenote: byId('measurenote'),
      markerwrap: byId('markerwrap'),
      markers: byId('markers'),
      markercount: byId('markercount'),
      markerprice: byId('markerprice'),
      markerdetail: byId('markerdetail'),
      dlen: byId('dlen'),
      shared: byId('shared'),
      sharedwrap: byId('sharedwrap'),
      sharednums: byId('sharednums'),
      sharedprompt: byId('sharedprompt'),
      sharedpromptHead: byId('sharedpromptHead'),
      sharedpromptUrl: byId('sharedpromptUrl'),
      sharedpromptCopy: byId('sharedpromptCopy'),
      fullname: byId('fullname'),
      addr: byId('addr'),
      phone: byId('phone'),
      email: byId('email'),
      attest: byId('attest'),
      notes: byId('notes'),
      summary: byId('summary'),
      dtiers: byId('dtiers'),
      donother: byId('donother'),
      total: byId('total'),
      submitbtn: byId('submitbtn'),
      formerr: byId('formerr'),
      successpanel: byId('successpanel'),
      softpanel: byId('softpanel'),
      orderform: byId('orderform'),
      honeypot: byId('contact_website')
    };

    // -- small helpers --
    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    // index.html hides conditional elements with the `hidden` attribute, not
    // inline styles, and some of them (e.g. .order-form) get an author-CSS
    // `display` from their class — which beats the UA `[hidden]` rule. So we
    // set both: the `hidden` property for semantics/a11y, and an inline
    // `display` override that's guaranteed to win regardless of what class
    // CSS says. Clearing the inline style on show lets each element's own
    // CSS (flex, block, whatever) take back over.
    function setHidden(el, hide) {
      if (!el) return;
      el.hidden = !!hide;
      el.style.display = hide ? 'none' : '';
    }
    function getSelectedRadioValue(name) {
      var list = document.querySelectorAll('input[name="' + name + '"]');
      for (var i = 0; i < list.length; i++) {
        if (list[i].checked) return list[i].value;
      }
      return null;
    }

    function normalizedHouseNumber() {
      var v = els.hnum ? els.hnum.value : '';
      return (v || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 5).toUpperCase();
    }
    function previewDigits() {
      return normalizedHouseNumber() || '?';
    }

    function currentState() {
      var tier = getSelectedRadioValue('tier') || 'green';
      var orientation = getSelectedRadioValue('orient') || 'v';
      var mounting = els.mount ? els.mount.value : 'mailbox';
      var lenRaw = els.dlen ? parseInt(els.dlen.value, 10) : NaN;
      return {
        tier: tier,
        orientation: orientation,
        mounting: mounting,
        drivewayLengthFt: isNaN(lenRaw) ? 0 : lenRaw,
        // Only the red tier offers markers, so a checkbox left checked from a
        // previous tier selection can't leak into a green/yellow order.
        wantMarkers: tier === 'red' && !!(els.markers && els.markers.checked),
        sharedDriveway: els.shared ? !!els.shared.checked : false,
        houseNumber: normalizedHouseNumber()
      };
    }

    // -- donation selection state --
    var donationState = { choice: 0 }; // number, or the string 'other'

    function currentDonationAmount() {
      if (donationState.choice === 'other') {
        var n = els.donother ? parseInt(els.donother.value, 10) : NaN;
        return isNaN(n) ? 0 : n;
      }
      return Number(donationState.choice) || 0;
    }

    // -- live preview (matches docs/mockup-v4.html render() exactly) --
    function updatePreview() {
      if (!els.signprev) return;
      var tier = getSelectedRadioValue('tier') || 'green';
      var orient = getSelectedRadioValue('orient') || 'v';
      var vert = orient === 'v';
      var c = COLORS[tier] || COLORS.green;
      var d = previewDigits();

      els.signprev.style.background = c.bg;
      // The sign's own proportions come from a class so the number band stays
      // centred the way it is printed, instead of hugging one edge.
      els.signprev.className = 'sign-preview ' + (vert ? 'sign-preview-v' : 'sign-preview-h');
      // The printed border is inset near the sign's edge — the container's
      // padding provides that inset, so the frame fills what's left. Yellow
      // comes from the non-border product family and has no frame at all.
      var frame = 'border:2px solid ' + (tier === 'yellow' ? 'transparent' : c.fg) +
        ';border-radius:5px;display:flex;align-items:center;justify-content:center;' +
        'width:100%;height:100%;box-sizing:border-box;' +
        (vert ? 'flex-direction:column;' : 'flex-direction:row;') +
        'gap:' + (vert ? '2px' : '4px') + ';';
      var spans = d.split('').map(function (ch) {
        return '<span style="color:' + c.fg + ';font-size:' + (vert ? 24 : 26) +
          'px;font-weight:500;line-height:1.05;text-align:center;">' + escapeHtml(ch) + '</span>';
      }).join('');
      els.signprev.innerHTML = '<div style="' + frame + '">' + spans + '</div>';

      if (els.prevcap) {
        var size = vert ? '6″×18″ vertical' : '18″×6″ horizontal';
        els.prevcap.textContent = tier === 'unsure'
          ? size + ' · color set when we measure'
          : size + ' · diamond grade · two-sided' + (tier === 'yellow' ? '' : ' · bordered');
      }
      setHidden(els.digitwarn, !(vert && d.length > 4));
    }

    // -- itemized summary + total (contract section 3 labels, mockup's $X pattern) --
    function updateSummary() {
      var state = currentState();
      // Display-only: an empty house number shows as "?" in the summary label
      // (matching the preview) — the submitted payload keeps the raw value.
      var displayState = state.houseNumber ? state : Object.assign({}, state, { houseNumber: '?' });
      var items = window.PORTAL_TEST.computeLineItems(displayState, PRICES);
      var totals = window.PORTAL_TEST.computeTotals(items, currentDonationAmount());

      if (els.summary) {
        var rows = items.map(function (it) {
          return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;">' +
            '<span>' + escapeHtml(it.label) + '</span><span style="flex:none;">$' + fmtUSD(it.amount) + '</span></div>';
        }).join('');
        els.summary.innerHTML = rows +
          '<div style="display:flex;justify-content:space-between;border-top:0.5px solid var(--border,#d7d5cd);' +
          'margin-top:6px;padding-top:6px;font-weight:500;"><span>Your signs &amp; hardware</span>' +
          '<span>$' + fmtUSD(totals.signsTotal) + '</span></div>';
      }
      if (els.total) {
        els.total.textContent = '$' + fmtUSD(totals.totalDue) +
          (totals.donation > 0 ? ' ($' + fmtUSD(totals.signsTotal) + ' order + $' + fmtUSD(totals.donation) + ' donation)' : '');
      }
      return { state: state, items: items, totals: totals };
    }

    /**
     * Listing neighbours used to change nothing on screen, which read as the
     * field being broken. It doesn't alter this resident's order — each home
     * needs its own sign and arrow — so the prompt says so and hands over a
     * link to pass along.
     */
    function updateSharedPrompt() {
      if (!els.sharedprompt) return;
      var listed = els.sharednums ? els.sharednums.value.trim() : '';
      var sharedOn = !!(els.shared && els.shared.checked);
      setHidden(els.sharedprompt, !(sharedOn && listed));
      if (!(sharedOn && listed)) return;

      var numbers = listed.split(/[,;/]+|\s+and\s+/).map(function (t) {
        return t.trim();
      }).filter(Boolean);
      if (els.sharedpromptHead) {
        els.sharedpromptHead.textContent = numbers.length === 1
          ? 'Number ' + numbers[0] + ' needs to order too.'
          : 'Numbers ' + numbers.slice(0, -1).join(', ') + ' and ' +
            numbers[numbers.length - 1] + ' each need to order too.';
      }
      if (els.sharedpromptUrl) {
        // Drop ?mock=1 and any other params so the shared link is the plain page.
        els.sharedpromptUrl.textContent = location.origin + location.pathname;
      }
    }

    if (els.sharedpromptCopy) {
      // No clipboard access (old browser, or a non-secure origin) leaves the
      // URL visible as selectable text, so hide the button rather than offer
      // one that silently does nothing.
      if (navigator.clipboard && navigator.clipboard.writeText) {
        els.sharedpromptCopy.addEventListener('click', function () {
          navigator.clipboard.writeText(location.origin + location.pathname).then(function () {
            els.sharedpromptCopy.textContent = 'Copied';
            setTimeout(function () { els.sharedpromptCopy.textContent = 'Copy link'; }, 2000);
          }).catch(function () {
            els.sharedpromptCopy.textContent = 'Press Cmd/Ctrl+C';
          });
        });
      } else {
        setHidden(els.sharedpromptCopy, true);
      }
    }

    // What each mounting choice means in practice, including the escape hatch
    // for a mailbox that turns out not to be at the driveway after all.
    var MOUNT_HINTS = {
      mailbox: "If your mailbox turns out to sit across the road or in a shared stand, we'll bring a post instead and let you know before ordering.",
      existing: 'Tell us in the notes below what it is (fence post, gate post, lamp post) so we bring the right hardware.',
      newpost: "We'll set a green U-channel post right at your driveway entrance."
    };

    function updateMountHint() {
      if (!els.mounthint) return;
      var v = els.mount ? els.mount.value : '';
      els.mounthint.textContent = MOUNT_HINTS[v] || '';
    }

    function toggleConditionalUI() {
      var tier = getSelectedRadioValue('tier') || 'green';
      // A length is only asked for on the two tiers that depend on it; green is
      // short by definition and "unsure" is the whole point of not asking.
      setHidden(els.lenwrap, tier === 'green' || tier === 'unsure');
      setHidden(els.measurenote, tier !== 'unsure');
      setHidden(els.sharedwrap, !(els.shared && els.shared.checked));
      updateSharedPrompt();
      updateMountHint();

      // Markers are offered on the red tier only. Leaving the tier clears the
      // opt-in so a hidden checked box can never bill someone silently.
      var offersMarkers = tier === 'red';
      setHidden(els.markerwrap, !offersMarkers);
      if (!offersMarkers && els.markers && els.markers.checked) {
        els.markers.checked = false;
      }
      if (offersMarkers) {
        var offered = window.PORTAL_TEST.offeredMarkers(tier, currentState().drivewayLengthFt);
        if (els.markercount) {
          els.markercount.textContent = offered.length + (offered.length === 1 ? ' marker' : ' markers');
        }
        if (els.markerprice) {
          els.markerprice.textContent = '$' + fmtUSD(offered.length * (PRICES.marker || 0));
        }
        if (els.markerdetail) {
          els.markerdetail.textContent = offered.length === 1
            ? 'Your marker would read “1000”.'
            : 'Your markers would read ' + offered.map(function (t) { return '“' + t + '”'; }).join(', ') + '.';
        }
      }
    }

    function renderAll() {
      updatePreview();
      updateSummary();
      toggleConditionalUI();
    }

    // -- donation buttons: .don-active class (spec) + .selected class (this
    // repo's css/styles.css names the hook .donation-btn.selected) + an
    // inline-style fallback matching the mockup, so the correct look renders
    // no matter which class name wins the styling. --
    function setDonationSelection(value) {
      donationState.choice = value;
      var buttons = els.dtiers ? els.dtiers.querySelectorAll('button[data-d]') : [];
      buttons.forEach(function (b) {
        var isSelected = value === 'other' ? b.dataset.d === '-1' : String(b.dataset.d) === String(value);
        b.classList.toggle('don-active', isSelected);
        b.classList.toggle('selected', isSelected);
        if (isSelected) {
          b.style.borderColor = 'var(--border-accent,#378ADD)';
          b.style.background = 'var(--bg-accent,#E6F1FB)';
          b.style.color = 'var(--text-accent,#185FA5)';
        } else {
          b.style.borderColor = '';
          b.style.background = '';
          b.style.color = '';
        }
      });
      setHidden(els.donother, value !== 'other');
      clearFieldError('donationOther'); // don't leave a stale error next to a now-hidden input
      renderAll();
    }

    if (els.dtiers) {
      els.dtiers.querySelectorAll('button[data-d]').forEach(function (b) {
        b.addEventListener('click', function () {
          var d = parseInt(b.dataset.d, 10);
          if (d === -1) {
            setDonationSelection('other');
            if (els.donother) els.donother.focus();
          } else {
            setDonationSelection(d);
          }
        });
      });
    }
    if (els.donother) els.donother.addEventListener('input', renderAll);

    // -- wire the rest of the live-updating controls --
    radios('orient').forEach(function (r) { r.addEventListener('change', renderAll); });
    radios('tier').forEach(function (r) { r.addEventListener('change', renderAll); });
    if (els.mount) els.mount.addEventListener('change', renderAll);
    if (els.markers) els.markers.addEventListener('change', renderAll);
    if (els.sharednums) els.sharednums.addEventListener('input', updateSharedPrompt);
    if (els.shared) els.shared.addEventListener('change', renderAll);
    if (els.hnum) els.hnum.addEventListener('input', renderAll);
    if (els.dlen) els.dlen.addEventListener('input', renderAll);

    // ---------------------------------------------------------------------
    // 3. VALIDATION DISPLAY — field-err[data-for] + #formerr, per contract.
    // ---------------------------------------------------------------------

    // Maps a payload/validate() field name to the id of its DOM input.
    // index.html's <p class="field-err" data-for="..."> uses the INPUT's own
    // id as the data-for value (e.g. data-for="hnum", not data-for=
    // "houseNumber") — this table doubles as that translation and as the
    // "what to focus" lookup. Fields with no single input (radio groups) or
    // no field-err slot in the markup (mounting, tier, sharedNumbers,
    // contactMethod, notes, donationChoice) simply have no home for a
    // per-field message and surface only in #formerr — that's expected, not
    // a bug, since index.html doesn't provide a slot for them.
    var FIELD_ELEMENT_ID = {
      houseNumber: 'hnum', mounting: 'mount', drivewayLengthFt: 'dlen',
      sharedNumbers: 'sharednums', fullName: 'fullname', address: 'addr',
      phone: 'phone', email: 'email', inDistrictAttest: 'attest', notes: 'notes',
      donationOther: 'donother'
    };
    var FIELD_RADIO_GROUP = { orientation: 'orient', tier: 'tier', contactMethod: 'contactm' };

    function focusTargetFor(field) {
      var groupName = FIELD_RADIO_GROUP[field];
      if (groupName) return document.querySelector('input[name="' + groupName + '"]');
      if (field === 'donationChoice') {
        // #dtiers is a plain div with no tabindex — .focus() on it is a
        // silent no-op, so target the first donation button instead.
        var dt = document.getElementById('dtiers');
        return dt ? dt.querySelector('button') : null;
      }
      var id = FIELD_ELEMENT_ID[field];
      return id ? document.getElementById(id) : null;
    }

    function fieldErrEl(field) {
      var id = FIELD_ELEMENT_ID[field];
      return id ? document.querySelector('.field-err[data-for="' + id + '"]') : null;
    }

    function clearFieldError(field) {
      var el = fieldErrEl(field);
      if (el) { el.textContent = ''; setHidden(el, true); }
    }

    function showErrors(errors) {
      document.querySelectorAll('.field-err[data-for]').forEach(function (el) {
        el.textContent = '';
        setHidden(el, true);
      });
      if (els.formerr) {
        if (errors.length) {
          els.formerr.innerHTML = '<ul style="margin:4px 0 0;padding-left:18px;">' +
            errors.map(function (e) { return '<li>' + escapeHtml(e.message) + '</li>'; }).join('') +
            '</ul>';
        } else {
          els.formerr.innerHTML = '';
        }
        setHidden(els.formerr, !errors.length);
      }
      errors.forEach(function (e) {
        if (!e.field) return;
        var fieldEl = fieldErrEl(e.field);
        if (fieldEl) { fieldEl.textContent = e.message; setHidden(fieldEl, false); }
      });
      if (errors.length) {
        var target = focusTargetFor(errors[0].field);
        if (target && typeof target.focus === 'function') target.focus();
      }
    }

    function wireClearOnInput(field, el, evt) {
      if (!el) return;
      el.addEventListener(evt || 'input', function () { clearFieldError(field); });
    }
    wireClearOnInput('houseNumber', els.hnum);
    wireClearOnInput('drivewayLengthFt', els.dlen);
    wireClearOnInput('sharedNumbers', els.sharednums);
    wireClearOnInput('fullName', els.fullname);
    wireClearOnInput('address', els.addr);
    wireClearOnInput('phone', els.phone);
    wireClearOnInput('email', els.email);
    wireClearOnInput('notes', els.notes);
    wireClearOnInput('donationOther', els.donother);
    wireClearOnInput('mounting', els.mount, 'change');
    wireClearOnInput('inDistrictAttest', els.attest, 'change');
    radios('orient').forEach(function (r) { r.addEventListener('change', function () { clearFieldError('orientation'); }); });
    radios('tier').forEach(function (r) { r.addEventListener('change', function () { clearFieldError('tier'); }); });
    radios('contactm').forEach(function (r) { r.addEventListener('change', function () { clearFieldError('contactMethod'); }); });

    // ---------------------------------------------------------------------
    // 4. SUBMIT FLOW — contract section 7.
    // ---------------------------------------------------------------------

    function uuidv4() {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
      var bytes = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var j = 0; j < 256; j++) hex[j] = (j + 0x100).toString(16).substr(1);
      return hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
        hex[bytes[4]] + hex[bytes[5]] + '-' + hex[bytes[6]] + hex[bytes[7]] + '-' +
        hex[bytes[8]] + hex[bytes[9]] + '-' +
        hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]];
    }

    function buildPayload() {
      var state = currentState();
      var donationAmount = currentDonationAmount();
      var donationChoiceStr = donationState.choice === 'other' ? 'other' : String(donationState.choice);
      return {
        uuid: uuidv4(),
        houseNumber: state.houseNumber,
        orientation: state.orientation,
        mounting: state.mounting,
        tier: state.tier,
        // Only yellow and red carry a length; green and unsure send 0 so a
        // stale value in the hidden input can't ride along.
        drivewayLengthFt: (state.tier === 'yellow' || state.tier === 'red') ? state.drivewayLengthFt : 0,
        wantMarkers: state.wantMarkers,
        sharedDriveway: state.sharedDriveway,
        sharedNumbers: els.sharednums ? els.sharednums.value.trim() : '',
        fullName: els.fullname ? els.fullname.value.trim() : '',
        address: els.addr ? els.addr.value.trim() : '',
        phone: els.phone ? els.phone.value.trim() : '',
        email: els.email ? els.email.value.trim() : '',
        contactMethod: getSelectedRadioValue('contactm') || 'text',
        inDistrictAttest: els.attest ? !!els.attest.checked : false,
        notes: els.notes ? els.notes.value.trim() : '',
        donationChoice: donationChoiceStr,
        donationOther: donationChoiceStr === 'other' ? donationAmount : 0,
        elapsedMs: Date.now() - PAGE_LOAD_TS,
        contact_website: els.honeypot ? els.honeypot.value : ''
      };
    }

    var submitInFlight = false;
    function setSubmitting(isSubmitting) {
      submitInFlight = isSubmitting;
      if (!els.submitbtn) return;
      if (isSubmitting) {
        if (els.submitbtn.dataset.origLabel == null) els.submitbtn.dataset.origLabel = els.submitbtn.textContent;
        els.submitbtn.disabled = true;
        els.submitbtn.textContent = 'Sending…';
      } else {
        els.submitbtn.disabled = false;
        if (els.submitbtn.dataset.origLabel != null) els.submitbtn.textContent = els.submitbtn.dataset.origLabel;
      }
    }

    function isMockMode() {
      var qs = (typeof location !== 'undefined' && location.search) || '';
      return /[?&]mock=1(&|$)/.test(qs) || !(CFG.endpoint && CFG.endpoint.length);
    }

    // index.html nests #successpanel and #softpanel INSIDE <form id="orderform">
    // (they share its layout/spacing rules), so "hide #orderform" can't mean
    // display:none on the form element itself — that would take the panels
    // down with it, since a display:none ancestor can't be un-hidden by a
    // descendant. Instead we hide every direct child of the form except the
    // two result panels, which is what "hide the order form, show the result"
    // actually means given this markup.
    function setOrderFormVisible(visible) {
      if (!els.orderform) return;
      Array.prototype.forEach.call(els.orderform.children, function (child) {
        if (child === els.successpanel || child === els.softpanel) return;
        setHidden(child, !visible);
      });
    }

    function ensureMockBanner() {
      if (document.getElementById('mockbanner') || !els.orderform || !els.orderform.parentNode) return;
      var b = document.createElement('div');
      b.id = 'mockbanner';
      b.textContent = 'TEST MODE — order not sent';
      b.style.cssText = 'background:#FFF4CE;color:#7A5B00;border:1px solid #E8B60A;' +
        'border-radius:8px;padding:8px 14px;margin-bottom:16px;font-size:13px;' +
        'font-weight:500;text-align:center;';
      // Inserted as a sibling before the form (not inside it) so it stays
      // visible on the success/soft panels too, instead of disappearing
      // along with the rest of the form fields.
      els.orderform.parentNode.insertBefore(b, els.orderform);
    }

    function mockOrderId() {
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var out = '';
      for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
      return 'YH-' + out;
    }

    function buildMockResponse(payload) {
      var state = {
        tier: payload.tier, orientation: payload.orientation, mounting: payload.mounting,
        drivewayLengthFt: payload.drivewayLengthFt, wantMarkers: payload.wantMarkers,
        sharedDriveway: payload.sharedDriveway,
        houseNumber: payload.houseNumber
      };
      var items = window.PORTAL_TEST.computeLineItems(state, PRICES);
      var donationAmount = payload.donationChoice === 'other' ? payload.donationOther : Number(payload.donationChoice);
      var totals = window.PORTAL_TEST.computeTotals(items, donationAmount);
      return {
        ok: true,
        orderId: mockOrderId(),
        lineItems: items.map(function (it) { return { label: it.label, amount: it.amount }; }),
        signsTotal: totals.signsTotal,
        donation: totals.donation,
        totalDue: totals.totalDue
      };
    }

    // #successpanel ships in index.html with a fixed skeleton (heading, next-
    // steps copy, etc. already written) plus three slots app.js fills in:
    // #successOrderId, #successItems (a <ul>), and #paylink (a <p>, hidden
    // unless a donation link is configured). Unlike #summary/#signprev, the
    // contract doesn't say app.js owns this element's innerHTML wholesale —
    // and the built markup bears that out — so we populate the slots instead
    // of replacing them.
    function showSuccessPanel(resp) {
      setOrderFormVisible(false);
      if (!els.successpanel) return;

      var orderIdEl = document.getElementById('successOrderId');
      if (orderIdEl) orderIdEl.textContent = resp.orderId || '';
      else console.warn('[YHEC1 portal] expected element #successOrderId inside #successpanel was not found.');

      var itemsEl = document.getElementById('successItems');
      if (itemsEl) {
        itemsEl.innerHTML = (resp.lineItems || []).map(function (it) {
          return '<li>' + escapeHtml(it.label) + ' — $' + fmtUSD(it.amount) + '</li>';
        }).join('');
      } else {
        console.warn('[YHEC1 portal] expected element #successItems inside #successpanel was not found.');
      }

      var payEl = document.getElementById('paylink');
      if (payEl) {
        var linkUrl = CFG.venmoUrl || CFG.paypalUrl || '';
        if (linkUrl) {
          var linkText = CFG.venmoUrl ? 'Donate via Venmo' : 'Donate via PayPal';
          payEl.innerHTML = '<a href="' + escapeHtml(linkUrl) + '" target="_blank" rel="noopener">' + linkText + '</a>';
          setHidden(payEl, false);
        } else {
          payEl.innerHTML = '';
          setHidden(payEl, true);
        }
      }

      setHidden(els.successpanel, false);
    }

    function showSoftPanel() {
      setOrderFormVisible(false);
      if (!els.softpanel) return;
      var fbEl = document.getElementById('softContactFallback');
      if (fbEl) {
        fbEl.textContent = CFG.contactFallback ? ('reach us at ' + CFG.contactFallback + ', or ') : '';
      } else {
        console.warn('[YHEC1 portal] expected element #softContactFallback inside #softpanel was not found.');
      }
      setHidden(els.softpanel, false);
    }

    function doSubmit(payload) {
      var body = JSON.stringify(payload);
      fetch(CFG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow'
      }).then(function (res) {
        return res.json();
      }).then(function (resp) {
        if (resp && resp.ok) {
          setSubmitting(false);
          showSuccessPanel(resp);
        } else {
          setSubmitting(false);
          showErrors((resp && resp.errors) || []);
        }
      }).catch(function () {
        // fetch (or JSON parsing) failed — one no-cors retry with the same body/uuid, then soft-success.
        fetch(CFG.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: body,
          mode: 'no-cors'
        }).then(function () {
          setSubmitting(false);
          showSoftPanel();
        }).catch(function () {
          setSubmitting(false);
          showSoftPanel();
        });
      });
    }

    function onSubmit(evt) {
      if (evt && evt.preventDefault) evt.preventDefault();
      if (submitInFlight) return;

      var payload = buildPayload();
      var errors = window.PORTAL_TEST.validate(payload);
      // The honeypot (contact_website) is off-screen and aria-hidden — a real
      // submitter never sees or fills it, so showing them a validation error
      // about it would be a dead end with nothing on screen to fix. validate()
      // still flags it (kept as a complete mirror of contract section 5, and
      // consistent with the server's own whitelist), but the UI never
      // surfaces that one message. The payload still carries contact_website
      // through to the server unchanged — that's where the real handling
      // happens (fake success + Quarantine row, contract section 8).
      var visibleErrors = errors.filter(function (e) { return e.field !== 'contact_website'; });
      if (visibleErrors.length) {
        showErrors(visibleErrors);
        return;
      }
      showErrors([]);
      setSubmitting(true);

      if (isMockMode()) {
        ensureMockBanner();
        setTimeout(function () {
          var resp = buildMockResponse(payload);
          setSubmitting(false);
          showSuccessPanel(resp);
        }, 800);
        return;
      }

      doSubmit(payload);
    }

    if (els.orderform) els.orderform.addEventListener('submit', onSubmit);

    // ---------------------------------------------------------------------
    // 5. INIT
    // ---------------------------------------------------------------------

    if (isMockMode()) ensureMockBanner();

    // Show when the price table was last checked, so the note can't silently
    // claim "current" prices years after anyone verified them.
    var asOfEl = document.getElementById('pricesasof');
    if (asOfEl && CFG.pricesAsOf) asOfEl.textContent = ' (' + CFG.pricesAsOf + ')';

    var tiers = CFG.donationTiers || [0, 10, 25, 50];
    var initialDonation = tiers.indexOf(CFG.defaultDonation) !== -1
      ? CFG.defaultDonation
      : (tiers.length ? tiers[0] : 0);
    setDonationSelection(initialDonation); // also triggers the first full render
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
})();
