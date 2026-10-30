// Stitch: dominion-redesign/S42e
import { PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import type { FindPartsCandidate, FindPartsResult, FoundPartRow, PlainSection } from "../partsDatabaseApi";

const DOTS = ["#0153dc", "#0e7490", "#b45309", "#7c3aed", "#006e31"];

function sectionsFrom(result: FindPartsResult): PlainSection[] {
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
      {result.mode === "legacy" ? (
        <p className="font-body-md text-body-md text-on-surface">Match types are switched off. Showing parts listed for this car only.</p>
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
        <button type="button" className="text-left rounded-2xl bg-surface-container-lowest shadow-md p-space-lg" onClick={() => onOpen(best)}>
          <span className="font-label-xs text-label-xs uppercase text-secondary">Best match</span>
          {best.status === "needs_checking" ? <span className="ml-2 font-label-xs text-label-xs">Needs checking</span> : null}
          <span className="font-headline-md text-headline-md font-bold text-on-surface block mt-1">{best.brand} {best.number}</span>
          <span className="font-body-sm text-body-sm text-secondary">{best.name}</span>
        </button>
      ) : null}
      {sections.map((section) => (
        <section key={section.tier} className="rounded-2xl bg-surface-container-lowest shadow-sm p-space-md border-l-4" style={{ borderColor: DOTS[section.tier - 1] }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DOTS[section.tier - 1] }} />
            <h3 className="font-headline-md text-headline-md font-semibold text-on-surface">{section.plainLabel}</h3>
            <span className="font-mono-sm text-mono-sm text-secondary">{section.tag}</span>
          </div>
          <p className="font-body-sm text-body-sm text-secondary mt-1">{section.items[0]?.reason || section.plainReason}</p>
          <div className="mt-3 flex flex-col">
            {section.items.map((item) => (
              <button key={item.partId + item.number} type="button" className="flex items-center justify-between py-2 text-left" onClick={() => onOpen(item)}>
                <span>
                  <span className="font-body-md text-body-md text-on-surface block">{item.name || "Part"}</span>
                  <span className="font-mono-sm text-mono-sm text-secondary">{[item.brand, item.number].filter(Boolean).join(" ")}</span>
                  <span className="font-body-sm text-body-sm text-secondary block">{fitLine(item.fitsVariantIds || [])}</span>
                </span>
                <span className="font-label-xs text-label-xs text-secondary">View details arrow_forward</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {empty.length > 0 ? <p className="font-body-sm text-body-sm text-secondary">Nothing on file for: {empty.join(", ")}</p> : null}
      <div className="flex items-center justify-between">
        <button type="button" className="h-12 px-4 text-secondary font-label-md text-label-md" onClick={onBack}>Back</button>
        <button type="button" className="h-12 px-5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add a part</button>
        <button type="button" className="h-12 px-4 text-secondary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>Add it now</button>
      </div>
      <p className="font-body-sm text-body-sm text-secondary">Open this car's parts page north_east</p>
      <div className="find-parts-phone-bar md:hidden sticky bottom-0 flex gap-2 bg-surface-container-lowest p-3">
        <button type="button" className="flex-1 h-12 rounded-xl bg-surface-container-low" onClick={onBack}>Back to parts</button>
        <button type="button" className="flex-1 h-12 rounded-xl bg-primary-container text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onAdd}>+ Add part</button>
        <span className="font-body-sm text-body-sm">+ add missing fitment (add now)</span>
      </div>
    </div>
  );
}
