import React, { useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import type { RiderContactGroupRow } from '@roam/types/riderContacts';
import { CARD_SHADOW, ON_SURFACE_VARIANT, SURFACE_LOWEST } from '@/lib/passengerTheme';

type Props = {
  group: RiderContactGroupRow;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPin: () => void;
  onAddContacts: () => void;
  onDelete: () => void;
};

export function GroupActionsMenu({
  group,
  open,
  onToggle,
  onClose,
  onPin,
  onAddContacts,
  onDelete,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="relative shrink-0 self-stretch">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-full min-h-[72px] items-center px-3"
        style={{ color: ON_SURFACE_VARIANT }}
        aria-label="Group options"
        aria-expanded={open}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open ? (
        <div
          className="absolute right-2 top-[calc(100%-0.5rem)] z-50 min-w-[160px] overflow-hidden rounded-xl py-1"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            className="block w-full px-4 py-3 text-left text-sm font-medium"
          >
            {group.is_pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onAddContacts();
            }}
            className="block w-full px-4 py-3 text-left text-sm font-medium"
          >
            Add contacts
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="block w-full px-4 py-3 text-left text-sm font-medium"
            style={{ color: '#b91c1c' }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
