import { flagCheckGuideForReason } from './fuelFlagGlossary';

/** Shared “what this means / what to check” block for flag overlays. */
export function FlagCheckGuideBlock({
  reason,
  className = '',
}: {
  reason: string | undefined | null;
  className?: string;
}) {
  const guide = flagCheckGuideForReason(reason);
  return (
    <div className={`space-y-2 text-xs text-slate-700 ${className}`}>
      <p className="leading-relaxed text-slate-600">{guide.summary}</p>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          What to check
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed text-slate-700">
          {guide.checks.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
