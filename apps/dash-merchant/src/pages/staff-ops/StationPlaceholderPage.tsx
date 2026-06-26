import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { STATION_LABELS, type JobStation } from '../../types/team';

const STATION_PLACEHOLDER_CONFIG: Record<
  Extract<JobStation, 'bar' | 'expo' | 'drive_thru'>,
  { icon: string; message: string }
> = {
  bar: {
    icon: 'local_bar',
    message: 'Drinks queue. Full bar fulfillment view is coming next.',
  },
  expo: {
    icon: 'room_service',
    message: 'Expo pass. Runner calls and staging view is coming next.',
  },
  drive_thru: {
    icon: 'drive_eta',
    message: 'Drive-thru lane. Order and payment status view is coming next.',
  },
};

interface StationPlaceholderPageProps {
  merchant: Merchant;
  staffName?: string;
  station: Extract<JobStation, 'bar' | 'expo' | 'drive_thru'>;
}

export default function StationPlaceholderPage({
  merchant,
  staffName,
  station,
}: StationPlaceholderPageProps) {
  const config = STATION_PLACEHOLDER_CONFIG[station];
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-inset-md p-margin-mobile text-center">
      <MaterialIcon name={config.icon} className="text-5xl text-primary-container" />
      <h2 className="text-headline-md font-bold text-on-background">{STATION_LABELS[station]}</h2>
      <p className="max-w-md text-body-md text-on-surface-variant">
        {config.message.replace('.', '')} for {merchant.name}
        {staffName ? ` · ${staffName}` : ''}.
      </p>
    </div>
  );
}
