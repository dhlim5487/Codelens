import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 8787;

// Online (cloud) settings
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";

// Offline (local) settings — Ollama exposes a local API on this host.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

if (!API_KEY) {
  console.error(
    "\n  No ANTHROPIC_API_KEY found — online mode will not work until you add it.\n" +
      "  Copy .env.example to .env and paste your key in it.\n" +
      "  (Offline mode works without a key, as long as Ollama is running.)\n"
  );
}

// -- ONLINE: Anthropic --
async function callAnthropic({ prompt, useSearch, maxTokens }) {
  if (!API_KEY) throw new Error("No API key set on the server. Add ANTHROPIC_API_KEY to .env and restart.");
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || "Anthropic API error");
  return (data.content || []).map((i) => (i.type === "text" ? i.text : "")).join("\n");
}

// -- OFFLINE: Ollama --
async function callOllama({ prompt, maxTokens }) {
  let r;
  try {
    r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { num_predict: maxTokens, temperature: 0.2 },
      }),
    });
  } catch {
    throw new Error(`Can't reach Ollama at ${OLLAMA_URL}. Is it running? Start it with "ollama serve".`);
  }
  if (r.status === 404) {
    throw new Error(`Model "${OLLAMA_MODEL}" not found in Ollama. Pull it first: ollama pull ${OLLAMA_MODEL}`);
  }
  const data = await r.json();
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  return data.response || "";
}

app.post("/api/ask", async (req, res) => {
  const { prompt, useSearch = false, maxTokens = 2000, mode = "online" } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt." });

  try {
    let text;
    if (mode === "offline") {
      // Web search isn't available offline — the prompt still runs, just without it.
      text = await callOllama({ prompt, maxTokens });
    } else {
      text = await callAnthropic({ prompt, useSearch, maxTokens });
    }
    res.json({ text });
  } catch (e) {
    res.status(502).json({ error: e.message || "Request failed" });
  }
});

// Lets the UI show what's actually available before the user picks a mode.
app.get("/api/health", async (_req, res) => {
  let ollamaUp = false;
  let ollamaModels = [];
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) {
      const d = await r.json();
      ollamaUp = true;
      ollamaModels = (d.models || []).map((m) => m.name);
    }
  } catch {
    ollamaUp = false;
  }
  res.json({
    online: { hasKey: !!API_KEY, model: MODEL },
    offline: { up: ollamaUp, url: OLLAMA_URL, model: OLLAMA_MODEL, models: ollamaModels },
  });
});

app.listen(PORT, () => {
  console.log(`\n  CodeLens backend on http://localhost:${PORT}`);
  console.log(`  Online:  ${API_KEY ? MODEL : "NO KEY -- add to .env"}`);
  console.log(`  Offline: ${OLLAMA_MODEL} via ${OLLAMA_URL} (start with "ollama serve")\n`);
});
