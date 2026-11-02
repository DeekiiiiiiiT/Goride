import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { numField, strField } from '../../inventoryData';
import { formatJmd } from '../../inventoryFormat';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { useInScreenBase } from './useInShared';

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
