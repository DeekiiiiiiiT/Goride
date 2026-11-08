/**
 * V8 Frame A — Sister cars, ported from docs/stitch/dominion-vehicles-catalog/toyota_roomy_sister_cars_history/code.html.
 * "Link another sister car" is left out until there is a save behind it (no dead buttons).
 */
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import type { SisterVehicleRow } from "../vehiclesCatalogApi";
import { D_CARD, D_MUTED, D_TXT, DCode, DIcon } from "../../parts-database/add-parts/catalog/dominionKit";

type Props = {
  car: VehicleCatalogRecord;
  sisters: SisterVehicleRow[];
  items: VehicleCatalogRecord[];
  logoByMake: Map<string, string | null | undefined>;
  onOpenCar: (r: VehicleCatalogRecord) => void;
};

export function VehiclesSisterTab({ car, sisters, items, logoByMake, onOpenCar }: Props) {
  const badges = sisters.filter((s) => s.make !== car.make || s.model !== car.model);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl bg-[#f3f6ff] p-4 dark:bg-[#1e3a8a]/20">
        <DIcon name="link" className="text-[22px] text-[#0153dc]" />
        <p className={`text-[15px] ${D_TXT}`}>Same car sold under other badges. Most parts and specs are shared.</p>
      </div>
      {badges.length === 0 ? (
        <p className={`${D_CARD} p-6 text-[15px] ${D_MUTED}`}>No sister cars are linked to this car.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {badges.map((s) => {
            const versions = items.filter((r) => r.make === s.make && r.model === s.model && r.id !== car.id);
            const match = versions.length ? versions : items.filter((r) => r.id === s.id);
            return (
              <article key={s.id} className={`${D_CARD} flex flex-col gap-4 p-5`}>
                <div className="flex items-center gap-3">
                  <MakerLogo make={s.make} logoStoragePath={logoByMake.get(s.make.toLowerCase())} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[18px] font-semibold ${D_TXT}`}>{s.make} {s.model}</p>
                    <p className={`text-[13px] ${D_MUTED}`}>
                      {match.length} version{match.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <PartsButton
                    variant="secondary"
                    className="!h-9"
                    onClick={() => {
                      const row = items.find((r) => r.id === s.id) ?? match[0];
                      if (row) onOpenCar(row);
                    }}
                  >
                    Open <DIcon name="arrow_forward" className="text-[16px]" />
                  </PartsButton>
                </div>
                {match.length ? (
                  <ul className="flex flex-col gap-2">
                    {match.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#f3f4fb] px-3 py-2 dark:bg-[#0b1220]">
                        <span className={`text-[14px] ${D_TXT}`}>
                          {versionYearsLabel(v.production_start_year, v.production_end_year)} · {versionDifferenceLabel(v)}
                        </span>
                        {v.chassis_code ? <DCode>{v.chassis_code}</DCode> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
