import React from 'react';
import type { HaulageBookingManifest } from '@roam/types/haulage';

type Props = {
  manifest: HaulageBookingManifest;
  compact?: boolean;
};

export function HaulageManifestCard({ manifest, compact = false }: Props) {
  const gear = manifest.recommended_gear ?? [];
  return (
    <div className="rounded-xl border border-amber-200/30 bg-amber-950/20 p-3 text-sm">
      <p className="font-semibold text-amber-100">Haulage manifest</p>
      <p className="mt-1 text-amber-50/90">{manifest.manifest_summary}</p>
      <p className="mt-2 text-xs text-amber-200/80">
        {manifest.total_weight_kg} kg total · ~{manifest.fill_percent}% van fill
      </p>
      {!compact && gear.length > 0 ? (
        <p className="mt-1 text-xs text-amber-200/70">Gear: {gear.join(', ')}</p>
      ) : null}
      {manifest.stairs_level !== 'none' ? (
        <p className="mt-1 text-xs text-amber-300">Stairs: {manifest.stairs_level.replace('_', ' ')}</p>
      ) : null}
      {manifest.prep_status === 'needs_unhooking' ? (
        <p className="mt-1 text-xs text-amber-300">Customer needs unhooking help</p>
      ) : null}
    </div>
  );
}

export function isHaulageRide(vehicleOption: string | undefined | null): boolean {
  return vehicleOption?.trim().toLowerCase() === 'haulage';
}
