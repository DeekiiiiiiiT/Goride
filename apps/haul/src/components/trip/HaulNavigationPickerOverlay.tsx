import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import type { NavPickerTarget } from '../../contexts/HaulTripUiContext';
import { useAppImmersiveMode } from '../../hooks/useAppImmersiveMode';
import { copyAddress, openHaulNavigationApp } from '../../utils/haulNavigation';

const MAP_BG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBem6jY4RpAXjnUSxYerZAM8_Nc4hqCzCyHMAxakdQWutLec2sD297N1_Q9lBeMZfGCZtL6M-4AdCHsZXQuWAaVYnGnhvxv_Kr02CirbDHK48B8aGNrUf31e4e3Kcrb7s5FGLC_KO5Ly-2yVwpzODl4Lu31lS1dcgOyrSQQIopoRMbA50QQ9lOH59ThoY4YguUOD0sWTIsV9mGiLIt11NqVKFrwwjVqN8_aEEZ1BYQIlSuturn68D-Mi5kNUOopHoUFukrsTgLwNg';

type Props = {
  target: NavPickerTarget;
  onClose: () => void;
};

export function HaulNavigationPickerOverlay({ target, onClose }: Props) {
  const [copying, setCopying] = useState(false);
  const title = target.label ?? 'Navigate to Dropoff';

  useAppImmersiveMode(true);

  const handleCopy = async () => {
    setCopying(true);
    const ok = await copyAddress(target.address);
    if (ok) toast.success('Address copied');
    else toast.error('Could not copy address');
    setCopying(false);
  };

  const openApp = (app: 'google_maps' | 'waze') => {
    openHaulNavigationApp(app, {
      address: target.address,
      lat: target.lat,
      lng: target.lng,
    });
    onClose();
  };

  return createPortal(
    <div className="app-fullscreen-screen z-[200] overflow-hidden bg-[#0b1326] safe-b">
      <div className="absolute inset-0 z-0 bg-[#222a3d]">
        <div
          className="h-full w-full bg-cover bg-center opacity-40 mix-blend-luminosity"
          style={{ backgroundImage: `url('${MAP_BG}')` }}
        />
        <div className="absolute inset-0 bg-[#0b1326]/60 backdrop-blur-[2px]" />
      </div>

      <header className="relative z-50 flex h-11 shrink-0 items-center justify-between border-b border-[#534434] bg-[#0b1326]/80 backdrop-blur-md safe-t safe-x">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#d8c3ad] hover:bg-[#2d3449]/50"
          aria-label="Back"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className="text-xl font-bold tracking-tight text-[#ffc174]">RoamHaul</span>
        <div className="w-11" />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 safe-x">
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-[#2d3449] bg-[#171f33] shadow-2xl">
          <div className="flex flex-col items-center border-b border-[#2d3449] bg-[#222a3d]/30 p-6 text-center">
            <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-[#f59e0b]/20">
              <span
                className="material-symbols-outlined text-[32px] text-[#ffc174]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                explore
              </span>
            </div>
            <h1 className="text-lg font-semibold text-[#dae2fd]">{title}</h1>
            <p className="mt-1 max-w-[280px] text-[#d8c3ad]">
              Select your preferred navigation app to begin the final leg of this haul.
            </p>
          </div>

          <div className="border-b border-[#2d3449] bg-[#131b2e] p-6">
            <div className="flex items-start gap-4">
              <span
                className="material-symbols-outlined mt-1 text-[#d8c3ad]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                location_on
              </span>
              <div className="min-w-0 flex-1">
                <span className="mb-1 block text-xs tracking-wider text-[#d8c3ad] uppercase">
                  Destination Address
                </span>
                <div className="flex items-center justify-between rounded-lg border border-[#2d3449] bg-[#171f33] p-2">
                  <span className="truncate pr-2 font-medium text-[#dae2fd]">{target.address}</span>
                  <button
                    type="button"
                    disabled={copying}
                    onClick={() => void handleCopy()}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#ffc174] hover:bg-[#2d3449]"
                    aria-label="Copy address"
                  >
                    <span className="material-symbols-outlined">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 p-6">
            <button
              type="button"
              onClick={() => openApp('google_maps')}
              className="group relative flex min-h-11 w-full items-center overflow-hidden rounded-lg border border-[#2d3449] bg-[#2d3449] p-4 transition-colors hover:border-[#ffc174]/50"
            >
              <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#534434] bg-[#060e20]">
                <span
                  className="material-symbols-outlined text-[#7bd0ff]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  map
                </span>
              </div>
              <div className="flex-1 text-left">
                <span className="block font-semibold text-[#dae2fd] group-hover:text-[#ffc174]">
                  Open in Google Maps
                </span>
                <span className="block text-sm text-[#d8c3ad]">Recommended for heavy loads</span>
              </div>
              <span className="material-symbols-outlined text-[#d8c3ad] group-hover:text-[#ffc174]">open_in_new</span>
            </button>

            <button
              type="button"
              onClick={() => openApp('waze')}
              className="group relative flex min-h-11 w-full items-center overflow-hidden rounded-lg border border-[#2d3449] bg-[#2d3449] p-4 transition-colors hover:border-[#ffc174]/50"
            >
              <div className="mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#534434] bg-[#060e20]">
                <span
                  className="material-symbols-outlined text-[#7bd0ff]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  directions_car
                </span>
              </div>
              <div className="flex-1 text-left">
                <span className="block font-semibold text-[#dae2fd] group-hover:text-[#ffc174]">Open in Waze</span>
                <span className="block text-sm text-[#d8c3ad]">Real-time traffic updates</span>
              </div>
              <span className="material-symbols-outlined text-[#d8c3ad] group-hover:text-[#ffc174]">open_in_new</span>
            </button>
          </div>

          <div className="border-t border-[#2d3449] bg-[#060e20] p-4 text-center">
            <p className="flex items-center justify-center gap-1 text-sm text-[#d8c3ad]">
              <span className="material-symbols-outlined text-base">info</span>
              Tap to return to RoamHaul at any time via the status bar.
            </p>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}
