import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DCode, DIcon, DIconTile, DPill } from "../../parts-database/add-parts/catalog/dominionKit";
import { CAPTURE_PRIMARY_ROOMY_ID } from "../vehiclesCaptureFixtures";
import {
  buildKeyPartRows,
  KEY_PARTS_TOTAL,
  keyPartsVerifiedCount,
  type KeyPartJob,
  type KeyPartRow,
} from "./keyPartsRows";

type AreaPart = { name?: string; partNumber?: string };

type Props = {
  car: VehicleCatalogRecord;
  jobs: KeyPartJob[];
  otherParts: Array<{ category?: string; parts?: AreaPart[] }>;
};

const AREA_ICONS: Record<string, string> = {
  Brakes: "settings_b_roll",
  Engine: "settings",
  Fluids: "opacity",
  "Lighting & visibility": "lightbulb",
  "Lights & wipers": "lightbulb",
  Transmission: "settings",
  Suspension: "tire_repair",
};

function openAddParts(carId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "parts-catalog");
  url.searchParams.set("tab", "add-parts");
  url.searchParams.set("vehiclesPreselectVehicleId", carId);
  window.location.href = url.toString();
}


export function VehiclesPartsOnFileTab({ car, jobs, otherParts }: Props) {
  const rows = buildKeyPartRows(jobs);
  const ready = keyPartsVerifiedCount(rows);
  const total = KEY_PARTS_TOTAL;
  const areas = otherParts;

  const pct = total ? (ready / total) * 100 : 0;

  function openFindParts() {
    const url = new URL(window.location.href);
    url.searchParams.set("page", "parts-catalog");
    url.searchParams.set("tab", "find-parts");
    window.location.href = url.toString();
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Parts on file</h2>
        <p className={`text-[14px] ${D_MUTED}`}>Every part we have for this car, by area.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => {
          const cat = a.category ?? "Other";
          const count = a.parts?.length ?? 0;
          return (
            <div key={cat} className={`${D_CARD} flex min-h-[120px] flex-col justify-between gap-3 p-5`}>
              <div className="flex items-center gap-3">
                <DIconTile name={AREA_ICONS[cat] ?? "inventory_2"} />
                <div>
                  <p className={`text-[16px] font-semibold ${D_TXT}`}>{cat}</p>
                  <p className={`text-[13px] ${D_MONO} ${D_MUTED}`}>{count > 0 ? `${count} on file` : "Not on file"}</p>
                </div>
              </div>
              {count > 0 ? (
                <PartsButton variant="secondary" className="!h-8 self-start text-[13px]" onClick={openFindParts}>
                  Open <DIcon name="arrow_forward" className="text-[16px]" />
                </PartsButton>
              ) : (
                <PartsButton variant="secondary" className="!h-8 self-start text-[13px]" onClick={() => openAddParts(car.id)}>
                  <DIcon name="add" className="text-[16px]" /> Add parts
                </PartsButton>
              )}
            </div>
          );
        })}
      </div>
      <section className={`${D_CARD} p-6`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className={`text-[18px] font-semibold ${D_TXT}`}>Key parts</h3>
          <span className={`text-[15px] font-semibold ${D_MONO} ${D_TXT}`}>{ready} of {total}</span>
        </div>
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#eef0f6] dark:bg-[#1e293b]">
          <div className="h-full rounded-full bg-[#0153dc]" style={{ width: `${pct}%` }} />
        </div>
        <ul className="divide-y divide-[#e6e7ee] dark:divide-[#1e293b]">
          {rows.map((row) => {
            const onFile = row.status !== "missing";
            return (
              <li key={row.opCode} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    row.status === "verified"
                      ? "bg-[#e6f4ea] text-[#006e31] dark:bg-[#14532d]/40 dark:text-[#4ade80]"
                      : row.status === "unverified"
                        ? "bg-[#fff4dc] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]"
                        : "bg-[#eef0f6] text-[#5d5f68] dark:bg-[#1e293b]"
                  }`}
                  aria-hidden
                >
                  <DIcon name={row.status === "verified" ? "check" : row.status === "unverified" ? "priority_high" : "remove"} className="text-[16px]" />
                </span>
                <span className={`min-w-[8rem] flex-1 text-[15px] font-medium ${D_TXT}`}>{row.label}</span>
                {row.status === "verified" ? <DPill tone="green">Verified</DPill> : row.status === "unverified" ? <DPill tone="amber">Needs checking</DPill> : <span className={`text-[13px] ${D_MUTED}`}>Not on file</span>}
                {row.partNumber ? <DCode>{row.partNumber}</DCode> : null}
                {onFile ? (
                  <PartsButton variant="secondary" className="!h-8 text-[13px]" onClick={openFindParts}>Open</PartsButton>
                ) : (
                  <PartsButton
                    variant="secondary"
                    className="!h-8 text-[13px]"
                    onClick={() => openAddParts(car.id || CAPTURE_PRIMARY_ROOMY_ID)}
                  >
                    <DIcon name="add" className="text-[16px]" /> Add parts
                  </PartsButton>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
