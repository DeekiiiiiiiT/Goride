/**
 * V12 — states and dialogs, ported from docs/stitch/dominion-vehicles-catalog/vehicles_system_states_dialogs/code.html.
 */
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import { D_CARD, D_MUTED, D_TXT, DIcon, DIconTile } from "../../parts-database/add-parts/catalog/dominionKit";

type Props = {
  onAddCar: () => void;
  onRetry: () => void;
  car: VehicleCatalogRecord | null;
  onKeepRetire: () => void;
  onConfirmRetire: () => void;
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <p className={`text-[13px] font-semibold uppercase tracking-wide ${D_MUTED}`}>{label}</p>
      {children}
    </section>
  );
}

export function VehiclesStatesGallery({ onAddCar, onRetry, car, onKeepRetire, onConfirmRetire }: Props) {
  return (
    <div className="vehicles-database-stitch parts-database-stitch flex max-w-4xl flex-col gap-8 px-margin py-space-lg">
      <div>
        <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>States</h1>
        <p className={`text-[15px] ${D_MUTED}`}>What Vehicles shows when there is nothing, while loading, on an error, and before retiring.</p>
      </div>

      <Frame label="No results">
        <div className={`${D_CARD} flex flex-col items-center gap-3 p-10 text-center`}>
          <DIconTile name="search_off" tone="grey" />
          <p className={`text-[18px] font-semibold ${D_TXT}`}>No car matches &quot;roomy 2014&quot;.</p>
          <p className={`text-[14px] ${D_MUTED}`}>Check the spelling, or add the car.</p>
          <PartsButton variant="primary" onClick={onAddCar}>
            <DIcon name="add" className="text-[18px]" /> Add a car
          </PartsButton>
        </div>
      </Frame>

      <Frame label="Loading">
        <div className={`${D_CARD} flex animate-pulse flex-col gap-3 p-6`}>
          <div className="h-12 rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-16 rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]" />
            <div className="h-16 rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]" />
            <div className="h-16 rounded-xl bg-[#eef0f6] dark:bg-[#1e293b]" />
          </div>
        </div>
      </Frame>

      <Frame label="Couldn't load">
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#f2b8b5] bg-[#fdecea] p-4 dark:border-[#7f1d1d] dark:bg-[#450a0a] sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-[15px] text-[#93000a] dark:text-[#fca5a5]">
            <DIcon name="error" className="text-[20px]" /> We couldn&apos;t load the cars. Nothing was changed.
          </p>
          <PartsButton variant="secondary" className="shrink-0" onClick={onRetry}>
            <DIcon name="refresh" className="text-[18px]" /> Try again
          </PartsButton>
        </div>
      </Frame>

      <Frame label="Retire">
        {car ? (
          <div className={`${D_CARD} w-full max-w-md p-6 shadow-xl`}>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#fdecea] text-[#ba1a1a] dark:bg-[#450a0a] dark:text-[#fca5a5]">
              <DIcon name="archive" className="text-[22px]" />
            </div>
            <p className={`mb-2 text-[19px] font-semibold ${D_TXT}`}>
              Retire {car.make} {car.model} {versionYearsLabel(car.production_start_year, car.production_end_year)} {versionDifferenceLabel(car)}?
            </p>
            <p className={`mb-5 text-[14px] ${D_MUTED}`}>It disappears from Fleet and Plug car pickers. Parts stay on file.</p>
            <div className="flex justify-end gap-2">
              <PartsButton variant="secondary" onClick={onKeepRetire}>Keep it</PartsButton>
              <PartsButton variant="danger" onClick={onConfirmRetire}>
                <DIcon name="archive" className="text-[18px]" /> Retire
              </PartsButton>
            </div>
          </div>
        ) : (
          <p className={`text-[14px] ${D_MUTED}`}>Pick a car to preview this dialog.</p>
        )}
      </Frame>
    </div>
  );
}
