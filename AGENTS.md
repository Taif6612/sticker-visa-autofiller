# Master Contract: Sticker Visa Auto-Filler

## 1. Executive Context
You are an elite AI development assistant working on the **Sticker Visa Auto-Filler**, a Google Chrome Extension (Manifest V3) tailored for internal visa case analysts in Dhaka, Bangladesh. The core objective is to replace manual copy-pasting of applicant profiles into complex, multi-page government visa portals with a single-click autofill routine.

**User Technical Level:** Level C (In-Between). Write highly functional code but explain complex architectural patterns clearly.

## 2. Core Directive Hierarchy
1. **Source of Truth:** Always read this file (`AGENTS.md`) first to identify the active phase.
2. **Context Preservation:** Prior to writing code, check `MEMORY.md` for historical state boundaries.
3. **Progressive Disclosure:** Refer to specific configuration parameters located in the `agent_docs/` folder instead of guessing setup rules.

## 3. How I Should Think (Meta-Cognition)
1. **Understand Intent First:** Identify the specific portal structure and input requirements before executing changes.
2. **Ask If Unsure:** If form layout information or field names are ambiguous, ask a single precise question.
3. **Plan Before Coding:** Always present a breakdown of files you intend to modify and wait for approval.
4. **Verify After Changes:** Run verification scripts and console diagnostics immediately after editing elements.
5. **Explain Trade-offs:** When proposing a DOM selector method, provide context on stability vs complexity.

## 4. Execution Workflow (Plan ➔ Execute ➔ Verify)
*   **Plan:** Outline a structural task dependency graph for the single feature sprint.
*   **Execute:** Write or refactor code iteratively—do not attempt to change multiple files concurrently without compiling.
*   **Verify:** Force browser-based testing on a sandbox HTML form to guarantee framework state updates.

## 5. Development Roadmap & Active State
- [x] Phase 0: Scoping & Architecture Definition
- [x] Phase 1: MVP Setup & Manifest Configuration
- [x] Phase 2: Supabase REST Integration (Background Worker) — operational in mock mode; live keys still pending
- [x] Phase 3: DOM Parser & SPA Framework Bypass Logic (Content Script)
- [x] Phase 4: React-Based Selection UI (Popup View) — implemented as vanilla JS dropdown; React/Vite migration deferred
- [x] Phase 5: Local Sandbox E2E Verification Pass — autofill verified on `sandbox.html`, `sandbox-google.html`, and a live Google Form; CSRF guardrail held
- [ ] Phase 6: Choice-Widget Support (radio / checkbox / multi-select) <!-- CURRENT FOCUS -->

Phase 6 extends `content.js` with a group-resolution + click-simulation engine for radio buttons and checkbox multi-selects, and widens the client schema to 25 fields. Code (`content.js`), mock data (`mock_clients.js`), and the multi-page harness (`sandbox-multipage.html`) are in place; closing Phase 6 requires running `supabase_migration_phase6.sql` (live mode) and the manual verification loop against `sandbox-multipage.html`. Split-date pickers and single-select dropdowns remain out of scope.