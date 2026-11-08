import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { versionDifferenceLabel, versionYearsLabel } from "@roam/vehicle-catalog-core";
import { PartsButton } from "../parts-database/PartsButton";
import { fetchSpecKeys } from "../parts-database/partsDatabaseApi";
import { fetchCatalogMakers, saveCatalogSpecsBulk } from "./vehiclesCatalogApi";
import { MakerLogo } from "./MakerLogo";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import { saveToCarsLabel } from "./vehicles-stitch/vehiclesStitchShared";

type SisterRow = {
  id: string;
  make: string;
  model: string;
  production_start_year?: number;
  production_end_year?: number | null;
};

function yearsOverlap(a: VehicleCatalogRecord, b: SisterRow): boolean {
  const aEnd = a.production_end_year ?? 9999;
  const bEnd = b.production_end_year ?? 9999;
  return a.production_start_year <= bEnd && (b.production_start_year ?? 0) <= aEnd;
}

export function SpecEditorPanel({
  car,
  otherVersions,
  sisters,
  onClose,
  onSaved,
}: {
  car: VehicleCatalogRecord;
  otherVersions: VehicleCatalogRecord[];
  sisters: SisterRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const keys = useQuery({ queryKey: ["spec-keys"], queryFn: fetchSpecKeys });
  const makers = useQuery({ queryKey: ["catalog-makers"], queryFn: fetchCatalogMakers });
  const [specKey, setSpecKey] = useState("brake_fluid");
  const [specQ, setSpecQ] = useState("");
  const [value, setValue] = useState("");
  const [wiperDriver, setWiperDriver] = useState("350");
  const [wiperPassenger, setWiperPassenger] = useState("475");
  const [wiperRear, setWiperRear] = useState("525");
  const [evidenceUrl, setEvidenceUrl] = useState("https://example.com/source");
  const [sourceKind, setSourceKind] = useState<"manual" | "catalogue" | "other">("manual");
  const [picked, setPicked] = useState<Set<string>>(() => {
    const initial = new Set<string>([car.id]);
    for (const s of sisters) {
      if (yearsOverlap(car, s)) initial.add(s.id);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const selectedKey = keys.data?.items?.find((k) => k.key === specKey);
  const logoByMake = new Map(
    (makers.data?.items ?? []).map((m) => [m.make.toLowerCase(), m.logo_storage_path]),
  );

  const filteredKeys = useMemo(() => {
    const list = keys.data?.items ?? [];
    const q = specQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((k) => k.label.toLowerCase().includes(q) || k.key.toLowerCase().includes(q));
  }, [keys.data?.items, specQ]);

  const isWiperKey = specKey.startsWith("wiper_");

  const otherHeading = useMemo(
    () => `Other ${car.make} ${car.model} versions`,
    [car.make, car.model],
  );

  useEffect(() => {
    if (specKey === "brake_fluid") setValue("Toyota 2500H-A");
    else if (specKey === "engine_oil_grade") setValue("0W-20");
    else if (specKey === "engine_oil_capacity_with_filter_l") setValue("3.1");
    else if (isWiperKey) setValue(wiperDriver);
    else setValue("");
  }, [specKey, isWiperKey, wiperDriver]);

  function toggleSister(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const saveValue = isWiperKey ? wiperDriver : value.trim();
    if (!saveValue || !evidenceUrl.trim()) {
      toast.error("Enter a value and source link");
      return;
    }
    if (!picked.size) {
      toast.error("Pick at least one car");
      return;
    }
    setSaving(true);
    try {
      await saveCatalogSpecsBulk({
        specKey,
        value: saveValue,
        evidenceUrl: evidenceUrl.trim(),
        vehicleIds: [...picked],
      });
      toast.success(`${selectedKey?.label ?? specKey} saved to ${picked.size} car${picked.size === 1 ? "" : "s"}`, {
        action: { label: "Undo", onClick: () => undefined },
      });
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vehicles-spec-panel" role="dialog" aria-label="Add or edit spec">
      <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-3">
        <h2 className="font-headline-md font-semibold">Add or edit a spec</h2>
        <PartsButton variant="secondary" className="!h-8 !w-8 !p-0" onClick={onClose}>
          ×
        </PartsButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-body-sm">
          <span className="font-label-md font-semibold">Which spec?</span>
          <input
            className="h-10 rounded-lg border border-outline-variant/40 px-3 mb-1"
            placeholder="Search specs"
            value={specQ}
            onChange={(e) => setSpecQ(e.target.value)}
          />
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-outline-variant/30 divide-y">
            {filteredKeys.map((k) => (
              <li key={k.key}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-body-sm ${specKey === k.key ? "bg-primary-container/15 font-semibold" : ""}`}
                  onClick={() => setSpecKey(k.key)}
                >
                  {k.label}
                </button>
              </li>
            ))}
          </ul>
        </label>
        {isWiperKey ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Driver (mm)", val: wiperDriver, set: setWiperDriver },
              { label: "Passenger (mm)", val: wiperPassenger, set: setWiperPassenger },
              { label: "Rear (mm)", val: wiperRear, set: setWiperRear },
            ].map((w) => (
              <label key={w.label} className="flex flex-col gap-1 text-body-sm">
                <span className="font-label-md">{w.label}</span>
                <input
                  className="h-10 rounded-lg border border-outline-variant/40 px-2 font-mono-sm"
                  value={w.val}
                  onChange={(e) => w.set(e.target.value)}
                />
              </label>
            ))}
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-body-sm">
            <span className="font-label-md font-semibold">Value</span>
            <input
              className="h-10 rounded-lg border border-outline-variant/40 px-3 font-mono-md"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-on-surface-variant text-body-sm">
              e.g. {specKey === "brake_fluid" ? "Toyota 2500H-A, or DOT 3" : "Follow the example above"}
            </p>
          </label>
        )}
        <div className="flex flex-col gap-2">
          <span className="font-label-md font-semibold">Where did you find it?</span>
          <div className="flex flex-wrap gap-2">
            {(["manual", "catalogue", "other"] as const).map((k) => (
              <PartsButton
                key={k}
                variant={sourceKind === k ? "primary" : "secondary"}
                onClick={() => setSourceKind(k)}
              >
                {k === "manual" ? "Owner's manual" : k === "catalogue" ? "Maker's catalogue" : "Other"}
              </PartsButton>
            ))}
          </div>
          <input
            className="h-10 rounded-lg border border-outline-variant/40 px-3 text-body-sm"
            placeholder="https://"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
          />
        </div>
        <div>
          <p className="font-label-md font-semibold mb-2">This car</p>
          <p className="text-body-sm mb-3 rounded-lg border border-outline-variant/30 px-3 py-2">
            {car.make} {car.model} · {versionYearsLabel(car.production_start_year, car.production_end_year)} ·{" "}
            {versionDifferenceLabel(car)}
          </p>
          {otherVersions.length > 0 ? (
            <>
              <p className="font-label-md font-semibold mb-2">{otherHeading}</p>
              <ul className="flex flex-col gap-2 mb-4">
                {otherVersions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={picked.has(v.id)}
                      onChange={() => toggleSister(v.id)}
                    />
                    <MakerLogo make={v.make} logoStoragePath={logoByMake.get(v.make.toLowerCase())} size={28} />
                    <span className="text-body-sm">
                      {versionYearsLabel(v.production_start_year, v.production_end_year)} · {versionDifferenceLabel(v)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="font-label-md font-semibold mb-2">Also save to these sister cars</p>
          <ul className="flex flex-col gap-2">
            {sisters.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggleSister(s.id)} />
                <MakerLogo make={s.make} logoStoragePath={logoByMake.get(s.make.toLowerCase())} size={28} />
                <span className="text-body-sm">
                  {s.make} {s.model}
                  {s.production_start_year
                    ? ` · ${versionYearsLabel(s.production_start_year, s.production_end_year ?? null)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-outline-variant/30 p-4 flex justify-between gap-2">
        <PartsButton variant="danger" onClick={onClose}>
          Cancel
        </PartsButton>
        <PartsButton variant="primary" disabled={saving} onClick={() => void save()}>
          {saveToCarsLabel(picked.size)}
        </PartsButton>
      </div>
    </div>
  );
}
