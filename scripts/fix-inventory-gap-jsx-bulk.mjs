#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = join(dirname(import.meta.dirname));
const dir = join(root, 'apps', 'fleet', 'src', 'components', 'inventory', 'gap');

for (const name of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
  const p = join(dir, name);
  let t = readFileSync(p, 'utf8');
  const before = t;
  t = t.replace(/\s+type="button"(?=[^>]*type="button")/g, '');
  t = t.replace(/selected=""/g, 'selected={true}');
  t = t.replace(/checked=""/g, 'checked={false}');
  t = t.replace(/style="animation-duration: 4s;"/g, 'style={{ animationDuration: "4s" }}');
  t = t.replace(
    /style="font-variation-settings: 'FILL' 1;"/g,
    "style={{ fontVariationSettings: \"'FILL' 1\" }}",
  );
  t = t.replace(/ style=""/g, '');
  if (t !== before) writeFileSync(p, t);
}
console.log('OK — bulk gap JSX fixes applied.');
