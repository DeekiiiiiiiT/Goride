import type { PartsActivity } from "./PartsActivityPanel.types";
import { buildBrakesActivitySidebar } from "./brakesActivitySidebar";

export type { PartsActivity } from "./PartsActivityPanel.types";

export function PartsActivityPanel({
  activity,
  onSeeAll,
  onAsk,
}: {
  activity: PartsActivity | null;
  onSeeAll: () => void;
  onAsk: () => void;
}) {
  const { pending, recentlyFound } = buildBrakesActivitySidebar(activity);
  return (
    <div className="flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col">
        <div className="flex items-center justify-between pb-space-md border-b border-surface-container-high mb-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-[20px] text-on-surface">history</span>
            <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">Your parts activity</div>
          </div>
          <button type="button" className="font-body-sm font-semibold text-secondary hover:underline" onClick={onSeeAll}>
            See all
          </button>
        </div>

        <div className="pt-space-sm pb-space-md">
          <div className="flex items-center justify-between mb-space-sm">
            <span className="font-caption text-caption uppercase text-on-surface-variant font-bold tracking-wider">Pending requests</span>
            <span className="font-label-code text-label-code text-on-surface-variant">{pending.length}</span>
          </div>
          {pending.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">None open.</p>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {pending.map((row) => (
                <div key={row.id} className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-body-md font-semibold text-on-surface">{row.title}</div>
                      {row.vehicleLine ? (
                        <div className="font-caption text-caption text-on-surface-variant">{row.vehicleLine}</div>
                      ) : null}
                    </div>
                    <span className="px-2 py-0.5 rounded bg-surface-container font-caption text-caption whitespace-nowrap">{row.statusLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="py-space-md border-t border-surface-container-high">
          <div className="flex items-center justify-between mb-space-sm">
            <span className="font-caption text-caption uppercase text-on-surface-variant font-bold tracking-wider">Recently found</span>
            <span className="font-label-code text-label-code text-on-surface-variant">{recentlyFound.length}</span>
          </div>
          {recentlyFound.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">None yet.</p>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {recentlyFound.map((row) => (
                <div key={row.id} className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-body-md font-semibold text-on-surface">{row.title}</span>
                    <span className="material-symbols-outlined text-outline text-[18px]">verified</span>
                  </div>
                  <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant">
                    <span className="text-on-surface">{row.resultLine}</span>
                    <span className="font-label-code">{row.dateLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-space-lg pt-space-md border-t border-surface-container-high">
          <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-2">
            <div className="font-body-sm font-semibold text-on-surface">Need a part that isn&apos;t on file?</div>
            <p className="font-body-sm text-on-surface-variant leading-relaxed">
              Tell us which part you need and Roam will add it.
            </p>
            <button
              type="button"
              className="mt-space-xs w-full py-2 px-space-md border border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm font-semibold rounded-lg"
              onClick={onAsk}
            >
              Ask Roam to find a part
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
