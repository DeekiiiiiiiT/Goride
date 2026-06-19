import React, { useRef, useState } from 'react';
import { haulHaptic } from '../../utils/haulHaptics';

type Props = {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
};

export function HaulSlideConfirm({ label, disabled, onConfirm }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const maxOffset = () => {
    const track = trackRef.current;
    if (!track) return 240;
    return Math.max(0, track.clientWidth - 64);
  };

  const finish = () => {
    if (offset >= maxOffset() * 0.75) {
      haulHaptic('success');
      onConfirm();
    }
    setOffset(0);
    setDragging(false);
  };

  return (
    <div
      ref={trackRef}
      className="relative flex h-16 items-center overflow-hidden rounded-full border border-[#534434] bg-[#222a3d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
    >
      <div
        className="absolute top-1 left-1 z-10 flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-full bg-[#ffc174] shadow-md active:cursor-grabbing"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={(e) => {
          if (disabled) return;
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging || disabled) return;
          const track = trackRef.current;
          if (!track) return;
          const rect = track.getBoundingClientRect();
          const x = e.clientX - rect.left - 28;
          setOffset(Math.max(0, Math.min(x, maxOffset())));
        }}
        onPointerUp={finish}
        onPointerLeave={() => {
          if (dragging) finish();
        }}
      >
        <span className="material-symbols-outlined font-bold text-[#472a00]">arrow_forward</span>
      </div>
      <p className="w-full pr-16 text-center text-lg font-semibold tracking-wide text-[#d8c3ad] select-none">
        {label}
      </p>
    </div>
  );
}
