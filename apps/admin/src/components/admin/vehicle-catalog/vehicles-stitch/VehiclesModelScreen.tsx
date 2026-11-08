import { useMemo, useState } from "react";
import { Eye, ChevronRight } from "lucide-react";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { PartsButton } from "../../parts-database/PartsButton";
import { MakerLogo } from "../MakerLogo";
import type { SisterVehicleRow } from "../vehiclesCatalogApi";
import { VehicleSpecificationSheet } from "../VehicleSpecificationSheet";
import { rowFingerprint, versionHeaderLine } from "./vehiclesStitchShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DCode, DIcon, DPill } from "../../parts-database/add-parts/catalog/dominionKit";

type FilterPill = "all" | "2wd" | "4wd" | "before" | "after";
type Props = {
  make: string;
  model: string;
  versions: VehicleCatalogRecord[];
  sisters: SisterVehicleRow[];
  logoPath?: string | null;
  logoByMake: Map<string, string | null | undefined>;
  specCountById: Map<string, number>;
  keyPartsById: Map<string, { ready: number; total: number }>;
  dupes: Map<string, number>;
  onBack: () => void;
  onOpenCar: (r: VehicleCatalogRecord) => void;
  onAddCar: () => void;
};

export function VehiclesModelScreen({
  make,
  model,
  versions,
  sisters,
  logoPath,
  logoByMake,
  specCountById,
  keyPartsById,
  dupes,
  onBack,
  onOpenCar,
  onAddCar,
}: Props) {
  const [filter, setFilter] = useState<FilterPill>("all");
  const [filterQ, setFilterQ] = useState("");
  const [viewRecord, setViewRecord] = useState<VehicleCatalogRecord | null>(null);

  const pills = useMemo(() => {
    const before = versions.filter((v) => (v.production_end_year ?? 9999) <= 2020 && v.production_start_year < 2020).length;
    const after = versions.filter((v) => v.production_start_year >= 2020).length;
    return [
      { id: "all" as const, label: "All", count: versions.length },
      { id: "2wd" as const, label: "2WD", count: versions.filter((v) => (v.drivetrain ?? "").toLowerCase().includes("2wd")).length },
      { id: "4wd" as const, label: "4WD", count: versions.filter((v) => (v.drivetrain ?? "").toLowerCase().includes("4wd")).length },
      { id: "before" as const, label: "Before the update", count: before },
      { id: "after" as const, label: "After the update", count: after },
    ];
  }, [versions]);

  const filtered = useMemo(() => {
    let list = [...versions];
    if (filter === "2wd") list = list.filter((v) => (v.drivetrain ?? "").toLowerCase().includes("2wd"));
    if (filter === "4wd") list = list.filter((v) => (v.drivetrain ?? "").toLowerCase().includes("4wd"));
    if (filter === "before") {
      list = list.filter((v) => (v.production_end_year ?? 9999) <= 2020 && v.production_start_year < 2020);
    }
    if (filter === "after") list = list.filter((v) => v.production_start_year >= 2020);
    const q = filterQ.trim().toLowerCase();
    if (q) {
      list = list.filter((v) => {
        const hay = [v.chassis_code, v.engine_code, versionDifferenceLabel(v)].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [versions, filter, filterQ]);

  const platformSisters = sisters.filter((s) => s.model !== model);

  return (
    <div className="vehicles-database-stitch parts-database-stitch flex flex-col gap-5 px-margin py-space-lg">
      <PartsButton variant="secondary" className="self-start" onClick={onBack}>
        <DIcon name="arrow_back" className="text-[18px]" /> Back
      </PartsButton>

      <div className={`${D_CARD} flex flex-col gap-4 p-6`}>
        <div className="flex flex-wrap items-center gap-4">
          <MakerLogo make={make} logoStoragePath={logoPath} size={52} />
          <div className="min-w-0 flex-1">
            <h1 className={`text-[26px] font-semibold tracking-tight ${D_TXT}`}>{make} {model}</h1>
            <p className={`text-[15px] ${D_MUTED}`}>{versionHeaderLine(versions)}</p>
          </div>
          <PartsButton variant="secondary" className="shrink-0" onClick={onAddCar}>
            <DIcon name="add" className="text-[18px]" /> Add a car
          </PartsButton>
        </div>
        {platformSisters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex items-center gap-1 text-[14px] ${D_MUTED}`}>
              <DIcon name="link" className="text-[16px]" /> Same car:
            </span>
            {platformSisters.map((s) => (
              <span
                key={s.id}
                className={`inline-flex items-center gap-1.5 rounded-full border border-[#e6e7ee] bg-[#f3f4fb] px-2.5 py-1 text-[13px] font-medium dark:border-[#1e293b] dark:bg-[#0b1220] ${D_TXT}`}
              >
                <MakerLogo make={s.make} logoStoragePath={logoByMake.get(s.make.toLowerCase())} size={18} />
                {s.make} {s.model}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-[#e6e7ee] pt-4 dark:border-[#1e293b]">
          {pills.map((p) => {
            const on = filter === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilter(p.id)}
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors ${
                  on
                    ? "border-[#0153dc] bg-[#0153dc] text-white"
                    : `border-[#c5c6d0] bg-white hover:border-[#0153dc] dark:border-[#1e293b] dark:bg-[#111a2e] ${D_TXT}`
                }`}
              >
                {p.label} ({p.count})
              </button>
            );
          })}
          <div className="relative ml-auto min-w-[200px]">
            <DIcon name="filter_list" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#5d5f68]" />
            <input
              className="h-9 w-full rounded-lg border border-[#e6e7ee] bg-[#f3f4fb] pl-9 pr-3 text-[13px] dark:border-[#1e293b] dark:bg-[#0b1220]"
              placeholder="Filter versions"
              value={filterQ}
              onChange={(e) => setFilterQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className={`${D_CARD} divide-y divide-[#e6e7ee] overflow-hidden dark:divide-[#1e293b]`}>
        {filtered.map((v) => {
          const dupe = (dupes.get(rowFingerprint(v)) ?? 0) > 1;
          const specs = specCountById.get(v.id) ?? 0;
          const kp = keyPartsById.get(v.id);
          const pct = kp && kp.total ? Math.round((kp.ready / kp.total) * 100) : 0;
          return (
            <div
              key={v.id}
              className={`vehicles-version-row flex min-h-[72px] flex-wrap items-center gap-4 px-5 py-4 ${dupe ? "bg-[#fffaf0] dark:bg-[#451a03]/30" : ""}`}
            >
              <button type="button" className="min-w-[220px] flex-1 text-left" onClick={() => onOpenCar(v)}>
                <p className={`flex flex-wrap items-center gap-2 text-[16px] font-semibold ${D_TXT}`}>
                  {versionYearsLabel(v.production_start_year, v.production_end_year)} · {versionDifferenceLabel(v)}
                  {dupe ? <DPill tone="amber" icon="warning">Looks like a duplicate</DPill> : null}
                </p>
                <p className="vehicles-version-row-codes mt-1 flex flex-wrap gap-1.5">
                  {v.chassis_code ? <DCode>{v.chassis_code}</DCode> : null}
                  {v.engine_code ? <DCode>{v.engine_code}</DCode> : null}
                </p>
              </button>
              <div className="w-[190px] shrink-0">
                {kp ? (
                  <>
                    <p className={`flex justify-between text-[12px] ${D_MUTED}`}>
                      <span>Key parts</span>
                      <span className={D_MONO}>{kp.ready}/{kp.total} ready</span>
                    </p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef0f6] dark:bg-[#1e293b]">
                      <div className="h-full rounded-full bg-[#0153dc]" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                ) : null}
                <p className={`mt-1 text-[12px] ${D_MUTED}`}>{specs} spec{specs === 1 ? "" : "s"} on file</p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#c5c6d0] bg-white text-[#30323b] hover:border-[#0153dc] dark:border-[#1e293b] dark:bg-[#111a2e] dark:text-[#e2e8f0]"
                title="Quick view"
                aria-label="Quick view"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewRecord(v);
                }}
              >
                <Eye className="h-4 w-4" />
              </button>
              <PartsButton variant="secondary" className="!h-9 shrink-0" onClick={() => onOpenCar(v)}>
                View car page <ChevronRight className="h-4 w-4" />
              </PartsButton>
            </div>
          );
        })}
      </div>
      {viewRecord ? <VehicleSpecificationSheet record={viewRecord} onClose={() => setViewRecord(null)} /> : null}
    </div>
  );
}
