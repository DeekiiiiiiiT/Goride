/**
 * Roam Fleet Admin — Maintenance schedule ledger (by customer).
 * Ops service truth — not Expense Hub money.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Search, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import {
  fetchFleetAdminCustomers,
  fetchFleetMaintLedgerByOrg,
  fetchFleetMaintLedgerOrgDetail,
  fetchFleetMaintLedgerOverview,
  type FleetAdminCustomer,
  type FleetMaintLedgerByOrg,
  type FleetMaintLedgerOrgDetail,
  type FleetMaintLedgerOverview,
} from '../fleetAdminService';

export function MaintenanceScheduleLedgerPage({ accessToken }: { accessToken: string }) {
  const [overview, setOverview] = useState<FleetMaintLedgerOverview | null>(null);
  const [byOrg, setByOrg] = useState<FleetMaintLedgerByOrg | null>(null);
  const [customers, setCustomers] = useState<FleetAdminCustomer[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<FleetMaintLedgerOrgDetail | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'outstanding' | 'history'>('outstanding');

  const customerMap = useMemo(() => {
    const m = new Map<string, FleetAdminCustomer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, rollup, cust] = await Promise.all([
        fetchFleetMaintLedgerOverview(accessToken),
        fetchFleetMaintLedgerByOrg(accessToken),
        fetchFleetAdminCustomers(accessToken),
      ]);
      setOverview(ov);
      setByOrg(rollup);
      setCustomers(cust);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load maintenance ledger');
      setOverview(null);
      setByOrg(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadOrgDetail = useCallback(
    async (orgId: string) => {
      setDetailLoading(true);
      try {
        setOrgDetail(await fetchFleetMaintLedgerOrgDetail(accessToken, orgId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load customer ledger');
        setOrgDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedOrgId) void loadOrgDetail(selectedOrgId);
    else setOrgDetail(null);
  }, [selectedOrgId, loadOrgDetail]);

  const filteredOrgs = useMemo(() => {
    const rows = byOrg?.orgs ?? [];
    const q = customerSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const c = customerMap.get(row.orgId);
      const hay = `${c?.name ?? ''} ${c?.email ?? ''} ${row.orgId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [byOrg, customerMap, customerSearch]);

  if (selectedOrgId) {
    const c = customerMap.get(selectedOrgId);
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
            onClick={() => setSelectedOrgId(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            All customers
          </Button>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-white truncate">
              {c?.name || 'Unknown fleet'}
            </h2>
            <p className="text-xs text-slate-500 truncate">{c?.email || selectedOrgId}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto border-slate-700"
            onClick={() => void loadOrgDetail(selectedOrgId)}
            disabled={detailLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${detailLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {detailLoading && !orgDetail ? (
          <div className="flex justify-center py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : orgDetail ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="text-xs text-slate-500">Vehicles tracked</div>
                <div className="text-2xl font-semibold tabular-nums">{orgDetail.vehicleCount}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="text-xs text-slate-500">Outstanding</div>
                <div className="text-2xl font-semibold tabular-nums text-amber-200">
                  {orgDetail.outstanding.length}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <div className="text-xs text-slate-500">History rows</div>
                <div className="text-2xl font-semibold tabular-nums">{orgDetail.history.length}</div>
              </div>
            </div>

            <div className="flex gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setDetailTab('outstanding')}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  detailTab === 'outstanding' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Outstanding
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('history')}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  detailTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                History
              </button>
            </div>

            {detailTab === 'outstanding' ? (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-500 text-left">
                    <tr>
                      <th className="p-3 font-medium">Vehicle</th>
                      <th className="p-3 font-medium">Component</th>
                      <th className="p-3 font-medium">Corner</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Next due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgDetail.outstanding.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500 text-xs">
                          Nothing outstanding for this fleet.
                        </td>
                      </tr>
                    ) : (
                      orgDetail.outstanding.map((row) => (
                        <tr
                          key={`${row.vehicleId}-${row.categoryId}-${row.position ?? 'all'}`}
                          className="border-t border-slate-800"
                        >
                          <td className="p-3 font-mono text-xs text-slate-400">
                            {row.vehicleId.slice(0, 8)}…
                          </td>
                          <td className="p-3 text-slate-200">{row.categoryName || row.categoryCode}</td>
                          <td className="p-3">{row.position || '—'}</td>
                          <td className="p-3">
                            <span
                              className={
                                row.status === 'overdue' ? 'text-rose-300' : 'text-amber-200'
                              }
                            >
                              {row.status === 'overdue' ? 'Overdue' : 'Due soon'}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-400">
                            {[
                              row.nextDueMiles != null
                                ? `${Number(row.nextDueMiles).toLocaleString()} km`
                                : null,
                              row.nextDueDate,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-slate-500 text-left">
                    <tr>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Vehicle</th>
                      <th className="p-3 font-medium">Component</th>
                      <th className="p-3 font-medium">Corner</th>
                      <th className="p-3 font-medium">Action</th>
                      <th className="p-3 font-medium">Odo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgDetail.history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-500 text-xs">
                          No service history yet for this fleet.
                        </td>
                      </tr>
                    ) : (
                      orgDetail.history.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800">
                          <td className="p-3">{row.performedAtDate}</td>
                          <td className="p-3 font-mono text-xs text-slate-400">
                            {String(row.vehicleId).slice(0, 8)}…
                          </td>
                          <td className="p-3 text-slate-200">
                            {row.categoryName || row.categoryCode || '—'}
                          </td>
                          <td className="p-3">{row.position || '—'}</td>
                          <td className="p-3 capitalize">{row.action || '—'}</td>
                          <td className="p-3 tabular-nums text-slate-400">
                            {row.performedAtMiles != null
                              ? Number(row.performedAtMiles).toLocaleString()
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Could not load this customer’s ledger.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Wrench className="h-5 w-5 text-amber-500" />
            Maintenance schedule ledger
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Ops view of completed vs outstanding maintenance by fleet customer. Not expense books.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : overview ? (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <BookOpen className="h-5 w-5 text-slate-400" />
              <span className="text-2xl font-semibold tabular-nums text-white">
                {overview.outstandingCount}
              </span>
              <span className="text-sm text-slate-500">outstanding across fleets</span>
              <span
                className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  overview.status === 'attention'
                    ? 'text-amber-200 border-amber-500/40 bg-amber-500/10'
                    : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                }`}
              >
                {overview.status === 'attention' ? 'Needs attention' : 'Healthy'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500">Customers</div>
                <div className="tabular-nums text-slate-200">{overview.customerCount}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Vehicles</div>
                <div className="tabular-nums text-slate-200">{overview.vehicleCount}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Ledger entries</div>
                <div className="tabular-nums text-slate-200">{overview.ledgerEntries}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Overdue</div>
                <div className="tabular-nums text-rose-300">{overview.overdueCount}</div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-slate-300">By customer</h3>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search name or email"
                  className="pl-7 pr-3 py-1.5 text-xs rounded-md border border-slate-700 bg-slate-900 text-slate-200 placeholder:text-slate-600 w-52"
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-500 text-left">
                  <tr>
                    <th className="p-3 font-medium">Customer</th>
                    <th className="p-3 font-medium">Vehicles</th>
                    <th className="p-3 font-medium">Outstanding</th>
                    <th className="p-3 font-medium">Overdue</th>
                    <th className="p-3 font-medium">History</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-3 text-slate-500 text-xs">
                        No maintenance ledger data yet. Customers appear after fleet managers log
                        services or bootstrap schedules.
                      </td>
                    </tr>
                  ) : (
                    filteredOrgs.map((row) => {
                      const cust = customerMap.get(row.orgId);
                      return (
                        <tr
                          key={row.orgId}
                          className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                          onClick={() => setSelectedOrgId(row.orgId)}
                        >
                          <td className="p-3">
                            <div className="text-slate-200">{cust?.name || 'Unknown fleet'}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {cust?.email || row.orgId.slice(0, 8) + '…'}
                            </div>
                          </td>
                          <td className="p-3 tabular-nums text-slate-300">{row.vehicleCount}</td>
                          <td className="p-3 tabular-nums text-amber-200">{row.outstandingCount}</td>
                          <td className="p-3 tabular-nums text-rose-300">{row.overdueCount}</td>
                          <td className="p-3 tabular-nums text-slate-300">{row.ledgerEntries}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
