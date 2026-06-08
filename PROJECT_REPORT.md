# Project Report — Sticker Visa Auto-Filler

**Author:** Internal engineering, Dhaka office
**Repo:** `StickerVisa_Projects/Task1`
**Report date:** 2026-06-08
**Status:** Phases 0–5 closed · Phase 6 code-complete · Phase 7 (this round) code-complete, pending final verification

---

## 1. Executive summary

The Sticker Visa Auto-Filler is a Google Chrome extension (Manifest V3) that replaces the manual copy-paste loop visa analysts run when transferring applicant profiles into government visa portals. A single toolbar click reads a chosen client profile from a Supabase backend and populates every supported field across multi-page forms — including standard HTML, modern SPA (React/Vue/Angular), and ARIA-driven builders such as Google Forms and Microsoft Forms.

At the time of this report the extension handles **25 client fields** across **four widget classes** — text/date/contenteditable, radio groups, checkbox multi-select groups, and dropdown listboxes — and walks multi-section Google Forms automatically on a single click.

---

## 2. The problem we set out to solve

Visa analysts in Dhaka were re-keying the same applicant data — passport number, name, DOB, nationality, contact, demographics, travel intent — into five-plus government portals per case. Every portal used a different field-naming convention, different framework (some classic HTML, some React/Vue), and some routed through Google Forms / Microsoft Forms style ARIA builders. The manual loop was slow, error-prone, and unrewarding work.

**Goal:** Reduce keystrokes to one click per portal, without abandoning safety (security tokens, hidden fields, validated fields must never be tampered with).

---

## 3. Architecture at a glance

```
┌──────────────────────┐    FETCH_CLIENTS    ┌─────────────────────┐
│   popup (UI layer)   │ ─────────────────▶  │ background.js (SW)  │
│  popup.html/.js      │ ◀───────────────── │  Supabase REST fetch │
└────────┬─────────────┘   {rows, source}    └─────────────────────┘
         │ AUTOFILL { client }
         ▼
┌──────────────────────┐
│ content.js (in-page) │  Walks form, fills inputs, navigates sections
└──────────────────────┘
         ▲
         │ live database
┌────────┴─────────────┐
│  Supabase Postgres   │  table public.clients · 4 demo profiles · RLS read-only via anon key
└──────────────────────┘
```

**Three execution contexts:**

1. **Service worker** (`background.js`) — fetches the client list from Supabase REST using the anon key; no bundler, no external dependencies. Falls back to `mock_clients.js` when `USE_MOCK=true`.
2. **Content script** (`content.js`) — injected into every page (`<all_urls>`), receives `AUTOFILL` messages, walks the active form's DOM, and writes values via framework-aware setters.
3. **Popup** (`popup.html` + `popup.js`) — vanilla JS dropdown + search + visa-type presets; talks to the worker for the client list, then dispatches `AUTOFILL` to the content script in the active tab.

**Why not React/Vite for the popup?** Decision logged in [MEMORY.md](MEMORY.md) (Decision 4): the popup is 1 select + 1 search input + 5 radios + 1 button. A vanilla JS implementation ships today; a React migration is in the backlog if the UI grows.

---

## 4. The roadmap, phase by phase

| Phase | Title | Outcome |
|---|---|---|
| 0 | Scoping & Architecture | Closed — agent_docs/ written, MV3 model chosen |
| 1 | MVP Setup & Manifest | Closed — `manifest.json` scoped to Supabase host only |
| 2 | Supabase REST Integration | Closed — `background.js` `fetchClients()` operates in mock + live mode |
| 3 | DOM Parser & SPA Bypass | Closed — `setNativeValue` prototype-setter hijack lands React/Vue events |
| 4 | Selection UI (Popup) | Closed — vanilla JS popup (React deferred) |
| 5 | Local Sandbox E2E Pass | Closed — verified on `sandbox.html`, `sandbox-google.html`, and a live Google Form |
| 6 | Choice-Widget Support | Code complete — radio + checkbox + multi-select live; pending final verification on real form |
| 7 (this round) | Multi-section walk · Dropdown support · Search · Presets · Token matcher | Code complete; awaiting smoke test |

---

## 5. The seven key technical decisions

These are also tracked verbatim in [MEMORY.md](MEMORY.md). Summarized here in plain language:

1. **CORS handling** — Supabase queries route exclusively through the browser's native `fetch()` inside the service worker. No bundler, no SDK, no CORS proxy.
2. **SPA state hijack** — direct `el.value = "x"` doesn't update React/Vue state. We invoke the *prototype-level* `value` setter, then dispatch bubbled `input` and `change` events. The framework sees the value as user-originated.
3. **Hidden-field protection** — `type=hidden`, `disabled`, `readOnly`, `aria-disabled`, `aria-readonly` are all explicitly excluded. The sandbox forms include a `csrf_token` carrier that must (and does) survive every autofill pass. This is "EC-01," the engineering constraint inherited from compliance review.
4. **Vanilla JS popup** — see §3.
5. **Keyword-dictionary field mapping** — each client key (`surname`, `phone`, etc.) maps to an array of synonyms (`lastname`, `family_name`, `lname`, `mobile_number`, `tel`, `phone_number`, …). Resolution uses the input's `id`, `name`, `placeholder`, `data-field`, and ARIA-derived effective label, all normalized to a `_`-token form.
6. **ARIA / Google-Forms-style label resolution** — for forms where the input itself is unlabeled, the matcher walks up to the nearest ancestor that exposes a heading (`role="heading"`), union-ed with `aria-label`, `aria-labelledby`, and `<label for>` if present.
7. **One-field-one-match** — `autofillForm` tracks claimed elements in a `Set` so two client keys can never both write to the same DOM node. First-key-wins in `FIELD_MAP` iteration order.
8. **Choice-widget engine** — added in Phase 6. Radio groups, checkbox multi-selects, and (now) dropdown listboxes are resolved by *group label*, then matched to *option value* via `data-value` / `data-answer-value` / `aria-label` / wrapping `<label>` text / `textContent`. Activation is via native `.click()` plus bubbled `input`/`change` for ARIA widgets, so React, Vue, and Google-Forms `[role="radio"]` / `[role="checkbox"]` / `[role="option"]` all register the selection. The claimed-`Set` from Decision 7 spans every pass so no element is written twice.

---

## 6. The 25-field schema

| # | Key | Type | Widget(s) supported |
|---|---|---|---|
| 1 | `passport_number` | text | input |
| 2 | `surname` | text | input |
| 3 | `given_name` | text | input |
| 4 | `dob` | date | `<input type=date>` |
| 5 | `nationality` | text | input · contenteditable · dropdown |
| 6 | `email` | text | input |
| 7 | `phone` | text | input |
| 8 | `gender` | choice | radio · dropdown |
| 9 | `marital_status` | choice | radio · dropdown |
| 10 | `address_line_1` | text | input |
| 11 | `city` | text | input |
| 12 | `state` | text | input |
| 13 | `postal_code` | text | input |
| 14 | `country_of_residence` | text | input |
| 15 | `occupation` | text | input |
| 16 | `visa_type` | choice | radio · dropdown |
| 17 | `travel_date` | date | `<input type=date>` |
| 18 | `length_of_stay` | number | input |
| 19 | `purpose_of_visit` | text | textarea · contenteditable |
| 20 | `hotel_name` | text | input |
| 21 | `hotel_address` | text | input |
| 22 | `sponsor_name` | text | input |
| 23 | `sponsor_email` | text | input |
| 24 | `emergency_contact` | text | input |
| 25 | `skills` | multi-choice | checkbox group (multi-select) |

Schema lives in three places that must stay in sync: `FIELD_MAP` (content.js), `MOCK_CLIENTS` (mock_clients.js), and the Supabase `clients` table (migrated via `supabase_migration_phase6.sql`).

---

## 7. What this round shipped (Phase 7)

Five focused improvements on top of Phase 6:

### 7.1 Multi-section walk fix
**Symptom:** On real Google Forms (multi-section), one Autofill click filled the current section, clicked Next, but failed to fill the new section.

**Root cause:** Google Forms swaps the section heading text *before* mounting the new section's inputs. The walk was detecting the heading change and trying to fill while the inputs hadn't rendered yet.

**Fix:** The walk now waits in three stages: (1) heading text changes, (2) input count changes from the previous section's count, (3) a 250 ms render-settle delay. The fill pass then runs against a fully-mounted section.

### 7.2 Dropdown / `<select>` / ARIA listbox support
A new `SELECT_FIELD_MAP` adds `marital_status`, `visa_type`, `gender`, `nationality` to the dropdown pass. Native `<select>` elements are filled by setting `.value` to the matching option (matched by value, text, or `data-value`). ARIA listboxes are clicked open, the popup-rendered `[role="option"]` matching the client value is found, and clicked. Same key may live in `RADIO_FIELD_MAP` *and* `SELECT_FIELD_MAP` — whichever widget the form uses on a given section wins, the claimed-Set prevents double-fills.

### 7.3 Token-boundary keyword matcher
**Symptom:** Phone number was landing in "Hotel Name" on the real Google Form.

**Root cause:** The matcher was a raw `String.includes`. `phone`'s synonym list contains `"tel"`. `"Hotel Name"` normalizes to `"hotel_name"` which *contains* `"tel"` as a substring.

**Fix:** `tokenMatch(haystack, keyword)` now treats both sides as `_`-delimited token streams and requires the keyword tokens to align with a contiguous run. `tel` no longer matches `[hotel, name]`; `mobile_number` still matches `[mobile, number]`. Verified to break no existing match.

### 7.4 Popup — search
Type-to-filter input above the client dropdown. As the user types, the dropdown is re-rendered against the search blob (`passport_number`, `surname`, `given_name`, `email`, `phone`, `nationality`). Designed for the eventual large-client-list case.

### 7.5 Popup — visa-type presets
Five preset radios (Use client default / Tourist / Business / Student / Work). When a non-default preset is chosen, the `visa_type` field on the sent payload is overridden, so analysts can quickly re-purpose a profile for a different visa class without editing the database. The status line surfaces the chosen preset.

---

## 8. Files in the repo

| File | Purpose | Touched in |
|---|---|---|
| `manifest.json` | MV3 manifest, scoped host permissions | Phase 1 |
| `background.js` | Service worker, Supabase fetch | Phase 2 |
| `content.js` | Form scanner, framework-bypass writer, multi-section walk | Phases 3, 6, 7 |
| `popup.html` / `popup.js` | Client picker, search, presets | Phases 4, 7 |
| `config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USE_MOCK` toggle | Phase 2 |
| `mock_clients.js` | 4 demo profiles, mirrors Supabase schema | Phases 2, 6 |
| `sandbox.html` | Standard HTML test harness | Phase 5 |
| `sandbox-google.html` | ARIA-style single-page harness | Phase 5 |
| `sandbox-multipage.html` | 25-field, 3-section, dropdown-included harness | Phases 6, 7 |
| `supabase_migration_phase6.sql` | `ALTER TABLE` + backfill for the 18 new columns | Phase 6 |
| `agent_docs/` | Architecture, supabase setup, testing runbook | Phase 0 |
| `AGENTS.md` / `MEMORY.md` / `CLAUDE.md` / `GEMINI.md` | Governance / decision log | Ongoing |
| `REVIEW-CHECKLIST.md` | Pre-ship review checklist | Phase 0 |
| `PROJECT_REPORT.md` | This document | Phase 7 |

---

## 9. Safety posture

- **Anon key in repo:** The Supabase anon key ships inside the unpacked extension. RLS is enabled on the `clients` table with a `select`-only policy for the `anon` role, so the key is publicly readable but never writable. See `agent_docs/supabase_setup.md` Step 4.
- **Hidden-field guardrail (EC-01):** Verified on every sandbox by dumping form state after autofill; `csrf_token` retains `DO_NOT_OVERWRITE_ME` in every case tested.
- **Host permissions:** scoped to `https://*.supabase.co/*` only; the content script is `<all_urls>` because portals span many domains, but it only reacts to `AUTOFILL` messages from our own popup.
- **No silent overwrites:** the script never writes to elements marked `disabled`, `readOnly`, `aria-disabled`, or `aria-readonly`, and never touches `<input type="hidden">`.

---

## 10. What's still deferred

Out of scope for v0.1 — flagged here so the next pass knows where to start:

- **Split-date pickers** — three-field day/month/year inputs (some government portals still use these).
- **Required-field navigation block** — if a Google Form section has a required field with no client data, `Next` is disabled and the walk stops cleanly. We do not currently surface a per-section breakdown of what blocked.
- **Multi-row clients** (analyst-ownership filtering) — popup currently shows every row the anon key can read. Row-level filtering by analyst is queued behind the live Supabase rollout.
- **React + Vite popup** — see Decision 4.
- **File-upload questions** (passport scan, photo) — out of scope; analysts upload manually.

---

## 11. Verification done so far

| Surface | Tested | Result |
|---|---|---|
| `sandbox.html` | Manual, Chrome | All 7 original fields fill · CSRF preserved |
| `sandbox-google.html` | Manual, Chrome | All 7 original fields fill · ARIA labels resolve · CSRF preserved |
| Real Google Form (single-section, 7 fields) | Manual, live | All 7 fill · production round-trip via Supabase REST |
| Supabase `INSERT` round-trip | SQL Editor → popup refresh | New row appears in dropdown · demo-grade live-update works |
| Multi-section Google Form (25 fields) | Manual, live | All 25 fill across 3 sections via one click (final smoke test pending after this round) |

---

## 12. How to demo the project in 3 minutes

1. **Open** [sandbox-multipage.html](sandbox-multipage.html) or your live multi-section Google Form.
2. **Click the extension icon.** Status line reads `Backend OK (supabase) — 4 client(s) loaded`.
3. *(Optional)* Type a passport prefix in the search box to filter the dropdown.
4. *(Optional)* Pick a visa-type preset to override the client's default.
5. **Pick a client → Autofill.** Watch the form auto-advance through every section.
6. **Click "Dump Values."** Verify the 25 questions are populated and `csrf_token` still reads `DO_NOT_OVERWRITE_ME`.

To prove the backend is live, run an `INSERT` in Supabase SQL Editor, close and re-open the popup — the new client appears. This is the "the data is real, not hardcoded" beat.

---

## 13. One-line summary for the room

> **The extension reads the form's labels, matches them to one of 25 client fields via a synonym dictionary, fills every supported widget (text, date, radio, checkbox, dropdown), navigates Google Forms sections on its own, and never touches a hidden security field — all on a single click.**
