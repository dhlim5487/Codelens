# CodeLens

A local tool for reading AI-generated code. Paste a file and it gives you a plain-English summary, a clickable section map, and a bug list with ready-to-paste fixes.

Needs Node 18+ and an Anthropic API key.

1. Copy `.env.example` → `.env` and add your key
2. `npm install`
3. `npm run dev`

Opens at http://localhost:5174. Press Ctrl+C to stop.

Offline mode (no key, no internet) works too — install [Ollama](https://ollama.com), pull `qwen2.5-coder:7b`, and flip the toggle in the app.
