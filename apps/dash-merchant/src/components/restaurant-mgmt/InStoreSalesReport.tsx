import { useState } from 'react';
import { formatJmd } from '../../lib/partner-utils';
import type { InStoreSalesReport } from '../../lib/restaurant-mgmt-api';

interface InStoreSalesReportProps {
  today: InStoreSalesReport;
  week: InStoreSalesReport;
}

export default function InStoreSalesReportView({ today, week }: InStoreSalesReportProps) {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const data = range === 'today' ? today : week;

  return (
    <div className="mx-auto max-w-3xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <div className="flex gap-inset-sm">
        {(['today', 'week'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setRange(key)}
            className={`rounded-full px-4 py-2 text-label-md font-semibold ${
              range === key
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {key === 'today' ? 'Today' : 'This week'}
          </button>
        ))}
      </div>

      <div className="grid gap-inset-md sm:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Total sales</p>
          <p className="text-headline-lg font-bold">{formatJmd(data.total)}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Orders</p>
          <p className="text-headline-lg font-bold">{data.orderCount}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Avg ticket</p>
          <p className="text-headline-lg font-bold">{formatJmd(Math.round(data.avgTicket))}</p>
        </div>
      </div>
    </div>
  );
}
