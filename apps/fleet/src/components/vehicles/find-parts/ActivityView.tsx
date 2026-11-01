import { useMemo, useState } from "react";
import { Fp13Screen } from "./screens/Fp13Screen";
import { Fp16Screen } from "./screens/Fp16Screen";
import type { PartsActivity } from "./PartsActivityPanel";
import { buildFp13ViewModel, type Fp13RequestFilter } from "./findPartsViewModels";

export function ActivityView({
  activity,
  onBack,
  catalogNotice,
  onDismissNotice,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
  orgShortCode?: string;
  catalogNotice?: string;
  onDismissNotice?: () => void;
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
  };

  if (phone) {
    return (
      <Fp16Screen
        data={data}
        actions={actions}
        catalogNotice={catalogNotice}
        onDismissNotice={onDismissNotice}
      />
    );
  }

  return <Fp13Screen data={data} actions={actions} />;
}
