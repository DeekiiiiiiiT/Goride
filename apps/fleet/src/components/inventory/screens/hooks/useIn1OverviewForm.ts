import { useMemo } from 'react';
import { downloadInventoryExportCsv } from '../../inventoryDownload';
import type { OverflowMenuItem } from '../../InventoryOverflowMenu';
import { useInScreenBase } from './useInShared';

export function useIn1OverviewForm() {
  const base = useInScreenBase();
  const { shell, live } = base;

  const headerMoreMenuItems: OverflowMenuItem[] = useMemo(
    () => [
      { label: 'Export', onClick: () => void downloadInventoryExportCsv() },
      { label: 'Settings', onClick: () => shell.openModal('inventory-settings') },
      { label: 'Locations', onClick: () => shell.openModal('locations-bins') },
    ],
    [shell],
  );

  return {
    ...base,
    shell,
    live,
    headerMoreMenuItems,
    exportOverview: () => void downloadInventoryExportCsv(),
  };
}
