import React from 'react';
import {
  CalendarClock,
  Loader2,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { formatMoney } from '../money';
import { EXPENSE_FREQUENCIES } from '../../../types/expenses';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  useBulkExpenseRuleAction,
  useExpenseHubRules,
  useExpenseHubVendors,
  useUpdateExpenseRule,
} from '../../../hooks/useExpenseHub';
import { HubEmpty, HubError, HubLoading, RuleStatusBadge } from './HubStates';
import { ExpenseHubRuleBuilder } from './ExpenseHubRuleBuilder';
import { ExpenseHubRuleDetail } from './ExpenseHubRuleDetail';

type RuleItem = NonNullable<ReturnType<typeof useExpenseHubRules>['data']>['items'][number];

function RuleActions({
  rule,
  busy,
  onEdit,
  onAction,
}: {
  rule: RuleItem;
  busy: boolean;
  onEdit: () => void;
  onAction: (action: 'pause' | 'resume' | 'end') => void;
}) {
  if (busy) {
    return <Loader2 className="ml-auto h-5 w-5 animate-spin text-slate-400" aria-label="Updating rule" />;
  }

  const canPause = rule.status === 'active';
  const canResume = rule.status === 'paused';
  const canEnd = rule.status !== 'ended';
  const canEdit = rule.status !== 'ended';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label={`Actions for ${rule.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10.5rem]">
        {canEdit && (
          <DropdownMenuItem className="min-h-11 cursor-pointer gap-2" onSelect={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </DropdownMenuItem>
        )}
        {canPause && (
          <DropdownMenuItem
            className="min-h-11 cursor-pointer gap-2"
            onSelect={() => onAction('pause')}
          >
            <Pause className="h-4 w-4" aria-hidden />
            Pause
          </DropdownMenuItem>
        )}
        {canResume && (
          <DropdownMenuItem
            className="min-h-11 cursor-pointer gap-2"
            onSelect={() => onAction('resume')}
          >
            <Play className="h-4 w-4" aria-hidden />
            Resume
          </DropdownMenuItem>
        )}
        {canEdit && canEnd && <DropdownMenuSeparator />}
        {canEnd && (
          <DropdownMenuItem
            className="min-h-11 cursor-pointer gap-2 text-rose-600 focus:text-rose-700"
            onSelect={() => onAction('end')}
          >
            <Square className="h-4 w-4" aria-hidden />
            End rule
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RuleEditDialog({
  rule,
  open,
  onOpenChange,
  onSaved,
}: {
  rule: RuleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const updateRule = useUpdateExpenseRule();
  const vendorsQuery = useExpenseHubVendors();
  const [name, setName] = React.useState('');
  const [vendorId, setVendorId] = React.useState('none');
  const [amount, setAmount] = React.useState('');
  const [frequency, setFrequency] = React.useState('monthly');
  const [autoRenew, setAutoRenew] = React.useState(false);
  const [description, setDescription] = React.useState('');

  const isFitness = rule?.permitType === 'fitness';

  React.useEffect(() => {
    if (!rule || !open) return;
    setName(rule.name || '');
    setVendorId(rule.vendorId || 'none');
    setAmount(String(rule.amount ?? ''));
    setFrequency(String(rule.frequency || 'monthly'));
    setAutoRenew(Boolean(rule.autoRenew));
    setDescription(rule.description || '');
  }, [rule, open]);

  const categoryVendors = React.useMemo(
    () =>
      (vendorsQuery.data?.items || [])
        .filter((v) => !rule?.category || v.categoryDefault === rule.category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [vendorsQuery.data?.items, rule?.category],
  );

  const save = async () => {
    if (!rule) return;
    if (!name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    const amountNum = Number(amount);
    if (!isFitness && !(amountNum > 0)) {
      toast.error('Amount must be greater than zero');
      return;
    }
    const selected = categoryVendors.find((v) => v.id === vendorId);
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        name: name.trim(),
        vendorId: selected?.id,
        vendorName: selected?.name ?? '',
        ...(isFitness ? {} : { amount: amountNum, frequency }),
        autoRenew,
        description: description.trim() || '',
      });
      toast.success('Rule updated');
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update rule');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !updateRule.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit rule</DialogTitle>
          <DialogDescription>
            {isFitness
              ? 'Update Fitness program details. Per-vehicle fees and validity stay on each assignment.'
              : 'Update this recurring rule. Changes apply to all active assignments.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hub-edit-rule-name">Rule name *</Label>
            <Input
              id="hub-edit-rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hub-edit-rule-vendor">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="hub-edit-rule-vendor" className="min-h-11">
                <SelectValue placeholder="No vendor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {categoryVendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isFitness && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hub-edit-rule-amount">Amount / vehicle (JMD) *</Label>
                <Input
                  id="hub-edit-rule-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-11 text-right tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hub-edit-rule-frequency">Cadence *</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger id="hub-edit-rule-frequency" className="min-h-11">
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
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border px-4">
            <span>
              <span className="block text-sm font-medium">Auto-renew</span>
              <span className="block text-xs text-slate-500">Continue when coverage ends.</span>
            </span>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} aria-label="Auto-renew" />
          </label>
          <div className="space-y-2">
            <Label htmlFor="hub-edit-rule-description">Internal description</Label>
            <Textarea
              id="hub-edit-rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={updateRule.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={updateRule.isPending || !name.trim()}
            onClick={() => void save()}
          >
            {updateRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseHubRules({
  onChanged,
  writesEnabled = true,
}: {
  onChanged?: () => void;
  writesEnabled?: boolean;
}) {
  const { can } = usePermissions();
  const rulesQuery = useExpenseHubRules();
  const bulkAction = useBulkExpenseRuleAction();
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [pendingRuleId, setPendingRuleId] = React.useState<string | null>(null);
  const [endCandidate, setEndCandidate] = React.useState<RuleItem | null>(null);
  const [editCandidate, setEditCandidate] = React.useState<RuleItem | null>(null);
  const [detailRuleId, setDetailRuleId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const canManage = can('expenses.manage_rules') && writesEnabled;

  const runAction = async (id: string, action: 'pause' | 'resume' | 'end') => {
    setPendingRuleId(id);
    try {
      const result = await bulkAction.mutateAsync({ id, action });
      toast.success(
        `Rule ${action === 'end' ? 'ended' : action === 'pause' ? 'paused' : 'resumed'} — ${result.affected} assignment${result.affected === 1 ? '' : 's'} updated`,
      );
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} rule`);
    } finally {
      setPendingRuleId(null);
    }
  };

  const items = rulesQuery.data?.items || [];
  const detailListItem = items.find((r) => r.id === detailRuleId) ?? null;
  const visibleItems = items.filter((rule) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [rule.name, rule.vendorName, rule.category].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query),
      );
    return matchesSearch && (status === 'all' || rule.status === status);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
            Recurring rules
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Automate fixed expenses across selected vehicles.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => setBuilderOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> New rule
          </Button>
        )}
      </div>

      {!canManage && items.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Rules are read-only for your current access.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl border bg-white p-3 dark:bg-slate-950 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Search recurring rules"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search rule, vendor or category"
            className="h-11 pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter rules by status" className="min-h-11 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={rulesQuery.isFetching}
          onClick={() => void rulesQuery.refetch()}
        >
          {rulesQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Refresh
        </Button>
      </div>

      {rulesQuery.isLoading ? (
        <HubLoading label="Loading recurring rules…" />
      ) : rulesQuery.isError ? (
        <HubError
          message={(rulesQuery.error as Error)?.message}
          onRetry={() => void rulesQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <HubEmpty
          title="No recurring rules yet"
          description="Create one rule and assign it to every vehicle that should receive the expense."
          action={
            canManage ? (
              <Button type="button" className="min-h-11" onClick={() => setBuilderOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New rule
              </Button>
            ) : undefined
          }
        />
      ) : visibleItems.length === 0 ? (
        <HubEmpty title="No matching rules" description="Clear the search or choose another status." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {visibleItems.map((rule) => {
              const busy = pendingRuleId === rule.id && bulkAction.isPending;
              return (
                <Card
                  key={rule.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer overflow-hidden rounded-xl transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  onClick={() => setDetailRuleId(rule.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setDetailRuleId(rule.id);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{rule.name}</h3>
                        <p className="mt-1 truncate text-sm text-slate-500">
                          {rule.vendorName || rule.category}
                        </p>
                      </div>
                      <div
                        className="flex items-center gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <RuleStatusBadge status={rule.status} />
                        {canManage && (
                          <RuleActions
                            rule={rule}
                            busy={busy}
                            onEdit={() => setEditCandidate(rule)}
                            onAction={(action) =>
                              action === 'end' ? setEndCandidate(rule) : void runAction(rule.id, action)
                            }
                          />
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Cadence</p>
                          <p className="font-medium capitalize">
                            {String(rule.frequency).replace('_', '-')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Vehicles</p>
                          <p className="font-medium">{rule.assignmentCount}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex min-h-11 items-center justify-between border-t pt-3">
                      <div>
                        <p className="text-xs text-slate-500">Expected per vehicle</p>
                        <p className="font-bold tabular-nums">{formatMoney(rule.amount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden rounded-xl md:block">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-900">
                    <TableHead>Rule</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Cadence</TableHead>
                    <TableHead className="text-center">Vehicles</TableHead>
                    <TableHead className="text-right">Amount / vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((rule) => {
                    const busy = pendingRuleId === rule.id && bulkAction.isPending;
                    return (
                      <TableRow
                        key={rule.id}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        onClick={() => setDetailRuleId(rule.id)}
                      >
                        <TableCell className="max-w-56">
                          <p className="truncate font-semibold">{rule.name}</p>
                          <p className="text-xs text-slate-400">Version {rule.version}</p>
                        </TableCell>
                        <TableCell className="max-w-44 truncate">{rule.vendorName || '—'}</TableCell>
                        <TableCell>{rule.category}</TableCell>
                        <TableCell className="capitalize">
                          {String(rule.frequency).replace('_', '-')}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {rule.assignmentCount}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatMoney(rule.amount)}
                        </TableCell>
                        <TableCell>
                          <RuleStatusBadge status={rule.status} />
                        </TableCell>
                        {canManage && (
                          <TableCell
                            className="text-right"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="flex justify-end">
                              <RuleActions
                                rule={rule}
                                busy={busy}
                                onEdit={() => setEditCandidate(rule)}
                                onAction={(action) =>
                                  action === 'end'
                                    ? setEndCandidate(rule)
                                    : void runAction(rule.id, action)
                                }
                              />
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

      <ExpenseHubRuleBuilder open={builderOpen} onOpenChange={setBuilderOpen} onCreated={onChanged} />

      <ExpenseHubRuleDetail
        ruleId={detailRuleId}
        onClose={() => setDetailRuleId(null)}
        canManage={canManage}
        onEdit={
          detailListItem
            ? () => {
                setDetailRuleId(null);
                setEditCandidate(detailListItem);
              }
            : undefined
        }
      />

      <RuleEditDialog
        rule={editCandidate}
        open={editCandidate !== null}
        onOpenChange={(open) => !open && setEditCandidate(null)}
        onSaved={onChanged}
      />

      <AlertDialog open={endCandidate !== null} onOpenChange={(open) => !open && setEndCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End “{endCandidate?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops the rule for{' '}
              {endCandidate?.assignmentCount === 1
                ? 'its assigned vehicle'
                : `all ${endCandidate?.assignmentCount ?? 0} assigned vehicles`}{' '}
              and removes future scheduled charges. Expenses already recorded stay on the books.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep rule</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                if (endCandidate) void runAction(endCandidate.id, 'end');
                setEndCandidate(null);
              }}
            >
              End rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
