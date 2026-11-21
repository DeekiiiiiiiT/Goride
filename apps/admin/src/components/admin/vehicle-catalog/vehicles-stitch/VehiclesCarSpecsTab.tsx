/**
 * S7 Vehicle Catalog → car page → Car specs — Stitch screen 15 (docs/research-engine-audit.md §4b).
 * Every spec shows its value, trust (Confirmed / Needs checking / Not on file), one source line and
 * "Research this spec" + "Edit". Brakes rows read the front_brake_type / rear_brake_type spec keys (RE-05).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { VehicleCatalogRecord } from "../../../../types/vehicleCatalog";
import { useAuth } from "../../../auth/AuthContext";
import { researchApi, type CarCoverage, type CoverageSpec } from "../../../../services/researchEngineService";
import { PartsButton } from "../../parts-database/PartsButton";
import { D_CARD, D_MONO, D_MUTED, D_TXT, DIcon } from "../../parts-database/add-parts/catalog/dominionKit";
import { RePill } from "../../research-engine/ReKit";
import { specSourceLine } from "../../research-engine/researchModel";
import { VEHICLE_SPEC_GROUP_DEFS } from "./vehiclesSpecGroups";

type SpecKey = { key: string; label: string; unit?: string | null };
type SpecRow = { specKey?: string; label?: string; value?: string | null; reach?: string | null; unit?: string | null };

type Props = {
  car: VehicleCatalogRecord;
  specKeys: SpecKey[];
  specs: SpecRow[];
  onAddSpec: () => void;
  onEditSpec: () => void;
};

/** The table's key for a row: the brakes rows are the front_brake_type / rear_brake_type spec keys. */
export function specRowKey(groupKey: string): string {
  if (groupKey === "front_brakes") return "front_brake_type";
  if (groupKey === "rear_brakes") return "rear_brake_type";
  return groupKey;
}

/** "battery_type" → "Battery type" when a spec has no label on file. */
function plainKey(key: string): string {
  const t = key.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type SpecTableRow = {
  key: string;
  label: string;
  icon: string;
  value: string | null;
  trust: "confirmed" | "needs_checking" | null;
  source: string;
  researching: boolean;
};

export function buildSpecTableRows(
  car: Pick<VehicleCatalogRecord, "front_brake_type" | "rear_brake_type">,
  specKeys: SpecKey[],
  specs: SpecRow[],
  allSpecs: CoverageSpec[],
): SpecTableRow[] {
  const trusted = new Map(allSpecs.map((s) => [s.specKey, s]));
  const plain = new Map(specs.filter((s) => s.specKey).map((s) => [String(s.specKey), s]));
  const label = (key: string) =>
    key === "front_brake_type" ? "Front brakes" : key === "rear_brake_type" ? "Rear brakes" : specKeys.find((k) => k.key === key)?.label ?? trusted.get(key)?.label ?? plainKey(key);
  const rows: SpecTableRow[] = [];
  for (const g of VEHICLE_SPEC_GROUP_DEFS) {
    for (const gk of g.keys) {
      const key = specRowKey(gk);
      const t = trusted.get(key);
      const p = plain.get(key);
      let value: string | null = null;
      if (t?.value) value = [t.value, t.unit].filter(Boolean).join(" ");
      else if (p?.value) value = [p.value, p.unit].filter(Boolean).join(" ");
      else if (key === "front_brake_type" && car.front_brake_type) value = car.front_brake_type;
      else if (key === "rear_brake_type" && car.rear_brake_type) value = car.rear_brake_type;
      // A value with no trust row came from the old import: it always needs checking.
      const trust = value ? (t?.trust ?? "needs_checking") : null;
      const source = value
        ? t
          ? specSourceLine(t)
          : "From the old import"
        : "Not on file";
      rows.push({
        key,
        label: label(key),
        icon: g.icon,
        value,
        trust,
        source,
        researching: Boolean(t?.jobState && ["queued", "researching", "checking", "browser_check", "browser_check_queued"].includes(t.jobState)),
      });
    }
  }
  return rows;
}

export function VehiclesCarSpecsTab({ car, specKeys, specs, onAddSpec, onEditSpec }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [cov, setCov] = useState<CarCoverage | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setCov(await researchApi.coverage(token, car.id));
    } catch {
      setCov(null);
    }
  }, [token, car.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => buildSpecTableRows(car, specKeys, specs, cov?.allSpecs ?? []), [car, specKeys, specs, cov]);
  const confirmed = rows.filter((r) => r.trust === "confirmed").length;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="car-specs-trust">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className={`text-[18px] font-semibold ${D_TXT}`}>Car specs</h2>
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium ${D_MUTED}`} data-testid="specs-header-chips">
            {cov ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#006e31]" />
                {cov.chassisCode ? cov.partsReady : 0} of {cov.parts.length || 10} key parts ready
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 text-[#0153dc] dark:text-[#93b4ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0153dc]" />
              {confirmed} of {rows.length} specs confirmed
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PartsButton variant="secondary" onClick={onAddSpec}>
            <DIcon name="add" className="text-[18px]" /> Add spec
          </PartsButton>
          <PartsButton
            variant="primary"
            disabled={busy}
            data-testid="specs-fill-this-car"
            onClick={() => void run(() => researchApi.fillCar(token, car.id), "This car's missing parts and specs are in the queue")}
          >
            <DIcon name="bolt" className="text-[18px]" /> Fill this car
          </PartsButton>
        </div>
      </div>

      <div className={`${D_CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className={`bg-[#faf8fe] text-[12px] font-medium uppercase tracking-wider dark:bg-[#0b1220] ${D_MUTED}`}>
              <tr>
                <th className="w-1/4 px-6 py-3" scope="col">Specification</th>
                <th className="w-1/5 px-4 py-3" scope="col">Value</th>
                <th className="w-1/6 px-4 py-3" scope="col">Trust</th>
                <th className="w-1/4 px-4 py-3" scope="col">Source</th>
                <th className="px-6 py-3 text-right" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} data-testid="spec-row" className={`border-t border-[#e6e7ee] dark:border-[#1e293b] ${i % 2 ? "bg-[#faf8fe] dark:bg-[#0b1220]/50" : ""}`}>
                  <td className="px-6 py-4 align-top">
                    <div className="flex items-start gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ededf9] text-[#0153dc] dark:bg-[#1e293b] dark:text-[#93b4ff]">
                        <DIcon name={r.icon} className="text-[18px]" />
                      </div>
                      <span className={`text-[16px] font-semibold ${D_TXT}`}>{r.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {r.value ? (
                      <span className={`text-[13px] font-semibold ${D_MONO} ${D_TXT}`}>{r.value}</span>
                    ) : (
                      <span className="text-[14px] italic text-[#737686]">Not on file</span>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {r.trust === "confirmed" ? (
                      <RePill tone="green" icon="check_circle">Confirmed</RePill>
                    ) : r.trust === "needs_checking" ? (
                      <RePill tone="amber">Needs checking</RePill>
                    ) : (
                      <RePill tone="grey" icon="remove_circle_outline">Not on file</RePill>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span className={`text-[13px] ${r.value ? D_TXT : "italic text-[#737686]"}`} data-testid="spec-source">
                      {r.value ? r.source : "No source has recorded this"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right align-top">
                    <div className="flex items-center justify-end gap-1.5">
                      <PartsButton
                        variant={r.value ? "secondary" : "primary"}
                        className="!min-h-[32px] whitespace-nowrap"
                        disabled={busy || r.researching}
                        data-testid="research-this-spec"
                        onClick={() => void run(() => researchApi.fillItem(token, { vehicleCatalogId: car.id, specKey: r.key }), `${r.label} is in the queue`)}
                      >
                        <DIcon name="search" className="text-[14px]" /> {r.researching ? "Researching" : "Research this spec"}
                      </PartsButton>
                      <PartsButton variant="secondary" className="!min-h-[32px]" onClick={onEditSpec}>
                        <DIcon name="edit" className="text-[14px]" /> Edit
                      </PartsButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
