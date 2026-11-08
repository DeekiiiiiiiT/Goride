import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PartsButton } from "../../PartsButton";
import { fetchSelfServePartTypes, fetchVehicleSpecValues, saveFluidBundle } from "../addPartsApi";
import { CatalogStep2Cars } from "../catalog/CatalogStep2Cars";
import { carSpecValueForSave } from "../catalog/carSpecValueForSave";
import { emptyCatalogDraft, type CatalogPageDraft } from "../addPartsTypes";
import { MaterialIcon } from "../../import/MaterialIcon";
import { PartTypeIcon } from "../addPartsShared";
import { D_CARD, D_MONO, D_MUTED, D_TXT } from "../catalog/dominionKit";

export function FluidPartFlow({ onHome }: { onHome: () => void }) {
  const [step, setStep] = useState<"type" | "details" | "cars" | "done">("type");
  const [draft, setDraft] = useState<CatalogPageDraft>(() => emptyCatalogDraft());
  const [partTypeId, setPartTypeId] = useState("");
  const [brand, setBrand] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [specKey, setSpecKey] = useState("brake_fluid");
  const [specValue, setSpecValue] = useState("");
  const [framePreTickDone, setFramePreTickDone] = useState(false);

  const types = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });
  const fluidTypes = (types.data ?? []).filter((t) => t.defaultFitMode === "spec");

  const targetSpecValue = useMemo(
    () => carSpecValueForSave(specKey, brand, partNumber, specValue),
    [specKey, brand, partNumber, specValue],
  );

  const selectedIds = draft.vehicleListings.map((l) => l.vehicleId);
  const existingSpecs = useQuery({
    queryKey: ["vehicle-spec", specKey, selectedIds.join(",")],
    queryFn: () => fetchVehicleSpecValues(selectedIds, specKey),
    enabled: step === "cars" && selectedIds.length > 0 && Boolean(specKey),
  });

  async function save() {
    try {
      await saveFluidBundle({
        partTypeId,
        brand,
        partNumber,
        specKey,
        specValue,
        evidenceUrl: draft.evidenceUrl,
        sourceType: draft.sourceType,
        partKind: draft.partKind,
        fitMode: "spec",
        vehicleListings: draft.vehicleListings.map((l) => ({
          vehicleId: l.vehicleId,
          yearFrom: l.yearFrom,
          yearTo: l.yearTo,
        })),
      });
      toast.success("Fluid and car specs saved");
      setStep("done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  const picked = fluidTypes.find((t) => t.id === partTypeId) ?? null;
  const specField = picked?.specFields.find((f) => f.specKey === specKey) ?? picked?.specFields[0];
  const detailsReady = Boolean(partTypeId && brand && partNumber && specValue && draft.evidenceUrl);
  const byVehicle = new Map((existingSpecs.data ?? []).map((r) => [r.vehicleId, r.value]));
  const specLabel = specField?.label && !/dot|rating|spec|type|size|grade/i.test(specField.label) ? specField.label : picked?.name ?? "Spec";
  const fieldCls =
    "h-11 w-full rounded-lg border border-[#e6e7ee] bg-[#f3f4fb] px-3 text-[15px] dark:border-[#1e293b] dark:bg-[#0b1220]";

  if (step === "done") {
    return (
      <div className="parts-database-stitch mx-auto w-full max-w-[900px] px-margin py-space-lg">
        <div className={`${D_CARD} flex flex-col items-center gap-4 p-10 text-center`}>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e6f4ea] dark:bg-[#14532d]/40">
            <MaterialIcon name="check" className="text-[36px] text-[#006e31] dark:text-[#4ade80]" />
          </span>
          <p className={`text-[26px] font-semibold ${D_TXT}`}>1 product saved</p>
          <p className={`text-[16px] ${D_MUTED}`}>
            {draft.vehicleListings.length} car{draft.vehicleListings.length === 1 ? " now shows" : "s now show"} {picked?.name ?? "the spec"}: {targetSpecValue}
          </p>
          <PartsButton variant="primary" onClick={onHome}>Back to Add parts</PartsButton>
        </div>
      </div>
    );
  }

  return (
    <div className="parts-database-stitch add-parts-flow mx-auto w-full max-w-[1100px] px-margin py-space-lg">
      <div className={`${D_CARD} mb-6 flex items-center gap-4 p-5`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#dbe1ff] dark:bg-[#1e3a8a]/40">
          <MaterialIcon name="science" className="text-[24px] text-[#0153dc]" />
        </span>
        <div>
          <p className={`text-[22px] font-semibold ${D_TXT}`}>A fluid, oil or size part</p>
          <p className={`text-[14px] ${D_MUTED}`}>Save the product, and add it to each car that uses it.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section className={`${D_CARD} flex flex-col gap-5 p-6`}>
            <p className={`flex items-center gap-3 text-[20px] font-semibold ${D_TXT}`}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0153dc] text-[13px] text-white">1</span>
              What is it, and which product?
            </p>
            <div className="flex flex-col gap-2">
              <p className={`text-[14px] font-medium ${D_TXT}`}>What is it?</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fluidTypes.map((t) => {
                  const on = t.id === partTypeId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPartTypeId(t.id);
                        setSpecKey(t.specFields[0]?.specKey ?? "brake_fluid");
                        if (step === "type") setStep("details");
                      }}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[14px] font-medium transition-all ${
                        on
                          ? "border-[#0153dc] bg-[#0153dc] text-white"
                          : `border-[#e6e7ee] bg-[#f3f4fb] hover:border-[#c5c6d0] dark:border-[#1e293b] dark:bg-[#0b1220] ${D_TXT}`
                      }`}
                    >
                      <PartTypeIcon iconKey={t.iconKey} className="text-[18px]" />
                      <span className="leading-tight">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {step !== "type" ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className={`text-[14px] font-medium ${D_TXT}`}>Brand</span>
                    <input className={fieldCls} placeholder="e.g. Toyota" value={brand} onChange={(e) => setBrand(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={`text-[14px] font-medium ${D_TXT}`}>Product number</span>
                    <input
                      className={`${fieldCls} ${D_MONO} text-[#0153dc]`}
                      placeholder="e.g. 2500H-A"
                      value={partNumber}
                      onChange={(e) => setPartNumber(e.target.value)}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className={`text-[14px] font-medium ${D_TXT}`}>The spec in plain words</span>
                  <input
                    className={fieldCls}
                    placeholder={specField?.example ? `e.g. ${specField.example}` : "e.g. DOT 3"}
                    value={specValue}
                    onChange={(e) => setSpecValue(e.target.value)}
                  />
                  <span className={`flex items-start gap-2 rounded-lg bg-[#f3f4fb] px-3 py-2 text-[13px] dark:bg-[#0b1220] ${D_MUTED}`}>
                    <MaterialIcon name="info" className="text-[16px]" />
                    {specField?.label ?? "Spec"}{specField?.example ? ` — e.g. ${specField.example}` : ""}
                  </span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className={`text-[14px] font-medium ${D_TXT}`}>The page you found it on</span>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MaterialIcon name="link" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-[#5d5f68]" />
                      <input
                        className={`${fieldCls} pl-9`}
                        placeholder="https://…"
                        value={draft.evidenceUrl}
                        onChange={(e) => setDraft({ ...draft, evidenceUrl: e.target.value })}
                      />
                    </div>
                    {draft.evidenceUrl ? (
                      <PartsButton variant="secondary" className="!h-11" onClick={() => window.open(draft.evidenceUrl, "_blank", "noopener")}>
                        Open <MaterialIcon name="open_in_new" className="text-[16px]" />
                      </PartsButton>
                    ) : null}
                  </div>
                </label>
                {step === "details" ? (
                  <PartsButton variant="primary" className="self-start" onClick={() => setStep("cars")} disabled={!detailsReady}>
                    Which cars use this? <MaterialIcon name="arrow_forward" className="text-[18px]" />
                  </PartsButton>
                ) : null}
              </>
            ) : null}
          </section>

          {step === "cars" ? (
            <section className={`${D_CARD} flex flex-col gap-4 p-6`}>
              <div className="flex items-start gap-3 rounded-xl bg-[#f3f6ff] p-4 dark:bg-[#1e3a8a]/20">
                <MaterialIcon name="sync_alt" className="text-[22px] text-[#0153dc]" />
                <p className={`text-[14px] ${D_TXT}`}>
                  We&apos;ll also add <b>&quot;{picked?.name ?? "Spec"}: {targetSpecValue || "…"}&quot;</b> to each ticked car&apos;s specs.
                </p>
              </div>
              <CatalogStep2Cars
                draft={draft}
                setDraft={setDraft}
                onNext={() => void save()}
                onBack={() => setStep("details")}
                framePreTickDone={framePreTickDone}
                setFramePreTickDone={setFramePreTickDone}
              />
            </section>
          ) : null}
        </div>

        <aside className={`${D_CARD} flex flex-col gap-4 p-6 lg:sticky lg:top-24 lg:col-span-5`}>
          <p className={`text-[22px] font-semibold leading-snug ${D_TXT}`}>
            Ready to save 1 product to {draft.vehicleListings.length} car spec{draft.vehicleListings.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-start gap-3 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0153dc] text-white">
              <MaterialIcon name="inventory_2" className="text-[18px]" />
            </span>
            <div>
              <p className={`text-[14px] font-semibold ${D_TXT}`}>The product</p>
              <p className={`text-[14px] ${D_MUTED}`}>
                {brand || partNumber ? <b className={D_TXT}>{`${brand} ${partNumber}`.trim()}</b> : "Not filled in yet"}
                {picked ? ` (${picked.name})` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-[#f3f4fb] p-4 dark:bg-[#0b1220]">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white dark:bg-[#111a2e] ${D_TXT}`}>
              <MaterialIcon name="directions_car" className="text-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-semibold ${D_TXT}`}>Car specs</p>
              <p className={`text-[14px] ${D_MUTED}`}>
                {draft.vehicleListings.length
                  ? `${draft.vehicleListings.length} car${draft.vehicleListings.length === 1 ? "" : "s"} will show "${specLabel}: ${targetSpecValue}"`
                  : "Tick the cars that use it."}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {draft.vehicleListings.map((l) => {
                  const old = byVehicle.get(l.vehicleId);
                  const change = old && old !== targetSpecValue;
                  return (
                    <li key={l.vehicleId} className={`text-[13px] ${D_MUTED}`}>
                      <span className={`font-medium ${D_TXT}`}>{l.make ?? ""} {l.model ?? l.label ?? "Car"}</span>
                      {change ? (
                        <span className="text-[#8a5a00] dark:text-[#fbbf24]"> · Change: {old} → {targetSpecValue}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <PartsButton
            variant="primary"
            className="!h-12 w-full text-[16px]"
            onClick={() => void save()}
            disabled={!detailsReady || !draft.vehicleListings.length}
          >
            <MaterialIcon name="save" className="text-[18px]" /> Save and update {draft.vehicleListings.length} car spec{draft.vehicleListings.length === 1 ? "" : "s"}
          </PartsButton>
          <PartsButton variant="danger" className="w-full" onClick={onHome}>Cancel</PartsButton>
        </aside>
      </div>
    </div>
  );
}
