import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PartsButton } from "../../PartsButton";
import {
  fetchMasterPartForExtend,
  fetchSelfServePartTypes,
  lookupSelfServePart,
  saveSelfServePart,
} from "../addPartsApi";
import { CatalogStep1Page } from "../catalog/CatalogStep1Page";
import { CatalogStep2Cars } from "../catalog/CatalogStep2Cars";
import { CatalogStep4Save } from "../catalog/CatalogStep4Save";
import { CatalogStep4Trust } from "../catalog/CatalogStep4Trust";
import { CatalogStepper } from "../catalog/CatalogStepper";
import { emptyCatalogDraft, type CatalogPageDraft } from "../addPartsTypes";
import { MaterialIcon } from "../../import/MaterialIcon";
import { D_CARD, D_MONO, D_MUTED, D_TINT, D_TXT, DFooter, DPill, DQuestion } from "../catalog/dominionKit";

type ExtendStep = 1 | 2 | 3 | 4;
type ReviewPhase = "trust" | "save";

export function ExtendPartFlow({
  onHome,
  onFindParts,
}: {
  onHome: () => void;
  onFindParts: () => void;
}) {
  const [step, setStep] = useState<ExtendStep>(1);
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>("trust");
  const [number, setNumber] = useState("");
  const [brand, setBrand] = useState("Toyota");
  const [lookup, setLookup] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<CatalogPageDraft>(() => ({ ...emptyCatalogDraft(), extendMode: true }));
  const [framePreTickDone, setFramePreTickDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const typesQuery = useQuery({ queryKey: ["self-serve-part-types"], queryFn: fetchSelfServePartTypes });

  async function onLookup() {
    try {
      const row = await lookupSelfServePart(brand, number);
      if (!row.found || !row.partId) {
        setLookup({ found: false });
        return;
      }
      setLookup(row as Record<string, unknown>);
      const detail = await fetchMasterPartForExtend(String(row.partId));
      const locked = (detail.listings ?? []) as Array<{ vehicleId: string; label?: string; yearFrom?: number; yearTo?: number }>;
      const lockedListings = locked.map((l) => ({
        vehicleId: l.vehicleId,
        label: l.label,
        yearFrom: l.yearFrom,
        yearTo: l.yearTo,
        trust: "confirmed" as const,
        locked: true,
      }));
      const typeList = typesQuery.data?.length ? typesQuery.data : await fetchSelfServePartTypes();
      const partType = typeList.find((t) => t.id === row.partTypeId) ?? null;
      setDraft({
        ...emptyCatalogDraft(),
        extendMode: true,
        extendPartId: String(row.partId),
        extendPartLabel: detail.name ? String(detail.name) : `${row.brand} ${row.number}`,
        extendListingCount: Number(row.listingCount ?? locked.length),
        evidenceUrl: "",
        sourceType:
          row.sourceType === "car_maker_catalogue" || row.sourceType === "part_maker_catalogue"
            ? row.sourceType
            : "other",
        catalogCarMaker: String(row.catalogCarMaker ?? ""),
        madeByCarMaker: row.partKind === "oem" ? true : row.partKind === "aftermarket" ? false : null,
        partKind: row.partKind === "oem" ? "oem" : "aftermarket",
        brandDefault: String(row.brand ?? brand),
        vehicleListings: lockedListings,
        partRows: [
          {
            clientId: crypto.randomUUID(),
            partTypeId: String(row.partTypeId ?? ""),
            partType,
            brand: String(row.brand ?? brand),
            partNumber: String(row.number ?? number),
            existingPartId: String(row.partId),
          },
        ],
      });
      setStep(2);
    } catch {
      setLookup({ found: false });
    }
  }

  async function onSave() {
    const partRow = draft.partRows[0];
    const partType = partRow?.partType ?? typesQuery.data?.find((t) => t.id === partRow?.partTypeId);
    if (!partType || !draft.extendPartId) return;
    const newCars = draft.vehicleListings.filter((l) => !l.locked);
    if (!newCars.length) {
      setSaveError("Pick at least one new car to add.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await saveSelfServePart({
        partType,
        brand: partRow.brand,
        partNumber: partRow.partNumber,
        name: partRow.partNumber,
        madeByCarMaker: draft.madeByCarMaker,
        catalogCarMaker: draft.catalogCarMaker,
        sourceType: draft.sourceType,
        evidenceUrl: draft.evidenceUrl,
        fitMode: "specific",
        listings: newCars.map((l) => ({
          vehicleId: l.vehicleId,
          label: l.label,
          yearFrom: l.yearFrom,
          yearTo: l.yearTo,
          listingTrust: l.trust ?? "confirmed",
          reason: l.reason,
        })),
        engineFamilyId: "",
        engineCode: "",
        excludedVehicleIds: [],
        specKey: "",
        specValue: "",
        specValues: {},
        position: "",
        side: "",
        factoryNumbers: [],
        existingPartId: draft.extendPartId,
        skipReplacesStep: true,
      });
      toast.success("Cars added to part");
      onFindParts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const stepperStep = step <= 3 ? step : 4;

  return (
    <div className="parts-database-stitch add-parts-flow w-full max-w-[960px] mx-auto px-margin py-space-lg catalog-add-parts">
      <CatalogStepper
        step={stepperStep as 1 | 2 | 3 | 4}
        extendMode
        onJump={(s) => {
          if (s < step && step <= 4) setStep(s as ExtendStep);
        }}
      />
      {step >= 2 && draft.extendPartLabel ? (
        <div className={`${D_CARD} mb-6 flex flex-wrap items-center gap-4 p-5`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#dbe1ff] dark:bg-[#1e3a8a]/40">
            <MaterialIcon name="inventory_2" className="text-[24px] text-[#0153dc]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-[20px] font-semibold ${D_TXT}`}>{draft.extendPartLabel}</p>
            <p className={`text-[14px] ${D_MUTED}`}>
              <span className={D_MONO}>{draft.brandDefault} {draft.partRows[0]?.partNumber}</span>
              {draft.partKind === "oem" ? ` · Genuine ${draft.brandDefault}` : ""}
            </p>
          </div>
          <DPill tone="blue" icon="directions_car">
            Fits {draft.extendListingCount ?? 0} car{(draft.extendListingCount ?? 0) === 1 ? "" : "s"} already on file
          </DPill>
          <PartsButton variant="secondary" onClick={() => setStep(1)}>
            <MaterialIcon name="history" className="text-[18px]" /> Change part
          </PartsButton>
        </div>
      ) : null}
      {step === 1 ? (
        <div className={`${D_CARD} p-5 sm:p-8`}>
          <DQuestion
            title="Type the part number"
            hint="The part must already be on file. We'll show it, then you add the new cars."
          />
          <div className={`${D_TINT} flex flex-wrap items-center gap-2 p-2`}>
            <input
              aria-label="Brand"
              className="h-11 w-36 rounded-lg border border-[#e6e7ee] bg-white px-3 text-[15px] dark:border-[#1e293b] dark:bg-[#111a2e]"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
            <div className="relative min-w-[220px] flex-1">
              <MaterialIcon name="manage_search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[22px] text-[#5d5f68]" />
              <input
                aria-label="Part number"
                placeholder="e.g. 90049-22193"
                className={`h-11 w-full rounded-lg border border-[#e6e7ee] bg-white pl-11 pr-3 text-[16px] dark:border-[#1e293b] dark:bg-[#111a2e] ${D_MONO}`}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onLookup(); }}
              />
            </div>
            <PartsButton variant="primary" className="!h-11" onClick={() => void onLookup()}>
              <MaterialIcon name="search" className="text-[18px]" /> Find the part
            </PartsButton>
          </div>
          {lookup?.found === false ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#fff4dc] px-3 py-2 text-[14px] text-[#8a5a00] dark:bg-[#451a03] dark:text-[#fbbf24]">
              <MaterialIcon name="info" className="text-[18px]" /> Not on file yet — add it from a catalogue page instead.
            </p>
          ) : null}
          <DFooter
            left={
              <PartsButton variant="secondary" onClick={onHome}>
                <MaterialIcon name="arrow_back" className="text-[18px]" /> Back to Add parts
              </PartsButton>
            }
          />
        </div>
      ) : null}
      {step === 2 ? (
        <div className={`${D_CARD} p-5 sm:p-8`}>
          <CatalogStep1Page
            draft={draft}
            setDraft={setDraft}
            onNext={() => setStep(3)}
            onCancel={onHome}
          />
        </div>
      ) : null}
      {step === 3 ? (
        <div className={`${D_CARD} p-5 sm:p-8`}>
        <CatalogStep2Cars
          draft={draft}
          setDraft={setDraft}
          onNext={() => {
            setReviewPhase("trust");
            setStep(4);
          }}
          onBack={() => setStep(2)}
          framePreTickDone={framePreTickDone}
          setFramePreTickDone={setFramePreTickDone}
        />
        </div>
      ) : null}
      {step === 4 && reviewPhase === "trust" ? (
        <div className={`${D_CARD} p-5 sm:p-8`}>
        <CatalogStep4Trust
          draft={draft}
          types={typesQuery.data ?? []}
          onBack={() => setStep(3)}
          onNext={() => setReviewPhase("save")}
          onTrustChange={(vehicleId, trust, reason) => {
            setDraft({
              ...draft,
              vehicleListings: draft.vehicleListings.map((l) =>
                l.locked ? l : l.vehicleId === vehicleId ? { ...l, trust, reason: reason ?? l.reason } : l,
              ),
            });
          }}
          onYearsChange={(vehicleId, yearFrom, yearTo) => {
            setDraft({
              ...draft,
              vehicleListings: draft.vehicleListings.map((l) =>
                l.locked ? l : l.vehicleId === vehicleId ? { ...l, yearFrom, yearTo } : l,
              ),
            });
          }}
        />
        </div>
      ) : null}
      {step === 4 && reviewPhase === "save" ? (
        <div className={`${D_CARD} p-5 sm:p-8`}>
        <CatalogStep4Save
          draft={draft}
          types={typesQuery.data ?? []}
          saving={saving}
          saveError={saveError}
          onSave={() => void onSave()}
          onBack={() => setReviewPhase("trust")}
        />
        </div>
      ) : null}
    </div>
  );
}
