// Talks to the local backend (/api/ask), never to a model directly.
// `mode` ("online" | "offline") tells the backend which engine to use.
// API_BASE is empty in dev (Vite proxies /api) and set to the deployed
// backend URL in production via VITE_API_BASE.
const API_BASE = import.meta.env.VITE_API_BASE || "";

async function rawCall(prompt, useSearch, maxTokens, mode) {
  const res = await fetch(`${API_BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, useSearch, maxTokens, mode }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
  return data.text;
}

function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in response");
  return JSON.parse(clean.slice(start, end + 1));
}

export async function askClaude(prompt, { useSearch = false, maxTokens = 2000, mode = "online" } = {}) {
  const text = await rawCall(prompt, useSearch, maxTokens, mode);
  try {
    return extractJSON(text);
  } catch (firstErr) {
    // Hand the broken output back once and ask for valid JSON only.
    // (Local models miss JSON more often, so this pass matters more offline.)
    try {
      const repaired = await rawCall(
        `This text was supposed to be a single valid JSON object but has a syntax error (${firstErr.message}). Return ONLY the corrected, complete, valid JSON object - no markdown, no commentary:\n\n${text}`,
        false,
        maxTokens,
        mode
      );
      return extractJSON(repaired);
    } catch {
      throw new Error("the model returned malformed data - press Retry");
    }
  }
}

export async function getHealth() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    return await r.json();
  } catch {
    return null;
  }
}
