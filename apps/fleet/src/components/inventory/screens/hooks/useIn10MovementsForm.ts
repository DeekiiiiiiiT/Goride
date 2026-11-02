import { useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { strField } from '../../inventoryData';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { newInventoryIdempotencyKey } from '../../inventoryIdempotency';
import { useInScreenBase } from './useInShared';

export function useIn10MovementsForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
  const [typeFilter, setTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const pageSize = 25;

  const rows = shell.movements;
  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter) list = list.filter((r) => strField(r, 'type', '') === typeFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [
          strField(r, 'reference', ''),
          strField(r, 'item_name', ''),
          strField(r, 'sku', ''),
          strField(r, 'license_plate', ''),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [rows, typeFilter, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const clearFilters = () => {
    setTypeFilter('');
    setSearchQuery('');
    setPage(0);
  };

  const exportCsv = () => void downloadInventoryExportCsv();

  const recordMovement = () => shell.openModal('receive');

  const confirmReversal = () =>
    submit.run(async () => {
      if (!selectedMovementId) throw new Error('Select a movement to reverse');
      if (!reverseReason.trim()) throw new Error('Reason is required');
      await inventoryApi.reverseMovement(
        { movement_id: selectedMovementId, reason: reverseReason.trim() },
        newInventoryIdempotencyKey('reverse'),
      );
      setSelectedMovementId(null);
      setReverseReason('');
      await shell.refresh();
      await shell.refreshTab();
    });

  return {
    ...base,
    shell,
    submit,
    typeFilter,
    setTypeFilter,
    searchQuery,
    setSearchQuery,
    page: safePage,
    setPage,
    pageCount,
    paged,
    total: filtered.length,
    clearFilters,
    exportCsv,
    recordMovement,
    selectedMovementId,
    setSelectedMovementId,
    reverseReason,
    setReverseReason,
    confirmReversal,
    strField,
  };
}
