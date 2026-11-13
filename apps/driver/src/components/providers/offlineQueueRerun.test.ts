import { describe, expect, it } from 'vitest';
import { markRerunWhileSyncing, shouldProcessQueueAfterSync } from './offlineQueueRerun';

describe('offlineQueueRerun', () => {
  it('defers one rerun when processQueue is called during sync', () => {
    let deferred = false;
    deferred = markRerunWhileSyncing(deferred, true);
    expect(deferred).toBe(true);
    deferred = markRerunWhileSyncing(deferred, true);
    expect(deferred).toBe(true);
    expect(shouldProcessQueueAfterSync(deferred, true)).toBe(true);
    deferred = false;
    expect(shouldProcessQueueAfterSync(deferred, true)).toBe(false);
  });
});
