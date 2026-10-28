import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('statement summary org scope', () => {
  it('does not scan the ledger without an organisation and a date window', () => {
    const src = readFileSync(
      new URL('../../../supabase/functions/_fleet-server/statement_summary_build.ts', import.meta.url),
      'utf8',
    );
    const call = src.slice(src.indexOf('listCanonicalViaPage'));
    expect(call.includes('organizationId:')).toBe(true);
    expect(call.includes('from:')).toBe(true);
    expect(call.includes('to:')).toBe(true);
    expect(src.includes('maxRows: 100_000')).toBe(false);
  });
});
