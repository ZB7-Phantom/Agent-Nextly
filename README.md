# Nextly — Hackathon Demo

Nextly is a deliberately narrow OpenAI Build Week proof of concept for learning AI-native software through practice. It offers three guided Notion builds—habit tracker, project planner, and reading list—and advances only after deterministic checks against a live Notion workspace pass.

## Golden path

1. Select one workflow and create its specifically named inline database under the pre-shared Notion page.
2. Follow the property and row steps shown in Nextly.
3. Nextly polls the live workspace every seven seconds and automatically advances when a milestone passes. **Check now** remains available for the live demo catch-the-gap moment.

## Why the model cannot judge correctness

`server.js` owns all advancement. It calls only hardcoded Notion endpoints and returns a structured pass/fail/partial diff. It first confirms that the integration can inspect a usable data source, so an inaccessible or linked database block cannot pass milestone 1. Gemini receives that diff only to produce a concise teaching explanation; the frontend advances only from `verification.status === "pass"`.

## Run it

1. In Notion, create an internal integration and manually share one empty parent page with it.
2. Copy `.env.example` to `.env` and fill in the Notion token, the parent page ID, and a Gemini API key. The default model is `gemini-2.5-flash`.
3. Install and run:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:3000`, keep the shared Notion page visible beside it, and perform the golden path above.

For a private repository, share access with `testing@devpost.com` and `build-week-event@openai.com` before submission. The `/feedback` Session ID for this Codex build thread should be included in the Devpost form.

## Scope intentionally excluded

No OAuth, user accounts, arbitrary goal parsing, general-purpose workflows, browser extension, or persistence. This is a small set of rehearsable templates demonstrating live state verification.
