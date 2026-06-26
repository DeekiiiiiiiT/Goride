import { useState } from 'react';
import { JOB_STATION_OPTIONS, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export interface StoreTabletPairingData {
  storeName: string;
  pairingCode: string;
  stationLinks: Record<JobStation, string>;
  staffOperationsEnabled: boolean;
  staffStationPinEnabled: boolean;
}

interface StoreTabletSettingsPanelProps {
  data: StoreTabletPairingData;
  onRegenerate?: () => void;
  onToggleStaffOps?: (enabled: boolean) => void;
  onToggleStaffPin?: (enabled: boolean) => void;
  isRegenerating?: boolean;
}

function qrImageUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link)}`;
}

export default function StoreTabletSettingsPanel({
  data,
  onRegenerate,
  onToggleStaffOps,
  onToggleStaffPin,
  isRegenerating = false,
}: StoreTabletSettingsPanelProps) {
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRegenerate = () => {
    if (!confirmRegenerate) {
      setConfirmRegenerate(true);
      return;
    }
    onRegenerate?.();
    setConfirmRegenerate(false);
  };

  return (
    <section className="space-y-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <div>
        <h2 className="text-headline-md font-bold text-on-background">Store tablets</h2>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">
          Pair kitchen, counter, and manager iPads without logging in as the owner.
        </p>
      </div>

      <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-inset-md">
        <div>
          <p className="text-body-sm font-semibold text-on-background">Enable staff stations</p>
          <p className="text-label-sm text-on-surface-variant">Dedicated counter and kitchen views</p>
        </div>
        <input
          type="checkbox"
          checked={data.staffOperationsEnabled}
          onChange={(event) => onToggleStaffOps?.(event.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-inset-md border-t border-outline-variant pt-inset-md">
        <div>
          <p className="text-body-sm font-semibold text-on-background">Tablet PIN sign-in</p>
          <p className="text-label-sm text-on-surface-variant">Required for store tablet pairing</p>
        </div>
        <input
          type="checkbox"
          checked={data.staffStationPinEnabled}
          onChange={(event) => onToggleStaffPin?.(event.target.checked)}
          className="h-5 w-5"
        />
      </label>

      <div className="rounded-lg border border-outline-variant bg-surface p-inset-md">
        <p className="text-label-md text-on-surface-variant">Store pairing code</p>
        <p className="mt-inset-xs font-mono text-headline-md font-bold tracking-widest text-on-background">
          {data.pairingCode}
        </p>
        <div className="mt-inset-md flex flex-wrap gap-inset-sm">
          <button
            type="button"
            onClick={() => void copyText('code', data.pairingCode)}
            className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-sm"
          >
            <MaterialIcon name="content_copy" size={16} />
            {copiedKey === 'code' ? 'Copied' : 'Copy code'}
          </button>
          <button
            type="button"
            disabled={isRegenerating}
            onClick={handleRegenerate}
            className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-sm text-error"
          >
            <MaterialIcon name="refresh" size={16} />
            {confirmRegenerate ? 'Confirm regenerate' : 'Regenerate code'}
          </button>
        </div>
        {confirmRegenerate && (
          <p className="mt-inset-sm text-body-sm text-on-surface-variant">
            This disconnects all paired tablets. They will need the new code.
          </p>
        )}
      </div>

      <div className="space-y-inset-md">
        <p className="text-label-md font-semibold text-on-background">Station links &amp; QR codes</p>
        <p className="text-body-sm text-on-surface-variant">
          Bookmark or scan on each iPad for {data.storeName}.
        </p>
        <div className="grid gap-inset-md md:grid-cols-3">
          {JOB_STATION_OPTIONS.map((option) => {
            const link = data.stationLinks[option.value];
            const copyKey = `link-${option.value}`;
            return (
              <div
                key={option.value}
                className="flex flex-col items-center gap-inset-sm rounded-lg border border-outline-variant p-inset-md text-center"
              >
                <img
                  src={qrImageUrl(link)}
                  alt={`QR code for ${option.label} tablet`}
                  className="h-[120px] w-[120px] rounded-md border border-outline-variant bg-white"
                />
                <p className="text-body-sm font-semibold text-on-background">{option.label}</p>
                <button
                  type="button"
                  onClick={() => void copyText(copyKey, link)}
                  className="text-label-sm text-primary"
                >
                  {copiedKey === copyKey ? 'Copied' : 'Copy link'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
