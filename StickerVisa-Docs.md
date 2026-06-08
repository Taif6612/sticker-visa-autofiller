# Product Requirements Document: Sticker Visa Auto-Filler MVP

## 1. Introduction & Objectives
The **Sticker Visa Auto-Filler** is a productivity-focused Google Chrome Extension designed to eliminate manual data entry for visa case analysts. By mapping structured client profiles directly into multi-page government visa application portals, the tool aims to reduce application processing times and eliminate human copy-paste errors.

### Core Goals
*   **Speed:** Reduce form-filling time for standard visa applications by 80%.
*   **Accuracy:** Prevent typos in critical fields like Passport Numbers and Names.
*   **Framework Agility:** Successfully fill forms built with modern frontend frameworks (React, Vue, Angular) without losing data on submission.

---

## 2. User Personas & Flows
### Target User
*   **Visa Case Analyst / Processing Specialist:** Handles dozens of complex student or tourist visa applications daily. They require a reliable tool that doesn't conflict with official portals.

### User Flow
1. User navigates to an official visa application portal form page.
2. User opens the extension popup from the browser toolbar.
3. User selects a client profile from a dropdown list (simulated/mocked database).
4. User clicks **"⚡ Autofill Active Form"**.
5. The extension parses the visible DOM, identifies matching input fields, and injects the data instantly.

---

## 3. Scope & MVP Features

### In-Scope (Must-Have)
*   **Manifest V3 Compatibility:** Built to modern Chromium extension standards.
*   **Multi-Field Dictionary Mapping:** A flexible identifier matrix matching keys like `passport_number` to multiple DOM attributes (`id`, `name`, `placeholder`).
*   **SPA State Override:** Programmatic dispatch of native browser events (`input`, `change`) to update underlying React/Vue component states.
*   **Basic Popup UI:** Single-button interface to trigger data injection instantly.

### Out-of-Scope (Excluded for MVP)
*   Encrypted credentials vaulting.
*   Automatic multi-page multi-step form navigation macro tracking.
*   Direct live mutations back to a production CRM database.

---

## 4. Functional Requirements & Edge Cases

| Feature ID | Feature Description | Acceptance Criteria | Handling Strategy |
| :--- | :--- | :--- | :--- |
| **FR-01** | Field Mapping | Matches input fields regardless of country-specific naming variations. | Fallback keyword search array within an identifier string. |
| **FR-02** | Framework Sync | Values injected by the script must remain in the input on submit. | Prototype setter injection along with bubble-up browser event triggers. |
| **EC-01** | Hidden Fields | Must not overwrite hidden tokens, security tokens, or CAPTCHAs. | Explicitly skip inputs where `type === 'hidden'`. |

---
---

# Technical Design Document: Sticker Visa Auto-Filler MVP

## 1. Architecture Overview
The application is a standalone Google Chrome Extension built on Manifest V3. It operates without a local server, using native browser messaging to pass data from a remote mock endpoint down into the active webpage's DOM.

### Core Components
1. **Popup UI (`popup.html` / `popup.js`)**: The user-facing trigger. Runs in its own isolated context.
2. **Background Service Worker (`background.js`)**: The data fetcher. Handles network requests to external APIs (or local mock data) to bypass CORS issues on the client side.
3. **Content Script (`content.js`)**: The DOM manipulator. Injected into the active tab to map data keys to HTML inputs and dispatch native browser events.

## 2. Technology Stack
*   **Framework:** Vanilla JavaScript, HTML5, CSS3.
*   **Extension Standard:** Manifest V3 (MV3).
*   **Data Source:** Static JSON (Mock API via GitHub/Supabase/Local fallback).
*   **Build Tools:** None. (Zero-dependency architecture chosen for maximum speed and 12-hour deadline).

## 3. Core Mechanisms

### 3.1 Flexible Dictionary Mapping
Visa portals frequently change their input names (e.g., `given_name` vs `FirstName`). The content script will use a dictionary-based fallback system.
```javascript
// Example Mapping Structure
const mapping = {
  "passport_number": ["passport", "ppt_no", "document_no", "pass_num"],
  "given_name": ["given_name", "first_name", "firstname"]
};