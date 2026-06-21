import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useAcceptingOrdersToggle } from '../../hooks/useAcceptingOrdersToggle';
import { getStoreStatus, PartnerTab } from '../../lib/partner-utils';
import { formatMemberSince } from '../../hooks/useMerchantSettings';
import SettingsMenuRow from './SettingsMenuRow';

export type AccountSection =
  | 'profile'
  | 'hours'
  | 'delivery'
  | 'bank'
  | 'team'
  | 'notifications'
  | 'help'
  | 'legal'
  | 'promotions';

interface AccountSettingsHubProps {
  merchant: Merchant;
  onNavigate: (page: PartnerTab) => void;
  onOpenSection: (section: AccountSection) => void;
  onSignOut: () => void;
  notificationCount?: number;
}

export default function AccountSettingsHub({
  merchant,
  onNavigate,
  onOpenSection,
  onSignOut,
  notificationCount = 0,
}: AccountSettingsHubProps) {
  const rating = merchant.rating > 0 ? merchant.rating.toFixed(1) : '4.8';
  const cuisineLabel = merchant.cuisine_type || 'Restaurant';
  const { isAcceptingOrders, toggleAcceptingOrders, isPending: togglePending } =
    useAcceptingOrdersToggle(merchant);
  const storeStatus = getStoreStatus(merchant.is_active, isAcceptingOrders);

  const handlePlaceholder = (label: string) => {
    toast.info(`${label} is coming soon`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface pt-16 text-on-surface antialiased">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile md:px-margin-tablet">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
        >
          <MaterialIcon name="storefront" />
        </button>
        <h1 className="flex-1 text-center text-headline-md font-bold text-primary">Roam Dash</h1>
        <button
          type="button"
          disabled={togglePending}
          onClick={() => toggleAcceptingOrders(!isAcceptingOrders)}
          className={`mr-1 flex h-8 items-center gap-1 rounded-full px-2 text-label-sm font-semibold ${
            storeStatus === 'open'
              ? 'bg-primary-container/15 text-primary-container'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              storeStatus === 'open' ? 'bg-primary-container' : 'bg-outline'
            }`}
          />
          {storeStatus === 'open' ? 'Open' : 'Paused'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="relative flex h-12 w-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
        >
          <MaterialIcon name="notifications" />
          {notificationCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
          )}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-inset-lg px-margin-mobile py-inset-md md:px-margin-tablet">
        <section className="flex flex-col items-center justify-center gap-inset-xs text-center">
          <div className="relative mb-inset-xs h-[120px] w-[120px] rounded-full border border-outline-variant bg-surface p-1 shadow-sm">
            {merchant.logo_url ? (
              <img
                src={merchant.logo_url}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-primary-container/20">
                <MaterialIcon name="storefront" className="text-4xl text-primary" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenSection('profile')}
              className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-md transition-transform active:scale-95"
              aria-label="Edit profile"
            >
              <MaterialIcon name="edit" className="text-[20px]" />
            </button>
          </div>
          <h2 className="text-headline-lg-mobile text-on-surface md:text-headline-lg">{merchant.name}</h2>
          <p className="flex items-center justify-center gap-1 text-body-sm text-on-surface-variant">
            {cuisineLabel}
            <span className="mx-1 h-1 w-1 rounded-full bg-outline-variant" />
            {formatMemberSince(merchant)}
          </p>
          <div className="mt-1 flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1">
            <MaterialIcon name="star" filled className="text-[18px] text-[#F59E0B]" />
            <span className="text-label-md text-on-surface">{rating} Rating</span>
          </div>
        </section>

        <section className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <SettingsMenuRow
            icon="storefront"
            label="Edit Profile"
            onClick={() => onOpenSection('profile')}
          />
          <SettingsMenuRow
            icon="schedule"
            label="Business Hours"
            onClick={() => onOpenSection('hours')}
          />
          <SettingsMenuRow
            icon="local_shipping"
            label="Delivery Settings"
            onClick={() => onOpenSection('delivery')}
          />
          <SettingsMenuRow
            icon="account_balance"
            label="Bank & Payouts"
            onClick={() => onNavigate('earnings')}
          />
          <SettingsMenuRow
            icon="people"
            label="Team Members"
            onClick={() => onOpenSection('team')}
          />
          <SettingsMenuRow
            icon="campaign"
            label="Promotions & Marketing"
            onClick={() => onOpenSection('promotions')}
          />
          <SettingsMenuRow
            icon="notifications"
            label="Notification Settings"
            onClick={() => onOpenSection('notifications')}
          />
        </section>

        <section className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <SettingsMenuRow
            icon="help"
            label="Help & Support"
            onClick={() => onOpenSection('help')}
          />
          <SettingsMenuRow
            icon="description"
            label="Legal & Terms"
            onClick={() => handlePlaceholder('Legal & Terms')}
          />
        </section>

        <button
          type="button"
          onClick={onSignOut}
          className="mb-inset-lg flex min-h-[64px] w-full items-center justify-center gap-inset-sm rounded-xl border border-error-container bg-surface-container-lowest p-4 text-error shadow-sm transition-all hover:bg-error-container active:scale-[0.98]"
        >
          <MaterialIcon name="logout" />
          <span className="text-body-lg font-semibold">Sign Out</span>
        </button>
      </main>
    </div>
  );
}
