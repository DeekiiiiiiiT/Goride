/**
 * Super Admin — Pending vendor requests from fleet apps.
 */
import React from 'react';
import { Check, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { platformVendorAdminService } from '../../../services/platformVendorAdminService';
import type { ExpenseVendor } from '../../../types/expenseHub';

export function PendingVendorRequestsManager() {
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

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pending vendor requests</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Fleet users requested these companies. Approve into the Jamaica catalog, merge into an existing vendor, or reject.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading inbox…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested name</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Merge into</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-10">
                    Inbox clear — no pending vendor requests.
                  </TableCell>
                </TableRow>
              ) : (
                pending.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      {v.name}
                      <Badge className="ml-2 bg-amber-50 text-amber-900" variant="secondary">
                        Pending
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-mono">
                      {v.requestedByOrgId || '—'}
                    </TableCell>
                    <TableCell className="text-slate-500 max-w-xs truncate">{v.notes || '—'}</TableCell>
                    <TableCell>
                      <Select
                        value={mergeInto[v.id] || 'none'}
                        onValueChange={(val) => setMergeInto((m) => ({ ...m, [v.id]: val }))}
                      >
                        <SelectTrigger className="w-[180px] h-8">
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
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={busyId === v.id}
                        onClick={() => void approve(v.id)}
                      >
                        {busyId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-700"
                        disabled={busyId === v.id}
                        onClick={() => void reject(v.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
