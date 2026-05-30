import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, LayoutGrid, User } from 'lucide-react';

const NAV_ACTIVE = '#004ac6';
const NAV_INACTIVE = '#505f76';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/services', label: 'Services', icon: LayoutGrid, end: false },
  { to: '/account', label: 'Account', icon: User, end: false },
] as const;

export function PassengerBottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-[4.5rem] items-center justify-around rounded-t-xl border-t border-[#c3c6d7]/30 bg-white pb-safe shadow-[0px_-4px_20px_rgba(0,0,0,0.05)] safe-b safe-x"
      aria-label="Main"
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-around">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex min-w-[4.5rem] flex-col items-center gap-1 px-3 py-2 touch-manipulation"
          >
            {({ isActive }) => (
              <>
                <Icon
                  className="h-5 w-5"
                  strokeWidth={2}
                  fill={isActive && to === '/account' ? NAV_ACTIVE : 'none'}
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
