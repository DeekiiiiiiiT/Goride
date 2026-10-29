import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = path.join(root, 'supabase/migrations');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
const haystack = files.map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).join('\n');

// Station parish comes from coordinates via places.parish_pcode (not payload_json pcode).
if (!/places\.parish_pcode\s*\(/.test(haystack)) {
  console.error('places.parish_pcode is missing from migrations');
  process.exit(1);
}
if (/payload_json\s*->>\s*'pcode'/.test(haystack) && /sync_public_station/.test(haystack)) {
  // Only fail if a live sync_public_station body still copies payload pcode.
  const syncMatches = [...haystack.matchAll(/create or replace function places\.sync_public_station\(\)[\s\S]*?\$\$;/gi)];
  const bad = syncMatches.filter((match) => /payload_json\s*->>\s*'pcode'/.test(match[0]));
  if (bad.length) {
    console.error('A station sync still copies payload_json pcode');
    process.exit(1);
  }
}
console.log('station parish sync ok');
