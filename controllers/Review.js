const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { callLLM } = require('../utils/llm');
const { getStagedChanges } = require('../utils/git');
const Review = require('../models/review');
const ReviewFinding = require('../models/review_finding');
const ReviewComment = require('../models/review_comment');

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

async function assertAccessToFinding(req, findingId) {
  const finding = await ReviewFinding.findByPk(findingId);
  if (!finding) throw new Error('Finding not found');
  const review = await Review.findByPk(finding.review_id);
  if (!review) throw new Error('Parent review not found');
  const role = req.user?.role;
  const userId = req.user?.id;
  if (role !== 'admin' && review.user_id !== userId) {
    const err = new Error('Forbidden');
    // @ts-ignore
    err.statusCode = 403;
    throw err;
  }
  return { finding, review };
}

function computeFindingStatus(comments = []) {
  // default open; last action wins
  let status = 'open';
  for (const c of comments) {
    if (c.action === 'resolve') status = 'resolved';
    if (c.action === 'reopen') status = 'open';
  }
  return status;
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
  },

  // ===== Comments & Resolution API =====
  listComments: async (req, res) => {
    try {
      const findingId = parseInt(req.params.findingId, 10);
      await assertAccessToFinding(req, findingId);
      const comments = await ReviewComment.findAll({ where: { finding_id: findingId }, order: [['createdAt','ASC']] });
      const status = computeFindingStatus(comments);
      res.json({ comments, status });
    } catch (err) {
      const code = err?.statusCode || 500;
      res.status(code).json({ error: 'Failed to list comments', details: String(err?.message || err) });
    }
  },

  addComment: async (req, res) => {
    try {
      const findingId = parseInt(req.params.findingId, 10);
      const { finding, review } = await assertAccessToFinding(req, findingId);
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Text is required' });
      const row = await ReviewComment.create({ review_id: review.id, finding_id: finding.id, user_id: req.user?.id || null, action: 'comment', text });
      res.json(row);
    } catch (err) {
      const code = err?.statusCode || 500;
      res.status(code).json({ error: 'Failed to add comment', details: String(err?.message || err) });
    }
  },

  resolveFinding: async (req, res) => {
    try {
      const findingId = parseInt(req.params.findingId, 10);
      const { finding, review } = await assertAccessToFinding(req, findingId);
      await ReviewComment.create({ review_id: review.id, finding_id: finding.id, user_id: req.user?.id || null, action: 'resolve', text: null });
      const comments = await ReviewComment.findAll({ where: { finding_id: finding.id }, order: [['createdAt','ASC']] });
      res.json({ status: computeFindingStatus(comments) });
    } catch (err) {
      const code = err?.statusCode || 500;
      res.status(code).json({ error: 'Failed to resolve finding', details: String(err?.message || err) });
    }
  },

  reopenFinding: async (req, res) => {
    try {
      const findingId = parseInt(req.params.findingId, 10);
      const { finding, review } = await assertAccessToFinding(req, findingId);
      await ReviewComment.create({ review_id: review.id, finding_id: finding.id, user_id: req.user?.id || null, action: 'reopen', text: null });
      const comments = await ReviewComment.findAll({ where: { finding_id: finding.id }, order: [['createdAt','ASC']] });
      res.json({ status: computeFindingStatus(comments) });
    } catch (err) {
      const code = err?.statusCode || 500;
      res.status(code).json({ error: 'Failed to reopen finding', details: String(err?.message || err) });
    }
  }
};
