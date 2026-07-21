/**
 * Expense Hub — document detail dialog (Stitch: Expense Detail & Payment mobile+desktop).
 * Total/Paid/Remaining summary, Overview / Allocation / Approval / Payments / Audit tabs,
 * receipt evidence from real URLs, partial+final payments, submit draft, void with reason.
 */
import React from 'react';
import { Banknote, Check, ExternalLink, History, Loader2, ReceiptText } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Textarea } from '../../ui/textarea';
import { cn } from '../../ui/utils';
import { formatMoney, round2 } from '../money';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  expenseHubKeys,
  useExpenseHubDocument,
  useRecordExpensePayment,
} from '../../../hooks/useExpenseHub';
import { expenseHubService } from '../../../services/expenseHubService';
import type { ExpenseAuditEvent, ExpenseDocument } from '../../../types/expenseHub';
import { DocStatusBadge, HubError, HubLoading } from './HubStates';
import { useVehicleOptions } from './useVehicleOptions';
import { isImageUrl, shortRef, timeAgo } from './hubFormat';

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Credit Card', 'Digital Wallet', 'Check', 'Other'];
const PAYABLE_STATUSES = ['approved', 'posted', 'partially_paid'];
const VOIDABLE_STATUSES = ['submitted', 'approved', 'posted', 'partially_paid', 'paid'];

export function ExpenseHubDetail({
  documentId,
  onClose,
  onChanged,
  writesEnabled = true,
}: {
  documentId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  writesEnabled?: boolean;
}) {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const query = useExpenseHubDocument(documentId);
  const recordPayment = useRecordExpensePayment();
  const vehicleOptions = useVehicleOptions();

  const [tab, setTab] = React.useState('overview');
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentDate, setPaymentDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] = React.useState('Bank Transfer');
  const [paymentRef, setPaymentRef] = React.useState('');
  const [voidMode, setVoidMode] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // Reset transient state when switching documents
  React.useEffect(() => {
    setTab('overview');
    setVoidMode(false);
    setVoidReason('');
    setPaymentAmount('');
    setPaymentRef('');
  }, [documentId]);

  const doc = query.data?.document;
  const payments = query.data?.payments || [];
  const audits = ((query.data?.audits as ExpenseAuditEvent[] | undefined) || []).filter(
    (a) => a && a.at,
  );
  const paidSoFar = round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = doc ? round2(doc.netAmount - paidSoFar) : 0;

  const vehicleLabel = (id: string) =>
    vehicleOptions.data?.find((o) => o.id === id)?.label || id;

  const invalidate = () => qc.invalidateQueries({ queryKey: expenseHubKeys.all });

  const submitDraft = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      await expenseHubService.submitDocument(doc.id);
      toast.success('Submitted for approval');
      invalidate();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async () => {
    if (!doc) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a positive payment amount');
      return;
    }
    if (amount - remaining > 0.01) {
      toast.error(`Payment exceeds the ${formatMoney(remaining)} remaining`);
      return;
    }
    try {
      await recordPayment.mutateAsync({
        id: doc.id,
        amount,
        paymentDate,
        paymentMethod,
        reference: paymentRef.trim() || undefined,
      });
      toast.success(
        Math.abs(amount - remaining) <= 0.01 ? 'Final payment recorded' : 'Partial payment recorded',
      );
      setPaymentAmount('');
      setPaymentRef('');
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Payment failed');
    }
  };

  const submitVoid = async () => {
    if (!doc) return;
    if (!voidReason.trim()) {
      toast.error('A reason is required to void');
      return;
    }
    setBusy(true);
    try {
      await expenseHubService.voidDocument(doc.id, voidReason.trim());
      toast.success('Expense voided');
      setVoidMode(false);
      setVoidReason('');
      invalidate();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Void failed');
    } finally {
      setBusy(false);
    }
  };

  const canPay =
    Boolean(doc) &&
    can('expenses.pay') &&
    writesEnabled &&
    PAYABLE_STATUSES.includes(doc!.status) &&
    remaining > 0;

  return (
    <Dialog open={Boolean(documentId)} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {query.isLoading ? (
          <HubLoading label="Loading expense…" />
        ) : query.isError || !doc ? (
          <HubError
            message={(query.error as Error)?.message || 'Expense not found'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                {doc.description}
                <DocStatusBadge status={doc.status} />
              </DialogTitle>
              <DialogDescription>
                {shortRef(doc.id)} · {doc.category} · incurred {doc.incurredDate}
                {doc.dueDate ? ` · due ${doc.dueDate}` : ''}
                {doc.vendorName ? ` · ${doc.vendorName}` : ''}
              </DialogDescription>
            </DialogHeader>

            {/* Financial summary (Stitch bento: Total / Paid / Remaining) */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-indigo-600 p-3 text-white dark:bg-indigo-500">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  Total amount
                </p>
                <p className="text-lg font-bold tabular-nums">{formatMoney(doc.netAmount)}</p>
              </div>
              <div className="rounded-xl bg-emerald-600 p-3 text-white dark:bg-emerald-500">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  Paid to date
                </p>
                <p className="text-lg font-bold tabular-nums">{formatMoney(paidSoFar)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Remaining
                </p>
                <p
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    remaining > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {formatMoney(remaining)}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Gross {formatMoney(doc.grossAmount)} · Tax {formatMoney(doc.taxAmount)} · Net{' '}
              {formatMoney(doc.netAmount)}
            </p>

            {doc.rejectionReason && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                Rejected: {doc.rejectionReason}
              </p>
            )}
            {doc.voidReason && (
              <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Voided: {doc.voidReason}
              </p>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto w-full flex-wrap justify-start bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="overview" className="min-h-9 flex-none rounded-full px-4">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="allocation" className="min-h-9 flex-none rounded-full px-4">
                  Allocation
                </TabsTrigger>
                <TabsTrigger value="approval" className="min-h-9 flex-none rounded-full px-4">
                  Approval
                </TabsTrigger>
                <TabsTrigger value="payments" className="min-h-9 flex-none rounded-full px-4">
                  Payments
                </TabsTrigger>
                <TabsTrigger value="audit" className="min-h-9 flex-none rounded-full px-4">
                  Audit
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-1">
                <EvidenceSection urls={doc.evidenceUrls || []} />
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <OverviewField label="Vendor" value={doc.vendorName || '—'} />
                  <OverviewField label="Category" value={String(doc.category)} />
                  <OverviewField label="Incurred" value={doc.incurredDate} />
                  <OverviewField label="Due date" value={doc.dueDate || '—'} />
                  <OverviewField label="Payment method" value={doc.paymentMethod || '—'} />
                  <OverviewField label="Currency" value={doc.currency} />
                </dl>
                {doc.notes && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                      Notes
                    </p>
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                      {doc.notes}
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="allocation" className="space-y-2 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Vehicle allocation
                </p>
                {doc.allocations.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">
                    Business-level expense — not allocated to specific vehicles.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {doc.allocations.map((a) => (
                      <div
                        key={a.vehicleId}
                        className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/50"
                      >
                        <span className="truncate">{vehicleLabel(a.vehicleId)}</span>
                        <span className="shrink-0 tabular-nums">
                          {a.sharePercent != null && (
                            <span className="mr-2 text-xs text-slate-500">
                              {a.sharePercent}%
                            </span>
                          )}
                          <span className="font-semibold">{formatMoney(a.amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="approval" className="pt-1">
                <ApprovalTimeline doc={doc} />
              </TabsContent>

              <TabsContent value="payments" className="space-y-4 pt-1">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                    Payment history ({payments.length}) — {formatMoney(paidSoFar)} paid
                  </p>
                  {payments.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">
                      No payments recorded.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {payments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800/50"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-300">
                            <Banknote className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                            <span className="truncate">
                              {p.paymentDate} · {p.paymentMethod}
                              {p.reference ? ` · ${p.reference}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatMoney(p.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {canPay && (
                  <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <p className="text-sm font-medium">Record payment</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="hub-pay-amount" className="text-xs">
                          Amount (max {formatMoney(remaining)})
                        </Label>
                        <Input
                          id="hub-pay-amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="hub-pay-date" className="text-xs">
                          Date
                        </Label>
                        <Input
                          id="hub-pay-date"
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="hub-pay-method" className="text-xs">
                          Method
                        </Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger id="hub-pay-method" className="min-h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="hub-pay-ref" className="text-xs">
                          Reference (optional)
                        </Label>
                        <Input
                          id="hub-pay-ref"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={recordPayment.isPending}
                        onClick={() => setPaymentAmount(String(remaining))}
                      >
                        Pay remaining
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        disabled={recordPayment.isPending}
                        onClick={() => void submitPayment()}
                      >
                        {recordPayment.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        )}
                        Record payment
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="audit" className="space-y-2 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Audit log
                </p>
                {audits.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">
                    No audit events for this document yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {audits.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 text-xs">
                        <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-slate-700 dark:text-slate-300">
                            <span className="font-semibold capitalize">
                              {a.action.replace(/[_.]/g, ' ')}
                            </span>
                            {a.reason ? ` — ${a.reason}` : ''}
                          </p>
                          <p className="text-slate-400">
                            {timeAgo(a.at)} · {new Date(a.at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Actions (Stitch bottom bar: void / submit / close) */}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              {can('expenses.create') && writesEnabled && doc.status === 'draft' && (
                <Button type="button" className="min-h-11" disabled={busy} onClick={() => void submitDraft()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Submit for approval
                </Button>
              )}
              {can('expenses.approve') && writesEnabled && VOIDABLE_STATUSES.includes(doc.status) && !voidMode && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 text-rose-600 hover:text-rose-700"
                  onClick={() => setVoidMode(true)}
                >
                  Void…
                </Button>
              )}
              <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
                Close
              </Button>
            </div>

            {voidMode && (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                <Label htmlFor="hub-void-reason" className="text-sm">
                  Reason for voiding (required)
                </Label>
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  Voiding is irreversible and reverses the posted ledger entry.
                </p>
                <Textarea
                  id="hub-void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => setVoidMode(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="min-h-11"
                    disabled={busy || !voidReason.trim()}
                    onClick={() => void submitVoid()}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                    Void expense
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/** Receipt / evidence area — real URLs only, image thumbnails when possible. */
function EvidenceSection({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return (
      <div className="flex aspect-[4/1] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700">
        <ReceiptText className="h-4 w-4" aria-hidden />
        No receipt or evidence attached
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
        Evidence ({urls.length})
      </p>
      <div className="space-y-2">
        {urls.map((url, i) =>
          isImageUrl(url) ? (
            <a
              key={`${url}-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
              aria-label={`Open receipt image ${i + 1} in a new tab`}
            >
              <img
                src={url}
                alt={`Receipt evidence ${i + 1}`}
                loading="lazy"
                className="max-h-56 w-full bg-slate-50 object-contain dark:bg-slate-900"
              />
              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-indigo-600 shadow-sm backdrop-blur dark:bg-slate-900/90 dark:text-indigo-400">
                <ExternalLink className="h-3 w-3" aria-hidden />
                View full receipt
              </span>
            </a>
          ) : (
            <a
              key={`${url}-${i}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-indigo-600 hover:bg-slate-50 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-slate-800/50"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{url}</span>
            </a>
          ),
        )}
      </div>
    </div>
  );
}

/** Workflow timeline from real document timestamps (Stitch approval routing rail). */
function ApprovalTimeline({ doc }: { doc: ExpenseDocument }) {
  const steps: Array<{ key: string; label: string; detail?: string; state: 'done' | 'current' | 'stopped' }> = [
    {
      key: 'created',
      label: 'Created',
      detail: `${new Date(doc.createdAt).toLocaleString()}${doc.createdBy ? ` · ${doc.createdBy}` : ''}`,
      state: 'done',
    },
  ];

  if (doc.submittedAt) {
    steps.push({
      key: 'submitted',
      label: 'Submitted for approval',
      detail: `${new Date(doc.submittedAt).toLocaleString()}${doc.submittedBy ? ` · ${doc.submittedBy}` : ''}`,
      state: 'done',
    });
  }
  if (doc.status === 'rejected') {
    steps.push({
      key: 'rejected',
      label: 'Rejected',
      detail: doc.rejectionReason,
      state: 'stopped',
    });
  } else if (doc.approvedAt) {
    steps.push({
      key: 'approved',
      label: 'Approved',
      detail: `${new Date(doc.approvedAt).toLocaleString()}${doc.approvedBy ? ` · ${doc.approvedBy}` : ''}`,
      state: 'done',
    });
  } else if (doc.status === 'submitted') {
    steps.push({ key: 'approval', label: 'Awaiting approval', state: 'current' });
  } else if (doc.status === 'draft') {
    steps.push({ key: 'submit', label: 'Not yet submitted', state: 'current' });
  }
  if (doc.postedAt) {
    steps.push({
      key: 'posted',
      label: 'Posted to ledger',
      detail: new Date(doc.postedAt).toLocaleString(),
      state: 'done',
    });
  }
  if (doc.voidedAt) {
    steps.push({
      key: 'voided',
      label: 'Voided',
      detail: `${new Date(doc.voidedAt).toLocaleString()}${doc.voidReason ? ` — ${doc.voidReason}` : ''}`,
      state: 'stopped',
    });
  } else if (doc.status === 'paid') {
    steps.push({ key: 'paid', label: 'Fully paid', state: 'done' });
  } else if (doc.status === 'partially_paid') {
    steps.push({ key: 'partial', label: 'Partially paid — balance open', state: 'current' });
  }

  return (
    <ol className="relative space-y-6 border-l-2 border-slate-200 pl-6 dark:border-slate-700">
      {steps.map((s) => (
        <li key={s.key} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute -left-[31px] top-0 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-950',
              s.state === 'done' && 'bg-emerald-500',
              s.state === 'current' && 'bg-indigo-600 animate-pulse',
              s.state === 'stopped' && 'bg-rose-500',
            )}
          >
            {s.state === 'done' && <Check className="h-2.5 w-2.5 text-white" aria-hidden />}
            {s.state === 'current' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <p
            className={cn(
              'text-sm font-medium',
              s.state === 'current'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-900 dark:text-slate-100',
            )}
          >
            {s.label}
          </p>
          {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
