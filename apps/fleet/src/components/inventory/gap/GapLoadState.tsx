import type { ReactNode } from 'react';

export function GapLoadState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center gap-space-sm text-on-surface-variant">
        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[22px]">progress_activity</span>
        <span className="font-body-sm text-body-sm">Loading…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl bg-error-container p-space-md text-on-error-container">
        <p className="font-body-sm text-body-sm">{error}</p>
        {onRetry ? (
          <button
            type="button"
            className="mt-space-sm font-body-sm text-body-sm font-semibold underline"
            onClick={onRetry}
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }
  return <>{children}</>;
}

export function GapSubmitError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-space-md rounded-lg border border-error bg-error-container px-space-md py-space-sm text-on-error-container font-body-sm text-body-sm"
    >
      {message}
    </div>
  );
}
