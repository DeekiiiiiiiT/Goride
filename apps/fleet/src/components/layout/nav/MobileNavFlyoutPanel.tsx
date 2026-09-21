import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { NavLeaf } from './types';

type MobileNavFlyoutPanelProps = {
  open: boolean;
  title: string;
  items: NavLeaf[];
  currentPage: string;
  onBack: () => void;
  onNavigate: (page: string) => void;
};

function isLeafActive(item: NavLeaf, currentPage: string) {
  if (item.id === currentPage) return true;
  return item.activeIds?.includes(currentPage) ?? false;
}

/**
 * Floating fly-out card on phone — portaled beside the icon rail over the dimmed page.
 */
export function MobileNavFlyoutPanel({
  open,
  title,
  items,
  currentPage,
  onBack,
  onNavigate,
}: MobileNavFlyoutPanelProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <aside
      id="mobile-nav-flyout-panel"
      role="region"
      aria-label={title}
      aria-hidden={!open}
      className={cn(
        // Flush to the w-16 icon rail (1px so borders don't stack).
        'pointer-events-auto fixed top-[3.75rem] left-[calc(4rem+1px)] z-[60] w-[15.5rem] max-w-[calc(100vw-5rem)]',
        'flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white',
        'shadow-xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-950',
        'transition-all duration-300 ease-out',
        open
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-2 opacity-0',
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5 border-b border-slate-100 px-1.5 py-2 dark:border-slate-800">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          onClick={onBack}
          aria-label="Back to main menu"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <h2 className="min-w-0 truncate pr-2.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h2>
      </div>

      <ul className="p-1.5" role="menu">
        {items.map((item) => {
          const active = isLeafActive(item, currentPage);
          return (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-indigo-500/40',
                  active
                    ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
                onClick={() => onNavigate(item.id)}
                title={item.title}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    active ? 'bg-indigo-500' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>,
    document.body,
  );
}
