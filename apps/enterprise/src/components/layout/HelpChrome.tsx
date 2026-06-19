import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, Home, Search, Ticket, User } from 'lucide-react';

/** Context bar below the global site header on the Help Center page. */
export function HelpSubHeader() {
  const navigate = useNavigate();

  return (
    <div className="sticky top-[57px] z-40 flex h-14 items-center justify-between border-b border-outline-variant bg-surface-bright px-[var(--spacing-margin-mobile)] shadow-sm md:top-[65px] md:px-[var(--spacing-margin-desktop)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full p-2 transition-colors hover:bg-surface-container active:scale-95"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-primary" aria-hidden />
        </button>
        <h1 className="text-xl font-bold text-primary md:text-2xl">Help Center</h1>
      </div>
      <button
        type="button"
        onClick={() => document.getElementById('help-search')?.focus()}
        className="rounded-full p-2 transition-colors hover:bg-surface-container active:scale-95"
        aria-label="Focus search"
      >
        <Search className="h-5 w-5 text-primary" aria-hidden />
      </button>
    </div>
  );
}

export function HelpBottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant bg-surface-container-lowest px-4 py-2 shadow-lg md:hidden"
      aria-label="Help quick navigation"
    >
      <Link
        to="/"
        className="flex flex-col items-center gap-0.5 text-on-surface-variant transition-colors hover:text-primary"
      >
        <Home className="h-5 w-5" aria-hidden />
        <span className="text-xs">Home</span>
      </Link>
      <Link
        to="/help"
        className="flex flex-col items-center gap-0.5 rounded-full bg-secondary-container px-4 py-1 text-on-secondary-container"
      >
        <HelpCircle className="h-5 w-5" aria-hidden />
        <span className="text-xs font-medium">Support</span>
      </Link>
      <a
        href="mailto:support@roamenterprise.co?subject=Support%20Ticket"
        className="flex flex-col items-center gap-0.5 text-on-surface-variant transition-colors hover:text-primary"
      >
        <Ticket className="h-5 w-5" aria-hidden />
        <span className="text-xs">Tickets</span>
      </a>
      <Link
        to="/about"
        className="flex flex-col items-center gap-0.5 text-on-surface-variant transition-colors hover:text-primary"
      >
        <User className="h-5 w-5" aria-hidden />
        <span className="text-xs">Profile</span>
      </Link>
    </nav>
  );
}
