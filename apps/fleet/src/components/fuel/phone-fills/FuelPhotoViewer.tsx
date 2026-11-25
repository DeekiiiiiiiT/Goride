/**
 * In-app full-size photo viewer (RQ-07, docs/fuel-review-queue-review.md) and the Stitch photo tile
 * (Stitch Fleet screen 2). No photo ever opens a new browser tab.
 */
import React, { useEffect, useState } from 'react';

export function FullSizePhoto({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" role="dialog" aria-label={label}>
      <img src={url} alt={label} className="max-h-full max-w-full rounded-xl object-contain" />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-4 text-[13px] font-medium text-[#0d1c2e] shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px]">close</span> Close
      </button>
    </div>
  );
}

/** A photo with a "View full size" button that opens FullSizePhoto. */
export function ViewablePhoto({ url, label, className }: { url?: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!url) {
    return (
      <div className={`flex items-center justify-center rounded-xl bg-[#eff4ff] text-[13px] text-[#47464c] ${className || 'h-40'}`}>
        No {label.toLowerCase()}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#1b192e] ${className || 'h-40'}`}>
      <img src={url} alt={label} className="h-full w-full object-contain" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute bottom-2.5 right-2.5 rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0d1c2e] shadow-sm"
      >
        View full size
      </button>
      {open ? <FullSizePhoto url={url} label={label} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export type PhotoNote = { tone: 'good' | 'bad' | 'plain'; text: string };

/** Stitch screen 2 photo tile: dark photo, label chip top-left, value bottom-left, View full size bottom-right. */
export function FuelPhotoTile({
  url,
  label,
  icon,
  overlayValue,
  overlayBad,
  note,
}: {
  url?: string;
  label: string;
  icon: string;
  overlayValue?: string;
  overlayBad?: boolean;
  note?: PhotoNote;
}) {
  const [open, setOpen] = useState(false);
  const noteCls =
    note?.tone === 'good'
      ? 'bg-[#82f5c1] text-[#00714e]'
      : note?.tone === 'bad'
        ? 'bg-[#ffdad6] text-[#ba1a1a]'
        : 'bg-[#e6eeff] text-[#47464c]';
  const noteIcon = note?.tone === 'good' ? 'check_circle' : note?.tone === 'bad' ? 'cancel' : 'edit';
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-56 w-full overflow-hidden rounded-xl bg-[#1b192e] shadow-sm">
        {url ? <img src={url} alt={label} className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center text-[13px] text-[#84819a]">No photo</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded bg-black/75 px-2 py-0.5 text-[12px] font-semibold text-white backdrop-blur-sm">
          <span className="material-symbols-outlined text-[14px]">{icon}</span> {label}
        </div>
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
          <span className={`text-[13px] font-bold tabular-nums ${overlayBad ? 'text-[#ffdad6]' : 'text-white'}`}>{overlayValue || ''}</span>
          {url ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0d1c2e] shadow-sm hover:bg-[#e6eeff]"
            >
              View full size
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">{label}</span>
        {note ? (
          <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-semibold ${noteCls}`}>
            <span className="material-symbols-outlined text-[13px]">{noteIcon}</span> {note.text}
          </span>
        ) : null}
      </div>
      {open && url ? <FullSizePhoto url={url} label={label} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
