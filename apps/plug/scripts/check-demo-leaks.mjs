import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const files = [
  ...fs.readdirSync(path.join(root, 'apps/plug/src/shell')).map((name) => path.join(root, 'apps/plug/src/shell', name)),
  path.join(root, 'apps/plug/src/screens/gates.tsx'),
  ...fs.readdirSync(path.join(root, 'apps/plug/src/live')).map((name) => path.join(root, 'apps/plug/src/live', name)),
].filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'));

const needles = ['demo-total', 'demo-brake', 'demo-variant', 'demo-car', 'DEMO place', 'DEMO Total', '|| 18.012', '|| -76.79'];
const failures = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('demoOn()')) return;
    for (const needle of needles) {
      if (line.includes(needle)) failures.push(`${path.relative(root, file)}:${index + 1} ${needle}`);
    }
  });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('plug demo fallbacks stay inside demo mode');
