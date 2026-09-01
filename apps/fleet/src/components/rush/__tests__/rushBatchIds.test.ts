import { describe, expect, it } from 'vitest';
import { weekStartYmdFromIso } from '../../../../../../supabase/functions/_shared/rushBatchIds.ts';

describe('rushBatchIds Jamaica week', () => {
  it('Sunday 9pm Jamaica stays in the week starting prior Monday', () => {
    // 2026-09-07T02:00:00Z = Sun Sep 6 2026 21:00 in America/Jamaica (UTC-5)
    expect(weekStartYmdFromIso('2026-09-07T02:00:00.000Z')).toBe('2026-08-31');
  });

  it('Monday morning Jamaica uses same week', () => {
    // 2026-09-07T14:00:00Z = Mon Sep 7 2026 09:00 Jamaica
    expect(weekStartYmdFromIso('2026-09-07T14:00:00.000Z')).toBe('2026-09-07');
  });
});
