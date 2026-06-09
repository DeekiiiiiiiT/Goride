import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useBookerTracking } from '@/contexts/BookerTrackingContext';
import { bookerChipStatusLabel, passengerChipStatusLabel } from '@/lib/bookerTracking';

const FAB_WIDTH_PX = 128;
const FAB_HEIGHT_PX = 44;
const FAB_STORAGE_KEY = 'roam:active-trip-fab-position-v2';
const DRAG_THRESHOLD_PX = 8;

type Point = { x: number; y: number };

function safeTopInset(): number {
  if (typeof window === 'undefined') return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)')) || 0;
}

function safeBottomInset(): number {
  if (typeof window === 'undefined') return 0;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)')) || 0;
}

/** Right side, mid-screen — just above the home “Where to?” sheet. */
function defaultFabPosition(): Point {
  if (typeof window === 'undefined') return { x: 16, y: 280 };
  const pad = 12;
  const bottomNav = 56 + safeBottomInset();
  const sheetTop = window.innerHeight - bottomNav - Math.min(window.innerHeight * 0.46, 420);
  const y = Math.round(sheetTop - FAB_HEIGHT_PX - 20);
  return {
    x: Math.max(pad, window.innerWidth - FAB_WIDTH_PX - pad),
    y: Math.max(minimumFabY(), y),
  };
}

function minimumFabY(): number {
  if (typeof window === 'undefined') return 96;
  return Math.round(72 + safeTopInset());
}

function clampFabPosition(point: Point): Point {
  if (typeof window === 'undefined') return point;
  const pad = 8;
  const maxX = window.innerWidth - FAB_WIDTH_PX - pad;
  const maxY = window.innerHeight - FAB_HEIGHT_PX - pad - safeBottomInset();
  return {
    x: Math.min(Math.max(pad, point.x), maxX),
    y: Math.min(Math.max(minimumFabY(), point.y), maxY),
  };
}

function readStoredFabPosition(): Point | null {
  try {
    const raw = localStorage.getItem(FAB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Point;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    if (parsed.y < minimumFabY()) return null;
    return clampFabPosition(parsed);
  } catch {
    return null;
  }
}

function persistFabPosition(point: Point): void {
  try {
    localStorage.setItem(FAB_STORAGE_KEY, JSON.stringify(point));
  } catch {
    /* ignore */
  }
}

/** Routes where active-trip FAB is redundant (hub already lists live trips). */
export function shouldHideActiveTripFab(pathname: string): boolean {
  return pathname.startsWith('/services/book-for-others');
}

/**
 * Draggable floating pill when booker or rider minimized the live tracker.
 */
export function BookerActiveTripChip() {
  const { mode, minimizedRideId, minimizedRole, summary, summaryLoading, openFull } =
    useBookerTracking();
  const [position, setPosition] = useState<Point>(() =>
    readStoredFabPosition() ?? defaultFabPosition(),
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    const onResize = () => setPosition((p) => clampFabPosition(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
        dragging: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [position.x, position.y],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    drag.dragging = true;
    setPosition(
      clampFabPosition({
        x: drag.originX + dx,
        y: drag.originY + dy,
      }),
    );
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      if (drag.dragging) {
        const next = clampFabPosition({
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        });
        setPosition(next);
        persistFabPosition(next);
      } else if (minimizedRideId) {
        openFull(minimizedRideId);
      }

      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [minimizedRideId, openFull],
  );

  if (mode !== 'minimized' || !minimizedRideId) return null;

  const isBooker = minimizedRole === 'booker';
  const passengerName = summary?.guest_passenger_name?.trim() || 'Passenger';
  const title = isBooker ? `Ride for ${passengerName}` : 'Your active trip';
  const statusLabel = summary
    ? isBooker
      ? bookerChipStatusLabel(summary.status)
      : passengerChipStatusLabel(summary.status)
    : 'In progress';
  const label = isBooker ? 'View ride' : 'View trip';

  return (
    <button
      type="button"
      className="active-trip-fab touch-manipulation"
      style={{ left: position.x, top: position.y }}
      aria-label={`${title}. ${statusLabel}. Tap to open. Drag to move.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <span className="active-trip-fab__pulse-ring" aria-hidden />
      <span className="active-trip-fab__live-dot" aria-hidden />
      <span className="active-trip-fab__content">
        {summaryLoading && !summary ? (
          <Loader2 className="active-trip-fab__spinner" strokeWidth={2.5} aria-hidden />
        ) : null}
        <span className="active-trip-fab__label">{label}</span>
        <span className="active-trip-fab__status">{statusLabel}</span>
      </span>
    </button>
  );
}
