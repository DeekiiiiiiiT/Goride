import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { ALL_SETTINGS } from '@roam/rush-settings';
import { PageHeader } from '../../components/ui/PageHeader';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { SETTINGS_NAV, sectionToSlug, type SettingsNavItem } from './nav';

export type SettingsOutletContext = AdminOutletContext & {
  pendingCount: number;
  setPendingCount: (n: number) => void;
};

export function SettingsLayout() {
  const parent = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ALL_SETTINGS.filter(
      (s) =>
        !s.hidden &&
        (s.label.toLowerCase().includes(q) ||
          s.help.toLowerCase().includes(q) ||
          s.key.toLowerCase().includes(q) ||
          s.section.toLowerCase().includes(q)),
    ).slice(0, 12);
  }, [query]);

  const ctx: SettingsOutletContext = {
    ...parent,
    pendingCount,
    setPendingCount,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="How Rush, Courier, and Partner behave."
        actions={
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:text-white"
          >
            Search settings… <span className="ml-2 text-xs text-slate-500">⌘K</span>
          </button>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label="Settings sections"
          className="w-full shrink-0 space-y-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60 p-3 lg:w-56 lg:overflow-visible"
        >
          {SETTINGS_NAV.map((item) => (
            <NavBlock key={item.id} item={item} pendingCount={pendingCount} />
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet context={ctx} />
        </div>
      </div>

      {searchOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]">
          <button type="button" className="absolute inset-0" aria-label="Close search" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 shadow-xl">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or help text"
              className="w-full border-b border-slate-800 bg-transparent px-4 py-3 text-sm text-white outline-none"
            />
            <ul className="max-h-80 overflow-auto p-2">
              {results.length === 0 ? (
                <li className="px-3 py-4 text-sm text-slate-500">
                  {query.trim() ? 'No matches.' : 'Type to find a setting.'}
                </li>
              ) : (
                results.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-900"
                      onClick={() => {
                        setSearchOpen(false);
                        navigate(`/settings/${s.app}/${sectionToSlug(s.section)}?highlight=${encodeURIComponent(s.key)}`);
                      }}
                    >
                      <p className="text-sm text-slate-100">{s.label}</p>
                      <p className="text-xs text-slate-500">
                        {s.app} · {s.section}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavBlock({ item, pendingCount }: { item: SettingsNavItem; pendingCount: number }) {
  if (item.kind === 'link') {
    return <RailLink to={item.to} label={item.label} badge={item.id === 'approvals' && pendingCount > 0 ? pendingCount : undefined} />;
  }
  return (
    <div>
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
      <div className="flex gap-1 lg:flex-col">
        {item.items.map((child) => (
          <RailLink key={child.id} to={child.to} label={child.label} />
        ))}
      </div>
    </div>
  );
}

function RailLink({ to, label, badge }: { to: string; label: string; badge?: number }) {
  const end = to === '/settings';
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${
          isActive ? 'bg-amber-500/15 text-amber-300' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
        }`
      }
    >
      {label}
      {badge != null ? <span className="ml-1 text-amber-300">({badge})</span> : null}
    </NavLink>
  );
}
