/**
 * Parish coverage health — geom presence, town pcode linkage, catalog counts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  listCoverageHealth,
  type DashCoverageHealthParish,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

function rowFlags(r: DashCoverageHealthParish): string[] {
  const flags: string[] = [];
  if (!r.has_foundation_geom) flags.push('missing geom');
  if (r.town_count > 0 && r.towns_with_pcode === 0) flags.push('towns without pcode');
  if (r.town_count > 0 && r.towns_with_pcode < r.town_count) flags.push('partial town pcodes');
  return flags;
}

export function CoverageHealthPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [rows, setRows] = useState<DashCoverageHealthParish[]>([]);
  const [catalogCount, setCatalogCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCoverageHealth(session.access_token);
      setRows(res.parishes ?? []);
      setCatalogCount(res.catalog_boundary_count ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load coverage health');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const flagged = rows.filter((r) => rowFlags(r).length > 0).length;

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          Coverage Health
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Parish foundation geom, town catalog linkage, and official source vintage.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <span className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-slate-300">
          Catalog boundaries: <span className="text-white font-medium">{catalogCount}</span>
        </span>
        <span className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-slate-300">
          Parishes: <span className="text-white font-medium">{rows.length}</span>
        </span>
        <span
          className={`rounded-lg border px-3 py-2 ${
            flagged > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
              : 'border-slate-700 bg-slate-900/50 text-slate-300'
          }`}
        >
          Flagged: <span className="font-medium">{flagged}</span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading health…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-950/80 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Parish</th>
                  <th className="px-3 py-2.5 font-medium">Mode</th>
                  <th className="px-3 py-2.5 font-medium">Has geom</th>
                  <th className="px-3 py-2.5 font-medium">Vertices</th>
                  <th className="px-3 py-2.5 font-medium">Towns</th>
                  <th className="px-3 py-2.5 font-medium">With pcode</th>
                  <th className="px-3 py-2.5 font-medium">Catalog admin2</th>
                  <th className="px-3 py-2.5 font-medium">Source / vintage</th>
                  <th className="px-3 py-2.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const flags = rowFlags(r);
                  const bad = flags.length > 0;
                  return (
                    <tr
                      key={r.parish_id}
                      className={`border-t border-slate-800/80 ${
                        bad ? 'bg-amber-500/5' : 'hover:bg-slate-900/40'
                      }`}
                    >
                      <td className="px-3 py-2 text-white">{r.name}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {r.coverage_mode === 'parish_boundary' ? 'Parish border' : 'Town zones'}
                      </td>
                      <td className="px-3 py-2">
                        {r.has_foundation_geom ? (
                          <span className="text-emerald-300">Yes</span>
                        ) : (
                          <span className="text-red-300">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {r.foundation_vertex_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{r.town_count}</td>
                      <td className="px-3 py-2">{r.towns_with_pcode}</td>
                      <td className="px-3 py-2">{r.catalog_admin2_count}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {[r.boundary_source, r.boundary_valid_on].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {flags.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className="inline-flex items-start gap-1 text-[11px] text-amber-200">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                            {flags.join('; ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
