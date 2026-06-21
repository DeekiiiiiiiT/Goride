import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ISSUE_TYPES, REPORT_ISSUE_ORDERS } from '@/lib/accountSubContent';

type Props = {
  onNavigate: (page: string) => void;
};

export default function ReportIssuePage({ onNavigate }: Props) {
  const [selectedOrder, setSelectedOrder] = useState(REPORT_ISSUE_ORDERS.find(o => o.selected)?.id ?? REPORT_ISSUE_ORDERS[0].id);
  const [issueType, setIssueType] = useState('other');
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => onNavigate('help'), 1500);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
        <MaterialIcon name="check_circle" className="text-primary text-[64px] mb-4" filled />
        <h2 className="text-headline-md font-semibold mb-2">Report submitted</h2>
        <p className="text-body-md text-on-surface-variant text-center">We&apos;ll respond within 24 hours.</p>
      </div>
    );
  }

  return (
    <div className="text-on-surface antialiased bg-background pb-[100px] min-h-screen">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-40">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[600px] mx-auto h-16">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => onNavigate('help')} aria-label="Go back" className="w-10 h-10 flex items-center justify-center rounded-full">
              <MaterialIcon name="arrow_back" />
            </button>
            <h1 className="text-headline-sm font-semibold text-primary">Report an Issue</h1>
          </div>
          <button type="button" aria-label="Support" className="w-10 h-10 flex items-center justify-center rounded-full">
            <MaterialIcon name="help" />
          </button>
        </div>
      </header>

      <main className="max-w-[600px] mx-auto px-4 py-6 w-full flex flex-col gap-6">
        <div>
          <h2 className="text-headline-lg-mobile font-bold mb-1">What went wrong?</h2>
          <p className="text-body-md text-on-surface-variant">
            Select your recent order and tell us what happened so we can make it right.
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Select Order</h3>
          {REPORT_ISSUE_ORDERS.map(order => {
            const selected = selectedOrder === order.id;
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrder(order.id)}
                className={`bg-surface-container-lowest rounded-xl p-4 flex items-center gap-4 text-left transition-colors ${
                  selected
                    ? 'border border-outline-variant shadow-[0px_4px_20px_rgba(0,0,0,0.04)]'
                    : 'border border-transparent opacity-70 hover:bg-surface-container-low'
                }`}
              >
                <div className={`${selected ? 'w-16 h-16' : 'w-12 h-12'} rounded-lg bg-surface-container-high overflow-hidden shrink-0`}>
                  <img src={order.image} alt={order.merchantName} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`${selected ? 'text-headline-sm font-semibold' : 'text-body-lg'} line-clamp-1`}>
                    {order.merchantName}
                  </h4>
                  <p className="text-body-sm text-on-surface-variant">{order.detail}</p>
                </div>
                {selected ? (
                  <MaterialIcon name="check_circle" className="text-primary" filled />
                ) : (
                  <MaterialIcon name="chevron_right" className="text-outline" />
                )}
              </button>
            );
          })}
        </section>

        <div className="h-px w-full bg-outline-variant opacity-30" />

        <section className="flex flex-col gap-4">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Type of Issue</h3>
          <div className="grid grid-cols-2 gap-2">
            {ISSUE_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setIssueType(type.id)}
                className={`h-full bg-surface-container-lowest border rounded-lg p-4 flex flex-col gap-2 text-left transition-all ${
                  issueType === type.id
                    ? 'border-2 border-primary shadow-[0px_4px_20px_rgba(0,0,0,0.04)]'
                    : 'border-outline-variant hover:bg-surface-container-low'
                }`}
              >
                <MaterialIcon name={type.icon} className={issueType === type.id ? 'text-primary' : 'text-on-surface-variant'} />
                <span className="text-body-md font-medium">{type.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Details</h3>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Describe issue (e.g., The spicy tuna roll was missing from the bag...)"
            className="w-full bg-[#F3F4F6] border-none rounded-lg p-4 text-body-md focus:bg-surface-container-lowest focus:border-2 focus:border-primary transition-all resize-none min-h-[120px] placeholder:text-outline"
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-label-md font-semibold uppercase tracking-wider">Attachments</h3>
          <button
            type="button"
            className="w-full bg-surface-container-lowest border border-dashed border-outline-variant rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container-low transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
              <MaterialIcon name="add_a_photo" className="text-primary" />
            </div>
            <div className="text-center">
              <span className="text-body-md font-medium block">Upload a photo</span>
              <span className="text-body-sm text-on-surface-variant block mt-1">
                Optional, but helps us resolve it faster
              </span>
            </div>
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full bg-primary text-on-primary text-headline-sm font-semibold py-4 rounded-lg shadow-md flex justify-center items-center gap-2"
          >
            Submit Report
            <MaterialIcon name="send" className="text-[20px]" />
          </button>
          <p className="text-center text-body-sm text-on-surface-variant flex items-center justify-center gap-1">
            <MaterialIcon name="schedule" className="text-[16px]" />
            We&apos;ll respond within 24 hours
          </p>
        </section>
      </main>
    </div>
  );
}
