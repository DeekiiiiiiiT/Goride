import React from 'react';
import { UserPlus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RoamConnectionRequestDto } from '@roam/types/roamConnections';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
  ON_PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

const DISMISS_STORAGE_KEY = 'roam:dismissed-connection-request-ids';

type Props = {
  request: RoamConnectionRequestDto;
  moreCount: number;
  onDismiss: (requestId: string) => void;
};

export function readDismissedConnectionRequestIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function dismissConnectionRequestId(requestId: string): void {
  const next = readDismissedConnectionRequestIds();
  next.add(requestId);
  sessionStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify([...next]));
}

export function IncomingConnectionRequestBanner({ request, moreCount, onDismiss }: Props) {
  const navigate = useNavigate();
  const requesterLabel = request.requester_display_name?.trim()
    || (request.requester_custom_tag_name ? `@${request.requester_custom_tag_name}` : 'Someone on Roam');

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[44] px-4 safe-x"
      style={{
        top: 'calc(4rem + max(0.75rem, env(safe-area-inset-top, 0px)) + 0.5rem)',
      }}
      role="region"
      aria-label="Connection request"
    >
      <div
        className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
        >
          <UserPlus className="h-5 w-5" aria-hidden />
        </div>
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => navigate('/account/contacts/pending?tab=received')}
        >
          <p className="truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
            {requesterLabel} wants to connect
          </p>
          <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
            {moreCount > 0 ? `${moreCount + 1} pending requests` : 'Tap to review'}
          </p>
        </button>
        <button
          type="button"
          onClick={() => navigate('/account/contacts/pending?tab=received')}
          className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          Review
        </button>
        <button
          type="button"
          onClick={() => onDismiss(request.id)}
          className="shrink-0 rounded-full p-1.5"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
