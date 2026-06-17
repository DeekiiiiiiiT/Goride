import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { History, Home, LayoutGrid, User } from 'lucide-react';
import { ACTIVITY_TAB_ENABLED } from '@/lib/activityTabFlags';

const NAV_ACTIVE = 'var(--home-nav-active, #00a86b)';
const NAV_INACTIVE = 'var(--home-nav-inactive, #9ca3af)';

const BASE_NAV_ITEMS = [
  { to: '/', labelKey: 'common:nav.home', icon: Home, end: true },
  { to: '/services', labelKey: 'common:nav.services', icon: LayoutGrid, end: false },
  { to: '/account', labelKey: 'common:nav.account', icon: User, end: false },
] as const;

export function PassengerBottomNav() {
  const { t } = useTranslation();
  const navItems = useMemo(() => {
    if (!ACTIVITY_TAB_ENABLED) return [...BASE_NAV_ITEMS];
    return [
      BASE_NAV_ITEMS[0],
      BASE_NAV_ITEMS[1],
      { to: '/activity', labelKey: 'common:nav.activity', icon: History, end: false },
      BASE_NAV_ITEMS[2],
    ];
  }, []);

  return (
    <nav
      className="home-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white safe-x dark:border-white/10 dark:bg-[#121413]"
      aria-label="Main"
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-6 pb-8 pt-3 sm:max-w-2xl">
        {navItems.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-col items-center space-y-1 touch-manipulation"
          >
            {({ isActive }) => (
              <>
                <div
                  className={`px-5 py-2 transition-colors ${
                    isActive
                      ? 'rounded-2xl bg-emerald-100 text-[color:var(--home-nav-active)] dark:bg-emerald-900/30'
                      : 'text-gray-400 dark:text-slate-500'
                  }`}
                >
                  <Icon
                    className="h-6 w-6"
                    strokeWidth={isActive ? 2.25 : 2}
                    fill={isActive ? NAV_ACTIVE : 'none'}
                    style={{ color: isActive ? NAV_ACTIVE : NAV_INACTIVE }}
                    aria-hidden
                  />
                </div>
                <span
                  className={`text-[11px] tracking-wide ${
                    isActive
                      ? 'font-extrabold text-[color:var(--home-nav-active)]'
                      : 'font-bold text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t(labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div
        className="w-full"
        style={{ height: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
        aria-hidden
      />
    </nav>
  );
}
