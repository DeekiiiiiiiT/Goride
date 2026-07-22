import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  Loader2,
  Repeat2,
  Truck,
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
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { formatMoney } from '../money';
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from '../../../types/expenses';
import type { ExpenseBulkPreview, ExpensePermitType } from '../../../types/expenseHub';
import { useCreateExpenseRule, useExpenseHubVendors } from '../../../hooks/useExpenseHub';
import { expenseHubService } from '../../../services/expenseHubService';
import { useFleetTimezone } from '../../../utils/timezoneDisplay';
import type { FitnessTierId } from '../../../utils/jamaicaFitnessMatrix';
import { VehicleMultiSelect } from './VehicleMultiSelect';
import { FitnessBucketAssign, type FitnessVehiclePlan } from './FitnessBucketAssign';

/** Keeps native date/time picker icons visible and clickable inside tight grids. */
const DATE_TIME_INPUT_CLASS =
  'relative h-11 w-full min-w-0 pr-9 ' +
  '[&::-webkit-calendar-picker-indicator]:absolute ' +
  '[&::-webkit-calendar-picker-indicator]:right-2.5 ' +
  '[&::-webkit-calendar-picker-indicator]:top-1/2 ' +
  '[&::-webkit-calendar-picker-indicator]:h-5 ' +
  '[&::-webkit-calendar-picker-indicator]:w-5 ' +
  '[&::-webkit-calendar-picker-indicator]:-translate-y-1/2 ' +
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer ' +
  '[&::-webkit-calendar-picker-indicator]:opacity-100';

export function ExpenseHubRuleBuilder({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const createRule = useCreateExpenseRule();
  const vendorsQuery = useExpenseHubVendors();
  const fleetTimeZone = useFleetTimezone();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('Insurance');
  const [permitType, setPermitType] = React.useState<ExpensePermitType>('other');
  const [vendorId, setVendorId] = React.useState('none');
  const [amount, setAmount] = React.useState('');
  const [frequency, setFrequency] = React.useState('monthly');
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState('00:00');
  const [endDate, setEndDate] = React.useState('');
  const [endTime, setEndTime] = React.useState('23:59');
  const [autoRenew, setAutoRenew] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [vehicleIds, setVehicleIds] = React.useState<string[]>([]);
  const [fitnessPlans, setFitnessPlans] = React.useState<FitnessVehiclePlan[]>([]);
  const [tierOverrides, setTierOverrides] = React.useState<Record<string, FitnessTierId>>({});
  const [preview, setPreview] = React.useState<ExpenseBulkPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [previewError, setPreviewError] = React.useState('');

  const isFitness = category === 'Permits' && permitType === 'fitness';
  const amountNum = Number(amount);
  const timesRequired = category !== 'Security' && !isFitness;
  const startTimeOk = !startTime || /^\d{2}:\d{2}$/.test(startTime);
  const endTimeOk = !endTime || /^\d{2}:\d{2}$/.test(endTime);
  const timeValid = timesRequired
    ? /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime)
    : startTimeOk && endTimeOk;
  const effectiveStartTime = /^\d{2}:\d{2}$/.test(startTime) ? startTime : '00:00';
  const effectiveEndTime = /^\d{2}:\d{2}$/.test(endTime) ? endTime : '23:59';
  const boundaryValid =
    isFitness ||
    !endDate ||
    endDate > startDate ||
    (endDate === startDate && effectiveEndTime > effectiveStartTime);
  const detailsValid = isFitness
    ? name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && timeValid
    : name.trim().length > 0 &&
      amountNum > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      timeValid &&
      boundaryValid;
  const valid = detailsValid && vehicleIds.length > 0;
  const categoryVendors = React.useMemo(
    () =>
      (vendorsQuery.data?.items || [])
        .filter((vendor) => vendor.categoryDefault === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [category, vendorsQuery.data?.items],
  );
  const selectedVendor = categoryVendors.find((vendor) => vendor.id === vendorId);

  const fitnessGroupAmount = React.useMemo(() => {
    if (!isFitness || fitnessPlans.length === 0) return 4500;
    const counts = new Map<number, number>();
    for (const p of fitnessPlans) {
      counts.set(p.tier.fee, (counts.get(p.tier.fee) || 0) + 1);
    }
    let best = 4500;
    let bestN = 0;
    for (const [fee, n] of counts) {
      if (n > bestN) {
        best = fee;
        bestN = n;
      }
    }
    return best;
  }, [isFitness, fitnessPlans]);

  const handlePlansChange = React.useCallback((plans: FitnessVehiclePlan[]) => {
    setFitnessPlans(plans);
  }, []);

  React.useEffect(() => {
    if (vendorId !== 'none' && !categoryVendors.some((vendor) => vendor.id === vendorId)) {
      setVendorId('none');
    }
  }, [categoryVendors, vendorId]);

  React.useEffect(() => {
    if (category !== 'Permits') setPermitType('other');
  }, [category]);

  React.useEffect(() => {
    if (isFitness) {
      setAutoRenew(true);
      setFrequency('annually');
      // Prefer Island Traffic Authority when present
      const ita = categoryVendors.find((v) =>
        /island\s*traffic|ita/i.test(v.name),
      );
      if (ita) setVendorId(ita.id);
    }
  }, [isFitness, categoryVendors]);

  const reset = () => {
    setStep(1);
    setName('');
    setCategory('Insurance');
    setPermitType('other');
    setVendorId('none');
    setAmount('');
    setFrequency('monthly');
    setStartDate(new Date().toISOString().slice(0, 10));
    setStartTime('00:00');
    setEndDate('');
    setEndTime('23:59');
    setAutoRenew(false);
    setDescription('');
    setVehicleIds([]);
    setFitnessPlans([]);
    setTierOverrides({});
    setPreview(null);
    setPreviewError('');
  };

  React.useEffect(() => {
    setPreview(null);
    setPreviewError('');
  }, [amount, frequency, vehicleIds, startDate, startTime, endDate, endTime, fitnessPlans, isFitness]);

  const runPreview = async () => {
    if (!valid) {
      toast.error('Complete the rule and select at least one vehicle.');
      return;
    }
    setPreviewing(true);
    setPreviewError('');
    try {
      if (isFitness) {
        const overrides = fitnessPlans
          .filter((p) => vehicleIds.includes(p.vehicleId))
          .map((p) => p.override);
        setPreview(
          await expenseHubService.previewRule({
            amount: fitnessGroupAmount,
            frequency: 'annually',
            vehicleIds,
            startDate,
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            timeZone: fleetTimeZone,
            permitType: 'fitness',
            overrides,
          }),
        );
      } else {
        setPreview(
          await expenseHubService.previewRule({
            amount: amountNum,
            frequency,
            vehicleIds,
            startDate,
            startTime: effectiveStartTime,
            endDate: endDate || undefined,
            endTime: effectiveEndTime,
            timeZone: fleetTimeZone,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      setPreviewError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  const submit = async () => {
    if (!valid || !preview) return;
    try {
      const result = await createRule.mutateAsync(
        isFitness
          ? {
              name: name.trim(),
              category,
              permitType: 'fitness',
              vendorId: selectedVendor?.id,
              vendorName: selectedVendor?.name,
              amount: fitnessGroupAmount,
              currency: 'JMD',
              frequency: 'annually',
              startDate,
              startTime: effectiveStartTime,
              endTime: effectiveEndTime,
              timeZone: fleetTimeZone,
              autoRenew,
              description: description.trim() || undefined,
              vehicleIds: preview.includedVehicleIds,
              overrides: fitnessPlans
                .filter((p) => preview.includedVehicleIds.includes(p.vehicleId))
                .map((p) => p.override),
            }
          : {
              name: name.trim(),
              category,
              permitType: category === 'Permits' ? permitType : undefined,
              vendorId: selectedVendor?.id,
              vendorName: selectedVendor?.name,
              amount: amountNum,
              currency: 'JMD',
              frequency,
              startDate,
              startTime: effectiveStartTime,
              endDate: endDate || undefined,
              endTime: effectiveEndTime,
              timeZone: fleetTimeZone,
              autoRenew,
              description: description.trim() || undefined,
              vehicleIds: preview.includedVehicleIds,
            },
      );
      toast.success(
        `Rule created for ${result.assignments.length} vehicle${result.assignments.length === 1 ? '' : 's'}`,
      );
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create rule');
    }
  };

  const saving = createRule.isPending;
  const close = () => {
    if (!saving) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[96vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b bg-slate-50 px-5 py-4 text-left dark:bg-slate-950 sm:px-6">
          <DialogTitle className="pr-8 text-xl">Create recurring rule</DialogTitle>
          <DialogDescription>
            {isFitness
              ? 'Jamaica Fitness: fees and validity come from vehicle class and the official matrix.'
              : 'Configure the cadence, assign vehicles, and verify the server forecast.'}
          </DialogDescription>
          <ol className="grid grid-cols-2 gap-2 pt-3" aria-label="Rule creation progress">
            {[
              { id: 1, label: 'Rule details' },
              { id: 2, label: isFitness ? 'Fitness buckets' : 'Assign vehicles' },
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
                {item.label}
              </li>
            ))}
          </ol>
        </DialogHeader>

        <div className="max-h-[calc(96vh-182px)] overflow-y-auto">
          {step === 1 ? (
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <section className="space-y-5">
                <div>
                  <h3 className="font-semibold">Rule details</h3>
                  <p className="text-sm text-slate-500">
                    {isFitness
                      ? 'Name the Fitness program. Amount and renewal length are set per vehicle in the next step.'
                      : 'Set the recurring expense applied to each selected vehicle.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-rule-name">Rule name *</Label>
                  <Input
                    id="hub-rule-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={isFitness ? 'e.g. Fleet Fitness' : 'e.g. Annual fleet insurance'}
                    className="h-11"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hub-rule-category">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="hub-rule-category" className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hub-rule-vendor">Vendor</Label>
                    <Select value={vendorId} onValueChange={setVendorId}>
                      <SelectTrigger id="hub-rule-vendor" className="min-h-11">
                        <SelectValue
                          placeholder={vendorsQuery.isLoading ? 'Loading vendors…' : 'No vendor'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vendor</SelectItem>
                        {categoryVendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {vendorsQuery.isError && (
                      <p className="text-xs text-rose-600">Vendors could not be loaded.</p>
                    )}
                    {!vendorsQuery.isLoading &&
                      !vendorsQuery.isError &&
                      categoryVendors.length === 0 && (
                        <p className="text-xs text-slate-500">
                          No vendors are assigned to {category} yet.
                        </p>
                      )}
                  </div>
                </div>

                {category === 'Permits' && (
                  <div className="space-y-2">
                    <Label htmlFor="hub-rule-permit-type">Permit type *</Label>
                    <Select
                      value={permitType}
                      onValueChange={(v) => setPermitType(v as ExpensePermitType)}
                    >
                      <SelectTrigger id="hub-rule-permit-type" className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fitness">Fitness (Jamaica matrix)</SelectItem>
                        <SelectItem value="registration">Registration</SelectItem>
                        <SelectItem value="other">Other permit / licence</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {!isFitness && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hub-rule-amount">Amount per vehicle (JMD) *</Label>
                      <Input
                        id="hub-rule-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="h-11 text-right tabular-nums"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hub-rule-frequency">Cadence *</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger id="hub-rule-frequency" className="min-h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_FREQUENCIES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {isFitness && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                    Fee and validity (1 / 3 / 5 years) are applied from the Jamaica Fitness table
                    when you assign vehicles. Set usage category and plate class on each vehicle
                    for automatic bucketing.
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-[minmax(0,1.35fr)_minmax(7.5rem,1fr)]">
                    <legend className="sr-only">Coverage start</legend>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="hub-rule-start">Start date *</Label>
                      <Input
                        id="hub-rule-start"
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        className={DATE_TIME_INPUT_CLASS}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="hub-rule-start-time">
                        Start time{timesRequired ? ' *' : ''}
                      </Label>
                      <Input
                        id="hub-rule-start-time"
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className={DATE_TIME_INPUT_CLASS}
                      />
                    </div>
                  </fieldset>
                  {!isFitness && (
                    <fieldset className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-[minmax(0,1.35fr)_minmax(7.5rem,1fr)]">
                      <legend className="sr-only">Coverage end</legend>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="hub-rule-end">End date</Label>
                        <Input
                          id="hub-rule-end"
                          type="date"
                          min={startDate}
                          value={endDate}
                          onChange={(event) => setEndDate(event.target.value)}
                          className={DATE_TIME_INPUT_CLASS}
                        />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="hub-rule-end-time">
                          End time{timesRequired ? ' *' : ''}
                        </Label>
                        <Input
                          id="hub-rule-end-time"
                          type="time"
                          value={endTime}
                          onChange={(event) => setEndTime(event.target.value)}
                          className={DATE_TIME_INPUT_CLASS}
                        />
                      </div>
                    </fieldset>
                  )}
                </div>
                {!boundaryValid && !isFitness && (
                  <p className="text-xs text-rose-600">
                    Coverage must end after its start date and time.
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Times use the fleet timezone: {fleetTimeZone}.
                  {!timesRequired &&
                    !isFitness &&
                    ' Optional for Security — blank times default to start of day / end of day.'}
                  {isFitness &&
                    ' Each vehicle gets its own end date from the fitness validity period.'}
                </p>
                <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border px-4">
                  <span>
                    <span className="block text-sm font-medium">Auto-renew</span>
                    <span className="block text-xs text-slate-500">
                      {isFitness
                        ? 'Renew the certificate when validity ends.'
                        : 'Continue when no end date is set.'}
                    </span>
                  </span>
                  <Switch
                    aria-label="Auto-renew rule"
                    checked={autoRenew}
                    onCheckedChange={setAutoRenew}
                  />
                </label>
                <div className="space-y-2">
                  <Label htmlFor="hub-rule-description">Internal description</Label>
                  <Textarea
                    id="hub-rule-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Optional context for finance teams"
                    rows={3}
                  />
                </div>
              </section>
              <aside className="rounded-xl border bg-slate-50 p-5 dark:bg-slate-900/50">
                <Repeat2 className="h-7 w-7 text-indigo-600" />
                <h3 className="mt-4 font-semibold">
                  {isFitness ? 'One Fitness program' : 'One rule, many vehicles'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {isFitness
                    ? 'Private, commercial, PPV and trailer vehicles get the correct fee and 1 / 3 / 5 year validity from the Jamaica matrix.'
                    : 'Every eligible assignment receives the amount and cadence configured here. The server preview checks the final selection before creation.'}
                </p>
                {!isFitness && amountNum > 0 && (
                  <div className="mt-5 rounded-lg bg-white p-4 dark:bg-slate-950">
                    <p className="text-xs text-slate-500">Per vehicle</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{formatMoney(amountNum)}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {frequency.replace('_', '-')}
                    </p>
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section className="space-y-4">
                <div>
                  <h3 className="font-semibold">
                    {isFitness ? 'Fitness buckets' : 'Vehicle assignment'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {isFitness
                      ? 'Review auto-classified tiers, fix unknowns, then include the vehicles you want.'
                      : 'Search the live fleet list and assign this rule in bulk.'}
                  </p>
                </div>
                {isFitness ? (
                  <FitnessBucketAssign
                    ruleStartDate={startDate}
                    startTime={effectiveStartTime}
                    endTime={effectiveEndTime}
                    selectedIds={vehicleIds}
                    onChangeSelected={setVehicleIds}
                    tierOverrides={tierOverrides}
                    onTierOverride={(id, tierId) => {
                      setTierOverrides((prev) => {
                        const next = { ...prev };
                        if (tierId === 'none') delete next[id];
                        else next[id] = tierId;
                        return next;
                      });
                      if (tierId !== 'none' && !vehicleIds.includes(id)) {
                        setVehicleIds((ids) => [...ids, id]);
                      }
                    }}
                    onPlansChange={handlePlansChange}
                  />
                ) : (
                  <VehicleMultiSelect selectedIds={vehicleIds} onChange={setVehicleIds} />
                )}
              </section>
              <aside className="space-y-4">
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assignment summary
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950">
                      <Truck className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{vehicleIds.length}</p>
                      <p className="text-xs text-slate-500">vehicles selected</p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-2 border-t pt-4 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Rule</dt>
                      <dd className="truncate font-medium">{name}</dd>
                    </div>
                    {isFitness ? (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Program fee base</dt>
                          <dd className="font-medium tabular-nums">
                            {formatMoney(fitnessGroupAmount)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Cadence</dt>
                          <dd>Per certificate</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Per vehicle</dt>
                          <dd className="font-medium tabular-nums">{formatMoney(amountNum)}</dd>
                        </div>
                        <div className="flex justify-between capitalize">
                          <dt className="text-slate-500">Cadence</dt>
                          <dd>{frequency.replace('_', '-')}</dd>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Effective</dt>
                      <dd className="text-right">
                        {startDate} {effectiveStartTime}
                      </dd>
                    </div>
                    {!isFitness && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Expires</dt>
                        <dd className="text-right">
                          {endDate ? `${endDate} ${effectiveEndTime}` : 'No end date'}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <Calculator className="h-4 w-4 text-indigo-600" />
                    Server preview
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Required before creating the rule.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 min-h-11 w-full"
                    disabled={!valid || previewing || saving}
                    onClick={() => void runPreview()}
                  >
                    {previewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {preview ? 'Refresh preview' : 'Preview impact'}
                  </Button>
                  {previewError && (
                    <p role="alert" className="mt-3 text-xs text-rose-600">
                      {previewError}
                    </p>
                  )}
                  {preview && (
                    <div className="mt-4 space-y-3" aria-live="polite">
                      <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> Preview verified
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                          <p className="text-lg font-bold">{preview.includedVehicleIds.length}</p>
                          <p className="text-[11px] text-slate-500">Included</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                          <p className="text-lg font-bold">{preview.excludedVehicleIds.length}</p>
                          <p className="text-[11px] text-slate-500">Excluded</p>
                        </div>
                      </div>
                      <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/30">
                        <p className="text-xs text-slate-500">Projected annual total</p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {formatMoney(preview.projectedAnnualTotal)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {Math.round(preview.estimatedOccurrenceCount * 10) / 10} estimated
                          occurrence
                          {preview.estimatedOccurrenceCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-white px-5 py-4 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={saving}
            onClick={() => (step === 1 ? close() : setStep(1))}
          >
            {step === 2 && <ArrowLeft className="mr-2 h-4 w-4" />}
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step === 1 ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={!detailsValid}
              onClick={() => setStep(2)}
            >
              {isFitness ? 'Review buckets' : 'Assign vehicles'}{' '}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              disabled={saving || !preview}
              onClick={() => void submit()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create rule
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
