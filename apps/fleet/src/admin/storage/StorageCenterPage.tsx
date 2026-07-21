/**
 * Roam Fleet Admin — Storage Center (ops only).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import {
  auditFleetLegacyStorage,
  fetchFleetAdminCustomers,
  fetchFleetStorageByOrg,
  fetchFleetStorageOrgDetail,
  fetchFleetStorageOverview,
  purgeFleetLegacyStorage,
  runFleetEvidenceCleanup,
  type FleetAdminCustomer,
  type FleetLegacyAuditResult,
  type FleetStorageByOrgResult,
  type FleetStorageOrgDetail,
  type FleetStorageOverview,
} from '../fleetAdminService';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Unknown';
  const hours = Math.floor((Date.now() - then) / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATUS_COPY: Record<FleetStorageOverview['status'], { label: string; className: string }> = {
  healthy: { label: 'Healthy', className: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
  over_quota: { label: 'Over quota', className: 'text-rose-300 border-rose-500/40 bg-rose-500/10' },
  ttl_off: { label: 'TTL off', className: 'text-amber-200 border-amber-500/40 bg-amber-500/10' },
};

export function StorageCenterPage({
  accessToken,
  canPurge,
}: {
  accessToken: string;
  canPurge: boolean;
}) {
  const { confirm } = useAdminConfirm();
  const [overview, setOverview] = useState<FleetStorageOverview | null>(null);
  const [byOrg, setByOrg] = useState<FleetStorageByOrgResult | null>(null);
  const [customers, setCustomers] = useState<FleetAdminCustomer[]>([]);
  const [audit, setAudit] = useState<FleetLegacyAuditResult | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<FleetStorageOrgDetail | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        fetchFleetStorageOverview(accessToken),
        fetchFleetStorageByOrg(accessToken),
        fetchFleetAdminCustomers(accessToken),
      ]);
      setOverview(ov);
      setByOrg(rollup);
      setCustomers(cust);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load storage overview');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadOrgDetail = useCallback(
    async (orgId: string) => {
      setDetailLoading(true);
      try {
        setOrgDetail(await fetchFleetStorageOrgDetail(accessToken, orgId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load fleet storage');
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
    const rows = byOrg?.orgs || [];
    const q = customerSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const c = customerMap.get(r.orgId);
      const name = (c?.name || '').toLowerCase();
      const email = (c?.email || '').toLowerCase();
      return name.includes(q) || email.includes(q) || r.orgId.toLowerCase().includes(q);
    });
  }, [byOrg, customerMap, customerSearch]);

  const unattributedTotal = byOrg
    ? byOrg.unattributed.legacyOrphans.bytes +
      byOrg.unattributed.vehicleOrphans.bytes +
      byOrg.unattributed.ephemeralUnknown.bytes
    : 0;

  const runDryCleanup = async (orgId?: string) => {
    setBusy('dry');
    try {
      const res = await runFleetEvidenceCleanup(accessToken, true, orgId);
      toast.success(
        res.wouldPurge != null
          ? `Dry run: ${res.wouldPurge} file(s) would be purged`
          : 'Dry run complete',
      );
      void load();
      if (orgId) void loadOrgDetail(orgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cleanup dry run failed');
    } finally {
      setBusy(null);
    }
  };

  const runLiveCleanup = async (orgId?: string) => {
    const ok = await confirm({
      title: orgId ? 'Run cleanup for this fleet?' : 'Run evidence cleanup?',
      description: orgId
        ? 'Deletes expired ephemeral evidence for this fleet only.'
        : 'Deletes expired ephemeral evidence files past their 14-day window.',
      confirmLabel: 'Run cleanup',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('live');
    try {
      const res = await runFleetEvidenceCleanup(accessToken, false, orgId);
      toast.success(`Purged ${res.purged} file(s)`);
      void load();
      if (orgId) void loadOrgDetail(orgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setBusy(null);
    }
  };

  const runAudit = async (orgId?: string) => {
    setBusy('audit');
    try {
      const res = await auditFleetLegacyStorage(accessToken, orgId);
      setAudit(res);
      toast.success(
        orgId
          ? `Linked legacy: ${res.linkedCount} (${formatBytes(res.linkedBytes)})`
          : `Scanned ${res.scanned}: ${res.orphanCount} orphans (${formatBytes(res.orphanBytes)})`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Legacy audit failed');
    } finally {
      setBusy(null);
    }
  };

  const runPurgeOrphans = async () => {
    if (!canPurge) {
      toast.error('Purge requires fleet_admin or platform owner');
      return;
    }
    const ok = await confirm({
      title: 'Purge orphan legacy docs?',
      description: (
        <>
          Deletes files in <span className="text-white">make-37f42386-docs/driver-docs</span> that
          are not linked from fuel/transaction records. This cannot be undone.
        </>
      ),
      confirmLabel: 'Purge orphans',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('purge');
    try {
      const res = await purgeFleetLegacyStorage(accessToken, { orphanOnly: true });
      toast.success(`Deleted ${res.deleted} orphan file(s)`);
      setAudit(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setBusy(null);
    }
  };

  const runPurgeAged = async () => {
    if (!canPurge) {
      toast.error('Purge requires fleet_admin or platform owner');
      return;
    }
    const ok = await confirm({
      title: 'Purge legacy docs older than 14 days?',
      description: (
        <>
          Deletes receipt/proof files in the legacy docs bucket older than the 14-day retention
          window (including linked ones). Receipt text in records stays; images may show as
          expired. This cannot be undone.
        </>
      ),
      confirmLabel: 'Purge aged files',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('purge-aged');
    try {
      const res = await purgeFleetLegacyStorage(accessToken, {
        orphanOnly: false,
        olderThanDays: 14,
      });
      toast.success(`Deleted ${res.deleted} aged file(s)`);
      setAudit(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Aged purge failed');
    } finally {
      setBusy(null);
    }
  };

  const runPurgeOrgLinked = async (orgId: string) => {
    if (!canPurge) {
      toast.error('Purge requires fleet_admin or platform owner');
      return;
    }
    const ok = await confirm({
      title: 'Purge linked legacy docs for this fleet?',
      description:
        'Deletes only legacy receipt/proof files linked to this fleet’s records. Platform orphans stay untouched.',
      confirmLabel: 'Purge linked',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('purge-org');
    try {
      const res = await purgeFleetLegacyStorage(accessToken, { orgId });
      toast.success(`Deleted ${res.deleted} linked file(s)`);
      setAudit(null);
      void load();
      void loadOrgDetail(orgId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading storage…
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="space-y-3 max-w-lg">
        <p className="text-sm text-rose-300">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const status = STATUS_COPY[overview.status];
  const pct = Math.min(
    100,
    Math.round((overview.totalBytes / overview.freePlanLimitBytes) * 100),
  );
  const selectedCustomer = selectedOrgId ? customerMap.get(selectedOrgId) : null;

  if (selectedOrgId) {
    return (
      <div className="space-y-8 max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 mb-2"
              onClick={() => {
                setSelectedOrgId(null);
                setAudit(null);
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All customers
            </button>
            <h2 className="text-xl font-semibold text-white">
              {selectedCustomer?.name || 'Fleet storage'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {selectedCustomer?.email || selectedOrgId}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadOrgDetail(selectedOrgId)}
            disabled={detailLoading || !!busy}
            className="border-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${detailLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {detailLoading && !orgDetail ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading fleet…
          </div>
        ) : orgDetail ? (
          <>
            <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-2">
              <div className="text-2xl font-semibold tabular-nums text-white">
                {formatBytes(orgDetail.totals.totalBytes)}
              </div>
              <p className="text-xs text-slate-500">
                Ephemeral {formatBytes(orgDetail.totals.ephemeralBytes)} · Legacy linked{' '}
                {formatBytes(orgDetail.totals.legacyLinkedBytes)} · Vehicles{' '}
                {formatBytes(orgDetail.totals.vehicleLinkedBytes)}
              </p>
              <p className="text-xs text-slate-500">{orgDetail.legacy.note}</p>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Evidence lifecycle</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Active" value={String(orgDetail.evidence.activeCount)} />
                <Stat label="Pending hold" value={String(orgDetail.evidence.pendingHoldCount)} />
                <Stat label="Scheduled" value={String(orgDetail.evidence.scheduledCount)} />
                <Stat
                  label="Expiring ≤7d"
                  value={String(orgDetail.evidence.expiringWithin7Days)}
                  highlight={orgDetail.evidence.expiringWithin7Days > 0}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Fleet actions</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700"
                  disabled={!!busy}
                  onClick={() => void runDryCleanup(selectedOrgId)}
                >
                  {busy === 'dry' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Dry-run cleanup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700"
                  disabled={!!busy || !overview.ttlEnabled}
                  onClick={() => void runLiveCleanup(selectedOrgId)}
                >
                  {busy === 'live' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Run cleanup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-700"
                  disabled={!!busy}
                  onClick={() => void runAudit(selectedOrgId)}
                >
                  {busy === 'audit' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Scan linked legacy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                  disabled={!!busy || !canPurge}
                  onClick={() => void runPurgeOrgLinked(selectedOrgId)}
                >
                  {busy === 'purge-org' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Purge linked legacy
                </Button>
              </div>
              {audit && audit.orgId === selectedOrgId && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
                  Linked: {audit.linkedCount} ({formatBytes(audit.linkedBytes)})
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">Recent ephemeral</h3>
              <div className="rounded-xl border border-slate-800 overflow-hidden text-xs">
                {(orgDetail.ephemeral.recent || []).length === 0 ? (
                  <p className="p-3 text-slate-500">No registry rows for this fleet yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-800 max-h-48 overflow-y-auto font-mono text-slate-400">
                    {orgDetail.ephemeral.recent.map((r) => (
                      <li key={r.id} className="p-3 flex justify-between gap-2">
                        <span className="truncate">
                          {r.evidence_type} · {r.status} · {r.storage_path}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatBytes(r.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">
                Linked legacy ({orgDetail.legacy.linked.length})
              </h3>
              <div className="rounded-xl border border-slate-800 overflow-hidden text-xs max-h-40 overflow-y-auto">
                {(orgDetail.legacy.linked || []).length === 0 ? (
                  <p className="p-3 text-slate-500">None</p>
                ) : (
                  <ul className="divide-y divide-slate-800 font-mono text-slate-400">
                    {orgDetail.legacy.linked.slice(0, 40).map((r) => (
                      <li key={r.path} className="p-2 flex justify-between gap-2">
                        <span className="truncate">
                          {r.sourceType}/{r.sourceId} · {r.path}
                        </span>
                        <span className="shrink-0">{formatBytes(r.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300">
                Vehicles ({orgDetail.vehicles.linked.length})
              </h3>
              <div className="rounded-xl border border-slate-800 overflow-hidden text-xs max-h-32 overflow-y-auto">
                {(orgDetail.vehicles.linked || []).length === 0 ? (
                  <p className="p-3 text-slate-500">None</p>
                ) : (
                  <ul className="divide-y divide-slate-800 font-mono text-slate-400">
                    {orgDetail.vehicles.linked.map((r) => (
                      <li key={r.path} className="p-2 flex justify-between gap-2">
                        <span className="truncate">
                          {r.licensePlate || r.vehicleId} · {r.path}
                        </span>
                        <span className="shrink-0">{formatBytes(r.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        ) : (
          <p className="text-sm text-rose-300">Could not load this fleet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Storage</h2>
          <p className="text-sm text-slate-400 mt-1">
            Roam ops view of Fleet file storage, retention, and reclaim tools.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading || !!busy}
          className="border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <HardDrive className="h-5 w-5 text-slate-400" />
          <span className="text-2xl font-semibold tabular-nums text-white">
            {formatBytes(overview.totalBytes)}
          </span>
          <span className="text-sm text-slate-500">
            / {formatBytes(overview.freePlanLimitBytes)} Free plan soft limit
          </span>
          <span
            className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overview.overQuota ? 'bg-rose-500' : 'bg-sky-500'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-500">
          Scan photos delete 14 days after approval. TTL currently{' '}
          <span className="text-slate-300">{overview.ttlEnabled ? 'ON' : 'OFF'}</span>.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">By bucket</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-500 text-left">
              <tr>
                <th className="p-3 font-medium">Bucket</th>
                <th className="p-3 font-medium">Files</th>
                <th className="p-3 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {overview.buckets.map((b) => (
                <tr key={b.id} className="border-t border-slate-800">
                  <td className="p-3">
                    <div className="text-slate-200">{b.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{b.purpose}</div>
                    {!b.reachable && (
                      <div className="text-xs text-amber-400 mt-1">Bucket unreachable</div>
                    )}
                  </td>
                  <td className="p-3 tabular-nums text-slate-300">{b.fileCount}</td>
                  <td className="p-3 tabular-nums text-slate-300">{formatBytes(b.totalBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th className="p-3 font-medium">Ephemeral</th>
                <th className="p-3 font-medium">Legacy</th>
                <th className="p-3 font-medium">Vehicles</th>
                <th className="p-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-slate-500 text-xs">
                    No attributable storage yet. New ephemeral uploads stamp orgId going forward.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((row) => {
                  const c = customerMap.get(row.orgId);
                  return (
                    <tr
                      key={row.orgId}
                      className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer"
                      onClick={() => setSelectedOrgId(row.orgId)}
                    >
                      <td className="p-3">
                        <div className="text-slate-200">{c?.name || 'Unknown fleet'}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {c?.email || row.orgId.slice(0, 8) + '…'}
                        </div>
                      </td>
                      <td className="p-3 tabular-nums text-slate-300">
                        {formatBytes(row.ephemeral.bytes)}
                        <div className="text-[10px] text-slate-500">
                          {row.ephemeral.fileCount} files
                        </div>
                      </td>
                      <td className="p-3 tabular-nums text-slate-300">
                        {formatBytes(row.legacy.linkedBytes)}
                        <div className="text-[10px] text-slate-500">
                          {row.legacy.linkedCount} linked
                        </div>
                      </td>
                      <td className="p-3 tabular-nums text-slate-300">
                        {formatBytes(row.vehicles.linkedBytes)}
                      </td>
                      <td className="p-3 tabular-nums text-slate-100 font-medium">
                        {formatBytes(row.totalBytes)}
                      </td>
                    </tr>
                  );
                })
              )}
              {byOrg && (
                <tr className="border-t border-slate-700 bg-slate-900/60">
                  <td className="p-3">
                    <div className="text-amber-200/90 text-sm">Unattributed (platform)</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Orphans + unknown org — not assigned to a fleet
                    </div>
                  </td>
                  <td className="p-3 tabular-nums text-slate-400">
                    {formatBytes(byOrg.unattributed.ephemeralUnknown.bytes)}
                    <div className="text-[10px] text-slate-500">
                      {byOrg.unattributed.ephemeralUnknown.count} unknown
                    </div>
                  </td>
                  <td className="p-3 tabular-nums text-slate-400">
                    {formatBytes(byOrg.unattributed.legacyOrphans.bytes)}
                    <div className="text-[10px] text-slate-500">
                      {byOrg.unattributed.legacyOrphans.count} orphans
                    </div>
                  </td>
                  <td className="p-3 tabular-nums text-slate-400">
                    {formatBytes(byOrg.unattributed.vehicleOrphans.bytes)}
                  </td>
                  <td className="p-3 tabular-nums text-amber-200/80">
                    {formatBytes(unattributedTotal)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Evidence lifecycle</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Active" value={String(overview.evidence.activeCount)} />
          <Stat label="Pending hold" value={String(overview.evidence.pendingHoldCount)} />
          <Stat label="Scheduled" value={String(overview.evidence.scheduledCount)} />
          <Stat
            label="Expiring ≤7d"
            value={String(overview.evidence.expiringWithin7Days)}
            highlight={overview.evidence.expiringWithin7Days > 0}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 rounded-lg border border-slate-800 px-3 py-2">
          <Timer className="h-3.5 w-3.5" />
          Last cleanup: {formatRelativeTime(overview.evidence.lastCleanupAt)}
          {overview.evidence.lastCleanupPurged > 0 && (
            <span>· {overview.evidence.lastCleanupPurged} removed (24h)</span>
          )}
          <span>· Registry size {formatBytes(overview.evidence.totalBytes)}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Platform actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700"
            disabled={!!busy}
            onClick={() => void runDryCleanup()}
          >
            {busy === 'dry' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Dry-run cleanup
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700"
            disabled={!!busy || !overview.ttlEnabled}
            onClick={() => void runLiveCleanup()}
          >
            {busy === 'live' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Run cleanup
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700"
            disabled={!!busy}
            onClick={() => void runAudit()}
          >
            {busy === 'audit' ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Scan legacy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            disabled={!!busy || !canPurge}
            onClick={() => void runPurgeOrphans()}
          >
            {busy === 'purge' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Purge orphans
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
            disabled={!!busy || !canPurge}
            onClick={() => void runPurgeAged()}
          >
            {busy === 'purge-aged' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Purge aged (14d+)
          </Button>
        </div>
        {!canPurge && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Purge requires fleet_admin or platform owner. Ops can still scan and dry-run.
          </p>
        )}
        {audit && !audit.orgId && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400 space-y-1">
            <div>
              Legacy scan: {audit.scanned} files · {audit.linkedCount} linked (
              {formatBytes(audit.linkedBytes)}) · {audit.orphanCount} orphans (
              {formatBytes(audit.orphanBytes)})
            </div>
            {audit.orphans.length > 0 && (
              <div className="text-slate-500 max-h-24 overflow-y-auto font-mono">
                {audit.orphans.slice(0, 8).map((o) => (
                  <div key={o.path}>
                    {o.path} ({formatBytes(o.bytes)})
                  </div>
                ))}
                {audit.orphans.length > 8 && <div>…and {audit.orphans.length - 8} more</div>}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`text-lg font-semibold tabular-nums mt-0.5 ${
          highlight ? 'text-amber-200' : 'text-slate-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
