// Stitch: dominion-redesign/a87e5505779043e2a48a64a6f6266d2e
// Stitch D3: docs/stitch/dominion-redesign/html/D3-merge.html (modal only; aside/header stripped)
import type { FormEvent } from 'react';

export type PlacesReviewMergeItem = {
  id: string;
  payload: {
    name?: string;
    lat?: number;
    lng?: number;
    services?: string[];
    accuracyM?: number;
  };
  best_accuracy_m?: number | null;
};

export type PlacesReviewMergeProps = {
  open: boolean;
  item: PlacesReviewMergeItem | null;
  mergeId: string;
  onMergeIdChange: (intoId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
};

function formatPin(lat?: number, lng?: number): string | null {
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return null;
  const n = Number(lat);
  const w = Number(lng);
  const ns = n >= 0 ? `${n.toFixed(5)}° N` : `${Math.abs(n).toFixed(5)}° S`;
  const ew = w >= 0 ? `${w.toFixed(5)}° E` : `${Math.abs(w).toFixed(5)}° W`;
  return `${ns}, ${ew}`;
}

export function PlacesReviewMerge({
  open,
  item,
  mergeId,
  onMergeIdChange,
  onCancel,
  onConfirm,
  busy = false,
}: PlacesReviewMergeProps) {
  if (!open || !item) return null;

  const name = item.payload?.name?.trim() || 'Unnamed place';
  const pin = formatPin(item.payload?.lat, item.payload?.lng);
  const accuracy = item.best_accuracy_m ?? item.payload?.accuracyM ?? null;
  const services = (item.payload?.services || []).filter((s) => !!String(s || '').trim());
  const hasName = !!item.payload?.name?.trim();
  const hasPin = pin != null;
  const hasServices = services.length > 0;
  const fieldCount = [hasName, hasPin, hasServices].filter(Boolean).length;
  const targetLabel = mergeId.trim() || '—';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mergeId.trim() || busy) return;
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
      <form
        className="my-auto flex max-h-[92vh] w-full max-w-[1040px] transform flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all"
        onSubmit={submit}
      >
        {/* Modal Header — D3 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-7 py-5">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold leading-tight text-slate-900">Merge into an existing place</h2>
                <span className="rounded-full border border-orange-200 bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
                  De-duplication
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Combine submitted community place telemetry with an existing gazetted database record to prevent duplicate POIs on island radar.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Close modal"
            onClick={onCancel}
            disabled={busy}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body — D3 */}
        <div className="flex-1 space-y-6 overflow-y-auto bg-[#fafafa] px-7 py-6">
          {/* Step 1: Target place id (live API takes intoId; no nearby-search candidates) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <label htmlFor="places-review-merge-into" className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  1. Select Target Record in Roam Database
                </label>
                <p className="text-xs text-slate-500">
                  Enter the existing place id to merge this submission into. Nearby search is not available yet.
                </p>
              </div>
              <div className="text-xs font-medium text-slate-400">
                Live API field: <span className="font-semibold text-slate-700">intoId</span>
              </div>
            </div>

            <div className="relative mb-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="places-review-merge-into"
                type="text"
                value={mergeId}
                onChange={(event) => onMergeIdChange(event.target.value)}
                required
                autoComplete="off"
                placeholder="Existing place id…"
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-24 font-mono text-sm font-medium text-slate-900 transition-all focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {mergeId.trim() ? (
                <span className="absolute inset-y-0 right-0 my-1.5 mr-2 flex items-center rounded border border-orange-200 bg-orange-50 px-2 pr-3 text-xs font-semibold text-orange-600">
                  Active Match
                </span>
              ) : null}
            </div>
          </div>

          {/* Step 2: Field comparison — only live submitted fields; no fake ROAM-JM targets */}
          {(hasName || hasPin || hasServices) ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-2 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    2. Side-by-Side Field Comparison & Selection
                  </h3>
                  <p className="text-xs text-slate-500">
                    Submitted attributes that will move onto the target place. Existing field values are not loaded for compare yet.
                  </p>
                </div>
                <div className="flex items-center space-x-3 text-xs">
                  <span className="flex items-center text-slate-600">
                    <span className="mr-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" /> Submitted (Scout)
                  </span>
                  <span className="flex items-center text-slate-600">
                    <span className="mr-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" /> Existing (Roam Base)
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {hasName ? (
                  <div className="grid grid-cols-12 items-center gap-4 p-4 transition-colors hover:bg-slate-50/70">
                    <div className="col-span-12 sm:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Field</span>
                      <div className="mt-0.5 text-sm font-bold text-slate-800">Place Name</div>
                      <div className="text-[11px] text-slate-400">Primary title shown on map card</div>
                    </div>
                    <div className="relative col-span-12 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3.5 sm:col-span-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">SUBMITTED BY SCOUT</span>
                        </div>
                      </div>
                      <div className="mt-2 text-base font-bold text-slate-900">{name}</div>
                    </div>
                    <div className="relative col-span-12 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 sm:col-span-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">CURRENT DATABASE</span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-600">
                        Target id <span className="font-mono font-semibold text-slate-900">{targetLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Existing name is not fetched for compare.</p>
                    </div>
                  </div>
                ) : null}

                {hasPin ? (
                  <div className="grid grid-cols-12 items-center gap-4 p-4 transition-colors hover:bg-slate-50/70">
                    <div className="col-span-12 sm:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Field</span>
                      <div className="mt-0.5 text-sm font-bold text-slate-800">Pin / Geolocation</div>
                      <div className="text-[11px] text-slate-400">Lat / Long coordinates & precision</div>
                    </div>
                    <div className="relative col-span-12 rounded-xl border-2 border-orange-500 bg-blue-50/70 p-3.5 sm:col-span-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">SUBMITTED PIN</span>
                          <span className="rounded bg-orange-100 px-1.5 text-[10px] font-semibold text-orange-800">RECOMMENDED</span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center space-x-2 font-mono text-xs font-bold text-slate-800">
                        <span>{pin}</span>
                        {accuracy != null ? (
                          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] text-slate-600">
                            ±{accuracy}m GPS
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="relative col-span-12 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 sm:col-span-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">EXISTING PIN</span>
                        </div>
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-600">
                        Target id <span className="font-mono font-semibold text-slate-900">{targetLabel}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Existing pin is not fetched for compare.</p>
                    </div>
                  </div>
                ) : null}

                {hasServices ? (
                  <div className="grid grid-cols-12 items-start gap-4 p-4 transition-colors hover:bg-slate-50/70">
                    <div className="col-span-12 pt-1 sm:col-span-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Field</span>
                      <div className="mt-0.5 text-sm font-bold text-slate-800">Services & Tags</div>
                      <div className="text-[11px] text-slate-400">Submitted services on this item</div>
                    </div>
                    <div className="col-span-12 space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3.5 sm:col-span-5">
                      <div className="flex items-center justify-between border-b border-blue-200/50 pb-1.5">
                        <span className="text-xs font-bold text-blue-900">Submitted Services ({services.length})</span>
                      </div>
                      {services.map((service) => (
                        <div
                          key={service}
                          className="flex items-start space-x-2.5 rounded-lg border border-blue-100 bg-white p-2"
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-900">{service}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="col-span-12 space-y-2 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3.5 sm:col-span-5">
                      <div className="flex items-center justify-between border-b border-emerald-200/50 pb-1.5">
                        <span className="text-xs font-bold text-emerald-900">Existing Station Amenities</span>
                      </div>
                      <p className="p-2 text-xs text-slate-500">
                        Existing amenities for <span className="font-mono font-semibold text-slate-700">{targetLabel}</span> are not loaded for compare.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              This submission has no name, pin, or services to compare.
            </div>
          )}
        </div>

        {/* Modal Footer — D3 */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-7 py-4">
          <div className="text-xs text-slate-500">
            Target ID:{' '}
            <span className="font-mono font-semibold text-slate-700">{targetLabel}</span>
            {' '}• {fieldCount} field{fieldCount === 1 ? '' : 's'} from submission
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              className="rounded-lg border border-[#57534e]/30 bg-white px-5 py-2.5 text-sm font-semibold text-[#57534e] transition-all hover:bg-stone-50"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !mergeId.trim()}
              className="flex items-center space-x-2 rounded-lg bg-[#ea580c] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 transition-all hover:bg-[#c2410c] disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>{busy ? 'Merging…' : 'Merge into Existing Place'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
