// Stitch: dominion-redesign/S42e
import { PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import type { FindPartsCandidate, FindPartsResult, FoundPartRow, PlainSection } from "../partsDatabaseApi";
import { PartsMatchTypesOff } from "../PartsDatabaseStates";

const DOTS = ["#0153dc", "#0e7490", "#b45309", "#7c3aed", "#006e31"];

export function sectionsFrom(result: FindPartsResult): PlainSection[] {
  if (result.plainSections && result.plainSections.length > 0) return result.plainSections;
  return (result.sections ?? []).map((section) => {
    const tier = PART_MATCH_TIERS.find((row) => row.tier === section.tier);
    return {
      tier: section.tier,
      plainLabel: tier?.plainLabel ?? section.label,
      tag: tier?.tag ?? "",
      plainReason: tier?.plainReason ?? "",
      items: (section.items ?? []).map((item) => {
        const part = (item.part ?? {}) as Record<string, unknown>;
        const decision = String(item.catalogDecision ?? part.catalog_decision ?? "");
        return {
          partId: String(part.id ?? item.fitmentId ?? ""),
          name: String(part.name ?? "Part"),
          brand: String(part.manufacturer ?? ""),
          number: String(part.oem_part_number ?? ""),
          tier: section.tier,
          reason: tier?.plainReason ?? "",
          status: decision === "confirmed" ? "verified" as const : "needs_checking" as const,
          fitsVariantIds: [],
        };
      }),
    };
  }).filter((section) => section.items.length > 0);
}

export function ResultsView({
  title,
  codeLine,
  fitsEvery,
  candidates,
  result,
  owner,
  onAdd,
  onBack,
  onOpen,
  onOpenDatabase,
}: {
  title: string;
  codeLine: string;
  fitsEvery: string;
  candidates: FindPartsCandidate[];
  result: FindPartsResult;
  owner: boolean;
  onAdd: () => void;
  onBack: () => void;
  onOpen: (part: FoundPartRow) => void;
  onOpenDatabase?: () => void;
}) {
  const sections = sectionsFrom(result);
  const empty = (result.emptyTiers ?? []).map((tier) => PART_MATCH_TIERS.find((row) => row.tier === tier)?.plainLabel).filter(Boolean);
  const best = result.bestPick;
  const coverage = result.coverage;
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  function fitLine(ids: string[]) {
    if (!ids.length || candidates.length < 2) return "";
    if (ids.length >= candidates.length) return `Fits all ${candidates.length}`;
    const names = candidates.filter((row) => ids.includes(row.id)).map((row) => row.plainLabel).filter(Boolean);
    return names.length ? `Only the ${names.join(", ")}` : "";
  }
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="find-parts-phone-header flex flex-col gap-2">
        <p className="font-label-xs text-label-xs uppercase tracking-wider text-secondary">Step 5 of 5 · Results</p>
        <div className="flex flex-wrap gap-1">
          <span className="px-2 py-1 rounded-full bg-surface-container-low font-body-sm text-body-sm">Version</span>
          {codeLine ? <span className="px-2 py-1 rounded-full bg-surface-container-low font-mono-sm text-mono-sm">{codeLine}</span> : null}
        </div>
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface">{title}</h2>
      </div>
      {result.mode === "legacy" ? (
        <PartsMatchTypesOff
          tierOneCount={sections.reduce((sum, section) => sum + (section.tier === 1 ? section.items.length : 0), 0)}
          offlineTiers={result.emptyTiers ?? [2, 3, 4, 5]}
        />
      ) : null}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">{title}</h2>
          {codeLine ? <span className="font-mono-sm text-mono-sm text-secondary">{codeLine}</span> : null}
          {fitsEvery ? <p className="font-body-sm text-body-sm text-secondary">{fitsEvery}</p> : null}
        </div>
        {coverage ? (
          <div className="flex flex-wrap gap-2 font-mono-sm text-mono-sm text-secondary">
            <span>Service essentials {coverage.essentials} of {coverage.essentialsTotal}</span>
            <span>Specs {coverage.specs} of {coverage.specsTotal}</span>
            <span>Other parts {coverage.otherParts}</span>
          </div>
        ) : null}
      </div>
      {best ? (
        <button type="button" className="relative text-left bg-surface-container-lowest rounded-xl p-space-lg shadow-md overflow-hidden" onClick={() => onOpen(best)}>
          <span className="absolute top-0 left-0 right-0 h-1.5 bg-primary-container" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold uppercase">Recommended fit</span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container text-primary font-mono-sm text-mono-sm">{PART_MATCH_TIERS.find((row) => row.tier === best.tier)?.plainLabel}</span>
                <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-secondary">{PART_MATCH_TIERS.find((row) => row.tier === best.tier)?.tag}</span>
                <span className="font-mono-sm text-mono-sm text-secondary">{best.status === "verified" ? "Verified" : "Needs checking"}</span>
              </div>
              <h3 className="font-headline-lg text-headline-lg text-on-surface font-bold mt-2">{[best.brand, best.number].filter(Boolean).join(" ")}{best.name ? ` — ${best.name}` : ""}</h3>
              <p className="font-body-sm text-body-sm text-secondary">{best.reason}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-primary font-label-md text-label-md font-semibold">View details <span className="material-symbols-outlined text-[16px]">arrow_forward</span></span>
          </div>
        </button>
      ) : null}
      {sections.map((section) => (
        <section key={section.tier} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: DOTS[section.tier - 1] }} />
          <div className="p-space-lg flex-1">
            <div className="flex flex-wrap items-center gap-2 pb-space-sm">
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">{section.plainLabel}</h3>
              <span className="px-2 py-0.5 rounded-full font-mono-sm text-mono-sm font-semibold" style={{ color: DOTS[section.tier - 1] }}>{section.items.length}</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-secondary">{section.tag}</span>
              <span className="font-body-sm text-body-sm text-secondary">{section.plainReason}</span>
            </div>
            <div className="flex flex-col gap-2">
              {section.items.map((item) => (
                <button key={item.partId + item.number} type="button" className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low text-left" onClick={() => onOpen(item)}>
                  <span>
                    <span className="font-body-md text-body-md font-semibold text-on-surface">{item.name || "Part"}</span>
                    <span className="font-mono-md text-mono-md font-semibold text-primary ml-2">{[item.brand, item.number].filter(Boolean).join(" ")}</span>
                    <span className="font-body-sm text-body-sm text-secondary block">{fitLine(item.fitsVariantIds || [])} {item.status === "verified" ? "Verified" : "Needs checking"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary font-label-md text-label-md font-semibold shrink-0">View details <span className="material-symbols-outlined text-[16px]">arrow_forward</span></span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ))}
      {empty.length > 0 ? <p className="font-body-sm text-body-sm text-secondary">Nothing on file for: {empty.join(", ")}</p> : null}
      <div className="flex items-center justify-between">
        <button type="button" className="h-12 px-4 text-secondary font-label-md text-label-md" onClick={onBack}>Back</button>
        <button type="button" className="h-12 px-5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add a part</button>
        <button type="button" className="h-12 px-4 text-secondary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add it now</button>
      </div>
      <button type="button" className="font-body-sm text-body-sm text-secondary text-left" onClick={onOpenDatabase}>Open this car's parts page</button>
      <div className="find-parts-phone-bar md:hidden sticky bottom-0 flex gap-2 bg-surface-container-lowest p-3">
        <button type="button" className="flex-1 h-12 rounded-xl bg-surface-container-low" onClick={onBack}>Back to parts</button>
        <button type="button" className="flex-1 h-12 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>+ Add part</button>
        <span className="font-body-sm text-body-sm">+ add missing fitment (add now)</span>
      </div>
    </div>
  );
}
