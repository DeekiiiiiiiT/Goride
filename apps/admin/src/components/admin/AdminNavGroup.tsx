import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { AdminNavSection } from './AdminNavSection';
import type { NavChild } from './adminNavConfig';

export type NavSubSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavChild[];
  open: boolean;
  setOpen: (v: boolean) => void;
  isActive: boolean;
};

type AdminNavGroupProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: NavSubSection[];
  currentPage: string;
  open: boolean;
  onToggle: () => void;
  onNavigate: (page: string) => void;
  isActive: boolean;
};

const groupBtnActive =
  'bg-amber-500/15 text-amber-700 dark:text-amber-300';
const groupBtnIdle =
  'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800';

export function AdminNavGroup({
  label,
  icon: GroupIcon,
  sections,
  currentPage,
  open,
  onToggle,
  onNavigate,
  isActive,
}: AdminNavGroupProps) {
  const visibleSections = sections.filter((s) => s.children.length > 0);
  if (visibleSections.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${isActive ? groupBtnActive : groupBtnIdle}
        `}
      >
        <GroupIcon className="w-4.5 h-4.5 shrink-0" />
        <span className="truncate">{label}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-500" />
          : <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-500" />
        }
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 dark:border-slate-800 pl-2">
          {visibleSections.map((section) => (
            <AdminNavSection
              key={section.key}
              label={section.label}
              icon={section.icon}
              children={section.children}
              currentPage={currentPage}
              open={section.open}
              onToggle={() => section.setOpen(!section.open)}
              onNavigate={onNavigate}
              isActive={section.isActive}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
}
