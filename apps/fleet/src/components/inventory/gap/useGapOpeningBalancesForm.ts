import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type Row = Record<string, unknown>;

export function useGapOpeningBalancesForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [items, locations] = await Promise.all([
      inventoryApi.items(),
      inventoryApi.locationsBins(),
    ]);
    return {
      items: asPagedItems(items as { items?: unknown[] }),
      locations: (locations as { locations?: Row[] }).locations ?? [],
    };
  }, []);

  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState('');
  const [memo, setMemo] = useState('');
  const [balanceDate, setBalanceDate] = useState(() => new Date().toISOString().slice(0, 10));

  const items = load.data?.items ?? [];
  const locations = load.data?.locations ?? [];

  const selectedItem = items.find((it) => String(it.id) === itemId) ?? null;
  const selectedLocation = locations.find((loc) => String(loc.id) === locationId) ?? null;

  const draftLine = useMemo(() => {
    if (!selectedItem || !itemId) return null;
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return null;
    const unit =
      selectedItem.unit_cost_jmd != null
        ? Number(selectedItem.unit_cost_jmd)
        : selectedItem.default_cost_jmd != null
          ? Number(selectedItem.default_cost_jmd)
          : 0;
    return {
      id: itemId,
      name: String(selectedItem.name ?? '—'),
      sku: String(selectedItem.sku ?? '—'),
      qty: q,
      unit,
      lineTotal: q * unit,
    };
  }, [itemId, items, qty, selectedItem]);

  const canSubmit = Boolean(itemId && locationId && Number(qty) > 0);

  const allocatedPct = useMemo(() => {
    if (!draftLine) return 0;
    return 100;
  }, [draftLine]);

  const remainingPct = useMemo(() => Math.max(0, 100 - allocatedPct), [allocatedPct]);

  const previewTotalLabel = formatJmd(draftLine?.lineTotal ?? null);
  const previewLocationName = selectedLocation
    ? String(selectedLocation.name ?? selectedLocation.code ?? '—')
    : '—';
  const priorBatchLabel = 'Prior opening batch';
  const postBatchLabel = 'New opening batch';

  const post = () =>
    submit.run(async () => {
      if (!canSubmit) throw new Error('Choose item, location, and quantity');
      await inventoryApi.openingBalance(
        {
          lines: [
            {
              item_id: itemId,
              location_id: locationId,
              qty: Number(qty),
              unit_cost: draftLine?.unit ?? 0,
              memo: memo.trim() || null,
            },
          ],
        },
        crypto.randomUUID(),
      );
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    itemId,
    setItemId,
    locationId,
    setLocationId,
    qty,
    setQty,
    memo,
    setMemo,
    balanceDate,
    setBalanceDate,
    items,
    locations,
    selectedItem,
    selectedLocation,
    draftLine,
    canSubmit,
    allocatedPct,
    remainingPct,
    formatJmd,
    post,
    previewTotalLabel,
    previewLocationName,
    priorBatchLabel,
    postBatchLabel,
  };
}
