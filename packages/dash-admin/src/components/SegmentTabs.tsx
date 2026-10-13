import { useSearchParams } from 'react-router-dom';

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

/** Filters replace the address. Tabs push, so Back returns to the previous tab. */
export function useUrlParam<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
  history: 'push' | 'replace' = 'replace',
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key) as T | null;
  const value = raw && (!allowed || allowed.includes(raw)) ? raw : fallback;
  const setValue = (next: T) => {
    const updated = new URLSearchParams(params);
    if (!next) updated.delete(key);
    else updated.set(key, next);
    setParams(updated, { replace: history === 'replace' });
  };
  return [value, setValue];
}

export function useUrlTab<T extends string>(fallback: T, allowed: readonly T[], key = 'tab'): [T, (next: T) => void] {
  return useUrlParam(key, fallback, allowed, 'push');
}
