import { roamFleetSignupUrl } from '@roam/api-client';
import { Button } from '@roam/ui';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';

const FLEET_SIGNUP_URL = roamFleetSignupUrl({ line: 'rush_delivery', from: 'roamrushcourier' });

type Props = {
  onBack: () => void;
  onContinueAsCourier: () => void;
};

/** Mirror Driver fleet_owner_cta — open Roam Fleet or continue as courier. */
export function CourierFleetOwnerCtaPage({ onBack, onContinueAsCourier }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <OnboardingHeader onBack={onBack} />
      <div className="mx-auto w-full max-w-sm px-4 pb-10 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Roam Fleet
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Create your delivery company in the Roam Fleet portal. You can still finish courier profile
          setup here afterward if you also deliver.
        </p>
        <div className="mt-8 space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl dark:border-slate-700/60 dark:bg-slate-800/60">
          <a
            href={FLEET_SIGNUP_URL}
            className="flex w-full items-center justify-center rounded-lg border border-emerald-600 bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Create fleet on Roam Fleet
          </a>
          <Button type="button" variant="ghost" className="w-full" onClick={onContinueAsCourier}>
            Skip — continue as courier only
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
