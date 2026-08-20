import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MerchantAnalyticsData } from '../../hooks/useMerchantAnalytics';
import TopSellingItemsCard from './TopSellingItemsCard';

interface TopSellingItemsViewProps {
  onBack: () => void;
  data: MerchantAnalyticsData;
}

export default function TopSellingItemsView({ onBack, data }: TopSellingItemsViewProps) {
  return (
    <div className="flex flex-col gap-inset-sm">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
      >
        <MaterialIcon name="arrow_back" className="text-base" />
        Back
      </button>
      <TopSellingItemsCard items={data.topItems} compact />
    </div>
  );
}
