import { ReactNode } from 'react';
import { Merchant } from '../../hooks/useMerchant';
import { PartnerSideNavKey } from '../../lib/partner-nav';
import { PartnerTab } from '../../lib/partner-utils';
import PartnerSideNav from './PartnerSideNav';
import PartnerTopBar from './PartnerTopBar';

interface PartnerDesktopShellProps {
  merchant: Merchant;
  activeNavKey: PartnerSideNavKey;
  onNavigate: (tab: PartnerTab) => void;
  onHistory?: () => void;
  onSupport?: () => void;
  onGoOffline?: () => void;
  onSettings?: () => void;
  onNotifications?: () => void;
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: (next: boolean) => void;
  togglePending?: boolean;
  notificationCount?: number;
  headerVariant?: 'merchant' | 'brand';
  toggleLabel?: string;
  showRestaurantInfo?: boolean;
  /** When set, only these side-nav keys (plus history/support) are shown. */
  allowedTabs?: PartnerTab[];
  children: ReactNode;
}

/**
 * App-level chrome: TopBar + SideNav only at lg+.
 * Children always render (single React tree for mobile + desktop content).
 */
export default function PartnerDesktopShell({
  merchant,
  activeNavKey,
  onNavigate,
  onHistory,
  onSupport,
  onGoOffline,
  onSettings,
  onNotifications,
  isAcceptingOrders,
  onToggleAcceptingOrders,
  togglePending,
  notificationCount,
  headerVariant = 'merchant',
  toggleLabel,
  showRestaurantInfo = false,
  allowedTabs,
  children,
}: PartnerDesktopShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background lg:h-dvh lg:overflow-hidden">
      <div className="hidden shrink-0 lg:block">
        <PartnerTopBar
          merchant={merchant}
          variant={headerVariant}
          isAcceptingOrders={isAcceptingOrders}
          onToggleAcceptingOrders={onToggleAcceptingOrders}
          toggleLabel={toggleLabel}
          togglePending={togglePending}
          notificationCount={notificationCount}
          onSettings={onSettings}
          onNotifications={onNotifications ?? (() => onNavigate('orders'))}
          onAccount={onSettings}
        />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full shrink-0 lg:flex">
          <PartnerSideNav
            merchant={merchant}
            activeKey={activeNavKey}
            onNavigate={onNavigate}
            onHistory={onHistory}
            onSupport={onSupport}
            onGoOffline={onGoOffline}
            showRestaurantInfo={showRestaurantInfo}
            allowedTabs={allowedTabs}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto lg:overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
