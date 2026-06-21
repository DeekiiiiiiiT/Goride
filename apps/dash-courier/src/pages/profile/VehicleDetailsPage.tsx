import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { MOCK_COURIER_VEHICLE } from '@/lib/mockProfile';
import { loadSignupDraft, saveSignupDraft } from '@/lib/signupDraft';

type VehicleDetailsPageProps = {
  onBack: () => void;
  onEditVehicle: () => void;
};

const VEHICLE_TYPES = [
  { type: 'bicycle' as const, icon: 'pedal_bike', label: 'Bicycle' },
  { type: 'motorcycle' as const, icon: 'two_wheeler', label: 'Motorcycle' },
  { type: 'car' as const, icon: 'directions_car', label: 'Car' },
];

export function VehicleDetailsPage({ onBack, onEditVehicle }: VehicleDetailsPageProps) {
  const vehicle = MOCK_COURIER_VEHICLE;
  const [switchOpen, setSwitchOpen] = useState(false);

  const handleSwitchType = (type: 'bicycle' | 'motorcycle' | 'car') => {
    saveSignupDraft({ vehicleType: type });
    setSwitchOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Vehicle Details" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-6">
        {vehicle.verified && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide">
              <MaterialIcon name="check_circle" className="text-base" filled />
              Verified
            </div>
          </div>
        )}

        <section className="bg-surface rounded-xl shadow-soft overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary" />
          <div className="p-6 pl-8 flex flex-col items-center gap-6">
            <div className="w-32 h-32 bg-surface-container rounded-full flex items-center justify-center shadow-inner relative overflow-hidden">
              <MaterialIcon name="two_wheeler" className="text-6xl text-primary" filled />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent" />
            </div>

            <div className="w-full grid grid-cols-1 gap-4">
              <div>
                <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Make</span>
                <span className="text-base font-medium text-on-surface">{vehicle.make}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Model</span>
                <span className="text-base font-medium text-on-surface">{vehicle.model}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">License Plate</span>
                <div className="bg-surface-container-highest px-3 py-1 rounded border border-outline-variant inline-flex mt-1">
                  <span className="text-2xl font-bold tracking-widest text-on-surface">
                    {vehicle.licensePlate}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Color</span>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className="w-4 h-4 rounded-full shadow-sm border border-outline-variant"
                    style={{ backgroundColor: vehicle.colorHex }}
                  />
                  <span className="text-base font-medium text-on-surface">{vehicle.color}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 pb-8">
          <button
            type="button"
            onClick={onEditVehicle}
            className="w-full h-14 rounded-lg border-2 border-outline-variant text-on-surface text-xs font-semibold uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-surface-container-low active:scale-[0.98] transition-all"
          >
            <MaterialIcon name="edit" />
            Edit Vehicle
          </button>
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            className="w-full h-14 rounded-lg text-primary text-xs font-semibold uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-[0.98] transition-all"
          >
            <MaterialIcon name="swap_horiz" />
            Switch vehicle type
          </button>
        </section>
      </main>

      {switchOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end">
          <div className="w-full bg-surface rounded-t-[24px] p-6 pb-safe space-y-3">
            <h3 className="text-xl font-semibold text-on-surface mb-2">Switch vehicle type</h3>
            {VEHICLE_TYPES.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => handleSwitchType(opt.type)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-surface-container-low hover:bg-surface-container active:scale-[0.98]"
              >
                <MaterialIcon name={opt.icon} className="text-primary" />
                <span className="text-base font-medium">{opt.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSwitchOpen(false)}
              className="w-full py-3 text-sm text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
