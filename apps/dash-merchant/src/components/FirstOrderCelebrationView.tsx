import { useEffect } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
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
  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex min-h-dvh flex-col overflow-hidden bg-surface-bright text-on-surface">
      <ConfettiCanvas />

      <header className="relative z-[60] flex h-16 w-full animate-pulse items-center bg-primary-container px-4 text-on-primary-container shadow-md">
        <MaterialIcon name="priority_high" filled className="mr-sm" />
        <h1 className="flex-1 text-headline-md font-bold">New Order Alert</h1>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-margin-mobile">
        <div className="flex w-full flex-col items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-center shadow-lg transition-all duration-500 hover:shadow-xl">
          <div className="mb-md flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed shadow-sm">
            <MaterialIcon name="celebration" filled className="text-headline-lg-mobile text-on-primary-fixed" />
          </div>

          <h2 className="mb-xs text-headline-lg-mobile font-bold text-primary">
            🎉 Your first order!
          </h2>
          <p className="mb-lg text-body-lg text-on-surface-variant">
            Congratulations! This is the start of something big. Your hard work is paying off.
          </p>

          <div className="mb-lg w-full rounded-lg bg-surface-container p-sm text-left">
            <h3 className="mb-sm text-label-md font-semibold uppercase tracking-wide text-primary">
              Tips for Success
            </h3>
            <ul className="space-y-sm">
              {SUCCESS_TIPS.map((tip) => (
                <li
                  key={tip.icon}
                  className="flex items-start rounded-md border border-outline-variant bg-surface-container-lowest p-sm shadow-sm"
                >
                  <MaterialIcon
                    name={tip.icon}
                    filled
                    className="mr-xs text-primary-container"
                    size={20}
                  />
                  <span className="text-body-sm text-on-surface">{tip.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={onViewOrder}
            className="group relative flex h-xl w-full items-center justify-center overflow-hidden rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container shadow-md transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            <span className="relative z-10 flex items-center">
              View Order
              <MaterialIcon
                name="arrow_forward"
                className="ml-xs transition-transform group-hover:translate-x-1"
                size={18}
              />
            </span>
            <div className="absolute inset-0 z-0 -translate-x-full bg-white/20 transition-transform duration-500 ease-in-out group-hover:translate-x-full" />
          </button>
        </div>
      </main>
    </div>
  );
}
