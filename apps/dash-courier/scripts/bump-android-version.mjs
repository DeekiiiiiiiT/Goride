import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android');
const propsPath = join(androidDir, 'version.properties');

function parseProps(raw) {
  const props = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    props[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return props;
}

const props = parseProps(readFileSync(propsPath, 'utf8'));
const prevCode = Number.parseInt(props.VERSION_CODE, 10);
const prevName = props.VERSION_NAME ?? '1.0.0';

if (!Number.isFinite(prevCode)) {
  throw new Error(`Invalid VERSION_CODE in ${propsPath}`);
}

const nextCode = prevCode + 1;
const nameParts = prevName.split('.').map((part) => Number.parseInt(part, 10));
while (nameParts.length < 3) nameParts.push(0);
nameParts[2] += 1;
const nextName = nameParts.join('.');

writeFileSync(
  propsPath,
  `# Play Store version — bumped automatically by \`pnpm cap:release\`\nVERSION_CODE=${nextCode}\nVERSION_NAME=${nextName}\n`,
);

console.log(`Android version bumped: ${prevName} (${prevCode}) → ${nextName} (${nextCode})`);
