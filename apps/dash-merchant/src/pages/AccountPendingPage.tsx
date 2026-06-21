import { MaterialIcon } from '../signup/components/MaterialIcon';

interface AccountPendingPageProps {
  onSignOut: () => void;
  bankDetailsComplete?: boolean;
}

interface StatusItem {
  label: string;
  status: 'complete' | 'review';
}

export default function AccountPendingPage({
  onSignOut,
  bankDetailsComplete = true,
}: AccountPendingPageProps) {
  const items: StatusItem[] = [
    { label: 'Restaurant info', status: 'complete' },
    { label: 'Location', status: 'complete' },
    { label: 'Business details', status: 'complete' },
    { label: 'Identity verification', status: 'review' },
    { label: 'Bank details', status: bankDetailsComplete ? 'complete' : 'review' },
  ];

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

        <main className="flex flex-1 flex-col items-center px-margin-mobile pb-xl pt-lg text-center">
          <div className="relative mb-md flex h-48 w-48 items-center justify-center">
            <img
              alt="Documents under review"
              className="h-full w-full object-contain"
              src="/assets/pending-review.png"
            />
          </div>

          <h1 className="mb-xs text-headline-lg-mobile font-bold text-on-background">
            Your application is under review
          </h1>
          <p className="mb-lg text-body-lg text-on-surface-variant">
            We&apos;ll notify you within 1-2 business days.
          </p>

          <div className="mb-lg w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-left shadow-sm">
            <h2 className="mb-sm text-headline-md font-semibold text-on-surface">Application Status</h2>
            <ul>
              {items.map((item, index) => (
                <li
                  key={item.label}
                  className={`flex min-h-[48px] items-center justify-between ${
                    index < items.length - 1
                      ? 'border-b border-surface-container-high pb-sm'
                      : 'pt-sm'
                  }`}
                >
                  <span
                    className={`text-body-lg text-on-surface ${
                      item.status === 'review' ? 'font-medium' : ''
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.status === 'complete' ? (
                    <MaterialIcon name="check_circle" filled className="text-primary-container" />
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1 text-label-sm font-medium text-on-secondary-container">
                      <MaterialIcon name="hourglass_empty" size={14} />
                      Under review
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
