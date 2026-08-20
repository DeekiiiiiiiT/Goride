import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface PosSetupPendingViewProps {
  storeName: string;
  onUnpair: () => void;
}

export default function PosSetupPendingView({ storeName, onUnpair }: PosSetupPendingViewProps) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-margin-mobile py-inset-xl text-center">
      <div className="mb-inset-lg flex h-20 w-20 items-center justify-center rounded-full bg-warning-container/30">
        <MaterialIcon name="point_of_sale" size={40} className="text-warning" />
      </div>
      <h1 className="text-headline-md font-bold text-on-background">POS isn&apos;t ready yet</h1>
      <p className="mt-inset-sm max-w-md text-body-lg text-on-surface-variant">
        <span className="font-semibold text-on-background">{storeName}</span> connected successfully,
        but the owner hasn&apos;t turned on in-store POS yet.
      </p>
      <p className="mt-inset-md max-w-md text-body-sm text-on-surface-variant">
        Ask them to enable <span className="font-medium text-on-background">Restaurant Management</span>{' '}
        in Account settings. This tablet will work once that&apos;s done.
      </p>
      <button
        type="button"
        onClick={onUnpair}
        className="mt-inset-xl text-label-md font-semibold text-on-surface-variant underline-offset-2 hover:underline"
      >
        Unpair this tablet
      </button>
    </div>
  );
}
