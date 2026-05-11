// Reusable picker that resolves a fleet vehicle to a single `vehicle_catalog`
// row at create time. Hybrid catalog matching:
//   - 0 candidates: amber "no match" panel; vehicle gets parked + queued.
//   - 1 candidate:  green auto-match card; we report it to the parent.
//   - 2+ candidates: force-pick list; parent's Save stays disabled until pick.
//
// Used by AddVehicleModal (new "Confirm motor type" sub-step) and by
// VehicleDetail (replaces the bespoke alignSearch* state) so behaviour stays
// identical across the app.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { listVehicleCatalogMatchesWithCount } from "../../services/pendingVehicleCatalogService";
import {
  formatCatalogProductionWindow,
  type VehicleCatalogRecord,
} from "../../types/vehicleCatalog";
import { cn } from "../ui/utils";

export type CatalogVariantPickerSource = "auto" | "manual" | "none" | "pending";

export interface CatalogVariantPickerProps {
  /** Required disambiguators (best effort - empty strings are skipped). */
  make: string;
  model: string;
  year: string;
  /** Optional disambiguators sent to the matches endpoint. */
  month?: string | number | null;
  trim?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  body_type?: string | null;
  engine_code?: string | null;
  engine_type?: string | null;
  catalog_trim?: string | null;
  full_model_code?: string | null;
  /** OEM chassis / frame index prefix (e.g. M900A) — narrows results via ilike on chassis_code. */
  chassis_code?: string | null;
  /** Currently picked catalog row id (or null when no selection yet). */
  value: string | null;
  /**
   * Fired whenever the picker decides the current state. `source` lets the
   * parent know whether the value came from auto-match (1 result), an explicit
   * user pick (N>=2), or "no match" (0 results - parent should still allow
   * save and the server will queue a pending request).
   */
  onChange: (row: VehicleCatalogRecord | null, source: CatalogVariantPickerSource) => void;
  /** Disables interaction (e.g. while parent is saving). */
  disabled?: boolean;
  /** Optional className for the outer container (small layouts). */
  className?: string;
}

function trimOrUndef(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function variantLine(row: VehicleCatalogRecord): string {
  const bits = [
    row.trim_series,
    row.catalog_trim,
    row.chassis_code,
    row.full_model_code,
    row.drivetrain,
    row.fuel_type,
    row.transmission,
  ]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  return bits.length > 0 ? bits.join(" \u00B7 ") : "Variant details unavailable";
}

export function CatalogVariantPicker(props: CatalogVariantPickerProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const {
    make,
    model,
    year,
    month,
    trim,
    drivetrain,
    transmission,
    fuel_type,
    body_type,
    engine_code,
    engine_type,
    catalog_trim,
    full_model_code,
    chassis_code,
    value,
    onChange,
    disabled,
    className,
  } = props;

  const [items, setItems] = useState<VehicleCatalogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = make.trim().length >= 2 && model.trim().length >= 2 && year.trim().length === 4;

  // Stable serialization of the inputs so the debounced fetch only re-runs
  // when something the server actually filters on changes.
  const queryKey = useMemo(
    () => [
      make.trim().toLowerCase(),
      model.trim().toLowerCase(),
      year.trim(),
      String(month ?? ""),
      String(trim ?? "").trim().toLowerCase(),
      String(drivetrain ?? "").trim().toLowerCase(),
      String(transmission ?? "").trim().toLowerCase(),
      String(fuel_type ?? "").trim().toLowerCase(),
      String(body_type ?? "").trim().toLowerCase(),
      String(engine_code ?? "").trim().toLowerCase(),
      String(engine_type ?? "").trim().toLowerCase(),
      String(catalog_trim ?? "").trim().toLowerCase(),
      String(full_model_code ?? "").trim().toLowerCase(),
      String(chassis_code ?? "").trim().toUpperCase(),
    ].join("|"),
    [
      make,
      model,
      year,
      month,
      trim,
      drivetrain,
      transmission,
      fuel_type,
      body_type,
      engine_code,
      engine_type,
      catalog_trim,
      full_model_code,
      chassis_code,
    ],
  );

  // The latest fired request id so a stale-debounce-resolve can't overwrite a
  // newer result (e.g. user keeps typing while the network is slow).
  const reqIdRef = useRef(0);
  // Latest onChange so we don't restart the debounce when parents pass new fns.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!token) return;
    if (!ready) {
      setItems([]);
      setLoading(false);
      setError(null);
      onChangeRef.current(null, "none");
      return;
    }
    setLoading(true);
    setError(null);
    const myReqId = ++reqIdRef.current;
    const handle = window.setTimeout(() => {
      listVehicleCatalogMatchesWithCount(token, {
        make: trimOrUndef(make),
        model: trimOrUndef(model),
        year: trimOrUndef(year),
        month: trimOrUndef(month ?? undefined),
        trim_series: trimOrUndef(trim ?? undefined),
        drivetrain: trimOrUndef(drivetrain ?? undefined),
        transmission: trimOrUndef(transmission ?? undefined),
        fuel_type: trimOrUndef(fuel_type ?? undefined),
        body_type: trimOrUndef(body_type ?? undefined),
        engine_code: trimOrUndef(engine_code ?? undefined),
        engine_type: trimOrUndef(engine_type ?? undefined),
        catalog_trim: trimOrUndef(catalog_trim ?? undefined),
        full_model_code: trimOrUndef(full_model_code ?? undefined),
        chassis_code: trimOrUndef(chassis_code ?? undefined),
      })
        .then((res) => {
          if (myReqId !== reqIdRef.current) return;
          setItems(res.items);
          if (res.items.length === 1) {
            onChangeRef.current(res.items[0], "auto");
          } else if (res.items.length === 0) {
            onChangeRef.current(null, "none");
          } else {
            // 2+ candidates: clear any previous auto-pick if the candidate set
            // has changed. Keep an explicit pick if it's still in the new list.
            const stillPresent = value && res.items.some((r) => r.id === value);
            if (!stillPresent) {
              onChangeRef.current(null, "pending");
            }
          }
        })
        .catch((e: unknown) => {
          if (myReqId !== reqIdRef.current) return;
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setItems([]);
          onChangeRef.current(null, "none");
        })
        .finally(() => {
          if (myReqId !== reqIdRef.current) return;
          setLoading(false);
        });
    }, 350);
    return () => window.clearTimeout(handle);
    // queryKey intentionally collapses every input into a single dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ready, queryKey]);

  if (!ready) {
    return (
      <div className={cn("rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600", className)}>
        Enter make, model, and year to look up the official motor type.
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Looking up the official motor catalog...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800", className)}>
        Could not query the motor catalog: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900",
          className,
        )}
        data-testid="catalog-picker-no-match"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium">No exact match in the motor catalog yet.</p>
          <p className="text-amber-800/90">
            We'll save the vehicle as <span className="font-medium">parked</span> and queue a request for a platform admin to add this exact variant.
            Operational actions (trips, fuel, service) unlock automatically once it's approved.
          </p>
        </div>
      </div>
    );
  }

  if (items.length === 1) {
    const row = items[0];
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900",
          className,
        )}
        data-testid="catalog-picker-auto-match"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
        <div className="space-y-1">
          <p className="font-medium">
            Auto-matched: {formatCatalogProductionWindow(row)} {row.make} {row.model}
          </p>
          <p className="text-emerald-800/90">{variantLine(row)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="catalog-picker-force-pick">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
        <p>
          {items.length} variants match this make / model / year. Pick the one printed on the registration to avoid mis-matched maintenance schedules.
        </p>
      </div>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border bg-white p-1">
        {items.map((row) => {
          const selected = value === row.id;
          return (
            <li key={row.id}>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onChangeRef.current(row, "manual")}
                className={cn(
                  "flex w-full flex-col rounded-md border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                    : "border-transparent hover:border-indigo-200 hover:bg-slate-50",
                )}
              >
                <span className="font-medium text-slate-900">
                  {formatCatalogProductionWindow(row)} {row.make} {row.model}
                </span>
                <span className="text-xs text-slate-500">{variantLine(row)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">
        Showing the top {items.length} candidates. Add trim or chassis code in the form to narrow further.
      </p>
    </div>
  );
}

export default CatalogVariantPicker;
