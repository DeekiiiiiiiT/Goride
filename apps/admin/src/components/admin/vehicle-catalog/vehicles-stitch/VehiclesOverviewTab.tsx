/**
 * V4 — car page Overview, ported from docs/stitch/dominion-vehicles-catalog/toyota_roomy_overview/code.html.
 * Facts come only from the car's own columns (audit V4). Area counts come from the key-parts jobs; nothing is typed in.
 */
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import type { SisterVehicleRow } from "../vehiclesCatalogApi";
import { factValue } from "./vehiclesStitchShared";
import { versionYearsLabel } from "@roam/vehicle-catalog-core";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon } from "../../parts-database/add-parts/catalog/dominionKit";

type SpecRow = { specKey?: string; value?: string | null };
type JobRow = { status?: string; section?: string };

type Props = {
  car: VehicleCatalogRecord;
  specs: SpecRow[];
  jobs: JobRow[];
  sisters: SisterVehicleRow[];
  logoByMake: Map<string, string | null | undefined>;
  items: VehicleCatalogRecord[];
  onOpenCar: (r: VehicleCatalogRecord) => void;
  onTabParts: () => void;
  onAddFact: () => void;
};

export function VehiclesOverviewTab({ car, specs, jobs, sisters, logoByMake, items, onOpenCar, onTabParts, onAddFact }: Props) {
  const facts: Array<{ label: string; value: string | null; icon: string }> = [
    { label: "Years", value: versionYearsLabel(car.production_start_year, car.production_end_year), icon: "calendar_month" },
    { label: "Body", value: factValue(car.body_type), icon: "directions_car" },
    { label: "Drive", value: factValue(car.drivetrain), icon: "swap_driving_apps_wheel" },
    { label: "Engine", value: factValue(car.engine_code), icon: "settings" },
    { label: "Fuel", value: factValue(car.fuel_type ?? car.fuel_category), icon: "local_gas_station" },
    { label: "Gearbox", value: factValue(car.transmission), icon: "auto_transmission" },
    { label: "Seats", value: factValue(car.seating_capacity), icon: "airline_seat_recline_normal" },
    { label: "Doors", value: factValue(car.doors), icon: "door_front" },
  ];

  const specsOnFile = specs.filter((s) => s.value).length;
  const specsMissing = Math.max(0, 17 - specsOnFile);
  const readyJobs = jobs.filter((j) => j.status === "verified").length;
  const totalJobs = jobs.length;
  const pct = totalJobs ? readyJobs / totalJobs : 0;

  const areaCounts = new Map<string, number>();
  for (const j of jobs) {
    if (j.status !== "verified" || !j.section) continue;
    areaCounts.set(j.section, (areaCounts.get(j.section) ?? 0) + 1);
  }

  const sisterRows = sisters.filter((s) => s.model !== car.model).slice(0, 4);
  const r = 26;
  const c = 2 * Math.PI * r;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className={`${D_CARD} p-6 lg:col-span-2`}>
        <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Facts</h2>
        <p className={`mb-4 text-[14px] ${D_MUTED}`}>What this version is, from the car&apos;s own record.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-start gap-3 rounded-xl bg-[#f3f4fb] px-4 py-3 dark:bg-[#0b1220]">
              <DIcon name={f.icon} className="mt-0.5 text-[20px] text-[#5d5f68]" />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] ${D_MUTED}`}>{f.label}</p>
                {f.value ? (
                  <p className={`text-[16px] font-medium ${D_TXT}`}>{f.value}</p>
                ) : (
                  <p className="flex items-center justify-between gap-2">
                    <span className={`text-[14px] italic ${D_MUTED}`}>Not on file</span>
                    <PartsButton variant="secondary" className="!h-7 !px-2 text-[12px]" onClick={onAddFact}>
                      <DIcon name="add" className="text-[14px]" /> Add
                    </PartsButton>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className={`${D_CARD} flex h-fit flex-col gap-5 p-6`}>
        <h2 className={`text-[18px] font-semibold ${D_TXT}`}>At a glance</h2>
        <div className="flex items-center gap-4 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
          <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-label="Key parts readiness">
            <circle cx="32" cy="32" r={r} fill="none" stroke="#e6e7ee" strokeWidth="6" />
            <circle cx="32" cy="32" r={r} fill="none" stroke="#0153dc" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
          </svg>
          <div className="flex flex-col">
            <span className={`text-[20px] font-semibold ${D_MONO} ${D_TXT}`}>{totalJobs ? `${readyJobs} of ${totalJobs}` : "—"}</span>
            <span className={`text-[13px] ${D_MUTED}`}>key parts ready</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#e6f4ea] p-3 dark:bg-[#14532d]/30">
            <p className="text-[20px] font-semibold text-[#006e31] dark:text-[#4ade80]">{specsOnFile}</p>
            <p className={`text-[12px] ${D_MUTED}`}>specs on file</p>
          </div>
          <div className="rounded-xl bg-[#f3f4fb] p-3 dark:bg-[#0b1220]">
            <p className={`text-[20px] font-semibold ${D_TXT}`}>{specsMissing}</p>
            <p className={`text-[12px] ${D_MUTED}`}>specs not on file</p>
          </div>
        </div>
        {areaCounts.size ? (
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {[...areaCounts.entries()].map(([name, n]) => (
              <li key={name} className="flex justify-between">
                <span className={D_TXT}>{name}</span>
                <span className={`${D_MONO} ${D_MUTED}`}>{n} on file</span>
              </li>
            ))}
          </ul>
        ) : null}
        {sisterRows.length ? (
          <div className="flex flex-col gap-2">
            <p className={`text-[14px] font-semibold ${D_TXT}`}>Sister cars</p>
            {sisterRows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-[#f3f4fb] px-3 py-2.5 dark:bg-[#0b1220]">
                <MakerLogo make={s.make} logoStoragePath={logoByMake.get(s.make.toLowerCase())} size={28} />
                <span className={`flex-1 text-[14px] font-medium ${D_TXT}`}>{s.make} {s.model}</span>
                <PartsButton
                  variant="secondary"
                  className="!h-8 !px-2.5 text-[12px]"
                  onClick={() => {
                    const row = items.find((x) => x.id === s.id);
                    if (row) onOpenCar(row);
                  }}
                >
                  Open
                </PartsButton>
              </div>
            ))}
          </div>
        ) : null}
        <PartsButton variant="secondary" className="w-full justify-between" onClick={onTabParts}>
          <span className="flex items-center gap-2"><DIcon name="inventory_2" className="text-[18px]" /> View parts on file</span>
          <DIcon name="arrow_forward" className="text-[18px]" />
        </PartsButton>
      </aside>
    </div>
  );
}
