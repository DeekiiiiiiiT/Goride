// Stitch AP6
import type { AddPartsDraft } from "../addPartsTypes";
import { PositionChips, SpecFieldsBlock } from "../Step2FitBlock";

export function Step2BySpec({ draft, setDraft }: { draft: AddPartsDraft; setDraft: (d: AddPartsDraft) => void }) {
  if (!draft.partType) return null;
  return (
    <div className="flex flex-col gap-3">
      <SpecFieldsBlock partType={draft.partType} draft={draft} setDraft={setDraft} />
      <PositionChips
        scheme={draft.partType.positionScheme}
        position={draft.position}
        side={draft.side}
        onPick={(pos, side) => setDraft({ ...draft, position: pos, side })}
      />
    </div>
  );
}
