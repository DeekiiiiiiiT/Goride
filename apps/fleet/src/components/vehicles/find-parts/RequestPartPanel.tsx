import { useState } from "react";
import { api } from "../../../services/api";
import { Fp8Screen } from "./screens/Fp8Screen";
import { buildFp8ViewModel } from "./findPartsViewModels";
import { orDash, orNoneYet } from "./findPartsFormat";
import { usePartsVehicleContext } from "./findPartsQueries";

export function RequestPartPanel({
  vehicleId,
  carLabel,
  plate,
  componentId,
  partName,
  position,
  onBack,
  onViewActivity,
}: {
  vehicleId: string | null;
  carLabel: string;
  plate: string;
  componentId: string;
  partName?: string;
  position?: string | null;
  onBack: () => void;
  onViewActivity: () => void;
}) {
  const ctx = usePartsVehicleContext(vehicleId || "", componentId, Boolean(vehicleId));
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const ctxData = (ctx.data || {}) as Record<string, unknown>;
  const data = buildFp8ViewModel({
    plate,
    vehicleLabel: carLabel || "Vehicle",
    partName: partName || "Part",
    positionLabel: position === "rear" ? "Rear axle" : position === "both" ? "Front and rear" : "Front axle",
    trimLabel: orNoneYet(String(ctxData.trim || ctxData.variant || "")),
    chassisLabel: orDash(String(ctxData.chassis_code || ctxData.chassis || ctxData.trim || "")),
    hubLabel: orNoneYet(String(ctxData.hub_label || ctxData.hubLabel || "Fleet hub")),
    targetKm: Number(ctxData.odometer),
    healthPct: Number(ctxData.health_pct),
    vehiclePhotoUrl: String(ctxData.photo_url || ctxData.vehicle_photo_url || ""),
  });

  async function submit(photoUrl?: string) {
    const res = await api.requestFindPart({
      vehicleId,
      componentId: componentId || undefined,
      partName: partName || undefined,
      note,
      photo_url: photoUrl,
    });
    setSent(String((res as { item?: { id?: string } }).item?.id || "").slice(0, 8));
  }

  return (
    <div>
      {sent ? <p className="mb-space-md">Ticket {sent}</p> : null}
      <Fp8Screen
        data={data}
        form={{ note }}
        actions={{
          onBack,
          onViewActivity,
          onNoteChange: setNote,
          onSubmit: () => { void submit().catch(() => undefined); },
          onPhotoSelected: (file) => {
            void api.uploadPartRequestPhoto(file).then((res) => submit(res.photo_url)).catch(() => undefined);
          },
        }}
      />
    </div>
  );
}
