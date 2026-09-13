import { Briefcase, Building2, Car } from 'lucide-react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';

const cardClass =
  'flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-500/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/80';

type Props = {
  onIndependent: () => void;
  onJoinFleet: () => void;
  onFleetOwner: () => void;
};

export function CourierWorkforceArchetypePage({
  onIndependent,
  onJoinFleet,
  onFleetOwner,
}: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <OnboardingHeader onBack={() => {}} />
      <div className="mx-auto w-full max-w-sm px-4 pb-10 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          How will you deliver?
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-300">
          Choose one to continue. You can finish your profile on the next steps.
        </p>
        <div className="mt-8 space-y-3">
          <button type="button" className={`${cardClass} w-full`} onClick={onIndependent}>
            <Car className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Independent courier</span>
            <span className="text-sm text-slate-500">
              Not tied to a fleet — contract with Roam and accept offers on your own.
            </span>
          </button>
          <button type="button" className={`${cardClass} w-full`} onClick={onJoinFleet}>
            <Briefcase className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Join a delivery company</span>
            <span className="text-sm text-slate-500">
              Use an invite code, Fleet Tag, or a Roam Tag invite from your employer.
            </span>
          </button>
          <button type="button" className={`${cardClass} w-full`} onClick={onFleetOwner}>
            <Building2 className="h-6 w-6 text-emerald-600" />
            <span className="font-semibold text-slate-900 dark:text-white">Fleet operator / owner</span>
            <span className="text-sm text-slate-500">
              Create your company on Roam Fleet — manage couriers and operations.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
