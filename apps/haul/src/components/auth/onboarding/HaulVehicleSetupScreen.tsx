import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import type { ProfileSetupData } from './HaulProfileSetupScreen';
import { haulErrorBox, haulFieldLabel, haulInput, haulPrimaryBtn } from '../haulAuthUi';

export type VehicleSetupData = {
  vehicleType: string;
  makeModel: string;
  year: string;
  licensePlate: string;
  plateRegion: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  maxPayloadKg: string;
};

const VEHICLE_TYPES = [
  { value: 'cargo-van', label: 'Cargo Van' },
  { value: 'pickup', label: 'Pickup Truck' },
  { value: 'box-truck', label: 'Box Truck' },
  { value: 'flatbed', label: 'Flatbed' },
] as const;

const YEARS = ['2024', '2023', '2022', '2021', '2020', 'older'] as const;

type Props = {
  profile: ProfileSetupData;
  onBack: () => void;
  onComplete: (vehicle: VehicleSetupData) => Promise<void>;
};

export function HaulVehicleSetupScreen({ onBack, onComplete }: Props) {
  const [vehicleType, setVehicleType] = useState('');
  const [makeModel, setMakeModel] = useState('');
  const [year, setYear] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [plateRegion, setPlateRegion] = useState('JM');
  const [lengthCm, setLengthCm] = useState('');
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [maxPayloadKg, setMaxPayloadKg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleType || !makeModel.trim() || !year || !licensePlate.trim()) {
      setError('Complete all required vehicle fields.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onComplete({
        vehicleType,
        makeModel: makeModel.trim(),
        year,
        licensePlate: licensePlate.trim().toUpperCase(),
        plateRegion,
        lengthCm,
        widthCm,
        heightCm,
        maxPayloadKg,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save vehicle.');
    } finally {
      setLoading(false);
    }
  };

  const selectClass = `${haulInput} appearance-none rounded-lg border border-[#534434] bg-[#0b1326] pr-10`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#060e20] text-[#dae2fd] antialiased">
      <header className="flex h-16 w-full items-center justify-between px-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center text-[#d8c3ad] hover:text-[#ffc174]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="text-sm font-medium tracking-widest text-[#ffc174] uppercase">Step 2 of 4</div>
        <div className="w-11" aria-hidden />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
        <div className="mt-6 mb-8">
          <h1 className="mb-2 text-[28px] leading-9 font-bold md:text-[32px]">Add your vehicle</h1>
          <p className="text-base text-[#d8c3ad]">
            Specify your rig details to match with appropriate loads.
          </p>
        </div>

        {error ? <div className={`${haulErrorBox} mb-6`}>{error}</div> : null}

        <form className="flex flex-1 flex-col gap-6" onSubmit={(e) => void handleSubmit(e)}>
          <div className="flex flex-col gap-2">
            <label className={haulFieldLabel} htmlFor="vehicle-type">
              Vehicle Type
            </label>
            <div className="relative">
              <select
                id="vehicle-type"
                required
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className={selectClass}
              >
                <option value="">Select vehicle type</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-[#d8c3ad]" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={haulFieldLabel} htmlFor="make-model">
              Make &amp; Model
            </label>
            <input
              id="make-model"
              required
              className={`${haulInput} rounded-lg border border-[#534434] bg-[#0b1326]`}
              placeholder="e.g. Ford Transit 250"
              value={makeModel}
              onChange={(e) => setMakeModel(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={haulFieldLabel} htmlFor="vehicle-year">
              Year
            </label>
            <div className="relative">
              <select
                id="vehicle-year"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={selectClass}
              >
                <option value="">Select year</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y === 'older' ? 'Older than 2020' : y}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-5 w-5 -translate-y-1/2 text-[#d8c3ad]" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={haulFieldLabel} htmlFor="license-plate">
              License Plate
            </label>
            <div className="flex gap-2">
              <input
                id="license-plate"
                required
                className={`${haulInput} flex-1 rounded-lg border border-[#534434] bg-[#0b1326] uppercase`}
                placeholder="ABC-1234"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
              />
              <select
                value={plateRegion}
                onChange={(e) => setPlateRegion(e.target.value)}
                className={`${haulInput} w-[100px] rounded-lg border border-[#534434] bg-[#0b1326] text-center`}
              >
                <option value="JM">JM</option>
                <option value="US">US</option>
                <option value="CA">CA</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className={haulFieldLabel}>Vehicle Photos</span>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {(['Front', 'Side', 'Cargo Area'] as const).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="flex aspect-square w-[100px] shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#534434] bg-[#0b1326] text-[#d8c3ad] hover:border-[#f59e0b] hover:text-[#f59e0b]"
                >
                  <span className="material-symbols-outlined">photo_camera</span>
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-2">
            <h2 className="text-lg font-semibold text-[#dae2fd]">Cargo Area Dimensions</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'dim-length', label: 'Length (cm)', value: lengthCm, set: setLengthCm },
                { id: 'dim-width', label: 'Width (cm)', value: widthCm, set: setWidthCm },
                { id: 'dim-height', label: 'Height (cm)', value: heightCm, set: setHeightCm },
                { id: 'dim-payload', label: 'Max Payload (kg)', value: maxPayloadKg, set: setMaxPayloadKg },
              ].map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label className={haulFieldLabel} htmlFor={field.id}>
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type="number"
                    className={`${haulInput} rounded-lg border border-[#534434] bg-[#0b1326]`}
                    placeholder={field.id === 'dim-length' ? 'e.g. 300' : field.id === 'dim-width' ? 'e.g. 180' : field.id === 'dim-height' ? 'e.g. 190' : 'e.g. 1500'}
                    value={field.value}
                    onChange={(e) => field.set(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-[#534434]/30 pt-6">
            <button type="submit" disabled={loading} className={`${haulPrimaryBtn} shadow-[0_0_15px_rgba(245,158,11,0.15)]`}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Complete Setup
              <CheckCircle2 className="h-5 w-5" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
