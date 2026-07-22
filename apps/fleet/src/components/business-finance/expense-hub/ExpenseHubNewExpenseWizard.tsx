import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  Receipt,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
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
import { Textarea } from '../../ui/textarea';
import { formatMoney, round2 } from '../money';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  useCreateExpenseDocument,
  useExpenseHubCategories,
  useExpenseHubVendors,
  useRequestExpenseVendor,
} from '../../../hooks/useExpenseHub';
import { VehicleMultiSelect } from './VehicleMultiSelect';
import { useVehicleOptions } from './useVehicleOptions';

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Credit Card', 'Digital Wallet', 'Check', 'Other'];

function evenSplit(total: number, ids: string[]): Record<string, string> {
  if (!ids.length || !Number.isFinite(total) || total <= 0) return {};
  const share = round2(total / ids.length);
  const values: Record<string, string> = {};
  let allocated = 0;
  ids.forEach((id, index) => {
    const amount = index === ids.length - 1 ? round2(total - allocated) : share;
    allocated = round2(allocated + amount);
    values[id] = amount.toFixed(2);
  });
  return values;
}

export function ExpenseHubNewExpenseWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const { can } = usePermissions();
  const createDoc = useCreateExpenseDocument();
  const requestVendor = useRequestExpenseVendor();
  const vendorsQuery = useExpenseHubVendors();
  const categoriesQuery = useExpenseHubCategories();
  const vehicleOptions = useVehicleOptions();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('Insurance');
  const [vendorId, setVendorId] = React.useState('none');
  const [requestVendorOpen, setRequestVendorOpen] = React.useState(false);
  const [requestVendorName, setRequestVendorName] = React.useState('');
  const [incurredDate, setIncurredDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState('');
  const [grossAmount, setGrossAmount] = React.useState('');
  const [taxAmount, setTaxAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('Bank Transfer');
  const [evidenceUrlsText, setEvidenceUrlsText] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [allocationMode, setAllocationMode] = React.useState<'full' | 'split'>('full');
  const [vehicleIds, setVehicleIds] = React.useState<string[]>([]);
  const [allocationAmounts, setAllocationAmounts] = React.useState<Record<string, string>>({});

  const gross = Number(grossAmount || 0);
  const tax = Number(taxAmount || 0);
  const net = round2(gross - tax);
  const evidenceUrls = evidenceUrlsText.split('\n').map((url) => url.trim()).filter(Boolean);
  const selectedVendor = (vendorsQuery.data?.items || []).find((vendor) => vendor.id === vendorId);
  const detailsValid = description.trim().length > 0 && gross > 0 && tax >= 0 && net > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(incurredDate);
  const allocationSum = round2(vehicleIds.reduce(
    (sum, id) => sum + Number(allocationAmounts[id] || 0),
    0,
  ));
  const allocationOk = vehicleIds.length === 0 || Math.abs(allocationSum - net) <= 0.01;

  const reset = () => {
    setStep(1);
    setDescription('');
    setCategory('Insurance');
    setVendorId('none');
    setIncurredDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setGrossAmount('');
    setTaxAmount('');
    setPaymentMethod('Bank Transfer');
    setEvidenceUrlsText('');
    setNotes('');
    setAllocationMode('full');
    setVehicleIds([]);
    setAllocationAmounts({});
  };

  const selectVehicles = (ids: string[]) => {
    const selected = allocationMode === 'full' ? ids.slice(-1) : ids;
    setVehicleIds(selected);
    setAllocationAmounts(evenSplit(net, selected));
  };

  const changeMode = (mode: 'full' | 'split') => {
    setAllocationMode(mode);
    const selected = mode === 'full' ? vehicleIds.slice(0, 1) : vehicleIds;
    setVehicleIds(selected);
    setAllocationAmounts(evenSplit(net, selected));
  };

  const save = async (mode: 'draft' | 'submit' | 'paidNow') => {
    if (!detailsValid || !allocationOk) {
      toast.error(!detailsValid
        ? 'Complete the required expense details.'
        : `Allocations must equal ${formatMoney(net)}.`);
      return;
    }
    try {
      await createDoc.mutateAsync({
        description: description.trim(),
        category,
        vendorId: selectedVendor?.id,
        vendorName: selectedVendor?.name,
        incurredDate,
        dueDate: dueDate || undefined,
        currency: 'JMD',
        grossAmount: gross,
        taxAmount: tax,
        netAmount: net,
        allocations: vehicleIds.map((vehicleId) => ({
          vehicleId,
          amount: Number(allocationAmounts[vehicleId] || 0),
        })),
        paymentMethod,
        evidenceUrls,
        notes: notes.trim() || undefined,
        submit: mode === 'submit',
        paidNow: mode === 'paidNow',
      });
      toast.success(mode === 'draft' ? 'Expense saved as draft' :
        mode === 'submit' ? 'Expense submitted for approval' : 'Expense created and paid');
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      console.error('[ExpenseHubNewExpenseWizard] create failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create expense');
    }
  };

  const saving = createDoc.isPending;
  const vehicleLabel = (id: string) =>
    vehicleOptions.data?.find((vehicle) => vehicle.id === id)?.label || id;

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[96vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-slate-50 px-5 py-4 text-left dark:bg-slate-950 sm:px-6">
          <DialogTitle className="pr-8 text-xl">New expense</DialogTitle>
          <DialogDescription>
            Capture the transaction, allocate its cost, then choose how to post it.
          </DialogDescription>
          <ol className="grid grid-cols-2 gap-2 pt-3" aria-label="Expense creation progress">
            {[
              { id: 1, label: 'Expense details' },
              { id: 2, label: 'Allocate & review' },
            ].map((item) => (
              <li
                key={item.id}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                  step === item.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-slate-200 text-slate-500 dark:border-slate-800'
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-current/10">
                  {step > item.id ? <Check className="h-4 w-4" /> : item.id}
                </span>
                <span className="truncate">{item.label}</span>
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="max-h-[calc(96vh-182px)] overflow-y-auto">
          {step === 1 ? (
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.72fr)]">
              <section className="space-y-5" aria-labelledby="expense-details-heading">
                <div>
                  <h3 id="expense-details-heading" className="text-base font-semibold">Transaction details</h3>
                  <p className="text-sm text-slate-500">Required fields are marked with an asterisk.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-exp-description">Description *</Label>
                  <Input id="hub-exp-description" value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What was this expense for?" className="h-11" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-vendor">Vendor</Label>
                    <Select value={vendorId} onValueChange={setVendorId}>
                      <SelectTrigger id="hub-exp-vendor" className="min-h-11">
                        <SelectValue placeholder={vendorsQuery.isLoading ? 'Loading vendors…' : 'No vendor'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vendor</SelectItem>
                        {(vendorsQuery.data?.items || []).map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                            {vendor.status === 'pending' ? ' (Pending Roam approval)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {can('expenses.create') && (
                      <button
                        type="button"
                        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        onClick={() => setRequestVendorOpen(true)}
                      >
                        Can&apos;t find them? Request a new Jamaica vendor
                      </button>
                    )}
                    {vendorsQuery.isError && <p className="text-xs text-rose-600">Vendors could not be loaded.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-category">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="hub-exp-category" className="min-h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(categoriesQuery.data?.items || []).map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-incurred">Transaction date *</Label>
                    <Input id="hub-exp-incurred" type="date" value={incurredDate}
                      onChange={(event) => setIncurredDate(event.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-due">Due date</Label>
                    <Input id="hub-exp-due" type="date" value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)} className="h-11" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-gross">Amount (JMD) *</Label>
                    <Input id="hub-exp-gross" type="number" min="0.01" step="0.01"
                      value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)}
                      className="h-11 text-right tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hub-exp-tax">Tax</Label>
                    <Input id="hub-exp-tax" type="number" min="0" step="0.01"
                      value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)}
                      className="h-11 text-right tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label>Net amount</Label>
                    <div className="flex h-11 items-center justify-end rounded-md border bg-slate-50 px-3 font-semibold tabular-nums dark:bg-slate-900">
                      {net > 0 ? formatMoney(net) : '—'}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-exp-method">Payment method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="hub-exp-method" className="min-h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-exp-notes">Internal notes</Label>
                  <Textarea id="hub-exp-notes" value={notes}
                    onChange={(event) => setNotes(event.target.value)} rows={3}
                    placeholder="Optional context for approvers" />
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950">
                      <Receipt className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold">Receipt & evidence</h3>
                      <p className="text-xs text-slate-500">Link receipts already stored in your approved document system.</p>
                    </div>
                  </div>
                  <Label htmlFor="hub-exp-evidence" className="sr-only">Evidence URLs</Label>
                  <Textarea id="hub-exp-evidence" value={evidenceUrlsText}
                    onChange={(event) => setEvidenceUrlsText(event.target.value)}
                    placeholder={'Paste one secure receipt URL per line\nhttps://…'} rows={5} />
                  {evidenceUrls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {evidenceUrls.map((url) => (
                        <div key={url} className="flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 text-xs dark:bg-slate-950">
                          <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate">{url}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border bg-white p-4 dark:bg-slate-950">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4 text-slate-500" /> Draft protection
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Save now without submitting. You can complete allocation and evidence later.
                  </p>
                </div>
              </aside>
            </div>
          ) : (
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.65fr)]">
              <section className="space-y-5">
                <div>
                  <h3 className="text-base font-semibold">Allocation details</h3>
                  <p className="text-sm text-slate-500">Leave vehicles empty for a business-level expense.</p>
                </div>
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-900" role="group" aria-label="Allocation mode">
                  {(['full', 'split'] as const).map((mode) => (
                    <Button key={mode} type="button" variant={allocationMode === mode ? 'default' : 'ghost'}
                      className="min-h-11 capitalize" onClick={() => changeMode(mode)}>
                      {mode === 'full' ? 'Full allocation' : 'Split allocation'}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>{allocationMode === 'full' ? 'Vehicle asset' : 'Vehicle assets'}</Label>
                  <VehicleMultiSelect selectedIds={vehicleIds} onChange={selectVehicles} />
                </div>
                {vehicleIds.length > 0 && (
                  <div className="overflow-hidden rounded-xl border">
                    <div className="grid grid-cols-[1fr_9rem] bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                      <span>Vehicle</span><span className="text-right">Amount</span>
                    </div>
                    {vehicleIds.map((id) => (
                      <div key={id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 border-t px-4">
                        <span className="truncate text-sm font-medium">{vehicleLabel(id)}</span>
                        <Input aria-label={`Allocation for ${vehicleLabel(id)}`} type="number" min="0" step="0.01"
                          disabled={allocationMode === 'full'} value={allocationAmounts[id] || ''}
                          onChange={(event) => setAllocationAmounts((current) => ({ ...current, [id]: event.target.value }))}
                          className="h-11 text-right tabular-nums" />
                      </div>
                    ))}
                  </div>
                )}
                <div className={`rounded-xl border p-4 ${allocationOk
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                  : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20'}`}
                  role="status" aria-live="polite">
                  <div className="flex items-center gap-2 font-semibold">
                    {allocationOk ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ShieldCheck className="h-5 w-5 text-rose-600" />}
                    {allocationOk ? 'Allocation balance verified' : 'Allocation needs attention'}
                  </div>
                  <div className="mt-2 flex justify-between text-sm tabular-nums">
                    <span>Total allocated</span><span>{formatMoney(allocationSum)} / {formatMoney(net)}</span>
                  </div>
                </div>
              </section>

              <aside className="space-y-4">
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expense summary</p>
                  <h3 className="mt-2 font-semibold">{description}</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Vendor</dt><dd className="text-right">{selectedVendor?.name || 'No vendor'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Date</dt><dd>{incurredDate}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Category</dt><dd>{category}</dd></div>
                    <div className="flex justify-between gap-3 border-t pt-3 text-base font-bold"><dt>Total</dt><dd>{formatMoney(net)}</dd></div>
                  </dl>
                  {evidenceUrls.length > 0 && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
                      <Receipt className="h-4 w-4" /> {evidenceUrls.length} evidence item{evidenceUrls.length === 1 ? '' : 's'} attached
                    </p>
                  )}
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval routing</p>
                  <div className="mt-4 space-y-4">
                    <div className="flex gap-3">
                      <span className="rounded-full bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950"><ShieldCheck className="h-4 w-4" /></span>
                      <div><p className="text-sm font-medium">Approval queue</p><p className="text-xs text-slate-500">{can('expenses.approve') ? 'You have approval permission' : 'Reviewer with expense approval permission'}</p></div>
                    </div>
                    <div className="flex gap-3">
                      <span className="rounded-full bg-slate-100 p-2 text-slate-700 dark:bg-slate-900"><WalletCards className="h-4 w-4" /></span>
                      <div><p className="text-sm font-medium">Payment</p><p className="text-xs text-slate-500">{can('expenses.pay') ? 'You can mark this paid now' : 'Handled by a user with payment permission'}</p></div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-white px-5 py-4 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button type="button" variant="ghost" className="min-h-11"
            disabled={saving} onClick={() => step === 1 ? onOpenChange(false) : setStep(1)}>
            {step === 2 && <ArrowLeft className="mr-2 h-4 w-4" />}{step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" disabled={saving || !detailsValid}
              onClick={() => void save('draft')}>Save draft</Button>
            {step === 1 ? (
              <Button type="button" className="min-h-11" disabled={!detailsValid} onClick={() => setStep(2)}>
                Continue to allocation <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <>
                <Button type="button" className="min-h-11" disabled={saving || !allocationOk}
                  onClick={() => void save('submit')}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit for approval
                </Button>
                {can('expenses.pay') && (
                  <Button type="button" variant="secondary" className="min-h-11"
                    disabled={saving || !allocationOk} onClick={() => void save('paidNow')}>
                    Save & mark paid
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={requestVendorOpen} onOpenChange={setRequestVendorOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Jamaica vendor</DialogTitle>
          <DialogDescription>
            Roam reviews this for the shared catalog. You can still log this expense with a Pending vendor meanwhile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="request-vendor-name">Company name</Label>
          <Input
            id="request-vendor-name"
            value={requestVendorName}
            onChange={(e) => setRequestVendorName(e.target.value)}
            placeholder="e.g. Digicel"
            className="h-11"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => setRequestVendorOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!requestVendorName.trim() || requestVendor.isPending}
            onClick={() => {
              void requestVendor
                .mutateAsync({ name: requestVendorName.trim() })
                .then((res) => {
                  setVendorId(res.data.id);
                  setRequestVendorOpen(false);
                  setRequestVendorName('');
                  toast.success(
                    res.data.status === 'pending'
                      ? 'Vendor requested — pending Roam approval'
                      : 'Vendor already in catalog',
                  );
                })
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'Request failed');
                });
            }}
          >
            {requestVendor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit request'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
