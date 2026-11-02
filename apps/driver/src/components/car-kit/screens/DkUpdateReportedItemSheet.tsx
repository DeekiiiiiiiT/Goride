/** Driver update reported item — Stitch DK7 (docs/stitch/roam-driver-app/car-kit/update_reported_item_sheet). */
import type { DriverReportRow } from '../../../services/driverInventoryApi';
import { useDriverReportUpdate, type ReportUpdateKind } from '../useDriverReportUpdate';

const KIND_OPTIONS: {
  id: ReportUpdateKind;
  title: string;
  hint: string;
  icon: string;
}[] = [
  {
    id: 'found_it',
    title: 'I found it',
    hint: "It's back in the car. The fleet will close the defect report.",
    icon: 'saved_search',
  },
  {
    id: 'got_replacement',
    title: 'I got a replacement',
    hint: 'You replaced it yourself. Add a photo of the new one for inspection log.',
    icon: 'swap_horiz',
  },
  {
    id: 'still_missing',
    title: 'Still missing',
    hint: "Remind the fleet it's still not in the vehicle. Keep defect open.",
    icon: 'hourglass_empty',
  },
];

function formatReportedDate(createdAt?: string) {
  if (!createdAt) return 'Reported recently';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'Reported recently';
  return `Reported ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function DkUpdateReportedItemSheet({
  report,
  offline,
  onClose,
  onSent,
}: {
  report: DriverReportRow;
  offline?: boolean;
  onClose?: () => void;
  onSent?: () => void;
}) {
  const flow = useDriverReportUpdate(report, onSent);
  const fixed = report.status === 'fixed' || flow.sent;
  const itemLabel = report.itemLabel ?? report.displayName ?? 'Kit item';
  const issueLabel = report.issue ?? 'Missing';
  const urgentSafety =
    /warning triangle|safety|emergency/i.test(itemLabel) || /missing|safety/i.test(issueLabel);
  const plateLabel = report.reportNo ? report.reportNo.replace(/^#?/i, '') : '';

  return (
    <div className="driver-car-kit-stitch fixed inset-0 z-[60] flex flex-col justify-end bg-inverse-surface/65 backdrop-blur-[2px]">
      <div className="max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-surface shadow-xl">
        <section
          aria-labelledby="sheet-title"
          className="relative flex max-w-full flex-col overflow-hidden bg-surface-container-lowest"
        >
          <div className="flex justify-center pb-2 pt-3">
            <div className="h-1.5 w-12 cursor-grab rounded-full bg-outline-variant/70" />
          </div>

          <div className="flex items-start justify-between px-gutter pb-space-sm pt-1">
            <div className="min-w-0 pr-space-xs">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined text-[20px] text-tertiary-container"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  warning
                </span>
                <h2
                  className="font-headline-sm text-headline-sm font-bold leading-tight text-on-surface"
                  id="sheet-title"
                >
                  Update your report
                </h2>
              </div>
              <p className="flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{itemLabel}</span>
                <span>·</span>
                <span>{issueLabel}</span>
                <span>·</span>
                <span className="text-outline">{formatReportedDate(report.createdAt)}</span>
              </p>
            </div>
            {onClose ? (
              <button
                type="button"
                aria-label="Close sheet"
                className="-mr-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-low text-on-surface transition-colors hover:bg-surface-container"
                onClick={onClose}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            ) : null}
          </div>

          <div className="flex max-h-[636px] flex-col gap-space-md overflow-y-auto px-gutter pb-space-lg">
            {offline ? (
              <div className="flex items-start gap-space-xs rounded-xl bg-tertiary-fixed p-space-sm text-on-tertiary-fixed shadow-sm">
                <span className="material-symbols-outlined mt-0.5 flex-shrink-0 text-[22px] text-tertiary-container">
                  wifi_off
                </span>
                <div className="min-w-0">
                  <p className="font-label-status text-label-status font-bold uppercase tracking-wider">
                    Saved — waiting to send
                  </p>
                  <p className="mt-0.5 font-body-sm text-body-sm leading-snug">
                    Weak connection detected along Highway 2000. Your update is stored locally and will sync
                    automatically when signal returns.
                  </p>
                </div>
              </div>
            ) : null}

            {fixed ? (
              <div className="flex flex-col items-center gap-space-xs rounded-2xl bg-primary-fixed/30 p-space-md text-center shadow-sm">
                <span
                  className="material-symbols-outlined text-[28px] text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                <p className="font-label-button text-[16px] font-bold leading-tight text-on-primary-fixed">
                  Update sent to fleet team
                </p>
                <p className="font-body-sm text-body-sm text-on-primary-fixed-variant">
                  Timeline updated. Awaiting fleet log closure.
                </p>
                <span className="rounded bg-surface-container-lowest px-2 py-0.5 font-label-status text-[11px] font-bold text-primary">
                  Awaiting fleet log closure
                </span>
              </div>
            ) : (
              <>
                {urgentSafety ? (
                  <div className="flex flex-col gap-space-xs rounded-2xl bg-secondary p-space-md text-on-secondary shadow-sm">
                    <div className="flex items-start gap-space-xs">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-container-lowest/20">
                        <span
                          className="material-symbols-outlined text-[20px] text-on-secondary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          emergency
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-label-button text-[15px] font-bold leading-snug text-on-secondary">
                          Safety item — do not drive without it
                        </p>
                        <p className="mt-1 font-body-sm text-body-sm leading-tight text-on-secondary/90">
                          Required by Jamaican Road Traffic Act. Fleet dispatch must authorize vehicle movement.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-space-sm pt-space-xs">
                      <span className="font-label-code text-label-code font-bold text-on-secondary">
                        876-555-0100
                      </span>
                      <a
                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-surface-container-lowest px-space-md font-label-button text-sm font-bold text-secondary shadow-sm"
                        href="tel:8765550100"
                      >
                        <span className="material-symbols-outlined text-[18px]">call</span>
                        Call fleet now
                      </a>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-space-sm rounded-2xl bg-gradient-to-br from-surface-container-lowest via-surface-container-lowest to-surface-container-low p-space-md shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-tertiary-fixed px-2.5 py-1 font-label-status text-label-status text-on-tertiary-fixed">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary-container" />
                        Reported
                      </span>
                      <span className="font-body-sm text-xs font-semibold text-on-surface-variant">
                        Sent → Seen by fleet
                      </span>
                    </div>
                    {plateLabel ? (
                      <span className="font-label-code text-label-code text-xs font-bold text-outline">
                        {plateLabel}
                      </span>
                    ) : null}
                  </div>
                  {report.fleetReply ? (
                    <div className="flex items-start gap-space-sm rounded-xl bg-surface-container-low p-space-sm">
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-fixed-dim/40 text-primary">
                        <span className="material-symbols-outlined text-[18px]">support_agent</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-label-button text-xs font-bold text-primary">Fleet Dispatcher</p>
                          {report.seenAt ? (
                            <span className="font-body-sm text-[11px] text-outline">Seen by fleet</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 font-body-sm text-body-sm leading-snug text-on-surface">
                          {report.fleetReply}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Fleet dispatch will reply here when they review your report.
                    </p>
                  )}
                </div>

                <label className="font-label-status text-label-status font-bold uppercase tracking-wider text-on-surface-variant">
                  What is the current status?
                </label>

                <div className="flex flex-col gap-space-sm">
                  {KIND_OPTIONS.map((opt) => {
                    const selected = flow.kind === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`flex min-h-[56px] cursor-pointer items-start justify-between gap-space-sm rounded-2xl p-space-md text-left transition-all ${
                          selected
                            ? 'bg-primary-fixed/20 shadow-md ring-1 ring-primary/20'
                            : 'bg-surface-container-lowest shadow-sm hover:bg-surface-container-low'
                        } ${opt.id === 'got_replacement' && selected ? 'flex-col' : ''}`}
                        onClick={() => flow.setKind(opt.id)}
                      >
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-space-sm">
                          <div className="flex min-w-0 items-start gap-space-sm">
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow-sm ${
                                selected && opt.id === 'got_replacement'
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container text-on-surface'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[22px]">{opt.icon}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p
                                  className={`font-label-button text-[16px] font-semibold ${
                                    selected && opt.id === 'got_replacement'
                                      ? 'font-bold text-primary'
                                      : 'text-on-surface'
                                  }`}
                                >
                                  {opt.title}
                                </p>
                                {selected && opt.id === 'got_replacement' ? (
                                  <span className="rounded-full bg-primary px-2 py-0.5 font-label-status text-[11px] font-bold text-on-primary">
                                    Active
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 font-body-sm text-body-sm leading-snug text-on-surface-variant">
                                {opt.hint}
                              </p>
                            </div>
                          </div>
                          <div
                            className={`mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                              selected ? 'bg-primary' : 'bg-surface-container'
                            }`}
                          >
                            {selected ? (
                              <span className="material-symbols-outlined text-[16px] font-bold text-on-primary">
                                check
                              </span>
                            ) : (
                              <div className="h-2.5 w-2.5 rounded-full bg-transparent" />
                            )}
                          </div>
                        </div>

                        {opt.id === 'got_replacement' && selected ? (
                          <>
                            <input
                              ref={flow.fileInputRef}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              onChange={(e) => flow.onPhotoSelected(e.target.files?.[0] ?? null)}
                            />
                            <div className="flex w-full flex-col gap-space-sm pt-space-xs">
                              <div className="flex items-center justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm">
                                <div className="flex min-w-0 items-center gap-space-sm">
                                  <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                                    {flow.photoPreview ? (
                                      <>
                                        <img
                                          alt="Replacement item"
                                          className="h-full w-full object-cover"
                                          src={flow.photoPreview}
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[10px] font-bold text-on-primary">
                                          VERIFIED
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                                        <span className="material-symbols-outlined text-[28px]">
                                          photo_camera
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    {flow.photoFile ? (
                                      <>
                                        <p className="flex items-center gap-1 font-label-button text-xs font-bold text-primary">
                                          <span className="material-symbols-outlined text-[16px]">
                                            check_circle
                                          </span>
                                          Photo attached
                                        </p>
                                        <p className="mt-0.5 truncate font-label-code text-xs font-semibold text-on-surface">
                                          {flow.photoFile.name}
                                        </p>
                                        <p className="font-body-sm text-[12px] text-outline">
                                          Clear reflective surface verified
                                        </p>
                                      </>
                                    ) : (
                                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                                        Photo required for replacements
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="flex h-10 flex-shrink-0 items-center gap-1 rounded-lg bg-surface-container px-3 font-label-button text-xs font-semibold text-on-surface"
                                  onClick={() => (flow.photoFile ? flow.clearPhoto() : flow.pickPhoto())}
                                >
                                  <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                                  {flow.photoFile ? 'Retake' : 'Add photo'}
                                </button>
                              </div>
                              <div>
                                <label
                                  className="mb-1 block font-body-sm text-xs font-semibold text-on-surface-variant"
                                  htmlFor="replacement-source"
                                >
                                  Where did you get it? (optional)
                                </label>
                                <input
                                  id="replacement-source"
                                  className="h-[48px] w-full rounded-xl bg-surface-container-lowest px-space-sm font-body-sm text-body-sm text-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                  placeholder="e.g. Bought at Shell Spanish Town Road"
                                  type="text"
                                  value={flow.source}
                                  onChange={(e) => flow.setSource(e.target.value)}
                                />
                              </div>
                            </div>
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1.5 pt-space-xs">
                  <label
                    className="font-label-status text-label-status font-bold uppercase tracking-wider text-on-surface-variant"
                    htmlFor="driver-notes"
                  >
                    Anything else to tell dispatch? (optional)
                  </label>
                  <textarea
                    className="w-full resize-none rounded-xl bg-surface-container-lowest p-space-sm font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
                    id="driver-notes"
                    placeholder="e.g. Checked trunk side pocket and spare tire compartment, nil found."
                    rows={2}
                    value={flow.note}
                    onChange={(e) => flow.setNote(e.target.value)}
                  />
                </div>
              </>
            )}

            {flow.error ? (
              <p
                className="rounded-lg bg-error-container px-space-sm py-2 font-body-sm text-body-sm text-on-error-container"
                role="alert"
              >
                {flow.error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-space-xs bg-surface-container-lowest px-gutter pb-space-md pt-space-xs shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
            {!fixed ? (
              <>
                <button
                  type="button"
                  disabled={!flow.canSubmit || flow.sending || flow.photoUploading}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary font-label-button text-label-button font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-[0.99] disabled:opacity-60"
                  onClick={() => void flow.submit()}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {flow.sending || flow.photoUploading ? 'progress_activity' : 'send'}
                  </span>
                  {flow.photoUploading
                    ? 'Uploading photo…'
                    : flow.sending
                      ? 'Sending…'
                      : 'Send update to fleet'}
                </button>
                <p className="px-space-xs text-center font-body-sm text-[12px] leading-tight text-outline">
                  Updates alert dispatch immediately. Does not alter official fleet inventory records.
                </p>
              </>
            ) : (
              <button
                type="button"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-surface-container font-label-button text-label-button font-bold text-on-surface hover:bg-surface-container-high"
                onClick={onClose}
              >
                Done & return to kit
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
