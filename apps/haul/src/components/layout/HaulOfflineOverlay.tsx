import React from 'react';
import { createPortal } from 'react-dom';
import { useAppImmersiveMode } from '../../hooks/useAppImmersiveMode';

type Props = {
  onRetry: () => void;
  onViewManifest?: () => void;
};

export function HaulOfflineOverlay({ onRetry, onViewManifest }: Props) {
  useAppImmersiveMode(true);

  return createPortal(
    <div className="app-fullscreen-screen z-[300] items-center justify-center bg-[#0b1326]/95 backdrop-blur-sm safe-b">
      <main className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[#2d3449] bg-[#171f33] p-8 text-center shadow-2xl safe-x">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#31394d]/5 to-transparent" />
        <div className="relative mb-6 flex h-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[#ffc174]/20 blur-2xl" />
          <span
            className="material-symbols-outlined relative z-10 text-[80px] text-[#ffc174]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            cloud_off
          </span>
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-[#dae2fd]">No Internet Connection</h1>
        <p className="mx-auto mb-8 max-w-sm text-[#d8c3ad]">
          You&apos;re currently offline. Some features may be limited, but your active job data is cached and safe.
        </p>
        <div className="relative z-10 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded bg-[#ffc174] px-6 text-sm font-medium text-[#472a00] shadow-[0_0_15px_rgba(255,193,116,0.15)] hover:bg-[#ffc174]/90 active:scale-[0.98] sm:flex-none"
          >
            <span className="material-symbols-outlined text-xl">refresh</span>
            Retry
          </button>
          {onViewManifest ? (
            <button
              type="button"
              onClick={onViewManifest}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded border border-[#534434] px-6 text-sm font-medium text-[#ffc174] hover:border-[#ffc174]/50 hover:bg-[#2d3449] sm:flex-none"
            >
              <span className="material-symbols-outlined text-xl">description</span>
              View Cached Manifest
            </button>
          ) : null}
        </div>
      </main>
    </div>,
    document.body,
  );
}
