import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../../inventoryApi';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import { formatJmd } from '../../inventoryFormat';
import { numField, strField } from '../../inventoryData';
import type { AssetRow } from '../../inventoryTypes';
import type { OverflowMenuItem } from '../../InventoryOverflowMenu';
import { buildAssetRow } from '../../inventoryViewRows';
import { useInScreenBase } from './useInShared';

/**
 * Stitch → data (In8 Assets)
 * serial cell → AssetRow.serial | item name → AssetRow.name | status pill → AssetRow.statusLabel | plate → AssetRow.plate
 */
export function useIn8AssetsForm() {
  const base = useInScreenBase();
  const { shell, submit } = base;
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const assets = shell.assets;
  const selectedAssetId = shell.selectedAssetId;
  const setSelectedAssetId = shell.setSelectedAssetId;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: assets.length,
      installed: 0,
      in_store: 0,
      in_repair: 0,
      faulty: 0,
      warranty_ending: 0,
    };
    for (const a of assets) {
      const st = strField(a, 'status', '').toLowerCase();
      if (st === 'installed') counts.installed += 1;
      else if (st === 'in_store' || st === 'in store') counts.in_store += 1;
      else if (st === 'in_repair' || st === 'in repair') counts.in_repair += 1;
      else if (st === 'faulty') counts.faulty += 1;
      if (strField(a, 'warranty_ending_soon', '') === 'true') counts.warranty_ending += 1;
    }
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    let list = assets;
    if (statusFilter !== 'all') {
      list = list.filter((a) => {
        const st = strField(a, 'status', '').toLowerCase().replace(/\s+/g, '_');
        if (statusFilter === 'warranty_ending') {
          return strField(a, 'warranty_ending_soon', '') === 'true';
        }
        return st === statusFilter;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const serial = strField(a, 'serial_number', strField(a, 'serial_no', '')).toLowerCase();
        const name = strField(a, 'name', '').toLowerCase();
        const plate = strField(a, 'license_plate', '').toLowerCase();
        return serial.includes(q) || name.includes(q) || plate.includes(q);
      });
    }
    return list;
  }, [assets, statusFilter, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const pagedAssetRows: AssetRow[] = useMemo(
    () => paged.map((a) => buildAssetRow(a, formatJmd)),
    [paged],
  );

  useEffect(() => {
    if (selectedAssetId && filtered.some((a) => strField(a, 'id', '') === selectedAssetId)) return;
    setSelectedAssetId(null);
  }, [filtered, selectedAssetId, setSelectedAssetId]);

  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return assets.find((a) => strField(a, 'id', '') === selectedAssetId) ?? null;
  }, [assets, selectedAssetId]);

  const selectedAssetRow = useMemo(
    () => (selectedAsset ? buildAssetRow(selectedAsset, formatJmd) : null),
    [selectedAsset],
  );

  const selectAsset = (assetId: string) => setSelectedAssetId(assetId);

  const openAsset = (assetId: string) => {
    shell.setSelectedAssetId(assetId);
    shell.openModal('asset-page');
  };

  const registerAsset = () => shell.openGap('register-asset', { assetId: null });

  const exportAssets = () => void downloadInventoryExportCsv();

  const openAssetModal = (assetId: string, modal: 'asset-move' | 'asset-condition' | 'asset-repair') => {
    shell.setSelectedAssetId(assetId);
    shell.openModal(modal);
  };

  const retireAsset = (assetId: string) =>
    submit.run(async () => {
      await inventoryApi.assetRetire(assetId, {});
      await shell.refresh();
    });

  const totalBookValue = useMemo(() => {
    let sum = 0;
    for (const a of assets) {
      sum += numField(a, 'book_value_jmd', numField(a, 'book_value', 0));
    }
    return sum;
  }, [assets]);

  const rowMenuItems = (assetId: string): OverflowMenuItem[] => [
    { label: 'Open', onClick: () => openAsset(assetId) },
    { label: 'Move', onClick: () => openAssetModal(assetId, 'asset-move') },
    { label: 'Send to repair', onClick: () => openAssetModal(assetId, 'asset-repair') },
    { label: 'Mark faulty', onClick: () => openAssetModal(assetId, 'asset-condition') },
    { label: 'Retire', onClick: () => void retireAsset(assetId) },
  ];

  const openSelectedAssetPageDisabledReason = selectedAssetId ? '' : 'Select an asset row to open details';

  return {
    ...base,
    shell,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    page: safePage,
    setPage,
    pageCount,
    paged,
    pagedAssetRows,
    selectedAssetId,
    setSelectedAssetId,
    selectAsset,
    selectedAsset,
    selectedAssetRow,
    statusCounts,
    openAsset,
    registerAsset,
    exportAssets,
    openAssetModal,
    retireAsset,
    totalBookValue,
    rowMenuItems,
    filteredCount: filtered.length,
    openSelectedAssetPageDisabledReason,
    strField,
  };
}
