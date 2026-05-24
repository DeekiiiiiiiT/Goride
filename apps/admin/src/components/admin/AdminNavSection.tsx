import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { NavChild } from './adminNavConfig';

type AdminNavSectionProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavChild[];
  currentPage: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: (page: string) => void;
  isActive: boolean;
};

export function AdminNavSection({
  label,
  icon: SectionIcon,
  children,
  currentPage,
  open,
  onToggle,
  onNavigate,
  isActive,
}: AdminNavSectionProps) {
  if (children.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${isActive
            ? 'bg-amber-500/15 text-amber-300'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }
        `}
      >
        <SectionIcon className="w-4.5 h-4.5 shrink-0" />
        <span className="truncate">{label}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
          : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
        }
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-800 pl-2">
          {children.map((child) => {
            const ChildIcon = child.icon;
            const active = currentPage === child.id && !child.href;
            if (child.href) {
              return (
                <a
                  key={child.id}
                  href={child.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-slate-500 hover:text-white hover:bg-slate-800"
                >
                  <ChildIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{child.label}</span>
                </a>
              );
            }
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => onNavigate(child.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? 'bg-amber-500/10 text-amber-300'
                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                <ChildIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{child.label}</span>
                {active && <ChevronRight className="w-3 h-3 ml-auto text-amber-400/60" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
