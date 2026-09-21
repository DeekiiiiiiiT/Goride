import { describe, expect, it } from 'vitest';

/** Mirrors FuelReimbursementTable.resolveFuelEntryIdForTx for unit coverage. */
function resolveFuelEntryIdForTx(
  tx: { id: string; metadata?: Record<string, unknown> },
  logs: Array<{ id: string; transactionId?: string }>,
): string | null {
  const meta = tx.metadata;
  const fromMeta = meta?.fuelEntryId ?? meta?.sourceId;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const linked = logs.find(
    (l) => l.transactionId === tx.id || l.id === meta?.sourceId,
  );
  return linked?.id ? String(linked.id) : null;
}

function collectBulkFuelEntryIds(
  selectedTxIds: Iterable<string>,
  transactions: Array<{ id: string; metadata?: Record<string, unknown> }>,
  logs: Array<{ id: string; transactionId?: string }>,
  max = 200,
): { ids: string[]; overCap: boolean } {
  const ids: string[] = [];
  for (const txId of selectedTxIds) {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) continue;
    const entryId = resolveFuelEntryIdForTx(tx, logs);
    if (entryId) ids.push(entryId);
  }
  const unique = [...new Set(ids)];
  return { ids: unique, overCap: unique.length > max };
}

describe('Review Queue bulk set service line', () => {
  it('resolves fuel entry id from metadata then linked log', () => {
    expect(
      resolveFuelEntryIdForTx(
        { id: 'tx1', metadata: { fuelEntryId: 'fe-1' } },
        [],
      ),
    ).toBe('fe-1');
    expect(
      resolveFuelEntryIdForTx(
        { id: 'tx2', metadata: {} },
        [{ id: 'fe-2', transactionId: 'tx2' }],
      ),
    ).toBe('fe-2');
    expect(resolveFuelEntryIdForTx({ id: 'tx3' }, [])).toBeNull();
  });

  it('collects unique ids and flags the 200-cap', () => {
    const txs = [
      { id: 'a', metadata: { fuelEntryId: 'fe-a' } },
      { id: 'b', metadata: { fuelEntryId: 'fe-a' } },
      { id: 'c', metadata: { fuelEntryId: 'fe-c' } },
    ];
    const { ids, overCap } = collectBulkFuelEntryIds(['a', 'b', 'c'], txs, []);
    expect(ids).toEqual(['fe-a', 'fe-c']);
    expect(overCap).toBe(false);

    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `t${i}`,
      metadata: { fuelEntryId: `fe-${i}` },
    }));
    const big = collectBulkFuelEntryIds(
      many.map((t) => t.id),
      many,
      [],
    );
    expect(big.ids).toHaveLength(201);
    expect(big.overCap).toBe(true);
  });
});
