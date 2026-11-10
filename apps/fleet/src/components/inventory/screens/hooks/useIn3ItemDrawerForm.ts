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

  const itemName = item ? strField(item, 'name', '') : '';
  /** Movements already loaded that touch this item (by name from the ledger lines). */
  const itemMovements = useMemo(() => {
    if (!itemName) return [];
    return shell.movements
      .filter((m) => Array.isArray(m.item_names) && (m.item_names as string[]).includes(itemName))
      .slice(0, 5);
  }, [shell.movements, itemName]);

  /** Stock rows for this item at every place. */
  const placeRows = useMemo(
    () => shell.stockRows.filter((r) => strField(r, 'item_id', '') === itemId && numField(r, 'on_hand', 0) !== 0),
    [shell.stockRows, itemId],
  );
  const totals = useMemo(() => {
    let inStore = 0;
    let onCars = 0;
    let value = 0;
    for (const r of placeRows) {
      const q = numField(r, 'on_hand', 0);
      if (strField(r, 'location_code', '').toLowerCase().startsWith('veh')) onCars += q;
      else inStore += q;
      value += numField(r, 'stock_value', 0);
    }
    return { inStore, onCars, onHand: inStore + onCars, value };
  }, [placeRows]);
  const need = live.storeNeeds.find((n) => n.itemId === itemId) ?? null;
  const kitCells = useMemo(
    () => live.kitVehicles.flatMap((v) => v.cells.filter((c) => c.itemId === itemId)),
    [live.kitVehicles, itemId],
  );

  const openReceive = () => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openModal('receive');
  };
  const openIssue = () => {
    const missing = kitCells.filter((c) => c.required && c.status !== 'ok');
    if (missing.length === 1) shell.openIssue({ vehicleId: missing[0].vehicleId, kitLineIds: [missing[0].kitLineId] });
    else shell.openIssue();
  };
  const openTransfer = () => {
    if (itemId) shell.setSelectedItemId(itemId);
    shell.openModal('custody');
  };
  const openMovementsTab = () => {
    close();
    shell.setTab('movements');
  };

  const goToInventoryTab = (tab: 'stock' | 'movements' | 'kits') => {
    close();
    if (tab === 'kits') shell.setTab('vehicle-kits');
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
        id: strField(m, 'id', ''),
        when: strField(m, 'created_at', ''),
        typeLabel: strField(m, 'type', 'MOVE').toUpperCase(),
        route: `${strField(m, 'from_label', '—')} → ${strField(m, 'to_label', '—')}`,
        qtyLabel: String(numField(m, 'qty', 0) || '—'),
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
    placeRows,
    totals,
    need,
    kitCells,
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
