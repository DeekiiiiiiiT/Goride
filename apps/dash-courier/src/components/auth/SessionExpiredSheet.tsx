import { MaterialIcon } from '@/components/icons/MaterialIcon';

type SessionExpiredSheetProps = {
  onSignIn: () => void;
};

export function SessionExpiredSheet({ onSignIn }: SessionExpiredSheetProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 safe-x safe-b">
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error-container">
          <MaterialIcon name="lock_clock" className="text-2xl text-on-error-container" />
        </div>
        <h2 className="text-headline-sm font-bold text-on-surface">Session expired</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          For your security, please sign in again. Your location and delivery updates were paused.
        </p>
        <button
          type="button"
          onClick={onSignIn}
          className="mt-6 w-full rounded-full bg-primary py-3 text-label-lg font-semibold text-on-primary active:scale-[0.98]"
        >
          Sign in again
        </button>
      </div>
    </div>
  );
}
