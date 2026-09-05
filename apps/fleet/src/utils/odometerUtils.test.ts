import { describe, expect, it } from 'vitest';
import { deduplicateEntries, processUnifiedHistory } from './odometerUtils';

describe('deduplicateEntries', () => {
  it('collapses exact same clock-minute + odometer re-submits', () => {
    const rows = [
      {
        id: 'a',
        date: '2026-09-01T10:08:00',
        recordedAt: '2026-09-01T10:08:00.000Z',
        value: 181899,
        source: 'fuel',
        isVerified: true,
      },
      {
        id: 'b',
        date: '2026-09-01T10:08:00',
        recordedAt: '2026-09-01T10:08:12.000Z',
        value: 181899,
        source: 'fuel',
        isVerified: true,
      },
      {
        id: 'c',
        date: '2026-09-01T10:08:00',
        recordedAt: '2026-09-01T10:08:45.000Z',
        value: 181899,
        source: 'manual',
        isVerified: true,
      },
    ];
    const deduped = deduplicateEntries(rows as any);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('a'); // fuel priority keeps first
  });

  it('collapses same odo within 15 minutes (re-submit pattern)', () => {
    const rows = [
      {
        id: 'a',
        date: '2026-08-28T08:52:00',
        recordedAt: '2026-08-28T08:52:00',
        value: 181198,
        source: 'fuel',
      },
      {
        id: 'b',
        date: '2026-08-28T08:55:00',
        recordedAt: '2026-08-28T08:55:00',
        value: 181198,
        source: 'fuel',
      },
      {
        id: 'c',
        date: '2026-08-28T08:56:00',
        recordedAt: '2026-08-28T08:56:00',
        value: 181198,
        source: 'fuel',
      },
    ];
    const deduped = deduplicateEntries(rows as any);
    expect(deduped).toHaveLength(1);
  });

  it('keeps different clock minutes more than 15 min apart with same odometer', () => {
    const rows = [
      {
        id: 'a',
        date: '2026-09-01T10:08:00',
        recordedAt: '2026-09-01T10:08:00',
        value: 181899,
        source: 'fuel',
      },
      {
        id: 'b',
        date: '2026-09-01T10:30:00',
        recordedAt: '2026-09-01T10:30:00',
        value: 181899,
        source: 'fuel',
      },
    ];
    const deduped = deduplicateEntries(rows as any);
    expect(deduped).toHaveLength(2);
  });
});

describe('processUnifiedHistory', () => {
  it('sorts newest-first after collapse', () => {
    const rows = [
      {
        id: 'old',
        date: '2026-09-01T09:00:00',
        recordedAt: '2026-09-01T09:00:00',
        value: 100,
        source: 'fuel',
      },
      {
        id: 'new',
        date: '2026-09-01T11:00:00',
        recordedAt: '2026-09-01T11:00:00',
        value: 200,
        source: 'fuel',
      },
    ];
    const processed = processUnifiedHistory(rows as any);
    expect(processed.map(r => r.id)).toEqual(['new', 'old']);
  });
});
