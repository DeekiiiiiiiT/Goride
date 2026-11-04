import { useMemo, useState, useEffect } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { buildPoLineRows, buildPoSummaryRow, poCanReceive, poStatusNorm } from '../../inventoryViewRows';
import { useInScreenBase } from './useInShared';

export type PurchasingTab = 'orders' | 'suggested' | 'vendors';

/**
 * Stitch → data (In11 Purchasing)
 * PO card ref → PoSummaryRow.ref | line name → PoLineRow.name | sku → PoLineRow.sku
 */
export function useIn11PurchasingForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [tab, setTab] = useState<PurchasingTab>('orders');
  const [showArchived, setShowArchived] = useState(false);

  const allOrders = shell.purchaseOrders;
  const vendors = shell.vendors;

  const orders = useMemo(() => {
    if (showArchived) return allOrders;
    return allOrders.filter((po) => {
      const st = strField(po, 'status', '').toLowerCase();
      return st !== 'closed' && st !== 'cancelled' && st !== 'canceled';
    });
  }, [allOrders, showArchived]);

  const archivedCount = useMemo(
    () =>
      allOrders.filter((po) => {
        const st = strField(po, 'status', '').toLowerCase();
        return st === 'closed' || st === 'cancelled' || st === 'canceled';
      }).length,
    [allOrders],
  );

  const suggestedCount = shell.reorderSuggestions?.length ?? 0;

  const openPo = (poId: string | null) => shell.openGap('purchase-order', { poId });
  const openVendor = (vendorId: string | null) => shell.openGap('vendor-editor', { vendorId });

  const poAction = (poId: string, action: 'authorize' | 'order' | 'cancel' | 'submit') =>
    submit.run(async () => {
      if (action === 'authorize') await inventoryApi.poAuthorize(poId);
      else if (action === 'order') await inventoryApi.poOrder(poId);
      else if (action === 'submit') await inventoryApi.poSubmit(poId);
      else await inventoryApi.poCancel(poId);
      await shell.refresh();
      await shell.refreshTab();
    });

  const exportPurchasing = () => void downloadInventoryExportCsv();

  const vendorCount = vendors.length;

  const recomputeThresholds = () =>
    submit.run(async () => {
      await inventoryApi.reorderRecompute();
      await shell.refresh();
      await shell.refreshTab();
    });

  const removePoLine = (poId: string, lineId: string) =>
    submit.run(async () => {
      const po = allOrders.find((p) => strField(p, 'id', '') === poId);
      const lines = Array.isArray(po?.lines) ? [...(po!.lines as Record<string, unknown>[])] : [];
      const next = lines.filter((l) => strField(l, 'id', strField(l, 'line_id', '')) !== lineId);
      await inventoryApi.patchPurchaseOrder(poId, { lines: next });
      await shell.refresh();
      await shell.refreshTab();
    });

  const totals = useMemo(() => {
    let sum = 0;
    for (const po of orders) {
      sum += Number(strField(po, 'total_jmd', strField(po, 'total', '0')));
    }
    return formatJmd(sum || null);
  }, [orders]);

  const selectedPoId = shell.selectedPoId;
  const setSelectedPoId = shell.setSelectedPoId;

  useEffect(() => {
    if (selectedPoId && orders.some((p) => strField(p, 'id', '') === selectedPoId)) return;
    const first = orders[0];
    setSelectedPoId(first ? strField(first, 'id', '') || null : null);
  }, [orders, selectedPoId, setSelectedPoId]);

  const selectedPo = useMemo(() => {
    if (!selectedPoId) return null;
    return orders.find((p) => strField(p, 'id', '') === selectedPoId) ?? null;
  }, [orders, selectedPoId]);

  const selectedPoSummary = useMemo(
    () => (selectedPo ? buildPoSummaryRow(selectedPo, live.hubShort, formatJmd) : null),
    [selectedPo, live.hubShort],
  );

  const poLineRows = useMemo(
    () => buildPoLineRows(selectedPo, formatJmd),
    [selectedPo],
  );

  const poSummaries = useMemo(
    () => orders.map((po) => buildPoSummaryRow(po, live.hubShort, formatJmd)),
    [orders, live.hubShort],
  );

  const openReceive = (poId: string) => {
    shell.setSelectedPoId(poId);
    shell.openModal('receive');
  };

  const canReceive = selectedPo ? poCanReceive(poStatusNorm(selectedPo)) : false;
  const receiveDisabledReason = selectedPoSummary?.receiveDisabledReason ?? 'Select a purchase order';

  const poDetailMeta = useMemo(() => {
    if (!selectedPo) return null;
    const vendorId = strField(selectedPo, 'vendor_id', '');
    const vendor = vendors.find((v) => strField(v, 'id', '') === vendorId);
    return {
      initiatedByLabel: strField(
        selectedPo,
        'created_by_name',
        strField(selectedPo, 'initiated_by', '—'),
      ),
      createdLabel: strField(selectedPo, 'created_at', strField(selectedPo, 'ordered_at', '—')),
      vendorContactLabel: strField(vendor ?? {}, 'contact_name', strField(vendor ?? {}, 'name', '—')),
    };
  }, [selectedPo, vendors]);

  const signoffLabel = poDetailMeta?.initiatedByLabel ?? poDetailMeta?.vendorContactLabel ?? '—';
  const suggestedSku = poLineRows[0]?.sku ?? '—';

  return {
    ...base,
    shell,
    submit,
    tab,
    setTab,
    orders,
    allOrders,
    vendors,
    suggestedCount,
    archivedCount,
    showArchived,
    setShowArchived,
    openPo,
    openVendor,
    poAction,
    exportPurchasing,
    vendorCount,
    recomputeThresholds,
    removePoLine,
    totals,
    selectedPoId,
    setSelectedPoId,
    selectedPo,
    selectedPoSummary,
    poLineRows,
    poSummaries,
    openReceive,
    canReceive,
    receiveDisabledReason,
    poDetailMeta,
    signoffLabel,
    suggestedSku,
    formatJmd,
    strField,
  };
}
