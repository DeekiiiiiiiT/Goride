import type { OrderChannel } from '../../types/restaurant-mgmt';

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  roam_app: 'Roam',
  in_store: 'In-store',
  phone: 'Phone',
};

const CHANNEL_STYLES: Record<OrderChannel, string> = {
  roam_app: 'bg-primary-container/20 text-primary-container',
  in_store: 'bg-tertiary-container/30 text-on-tertiary-container',
  phone: 'bg-surface-variant text-on-surface-variant',
};

interface OrderChannelChipProps {
  channel: OrderChannel;
  className?: string;
}

export default function OrderChannelChip({ channel, className = '' }: OrderChannelChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide ${CHANNEL_STYLES[channel]} ${className}`}
    >
      {CHANNEL_LABELS[channel]}
    </span>
  );
}
