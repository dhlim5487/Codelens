### In progress ###

Still updating and amending

# CodeLens

Read, interpret, and fix AI-generated code. Paste a file and get three things:

1. **Summary** — a one-liner + short paragraph on what the code does and how it flows.
2. **Section map** — the whole file split top-to-bottom into labeled sections, with the 2–4 most important ones marked as **milestones**. Hover a section to highlight it in the code; click it for a line-by-line walkthrough.
3. **Bugs** — real defects (not style nags) with a plain-language explanation and a ready-to-paste fix. When a fix depends on what you intended, it asks you a question first.

It runs entirely on your own machine and opens in your browser. Your API key stays in the local server and is never sent to the frontend.

---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## One-time setup

You need [Node.js](https://nodejs.org) (version 18 or newer). Check with:

node --version

Then, in this folder:

npm install

Add your API key:

1. Copy `.env.example` to a new file named `.env`
2. Open `.env` and paste your key after `ANTHROPIC_API_KEY=`
   (get one at https://console.anthropic.com)

On Windows, you can copy the file with:

copy .env.example .env

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## Running it

npm run dev

This starts both the backend (port 8787) and the web app (port 5173).
Open **http://localhost:5173** in your browser. That's it.

To stop it, press `Ctrl + C` in the terminal.

--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## How it maps to the resume tool

Same five-stage spine you already know:

| Stage | Resume tool | CodeLens |
|-------|-------------|----------|
| Input | resume + posting | code (paste or file) |
| Resolve | fetch/merge posting | detect language, split into lines |
| Analyze | gaps + flags (parallel) | summary/map + bugs (parallel) |
| Review & Fix | accept/edit bullets | copy/mark fixes, answer-driven drafts |
| Extend | similar roles, prep Qs | per-section walkthroughs |

The `askClaude` self-repair pass (retry once on malformed JSON) is carried over directly.

## Online vs Offline

There's a toggle at the top (**☁ Online / ⌂ Offline**). Pick either before you analyze; you can switch and re-run anytime.

- **Online** uses Claude through the Anthropic API. Best quality, needs the key in `.env` and an internet connection.
- **Offline** uses a local model through [Ollama](https://ollama.com) — nothing leaves your machine, no key, no internet. Lower quality on tricky logic bugs, but solid for summaries and section maps.

The hint line under the controls tells you whether the selected mode is actually ready.

### Setting up offline mode (one time)

1. Install Ollama from https://ollama.com
2. Pull a code model: `ollama pull qwen2.5-coder:7b`
3. Make sure it's running: `ollama serve` (it usually starts on its own)

Then just flip the toggle to Offline. To use a different local model, change `OLLAMA_MODEL` in `.env`.

## Deploy it (share a link)

Backend on Render, frontend on Vercel — same as the resume evaluator. The deployed app is **online-only**; the offline toggle hides itself automatically in the cloud (a visitor's machine has no Ollama), but stays fully working when anyone runs the project locally.

1. **Push to GitHub** — confirm `.env` is not committed (it's in `.gitignore`).
2. **Backend on Render** — render.com → New → Web Service → pick your repo. It reads `render.yaml` automatically. In the service's Environment tab, add `ANTHROPIC_API_KEY` = your key. Deploy, then copy the URL (e.g. `https://codelens-api.onrender.com`).
3. **Frontend on Vercel** — vercel.com → Add New → Project → same repo. Framework: Vite. Add env var `VITE_API_BASE` = your Render URL (no trailing slash). Deploy; share the Vercel URL.
4. **Keep it awake** — Render's free backend sleeps after 15 min idle. Set a free pinger at [cron-job.org](https://cron-job.org) to hit `https://YOUR-RENDER-URL.onrender.com/api/health` every 10 minutes so visitors always get an instant response.

## Notes

- **Cost (online):** each analysis is two calls (map + bugs) sized to your file. A few hundred lines is well under a cent on Sonnet. Offline is free. Walkthroughs and answer-drafts are extra small calls, only when you click.
- Nothing is stored. Refreshing the page clears everything.
- 
