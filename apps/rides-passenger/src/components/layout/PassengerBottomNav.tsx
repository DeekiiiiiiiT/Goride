import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { History, Home, LayoutGrid, User } from 'lucide-react';
import { ACTIVITY_TAB_ENABLED } from '@/lib/activityTabFlags';

const NAV_ACTIVE = 'var(--home-nav-active, #006d43)';
const NAV_INACTIVE = 'var(--home-nav-inactive, #5d5e61)';

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/services', label: 'Services', icon: LayoutGrid, end: false },
  { to: '/account', label: 'Account', icon: User, end: false },
] as const;

export function PassengerBottomNav() {
  const navItems = useMemo(() => {
    if (!ACTIVITY_TAB_ENABLED) return [...BASE_NAV_ITEMS];
    return [
      BASE_NAV_ITEMS[0],
      BASE_NAV_ITEMS[1],
      { to: '/activity', label: 'Activity', icon: History, end: false },
      BASE_NAV_ITEMS[2],
    ];
  }, []);

  const compactNav = navItems.length > 3;

  return (
    <nav
      className="home-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t safe-x shadow-[0px_-4px_20px_rgba(0,0,0,0.08)]"
      style={{
        backgroundColor: 'var(--home-nav-safe-area-bg, #e8eaed)',
        borderColor: 'var(--home-sheet-border, rgba(188, 202, 190, 0.35))',
      }}
      aria-label="Main"
    >
      <div
        className="mx-auto flex h-[4.5rem] w-full max-w-xl items-center justify-around border-b"
        style={{
          backgroundColor: 'var(--home-sheet-bg, #ffffff)',
          borderColor: 'var(--home-sheet-border, rgba(188, 202, 190, 0.35))',
        }}
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={`flex ${compactNav ? 'min-w-[4rem] px-2' : 'min-w-[4.5rem] px-3'} flex-col items-center justify-center gap-0.5 py-1 touch-manipulation`}
          >
            {({ isActive }) => (
              <span
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 transition-colors ${isActive ? 'bg-[color-mix(in_srgb,var(--home-nav-active)_10%,transparent)]' : ''}`}
              >
                <Icon
                  className="h-5 w-5"
                  strokeWidth={2}
                  fill={isActive ? NAV_ACTIVE : 'none'}
                  style={{ color: isActive ? NAV_ACTIVE : NAV_INACTIVE }}
                  aria-hidden
                />
                <span
                  className={`mt-0.5 font-bold tracking-wide ${compactNav ? 'text-[9px]' : 'text-[10px]'}`}
                  style={{ color: isActive ? NAV_ACTIVE : NAV_INACTIVE }}
                >
                  {label}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <div
        className="w-full"
        style={{ height: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        aria-hidden
      />
    </nav>
  );
}
