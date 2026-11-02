/** Driver update reported item — wired to fleet inventory API (audit R18). */
import type { DriverReportRow } from '../../../services/driverInventoryApi';
import { useDriverReportUpdate, type ReportUpdateKind } from '../useDriverReportUpdate';

const KIND_OPTIONS: { id: ReportUpdateKind; title: string; hint: string; icon: string }[] = [
  { id: 'found_it', title: 'Found it', hint: 'Item is back in the vehicle.', icon: 'check_circle' },
  {
    id: 'got_replacement',
    title: 'Got a replacement',
    hint: 'You replaced the item yourself or picked one up.',
    icon: 'swap_horiz',
  },
  {
    id: 'still_missing',
    title: 'Still missing',
    hint: 'Remind fleet the item is still not in the vehicle.',
    icon: 'hourglass_empty',
  },
];

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
  const issueLabel = report.issue ?? 'Reported';

  return (
    <div className="driver-car-kit-stitch fixed inset-0 z-[60] flex flex-col justify-end bg-inverse-surface/65">
      <div className="max-h-[92vh] overflow-y-auto rounded-t-2xl bg-surface shadow-xl">
        <section
          aria-labelledby="sheet-title"
          className="relative flex max-w-full flex-col overflow-hidden bg-surface-container-lowest"
        >
          <div className="flex justify-center pb-2 pt-3">
            <div className="h-1.5 w-12 rounded-full bg-outline-variant/70" />
          </div>

          <div className="flex items-start justify-between px-gutter pb-space-sm pt-1">
            <div className="min-w-0 pr-space-xs">
              <h2
                className="font-headline-sm text-headline-sm font-bold leading-tight text-on-surface"
                id="sheet-title"
              >
                Update your report
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{itemLabel}</span>
                <span>·</span>
                <span>{issueLabel}</span>
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
            {fixed ? (
              <div className="rounded-2xl bg-primary-fixed/30 p-space-md text-center shadow-sm">
                <p className="font-body-sm text-body-sm text-on-surface">Update sent to fleet.</p>
              </div>
            ) : (
              <>
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
                            ? 'bg-primary-container/40 shadow-sm ring-2 ring-primary'
                            : 'bg-surface-container-lowest shadow-sm hover:bg-surface-container-low'
                        }`}
                        onClick={() => flow.setKind(opt.id)}
                      >
                        <div className="flex min-w-0 items-start gap-space-sm">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
                            <span className="material-symbols-outlined text-[22px]">{opt.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-label-button text-[16px] font-semibold text-on-surface">
                              {opt.title}
                            </p>
                            <p className="mt-0.5 font-body-sm text-body-sm leading-snug text-on-surface-variant">
                              {opt.hint}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {flow.kind === 'got_replacement' ? (
                  <>
                    <input
                      ref={flow.fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => flow.onPhotoSelected(e.target.files?.[0] ?? null)}
                    />
                    <div className="flex flex-col gap-space-sm pt-space-xs">
                      <div className="flex items-center justify-between gap-space-sm rounded-xl bg-surface-container-lowest p-space-sm shadow-sm">
                        <div className="flex min-w-0 items-center gap-space-sm">
                          <div className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                            {flow.photoPreview ? (
                              <img
                                alt="Replacement item"
                                className="h-full w-full object-cover"
                                src={flow.photoPreview}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
                                <span className="material-symbols-outlined text-[28px]">photo_camera</span>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            {flow.photoFile ? (
                              <>
                                <p className="flex items-center gap-1 font-label-button text-xs font-bold text-primary">
                                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                  Photo attached
                                </p>
                                <p className="mt-0.5 truncate font-label-code text-xs font-semibold text-on-surface">
                                  {flow.photoFile.name}
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
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-status text-label-status font-bold uppercase tracking-wider text-on-surface-variant">
                          Where did you get it?
                        </label>
                        <input
                          className="h-[48px] w-full rounded-xl bg-surface-container-lowest px-space-sm font-body-sm text-body-sm text-on-surface shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="e.g. Main store pickup"
                          type="text"
                          value={flow.source}
                          onChange={(e) => flow.setSource(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <label
                    className="font-label-status text-label-status font-bold uppercase tracking-wider text-on-surface-variant"
                    htmlFor="driver-notes"
                  >
                    Anything else to tell dispatch? (optional)
                  </label>
                  <textarea
                    className="w-full resize-none rounded-xl bg-surface-container-lowest p-space-sm font-body-sm text-body-sm text-on-surface shadow-sm placeholder:text-outline-variant focus:outline-none focus:ring-2 focus:ring-primary"
                    id="driver-notes"
                    rows={2}
                    value={flow.note}
                    onChange={(e) => flow.setNote(e.target.value)}
                  />
                </div>
              </>
            )}

            {flow.error ? (
              <p className="rounded-lg bg-error-container px-space-sm py-2 font-body-sm text-body-sm text-on-error-container" role="alert">
                {flow.error}
              </p>
            ) : null}
            {offline ? (
              <p className="font-body-sm text-body-sm text-amber-800">
                Offline — your update queues and sends when you reconnect.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-space-xs bg-surface-container-lowest px-gutter pb-space-md pt-space-xs shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
            {!fixed ? (
              <button
                type="button"
                disabled={!flow.canSubmit || flow.sending || flow.photoUploading}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary font-label-button text-label-button font-bold text-on-primary shadow-sm transition-all hover:bg-primary-container active:scale-[0.99] disabled:opacity-60"
                onClick={() => void flow.submit()}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {flow.sending || flow.photoUploading ? 'progress_activity' : 'send'}
                </span>
                {flow.photoUploading ? 'Uploading photo…' : flow.sending ? 'Sending…' : 'Send update to fleet'}
              </button>
            ) : (
              <button
                type="button"
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-surface-container font-label-button text-label-button font-bold text-on-surface"
                onClick={onClose}
              >
                Done
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
