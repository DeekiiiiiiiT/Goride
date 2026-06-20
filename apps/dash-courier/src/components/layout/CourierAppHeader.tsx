import React from 'react';

import { MaterialIcon } from '@/components/icons/MaterialIcon';



type CourierAppHeaderProps = {

  statusLabel?: string;

  statusTone?: 'offline' | 'online' | 'connecting';

  onMenuClick?: () => void;

  hideStatus?: boolean;

};



export function CourierAppHeader({

  statusLabel = 'Offline',

  statusTone = 'offline',

  onMenuClick,

  hideStatus = false,

}: CourierAppHeaderProps) {

  if (hideStatus) return null;



  const isOnline = statusTone === 'online' || statusTone === 'connecting';



  return (

    <header className="fixed top-0 left-0 right-0 w-full bg-surface shadow-sm z-50 flex justify-between items-center px-[var(--spacing-edge)] h-14 safe-t pt-safe">

      <button

        type="button"

        onClick={onMenuClick}

        aria-label="Menu"

        className="flex items-center p-2 rounded-full hover:bg-surface-container-high transition-colors active:scale-95 text-primary"

      >

        <MaterialIcon name="menu" />

      </button>

      <div className="text-xl font-bold text-primary">Roam Dash Courier</div>



      {isOnline ? (

        <div className="flex items-center gap-2 bg-surface-container-low px-2 py-1 rounded-full border border-outline-variant">

          <div className="relative flex items-center justify-center w-4 h-4">

            <div className="absolute inset-0 bg-success rounded-full courier-status-pulse" />

            <div className="relative w-2 h-2 bg-success rounded-full" />

          </div>

          <span className="text-xs font-semibold uppercase tracking-wide text-on-surface">

            {statusLabel}

          </span>

          <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-variant flex items-center justify-center">

            <img

              src="/images/courier-avatar.png"

              alt=""

              className="w-full h-full object-cover"

              onError={(e) => {

                (e.target as HTMLImageElement).style.display = 'none';

              }}

            />

            <MaterialIcon name="person" className="text-muted text-base absolute" />

          </div>

        </div>

      ) : (

        <div className="text-xs font-semibold uppercase tracking-wide text-muted px-3 py-1.5">

          {statusLabel}

        </div>

      )}

    </header>

  );

}

