const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { callLLM } = require('../utils/llm');
const { getStagedChanges } = require('../utils/git');

// Default guidelines (can be replaced via request body)
const DEFAULT_GUIDELINES = `
- General: write clear, maintainable, and testable code; reduce complexity; follow DRY and YAGNI.
- JavaScript/Node: prefer const/let, avoid var; strict equality; handle async errors; avoid blocking I/O.
- Security: validate and sanitize inputs; avoid eval/new Function; handle JWT/secret leakage; safe file ops.
- Style: consistent naming; small functions; meaningful comments; avoid dead code.
- Testing: unit tests for pure logic; integration tests for APIs.
`;

// Build a compact prompt for the LLM
function buildPrompt({ files, guidelines = DEFAULT_GUIDELINES, scope = 'full', askFixes = true, askEffort = true }) {
  const header = `You are a senior code reviewer. Review the following ${scope} code and return JSON with findings.`;
  const ask = `For each finding include: { id, file, lineStart, lineEnd, severity: one of [info, warn, error], title, description, guideline, recommendation, optionally fixPatch (unified diff), effortHours (number) }.`;
  const extras = `${askFixes ? 'Propose fixPatch when feasible.' : ''} ${askEffort ? 'Estimate effortHours (0.1-8).' : ''}`.trim();

  const filesBlock = files.map((f, idx) => {
    const snippet = f.content.length > 12000 ? (f.content.slice(0, 12000) + "\n/* ...truncated... */") : f.content;
    return `FILE_${idx+1}: ${f.path}\n-----\n${snippet}`;
  }).join("\n\n");

  return `${header}\n\nGuidelines:\n${guidelines}\n\n${ask}\n${extras}\n\n${filesBlock}`;
}

async function runAnalysis({ files, guidelines, scope }) {
  if (!files || files.length === 0) {
    return { findings: [], meta: { tokensEstimated: 0, message: 'No files provided' } };
  }
  const prompt = buildPrompt({ files, guidelines, scope });
  const llm = await callLLM(prompt);
  let findings = [];
  try {
    // Try to parse JSON anywhere in the text
    const jsonMatch = llm.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) findings = JSON.parse(jsonMatch[0]).findings || JSON.parse(jsonMatch[0]);
  } catch (e) {
    findings = [];
  }
  return { findings, meta: { raw: llm?.slice(0, 1000), model: process.env.OLLAMA_MODEL || 'unknown' } };
}

module.exports = {
  getGuidelines: async (req, res) => {
    res.json({ guidelines: DEFAULT_GUIDELINES });
  },

  analyzeFiles: async (req, res) => {
    try {
      const { files = [], guidelines = DEFAULT_GUIDELINES, scope = 'full' } = req.body || {};
      const result = await runAnalysis({ files, guidelines, scope });
      // Persist review + findings
      const sequelize = require('../config/Database');
      const Review = require('../models/review');
      const ReviewFinding = require('../models/review_finding');
      const saved = await sequelize.transaction(async (t) => {
        const ownerId = req.user?.id || null;
        const review = await Review.create({ scope, guidelines, user_id: ownerId, meta: { ...(result.meta || {}), userId: ownerId } }, { transaction: t });
        const review_id = review.id;
        if (Array.isArray(result.findings) && result.findings.length > 0) {
          const rows = result.findings.map((f) => ({
            review_id,
            file: f.file || null,
            lineStart: f.lineStart || null,
            lineEnd: f.lineEnd || null,
            severity: ['info','warn','error'].includes(f.severity) ? f.severity : 'info',
            title: f.title || null,
            description: f.description || null,
            guideline: f.guideline || null,
            recommendation: f.recommendation || null,
            fixPatch: f.fixPatch || null,
            effortHours: typeof f.effortHours === 'number' ? f.effortHours : null,
          }));
          await ReviewFinding.bulkCreate(rows, { transaction: t });
        }
        return review;
      });
      return res.json({ reviewId: saved.id, ...result });
    } catch (err) {
      console.error('analyzeFiles error', err);
      return res.status(500).json({ error: 'Analyze failed', details: String(err?.message || err) });
    }
  },

  analyzeStaged: async (req, res) => {
    try {
      const repoPath = req.body?.repoPath || process.cwd();
      const changes = getStagedChanges(repoPath);
      const files = changes.map(({ filePath, content }) => ({ path: filePath, content }));
      const result = await runAnalysis({ files, scope: 'incremental' });
      // Persist review + findings
      const sequelize = require('../config/Database');
      const Review = require('../models/review');
      const ReviewFinding = require('../models/review_finding');
      const saved = await sequelize.transaction(async (t) => {
        const ownerId = req.user?.id || null;
        const review = await Review.create({ scope: 'incremental', guidelines: DEFAULT_GUIDELINES, user_id: ownerId, meta: { ...result.meta, userId: ownerId, changedFiles: changes.map(c => c.filePath) } }, { transaction: t });
        const review_id = review.id;
        if (Array.isArray(result.findings) && result.findings.length > 0) {
          const rows = result.findings.map((f) => ({
            review_id,
            file: f.file || null,
            lineStart: f.lineStart || null,
            lineEnd: f.lineEnd || null,
            severity: ['info','warn','error'].includes(f.severity) ? f.severity : 'info',
            title: f.title || null,
            description: f.description || null,
            guideline: f.guideline || null,
            recommendation: f.recommendation || null,
            fixPatch: f.fixPatch || null,
            effortHours: typeof f.effortHours === 'number' ? f.effortHours : null,
          }));
          await ReviewFinding.bulkCreate(rows, { transaction: t });
        }
        return review;
      });
      return res.json({ reviewId: saved.id, ...result, changedFiles: changes.map(c => c.filePath) });
    } catch (err) {
      console.error('analyzeStaged error', err);
      return res.status(500).json({ error: 'Staged analyze failed', details: String(err?.message || err) });
    }
  },

  analyzeRepo: async (req, res) => {
    try {
      const { repoPath = path.resolve(__dirname, '..'), globs = ['client/src/**/*.{js,jsx,ts,tsx}', 'server/**/*.js'], maxFiles = 8 } = req.body || {};
      // Simple glob without extra deps: collect JS/TS files recursively and filter
      function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let out = [];
        for (const e of entries) {
          if (e.name.startsWith('.next') || e.name === 'node_modules' || e.name === 'uploads' || e.name === 'cypress') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) out = out.concat(walk(full));
          else out.push(full);
        }
        return out;
      }
      const all = walk(repoPath).filter(p => /\.(js|jsx|ts|tsx)$/.test(p));
      const selected = all.slice(0, maxFiles);
      const files = selected.map(p => ({ path: path.relative(repoPath, p), content: fs.readFileSync(p, 'utf8') }));
      const result = await runAnalysis({ files, scope: 'repository-sample' });
      // Persist review + findings
      const sequelize = require('../config/Database');
      const Review = require('../models/review');
      const ReviewFinding = require('../models/review_finding');
      const saved = await sequelize.transaction(async (t) => {
        const ownerId = req.user?.id || null;
        const review = await Review.create({ scope: 'repository-sample', guidelines: DEFAULT_GUIDELINES, user_id: ownerId, meta: { ...result.meta, userId: ownerId, scanned: files.map(f => f.path) } }, { transaction: t });
        const review_id = review.id;
        if (Array.isArray(result.findings) && result.findings.length > 0) {
          const rows = result.findings.map((f) => ({
            review_id,
            file: f.file || null,
            lineStart: f.lineStart || null,
            lineEnd: f.lineEnd || null,
            severity: ['info','warn','error'].includes(f.severity) ? f.severity : 'info',
            title: f.title || null,
            description: f.description || null,
            guideline: f.guideline || null,
            recommendation: f.recommendation || null,
            fixPatch: f.fixPatch || null,
            effortHours: typeof f.effortHours === 'number' ? f.effortHours : null,
          }));
          await ReviewFinding.bulkCreate(rows, { transaction: t });
        }
        return review;
      });
      return res.json({ reviewId: saved.id, ...result, scanned: files.map(f => f.path) });
    } catch (err) {
      console.error('analyzeRepo error', err);
      return res.status(500).json({ error: 'Repo analyze failed', details: String(err?.message || err) });
    }
  }
};
