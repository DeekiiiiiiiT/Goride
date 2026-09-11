/**
 * Completeness harness helpers (audit §12.1) — pure logic for pagination sweeps.
 * Asserts a paged id stream has no duplicates and equals the expected set.
 */
export function assertPaginationCompleteness(
  pageIdLists: string[][],
  expectedIds: string[],
): { ok: true } | { ok: false; reason: string } {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const page of pageIdLists) {
    for (const id of page) {
      if (!id) return { ok: false, reason: 'empty id in page' };
      if (seen.has(id)) return { ok: false, reason: `duplicate id: ${id}` };
      seen.add(id);
      ordered.push(id);
    }
  }
  if (ordered.length !== expectedIds.length) {
    return {
      ok: false,
      reason: `count mismatch: got ${ordered.length} expected ${expectedIds.length}`,
    };
  }
  const expected = new Set(expectedIds);
  for (const id of ordered) {
    if (!expected.has(id)) return { ok: false, reason: `unexpected id: ${id}` };
  }
  for (const id of expectedIds) {
    if (!seen.has(id)) return { ok: false, reason: `missing id: ${id}` };
  }
  return { ok: true };
}

/** Stats agreement to the cent. */
export function assertStatsAgree(
  pageSums: { amount: number; net: number }[],
  stats: { sumAmount: number; sumNet: number },
): { ok: true } | { ok: false; reason: string } {
  const amount = pageSums.reduce((s, p) => s + p.amount, 0);
  const net = pageSums.reduce((s, p) => s + p.net, 0);
  const round2 = (n: number) => Math.round(n * 100);
  if (round2(amount) !== round2(stats.sumAmount)) {
    return { ok: false, reason: `sumAmount ${amount} != ${stats.sumAmount}` };
  }
  if (round2(net) !== round2(stats.sumNet)) {
    return { ok: false, reason: `sumNet ${net} != ${stats.sumNet}` };
  }
  return { ok: true };
}
