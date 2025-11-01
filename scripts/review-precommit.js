#!/usr/bin/env node
/*
  Local pre-commit reviewer (no HTTP, no auth).
  - Reads staged JS/TS files
  - Builds a compact prompt
  - Calls the local LLM via utils/llm
  - Prints a short summary to stdout

  Usage (from repo root or anywhere):
    node server/scripts/review-precommit.js

  Environment:
    OLLAMA_BASE_URL (default http://localhost:11434)
    OLLAMA_MODEL (default llama3)
*/
const path = require('path');
const { getStagedChanges } = require('../utils/git');
const { callLLM } = require('../utils/llm');

const DEFAULT_GUIDELINES = `
- General: write clear, maintainable, and testable code; reduce complexity; follow DRY and YAGNI.
- JavaScript/Node: prefer const/let, avoid var; strict equality; handle async errors; avoid blocking I/O.
- Security: validate and sanitize inputs; avoid eval/new Function; handle JWT/secret leakage; safe file ops.
- Style: consistent naming; small functions; meaningful comments; avoid dead code.
- Testing: unit tests for pure logic; integration tests for APIs.
`;

function buildPrompt(files, guidelines) {
  const header = `You are a senior code reviewer. Review the following incremental changes and return JSON with findings.`;
  const ask = `For each finding include: { id, file, lineStart, lineEnd, severity: one of [info, warn, error], title, description, guideline, recommendation, optionally fixPatch (unified diff), effortHours (number), optionally docUpdate (string) }.`;
  const extras = `Propose fixPatch when feasible. Estimate effortHours (0.1-8). Also suggest documentation updates (docUpdate) when applicable.`;
  const filesBlock = files.map((f, idx) => {
    const snippet = f.content.length > 12000 ? (f.content.slice(0, 12000) + "\n/* ...truncated... */") : f.content;
    return `FILE_${idx+1}: ${f.path}\n-----\n${snippet}`;
  }).join("\n\n");
  return `${header}\n\nGuidelines:\n${guidelines}\n\n${ask}\n${extras}\n\n${filesBlock}`;
}

(async function main() {
  try {
    // Attempt to detect repo root (dir containing .git) from current working dir
    let repoPath = process.cwd();
    const up = (p) => path.resolve(p, '..');
    let attempts = 0;
    while (attempts < 5) {
      try {
        require('fs').accessSync(path.join(repoPath, '.git'));
        break;
      } catch {
        repoPath = up(repoPath);
        attempts++;
      }
    }
    const changes = getStagedChanges(repoPath);
    if (!changes.length) {
      console.log('[pre-commit] No staged JS/TS changes.');
      process.exit(0);
    }
    const files = changes.map(({ filePath, content }) => ({ path: filePath, content }));
    const prompt = buildPrompt(files, DEFAULT_GUIDELINES);
    const t0 = Date.now();
    const resp = await callLLM(prompt);
    const t1 = Date.now();
    let findings = [];
    try {
      const jsonMatch = resp.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) findings = JSON.parse(jsonMatch[0]).findings || JSON.parse(jsonMatch[0]);
    } catch {}

    const bySeverity = { error: 0, warn: 0, info: 0 };
    for (const f of findings) {
      bySeverity[(f.severity || 'info')] = (bySeverity[(f.severity || 'info')] || 0) + 1;
    }

    console.log(`[pre-commit] AI review: ${findings.length} findings in ${(t1-t0)} ms`);
    console.log(`[pre-commit] Severity counts: error=${bySeverity.error||0} warn=${bySeverity.warn||0} info=${bySeverity.info||0}`);

    const top = findings.slice(0, 5);
    for (const f of top) {
      console.log(`- [${f.severity||'info'}] ${f.title||'(no title)'} @ ${f.file||''}${f.lineStart?`:${f.lineStart}`:''}`);
      if (f.recommendation) console.log(`  rec: ${String(f.recommendation).split('\n')[0].slice(0, 160)}`);
    }

    // Do not block commits by default; set EXIT_ON_ERROR=1 to block on error findings
    if (process.env.EXIT_ON_ERROR === '1' && (bySeverity.error||0) > 0) {
      console.error('[pre-commit] Blocking commit due to error findings. Set EXIT_ON_ERROR=0 to allow.');
      process.exit(1);
    }
  } catch (e) {
    console.error('[pre-commit] Review failed:', e?.message || e);
    process.exit(0); // don’t block on failures by default
  }
})();
