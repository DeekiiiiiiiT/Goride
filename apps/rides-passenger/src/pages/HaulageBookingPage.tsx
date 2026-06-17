import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { HaulageCategoryStep } from '@/components/haulage/HaulageCategoryStep';
import { HaulageItemSelectStep } from '@/components/haulage/HaulageItemSelectStep';
import { HaulageItemSpecSheet } from '@/components/haulage/HaulageItemSpecSheet';
import { HaulageLocationsStep } from '@/components/haulage/HaulageLocationsStep';
import { HaulagePaymentStep } from '@/components/haulage/HaulagePaymentStep';
import { HaulageReviewStep } from '@/components/haulage/HaulageReviewStep';
import {
  HAULAGE_FOOTER_CLEARANCE,
  HaulagePrimaryButton,
  HaulageStepper,
  HaulageStickyFooter,
  HaulageSubheader,
} from '@/components/haulage/HaulageShell';
import { HaulageBookingProvider, useHaulageBooking } from '@/contexts/HaulageBookingContext';
import { PAGE_BG } from '@/lib/passengerTheme';

function HaulageBookingContent() {
  const { t } = useTranslation('haulage');
  const navigate = useNavigate();
  const { step, stepIndex, stepCount, goBack, goNext, canAdvanceFromStep } = useHaulageBooking();

  const handleBack = () => {
    if (step === 'category') {
      navigate('/services');
      return;
    }
    const handled = goBack();
    if (!handled) navigate('/services');
  };

  const showContinue =
    step === 'items' || step === 'locations' || step === 'review';

  return (
    <div
      className="haulage-page flex min-h-[100dvh] flex-col"
      style={{ backgroundColor: PAGE_BG }}
    >
      <HaulageSubheader onBack={handleBack} stepIndex={stepIndex} stepCount={stepCount} />
      <HaulageStepper stepIndex={stepIndex} stepCount={stepCount} />

      <main className={`mx-auto w-full max-w-lg flex-1 px-6 safe-x ${showContinue ? HAULAGE_FOOTER_CLEARANCE : 'pb-8'}`}>
        {step === 'category' ? <HaulageCategoryStep /> : null}
        {step === 'items' ? <HaulageItemSelectStep /> : null}
        {step === 'locations' ? <HaulageLocationsStep /> : null}
        {step === 'review' ? <HaulageReviewStep onBook={goNext} /> : null}
        {step === 'payment' ? <HaulagePaymentStep /> : null}
      </main>

      {showContinue && step !== 'review' ? (
        <HaulageStickyFooter>
          <HaulagePrimaryButton onClick={goNext} disabled={!canAdvanceFromStep(step)}>
            {t('continue')}
            <ArrowRight className="h-5 w-5" />
          </HaulagePrimaryButton>
        </HaulageStickyFooter>
      ) : null}

      <HaulageItemSpecSheet />
    </div>
  );
}

export default function HaulageBookingPage() {
  return (
    <HaulageBookingProvider>
      <HaulageBookingContent />
    </HaulageBookingProvider>
  );
}
