import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthContext';
import type { SurgeCellAdminRow } from '@roam/types';
import {
  listSurgeCells,
  resetAllSurgeCells,
  resetSurgeCell,
  updateSurgeCell,
} from '../../../services/ridesAdminService';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';

const PAGE_SIZE = 50;

export function SurgeCellsManager() {
  const { session, role } = useAuth();
  const token = session?.access_token;
  const canResetAll =
    role === 'platform_owner' || role === 'superadmin' || role === 'admin';

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
    if (!token) return;
    setLoading(true);
    try {
      const res = await listSurgeCells(token, {
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
  }, [token, search, page]);

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
    if (!token || !editCell) return;
    if (multiplier > 1.5 && !window.confirm(`Set surge to ${multiplier}x? This affects rider quotes in this cell.`)) {
      return;
    }
    setSaving(true);
    try {
      await updateSurgeCell(token, editCell.cell_key, multiplier);
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
    if (!token) return;
    setResettingKey(cellKey);
    try {
      await resetSurgeCell(token, cellKey, resetMultiplier);
      toast.success(resetMultiplier ? 'Cell reset (demand + multiplier)' : 'Demand counters cleared');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setResettingKey(null);
    }
  };

  const handleResetAll = async () => {
    if (!token || !canResetAll) return;
    if (
      !window.confirm(
        'Reset all surge cells? Open requests go to 0 and multipliers return to 1.0.',
      )
    ) {
      return;
    }
    try {
      const res = await resetAllSurgeCells(token, true);
      toast.success(`Reset ${res.rows_updated} cells`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Bulk reset failed');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Surge pricing</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Grid cells drive dynamic pricing when demand exceeds supply. Multipliers are clamped
            between 1.0 and 3.0 on the server.
          </p>
        </div>
        {canResetAll && (
          <Button
            variant="outline"
            onClick={() => void handleResetAll()}
            className="border-slate-600 text-slate-300"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset all to 1.0
          </Button>
        )}
      </div>

      <div className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search cell key…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            className="pl-9 bg-slate-800 border-slate-600"
          />
        </div>
        <Button onClick={applySearch} variant="secondary" className="bg-slate-800">
          Search
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">Cell key</TableHead>
                <TableHead className="text-slate-400">Multiplier</TableHead>
                <TableHead className="text-slate-400">Open requests</TableHead>
                <TableHead className="text-slate-400">Available drivers</TableHead>
                <TableHead className="text-slate-400">Updated</TableHead>
                <TableHead className="text-slate-400 w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cells.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                    No surge cells match your search.
                  </TableCell>
                </TableRow>
              ) : (
                cells.map((c) => (
                  <TableRow key={c.cell_key} className="border-slate-800">
                    <TableCell className="font-mono text-xs max-w-[200px] truncate" title={c.cell_key}>
                      {c.cell_key}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.surge_multiplier.toFixed(2)}×</TableCell>
                    <TableCell>{c.open_requests}</TableCell>
                    <TableCell>{c.available_drivers}</TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {page} of {totalPages} ({total} cells)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border-slate-600"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="border-slate-600"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!editCell} onOpenChange={(open) => !open && setEditCell(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit surge multiplier</DialogTitle>
          </DialogHeader>
          {editCell && (
            <div className="space-y-4 py-2">
              <p className="text-xs font-mono text-slate-400 break-all">{editCell.cell_key}</p>
              <div className="space-y-2">
                <Label>Multiplier (1.0 – 3.0)</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  step={0.05}
                  value={multiplier}
                  onChange={(e) => setMultiplier(Number(e.target.value))}
                  className="bg-slate-800 border-slate-600"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-400"
                onClick={() => void resetDemand(editCell.cell_key, true)}
              >
                Reset demand and multiplier to 1.0
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCell(null)} className="border-slate-600">
              Cancel
            </Button>
            <Button
              onClick={() => void saveMultiplier()}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
