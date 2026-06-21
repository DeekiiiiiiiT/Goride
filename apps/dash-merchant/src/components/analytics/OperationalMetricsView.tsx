import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MerchantAnalyticsData } from '../../hooks/useMerchantAnalytics';

interface OperationalMetricsViewProps {
  onBack: () => void;
  data: MerchantAnalyticsData;
}

export default function OperationalMetricsView({ onBack, data }: OperationalMetricsViewProps) {
  const { operational } = data;

  return (
    <div className="flex flex-col gap-inset-lg">
      <section>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
        >
          <MaterialIcon name="arrow_back" className="text-base" />
          Back
        </button>
        <h2 className="text-headline-lg-mobile text-on-background">Operational Metrics</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Monitor your restaurant&apos;s performance health.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-gutter">
        <MetricTile
          label="Acceptance"
          icon="check_circle"
          value={`${operational.acceptanceRate}%`}
          valueClass="text-primary"
        />
        <MetricTile
          label="Prep Time"
          icon="timer"
          value={operational.avgPrepTime > 0 ? `${operational.avgPrepTime}m` : '—'}
          valueClass="text-on-background"
        />
        <MetricTile
          label="Avg Order Value"
          icon="shopping_bag"
          value={`J$${Math.round(data.avgOrderValue).toLocaleString()}`}
          valueClass="text-primary"
        />
        <MetricTile
          label="Cancellations"
          icon="cancel"
          value={`${operational.cancellationRate}%`}
          valueClass="text-on-background"
        />
      </section>
    </div>
  );
}

function MetricTile({
  label,
  icon,
  value,
  valueClass,
}: {
  label: string;
  icon: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex min-h-[110px] flex-col justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between text-on-surface-variant">
        <span className="text-label-md uppercase">{label}</span>
        <MaterialIcon name={icon} className="text-[20px]" />
      </div>
      <div className={`mt-2 text-headline-lg-mobile ${valueClass}`}>{value}</div>
    </div>
  );
}
