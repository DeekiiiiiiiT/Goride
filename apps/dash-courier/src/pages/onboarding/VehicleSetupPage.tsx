import React, { useRef, useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { loadSignupDraft, saveSignupDraft, type SignupDraft } from '@/lib/signupDraft';

type VehicleSetupPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

type VehicleType = SignupDraft['vehicleType'];

const VEHICLE_OPTIONS: { type: VehicleType; icon: string; label: string }[] = [
  { type: 'bicycle', icon: 'pedal_bike', label: 'Bicycle' },
  { type: 'motorcycle', icon: 'two_wheeler', label: 'Motorcycle / Scooter' },
  { type: 'car', icon: 'directions_car', label: 'Car' },
];

const COLOR_OPTIONS = ['Black', 'White', 'Silver / Grey', 'Red', 'Blue', 'Other'];

export function VehicleSetupPage({ onBack, onContinue }: VehicleSetupPageProps) {
  const draft = loadSignupDraft();
  const [vehicleType, setVehicleType] = useState<VehicleType>(draft.vehicleType);
  const [makeModel, setMakeModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [color, setColor] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMotorizedFields = vehicleType !== 'bicycle';

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleContinue = () => {
    saveSignupDraft({ vehicleType });
    onContinue();
  };

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col antialiased">
      <OnboardingHeader title="Roam Dash Courier" onBack={onBack} variant="centered" />

      <main className="flex-grow pt-6 px-[var(--spacing-edge)] pb-[calc(56px+32px+env(safe-area-inset-bottom))] max-w-md mx-auto w-full">
        <h1 className="text-[28px] leading-9 font-bold tracking-tight mb-2">How do you deliver?</h1>
        <p className="text-base text-muted mb-6">
          Select your primary vehicle type to help us optimize your routes.
        </p>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {VEHICLE_OPTIONS.map((option) => {
            const active = vehicleType === option.type;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setVehicleType(option.type)}
                className={`vehicle-card flex flex-col items-center justify-center p-4 rounded-xl border transition-all h-28 ${
                  active
                    ? 'border-primary-container bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)]'
                    : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                }`}
              >
                <MaterialIcon
                  name={option.icon}
                  className={`text-4xl mb-2 transition-colors ${
                    active ? 'text-primary-container' : 'text-muted'
                  }`}
                />
                <span className="text-xs font-semibold text-center leading-tight">{option.label}</span>
              </button>
            );
          })}
        </div>

        {showMotorizedFields && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
                Make &amp; Model
              </label>
              <input
                type="text"
                value={makeModel}
                onChange={(e) => setMakeModel(e.target.value)}
                placeholder="e.g. Honda PCX 125"
                className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-transparent transition-shadow"
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
                placeholder="e.g. ABC 1234"
                className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base uppercase focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-transparent transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
                Vehicle Color
              </label>
              <div className="relative">
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3 text-base appearance-none focus:outline-none focus:ring-2 focus:ring-primary-container focus:border-transparent transition-shadow"
                >
                  <option disabled value="">
                    Select a color
                  </option>
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted"
                />
              </div>
            </div>
          </div>
        )}

        <div className="mb-8">
          <label className="block text-xs font-semibold text-on-surface-variant mb-1 uppercase tracking-wide">
            Delivery Equipment Photo <span className="text-muted font-normal normal-case">(Optional)</span>
          </label>
          <p className="text-sm text-muted mb-2">Show us your delivery bag or top box.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-32 border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low flex flex-col items-center justify-center text-muted hover:bg-surface-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container overflow-hidden"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Delivery equipment" className="w-full h-full object-cover" />
            ) : (
              <>
                <MaterialIcon name="add_a_photo" className="text-3xl mb-1" />
                <span className="text-xs font-semibold">Upload Photo</span>
              </>
            )}
          </button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface border-t border-surface-variant px-[var(--spacing-edge)] py-4 pb-safe z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={handleContinue}
            className="w-full bg-primary-container text-on-primary-container font-semibold text-xl h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-lg shadow-primary-container/20"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
