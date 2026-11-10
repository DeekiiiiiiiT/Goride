import { useMemo, useState } from 'react';
import { strField } from '../../inventoryData';
import { useInScreenBase } from './useInShared';

export function useIn2StockForm() {
  const base = useInScreenBase();
  const { shell, live } = base;
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  /**
   * IV-02: store rows carry the need status (out / low against what the cars need),
   * and kit items with no balance row show as 0 in the store.
   */
  const stockRows = useMemo(() => {
    const isCar = (r: Record<string, unknown>) =>
      strField(r, 'location_code', '').toLowerCase().startsWith('veh');
    const storeRow = shell.stockRows.find((r) => !isCar(r));
    const needByItem = new Map(live.storeNeeds.map((n) => [n.itemId, n]));
    const rows = shell.stockRows.map((r) => {
      if (isCar(r)) return r;
      const need = needByItem.get(strField(r, 'item_id', ''));
      return need && need.status !== 'ok' ? { ...r, stock_status: need.status, needed: need.needed } : r;
    });
    const inStore = new Set(rows.filter((r) => !isCar(r)).map((r) => strField(r, 'item_id', '')));
    for (const n of live.storeNeeds) {
      if (inStore.has(n.itemId)) continue;
      rows.push({
        item_id: n.itemId,
        sku: n.sku,
        name: n.name,
        location_id: storeRow ? storeRow.location_id : 'store',
        location_code: storeRow ? storeRow.location_code : '',
        location_name: storeRow ? storeRow.location_name : live.hubName,
        on_hand: 0,
        reserved: 0,
        stock_value: 0,
        stock_status: n.status === 'ok' ? 'out' : n.status,
        needed: n.needed,
      });
    }
    return rows;
  }, [shell.stockRows, live.storeNeeds, live.hubName]);

  const filteredRows = useMemo(() => {
    let rows = stockRows;
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
    if (statusFilter) {
      rows = rows.filter((r) => strField(r, 'stock_status', '') === statusFilter);
    }
    if (typeFilter) {
      rows = rows.filter((r) => strField(r, 'tracking', '') === typeFilter);
    }
    return rows;
  }, [stockRows, locationFilter, searchQuery, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const resetFilters = () => {
    setLocationFilter('all');
    setSearchQuery('');
    setStatusFilter('');
    setTypeFilter('');
    setPage(0);
  };

  const openInventorySettings = () => shell.openModal('inventory-settings');
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
    openInventorySettings,
    openItem,
    refreshStock,
    locationOptions,
    setLocationFilterFromMenu,
    strField,
  };
}
