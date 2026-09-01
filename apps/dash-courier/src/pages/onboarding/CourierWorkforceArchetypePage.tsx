import { Briefcase, Building2, Car } from 'lucide-react';
import { roamFleetSignupUrl } from '@roam/api-client';
import { Button } from '@roam/ui';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';

const FLEET_SIGNUP_URL = roamFleetSignupUrl({ line: 'rush_delivery', from: 'roamrushcourier' });

const cardClass =
  'flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80';

type Props = {
  onIndependent: () => void;
  onJoinFleet: () => void;
};

export function CourierWorkforceArchetypePage({ onIndependent, onJoinFleet }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <OnboardingHeader />
      <div className="mx-auto w-full max-w-sm px-4 pb-10 pt-2">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          How will you deliver?
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Choose how you want to work with Roam Rush.
        </p>
        <div className="mt-8 space-y-3">
          <button type="button" className={`${cardClass} w-full`} onClick={onIndependent}>
            <Car className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Independent courier</span>
            <span className="text-sm text-slate-500">Contract directly with Roam and accept offers on your own.</span>
          </button>
          <button type="button" className={`${cardClass} w-full`} onClick={onJoinFleet}>
            <Briefcase className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Join a delivery company</span>
            <span className="text-sm text-slate-500">Use an invite code from a fleet that employs you.</span>
          </button>
          <a href={FLEET_SIGNUP_URL} className={`${cardClass} w-full`}>
            <Building2 className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Fleet operator / owner</span>
            <span className="text-sm text-slate-500">Run couriers on Roam Fleet — create your company portal.</span>
          </a>
        </div>
        <Button type="button" variant="ghost" className="mt-6 w-full" onClick={onIndependent}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
