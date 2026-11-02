import { useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useInScreenBase } from './useInShared';

export type PhoneSort = 'bin' | 'name' | 'qty';
export type PhoneView = 'stock' | 'scanner';

export function useIn18PhoneForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [sort, setSort] = useState<PhoneSort>('bin');
  const [view, setView] = useState<PhoneView>('stock');
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const rows = [...shell.stockRows].sort((a, b) => {
    if (sort === 'qty') {
      return numField(b, 'on_hand', 0) - numField(a, 'on_hand', 0);
    }
    if (sort === 'bin') {
      return strField(a, 'bin_code', strField(a, 'bin', '')).localeCompare(
        strField(b, 'bin_code', strField(b, 'bin', '')),
      );
    }
    return strField(a, 'name', '').localeCompare(strField(b, 'name', ''));
  });

  const scanBarcode = () => {
    setView('scanner');
    void shell.openGap('scanner-pair', { itemId: null });
  };

  const backToStock = () => setView('stock');

  const toggleTorch = () => setTorchOn((v) => !v);

  const enterCode = () => {
    const row = rows.find(
      (r) =>
        strField(r, 'sku', '').toLowerCase() === manualCode.trim().toLowerCase() ||
        strField(r, 'short_code', '').toLowerCase() === manualCode.trim().toLowerCase(),
    );
    if (row) {
      shell.setSelectedItemId(strField(row, 'item_id', ''));
      shell.openModal('item-drawer');
      setView('stock');
    }
  };

  const issueToCar = () => shell.openModal('issue');
  const issueWholeKit = () => shell.openModal('issue');
  const receive = () => shell.openModal('receive');
  const fulfill = (_requisitionId?: string) => shell.openGap('requisition', { itemId: null });
  const moveStock = () => shell.openModal('custody');
  const openLifecycle = () => shell.openModal('asset-page');

  const rowOverflowItems = (itemId: string) => [
    { label: 'Issue to car', onClick: () => { shell.setSelectedItemId(itemId); shell.openModal('issue'); } },
    { label: 'Move stock', onClick: () => { shell.setSelectedItemId(itemId); shell.openModal('custody'); } },
    { label: 'Lifecycle', onClick: () => { shell.setSelectedAssetId(itemId); shell.openModal('asset-page'); } },
  ];

  const quickReceive = (itemId: string) =>
    submit.run(async () => {
      const row = rows.find((r) => strField(r, 'item_id', '') === itemId);
      await inventoryApi.receive(
        {
          receipt: { location_id: strField(row ?? {}, 'location_id', '') },
          lines: [{ item_id: itemId, qty: 1, unit_price: 0 }],
          costs: [],
        },
        newInventoryIdempotencyKey('phone-receive'),
      );
      await shell.refresh();
    });

  return {
    ...base,
    shell,
    submit,
    live,
    rows,
    sort,
    setSort,
    view,
    torchOn,
    toggleTorch,
    backToStock,
    manualCode,
    setManualCode,
    scanBarcode,
    enterCode,
    issueToCar,
    issueWholeKit,
    receive,
    fulfill,
    moveStock,
    openLifecycle,
    rowOverflowItems,
    quickReceive,
    strField,
  };
}

function numField(row: Record<string, unknown>, key: string, fallback: number): number {
  const n = Number(strField(row, key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}
