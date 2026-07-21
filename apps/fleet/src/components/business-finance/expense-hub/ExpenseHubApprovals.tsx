/**
 * Expense Hub — Approvals subview (Stitch: Approvals Queue mobile+desktop).
 * Mobile: accent-striped cards with inline approve/reject. Desktop: dense queue table.
 * Real actions only: submitted docs, approve / reject-with-reason, open detail.
 */
import React from 'react';
import { Check, Loader2, Receipt, Search, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../ui/utils';
import { formatMoney } from '../money';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  useApproveExpenseDocument,
  useExpenseHubDocuments,
  useRejectExpenseDocument,
} from '../../../hooks/useExpenseHub';
import type { ExpenseDocument } from '../../../types/expenseHub';
import { HubDenied, HubEmpty, HubError, HubLoading } from './HubStates';
import { allocationLabel, categoryIcon, docUrgency, timeAgo } from './hubFormat';

const URGENCY_ACCENTS = {
  overdue: 'bg-rose-500',
  aging: 'bg-amber-500',
} as const;

const URGENCY_BADGES = {
  overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  aging: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
} as const;

export function ExpenseHubApprovals({
  onOpenDetail,
  onChanged,
  writesEnabled = true,
}: {
  onOpenDetail: (id: string) => void;
  onChanged?: () => void;
  writesEnabled?: boolean;
}) {
  const { can } = usePermissions();
  const approve = useApproveExpenseDocument();
  const reject = useRejectExpenseDocument();

  const [searchInput, setSearchInput] = React.useState('');
  const [q, setQ] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [urgencyFilter, setUrgencyFilter] = React.useState('all');
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  // Debounce free text so we don't refetch per keystroke
  React.useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const docsQuery = useExpenseHubDocuments({ status: 'submitted', q: q || undefined });

  // Owners can view the queue; approve actions still need expenses.approve + writes
  if (!can('expenses.view') && !can('expenses.approve')) {
    return <HubDenied what="the approvals queue" />;
  }

  const canAct = can('expenses.approve') && writesEnabled;

  const runApprove = async (id: string) => {
    setPendingId(id);
    try {
      await approve.mutateAsync({ id });
      toast.success('Expense approved and posted');
      onChanged?.();
    } catch (error) {
      // Separation of duties: creator can't approve their own document
      toast.error(error instanceof Error ? error.message : 'Approval failed');
    } finally {
      setPendingId(null);
    }
  };

  const runReject = async () => {
    if (!rejectingId) return;
    if (!rejectReason.trim()) {
      toast.error('A reason is required to reject');
      return;
    }
    try {
      await reject.mutateAsync({ id: rejectingId, reason: rejectReason.trim() });
      toast.success('Expense rejected');
      setRejectingId(null);
      setRejectReason('');
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reject failed');
    }
  };

  const allItems = docsQuery.data?.items || [];
  const categories = Array.from(new Set(allItems.map((d) => String(d.category)))).sort();
  const items = allItems.filter((d) => {
    if (categoryFilter !== 'all' && String(d.category) !== categoryFilter) return false;
    if (urgencyFilter !== 'all') {
      const u = docUrgency(d);
      if (urgencyFilter === 'urgent' && !u) return false;
      if (urgencyFilter === 'standard' && u) return false;
    }
    return true;
  });
  const hasFilters = Boolean(q) || categoryFilter !== 'all' || urgencyFilter !== 'all';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Awaiting approval
          {!docsQuery.isLoading && !docsQuery.isError && (
            <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {items.length} pending
            </span>
          )}
        </h3>
        <p className="text-xs text-slate-500">
          Approving posts the expense to the ledger. Creators cannot approve their own submissions.
        </p>
      </div>

      {/* Search + quick filters (Stitch mobile filter bar) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search expenses…"
            aria-label="Search the approval queue"
            className="h-11 pl-9"
          />
        </div>
        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
          <SelectTrigger className="min-h-11 w-[135px]" aria-label="Filter by urgency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Urgency: all</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="min-h-11 w-[160px]" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Category: all</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {docsQuery.isLoading ? (
        <HubLoading label="Loading approval queue…" />
      ) : docsQuery.isError ? (
        <HubError
          message={(docsQuery.error as Error)?.message}
          onRetry={() => void docsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <HubEmpty
          title={hasFilters ? 'Nothing matches these filters' : 'Queue is clear'}
          description={
            hasFilters
              ? 'Try broadening the search or clearing the urgency/category filters.'
              : 'No expenses are waiting for approval.'
          }
        />
      ) : (
        <>
          {/* Mobile: accent cards */}
          <div className="space-y-3 md:hidden">
            {items.map((d) => (
              <ApprovalCard
                key={d.id}
                doc={d}
                canAct={canAct}
                busy={pendingId === d.id && approve.isPending}
                onApprove={() => void runApprove(d.id)}
                onReject={() => setRejectingId(d.id)}
                onOpenDetail={() => onOpenDetail(d.id)}
              />
            ))}
          </div>

          {/* Desktop: dense queue table */}
          <Card className="hidden overflow-hidden rounded-md border-slate-200 dark:border-slate-800 md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Age</TableHead>
                    <TableHead>Expense</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Allocation</TableHead>
                    <TableHead className="text-center">Rec.</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {canAct && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d) => {
                    const urgency = docUrgency(d);
                    const busy = pendingId === d.id && approve.isPending;
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        onClick={() => onOpenDetail(d.id)}
                      >
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-sm',
                            urgency?.level === 'overdue' && 'font-medium text-rose-600',
                          )}
                        >
                          {timeAgo(d.submittedAt || d.createdAt) || d.incurredDate}
                        </TableCell>
                        <TableCell className="max-w-[240px]">
                          <span className="block truncate font-medium">{d.description}</span>
                          {urgency && (
                            <Badge
                              variant="secondary"
                              className={cn('mt-0.5 font-normal', URGENCY_BADGES[urgency.level])}
                            >
                              {urgency.label}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {d.vendorName || '—'}
                        </TableCell>
                        <TableCell>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {d.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {allocationLabel(d.allocations)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Receipt
                            aria-label={
                              d.evidenceUrls?.length
                                ? `${d.evidenceUrls.length} receipt(s) attached`
                                : 'No receipt attached'
                            }
                            className={cn(
                              'inline h-4 w-4',
                              d.evidenceUrls?.length ? 'text-indigo-600' : 'text-slate-300',
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatMoney(d.netAmount)}
                        </TableCell>
                        {canAct && (
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 text-rose-600 hover:text-rose-700"
                                disabled={busy}
                                onClick={() => setRejectingId(d.id)}
                              >
                                <X className="mr-1 h-4 w-4" aria-hidden />
                                Reject
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-9"
                                disabled={busy}
                                onClick={() => void runApprove(d.id)}
                              >
                                {busy ? (
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                  <Check className="mr-1 h-4 w-4" aria-hidden />
                                )}
                                Approve
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(rejectingId)} onOpenChange={(o: boolean) => !o && setRejectingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
            <DialogDescription>
              The submitter will see this reason on the document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hub-reject-reason">Reason (required)</Label>
            <Textarea
              id="hub-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={reject.isPending}
              onClick={() => setRejectingId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={reject.isPending || !rejectReason.trim()}
              onClick={() => void runReject()}
            >
              {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Reject expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Mobile approval card with urgency accent stripe (Stitch mobile queue card). */
function ApprovalCard({
  doc,
  canAct,
  busy,
  onApprove,
  onReject,
  onOpenDetail,
}: {
  doc: ExpenseDocument;
  canAct: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenDetail: () => void;
}) {
  const urgency = docUrgency(doc);
  const Icon = categoryIcon(String(doc.category));

  return (
    <Card className="relative overflow-hidden rounded-xl border-slate-200 dark:border-slate-800">
      {urgency && (
        <div
          aria-hidden
          className={cn('absolute left-0 top-0 h-full w-1', URGENCY_ACCENTS[urgency.level])}
        />
      )}
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-h-11 flex-1 items-center gap-3 text-left"
            onClick={onOpenDetail}
            aria-label={`Open detail for ${doc.description}`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                {doc.description}
              </p>
              <p className="truncate text-xs text-slate-500">
                {doc.vendorName ? `${doc.vendorName} · ` : ''}
                {timeAgo(doc.submittedAt || doc.createdAt) || doc.incurredDate}
              </p>
            </div>
          </button>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {formatMoney(doc.netAmount)}
            </p>
            {urgency && (
              <Badge
                variant="secondary"
                className={cn('mt-0.5 font-normal', URGENCY_BADGES[urgency.level])}
              >
                {urgency.label}
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Category</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{doc.category}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Allocation</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {allocationLabel(doc.allocations)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Incurred</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {doc.incurredDate}
            </span>
          </div>
        </div>

        {doc.notes && (
          <p className="line-clamp-2 text-xs italic text-slate-500">“{doc.notes}”</p>
        )}

        <div className="flex items-center gap-2">
          {canAct ? (
            <>
              <Button
                type="button"
                className="min-h-11 flex-1"
                disabled={busy}
                onClick={onApprove}
              >
                {busy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="mr-1 h-4 w-4" aria-hidden />
                )}
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 text-rose-600 hover:text-rose-700"
                disabled={busy}
                onClick={onReject}
              >
                <X className="mr-1 h-4 w-4" aria-hidden />
                Reject
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className={cn('min-h-11 text-indigo-600', !canAct && 'flex-1')}
            onClick={onOpenDetail}
          >
            Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
