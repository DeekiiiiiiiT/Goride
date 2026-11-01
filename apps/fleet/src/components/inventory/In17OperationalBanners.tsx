/** Conditional IN17 banners only (R3-09) — not the full state catalog. */
export function In17OperationalBanners({
  showError,
  showDiscrepancy,
  showReadOnly,
  errorMessage,
  discrepancyMessage,
}: {
  showError?: boolean;
  showDiscrepancy?: boolean;
  showReadOnly?: boolean;
  errorMessage?: string;
  discrepancyMessage?: string;
}) {
  if (!showError && !showDiscrepancy && !showReadOnly) return null;

  return (
    <div className="fleet-inventory-stitch w-full px-margin-desktop py-space-sm flex flex-col gap-space-sm max-w-[1440px] mx-auto">
      {showError ? (
        <div className="w-full bg-error text-on-error rounded-xl p-space-md shadow-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-[20px]">sync_problem</span>
            <div>
              <p className="font-body-sm text-body-sm font-semibold">Could not refresh inventory</p>
              <p className="font-caption text-caption text-on-error/80 mt-0.5">
                {errorMessage ?? 'Connection or server error. Showing last loaded snapshot.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {showDiscrepancy ? (
        <div className="w-full bg-error-container text-on-error-container rounded-xl p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-[20px]">warning</span>
            <div>
              <p className="font-body-sm text-body-sm font-semibold">Ledger discrepancy detected</p>
              <p className="font-caption text-caption text-on-error-container/85 mt-0.5">
                {discrepancyMessage ?? 'Review Movements and run verify before posting.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {showReadOnly ? (
        <div className="w-full bg-surface-container-high text-on-surface rounded-xl p-space-md shadow-sm">
          <p className="font-body-sm text-body-sm font-medium">Read-only mode — you can view stock but not post movements.</p>
        </div>
      ) : null}
    </div>
  );
}
