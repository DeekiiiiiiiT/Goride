import React, { useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';

type Props = {
  online: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'premium';
  dense?: boolean;
};

const THUMB_SIZE = 44;
const PREMIUM_THUMB_SIZE = 48;
const TRACK_HEIGHT = 48;
const OFFLINE_DRAG_RATIO = 0.48;
const ONLINE_DRAG_RATIO = 0.52;
const PREMIUM_OFFLINE_DRAG_RATIO = 0.72;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function OnlineGaugeSlider({
  online,
  onToggle,
  disabled = false,
  className = '',
  variant = 'default',
  dense = false,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const isPremium = variant === 'premium';
  const thumbSize = isPremium ? (dense ? 44 : PREMIUM_THUMB_SIZE) : THUMB_SIZE;
  const premiumTrackClass = isPremium
    ? dense
      ? 'driver-home-slider-track flex h-14 items-center overflow-hidden rounded-full px-2'
      : 'driver-home-slider-track flex h-16 items-center overflow-hidden rounded-full px-2'
    : '';

  useEffect(() => {
    if (!draggingRef.current) {
      dragOffsetRef.current = 0;
      setDragOffset(0);
    }
  }, [online]);

  const maxTravel = () => {
    const track = trackRef.current;
    if (!track) return 200;
    return Math.max(80, track.clientWidth - thumbSize - 8);
  };

  const progressFromOffset = (offset: number) => clamp01(offset / maxTravel());

  const offsetFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return online ? maxTravel() : 0;
    const raw = clientX - rect.left - thumbSize / 2 - 4;
    return Math.min(maxTravel(), Math.max(0, raw));
  };

  const restingOffset = () => (online ? maxTravel() : 0);
  const displayOffset = dragging ? dragOffset : restingOffset();
  const progress = progressFromOffset(displayOffset);

  const commit = (offset: number) => {
    draggingRef.current = false;
    setDragging(false);
    const p = progressFromOffset(offset);
    const offlineThreshold = isPremium ? PREMIUM_OFFLINE_DRAG_RATIO : OFFLINE_DRAG_RATIO;
    const shouldBeOnline = online ? p > 1 - offlineThreshold : p >= ONLINE_DRAG_RATIO;
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
  const draggingOffline =
    isPremium && online && dragging && progressFromOffset(dragOffset) < 1 - PREMIUM_OFFLINE_DRAG_RATIO;

  const trackNode = (
    <div
      ref={trackRef}
      className={`relative mx-auto w-full select-none touch-none ${
        isPremium ? premiumTrackClass : 'max-w-md rounded-xl'
      } ${goOnlineDisabled ? 'pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ height: isPremium ? undefined : TRACK_HEIGHT }}
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
      {!isPremium ? (
        <>
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
              width: `calc(${Math.max(thumbSize, displayOffset + thumbSize)}px)`,
              transition: dragging ? 'none' : undefined,
            }}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-3 text-[10px] font-semibold text-slate-400">
            <span>Offline</span>
            <span>Online</span>
          </span>
        </>
      ) : (
        <>
          <div
            className={`pointer-events-none absolute inset-0 ${
              draggingOffline ? 'bg-red-500/10' : 'bg-[#006d43]/5'
            }`}
          />
          {online ? (
            <>
              <span
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400/80 dark:text-white/40"
                style={{
                  left: dragging
                    ? `calc(0.5rem + ${displayOffset}px + ${thumbSize}px + 0.75rem)`
                    : '1.25rem',
                  transition: dragging ? 'none' : 'left 0.2s ease-out',
                }}
              >
                OFFLINE
              </span>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#006d43]/70 dark:text-[#59de9b]/80">
                ONLINE
              </span>
            </>
          ) : (
            <>
              <span
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400/80 dark:text-white/40"
                style={{
                  left: `calc(0.5rem + ${displayOffset}px + ${thumbSize}px + 0.75rem)`,
                  transition: dragging ? 'none' : 'left 0.2s ease-out',
                }}
              >
                OFFLINE
              </span>
              <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-sm font-medium text-[#006d43]/70 dark:text-[#59de9b]/80">
                ONLINE
              </span>
            </>
          )}
        </>
      )}
      <div
        className={
          isPremium
            ? `absolute z-10 flex items-center justify-center rounded-full shadow-lg transition-colors ${
                draggingOffline
                  ? 'bg-red-600 text-white'
                  : 'bg-[#006d43] text-white hover:brightness-110'
              }`
            : `absolute top-1 flex items-center justify-center rounded-lg border-2 shadow-sm ${
                online || progress > 0.5
                  ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-500'
                  : 'border-slate-300 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300'
              }`
        }
        style={{
          width: thumbSize,
          height: isPremium ? thumbSize : thumbSize - 8,
          ...(isPremium
            ? { top: '50%', marginTop: -(thumbSize / 2), left: 8 }
            : {}),
          transform: `translateX(${displayOffset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        <Power className={isPremium ? 'h-6 w-6 shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
      </div>
    </div>
  );

  if (isPremium) {
    return (
      <div className={className}>
        <div className={`flex flex-col items-center ${dense ? 'gap-2' : 'gap-4'} ${goOnlineDisabled ? 'opacity-60' : ''}`}>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {hint}
          </p>
          {trackNode}
          <p
            className={`text-xs font-semibold ${
              online ? 'text-[#006d43] dark:text-[#59de9b]' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {status}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} aria-hidden={false}>
      <div className="mx-auto w-full max-w-lg safe-x px-3">
        <div
          className={`rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] ${
            goOnlineDisabled ? 'opacity-60' : ''
          }`}
        >
          <p className="mb-1.5 text-center text-[10px] font-medium text-slate-500 dark:text-slate-400">{hint}</p>
          {trackNode}
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
