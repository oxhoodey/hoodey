// Quick pre-deploy check: every JS file parses, JSON files are valid, required pages exist.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
for (const f of walk(root)) {
  const rel = path.relative(root, f);
  try {
    if (f.endsWith('.js')) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    failed++;
    console.error(`✗ ${rel}\n${String(e.stderr || e.message).trim()}`);
  }
}
for (const page of ['radar', 'copycat', 'clock', 'family', 'roadmap']) {
  if (!fs.existsSync(path.join(root, 'public', `${page}.html`))) { failed++; console.error(`✗ missing public/${page}.html`); }
}
if (failed) { console.error(`${failed} problem(s) found.`); process.exit(1); }
console.log('All files OK.');
