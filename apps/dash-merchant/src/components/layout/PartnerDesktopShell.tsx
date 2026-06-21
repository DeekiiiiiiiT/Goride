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
  isAcceptingOrders: boolean;
  onToggleAcceptingOrders: (next: boolean) => void;
  togglePending?: boolean;
  notificationCount?: number;
  headerVariant?: 'merchant' | 'brand';
  toggleLabel?: string;
  showRestaurantInfo?: boolean;
  children: ReactNode;
}

export default function PartnerDesktopShell({
  merchant,
  activeNavKey,
  onNavigate,
  onHistory,
  onSupport,
  onGoOffline,
  onSettings,
  isAcceptingOrders,
  onToggleAcceptingOrders,
  togglePending,
  notificationCount,
  headerVariant = 'merchant',
  toggleLabel,
  showRestaurantInfo = false,
  children,
}: PartnerDesktopShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-on-background">
      <PartnerTopBar
        merchant={merchant}
        variant={headerVariant}
        isAcceptingOrders={isAcceptingOrders}
        onToggleAcceptingOrders={onToggleAcceptingOrders}
        toggleLabel={toggleLabel}
        togglePending={togglePending}
        notificationCount={notificationCount}
        onSettings={onSettings}
      />
      <div className="flex flex-1 overflow-hidden">
        <PartnerSideNav
          merchant={merchant}
          activeKey={activeNavKey}
          onNavigate={onNavigate}
          onHistory={onHistory}
          onSupport={onSupport}
          onGoOffline={onGoOffline}
          showRestaurantInfo={showRestaurantInfo}
        />
        {children}
      </div>
    </div>
  );
}
