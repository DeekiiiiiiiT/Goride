/**
 * Expense Hub — recurring rule detail dialog.
 * Opens from the Rules list when the rule name is clicked.
 */
import { Pencil } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { formatMoney } from '../money';
import { useExpenseHubRule } from '../../../hooks/useExpenseHub';
import { HubError, HubLoading, RuleStatusBadge } from './HubStates';
import { useVehicleOptions } from './useVehicleOptions';

function formatCadence(frequency: string) {
  return String(frequency).replace('_', '-');
}

function formatSchedule(date?: string, time?: string) {
  if (!date) return '—';
  return time ? `${date} · ${time}` : date;
}

export function ExpenseHubRuleDetail({
  ruleId,
  onClose,
  onEdit,
  canManage = false,
}: {
  ruleId: string | null;
  onClose: () => void;
  onEdit?: () => void;
  canManage?: boolean;
}) {
  const query = useExpenseHubRule(ruleId);
  const vehicleOptions = useVehicleOptions();

  const group = query.data?.group;
  const assignments = query.data?.assignments || [];

  const vehicleLabel = (id: string) =>
    vehicleOptions.data?.find((o) => o.id === id)?.label || id;

  const showEdit = Boolean(canManage && onEdit && group && group.status !== 'ended');

  return (
    <Dialog open={Boolean(ruleId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {query.isLoading ? (
          <HubLoading label="Loading rule…" />
        ) : query.isError || !group ? (
          <HubError
            message={(query.error as Error)?.message || 'Rule not found'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                {group.name}
                <RuleStatusBadge status={group.status} />
              </DialogTitle>
              <DialogDescription>
                Version {group.version}
                {group.vendorName ? ` · ${group.vendorName}` : ''} · {group.category}
                {group.permitType ? ` · ${group.permitType}` : ''}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-slate-50 p-4 text-sm dark:bg-slate-900 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Cadence</dt>
                <dd className="mt-0.5 font-medium capitalize">{formatCadence(group.frequency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Amount / vehicle</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(group.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Auto-renew</dt>
                <dd className="mt-0.5 font-medium">{group.autoRenew ? 'On' : 'Off'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Starts</dt>
                <dd className="mt-0.5 font-medium">
                  {formatSchedule(group.startDate, group.startTime)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ends</dt>
                <dd className="mt-0.5 font-medium">
                  {formatSchedule(group.endDate, group.endTime)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Timezone</dt>
                <dd className="mt-0.5 font-medium">{group.timeZone || '—'}</dd>
              </div>
            </dl>

            {group.description ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{group.description}</p>
            ) : null}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
                Assigned vehicles ({assignments.length})
              </h3>
              {assignments.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-slate-500">
                  No vehicles assigned to this rule.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-900">
                        <TableHead>Vehicle</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden sm:table-cell">Coverage</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((a) => {
                        const amount = a.amountOverride ?? group.amount;
                        const start = a.startDateOverride || group.startDate;
                        const end = a.endDateOverride || group.endDate;
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="max-w-48">
                              <p className="truncate font-medium">{vehicleLabel(a.vehicleId)}</p>
                              {a.validityYears ? (
                                <p className="text-xs text-slate-400">{a.validityYears}-year fitness</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatMoney(amount)}
                              {a.amountOverride != null ? (
                                <span className="ml-1 text-xs font-normal text-slate-400">
                                  override
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="hidden text-xs text-slate-500 sm:table-cell">
                              {start}
                              {end ? ` → ${end}` : ''}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  a.isActive
                                    ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }
                              >
                                {a.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {showEdit ? (
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-11" onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden />
                  Edit rule
                </Button>
              </DialogFooter>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
