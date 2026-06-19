import React, { useMemo, useState, useRef } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import type { HaulageBookingLineSnapshot } from '@roam/types/haulage';
import { useHauler } from '../../contexts/HaulerContext';
import { haulCustomerName } from '../../utils/haulRideFormat';
import { HaulPhotoGallery } from '../ui/HaulPhotoGallery';
import { haulHaptic } from '../../utils/haulHaptics';

type Props = {
  ride: RideRequestRow;
  onAdvance: (
    status: RideRequestRow['status'],
    reason?: string,
    verificationPin?: string,
  ) => Promise<void>;
};

function manifestLabel(line: HaulageBookingLineSnapshot): string {
  const base = line.label?.trim() || line.item_title;
  return line.qty > 1 ? `${base} (${line.qty})` : base;
}

function defaultManifestLines(): HaulageBookingLineSnapshot[] {
  return [
    {
      id: '1',
      item_id: '1',
      variant_id: '1',
      qty: 1,
      label: 'Sofa (3-seater)',
      item_title: 'Sofa',
      weight_kg: 80,
      length_cm: null,
      width_cm: null,
      height_cm: null,
      fragile: false,
      requires_disassembly: false,
      upright_only: false,
    },
    {
      id: '2',
      item_id: '2',
      variant_id: '2',
      qty: 1,
      label: 'Refrigerator (Large)',
      item_title: 'Refrigerator',
      weight_kg: 120,
      length_cm: null,
      width_cm: null,
      height_cm: null,
      fragile: false,
      requires_disassembly: false,
      upright_only: true,
    },
    {
      id: '3',
      item_id: '3',
      variant_id: '3',
      qty: 5,
      label: 'Moving boxes (5)',
      item_title: 'Moving boxes',
      weight_kg: 25,
      length_cm: null,
      width_cm: null,
      height_cm: null,
      fragile: false,
      requires_disassembly: false,
      upright_only: false,
    },
  ];
}

export function HaulArrivedPickupView({ ride, onAdvance }: Props) {
  const { profile } = useHauler();
  const customer = haulCustomerName(ride);
  const lines = useMemo(
    () => ride.haulage_manifest?.lines?.length ? ride.haulage_manifest.lines : defaultManifestLines(),
    [ride.haulage_manifest],
  );

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(lines.map((l, i) => [l.id, i === 0])),
  );
  const [notes, setNotes] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [pin, setPin] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pinRequired = Boolean(ride.pin_verification_pending) && !ride.pin_verified_at;

  const driverAvatar = profile?.profilePhotoUrl;

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = async () => {
    setAdvancing(true);
    try {
      haulHaptic('medium');
      if (pinRequired && pin.trim()) {
        await onAdvance('on_trip', undefined, pin.trim());
      } else {
        await onAdvance('on_trip');
      }
    } finally {
      setAdvancing(false);
    }
  };

  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotos((prev) => [...prev, URL.createObjectURL(file)]);
    haulHaptic('light');
    e.target.value = '';
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b1326]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#534434] bg-[#0b1326]/80 px-4 backdrop-blur-md">
        <button type="button" className="flex min-h-11 min-w-11 items-center justify-center text-[#ffc174]" aria-label="Menu">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h1 className="text-xl font-black tracking-[0.2em] text-[#ffc174] uppercase">Roam Haul</h1>
        <div className="h-10 w-10 overflow-hidden rounded-full border border-[#534434]">
          {driverAvatar ? (
            <img src={driverAvatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#2d3449] text-[#d8c3ad]">
              <span className="material-symbols-outlined">person</span>
            </div>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-28">
        <div className="relative mb-6 flex items-center justify-between overflow-hidden rounded-xl border border-[#ffc174]/50 bg-[#171f33] p-4 shadow-[0_0_15px_rgba(255,193,116,0.1)]">
          <div className="absolute inset-0 bg-gradient-to-r from-[#ffc174]/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex items-center gap-4">
            <span className="material-symbols-outlined text-[28px] text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
            <h2 className="text-2xl font-bold tracking-widest text-[#ffc174] uppercase">Arrived at pickup</h2>
          </div>
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ffc174] opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-[#ffc174] shadow-[0_0_8px_#ffc174]" />
          </span>
        </div>

        <section className="mb-6 flex items-center justify-between rounded-xl border border-[#534434] bg-[#171f33] p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#534434] bg-[#2d3449]">
              <span className="text-lg font-bold text-[#ffc174]">{customer.charAt(0)}</span>
            </div>
            <div>
              <span className="mb-1 block text-xs tracking-wider text-[#d8c3ad] uppercase">Customer</span>
              <span className="text-lg font-semibold text-[#dae2fd]">{customer}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#534434] bg-[#0b1326] text-[#d8c3ad] transition-colors hover:border-[#ffc174] hover:text-[#ffc174]">
              <span className="material-symbols-outlined text-[22px]">call</span>
            </button>
            <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#534434] bg-[#0b1326] text-[#d8c3ad] transition-colors hover:border-[#ffc174] hover:text-[#ffc174]">
              <span className="material-symbols-outlined text-[22px]">chat</span>
            </button>
          </div>
        </section>

        <section className="mb-6">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[#dae2fd]">
            <span className="material-symbols-outlined text-[20px] text-[#ffc174]">inventory_2</span>
            Manifest
          </h3>
          <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
            {lines.map((line, idx) => {
              const isChecked = Boolean(checked[line.id]);
              return (
                <label
                  key={line.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-[#2d3449]/30 ${
                    idx < lines.length - 1 ? 'border-b border-[#534434]/50' : ''
                  }`}
                >
                  <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(line.id)}
                      className="peer h-7 w-7 cursor-pointer appearance-none rounded border-2 border-[#534434] bg-[#0b1326] transition-all checked:border-[#ffc174] checked:bg-[#ffc174]"
                    />
                    <span className="material-symbols-outlined pointer-events-none absolute text-[20px] font-bold text-[#653e00] opacity-0 transition-opacity peer-checked:opacity-100">
                      check
                    </span>
                  </div>
                  <span className={`flex-1 ${isChecked ? 'text-[#d8c3ad] line-through opacity-70' : 'text-[#dae2fd]'}`}>
                    {manifestLabel(line)}
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-[#534434] bg-[#171f33] p-4">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-[#dae2fd]">
            <span className="material-symbols-outlined text-[20px] text-[#ffc174]">add_a_photo</span>
            Documentation
          </h3>
          <p className="mb-4 text-[#d8c3ad]">Take photo of items before loading.</p>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoAdd} />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#ffc174] bg-[#ffc174]/10 text-[#ffc174] transition-colors hover:bg-[#ffc174]/20"
            >
              <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                photo_camera
              </span>
              <span className="text-sm">Add Photo</span>
            </button>
            {photos.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setGalleryIndex(i)}
                className="aspect-square overflow-hidden rounded-lg border border-[#534434] bg-[#0b1326]"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {Array.from({ length: Math.max(0, 2 - photos.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-[#534434] bg-[#0b1326] opacity-40"
              >
                <span className="material-symbols-outlined text-[28px] text-[#534434]">image</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <label htmlFor="loading_notes" className="mb-2 flex items-center gap-2 text-lg font-semibold text-[#dae2fd]">
            <span className="material-symbols-outlined text-[20px] text-[#ffc174]">edit_note</span>
            Loading Notes
          </label>
          <textarea
            id="loading_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tap to enter notes regarding item condition, access point difficulties, or specific handling instructions..."
            className="min-h-[120px] w-full resize-none rounded-xl border border-[#534434] bg-[#0b1326] p-4 text-[#dae2fd] placeholder:text-[#d8c3ad]/60 focus:border-[#ffc174] focus:ring-1 focus:ring-[#ffc174] focus:outline-none"
          />
        </section>

        {pinRequired ? (
          <section className="mb-6">
            <label htmlFor="pickup_pin" className="mb-2 block text-sm text-[#d8c3ad]">
              Customer PIN
            </label>
            <input
              id="pickup_pin"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-[#534434] bg-[#0b1326] p-4 text-center text-2xl tracking-[0.5em] text-[#dae2fd] focus:border-[#ffc174] focus:outline-none"
              placeholder="••••"
            />
          </section>
        ) : null}
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-[#534434] bg-[#171f33]/95 p-4 backdrop-blur-md">
        <button
          type="button"
          disabled={advancing || (pinRequired && pin.length < 4)}
          onClick={() => void handleConfirm()}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-[#ffc174] text-lg font-bold text-[#2a1700] shadow-[0_4px_20px_rgba(255,193,116,0.15)] transition-transform hover:bg-[#ffddb8] active:scale-95 disabled:opacity-50"
        >
          {advancing ? 'Starting trip…' : 'Confirm Pickup - Start Trip'}
          <span className="material-symbols-outlined text-[24px] font-bold">arrow_forward</span>
        </button>
      </div>
      {galleryIndex !== null ? (
        <HaulPhotoGallery photos={photos} initialIndex={galleryIndex} onClose={() => setGalleryIndex(null)} />
      ) : null}
    </div>
  );
}
