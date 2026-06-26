import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface AuthEntryPageProps {
  onOwnerSignIn: () => void;
  onStoreTablet: () => void;
}

export default function AuthEntryPage({ onOwnerSignIn, onStoreTablet }: AuthEntryPageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface text-on-surface">
      <main className="flex w-full max-w-[600px] flex-col items-center px-margin-mobile py-inset-xl text-center md:px-margin-tablet">
        <div className="mb-inset-lg flex h-20 w-20 items-center justify-center rounded-full bg-primary-container">
          <MaterialIcon name="storefront" size={40} className="text-on-primary-container" />
        </div>

        <div className="mb-inset-xl flex flex-col gap-inset-sm">
          <h1 className="text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
            Roam Dash Partner
          </h1>
          <p className="mx-auto max-w-sm text-body-lg text-on-surface-variant">
            Sign in to manage your store, or set up a floor tablet for your team.
          </p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-inset-md">
          <button
            type="button"
            onClick={onOwnerSignIn}
            className="flex h-inset-xl w-full items-center justify-center gap-inset-xs rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
          >
            <MaterialIcon name="person" size={22} />
            Owner sign in
          </button>
          <button
            type="button"
            onClick={onStoreTablet}
            className="flex h-inset-xl w-full items-center justify-center gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest text-label-md font-semibold text-on-background transition-all hover:bg-surface-variant active:scale-[0.98]"
          >
            <MaterialIcon name="tablet" size={22} />
            Store tablet
          </button>
        </div>
      </main>
    </div>
  );
}
