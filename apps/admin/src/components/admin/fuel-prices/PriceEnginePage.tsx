// Stitch P1–P7: exact ports from Downloads stitch_dominion_redesign HTML + live /admin/prices/*
import { useCallback, useEffect, useState } from "react";
import { peFetch, type OverviewResponse, type Tab } from "./priceEngineApi";
import { PriceEngineOverviewTab } from "./PriceEngineOverview";
import { PriceEnginePublishedTab } from "./PriceEnginePublished";
import { PriceEngineReportersTab } from "./PriceEngineReporters";
import { PriceEngineReviewTab } from "./PriceEngineReview";
import { PriceEngineSettingsTab } from "./PriceEngineSettings";

export function PriceEnginePage() {
  const [tab, setTab] = useState<Tab>("review");
  const [reviewCount, setReviewCount] = useState(0);
  const [petrojamWeek, setPetrojamWeek] = useState("—");
  const [error, setError] = useState("");
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadMeta = useCallback(() => {
    void peFetch<OverviewResponse>("/admin/prices/overview")
      .then((body) => {
        setReviewCount(body.review || 0);
        const week = body.overview?.petrojamWeek;
        setPetrojamWeek(week ? String(week).slice(0, 10) : "—");
      })
      .catch(() => setReviewCount(0));
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const onTab = (t: Tab) => {
    setError("");
    setTab(t);
  };

  const onRecalculate = () => {
    setRecalcBusy(true);
    void peFetch<{ republished: number }>("/admin/prices/recalculate-all", { method: "POST" })
      .then(() => {
        loadMeta();
        setRefreshKey((k) => k + 1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setRecalcBusy(false));
  };

  return (
    <div className="price-engine-stitch font-body text-on-surface antialiased bg-surface-container-low w-full px-8 py-8 min-h-[70vh]">
      {error ? (
        <p className="mb-4 text-sm text-error font-label bg-error-container/20 px-3 py-2 rounded-lg">{error}</p>
      ) : null}

      {tab === "overview" ? (
        <PriceEngineOverviewTab
          onError={setError}
          onTab={onTab}
          reviewCount={reviewCount}
          petrojamWeek={petrojamWeek}
          onRecalculate={onRecalculate}
          recalcBusy={recalcBusy}
          refreshKey={refreshKey}
        />
      ) : null}

      {tab === "review" ? (
        <PriceEngineReviewTab
          onError={setError}
          onChanged={loadMeta}
          onTab={onTab}
          reviewCount={reviewCount}
        />
      ) : null}

      {tab === "published" ? (
        <PriceEnginePublishedTab
          onError={setError}
          onTab={onTab}
          reviewCount={reviewCount}
          petrojamWeek={petrojamWeek}
        />
      ) : null}

      {tab === "reporters" ? (
        <PriceEngineReportersTab onError={setError} onTab={onTab} reviewCount={reviewCount} />
      ) : null}

      {tab === "settings" ? (
        <PriceEngineSettingsTab
          onError={setError}
          onTab={onTab}
          reviewCount={reviewCount}
          petrojamWeek={petrojamWeek}
        />
      ) : null}
    </div>
  );
}
