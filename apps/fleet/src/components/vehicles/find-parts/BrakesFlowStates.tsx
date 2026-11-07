export function BrakesListSkeleton({ plate }: { plate?: string }) {
  return (
    <div className="find-parts-screen-root brakes-find-parts-flow p-space-lg flex flex-col gap-space-lg">
      <div className="flex items-center gap-space-md pb-space-md bg-surface-container-low p-space-md rounded-lg">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high animate-pulse" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-48 bg-surface-container-high animate-pulse rounded" />
            {plate ? (
              <span className="font-label-plate text-label-plate bg-surface-container-highest px-space-xs py-0.5 rounded">{plate}</span>
            ) : (
              <div className="h-4 w-16 bg-surface-container-high animate-pulse rounded" />
            )}
          </div>
          <div className="flex gap-2">
            <div className="h-3 w-24 bg-surface-container-high animate-pulse rounded" />
            <div className="h-3 w-32 bg-surface-container-high animate-pulse rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
        <div className="lg:col-span-8 flex flex-col gap-space-md">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm animate-pulse">
              <div className="flex justify-between p-space-md bg-surface-container-low rounded-lg">
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded bg-surface-container-high" />
                  <div className="flex flex-col gap-1">
                    <div className="h-4 w-44 bg-surface-container-high rounded" />
                    <div className="h-3 w-28 bg-surface-container-highest rounded" />
                  </div>
                </div>
                <div className="h-5 w-20 bg-surface-container-high rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-4 h-64 rounded-xl bg-surface-container-high animate-pulse" />
      </div>
    </div>
  );
}

export function BrakesErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-error/40 bg-error-container/30 p-space-lg flex flex-col sm:flex-row sm:items-center gap-space-md">
      <p className="font-body-md text-error font-medium flex-1">Couldn&apos;t load brake parts. Nothing was changed.</p>
      <button
        type="button"
        className="rounded-lg bg-primary px-space-lg py-2 font-body-sm font-semibold text-on-primary shrink-0"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

export function BrakesUnknownSetupCard({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="find-parts-screen-root p-space-xl flex justify-center">
      <div className="rounded-xl bg-surface-container-lowest p-space-xl shadow-sm max-w-lg w-full text-center flex flex-col items-center gap-space-md">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant">help_outline</span>
        <p className="font-body-lg text-on-surface">
          We don&apos;t know this car&apos;s brake setup yet, so we can&apos;t list its brake parts.
        </p>
        <button type="button" className="rounded-lg bg-primary px-space-xl py-2.5 font-body-md font-semibold text-on-primary" onClick={onAsk}>
          Ask Roam to find it
        </button>
      </div>
    </div>
  );
}
