import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Package, Plus, RefreshCw, Tags, Truck, Link2, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { listVehicleCatalog } from "../../../services/vehicleCatalogService";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import {
  createPartCategory,
  createPartFitment,
  createPartMaster,
  createPartOffer,
  createSupplier,
  deletePartCategory,
  deletePartFitment,
  deletePartMaster,
  deletePartOffer,
  deleteSupplier,
  listPartCategories,
  listPartFitment,
  listPartMasters,
  listPartOffers,
  listSuppliers,
} from "../../../services/partSourcingService";
import type {
  PartCategoryRecord,
  PartFitmentRecord,
  PartMasterRecord,
  SupplierPartOfferRecord,
  SupplierRecord,
} from "../../../types/partSourcing";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { toast } from "sonner@2.0.3";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { cn } from "../../ui/utils";

/** Super Admin is `dark` — Radix default select styling is nearly invisible there. */
const adminSelectTrigger = cn(
  "h-9 border shadow-sm",
  "border-slate-300 bg-white text-slate-900",
  "data-[placeholder]:text-slate-500 [&_svg]:text-slate-600",
  "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
  "dark:data-[placeholder]:text-slate-400 dark:[&_svg]:text-slate-400",
  "dark:hover:bg-slate-700",
);

const adminSelectContent = cn(
  "z-[200] border shadow-lg",
  "border-slate-200 bg-white text-slate-900",
  "dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
);

const adminSelectItem = cn(
  "cursor-pointer",
  "focus:bg-amber-100 focus:text-slate-900",
  "dark:focus:bg-amber-500/20 dark:focus:text-amber-50",
);

const adminLabel = "text-slate-700 dark:text-slate-300";

const adminTableWrap = cn(
  "rounded-lg border overflow-hidden",
  "border-slate-200 bg-white",
  "dark:border-slate-700 dark:bg-slate-900/90",
);

type MainTab = "categories" | "parts" | "suppliers" | "fitment" | "offers";

export function PartsSourcingManager() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [mainTab, setMainTab] = useState<MainTab>("categories");
  const [busy, setBusy] = useState(false);

  const [categories, setCategories] = useState<PartCategoryRecord[]>([]);
  const [parts, setParts] = useState<PartMasterRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [offers, setOffers] = useState<SupplierPartOfferRecord[]>([]);
  const [fitments, setFitments] = useState<PartFitmentRecord[]>([]);
  const [catalog, setCatalog] = useState<VehicleCatalogRecord[]>([]);

  const [partsCategoryFilter, setPartsCategoryFilter] = useState<string>("");
  const [fitmentCatalogFilter, setFitmentCatalogFilter] = useState<string>("");

  const reloadCategories = useCallback(async () => {
    if (!token) return;
    const rows = await listPartCategories(token);
    setCategories(rows);
  }, [token]);

  const reloadParts = useCallback(async () => {
    if (!token) return;
    const rows = await listPartMasters(token, partsCategoryFilter || undefined);
    setParts(rows);
  }, [token, partsCategoryFilter]);

  const reloadSuppliers = useCallback(async () => {
    if (!token) return;
    setSuppliers(await listSuppliers(token));
  }, [token]);

  const reloadOffers = useCallback(async () => {
    if (!token) return;
    setOffers(await listPartOffers(token));
  }, [token]);

  const reloadFitments = useCallback(async () => {
    if (!token) return;
    setFitments(
      await listPartFitment(token, {
        vehicle_catalog_id: fitmentCatalogFilter || undefined,
      }),
    );
  }, [token, fitmentCatalogFilter]);

  const reloadCatalog = useCallback(async () => {
    if (!token) return;
    const rows = await listVehicleCatalog(token);
    setCatalog(rows.slice(0, 500));
  }, [token]);

  const refreshTab = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      if (mainTab === "categories") await reloadCategories();
      else if (mainTab === "parts") await reloadParts();
      else if (mainTab === "suppliers") await reloadSuppliers();
      else if (mainTab === "offers") await reloadOffers();
      else if (mainTab === "fitment") await reloadFitments();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [token, mainTab, reloadCategories, reloadParts, reloadSuppliers, reloadOffers, reloadFitments]);

  useEffect(() => {
    void refreshTab();
  }, [mainTab, partsCategoryFilter, fitmentCatalogFilter, refreshTab]);

  useEffect(() => {
    if (!token) return;
    void reloadCategories();
    void reloadCatalog();
  }, [token, reloadCategories, reloadCatalog]);

  // --- Category dialog ---
  const [catOpen, setCatOpen] = useState(false);
  const [catSlug, setCatSlug] = useState("");
  const [catLabel, setCatLabel] = useState("");
  const [catSort, setCatSort] = useState("0");

  const openNewCategory = () => {
    setCatSlug("");
    setCatLabel("");
    setCatSort("0");
    setCatOpen(true);
  };

  const saveCategory = async () => {
    if (!token) return;
    try {
      await createPartCategory(token, {
        slug: catSlug || catLabel.toLowerCase().replace(/\s+/g, "-"),
        label: catLabel,
        sort_order: Number(catSort) || 0,
      });
      toast.success("Category created");
      setCatOpen(false);
      await reloadCategories();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // --- Part dialog ---
  const [partOpen, setPartOpen] = useState(false);
  const [partCategoryId, setPartCategoryId] = useState("");
  const [partName, setPartName] = useState("");
  const [partOem, setPartOem] = useState("");
  const [partDesc, setPartDesc] = useState("");

  const openNewPart = () => {
    setPartCategoryId(categories[0]?.id ?? "");
    setPartName("");
    setPartOem("");
    setPartDesc("");
    setPartOpen(true);
  };

  const savePart = async () => {
    if (!token) return;
    if (!partCategoryId || !partName.trim()) {
      toast.error("Category and name required");
      return;
    }
    try {
      await createPartMaster(token, {
        category_id: partCategoryId,
        name: partName.trim(),
        oem_part_number: partOem.trim() || null,
        description: partDesc.trim() || null,
      });
      toast.success("Part created");
      setPartOpen(false);
      await reloadParts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // --- Supplier dialog ---
  const [supOpen, setSupOpen] = useState(false);
  const [supName, setSupName] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supLead, setSupLead] = useState("");

  const openNewSupplier = () => {
    setSupName("");
    setSupEmail("");
    setSupPhone("");
    setSupLead("");
    setSupOpen(true);
  };

  const saveSupplier = async () => {
    if (!token || !supName.trim()) return;
    try {
      await createSupplier(token, {
        name: supName.trim(),
        contact_email: supEmail.trim() || null,
        contact_phone: supPhone.trim() || null,
        default_lead_time_days: supLead.trim() ? Number(supLead) : null,
      });
      toast.success("Supplier created");
      setSupOpen(false);
      await reloadSuppliers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // --- Offer dialog ---
  const [offOpen, setOffOpen] = useState(false);
  const [offSupplierId, setOffSupplierId] = useState("");
  const [offPartId, setOffPartId] = useState("");
  const [offSku, setOffSku] = useState("");
  const [offPrice, setOffPrice] = useState("0");
  const [offCurrency, setOffCurrency] = useState("USD");
  const [offLead, setOffLead] = useState("");

  const openNewOffer = async () => {
    if (!token) return;
    let pList = parts;
    let sList = suppliers;
    try {
      if (pList.length === 0) pList = await listPartMasters(token);
      if (sList.length === 0) sList = await listSuppliers(token);
      setParts(pList);
      setSuppliers(sList);
    } catch {
      /* ignore */
    }
    setOffSupplierId(sList[0]?.id ?? "");
    setOffPartId(pList[0]?.id ?? "");
    setOffSku("");
    setOffPrice("0");
    setOffCurrency("USD");
    setOffLead("");
    setOffOpen(true);
  };

  const saveOffer = async () => {
    if (!token) return;
    if (!offSupplierId || !offPartId || !offSku.trim()) {
      toast.error("Supplier, part, and SKU required");
      return;
    }
    try {
      await createPartOffer(token, {
        supplier_id: offSupplierId,
        part_id: offPartId,
        supplier_sku: offSku.trim(),
        unit_price: Number(offPrice) || 0,
        currency: offCurrency,
        lead_time_days: offLead.trim() ? Number(offLead) : null,
      });
      toast.success("Offer created");
      setOffOpen(false);
      await reloadOffers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // --- Fitment dialog ---
  const [fitOpen, setFitOpen] = useState(false);
  const [fitPartId, setFitPartId] = useState("");
  const [fitCatalogId, setFitCatalogId] = useState("");
  const [fitChassis, setFitChassis] = useState("");
  const [fitEngine, setFitEngine] = useState("");
  const [fitYearFrom, setFitYearFrom] = useState("");
  const [fitYearTo, setFitYearTo] = useState("");

  const openNewFitment = async () => {
    if (!token) return;
    let pList = parts;
    let cList = catalog;
    try {
      if (pList.length === 0) pList = await listPartMasters(token);
      if (cList.length === 0) {
        cList = (await listVehicleCatalog(token)).slice(0, 500);
        setCatalog(cList);
      }
      setParts(pList);
    } catch {
      /* ignore */
    }
    setFitPartId(pList[0]?.id ?? "");
    setFitCatalogId(cList[0]?.id ?? "");
    setFitChassis("");
    setFitEngine("");
    setFitYearFrom("");
    setFitYearTo("");
    setFitOpen(true);
  };

  const saveFitment = async () => {
    if (!token) return;
    if (!fitPartId || !fitCatalogId.trim()) {
      toast.error("Part and motor catalog row required");
      return;
    }
    try {
      await createPartFitment(token, {
        part_id: fitPartId,
        vehicle_catalog_id: fitCatalogId.trim(),
        chassis_code: fitChassis.trim() || null,
        engine_code: fitEngine.trim() || null,
        year_from: fitYearFrom.trim() ? Number(fitYearFrom) : null,
        year_to: fitYearTo.trim() ? Number(fitYearTo) : null,
      });
      toast.success("Fitment created");
      setFitOpen(false);
      await reloadFitments();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!token) {
    return <div className="p-6 text-slate-600">Sign in to manage parts sourcing.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto text-slate-900 dark:text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-600" />
            Parts sourcing
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Master catalog: categories, parts, suppliers, fitment to motor vehicles, and offers. Fleet apps read compatible
            parts via the catalog link on each vehicle.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshTab()} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 dark:bg-slate-900/70 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <TabsTrigger value="categories" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-950 dark:data-[state=active]:text-amber-50">
            <Tags className="w-4 h-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="parts" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-950 dark:data-[state=active]:text-amber-50">
            <Package className="w-4 h-4" />
            Parts
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-950 dark:data-[state=active]:text-amber-50">
            <Truck className="w-4 h-4" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="fitment" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-950 dark:data-[state=active]:text-amber-50">
            <Link2 className="w-4 h-4" />
            Fitment
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-950 dark:data-[state=active]:text-amber-50">
            <ShoppingCart className="w-4 h-4" />
            Offers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={openNewCategory} className="gap-1">
              <Plus className="w-4 h-4" />
              Add category
            </Button>
          </div>
          <div className={adminTableWrap}>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 dark:border-slate-700">
                  <TableHead className="text-slate-900 dark:text-slate-100">Label</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Slug</TableHead>
                  <TableHead className="text-right text-slate-900 dark:text-slate-100">Parts</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{c.label}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400 text-sm">{c.slug}</TableCell>
                    <TableCell className="text-right">{c.part_count ?? 0}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={async () => {
                          if (!window.confirm(`Delete category “${c.label}”?`)) return;
                          try {
                            await deletePartCategory(token, c.id);
                            toast.success("Deleted");
                            await reloadCategories();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="parts" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end justify-between">
            <div className="space-y-1">
              <Label className={adminLabel}>Filter by category</Label>
              <Select value={partsCategoryFilter || "__all__"} onValueChange={(v) => setPartsCategoryFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-[240px] sm:w-[280px]")}>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className={adminSelectContent}>
                  <SelectItem className={adminSelectItem} value="__all__">
                    All categories
                  </SelectItem>
                  {categories.map((c) => (
                    <SelectItem className={adminSelectItem} key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" size="sm" onClick={openNewPart} className="gap-1">
              <Plus className="w-4 h-4" />
              Add part
            </Button>
          </div>
          <div className={adminTableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-slate-900 dark:text-slate-100">Name</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Category</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">OEM #</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{p.name}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">{p.part_category?.label ?? "—"}</TableCell>
                    <TableCell className="text-sm text-slate-800 dark:text-slate-200">{p.oem_part_number ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={async () => {
                          if (!window.confirm(`Delete part “${p.name}”?`)) return;
                          try {
                            await deletePartMaster(token, p.id);
                            toast.success("Deleted");
                            await reloadParts();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={openNewSupplier} className="gap-1">
              <Plus className="w-4 h-4" />
              Add supplier
            </Button>
          </div>
          <div className={adminTableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-slate-900 dark:text-slate-100">Name</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Contact</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Default lead (d)</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{s.name}</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {[s.contact_email, s.contact_phone].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>{s.default_lead_time_days ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={async () => {
                          if (!window.confirm(`Delete supplier “${s.name}”?`)) return;
                          try {
                            await deleteSupplier(token, s.id);
                            toast.success("Deleted");
                            await reloadSuppliers();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="fitment" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className={adminLabel}>Filter by motor catalog row</Label>
              <Select
                value={fitmentCatalogFilter || "__all__"}
                onValueChange={(v) => setFitmentCatalogFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className={cn(adminSelectTrigger, "w-full min-w-0")}>
                  <SelectValue placeholder="All catalog rows" />
                </SelectTrigger>
                <SelectContent className={cn(adminSelectContent, "max-h-72")}>
                  <SelectItem className={adminSelectItem} value="__all__">
                    All
                  </SelectItem>
                  {catalog.map((r) => (
                    <SelectItem className={adminSelectItem} key={r.id} value={r.id}>
                      {r.make} {r.model} ({r.production_start_year}
                      {r.production_end_year != null ? `–${r.production_end_year}` : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" size="sm" onClick={() => void openNewFitment()} className="gap-1">
              <Plus className="w-4 h-4" />
              Add fitment
            </Button>
          </div>
          <div className={adminTableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-slate-900 dark:text-slate-100">Part</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Catalog ID</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Chassis / Engine gate</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Years</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {fitments.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{f.part_master?.name ?? f.part_id}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700 dark:text-slate-300">{f.vehicle_catalog_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                      {[f.chassis_code, f.engine_code].filter(Boolean).join(" / ") || "— (catalog id only)"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-800 dark:text-slate-200">
                      {f.year_from ?? "—"} – {f.year_to ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={async () => {
                          if (!window.confirm("Delete this fitment row?")) return;
                          try {
                            await deletePartFitment(token, f.id);
                            toast.success("Deleted");
                            await reloadFitments();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="offers" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void openNewOffer()} className="gap-1">
              <Plus className="w-4 h-4" />
              Add offer
            </Button>
          </div>
          <div className={adminTableWrap}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-slate-900 dark:text-slate-100">Part</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Supplier</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">SKU</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Price</TableHead>
                  <TableHead className="text-slate-900 dark:text-slate-100">Lead (d)</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-slate-900 dark:text-slate-100">{o.part_master?.name ?? o.part_id}</TableCell>
                    <TableCell className="text-slate-800 dark:text-slate-200">{o.supplier?.name ?? o.supplier_id}</TableCell>
                    <TableCell className="font-mono text-sm text-slate-800 dark:text-slate-200">{o.supplier_sku}</TableCell>
                    <TableCell className="text-slate-800 dark:text-slate-200">
                      {o.currency} {Number(o.unit_price).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-slate-800 dark:text-slate-200">{o.lead_time_days ?? o.supplier?.default_lead_time_days ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        onClick={async () => {
                          if (!window.confirm("Delete this offer?")) return;
                          try {
                            await deletePartOffer(token, o.id);
                            toast.success("Deleted");
                            await reloadOffers();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>Optional child categories can be added later under a parent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className={adminLabel} htmlFor="pc-slug">
                Slug
              </Label>
              <Input id="pc-slug" value={catSlug} onChange={(e) => setCatSlug(e.target.value)} placeholder="e.g. brake-pads" />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="pc-label">
                Label
              </Label>
              <Input id="pc-label" value={catLabel} onChange={(e) => setCatLabel(e.target.value)} placeholder="Display name" />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="pc-sort">
                Sort order
              </Label>
              <Input id="pc-sort" type="number" value={catSort} onChange={(e) => setCatSort(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partOpen} onOpenChange={setPartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New part</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className={adminLabel}>Category</Label>
              <Select value={partCategoryId} onValueChange={setPartCategoryId}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-full")}>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className={adminSelectContent}>
                  {categories.map((c) => (
                    <SelectItem className={adminSelectItem} key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={adminLabel} htmlFor="pn">
                Name
              </Label>
              <Input id="pn" value={partName} onChange={(e) => setPartName(e.target.value)} />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="po">
                OEM part number
              </Label>
              <Input id="po" value={partOem} onChange={(e) => setPartOem(e.target.value)} />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="pd">
                Description
              </Label>
              <Textarea id="pd" value={partDesc} onChange={(e) => setPartDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void savePart()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supOpen} onOpenChange={setSupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className={adminLabel} htmlFor="sn">
                Name
              </Label>
              <Input id="sn" value={supName} onChange={(e) => setSupName(e.target.value)} />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="se">
                Email
              </Label>
              <Input id="se" type="email" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="sp">
                Phone
              </Label>
              <Input id="sp" value={supPhone} onChange={(e) => setSupPhone(e.target.value)} />
            </div>
            <div>
              <Label className={adminLabel} htmlFor="sl">
                Default lead time (days)
              </Label>
              <Input id="sl" type="number" value={supLead} onChange={(e) => setSupLead(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveSupplier()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offOpen} onOpenChange={setOffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New supplier offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <Label className={adminLabel}>Supplier</Label>
              <Select value={offSupplierId} onValueChange={setOffSupplierId}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={adminSelectContent}>
                  {suppliers.map((s) => (
                    <SelectItem className={adminSelectItem} key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={adminLabel}>Part</Label>
              <Select value={offPartId} onValueChange={setOffPartId}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(adminSelectContent, "max-h-64")}>
                  {parts.map((p) => (
                    <SelectItem className={adminSelectItem} key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={adminLabel} htmlFor="osku">
                Supplier SKU
              </Label>
              <Input id="osku" value={offSku} onChange={(e) => setOffSku(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className={adminLabel} htmlFor="opr">
                  Price
                </Label>
                <Input id="opr" type="number" step="0.01" value={offPrice} onChange={(e) => setOffPrice(e.target.value)} />
              </div>
              <div>
                <Label className={adminLabel} htmlFor="ocu">
                  Currency
                </Label>
                <Input id="ocu" value={offCurrency} onChange={(e) => setOffCurrency(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className={adminLabel} htmlFor="old">
                Lead time override (days)
              </Label>
              <Input id="old" type="number" value={offLead} onChange={(e) => setOffLead(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOffOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveOffer()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fitOpen} onOpenChange={setFitOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New fitment</DialogTitle>
            <DialogDescription>Links a part to a motor catalog variant. Leave chassis/engine empty to match the whole catalog row.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <Label className={adminLabel}>Part</Label>
              <Select value={fitPartId} onValueChange={setFitPartId}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(adminSelectContent, "max-h-64")}>
                  {parts.map((p) => (
                    <SelectItem className={adminSelectItem} key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={adminLabel}>Motor catalog row</Label>
              <Select value={fitCatalogId} onValueChange={setFitCatalogId}>
                <SelectTrigger className={cn(adminSelectTrigger, "w-full")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(adminSelectContent, "max-h-64")}>
                  {catalog.map((r) => (
                    <SelectItem className={adminSelectItem} key={r.id} value={r.id}>
                      {r.make} {r.model} ({r.production_start_year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className={adminLabel} htmlFor="fc">
                  Chassis gate (optional)
                </Label>
                <Input id="fc" value={fitChassis} onChange={(e) => setFitChassis(e.target.value)} />
              </div>
              <div>
                <Label className={adminLabel} htmlFor="fe">
                  Engine gate (optional)
                </Label>
                <Input id="fe" value={fitEngine} onChange={(e) => setFitEngine(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className={adminLabel} htmlFor="yf">
                  Year from
                </Label>
                <Input id="yf" type="number" value={fitYearFrom} onChange={(e) => setFitYearFrom(e.target.value)} />
              </div>
              <div>
                <Label className={adminLabel} htmlFor="yt">
                  Year to
                </Label>
                <Input id="yt" type="number" value={fitYearTo} onChange={(e) => setFitYearTo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveFitment()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
