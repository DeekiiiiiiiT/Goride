/**
 * Super Admin — shared expense category taxonomy (one Roam catalog; no type split).
 */
import React from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Dialog,
  DialogContent,
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
import { platformVendorAdminService } from '../../../services/platformVendorAdminService';
import type { ExpenseHubCategory } from '../../../types/expenseHub';

export function ExpenseCategoriesManager({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = React.useState<ExpenseHubCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseHubCategory | null>(null);
  const [label, setLabel] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformVendorAdminService.listCategories();
      setItems(res.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setLabel('');
  };

  const openAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (category: ExpenseHubCategory) => {
    setEditing(category);
    setLabel(category.label || '');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      if (editing) {
        await platformVendorAdminService.updateCategory(editing.id, { label: label.trim() });
        toast.success('Category updated');
      } else {
        await platformVendorAdminService.createCategory({ label: label.trim() });
        toast.success('Category added');
      }
      setFormOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : editing ? 'Failed to update category' : 'Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (category: ExpenseHubCategory) => {
    if (
      !window.confirm(
        `Remove “${category.label}” from the catalog?\n\nFleets won’t see it for new bills. Existing bills keep the category code for history.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await platformVendorAdminService.deleteCategory(category.id);
      toast.success('Category removed');
      if (editing?.id === category.id) {
        setFormOpen(false);
        resetForm();
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete category');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 p-4 md:p-6'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!embedded && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Expense categories</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Your Roam catalog — used across fleet Expense Hub and recurring rules.
            </p>
          </div>
        )}
        <div className={`flex gap-2 ${embedded ? 'w-full justify-end' : ''}`}>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add category
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="w-[96px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-slate-500 py-10">
                    No categories yet. Add your first expense type.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{c.value}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Edit ${c.label}`}
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Delete ${c.label}`}
                          disabled={busy}
                          onClick={() => void handleDelete(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit expense category' : 'Add expense category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="admin-category-label">Display name</Label>
              <Input
                id="admin-category-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Road Tax"
              />
            </div>
            {editing ? (
              <p className="text-xs text-slate-500">
                Code stays <span className="font-mono">{editing.value}</span> so existing bills and rules keep working.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !label.trim()} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
