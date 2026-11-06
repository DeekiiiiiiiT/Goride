// Stitch AP6
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import { PositionChips, SpecFieldsBlock } from "../Step2FitBlock";

const CONNECTOR_OPTIONS = ["Standard hook", "Side pin", "Bayonet"];

export function Step2BySpec({
  draft,
  setDraft,
  matchedCarCount,
}: {
  draft: AddPartsDraft;
  setDraft: (d: AddPartsDraft) => void;
  matchedCarCount?: number | null;
}) {
  if (!draft.partType) return null;
  const connector = (draft.specValues.connector as string | undefined) ?? "";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
      <div className="lg:col-span-2 flex flex-col gap-space-md rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-lg shadow-sm">
        <h3 className="font-headline-md text-headline-md text-on-surface">Spec for {draft.partType.name}</h3>
        <SpecFieldsBlock partType={draft.partType} draft={draft} setDraft={setDraft} />
        <label className="flex flex-col gap-1 font-body-sm max-w-md">
          <span className="font-label-md text-label-md font-semibold text-on-surface">Connector type</span>
          <select
            className="h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant/40 font-body-sm"
            value={connector}
            onChange={(e) =>
              setDraft({
                ...draft,
                specValues: { ...draft.specValues, connector: e.target.value },
              })
            }
          >
            <option value="">Choose connector…</option>
            {CONNECTOR_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          <p className="font-label-md text-label-md font-semibold text-on-surface">Which blade?</p>
          <PositionChips
            scheme={draft.partType.positionScheme}
            position={draft.position}
            side={draft.side}
            onPick={(pos, side) => setDraft({ ...draft, position: pos, side })}
          />
        </div>
        <p className="font-label-xs text-outline italic">Spec-based parts skip the replaces step — you can still add factory numbers later from the part record.</p>
      </div>
      <aside className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-lg flex flex-col gap-space-md h-fit shadow-sm">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-bold">Live catalog matcher</span>
        <div className="rounded-lg bg-surface-container-lowest p-space-md flex flex-col items-center gap-2 border border-dashed border-outline-variant/50">
          <MaterialIcon name="directions_car" className="text-[48px] text-outline/40" />
          <p className="font-body-sm text-body-sm text-on-surface-variant text-center">Example: Toyota Roomy · M900A</p>
        </div>
        <p className="font-headline-lg text-headline-lg text-primary font-semibold tabular-nums">
          {matchedCarCount != null ? matchedCarCount : "—"}
        </p>
        <p className="font-body-sm text-body-sm text-on-surface-variant">car versions match this spec in the master catalog.</p>
        <div className="border-t border-outline-variant/30 pt-space-md space-y-2">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline font-bold">How other spec-based parts look</span>
          <div className="flex flex-col gap-1 font-mono-sm text-mono-sm text-primary">
            <span>650 mm · Driver · Roomy M900A</span>
            <span>400 mm · Passenger · Roomy M900A</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
