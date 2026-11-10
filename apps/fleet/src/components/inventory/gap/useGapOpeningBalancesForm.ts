import { useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems, numField, strField } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type Row = Record<string, unknown>;

export type OpeningLine = { key: string; itemId: string; name: string; sku: string; qty: string; unitCost: string };

/** Opening balances: several lines for one place, real unit costs, review step (IV-13, IV-17). */
export function useGapOpeningBalancesForm(onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [items, locations] = await Promise.all([inventoryApi.items(), inventoryApi.locationsBins()]);
    return {
      items: asPagedItems(items as { items?: unknown[] }),
      locations: ((locations as { locations?: Row[] }).locations ?? []).filter((l) => {
        const kind = String(l.kind ?? '');
        return (kind === 'warehouse' || kind === 'vehicle') && l.is_active !== false;
      }),
    };
  }, []);

  const items = (load.data?.items ?? []).filter((it) => !it.archived_at);
  const locations = load.data?.locations ?? [];
  const [locationId, setLocationIdRaw] = useState('');
  const [lines, setLines] = useState<OpeningLine[]>([]);
  const [pickItemId, setPickItemId] = useState('');
  const [memo, setMemo] = useState('');
  const [step, setStep] = useState<'edit' | 'review'>('edit');

  const selectedLocation = locations.find((l) => String(l.id) === locationId) ?? null;
  const setLocationId = (id: string) => {
    setLocationIdRaw(id);
    setStep('edit');
  };

  /** What is already recorded at the chosen place (real stock rows). */
  const existingRows = useMemo(
    () => shell.stockRows.filter((r) => strField(r, 'location_id', '') === locationId && numField(r, 'on_hand', 0) > 0),
    [shell.stockRows, locationId],
  );

  const addLine = (itemId = pickItemId) => {
    const it = items.find((x) => String(x.id) === itemId);
    if (!it || lines.some((l) => l.itemId === itemId)) return;
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        itemId,
        name: String(it.name ?? '—'),
        sku: String(it.sku ?? '—'),
        qty: '1',
        unitCost: it.default_unit_cost != null ? String(it.default_unit_cost) : '',
      },
    ]);
    setPickItemId('');
  };
  const updateLine = (key: string, patch: Partial<OpeningLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const parsed = lines.map((l) => ({
    ...l,
    q: Number(l.qty),
    c: Number(String(l.unitCost).replace(/,/g, '')),
  }));
  const validLines = parsed.filter((l) => Number.isFinite(l.q) && l.q > 0 && Number.isFinite(l.c) && l.c >= 0);
  const total = validLines.reduce((s, l) => s + l.q * l.c, 0);
  const units = validLines.reduce((s, l) => s + l.q, 0);
  const canReview = Boolean(locationId) && lines.length > 0 && validLines.length === lines.length;

  const post = () =>
    submit.run(async () => {
      if (!canReview) throw new Error('Choose a place and give every line a quantity and cost');
      await inventoryApi.openingBalance(
        {
          lines: validLines.map((l) => ({
            item_id: l.itemId,
            location_id: locationId,
            qty: l.q,
            unit_cost: l.c,
            memo: memo.trim() || null,
          })),
        },
        crypto.randomUUID(),
      );
      setLines([]);
      setStep('edit');
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    items,
    locations,
    locationId,
    setLocationId,
    selectedLocation,
    existingRows,
    lines,
    pickItemId,
    setPickItemId,
    addLine,
    updateLine,
    removeLine,
    memo,
    setMemo,
    step,
    setStep,
    total,
    units,
    canReview,
    post,
    formatJmd,
  };
}
