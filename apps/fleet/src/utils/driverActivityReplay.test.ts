/**
 * Client contract only: duplicate (source, source_event_id) keys collapse.
 * Real disposability is enforced by UNIQUE (source, source_event_id) on the
 * projection table and observed in production ingest (0 duplicates across
 * overlapping cron runs). This file does not exercise truncate-and-replay.
 */
import { describe, expect, it } from 'vitest';

function dedupeBySourceKey(
  rows: Array<{ source: string; source_event_id: string }>,
): Array<{ source: string; source_event_id: string }> {
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    const k = `${r.source}::${r.source_event_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

describe('activity projection idempotency contract', () => {
  it('collapses duplicate source keys (ON CONFLICT DO NOTHING shape)', () => {
    const batch = [
      { source: 'rides.audit_events', source_event_id: '1' },
      { source: 'rides.audit_events', source_event_id: '1' },
      { source: 'rides.audit_events', source_event_id: '2' },
    ];
    expect(dedupeBySourceKey(batch)).toHaveLength(2);
    expect(dedupeBySourceKey([...batch, ...batch])).toHaveLength(2);
  });
});
