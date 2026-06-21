import { useEffect } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import {
  ACCEPTANCE_RATE_TARGET,
  CANCELLATION_RATE_TARGET,
  PerformanceMetrics,
} from '../lib/performance-metrics';

interface PoorPerformanceWarningSheetProps {
  open: boolean;
  metrics: PerformanceMetrics;
  onAcknowledge: () => void;
  onGetHelp: () => void;
}

const IMPROVEMENT_TIPS = [
  {
    icon: 'check_circle',
    text: 'Ensure staff is ready for incoming alerts to accept orders quickly.',
  },
  {
    icon: 'inventory_2',
    text: 'Keep inventory updated in real-time to avoid forced cancellations.',
  },
] as const;

export default function PoorPerformanceWarningSheet({
  open,
  metrics,
  onAcknowledge,
  onGetHelp,
}: PoorPerformanceWarningSheetProps) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAcknowledge();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onAcknowledge]);

  if (!open) return null;

  const acceptanceWidth = Math.min(100, Math.max(0, metrics.acceptanceRate));
  const cancellationWidth = Math.min(100, Math.max(0, metrics.cancellationRate));

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[70] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-inset-md"
      role="presentation"
    >
      <div
        className="partner-modal-slide flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-surface-container-lowest shadow-2xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poor-performance-title"
      >
        <div className="flex w-full items-center justify-center bg-surface-container-lowest pb-inset-xs pt-inset-sm sm:hidden">
          <div className="h-1 w-12 rounded-full bg-surface-variant" />
        </div>

        <div className="flex flex-1 flex-col gap-inset-md overflow-y-auto p-inset-md sm:p-inset-lg">
          <div className="mt-inset-sm flex flex-col items-center gap-inset-xs text-center">
            <div className="mb-inset-xs flex h-16 w-16 items-center justify-center rounded-full bg-error-container">
              <MaterialIcon name="warning" filled className="text-4xl text-error" />
            </div>
            <h2
              id="poor-performance-title"
              className="text-headline-lg-mobile font-bold text-on-surface"
            >
              Your performance needs attention
            </h2>
            <p className="text-body-lg text-on-surface-variant">
              This may reduce your visibility to customers.
            </p>
          </div>

          <div className="flex flex-col gap-inset-sm rounded-lg border border-surface-variant bg-surface-container-low p-inset-sm">
            <MetricRow
              label="Acceptance rate"
              value={`${metrics.acceptanceRate}%`}
              barWidth={acceptanceWidth}
              targetLabel={`Target: ${ACCEPTANCE_RATE_TARGET}%+`}
            />

            <div className="my-inset-xs h-px w-full bg-surface-variant" />

            <MetricRow
              label="Cancellation rate"
              value={`${metrics.cancellationRate}%`}
              barWidth={cancellationWidth}
              targetLabel={`Target: <${CANCELLATION_RATE_TARGET}%`}
              targetMarkerPercent={CANCELLATION_RATE_TARGET}
            />
          </div>

          <div className="mt-inset-xs flex flex-col gap-inset-xs">
            <h3 className="text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              Tips to improve
            </h3>
            <ul className="flex flex-col gap-inset-xs">
              {IMPROVEMENT_TIPS.map((tip) => (
                <li key={tip.icon} className="flex items-start gap-inset-xs text-body-sm text-on-surface">
                  <MaterialIcon
                    name={tip.icon}
                    className="mt-0.5 shrink-0 text-xl text-primary-container"
                    size={20}
                  />
                  <span>{tip.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-inset-sm p-inset-md pt-0 sm:p-inset-lg">
          <button
            type="button"
            onClick={onAcknowledge}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-body-lg font-semibold text-on-primary transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Acknowledge
          </button>
          <button
            type="button"
            onClick={onGetHelp}
            className="flex h-12 w-full items-center justify-center rounded-lg border border-outline-variant bg-transparent text-body-lg font-semibold text-primary transition-colors hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Get Help
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  barWidth,
  targetLabel,
  targetMarkerPercent,
}: {
  label: string;
  value: string;
  barWidth: number;
  targetLabel: string;
  targetMarkerPercent?: number;
}) {
  return (
    <div className="flex flex-col gap-inset-base">
      <div className="flex items-end justify-between">
        <span className="text-body-sm font-medium text-on-surface">{label}</span>
        <span className="rounded-sm bg-error-container px-2 py-1 text-label-md text-error">
          {value}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-variant">
        <div
          className="h-full rounded-full bg-error"
          style={{ width: `${barWidth}%` }}
        />
        {targetMarkerPercent != null && (
          <div
            className="absolute bottom-0 top-0 z-10 w-0.5 bg-outline"
            style={{ left: `${targetMarkerPercent}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-label-sm text-outline">
        <span>0%</span>
        <span>{targetLabel}</span>
      </div>
    </div>
  );
}
