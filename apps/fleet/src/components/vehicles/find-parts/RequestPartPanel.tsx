import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Fp8Screen } from "./screens/Fp8Screen";
import { buildFp8ViewModel, formatJamaicaMidnightCountdown, formatPartsRequestShortId } from "./findPartsViewModels";
import { orDash, orNoneYet } from "./findPartsFormat";
import { buildAddPartInfoRequestBody, findPartsPositionLabel } from "./findPartsRoute";
import { usePartsVehicleContext } from "./findPartsQueries";

export function RequestPartPanel({
  vehicleId,
  carLabel,
  plate,
  componentId,
  partName,
  position,
  fitParam,
  matchType,
  activityMeta,
  onBack,
  onViewActivity,
}: {
  vehicleId: string | null;
  carLabel: string;
  plate: string;
  componentId: string;
  partName?: string;
  position?: string | null;
  fitParam?: string;
  matchType?: string | null;
  activityMeta?: {
    medianAddMinutes?: number | null;
    batchMatchRate?: number | null;
    resolvedCount30d?: number;
    queueDepth?: number;
  };
  onBack: () => void;
  onViewActivity: () => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId || "", componentId, Boolean(vehicleId));
  const [note, setNote] = useState("");
  const [oldPartNumber, setOldPartNumber] = useState("");
  const [sentId, setSentId] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const ctxData = (ctx.data || {}) as Record<string, unknown>;
  const specs = (ctxData.specs || {}) as Record<string, unknown>;
  const versionParts = [
    String(ctxData.version || ctxData.trim || specs.trim_series || "").trim(),
    String(specs.engine_code || "").trim(),
    String(specs.drivetrain || "").trim(),
  ].filter(Boolean);
  const hubRaw = String(ctxData.hub_label || ctxData.hubLabel || "").trim();
  const meta = activityMeta;
  const resolvedCount = meta?.resolvedCount30d ?? 0;
  const showOrgMetrics = resolvedCount >= 5;
  const queueDepth = meta?.queueDepth ?? 0;
  const reqShort = sentId ? formatPartsRequestShortId(sentId) : "";

  useEffect(() => {
    void api.partsRequestDraftGet().then((res) => {
      const draft = (res as { draft?: Record<string, unknown> }).draft;
      if (!draft) return;
      if (typeof draft.note === "string") setNote(draft.note);
      if (typeof draft.old_part_number === "string") setOldPartNumber(draft.old_part_number);
      else if (typeof draft.oldPartNumber === "string") setOldPartNumber(draft.oldPartNumber);
    }).catch(() => undefined);
  }, []);

  const data = buildFp8ViewModel({
    plate,
    vehicleLabel: carLabel || "Vehicle",
    partName: partName || "Part",
    positionLabel: findPartsPositionLabel(position),
    trimLabel: orNoneYet(String(ctxData.trim || ctxData.variant || "")),
    chassisLabel: orDash(String(specs.chassis_code || ctxData.chassis_code || ctxData.chassis || "")),
    hubLabel: hubRaw || "Fleet hub",
    showHubChip: Boolean(hubRaw),
    targetKm: Number(ctxData.odometer),
    healthPct: Number(ctxData.health_pct),
    vehiclePhotoUrl: String(ctxData.photo_url || ctxData.vehicle_photo_url || ""),
    fitmentQueryRef: sentId ? reqShort : undefined,
    versionTag: versionParts.length ? versionParts.join(" · ") : orNoneYet(String(ctxData.trim || "")),
    requestSent: Boolean(sentId),
    requestRefLabel: reqShort || undefined,
    queueAheadLabel: queueDepth > 0 ? `In line · ${queueDepth} requests ahead` : "In line · next up",
    medianDispatchLabel: showOrgMetrics && meta?.medianAddMinutes != null ? `${meta.medianAddMinutes} min median` : "",
    batchMatchRateLabel:
      showOrgMetrics && meta?.batchMatchRate != null
        ? `${meta.batchMatchRate}% added in 30 days`
        : "",
    showOrgMetrics,
    jamaicaResetLabel: formatJamaicaMidnightCountdown(),
    dailyLimitReached: limitReached,
    dailyLimitUsed: 30,
    dailyLimitMax: 30,
    activeRequestCount: 30,
  });

  async function submit(photoUrl?: string) {
    const ctxVariant = String((ctxData as { variantId?: string }).variantId || "");
    try {
      const res = await api.requestFindPart(
        buildAddPartInfoRequestBody({
          vehicleId,
          componentId,
          partName,
          note,
          oldPartNumber,
          matchType,
          fitParam,
          position,
          vehicleCatalogId: ctxVariant || undefined,
          photoUrl,
        }),
      );
      const id = String((res as { item?: { id?: string } }).item?.id || "");
      setSentId(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/30 requests|daily|limit/i.test(msg)) setLimitReached(true);
      throw e;
    }
  }

  async function saveDraft() {
    try {
      await api.partsRequestDraftSave({
        note,
        old_part_number: oldPartNumber,
        componentId,
        vehicleId,
        partName,
        matchType,
        position,
        fitParam,
      });
      toast.success("Saved for tomorrow");
    } catch {
      toast.error("Could not save draft");
    }
  }

  return (
    <div>
      <Fp8Screen
        data={data}
        form={{ note, oldPartNumber }}
        actions={{
          onBack,
          onViewActivity,
          onNoteChange: setNote,
          onOldPartNumberChange: setOldPartNumber,
          onSubmit: () => { void submit().catch(() => toast.error("Could not send request")); },
          onSaveDraft: () => { void saveDraft(); },
          onPhotoSelected: (file) => {
            void api.uploadPartRequestPhoto(file).then((res) => submit(res.photo_url)).catch(() => undefined);
          },
        }}
      />
    </div>
  );
}
