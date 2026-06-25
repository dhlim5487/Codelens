// All output is strict minified JSON. Keys stay in English; the analysis prose
// follows the user's chosen language. Every prompt forbids inventing facts.

const lang = (language) =>
  language && language !== "English"
    ? `\n\nWrite all human-readable string values in ${language}. Keep JSON keys in English. Any code quoted verbatim stays exactly as written.`
    : "";

// FEATURE 1 — quick summary + milestones, and FEATURE 2 — sectionize the whole file.
// Done in one call because both describe the same structure.
export const mapPrompt = (code, filename, language) => `You are a code-reading engine. Read the FILE and explain its structure for someone who did not write it (e.g. AI-generated code they need to understand fast).

Respond ONLY with minified JSON, no markdown, no preamble. Schema:
{"language":str,"one_liner":str,"summary":str,"sections":[{"label":str,"start_line":int,"end_line":int,"purpose":str,"milestone":bool}],"entry_points":[str]}

Rules:
- language = the programming language of the file.
- one_liner = what this file does, in under 15 words.
- summary = one short paragraph (3-4 sentences) on what the code does and how it flows. No line numbers here.
- sections = cover the WHOLE file top to bottom with NO gaps and NO overlaps. start_line/end_line are 1-based and inclusive. Each section is a coherent unit (imports, a function, a class, a config block, the main routine). label = 2-4 words. purpose = one sentence on what this section is for.
- milestone = true for the 2-4 sections that are the most important turning points to understand the file (e.g. the main entry, the core algorithm, the critical state change). Everything else milestone=false.
- entry_points = names of the functions/handlers where execution actually begins (e.g. "main", "App", "handleSubmit"). Max 4.
- Never invent code that isn't there. If the file is too short to section meaningfully, return one section covering it all.

FILE: ${filename || "untitled"}
\`\`\`
${code}
\`\`\`${lang(language)}`;

// FEATURE 3 — explain, interpret, and fix bugs.
export const bugPrompt = (code, filename, language) => `You are a careful bug-finding engine. Review the FILE for real defects: logic errors, off-by-one, unhandled errors, null/undefined access, resource leaks, race conditions, wrong operators, bad edge cases, security issues. Do NOT report style opinions.

Respond ONLY with minified JSON, no markdown. Schema:
{"bugs":[{"line":int,"severity":"critical"|"warning"|"minor","title":str,"explanation":str,"original_code":str,"fixed_code":str|null,"needs_input":bool,"question":str|null}],"clean":bool}

Rules:
- line = the 1-based line where the problem is (best single line).
- severity: critical = will crash or corrupt/wrong result; warning = breaks on some inputs or edge cases; minor = fragile but usually works.
- title = the specific problem in under 8 words (e.g. "Loop misses the last element").
- explanation = WHY it's a bug and what goes wrong at runtime, in plain language, under 40 words.
- original_code = the exact problematic line(s) copied verbatim from the file.
- fixed_code = the corrected line(s), ready to paste, preserving the file's indentation and style. Fix ONLY this bug; change nothing unrelated.
- If the fix depends on intent only the author knows, set needs_input=true, fixed_code=null, and question = a specific question. Otherwise needs_input=false.
- Max 8 bugs, worst first. If you find none, return "bugs":[] and clean=true.
- Never invent a bug to fill the list. Quote code exactly; do not paraphrase code.

FILE: ${filename || "untitled"}
\`\`\`
${code}
\`\`\`${lang(language)}`;

// Used when a bug needs the author's intent before it can be fixed.
export const fixFromAnswerPrompt = (bug, answer, language) => `A code reviewer flagged: "${bug.title}" — ${bug.explanation}
The problematic code was:
${bug.original_code}
The reviewer asked: "${bug.question}"
The author answered: "${answer}"

Write the corrected code line(s) using ONLY the author's stated intent — invent nothing. Preserve indentation and style. Respond ONLY with minified JSON: {"fixed_code":str}${lang(language)}`;

// FEATURE 5 (Extend) — deeper plain-language walkthrough of one section, on demand.
export const explainSectionPrompt = (code, section, language) => `Explain this specific section of code line by line for someone learning how it works. Be concrete about what each meaningful line does and why.

Respond ONLY with minified JSON: {"walkthrough":[{"line":int,"says":str}],"gotchas":[str]}
- walkthrough = one entry per meaningful line (skip blank lines and trivial braces). says = what that line does, under 20 words.
- gotchas = up to 3 subtle things a reader might miss. Empty array if none.

SECTION "${section.label}" (lines ${section.start_line}-${section.end_line}):
\`\`\`
${code}
\`\`\`${lang(language)}`;
