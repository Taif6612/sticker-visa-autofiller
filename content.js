// Sticker Visa Auto-Filler — content script
// Maps client profile fields onto active page inputs and dispatches native
// events so React/Vue/Angular state machines accept the values.
// Handles standard HTML forms AND ARIA-driven builders (Google Forms,
// Microsoft Forms) where the human-readable label lives on a container,
// not on the input itself.

const FIELD_MAP = {
  passport_number: ["passport_number", "passportnumber", "passport_no", "passportnum", "ppt_no", "document_no", "doc_no", "pass_num"],
  surname: ["surname", "lastname", "last_name", "family_name", "familyname", "lname"],
  given_name: ["given_name", "givenname", "first_name", "firstname", "fname", "forename"],
  dob: ["dob", "date_of_birth", "dateofbirth", "birth_date", "birthdate", "birthday"],
  nationality: ["nationality", "country_of_citizenship", "citizenship", "nation"],
  email: ["email_address", "emailaddress", "email", "e_mail"],
  phone: ["phone_number", "phonenumber", "mobile_number", "contact_number", "mobile", "phone", "tel", "telephone"],
  address_line_1: ["address_line_1", "address_line", "street_address", "address1", "addr1"],
  city: ["city", "town"],
  state: ["state", "province", "division"],
  postal_code: ["postal_code", "postcode", "zip_code", "zip", "post_code"],
  country_of_residence: ["country_of_residence", "residence_country", "residence"],
  occupation: ["occupation", "profession", "job_title", "job"],
  travel_date: ["travel_date", "date_of_travel", "departure_date", "travel"],
  length_of_stay: ["length_of_stay", "duration_of_stay", "length", "duration", "stay"],
  purpose_of_visit: ["purpose_of_visit", "purpose", "reason_for_visit", "reason"],
  hotel_name: ["hotel_name", "accommodation_name", "hotel"],
  hotel_address: ["hotel_address", "accommodation_address"],
  sponsor_name: ["sponsor_name", "sponsor"],
  sponsor_email: ["sponsor_email"],
  emergency_contact: ["emergency_contact", "emergency", "next_of_kin"]
};

// Choice widgets resolved by GROUP label, then matched to an OPTION by value/text.
// Decision 6 follow-up — radio + checkbox are now in scope (split-date pickers remain deferred).
const RADIO_FIELD_MAP = {
  gender: ["gender", "sex"],
  marital_status: ["marital_status", "marital", "civil_status"],
  visa_type: ["visa_type", "visa_category", "type_of_visa", "visa"]
};

const CHECKBOX_FIELD_MAP = {
  skills: ["skills", "skill", "languages", "language"]
};

// Dropdown widgets — both native <select> and Google Forms ARIA listbox/combobox.
// Same keys may also live in RADIO_FIELD_MAP; whichever widget the form actually
// uses, the claimed-Set prevents double-fills.
const SELECT_FIELD_MAP = {
  gender: ["gender", "sex"],
  marital_status: ["marital_status", "marital", "civil_status"],
  visa_type: ["visa_type", "visa_category", "type_of_visa", "visa"],
  nationality: ["nationality", "country_of_citizenship", "citizenship", "nation"]
};

const FIELD_SELECTOR = 'input, select, textarea, [role="textbox"], [contenteditable="true"], [contenteditable="plaintext-only"]';

// Native prototype-setter bypass — required so SPA frameworks see the change.
// Spec: agent_docs/tech_stack.md
function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setFieldValue(element, value) {
  if (element.isContentEditable) {
    element.focus();
    element.textContent = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  setNativeValue(element, value);
}

// Robust activation for ARIA widgets (Google Forms "Next" button, dropdown options)
// that ignore a bare .click(). Fires a full pointer + mouse sequence, then click().
function clickElement(el) {
  const init = { bubbles: true, cancelable: true, view: window };
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
  } catch (_) { /* PointerEvent unsupported — the mouse events above still fire */ }
  try { el.click(); } catch (_) { /* some ARIA nodes throw on .click(); events cover it */ }
}

function isVisible(el) {
  return !!(el && (el.offsetParent !== null || el.getClientRects().length));
}

// A fuller, coordinate-aware activation than clickElement — some builder widgets
// (notably Google Forms dropdown OPTIONS) only commit on a realistic hover + press +
// release sequence carrying client coordinates, not a bare click.
function pointerClick(el) {
  const r = (el.getBoundingClientRect && el.getBoundingClientRect()) || { left: 0, top: 0, width: 1, height: 1 };
  const cx = r.left + (r.width || 1) / 2;
  const cy = r.top + (r.height || 1) / 2;
  const m = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
  const p = Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, m);
  const fire = (Ctor, type, init) => { try { el.dispatchEvent(new Ctor(type, init)); } catch (_) { /* ctor/env */ } };
  fire(PointerEvent, 'pointerover', p); fire(MouseEvent, 'mouseover', m);
  fire(PointerEvent, 'pointerenter', p); fire(MouseEvent, 'mouseenter', m);
  fire(PointerEvent, 'pointermove', p); fire(MouseEvent, 'mousemove', m);
  fire(PointerEvent, 'pointerdown', Object.assign({ buttons: 1 }, p)); fire(MouseEvent, 'mousedown', Object.assign({ buttons: 1 }, m));
  try { if (el.focus) el.focus(); } catch (_) { /* not focusable */ }
  fire(PointerEvent, 'pointerup', Object.assign({ buttons: 0 }, p)); fire(MouseEvent, 'mouseup', Object.assign({ buttons: 0 }, m));
  fire(MouseEvent, 'click', m);
  try { el.click(); } catch (_) { /* covered by the dispatched click */ }
}

// Commit a Google Forms listbox OPTION by bubbling a mousedown→mouseup pair to the
// listbox's delegated handlers (mousedown:UX7yZ / mouseup) — WITHOUT a trailing
// click. A click bubbles to the listbox's own click:cOuCgd toggle handler and closes
// it before the choice settles, which is why prior click-based attempts left
// aria-selected="false". This is the doc's "physical event chain" minus the click.
function mouseCommitOption(el) {
  const r = (el.getBoundingClientRect && el.getBoundingClientRect()) || { left: 0, top: 0, width: 1, height: 1 };
  const cx = r.left + (r.width || 1) / 2;
  const cy = r.top + (r.height || 1) / 2;
  const m = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
  const p = Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, m);
  const fire = (Ctor, type, init) => { try { el.dispatchEvent(new Ctor(type, init)); } catch (_) { /* ctor/env */ } };
  fire(PointerEvent, 'pointerover', p); fire(MouseEvent, 'mouseover', m);
  fire(PointerEvent, 'pointermove', p); fire(MouseEvent, 'mousemove', m);
  fire(PointerEvent, 'pointerdown', Object.assign({ buttons: 1 }, p));
  fire(MouseEvent, 'mousedown', Object.assign({ buttons: 1 }, m));
  fire(PointerEvent, 'pointerup', Object.assign({ buttons: 0 }, p));
  fire(MouseEvent, 'mouseup', Object.assign({ buttons: 0 }, m));
  // Intentionally NO click / el.click() — that would hit the listbox toggle.
}

// Synthetic keyboard event (keydown + keypress + keyup) for driving an ARIA
// listbox whose options delegate selection through jsaction and ignore clicks.
function dispatchKey(el, key, keyCode) {
  // keyCode / which are READ-ONLY on KeyboardEvent — passing them to the constructor
  // is silently ignored (they stay 0), and Google's handler then rejects the key.
  // Force them on with defineProperty so synthetic keys carry the right codes.
  const make = (type) => {
    const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, view: window });
    try {
      Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
      Object.defineProperty(ev, 'which', { get: () => keyCode });
    } catch (_) { /* already defined on this engine */ }
    return ev;
  };
  try {
    el.dispatchEvent(make('keydown'));
    el.dispatchEvent(make('keypress'));
    el.dispatchEvent(make('keyup'));
  } catch (_) { /* KeyboardEvent ctor issue — ignore */ }
}

function normalize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

// Token-boundary match: keyword tokens must appear as a contiguous run among the
// haystack's _-delimited tokens. Prevents loose substring hits like "tel" matching
// "ho_tel_name", while still matching multi-word keys like "mobile_number".
function tokenMatch(haystackNorm, keyword) {
  const h = haystackNorm.split('_').filter(Boolean);
  const k = keyword.split('_').filter(Boolean);
  if (!k.length) return false;
  for (let i = 0; i + k.length <= h.length; i++) {
    let ok = true;
    for (let j = 0; j < k.length; j++) {
      if (h[i + j] !== k[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Pulls every semantic label source the framework exposes so we can substring-match
// natural-language prompts like "Date of Birth (DD/MM/YYYY) *".
function getEffectiveLabel(el) {
  const parts = [];

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const ref = id && document.getElementById(id);
      if (ref) parts.push(ref.textContent || '');
    }
  }

  // Google/Microsoft Forms wrap each question in role="listitem" with the
  // prompt in a sibling role="heading" rather than on the input.
  const listItem = el.closest('[role="listitem"]');
  if (listItem) {
    const heading = listItem.querySelector('[role="heading"]');
    if (heading) parts.push(heading.textContent || '');
  }

  if (el.id) {
    try {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent || '');
    } catch (_) { /* CSS.escape unavailable or malformed id */ }
  }

  return parts.join(' ');
}

function elementMatchesKeyword(el, keyword) {
  const sources = [
    el.id,
    el.name,
    el.getAttribute('placeholder'),
    el.getAttribute('data-field'),
    getEffectiveLabel(el),
  ].filter(Boolean).map(normalize);
  return sources.some((h) => tokenMatch(h, keyword));
}

// EC-01: never overwrite hidden tokens / CSRF / CAPTCHA carriers,
// and never touch fields the page has explicitly marked uneditable.
function isWritable(el) {
  if (el.type === 'hidden') return false;
  if (el.disabled) return false;
  if (el.readOnly) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.getAttribute('aria-readonly') === 'true') return false;
  return true;
}

function findFieldFor(clientKey, root, claimed) {
  const keywords = FIELD_MAP[clientKey] || [];
  const candidates = root.querySelectorAll(FIELD_SELECTOR);
  for (const keyword of keywords) {
    for (const el of candidates) {
      if (claimed && claimed.has(el)) continue;
      // Choice inputs are handled separately so a text key never writes a string into one.
      if (el.type === 'radio' || el.type === 'checkbox') continue;
      if (!isWritable(el)) continue;
      if (elementMatchesKeyword(el, keyword)) return el;
    }
  }
  return null;
}

// ---- Choice widgets (radio / checkbox) ----------------------------------
// Resolve the GROUP by its label (radiogroup aria-label, listitem heading,
// fieldset legend, or shared name), then activate the OPTION whose value or
// visible text matches the client data. Supports both real
// <input type="radio|checkbox"> and ARIA [role="radio"]/[role="checkbox"].

function getGroupKeywordSources(optionEl) {
  const sources = [];
  const group = optionEl.closest('[role="radiogroup"], [role="group"], [role="list"]');
  if (group) {
    const al = group.getAttribute('aria-label');
    if (al) sources.push(al);
    const lb = group.getAttribute('aria-labelledby');
    if (lb) for (const id of lb.split(/\s+/)) {
      const ref = id && document.getElementById(id);
      if (ref) sources.push(ref.textContent || '');
    }
  }
  // Walk up to the nearest ancestor that actually contains a heading — that's the
  // question block. Google Forms nests checkbox options under the question heading
  // (sometimes in their own role="list"/"listitem"), so a plain closest() misses it.
  let node = optionEl;
  for (let depth = 0; node && depth < 8; depth++) {
    const heading = node.querySelector && node.querySelector('[role="heading"]');
    if (heading) { sources.push(heading.textContent || ''); break; }
    node = node.parentElement;
  }
  const fieldset = optionEl.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) sources.push(legend.textContent || '');
  }
  if (optionEl.name) sources.push(optionEl.name);
  return sources.map(normalize);
}

function groupMatchesKeyword(optionEl, keyword) {
  return getGroupKeywordSources(optionEl).some((s) => tokenMatch(s, keyword));
}

function getChoiceOptions(role, root) {
  const real = Array.from(root.querySelectorAll(`input[type="${role}"]`));
  const aria = Array.from(root.querySelectorAll(`[role="${role}"]`));
  return real.concat(aria);
}

function findChoiceGroup(clientKey, map, role, root) {
  const keywords = map[clientKey] || [];
  const options = getChoiceOptions(role, root);
  for (const keyword of keywords) {
    const matched = options.filter((el) => groupMatchesKeyword(el, keyword));
    if (matched.length) return matched;
  }
  // Checkbox fallback: Google Forms nests each checkbox in its own role="listitem",
  // hiding the question heading from the option — so the group label often can't be
  // resolved. Return all checkboxes and let optionMatchesValue pick the ones whose
  // value matches the client data. Safe for distinctive sets (languages/skills);
  // radios stay group-scoped to avoid cross-group collisions.
  if (role === 'checkbox' && options.length) return options;
  return null;
}

function optionLabelSources(optionEl) {
  const parts = [];
  if (optionEl.value) parts.push(optionEl.value);
  const dataValue = optionEl.getAttribute('data-value');
  if (dataValue) parts.push(dataValue);
  const answerValue = optionEl.getAttribute('data-answer-value'); // Google Forms option value
  if (answerValue) parts.push(answerValue);
  const al = optionEl.getAttribute('aria-label');
  if (al) parts.push(al);
  const wrapLabel = optionEl.closest('label');
  if (wrapLabel) parts.push(wrapLabel.textContent || '');
  if (optionEl.getAttribute('role')) parts.push(optionEl.textContent || '');
  return parts.map(normalize).filter(Boolean);
}

function optionMatchesValue(optionEl, value) {
  const target = normalize(value);
  if (!target) return false;
  return optionLabelSources(optionEl).some((s) => tokenMatch(s, target) || s === target);
}

function isOptionEnabled(optionEl) {
  if (optionEl.disabled) return false;
  if (optionEl.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function activateOption(optionEl) {
  if (!isOptionEnabled(optionEl)) return false;
  const isReal = typeof optionEl.checked === 'boolean';
  const alreadyOn = isReal ? optionEl.checked : optionEl.getAttribute('aria-checked') === 'true';
  if (!alreadyOn) optionEl.click();
  if (!isReal) {
    // ARIA widgets may not emit native input/change from a synthetic click.
    optionEl.dispatchEvent(new Event('input', { bubbles: true }));
    optionEl.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

function selectRadioOption(options, value, claimed) {
  for (const opt of options) {
    if (claimed.has(opt)) continue;
    if (optionMatchesValue(opt, value) && activateOption(opt)) {
      claimed.add(opt);
      return true;
    }
  }
  return false;
}

// Accepts a JS array (PostgREST text[]), a Postgres array literal string
// "{english,bangla}", or a plain comma list — and normalizes to clean values.
function toValueList(values) {
  if (Array.isArray(values)) return values.map((v) => String(v));
  return String(values)
    .trim()
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((v) => v.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

function selectCheckboxOptions(options, values, claimed) {
  const list = toValueList(values);
  let count = 0;
  for (const value of list) {
    if (!value) continue;
    for (const opt of options) {
      if (claimed.has(opt)) continue;
      if (optionMatchesValue(opt, value)) {
        if (activateOption(opt)) {
          claimed.add(opt);
          count++;
        }
        break;
      }
    }
  }
  return count;
}

// ---- Dropdown widgets ---------------------------------------------------
// Handles two flavours:
//   (a) native <select><option>...</option></select>
//   (b) Google Forms ARIA: a trigger with [role="listbox"] (often nested in a
//       [role="presentation"] wrapper), click to open, [role="option"]s appear
//       elsewhere in the DOM (often a popup), one carries data-value matching
//       the visible text.

function selectSourcesForLabel(el) {
  const parts = [];
  const al = el.getAttribute('aria-label');
  if (al) parts.push(al);
  const lb = el.getAttribute('aria-labelledby');
  if (lb) for (const id of lb.split(/\s+/)) {
    const ref = id && document.getElementById(id);
    if (ref) parts.push(ref.textContent || '');
  }
  // Walk up to nearest ancestor with a question heading (same trick as choice groups).
  let node = el;
  for (let depth = 0; node && depth < 8; depth++) {
    const heading = node.querySelector && node.querySelector('[role="heading"]');
    if (heading) { parts.push(heading.textContent || ''); break; }
    node = node.parentElement;
  }
  if (el.id) {
    try {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) parts.push(lbl.textContent || '');
    } catch (_) { /* noop */ }
  }
  if (el.name) parts.push(el.name);
  return parts.map(normalize).filter(Boolean);
}

function selectMatchesKeyword(el, keyword) {
  return selectSourcesForLabel(el).some((s) => tokenMatch(s, keyword));
}

function findSelectFor(clientKey, root, claimed) {
  const keywords = SELECT_FIELD_MAP[clientKey] || [];
  const natives = Array.from(root.querySelectorAll('select'));
  const arias = Array.from(root.querySelectorAll('[role="listbox"], [role="combobox"]'));
  const candidates = natives.concat(arias);
  for (const keyword of keywords) {
    for (const el of candidates) {
      if (claimed.has(el)) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (selectMatchesKeyword(el, keyword)) return el;
    }
  }
  return null;
}

function setNativeSelect(selectEl, value) {
  const target = normalize(value);
  for (const opt of selectEl.options) {
    const candidates = [opt.value, opt.textContent, opt.getAttribute('data-value')]
      .filter(Boolean).map(normalize);
    if (candidates.some((c) => tokenMatch(c, target) || c === target)) {
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

// Collect the options that belong to THIS listbox: first the ones nested inside the
// trigger (Google Forms keeps them there), then any popup referenced via
// aria-controls / aria-owns, and only if both miss, a document-wide scan.
function getOwnedOptions(triggerEl) {
  let opts = Array.from(triggerEl.querySelectorAll('[role="option"]'));
  const ownsId = triggerEl.getAttribute('aria-controls') || triggerEl.getAttribute('aria-owns');
  if (ownsId) {
    for (const id of ownsId.split(/\s+/)) {
      const container = id && document.getElementById(id);
      if (container) opts = opts.concat(Array.from(container.querySelectorAll('[role="option"]')));
    }
  }
  if (!opts.length) opts = Array.from(document.querySelectorAll('[role="option"]'));
  return opts;
}

// Match candidates: this listbox's own options PLUS every document-level [role="option"].
// Google Forms can render the live, clickable options in a body-level popup while leaving
// a hidden copy inside the listbox; the matcher below prefers the VISIBLE one, which is
// the live option of the currently-open dropdown.
function gatherOptionCandidates(triggerEl) {
  const set = new Set(getOwnedOptions(triggerEl));
  for (const o of document.querySelectorAll('[role="option"]')) set.add(o);
  return Array.from(set);
}

// The leading "Choose"/"Select" entry carries an empty data-value — never pick it.
function isPlaceholderOption(optionEl) {
  const dv = optionEl.getAttribute('data-value');
  if (dv !== null && dv.trim() === '') return true;
  const t = normalize(optionEl.textContent);
  return t === '' || t === 'choose' || t === 'select';
}

function ariaOptionMatches(optionEl, value) {
  const target = normalize(value);
  if (!target) return false;
  const sources = [
    optionEl.getAttribute('data-value'),
    optionEl.getAttribute('data-answer-value'),
    optionEl.getAttribute('aria-label'),
    optionEl.textContent,
  ].filter(Boolean).map(normalize);
  return sources.some((s) => s === target || tokenMatch(s, target));
}

// Open state: Google Forms toggles aria-expanded; some skins instead just reveal the
// owned options. Treat either signal as "open".
function isListboxExpanded(triggerEl) {
  if (triggerEl.getAttribute('aria-expanded') === 'true') return true;
  const owned = getOwnedOptions(triggerEl);
  return owned.length > 0 && owned.some(isVisible);
}

// Select an option by KEYBOARD — the reliable path for a jsaction listbox whose
// options carry an empty jsaction and only commit via the listbox's own key handler.
// Arrow from the currently-selected option to the target by DOM index, then Enter.
async function keyboardSelectOption(triggerEl, match) {
  const container = match.parentElement || triggerEl;
  const orderedNow = () => Array.from(container.querySelectorAll('[role="option"]'));
  let ordered = orderedNow();
  const targetIdx = ordered.indexOf(match);
  if (targetIdx < 0) return false;

  // jsaction's keydown:I481le handler is bound to the listbox itself, so keys must be
  // dispatched there (options carry tabindex="-1" + empty jsaction).
  const focusable = (triggerEl.getAttribute('tabindex') !== null ? triggerEl : null)
    || container.querySelector('[role="option"][tabindex="0"]')
    || triggerEl;
  if (focusable.focus) { try { focusable.focus(); } catch (_) { /* not focusable */ } }
  await sleep(40);

  // Read the CURRENT highlight each step instead of guessing the start. Prefer
  // aria-activedescendant (re-read live), fall back to aria-selected, else index 0.
  const currentIdx = () => {
    ordered = orderedNow();
    const activeId = triggerEl.getAttribute('aria-activedescendant')
      || focusable.getAttribute('aria-activedescendant');
    if (activeId) {
      const i = ordered.findIndex((o) => o.id === activeId);
      if (i >= 0) return i;
    }
    const sel = ordered.findIndex((o) => o.getAttribute('aria-selected') === 'true');
    return sel >= 0 ? sel : 0;
  };

  for (let guard = 0; guard < ordered.length + 3; guard++) {
    const at = currentIdx();
    if (at === targetIdx) break;
    const down = at < targetIdx;
    dispatchKey(focusable, down ? 'ArrowDown' : 'ArrowUp', down ? 40 : 38);
    await sleep(60);
  }
  dispatchKey(focusable, 'Enter', 13);
  await sleep(80);
  return true;
}

// Ask the background worker to dispatch a REAL (trusted) click at viewport
// coordinates via chrome.debugger / CDP. This is the only way to satisfy Google
// Forms' isTrusted-gated jsaction handlers from an extension. Returns the bridge
// response ({ ok, error? }); error usually means DevTools is attached to the tab.
async function trustedClickAt(x, y) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'TRUSTED_CLICK', x: Math.round(x), y: Math.round(y) });
    return resp || { ok: false, error: 'no-response' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Trusted keyboard key via the background CDP bridge (real key code + isTrusted).
async function trustedKeyAt(keyName) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'TRUSTED_KEY', key: keyName });
    return resp || { ok: false, error: 'no-response' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sendDetach() {
  try { chrome.runtime.sendMessage({ type: 'TRUSTED_DETACH' }).catch(() => {}); } catch (_) { /* noop */ }
}

async function selectAriaListbox(triggerEl, value) {
  const target = normalize(value);
  const isOpen = () => isListboxExpanded(triggerEl);

  // Open (or re-open) the listbox. A single click toggles it; only click when closed.
  const openIt = async () => {
    if (isOpen()) return true;
    if (triggerEl.focus) { try { triggerEl.focus(); } catch (_) { /* not focusable */ } }
    triggerEl.click();
    return waitFor(isOpen, 1200, 50);
  };

  // SUCCESS = the target value is actually selected. A listbox that merely CLOSED is
  // NOT success — a dismissing click closes it without choosing anything.
  const chosen = () => {
    const hit = gatherOptionCandidates(triggerEl).some((o) => ariaOptionMatches(o, value)
      && (o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-checked') === 'true'));
    if (hit) return true;
    // When collapsed, the trigger now DISPLAYS the chosen value. Use a token match
    // (contains), NOT strict equality: the trigger text usually also carries the
    // question label and/or an "arrow_drop_down" icon ligature, so a strict === gave
    // false negatives — the selection had actually committed but we failed to see it,
    // and the later fallback strategies then clobbered the good choice.
    if (triggerEl.getAttribute('aria-expanded') === 'false' || !isOpen()) {
      return tokenMatch(normalize(triggerEl.textContent || ''), target);
    }
    return false;
  };

  const findMatch = () => {
    const all = gatherOptionCandidates(triggerEl)
      .filter((o) => o.getAttribute('aria-disabled') !== 'true' && !isPlaceholderOption(o));
    return all.find((o) => isVisible(o) && ariaOptionMatches(o, value))
        || all.find((o) => ariaOptionMatches(o, value)) || null;
  };

  await openIt();
  await sleep(180);

  if (!findMatch()) {
    const all = gatherOptionCandidates(triggerEl);
    console.warn('[Sticker Visa Auto-Filler] dropdown: no option matched', JSON.stringify(value),
      '| candidates (data-value / text):',
      all.map((o) => (o.getAttribute('data-value') ?? '') + ' / ' + (o.textContent || '').trim()));
    if (isOpen()) triggerEl.click();
    return false;
  }

  // Strategy 1 — quick SYNTHETIC mouse down/up (no debugger banner). Commits on ARIA
  // listboxes that don't gate on isTrusted; on Google Forms it just no-ops and we move on.
  let settled = false;
  if (await openIt()) {
    const m = await pollForSettledLayout(findMatch, 800);
    if (m) mouseCommitOption(m);
    settled = await waitFor(chosen, 500, 50);
  }

  // Strategy 2 — TRUSTED KEYBOARD via chrome.debugger. Open + focus the listbox with a
  // trusted click on the TRIGGER (large, stable coordinates), then drive its keydown
  // handler with trusted ArrowDown/Enter. CDP key events are isTrusted AND carry real
  // virtual key codes — the combination synthetic events can never produce — and they
  // sidestep the narrow option's click coordinates entirely (the likely miss at non-100% zoom).
  let debuggerError = null;
  if (!settled) {
    const tr = triggerEl.getBoundingClientRect();
    const opened = await trustedClickAt(tr.left + tr.width / 2, tr.top + tr.height / 2);
    if (!opened.ok) {
      debuggerError = opened.error;
    } else {
      await waitFor(isOpen, 1500, 60);
      const liveOptions = () => getOwnedOptions(triggerEl).filter((o) => o.getAttribute('aria-disabled') !== 'true');
      const activeOption = () => {
        const id = triggerEl.getAttribute('aria-activedescendant');
        if (id) { const el = document.getElementById(id); if (el) return el; }
        return liveOptions().find((o) => o.getAttribute('aria-selected') === 'true') || null;
      };
      const opts0 = liveOptions();
      const tIdx = opts0.findIndex((o) => !isPlaceholderOption(o) && ariaOptionMatches(o, value));
      if (tIdx >= 0) {
        for (let i = 0; i < opts0.length + 4 && !settled && !debuggerError; i++) {
          const act = activeOption();
          if (act && ariaOptionMatches(act, value)) {
            const ek = await trustedKeyAt('Enter');
            if (!ek.ok) { debuggerError = ek.error; break; }
            settled = await waitFor(chosen, 900, 50);
            break;
          }
          const at = act ? liveOptions().indexOf(act) : -1;
          const kr = await trustedKeyAt((at < 0 || at < tIdx) ? 'ArrowDown' : 'ArrowUp');
          if (!kr.ok) { debuggerError = kr.error; break; }
          await sleep(80);
        }
        // Stepped by index but never saw an "active" marker — commit anyway.
        if (!settled && !debuggerError) {
          await trustedKeyAt('Enter');
          settled = await waitFor(chosen, 900, 50);
        }
      }
    }
  }

  // Strategy 3 — TRUSTED click on the option's centre (backup if keyboard nav didn't
  // resolve). Only scrolls when the option is off-screen (scrolling can dismiss the popup).
  if (!settled && !debuggerError) {
    if (!isOpen()) {
      const tr = triggerEl.getBoundingClientRect();
      await trustedClickAt(tr.left + tr.width / 2, tr.top + tr.height / 2);
      await waitFor(isOpen, 1500, 60);
    }
    const m = await pollForSettledLayout(findMatch, 1500);
    if (m) {
      let r = m.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if ((r.top < 0 || r.bottom > vh) && m.scrollIntoView) {
        m.scrollIntoView({ block: 'nearest' });
        await sleep(140);
        r = m.getBoundingClientRect();
      }
      const c = await trustedClickAt(r.left + r.width / 2, r.top + r.height / 2);
      if (!c.ok) debuggerError = c.error;
      settled = await waitFor(chosen, 1200, 60);
    }
  }

  // Strategy 4 — SYNTHETIC keyboard fallback (used when the debugger can't attach,
  // e.g. DevTools is open on the tab). dispatchKey now forces real keyCodes.
  if (!settled && await openIt()) {
    const m = await pollForSettledLayout(findMatch, 700);
    if (m) await keyboardSelectOption(triggerEl, m);
    settled = await waitFor(chosen, 800, 50);
  }

  if (!settled) {
    const m = findMatch();
    const snip = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    console.warn('[Sticker Visa Auto-Filler] dropdown: option clicked but selection did not settle for',
      JSON.stringify(value),
      '| matchVisible=', !!(m && isVisible(m)),
      debuggerError
        ? `| debugger UNAVAILABLE (${debuggerError}) — chrome.debugger can't attach while DevTools is open on this tab. Close DevTools and retry.`
        : '| debugger path ran',
      '| optionHTML=', snip(m && m.outerHTML),
      '| listboxHTML=', snip(triggerEl.outerHTML));
    if (isOpen()) { try { triggerEl.click(); } catch (_) { /* leave it closed */ } }
  }
  return settled;
}

async function applyDropdown(el, value, claimed) {
  if (el.tagName === 'SELECT') {
    if (setNativeSelect(el, value)) { claimed.add(el); return true; }
    return false;
  }
  const ok = await selectAriaListbox(el, value);
  if (ok) claimed.add(el);
  return ok;
}

function isEmptyValue(value) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

async function autofillForm(client) {
  const filled = [];
  const skipped = [];
  const claimed = new Set();

  // 1) Text / date / number / contenteditable fields.
  for (const key of Object.keys(FIELD_MAP)) {
    const value = client?.[key];
    if (isEmptyValue(value)) continue;
    const el = findFieldFor(key, document, claimed);
    if (el) {
      setFieldValue(el, value);
      claimed.add(el);
      filled.push(key);
    } else {
      skipped.push(key);
    }
  }

  // 2) Radio groups (single-select).
  for (const key of Object.keys(RADIO_FIELD_MAP)) {
    const value = client?.[key];
    if (isEmptyValue(value)) continue;
    const options = findChoiceGroup(key, RADIO_FIELD_MAP, 'radio', document);
    if (options && selectRadioOption(options, value, claimed)) filled.push(key);
    else skipped.push(key);
  }

  // 3) Checkbox groups (multi-select).
  for (const key of Object.keys(CHECKBOX_FIELD_MAP)) {
    const values = client?.[key];
    if (isEmptyValue(values)) continue;
    const options = findChoiceGroup(key, CHECKBOX_FIELD_MAP, 'checkbox', document);
    const matched = options ? selectCheckboxOptions(options, values, claimed) : 0;
    if (matched > 0) filled.push(key);
    else skipped.push(key);
  }

  // 4) Dropdowns — native <select> and ARIA listbox / combobox.
  for (const key of Object.keys(SELECT_FIELD_MAP)) {
    if (filled.includes(key)) continue; // radio already matched on this section
    const value = client?.[key];
    if (isEmptyValue(value)) continue;
    const el = findSelectFor(key, document, claimed);
    if (el && await applyDropdown(el, value, claimed)) filled.push(key);
    else if (!skipped.includes(key)) skipped.push(key);
  }

  return { filled, skipped };
}

// ---- Multi-section navigation (Google Forms wizard flow) ----------------
// Real Google Forms render only the current section. To fill every section from
// one click we fill the visible section, click "Next", wait for the re-render,
// and repeat until there is no "Next" (last section / single-page form).

function findNextButton() {
  const buttons = document.querySelectorAll('[role="button"], button');
  for (const b of buttons) {
    if (b.disabled) continue;
    const tokens = normalize(b.textContent).split('_').filter(Boolean);
    if (tokens.includes('next')) return b; // never "back" / "submit" / "clear"
  }
  return null;
}

function sectionSignature() {
  return Array.from(document.querySelectorAll('[role="heading"]'))
    .map((h) => h.textContent || '').join('|');
}

function waitFor(predicate, timeout = 2500, interval = 120) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (predicate()) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, interval);
    })();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// rAF-paced polling for layout settling. Fixes the "option clicked but selection
// did not settle" failure: Google Forms options exist in the DOM with height:0
// while the popup animates in; pointerClick would read a zero-dimensional rect
// and dispatch coordinates to a collapsed target, missing the option entirely.
// Resolves with the element once it has non-zero rect AND is actually displayed,
// or null on timeout.
function pollForSettledLayout(produce, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const start = performance.now();
    function ancestorAriaHidden(el) {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
      }
      return false;
    }
    function step() {
      const el = produce();
      if (el) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        // Layout-settled AND a11y-settled. The aria-hidden check fixes Chrome's
        // "Blocked aria-hidden on an element because its descendant retained focus"
        // warning, which fired when Strategy 1 focused an option before Google
        // Forms cleared aria-hidden on the popup container during the open animation.
        if (rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity || '1') > 0 &&
            !ancestorAriaHidden(el)) {
          return resolve(el);
        }
      }
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

function countFieldInputs() {
  return document.querySelectorAll('input:not([type="hidden"]), textarea, [role="textbox"], [contenteditable="true"], [role="radio"], [role="checkbox"], [role="listbox"], select').length;
}

// ---- Autofill job: persistence + auto-advance across sections AND navigations --
// The selected client is stored as a job in chrome.storage.local the moment the
// analyst clicks Autofill. The content script fills the current section, advances,
// and repeats. If a "Next" ever triggers a real page load, the job survives in
// storage and the freshly-loaded page resumes it — so multi-page portals fill
// end-to-end without re-clicking. Guards: same-origin only, a page cap, and a TTL.

const JOB_KEY = 'sva_autofill_job';
const RESULT_KEY = 'sva_autofill_result';
const JOB_TTL_MS = 5 * 60 * 1000;
const JOB_MAX_PAGES = 30;

let walkRunning = false; // prevents two concurrent walks in the same page context

async function getActiveJob() {
  try {
    const data = await chrome.storage.local.get(JOB_KEY);
    const job = data[JOB_KEY];
    if (!job) return null;
    const stale = Date.now() > job.expiresAt || (job.pagesFilled || 0) >= job.maxPages;
    if (stale) { await clearJob(); return null; }
    if (job.origin && job.origin !== location.origin) return null; // job for another site
    return job;
  } catch (_) { return null; }
}

async function saveJob(job) {
  try { await chrome.storage.local.set({ [JOB_KEY]: job }); } catch (_) { /* noop */ }
}

async function clearJob() {
  try { await chrome.storage.local.remove(JOB_KEY); } catch (_) { /* noop */ }
}

function reportResult(result) {
  try { chrome.storage.local.set({ [RESULT_KEY]: { ...result, at: Date.now() } }); } catch (_) { /* noop */ }
  try { chrome.runtime.sendMessage({ type: 'AUTOFILL_DONE', ...result }).catch(() => {}); } catch (_) { /* noop */ }
}

// Fill the current section, then (when auto-advancing) walk forward. Returns
// { done }: true means the form is finished (no Next) or a guard tripped; false
// means a Next was clicked but the section didn't swap in place — i.e. a real
// navigation is likely in flight and the next page load will resume the job.
async function autofillWalk(job) {
  const filledAll = new Set();
  const skippedAll = new Set();
  const pack = (done, extra) => ({
    done, ok: true, url: location.href,
    filled: [...filledAll], skipped: [...skippedAll], ...extra,
  });

  for (let i = 0; i < 25; i++) {
    await sleep(150); // let any in-flight section render settle before reading inputs
    const res = await autofillForm(job.client);
    res.filled.forEach((k) => filledAll.add(k));
    res.skipped.forEach((k) => skippedAll.add(k));

    job.pagesFilled = (job.pagesFilled || 0) + 1;
    await saveJob(job); // persist before any Next click so a navigation can resume

    if (job.pagesFilled >= job.maxPages) return pack(true, { capped: true });
    if (!job.autoAdvance) return pack(true);

    const nextBtn = findNextButton();
    if (!nextBtn) return pack(true); // last section / single page — never clicks Submit

    const beforeSig = sectionSignature();
    const beforeCount = countFieldInputs();
    clickElement(nextBtn);

    // (1) In-place section swap? Google Forms swaps the heading text first.
    const sigChanged = await waitFor(() => {
      const now = sectionSignature();
      return now && now !== beforeSig;
    }, 3500);
    if (!sigChanged) return pack(false); // navigation likely in flight → resume on load

    // (2) Wait for the NEW section's inputs to mount, else the next pass reads an
    //     empty DOM and silently skips everything.
    await waitFor(() => {
      const c = countFieldInputs();
      return c > 0 && c !== beforeCount;
    }, 2000);
    // (3) Let Google Forms finish its enter animation before filling again.
    await sleep(250);
  }
  return pack(true);
}

async function runJob(job) {
  if (walkRunning) return;
  walkRunning = true;
  try {
    const result = await autofillWalk(job);
    if (result.done) {
      await clearJob();
      reportResult(result);
      sendDetach(); // job finished — drop the debugger banner
    }
    // done:false → leave the job (and the debugger) in place; a real navigation resumes it.
  } catch (err) {
    await clearJob();
    reportResult({ ok: false, url: location.href, error: err.message });
    sendDetach();
  } finally {
    walkRunning = false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'AUTOFILL') {
    console.log('[Sticker Visa Auto-Filler] AUTOFILL received on', location.href, msg.client);
    const job = {
      client: msg.client || {},
      autoAdvance: msg.autoAdvance !== false, // default on
      origin: location.origin,
      startedAt: Date.now(),
      expiresAt: Date.now() + JOB_TTL_MS,
      pagesFilled: 0,
      maxPages: JOB_MAX_PAGES,
    };
    // Persist first so a navigating Next can be resumed, then run the walk detached.
    saveJob(job).then(() => runJob(job));
    // Respond immediately. We deliberately do NOT hold the channel open for the whole
    // multi-section walk — that is exactly what produced the "message channel closed
    // before a response was received" error when a Next click tore down this context.
    sendResponse({ ok: true, started: true, url: location.href });
    return false;
  }
});

// On every page load, resume an in-flight job — this is what carries auto-advance
// across a real page navigation (a fresh content script with no AUTOFILL message).
getActiveJob().then((job) => { if (job) runJob(job); });
