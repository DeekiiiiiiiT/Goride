// Stitch: dominion-redesign/s36e-publish-dialog
import { useState } from 'react';
import { canConfirmPublish, sampleNames, type DraftChecks, type ImpactView } from './levelsFormat';

export function PublishDialog({
  name,
  version,
  checks,
  impact,
  impactLoaded,
  onCancel,
  onConfirm,
}: {
  name: string;
  version: number;
  checks: DraftChecks | null;
  impact: ImpactView | null;
  impactLoaded: boolean;
  onCancel: () => void;
  onConfirm: (typed: string) => void;
}) {
  const warnings = warningLines(checks);
  const [ticked, setTicked] = useState<boolean[]>(() => warnings.map(() => false));
  const [typed, setTyped] = useState('');
  const needsName = Boolean(impact?.needs_typed_name ?? true);
  const ready = canConfirmPublish({
    impactLoaded,
    warnings,
    ticked: ticked.filter(Boolean).length,
    needsName,
    typed,
    expectedName: name,
  });
  const places = impact?.places_moving ?? 0;
  const names = sampleNames(impact?.places_sample);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0d0e12]/60 flex items-center justify-center p-4"
      data-stitch="publish half way tree v2? close overlaps cross roads by 1.6% 0.4% outside saint andrew type half way tree to confirm cancel publish border"
    >
      <div className="w-full max-w-[600px] bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-headline font-bold text-on-surface tracking-tight">Publish {name} v{version}?</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">This replaces the live border in every app.</p>
            </div>
            <button type="button" className="text-outline hover:text-on-surface p-1" onClick={onCancel}>
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
        <div className="px-6 py-2 flex flex-col gap-5">
          <div className="bg-surface-container-low rounded-lg p-4">
            <span className="text-[11px] font-label uppercase font-bold text-on-surface-variant tracking-wider block mb-3">What changes</span>
            <div className="space-y-2.5 text-xs">
              <Row label="Area change" value={`${checks?.area_change_pct ?? impact?.area_change_pct ?? 0}%`} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-on-surface font-medium">Dominion places moving</span>
                  <span className="text-[11px] text-on-surface-variant">{names || 'None in the sample'}</span>
                </div>
                <span className="font-mono font-semibold text-on-surface bg-surface-container px-2 py-0.5 rounded text-[11px]">{places}</span>
              </div>
              <Row label="Rush live markets" value={String(impact?.live_markets ?? 0)} />
              <Row label="Rush merchants moving" value={`${impact?.merchants_moving ?? 0} of ${impact?.merchants_checked ?? 0} checked`} />
            </div>
          </div>
          {warnings.length > 0 ? (
            <div className="bg-surface-container-low rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>Warnings to confirm</span>
              </div>
              {warnings.map((warning, index) => (
                <label key={warning} className="flex items-start gap-2.5 cursor-pointer text-xs select-none">
                  <input
                    className="mt-0.5 w-4 h-4 rounded"
                    type="checkbox"
                    checked={Boolean(ticked[index])}
                    onChange={(event) => setTicked((current) => current.map((value, i) => i === index ? event.target.checked : value))}
                  />
                  <span className="text-on-surface leading-tight">{warning}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-on-surface" htmlFor="confirmation-input">
              Type <span className="font-bold text-on-surface">{name}</span> to confirm
            </label>
            <input
              id="confirmation-input"
              className="w-full px-3.5 py-2 bg-surface-container-low text-xs rounded-lg text-on-surface outline-none"
              value={typed}
              placeholder={name}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        </div>
        <div className="p-6 pt-4 flex items-center justify-between">
          <button type="button" className="text-xs font-semibold text-on-surface-variant hover:text-on-surface" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            disabled={!ready}
            className="px-4 py-2 rounded-lg bg-[#d97706] text-white text-xs font-semibold shadow-sm disabled:opacity-50"
            onClick={() => onConfirm(typed)}
          >
            Publish border
          </button>
        </div>
      </div>
    </div>
  );
}

function warningLines(checks: DraftChecks | null): string[] {
  if (!checks) return [];
  const lines: string[] = [];
  if ((checks.overlap_pct ?? 0) > 1 && checks.overlap_with) {
    lines.push(`Overlaps ${checks.overlap_with} by ${checks.overlap_pct}%`);
  }
  if ((checks.outside_parent_pct ?? 0) > 2) {
    lines.push(`${checks.outside_parent_pct}% outside ${checks.outside_parent_name || 'its parent'}`);
  }
  if ((checks.vertex_count ?? 0) > 8000) lines.push('Too many points');
  return lines;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-mono font-semibold text-on-surface bg-surface-container px-2 py-0.5 rounded text-[11px]">{value}</span>
    </div>
  );
}
