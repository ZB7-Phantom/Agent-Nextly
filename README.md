# Nextly

**An AI practice tutor that teaches software by verifying what you actually built — not by trusting what you say you did.**

Nextly is a hackathon proof of concept for a different way to learn AI-native software: build a real outcome in the real tool, receive the next best instruction, and advance only when the workspace proves the step is complete.

The current demo uses Notion to prove the model. It includes guided builds and tiered practice challenges, but Notion is the first integration — not the product's limit.

## The problem

Most software-learning experiences share the same blind spot:

- **Courses, documentation, and videos** explain a workflow, but cannot see whether the learner applied it correctly.
- **Recorded step guides** turn a path into instructions, but still rely on the learner to self-report completion.
- **General AI chat** can give excellent guidance, but normally cannot distinguish “I finished it” from “I said I finished it.”

That is a serious gap in software where work can look plausible but still be wrong: automations with branching logic, spreadsheet formulas, database relationships, or no-code app logic.

**Nextly closes that gap with a teach → build → verify loop.** It guides the learner through a real task, reads structured state from the connected workspace, identifies the precise missing requirement, and unlocks progress only when the result is verified.

## Why Notion

Notion is the cleanest environment to prove the mechanism:

- Its API exposes structured workspace state: child databases, property types, and database rows.
- That state lets Nextly verify a real end result without relying on screenshots, OCR, or self-reporting.
- The same pattern can extend to tools with inspectable APIs, including Airtable, Google Sheets, automation platforms, and no-code tools.

Notion proves that live, state-based teaching works. Future integrations can take the model to tools where correctness is even harder to judge by eye.

## How it works

1. Choose a guided Notion build or a tiered practice challenge.
2. Nextly gives a compact next action and an explicit click-by-click guide.
3. Build the step in your own shared Notion workspace — there is no simulated sandbox.
4. When you press **Verify step**, Nextly checks the live Notion API state.
5. If the state is incomplete, it explains the exact gap and why it matters.
6. If the state passes, Nextly advances to the next milestone. Progress is earned, not self-reported.

## What the demo verifies

The app currently supports three Notion builds:

| Build | Verified outcome |
| --- | --- |
| Habit tracker | Inline `Habit Tracker` database, checkbox property, date property, and at least three rows |
| Project planner | Inline `Project Planner` database, select property, date property, and at least three rows |
| Reading list | Inline `Reading List` database, URL property, multi-select property, and at least three rows |

It also includes a **Practice Lab** with Beginner, Intermediate, and Advanced assignments. At completion, the demo displays a score built from verified completion, checkpoint accuracy, and time/checkpoint efficiency.

> **An honest limitation:** “Flow” in this demo measures verified checkpoint efficiency and elapsed practice time. It does not claim to see every click or detour inside Notion. Browser-level interaction telemetry is a future extension.

## Why the AI does not decide correctness

The LLM never decides whether a learner passed.

`server.js` owns progression with deterministic JavaScript verifiers that query the Notion API:

- `GET /v1/blocks/{page_id}/children` finds the relevant child database.
- `GET /v1/databases/{id}` finds its accessible data source.
- `GET /v1/data_sources/{id}` inspects property schema.
- `POST /v1/data_sources/{id}/query` checks the row count.

Every milestone returns a structured `pass`, `fail`, or `partial` result with evidence and missing requirements. Gemini only turns that verified result into concise, helpful coaching. It cannot advance the learner or invent workspace state.

## Tech stack

- Node.js + Express
- Minimal single-page HTML, CSS, and JavaScript frontend
- Notion REST API for live workspace verification
- Google Gemini API for short instructional narration and learner Q&A
- Deterministic, hard-coded verifier functions for trustworthy demo outcomes

## Run locally

### 1. Create and share a Notion integration

Create an internal Notion integration, copy its secret, then share one empty parent page with that integration. Nextly can only inspect content beneath that shared page.

### 2. Configure environment variables

Copy the example file:

```bash
copy .env.example .env
```

Fill in `.env`:

```env
NOTION_TOKEN=secret_...
NOTION_PARENT_PAGE_ID=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Install and start

```bash
npm install
npm start
```

Then visit [http://localhost:3000](http://localhost:3000).

## Demo script

For the strongest judge-facing moment:

1. Open a clean parent Notion page shared with the integration.
2. In Nextly, start **Build a habit tracker in Notion**.
3. Complete the database and checkbox milestones, then let Nextly verify them.
4. On the date milestone, deliberately skip the date property and press **Check now**.
5. Nextly identifies that specific missing schema requirement from the live API state.
6. Add the date property, verify it, add three rows, and complete the path.
7. Optionally repeat via a tiered Practice Lab challenge to show the verified scorecard.

## Current scope

This is intentionally a narrow hackathon demo. It does **not** include OAuth, user accounts, arbitrary goal parsing, persistent learner profiles, general-purpose templates, browser-extension monitoring, or recovery for off-script setups.

Those constraints keep the central claim clear: **Nextly teaches by asking the learner to do the work, then verifying the real result.**

## Roadmap

- More software integrations where correctness is difficult to eyeball
- Reusable goal and verification templates
- Proactive in-product guidance through a browser extension
- Richer mastery scoring based on real interaction data
- Learner profiles and adaptive practice difficulty

---

Built for OpenAI Build Week with Codex. 
