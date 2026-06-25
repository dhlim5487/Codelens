import { useState, useMemo, useEffect } from "react";
import { askClaude, getHealth } from "./api.js";
import { mapPrompt, bugPrompt, fixFromAnswerPrompt, explainSectionPrompt } from "./prompts.js";

/* ── small pieces ── */

function Spinner({ label }) {
  return (
    <div className="spinner">
      <span className="ring" />
      <span>{label}</span>
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className="errbox">
      <p>Couldn’t finish: {message}</p>
      {onRetry && <button className="btn sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

// Renders code with line numbers, highlighting the active section and bug lines.
function CodeView({ code, highlight, bugLines }) {
  const lines = useMemo(() => code.replace(/\n$/, "").split("\n"), [code]);
  return (
    <div className="codebox">
      {lines.map((src, idx) => {
        const n = idx + 1;
        const inHl = highlight && n >= highlight.start_line && n <= highlight.end_line;
        const bug = bugLines?.[n];
        const cls = ["code-line"];
        if (inHl) cls.push("hl");
        if (bug === "critical") cls.push("bug-crit");
        else if (bug === "warning" || bug === "minor") cls.push("bug-warn");
        return (
          <div className={cls.join(" ")} key={n} id={`L${n}`}>
            <span className="ln">{bug ? "● " : ""}{n}</span>
            <span className="src">{src || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── main ── */

export default function App() {
  const [code, setCode] = useState("");
  const [filename, setFilename] = useState("");
  const [language, setLanguage] = useState("English");
  // When VITE_API_BASE is set, we're talking to a remote backend — a visitor's
  // local Ollama isn't reachable, so offline mode is hidden and we stay online.
  const IS_DEPLOYED = Boolean(import.meta.env.VITE_API_BASE);
  const [mode, setMode] = useState("online"); // online | offline
  const [health, setHealth] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  const [stage, setStage] = useState("input"); // input | results
  const [tab, setTab] = useState("summary");

  const [map, setMap] = useState(null);
  const [mapErr, setMapErr] = useState(null);

  const [bugs, setBugs] = useState(null);
  const [bugErr, setBugErr] = useState(null);

  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [walkthroughs, setWalkthroughs] = useState({}); // sectionIndex -> data | "loading" | "error"

  // bug interaction state, keyed by bug index
  const [bugState, setBugState] = useState({}); // idx -> {status, final, answer, drafting, draftErr}

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setCode(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function analyze() {
    if (!code.trim()) return;
    setStage("results");
    setTab("summary");
    setLoading(true);
    setMap(null); setMapErr(null);
    setBugs(null); setBugErr(null);
    setBugState({}); setWalkthroughs({}); setActiveSection(null);

    // Run the structure map and bug scan in parallel — same pattern as the resume tool.
    const mapJob = askClaude(mapPrompt(code, filename, language), { maxTokens: 2500, mode })
      .then((d) => setMap(d))
      .catch((e) => setMapErr(e.message));
    const bugJob = askClaude(bugPrompt(code, filename, language), { maxTokens: 2500, mode })
      .then((d) => setBugs(d))
      .catch((e) => setBugErr(e.message));

    await Promise.allSettled([mapJob, bugJob]);
    setLoading(false);
  }

  function retryMap() {
    setMapErr(null); setMap(null);
    askClaude(mapPrompt(code, filename, language), { maxTokens: 2500, mode })
      .then(setMap).catch((e) => setMapErr(e.message));
  }
  function retryBugs() {
    setBugErr(null); setBugs(null);
    askClaude(bugPrompt(code, filename, language), { maxTokens: 2500, mode })
      .then(setBugs).catch((e) => setBugErr(e.message));
  }

  async function loadWalkthrough(i, section) {
    const slice = code.split("\n").slice(section.start_line - 1, section.end_line).join("\n");
    setWalkthroughs((w) => ({ ...w, [i]: "loading" }));
    try {
      const d = await askClaude(explainSectionPrompt(slice, section, language), { maxTokens: 2000, mode });
      setWalkthroughs((w) => ({ ...w, [i]: d }));
    } catch {
      setWalkthroughs((w) => ({ ...w, [i]: "error" }));
    }
  }

  async function draftFix(i, bug, answer) {
    setBugState((s) => ({ ...s, [i]: { ...s[i], drafting: true, draftErr: null } }));
    try {
      const d = await askClaude(fixFromAnswerPrompt(bug, answer, language), { maxTokens: 800, mode });
      setBugState((s) => ({ ...s, [i]: { ...s[i], drafting: false, final: d.fixed_code, status: "drafted" } }));
    } catch (e) {
      setBugState((s) => ({ ...s, [i]: { ...s[i], drafting: false, draftErr: e.message } }));
    }
  }

  // Map line number -> worst severity on that line, for code highlighting.
  const bugLines = useMemo(() => {
    const m = {};
    (bugs?.bugs || []).forEach((b) => {
      const rank = { critical: 3, warning: 2, minor: 1 };
      if (!m[b.line] || rank[b.severity] > rank[m[b.line]]) m[b.line] = b.severity;
    });
    return m;
  }, [bugs]);

  const bugCount = bugs?.bugs?.length || 0;

  return (
    <div className="wrap">
      <div className="masthead">
        <span className="logo"><span className="dot" />CodeLens</span>
        <span className="tagline">read · interpret · fix</span>
      </div>
      <p className="subhead">Paste AI-generated code; get a summary, a section map with milestones, and fixable bugs.</p>

      {/* ── STAGE 1: INPUT ── */}
      {stage === "input" && (
        <div className="panel">
          <label className="fld" htmlFor="code">Code</label>
          <textarea
            id="code"
            className="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your code here, or load a file below…"
            spellCheck={false}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <input id="file" type="file" onChange={onFile} style={{ display: "none" }}
              accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.json,.sh,.txt" />
            <label htmlFor="file" className="btn sm" style={{ display: "inline-block" }}>Load file…</label>
            {filename && <span className="tagline">{filename}</span>}
            <div className="grow" />
            {!IS_DEPLOYED && (
              <div className="modeswitch" role="group" aria-label="Engine">
                <button
                  className={`modebtn ${mode === "online" ? "on" : ""}`}
                  onClick={() => setMode("online")}
                  title={health?.online?.hasKey ? `Online: ${health.online.model}` : "Online needs an API key in .env"}
                >
                  ☁ Online
                </button>
                <button
                  className={`modebtn ${mode === "offline" ? "on" : ""}`}
                  onClick={() => setMode("offline")}
                  title={health?.offline?.up ? `Offline: ${health.offline.model}` : "Offline needs Ollama running"}
                >
                  ⌂ Offline
                </button>
              </div>
            )}
            <label className="fld" htmlFor="lang" style={{ margin: 0 }}>Explain in</label>
            <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 150 }}>
              <option>English</option>
              <option>Korean</option>
              <option>Japanese</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Chinese</option>
            </select>
            <button className="btn primary" disabled={!code.trim()} onClick={analyze}>Analyze →</button>
          </div>
          {health && !IS_DEPLOYED && (
            <p className="modehint">
              {mode === "online"
                ? health.online.hasKey
                  ? `Online · ${health.online.model}`
                  : "Online selected, but no API key found in .env — add it or switch to Offline."
                : health.offline.up
                  ? `Offline · ${health.offline.model} · nothing leaves your machine`
                  : `Offline selected, but Ollama isn’t reachable — run “ollama serve” and “ollama pull ${health.offline.model}”.`}
            </p>
          )}
        </div>
      )}

      {/* ── STAGES 2-5: RESULTS ── */}
      {stage === "results" && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <button className="btn ghost sm" onClick={() => setStage("input")}>← edit code</button>
            {!IS_DEPLOYED && <span className="modetag">{mode === "online" ? "☁ online" : "⌂ offline"}</span>}
            <div className="grow" />
            <button className="btn sm" onClick={analyze}>re-run analysis</button>
          </div>

          <div className="tabs">
            <button className={`tab ${tab === "summary" ? "active" : ""}`} onClick={() => setTab("summary")}>Summary</button>
            <button className={`tab ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>
              Section map{map && <span className="count">{map.sections.length}</span>}
            </button>
            <button className={`tab ${tab === "bugs" ? "active" : ""}`} onClick={() => setTab("bugs")}>
              Bugs{bugs && <span className="count">{bugCount}</span>}
            </button>
          </div>

          {/* SUMMARY */}
          {tab === "summary" && (
            <div className="panel">
              {loading && !map && <Spinner label="reading the code…" />}
              {mapErr && <ErrorBox message={mapErr} onRetry={retryMap} />}
              {map && (
                <>
                  <p className="oneliner">{map.one_liner}</p>
                  <p className="summary-body">{map.summary}</p>
                  <div className="chips">
                    <span className="chip">{map.language}</span>
                    {(map.entry_points || []).map((e, i) => <span className="chip" key={i}>↪ {e}</span>)}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION MAP + CODE */}
          {tab === "map" && (
            <div className="split">
              <CodeView code={code} highlight={activeSection} bugLines={bugLines} />
              <div className="maprail">
                {loading && !map && <Spinner label="mapping sections…" />}
                {mapErr && <ErrorBox message={mapErr} onRetry={retryMap} />}
                {map && map.sections.map((s, i) => (
                  <div key={i}>
                    <button
                      className={`mapitem ${s.milestone ? "is-milestone" : ""}`}
                      onMouseEnter={() => setActiveSection(s)}
                      onFocus={() => setActiveSection(s)}
                      onClick={() => {
                        setActiveSection(s);
                        document.getElementById(`L${s.start_line}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
                        if (!walkthroughs[i]) loadWalkthrough(i, s);
                      }}
                    >
                      <div className="top">
                        {s.milestone && <span className="star">★</span>}
                        <span className="mlabel">{s.label}</span>
                        <span className="lines">{s.start_line}–{s.end_line}</span>
                      </div>
                      <p className="purpose">{s.purpose}</p>
                      {walkthroughs[i] === "loading" && <Spinner label="explaining…" />}
                      {walkthroughs[i] === "error" && <p className="purpose" style={{ color: "var(--crit)" }}>couldn’t explain — click again</p>}
                      {walkthroughs[i] && typeof walkthroughs[i] === "object" && (
                        <div className="walk">
                          {walkthroughs[i].walkthrough.map((w, k) => (
                            <div className="wl" key={k}><span className="wln">{w.line}</span><span>{w.says}</span></div>
                          ))}
                          {walkthroughs[i].gotchas.map((g, k) => (
                            <p className="gotcha" key={k}>⚠ {g}</p>
                          ))}
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BUGS */}
          {tab === "bugs" && (
            <div>
              {loading && !bugs && <Spinner label="scanning for bugs…" />}
              {bugErr && <ErrorBox message={bugErr} onRetry={retryBugs} />}
              {bugs && bugCount === 0 && <p className="empty">No real defects found. The code looks sound on this pass.</p>}
              {bugs && bugs.bugs.map((b, i) => {
                const st = bugState[i] || {};
                const resolved = st.status === "accepted" || st.status === "drafted";
                const shownFix = st.final || b.fixed_code;
                return (
                  <div className={`bug ${resolved ? "resolved" : ""}`} key={i}>
                    <div className="head">
                      <span className={`sev ${b.severity}`}>{b.severity}</span>
                      <span className="title">{b.title}</span>
                      <span className="lineref">
                        <a href={`#L${b.line}`} onClick={() => setTab("map")} style={{ color: "inherit" }}>line {b.line}</a>
                      </span>
                      {resolved && <span className="resolved-tag">✓ fix ready</span>}
                    </div>
                    <p className="explain">{b.explain || b.explanation}</p>

                    {b.needs_input && !shownFix ? (
                      <div className="diff">
                        <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>{b.question}</p>
                        <textarea
                          value={st.answer || ""}
                          onChange={(e) => setBugState((s) => ({ ...s, [i]: { ...s[i], answer: e.target.value } }))}
                          placeholder="Describe what this code is supposed to do…"
                          style={{ minHeight: 64, marginBottom: 8 }}
                        />
                        <div className="row">
                          <button className="btn primary sm" disabled={!st.answer?.trim() || st.drafting}
                            onClick={() => draftFix(i, b, st.answer)}>
                            {st.drafting ? "drafting…" : "Draft fix from my answer"}
                          </button>
                        </div>
                        {st.draftErr && <p className="explain" style={{ color: "var(--crit)" }}>Draft failed: {st.draftErr}</p>}
                      </div>
                    ) : (
                      <div className="diff">
                        {b.original_code && (
                          <div className="diffblock before"><span className="difftag">BEFORE</span>{b.original_code}</div>
                        )}
                        {shownFix && (
                          <div className="diffblock after"><span className="difftag">AFTER</span>{shownFix}</div>
                        )}
                        {!resolved && shownFix && (
                          <div className="row" style={{ marginTop: 8 }}>
                            <button className="btn ok sm" onClick={() => navigator.clipboard?.writeText(shownFix)}>Copy fix</button>
                            <button className="btn sm" onClick={() => setBugState((s) => ({ ...s, [i]: { ...s[i], status: "accepted" } }))}>Mark resolved</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="foot">color = meaning · purple ★ = milestone section · red = critical · the analysis comes from Claude, verify fixes before pasting</p>
        </>
      )}

      {stage === "input" && (
        <p className="foot">
          {mode === "offline"
            ? "offline mode · runs on a local model via Ollama · nothing leaves your machine"
            : "online mode · runs on your machine · your key stays in the local server · nothing is stored"}
        </p>
      )}
    </div>
  );
}
