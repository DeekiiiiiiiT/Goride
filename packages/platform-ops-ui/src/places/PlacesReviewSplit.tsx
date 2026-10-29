// Stitch D2: docs/stitch/dominion-redesign/html/D2-review-item.html
import { useRef } from 'react';
import {
  gradeFromItem,
  kindLabel,
  osmEmbedSrc,
  pill,
  strong,
  type PlacesReviewItem,
  type PlugChip,
} from './placesReviewShared';

export type PlacesReviewSplitProps = {
  item: PlacesReviewItem | null;
  index: number;
  total: number;
  chips: PlugChip[];
  editName: string;
  setEditName: (value: string) => void;
  showMerge?: boolean;
  mergeId?: string;
  setShowMerge?: (value: boolean) => void;
  setMergeId?: (value: string) => void;
  onApprove: (id: string, name?: string) => void;
  onReject: (id: string) => void;
  onMerge: () => void;
  onSkip: () => void;
  onBack?: () => void;
};

function Ms({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

function DecisionBanner({ item }: { item: PlacesReviewItem }) {
  const grade = gradeFromItem(item);
  const label = pill(item).label;
  const meters = item.best_accuracy_m ?? item.payload?.accuracyM ?? null;

  if (grade === 'duplicate') {
    return (
      <div className="p-3.5 rounded bg-[#fff7ed]/70 border-2 border-[#ea580c] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#ea580c] text-white flex items-center justify-center">
              <Ms name="difference" className="text-[18px]" />
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-[#9a3412] font-bold">Suggested Decision: {label}</h3>
              <p className="text-[11px] text-[#c2410c]">Possible duplicate — confirm merge target</p>
            </div>
          </div>
        </div>
        <div className="text-[12px] text-[#9a3412] leading-relaxed bg-white/80 p-2 rounded border border-[#fed7aa]">
          <p>
            <strong>Verification Summary:</strong> {item.distinct_users} report
            {item.distinct_users === 1 ? '' : 's'} · best accuracy {meters != null ? `±${meters} m` : '—'}.
            {item.suggestion ? ` ${item.suggestion}` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (grade === 'weak') {
    return (
      <div className="p-3.5 rounded bg-[#fffbeb]/70 border-2 border-[#d97706] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#d97706] text-white flex items-center justify-center">
              <Ms name="warning_amber" className="text-[18px]" />
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-[#92400e] font-bold">Suggested Decision: {label}</h3>
              <p className="text-[11px] text-[#b45309]">Weak evidence — inspect photo and pins</p>
            </div>
          </div>
        </div>
        <div className="text-[12px] text-[#92400e] leading-relaxed bg-white/80 p-2 rounded border border-[#fde68a]">
          <p>
            <strong>Verification Summary:</strong> {item.distinct_users} report
            {item.distinct_users === 1 ? '' : 's'} · best accuracy {meters != null ? `±${meters} m` : '—'}.
            {!item.payload?.photoUrl ? ' No photo on this submission.' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (grade === 'strong' || strong(item)) {
    return (
      <div className="p-3.5 rounded bg-emerald-50/70 border-2 border-[#16a34a] shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#16a34a] text-white flex items-center justify-center">
              <Ms name="verified" className="text-[18px]" />
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-[#14532d] font-bold">
                Suggested Decision: {label || 'Approve — High Confidence'}
              </h3>
              <p className="text-[11px] text-[#166534]">Multi-source spatial consensus from live reports</p>
            </div>
          </div>
        </div>
        <div className="text-[12px] text-[#166534] leading-relaxed bg-white/80 p-2 rounded border border-[#bbf7d0]">
          <p>
            <strong>Verification Summary:</strong> Spatial consensus across {item.distinct_users} distinct
            report{item.distinct_users === 1 ? '' : 's'}. Best accuracy{' '}
            {meters != null ? `±${meters} m` : 'unavailable'}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 rounded bg-[#f5f5f4]/70 border-2 border-[#a8a29e] shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#57534e] text-white flex items-center justify-center">
            <Ms name="hourglass_empty" className="text-[18px]" />
          </div>
          <div>
            <h3 className="font-headline-sm text-headline-sm text-[#44403c] font-bold">Suggested Decision: {label}</h3>
            <p className="text-[11px] text-[#57534e]">Pending verification</p>
          </div>
        </div>
      </div>
      <div className="text-[12px] text-[#44403c] leading-relaxed bg-white/80 p-2 rounded border border-[#e7e5e4]">
        <p>
          <strong>Verification Summary:</strong> {item.distinct_users} report
          {item.distinct_users === 1 ? '' : 's'} · best accuracy {meters != null ? `±${meters} m` : '—'}.
        </p>
      </div>
    </div>
  );
}

function PhotoSlot({
  photoUrl,
  caption,
}: {
  photoUrl?: string | null;
  caption: string;
}) {
  return (
    <div className="border border-outline-variant rounded overflow-hidden bg-[#0f172a] flex flex-col group">
      <div className="relative h-32 w-full overflow-hidden bg-slate-800 flex items-center justify-center">
        {photoUrl ? (
          <img
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            src={photoUrl}
            alt=""
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#64748b]">
            <Ms name="image_not_supported" className="text-[28px]" />
            <span className="text-[10px] font-code-tabular">No photo</span>
          </div>
        )}
      </div>
      <div className="p-2 bg-white flex items-center justify-between text-[11px]">
        <div className="font-medium text-on-surface">{caption}</div>
        <div className="text-outline font-code-tabular">{photoUrl ? 'Attached' : 'Missing'}</div>
      </div>
    </div>
  );
}

export function PlacesReviewSplit({
  item,
  index,
  total,
  chips,
  editName,
  setEditName,
  showMerge = false,
  mergeId = '',
  setShowMerge,
  setMergeId,
  onApprove,
  onReject,
  onMerge,
  onSkip,
  onBack,
}: PlacesReviewSplitProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const meters = item?.best_accuracy_m ?? item?.payload?.accuracyM ?? null;
  const lat = item?.payload?.lat;
  const lng = item?.payload?.lng;
  const hasPin = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const typeLabel = item ? kindLabel(item, chips) : 'Place';
  const streetViewHref = hasPin ? `https://www.google.com/maps?q=${lat},${lng}` : null;
  const coordLabel = hasPin
    ? `${Number(lat).toFixed(4)}° N, ${Math.abs(Number(lng)).toFixed(4)}° W`
    : 'No coordinates';

  if (!item) {
    return (
      <div className="places-review-stitch bg-[#f8fafc] text-on-surface antialiased font-body-md text-body-md min-h-[640px] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-headline-sm text-headline-sm text-on-surface">No pin is waiting.</p>
          <p className="font-body-md text-body-md text-on-surface-variant">The queue is clear.</p>
          {onBack ? (
            <button
              type="button"
              className="h-8 px-3 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface rounded text-[12px] font-medium"
              onClick={onBack}
            >
              Back to queue
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="places-review-stitch bg-[#f8fafc] text-on-surface antialiased overflow-hidden select-none font-body-md text-body-md relative min-h-[720px] flex flex-col">
      <div className="flex items-center justify-between h-12 px-space-lg border-b border-outline-variant bg-surface-container-lowest shrink-0">
        <div className="flex items-center gap-space-md">
          <nav className="flex items-center gap-1.5 font-label-md text-label-md">
            {onBack ? (
              <button type="button" className="text-on-surface-variant font-medium hover:text-on-surface" onClick={onBack}>
                Review Queue
              </button>
            ) : (
              <span className="text-on-surface-variant font-medium">Review Queue</span>
            )}
            <span className="text-outline-variant font-normal">/</span>
            <span className="text-on-surface font-semibold truncate max-w-[420px]">
              Item #{item.place_id || item.id.slice(0, 8)}: {item.payload?.name || 'Unnamed'} ({typeLabel})
            </span>
          </nav>
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded border border-[#e7e5e4] bg-[#f5f5f4] text-[#57534e] font-label-sm text-label-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-[#57534e]" />
            <span>Pending Review</span>
          </div>
          <span className="text-on-surface-variant font-label-sm text-label-sm bg-surface-container px-2 py-0.5 rounded text-on-surface">
            Reviewing {Math.min(index + 1, Math.max(total, 1))} of {total}
          </span>
        </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden bg-[#f1f5f9] pb-14">
        <div className="flex-1 flex overflow-hidden">
          <section
            className="w-[52%] h-full relative bg-[#090d16] border-r border-[#cbd5e1] flex flex-col overflow-hidden"
            data-location={item.payload?.pcode || 'Jamaica'}
          >
            <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1 bg-[#0f172a]/90 backdrop-blur-md border border-[#334155] p-1 rounded shadow-lg pointer-events-auto">
                <button type="button" className="px-2.5 py-1 text-[11px] font-semibold rounded bg-secondary text-white shadow-sm flex items-center gap-1">
                  <Ms name="map" className="text-[14px]" />
                  <span>Vector Hybrid</span>
                </button>
                <a
                  className="px-2.5 py-1 text-[11px] font-medium rounded text-[#94a3b8] hover:text-white hover:bg-[#1e293b] flex items-center gap-1 transition-colors"
                  href={hasPin ? `https://www.openstreetmap.org/#map=18/${lat}/${lng}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Ms name="satellite_alt" className="text-[14px]" />
                  <span>Open OSM</span>
                </a>
              </div>
              <div className="flex items-center gap-1.5 bg-[#0f172a]/90 backdrop-blur-md border border-[#334155] p-1 rounded shadow-lg pointer-events-auto">
                {streetViewHref ? (
                  <a
                    className="px-2 py-1 text-[11px] font-medium text-emerald-400 hover:bg-[#1e293b] rounded flex items-center gap-1"
                    href={streetViewHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Ms name="streetview" className="text-[14px]" />
                    <span>Launch Street View</span>
                  </a>
                ) : (
                  <span className="px-2 py-1 text-[11px] font-medium text-[#64748b] rounded flex items-center gap-1">
                    <Ms name="streetview" className="text-[14px]" />
                    <span>No pin</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 w-full h-full relative overflow-hidden bg-[#0c1424]">
              {hasPin ? (
                <iframe
                  title="Proposed pin"
                  className="absolute inset-0 w-full h-full border-0"
                  src={osmEmbedSrc(Number(lat), Number(lng))}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#94a3b8]">
                  This submission has no map point yet.
                </div>
              )}

              {hasPin ? (
                <div className="absolute top-1/2 left-1/2 z-20 flex flex-col items-center pointer-events-none transform -translate-x-1/2 -translate-y-full">
                  <div className="bg-surface-container-lowest text-on-surface px-2.5 py-1.5 rounded shadow-xl border border-secondary flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${strong(item) ? 'bg-[#16a34a]' : 'bg-[#d97706]'}`} />
                    <div>
                      <div className="text-[11px] font-bold tracking-tight text-on-surface">{item.payload?.name || 'Unnamed place'}</div>
                      <div className="text-[9px] text-[#16a34a] font-semibold tracking-wide uppercase font-code-tabular">
                        {meters != null ? `Best ±${meters}m` : 'Proposed pin'}
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-secondary/30">
                      <Ms name="place" className="text-[18px]" />
                    </div>
                    <div className="w-1.5 h-3 bg-secondary mx-auto -mt-0.5 rounded-b-sm" />
                  </div>
                </div>
              ) : null}

              <div className="absolute left-3 bottom-12 z-20 bg-[#0f172a]/85 backdrop-blur-md border border-[#334155] rounded p-2 text-[10px] font-code-tabular text-[#94a3b8] space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] border border-white" />
                  <span className="text-white font-medium">Proposed pin</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>
                    {item.distinct_users} report{item.distinct_users === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-9 w-full bg-[#090d16] border-t border-[#1e293b] px-3 flex items-center justify-between text-[11px] font-code-tabular text-[#94a3b8] z-20">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-white">
                  <Ms name="pin_drop" className="text-[14px] text-secondary" />
                  <span>{coordLabel}</span>
                </div>
                <span className="text-[#334155]">|</span>
                <span>
                  DATUM: <strong className="text-[#cbd5e1]">WGS-84</strong>
                </span>
                <span className="text-[#334155]">|</span>
                <span>
                  Reports: <strong className="text-emerald-400">{item.distinct_users}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-medium">
                  ACCURACY: {meters != null ? `±${meters}m` : '—'}
                </span>
              </div>
            </div>
          </section>

          <section className="w-[48%] h-full overflow-y-auto custom-scrollbar p-space-md space-y-3 pb-16 bg-[#f8fafc]">
            <DecisionBanner item={item} />

            <div className="p-3.5 bg-surface-container-lowest border border-outline-variant rounded shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                <div className="flex items-center gap-2">
                  <Ms name="storefront" className="text-secondary text-[20px]" />
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Place Identity &amp; Metadata</h2>
                </div>
                <div className="flex items-center gap-1.5">
                  {item.payload?.brand ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
                      {item.payload.brand}
                    </span>
                  ) : null}
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]">
                    {typeLabel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-0.5" htmlFor="places-review-edit-name">
                    Place Name
                  </label>
                  <div className="font-headline-sm text-[14px] font-bold text-on-surface flex items-center gap-1.5">
                    <input
                      id="places-review-edit-name"
                      ref={nameRef}
                      className="w-full bg-transparent border-b border-outline-variant focus:border-secondary focus:outline-none font-bold text-[14px]"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                    {strong(item) ? (
                      <Ms name="check_circle" className="text-emerald-600 text-[16px]" />
                    ) : null}
                  </div>
                </div>
                <div>
                  <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-0.5">Operating Hours</label>
                  <div className="font-body-md text-body-md text-on-surface flex items-center gap-1">
                    <Ms name="schedule" className="text-[15px] text-[#16a34a]" />
                    <span className="font-semibold">{item.payload?.hours || '—'}</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-0.5">Classification</label>
                  <div className="font-body-md text-body-md text-on-surface">{typeLabel}</div>
                </div>
                <div className="col-span-2">
                  <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-0.5">Parish / code</label>
                  <div className="font-code-tabular text-[12px] text-on-surface bg-[#f8fafc] p-1.5 rounded border border-outline-variant/60 flex items-center justify-between">
                    <span>{item.payload?.pcode || '—'}</span>
                    {item.payload?.phone ? <span className="text-on-surface-variant">{item.payload.phone}</span> : null}
                  </div>
                </div>
                {item.payload?.services?.length ? (
                  <div className="col-span-2">
                    <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-0.5">Services</label>
                    <div className="font-body-md text-body-md text-on-surface">{item.payload.services.join(', ')}</div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-3.5 bg-surface-container-lowest border border-outline-variant rounded shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                <div className="flex items-center gap-2">
                  <Ms name="document_scanner" className="text-secondary text-[20px]" />
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Submitted Evidence &amp; Visual OCR</h2>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-code-tabular text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <Ms name="gps_fixed" className="text-[14px]" />
                  <span>{meters != null ? `±${meters}m best accuracy` : 'Accuracy unavailable'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <PhotoSlot photoUrl={item.payload?.photoUrl} caption="Station / storefront" />
                <PhotoSlot photoUrl={null} caption="Supporting evidence" />
              </div>

              <div>
                <label className="block font-label-sm text-label-sm uppercase tracking-wider text-outline mb-1.5">
                  Report corroboration
                </label>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between p-2 rounded bg-[#f8fafc] border border-outline-variant/60 text-[12px]">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">
                        {item.distinct_users}
                      </div>
                      <div>
                        <span className="font-semibold text-on-surface">Distinct reporters</span>
                        <span className="text-[10px] text-outline ml-1.5 font-code-tabular">
                          Queued {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-code-tabular text-on-surface-variant">
                        {meters != null ? `±${meters} m` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="absolute bottom-0 left-0 right-0 h-13 bg-surface-container-lowest border-t border-outline-variant px-space-lg flex items-center justify-between z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-label-md text-label-md text-on-surface font-semibold">
              Item {Math.min(index + 1, Math.max(total, 1))} of {total}
              {item.payload?.pcode ? ` in ${item.payload.pcode}` : ''}
            </span>
          </div>
          <span className="text-outline-variant">|</span>
          <div className="text-[11px] text-outline font-code-tabular">
            Sub ID: #{item.place_id || item.id.slice(0, 12)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-8 px-3 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            onClick={() => nameRef.current?.focus()}
          >
            <Ms name="edit" className="text-[16px]" />
            <span>Edit name</span>
            <kbd className="px-1 py-0.2 bg-[#f1f5f9] border border-[#cbd5e1] rounded text-[10px] font-code-tabular text-on-surface-variant">E</kbd>
          </button>
          <button
            type="button"
            className="h-8 px-3 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            onClick={onSkip}
          >
            <Ms name="redo" className="text-[16px]" />
            <span>Skip</span>
            <kbd className="px-1 py-0.2 bg-[#f1f5f9] border border-[#cbd5e1] rounded text-[10px] font-code-tabular text-on-surface-variant">N</kbd>
          </button>
          <div className="h-4 w-px bg-outline-variant mx-1" />
          <button
            type="button"
            className="h-8 px-3.5 bg-[#fff7ed] border border-[#ea580c] text-[#ea580c] hover:bg-[#ffedd5] rounded text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => {
              if (setShowMerge) setShowMerge(true);
              else onMerge();
            }}
          >
            <Ms name="merge" className="text-[16px]" />
            <span>Merge</span>
            <kbd className="px-1 py-0.2 bg-white border border-[#fed7aa] rounded text-[10px] font-code-tabular text-[#c2410c]">M</kbd>
          </button>
          <button
            type="button"
            className="h-8 px-3.5 bg-[#fef2f2] border border-[#dc2626] text-[#dc2626] hover:bg-[#fee2e2] rounded text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => onReject(item.id)}
          >
            <Ms name="close" className="text-[16px]" />
            <span>Reject</span>
            <kbd className="px-1 py-0.2 bg-white border border-[#fecaca] rounded text-[10px] font-code-tabular text-[#b91c1c]">R</kbd>
          </button>
          <button
            type="button"
            className="h-8 px-4 bg-[#16a34a] hover:bg-[#15803d] text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm ring-2 ring-emerald-500/20"
            onClick={() => onApprove(item.id, editName)}
          >
            <Ms name="check" className="text-[18px]" />
            <span>Approve</span>
            <kbd className="px-1.5 py-0.2 bg-[#15803d] border border-[#166534] rounded text-[10px] font-code-tabular text-white ml-1">A</kbd>
          </button>
        </div>
      </footer>

      {showMerge && setShowMerge && setMergeId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0f172a]/50 p-4">
          <form
            className="flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              onMerge();
            }}
          >
            <div className="flex items-start justify-between border-b border-[#e2e8f0] px-6 py-4">
              <div>
                <h3 className="text-lg font-bold">Merge into an existing place</h3>
                <p className="text-sm text-[#64748b]">Evidence from this submission moves onto the place id you enter.</p>
              </div>
              <button type="button" className="text-sm text-[#64748b]" onClick={() => setShowMerge(false)}>
                Close
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
              <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] p-4">
                <p className="text-[11px] font-semibold uppercase text-[#1d4ed8]">Submitted</p>
                <p className="mt-2 font-semibold">{item.payload?.name || 'Unnamed place'}</p>
                <p className="mt-1 font-mono text-xs text-[#475569]">
                  {hasPin ? `${lat}, ${lng}` : 'No pin'}
                </p>
              </div>
              <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                <label className="text-[11px] font-semibold uppercase text-[#15803d]" htmlFor="places-review-merge-into">
                  Existing place id
                </label>
                <input
                  id="places-review-merge-into"
                  className="mt-2 min-h-10 w-full rounded-lg border border-[#e2e8f0] bg-[#ffffff] px-3 font-mono text-sm"
                  value={mergeId}
                  onChange={(event) => setMergeId(event.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e2e8f0] px-6 py-4">
              <button type="button" className="min-h-10 rounded-lg border border-[#e2e8f0] px-4 text-sm" onClick={() => setShowMerge(false)}>
                Cancel
              </button>
              <button type="submit" className="min-h-10 rounded-lg px-4 text-sm text-white bg-[#ea580c]">
                Merge into existing place
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
