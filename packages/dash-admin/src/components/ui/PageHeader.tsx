import React from 'react';

type Tab = { id: string; label: string; count?: number };

export function PageHeader({
  title,
  description,
  actions,
  tabs,
  activeTab,
  onTab,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  tabs?: Tab[];
  activeTab?: string;
  onTab?: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
          {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTab?.(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
              {tab.count != null ? ` ${tab.count}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
