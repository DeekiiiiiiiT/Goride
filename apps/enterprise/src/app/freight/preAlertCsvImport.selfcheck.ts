import { parsePreAlertCsv, PRE_ALERT_CSV_TEMPLATE } from './preAlertCsvImport';

/** Lightweight fixture checks — run via: npx tsx src/app/freight/preAlertCsvImport.selfcheck.ts */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const parsed = parsePreAlertCsv(PRE_ALERT_CSV_TEMPLATE);
assert(parsed.errors.length === 0, `template errors: ${parsed.errors.join('; ')}`);
assert(parsed.rows.length === 2, `rows=${parsed.rows.length}`);
assert(parsed.rows[0].suiteCode === 'BSHPD10859', `suite=${parsed.rows[0].suiteCode}`);
assert(parsed.rows[0].tracking === 'TBA332697976197', `track=${parsed.rows[0].tracking}`);
assert(parsed.rows[0].declaredValueUsd === 12.99, `value=${parsed.rows[0].declaredValueUsd}`);
assert(parsed.rows[0].orderNumber === '111-7351808-5310605', `order=${parsed.rows[0].orderNumber}`);
assert(parsed.rows[1].tracking === '1ZX350640373014185', `track2=${parsed.rows[1].tracking}`);

const aliases = parsePreAlertCsv(`suite,tracking,value,order
BSHPD1,TBA111,9.5,ORD-1
`);
assert(aliases.errors.length === 0, `alias errors: ${aliases.errors.join('; ')}`);
assert(aliases.rows[0].suiteCode === 'BSHPD1', 'alias suite');
assert(aliases.rows[0].declaredValueUsd === 9.5, 'alias value');
assert(aliases.rows[0].orderNumber === 'ORD-1', 'alias order');

const missing = parsePreAlertCsv(`foo,bar\n1,2\n`);
assert(missing.rows.length === 0, 'missing headers should yield no rows');
assert(missing.errors.length > 0, 'missing headers should error');

const dup = parsePreAlertCsv(`suite,tracking
A,TBA1
B,TBA1
`);
assert(dup.rows.length === 1, `dup rows=${dup.rows.length}`);
assert(dup.errors.some((e) => e.includes('duplicate')), 'dup tracking should error');

console.log('preAlertCsvImport selfcheck OK', { templateRows: parsed.rows.length });
