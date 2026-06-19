import React from 'react';
import { useHaulerVehicle } from '../../hooks/useHaulerVehicle';
import { useHauler } from '../../contexts/HaulerContext';
import { HaulSubpageHeader } from './HaulSubpageHeader';

const VEHICLE_PLACEHOLDER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC8ydnl_-WgYCFDY8aVrtpE0p4swukfKyaAit8sm-GJlmo_zbWDl60GadzwNt0ucyNwqJ3jPvAwqyNe_0l5XTOp0xqkLNxne46_OeRl8rSmW2r-qAxZ59SZUMSV0Di8mTVaCukxHYzzyvVH_kHIzip_mA7FInvJEL_kfryHhHyEvilCy0PKTwudQK9Yg9NE_wOxMD0ALltY8ftofTHiNyp_h4SVCkcTT4ifMpvi8xGq3RhsAwnFdsZLsFpBTlh9_cqk2ccRK8i5tQ';

type Props = {
  onBack: () => void;
};

function SpecCard({
  icon,
  label,
  value,
  unit,
  highlight,
}: {
  icon: string;
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 ${
        highlight ? 'relative overflow-hidden border-[#ffc174]/30 bg-[#ffc174]/10' : 'border-[#534434] bg-[#171f33]'
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${highlight ? 'bg-[#ffc174] text-[#472a00]' : 'border-[#534434] bg-[#222a3d] text-[#d8c3ad]'}`}>
        <span className="material-symbols-outlined" style={highlight ? { fontVariationSettings: "'FILL' 1" } : undefined}>
          {icon}
        </span>
      </div>
      <div className="mt-4">
        <span className={`block text-sm ${highlight ? 'text-[#ffb95f]' : 'text-[#d8c3ad]'}`}>{label}</span>
        <span className={`text-2xl font-bold ${highlight ? 'text-[#ffc174]' : 'text-[#dae2fd]'}`}>
          {value}
          {unit ? <span className="ml-1 text-lg text-[#d8c3ad]">{unit}</span> : null}
        </span>
      </div>
    </div>
  );
}

export function HaulVehicleDetailsPage({ onBack }: Props) {
  const { vehicle, loading } = useHaulerVehicle();
  const { profile } = useHauler();

  const title = vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.year})` : 'Your vehicle';
  const vehicleId = profile?.userId?.slice(0, 8).toUpperCase() ?? '—';
  const length = vehicle?.lengthCm ?? 300;
  const width = vehicle?.widthCm ?? 180;
  const height = vehicle?.heightCm ?? 190;
  const payload = vehicle?.maxPayloadKg ?? 1500;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Vehicle Details" onBack={onBack} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[88px] pb-28">
        {loading ? (
          <p className="text-[#d8c3ad]">Loading vehicle…</p>
        ) : (
          <>
            <section className="mb-6 overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] shadow-lg">
              <div className="relative h-56 bg-[#222a3d]">
                <img
                  src={vehicle?.vehiclePhotoUrl ?? VEHICLE_PLACEHOLDER}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-[#56e5a9]/20 bg-[#30c88f] px-3 py-1 text-sm text-[#004e34] shadow-md">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  Verified Vehicle
                </div>
              </div>
              <div className="-mt-4 relative z-10 flex flex-col justify-between gap-4 p-4 md:flex-row md:items-end">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#ffc174] md:text-3xl">{title}</h2>
                  <div className="mt-2 flex w-fit items-center gap-2 rounded-md border border-[#534434]/50 bg-[#222a3d] px-2 py-1 text-sm uppercase tracking-wider">
                    <span className="material-symbols-outlined text-xl">badge</span>
                    RH-{vehicleId}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#7bd0ff]">
                  <span className="material-symbols-outlined">directions_car</span>
                  <span className="text-sm">Active Fleet</span>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] p-6 lg:col-span-5">
                <h3 className="absolute top-4 left-4 flex items-center gap-1 text-lg font-semibold text-[#d8c3ad]">
                  <span className="material-symbols-outlined text-xl">view_in_ar</span>
                  Capacity Visualizer
                </h3>
                <svg className="mt-8 h-48 w-48 text-[#ffc174]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 200 200">
                  <polygon fill="currentColor" fillOpacity="0.08" points="20,80 100,110 180,90 140,40 60,60" />
                  <polyline points="20,80 100,110 180,90" strokeWidth="2.5" />
                  <line x1="100" x2="100" y1="110" y2="190" strokeWidth="2" />
                  <polyline points="20,160 100,190 180,170" strokeWidth="2" />
                </svg>
                <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded border border-[#534434]/30 bg-[#222a3d] px-2 py-1 text-sm text-[#56e5a9]">
                  <span className="material-symbols-outlined text-base">straighten</span>
                  L: {length}cm
                </div>
                <div className="absolute top-1/2 right-2 flex items-center gap-1 rounded border border-[#534434]/30 bg-[#222a3d] px-2 py-1 text-sm text-[#7bd0ff]">
                  H: {height}cm
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 lg:col-span-7">
                <SpecCard icon="straighten" label="Length" value={length} unit="cm" />
                <SpecCard icon="width" label="Width" value={width} unit="cm" />
                <SpecCard icon="height" label="Height" value={height} unit="cm" />
                <SpecCard icon="weight" label="Max Payload" value={payload} unit="kg" highlight />
              </div>
            </section>
          </>
        )}
      </main>
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-[#534434] bg-[#0b1326]/90 px-4 py-4 backdrop-blur-md">
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#ffddb8]/50 bg-[#ffc174] text-lg font-semibold text-[#472a00] shadow-lg active:scale-95"
        >
          <span className="material-symbols-outlined">edit_square</span>
          Edit Vehicle
        </button>
      </div>
    </div>
  );
}
