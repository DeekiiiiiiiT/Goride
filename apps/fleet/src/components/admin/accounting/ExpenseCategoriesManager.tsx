/**
 * Super Admin — shared expense category taxonomy.
 */
import React from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
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

export function ExpenseCategoriesManager() {
  const [items, setItems] = React.useState<ExpenseHubCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
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

  const handleAdd = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await platformVendorAdminService.createCategory({ label: label.trim() });
      toast.success('Category added');
      setAddOpen(false);
      setLabel('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Expense categories</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Shared operating-expense taxonomy used across fleet Expense Hub and recurring rules.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setAddOpen(true)}>
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
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.label}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{c.value}</TableCell>
                  <TableCell>
                    {c.isSystem || c.id.startsWith('system:') ? (
                      <Badge variant="secondary">Built-in</Badge>
                    ) : (
                      <Badge className="bg-indigo-50 text-indigo-800" variant="secondary">
                        Platform
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add expense category</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Display name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Road Tax" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !label.trim()} onClick={() => void handleAdd()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
