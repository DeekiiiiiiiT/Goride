/**
 * Unit tests for tollSourceIdsFromKeys (pure helper — no Deno runtime needed).
 */
import { describe, expect, it } from 'vitest';

/** Mirror of toll_financial_reset.tollSourceIdsFromKeys for package-level coverage. */
function tollSourceIdsFromKeys(keys: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    const k = String(raw || '').trim();
    if (!k) continue;
    let id = k;
    if (k.startsWith('toll_ledger:')) id = k.slice('toll_ledger:'.length);
    else if (k.startsWith('transaction:')) id = k.slice('transaction:'.length);
    id = id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

describe('tollSourceIdsFromKeys', () => {
  it('strips toll_ledger and transaction prefixes and dedupes', () => {
    expect(
      tollSourceIdsFromKeys([
        'toll_ledger:abc',
        'transaction:abc',
        'toll_ledger:def',
        'ignored',
        '',
      ]),
    ).toEqual(['abc', 'def', 'ignored']);
  });
});
