import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const baseArg = process.argv[2]?.trim();

const profiles = {
  'D1-powertrain_job_fit': {
    stopLine:
      "  RAISE EXCEPTION 'DRY RUN OK, nothing saved: cars changed=%, jobs changed=%, revision rows=%, needs_check=%', v_car_ch, v_job_ch, v_rev_delta, v_n;",
    headerExtra: [
      '-- Expected first run: "DRY RUN OK, nothing saved: cars changed=2679, jobs changed=47, revision rows=2726, needs_check=12"',
      '-- Expected re-run: cars changed=0, jobs changed=0, revision rows=0, needs_check=12',
    ],
  },
  'S1-powertrain_job_fit_schedules': {
    stopLine:
      "  RAISE EXCEPTION 'DRY RUN OK, nothing saved: would retire=%, models list = count on 4 jobs, ELEC-ALT same-as-group=%', v_would_retire, v_fit;",
    headerExtra: [
      '-- Expected: "DRY RUN OK, nothing saved: would retire=0, models list = count on 4 jobs, ELEC-ALT same-as-group=2667"',
    ],
  },
};

const base = baseArg && profiles[baseArg] ? baseArg : 'D1-powertrain_job_fit';
const profile = profiles[base];
const srcPath = path.join(dir, `${base}.sql`);
const dstPath = path.join(dir, `${base}-DRYRUN.sql`);

const src = readFileSync(srcPath, 'utf8');
const h = createHash('sha256').update(src).digest('hex');
const marker = '-- (real run: no stop here; COMMIT follows)';

const lines = src.split(/\r?\n/);
const out = [];
let found = false;
for (const line of lines) {
  if (line.includes(marker)) {
    out.push(profile.stopLine);
    found = true;
    continue;
  }
  out.push(line);
  if (line === 'END $chk$;') {
    break;
  }
}
if (!found) {
  throw new Error(`marker not found: ${marker}`);
}

const header = [
  `-- GENERATED from ${base}.sql sha256 ${h} (see README-dryrun.md). Do not edit by hand.`,
  '-- DRY RUN: saves NOTHING; it always ends with an error message.',
  ...profile.headerExtra,
  '-- Any "Stopped, nothing saved: ..." means a check failed; paste it to Claude.',
  '',
].join('\n');

writeFileSync(dstPath, `${header}${out.join('\n')}\n`, 'utf8');
console.log(`Wrote ${dstPath} (sha256 ${h})`);