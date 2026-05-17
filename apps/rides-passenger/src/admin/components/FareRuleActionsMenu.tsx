import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { FareRuleAdminDto } from '../services/ridesAdminService';

type Props = {
  rule: FareRuleAdminDto;
  onEdit: (rule: FareRuleAdminDto) => void;
  onDelete: (rule: FareRuleAdminDto) => void;
};

const MENU_WIDTH = 152;
const MENU_HEIGHT = 88;

function menuPosition(anchor: DOMRect): { top: number; left: number } {
  let top = anchor.bottom + 4;
  let left = anchor.right - MENU_WIDTH;
  if (top + MENU_HEIGHT > window.innerHeight - 8) {
    top = anchor.top - MENU_HEIGHT - 4;
  }
  if (left < 8) left = 8;
  if (left + MENU_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - MENU_WIDTH - 8;
  }
  return { top, left };
}

export function FareRuleActionsMenu({ rule, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    setCoords(menuPosition(buttonRef.current.getBoundingClientRect()));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_WIDTH }}
            className="z-[100] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              onClick={() => {
                setOpen(false);
                onEdit(rule);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
              onClick={() => {
                setOpen(false);
                onDelete(rule);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        aria-label="Actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
}
