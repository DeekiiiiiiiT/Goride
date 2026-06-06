import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LayoutGrid, User } from 'lucide-react';

const NAV_ACTIVE = 'var(--home-nav-active, #006d43)';
const NAV_INACTIVE = 'var(--home-nav-inactive, #5d5e61)';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/services', label: 'Services', icon: LayoutGrid, end: false },
  { to: '/account', label: 'Account', icon: User, end: false },
] as const;

export function PassengerBottomNav() {
  return (
    <nav
      className="home-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t safe-b safe-x shadow-[0px_-4px_20px_rgba(0,0,0,0.08)]"
      style={{
        backgroundColor: 'var(--home-sheet-bg, #ffffff)',
        borderColor: 'var(--home-sheet-border, rgba(188, 202, 190, 0.35))',
      }}
      aria-label="Main"
    >
      <div className="mx-auto flex h-[4.5rem] w-full max-w-xl items-center justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex min-w-[4.5rem] flex-col items-center justify-center gap-0.5 px-3 py-1 touch-manipulation"
          >
            {({ isActive }) => (
              <>
                <Icon
                  className="h-5 w-5"
                  strokeWidth={2}
                  fill={isActive ? NAV_ACTIVE : 'none'}
                  style={{ color: isActive ? NAV_ACTIVE : NAV_INACTIVE }}
                  aria-hidden
                />
                <span
                  className="mt-0.5 text-[10px] font-bold tracking-wide"
                  style={{ color: isActive ? NAV_ACTIVE : NAV_INACTIVE }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
