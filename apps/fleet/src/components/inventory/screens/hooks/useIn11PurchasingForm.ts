import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { useInScreenBase } from './useInShared';

export type PurchasingTab = 'orders' | 'suggested' | 'vendors';

export function useIn11PurchasingForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
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
    formatJmd,
    strField,
  };
}
