import { useState } from "react";
import { CatalogVariantPicker } from "../CatalogVariantPicker";
import { api } from "../../../services/api";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";

export function LinkCarPanel({
  canEdit,
  onBack,
  onLinked,
  vehicleId,
  make,
  model,
  year,
  plate,
}: {
  canEdit: boolean;
  onBack: () => void;
  onLinked: () => void;
  vehicleId: string;
  make: string;
  model: string;
  year: string;
  plate: string;
}) {
  const [picked, setPicked] = useState<VehicleCatalogRecord | null>(null);
  const [frame, setFrame] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function save(row: VehicleCatalogRecord) {
    setBusy(true);
    setError("");
    try {
      const list = await api.getVehicles();
      const current = (Array.isArray(list) ? list : []).find((car: { id?: string }) => car.id === vehicleId);
      if (!current) throw new Error("Vehicle not found");
      await api.saveVehicle({
        ...current,
        vehicle_catalog_id: row.id,
        vehicle_catalog_trim_hint: row.trim_series ?? undefined,
        vehicle_catalog_chassis_hint: row.chassis_code ?? undefined,
        vehicle_catalog_engine_code_hint: row.engine_code ?? undefined,
        vehicle_catalog_transmission_hint: row.transmission ?? undefined,
        vehicle_catalog_drivetrain_hint: row.drivetrain ?? undefined,
      });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link this car");
    } finally {
      setBusy(false);
    }
  }

  async function verifyFrame() {
    setError("");
    setNote("");
    try {
      const decoded = await api.decodeFrameNumbers(frame);
      const first = (decoded.items?.[0] || {}) as { matches?: Array<{ id?: string; chassis_code?: string | null; engine_code?: string | null }> };
      const match = first.matches?.[0];
      if (!match?.id && !match?.chassis_code) {
        setNote("No version matched that frame number.");
        return;
      }
      await api.confirmFrameDecode({
        vehicleId,
        catalogId: match.id,
        chassisCode: match.chassis_code || undefined,
        engineCode: match.engine_code || undefined,
      });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that frame number");
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm">
      <p className="font-label-plate text-label-plate tracking-widest">{plate || "No plate"}</p>
      <p className="font-caption text-caption text-on-surface-variant">Not linked</p>
      <h2 className="font-headline-lg text-headline-lg text-on-surface mt-space-sm">We need to know exactly which {make} {model} this is</h2>
      <div className="flex flex-wrap gap-space-md mt-space-lg">
        {canEdit ? (
          <button type="button" className="px-space-xl py-space-md rounded-lg bg-primary text-on-primary font-semibold" disabled={!picked || busy} onClick={() => picked && void save(picked)}>
            Link it now
          </button>
        ) : (
          <p>Ask someone who can edit vehicles to link this car.</p>
        )}
        <button type="button" className="px-space-xl py-space-md rounded-lg bg-surface-container" onClick={onBack}>Search by make, model and year instead</button>
        <button type="button" className="px-space-md py-space-sm" onClick={onBack}>Choose another car</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mt-space-lg">
        <article className="bg-surface-container-low rounded-xl p-space-lg">
          <h3 className="font-headline-sm text-body-md">Right version, right part</h3>
          <p className="font-body-sm text-caption text-on-surface-variant">Versions of the same car take different parts.</p>
        </article>
        <article className="bg-surface-container-low rounded-xl p-space-lg">
          <h3 className="font-headline-sm text-body-md">Faster searches</h3>
          <p className="font-body-sm text-caption text-on-surface-variant">Linked cars go straight to parts.</p>
        </article>
        <article className="bg-surface-container-low rounded-xl p-space-lg">
          <h3 className="font-headline-sm text-body-md">Your stock counts</h3>
          <p className="font-body-sm text-caption text-on-surface-variant">Parts on your shelf show first.</p>
        </article>
      </div>
      {canEdit ? (
        <div className="mt-space-lg">
          <h3 className="font-headline-sm text-headline-sm mb-space-sm">Candidate versions</h3>
          <CatalogVariantPicker
            make={make}
            model={model}
            year={year}
            value={picked?.id ?? null}
            disabled={busy}
            onChange={(row) => setPicked(row)}
          />
        </div>
      ) : null}
      <div className="mt-space-lg bg-surface-container-low rounded-xl p-space-lg">
        <p className="font-caption text-caption uppercase text-on-surface-variant">Example</p>
        <label className="block mt-space-md font-body-sm font-semibold">Fast Stamped Code Input</label>
        <p className="font-body-sm text-caption text-on-surface-variant">Type the frame number, e.g. NCP160-0019284.</p>
        <div className="flex gap-space-sm mt-space-sm">
          <input className="flex-1 h-10 px-space-md bg-surface-container-lowest rounded" value={frame} onChange={(event) => setFrame(event.target.value)} disabled={!canEdit} />
          <button type="button" className="px-space-md py-2 bg-primary text-on-primary rounded font-label-code text-caption" disabled={!canEdit || !frame.trim()} onClick={() => void verifyFrame()}>Verify</button>
        </div>
      </div>
      {note ? <p className="mt-space-md">{note}</p> : null}
      {error ? <p className="mt-space-md text-error">{error}</p> : null}
    </div>
  );
}
