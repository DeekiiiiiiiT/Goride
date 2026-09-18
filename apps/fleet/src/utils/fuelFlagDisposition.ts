/**
 * Fill-level flag disposition — current-state answer to a classifier claim.
 * Dual-read: disposition row OR legacy reconExceptionAck counts as disposed.
 */

export type FuelFlagDispositionAction = 'accepted' | 'corrected' | 'escalated';

export type FuelFlagDispositionRecord = {
  entryId: string;
  flagCode: string;
  action: FuelFlagDispositionAction;
  note?: string | null;
  actorId?: string | null;
  at?: string | null;
  periodId?: string | null;
};

/** Map entryId → flagCode → disposition record */
export type FuelFlagDispositionMap = Map<string, Map<string, FuelFlagDispositionRecord>>;

export function emptyFuelFlagDispositionMap(): FuelFlagDispositionMap {
  return new Map();
}

export function upsertDispositionIntoMap(
  map: FuelFlagDispositionMap,
  rec: FuelFlagDispositionRecord,
): FuelFlagDispositionMap {
  const next = new Map(map);
  const byCode = new Map(next.get(rec.entryId) || []);
  byCode.set(rec.flagCode, rec);
  next.set(rec.entryId, byCode);
  return next;
}

export function dispositionMapFromRows(
  rows: Array<Partial<FuelFlagDispositionRecord> & { entryId?: string; entry_id?: string; flagCode?: string; flag_code?: string }>,
): FuelFlagDispositionMap {
  const map = emptyFuelFlagDispositionMap();
  for (const r of rows) {
    const entryId = String(r.entryId || r.entry_id || '').trim();
    const flagCode = String(r.flagCode || r.flag_code || '').trim();
    if (!entryId || !flagCode) continue;
    const action = String(r.action || 'accepted') as FuelFlagDispositionAction;
    if (action !== 'accepted' && action !== 'corrected' && action !== 'escalated') continue;
    const byCode = map.get(entryId) || new Map();
    byCode.set(flagCode, {
      entryId,
      flagCode,
      action,
      note: r.note ?? null,
      actorId: (r as { actorId?: string; actor_id?: string }).actorId
        ?? (r as { actor_id?: string }).actor_id
        ?? null,
      at: r.at ?? null,
      periodId: (r as { periodId?: string; period_id?: string }).periodId
        ?? (r as { period_id?: string }).period_id
        ?? null,
    });
    map.set(entryId, byCode);
  }
  return map;
}

/** Codes disposed for an entry (from disposition table). */
export function disposedFlagCodesForEntry(
  map: FuelFlagDispositionMap | undefined,
  entryId: string,
): Set<string> {
  const byCode = map?.get(entryId);
  if (!byCode) return new Set();
  return new Set(byCode.keys());
}

export function getDisposition(
  map: FuelFlagDispositionMap | undefined,
  entryId: string,
  flagCode: string,
): FuelFlagDispositionRecord | null {
  return map?.get(entryId)?.get(flagCode) || null;
}

/** Legacy metadata ack — counts as disposed for signal_exception during dual-read. */
export function isLegacyExceptionAck(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  if (metadata.exceptionResolvedAt) return true;
  const ack = metadata.reconExceptionAck;
  return ack === true || ack === 'true' || ack === 1 || ack === '1';
}

/**
 * Whether a specific flag_code is disposed for this fill.
 * Dual-read: disposition row OR (signal_exception + legacy ack).
 */
export function isFlagCodeDisposed(opts: {
  entryId: string;
  flagCode: string;
  dispositions?: FuelFlagDispositionMap;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (getDisposition(opts.dispositions, opts.entryId, opts.flagCode)) return true;
  if (opts.flagCode === 'signal_exception' && isLegacyExceptionAck(opts.metadata)) {
    return true;
  }
  return false;
}
