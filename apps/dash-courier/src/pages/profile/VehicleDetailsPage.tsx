import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { loadPrimaryVehicle, type CourierVehicleRow } from '@/lib/courierVehicleService';
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

const COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a',
  white: '#f5f5f5',
  'silver / grey': '#9ca3af',
  silver: '#9ca3af',
  grey: '#9ca3af',
  gray: '#9ca3af',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  'emerald green': '#50C878',
  other: '#6b7280',
};

function colorToHex(color: string | null | undefined): string {
  if (!color) return '#6b7280';
  return COLOR_HEX[color.trim().toLowerCase()] || '#6b7280';
}

function vehicleIcon(type: string | null | undefined): string {
  if (type === 'bicycle') return 'pedal_bike';
  if (type === 'car') return 'directions_car';
  return 'two_wheeler';
}

export function VehicleDetailsPage({ onBack, onEditVehicle }: VehicleDetailsPageProps) {
  const [vehicle, setVehicle] = useState<CourierVehicleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchOpen, setSwitchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPrimaryVehicle().then((row) => {
      if (cancelled) return;
      setVehicle(row);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSwitchType = (type: 'bicycle' | 'motorcycle' | 'car') => {
    saveSignupDraft({ vehicleType: type });
    setSwitchOpen(false);
  };

  const colorLabel = vehicle?.color || loadSignupDraft().color || '—';
  const colorHex = colorToHex(vehicle?.color || loadSignupDraft().color);

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Vehicle Details" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 flex flex-col gap-6">
        {loading ? (
          <p className="text-sm text-muted text-center py-12">Loading vehicle…</p>
        ) : !vehicle ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted">No vehicle on file yet.</p>
            <button
              type="button"
              onClick={onEditVehicle}
              className="h-12 px-6 rounded-lg bg-primary text-on-primary text-xs font-semibold uppercase tracking-wide"
            >
              Add vehicle
            </button>
          </div>
        ) : (
          <>
            <section className="bg-surface rounded-xl shadow-soft overflow-hidden relative">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary" />
              <div className="p-6 pl-8 flex flex-col items-center gap-6">
                <div className="w-32 h-32 bg-surface-container rounded-full flex items-center justify-center shadow-inner relative overflow-hidden">
                  <MaterialIcon
                    name={vehicleIcon(vehicle.vehicle_type)}
                    className="text-6xl text-primary"
                    filled
                  />
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
                        {vehicle.license_plate}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Color</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="w-4 h-4 rounded-full shadow-sm border border-outline-variant"
                        style={{ backgroundColor: colorHex }}
                      />
                      <span className="text-base font-medium text-on-surface">{colorLabel}</span>
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
          </>
        )}
      </main>

      {switchOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-end">
          <div className="w-full bg-surface rounded-t-[24px] p-6 pb-safe safe-x space-y-3">
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
