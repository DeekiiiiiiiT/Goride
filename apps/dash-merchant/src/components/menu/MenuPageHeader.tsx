import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface MenuPageHeaderProps {
  merchant: Merchant;
}

export default function MenuPageHeader({ merchant }: MenuPageHeaderProps) {
  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet">
      <div className="flex items-center gap-inset-sm">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container">
          {merchant.logo_url ? (
            <img src={merchant.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <MaterialIcon name="restaurant" className="text-primary" />
          )}
        </div>
        <h1 className="text-headline-md font-bold tracking-tight text-primary md:text-headline-md">
          Roam Dash
        </h1>
      </div>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container-high active:scale-95"
        aria-label="Notifications"
      >
        <MaterialIcon name="notifications" />
      </button>
    </header>
  );
}
