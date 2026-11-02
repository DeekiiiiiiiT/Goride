import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { asPagedItems, strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useGapLoad } from '../../gap/useGapLoad';
import { useInScreenBase, type Row } from './useInShared';

export type IssueLine = {
  key: string;
  itemId: string;
  name: string;
  sku: string;
  qty: string;
};

export function useIn5IssueForm() {
  const base = useInScreenBase();
  const { shell, live, submit, finishSuccess, close } = base;
  const load = useGapLoad(async () => {
    const locations = await inventoryApi.locationsBins();
    return {
      locations: (locations as { locations?: Row[] }).locations ?? [],
      items: shell.items.length ? shell.items : asPagedItems(await inventoryApi.items()),
    };
  }, [shell.items]);

  const [step, setStep] = useState(3);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [lines, setLines] = useState<IssueLine[]>([]);
  const [issueAvailableOnly, setIssueAvailableOnly] = useState(true);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  const locations = load.data?.locations ?? [];
  const items = load.data?.items ?? shell.stockRows;

  useEffect(() => {
    if (sourceLocationId || !locations.length) return;
    const store = locations.find((l) => {
      const kind = String(l.kind ?? '').toLowerCase();
      return kind.includes('warehouse') || kind.includes('store');
    });
    setSourceLocationId(String((store ?? locations[0]).id ?? ''));
  }, [locations, sourceLocationId]);

  useEffect(() => {
    if (vehicleIds.length) return;
    const plates = live.kitVehicles.map((v) => v.vehicleId).filter(Boolean);
    if (plates.length) setVehicleIds([String(plates[0])]);
  }, [live.kitVehicles, vehicleIds.length]);

  useEffect(() => {
    if (lines.length || !items.length) return;
    const row = shell.stockRows[0] ?? items[0];
    if (!row) return;
    setLines([
      {
        key: crypto.randomUUID(),
        itemId: strField(row, 'item_id', strField(row, 'id', '')),
        name: strField(row, 'name', '—'),
        sku: strField(row, 'sku', '—'),
        qty: '1',
      },
    ]);
  }, [items, lines.length, shell.stockRows]);

  const canPreview =
    Boolean(sourceLocationId) &&
    vehicleIds.length > 0 &&
    lines.every((l) => l.itemId && Number(l.qty) > 0);

  const canIssue = canPreview;

  const runPreview = () =>
    submit.run(async () => {
      if (!canPreview) throw new Error('Choose store, vehicle, and lines');
      const res = await inventoryApi.issuePreview({
        source_location_id: sourceLocationId,
        vehicle_ids: vehicleIds,
        issue_available_only: issueAvailableOnly,
        lines: lines.map((l) => ({ item_id: l.itemId, qty: Number(l.qty) })),
      });
      setPreview(res as Record<string, unknown>);
      setStep(3);
    });

  const issue = () =>
    submit.run(async () => {
      if (!canPreview) throw new Error('Preview issue first');
      await inventoryApi.issue(
        {
          source_location_id: sourceLocationId,
          vehicle_ids: vehicleIds,
          issue_available_only: issueAvailableOnly,
          lines: lines.map((l) => ({ item_id: l.itemId, qty: Number(l.qty) })),
        },
        newInventoryIdempotencyKey('issue'),
      );
      await finishSuccess();
    });

  const previewLabel = useMemo(() => {
    if (!preview) return 'Run preview to confirm quantities';
    const shortfalls = (preview.preview as { shortfalls?: unknown[] })?.shortfalls;
    if (Array.isArray(shortfalls) && shortfalls.length) return 'Some lines are short — adjust or enable available-only';
    return 'Preview ready — confirm issue';
  }, [preview]);

  const shortCount = useMemo(() => {
    const shortfalls = (preview?.preview as { shortfalls?: unknown[] })?.shortfalls;
    if (Array.isArray(shortfalls)) return shortfalls.length;
    return shell.kitComplianceRows.filter((row) => {
      const st = strField(row, 'line_status', '');
      return st === 'missing' || st === 'short';
    }).length;
  }, [preview, shell.kitComplianceRows]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const totalLabel = formatJmd(
    lines.reduce((sum, line) => {
      const row = shell.stockRows.find((r) => strField(r, 'item_id', '') === line.itemId);
      const unit = row ? Number(strField(row, 'unit_cost_jmd', '0')) : 0;
      return sum + unit * (Number(line.qty) || 0);
    }, 0) || null,
  );

  const storeReserveLabel = live.inStoreValue;

  const openDraftOrder = () => shell.openGap('purchase-order', { poId: null });

  const editCarsOrItems = () => setStep(1);

  return {
    load,
    submit,
    close,
    live,
    shell,
    step,
    setStep,
    locations,
    lines,
    setLines,
    sourceLocationId,
    setSourceLocationId,
    vehicleIds,
    setVehicleIds,
    issueAvailableOnly,
    setIssueAvailableOnly,
    preview,
    previewLabel,
    shortCount,
    canPreview,
    canIssue,
    runPreview,
    issue,
    totalUnits,
    totalLabel,
    storeReserveLabel,
    openDraftOrder,
    editCarsOrItems,
    formatJmd,
    strField,
  };
}
