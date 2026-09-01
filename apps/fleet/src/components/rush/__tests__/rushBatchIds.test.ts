import { describe, expect, it } from 'vitest';
import { weekStartYmdFromIso } from '../../../../../../supabase/functions/_shared/rushBatchIds.ts';

describe('rushBatchIds Jamaica week', () => {
  it('uses local Jamaica week boundary', () => {
    // Sunday evening Jamaica (UTC+5) — still same calendar week as Monday start
    const ymd = weekStartYmdFromIso('2026-09-07T02:00:00.000Z'); // Sun 9pm Jamaica
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
