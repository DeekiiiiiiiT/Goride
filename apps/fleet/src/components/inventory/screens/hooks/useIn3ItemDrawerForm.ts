import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { numField, strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { buildItemDrawerRow } from '../../inventoryViewRows';
import { useInScreenBase } from './useInShared';

/**
 * Stitch → data (In3 Item drawer)
 * drawer title → ItemDrawerRow.name | sku chip → ItemDrawerRow.sku | on hand → valueLabels.onHand
 */
export function useIn3ItemDrawerForm() {
  const base = useInScreenBase();
  const { shell, live, submit, close } = base;
  const [tab, setTab] = useState<'overview' | 'movements' | 'rules'>('overview');
  const [drawerSearch, setDrawerSearch] = useState('');

  const item =
    live.selectedItem ??
    (shell.selectedItemId
      ? shell.stockRows.find((r) => strField(r, 'item_id', '') === shell.selectedItemId) ??
        shell.items.find((i) => strField(i, 'id', '') === shell.selectedItemId) ??
        null
      : null);

  const drawerRow = useMemo(() => buildItemDrawerRow(item, formatJmd), [item]);

  const itemId = item ? strField(item, 'item_id', strField(item, 'id', '')) : '';
  const onHand = item ? numField(item, 'on_hand', 0) : 0;
  const stockValue = item ? numField(item, 'stock_value', 0) : 0;
  const unitCost = onHand > 0 ? stockValue / onHand : stockValue;
  const valueLabels = {
    onHand: String(onHand),
    stockValue: formatJmd(stockValue),
    unitCost: formatJmd(unitCost),
  };

  const itemMovements = useMemo(() => {
    if (!itemId) return [];
    return shell.movements.filter((m) => strField(m, 'item_id', '') === itemId).slice(0, 20);
  }, [shell.movements, itemId]);

  const openReceive = () => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openModal('receive');
  };
  const openIssue = () => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openModal('issue');
  };
  const openTransfer = () => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openModal('custody');
  };
  const openMovementsTab = () => {
    close();
    shell.setTab('movements');
  };

  const goToInventoryTab = (
    tab: 'stock' | 'movements' | 'pos' | 'suppliers' | 'kits',
  ) => {
    close();
    if (tab === 'pos') shell.setTab('purchasing');
    else if (tab === 'suppliers') shell.openGap('vendor-editor', { vendorId: null });
    else if (tab === 'kits') shell.setTab('vehicle-kits');
    else shell.setTab(tab);
  };

  const openNewStockItem = () => shell.openGap('item-editor', { itemId: null });
  const openEditItem = () => shell.openGap('item-editor', { itemId: itemId || null });
  const openEditRule = () => shell.openGap('item-editor', { itemId });

  const saveRuleNote = () =>
    submit.run(async () => {
      if (!itemId) throw new Error('No item selected');
      await inventoryApi.patchItem(itemId, { memo: 'Updated from item drawer' });
      await shell.refresh();
    });

  const stockBrowseRows = useMemo(() => {
    const q = drawerSearch.trim().toLowerCase();
    let rows = shell.stockRows;
    if (q) {
      rows = rows.filter((r) => {
        const name = strField(r, 'name', '').toLowerCase();
        const sku = strField(r, 'sku', '').toLowerCase();
        return name.includes(q) || sku.includes(q);
      });
    }
    return rows
      .slice(0, 25)
      .map((r) => buildItemDrawerRow(r, formatJmd))
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [shell.stockRows, drawerSearch]);

  const movementRows = useMemo(
    () =>
      itemMovements.map((m) => ({
        id: strField(m, 'id', strField(m, 'reference', '')),
        label: strField(m, 'reference', strField(m, 'type', 'Movement')),
        actor: strField(m, 'actor_name', strField(m, 'created_by', '—')),
        when: strField(m, 'created_at', strField(m, 'occurred_at', '—')),
        typeLabel: strField(m, 'type', strField(m, 'movement_type', 'MOVE')).toUpperCase(),
        locationLabel: strField(m, 'location_name', strField(m, 'location', '—')),
        qtyLabel: strField(m, 'qty_delta', strField(m, 'qty', '')),
        note: strField(m, 'note', strField(m, 'memo', '')),
      })),
    [itemMovements],
  );

  const hasSelectedItem = Boolean(itemId);
  const issueDisabledReason = hasSelectedItem ? '' : 'Select an item from stock first';
  const receiveDisabledReason = hasSelectedItem ? '' : 'Select an item from stock first';

  return {
    ...base,
    shell,
    live,
    submit,
    close,
    tab,
    setTab,
    drawerSearch,
    setDrawerSearch,
    item,
    itemId,
    drawerRow,
    stockBrowseRows,
    movementRows,
    hasSelectedItem,
    issueDisabledReason,
    receiveDisabledReason,
    valueLabels,
    itemMovements,
    formatJmd,
    strField,
    openReceive,
    openIssue,
    openTransfer,
    openMovementsTab,
    goToInventoryTab,
    openNewStockItem,
    openEditItem,
    openEditRule,
    saveRuleNote,
    exportMovements: () => void downloadInventoryExportCsv(),
    stockTabCount: shell.stockRows.length,
    movementCount: itemMovements.length,
  };
}
