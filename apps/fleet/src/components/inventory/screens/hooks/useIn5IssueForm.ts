import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { neededCells, numField, strField, type KitCell } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';

/** One row in the Issue dialog = one missing/short kit line on one car (IV-07). */
export type IssueRow = {
  key: string;
  cell: KitCell;
  /** Units this car still needs for the line. */
  need: number;
  /** Fuel card / toll tag lines are never issued from stock. */
  fromStock: boolean;
};

const rowKey = (c: KitCell) => `${c.vehicleId}::${c.kitLineId}`;

export function useIn5IssueForm() {
  const base = useInScreenBase();
  const { shell, live, submit, finishSuccess, close } = base;
  const request = shell.issueRequest;

  const load = useGapLoad(async () => {
    const [locations, templates] = await Promise.all([
      inventoryApi.locationsBins(),
      inventoryApi.kitsTemplates().catch(() => ({ items: [] })),
    ]);
    return {
      locations: (locations as { locations?: Row[] }).locations ?? [],
      templates: (templates as { items?: Row[] }).items ?? [],
    };
  }, []);

  const locations = load.data?.locations ?? [];
  const store = useMemo(() => {
    const warehouses = locations.filter((l) => String(l.kind ?? '') === 'warehouse');
    return warehouses.find((l) => l.is_default === true) ?? warehouses[0] ?? null;
  }, [locations]);
  const sourceLocationId = store ? String(store.id ?? '') : '';
  const storeName = store ? strField(store, 'name', 'Store') : '—';

  const [carFilter, setCarFilter] = useState<string>(request.vehicleId ?? '');

  const allRows = useMemo<IssueRow[]>(
    () =>
      neededCells(live.kitVehicles).map((cell) => ({
        key: rowKey(cell),
        cell,
        need: Math.max(1, Math.ceil(cell.qtyRequired - cell.onHandInCar)),
        fromStock: cell.itemId != null,
      })),
    [live.kitVehicles],
  );
  const rows = useMemo(
    () => (carFilter ? allRows.filter((r) => r.cell.vehicleId === carFilter) : allRows),
    [allRows, carFilter],
  );

  /** In-store quantity per item (store-needs view; no balance row = 0). */
  const storeQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of live.storeNeeds) m.set(n.itemId, n.storeOnHand);
    if (store) {
      for (const r of shell.stockRows) {
        const itemId = strField(r, 'item_id', '');
        if (!m.has(itemId) && strField(r, 'location_id', '') === sourceLocationId) {
          m.set(itemId, numField(r, 'on_hand', 0));
        }
      }
    }
    return m;
  }, [live.storeNeeds, shell.stockRows, store, sourceLocationId]);

  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [initDone, setInitDone] = useState(false);

  /** Store left per item after the ticked rows are covered. */
  const remainingAfter = (selection: Set<string>) => {
    const left = new Map(storeQty);
    for (const r of allRows) {
      if (!selection.has(r.key) || !r.cell.itemId) continue;
      left.set(r.cell.itemId, (left.get(r.cell.itemId) ?? 0) - r.need);
    }
    return left;
  };

  // Open with exactly what the caller asked for, never more than the store can cover.
  useEffect(() => {
    if (initDone || !allRows.length) return;
    const wanted = allRows.filter((r) => {
      if (!r.fromStock) return false;
      if (request.allMissing) return true;
      if (!request.vehicleId || r.cell.vehicleId !== request.vehicleId) return false;
      return request.kitLineIds.includes(r.cell.kitLineId);
    });
    const next = new Set<string>();
    const left = new Map(storeQty);
    for (const r of wanted) {
      const have = left.get(r.cell.itemId!) ?? 0;
      if (have >= r.need) {
        next.add(r.key);
        left.set(r.cell.itemId!, have - r.need);
      }
    }
    setTicked(next);
    setInitDone(true);
  }, [allRows, initDone, request, storeQty]);

  const left = remainingAfter(ticked);
  const inStoreFor = (r: IssueRow) => (r.cell.itemId ? storeQty.get(r.cell.itemId) ?? 0 : 0);
  /** A row can be ticked when it is from stock and the store still covers it. */
  const canTick = (r: IssueRow) =>
    r.fromStock && (ticked.has(r.key) || (left.get(r.cell.itemId!) ?? 0) >= r.need);

  const toggle = (r: IssueRow) => {
    if (!canTick(r)) return;
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(r.key)) next.delete(r.key);
      else next.add(r.key);
      return next;
    });
  };

  const tickedRows = allRows.filter((r) => ticked.has(r.key));
  const uncoverable = rows.filter((r) => r.fromStock && !canTick(r));
  const canIssue = Boolean(sourceLocationId) && tickedRows.length > 0;

  /** Sends exactly the ticked rows: one call per car with only that car's lines. */
  const issue = () =>
    submit.run(async () => {
      if (!canIssue) throw new Error('Tick at least one line the store can cover');
      const byCar = new Map<string, IssueRow[]>();
      for (const r of tickedRows) {
        const list = byCar.get(r.cell.vehicleId) ?? [];
        list.push(r);
        byCar.set(r.cell.vehicleId, list);
      }
      for (const [vehicleId, carRows] of byCar) {
        await inventoryApi.issue(
          {
            source_location_id: sourceLocationId,
            vehicle_ids: [vehicleId],
            issue_available_only: false,
            lines: carRows.map((r) => ({ item_id: r.cell.itemId!, qty: r.need })),
          },
          newInventoryIdempotencyKey('issue'),
        );
      }
      await finishSuccess();
    });

  const kitName = useMemo(() => {
    const code = strField(live.complianceRows[0] ?? {}, 'kit_code', '');
    const t = (load.data?.templates ?? []).find((x) => strField(x, 'code', '') === code);
    return t ? strField(t, 'name', code || 'Kit') : code || 'Kit';
  }, [live.complianceRows, load.data?.templates]);
  const kitLineCount = useMemo(
    () => new Set(live.complianceRows.map((r) => strField(r, 'kit_line_id', ''))).size,
    [live.complianceRows],
  );

  const shortfallSentence =
    uncoverable.length === 0
      ? rows.some((r) => r.fromStock)
        ? `${storeName} can cover every line shown.`
        : 'Nothing here is issued from stock.'
      : `${uncoverable.length} line${uncoverable.length === 1 ? '' : 's'} can't be issued: ${[
          ...new Set(uncoverable.map((r) => r.cell.label)),
        ].join(', ')} — receive first.`;

  const totalUnits = tickedRows.reduce((s, r) => s + r.need, 0);
  const tickedCars = new Set(tickedRows.map((r) => r.cell.vehicleId)).size;

  return {
    load,
    submit,
    close,
    live,
    shell,
    storeName,
    kitName,
    kitLineCount,
    carFilter,
    setCarFilter,
    rows,
    ticked,
    toggle,
    canTick,
    inStoreFor,
    uncoverable,
    shortfallSentence,
    canIssue,
    issue,
    totalUnits,
    tickedCars,
    formatJmd,
  };
}
