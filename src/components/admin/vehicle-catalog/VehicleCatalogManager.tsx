import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  createVehicleCatalog,
  deleteVehicleCatalog,
  listVehicleCatalog,
  updateVehicleCatalog,
} from "../../../services/vehicleCatalogService";
import type { VehicleCatalogCreatePayload, VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

type FormState = {
  make: string;
  model: string;
  year: string;
  trim_series: string;
  generation: string;
  body_type: string;
  doors: string;
  exterior_color: string;
  length_mm: string;
  width_mm: string;
  height_mm: string;
  wheelbase_mm: string;
  ground_clearance_mm: string;
  engine_displacement_l: string;
  engine_displacement_cc: string;
  engine_configuration: string;
  fuel_type: string;
  transmission: string;
  drivetrain: string;
  horsepower: string;
  torque: string;
  torque_unit: string;
  fuel_tank_capacity: string;
  fuel_tank_unit: string;
  seating_capacity: string;
  curb_weight_kg: string;
  gross_vehicle_weight_kg: string;
  max_payload_kg: string;
  max_towing_kg: string;
};

function emptyForm(): FormState {
  return {
    make: "",
    model: "",
    year: String(new Date().getFullYear()),
    trim_series: "",
    generation: "",
    body_type: "",
    doors: "",
    exterior_color: "",
    length_mm: "",
    width_mm: "",
    height_mm: "",
    wheelbase_mm: "",
    ground_clearance_mm: "",
    engine_displacement_l: "",
    engine_displacement_cc: "",
    engine_configuration: "",
    fuel_type: "",
    transmission: "",
    drivetrain: "",
    horsepower: "",
    torque: "",
    torque_unit: "Nm",
    fuel_tank_capacity: "",
    fuel_tank_unit: "L",
    seating_capacity: "",
    curb_weight_kg: "",
    gross_vehicle_weight_kg: "",
    max_payload_kg: "",
    max_towing_kg: "",
  };
}

function recordToForm(r: VehicleCatalogRecord): FormState {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const t = (v: string | null | undefined) => v ?? "";
  return {
    make: r.make,
    model: r.model,
    year: String(r.year),
    trim_series: t(r.trim_series),
    generation: s(r.generation),
    body_type: t(r.body_type),
    doors: s(r.doors),
    exterior_color: t(r.exterior_color),
    length_mm: s(r.length_mm),
    width_mm: s(r.width_mm),
    height_mm: s(r.height_mm),
    wheelbase_mm: s(r.wheelbase_mm),
    ground_clearance_mm: s(r.ground_clearance_mm),
    engine_displacement_l: s(r.engine_displacement_l),
    engine_displacement_cc: s(r.engine_displacement_cc),
    engine_configuration: t(r.engine_configuration),
    fuel_type: t(r.fuel_type),
    transmission: t(r.transmission),
    drivetrain: t(r.drivetrain),
    horsepower: s(r.horsepower),
    torque: s(r.torque),
    torque_unit: t(r.torque_unit) || "Nm",
    fuel_tank_capacity: s(r.fuel_tank_capacity),
    fuel_tank_unit: t(r.fuel_tank_unit) || "L",
    seating_capacity: s(r.seating_capacity),
    curb_weight_kg: s(r.curb_weight_kg),
    gross_vehicle_weight_kg: s(r.gross_vehicle_weight_kg),
    max_payload_kg: s(r.max_payload_kg),
    max_towing_kg: s(r.max_towing_kg),
  };
}

function optInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function optNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toCreatePayload(form: FormState): VehicleCatalogCreatePayload {
  const year = parseInt(form.year, 10);
  const base: VehicleCatalogCreatePayload = {
    make: form.make.trim(),
    model: form.model.trim(),
    year,
  };
  const assign = (k: keyof VehicleCatalogRecord, v: unknown) => {
    if (v !== undefined && v !== null) (base as Record<string, unknown>)[k as string] = v;
  };
  assign("trim_series", form.trim_series.trim() || null);
  assign("generation", optInt(form.generation));
  assign("body_type", form.body_type.trim() || null);
  assign("doors", optInt(form.doors));
  assign("exterior_color", form.exterior_color.trim() || null);
  assign("length_mm", optNum(form.length_mm));
  assign("width_mm", optNum(form.width_mm));
  assign("height_mm", optNum(form.height_mm));
  assign("wheelbase_mm", optNum(form.wheelbase_mm));
  assign("ground_clearance_mm", optNum(form.ground_clearance_mm));
  assign("engine_displacement_l", optNum(form.engine_displacement_l));
  assign("engine_displacement_cc", optNum(form.engine_displacement_cc));
  assign("engine_configuration", form.engine_configuration.trim() || null);
  assign("fuel_type", form.fuel_type.trim() || null);
  assign("transmission", form.transmission.trim() || null);
  assign("drivetrain", form.drivetrain.trim() || null);
  assign("horsepower", optNum(form.horsepower));
  assign("torque", optNum(form.torque));
  assign("torque_unit", form.torque_unit.trim() || null);
  assign("fuel_tank_capacity", optNum(form.fuel_tank_capacity));
  assign("fuel_tank_unit", form.fuel_tank_unit.trim() || null);
  assign("seating_capacity", optInt(form.seating_capacity));
  assign("curb_weight_kg", optNum(form.curb_weight_kg));
  assign("gross_vehicle_weight_kg", optNum(form.gross_vehicle_weight_kg));
  assign("max_payload_kg", optNum(form.max_payload_kg));
  assign("max_towing_kg", optNum(form.max_towing_kg));
  return base;
}

function toPatchPayload(form: FormState): Partial<VehicleCatalogRecord> {
  const year = parseInt(form.year, 10);
  return {
    make: form.make.trim(),
    model: form.model.trim(),
    year: Number.isFinite(year) ? year : 0,
    trim_series: form.trim_series.trim() || null,
    generation: optInt(form.generation),
    body_type: form.body_type.trim() || null,
    doors: optInt(form.doors),
    exterior_color: form.exterior_color.trim() || null,
    length_mm: optNum(form.length_mm),
    width_mm: optNum(form.width_mm),
    height_mm: optNum(form.height_mm),
    wheelbase_mm: optNum(form.wheelbase_mm),
    ground_clearance_mm: optNum(form.ground_clearance_mm),
    engine_displacement_l: optNum(form.engine_displacement_l),
    engine_displacement_cc: optNum(form.engine_displacement_cc),
    engine_configuration: form.engine_configuration.trim() || null,
    fuel_type: form.fuel_type.trim() || null,
    transmission: form.transmission.trim() || null,
    drivetrain: form.drivetrain.trim() || null,
    horsepower: optNum(form.horsepower),
    torque: optNum(form.torque),
    torque_unit: form.torque_unit.trim() || null,
    fuel_tank_capacity: optNum(form.fuel_tank_capacity),
    fuel_tank_unit: form.fuel_tank_unit.trim() || null,
    seating_capacity: optInt(form.seating_capacity),
    curb_weight_kg: optNum(form.curb_weight_kg),
    gross_vehicle_weight_kg: optNum(form.gross_vehicle_weight_kg),
    max_payload_kg: optNum(form.max_payload_kg),
    max_towing_kg: optNum(form.max_towing_kg),
  };
}

export function VehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;

  const [items, setItems] = useState<VehicleCatalogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listVehicleCatalog(token);
      setItems(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vehicle catalog");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (row: VehicleCatalogRecord) => {
    setEditingId(row.id);
    setForm(recordToForm(row));
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const make = form.make.trim();
    const model = form.model.trim();
    const year = parseInt(form.year, 10);
    if (!make || !model) {
      setError("Make and model are required.");
      return;
    }
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      setError("Year must be between 1900 and 2100.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateVehicleCatalog(token, editingId, toPatchPayload(form));
      } else {
        await createVehicleCatalog(token, toCreatePayload(form));
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: VehicleCatalogRecord) => {
    if (!token) return;
    if (!window.confirm(`Delete ${row.make} ${row.model} (${row.year})?`)) return;
    setError(null);
    try {
      await deleteVehicleCatalog(token, row.id);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const update =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  if (!token) {
    return <p className="text-sm text-slate-500">Sign in to manage the vehicle catalog.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Motor vehicles</h2>
          <p className="text-sm text-slate-500">
            Platform-wide vehicle specifications. Used as reference data for fleets.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0 gap-2">
          <Plus className="w-4 h-4" />
          Add vehicle
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Make</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Year</TableHead>
              <TableHead className="hidden md:table-cell">Trim</TableHead>
              <TableHead className="hidden lg:table-cell">Body</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                  No vehicles yet. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.make}</TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell>{row.year}</TableCell>
                  <TableCell className="hidden md:table-cell text-slate-600">
                    {row.trim_series ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-slate-600">
                    {row.body_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(row)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="primary" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full justify-start">
              <TabsTrigger value="primary" className="text-xs sm:text-sm">
                Primary ID
              </TabsTrigger>
              <TabsTrigger value="body" className="text-xs sm:text-sm">
                Body
              </TabsTrigger>
              <TabsTrigger value="engine" className="text-xs sm:text-sm">
                Engine
              </TabsTrigger>
              <TabsTrigger value="capacity" className="text-xs sm:text-sm">
                Capacity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="primary" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Make *" value={form.make} onChange={update("make")} />
                <Field label="Model *" value={form.model} onChange={update("model")} />
                <Field label="Year *" value={form.year} onChange={update("year")} type="number" />
                <Field label="Trim / series" value={form.trim_series} onChange={update("trim_series")} />
                <Field label="Generation" value={form.generation} onChange={update("generation")} type="number" />
              </div>
            </TabsContent>

            <TabsContent value="body" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Body type" value={form.body_type} onChange={update("body_type")} />
                <Field label="Doors" value={form.doors} onChange={update("doors")} type="number" />
                <Field label="Exterior color" value={form.exterior_color} onChange={update("exterior_color")} />
                <Field label="Length (mm)" value={form.length_mm} onChange={update("length_mm")} />
                <Field label="Width (mm)" value={form.width_mm} onChange={update("width_mm")} />
                <Field label="Height (mm)" value={form.height_mm} onChange={update("height_mm")} />
                <Field label="Wheelbase (mm)" value={form.wheelbase_mm} onChange={update("wheelbase_mm")} />
                <Field
                  label="Ground clearance (mm)"
                  value={form.ground_clearance_mm}
                  onChange={update("ground_clearance_mm")}
                />
              </div>
            </TabsContent>

            <TabsContent value="engine" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Displacement (L)" value={form.engine_displacement_l} onChange={update("engine_displacement_l")} />
                <Field label="Displacement (cc)" value={form.engine_displacement_cc} onChange={update("engine_displacement_cc")} />
                <Field
                  label="Configuration"
                  value={form.engine_configuration}
                  onChange={update("engine_configuration")}
                  placeholder="e.g. I4, V6"
                />
                <Field label="Fuel type" value={form.fuel_type} onChange={update("fuel_type")} />
                <Field label="Transmission" value={form.transmission} onChange={update("transmission")} />
                <Field label="Drivetrain" value={form.drivetrain} onChange={update("drivetrain")} />
                <Field label="Horsepower" value={form.horsepower} onChange={update("horsepower")} />
                <Field label="Torque" value={form.torque} onChange={update("torque")} />
                <Field label="Torque unit" value={form.torque_unit} onChange={update("torque_unit")} placeholder="Nm" />
              </div>
            </TabsContent>

            <TabsContent value="capacity" className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Fuel tank capacity" value={form.fuel_tank_capacity} onChange={update("fuel_tank_capacity")} />
                <Field label="Fuel tank unit" value={form.fuel_tank_unit} onChange={update("fuel_tank_unit")} placeholder="L" />
                <Field label="Seating" value={form.seating_capacity} onChange={update("seating_capacity")} type="number" />
                <Field label="Curb weight (kg)" value={form.curb_weight_kg} onChange={update("curb_weight_kg")} />
                <Field label="GVWR (kg)" value={form.gross_vehicle_weight_kg} onChange={update("gross_vehicle_weight_kg")} />
                <Field label="Max payload (kg)" value={form.max_payload_kg} onChange={update("max_payload_kg")} />
                <Field label="Max towing (kg)" value={form.max_towing_kg} onChange={update("max_towing_kg")} />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="bg-white"
      />
    </div>
  );
}
