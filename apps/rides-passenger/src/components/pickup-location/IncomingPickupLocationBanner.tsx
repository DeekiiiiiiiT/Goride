import React, { useMemo } from 'react';
import { MapPin, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { IncomingPickupLocationRequestDto } from '@roam/types/pickupLocationRequest';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
  ON_PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const DISMISS_STORAGE_KEY = 'roam:dismissed-pickup-location-request-ids';

type Props = {
  request: IncomingPickupLocationRequestDto;
  moreCount: number;
  onDismiss: (requestId: string) => void;
};

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expiring soon';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

export function readDismissedPickupLocationRequestIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function dismissPickupLocationRequestId(requestId: string): void {
  const next = readDismissedPickupLocationRequestIds();
  next.add(requestId);
  sessionStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...next]));
}

export function IncomingPickupLocationBanner({ request, moreCount, onDismiss }: Props) {
  const navigate = useNavigate();
  const bookerLabel = request.booker_name?.trim() || 'Someone';
  const timeLeft = useMemo(() => formatTimeRemaining(request.expires_at), [request.expires_at]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[45] px-4 safe-x"
      style={{
        top: 'calc(4rem + max(0.75rem, env(safe-area-inset-top, 0px)) + 0.5rem)',
      }}
      role="region"
      aria-label="Pickup location request"
    >
      <div
        className="pointer-events-auto mx-auto flex max-w-xl gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{ backgroundColor: SURFACE_LOWEST, border: '1px solid rgba(0,74,198,0.12)' }}
      >
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(0,74,198,0.08)' }}
        >
          <MapPin className="h-4 w-4" style={{ color: PRIMARY }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: ON_SURFACE }}>
            <span style={{ color: PRIMARY }}>{bookerLabel}</span> needs your pickup location
          </p>
          <p className="mt-0.5 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {timeLeft}
            {moreCount > 0 ? ` · +${moreCount} more` : ''}
          </p>
          <button
            type="button"
            onClick={() => navigate(`/location-share/${request.token}`)}
            className="btn-touch mt-2 h-9 rounded-xl px-4 text-sm font-semibold touch-manipulation"
            style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
          >
            Share location
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(request.id)}
          className="btn-touch -mr-1 shrink-0 rounded-full p-2 touch-manipulation"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} />
        </button>
      </div>
    </div>
  );
}
