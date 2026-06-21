import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { fetchApplicationStatus, type ApplicationStatusResponse } from '../lib/partner-api';

interface AccountPendingPageProps {
  onSignOut: () => void;
}

type ItemStatus = 'complete' | 'review' | 'missing';

interface StatusItem {
  label: string;
  status: ItemStatus;
}

function mapChecklist(data: ApplicationStatusResponse): StatusItem[] {
  const c = data.checklist;
  return [
    { label: 'Restaurant info', status: c.profileComplete ? 'complete' : 'missing' },
    { label: 'Location', status: c.profileComplete ? 'complete' : 'missing' },
    { label: 'Business details', status: c.profileComplete ? 'complete' : 'missing' },
    { label: 'Identity verification', status: c.documentsComplete ? 'complete' : 'review' },
    { label: 'Bank details', status: c.bankComplete ? 'complete' : 'missing' },
    { label: 'Operating hours', status: c.hoursComplete ? 'complete' : 'missing' },
    { label: 'Menu (5+ items)', status: c.menuComplete ? 'complete' : 'missing' },
  ];
}

function statusLabel(status: MerchantVerificationStatus | undefined): string {
  switch (status) {
    case 'in_review':
      return 'Under review';
    case 'docs_requested':
      return 'Additional info needed';
    case 'rejected':
      return 'Not approved';
    default:
      return 'Pending review';
  }
}

type MerchantVerificationStatus = 'pending' | 'in_review' | 'docs_requested' | 'rejected' | 'approved';

export default function AccountPendingPage({ onSignOut }: AccountPendingPageProps) {
  const [data, setData] = useState<ApplicationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchApplicationStatus()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const items = data ? mapChecklist(data) : [];
  const verificationStatus = data?.merchant?.verification_status as MerchantVerificationStatus | undefined;
  const adminNote = data?.merchant?.verification_notes || data?.merchant?.rejection_reason;

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background font-body-sm text-on-background">
      <div className="relative flex w-full max-w-[600px] flex-1 flex-col pb-margin-mobile">
        <header className="sticky top-0 z-50 mx-auto flex h-16 w-full max-w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
          <div className="flex items-center gap-2">
            <MaterialIcon name="store" filled className="text-primary" />
            <span className="text-headline-md font-bold text-primary">Roam Dash Merchant</span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="rounded-full p-2 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="logout" />
          </button>
        </header>

        <main className="flex flex-1 flex-col items-center px-margin-mobile pb-inset-xl pt-inset-lg text-center">
          <div className="relative mb-inset-md flex h-48 w-48 items-center justify-center">
            <img
              alt="Documents under review"
              className="h-full w-full object-contain"
              src="/assets/pending-review.png"
            />
          </div>

          <h1 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-background">
            {verificationStatus === 'rejected' ? 'Application needs updates' : 'Your application is under review'}
          </h1>
          <p className="mb-inset-sm text-body-lg text-on-surface-variant">
            Status: {statusLabel(verificationStatus)}
          </p>
          {adminNote && (
            <p className="mb-inset-lg max-w-md rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-left text-body-sm text-on-surface">
              {adminNote}
            </p>
          )}
          {!adminNote && (
            <p className="mb-inset-lg text-body-lg text-on-surface-variant">
              We&apos;ll notify you within 1-2 business days.
            </p>
          )}

          <div className="mb-inset-lg w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left shadow-sm">
            <h2 className="mb-inset-sm text-headline-md font-semibold text-on-surface">Application Status</h2>
            {loading ? (
              <p className="text-body-sm text-on-surface-variant">Loading checklist…</p>
            ) : (
              <ul>
                {items.map((item, index) => (
                  <li
                    key={item.label}
                    className={`flex min-h-[48px] items-center justify-between ${
                      index < items.length - 1
                        ? 'border-b border-surface-container-high pb-inset-sm'
                        : 'pt-inset-sm'
                    }`}
                  >
                    <span className="text-body-lg text-on-surface">{item.label}</span>
                    {item.status === 'complete' ? (
                      <MaterialIcon name="check_circle" filled className="text-primary-container" />
                    ) : item.status === 'review' ? (
                      <span className="flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-label-sm font-medium text-on-secondary-container">
                        <MaterialIcon name="hourglass_empty" size={14} />
                        Under review
                      </span>
                    ) : (
                      <span className="text-label-sm text-on-surface-variant">Incomplete</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto flex w-full flex-col gap-4">
            <a
              href="mailto:support@roamdash.com"
              className="flex h-12 w-full items-center justify-center rounded-lg border-2 border-secondary text-label-md font-semibold text-secondary transition-colors duration-150 hover:bg-surface-container-low active:scale-95"
            >
              Contact Support
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
