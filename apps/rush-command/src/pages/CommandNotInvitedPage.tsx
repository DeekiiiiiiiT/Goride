import { MaterialIcon } from '../signup/components/MaterialIcon';

interface CommandNotInvitedPageProps {
  onSignOut: () => void;
}

export default function CommandNotInvitedPage({ onSignOut }: CommandNotInvitedPageProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-margin-mobile py-inset-xl text-center">
      <div className="mb-inset-md flex h-16 w-16 items-center justify-center rounded-full bg-primary-container/20">
        <MaterialIcon name="lock" className="text-3xl text-primary" />
      </div>
      <h1 className="text-headline-md font-bold text-on-surface">Roam Command is invite-only</h1>
      <p className="mt-inset-sm max-w-md text-body-md text-on-surface-variant">
        Your store is on Roam Rush for delivery orders. In-store operations (POS, inventory, staff
        stations) are enabled by Roam when you are invited. Contact Roam support if you think this is
        a mistake.
      </p>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-inset-lg rounded-lg bg-primary px-inset-lg py-3 text-label-lg font-semibold text-on-primary"
      >
        Sign out
      </button>
    </div>
  );
}
