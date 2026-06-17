/** Client-side driver ID variants for transaction fetch (matches server expandStatementSummaryDriverIds). */
export function expandDriverTransactionIds(ids: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id) continue;
    out.add(id);
    const lc = id.toLowerCase();
    if (lc !== id) out.add(lc);
    const uc = id.toUpperCase();
    if (uc !== id) out.add(uc);
  }
  return [...out];
}
