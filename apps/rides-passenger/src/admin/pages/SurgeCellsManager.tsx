import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SurgeCellAdminRow } from '../services/ridesAdminService';
import {
  listSurgeCells,
  resetAllSurgeCells,
  resetSurgeCell,
  updateSurgeCell,
} from '../services/ridesAdminService';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';

const PAGE_SIZE = 50;

interface SurgeCellsManagerProps {
  accessToken: string | undefined;
  role: string | undefined;
}

export function SurgeCellsManager({ accessToken, role }: SurgeCellsManagerProps) {
  const { confirm } = useAdminConfirm();
  const canResetAll = role === 'platform_owner' || role === 'superadmin' || role === 'rides_admin';

  const [cells, setCells] = useState<SurgeCellAdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [editCell, setEditCell] = useState<SurgeCellAdminRow | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [saving, setSaving] = useState(false);
  const [resettingKey, setResettingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await listSurgeCells(accessToken, {
        search: search || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setCells(res.cells);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load surge cells');
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const openEdit = (cell: SurgeCellAdminRow) => {
    setEditCell(cell);
    setMultiplier(cell.surge_multiplier);
  };

  const saveMultiplier = async () => {
    if (!accessToken || !editCell) return;
    if (multiplier > 1.5) {
      const ok = await confirm({
        title: 'High surge multiplier',
        description: `Set surge to ${multiplier}x? This affects rider quotes in this cell.`,
        confirmLabel: 'Apply surge',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateSurgeCell(accessToken, editCell.cell_key, multiplier);
      toast.success('Surge multiplier updated');
      setEditCell(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const resetDemand = async (cellKey: string, resetMultiplier = false) => {
    if (!accessToken) return;
    setResettingKey(cellKey);
    try {
      await resetSurgeCell(accessToken, cellKey, resetMultiplier);
      toast.success(
        resetMultiplier ? 'Cell reset (demand + multiplier)' : 'Demand counters cleared'
      );
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResettingKey(null);
    }
  };

  const handleResetAll = async () => {
    if (!accessToken || !canResetAll) return;
    const ok = await confirm({
      title: 'Reset all surge cells?',
      description: 'Reset all surge cells? Open requests go to 0 and multipliers return to 1.0.',
      confirmLabel: 'Reset all',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await resetAllSurgeCells(accessToken, true);
      toast.success(`Reset ${res.rows_updated} cells`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Bulk reset failed');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Surge Pricing</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Grid cells drive dynamic pricing. Multipliers are clamped between 1.0 and 3.0.
          </p>
        </div>
        {canResetAll && (
          <button
            onClick={() => void handleResetAll()}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="w-4 h-4" />
            Reset all to 1.0
          </button>
        )}
      </div>

      <div className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search cell key…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
        <button
          onClick={applySearch}
          className="px-4 py-2 text-sm font-medium bg-slate-800 rounded-lg text-slate-300 hover:bg-slate-700"
        >
          Search
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-800/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  Cell key
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                  Multiplier
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Open requests
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                  Drivers
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                  Updated
                </th>
                <th className="px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {cells.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-12">
                    No surge cells match your search.
                  </td>
                </tr>
              ) : (
                cells.map((c) => (
                  <tr key={c.cell_key} className="border-t border-slate-800 hover:bg-slate-800/30">
                    <td
                      className="px-4 py-3 font-mono text-xs max-w-[200px] truncate text-slate-300"
                      title={c.cell_key}
                    >
                      {c.cell_key}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white">
                      {c.surge_multiplier.toFixed(2)}×
                    </td>
                    <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">
                      {c.open_requests}
                    </td>
                    <td className="px-4 py-3 text-slate-300 hidden sm:table-cell">
                      {c.available_drivers}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                          aria-label="Edit multiplier"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={resettingKey === c.cell_key}
                          onClick={() => void resetDemand(c.cell_key, false)}
                          className="p-2 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                          title="Clear open requests"
                        >
                          {resettingKey === c.cell_key ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {totalPages} ({total} cells)
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm border border-slate-600 rounded-lg disabled:opacity-50 hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm border border-slate-600 rounded-lg disabled:opacity-50 hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditCell(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white">Edit surge multiplier</h3>
              <button
                onClick={() => setEditCell(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs font-mono text-slate-400 break-all">{editCell.cell_key}</p>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Multiplier (1.0 – 3.0)
                </label>
                <input
                  type="number"
                  min={1}
                  max={3}
                  step={0.05}
                  value={multiplier}
                  onChange={(e) => setMultiplier(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              <button
                onClick={() => void resetDemand(editCell.cell_key, true)}
                className="text-sm text-slate-400 hover:text-white"
              >
                Reset demand and multiplier to 1.0
              </button>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
              <button
                onClick={() => setEditCell(null)}
                className="px-4 py-2 text-sm font-medium border border-slate-600 rounded-lg text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveMultiplier()}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
