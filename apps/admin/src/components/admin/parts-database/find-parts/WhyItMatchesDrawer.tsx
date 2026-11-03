import { formatMatchWhyLine } from "@roam/types/partMatchReason";
import type { FoundPartRow } from "../partsDatabaseApi";

export function WhyItMatchesDrawer({
  part,
  onClose,
}: {
  part: FoundPartRow;
  onClose: () => void;
}) {
  const params = (part.matchReasonParams ?? {}) as Record<string, unknown>;
  const why = part.reason || formatMatchWhyLine(part.matchReasonCode ?? null, params);
  return (
    <aside className="fixed inset-y-0 right-0 z-[60] w-full max-w-md border-l border-outline-variant bg-surface-container-lowest p-space-lg shadow-2xl flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono-sm text-mono-sm uppercase text-secondary">Why it matches</p>
          <h3 className="font-headline-md text-headline-md font-bold">{part.name}</h3>
          <p className="font-mono-sm text-primary mt-1">{part.brand} {part.number}</p>
        </div>
        <button type="button" className="w-8 h-8 rounded-lg border border-outline-variant/50" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="mt-6 flex flex-col gap-space-md overflow-y-auto flex-1">
        <section>
          <h4 className="font-mono-sm text-mono-sm uppercase text-secondary font-bold">Match summary</h4>
          <p className="mt-2 text-body-md text-on-surface">{why}</p>
        </section>
        {Object.keys(params).length ? (
          <section>
            <h4 className="font-mono-sm text-mono-sm uppercase text-secondary font-bold">Evidence parameters</h4>
            <dl className="mt-2 space-y-1 text-sm">
              {Object.entries(params).map(([key, val]) => (
                <div key={key} className="flex gap-2">
                  <dt className="text-secondary font-mono-sm min-w-[80px]">{key}</dt>
                  <dd className="text-on-surface break-all">{String(val ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section className="rounded-xl border border-primary/20 bg-surface-container-low p-space-md text-sm">
          <p className="font-semibold">What Keep / Remove does</p>
          <p className="mt-1 text-secondary">
            Keep writes this fit to the catalog. Remove hides the auto-match proposal without deleting your hand-entered listings.
          </p>
        </section>
      </div>
    </aside>
  );
}
