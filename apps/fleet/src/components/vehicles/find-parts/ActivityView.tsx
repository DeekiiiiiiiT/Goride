import { useMemo, useState } from "react";
import { api } from "../../../services/api";
import { Fp10Screen } from "./screens/Fp10Screen";
import { PartsActivityPanel } from "./PartsActivityPanel";
import type { PartsActivity } from "./PartsActivityPanel";
import { buildFp10ViewModel, type Fp10ActivityFilter } from "./findPartsViewModels";
import { navigateFleetMaintenanceTab, notifyPartsAdmin } from "./findPartsActions";
import { useForcePartsSupplierSync, usePartsSupplierSync } from "./findPartsQueries";

function feedConnectedCount(sync: { connectedFeeds?: number; feedsConnected?: number; last?: { status?: string } } | undefined): number {
  const explicit = sync?.connectedFeeds ?? sync?.feedsConnected;
  if (typeof explicit === "number" && explicit >= 0) return explicit;
  return sync?.last?.status === "ok" ? 1 : 0;
}

export function ActivityView({
  activity,
  onBack,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
}) {
  const supplierSync = usePartsSupplierSync();
  const forceSync = useForcePartsSupplierSync();
  const [activityFilter, setActivityFilter] = useState<Fp10ActivityFilter>("all");

  const feedConnected = feedConnectedCount(supplierSync.data as { connectedFeeds?: number; feedsConnected?: number; last?: { status?: string } } | undefined);

  const data = useMemo(
    () => buildFp10ViewModel({ activity: activity ?? undefined, feedConnected, activityFilter }),
    [activity, feedConnected, activityFilter],
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
          onForceSync: () => { void forceSync.mutateAsync().catch(() => undefined); },
          onDismissAlert: () => {
            const id = activity?.repeatAlerts.items?.[0]?.id;
            if (id) void api.dismissPartRepeatAlert(String(id)).catch(() => undefined);
          },
          onInspect: () => scrollToSection("section-alerts"),
          onReviewOffer: () => scrollToSection("section-quotes"),
          onInvestigate: () => scrollToSection("section-alerts"),
          onOpenCatalogSearch: onBack,
          onFilterTab: setActivityFilter,
          onSeeAllRequests: () => { setActivityFilter("requests"); scrollToSection("section-requests"); },
          onSeeAllQuotes: () => { setActivityFilter("quotes"); scrollToSection("section-quotes"); },
          onSeeAllAlerts: () => { setActivityFilter("alerts"); scrollToSection("section-alerts"); },
          onReviewWarrantyTerms: () => {
            void notifyPartsAdmin({
              kind: "warranty_terms",
              title: "Warranty terms review",
              body: "Fleet user requested SLA Guarantee / warranty terms from parts activity.",
            }).catch(() => undefined);
          },
          onViewReturnLedger: () => navigateFleetMaintenanceTab("ledger"),
        }}
      />
    </div>
  );
}
