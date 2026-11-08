import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PartsButton } from "../parts-database/PartsButton";
import { patchCatalogMaker, uploadCatalogMakerLogo } from "./vehiclesCatalogApi";

export function EditMakerDialog({
  make,
  country,
  open,
  onOpenChange,
}: {
  make: string;
  country?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name] = useState(make);
  const [countryValue, setCountryValue] = useState(country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await patchCatalogMaker(make, { country: countryValue.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ["catalog-makers"] });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onLogoChange(file: File | null) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await uploadCatalogMakerLogo(make, file);
      await qc.invalidateQueries({ queryKey: ["catalog-makers"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload logo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Edit maker">
      <div className="rounded-xl bg-surface-container-lowest p-space-lg max-w-md w-full border border-outline-variant/40 flex flex-col gap-4">
        <p className="font-headline-md font-semibold">Edit maker</p>
        <label className="flex flex-col gap-1 text-body-sm">
          Name
          <input className="h-10 rounded-lg border border-outline-variant/40 px-3" value={name} readOnly />
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          Country (optional)
          <input
            className="h-10 rounded-lg border border-outline-variant/40 px-3"
            value={countryValue}
            onChange={(e) => setCountryValue(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-body-sm">
          Logo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="text-body-sm"
            onChange={(e) => void onLogoChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {error ? <p className="text-body-sm text-error">{error}</p> : null}
        <div className="flex gap-2 justify-end">
          <PartsButton variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </PartsButton>
          <PartsButton variant="primary" onClick={() => void onSave()} disabled={saving}>
            Save
          </PartsButton>
        </div>
      </div>
    </div>
  );
}
