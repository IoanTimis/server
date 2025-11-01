const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getStagedChanges(repoPath) {
  const opts = { cwd: repoPath, encoding: 'utf8' };
  // Get staged files
  const filesRaw = execSync('git diff --cached --name-only', opts).trim();
  if (!filesRaw) return [];
  const files = filesRaw.split('\n').filter(f => /\.(js|jsx|ts|tsx)$/.test(f));
  const out = [];
  for (const f of files) {
    const full = path.join(repoPath, f);
    let content = '';
    try { content = fs.readFileSync(full, 'utf8'); } catch (_) {}
    out.push({ filePath: f, content });
  }
  return out;
}

module.exports = { getStagedChanges };
