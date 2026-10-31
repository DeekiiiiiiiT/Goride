import { useState } from "react";
import { api } from "../../../services/api";
import { Fp8Screen } from "./screens/Fp8Screen";
import { StepBar } from "./StepBar";
import { buildFp8ViewModel } from "./findPartsViewModels";
import { orDash, orNoneYet } from "./findPartsFormat";
import { usePartsActivity, usePartsRunnerOnline, usePartsVehicleContext } from "./findPartsQueries";

export function RequestPartPanel({
  vehicleId,
  carLabel,
  plate,
  componentId,
  partName,
  onBack,
  onViewActivity,
}: {
  vehicleId: string | null;
  carLabel: string;
  plate: string;
  componentId: string;
  partName: string;
  onBack: () => void;
  onViewActivity: () => void;
}) {
  const runner = usePartsRunnerOnline();
  const ctx = usePartsVehicleContext(vehicleId || "", componentId, Boolean(vehicleId));
  const activity = usePartsActivity(true);
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState("normal");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const ctxData = (ctx.data || {}) as Record<string, unknown>;
  const wins = (activity.data?.requests?.items || [])
    .filter((row) => row.found_price_jmd != null)
    .slice(0, 3)
    .map((row) => ({ label: orNoneYet(String(row.need_text || row.part_name || "Request")), foundPriceJmd: Number(row.found_price_jmd) }));
  const data = buildFp8ViewModel({
    plate,
    vehicleLabel: carLabel || "Vehicle",
    partName: partName || "Part",
    trimLabel: orNoneYet(String(ctxData.trim || ctxData.variant || "")),
    chassisLabel: orDash(String(ctxData.chassis || ctxData.trim || "")),
    hubLabel: orNoneYet(String(ctxData.hub_label || ctxData.hubLabel || "Fleet hub")),
    runnerOnline: Boolean(runner.data?.online),
    targetKm: Number(ctxData.odometer),
    healthPct: Number(ctxData.health_pct),
    sourcingWins: wins,
  });

  async function submit(photoUrl?: string) {
    const res = await api.requestFindPart({
      vehicleId,
      componentId: componentId || undefined,
      partName: partName || undefined,
      qty,
      urgency: urgency === "24h" ? "within_24h" : urgency,
      note,
      photo_url: photoUrl,
    });
    setSent(String((res as { item?: { id?: string } }).item?.id || "").slice(0, 8));
  }

  return (
    <div>
      <StepBar step={3} trail={[]} />
      {sent ? <p className="mb-space-md">Ticket {sent}</p> : null}
      <Fp8Screen
        data={data}
        form={{ qty, note, urgency }}
        actions={{
          onBack,
          onViewActivity,
          onDecQty: () => setQty((value) => Math.max(1, value - 1)),
          onIncQty: () => setQty((value) => Math.min(24, value + 1)),
          onQtyChange: setQty,
          onNoteChange: setNote,
          onUrgency: setUrgency,
          onSubmit: () => { void submit().catch(() => undefined); },
          onPhotoSelected: (file) => {
            void api.uploadPartRequestPhoto(file).then((res) => submit(res.photo_url)).catch(() => undefined);
          },
        }}
      />
    </div>
  );
}
