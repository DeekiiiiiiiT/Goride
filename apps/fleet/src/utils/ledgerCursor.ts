/** Keyset cursor for unified ledger pages: effectiveAt + id. */

export type LedgerKeysetCursor = { effectiveAt: string; id: string };

export function encodeLedgerCursor(cursor: LedgerKeysetCursor | null | undefined): string | null {
  if (!cursor?.effectiveAt || !cursor?.id) return null;
  return `${cursor.effectiveAt}|${cursor.id}`;
}

export function decodeLedgerCursor(raw: string | null | undefined): LedgerKeysetCursor | null {
  if (!raw || typeof raw !== 'string') return null;
  const sep = raw.indexOf('|');
  if (sep <= 0 || sep >= raw.length - 1) return null;
  const effectiveAt = raw.slice(0, sep).trim();
  const id = raw.slice(sep + 1).trim();
  if (!effectiveAt || !id) return null;
  return { effectiveAt, id };
}

/** Normalize API nextCursor (string or { effectiveAt, id }) into a pipe-encoded string. */
export function normalizeLedgerNextCursor(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    return decodeLedgerCursor(raw) ? raw : null;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const effectiveAt = String(o.effectiveAt ?? o.effective_at ?? '').trim();
    const id = String(o.id ?? '').trim();
    return encodeLedgerCursor(effectiveAt && id ? { effectiveAt, id } : null);
  }
  return null;
}

export function formatUpdatedHhMm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}
