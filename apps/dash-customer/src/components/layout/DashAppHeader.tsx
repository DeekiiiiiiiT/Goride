import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type DashAppHeaderProps = {
  onMenuClick?: () => void;
  onProfileClick?: () => void;
  showProfileImage?: boolean;
};

export function DashAppHeader({
  onMenuClick,
  onProfileClick,
  showProfileImage = true,
}: DashAppHeaderProps) {
  return (
    <header className="bg-surface shadow-sm sticky top-0 flex justify-between items-center safe-x h-16 w-full z-40 safe-t btn-touch">
      <button
        type="button"
        aria-label="Menu"
        onClick={onMenuClick}
        className="btn-touch min-w-11 px-2 hover:opacity-80 transition-opacity active:scale-95"
      >
        <MaterialIcon name="menu" className="text-primary text-2xl" />
      </button>
      <h1 className="text-2xl font-bold text-primary tracking-tight">Roam Dash</h1>
      <button
        type="button"
        aria-label="Account"
        onClick={onProfileClick}
        className="btn-touch min-w-11 min-h-11 hover:opacity-80 transition-opacity active:scale-95 rounded-full overflow-hidden w-10 h-10 bg-surface-container-high border border-outline-variant flex items-center justify-center"
      >
        {showProfileImage ? (
          <img alt="Profile" className="w-full h-full object-cover" src="/images/avatar.png" />
        ) : (
          <MaterialIcon name="person" className="text-on-surface-variant" filled />
        )}
      </button>
    </header>
  );
}
