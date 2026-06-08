const btn = document.getElementById('autofill-btn');
const status = document.getElementById('status');
const search = document.getElementById('client-search');
const results = document.getElementById('client-results');
const selectedBox = document.getElementById('client-selected');

let clientsById = new Map();
let allClients = [];

// Combobox state
let currentRows = [];       // ranked rows currently shown (1:1 with rendered <li>)
let activeIndex = -1;       // keyboard-highlighted row
let selectedClientId = '';  // id of the committed selection
let isOpen = false;

function clientName(c) {
  return [c.surname, c.given_name].filter(Boolean).join(', ') || 'Unnamed';
}

function clientLabel(c) {
  return `${clientName(c)} — ${c.passport_number || 'no passport'}`;
}

// Lowercase + strip whitespace so "99 8" and "998" compare equal.
function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '');
}

// Rank clients for a query. Passport matches win, and the typed characters must
// appear in the same order (substring), so "998" hits BD9988776 but "899" does not.
function rankedMatches(rawQuery) {
  const q = normalize(rawQuery);
  if (!q) return allClients.map((client, idx) => ({ client, idx, score: 0 }));

  const scored = [];
  allClients.forEach((client, idx) => {
    const passport = normalize(client.passport_number);
    const digits = passport.replace(/^[a-z]+/, ''); // drop country letters, e.g. "bd"
    let score = 0;

    if (passport.startsWith(q)) score = 100;             // "bd99"
    else if (digits && digits.startsWith(q)) score = 90; // "998" — numeric prefix
    else if (passport.includes(q)) score = 70;           // in-order substring
    else if (normalize(clientName(client)).includes(q)) score = 50;
    else if ([client.email, client.phone, client.nationality, client.city, client.occupation]
      .some((f) => normalize(f).includes(q))) score = 30;

    if (score) scored.push({ client, idx, score });
  });

  // Highest score first; ties keep the original backend order for stability.
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return scored;
}

// Render the passport with the matched run wrapped in <mark>. Built from DOM
// nodes (not innerHTML) so client data can never inject markup.
function renderPassport(el, passport, rawQuery) {
  const text = String(passport ?? '') || 'no passport';
  const q = normalize(rawQuery);
  const idx = q ? text.toLowerCase().indexOf(q) : -1;
  if (idx === -1) { el.textContent = text; return; }
  el.appendChild(document.createTextNode(text.slice(0, idx)));
  const mark = document.createElement('mark');
  mark.textContent = text.slice(idx, idx + q.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(text.slice(idx + q.length)));
}

function openList() {
  results.hidden = false;
  search.setAttribute('aria-expanded', 'true');
  isOpen = true;
}

function closeList() {
  results.hidden = true;
  search.setAttribute('aria-expanded', 'false');
  search.removeAttribute('aria-activedescendant');
  isOpen = false;
  activeIndex = -1;
}

function updateActive() {
  const items = results.querySelectorAll('.result[role="option"]');
  items.forEach((li, i) => {
    const on = i === activeIndex;
    li.classList.toggle('active', on);
    if (on) {
      search.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  });
}

function renderResults(rows) {
  results.innerHTML = '';

  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'result empty';
    li.textContent = search.value.trim() ? 'No matching clients' : 'No clients loaded';
    results.appendChild(li);
    activeIndex = -1;
    openList();
    return;
  }

  rows.forEach((row, i) => {
    const c = row.client;
    const li = document.createElement('li');
    li.className = 'result';
    li.id = `client-result-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(c.id) === selectedClientId ? 'true' : 'false');

    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = clientName(c);

    const passport = document.createElement('div');
    passport.className = 'result-passport';
    renderPassport(passport, c.passport_number, search.value);

    li.append(name, passport);

    // mousedown (not click) fires before the input's blur, and preventDefault
    // keeps focus on the input so the list isn't closed out from under the pick.
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectClient(c);
    });
    li.addEventListener('mouseenter', () => { activeIndex = i; updateActive(); });

    results.appendChild(li);
  });

  activeIndex = 0;
  updateActive();
  openList();
}

function runFilter() {
  currentRows = rankedMatches(search.value);
  renderResults(currentRows);
}

function moveActive(delta) {
  if (!isOpen) { runFilter(); return; }
  if (!currentRows.length) return;
  activeIndex = (activeIndex + delta + currentRows.length) % currentRows.length;
  updateActive();
}

function selectClient(c) {
  selectedClientId = String(c.id);
  selectedBox.textContent = `✓ Selected: ${clientLabel(c)}`;
  selectedBox.hidden = false;
  closeList();
  btn.disabled = false;
  status.textContent = 'Ready to autofill.';
}

function clearSelection() {
  selectedClientId = '';
  selectedBox.textContent = '';
  selectedBox.hidden = true;
  btn.disabled = true;
}

function getVisaPreset() {
  const checked = document.querySelector('input[name="visa_preset"]:checked');
  return checked ? checked.value : '';
}

function buildClientPayload(base) {
  const preset = getVisaPreset();
  if (!preset) return base;
  // Override only the choice field tied to the visa scenario, so the
  // client's identity / contact fields stay intact.
  return { ...base, visa_type: preset };
}

window.addEventListener('DOMContentLoaded', async () => {
  status.textContent = 'Checking backend...';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_CLIENTS' });
    if (response?.ok) {
      allClients = response.rows || [];
      clientsById = new Map(allClients.map((c) => [String(c.id), c]));
      search.disabled = allClients.length === 0;
      status.textContent = `Backend OK (${response.source}) — ${allClients.length} client(s) loaded`;
    } else {
      status.textContent = `Backend error: ${response?.error || 'no response'}`;
    }
  } catch (err) {
    status.textContent = `Backend error: ${err.message}`;
  }
});

// Typing re-filters in realtime and invalidates any committed selection.
search.addEventListener('input', () => {
  if (selectedClientId) clearSelection();
  runFilter();
});

// Focusing an enabled box opens the list (all clients when the query is empty).
search.addEventListener('focus', () => { if (!search.disabled) runFilter(); });

// Close on blur; a result's mousedown commits the pick before this fires.
search.addEventListener('blur', () => { closeList(); });

search.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); moveActive(1); break;
    case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
    case 'Enter':
      if (isOpen && activeIndex >= 0 && currentRows[activeIndex]) {
        e.preventDefault();
        selectClient(currentRows[activeIndex].client);
      }
      break;
    case 'Escape':
      if (isOpen) { e.preventDefault(); closeList(); }
      break;
  }
});

btn.addEventListener('click', async () => {
  const baseClient = clientsById.get(selectedClientId);
  if (!baseClient) {
    status.textContent = 'Pick a client first.';
    return;
  }
  const client = buildClientPayload(baseClient);
  status.textContent = 'Autofilling — filling every section…';
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = 'No active tab found.';
      return;
    }
    // The content script acknowledges immediately and runs the multi-section walk
    // detached, so this request resolves fast and never holds the channel open.
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL', client, autoAdvance: true });
    if (response?.ok) {
      const presetNote = getVisaPreset() ? ` · preset: ${getVisaPreset()}` : '';
      status.textContent = `Autofill running — every section fills automatically.${presetNote}`;
    } else {
      status.textContent = response?.error ? `Error: ${response.error}` : 'No content script responded.';
    }
  } catch (err) {
    // Most common cause: tab was opened before the extension was installed — refresh the tab.
    status.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = !selectedClientId;
  }
});

// The detached walk reports back when it finishes a form. Update the status if the
// popup is still open (it often isn't — the form steals focus and closes it).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'AUTOFILL_DONE') return;
  if (msg.ok === false) {
    status.textContent = `Error: ${msg.error || 'autofill failed'}`;
    return;
  }
  let host = 'form';
  try { host = new URL(msg.url).hostname || host; } catch (_) { /* keep default */ }
  const filledCount = msg.filled?.length ?? 0;
  const skippedCount = msg.skipped?.length ?? 0;
  status.textContent = `Filled ${filledCount} on ${host}`
    + (skippedCount ? ` (skipped ${skippedCount})` : '')
    + (msg.capped ? ' · page cap reached' : '');
});
