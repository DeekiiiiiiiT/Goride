const STEPS = [
  { n: 1, label: "1. Vehicle", title: "Pick a car", hint: "Select an active vehicle to map directly to verified fitment specs" },
  { n: 2, label: "2. Version", title: "Which one is yours?", hint: "Pick the version that matches your papers" },
  { n: 3, label: "3. Part", title: "What part?", hint: "Search, or browse by area" },
  { n: 4, label: "4. Front or back", title: "Front or back?", hint: "Only when the part comes in both" },
] as const;

export function StepBar({
  step,
  trail,
  title,
  hint,
}: {
  step: number;
  trail: Array<{ label: string; onPick: () => void }>;
  title?: string;
  hint?: string;
}) {
  const current = STEPS[Math.max(0, Math.min(3, step - 1))];
  return (
    <div className="w-full">
      <div className="w-full bg-surface-container-lowest rounded-xl p-space-md mb-space-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary font-label-code text-body-sm font-semibold">
            {current.n}
          </div>
          <div>
            <div className="font-headline-sm text-body-md text-on-surface">{title || `Step ${current.n}: ${current.title}`}</div>
            <div className="font-body-sm text-caption text-on-surface-variant">{hint || current.hint}</div>
          </div>
        </div>
        <div className="find-parts-stepbar flex items-center gap-space-xs font-label-code text-caption overflow-x-auto py-1">
          {STEPS.map((item, index) => (
            <span key={item.label} className="flex items-center gap-space-xs shrink-0">
              {index > 0 ? <span className="text-outline">›</span> : null}
              <span className={index + 1 === step
                ? "px-space-sm py-1 rounded bg-secondary-container text-on-secondary-container font-semibold"
                : index + 1 < step
                  ? "px-space-sm py-1 rounded bg-surface-container text-on-surface-variant"
                  : "px-space-sm py-1 rounded bg-surface-container-high text-on-surface-variant"}>
                {item.label}
              </span>
            </span>
          ))}
        </div>
      </div>
      {trail.length > 0 ? (
        <div className="find-parts-trail flex items-center gap-space-xs overflow-x-auto mb-space-lg font-body-sm text-body-sm">
          {trail.map((chip, index) => (
            <span key={chip.label} className="flex items-center gap-space-xs shrink-0">
              {index > 0 ? <span className="text-outline">›</span> : null}
              <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest text-on-surface shadow-sm" onClick={chip.onPick}>
                {chip.label}
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
