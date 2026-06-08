# Sticker Visa Auto-Filler

> A Manifest V3 Chrome extension that fills visa-applicant profiles into government portal forms — standard HTML, SPA frameworks, and Google Forms — in a single click.

Visa case analysts re-key the same applicant details (passport, name, DOB, nationality, contact, demographics, travel intent) into five-plus different government portals per case. This extension reads a chosen client profile from a Supabase backend and populates every supported field across multi-page forms automatically, while never touching hidden security fields.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Usage](#usage)
- [The client schema](#the-client-schema)
- [Admin tool](#admin-tool)
- [Test harnesses](#test-harnesses)
- [Known limitations](#known-limitations)
- [Security notes](#security-notes)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **One-click autofill** across **25 client fields** (identity, contact, demographics, travel).
- **Four widget classes** supported: text / date / `contenteditable`, radio groups, checkbox multi-select, and dropdown listboxes.
- **Framework-aware injection** — prototype-level value setters + bubbled `input`/`change` events so React / Vue / Angular state machines accept injected data.
- **ARIA & builder-form resolution** — matches fields by `aria-label`, `aria-labelledby`, the nearest `role="heading"`, and `<label for>` when inputs have no `id`/`name`/`placeholder` (Google Forms, Microsoft Forms).
- **Multi-section walk** — automatically advances through multi-page Google Forms on a single click, resuming across real page navigations.
- **Hidden-field protection (EC-01)** — never writes to `type="hidden"`, `disabled`, `readonly`, or `aria-disabled` elements; verified against a CSRF-token carrier.
- **Searchable popup** — filter clients by passport / name / email; optional visa-type presets.
- **Supabase backend** — zero-dependency REST fetch; mock mode for offline development.
- **Admin web tool** — view / insert / edit / delete the client database without writing SQL.

---

## Architecture

```
┌──────────────────────┐   FETCH_CLIENTS    ┌──────────────────────┐
│   Popup (UI layer)   │ ─────────────────▶ │ background.js (SW)   │
│  popup.html / .js    │ ◀───────────────── │  Supabase REST fetch │
└─────────┬────────────┘   { rows, source } └──────────────────────┘
          │ AUTOFILL { client }
          ▼
┌──────────────────────┐
│ content.js (in-page) │  scans the form, fills inputs, walks sections
└──────────────────────┘
          ▲  live data
┌─────────┴────────────┐
│  Supabase Postgres   │  table: public.clients · RLS · 25-field schema
└──────────────────────┘
```

Three execution contexts:

1. **Service worker** (`background.js`) — fetches clients from Supabase REST (anon key); falls back to `mock_clients.js` when `USE_MOCK = true`. Also hosts a `chrome.debugger` bridge for trusted input on hardened widgets.
2. **Content script** (`content.js`) — receives `AUTOFILL` messages, resolves fields by a keyword dictionary + ARIA labels, and writes values via framework-aware setters.
3. **Popup** (`popup.html` / `popup.js`) — searchable client picker that dispatches the chosen profile to the active tab.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Platform | Google Chrome Extension (Manifest V3) |
| Content logic | Vanilla JavaScript (no build step) |
| Popup UI | Vanilla HTML/CSS/JS |
| Backend | Supabase (PostgREST) via native `fetch` |
| Trusted input | Chrome DevTools Protocol via `chrome.debugger` |

---

## Repository layout

```
.
├── manifest.json                  # MV3 manifest (scoped host permissions)
├── background.js                  # service worker: Supabase fetch + CDP input bridge
├── content.js                     # form scanner / filler / multi-section walk
├── popup.html / popup.js          # searchable client picker
├── config.js                      # SUPABASE_URL, anon key, USE_MOCK toggle
├── mock_clients.js                # 4 demo profiles (mirrors the DB schema)
├── admin.html                     # standalone DB admin tool (view / CRUD)
├── supabase_migration_phase6.sql  # ALTER TABLE + backfill for the 25-field schema
├── sandbox.html                   # standard-HTML test form
├── sandbox-google.html            # ARIA / contenteditable test form
├── sandbox-multipage.html         # 25-field, 3-section, dropdown test form
├── agent_docs/                    # architecture, Supabase setup, testing runbook
├── PROJECT_REPORT.md              # full project narrative
└── AGENTS.md / MEMORY.md          # roadmap + design decision log
```

---

## Getting started

### 1. Load the extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select this project folder.
3. Pin the extension to the toolbar.

### 2. Configure the backend

Edit `config.js`:

```js
export const SUPABASE_URL = "https://YOUR-REF.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGci...";   // anon public key
export const USE_MOCK = false;                     // true = run without a backend
```

Full backend setup (table schema, RLS, seed data) is in [`agent_docs/supabase_setup.md`](agent_docs/supabase_setup.md). To add the demographic/travel columns to an existing table, run [`supabase_migration_phase6.sql`](supabase_migration_phase6.sql) in the Supabase SQL editor.

Prefer to try it without any backend? Set `USE_MOCK = true` to use the four bundled demo profiles.

---

## Usage

1. Open a target form (a government portal, a Google Form, or one of the bundled sandboxes).
2. Click the extension icon — the popup loads the client list and shows backend status.
3. *(Optional)* type in the search box to filter, or pick a visa-type preset.
4. Select a client → **Autofill Active Form**.
5. The status line reports `Filled N (skipped M)`; multi-section forms advance automatically.

---

## The client schema

25 fields, kept in sync across `content.js` (`FIELD_MAP`), `mock_clients.js`, and the Supabase `clients` table:

`passport_number`, `surname`, `given_name`, `dob`, `nationality`, `email`, `phone`,
`gender`, `marital_status`, `address_line_1`, `city`, `state`, `postal_code`,
`country_of_residence`, `occupation`, `visa_type`, `travel_date`, `length_of_stay`,
`purpose_of_visit`, `hotel_name`, `hotel_address`, `sponsor_name`, `sponsor_email`,
`emergency_contact`, `skills` (array).

---

## Admin tool

`admin.html` is a standalone, single-file utility (not part of the extension bundle) to manage the database without SQL:

- **View** every client in a searchable, exportable (CSV) table.
- **Add / edit / delete** via an auto-generated, grouped form.
- Talks to Supabase PostgREST directly; credentials are entered once and kept in `localStorage`.

Open it directly in a browser. Writes require a key with write permission (an anon write policy, or the `service_role` key kept locally). See the in-page note for details.

---

## Test harnesses

Three offline forms exercise the matching engine without a live portal:

| File | Exercises |
| --- | --- |
| `sandbox.html` | Standard HTML inputs + a hidden CSRF token |
| `sandbox-google.html` | ARIA `role="listitem"` / `contenteditable`, no `id`/`name` |
| `sandbox-multipage.html` | 25 fields across 3 sections, incl. radio / checkbox / dropdown |

Open any of them in Chrome and run an autofill to verify behaviour locally.

---

## Known limitations

- **Google Forms dropdown commit** — Google gates its dropdown handlers on `event.isTrusted`. The extension uses a `chrome.debugger` (CDP) bridge to send trusted input; this requires DevTools to be **closed** and shows Chrome's debugging banner while active. Native `<select>` dropdowns are unaffected.
- **Split-date pickers** (separate day/month/year inputs) are out of scope.
- **File-upload questions** (passport scan, photo) are filled manually by the analyst.

---

## Security notes

- The Supabase **anon key** ships in the bundle by design. Row Level Security with a `select`-only policy keeps the `clients` table publicly readable but not writable via that key. If the table ever holds real PII (not synthetic demo data), tighten the policy.
- Host permissions are scoped to `https://*.supabase.co/*`.
- The content script never overwrites hidden, disabled, or read-only fields.
- **Do not** commit a `service_role` key or any real production secret to this repository.

---

## Roadmap

- [x] MV3 setup, Supabase integration, SPA bypass
- [x] Searchable popup + visa-type presets
- [x] Radio / checkbox / multi-select / dropdown support
- [x] Multi-section Google Forms auto-advance
- [x] Standalone database admin tool
- [ ] Split-date picker support
- [ ] Row-level filtering by analyst ownership
- [ ] Optional React + Vite popup migration

See [`AGENTS.md`](AGENTS.md) for the phase roadmap and [`MEMORY.md`](MEMORY.md) for the full design-decision log.

---

## License

[MIT](LICENSE) © 2026 Sticker Visa Auto-Filler
