import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface MenuPageHeaderProps {
  merchant: Merchant;
  onOpenNav?: () => void;
}

export default function MenuPageHeader({ merchant, onOpenNav }: MenuPageHeaderProps) {
  return (
    <header className="safe-t sticky top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md md:px-margin-tablet lg:h-16">
      <div className="flex min-w-0 items-center gap-inset-sm">
        {onOpenNav && (
          <button
            type="button"
            onClick={onOpenNav}
            className="btn-touch -ml-1 flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high active:scale-95 lg:hidden"
            aria-label="Open navigation"
          >
            <MaterialIcon name="menu" size={24} />
          </button>
        )}
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
