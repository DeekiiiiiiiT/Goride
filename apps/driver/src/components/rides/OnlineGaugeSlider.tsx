import React, { useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';

type Props = {
  online: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
};

const THUMB_SIZE = 44;
const TRACK_HEIGHT = 48;
/** How far from the resting edge the thumb must move to toggle. */
const OFFLINE_DRAG_RATIO = 0.48;
const ONLINE_DRAG_RATIO = 0.52;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function OnlineGaugeSlider({ online, onToggle, disabled = false, className = '' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!draggingRef.current) {
      dragOffsetRef.current = 0;
      setDragOffset(0);
    }
  }, [online]);

  const maxTravel = () => {
    const track = trackRef.current;
    if (!track) return 200;
    return Math.max(80, track.clientWidth - THUMB_SIZE - 8);
  };

  const progressFromOffset = (offset: number) => clamp01(offset / maxTravel());

  const offsetFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return online ? maxTravel() : 0;
    const raw = clientX - rect.left - THUMB_SIZE / 2 - 4;
    return Math.min(maxTravel(), Math.max(0, raw));
  };

  const restingOffset = () => (online ? maxTravel() : 0);
  const displayOffset = dragging ? dragOffset : restingOffset();
  const progress = progressFromOffset(displayOffset);

  const commit = (offset: number) => {
    draggingRef.current = false;
    setDragging(false);
    const p = progressFromOffset(offset);
    const shouldBeOnline = online ? p > 1 - OFFLINE_DRAG_RATIO : p >= ONLINE_DRAG_RATIO;
    if (shouldBeOnline !== online) {
      onToggle();
      return;
    }
    dragOffsetRef.current = 0;
    setDragOffset(0);
  };

  const goOnlineDisabled = disabled && !online;
  const hint = online ? 'Slide left to go offline' : 'Slide right to go online';
  const status = online ? 'You are online' : 'You are offline';

  return (
    <div className={className} aria-hidden={false}>
      <div className="mx-auto w-full max-w-lg safe-x px-3">
        <div
          className={`rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] ${
            goOnlineDisabled ? 'opacity-60' : ''
          }`}
        >
          <p className="mb-1.5 text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {hint}
          </p>
          <div
            ref={trackRef}
            className={`relative mx-auto w-full max-w-md select-none touch-none rounded-xl ${
              goOnlineDisabled ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'
            }`}
            style={{ height: TRACK_HEIGHT }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={online ? 'Online — slide left to go offline' : 'Offline — slide right to go online'}
            onPointerDown={(e) => {
              if (goOnlineDisabled) return;
              draggingRef.current = true;
              setDragging(true);
              trackRef.current?.setPointerCapture(e.pointerId);
              const offset = offsetFromClientX(e.clientX);
              dragOffsetRef.current = offset;
              setDragOffset(offset);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current || goOnlineDisabled) return;
              const offset = offsetFromClientX(e.clientX);
              dragOffsetRef.current = offset;
              setDragOffset(offset);
            }}
            onPointerUp={(e) => {
              if (!draggingRef.current) return;
              try {
                trackRef.current?.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              commit(dragOffsetRef.current);
            }}
            onPointerCancel={(e) => {
              if (!draggingRef.current) return;
              try {
                trackRef.current?.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              commit(dragOffsetRef.current);
            }}
          >
            <div
              className={`absolute inset-0 rounded-xl ${
                online || progress > 0.12
                  ? 'bg-emerald-500/15 dark:bg-emerald-500/20'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            />
            <div
              className={`absolute inset-y-1 left-1 rounded-lg transition-[width] duration-150 ${
                online || progress > 0.08 ? 'bg-emerald-500/35' : 'bg-slate-200/80 dark:bg-slate-700/80'
              }`}
              style={{
                width: `calc(${Math.max(THUMB_SIZE, displayOffset + THUMB_SIZE)}px)`,
                transition: dragging ? 'none' : undefined,
              }}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 text-[10px] font-semibold text-slate-400">
              <span>Offline</span>
              <span>Online</span>
            </span>
            <div
              className={`absolute top-1 flex items-center justify-center rounded-lg border-2 shadow-sm ${
                online || progress > 0.5
                  ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500'
                  : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'
              }`}
              style={{
                width: THUMB_SIZE,
                height: THUMB_SIZE - 8,
                transform: `translateX(${displayOffset}px)`,
                transition: dragging ? 'none' : 'transform 0.2s ease-out',
              }}
            >
              <Power className="h-4 w-4 shrink-0" aria-hidden />
            </div>
          </div>
          <p
            className={`mt-1.5 text-center text-xs font-semibold ${
              online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {status}
          </p>
        </div>
      </div>
    </div>
  );
}
