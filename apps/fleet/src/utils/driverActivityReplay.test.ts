/**
 * I9 replay disposability — projection rows are unique on (source, source_event_id).
 * Truncate + replay must not duplicate; this unit models the upsert contract.
 */
import { describe, expect, it } from 'vitest';

function projectUpsert(
  existing: Map<string, { source: string; source_event_id: string; event_type: string }>,
  incoming: Array<{ source: string; source_event_id: string; event_type: string }>,
) {
  let inserted = 0;
  let conflicted = 0;
  for (const row of incoming) {
    const key = `${row.source}::${row.source_event_id}`;
    if (existing.has(key)) {
      conflicted += 1;
      continue;
    }
    existing.set(key, row);
    inserted += 1;
  }
  return { inserted, conflicted, size: existing.size };
}

describe('activity projection replay (I9)', () => {
  it('replaying the same batch three times keeps row count stable', () => {
    const store = new Map<string, { source: string; source_event_id: string; event_type: string }>();
    const batch = [
      { source: 'rides.audit_events', source_event_id: '1', event_type: 'offer_accepted' },
      { source: 'rides.audit_events', source_event_id: '2', event_type: 'job_completed' },
      { source: 'fleet.driver_presence_log', source_event_id: '9', event_type: 'went_online' },
    ];
    const first = projectUpsert(store, batch);
    expect(first.inserted).toBe(3);
    const second = projectUpsert(store, batch);
    expect(second.inserted).toBe(0);
    expect(second.conflicted).toBe(3);
    const third = projectUpsert(store, batch);
    expect(third.size).toBe(3);
    expect(third.conflicted).toBe(3);
  });
});
