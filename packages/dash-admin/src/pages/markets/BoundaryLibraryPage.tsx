/**
 * Browse / search COD-AB admin_boundaries catalog.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Copy, FileUp, Library, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  listAdminBoundaries,
  type DashAdminBoundary,
} from '@roam/dash-admin-client';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ImportBoundariesWizard } from './ImportBoundariesWizard';

const LEVEL_TABS: { level: number | null; label: string }[] = [
  { level: null, label: 'All' },
  { level: 0, label: 'Country (0)' },
  { level: 1, label: 'Parish (1)' },
  { level: 2, label: 'Town (2)' },
  { level: 3, label: 'Community (3)' },
];

function ProvenanceBadge({ b }: { b: DashAdminBoundary }) {
  const parts = ['Official'];
  if (b.source) parts.push(b.source);
  if (b.valid_on) parts.push(b.valid_on);
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">
      {parts.join(' · ')}
    </span>
  );
}

type Props = {
  /** When set, show promote-as-parish-border hint for this parish. */
  parishId?: string;
};

export function BoundaryLibraryPage({ parishId }: Props = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const canWrite = canWriteDashAdmin(session.user);
  const [level, setLevel] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [rows, setRows] = useState<DashAdminBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminBoundaries(session.access_token, {
        admin_level: level ?? undefined,
        q: debouncedQ || undefined,
      });
      setRows(res.boundaries ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load boundaries');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token, level, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyPcode = async (pcode: string) => {
    try {
      await navigator.clipboard.writeText(pcode);
      toast.success(`Copied ${pcode}`);
    } catch {
      toast.message(pcode);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Library className="w-5 h-5 text-emerald-400" />
            Boundary Library
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Official admin0–admin3 catalog. Copy a pcode, then promote from Delivery Markets.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100"
          >
            <FileUp className="w-4 h-4" />
            Import boundaries
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_TABS.map((tab) => (
          <button
            key={String(tab.level)}
            type="button"
            onClick={() => setLevel(tab.level)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border ${
              level === tab.level
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or pcode…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading catalog…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8">No boundaries match. Import COD-AB files to populate.</p>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-950/80 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Pcode</th>
                  <th className="px-3 py-2.5 font-medium">Level</th>
                  <th className="px-3 py-2.5 font-medium">Parent</th>
                  <th className="px-3 py-2.5 font-medium">Provenance</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-white">{b.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{b.pcode}</td>
                    <td className="px-3 py-2 text-slate-400">{b.admin_level}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{b.parent_pcode ?? '—'}</td>
                    <td className="px-3 py-2">
                      <ProvenanceBadge b={b} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void copyPcode(b.pcode)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          <Copy className="w-3 h-3" />
                          Copy pcode
                        </button>
                        {b.admin_level === 1 && (
                          <span className="text-[10px] text-slate-500 max-w-[180px]">
                            {parishId
                              ? `Use pcode ${b.pcode} to promote this parish border`
                              : 'Open a parish → promote with this pcode'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-800">
            {rows.length} boundary(ies)
          </p>
        </div>
      )}

      <ImportBoundariesWizard
        open={showImport}
        accessToken={session.access_token}
        onClose={() => setShowImport(false)}
        onImported={() => void load()}
      />
    </div>
  );
}
