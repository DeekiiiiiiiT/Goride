import { useEffect, useId, useRef, useState } from 'react';

export type OverflowMenuItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type Props = {
  items: OverflowMenuItem[];
  icon?: 'more_horiz' | 'more_vert';
  className?: string;
  title?: string;
};

export function InventoryOverflowMenu({
  items,
  icon = 'more_horiz',
  className = '',
  title = 'More actions',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        title={title}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg bg-surface-container-lowest shadow-lg border border-surface-container py-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="w-full text-left px-3 py-2 font-body-sm text-body-sm text-on-surface hover:bg-surface-container disabled:opacity-50"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
