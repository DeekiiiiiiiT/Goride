import React from 'react';
import { createPortal } from 'react-dom';

export type ActionSheetItem = {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
  onClick: () => void;
};

type Props = {
  open: boolean;
  title?: string;
  items: ActionSheetItem[];
  onClose: () => void;
};

export function HaulActionSheet({ open, title, items, onClose }: Props) {
  if (!open) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[240] bg-[#060e20]/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal
        className="haul-sheet-up fixed bottom-0 z-[250] w-full rounded-t-xl border-t border-[#534434] bg-[#171f33] safe-x safe-b md:left-1/2 md:max-w-md md:-translate-x-1/2"
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#2d3449]" />
        </div>
        {title ? (
          <h2 className="border-b border-[#534434] px-4 py-3 text-center text-sm font-medium text-[#d8c3ad]">
            {title}
          </h2>
        ) : null}
        <ul className="py-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={`flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left text-base transition-colors hover:bg-[#2d3449]/50 ${
                  item.destructive ? 'text-[#ffb4ab]' : 'text-[#dae2fd]'
                }`}
              >
                {item.icon ? (
                  <span className="material-symbols-outlined text-xl">{item.icon}</span>
                ) : null}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-[#534434] p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-[#2d3449] text-sm font-medium text-[#dae2fd]"
          >
            Cancel
          </button>
        </div>
      </section>
    </>,
    document.body,
  );
}
