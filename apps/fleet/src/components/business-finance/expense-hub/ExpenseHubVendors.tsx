/**
 * Expense Hub — Categories & Vendors subview (Stitch: Categories & Vendors mobile+desktop).
 * Vendors: list + create (only writes the hub API supports). Categories: read-only
 * reference of the fixed expense taxonomy. No edit/archive/merge — server has no routes.
 */
import React from 'react';
import { ListPlus, Loader2, Plus, Search, Store, Trash2, UserRoundPlus } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Textarea } from '../../ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { cn } from '../../ui/utils';
import { EXPENSE_CATEGORIES } from '../../../types/expenses';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  useCreateExpenseVendor,
  useCreateExpenseVendorsBulk,
  useExpenseHubVendors,
} from '../../../hooks/useExpenseHub';
import type { ExpenseVendor } from '../../../types/expenseHub';
import { HubEmpty, HubError, HubLoading } from './HubStates';
import { categoryIcon } from './hubFormat';

type AddMode = 'one' | 'bulk';

type BulkRow = { id: string; name: string };

const BULK_MAX = 100;

function newBulkRow(name = ''): BulkRow {
  return { id: crypto.randomUUID(), name };
}

function initialBulkRows(): BulkRow[] {
  return [newBulkRow(), newBulkRow()];
}

export function ExpenseHubVendors({ writesEnabled = true }: { writesEnabled?: boolean }) {
  const { can } = usePermissions();
  const vendorsQuery = useExpenseHubVendors();
  const createVendor = useCreateExpenseVendor();
  const createVendorsBulk = useCreateExpenseVendorsBulk();

  const [filter, setFilter] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<AddMode>('one');
  const [name, setName] = React.useState('');
  const [categoryDefault, setCategoryDefault] = React.useState('none');
  const [notes, setNotes] = React.useState('');
  const [bulkRows, setBulkRows] = React.useState<BulkRow[]>(initialBulkRows);

  const canManage = can('expenses.manage_vendors') && writesEnabled;
  const anyCreatePending = createVendor.isPending || createVendorsBulk.isPending;

  const resetForm = () => {
    setAddMode('one');
    setName('');
    setCategoryDefault('none');
    setNotes('');
    setBulkRows(initialBulkRows());
  };

  const openDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    if (anyCreatePending) return;
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const filledBulkNames = bulkRows.map((r) => r.name.trim()).filter(Boolean);
  const bulkNameCount = filledBulkNames.length;

  const updateBulkRow = (id: string, value: string) => {
    setBulkRows((rows) => rows.map((r) => (r.id === id ? { ...r, name: value } : r)));
  };

  const addBulkRow = () => {
    if (bulkRows.length >= BULK_MAX) {
      toast.error(`Maximum ${BULK_MAX} vendors per bulk add`);
      return;
    }
    setBulkRows((rows) => [...rows, newBulkRow()]);
  };

  const removeBulkRow = (id: string) => {
    setBulkRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)));
  };

  const submitOne = async () => {
    if (!name.trim()) {
      toast.error('Vendor name is required');
      return;
    }
    try {
      await createVendor.mutateAsync({
        name: name.trim(),
        categoryDefault: categoryDefault === 'none' ? undefined : categoryDefault,
        notes: notes.trim() || undefined,
      });
      toast.success('Vendor added');
      closeDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add vendor');
    }
  };

  const submitBulk = async () => {
    if (filledBulkNames.length === 0) {
      toast.error('Enter at least one vendor name');
      return;
    }
    if (filledBulkNames.length > BULK_MAX) {
      toast.error(`Maximum ${BULK_MAX} vendors per bulk add`);
      return;
    }
    try {
      const result = await createVendorsBulk.mutateAsync({
        names: filledBulkNames,
        categoryDefault: categoryDefault === 'none' ? undefined : categoryDefault,
      });
      const { created, skipped } = result.summary;
      if (created === 0 && skipped > 0) {
        toast.message(`No new vendors — ${skipped} already existed`);
      } else if (skipped > 0) {
        toast.success(`Added ${created} vendor${created === 1 ? '' : 's'} (${skipped} skipped as duplicates)`);
      } else {
        toast.success(`Added ${created} vendor${created === 1 ? '' : 's'}`);
      }
      closeDialog(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add vendors');
    }
  };

  const q = filter.trim().toLowerCase();
  const allVendors = vendorsQuery.data?.items || [];
  const vendors = q
    ? allVendors.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.categoryDefault || '').toLowerCase().includes(q) ||
          (v.notes || '').toLowerCase().includes(q),
      )
    : allVendors;
  const categories = q
    ? EXPENSE_CATEGORIES.filter(
        (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q),
      )
    : EXPENSE_CATEGORIES;

  const addVendorButton = canManage ? (
    <Button type="button" className="min-h-11" onClick={openDialog}>
      <Plus className="mr-2 h-4 w-4" aria-hidden />
      Add vendor
    </Button>
  ) : undefined;

  const primaryDisabled =
    anyCreatePending ||
    (addMode === 'one' ? !name.trim() : bulkNameCount === 0 || bulkNameCount > BULK_MAX);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Categories &amp; vendors
          </h3>
          <p className="text-xs text-slate-500">
            Classification structure and counterparties used across expenses and rules.
          </p>
        </div>
        {addVendorButton}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter categories or vendors…"
          aria-label="Filter categories or vendors"
          className="h-11 pl-9"
        />
      </div>

      <Tabs defaultValue="vendors">
        <TabsList className="h-auto w-full bg-slate-100 dark:bg-slate-800 sm:w-auto">
          <TabsTrigger value="vendors" className="min-h-11 flex-1 px-4 sm:flex-none">
            Vendors ({allVendors.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="min-h-11 flex-1 px-4 sm:flex-none">
            Categories ({EXPENSE_CATEGORIES.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendors" className="space-y-3 pt-1">
          {vendorsQuery.isLoading ? (
            <HubLoading label="Loading vendors…" />
          ) : vendorsQuery.isError ? (
            <HubError
              message={(vendorsQuery.error as Error)?.message}
              onRetry={() => void vendorsQuery.refetch()}
            />
          ) : vendors.length === 0 ? (
            <HubEmpty
              title={q ? 'No vendors match this filter' : 'No vendors yet'}
              description={
                q
                  ? 'Try a different name or clear the filter.'
                  : 'Add the companies you pay so expenses and rules stay consistent.'
              }
              action={q ? undefined : addVendorButton}
            />
          ) : (
            <>
              {/* Mobile: vendor cards */}
              <div className="space-y-3 md:hidden">
                {vendors.map((v) => (
                  <VendorCard key={v.id} vendor={v} />
                ))}
              </div>

              {/* Desktop: vendor table */}
              <Card className="hidden overflow-hidden rounded-md border-slate-200 dark:border-slate-800 md:block">
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Default category</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Added</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.map((v) => (
                        <TableRow
                          key={v.id}
                          className={cn(
                            'h-11 hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            !v.isActive && 'opacity-60',
                          )}
                        >
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                              >
                                {v.name.slice(0, 2).toUpperCase()}
                              </span>
                              {v.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">{v.categoryDefault || '—'}</TableCell>
                          <TableCell className="max-w-[280px] truncate text-sm text-slate-500">
                            {v.notes || '—'}
                          </TableCell>
                          <TableCell>
                            <VendorStatusBadge active={v.isActive} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-sm text-slate-500">
                            {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-3 pt-1">
          {categories.length === 0 ? (
            <HubEmpty
              title="No categories match this filter"
              description="Try a different name or clear the filter."
            />
          ) : (
            <>
              {/* Mobile: category cards */}
              <div className="grid gap-3 sm:grid-cols-2 md:hidden">
                {categories.map((c) => {
                  const Icon = categoryIcon(c.value);
                  return (
                    <Card key={c.value} className="rounded-xl border-slate-200 dark:border-slate-800">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {c.label}
                          </p>
                          <p className="text-xs uppercase tracking-wider text-slate-500">
                            {c.value}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Desktop: category table */}
              <Card className="hidden overflow-hidden rounded-md border-slate-200 dark:border-slate-800 md:block">
                <CardContent className="overflow-x-auto p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((c) => {
                        const Icon = categoryIcon(c.value);
                        return (
                          <TableRow key={c.value} className="h-11 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
                                {c.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm uppercase tracking-wider text-slate-500">
                              {c.value}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 font-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              >
                                Active
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="text-xs text-slate-500">
                Categories are fixed for consistent reporting. Vendors can set a default category
                to speed up expense entry.
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-1 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <DialogTitle>Add vendor</DialogTitle>
            <DialogDescription>
              {addMode === 'one'
                ? 'Vendors appear in expense and rule forms.'
                : 'Add a field for each vendor. Existing duplicates are skipped.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            {/* Mode switch inside overlay */}
            <div
              role="tablist"
              aria-label="Add mode"
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
            >
              <button
                type="button"
                role="tab"
                aria-selected={addMode === 'one'}
                disabled={anyCreatePending}
                onClick={() => setAddMode('one')}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all',
                  addMode === 'one'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                <UserRoundPlus className="h-4 w-4" aria-hidden />
                One
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addMode === 'bulk'}
                disabled={anyCreatePending}
                onClick={() => setAddMode('bulk')}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all',
                  addMode === 'bulk'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                )}
              >
                <ListPlus className="h-4 w-4" aria-hidden />
                Bulk
              </button>
            </div>

            {addMode === 'one' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hub-vendor-name">Name</Label>
                  <Input
                    id="hub-vendor-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. ICWI"
                    className="h-11"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-vendor-category">Default category (optional)</Label>
                  <Select value={categoryDefault} onValueChange={setCategoryDefault}>
                    <SelectTrigger id="hub-vendor-category" className="min-h-11">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-vendor-notes">Notes (optional)</Label>
                  <Textarea
                    id="hub-vendor-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Vendor names</Label>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                        bulkNameCount > 0
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                      )}
                    >
                      {bulkNameCount}/{BULK_MAX}
                    </span>
                  </div>
                  <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {bulkRows.map((row, index) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="w-5 shrink-0 text-center text-xs font-medium tabular-nums text-slate-400"
                        >
                          {index + 1}
                        </span>
                        <Input
                          value={row.name}
                          onChange={(e) => updateBulkRow(row.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (index === bulkRows.length - 1) addBulkRow();
                            }
                          }}
                          placeholder={`Vendor ${index + 1}`}
                          aria-label={`Vendor name ${index + 1}`}
                          className="h-11"
                          autoFocus={index === 0}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0 text-slate-400 hover:text-rose-600"
                          disabled={anyCreatePending || bulkRows.length <= 1}
                          onClick={() => removeBulkRow(row.id)}
                          aria-label={`Remove vendor field ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full border-dashed"
                    disabled={anyCreatePending || bulkRows.length >= BULK_MAX}
                    onClick={addBulkRow}
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Add another vendor
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-vendor-bulk-category">Default category for all (optional)</Label>
                  <Select value={categoryDefault} onValueChange={setCategoryDefault}>
                    <SelectTrigger id="hub-vendor-bulk-category" className="min-h-11">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/40">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={anyCreatePending}
              onClick={() => closeDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={primaryDisabled}
              onClick={() => void (addMode === 'one' ? submitOne() : submitBulk())}
            >
              {anyCreatePending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {addMode === 'one'
                ? 'Add vendor'
                : bulkNameCount > 0
                  ? `Add ${bulkNameCount} vendor${bulkNameCount === 1 ? '' : 's'}`
                  : 'Add vendors'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VendorStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'font-normal',
        active
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
      )}
    >
      {active ? 'Active' : 'Archived'}
    </Badge>
  );
}

/** Mobile vendor card (Stitch vendor card with monogram + field grid). */
function VendorCard({ vendor }: { vendor: ExpenseVendor }) {
  return (
    <Card
      className={cn(
        'rounded-xl border-slate-200 dark:border-slate-800',
        !vendor.isActive && 'opacity-60',
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
            >
              {vendor.name ? vendor.name.slice(0, 2).toUpperCase() : <Store className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                {vendor.name}
              </p>
              <p className="text-xs text-slate-500">
                Added {vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
          <VendorStatusBadge active={vendor.isActive} />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Default category
            </p>
            <p className="text-slate-900 dark:text-slate-100">{vendor.categoryDefault || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notes</p>
            <p className="truncate text-slate-900 dark:text-slate-100">{vendor.notes || '—'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
