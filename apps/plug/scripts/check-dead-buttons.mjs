import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindFor } from '../src/shell/act-kind.ts';
import { sampleViolations } from './plug-samples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.join(root, 'apps/plug/src/screens/generated');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.tsx'));
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  const screen = text.match(/data-plug-screen=\{"([^"]+)"\}/)?.[1] || file;
  const tags = text.match(/<(?:button|a)\b[\s\S]*?>/g) || [];
  tags.forEach((tag, index) => {
    const hasAction = /onClick=/.test(tag);
    const disabled = /\bdisabled=/.test(tag);
    const reason = /\btitle=/.test(tag);
    if (!hasAction && !(disabled && reason)) failures.push(`${file} control ${index + 1} has no action`);
    const act = tag.match(/data-act=\{"([^"]+)"\}/)?.[1];
    if (hasAction && !act) failures.push(`${file} control ${index + 1} has no data-act`);
    if (act && !kindFor(act, screen)) failures.push(`${file} data-act "${act}" has no handler`);
  });
}
const samples = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const phrase of sampleViolations(text)) samples.push(`${file} still shows ${phrase}`);
}
if (failures.length || samples.length) {
  console.error([...failures, ...samples].join('\n'));
  process.exit(1);
}
console.log(`plug controls ok (${files.length} screens)`);
