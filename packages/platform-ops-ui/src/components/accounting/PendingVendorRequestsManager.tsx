// Stitch: dominion-redesign/c12e73466d9e4131abe8e5e814f66938
/**
 * Super Admin — Pending vendor requests from fleet apps.
 */
import React from 'react';
import { Check, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@roam/ui';
import type { ExpenseVendor } from '@roam/types';
import { platformVendorAdminService } from '../../services/platformVendorAdminService';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function PendingVendorRequestsManager({ embedded = false }: { embedded?: boolean }) {
  const [pending, setPending] = React.useState<ExpenseVendor[]>([]);
  const [verified, setVerified] = React.useState<ExpenseVendor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [mergeInto, setMergeInto] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [p, v] = await Promise.all([
        platformVendorAdminService.listVendors('pending'),
        platformVendorAdminService.listVendors('verified'),
      ]);
      setPending(p.items || []);
      setVerified(v.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const mergeIntoVendorId = mergeInto[id];
      await platformVendorAdminService.approveVendor(
        id,
        mergeIntoVendorId && mergeIntoVendorId !== 'none'
          ? { mergeIntoVendorId }
          : {},
      );
      toast.success(mergeIntoVendorId && mergeIntoVendorId !== 'none' ? 'Merged into catalog vendor' : 'Approved into catalog');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    setBusyId(id);
    try {
      await platformVendorAdminService.rejectVendor(id);
      toast.success('Request rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  const table = (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-slate-900">Pending requests</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-xs font-medium text-amber-700">
            {pending.length} AWAITING REVIEW
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-6 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading inbox…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Requested by app</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Merge into</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    The data is not in yet.
                  </td>
                </tr>
              ) : (
                pending.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-blue-700">
                          {initials(v.name)}
                        </div>
                        <div>
                          <div>{v.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{v.id.slice(0, 12)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800">
                        Fleet
                      </span>
                      {v.requestedByOrgId ? (
                        <div className="mt-1 font-mono text-[11px] text-slate-400">{v.requestedByOrgId}</div>
                      ) : null}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Pending
                      </span>
                      {v.notes ? (
                        <div className="mt-1 max-w-xs truncate text-xs text-slate-500">{v.notes}</div>
                      ) : null}
                    </td>
                    <td className="px-6 py-3.5">
                      <Select
                        value={mergeInto[v.id] || 'none'}
                        onValueChange={(val) => setMergeInto((m) => ({ ...m, [v.id]: val }))}
                      >
                        <SelectTrigger className="h-8 w-[180px]">
                          <SelectValue placeholder="Promote as new" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Promote as new</SelectItem>
                          {verified.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-green-800 disabled:opacity-50"
                          disabled={busyId === v.id}
                          onClick={() => void approve(v.id)}
                        >
                          {busyId === v.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                          disabled={busyId === v.id}
                          onClick={() => void reject(v.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
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
    </div>
  );

  if (embedded) {
    return table;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-8 text-slate-900">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-300">/</span>
          <span>Master data</span>
          <span className="text-slate-300">/</span>
          <span>Tax and Vendors</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-900">Vendors and requests</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendors and requests</h1>
        <p className="text-sm text-slate-500">
          Fleet users requested these companies. Approve into the Jamaica catalog, merge into an existing vendor, or reject.
        </p>
      </div>

      {table}

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" aria-hidden />
          <span className="font-medium text-slate-900">The data is not in yet.</span>
        </div>
        <div className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </div>
      </div>
    </div>
  );
}
