import { useMemo, useState } from "react";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_MONO, D_MUTED, D_TXT, DIcon, DIconTile } from "../../parts-database/add-parts/catalog/dominionKit";
import { VEHICLE_SPEC_GROUP_DEFS, specSourcePill } from "./vehiclesSpecGroups";

type SpecKey = { key: string; label: string; unit?: string | null };
type SpecRow = { specKey?: string; label?: string; value?: string | null; reach?: string | null; unit?: string | null };

type Props = {
  car: VehicleCatalogRecord;
  specKeys: SpecKey[];
  specs: SpecRow[];
  onAddSpec: () => void;
  onEditSpec: () => void;
};

export function VehiclesCarSpecsTab({ car, specKeys, specs, onAddSpec, onEditSpec }: Props) {
  const [filter, setFilter] = useState("");

  const byKey = useMemo(() => {
    const m = new Map<string, SpecRow>();
    for (const s of specs) {
      if (s.specKey) m.set(s.specKey, s);
    }
    return m;
  }, [specs]);

  const labelFor = (key: string) => specKeys.find((k) => k.key === key)?.label ?? key;

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return VEHICLE_SPEC_GROUP_DEFS.map((g) => ({
      ...g,
      rows: g.keys.filter((key) => {
        const label = key === "front_brakes" ? "Front brakes" : key === "rear_brakes" ? "Rear brakes" : labelFor(key);
        if (!q) return true;
        return label.toLowerCase().includes(q);
      }),
    })).filter((g) => g.rows.length > 0);
  }, [filter, specKeys]);

  function valueFor(key: string): string | null {
    if (key === "front_brakes") return car.front_brake_type ?? null;
    if (key === "rear_brakes") return car.rear_brake_type ?? null;
    const row = byKey.get(key);
    if (!row?.value) return null;
    return row.unit ? `${row.value} ${row.unit}` : String(row.value);
  }

  function sourceFor(key: string): string {
    if (key === "front_brakes" || key === "rear_brakes") return "This car";
    return specSourcePill(byKey.get(key)?.reach);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Car specs</h2>
          <p className={`text-[14px] ${D_MUTED}`}>Fluids, sizes and bulbs this car needs, with where each came from.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <DIcon name="filter_list" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#5d5f68]" />
            <input
              className="h-10 w-full rounded-lg border border-[#e6e7ee] bg-white pl-9 pr-3 text-[14px] dark:border-[#1e293b] dark:bg-[#111a2e]"
              placeholder="Filter specs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <PartsButton variant="primary" onClick={onAddSpec}>
            <DIcon name="add" className="text-[18px]" /> Add spec
          </PartsButton>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const onFile = g.rows.filter((key) => valueFor(key)).length;
          return (
            <section key={g.id} className="flex flex-col gap-3 rounded-2xl border border-[#e6e7ee] bg-[#f9f9fd] p-4 dark:border-[#1e293b] dark:bg-[#0b1220]">
              <div className="flex items-center gap-3 px-1">
                <DIconTile name={g.icon} size="sm" />
                <h3 className={`flex-1 text-[15px] font-semibold ${D_TXT}`}>{g.title}</h3>
                <span className={`text-[12px] ${D_MONO} ${D_MUTED}`}>{onFile} on file</span>
              </div>
              <ul className="flex flex-col gap-2">
                {g.rows.map((key) => {
                  const label = key === "front_brakes" ? "Front brakes" : key === "rear_brakes" ? "Rear brakes" : labelFor(key);
                  const val = valueFor(key);
                  return (
                    <li key={key} className="flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 dark:bg-[#111a2e]">
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] font-medium ${D_TXT}`}>{label}</p>
                        {val ? (
                          <>
                            <p className={`text-[15px] font-semibold ${D_MONO} text-[#0153dc] dark:text-[#93b4ff]`}>{val}</p>
                            <p className={`mt-0.5 text-[12px] ${D_MUTED}`}>Source: {sourceFor(key)}</p>
                          </>
                        ) : (
                          <p className={`text-[13px] italic ${D_MUTED}`}>Not on file</p>
                        )}
                      </div>
                      <PartsButton variant="secondary" className="!h-8 !px-2.5 text-[12px]" onClick={onEditSpec}>
                        {val ? "Edit" : (<><DIcon name="add" className="text-[14px]" /> Add</>)}
                      </PartsButton>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
