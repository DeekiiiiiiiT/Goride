import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/admin/src');
const exts = ['.ts', '.tsx', '.js', '.jsx'];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return true;
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [base, ...exts.map((ext) => base + ext), ...exts.map((ext) => path.join(base, `index${ext}`))];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

const brokenFiles = new Set();
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = re.exec(text))) {
    const spec = match[1] || match[2];
    if (!resolveImport(file, spec)) {
      brokenFiles.add(file);
      console.log(`${path.relative(root, file)} -> ${spec}`);
    }
  }
}
console.log(`broken files ${brokenFiles.size}`);
if (process.argv.includes('--delete-tests')) {
  let n = 0;
  for (const file of brokenFiles) {
    if (/\.test\.(ts|tsx)$/.test(file)) {
      fs.unlinkSync(file);
      n += 1;
    }
  }
  console.log(`deleted tests ${n}`);
}
