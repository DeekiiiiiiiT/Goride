import { useEffect, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';

export type CustodyMode = 'transfer' | 'return' | 'writeoff';

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

  useEffect(() => {
    if (itemId) return;
    const row =
      shell.selectedItemId != null
        ? stockRows.find((r) => strField(r, 'item_id', '') === shell.selectedItemId) ??
          shell.items.find((i) => strField(i, 'id', '') === shell.selectedItemId)
        : stockRows[0];
    if (row) {
      setItemId(strField(row, 'item_id', strField(row, 'id', '')));
      setFromLocationId(strField(row, 'location_id', ''));
    }
  }, [itemId, shell.selectedItemId, shell.items, stockRows]);

  useEffect(() => {
    if (vehicleId) return;
    const v = live.primaryVehicle?.vehicleId;
    if (v) setVehicleId(String(v));
  }, [live.primaryVehicle, vehicleId]);

  const selectedRow =
    stockRows.find((r) => strField(r, 'item_id', '') === itemId) ??
    shell.items.find((i) => strField(i, 'id', '') === itemId) ??
    null;

  const itemName = selectedRow ? strField(selectedRow, 'name', '—') : '—';
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
    itemName,
    valueLabel,
    formatJmd,
    canSubmit,
    submitCustody,
    strField,
  };
}
