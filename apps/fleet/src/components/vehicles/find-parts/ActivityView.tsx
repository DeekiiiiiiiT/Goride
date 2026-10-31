import { useRef } from "react";
import { api } from "../../../services/api";
import { Fp10Markup } from "./markup/Fp10Markup";
import { PartsActivityPanel } from "./PartsActivityPanel";
import type { PartsActivity } from "./PartsActivityPanel";
import { labelFromFpClick } from "./findPartsDomFill";
import { useForcePartsSupplierSync, usePartsSupplierSync } from "./findPartsQueries";

export function ActivityView({
  activity,
  onBack,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  usePartsSupplierSync();
  const forceSync = useForcePartsSupplierSync();

  function handleFpClick(detail: { label?: string }) {
    const label = labelFromFpClick(detail);
    if (label.includes("back")) {
      onBack();
      return;
    }
    if (label.includes("force sync")) {
      void forceSync.mutateAsync().catch(() => undefined);
      return;
    }
    if (label.includes("dismiss")) {
      const id = activity?.repeatAlerts.items?.[0]?.id;
      if (id) void api.dismissPartRepeatAlert(String(id)).catch(() => undefined);
    }
  }

  return (
    <div ref={rootRef}>
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">jad telemetry broker live</p>
      <PartsActivityPanel activity={activity} onSeeAll={() => undefined} onAsk={onBack} />
      <Fp10Markup onFpClick={handleFpClick} />
    </div>
  );
}
