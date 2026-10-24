import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

const LINKS = [
  { to: '/explore', label: 'Explore' },
  { to: '/garage', label: 'Garage' },
  { to: '/fuel', label: 'Log Fuel' },
  { to: '/map', label: 'Map It' },
  { to: '/account', label: 'Account' },
];

export function Shell() {
  const { session } = useAuth();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background text-on-surface">
      <main className="flex-1 pb-28 pt-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-end justify-around border-t border-line bg-surface/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `tap px-2 text-xs font-semibold ${link.to === '/fuel' ? '-mt-3 rounded-full bg-primary px-4 text-white' : isActive ? 'text-primary' : 'text-neutral'}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      {!session ? <p className="sr-only">Browsing as a guest</p> : null}
    </div>
  );
}

export function Frame({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  const navigate = useNavigate();
  return (
    <section className="mx-auto max-w-md space-y-4 px-4">
      <header className="flex items-center justify-between gap-3">
        <button type="button" className="tap text-sm text-primary" onClick={() => navigate(-1)}>Back</button>
        <h1 className="text-xl font-bold">{title}</h1>
        <span className="w-10" />
      </header>
      {children}
      {action ? (
        <button type="button" className="tap w-full rounded-xl bg-primary px-4 font-bold text-white" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </section>
  );
}

export function Notice({ kind, text }: { kind: 'loading' | 'empty' | 'error'; text: string }) {
  return <p role={kind === 'error' ? 'alert' : 'status'} className="rounded-xl bg-surface p-4 text-sm ring-1 ring-line">{text}</p>;
}
