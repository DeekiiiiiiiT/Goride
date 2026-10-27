/**
 * S22 Vendors table — Stitch shell with live verified vendor rows + ops.
 */
import React from "react";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@roam/ui";
import type { ExpenseHubCategory, ExpenseVendor } from "@roam/types";
import { platformVendorAdminService } from "@roam/platform-ops-ui";

function vendorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function vendorSubId(vendor: ExpenseVendor): string {
  const compact = vendor.id.replace(/-/g, "").slice(-5).toUpperCase();
  return `JMD-SUP-${compact}`;
}

export function DominionVendorsPanel() {
  const [items, setItems] = React.useState<ExpenseVendor[]>([]);
  const [categories, setCategories] = React.useState<ExpenseHubCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExpenseVendor | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [categoryDefault, setCategoryDefault] = React.useState("none");
  const [notes, setNotes] = React.useState("");
  const [trn, setTrn] = React.useState("");
  const [gctRegistered, setGctRegistered] = React.useState(true);
  const [bulkText, setBulkText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [migrating, setMigrating] = React.useState(false);

  const categoryLabelByValue = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.value, c.label);
    return map;
  }, [categories]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [vendorsRes, categoriesRes] = await Promise.all([
        platformVendorAdminService.listVendors("verified"),
        platformVendorAdminService.listCategories(),
      ]);
      setItems(vendorsRes.items || []);
      setCategories((categoriesRes.items || []).filter((c) => c.isActive !== false));
    } catch (e) {
      setItems([]);
      setLoadError(e instanceof Error ? e.message : "Could not load vendors");
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

  const resetForm = () => {
    setEditing(null);
    setName("");
    setCategoryDefault("none");
    setNotes("");
    setTrn("");
    setGctRegistered(true);
  };

  const openAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (vendor: ExpenseVendor) => {
    setEditing(vendor);
    setName(vendor.name || "");
    setCategoryDefault(vendor.categoryDefault || "none");
    setNotes(vendor.notes || "");
    setTrn(vendor.trn || "");
    setGctRegistered(vendor.gctRegistered !== false);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        categoryDefault: categoryDefault === "none" ? undefined : categoryDefault,
        notes: notes.trim() || undefined,
        trn: trn.trim() || undefined,
        gctRegistered,
      };
      if (editing) {
        await platformVendorAdminService.updateVendor(editing.id, {
          name: payload.name,
          notes: payload.notes,
          categoryDefault: (payload.categoryDefault ?? "") as ExpenseVendor["categoryDefault"],
          trn: payload.trn ?? "",
          gctRegistered: payload.gctRegistered,
        });
        toast.success("Vendor updated");
      } else {
        await platformVendorAdminService.createVendor(payload);
        toast.success("Vendor added to Jamaica catalog");
      }
      setFormOpen(false);
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : editing ? "Failed to update vendor" : "Failed to add vendor");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (vendor: ExpenseVendor) => {
    if (
      !window.confirm(
        `Remove “${vendor.name}” from the Jamaica catalog?\n\nFleets won’t see it for new bills. Existing bills keep the name for history.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await platformVendorAdminService.deleteVendor(vendor.id);
      toast.success("Vendor removed from catalog");
      if (editing?.id === vendor.id) {
        setFormOpen(false);
        resetForm();
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete vendor");
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
      setBulkText("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk import failed");
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
      toast.error(e instanceof Error ? e.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Store className="h-5 w-5 text-slate-600" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">Vendors</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">DOM-VND-PARISH-01</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
              if (window.confirm("Apply legacy org vendor migration into the platform catalog?")) {
                void handleMigrate(true);
              }
            }}
          >
            {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Migrate apply"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            Bulk import
          </Button>
          <Button type="button" size="sm" className="bg-[#316bf3] hover:bg-[#2557d6]" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add vendor
          </Button>
        </div>
      </div>

      <div className="border-b border-slate-100 px-6 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search vendors…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Category</th>
              <th className="px-6 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading vendors…
                  </span>
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center text-slate-600">
                  <p className="mb-3 font-medium text-slate-800">Could not load vendors</p>
                  <p className="mb-4 text-xs text-slate-500">{loadError}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-10 text-center italic text-slate-400">
                  No verified vendors yet. Add Jamaica companies or run migration.
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id} className="group transition-colors hover:bg-slate-50/50">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600">
                        {vendorInitials(v.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{v.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{vendorSubId(v)}</div>
                      </div>
                      <div className="ml-auto hidden items-center gap-0.5 group-hover:inline-flex sm:inline-flex">
                        <button
                          type="button"
                          aria-label={`Edit ${v.name}`}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => openEdit(v)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${v.name}`}
                          disabled={busy}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                          onClick={() => void handleDelete(v)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-slate-500">
                    {v.categoryDefault
                      ? categoryLabelByValue.get(v.categoryDefault) || v.categoryDefault
                      : "—"}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      Active
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit vendor" : "Add verified vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dom-vendor-name">Company name</Label>
              <Input
                id="dom-vendor-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Digicel"
              />
            </div>
            <div>
              <Label htmlFor="dom-vendor-category">Default category</Label>
              <Select value={categoryDefault} onValueChange={setCategoryDefault}>
                <SelectTrigger id="dom-vendor-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dom-vendor-notes">Notes</Label>
              <Textarea
                id="dom-vendor-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="dom-vendor-trn">TRN (GCT input tax)</Label>
              <Input
                id="dom-vendor-trn"
                value={trn}
                onChange={(e) => setTrn(e.target.value)}
                placeholder="9-digit TRN"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={gctRegistered}
                onChange={(e) => setGctRegistered(e.target.checked)}
                className="rounded border-slate-300"
              />
              Vendor is GCT-registered (creditable input tax)
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !name.trim()} onClick={() => void handleSave()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
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
              placeholder={"Digicel\nFlow\nGraceKennedy"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !bulkText.trim()} onClick={() => void handleBulk()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
