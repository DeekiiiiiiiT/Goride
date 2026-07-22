/**
 * Super Admin — Jamaica Vendor Database (verified GOD list).
 */
import React from 'react';
import { Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
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
import type { ExpenseVendor } from '../../../types/expenseHub';

export function VendorDatabaseManager() {
  const [items, setItems] = React.useState<ExpenseVendor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [bulkText, setBulkText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [migrating, setMigrating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformVendorAdminService.listVendors('verified');
      setItems(res.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((v) => {
    if (!q.trim()) return true;
    return v.name.toLowerCase().includes(q.trim().toLowerCase());
  });

  const handleAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await platformVendorAdminService.createVendor({ name: name.trim(), notes: notes.trim() || undefined });
      toast.success('Vendor added to Jamaica catalog');
      setAddOpen(false);
      setName('');
      setNotes('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add vendor');
    } finally {
      setBusy(false);
    }
  };

  const handleBulk = async () => {
    setBusy(true);
    try {
      const res = await platformVendorAdminService.bulkCreateVendors({ text: bulkText });
      toast.success(`Created ${res.summary.created}, skipped ${res.summary.skipped}`);
      setBulkOpen(false);
      setBulkText('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bulk import failed');
    } finally {
      setBusy(false);
    }
  };

  const handleMigrate = async (confirm: boolean) => {
    setMigrating(true);
    try {
      const res = await platformVendorAdminService.migrateLegacy(confirm);
      const v = (res.vendors || {}) as { created?: number; merged?: number };
      if (!confirm) {
        toast.message(
          `Dry run: would create ${v.created ?? 0}, merge ${v.merged ?? 0}. Run again with confirm to apply.`,
        );
      } else {
        toast.success(`Migrated: created ${v.created ?? 0}, merged ${v.merged ?? 0}`);
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Vendor Database</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Roam-owned Jamaica company catalog. All fleet apps pick from this list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={migrating}
            onClick={() => void handleMigrate(false)}
          >
            Migrate dry-run
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={migrating}
            onClick={() => {
              if (window.confirm('Apply legacy org vendor migration into the platform catalog?')) {
                void handleMigrate(true);
              }
            }}
          >
            {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Migrate apply'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            Bulk import
          </Button>
          <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add vendor
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input className="pl-8" placeholder="Search vendors…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading catalog…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Default category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500 py-10">
                    No verified vendors yet. Add Jamaica companies or run migration.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-slate-500">{v.categoryDefault || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
                        Verified
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 max-w-xs truncate">{v.notes || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add verified vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Company name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Digicel" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !name.trim()} onClick={() => void handleAdd()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk import vendors</DialogTitle>
          </DialogHeader>
          <div>
            <Label>One company name per line</Label>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={10}
              placeholder="Digicel&#10;Flow&#10;GraceKennedy"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !bulkText.trim()} onClick={() => void handleBulk()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
