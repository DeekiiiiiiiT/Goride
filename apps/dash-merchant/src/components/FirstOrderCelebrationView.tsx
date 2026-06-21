import { MaterialIcon } from '../signup/components/MaterialIcon';
import PartnerFullscreenScreen from './layout/PartnerFullscreenScreen';
import ConfettiCanvas from './ConfettiCanvas';

const SUCCESS_TIPS = [
  { icon: 'check_circle', label: 'Check items carefully before packing.' },
  { icon: 'timer', label: 'Keep your prep time consistent.' },
  { icon: 'local_shipping', label: "Be ready for the driver's arrival." },
] as const;

interface FirstOrderCelebrationViewProps {
  open: boolean;
  onViewOrder: () => void;
}

export default function FirstOrderCelebrationView({
  open,
  onViewOrder,
}: FirstOrderCelebrationViewProps) {
  return (
    <PartnerFullscreenScreen open={open} className="bg-surface-bright text-on-surface">
      <ConfettiCanvas />

      <header className="relative z-[60] flex h-16 w-full shrink-0 animate-pulse items-center bg-primary-container px-4 text-on-primary-container shadow-md">
        <MaterialIcon name="priority_high" filled className="mr-sm" />
        <h1 className="flex-1 text-headline-md font-bold">New Order Alert</h1>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col items-center justify-center overflow-y-auto p-margin-mobile">
        <div className="flex w-full flex-col items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-lg transition-all duration-500 hover:shadow-xl">
          <div className="mb-sm flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <MaterialIcon name="celebration" filled size={32} />
          </div>
          <h2 className="mb-xs text-headline-md font-bold text-primary">First order accepted!</h2>
          <p className="mb-md text-body-sm text-on-surface-variant">
            You&apos;re officially live on Roam Dash. Here are a few quick tips:
          </p>
          <ul className="mb-md w-full space-y-sm text-left">
            {SUCCESS_TIPS.map((tip) => (
              <li key={tip.icon} className="flex items-start gap-sm text-body-sm text-on-surface">
                <MaterialIcon name={tip.icon} className="mt-0.5 text-primary" size={18} />
                <span>{tip.label}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onViewOrder}
            className="btn-touch flex w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container transition-transform active:scale-95"
          >
            View Order Details
          </button>
        </div>
      </main>
    </PartnerFullscreenScreen>
  );
}
