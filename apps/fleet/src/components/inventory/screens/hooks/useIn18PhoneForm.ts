import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { buildPhoneComplianceRow } from '../../inventoryViewRows';
import type { PhoneComplianceRow } from '../../inventoryTypes';
import { useInScreenBase } from './useInShared';

export type PhoneSort = 'bin' | 'name' | 'qty';
export type PhoneView = 'stock' | 'scanner';

/**
 * Stitch → data (In18 Phone)
 * row sku → PhoneComplianceRow.sku | name → PhoneComplianceRow.label | bin → PhoneComplianceRow.detail
 */
export function useIn18PhoneForm() {
  const base = useInScreenBase();
  const { shell, submit, live } = base;
  const [sort, setSort] = useState<PhoneSort>('bin');
  const [view, setView] = useState<PhoneView>('stock');
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const rows = useMemo(() => {
    const list = [...shell.stockRows];
    list.sort((a, b) => {
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
    return list;
  }, [shell.stockRows, sort]);

  const phoneRows: PhoneComplianceRow[] = useMemo(
    () =>
      rows.map((r, index) =>
        buildPhoneComplianceRow(
          {
            id: strField(r, 'item_id', `phone-${index}`),
            label: strField(r, 'name', 'Item'),
            sku: strField(r, 'sku', '—'),
            status: `${numField(r, 'on_hand', 0)} on hand`,
            detail: strField(r, 'location_name', strField(r, 'bin_code', strField(r, 'bin', ''))),
          },
          index,
        ),
      ),
    [rows],
  );

  const scanBarcode = () => {
    /* Rev 52: scanner pairing removed — manual SKU entry only */
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

  const enterCodeDisabledReason = manualCode.trim() ? '' : 'Enter a SKU or short code';

  const scanMatchRow = useMemo(() => {
    const q = manualCode.trim().toLowerCase();
    if (q) {
      const row = rows.find(
        (r) =>
          strField(r, 'sku', '').toLowerCase() === q ||
          strField(r, 'short_code', '').toLowerCase() === q,
      );
      if (row) {
        const idx = rows.indexOf(row);
        return buildPhoneComplianceRow(
          {
            id: strField(row, 'item_id', `phone-${idx}`),
            label: strField(row, 'name', 'Item'),
            sku: strField(row, 'sku', '—'),
            status: `${numField(row, 'on_hand', 0)} on hand`,
            detail: strField(row, 'location_name', strField(row, 'bin_code', strField(row, 'bin', ''))),
          },
          idx,
        );
      }
    }
    if (shell.selectedItemId) {
      const idx = rows.findIndex((r) => strField(r, 'item_id', '') === shell.selectedItemId);
      if (idx >= 0) return phoneRows[idx] ?? null;
    }
    return phoneRows[0] ?? null;
  }, [manualCode, rows, phoneRows, shell.selectedItemId]);

  const scanMatchTitle = scanMatchRow
    ? `${scanMatchRow.label}${scanMatchRow.sku && scanMatchRow.sku !== '—' ? ` ${scanMatchRow.sku}` : ''}`
    : '—';

  const issueToCar = () => shell.openModal('issue');
  const issueWholeKit = () => shell.openModal('issue');
  const receive = () => shell.openModal('receive');
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
    phoneRows,
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
    enterCodeDisabledReason,
    scanMatchRow,
    scanMatchTitle,
    issueToCar,
    issueWholeKit,
    receive,
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
