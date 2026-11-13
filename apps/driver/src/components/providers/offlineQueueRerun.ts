/** Whether a queue rerun was requested while sync was already in progress. */
export function markRerunWhileSyncing(alreadyRequested: boolean, isSyncing: boolean): boolean {
  return isSyncing ? true : alreadyRequested;
}

/** After sync completes, run the queue once more if a rerun was deferred and work remains. */
export function shouldProcessQueueAfterSync(
  deferredRerun: boolean,
  pendingRetryable: boolean,
): boolean {
  return deferredRerun && pendingRetryable;
}
