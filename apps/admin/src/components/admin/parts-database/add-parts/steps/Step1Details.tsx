// Stitch AP3
import { useQuery } from "@tanstack/react-query";
import type { AddPartsDraft, SourceType } from "../addPartsTypes";
import { fetchTopBrandsForPartType } from "../addPartsApi";
import type { SelfServePreview } from "../addPartsApi";
import { CAR_MAKER_CATALOGUE_OPTIONS, PartTypeIcon, draftFromPartLookup, normalizePartNumberKey, effectiveTrustLabel, isVerifiedTrustLabel, type SelfServePartLookup } from "../addPartsShared";
import { MaterialIcon } from "../../import/MaterialIcon";
import { PartsButton } from "../../PartsButton";
import { PartExistsPanel } from "../states/PartExistsPanel";
import { RequestCheckingSourcePanel } from "../states/RequestCheckingSourcePanel";

const SOURCE_OPTIONS: Array<{ id: SourceType; title: string; detail: string; badge?: string }> = [
  {
    id: "car_maker_catalogue",
    title: "Car maker's parts catalogue",
    detail: "Official OEM electronic parts catalog (e.g. Toyota EPC, Partsouq, Amayama, Honda e-Store)",
  },
  {
    id: "part_maker_catalogue",
    title: "Part maker's own catalogue",
    detail: "Dedicated manufacturing catalogue or direct engineering release (e.g. MK Kashiyama Web Cat, Brembo Parts, Denso Global)",
    badge: "Primary proof",
  },
  {
    id: "other",
    title: "Something else — shop, forum, \"equal parts\" list",
    detail: "Distributor landing portal, retailer inventory lookup, forum cross-reference sheet, or enthusiast tear-down",
  },
];

export function Step1Details({
  draft,
  setDraft,
  lookup,
  preview,
  onChangeType,
  onNext,
  onDismissDuplicate,
}: {
  draft: AddPartsDraft;
  setDraft: (d: AddPartsDraft) => void;
  lookup: Record<string, unknown> | null;
  preview: SelfServePreview | null;
  onChangeType: () => void;
  onNext: () => void;
  onDismissDuplicate: () => void;
}) {
  const brands = useQuery({
    queryKey: ["top-brands", draft.partType?.id],
    queryFn: () => fetchTopBrandsForPartType(draft.partType!.id),
    enabled: Boolean(draft.partType?.id),
  });

  if (!draft.partType) return null;

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-md p-space-xl space-y-space-xl">
      <div className="flex items-center justify-between bg-surface-container-low px-space-md py-space-sm rounded-lg gap-3 flex-wrap">
        <div className="flex items-center gap-space-sm min-w-0">
          <div className="w-8 h-8 rounded bg-primary-fixed flex items-center justify-center text-primary-container shrink-0">
            {draft.partType.iconKey ? <PartTypeIcon iconKey={draft.partType.iconKey} className="text-[20px]" /> : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="font-headline-md text-body-md font-semibold text-on-surface">{draft.partType.name}</span>
            {draft.partType.tradeTerm ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded font-mono-sm text-label-xs bg-surface-container-highest text-on-surface-variant">
                {draft.partType.tradeTerm}
              </span>
            ) : null}
          </div>
        </div>
        <PartsButton variant="secondary" className="shrink-0" onClick={onChangeType}>
          Change
        </PartsButton>
      </div>

      <div className="space-y-1">
        <h2 className="font-headline-xl text-headline-xl text-on-surface">Which part exactly?</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Copy these from the page. Brand and part number as printed.
        </p>
      </div>

      {lookup?.found && draft.existingPartId === String(lookup.partId) ? (
        // Owner chose "Add more cars to it": stay here so the source link for the new cars can be pasted.
        <div className="rounded-xl border border-primary-container/40 bg-primary-container/5 p-space-md flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-0.5">
            <p className="font-body-md font-semibold text-on-surface">
              Adding more cars to {String(lookup.brand)} {String(lookup.number)} · {String(lookup.listingCount)} fits on file
            </p>
            <p className="font-body-sm text-on-surface-variant">
              Paste the page that lists the new cars below, then press Next.
            </p>
          </div>
          <button
            type="button"
            className="whitespace-nowrap px-4 h-10 rounded-lg border border-outline-variant/60 bg-surface-container-lowest font-label-md shrink-0"
            onClick={() => {
              setDraft({ ...draft, existingPartId: null });
              onDismissDuplicate();
            }}
          >
            It&apos;s a different part
          </button>
        </div>
      ) : lookup?.found ? (
        <PartExistsPanel
          onAddMore={() => {
            setDraft(draftFromPartLookup(draft, lookup as SelfServePartLookup));
          }}
          onDifferent={onDismissDuplicate}
          label={`${String(lookup.brand)} ${String(lookup.number)} · ${String(lookup.listingCount)} fits on file`}
        />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
        <div className="space-y-1.5">
          <label className="block font-label-md text-label-md font-semibold text-on-surface" htmlFor="add-part-brand">Brand</label>
          <div className="relative">
            <input
              className="w-full h-10 px-3 pr-10 bg-surface-container-lowest rounded-lg font-body-md text-body-md text-on-surface shadow-sm focus:bg-surface-container-low focus:outline-none"
              id="add-part-brand"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
            <MaterialIcon name="unfold_more" className="absolute right-3 top-2.5 text-secondary text-[20px] pointer-events-none" />
          </div>
          <p className="font-body-sm text-body-sm text-outline">Who makes it</p>
          {(brands.data?.length ?? 0) > 0 ? (
            <div className="pt-1 flex items-center gap-1.5 flex-wrap">
              <span className="font-mono-sm text-[10px] text-outline uppercase">Quick picks:</span>
              {brands.data!.map((b) => (
                <button
                  key={b.brand}
                  type="button"
                  className="font-mono-sm text-[11px] px-1.5 py-0.5 bg-surface-container rounded text-on-surface-variant hover:text-primary-container"
                  onClick={() => setDraft({ ...draft, brand: b.brand })}
                >
                  {b.brand}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <label className="block font-label-md text-label-md font-semibold text-on-surface" htmlFor="add-part-number">Part number</label>
          <div className="relative">
            <input
              className="w-full h-10 px-3 pr-10 bg-surface-container-lowest rounded-lg font-mono-md text-mono-md font-medium text-on-surface shadow-sm focus:bg-surface-container-low focus:outline-none uppercase tracking-wide"
              id="add-part-number"
              value={draft.partNumber}
              onChange={(e) => setDraft({ ...draft, partNumber: e.target.value })}
            />
            <MaterialIcon name="pin" className="absolute right-3 top-2.5 text-secondary text-[20px] pointer-events-none" />
          </div>
          <p className="font-body-sm text-body-sm text-outline">As printed. Spaces and dashes don&apos;t matter.</p>
          {draft.partNumber.trim() ? (
            <div className="pt-1 flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-surface-container-high rounded text-secondary font-mono-sm text-[11px]">
                <MaterialIcon name="fingerprint" className="text-[13px] text-secondary" />
                <span>
                  Normalized key: <strong className="text-on-surface">{normalizePartNumberKey(draft.partNumber)}</strong>
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="block font-label-md text-label-md font-semibold text-on-surface">Made by the car maker?</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm p-1 bg-surface-container rounded-xl">
            <button
              type="button"
              className={draft.madeByCarMaker === true
                ? "flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary shadow-sm"
                : "flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-high/60"}
              onClick={() => setDraft({ ...draft, madeByCarMaker: true, sourceType: "car_maker_catalogue" })}
            >
              <MaterialIcon name="verified" className="text-[18px]" />
              Yes — genuine (OEM)
            </button>
            <button
              type="button"
              className={draft.madeByCarMaker === false
                ? "flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary shadow-sm"
                : "flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-high/60"}
              onClick={() => setDraft({ ...draft, madeByCarMaker: false, sourceType: draft.sourceType === "car_maker_catalogue" ? "part_maker_catalogue" : draft.sourceType })}
            >
              <MaterialIcon name="factory" className="text-[18px]" />
              No — another brand (aftermarket)
            </button>
          </div>
          {draft.madeByCarMaker === null && !draft.existingPartId ? (
            <p className="font-body-sm text-body-sm text-amber-800 dark:text-amber-200">Pick one to continue.</p>
          ) : null}
        </div>
      </div>

      <div className="h-px bg-surface-container-highest w-full" />

      <div className="space-y-space-md">
        <div className="space-y-1">
          <h3 className="font-headline-lg text-headline-lg text-on-surface">Where did you see it?</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">A link to the catalogue page where you found this part.</p>
        </div>

        {draft.sourceType !== "other" ? (
          <div className="space-y-1.5">
            <label className="block font-label-md text-label-md font-semibold text-on-surface" htmlFor="add-part-source-link">Source page link</label>
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <MaterialIcon name="link" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]" />
                <input
                  className="w-full h-10 pl-9 pr-3 bg-surface-container-lowest rounded-lg font-mono-sm text-body-sm text-on-surface shadow-sm focus:bg-surface-container-low focus:outline-none"
                  id="add-part-source-link"
                  value={draft.evidenceUrl}
                  onChange={(e) => setDraft({ ...draft, evidenceUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              {draft.evidenceUrl.trim() ? (
                <a
                  href={draft.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-4 shrink-0 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold inline-flex items-center gap-1"
                >
                  Open
                  <MaterialIcon name="open_in_new" className="text-[16px]" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-2" role="radiogroup" aria-label="Source type">
          {SOURCE_OPTIONS.map((opt) => {
            const selected = draft.sourceType === opt.id;
            return (
              <label
                key={opt.id}
                className={selected
                  ? "flex items-start gap-space-md p-3.5 rounded-lg bg-primary-fixed/20 shadow-sm cursor-pointer"
                  : "flex items-start gap-space-md p-3.5 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer"}
              >
                <input
                  type="radio"
                  name="catalog-source"
                  className="mt-1 text-primary-container"
                  checked={selected}
                  onChange={() => setDraft({ ...draft, sourceType: opt.id })}
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-body-sm text-body-sm font-semibold block ${selected ? "text-primary-container" : "text-on-surface"}`}>
                      {opt.title}
                    </span>
                    {opt.badge && selected ? (
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded font-mono-sm text-[10px] bg-primary-container text-on-primary">{opt.badge}</span>
                    ) : null}
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant block">{opt.detail}</span>
                </div>
              </label>
            );
          })}
        </div>

        {draft.sourceType === "car_maker_catalogue" ? (
          <div className="space-y-1.5">
            <label className="block font-label-md text-label-md font-semibold text-on-surface">Which car maker&apos;s catalogue?</label>
            <div className="relative">
              <select
                id="catalog-car-maker-select"
                className="w-full h-10 pl-3 pr-10 rounded-lg bg-surface-container-lowest font-body-md text-body-md text-on-surface appearance-none shadow-sm focus:outline-none focus:bg-surface-container-low"
                value={draft.catalogCarMaker}
                onChange={(e) => {
                  const catalogCarMaker = e.target.value;
                  setDraft({
                    ...draft,
                    catalogCarMaker,
                    brand: draft.madeByCarMaker === true && catalogCarMaker ? catalogCarMaker : draft.brand,
                  });
                }}
              >
                <option value="">Choose car maker…</option>
                {CAR_MAKER_CATALOGUE_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <MaterialIcon name="expand_more" className="absolute right-3 top-2.5 text-outline text-[20px] pointer-events-none" />
            </div>
            <p className="font-body-sm text-body-sm text-outline">Used for EPC lookup and verified provenance (Partsouq, Amayama, etc.).</p>
          </div>
        ) : null}

        {draft.sourceType === "other" ? (
          <RequestCheckingSourcePanel
            evidenceUrl={draft.evidenceUrl}
            onChange={(evidenceUrl) => setDraft({ ...draft, evidenceUrl })}
          />
        ) : (() => {
          const trust = effectiveTrustLabel(preview?.trustLabel, draft.sourceType);
          const verified = isVerifiedTrustLabel(preview?.trustLabel, draft.sourceType);
          return (
            <div className="p-space-md rounded-xl bg-surface-container flex items-start gap-space-md shadow-sm">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${verified ? "bg-surface-container-lowest text-primary-container" : "bg-amber-900/10 text-amber-800 dark:text-amber-200"}`}>
                <MaterialIcon name={verified ? "verified" : "help"} className="text-[20px]" />
              </div>
              <div className="space-y-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono-sm text-[11px] font-semibold ${verified ? "bg-surface-container-highest text-primary-container" : "bg-amber-900/15 text-amber-950 dark:text-amber-100"}`}>
                  {trust.split("·")[0]?.trim() ?? (verified ? "Verified" : "Needs checking")}
                </span>
                <p className="font-body-sm text-body-sm text-on-surface">{trust}</p>
              </div>
            </div>
          );
        })()}
      </div>

      {draft.partType.defaultFitMode === "spec" ? (
        <div className="p-space-md rounded-xl bg-surface-container-low border border-outline-variant/30 flex items-start gap-space-md">
          <MaterialIcon name="straighten" className="text-primary-container text-[20px] shrink-0" />
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            This is a <span className="font-semibold text-on-surface">spec-based part type</span>. Step 2 asks for size or spec instead of ticking cars; the catalog matcher links it to car versions automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}
