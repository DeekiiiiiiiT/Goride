import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.join(root, 'supabase/migrations');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
let latest = '';
for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');
  if (text.includes('FUNCTION places.sync_public_station')) latest = text;
}
if (!latest) {
  console.error('places.sync_public_station is missing');
  process.exit(1);
}
const start = latest.lastIndexOf('CREATE OR REPLACE FUNCTION places.sync_public_station');
const end = latest.indexOf('$$;', start);
const body = latest.slice(start, end < 0 ? undefined : end);
if (!body.includes('parish_pcode')) {
  console.error('The latest station sync does not call parish_pcode');
  process.exit(1);
}
if (/payload_json\s*->>\s*'pcode'/.test(body)) {
  console.error('The latest station sync still copies payload_json pcode');
  process.exit(1);
}
console.log('station parish sync ok');
