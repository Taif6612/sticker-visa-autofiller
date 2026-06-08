import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_MOCK } from './config.js';
import { MOCK_CLIENTS } from './mock_clients.js';

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Sticker Visa Auto-Filler] installed:', details.reason);
});

async function fetchClients() {
  if (USE_MOCK) return MOCK_CLIENTS;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res.json();
}

// ---- Trusted-input bridge (chrome.debugger / CDP) -----------------------
// Google Forms gates its dropdown jsaction handlers on event.isTrusted, which a
// content script's synthetic events can never satisfy. The Chrome DevTools Protocol
// Input domain dispatches REAL trusted input that passes that gate. debugger is a
// background-only API, so the content script asks us to click at viewport coords.
// Trade-off: Chrome shows a "started debugging this browser" banner while attached.

const attachedTabs = new Set();
const DEBUGGER_PROTOCOL = '1.3';

function attachDebugger(tabId) {
  return new Promise((resolve) => {
    if (attachedTabs.has(tabId)) return resolve({ ok: true });
    chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        // "Already attached" can mean our own orphaned session (service-worker
        // restart) — optimistically proceed. If it's DevTools, the first command
        // will fail and the caller falls back. Either way, surface the message.
        if (/already attached|another debugger/i.test(err.message || '')) {
          attachedTabs.add(tabId);
          return resolve({ ok: true, note: err.message });
        }
        return resolve({ ok: false, error: err.message });
      }
      attachedTabs.add(tabId);
      resolve({ ok: true });
    });
  });
}

function sendCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params || {}, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res);
    });
  });
}

async function trustedClick(tabId, x, y) {
  const att = await attachDebugger(tabId);
  if (!att.ok) return { ok: false, error: att.error || 'attach-failed' };
  const pt = { x: Math.round(x), y: Math.round(y) };
  try {
    await sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...pt, button: 'none', buttons: 0 });
    await sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...pt, button: 'left', buttons: 1, clickCount: 1 });
    await sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...pt, button: 'left', buttons: 0, clickCount: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const KEY_DEFS = {
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
};

// Trusted keyboard via CDP — isTrusted AND carries real virtual key codes, which a
// synthetic KeyboardEvent cannot (keyCode/which are read-only). Drives Google Forms'
// listbox keydown handler the way an actual keypress would.
async function trustedKey(tabId, keyName) {
  const att = await attachDebugger(tabId);
  if (!att.ok) return { ok: false, error: att.error || 'attach-failed' };
  const d = KEY_DEFS[keyName];
  if (!d) return { ok: false, error: `unknown-key:${keyName}` };
  const base = { key: d.key, code: d.code, windowsVirtualKeyCode: d.vk, nativeVirtualKeyCode: d.vk };
  try {
    await sendCommand(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    if (d.text) await sendCommand(tabId, 'Input.dispatchKeyEvent', { type: 'char', ...base, text: d.text });
    await sendCommand(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function detachDebugger(tabId) {
  return new Promise((resolve) => {
    if (!attachedTabs.has(tabId)) return resolve({ ok: true });
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId); // ignore lastError — tab may already be gone
      resolve({ ok: true });
    });
  });
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attachedTabs.delete(source.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => attachedTabs.delete(tabId));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'PING') {
    sendResponse({ ok: true, from: 'background' });
    return;
  }
  if (msg?.type === 'FETCH_CLIENTS') {
    fetchClients()
      .then((rows) => sendResponse({ ok: true, rows, source: USE_MOCK ? 'mock' : 'supabase' }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === 'TRUSTED_CLICK') {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok: false, error: 'no-tab' }); return; }
    trustedClick(tabId, msg.x, msg.y).then(sendResponse);
    return true;
  }
  if (msg?.type === 'TRUSTED_KEY') {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok: false, error: 'no-tab' }); return; }
    trustedKey(tabId, msg.key).then(sendResponse);
    return true;
  }
  if (msg?.type === 'TRUSTED_DETACH') {
    const tabId = sender.tab?.id;
    if (tabId == null) { sendResponse({ ok: true }); return; }
    detachDebugger(tabId).then(sendResponse);
    return true;
  }
});
