import type { InvoiceParseSuggestion } from './types';

type Props = {
  suggestion: InvoiceParseSuggestion;
  reading?: boolean;
  applying?: boolean;
  onApply: () => void;
  onDismiss: () => void;
};

/** Review card before applying parsed invoice fields (shared by pre-alert + package duty). */
export function InvoiceFillSuggestions({
  suggestion,
  reading,
  applying,
  onApply,
  onDismiss,
}: Props) {
  if (reading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Reading invoice…
      </div>
    );
  }

  const hasAny =
    suggestion.retailer ||
    suggestion.description ||
    suggestion.declaredValueUsd != null ||
    suggestion.weightLbs != null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Smart fill from invoice</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Review suggestions, then Apply. Only blank fields are filled.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
          {suggestion.confidence}
        </span>
      </div>

      {suggestion.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
          {suggestion.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {hasAny ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Field label="Retailer" value={suggestion.retailer} />
          <Field
            label="Declared value (USD)"
            value={
              suggestion.declaredValueUsd != null
                ? `$${suggestion.declaredValueUsd.toFixed(2)}${
                    suggestion.currencyHint && suggestion.currencyHint !== 'USD'
                      ? ` (${suggestion.currencyHint}?)`
                      : ''
                  }`
                : null
            }
          />
          <Field label="Weight (lb)" value={suggestion.weightLbs != null ? String(suggestion.weightLbs) : null} />
          <div className="sm:col-span-2">
            <Field label="Description" value={suggestion.description} />
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-slate-600">No fields to apply from this file.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!hasAny || applying}
          onClick={onApply}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          disabled={applying}
          onClick={onDismiss}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value?.trim() ? value : '—'}</dd>
    </div>
  );
}
