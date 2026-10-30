const STEPS = [
  { n: 1, label: "Car", icon: "check_circle" },
  { n: 2, label: "Version", icon: "" },
  { n: 3, label: "Part", icon: "arrow_forward" },
  { n: 4, label: "Side", icon: "" },
  { n: 5, label: "Results", icon: "checklist" },
] as const;

export function StepBar({
  active,
  versionAnswer,
  sideAnswer,
}: {
  active: number;
  versionAnswer?: string;
  sideAnswer?: string;
}) {
  return (
    <div className="w-full bg-surface-container-low rounded-xl p-space-sm mb-space-xl shadow-sm">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-space-sm">
        {STEPS.map((step) => {
          const on = step.n === active;
          const answer = step.n === 2 ? versionAnswer : step.n === 4 ? sideAnswer : "";
          return (
            <div
              key={step.n}
              className={on
                ? "flex items-center justify-between px-space-md py-2.5 rounded-lg bg-primary-container text-on-primary shadow-sm"
                : "flex items-center justify-between px-space-md py-2.5 rounded-lg bg-surface-container-lowest text-secondary shadow-sm" + (step.n === 5 ? " col-span-2 md:col-span-1" : "")}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={on
                  ? "font-mono-sm text-mono-sm w-5 h-5 rounded-md bg-on-primary/20 flex items-center justify-center font-bold"
                  : "font-mono-sm text-mono-sm w-5 h-5 rounded-md bg-surface-container flex items-center justify-center font-medium text-secondary"}>
                  {step.n}
                </span>
                <span className={on
                  ? "font-label-md text-label-md font-bold truncate"
                  : "font-label-md text-label-md font-medium text-on-surface truncate"}>
                  {answer || step.label}
                </span>
              </div>
              {answer ? (
                <span className="material-symbols-outlined text-[16px] text-tertiary">check</span>
              ) : on || (step.n !== 2 && step.n !== 4) ? (
                <span className={"material-symbols-outlined text-[16px] " + (on ? "text-on-primary" : "text-outline-variant")}>{step.icon || "arrow_forward"}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
