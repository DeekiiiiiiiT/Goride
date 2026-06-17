import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { formatMoneyMinor } from '@roam/types/rides';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { TripPaymentMethodBar } from '@/components/TripPaymentMethodBar';
import { TripPaymentMethodSheet } from '@/components/TripPaymentMethodSheet';
import { HaulageFreightCart } from '@/components/haulage/HaulageFreightCart';
import { HaulagePrimaryButton } from '@/components/haulage/HaulageShell';
import { useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { useDefaultPaymentMethod } from '@/hooks/useDefaultPaymentMethod';
import { estimateHaulageTotalMinor } from '@/lib/haulage/pricing';
import { submitHaulageBooking } from '@/services/haulageEdge';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export function HaulagePaymentStep() {
  const { t } = useTranslation('haulage');
  const navigate = useNavigate();
  const { draft, setPaymentMethodId } = useHaulageBooking();
  const {
    selectedId: selectedPaymentId,
    selectedMethod: selectedPayment,
    select: setSelectedPaymentId,
  } = useDefaultPaymentMethod();
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selectedPaymentId) {
      setPaymentMethodId(selectedPaymentId);
    }
  }, [selectedPaymentId, setPaymentMethodId]);

  const { totalMinor } = useMemo(
    () => estimateHaulageTotalMinor(draft.items, draft.pickup, draft.dropoff),
    [draft.items, draft.pickup, draft.dropoff],
  );

  const fareLabel = formatMoneyMinor(totalMinor, 'USD');

  const handlePaymentSelect = (id: string) => {
    setSelectedPaymentId(id);
    setPaymentMethodId(id);
    setPaymentSheetOpen(false);
  };

  const handleSubmit = async () => {
    if (!selectedPaymentId || !draft.pickup || !draft.dropoff || draft.items.length === 0) {
      toast.error(t('payment.incomplete'));
      return;
    }
    setSubmitting(true);
    try {
      const confirmation = await submitHaulageBooking({
        ...draft,
        paymentMethodId: selectedPaymentId,
      });
      navigate('/services/haulage/confirmed', { state: { confirmation } });
    } catch {
      toast.error(t('payment.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
          {t('payment.heading')}
        </h2>
        <p className="mt-2 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          {t('payment.subheading')}
        </p>
      </div>

      <section
        className="rounded-xl border p-4"
        style={{ borderColor: OUTLINE_VARIANT, backgroundColor: SURFACE_LOWEST }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>
          {t('payment.total')}
        </p>
        <p className="text-3xl font-bold" style={{ color: ON_SURFACE }}>
          {fareLabel}
        </p>
      </section>

      <HaulageFreightCart items={draft.items} readOnly />

      {selectedPayment ? (
        <TripPaymentMethodBar
          method={selectedPayment}
          onPress={() => setPaymentSheetOpen(true)}
        />
      ) : null}

      <HaulagePrimaryButton onClick={handleSubmit} disabled={submitting || !selectedPaymentId}>
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {t('payment.confirm')}
      </HaulagePrimaryButton>

      <TripPaymentMethodSheet
        open={paymentSheetOpen}
        selectedId={selectedPaymentId}
        onClose={() => setPaymentSheetOpen(false)}
        onSelect={handlePaymentSelect}
      />
    </div>
  );
}
