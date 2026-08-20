export default function PartnerBootLoadingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-inset-md bg-surface p-margin-mobile text-center">
      <div className="partner-spinner" role="status" aria-label="Loading your restaurant" />
      <p className="text-body-md text-on-surface-variant">Loading your restaurant…</p>
    </div>
  );
}
