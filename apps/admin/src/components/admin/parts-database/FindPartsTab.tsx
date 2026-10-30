// Stitch: dominion-redesign/ef01fa01e52f4c06b14c3f26887a3b07
// Stitch: dominion-redesign/86d7d8868d684085b4c831f9c0ece4cb
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchFindParts, fetchVehicleOptions, type CatalogVariantPick, type PartSection } from "./partsDatabaseApi";
import { PartsEmpty, PartsError, PartsLoading } from "./PartsDatabaseStates";

const SECTION_COPY: Record<number, string> = {
  1: "Exact factory part for this car.",
  2: "Same car under another badge.",
  3: "Engine parts from cars with the same engine.",
  4: "Other brands for the same part.",
  5: "Bought by size: bulbs, fluids, wipers, battery.",
};

const SECTION_BAR = ["bg-[#0153dc]", "bg-[#0e7490]", "bg-[#b45309]", "bg-[#7c3aed]", "bg-[#006e31]"];

function chipLabel(row: CatalogVariantPick) {
  const years = [row.production_start_year, row.production_end_year].filter(Boolean).join("–");
  return [row.chassis_code, row.drivetrain, row.engine_code, years].filter(Boolean).join(" · ");
}

function itemName(item: Record<string, unknown>) {
  const part = (item.part ?? {}) as Record<string, unknown>;
  return String(part.name ?? item.part_name ?? "Part");
}

function itemNumber(item: Record<string, unknown>) {
  const part = (item.part ?? {}) as Record<string, unknown>;
  const brand = String(part.manufacturer ?? "");
  const number = String(part.oem_part_number ?? "");
  return `${brand} ${number}`.trim() || "—";
}

function itemStatus(item: Record<string, unknown>) {
  const decision = String(item.catalogDecision ?? (item.part as Record<string, unknown> | undefined)?.catalog_decision ?? "pending");
  return decision === "confirmed" ? "Verified" : "Needs checking";
}

export function FindPartsTab({
  initialVariantId,
  onOpenVehicle,
  onAdd,
}: {
  initialVariantId?: string;
  onOpenVehicle: (variantId: string) => void;
  onAdd: (variantId: string) => void;
}) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [quick, setQuick] = useState("");
  const [variantId, setVariantId] = useState(initialVariantId ?? "");
  const [submitted, setSubmitted] = useState({ make: "", model: "", year: "", variantId: initialVariantId ?? "" });
  const [searched, setSearched] = useState(Boolean(initialVariantId));

  const options = useQuery({
    queryKey: ["vehicle-options", make, model],
    queryFn: () => fetchVehicleOptions({ make, model }),
  });

  const query = useQuery({
    queryKey: ["find-parts", submitted],
    queryFn: () => fetchFindParts(submitted),
    enabled: searched,
  });

  const coverage = query.data?.coverage;

  if (query.isLoading) return <PartsLoading />;
  if (query.isError) return <PartsError onRetry={() => { void query.refetch(); }} />;

  const variants = query.data?.variants ?? [];
  const picked = query.data?.picked ?? null;
  const sections = (query.data?.sections ?? []) as PartSection[];
  const showPicker = searched && !picked && variants.length > 1;
  const nothing = searched && variants.length === 0;

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-label font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">Make</label>
            <select className="w-full bg-surface-container-low text-sm font-medium text-on-surface rounded-lg px-3 py-2.5" value={make} onChange={(event) => { setMake(event.target.value); setModel(""); }}>
              <option value="">Make</option>
              {(options.data?.makes ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-label font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">Model</label>
            <select className="w-full bg-surface-container-low text-sm font-medium text-on-surface rounded-lg px-3 py-2.5" value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="">Model</option>
              {(options.data?.models ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-label font-semibold uppercase tracking-wider text-on-surface-variant mb-1.5">Year</label>
            <select className="w-full bg-surface-container-low text-sm font-medium text-on-surface rounded-lg px-3 py-2.5" value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">Year</option>
              {(options.data?.years ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
          <div>
            <button
              type="button"
              className="w-full bg-secondary hover:bg-secondary-dim text-on-secondary py-2.5 px-4 rounded-lg font-medium text-sm"
              onClick={() => {
                const parsed = quick.trim().match(/^(\S+)\s+(.+?)\s+(\d{4})$/);
                const next = {
                  make: parsed?.[1] ?? make,
                  model: parsed?.[2] ?? model,
                  year: parsed?.[3] ?? year,
                  variantId: "",
                };
                setMake(next.make);
                setModel(next.model);
                setYear(next.year);
                setVariantId("");
                setSubmitted(next);
                setSearched(true);
              }}
            >
              Find parts
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span>M900A · 2WD · 1KR-FE · 2016–2020</span>
          <span>M910A · 4WD · 1KR-FE · 2016–2020</span>
          <span>M900A Facelift · 2WD · 1KR-VET</span>
        </div>
        <label className="block text-xs text-on-surface-variant">Or type make, model and year
          <input className="mt-1 w-full bg-surface-container-low text-sm rounded-lg px-3 py-2" value={quick} onChange={(event) => setQuick(event.target.value)} placeholder="Toyota Roomy 2019" />
        </label>
        {showPicker ? (
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-label font-semibold text-on-surface-variant uppercase tracking-wider">Which one?</span>
            <div className="flex flex-wrap items-center gap-2.5">
              {variants.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={row.id === variantId
                    ? "bg-secondary-container text-on-secondary-container px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium"
                    : "bg-surface-container-low text-on-surface-variant px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium"}
                  onClick={() => {
                    setVariantId(row.id);
                    setSubmitted({ make: "", model: "", year: "", variantId: row.id });
                    setSearched(true);
                  }}
                >
                  {chipLabel(row)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {nothing ? <PartsEmpty onClear={() => { setMake(""); setModel(""); setYear(""); setSearched(false); }} /> : null}

      {picked ? (
        <>
          <div className="bg-surface-container-lowest rounded-xl p-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3 text-xs sm:text-sm text-on-surface">
              <div className="w-2 h-2 rounded-full bg-tertiary" />
              <span className="font-medium">Service essentials <strong className="font-mono">{coverage?.essentials ?? 0} of {coverage?.essentialsTotal ?? 10}</strong></span>
              <span className="text-outline-variant font-mono">·</span>
              <span className="font-medium">Specs <strong className="font-mono">{coverage?.specs ?? 0} of {coverage?.specsTotal ?? 13}</strong></span>
              <span className="text-outline-variant font-mono">·</span>
              <span className="font-medium">Other parts <strong className="font-mono">{coverage?.otherParts ?? 0}</strong></span>
            </div>
            <button type="button" title="Vehicle parts arrow_forward" className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-secondary bg-surface-container-low" onClick={() => onOpenVehicle(picked.id)}>
              Open this vehicle's parts page
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </button>
          </div>
          <div className="space-y-4">
            {(sections.length ? sections : [1, 2, 3, 4, 5].map((tier) => ({ tier, label: "", sisterNames: null, items: [] as Array<Record<string, unknown>> }))).map((section, index) => (
              <div key={section.tier} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex">
                <div className={`w-1 shrink-0 ${SECTION_BAR[index] ?? "bg-secondary"}`} />
                <div className="p-5 w-full flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-headline font-semibold text-sm text-on-surface">{section.label || ["Direct OEM Match", "Sister Vehicle Match", "Engine Compatible Match", "Aftermarket Cross-Reference", "Universal Fleet Parts"][index]}</span>
                      <span className="text-xs font-mono bg-surface-container px-2 py-0.5 rounded font-semibold">{section.items.length}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant">{section.tier === 2 && section.sisterNames ? section.sisterNames : SECTION_COPY[section.tier] ?? ""}</p>
                  </div>
                  {section.items.length === 0 ? (
                    <button type="button" className="text-xs font-medium text-secondary" onClick={() => onAdd(picked.id)}>Add for this vehicle</button>
                  ) : (
                    <div className="divide-y divide-outline-variant/10 text-xs">
                      {section.items.map((item, itemIndex) => {
                        const row = item as Record<string, unknown>;
                        if (section.tier === 5) {
                          const bits = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
                          return (
                            <div key={String(row.specKey ?? itemIndex)} className="py-2.5 px-2 text-xs">
                              <span className="font-medium">{String(row.spec ?? row.label ?? "Spec")}</span>
                              <span className="font-mono ml-2">{String(row.value ?? "")} {String(row.unit ?? "")}</span>
                              <span className="ml-2 text-on-surface-variant">{bits.map((bit) => `${bit.manufacturer ?? ""} ${bit.part_number ?? bit.partNumber ?? ""}`.trim()).filter(Boolean).join(" · ") || "None on file yet"}</span>
                            </div>
                          );
                        }
                        const part = (row.part ?? {}) as Record<string, unknown>;
                        return (
                          <div key={String(row.fitmentId ?? itemIndex)} className="py-2.5 px-2 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="font-medium">{itemName(row)}</span>
                              <span className="font-mono">{itemNumber(row)}</span>
                              <span>{String(row.position ?? part.position ?? "")}</span>
                              <span>{itemStatus(row)}</span>
                            </div>
                            <p className="text-on-surface-variant">{String(row.matchReason ?? "")}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
