import React, { useRef, useState } from 'react';
import { haulHaptic } from '../../utils/haulHaptics';

type Props = {
  disabled?: boolean;
  onConfirm: () => void;
};

export function HaulSlideOfflineButton({ disabled, onConfirm }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const maxOffset = () => {
    const track = trackRef.current;
    if (!track) return 200;
    return track.clientWidth - 56;
  };

  const finishSlide = () => {
    if (offset >= maxOffset() * 0.75) {
      haulHaptic('warning');
      onConfirm();
    }
    setOffset(0);
    setDragging(false);
  };

  return (
    <button
      type="button"
      ref={trackRef}
      disabled={disabled}
      className="group relative flex h-14 w-full max-w-xs items-center overflow-hidden rounded-full border border-[#534434] bg-[#2d3449] shadow-md transition-transform active:scale-[0.98] disabled:opacity-50"
      onPointerUp={finishSlide}
      onPointerLeave={() => {
        if (dragging) finishSlide();
      }}
    >
      <div className="absolute inset-y-0 left-0 z-0 w-0 bg-[#93000a]/20 transition-all duration-500 group-hover:w-full" />
      <div
        className="absolute top-1 left-1 z-10 flex h-12 w-12 touch-none items-center justify-center rounded-full bg-[#ffb4ab] shadow-lg transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (disabled) return;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const track = trackRef.current;
          if (!track) return;
          const rect = track.getBoundingClientRect();
          const x = e.clientX - rect.left - 28;
          setOffset(Math.max(0, Math.min(x, maxOffset())));
        }}
      >
        <span
          className="material-symbols-outlined text-[#690005]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          power_settings_new
        </span>
      </div>
      <span className="z-10 ml-16 w-full text-center text-sm font-medium tracking-wider text-[#dae2fd] uppercase">
        Slide to Go Offline
      </span>
    </button>
  );
}
