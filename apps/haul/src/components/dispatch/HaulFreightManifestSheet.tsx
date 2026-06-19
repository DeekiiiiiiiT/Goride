import React from 'react';
import type { HaulageBookingLineSnapshot, HaulageBookingManifest } from '@roam/types/haulage';

function itemIcon(line: HaulageBookingLineSnapshot): string {
  const t = `${line.item_title} ${line.label}`.toLowerCase();
  if (t.includes('sofa') || t.includes('chair')) return 'chair';
  if (t.includes('fridge') || t.includes('refrigerator')) return 'kitchen';
  return 'package_2';
}

function formatDims(line: HaulageBookingLineSnapshot): string {
  const parts = [line.length_cm, line.width_cm, line.height_cm].filter(Boolean);
  if (!parts.length) return `${line.weight_kg}kg`;
  return `${line.weight_kg}kg • ${parts.join('x')}cm`;
}

function stairsLabel(level: HaulageBookingManifest['stairs_level']): string | null {
  if (level === '1_flight') return '1 flight at pickup';
  if (level === '2_plus') return '2+ flights at pickup';
  return null;
}

type Props = {
  customerName: string;
  manifest: HaulageBookingManifest;
  accepting?: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose?: () => void;
};

export function HaulFreightManifestSheet({
  customerName,
  manifest,
  accepting,
  onAccept,
  onDecline,
}: Props) {
  const lines = manifest.lines ?? [];
  const hasFragile = lines.some((l) => l.fragile);
  const hasDisassembly = lines.some((l) => l.requires_disassembly);
  const hasUpright = lines.some((l) => l.upright_only);
  const stairs = stairsLabel(manifest.stairs_level);
  const gear = manifest.recommended_gear ?? [];

  return (
    <>
      <div className="fixed inset-0 z-[220] bg-[#060e20]/50 backdrop-blur-sm" aria-hidden onClick={onDecline} />
      <section
        role="dialog"
        aria-modal
        aria-labelledby="haul-manifest-title"
        className="haul-sheet-up fixed bottom-0 z-[230] flex max-h-[85dvh] w-full flex-col rounded-t-xl border-t border-[#534434] bg-[#171f33] shadow-lg safe-x safe-b md:left-1/2 md:max-w-md md:-translate-x-1/2"
      >
        <div className="flex w-full cursor-pointer justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#2d3449]" />
        </div>

        <div className="flex items-center justify-between border-b border-[#2d3449] px-4 pb-3">
          <div>
            <h2 id="haul-manifest-title" className="text-lg font-semibold text-[#dae2fd]">
              Freight Manifest
            </h2>
            <p className="text-base text-[#d8c3ad]">
              Customer: <span className="font-semibold text-[#dae2fd]">{customerName}</span>
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#534434] bg-[#222a3d]">
            <span className="material-symbols-outlined text-[#7bd0ff]">inventory_2</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-1 gap-2">
            {lines.map((line) => (
              <div
                key={line.id}
                className="flex items-start gap-2 rounded-lg border border-[#2d3449] bg-[#131b2e] p-2"
              >
                <div className="shrink-0 rounded-md border border-[#534434] bg-[#31394d] p-1">
                  <span className="material-symbols-outlined text-[#d8c3ad]">{itemIcon(line)}</span>
                </div>
                <div className="min-w-0 flex-grow">
                  <h3 className="text-sm font-medium text-[#dae2fd]">
                    {line.item_title}
                    {line.qty > 1 ? ` (${line.qty})` : ''}
                  </h3>
                  <p className="text-xs leading-tight text-[#d8c3ad]">{formatDims(line)}</p>
                  {line.upright_only ? (
                    <span className="mt-1 inline-flex items-center rounded-full border border-[#7bd0ff]/20 bg-[#7bd0ff]/10 px-2 py-0.5 text-[10px] text-[#7bd0ff]">
                      Upright only
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {hasFragile ? (
              <span className="inline-flex items-center rounded border border-[#ffb4ab] bg-[#ffb4ab]/10 px-2 py-1 text-xs text-[#ffb4ab]">
                <span className="material-symbols-outlined mr-1 text-sm">warning</span>
                Fragile
              </span>
            ) : null}
            {hasDisassembly ? (
              <span className="inline-flex items-center rounded border border-[#f59e0b] bg-[#f59e0b]/10 px-2 py-1 text-xs text-[#f59e0b]">
                <span className="material-symbols-outlined mr-1 text-sm">build</span>
                Requires disassembly
              </span>
            ) : null}
            {hasUpright ? (
              <span className="inline-flex items-center rounded border border-[#7bd0ff] bg-[#7bd0ff]/10 px-2 py-1 text-xs text-[#7bd0ff]">
                <span className="material-symbols-outlined mr-1 text-sm">arrow_upward</span>
                Upright only
              </span>
            ) : null}
          </div>

          {(stairs || manifest.prep_status === 'needs_unhooking') && (
            <div className="rounded-r-lg border-l-2 border-[#ffc174] bg-[#222a3d] p-2">
              <div className="mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-[#ffc174]">info</span>
                <span className="text-xs text-[#ffc174]">Access &amp; Requirements</span>
              </div>
              <ul className="ml-2 list-inside list-disc text-sm text-[#d8c3ad]">
                {stairs ? <li>{stairs}</li> : null}
                {manifest.prep_status === 'needs_unhooking' ? <li>Items need unhooking</li> : null}
              </ul>
            </div>
          )}

          {gear.length > 0 ? (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-sm font-medium text-[#d8c3ad]">
                <span className="material-symbols-outlined text-base">hardware</span>
                Recommended Gear
              </h4>
              <div className="rounded-md border border-[#2d3449] bg-[#131b2e] p-2 text-sm text-[#dae2fd]">
                {gear.join(', ')}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-4 border-t border-[#2d3449] bg-[#171f33] p-4">
          <button
            type="button"
            onClick={onDecline}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[#a08e7a] text-sm font-medium text-[#dae2fd] transition-colors hover:bg-[#222a3d] active:scale-95"
          >
            Decline
          </button>
          <button
            type="button"
            disabled={accepting}
            onClick={onAccept}
            className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[#ffc174] text-sm font-medium text-[#472a00] transition-colors hover:bg-[#ffb95f] active:scale-95 disabled:opacity-60"
          >
            {accepting ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </section>
    </>
  );
}
