/**
 * A6 — Check and save, ported from docs/stitch/dominion-add-parts-self-serve/step_4_review_and_save/code.html.
 * Dropped (audit A6): "Final verification pass", "total relational linkages", "Diagram Ref #", "Commit lock",
 * "Ready to sync", sides in names. Kept: one card per part with car tiles, Save all at top and bottom.
 */
import { PartsButton } from "../../PartsButton";
import { MaterialIcon } from "../../import/MaterialIcon";
import { MakerLogo } from "../../../vehicle-catalog/MakerLogo";
import type { CatalogPageDraft, CatalogPartRow, PartTypeRow } from "../addPartsTypes";
import { defaultPartNamePreview, PartTypeIcon } from "../addPartsShared";
import { vehicleListingYearsLabel } from "./vehicleDiffLabel";
import { D_MONO, D_MUTED, D_TXT, DCode, DFooter, DPill } from "./dominionKit";

export function CatalogStep4Save({
  draft,
  types,
  saving,
  saveError,
  onSave,
  onBack,
}: {
  draft: CatalogPageDraft;
  types: PartTypeRow[];
  saving: boolean;
  saveError?: string;
  onSave: () => void;
  onBack: () => void;
}) {
  const rows = draft.partRows.filter((r) => r.partNumber.trim());
  const cars = draft.vehicleListings.length;
  const fits = rows.length * cars;
  const saveLabel = saving ? "Saving…" : `Save all ${rows.length} part${rows.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <h2 className={`text-[30px] font-semibold tracking-tight ${D_TXT}`}>Check and save</h2>
          <p className="text-[24px] font-semibold tabular-nums text-[#0153dc] dark:text-[#93b4ff]">
            {rows.length} part{rows.length === 1 ? "" : "s"} × {cars} car{cars === 1 ? "" : "s"} = {fits} fit{fits === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PartsButton variant="secondary" onClick={() => window.open(draft.evidenceUrl, "_blank", "noopener")}>
            Open the page <MaterialIcon name="open_in_new" className="text-[16px]" />
          </PartsButton>
          <PartsButton variant="primary" onClick={onSave} disabled={saving || !rows.length}>
            <MaterialIcon name="cloud_upload" className="text-[18px]" /> {saveLabel}
          </PartsButton>
        </div>
      </div>

      {saveError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#f3c4c3] bg-[#fdecec] p-4 dark:border-[#7f1d1d] dark:bg-[#450a0a]">
          <span className="flex items-center gap-2 text-[15px] text-[#a83836] dark:text-[#f87171]">
            <MaterialIcon name="error" className="text-[20px]" /> Nothing was saved. Your rows are still here.
          </span>
          <PartsButton variant="secondary" onClick={onSave}>Try again</PartsButton>
        </div>
      ) : null}

      {rows.map((row) => (
        <PartReviewCard key={row.clientId} row={row} types={types} draft={draft} />
      ))}

      <DFooter
        left={
          <div className="flex flex-wrap gap-2">
            <PartsButton variant="danger" onClick={onBack}>Cancel</PartsButton>
            <PartsButton variant="secondary" onClick={onBack}>
              <MaterialIcon name="arrow_back" className="text-[18px]" /> Back to trust
            </PartsButton>
          </div>
        }
        right={
          <PartsButton variant="primary" onClick={onSave} disabled={saving || !rows.length}>
            <MaterialIcon name="check_circle" className="text-[18px]" /> {saveLabel}
          </PartsButton>
        }
      />
    </div>
  );
}

function PartReviewCard({
  row,
  types,
  draft,
}: {
  row: CatalogPartRow;
  types: PartTypeRow[];
  draft: CatalogPageDraft;
}) {
  const type = row.partType ?? types.find((t) => t.id === row.partTypeId);
  const name = type
    ? defaultPartNamePreview(type.name, type.positionScheme, row.position, row.side, row.catalogueNumber)
    : row.partNumber;
  const brand = row.brand || draft.catalogCarMaker || "Toyota";
  const genuine = draft.partKind === "oem" ? `Genuine ${brand}` : brand;
  const where = [
    row.position ? row.position.charAt(0).toUpperCase() + row.position.slice(1) : null,
    row.side ? (row.side === "both" ? "Both sides" : row.side.charAt(0).toUpperCase() + row.side.slice(1)) : null,
    row.catalogueNumber ? `No.${row.catalogueNumber}` : null,
  ].filter(Boolean).join(" · ");
  const nCars = draft.vehicleListings.length;
  return (
    <article className="rounded-2xl border border-[#e6e7ee] bg-white p-5 dark:border-[#1e293b] dark:bg-[#111a2e] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#dbe1ff] dark:bg-[#1e3a8a]/40">
          {type?.iconKey ? (
            <PartTypeIcon iconKey={type.iconKey} className="text-[24px] text-[#0153dc]" />
          ) : (
            <MaterialIcon name="build" className="text-[24px] text-[#0153dc]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`text-[20px] font-semibold ${D_TXT}`}>{name}</h3>
            <span className={`rounded-md border border-[#e6e7ee] px-2 py-0.5 text-[15px] font-semibold dark:border-[#1e293b] ${D_MONO} ${D_TXT}`}>
              {row.partNumber}
            </span>
            <DPill tone="grey" icon="directions_car">{genuine}</DPill>
          </div>
          {where ? <p className={`mt-1 text-[15px] ${D_MUTED}`}>{where}</p> : null}
        </div>
      </div>

      <p className={`mt-5 mb-2 text-[13px] font-semibold ${D_MUTED}`}>
        Fits {nCars} car{nCars === 1 ? "" : "s"}
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {draft.vehicleListings.map((v) => (
          <div key={v.vehicleId} className="flex items-center gap-3 rounded-xl bg-[#f3f4fb] px-3 py-2.5 dark:bg-[#0b1220]">
            <MakerLogo make={v.make ?? "?"} size={28} />
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] font-semibold ${D_TXT}`}>
                {v.make ?? ""} {v.model ?? v.label ?? "Car"} {v.diffLabel ? <span className={`font-normal ${D_MUTED}`}>· {v.diffLabel}</span> : null}
              </p>
              <p className={`flex flex-wrap items-center gap-1.5 text-[13px] ${D_MUTED}`}>
                {vehicleListingYearsLabel(v.yearFrom, v.yearTo)}
                {v.chassisCode ? <DCode>{v.chassisCode}</DCode> : null}
              </p>
            </div>
            {v.trust === "needs_checking" ? (
              <DPill tone="amber" icon="schedule">Needs checking</DPill>
            ) : (
              <DPill tone="green" icon="check_circle">Verified</DPill>
            )}
          </div>
        ))}
      </div>

      {row.existingPartId ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#f3f6ff] px-3 py-2 text-[14px] text-[#30323b] dark:bg-[#1e3a8a]/20 dark:text-[#e2e8f0]">
          <MaterialIcon name="info" className="text-[18px] text-[#0153dc]" />
          <span><b>Already on file</b> — adding {nCars} car{nCars === 1 ? "" : "s"} to it.</span>
        </p>
      ) : null}
      {row.factoryNumbers?.length ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-[#f3f4fb] px-3 py-2 text-[14px] text-[#30323b] dark:bg-[#0b1220] dark:text-[#e2e8f0]">
          <MaterialIcon name="swap_horiz" className="text-[18px]" />
          Also sold as {row.factoryNumbers.map((f) => `${f.brand ?? ""} ${f.number}`.trim()).join(", ")}
        </p>
      ) : null}
    </article>
  );
}
