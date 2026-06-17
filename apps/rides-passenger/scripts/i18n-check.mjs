import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');

function flattenKeys(value, prefix = '') {
  const keys = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        keys.push(...flattenKeys(child, next));
      } else {
        keys.push(next);
      }
    }
  }
  return keys;
}

function loadLocale(fileName) {
  const raw = readFileSync(join(localesDir, fileName), 'utf8');
  return JSON.parse(raw);
}

const base = loadLocale('en-GB.json');
const es = loadLocale('es.json');

const baseKeys = new Set(flattenKeys(base));
const esKeys = new Set(flattenKeys(es));

const missingInEs = [...baseKeys].filter((key) => !esKeys.has(key));
const extraInEs = [...esKeys].filter((key) => !baseKeys.has(key));

if (missingInEs.length > 0 || extraInEs.length > 0) {
  if (missingInEs.length > 0) {
    console.error('Missing keys in es.json:');
    for (const key of missingInEs) console.error(`  - ${key}`);
  }
  if (extraInEs.length > 0) {
    console.error('Extra keys in es.json:');
    for (const key of extraInEs) console.error(`  - ${key}`);
  }
  process.exit(1);
}

console.log(`Locale parity OK (${baseKeys.size} keys in en-GB and es).`);
