import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { buildItemDrawerRow } from '../../inventoryViewRows';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';

export type CustodyMode = 'transfer' | 'return' | 'writeoff';

/**
 * Stitch → data (In14 Custody)
 * item name → ItemDrawerRow.name | sku → ItemDrawerRow.sku | value → valueLabel | qty field → qty state
 */
export function useIn14CustodyForm() {
  const base = useInScreenBase();
  const { shell, live, submit, finishSuccess, close } = base;
  const load = useGapLoad(async () => {
    const locations = await inventoryApi.locationsBins();
    return { locations: (locations as { locations?: Row[] }).locations ?? [] };
  }, []);

  const [mode, setMode] = useState<CustodyMode>('transfer');
  const [itemId, setItemId] = useState('');
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [memo, setMemo] = useState('');

  const locations = load.data?.locations ?? [];
  const stockRows = shell.stockRows;
  /** Store + car locations only (no virtual ones). */
  const realLocations = locations.filter((l) => {
    const kind = String(l.kind ?? '');
    return (kind === 'warehouse' || kind === 'vehicle') && l.is_active !== false;
  });
  const storeLocations = realLocations.filter((l) => String(l.kind ?? '') === 'warehouse');
  const itemOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of stockRows) m.set(strField(r, 'item_id', ''), strField(r, 'name', 'Item'));
    for (const i of shell.items) if (!m.has(strField(i, 'id', ''))) m.set(strField(i, 'id', ''), strField(i, 'name', 'Item'));
    m.delete('');
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stockRows, shell.items]);

  useEffect(() => {
    if (itemId || !shell.selectedItemId) return;
    const row =
      stockRows.find((r) => strField(r, 'item_id', '') === shell.selectedItemId) ??
      shell.items.find((i) => strField(i, 'id', '') === shell.selectedItemId) ??
      null;
    if (row) {
      setItemId(strField(row, 'item_id', strField(row, 'id', '')));
      setFromLocationId(strField(row, 'location_id', ''));
    }
  }, [itemId, shell.selectedItemId, shell.items, stockRows]);

  useEffect(() => {
    if (toLocationId || mode !== 'return') return;
    const store = locations.find((l) => String(l.kind ?? '') === 'warehouse' && l.is_default === true);
    if (store) setToLocationId(String(store.id));
  }, [mode, locations, toLocationId]);

  const selectedRow =
    stockRows.find((r) => strField(r, 'item_id', '') === itemId) ??
    shell.items.find((i) => strField(i, 'id', '') === itemId) ??
    null;

  const itemDrawerRow = useMemo(() => buildItemDrawerRow(selectedRow, formatJmd), [selectedRow]);

  const selectedAsset =
    live.selectedAsset ??
    (shell.selectedAssetId
      ? shell.assets.find((a) => strField(a, 'id', '') === shell.selectedAssetId) ?? null
      : null);

  const itemName = itemDrawerRow?.name ?? '—';
  const itemSku = itemDrawerRow?.sku ?? '—';
  const valueLabel = formatJmd(
    selectedRow ? Number(strField(selectedRow, 'stock_value', '0')) : null,
  );

  const canSubmit =
    Boolean(itemId) &&
    Number(qty) > 0 &&
    (mode === 'transfer'
      ? Boolean(fromLocationId && toLocationId)
      : mode === 'return'
        ? Boolean(vehicleId && toLocationId)
        : Boolean(fromLocationId && reason.trim()));

  const submitDisabledReason = !canSubmit
    ? !itemId
      ? 'Select a stock item to transfer'
      : Number(qty) <= 0
        ? 'Quantity must be greater than zero'
        : mode === 'transfer' && (!fromLocationId || !toLocationId)
          ? 'Choose from and to locations'
          : mode === 'return' && (!vehicleId || !toLocationId)
            ? 'Choose vehicle and return location'
            : mode === 'writeoff' && (!fromLocationId || !reason.trim())
              ? 'Location and reason are required'
              : 'Complete required fields'
    : '';

  const submitCustody = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Complete required fields');
      const key = newInventoryIdempotencyKey(mode);
      if (mode === 'transfer') {
        await inventoryApi.transfer(
          {
            item_id: itemId,
            from_location_id: fromLocationId,
            to_location_id: toLocationId,
            qty: Number(qty),
          },
          key,
        );
      } else if (mode === 'return') {
        await inventoryApi.returnStock(
          {
            item_id: itemId,
            vehicle_id: vehicleId,
            to_location_id: toLocationId,
            qty: Number(qty),
          },
          key,
        );
      } else {
        await inventoryApi.writeOff(
          {
            item_id: itemId,
            location_id: fromLocationId,
            qty: Number(qty),
            reason: reason.trim(),
            memo: memo.trim() || null,
          },
          key,
        );
      }
      const result = await finishSuccess();
      return result;
    });

  return {
    ...base,
    load,
    submit,
    close,
    live,
    shell,
    mode,
    setMode,
    itemId,
    setItemId,
    fromLocationId,
    setFromLocationId,
    toLocationId,
    setToLocationId,
    vehicleId,
    setVehicleId,
    qty,
    setQty,
    reason,
    setReason,
    memo,
    setMemo,
    locations,
    stockRows,
    itemDrawerRow,
    itemName,
    itemSku,
    realLocations,
    storeLocations,
    itemOptions,
    selectedAsset,
    valueLabel,
    formatJmd,
    canSubmit,
    submitDisabledReason,
    submitCustody,
    strField,
  };
}
