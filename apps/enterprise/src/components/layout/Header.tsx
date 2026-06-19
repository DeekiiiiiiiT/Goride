import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { RoamLogo } from '@/components/icons/SiteIcons';
import { MobileNav } from '@/components/layout/MobileNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { DEFAULT_CTA, MAIN_NAV, SECONDARY_NAV } from '@/lib/navContent';

export type HeaderProps = {
  cta?: {
    label: string;
    href: string;
    external?: boolean;
  };
};

function NavLinkItem({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const location = useLocation();
  const isActive = !external && location.pathname === href;
  const className = `text-sm font-medium transition-colors ${
    isActive
      ? 'text-rides-blue'
      : 'text-on-surface-variant hover:text-on-surface dark:hover:text-white'
  }`;

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  );
}

export function Header({ cta = DEFAULT_CTA }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const ctaClass =
    'hidden rounded-xl bg-fleet-slate px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-fleet-slate/90 active:scale-95 sm:inline-flex';

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-fleet-slate focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header
        className={`sticky top-0 z-50 w-full border-b border-outline-variant/80 bg-surface-container-lowest/95 backdrop-blur-md transition-shadow duration-300 dark:bg-surface/95 ${
          scrolled ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="mx-auto flex max-w-[var(--spacing-container-max)] items-center justify-between gap-4 px-[var(--spacing-margin-mobile)] py-3 md:px-[var(--spacing-margin-desktop)] md:py-4">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <RoamLogo className="h-8 w-8 text-fleet-slate dark:text-white" />
            <span className="text-lg font-bold text-fleet-slate dark:text-white md:text-xl">
              Roam Enterprise
            </span>
          </Link>

          <nav
            className="hidden items-center gap-5 lg:flex xl:gap-6"
            aria-label="Main navigation"
          >
            {MAIN_NAV.map((link) => (
              <NavLinkItem key={link.href} {...link} />
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex lg:gap-5">
            <nav className="hidden items-center gap-4 border-l border-outline-variant/50 pl-5 lg:flex" aria-label="Secondary">
              {SECONDARY_NAV.map((link) => (
                <NavLinkItem key={link.href} {...link} />
              ))}
            </nav>
            <ThemeToggle className="hidden sm:flex" />
            {cta.external ? (
              <a href={cta.href} target="_blank" rel="noopener noreferrer" className={ctaClass}>
                {cta.label}
              </a>
            ) : (
              <Link to={cta.href} className={ctaClass}>
                {cta.label}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-6 w-6" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} cta={cta} />
    </>
  );
}
