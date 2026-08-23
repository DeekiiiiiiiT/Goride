import React, { useState } from 'react';

type SegmentTabProps<T extends string> = {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
};

export function SegmentTabs<T extends string>({ tabs, active, onChange }: SegmentTabProps<T>) {
  if (tabs.length <= 1) return null;

  return (
    <div className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 w-fit mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            active === tab.id
              ? 'bg-amber-500/15 text-amber-300'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function useSegmentTab<T extends string>(
  tabs: Array<{ id: T; label: string }>,
  defaultId: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [active, setActive] = useState<T>(defaultId);
  const visible = tabs.some((t) => t.id === active) ? active : tabs[0]?.id ?? defaultId;
  return [visible, setActive];
}
