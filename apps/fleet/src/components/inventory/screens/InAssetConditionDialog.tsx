/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { GapSubmitError } from '../gap/GapLoadState';
import { ASSET_CONDITION_STATUSES, useInAssetConditionForm } from './hooks/useInAssetConditionForm';

export function InAssetConditionDialog() {
  const form = useInAssetConditionForm();
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root w-full max-w-lg mx-auto">
      <GapSubmitError message={form.submit.error} />
      <div className="bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden">
        <div className="p-space-xl border-b border-surface-container flex items-start justify-between gap-space-md">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Update condition</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Record status change for <span className="font-semibold text-on-surface">{form.assetLabel}</span>.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            onClick={() => form.shell.closeModal()}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="p-space-xl flex flex-col gap-space-md">
          <div className="flex flex-col gap-1.5">
            <label className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Status</label>
            <select
              className="w-full bg-surface-container-low text-on-surface font-body-sm rounded-lg px-space-md py-2"
              value={form.status}
              onChange={(e) => form.setStatus(e.target.value)}
            >
              {ASSET_CONDITION_STATUSES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Note (required)</label>
            <textarea
              className="w-full min-h-[88px] bg-surface-container-low rounded-lg px-space-md py-2 font-body-sm text-on-surface resize-none"
              value={form.note}
              onChange={(e) => form.setNote(e.target.value)}
              placeholder="What changed and who reported it"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Photo path (optional)</label>
            <input
              className="w-full bg-surface-container-low rounded-lg px-space-md py-2 font-body-sm text-on-surface"
              value={form.photoPath}
              onChange={(e) => form.setPhotoPath(e.target.value)}
              placeholder="storage://… or uploaded file path"
            />
          </div>
        </div>
        <div className="px-space-xl py-space-md bg-surface-container-low flex justify-end gap-space-sm">
          <button type="button" className="px-space-lg py-2 rounded-lg font-body-sm text-on-surface hover:bg-surface-container" onClick={() => form.shell.closeModal()}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!form.canSubmit || form.submit.saving}
            className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm font-semibold disabled:opacity-60"
            onClick={() => void form.submitCondition()}
          >
            {form.submit.saving ? 'Saving…' : 'Save condition'}
          </button>
        </div>
      </div>
    </div>
  );
}
