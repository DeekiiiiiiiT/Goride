import { describe, expect, it } from 'vitest';
import {
  parseTollTagCreate,
  parseTollTagPatch,
  readConcurrencyToken,
} from './tollTagWrite';

describe('parseTollTagCreate', () => {
  it('keeps only the fields a fleet may set', () => {
    const parsed = parseTollTagCreate({
      provider: 'T-Tag',
      tagNumber: ' 212100286450 ',
      status: 'Active',
      lastCalculatedBalance: 1,
      organizationId: 'other-org',
      assignedVehicleId: 'veh',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fields).toEqual({
      provider: 'T-Tag',
      tagNumber: '212100286450',
      status: 'Active',
    });
  });

  it('accepts a lowercase status from a spreadsheet', () => {
    const parsed = parseTollTagCreate({ provider: 'T-Tag', tagNumber: '1', status: 'active' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fields.status).toBe('Active');
  });

  it('refuses a missing tag number and an unknown provider', () => {
    expect(parseTollTagCreate({ provider: 'T-Tag', status: 'Active' }).ok).toBe(false);
    expect(parseTollTagCreate({ provider: 'Nope', tagNumber: '1' }).ok).toBe(false);
  });
});

describe('parseTollTagPatch', () => {
  it('refuses Retired — retire is its own action', () => {
    const parsed = parseTollTagPatch({ status: 'Retired' });
    expect(parsed.ok).toBe(false);
  });
});

describe('readConcurrencyToken', () => {
  it('requires expectedUpdatedAt', () => {
    expect(readConcurrencyToken({}).ok).toBe(false);
    expect(readConcurrencyToken({ expectedUpdatedAt: '2026-10-05T00:00:00.000Z' })).toEqual({
      ok: true,
      token: '2026-10-05T00:00:00.000Z',
    });
  });
});
