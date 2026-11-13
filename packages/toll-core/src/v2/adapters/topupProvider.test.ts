import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { topupProvider } from './topupProvider.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

describe('topupProvider', () => {
  const text = readFileSync(join(FIXTURES, 'transjam_topups.csv'), 'utf8');

  it('accepts success and rejects failure rows', () => {
    const out = topupProvider(text, { tagToVehicle: { '1234': 'vehicle-a' } });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toEqual({
      source_ref: 'tx-ok-1',
      topped_up_on: '2024-03-15',
      amount_minor: 100000,
      provider: 'transjam',
      account_ref: '1234',
      vehicle_id: 'vehicle-a',
    });
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0].reason).toContain('Failed');
  });

  it('is deterministic', () => {
    const ctx = { tagToVehicle: { '1234': 'vehicle-a' } };
    expect(topupProvider(text, ctx)).toEqual(topupProvider(text, ctx));
  });
});
