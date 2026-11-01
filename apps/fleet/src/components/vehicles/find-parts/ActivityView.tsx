import { useMemo, useState } from "react";
import { Fp13Screen } from "./screens/Fp13Screen";
import { Fp16Screen } from "./screens/Fp16Screen";
import type { PartsActivity } from "./PartsActivityPanel";
import { buildFp13ViewModel, type Fp13RequestFilter } from "./findPartsViewModels";
import { api } from "../../../services/api";

export function ActivityView({
  activity,
  onBack,
  catalogNotice,
  onDismissNotice,
  onOpenFindParts,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
  orgShortCode?: string;
  catalogNotice?: string;
  onDismissNotice?: () => void;
  onOpenFindParts?: () => void;
}) {
  const [filter, setFilter] = useState<Fp13RequestFilter>("all");
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

  const data = useMemo(
    () => buildFp13ViewModel({ activity: activity ?? undefined, filter }),
    [activity, filter],
  );

  const actions = {
    onBack,
    onFilter: setFilter,
    onSeePart: () => onBack(),
    onAddNote: () => undefined,
    onSendNote: async (cardId: string, note: string) => {
      await api.appendPartsSourcingNote(cardId, note);
    },
  };

  if (phone) {
    return (
      <Fp16Screen
        data={data}
        actions={actions}
        catalogNotice={catalogNotice}
        onDismissNotice={onDismissNotice}
        onOpenFindParts={onOpenFindParts ?? onBack}
        onSeePartFromNotice={() => onBack()}
      />
    );
  }

  return <Fp13Screen data={data} actions={actions} />;
}
