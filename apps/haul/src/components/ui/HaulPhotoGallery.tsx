import React, { useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
};

export function HaulPhotoGallery({ photos, initialIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const current = photos[index];

  if (!current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[260] flex flex-col bg-[#060e20]/95">
      <header className="flex h-14 items-center justify-between px-4">
        <button type="button" onClick={onClose} className="text-[#dae2fd]" aria-label="Close gallery">
          <span className="material-symbols-outlined">close</span>
        </button>
        <span className="text-sm text-[#d8c3ad]">
          {index + 1} / {photos.length}
        </span>
        <div className="w-6" />
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <img src={current} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
      {photos.length > 1 ? (
        <div className="flex justify-center gap-4 pb-8">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2d3449] text-[#dae2fd] disabled:opacity-30"
            aria-label="Previous photo"
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            type="button"
            disabled={index === photos.length - 1}
            onClick={() => setIndex((i) => i + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2d3449] text-[#dae2fd] disabled:opacity-30"
            aria-label="Next photo"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
