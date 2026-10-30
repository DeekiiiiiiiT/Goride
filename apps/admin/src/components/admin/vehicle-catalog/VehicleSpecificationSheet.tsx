// Stitch: dominion-redesign/d955104c499d440581c90e8a17bfc573 — eye overlay (S8)
import React from "react";
import {
  type LucideIcon,
  BadgeCheck,
  Bus,
  Fuel,
  Factory,
  Gauge,
  Ruler,
  Settings2,
  Weight,
  X,
} from "lucide-react";
import {
  formatCatalogProductionWindow,
  type VehicleCatalogRecord,
} from "../../../types/vehicleCatalog";

function dash(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function monoNum(value: number | null | undefined, suffix = ""): string {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value)).toLocaleString()}${suffix}`;
}

function displacementLine(r: VehicleCatalogRecord): string {
  const cc =
    r.engine_displacement_cc != null && Number.isFinite(Number(r.engine_displacement_cc))
      ? `${Math.round(Number(r.engine_displacement_cc)).toLocaleString()} cc`
      : null;
  const liters =
    r.engine_displacement_l != null && Number.isFinite(Number(r.engine_displacement_l))
      ? `${r.engine_displacement_l}L`
      : null;
  if (cc && liters) return `${cc} / ${liters}`;
  return cc || liters || "—";
}

function economyLine(r: VehicleCatalogRecord): string {
  if (r.fuel_economy_km_per_l == null || !Number.isFinite(Number(r.fuel_economy_km_per_l))) return "—";
  const kmL = Number(r.fuel_economy_km_per_l);
  const l100 = kmL > 0 ? (100 / kmL).toFixed(1) : null;
  return l100 ? `${l100} L/100km` : `${kmL} km/L`;
}

function SpecField({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</dt>
      <dd
        className={`mt-0.5 font-medium ${mono ? "font-mono" : ""} ${
          accent ? "font-semibold text-blue-700" : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function SpecCard({
  n,
  title,
  icon: Icon,
  children,
  wide,
}: {
  n: number;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/60 p-4 ${
        wide ? "lg:col-span-2 xl:col-span-2" : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-2.5">
        <Icon className="h-[18px] w-[18px] text-blue-600" strokeWidth={1.75} aria-hidden />
        <h3 className="font-headline text-[11px] font-semibold uppercase tracking-wider text-slate-800">
          {n}. {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

export function VehicleSpecificationSheet({
  record: r,
  onClose,
}: {
  record: VehicleCatalogRecord;
  onClose: () => void;
}) {
  const rootRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [r.id]);

  const titleModel = [r.model, r.catalog_trim].filter(Boolean).join(" ") || r.model;
  const yearLabel = r.production_start_year
    ? String(r.production_start_year)
    : formatCatalogProductionWindow(r);
  const vinHint = r.full_model_code || r.chassis_code || "—";
  const era = [r.generation, r.chassis_code].filter(Boolean).join(" ") || "—";
  const engineCode = [r.engine_code, r.engine_type].filter(Boolean).join(" ") || "—";
  const power =
    r.horsepower != null && Number.isFinite(Number(r.horsepower))
      ? `${r.horsepower} hp`
      : "—";
  const torque =
    r.torque != null && Number.isFinite(Number(r.torque))
      ? `${r.torque}${r.torque_unit ? ` ${r.torque_unit}` : ""}`
      : "—";
  const tank =
    r.fuel_tank_capacity != null
      ? `${r.fuel_tank_capacity}${r.fuel_tank_unit ? ` ${r.fuel_tank_unit}` : ""}`
      : "—";
  const seating =
    r.seating_capacity != null
      ? `${r.seating_capacity}${Number(r.seating_capacity) === 1 ? " seat" : " seats"}`
      : "—";
  const doors = r.doors != null ? `${r.doors}` : "—";

  return (
    <section
      ref={rootRef}
      className="mt-6 overflow-hidden rounded-[12px] border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600/10 text-blue-600">
            <BadgeCheck className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h2 className="font-headline text-sm font-bold leading-tight text-slate-900">
              Specification Sheet: {r.make} {titleModel} ({yearLabel})
            </h2>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">
              VIN PREFIX: {vinHint} | JAMAICA FLEET RECORD
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-slate-700">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            READ-ONLY INSPECTOR
          </span>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("page", "parts-catalog");
              url.searchParams.set("tab", "vehicle");
              url.searchParams.set("variant", r.id);
              window.history.pushState({ page: "parts-catalog" }, "", `${url.pathname}?${url.searchParams.toString()}`);
              window.dispatchEvent(new PopStateEvent("popstate"));
              onClose();
            }}
          >
            Parts for this vehicle
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close specification inspector"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 bg-white p-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <SpecCard n={1} title="Production" icon={Factory}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Assembly" value="—" />
            <SpecField label="Era" value={era} />
            <SpecField label="Fleet Grade" value={dash(r.catalog_trim || r.trim_series)} />
            <SpecField label="Vin Prefix" value={dash(vinHint)} mono accent />
          </dl>
        </SpecCard>

        <SpecCard n={2} title="Transmission" icon={Settings2}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Gearbox Type" value={dash(r.transmission)} />
            <SpecField label="Drive Configuration" value={dash(r.drivetrain)} />
            <SpecField label="Final Drive Ratio" value={dash(r.final_drive)} mono />
          </dl>
        </SpecCard>

        <SpecCard n={3} title="Body" icon={Bus}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Configuration" value={dash(r.body_type)} />
            <SpecField label="Seating Capacity" value={seating} />
            <SpecField label="Door Count" value={doors} />
            <SpecField label="Series / Facelift" value={dash(r.trim_series)} />
          </dl>
        </SpecCard>

        <SpecCard n={4} title="Engine" icon={Gauge}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Engine Code" value={engineCode} mono accent />
            <SpecField label="Displacement" value={displacementLine(r)} mono />
            <SpecField label="Power Output" value={power} mono />
            <SpecField label="Torque" value={torque} mono />
          </dl>
        </SpecCard>

        <SpecCard n={5} title="Fuel" icon={Fuel}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Fuel System" value={dash(r.fuel_category || r.fuel_type)} />
            <SpecField label="Fuel Grade" value={dash(r.fuel_grade || r.fuel_type)} />
            <SpecField label="Tank Capacity" value={tank} mono />
            <SpecField label="Avg Economy" value={economyLine(r)} mono />
          </dl>
        </SpecCard>

        <SpecCard n={6} title="Dimensions" icon={Ruler}>
          <dl className="space-y-2.5 text-xs">
            <SpecField label="Overall Length" value={monoNum(r.length_mm, " mm")} mono />
            <SpecField label="Overall Width" value={monoNum(r.width_mm, " mm")} mono />
            <SpecField label="Overall Height" value={monoNum(r.height_mm, " mm")} mono />
            <SpecField label="Wheelbase" value={monoNum(r.wheelbase_mm, " mm")} mono />
          </dl>
        </SpecCard>

        <SpecCard n={7} title="Weight" icon={Weight} wide>
          <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
            <SpecField label="Kerb Weight" value={monoNum(r.curb_weight_kg, " kg")} mono />
            <SpecField
              label="Gross Vehicle Mass"
              value={monoNum(r.gross_vehicle_weight_kg, " kg")}
              mono
            />
            <SpecField label="Payload Rating" value={monoNum(r.max_payload_kg, " kg")} mono />
            <SpecField label="Max Towing Capacity" value={monoNum(r.max_towing_kg, " kg")} mono />
          </dl>
        </SpecCard>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 font-mono text-[11px] text-slate-500">
        <span>
          Updated {new Date(r.updated_at).toLocaleString()}
          {r.created_at !== r.updated_at ? ` · Created ${new Date(r.created_at).toLocaleString()}` : ""}
        </span>
        <span>DOMINION · READ-ONLY</span>
      </div>
    </section>
  );
}
