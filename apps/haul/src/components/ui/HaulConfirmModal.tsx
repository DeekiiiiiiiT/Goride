import React from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function HaulConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#060e20]/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="haul-confirm-title"
        className="relative w-full max-w-sm rounded-xl border border-[#534434] bg-[#171f33] p-6 shadow-2xl"
      >
        <h2 id="haul-confirm-title" className="mb-2 text-lg font-semibold text-[#dae2fd]">
          {title}
        </h2>
        <p className="mb-6 text-sm text-[#d8c3ad]">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-[#534434] text-sm font-medium text-[#dae2fd] hover:bg-[#2d3449]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${
              destructive
                ? 'bg-[#93000a] text-[#ffdad6] hover:bg-[#93000a]/90'
                : 'bg-[#ffc174] text-[#472a00] hover:bg-[#ffddb8]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
