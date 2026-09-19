/**
 * Admin Known-fill cash trust stamp (audit A6) — no-review path stays intentional.
 */
export function stampAdminKnownFillCashMeta(
  meta: Record<string, unknown> | undefined,
  actorId?: string | null,
): Record<string, unknown> {
  return {
    ...(meta || {}),
    entrySource: 'admin-manual',
    adminBypassReview: true,
    adminKnownFillAt: new Date().toISOString(),
    ...(actorId ? { adminKnownFillBy: actorId } : {}),
  };
}

export function isAdminKnownFillCashMeta(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return meta.adminBypassReview === true || meta.adminBypassReview === 'true';
}
