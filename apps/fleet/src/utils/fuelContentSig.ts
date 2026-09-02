/**
 * Shared hashing for fuel recon query/cache keys — length-only keys miss amount edits (H7/M8).
 */

export function hashFuelContentSig(parts: Array<string | number | null | undefined>): string {
  // FNV-1a 32-bit — fast, stable enough for cache invalidation
  let h = 0x811c9dc5;
  const s = parts.map((p) => (p == null ? '' : String(p))).join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function fuelEntriesContentSig(
  entries: Array<{ id?: string; amount?: number; updatedAt?: string; reconciliationStatus?: string; metadata?: unknown }>,
): string {
  return hashFuelContentSig(
    entries.flatMap((e) => [
      e.id,
      Number(e.amount) || 0,
      e.updatedAt || '',
      e.reconciliationStatus || '',
      (e.metadata as any)?.exceptionResolvedAt || '',
      (e.metadata as any)?.reconExceptionAck || '',
    ]),
  );
}

export function fuelAdjustmentsContentSig(
  adjs: Array<{ id?: string; distance?: number; updatedAt?: string }>,
): string {
  return hashFuelContentSig(adjs.flatMap((a) => [a.id, Number(a.distance) || 0, a.updatedAt || '']));
}

export function fuelScenariosContentSig(
  scenarios: Array<{ id?: string; updatedAt?: string; isDefault?: boolean }>,
): string {
  return hashFuelContentSig(scenarios.flatMap((s) => [s.id, s.updatedAt || '', s.isDefault ? 1 : 0]));
}

export function fuelDisputesContentSig(
  disputes: Array<{ id?: string; status?: string; updatedAt?: string; weekStart?: string }>,
): string {
  return hashFuelContentSig(
    disputes.flatMap((d) => [d.id, d.status || '', d.updatedAt || '', d.weekStart || '']),
  );
}
