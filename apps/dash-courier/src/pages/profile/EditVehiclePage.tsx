import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { MOCK_COURIER_VEHICLE } from '@/lib/mockProfile';
import { loadSignupDraft, saveSignupDraft } from '@/lib/signupDraft';
import { updateCourierProfile } from '@/lib/courierProfileService';
import { toast } from '@/lib/toast';

type EditVehiclePageProps = {
  onBack: () => void;
  onSave: () => void;
};

const COLOR_OPTIONS = ['Black', 'White', 'Silver / Grey', 'Red', 'Blue', 'Other'];

export function EditVehiclePage({ onBack, onSave }: EditVehiclePageProps) {
  const vehicle = MOCK_COURIER_VEHICLE;
  const draft = loadSignupDraft();
  const [makeModel, setMakeModel] = useState(`${vehicle.make} ${vehicle.model}`.trim());
  const [licensePlate, setLicensePlate] = useState(vehicle.licensePlate);
  const [color, setColor] = useState(vehicle.color);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    saveSignupDraft({ vehicleType: draft.vehicleType });
    await updateCourierProfile({ vehicle_type: draft.vehicleType });
    setSaving(false);
    toast.success('Vehicle updated');
    onSave();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Edit Vehicle" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-32 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
            Make &amp; Model
          </label>
          <input
            type="text"
            value={makeModel}
            onChange={(e) => setMakeModel(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
            License Plate
          </label>
          <input
            type="text"
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base uppercase focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
            Vehicle Color
          </label>
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {COLOR_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </main>

      <div className="fixed bottom-0 w-full bg-surface/90 backdrop-blur-md px-[var(--spacing-edge)] py-4 pb-safe border-t border-surface-container-low">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="w-full h-14 bg-primary text-on-primary rounded-xl font-semibold text-xl disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Vehicle'}
        </button>
      </div>
    </div>
  );
}
