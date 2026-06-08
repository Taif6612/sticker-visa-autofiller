# Technical Design Document: Sticker Visa Auto-Filler MVP

## How We'll Build It

### Recommended Approach: Low-Code Chrome Extension + Supabase

Based on your requirements, tight 12-hour timeline, and goal to pass this interview competency task today, here is the optimal path:

**Primary Recommendation: Manifest V3 Chrome Extension + Supabase JS Client**
*   **Why it's perfect for you:** Supabase gives you a ready-to-use database and a secure REST API out of the box with zero server configuration. This allows you to build a functional backend-connected extension in minutes rather than hours.
*   **What it costs:** $0 (Using Supabase's free tier).
*   **Time to implement:** ~1–2 hours with AI assistance.
*   **Limitations to know:** Content scripts inside extensions cannot easily import external npm modules directly without a bundle tool (like Vite). To save time under your strict deadline, we will interact with Supabase via its standard native `fetch()` REST API endpoint inside the Service Worker (`background.js`) to completely avoid complex build-tool configurations.

---

### Alternative Options Compared

| Option | Pros | Cons | Cost | Time to MVP |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase REST API (Recommended)** | True database functionality, real-time records, easy to demo to the interviewers. | Requires setting up a table and grabbing API keys. | Free Tier | **1–2 Hours** |
| **Static GitHub Raw JSON** | Zero backend configuration; just edit a single file on GitHub. | Read-only; cannot easily add new clients from the extension interface. | Free | **30 Mins** |
| **Node.js/Express Backend** | Complete control over logic and data structures. | Requires manual server deployment, CORS troubleshooting, and hosting setup. | Free (Render/Railway) | **4+ Hours** |

*Justification:* Supabase balances professional-grade architecture with a fast setup time. Choosing the native REST API approach over a complex Vite/Build setup guarantees the extension runs natively in Chrome without build step errors delaying your submission today.

---

## Project Setup Checklist

### Step 1: Create Accounts & Database (Minutes 1–20)
*   [ ] Go to [Supabase](https://supabase.com) and create a free account.
*   [ ] Create a new project named `sticker-visa-db`.
*   [ ] Navigate to the **Table Editor**, click **New Table**, and name it `clients`.
*   [ ] Add the following columns:
    *   `passport_number` (text)
    *   `surname` (text)
    *   `given_name` (text)
    *   `dob` (date)
    *   `nationality` (text)
    *   `email` (text)
    *   `phone` (text)
*   [ ] Insert 1 or 2 mock rows of dummy visa data for live testing.
*   [ ] Go to **Project Settings -> API** and copy your `Project URL` and `anon public` key.

### Step 2: AI Assistant Setup (Minutes 20–30)
*   [ ] Create an empty folder on your machine named `sticker-visa-autofiller`.
*   [ ] Open this folder in **Cursor** or your preferred AI IDE.
*   [ ] Ensure the code generation window is open and configured with access to Claude Sonnet or GPT-4o.

---

## Building Your Features

### Directory Structure
```text
sticker-visa-autofiller/
├── manifest.json       # App configuration
├── popup.html          # Extension view window
├── popup.js            # React-like UI functionality
├── background.js       # Supabase data fetcher (Service Worker)
└── content.js          # DOM Injection & SPA state bypass logic