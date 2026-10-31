import { api } from "../../../services/api";
import { Fp10Screen } from "./screens/Fp10Screen";
import { PartsActivityPanel } from "./PartsActivityPanel";
import type { PartsActivity } from "./PartsActivityPanel";
import { fpButtonIs } from "./findPartsButton";
import { buildFindPartsScreenData } from "./findPartsScreenData";
import { useForcePartsSupplierSync, usePartsSupplierSync } from "./findPartsQueries";

export function ActivityView({
  activity,
  onBack,
}: {
  activity: PartsActivity | null;
  onBack: () => void;
}) {
  usePartsSupplierSync();
  const forceSync = useForcePartsSupplierSync();
  const data = buildFindPartsScreenData({ quoteRef: "—" });

  function onButton(label: string) {
    if (fpButtonIs(label, "back")) {
      onBack();
      return;
    }
    if (fpButtonIs(label, "force sync")) {
      void forceSync.mutateAsync().catch(() => undefined);
      return;
    }
    if (fpButtonIs(label, "dismiss")) {
      const id = activity?.repeatAlerts.items?.[0]?.id;
      if (id) void api.dismissPartRepeatAlert(String(id)).catch(() => undefined);
    }
  }

  return (
    <div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">jad telemetry broker live</p>
      <PartsActivityPanel activity={activity} onSeeAll={() => undefined} onAsk={onBack} />
      <Fp10Screen actions={{ onButton }} data={data} />
    </div>
  );
}
