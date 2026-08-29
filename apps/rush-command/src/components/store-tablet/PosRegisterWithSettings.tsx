/**
 * Tablet POS entry — loads GCT settings before register so we never default tax to 0%.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Merchant } from '../../hooks/useMerchant';
import { fetchSettings } from '../../lib/restaurant-mgmt-api';
import { hasCapability, CAPABILITY_IN_STORE } from '../../lib/merchant-capabilities';
import PosRegisterPage from '../../pages/restaurant-mgmt/PosRegisterPage';

type Props = {
  merchant: Merchant;
  storeName?: string;
  staffName?: string;
  onUnpair?: () => void;
  onEndShift?: () => void;
};

export default function PosRegisterWithSettings({
  merchant,
  storeName,
  staffName,
  onUnpair,
  onEndShift,
}: Props) {
  const useApi = hasCapability(merchant, CAPABILITY_IN_STORE);
  const [taxRatePercent, setTaxRatePercent] = useState<number | undefined>(undefined);
  const [gctRegistered, setGctRegistered] = useState<boolean | undefined>(undefined);
  const [loading, setLoading] = useState(useApi);

  useEffect(() => {
    if (!useApi) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sett = await fetchSettings();
        if (cancelled) return;
        setTaxRatePercent(sett.taxRatePercent);
        setGctRegistered(sett.gctRegistered);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Failed to load GCT settings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useApi, merchant.id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading POS settings…
      </div>
    );
  }

  return (
    <PosRegisterPage
      merchant={merchant}
      useApi={useApi}
      taxRatePercent={taxRatePercent}
      gctRegistered={gctRegistered}
      storeName={storeName}
      staffName={staffName}
      onUnpair={onUnpair}
      onEndShift={onEndShift}
    />
  );
}
