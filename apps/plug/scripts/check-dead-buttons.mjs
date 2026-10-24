import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.join(root, 'apps/plug/src/screens/generated');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.tsx'));
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const tags = text.match(/<(?:button|a)\b[\s\S]*?>/g) || [];
  tags.forEach((tag, index) => {
    const hasAction = /onClick=/.test(tag);
    const disabled = /\bdisabled=/.test(tag);
    const reason = /\btitle=/.test(tag);
    if (!hasAction && !(disabled && reason)) {
      failures.push(`${file} control ${index + 1} has no action`);
    }
  });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`plug controls ok (${files.length} screens)`);
