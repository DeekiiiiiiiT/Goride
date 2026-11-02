/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapKitCompareForm, type KitCompareRow } from './useGapKitCompareForm';
import { useGapModalSteps } from './useGapModalSteps';

function changeStatusLabel(row: KitCompareRow) {
  if (row.changeStatus === 'added') return '+ Added';
  if (row.changeStatus === 'removed') return 'Removed';
  if (row.changeStatus === 'changed') return 'Changed';
  return 'Unchanged';
}

function rowRowClass(row: KitCompareRow) {
  if (row.changeStatus === 'changed') return 'diff-row row-changed bg-secondary-fixed/20 hover:bg-secondary-fixed/30 transition-colors';
  if (row.changeStatus === 'added') return 'diff-row row-changed bg-primary-fixed/20 hover:bg-primary-fixed/30 transition-colors';
  if (row.changeStatus === 'removed') return 'diff-row row-changed bg-error-container/20 hover:bg-error-container/30 transition-colors';
  return 'diff-row row-unchanged hover:bg-surface-container-low/50 transition-colors';
}

export function GapKitCompare(p: { onClose?: () => void }) {
  const form = useGapKitCompareForm();
  const modal = useGapModalSteps();
  const close = () => p.onClose?.();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="KitCompare">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="flex flex-col gap-space-sm">
        <div className="flex items-center gap-space-xs text-on-surface-variant">
        <a className="inline-flex items-center gap-1 font-body-sm text-body-sm hover:text-primary transition-colors" href="#">
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Back to Vehicle Kits</span>
        </a>
        <span className="text-outline-variant">/</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Rideshare car kit</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-space-lg">
        <div className="flex items-center gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[24px]">compare_arrows</span>
        </div>
        <div>
        <div className="flex items-center gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">Kit version compare: Rideshare car kit</h1>
        <span className="bg-surface-container-high text-on-surface font-caption text-caption px-space-sm py-0.5 rounded font-semibold uppercase tracking-wider">SKU-KIT-RIDE-01</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Analyze structural inventory variances, depot procurement needs, and fleet compliance deltas before applying changes.</p>
        </div>
        </div>
        <div className="flex items-center gap-space-sm">
        <span className="inline-flex items-center gap-1 font-label-code text-caption px-space-md py-1.5 rounded bg-surface-container text-on-surface font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    Rollout scope: {form.diffCount} change{form.diffCount === 1 ? '' : 's'}
                  </span>
        <button type="button" className="bg-surface-container-lowest hover:bg-surface-container text-on-surface p-2 rounded transition-colors" title="Export Diff Manifest" onClick={() => form.exportDiffManifest()}>
        <span className="material-symbols-outlined text-[18px]">download</span>
        </button>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-lg">

        <div className="flex flex-wrap items-center gap-space-md">

        <div className="bg-surface-container-low rounded-lg p-space-sm flex items-center gap-space-md min-w-[280px]">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">history</span>
        </div>
        <div className="flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Base Specification</span>
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-label-code font-bold text-on-surface">{form.leftVersion}</span>
        <span className="text-caption font-caption text-on-surface-variant">(Active)</span>
        </div>
        </div>
        </div>
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant font-label-code text-caption font-semibold">
                  vs
                </div>

        <div className="bg-surface-container-low rounded-lg p-space-sm flex items-center gap-space-md min-w-[320px]">
        <div className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[18px]">new_releases</span>
        </div>
        <div className="flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Target Specification</span>
        <div className="flex items-center gap-space-xs">
        <span className="font-label-code text-label-code font-bold text-primary">{form.rightVersion}</span>
        <span className="inline-flex items-center font-caption text-caption px-1.5 py-0.2 bg-secondary-container text-on-secondary-fixed font-semibold rounded">Draft</span>
        </div>
        </div>
        </div>
        </div>

        <div className="flex items-center bg-surface-container p-1 rounded-lg self-start lg:self-auto">
        <button type="button" onClick={() => form.setFilter('all')} className={`filter-tab px-space-md py-1.5 rounded font-body-sm text-body-sm transition-all ${form.filter === 'all' ? 'font-semibold bg-surface-container-lowest text-primary shadow-sm' : 'font-medium text-on-surface-variant hover:text-on-surface'}`} id="filter-all">
                  All items ({form.totalCount})
                </button>
        <button type="button" onClick={() => form.setFilter('diff')} className={`filter-tab px-space-md py-1.5 rounded font-body-sm text-body-sm transition-all ${form.filter === 'diff' ? 'font-semibold bg-surface-container-lowest text-primary shadow-sm' : 'font-medium text-on-surface-variant hover:text-on-surface'}`} id="filter-diff">
                  Only changes ({form.diffCount})
                </button>
        </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">

        <div className="xl:col-span-8 flex flex-col gap-space-md">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">Specification Matrix</span>
        <div className="flex items-center gap-space-md font-caption text-caption text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-surface-dim"></span> No delta</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary-fixed"></span> Quantity delta</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary-container"></span> Added line</span>
        </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
        <thead>
        <tr className="bg-surface-container-lowest text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-lg font-semibold">Kit Item & SKU</th>
        <th className="py-space-md px-space-md font-semibold text-center w-36">v3 (Active)</th>
        <th className="py-space-md px-space-md font-semibold text-center w-36">v4 (Draft)</th>
        <th className="py-space-md px-space-md font-semibold w-32">Change Status</th>
        <th className="py-space-md px-space-lg font-semibold">Impact Note</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">
        {form.rows.length === 0 ? (
        <tr>
        <td className="py-space-xl px-space-lg text-center text-on-surface-variant" colSpan={5}>No kit compare rows yet. Load two versions to see the specification matrix.</td>
        </tr>
        ) : form.rows.map((row) => (
        <tr key={row.key} className={rowRowClass(row)}>
        <td className="py-space-md px-space-lg">
        <div className="flex flex-col">
        <span className="font-medium text-primary">{row.name}</span>
        <span className="font-label-code text-caption text-on-surface-variant">{row.sku}</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-on-surface-variant">{row.leftQty}</td>
        <td className="py-space-md px-space-md text-center font-label-code text-label-code text-primary font-medium">{row.rightQty}</td>
        <td className="py-space-md px-space-md">
        <span className="inline-flex items-center font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">{changeStatusLabel(row)}</span>
        </td>
        <td className="py-space-md px-space-lg text-on-surface-variant">{row.impactNote}</td>
        </tr>
        ))}
        </tbody>
        </table>
        </div>
        <div className="px-space-lg py-space-sm bg-surface-container-lowest flex items-center justify-between text-on-surface-variant font-caption text-caption">
        <span>Displaying filtered kit inventory items</span>
        <span className="font-label-code">Hash: v3.89cf...v4.120a</span>
        </div>
        </div>

        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-start gap-space-md">
        <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary flex-shrink-0">
        <span className="material-symbols-outlined text-[18px]">inventory</span>
        </div>
        <div className="flex flex-col gap-1">
        <span className="font-body-sm text-body-sm font-semibold text-primary">Depot stock availability</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Stock levels for changed kit lines are checked at publish time against depot balances.
                    </p>
        </div>
        </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-lg">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[20px] text-primary">analytics</span>
        <h2 className="font-headline-sm text-headline-sm text-primary">Fleet Rollout Impact</h2>
        </div>
        <span className="font-caption text-caption px-space-sm py-0.5 rounded bg-surface-container font-medium text-on-surface">Compliance</span>
        </div>

        <div className="grid grid-cols-1 gap-space-sm">
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Affected Vehicles</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-headline-sm text-headline-sm font-bold text-primary">{form.affectedVehicleCount} active cars</span>
        <span className="font-label-code text-caption text-on-surface-variant">{form.affectedTemplateLabel}</span>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Additional Items Required</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-headline-sm text-headline-sm font-bold text-primary">{form.additionalUnitsLabel} units</span>
        <span className="font-caption text-caption text-on-surface-variant">2 Triangles + Optional</span>
        </div>
        </div>
        <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col">
        <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Estimated Procurement Value</span>
        <div className="flex items-baseline justify-between mt-1">
        <span className="font-label-price text-headline-sm text-primary">{form.kitValuationLabel}</span>
        <span className="font-caption text-caption text-on-surface-variant">Depot landed cost</span>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container flex flex-col gap-space-sm">
        <div className="flex items-center justify-between font-caption text-caption">
        <span className="font-semibold text-primary">Average Fleet Kit Readiness</span>
        <span className="font-label-code text-on-surface-variant font-medium">{form.fleetReadinessLabel} → {form.projectedReadinessLabel}</span>
        </div>
        <div className="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden flex">
        <div className="h-full bg-primary" style={{ width: `${form.primaryBarPct}%` }}></div>
        <div className="h-full bg-secondary-fixed-dim" style={{ width: `${form.secondaryBarPct}%` }}></div>
        </div>
        <div className="flex justify-between items-center text-[10px] font-label-code text-on-surface-variant">
        <span>75% v4 Compliant</span>
        <span>10% Missing Triangle</span>
        <span>15% Missing Baseline</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">Vehicle rollout</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant p-space-md rounded-lg bg-surface-container-low">
                      {form.diffCount > 0
                        ? `${form.diffCount} specification change${form.diffCount === 1 ? '' : 's'} will affect assigned vehicles after publish.`
                        : 'No specification changes to roll out yet.'}
                    </p>
        </div>

        <div className="bg-surface-container p-space-md rounded-lg flex items-start gap-space-sm text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0 mt-0.5">info</span>
        <div className="flex flex-col gap-0.5">
        <span className="font-caption text-caption font-bold uppercase tracking-wider text-on-surface">Operational Procedure</span>
        <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                        Updating kit version does not automatically issue stock. Missing items will trigger alerts on the Vehicle Kits and Overview tabs.
                      </p>
        </div>
        </div>
        </div>
        </div>
        </div>

        <div className="sticky bottom-4 z-40 bg-surface-container-lowest rounded-xl shadow-xl p-space-md flex flex-wrap items-center justify-between gap-space-md mt-space-md">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-primary font-body-sm text-body-sm font-medium transition-colors" href="#">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>Back to kit editor</span>
        </a>
        <div className="flex flex-wrap items-center gap-space-sm">
        <button type="button" className="bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg transition-colors" onClick={close}>
                  Keep editing draft
                </button>
        <button type="button" disabled={!form.canPublish || form.submit.saving} onClick={() => void form.saveInactive()} className="bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg shadow-sm transition-colors disabled:opacity-60">
                  Save as inactive v4
                </button>
        <button type="button" disabled={!form.canPublish || form.submit.saving} onClick={() => modal.openConfirm()} className="bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold px-space-lg py-2.5 rounded-lg flex items-center gap-space-xs transition-transform active:scale-95 shadow-md disabled:opacity-60">
        <span className="material-symbols-outlined text-[18px]">publish</span>
        <span>Apply draft version</span>
        </button>
        </div>
        </div>
        </div>

        <div className={`${modal.confirmOpen ? 'flex' : 'hidden'} fixed inset-0 z-50 items-center justify-center p-4 bg-primary/40 backdrop-blur-sm`} id="confirmation-modal">
        <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-lg w-full p-space-xl flex flex-col gap-space-lg">
        <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[20px]">warning</span>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-primary p-1" onClick={() => modal.closeConfirm()}>
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>
        <div className="flex flex-col gap-space-xs">
        <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Apply Specification Version 4?</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  This will update the active specification for <span className="font-semibold text-primary">Rideshare car kit</span> across 2 vehicles. 
                  Assigned vehicles may show as partially stocked until changed lines are verified in the depot.
                </p>
        </div>
        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-1 font-label-code text-caption">
        <div className="flex justify-between text-on-surface">
        <span>Target Vehicles:</span>
        <span className="font-bold">Assigned fleet units</span>
        </div>
        <div className="flex justify-between text-on-surface">
        <span>Required Actions:</span>
        <span className="font-bold text-primary">Issue +2 Triangles</span>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-xs">
        <button type="button" className="px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-primary font-medium transition-colors" onClick={() => modal.closeConfirm()}>
                  Cancel
                </button>
        <button type="button" className="bg-primary hover:bg-primary/90 text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold shadow transition-transform active:scale-95" onClick={() => void form.publishKitTemplate().then(() => modal.closeConfirm())}>
                  Confirm Rollout
                </button>
        </div>
        </div>
        </div>


        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
