import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type Row = Record<string, unknown>;

export type PoDraftLine = {
  key: string;
  itemId: string;
  name: string;
  sku: string;
  qty: number;
  unit: number;
};

export type PoExtraCost = {
  key: string;
  kind: string;
  label: string;
  amount: string;
};

function lineFromItem(row: Row, qty: number): PoDraftLine {
  const itemId = String(row.id ?? '');
  const unit =
    row.unit_cost_jmd != null
      ? Number(row.unit_cost_jmd)
      : row.default_cost_jmd != null
        ? Number(row.default_cost_jmd)
        : 0;
  return {
    key: itemId || crypto.randomUUID(),
    itemId,
    name: String(row.name ?? '—'),
    sku: String(row.sku ?? '—'),
    qty,
    unit: Number.isFinite(unit) ? unit : 0,
  };
}

export function useGapPurchaseOrderForm(poId: string | null | undefined, onClose?: () => void) {
  const shell = useInventoryShell();
  const submit = useGapSubmit();
  const load = useGapLoad(async () => {
    const [vendors, items, locations, posPayload] = await Promise.all([
      inventoryApi.vendors(),
      inventoryApi.items(),
      inventoryApi.locationsBins(),
      inventoryApi.purchaseOrders(),
    ]);
    const purchaseOrders = asPagedItems(posPayload as { items?: unknown[] });
    const existing = poId
      ? (purchaseOrders.find((po) => String(po.id) === poId) ?? null)
      : null;
    return {
      vendors: asPagedItems(vendors as { items?: unknown[] }),
      items: asPagedItems(items as { items?: unknown[] }),
      locations: (locations as { locations?: Row[] }).locations ?? [],
      existing,
    };
  }, [poId]);

  const [vendorId, setVendorId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [draftLines, setDraftLines] = useState<PoDraftLine[]>([]);
  const [extraCosts, setExtraCosts] = useState<PoExtraCost[]>([]);

  const existing = load.data?.existing ?? null;

  useEffect(() => {
    if (!existing) return;
    setVendorId(existing.vendor_id != null ? String(existing.vendor_id) : '');
    setLocationId(
      existing.ship_to_location_id != null ? String(existing.ship_to_location_id) : '',
    );
    const lines = (existing.lines as Row[] | undefined) ?? [];
    if (lines.length) {
      setDraftLines(
        lines.map((line) => ({
          key: String(line.id ?? line.item_id ?? crypto.randomUUID()),
          itemId: String(line.item_id ?? ''),
          name: String(line.name ?? '—'),
          sku: String(line.sku ?? '—'),
          qty: Number(line.qty_ordered ?? line.qty ?? 1),
          unit: Number(line.unit_cost_jmd ?? line.unit_price ?? 0),
        })),
      );
    }
    if (existing.expected_delivery_date) {
      setExpectedDelivery(String(existing.expected_delivery_date).slice(0, 10));
    }
  }, [existing]);

  const vendors = load.data?.vendors ?? [];
  const items = load.data?.items ?? [];
  const locations = load.data?.locations ?? [];

  const selectedVendor = vendors.find((v) => String(v.id) === vendorId) ?? null;
  const selectedLocation = locations.find((l) => String(l.id) === locationId) ?? null;
  const selectedItem = items.find((it) => String(it.id) === itemId) ?? null;

  const lineRows = useMemo(() => {
    if (draftLines.length) return draftLines;
    if (!selectedItem || !itemId) return [];
    return [lineFromItem(selectedItem, Number(qty) || 1)];
  }, [draftLines, itemId, items, qty, selectedItem]);

  const itemsSubtotal = lineRows.reduce((sum, row) => sum + row.qty * row.unit, 0);
  const extraSubtotal = extraCosts.reduce(
    (sum, row) => sum + (Number.parseFloat(row.amount.replace(/[^0-9.-]/g, '')) || 0),
    0,
  );
  const existingSubtotal = useMemo(() => {
    const lines = (existing?.lines as Row[] | undefined) ?? [];
    return lines.reduce((sum, line) => {
      const q = Number(line.qty_ordered ?? line.qty ?? 0);
      const unit = Number(line.unit_cost_jmd ?? line.unit_price ?? 0);
      return sum + q * unit;
    }, 0);
  }, [existing]);
  const poTotalLabel = formatJmd(existingSubtotal || itemsSubtotal + extraSubtotal || null);
  const approvalThresholdLabel = formatJmd(20000);
  const poNumber = existing?.number != null ? String(existing.number) : 'New draft';
  const poStatus = existing?.status != null ? String(existing.status) : 'draft';

  const receiveProgressPct = useMemo(() => {
    const lines = (existing?.lines as Row[] | undefined) ?? [];
    if (!lines.length) return 0;
    let ordered = 0;
    let received = 0;
    for (const line of lines) {
      ordered += Number(line.qty_ordered ?? line.qty ?? 0);
      received += Number(line.qty_received ?? line.received_qty ?? 0);
    }
    if (ordered <= 0) return 0;
    return Math.min(100, Math.round((received / ordered) * 100));
  }, [existing]);

  const canSave = Boolean(vendorId.trim() && locationId.trim());
  const canSubmit = canSave && lineRows.length > 0;

  const persistDraft = async () => {
    if (!canSave) throw new Error('Choose vendor and ship-to location');
    const lines = lineRows.map((line) => ({
      item_id: line.itemId,
      qty_ordered: line.qty,
      unit_price: line.unit,
    }));
    const body = {
      vendor_id: vendorId,
      ship_to_location_id: locationId,
      expected_delivery_date: expectedDelivery.trim() || null,
      lines,
      extra_costs: extraCosts.map((row) => ({
        kind: row.kind,
        label: row.label.trim() || null,
        amount: Number.parseFloat(row.amount.replace(/[^0-9.-]/g, '')) || 0,
      })),
    };
    if (poId) {
      await inventoryApi.patchPurchaseOrder(poId, body);
      return poId;
    }
    const created = (await inventoryApi.createPurchaseOrder(body)) as { po?: { id?: string }; id?: string };
    const id = created.po?.id ?? created.id;
    return id != null ? String(id) : null;
  };

  const addCurrentLine = () => {
    if (!selectedItem || !itemId) return;
    const next = lineFromItem(selectedItem, Number(qty) || 1);
    setDraftLines((prev) => {
      const idx = prev.findIndex((l) => l.itemId === next.itemId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + next.qty };
        return copy;
      }
      return [...prev, next];
    });
  };

  const removeLine = (key: string) => {
    setDraftLines((prev) => prev.filter((l) => l.key !== key));
  };

  const addExtraCost = () => {
    setExtraCosts((prev) => [
      ...prev,
      { key: crypto.randomUUID(), kind: 'freight', label: 'Freight', amount: '0' },
    ]);
  };

  const removeExtraCost = (key: string) => {
    setExtraCosts((prev) => prev.filter((r) => r.key !== key));
  };

  const discardDraft = () => {
    setVendorId('');
    setLocationId('');
    setItemId('');
    setQty('1');
    setExpectedDelivery('');
    setDraftLines([]);
    setExtraCosts([]);
  };

  const saveDraft = () =>
    submit.run(async () => {
      await persistDraft();
      await shell.refresh();
      onClose?.();
    });

  const submitForApproval = () =>
    submit.run(async () => {
      const id = poId ?? (await persistDraft());
      if (!id) throw new Error('Could not save purchase order');
      if (!canSubmit) throw new Error('Add at least one line with quantity');
      await inventoryApi.poSubmit(id);
      await shell.refresh();
      onClose?.();
    });

  return {
    load,
    submit,
    vendorId,
    setVendorId,
    locationId,
    setLocationId,
    itemId,
    setItemId,
    qty,
    setQty,
    expectedDelivery,
    setExpectedDelivery,
    vendors,
    items,
    locations,
    selectedVendor,
    selectedLocation,
    lineRows,
    extraCosts,
    itemsSubtotal,
    itemsSubtotalLabel: formatJmd(itemsSubtotal),
    poNumber,
    poStatus,
    receiveProgressPct,
    canSave,
    canSubmit,
    saveDraft,
    submitForApproval,
    poTotalLabel,
    approvalThresholdLabel,
    addCurrentLine,
    removeLine,
    addExtraCost,
    removeExtraCost,
    discardDraft,
    closePanel: () => onClose?.(),
    formatJmd,
  };
}
