import { useMemo, useState } from "react";
import { api } from "../../../services/api";
import { Fp10Screen } from "./screens/Fp10Screen";
import { PartsActivityPanel } from "./PartsActivityPanel";
import type { PartsActivity } from "./PartsActivityPanel";
import { buildFp10ViewModel, type Fp10ActivityFilter } from "./findPartsViewModels";

export function ActivityView({
  activity,
  onBack,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
}) {
  const [activityFilter, setActivityFilter] = useState<Fp10ActivityFilter>("all");

  const data = useMemo(
    () => buildFp10ViewModel({ activity: activity ?? undefined, activityFilter }),
    [activity, activityFilter],
  );

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <PartsActivityPanel activity={activity} onSeeAll={() => scrollToSection("section-requests")} onAsk={onBack} />
      <p className="font-body-sm text-caption text-on-surface-variant mb-space-sm">{data.regionLabel} · {data.anomalyLine}</p>
      <Fp10Screen
        data={data}
        actions={{
          onBack,
          onDismissAlert: () => {
            const id = activity?.repeatAlerts.items?.[0]?.id;
            if (id) void api.dismissPartRepeatAlert(String(id)).catch(() => undefined);
          },
          onInspect: () => scrollToSection("section-alerts"),
          onInvestigate: () => scrollToSection("section-alerts"),
          onOpenCatalogSearch: onBack,
          onFilterTab: setActivityFilter,
          onSeeAllRequests: () => { setActivityFilter("requests"); scrollToSection("section-requests"); },
          onSeeAllAlerts: () => { setActivityFilter("alerts"); scrollToSection("section-alerts"); },
        }}
      />
    </div>
  );
}
