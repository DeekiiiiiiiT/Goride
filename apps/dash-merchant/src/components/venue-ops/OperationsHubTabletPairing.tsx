import { useQuery } from '@tanstack/react-query';
import { getStoreTabletPairing } from '../../lib/partner-api';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { JobStation } from '../../types/team';

function qrImageUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(link)}`;
}

interface OperationsHubTabletPairingProps {
  merchantId: string;
  enabledStations: JobStation[];
  onOpenDevices: () => void;
}

export default function OperationsHubTabletPairing({
  merchantId,
  enabledStations,
  onOpenDevices,
}: OperationsHubTabletPairingProps) {
  const pairingQuery = useQuery({
    queryKey: ['store-tablet-pairing', merchantId],
    queryFn: getStoreTabletPairing,
  });

  if (pairingQuery.isLoading) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <p className="text-body-sm text-on-surface-variant">Loading pairing info…</p>
      </section>
    );
  }

  if (pairingQuery.isError || !pairingQuery.data) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
        <p className="text-body-sm text-on-surface-variant">
          Turn on staff stations and tablet PIN in Team Members → Devices to pair tablets.
        </p>
        <button
          type="button"
          onClick={onOpenDevices}
          className="mt-inset-sm text-label-md font-semibold text-primary-container"
        >
          Open Devices
        </button>
      </section>
    );
  }

  const { pairingCode, storeName, stationLinks } = pairingQuery.data;
  const enabledSet = new Set(enabledStations);
  const visibleLinks = Object.entries(stationLinks).filter(
    ([station]) => enabledSet.has(station as JobStation),
  );
  const tabletEntryUrl =
    visibleLinks[0]?.[1] ??
    `${window.location.origin}/tablet?code=${encodeURIComponent(pairingCode)}`;

  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-inset-sm">
        <div>
          <h2 className="text-title-md font-semibold text-on-background">Pair a new tablet</h2>
          <p className="mt-inset-xs text-body-sm text-on-surface-variant">
            Scan from the Roam Dash Tablet App to connect a device to {storeName}.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenDevices}
          className="text-label-md font-semibold text-primary-container"
        >
          All devices
        </button>
      </div>

      <div className="flex flex-col items-center gap-inset-md rounded-lg border border-outline-variant bg-surface p-inset-md sm:flex-row sm:items-start">
        <img
          src={qrImageUrl(tabletEntryUrl)}
          alt="QR code to pair a store tablet"
          className="h-40 w-40 rounded-md border border-outline-variant bg-white"
        />
        <div className="min-w-0 flex-1 space-y-inset-sm text-center sm:text-left">
          <div>
            <p className="text-label-md text-on-surface-variant">Store pairing code</p>
            <p className="font-mono text-headline-md font-bold tracking-widest text-on-background">
              {pairingCode}
            </p>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Code refreshes when you regenerate it in Devices. Each enabled station also has its own
            QR link.
          </p>
        </div>
      </div>
    </section>
  );
}
