import { useQuery } from '@tanstack/react-query';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { fetchCustomerSupportCases } from '@/lib/customerApi';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

function statusLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'pending':
      return 'Under review';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return status.replace(/_/g, ' ');
  }
}

export default function MyIssuesPage({ onNavigate }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-support-cases'],
    queryFn: fetchCustomerSupportCases,
  });

  const cases = data ?? [];

  return (
    <div className="text-on-surface antialiased bg-background pb-[100px] min-h-dvh">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-40 safe-t">
        <div className="flex items-center px-4 py-2 w-full max-w-[600px] mx-auto min-h-16">
          <button
            type="button"
            onClick={() => onNavigate('help')}
            aria-label="Go back"
            className="w-10 h-10 flex items-center justify-center rounded-full"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-semibold text-primary">My Issues</h1>
        </div>
      </header>

      <main className="max-w-[600px] mx-auto px-4 py-6 w-full flex flex-col gap-4">
        {isLoading ? (
          <p className="text-body-md text-on-surface-variant">Loading…</p>
        ) : error ? (
          <p className="text-body-md text-error">Could not load your issues.</p>
        ) : cases.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">
            No support cases yet. Report a problem from an order if something went wrong.
          </p>
        ) : (
          cases.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate('my-issues', { caseId: item.id })}
              className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant text-left flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-body-lg font-semibold line-clamp-2">{item.subject}</span>
                <span className="text-label-sm text-primary shrink-0">{statusLabel(item.status)}</span>
              </div>
              <p className="text-body-sm text-on-surface-variant">
                Ref #{item.id.slice(0, 8).toUpperCase()} ·{' '}
                {new Date(item.created_at).toLocaleDateString()}
              </p>
              {item.auto_resolved ? (
                <p className="text-body-sm text-primary">Auto-resolved</p>
              ) : null}
            </button>
          ))
        )}
      </main>
    </div>
  );
}
