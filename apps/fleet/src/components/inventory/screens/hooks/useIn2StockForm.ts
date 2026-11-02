import { useMemo, useState } from 'react';
import { strField } from '../../inventoryData';
import { useInScreenBase } from './useInShared';

export function useIn2StockForm() {
  const base = useInScreenBase();
  const { shell, live } = base;
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const filteredRows = useMemo(() => {
    let rows = shell.stockRows;
    if (locationFilter !== 'all') {
      rows = rows.filter((r) => strField(r, 'location_id', '') === locationFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const name = strField(r, 'name', '').toLowerCase();
        const sku = strField(r, 'sku', '').toLowerCase();
        return name.includes(q) || sku.includes(q);
      });
    }
    if (categoryFilter) {
      rows = rows.filter((r) => strField(r, 'category', '') === categoryFilter);
    }
    if (statusFilter) {
      rows = rows.filter((r) => strField(r, 'stock_status', '') === statusFilter);
    }
    if (typeFilter) {
      rows = rows.filter((r) => strField(r, 'tracking_type', '') === typeFilter);
    }
    return rows;
  }, [shell.stockRows, locationFilter, searchQuery, categoryFilter, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const resetFilters = () => {
    setLocationFilter('all');
    setSearchQuery('');
    setCategoryFilter('');
    setStatusFilter('');
    setTypeFilter('');
    setPage(0);
  };

  const openSuppliers = () => shell.openGap('vendor-editor', { vendorId: null });
  const openItem = (itemId: string) => {
    shell.setSelectedItemId(itemId);
    shell.openModal('item-drawer');
  };

  const refreshStock = () => void shell.refreshTab();

  const pageStart = filteredRows.length ? safePage * pageSize + 1 : 0;
  const pageEnd = Math.min(filteredRows.length, (safePage + 1) * pageSize);

  const locationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of shell.stockRows) {
      const id = strField(r, 'location_id', '');
      if (!id) continue;
      const label = strField(r, 'location_name', id);
      map.set(id, label);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [shell.stockRows]);

  const setLocationFilterFromMenu = (id: string) => setLocationFilter(id);

  return {
    ...base,
    shell,
    live,
    locationFilter,
    setLocationFilter,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    typeFilter,
    setTypeFilter,
    page: safePage,
    setPage,
    pageCount,
    pagedRows,
    filteredCount: filteredRows.length,
    pageStart,
    pageEnd,
    resetFilters,
    openSuppliers,
    openItem,
    refreshStock,
    locationOptions,
    setLocationFilterFromMenu,
    strField,
  };
}
