import { Link } from 'react-router-dom';

type DoorKind = 'courier' | 'freight';

const brand: Record<
  DoorKind,
  { name: string; nav: { to: string; label: string }[]; accent: string; ink: string }
> = {
  courier: {
    name: 'Roam Courier',
    nav: [
      { to: '/how-it-works', label: 'How it works' },
      { to: '/connect', label: 'Connect warehouses' },
    ],
    accent: '#0045a5',
    ink: '#111c2d',
  },
  freight: {
    name: 'Roam Freight Forwarding',
    nav: [
      { to: '/how-it-works', label: 'Floor ops' },
      { to: '/partners', label: 'Partner couriers' },
    ],
    accent: '#0f172a',
    ink: '#0b1c30',
  },
};

export function DoorMarketingShell({
  door,
  children,
}: {
  door: DoorKind;
  children: React.ReactNode;
}) {
  const b = brand[door];
  const fontClass = door === 'courier' ? 'font-[family-name:var(--door-courier-sans)]' : '';

  return (
    <div
      className={`min-h-screen bg-white text-slate-900 ${fontClass}`}
      style={
        door === 'courier'
          ? ({
              ['--door-courier-display' as string]: "'Manrope', system-ui, sans-serif",
              ['--door-courier-sans' as string]: "'Work Sans', system-ui, sans-serif",
              ['--door-courier-mono' as string]: "'JetBrains Mono', ui-monospace, monospace",
            } as React.CSSProperties)
          : ({
              ['--door-freight-mono' as string]: "'JetBrains Mono', ui-monospace, monospace",
            } as React.CSSProperties)
      }
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Link
            to="/"
            className="text-base font-bold tracking-tight md:text-lg"
            style={{
              color: b.ink,
              fontFamily: door === 'courier' ? 'var(--door-courier-display)' : undefined,
            }}
          >
            {b.name}
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            {b.nav.map((item) => (
              <Link key={item.to} to={item.to} className="transition hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/login"
            className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: door === 'freight' ? '#f59e0b' : b.accent, color: door === 'freight' ? '#0f172a' : '#fff' }}
          >
            Sign in
            <span aria-hidden>→</span>
          </Link>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <p className="font-semibold" style={{ color: b.ink }}>
              {b.name}
            </p>
            <p className="mt-1 text-sm text-slate-500">© {new Date().getFullYear()} Roam. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <Link to="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-slate-900">
              Contact
            </Link>
            <Link to="/login" className="font-semibold hover:text-slate-900">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
