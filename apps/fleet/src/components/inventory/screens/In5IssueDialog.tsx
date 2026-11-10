/** Ported from Stitch — do not simplify layout (audit §0.4). Rows and payload are the same ticked lines (IV-07). */
import { useIn5IssueForm } from './hooks/useIn5IssueForm';

export function In5IssueDialog() {
  const form = useIn5IssueForm();
  const { shell, live } = form;
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root w-full">
      <div className="relative w-full max-w-[848px] bg-surface-container-lowest rounded-xl shadow-xl mx-auto overflow-hidden" data-stitch-data-stitch-id="issue-dialog">

      <div className="p-space-xl bg-surface-container-lowest">
      <div className="flex items-start justify-between gap-space-md">
      <div className="space-y-1">
      <div className="flex items-center gap-space-sm">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-primary-container text-on-primary">
      <span aria-hidden="true" className="material-symbols-outlined text-[17px]">inventory_2</span>
      </span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Issue to cars</h2>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Tick the missing kit lines to send from the store to each car.
                  </p>
      </div>
      <button type="button" onClick={() => shell.closeModal()} aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition-colors">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      </div>

      <div className="px-space-xl pb-space-lg space-y-space-md max-h-[calc(86vh-200px)] overflow-y-auto">

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
      <div className="flex flex-wrap items-center gap-y-1 gap-x-space-md font-body-sm text-body-sm text-on-surface">
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Kit:</span>
      <span className="font-body-sm font-semibold text-on-surface">{form.kitName}</span>
      <span className="font-label-code text-caption bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">({form.kitLineCount} items)</span>
      </div>
      <div className="h-3 w-px bg-surface-dim hidden md:block"></div>
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Store:</span>
      <span className="font-body-sm text-on-surface">{form.storeName}</span>
      </div>
      <div className="h-3 w-px bg-surface-dim hidden md:block"></div>
      <div className="flex flex-wrap items-center gap-space-xs">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Targets:</span>
      {live.kitVehicles.map((v) => (
      <span key={v.vehicleId} className="inline-flex items-center gap-1">
      <span className="font-label-plate text-[12px] bg-surface-container-lowest px-1.5 py-0.5 rounded">{v.plate}</span>
      <span className="text-caption text-on-surface-variant">({v.pct}%)</span>
      </span>
      ))}
      </div>
      </div>
      <label className="flex items-center gap-space-xs font-caption text-caption text-secondary">
      <span className="uppercase font-semibold">Car</span>
      <select
        className="bg-surface-container-lowest rounded-lg px-2 py-1 font-body-sm text-on-surface"
        value={form.carFilter}
        onChange={(e) => form.setCarFilter(e.target.value)}
        aria-label="Choose car"
      >
      <option value="">All cars</option>
      {live.kitVehicles.map((v) => (
      <option key={v.vehicleId} value={v.vehicleId}>{v.plate}</option>
      ))}
      </select>
      </label>
      </div>

      <div className="bg-tertiary-fixed rounded-xl p-space-md flex items-start justify-between gap-space-md">
      <div className="flex items-start gap-space-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-on-tertiary-fixed-variant mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-tertiary-fixed">
                      {form.uncoverable.length > 0
                        ? `${form.uncoverable.length} line${form.uncoverable.length === 1 ? '' : 's'} short in store.`
                        : 'The store can cover what is shown.'}
                    </div>
      <p className="font-body-sm text-body-sm text-on-tertiary-fixed-variant mt-0.5">
                      {form.shortfallSentence}
                    </p>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
      <th className="py-space-sm px-space-md font-semibold w-10"><span className="sr-only">Issue</span></th>
      <th className="py-space-sm px-space-md font-semibold">Car</th>
      <th className="py-space-sm px-space-md font-semibold">Item</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">Needs</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">In Store</th>
      <th className="py-space-sm px-space-sm font-semibold text-right">Will Issue</th>
      <th className="py-space-sm px-space-md font-semibold text-right">Result / Status</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">

      {form.rows.length === 0 ? (
      <tr>
      <td colSpan={7} className="py-space-lg px-space-md font-body-sm text-body-sm text-on-surface-variant text-center">
                      No kit gaps to issue right now.
                    </td>
      </tr>
      ) : (
      form.rows.map((row) => {
        const isTicked = form.ticked.has(row.key);
        const tickable = form.canTick(row);
        const inStore = form.inStoreFor(row);
        return (
      <tr key={row.key} className={`transition-colors ${tickable ? 'hover:bg-surface-container-lowest/80' : 'opacity-60'}`} data-testid="issue-row" data-item={row.cell.label} data-plate={row.cell.plate}>
      <td className="py-space-sm px-space-md">
      {row.fromStock ? (
      <input
        type="checkbox"
        className="h-4 w-4 rounded accent-primary cursor-pointer disabled:cursor-not-allowed"
        checked={isTicked}
        disabled={!tickable || shell.readOnly}
        onChange={() => form.toggle(row)}
        aria-label={`Issue ${row.cell.label} to ${row.cell.plate}`}
      />
      ) : null}
      </td>
      <td className="py-space-sm px-space-md">
      <span className="font-label-plate text-[13px] text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded">{row.cell.plate}</span>
      </td>
      <td className="py-space-sm px-space-md">
      <div className="font-body-md font-medium text-on-surface">{row.cell.label}</div>
      </td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-on-surface">{row.need}</td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-on-surface-variant">{row.fromStock ? inStore : '—'}</td>
      <td className="py-space-sm px-space-sm text-right font-label-code text-secondary">{isTicked ? row.need : 0}</td>
      <td className="py-space-sm px-space-md text-right">
      {!row.fromStock ? (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-secondary bg-surface-container px-2 py-0.5 rounded-full">
      <span aria-hidden="true" className="material-symbols-outlined text-[12px]">link</span>
                            Set up on the {row.cell.label === 'Fuel card' ? 'Fuel Cards' : 'Toll Tags'} page
                          </span>
      ) : !tickable ? (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-error bg-error-container/50 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            {inStore} in store — receive first
                          </span>
      ) : isTicked ? (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-primary bg-primary-fixed px-2 py-0.5 rounded-full font-bold">
      <span aria-hidden="true" className="material-symbols-outlined text-[12px]">check</span>
                            Will issue
                          </span>
      ) : (
      <span className="inline-flex items-center gap-1 font-caption text-caption text-secondary bg-surface-container px-2 py-0.5 rounded-full">
                            Not ticked
                          </span>
      )}
      </td>
      </tr>
        );
      })
      )}
      </tbody>
      </table>
      </div>
      </div>

      {form.submit.error ? (
      <div className="bg-error-container/50 text-error rounded-xl p-space-md font-body-sm" role="alert">{form.submit.error}</div>
      ) : null}

      <div className="bg-surface-container p-space-md rounded-xl flex items-center justify-between gap-space-md">
      <div className="font-caption text-caption text-on-surface">
      Every issue is recorded in Movements.
      </div>
      <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-primary font-caption text-caption font-semibold whitespace-nowrap transition-colors" onClick={() => shell.closeAndGoToTab('movements')}>
                  View in Movements →
                </button>
      </div>
      </div>

      <div className="px-space-xl py-space-md bg-surface-container-lowest flex items-center justify-between">
      <div className="font-label-code text-caption text-secondary">
                {form.totalUnits} unit{form.totalUnits === 1 ? '' : 's'} to {form.tickedCars} car{form.tickedCars === 1 ? '' : 's'}
              </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-md py-2 rounded-lg bg-error-container text-error hover:bg-error-container/80 font-body-sm text-body-sm font-semibold transition-colors" onClick={() => form.close()}>
                  Cancel
                </button>
      {!shell.readOnly ? (
      <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-space-sm shadow-sm active:scale-[0.98] transition-all disabled:opacity-60" data-stitch-data-stitch-id="issue-btn" disabled={!form.canIssue || form.submit.saving} onClick={() => void form.issue().catch(() => undefined)}>
      <span aria-hidden="true" className="material-symbols-outlined text-[17px]">{form.submit.saving ? 'progress_activity' : 'send'}</span>
      <span>{form.submit.saving ? 'Issuing…' : `Issue ${form.ticked.size} line${form.ticked.size === 1 ? '' : 's'}`}</span>
      </button>
      ) : null}
      </div>
      </div>
      </div>
    </div>
  );
}
