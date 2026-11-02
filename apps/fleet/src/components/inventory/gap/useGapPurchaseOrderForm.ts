import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../inventoryApi';
import { asPagedItems } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { useInventoryShell } from '../InventoryShellContext';
import { useGapLoad } from './useGapLoad';
import { useGapSubmit } from './useGapSubmit';

type Row = Record<string, unknown>;

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

  const existing = load.data?.existing ?? null;

  useEffect(() => {
    if (!existing) return;
    setVendorId(existing.vendor_id != null ? String(existing.vendor_id) : '');
    setLocationId(
      existing.ship_to_location_id != null ? String(existing.ship_to_location_id) : '',
    );
    const lines = (existing.lines as Row[] | undefined) ?? [];
    const first = lines[0];
    if (first) {
      setItemId(first.item_id != null ? String(first.item_id) : '');
      setQty(first.qty_ordered != null ? String(first.qty_ordered) : '1');
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
    if (!selectedItem || !itemId) return [];
    const q = Number(qty);
    const unit =
      selectedItem.unit_cost_jmd != null
        ? Number(selectedItem.unit_cost_jmd)
        : selectedItem.default_cost_jmd != null
          ? Number(selectedItem.default_cost_jmd)
          : 0;
    const safeQty = Number.isFinite(q) && q > 0 ? q : 0;
    return [
      {
        id: itemId,
        name: String(selectedItem.name ?? '—'),
        sku: String(selectedItem.sku ?? '—'),
        qty: safeQty,
        unit,
        lineTotal: safeQty * unit,
      },
    ];
  }, [itemId, items, qty, selectedItem]);

  const itemsSubtotal = lineRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const existingSubtotal = useMemo(() => {
    const lines = (existing?.lines as Row[] | undefined) ?? [];
    return lines.reduce((sum, line) => {
      const qty = Number(line.qty_ordered ?? line.qty ?? 0);
      const unit = Number(line.unit_cost_jmd ?? line.unit_price ?? 0);
      return sum + qty * unit;
    }, 0);
  }, [existing]);
  const poTotalLabel = formatJmd(existingSubtotal || itemsSubtotal || null);
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
  const canSubmit = canSave && Boolean(itemId.trim()) && Number(qty) > 0;

  const persistDraft = async () => {
    if (!canSave) throw new Error('Choose vendor and ship-to location');
    const lines = itemId
      ? [{ item_id: itemId, qty_ordered: Number(qty) || 1 }]
      : [];
    const body = {
      vendor_id: vendorId,
      ship_to_location_id: locationId,
      expected_delivery_date: expectedDelivery.trim() || null,
      lines,
    };
    if (poId) {
      await inventoryApi.patchPurchaseOrder(poId, body);
      return poId;
    }
    const created = (await inventoryApi.createPurchaseOrder(body)) as { id?: string };
    return created.id != null ? String(created.id) : null;
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
    formatJmd,
  };
}
