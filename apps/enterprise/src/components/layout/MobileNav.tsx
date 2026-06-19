import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  DEFAULT_CTA,
  FOOTER_LEGAL,
  MAIN_NAV,
  SECONDARY_NAV,
  type NavLink,
} from '@/lib/navContent';
import { RoamLogo } from '@/components/icons/SiteIcons';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

type MobileNavProps = {
  open: boolean;
  onClose: () => void;
  cta?: { label: string; href: string; external?: boolean };
};

function NavItem({ link, onNavigate }: { link: NavLink; onNavigate: () => void }) {
  const location = useLocation();
  const isActive = !link.external && location.pathname === link.href;

  const className = `block rounded-lg px-4 py-3 text-base font-medium transition-colors ${
    isActive
      ? 'bg-surface-container-high text-on-surface'
      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
  }`;

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className} onClick={onNavigate}>
        {link.label}
      </a>
    );
  }

  return (
    <Link to={link.href} className={className} onClick={onNavigate}>
      {link.label}
    </Link>
  );
}

export function MobileNav({ open, onClose, cta = DEFAULT_CTA }: MobileNavProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('button, a')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const ctaProps = cta.external
    ? { href: cta.href, target: '_blank' as const, rel: 'noopener noreferrer' as const }
    : { to: cta.href };

  return (
    <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button
        type="button"
        className="absolute inset-0 bg-fleet-slate/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div
        ref={panelRef}
        className="absolute right-0 top-0 flex h-full w-[min(100%,320px)] flex-col bg-surface-container-lowest shadow-2xl dark:bg-surface"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-4">
          <Link to="/" className="flex items-center gap-2" onClick={onClose}>
            <RoamLogo className="h-7 w-7 text-fleet-slate dark:text-white" />
            <span className="text-lg font-bold text-fleet-slate dark:text-white">Roam</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile">
          <p className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Services
          </p>
          {MAIN_NAV.map((link) => (
            <NavItem key={link.href} link={link} onNavigate={onClose} />
          ))}

          <p className="mb-2 mt-6 px-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Support
          </p>
          {SECONDARY_NAV.map((link) => (
            <NavItem key={link.href} link={link} onNavigate={onClose} />
          ))}

          <p className="mb-2 mt-6 px-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Legal
          </p>
          {FOOTER_LEGAL.map((link) => (
            <NavItem key={link.href} link={link} onNavigate={onClose} />
          ))}
        </nav>

        <div className="border-t border-outline-variant p-4">
          {cta.external ? (
            <a
              {...ctaProps}
              className="block w-full rounded-xl bg-fleet-slate py-3.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              onClick={onClose}
            >
              {cta.label}
            </a>
          ) : (
            <Link
              to={cta.href}
              className="block w-full rounded-xl bg-fleet-slate py-3.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
              onClick={onClose}
            >
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
